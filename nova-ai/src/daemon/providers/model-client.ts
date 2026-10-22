// ModelClient: what agents use to talk to models. Encapsulates model choice from the configured chain, fallback,
// cloud-data approvals, VRAM fit, paid gating, budget reservations, rate limits and usage recording
// (contracts.ts ModelClient, SPEC §4.2 ModelClient, §6.2).
// Key decisions:
// - Candidates are exactly [preferred, roleOverrides[role], defaultModel, ...fallbacks] (deduped). `preferred` is
//   only honoured when it is still part of that chain ("if still allowed"), so a model the user removed from the
//   selection is never used again. Unlisted installed models are never used.
// - Check order per candidate: provider exists/enabled → paid approved → paid paused → availability (live model list,
//   cached 30 s, errors 5 s) → pricing → budget (reserve + release dry run) → cloud data approval → (ollama-local
//   only) VRAM fit (ollama.fit, cached 60 s) and governor.allowedFor. The approval is checked last so the user is
//   only asked for a provider whose model can actually be used.
// - Cloud data approval (sensitive_data, subject `cloud:<providerId>`): chat() always uses approvals.check with the
//   task id (never consume). resolve() without a task id only peeks (rules + existing pending approvals) and never
//   creates an approval; with `taskId` (the agent runner passes it) it runs the same check as chat().
// - A denied cloud approval skips that candidate (the denial stays valid for the task). When no candidate is usable
//   and a denial is among the reasons, chat()/resolve() throw APPROVAL_DENIED (not NO_MODEL): the code is not
//   resumable, so the work cycle does not auto-unblock and re-run the task every minute. At that moment the denial is
//   acknowledged, so restarting the task asks the user again instead of failing at once.
// - Non-local providers receive deep-redacted messages and tool arguments.
// - Fallback to the next candidate on MODEL_UNAVAILABLE, OLLAMA_UNREACHABLE, retryable PROVIDER_ERROR (5xx, network,
//   timeout), PROVIDER_AUTH (reported as error) and BUDGET_EXCEEDED from a racing reservation. 429 waits for
//   Retry-After (≤ 120 s in total per call, ≤ 3 times per candidate) before falling back.
// - Paid calls: reserve (max_tokens = settings.models.maxOutputTokens) → send → record. Failures after sending
//   (5xx, timeout, abort, connection lost) are booked at the reserved maximum (estimated); 4xx and failures before
//   sending release the reservation. Missing usage is estimated with ceil(chars / 3.5).
import type { AgentRole, ModelPricing, ModelRef, ProviderConfig } from '@shared/schemas';
import type { ChatMessage, ChatRequest, ChatResponse, ChatToolSpec, ModelChatInput, ModelChatResult, ModelClient, ResolvedModel, Services } from '../contracts';
import type { OllamaFit } from '../contracts';
import { NovaError, errorMessage, isNovaError } from '../core/errors';
import { isLocalEndpoint } from '../core/net';
import { redact, redactString } from '../core/redact';
import { sleep as realSleep } from '../core/time';
import { providerError, providerErrorDetails } from './http';
import { OLLAMA_LOCAL_ID } from './registry';
import { ProviderRateLimiter, limiterSettings, type LimiterClock } from './rate-limit';

export interface ModelClientOptions {
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  availabilityTtlMs?: number;
  availabilityErrorTtlMs?: number;
  fitTtlMs?: number;
}

/** resolve() accepts an optional taskId on top of the contract (needed for task-scoped cloud approvals). */
export interface ResolveOptions {
  projectId?: string | null;
  exclude?: ModelRef[];
  preferred?: ModelRef | null;
  taskId?: string | null;
  runId?: string | null;
}

interface Rejection {
  ref: ModelRef;
  label: string;
  code: string;
  reason: string;
  approvalId?: string;
  alternatives?: string[];
}

interface Usable {
  resolved: ResolvedModel;
  pricing: ModelPricing | null;
}

type Evaluation = { ok: true; usable: Usable } | { ok: false; rejection: Rejection };

interface Availability {
  at: number;
  ttl: number;
  models: import('@shared/schemas').ModelInfo[];
  error: NovaError | null;
  /** The provider offers no model list (404/405/501) – the model cannot be verified up front. */
  unknown: boolean;
}

const SINGLE_REASON_CODES = new Set(['BUDGET_EXCEEDED', 'PAID_NOT_APPROVED', 'PRICE_UNKNOWN', 'VRAM_INSUFFICIENT', 'OLLAMA_UNREACHABLE']);
const MAX_RATE_LIMIT_WAIT_MS = 120_000;
const CHARS_PER_TOKEN = 3.5;

const refKey = (r: ModelRef) => `${r.providerId}/${r.modelId}`;

/** ceil(chars / 3.5) over message contents, tool call arguments and tool specs. */
export function estimateInputTokens(messages: ChatMessage[], tools?: ChatToolSpec[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content?.length ?? 0;
    if (m.role === 'assistant' && m.toolCalls?.length) chars += JSON.stringify(m.toolCalls.map((t) => ({ n: t.name, a: t.arguments }))).length;
  }
  if (tools?.length) chars += JSON.stringify(tools).length;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Deep redaction for non-local providers: message texts and tool-call arguments. */
export function redactMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m): ChatMessage => {
    if (m.role === 'assistant') {
      return { ...m, content: redactString(m.content ?? ''), toolCalls: m.toolCalls?.map((tc) => ({ ...tc, arguments: redact(tc.arguments) })) };
    }
    return { ...m, content: redactString(m.content) };
  });
}

function costOf(pricing: ModelPricing, inputTokens: number, outputTokens: number): number {
  return (inputTokens * pricing.inputPerMTokUsd + outputTokens * pricing.outputPerMTokUsd) / 1_000_000;
}

function asNovaError(e: unknown): NovaError {
  if (isNovaError(e)) return e;
  return new NovaError('PROVIDER_ERROR', `Unerwarteter Fehler bei der Modellanfrage: ${redactString(errorMessage(e)).slice(0, 300)}`, {
    severity: 'blocker',
    details: { requestSent: true, billable: true, retryable: false },
    cause: e,
  });
}

export function createModelClient(s: Services, options: ModelClientOptions = {}): ModelClient & { resolve(role: AgentRole, opts?: ResolveOptions): Promise<ResolvedModel> } {
  const core = s.core;
  const log = core.log.child('models');
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? realSleep;
  const limiterClock: LimiterClock = { now, sleep };
  const availTtl = options.availabilityTtlMs ?? 30_000;
  const availErrTtl = options.availabilityErrorTtlMs ?? 5_000;
  const fitTtl = options.fitTtlMs ?? 60_000;
  const availability = new Map<string, Availability>();
  const availInflight = new Map<string, Promise<Availability>>();
  const fitCache = new Map<string, { at: number; fit: OllamaFit | null }>();
  const limiters = new Map<string, { key: string; limiter: ProviderRateLimiter }>();

  core.bus.on('ollama.models.changed', (p) => {
    availability.delete(p.providerId);
    fitCache.clear();
  });
  core.bus.on('provider.updated', (p) => {
    availability.delete(p.id);
    if (p.id === OLLAMA_LOCAL_ID) fitCache.clear();
  });
  core.bus.on('provider.removed', (p) => {
    availability.delete(p.id);
    limiters.delete(p.id);
  });

  const labelOf = (ref: ModelRef, cfg?: ProviderConfig | null) => `${ref.modelId} (${cfg?.name ?? ref.providerId})`;

  const reject = (ref: ModelRef, cfg: ProviderConfig | null, code: string, reason: string, extra: Partial<Rejection> = {}): Evaluation => ({
    ok: false,
    rejection: { ref, label: labelOf(ref, cfg), code, reason, ...extra },
  });

  const candidateList = (role: AgentRole, preferred: ModelRef | null | undefined, exclude: Set<string>): { configured: boolean; candidates: ModelRef[] } => {
    const m = core.settings.section('models');
    const chain = [m.roleOverrides[role], m.defaultModel, ...m.fallbacks].filter((r): r is ModelRef => !!r && !!r.providerId && !!r.modelId);
    const listed = new Set(chain.map(refKey));
    const ordered: ModelRef[] = [];
    if (preferred && listed.has(refKey(preferred))) ordered.push(preferred);
    ordered.push(...chain);
    const seen = new Set<string>();
    const candidates: ModelRef[] = [];
    for (const r of ordered) {
      const k = refKey(r);
      if (seen.has(k) || exclude.has(k)) continue;
      seen.add(k);
      candidates.push({ providerId: r.providerId, modelId: r.modelId });
    }
    return { configured: chain.length > 0, candidates };
  };

  const noModelConfigured = () =>
    new NovaError('NO_MODEL', 'Es ist noch kein Modell ausgewählt. Bitte unter „Modelle“ ein Standardmodell auswählen (zum Beispiel ein lokales Ollama-Modell).', {
      severity: 'blocker',
      userAction: 'Unter „Modelle“ ein Standardmodell auswählen.',
      details: { rejections: [] },
    });

  const getAvailability = (providerId: string): Promise<Availability> => {
    const cached = availability.get(providerId);
    if (cached && now() - cached.at < cached.ttl) return Promise.resolve(cached);
    const running = availInflight.get(providerId);
    if (running) return running;
    const p = (async (): Promise<Availability> => {
      const provider = s.providers.get(providerId);
      let entry: Availability;
      if (!provider) {
        entry = { at: now(), ttl: availErrTtl, models: [], unknown: false, error: new NovaError('MODEL_UNAVAILABLE', `Anbieter „${providerId}“ ist nicht verfügbar.`) };
      } else {
        try {
          const models = await provider.listModels();
          entry = { at: now(), ttl: availTtl, models, error: null, unknown: false };
        } catch (e) {
          const d = providerErrorDetails(e);
          if (provider.type !== 'ollama' && d && d.status !== undefined && [404, 405, 501].includes(d.status)) {
            entry = { at: now(), ttl: availTtl, models: [], error: null, unknown: true };
          } else {
            entry = { at: now(), ttl: availErrTtl, models: [], error: asNovaError(e), unknown: false };
          }
        }
      }
      availability.set(providerId, entry);
      return entry;
    })();
    availInflight.set(providerId, p);
    p.finally(() => availInflight.delete(providerId)).catch(() => undefined);
    return p;
  };

  const fitFor = async (modelId: string, numCtx: number): Promise<OllamaFit | null> => {
    const key = `${modelId}|${numCtx}`;
    const cached = fitCache.get(key);
    if (cached && now() - cached.at < fitTtl) return cached.fit;
    let fit: OllamaFit | null = null;
    try {
      fit = await s.ollama.fit(modelId, numCtx);
    } catch (e) {
      log.debug('Speicherprüfung des Modells nicht möglich', { model: modelId, error: errorMessage(e) });
      return null;
    }
    fitCache.set(key, { at: now(), fit });
    return fit;
  };

  /** Cloud data approval. mode 'check' creates/reuses the task-scoped approval; 'peek' never creates one. */
  const cloudApproval = (
    cfg: ProviderConfig,
    ref: ModelRef,
    projectId: string,
    taskId: string | null | undefined,
    runId: string | null | undefined,
  ): { state: 'approved' } | { state: 'pending'; approvalId: string } | { state: 'denied'; approvalId: string } => {
    const subject = `cloud:${cfg.id}`;
    if (taskId === undefined) {
      const fpProject = s.approvals.fingerprint('sensitive_data', projectId, subject);
      const fpGlobal = s.approvals.fingerprint('sensitive_data', null, subject);
      if (s.approvals.rules().some((r) => r.kind === 'sensitive_data' && (r.fingerprint === fpProject || r.fingerprint === fpGlobal))) return { state: 'approved' };
      const pending = s.approvals.list({ status: 'pending', projectId }).find((a) => a.kind === 'sensitive_data' && a.fingerprint === fpProject);
      if (pending) return { state: 'pending', approvalId: pending.id };
      return { state: 'approved' };
    }
    let host = cfg.baseUrl;
    try {
      host = new URL(cfg.baseUrl).host;
    } catch {
      /* keep raw */
    }
    const r = s.approvals.check({
      projectId,
      taskId,
      runId: runId ?? null,
      kind: 'sensitive_data',
      title: `Projektdaten an „${cfg.name}“ senden?`,
      action: `NOVA möchte für diese Aufgabe Projektdaten (Aufgabenbeschreibung, Dateiinhalte, Befehlsausgaben) an den Cloud-Anbieter „${cfg.name}“ (${host}) senden, um das Modell „${ref.modelId}“ zu verwenden.`,
      consequences:
        'Die Daten verlassen diesen PC und werden beim Anbieter verarbeitet und gegebenenfalls gespeichert. Erkannte Geheimnisse (z. B. API-Schlüssel) entfernt NOVA vorher, eine vollständige Erkennung ist aber nicht möglich. Es gelten die Datenschutzbedingungen des Anbieters.',
      subject,
      details: { providerId: cfg.id, modelId: ref.modelId, host, paid: cfg.paid },
    });
    if (r.state === 'approved') return { state: 'approved' };
    return { state: r.state, approvalId: r.approval.id };
  };

  const evaluate = async (
    ref: ModelRef,
    ctx: { projectId: string | null; taskId: string | null | undefined; runId: string | null | undefined },
  ): Promise<Evaluation> => {
    const settings = core.settings.get();
    const cfg = s.providers.getConfig(ref.providerId);
    if (!cfg) return reject(ref, null, 'MODEL_UNAVAILABLE', `Der Anbieter „${ref.providerId}“ ist nicht (mehr) eingerichtet.`);
    if (!cfg.enabled) return reject(ref, cfg, 'MODEL_UNAVAILABLE', `Der Anbieter „${cfg.name}“ ist deaktiviert.`);
    const paid = cfg.type !== 'ollama' && cfg.paid;
    const local = isLocalEndpoint(cfg.baseUrl);
    if (paid && !cfg.approved) {
      return reject(ref, cfg, 'PAID_NOT_APPROVED', `Die kostenpflichtige Nutzung von „${cfg.name}“ ist nicht freigegeben (unter „Modelle“ beim Anbieter freigeben).`);
    }
    if (paid && s.budget.isPaidPaused(ctx.projectId)) {
      return reject(ref, cfg, 'BUDGET_EXCEEDED', 'Kostenpflichtige Arbeit ist pausiert, weil ein Budget erreicht wurde.');
    }
    const avail = await getAvailability(cfg.id);
    if (avail.error) {
      const code = avail.error.code === 'OLLAMA_UNREACHABLE' ? 'OLLAMA_UNREACHABLE' : avail.error.code === 'PROVIDER_AUTH' ? 'PROVIDER_AUTH' : 'MODEL_UNAVAILABLE';
      return reject(ref, cfg, code, avail.error.message);
    }
    const info = avail.models.find((m) => m.id === ref.modelId) ?? null;
    if (!info && !avail.unknown) {
      return reject(
        ref,
        cfg,
        'MODEL_UNAVAILABLE',
        cfg.type === 'ollama'
          ? `Das Modell ist in Ollama nicht installiert (unter „Modelle“ herunterladen).`
          : `Das Modell wird von „${cfg.name}“ nicht (mehr) angeboten.`,
      );
    }
    let pricing: ModelPricing | null = null;
    if (paid) {
      const priced = info?.pricing ? info : await s.providers.getModel(ref).catch(() => null);
      pricing = priced?.pricing ?? null;
      if (!pricing) return reject(ref, cfg, 'PRICE_UNKNOWN', 'Für dieses kostenpflichtige Modell ist kein Preis hinterlegt (unter „Modelle“ eintragen).');
      try {
        const r = s.budget.reserve({
          providerId: cfg.id,
          modelId: ref.modelId,
          paid: true,
          projectId: ctx.projectId,
          estimatedInputTokens: 0,
          maxOutputTokens: settings.models.maxOutputTokens,
          pricing,
        });
        s.budget.release(r.id);
      } catch (e) {
        if (isNovaError(e) && (e.code === 'BUDGET_EXCEEDED' || e.code === 'PRICE_UNKNOWN')) return reject(ref, cfg, e.code, e.message);
        throw e;
      }
    }
    if (!local && settings.network.approveCloudProjectData && ctx.projectId) {
      const a = cloudApproval(cfg, ref, ctx.projectId, ctx.taskId, ctx.runId);
      if (a.state === 'pending') {
        return reject(ref, cfg, 'APPROVAL_REQUIRED', `Wartet auf die Freigabe, Projektdaten an „${cfg.name}“ zu senden.`, { approvalId: a.approvalId });
      }
      if (a.state === 'denied') {
        return reject(ref, cfg, 'APPROVAL_DENIED', `Das Senden von Projektdaten an „${cfg.name}“ wurde für diese Aufgabe abgelehnt.`, { approvalId: a.approvalId });
      }
    }
    let contextLength = info?.contextLength ?? null;
    if (cfg.type === 'ollama') {
      const numCtx = Math.min(settings.models.ollamaNumCtx, contextLength ?? Number.MAX_SAFE_INTEGER);
      contextLength = numCtx;
      if (cfg.id === OLLAMA_LOCAL_ID) {
        const fit = await fitFor(ref.modelId, numCtx);
        if (fit && fit.fits === false) return reject(ref, cfg, 'VRAM_INSUFFICIENT', fit.message, { alternatives: fit.alternatives });
        let allowed: { ok: boolean; reason: string | null } = { ok: true, reason: null };
        try {
          allowed = s.governor.allowedFor(ref);
        } catch (e) {
          log.debug('Ressourcenprüfung nicht verfügbar', { error: errorMessage(e) });
        }
        if (!allowed.ok) {
          return reject(ref, cfg, 'RESOURCE_LIMIT', allowed.reason ?? 'Der Grafikspeicher ist ausgelastet – das Modell kann gerade nicht geladen werden.');
        }
      }
    }
    return {
      ok: true,
      usable: {
        resolved: {
          ref: { providerId: ref.providerId, modelId: ref.modelId },
          info,
          provider: cfg,
          paid,
          local,
          supportsTools: info?.capabilities.includes('tools') ?? false,
          contextLength,
        },
        pricing,
      },
    };
  };

  const buildError = (rejections: Rejection[], projectId: string | null, lastError: NovaError | null): NovaError => {
    const details = {
      rejections: rejections.map((r) => ({ providerId: r.ref.providerId, modelId: r.ref.modelId, code: r.code, reason: r.reason, approvalId: r.approvalId ?? null })),
    };
    const lines = rejections.map((r) => `• ${r.label}: ${r.reason}`).join('\n');
    const approval = rejections.find((r) => r.code === 'APPROVAL_REQUIRED');
    if (approval) {
      return new NovaError('APPROVAL_REQUIRED', `Zum Senden von Projektdaten an einen Cloud-Anbieter ist eine Freigabe nötig.\n${lines}`, {
        severity: 'blocker',
        details: { ...details, approvalId: approval.approvalId },
        userAction: 'Die Freigabe unter „Freigaben“ erteilen oder ablehnen.',
      });
    }
    if (lastError) {
      const prev = (lastError.details && typeof lastError.details === 'object' ? lastError.details : {}) as Record<string, unknown>;
      return new NovaError(lastError.code, rejections.length > 1 ? `${lastError.message}\nGeprüfte Modelle:\n${lines}` : lastError.message, {
        severity: lastError.severity,
        details: { ...prev, ...details },
        cause: lastError,
        userAction: lastError.userAction,
        autoFixable: lastError.autoFixable,
      });
    }
    if (!rejections.length) return noModelConfigured();
    const denied = rejections.filter((r) => r.code === 'APPROVAL_DENIED');
    if (denied.length) {
      // The caller blocks the task on this error; acknowledging lets a restart of the task ask the user again.
      for (const r of denied) {
        if (!r.approvalId) continue;
        try {
          s.approvals.acknowledgeDenial(r.approvalId);
        } catch (e) {
          log.warn('Abgelehnte Freigabe konnte nicht als gesehen markiert werden', { approvalId: r.approvalId, error: errorMessage(e) });
        }
      }
      const what =
        rejections.length === 1
          ? `${denied[0].reason} Ohne diese Freigabe kann ${denied[0].label} nicht verwendet werden, und es ist kein anderes Modell ausgewählt.`
          : `Das Senden von Projektdaten an einen Cloud-Anbieter wurde für diese Aufgabe abgelehnt, und kein anderes ausgewähltes Modell ist verwendbar. Geprüft wurden:\n${lines}`;
      return new NovaError(
        'APPROVAL_DENIED',
        `${what}\nBitte unter „Modelle“ ein lokales Modell auswählen und die Aufgabe erneut starten – oder die Aufgabe erneut starten und die Freigabe erteilen.`,
        {
          severity: 'blocker',
          details,
          userAction: 'Unter „Modelle“ ein lokales Modell auswählen und die Aufgabe erneut starten – oder die Aufgabe erneut starten und die Freigabe erteilen.',
        },
      );
    }
    const codes = new Set(rejections.map((r) => r.code));
    if (codes.size === 1) {
      const code = rejections[0].code;
      if (SINGLE_REASON_CODES.has(code)) {
        const message = rejections.length === 1 ? `${rejections[0].label}: ${rejections[0].reason}` : `Kein Modell verwendbar:\n${lines}`;
        if (code === 'VRAM_INSUFFICIENT') {
          const alternatives = [...new Set(rejections.flatMap((r) => r.alternatives ?? []))];
          const hint = alternatives.length ? ` Kleinere installierte Modelle, die passen würden: ${alternatives.join(', ')}.` : '';
          try {
            core.errors.report({
              code: 'VRAM_INSUFFICIENT',
              severity: 'blocker',
              title: 'Modell passt nicht in den Grafikspeicher',
              whatHappened: `Keines der ausgewählten Modelle passt in den freien Grafikspeicher.${hint}`,
              projectId,
              attempted: rejections.map((r) => `${r.label} geprüft`),
              projectSafe: true,
              autoFixable: false,
              userAction: 'Unter „Modelle“ ein kleineres Modell als Standard oder Ersatz auswählen oder die Kontextgröße verringern.',
              dedupeKey: `vram-insufficient:${projectId ?? 'global'}`,
            });
          } catch (e) {
            log.warn('Fehlerbericht konnte nicht angelegt werden', { error: errorMessage(e) });
          }
          return new NovaError('VRAM_INSUFFICIENT', `${message}${hint}`, {
            severity: 'blocker',
            details: { ...details, alternatives },
            userAction: 'Unter „Modelle“ ein kleineres Modell auswählen oder die Kontextgröße verringern.',
          });
        }
        const userAction =
          code === 'OLLAMA_UNREACHABLE'
            ? 'Ollama starten (oder unter „Modelle“ die Adresse prüfen).'
            : code === 'PRICE_UNKNOWN'
              ? 'Unter „Modelle“ den Preis des Modells eintragen.'
              : code === 'PAID_NOT_APPROVED'
                ? 'Unter „Modelle“ die kostenpflichtige Nutzung des Anbieters freigeben oder ein lokales Modell wählen.'
                : 'Unter „Kosten“ das Budget prüfen oder ein lokales Modell als Ersatz auswählen.';
        return new NovaError(code, message, { severity: 'blocker', details, userAction });
      }
    }
    const hints: string[] = [];
    if (codes.has('OLLAMA_UNREACHABLE')) hints.push('Ollama starten');
    if (codes.has('MODEL_UNAVAILABLE')) hints.push('fehlende Modelle unter „Modelle“ herunterladen oder andere auswählen');
    if (codes.has('BUDGET_EXCEEDED')) hints.push('ein lokales Ersatzmodell auswählen oder das Budget unter „Kosten“ prüfen');
    return new NovaError(
      'NO_MODEL',
      `Kein verwendbares Modell gefunden. Geprüft wurden:\n${lines}\nBitte unter „Modelle“ ein verfügbares Modell auswählen${hints.length ? ` (${hints.join('; ')})` : ''}.`,
      { severity: 'blocker', details, userAction: 'Unter „Modelle“ ein verfügbares Modell als Standard oder Ersatz auswählen.' },
    );
  };

  const limiterFor = (cfg: ProviderConfig): ProviderRateLimiter => {
    const { maxConcurrent, perMinute } = limiterSettings(cfg.options);
    const key = `${maxConcurrent ?? '-'}|${perMinute ?? '-'}`;
    const cached = limiters.get(cfg.id);
    if (cached && cached.key === key) return cached.limiter;
    const limiter = new ProviderRateLimiter(maxConcurrent, perMinute, cfg.name, limiterClock);
    limiters.set(cfg.id, { key, limiter });
    return limiter;
  };

  /** One attempt with one candidate: limiter → reserve → send → settle. */
  const attempt = async (usable: Usable, input: ModelChatInput): Promise<ModelChatResult> => {
    const { resolved, pricing } = usable;
    const cfg = resolved.provider;
    const settings = core.settings.get();
    const provider = s.providers.get(cfg.id);
    if (!provider) throw providerError('MODEL_UNAVAILABLE', `Der Anbieter „${cfg.name}“ ist nicht verfügbar.`, { providerId: cfg.id, requestSent: false, billable: false, retryable: false });
    const messages = resolved.local ? input.messages : redactMessages(input.messages);
    const estimatedInput = estimateInputTokens(messages, input.tools);
    const maxTokens = settings.models.maxOutputTokens;
    const release = await limiterFor(cfg).acquire(input.signal);
    try {
      const reservation = s.budget.reserve({
        providerId: cfg.id,
        modelId: resolved.ref.modelId,
        paid: resolved.paid,
        projectId: input.projectId,
        estimatedInputTokens: estimatedInput,
        maxOutputTokens: maxTokens,
        pricing,
      });
      const timeoutMs = settings.agents.modelTimeoutSec * 1000;
      const controller = new AbortController();
      let timedOut = false;
      const onAbort = () => controller.abort(input.signal?.reason);
      if (input.signal?.aborted) controller.abort(input.signal.reason);
      input.signal?.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException('Zeitüberschreitung', 'TimeoutError'));
      }, timeoutMs);
      timer.unref?.();
      const req: ChatRequest = {
        model: resolved.ref.modelId,
        messages,
        tools: input.tools?.length ? input.tools : undefined,
        temperature: settings.models.temperature,
        maxTokens,
        numCtx: cfg.type === 'ollama' ? (resolved.contextLength ?? settings.models.ollamaNumCtx) : undefined,
        json: input.json,
        signal: controller.signal,
      };
      const started = now();
      let res: ChatResponse;
      try {
        res = await provider.chat(req);
      } catch (e) {
        let err = asNovaError(e);
        const d = providerErrorDetails(err);
        if (timedOut && err.code === 'CANCELLED') {
          err = providerError('PROVIDER_ERROR', `${cfg.name} hat nicht innerhalb von ${settings.agents.modelTimeoutSec} s geantwortet (Zeitüberschreitung).`, {
            providerId: cfg.id,
            requestSent: d?.requestSent ?? true,
            billable: d?.requestSent ?? true,
            retryable: true,
            timedOut: true,
          }, e);
        }
        settleFailure(reservation, err, resolved, input, estimatedInput, maxTokens, now() - started);
        throw err;
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener('abort', onAbort);
      }
      let usage = res.usage;
      if (!usage.usageReported) {
        const outChars = (res.content?.length ?? 0) + (res.toolCalls.length ? JSON.stringify(res.toolCalls.map((t) => ({ n: t.name, a: t.arguments }))).length : 0);
        usage = {
          inputTokens: usage.inputTokens > 0 ? usage.inputTokens : estimatedInput,
          outputTokens: usage.outputTokens > 0 ? usage.outputTokens : Math.max(1, Math.ceil(outChars / CHARS_PER_TOKEN)),
          usageReported: false,
        };
      }
      const costUsd = resolved.paid && pricing ? costOf(pricing, usage.inputTokens, usage.outputTokens) : 0;
      try {
        s.budget.record(
          {
            ts: core.clock.now(),
            providerId: cfg.id,
            modelId: resolved.ref.modelId,
            projectId: input.projectId,
            taskId: input.taskId,
            runId: input.runId,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            durationMs: res.durationMs > 0 ? res.durationMs : now() - started,
            costUsd,
            costEstimated: resolved.paid ? Boolean(pricing?.estimated) || !usage.usageReported : false,
            paid: resolved.paid,
          },
          reservation.id,
        );
      } catch (e) {
        log.error('Nutzung konnte nicht gespeichert werden', { error: errorMessage(e) });
      }
      return { ...res, usage, resolved };
    } finally {
      release();
    }
  };

  function settleFailure(
    reservation: { id: string; maxCostUsd: number },
    err: NovaError,
    resolved: ResolvedModel,
    input: ModelChatInput,
    estimatedInput: number,
    maxTokens: number,
    durationMs: number,
  ): void {
    if (!resolved.paid) {
      s.budget.release(reservation.id);
      return;
    }
    const d = providerErrorDetails(err);
    const billable = d ? d.requestSent && d.billable : true;
    try {
      if (billable) {
        s.budget.record(
          {
            ts: core.clock.now(),
            providerId: resolved.provider.id,
            modelId: resolved.ref.modelId,
            projectId: input.projectId,
            taskId: input.taskId,
            runId: input.runId,
            inputTokens: estimatedInput,
            outputTokens: maxTokens,
            durationMs,
            costUsd: reservation.maxCostUsd,
            costEstimated: true,
            paid: true,
          },
          reservation.id,
        );
      } else {
        s.budget.release(reservation.id);
      }
    } catch (e) {
      log.error('Kosten einer fehlgeschlagenen Anfrage konnten nicht verbucht werden', { error: errorMessage(e) });
    }
  }

  const reportAuthProblem = (cfg: ProviderConfig, err: NovaError, projectId: string | null) => {
    try {
      core.errors.report({
        code: 'PROVIDER_AUTH',
        severity: 'blocker',
        title: `Anmeldung bei „${cfg.name}“ fehlgeschlagen`,
        whatHappened: err.message,
        projectId,
        attempted: ['Wechsel auf das nächste ausgewählte Modell, soweit vorhanden'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Unter „Modelle“ den API-Schlüssel des Anbieters prüfen oder neu eintragen.',
        dedupeKey: `provider-auth:${cfg.id}`,
      });
    } catch (e) {
      log.warn('Fehlerbericht konnte nicht angelegt werden', { error: errorMessage(e) });
    }
  };

  const client = {
    async resolve(role: AgentRole, opts: ResolveOptions = {}): Promise<ResolvedModel> {
      const projectId = opts.projectId ?? null;
      const exclude = new Set((opts.exclude ?? []).map(refKey));
      const { configured, candidates } = candidateList(role, opts.preferred, exclude);
      if (!configured) throw noModelConfigured();
      const fallbackToLocal = core.settings.section('budgets').fallbackToLocal;
      const rejections: Rejection[] = [];
      const taskId = Object.prototype.hasOwnProperty.call(opts, 'taskId') ? (opts.taskId ?? null) : undefined;
      for (const ref of candidates) {
        const ev = await evaluate(ref, { projectId, taskId, runId: opts.runId });
        if (ev.ok) return ev.usable.resolved;
        rejections.push(ev.rejection);
        if (ev.rejection.code === 'BUDGET_EXCEEDED' && !fallbackToLocal) throw buildError([ev.rejection], projectId, null);
      }
      throw buildError(rejections, projectId, null);
    },

    async chat(input: ModelChatInput): Promise<ModelChatResult> {
      const projectId = input.projectId ?? null;
      const failed = new Map<string, Rejection>();
      const rateRetries = new Map<string, number>();
      let rateWaitMs = 0;
      let lastError: NovaError | null = null;
      for (let guard = 0; guard < 25; guard++) {
        if (input.signal?.aborted) {
          throw providerError('CANCELLED', 'Die Modellanfrage wurde abgebrochen.', { requestSent: false, billable: false, retryable: false }, input.signal.reason);
        }
        const { configured, candidates } = candidateList(input.role, input.preferred, new Set(failed.keys()));
        if (!configured) throw noModelConfigured();
        const fallbackToLocal = core.settings.section('budgets').fallbackToLocal;
        const rejections: Rejection[] = [...failed.values()];
        let usable: Usable | null = null;
        for (const ref of candidates) {
          const ev = await evaluate(ref, { projectId, taskId: input.taskId ?? null, runId: input.runId });
          if (ev.ok) {
            usable = ev.usable;
            break;
          }
          rejections.push(ev.rejection);
          if (ev.rejection.code === 'BUDGET_EXCEEDED' && !fallbackToLocal) throw buildError([ev.rejection], projectId, null);
        }
        if (!usable) throw buildError(rejections, projectId, lastError);
        const key = refKey(usable.resolved.ref);
        const cfg = usable.resolved.provider;
        try {
          return await attempt(usable, input);
        } catch (e) {
          const err = asNovaError(e);
          const d = providerErrorDetails(err);
          const label = labelOf(usable.resolved.ref, cfg);
          if (err.code === 'CANCELLED') throw err;
          if (err.code === 'BUDGET_EXCEEDED' || err.code === 'PRICE_UNKNOWN') {
            // Reservation lost a race against concurrent paid calls (nothing was sent).
            if (err.code === 'BUDGET_EXCEEDED' && !fallbackToLocal) throw err;
            failed.set(key, { ref: usable.resolved.ref, label, code: err.code, reason: err.message });
            continue;
          }
          if (err.code === 'PROVIDER_RATE_LIMIT') {
            const tries = rateRetries.get(key) ?? 0;
            const wait = Math.max(250, d?.retryAfterMs ?? 1000 * 2 ** tries);
            if (tries < 3 && wait <= MAX_RATE_LIMIT_WAIT_MS && rateWaitMs + wait <= MAX_RATE_LIMIT_WAIT_MS) {
              rateRetries.set(key, tries + 1);
              rateWaitMs += wait;
              log.info('Anfragelimit erreicht – warte vor erneutem Versuch', { provider: cfg.id, waitMs: wait });
              try {
                await sleep(wait, input.signal);
              } catch (abortErr) {
                throw providerError('CANCELLED', 'Die Modellanfrage wurde abgebrochen.', { requestSent: false, billable: false, retryable: false }, abortErr);
              }
              continue;
            }
            lastError = err;
            failed.set(key, { ref: usable.resolved.ref, label, code: err.code, reason: err.message });
            continue;
          }
          const fallback =
            err.code === 'MODEL_UNAVAILABLE' ||
            err.code === 'OLLAMA_UNREACHABLE' ||
            err.code === 'PROVIDER_AUTH' ||
            (err.code === 'PROVIDER_ERROR' && d?.retryable === true);
          if (!fallback) throw err;
          if (err.code === 'PROVIDER_AUTH') reportAuthProblem(cfg, err, projectId);
          log.warn('Modell nicht nutzbar – nächstes Modell wird versucht', { model: key, code: err.code });
          availability.delete(cfg.id);
          lastError = err;
          failed.set(key, { ref: usable.resolved.ref, label, code: err.code, reason: err.message });
        }
      }
      throw lastError ?? new NovaError('NO_MODEL', 'Kein Modell konnte die Anfrage beantworten.', { severity: 'blocker' });
    },
  };
  return client;
}
