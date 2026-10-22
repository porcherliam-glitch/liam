// RPC router: method registry, param validation, result checks and error mapping (SPEC §4.1).
// Key decisions:
// - Unknown AND unregistered methods answer NOT_FOUND "Diese Funktion ist in dieser Version nicht verfügbar." (a UI
//   newer than the daemon must get a clear German message, not a crash).
// - Params are parsed with RpcContract[method].params using a per-parse German error map; the handler receives the
//   parsed value (defaults applied exactly once, here). `null` params are treated like missing params.
// - Results are validated against the result schema outside production (NODE_ENV !== 'production'); mismatches are
//   logged as warnings with a compact issue list and never fail the call. The handler's original result is returned.
// - NovaError → { code, message, details } (details deep-redacted). ZodErrors thrown by handlers → VALIDATION with a
//   German issue list. Abort errors → CANCELLED. Everything else → INTERNAL "Interner Fehler im Hintergrunddienst."
//   with the redacted error message as details (stack only in the log, which redacts too).
// - Every error answer also carries `error`: a NovaErrorInfo (MASTERPROMPT §19) so the UI can show what happened,
//   where (projectId/taskId from the call's params), whether the project is safe, whether NOVA fixes it itself, what
//   the user has to do, and the severity. For a NovaError these come from the error itself (severity, projectSafe,
//   autoFixable, userAction); the other cases get fixed German answers. The info is not stored (errors.list only
//   holds errors that services report), so its id starts with "rpc_".
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { RpcContract, isRpcMethod, type RpcMethod, type RpcRequest, type RpcResponse } from '@shared/rpc';
import { ErrorCodes, type ErrorSeverity, type NovaErrorInfo } from '@shared/errors';
import type { RpcHandler, RpcRouter } from '../contracts';
import type { Logger } from '../core/logger';
import { NovaError, errorMessage, isNovaError } from '../core/errors';
import { redact, redactString } from '../core/redact';
import { germanErrorMap, summarizeIssues, toGermanIssues } from './validation-de';

export const ROUTER_MESSAGES = {
  notFound: 'Diese Funktion ist in dieser Version nicht verfügbar.',
  internal: 'Interner Fehler im Hintergrunddienst.',
  cancelled: 'Der Vorgang wurde abgebrochen.',
  timedOut: 'Der Vorgang wurde wegen Zeitüberschreitung abgebrochen.',
  /** userAction texts of the errors the router creates itself. */
  actionNotFound: 'NOVA vollständig beenden (Symbol im Infobereich) und neu starten, damit Oberfläche und Hintergrunddienst dieselbe Version verwenden.',
  actionCheckInput: 'Bitte die Eingaben prüfen und korrigieren.',
  actionRetry: 'Bitte erneut versuchen.',
  actionInternal: 'Bitte erneut versuchen. Wenn der Fehler bleibt, unter „Protokolle“ ein Diagnose-Paket erstellen.',
} as const;

/** Short German headline per error code (NovaErrorInfo.title of RPC errors). */
export const ERROR_TITLES: Readonly<Record<string, string>> = {
  INTERNAL: 'Interner Fehler',
  VALIDATION: 'Ungültige Eingabe',
  NOT_FOUND: 'Nicht gefunden',
  UNAUTHORIZED: 'Zugriff verweigert',
  CONFLICT: 'Gerade nicht möglich',
  MODEL_UNAVAILABLE: 'Modell nicht verfügbar',
  NO_MODEL: 'Kein Modell eingerichtet',
  PROVIDER_ERROR: 'Fehler beim KI-Anbieter',
  PROVIDER_AUTH: 'Anmeldung beim KI-Anbieter fehlgeschlagen',
  PROVIDER_RATE_LIMIT: 'KI-Anbieter: zu viele Anfragen',
  OLLAMA_UNREACHABLE: 'Ollama nicht erreichbar',
  BUDGET_EXCEEDED: 'Budget ausgeschöpft',
  PAID_NOT_APPROVED: 'Kostenpflichtige Nutzung nicht freigegeben',
  PRICE_UNKNOWN: 'Preis unbekannt',
  APPROVAL_REQUIRED: 'Freigabe nötig',
  APPROVAL_DENIED: 'Freigabe abgelehnt',
  PATH_OUTSIDE_PROJECT: 'Pfad außerhalb des Projekts',
  FILE_LOCKED: 'Datei gesperrt',
  COMMAND_BLOCKED: 'Befehl blockiert',
  COMMAND_FAILED: 'Befehl fehlgeschlagen',
  COMMAND_TIMEOUT: 'Zeitüberschreitung beim Befehl',
  TESTS_FAILED: 'Tests fehlgeschlagen',
  BUILD_FAILED: 'Build fehlgeschlagen',
  REPEATED_FAILURE: 'Wiederholt fehlgeschlagen',
  AGENT_STEP_LIMIT: 'Schrittgrenze erreicht',
  AGENT_BAD_OUTPUT: 'Unbrauchbare Antwort des Modells',
  GIT_ERROR: 'Git-Fehler',
  RESTORE_CONFLICT: 'Wiederherstellen nicht möglich',
  RESOURCE_LIMIT: 'Ressourcengrenze erreicht',
  VRAM_INSUFFICIENT: 'Zu wenig Grafikspeicher',
  TOOL_MISSING: 'Werkzeug fehlt',
  SECRET_STORE: 'Problem mit dem Schlüsselspeicher',
  DAEMON_UNAVAILABLE: 'Hintergrunddienst nicht erreichbar',
  INTERRUPTED: 'Unterbrochen',
  CANCELLED: 'Abgebrochen',
  NEEDS_INPUT: 'Eingabe nötig',
  NETWORK_BLOCKED: 'Netzwerkzugriff blockiert',
  SECRET_IN_CODE: 'Geheimnis im Code gefunden',
  FILE_IN_USE: 'Datei wird verwendet',
  DEPENDENCY_FAILED: 'Abhängige Aufgabe fehlgeschlagen',
  AGENT_BLOCKED: 'Agent kommt nicht weiter',
  DISK_FULL: 'Speicherplatz voll',
};
const FALLBACK_TITLE = 'Fehler';
const MAX_INFO_DETAILS = 4000;

export interface RpcRouterOptions {
  /** Validate handler results against the contract (default: NODE_ENV !== 'production'). */
  validateResults?: boolean;
  /** Calls slower than this are logged as warnings (default 30 s). */
  slowCallMs?: number;
}

type AnyHandler = (params: unknown, ctx: { requestId: string }) => unknown;
type RpcErrorBody = Extract<RpcResponse, { ok: false }>['error'];

interface ErrorInfoInput {
  code: string;
  message: string;
  severity: ErrorSeverity;
  projectSafe?: boolean;
  autoFixable?: boolean;
  userAction?: string | null;
  /** Technical details (redacted here). */
  details?: unknown;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function shortString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null;
}

/** "Where": project and task of the call (params.projectId, params.taskId, or params.id of a tasks.* method). */
function errorContext(method: string, params: unknown): { projectId: string | null; taskId: string | null } {
  const p = asRecord(params);
  if (!p) return { projectId: null, taskId: null };
  return { projectId: shortString(p.projectId), taskId: shortString(p.taskId) ?? (method.startsWith('tasks.') ? shortString(p.id) : null) };
}

/** Jump targets the UI offers (ErrorCard), taken from well-known ids in the error details. */
function relatedFrom(details: unknown): NovaErrorInfo['related'] {
  const d = asRecord(details);
  if (!d) return null;
  const related = {
    checkRunId: shortString(d.checkRunId),
    runId: shortString(d.runId),
    approvalId: shortString(d.approvalId),
    file: shortString(d.file),
    line: typeof d.line === 'number' && Number.isInteger(d.line) ? d.line : null,
  };
  return Object.values(related).some((v) => v !== null) ? related : null;
}

function detailsText(method: string, details: unknown): string {
  let text = `RPC: ${method}`;
  if (details !== undefined && details !== null) {
    let rendered: string;
    try {
      rendered = typeof details === 'string' ? redactString(details) : JSON.stringify(redact(details));
    } catch {
      rendered = redactString(String(details));
    }
    text += `\n${rendered}`;
  }
  return text.length > MAX_INFO_DETAILS ? `${text.slice(0, MAX_INFO_DETAILS)} …` : text;
}

/**
 * NovaErrorInfo of a failed RPC call (MASTERPROMPT §19: what, where, what was tried, is the project safe, can NOVA
 * fix it, what to do, severity). Exported for tests.
 */
export function rpcErrorInfo(input: ErrorInfoInput, method: string, params: unknown, now = Date.now()): NovaErrorInfo {
  const { projectId, taskId } = errorContext(method, params);
  return {
    id: `rpc_${now.toString(36)}${randomBytes(4).toString('hex')}`,
    code: input.code,
    severity: input.severity,
    title: ERROR_TITLES[input.code] ?? FALLBACK_TITLE,
    whatHappened: redactString(input.message),
    projectId,
    taskId,
    attempted: [],
    projectSafe: input.projectSafe ?? true,
    autoFixable: input.autoFixable ?? false,
    userAction: input.userAction ? redactString(input.userAction) : null,
    details: detailsText(method, input.details),
    related: relatedFrom(input.details),
    createdAt: now,
    resolvedAt: null,
  };
}

function isZodError(e: unknown): e is { issues: unknown[] } {
  return (
    !!e &&
    typeof e === 'object' &&
    (e as { name?: unknown }).name !== undefined &&
    ['ZodError', '$ZodError'].includes(String((e as { name?: unknown }).name)) &&
    Array.isArray((e as { issues?: unknown }).issues)
  );
}

function compactIssues(issues: readonly unknown[]): Array<{ path: string; message: string }> {
  return toGermanIssues(issues).slice(0, 20);
}

export function createRpcRouter(log: Logger, options: RpcRouterOptions = {}): RpcRouter {
  const handlers = new Map<RpcMethod, AnyHandler>();
  const validateResults = options.validateResults ?? process.env.NODE_ENV !== 'production';
  const slowCallMs = options.slowCallMs ?? 30_000;

  /** Error answer: code, message, optional details plus the NovaErrorInfo built from `info`. */
  function errorBody(method: string, params: unknown, info: ErrorInfoInput, details?: unknown): RpcErrorBody {
    const body: RpcErrorBody = { code: info.code, message: info.message };
    if (details !== undefined) body.details = details;
    body.error = rpcErrorInfo(info, method, params);
    return body;
  }

  function mapError(e: unknown, method: string, params: unknown): RpcErrorBody {
    if (isNovaError(e)) {
      if (e.severity === 'critical') log.warn('RPC-Methode meldet kritischen Fehler', { method, code: e.code, message: e.message });
      else log.debug('RPC-Methode meldet Fehler', { method, code: e.code });
      const info: ErrorInfoInput = {
        code: e.code,
        message: e.message,
        severity: e.severity,
        projectSafe: e.projectSafe,
        autoFixable: e.autoFixable,
        userAction: e.userAction ?? null,
        details: e.details,
      };
      return errorBody(method, params, info, e.details === undefined ? undefined : redact(e.details));
    }
    if (isZodError(e)) {
      const issues = toGermanIssues(e.issues);
      log.warn('RPC-Methode hat ungültige Daten erhalten', { method, issues: issues.slice(0, 20) });
      const message = summarizeIssues(issues, 'Die Daten sind ungültig');
      return errorBody(method, params, { code: ErrorCodes.VALIDATION, message, severity: 'warning', userAction: ROUTER_MESSAGES.actionCheckInput, details: { issues } }, { issues });
    }
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      const timedOut = e.name === 'TimeoutError';
      return errorBody(method, params, {
        code: ErrorCodes.CANCELLED,
        message: timedOut ? ROUTER_MESSAGES.timedOut : ROUTER_MESSAGES.cancelled,
        severity: 'warning',
        userAction: timedOut ? ROUTER_MESSAGES.actionRetry : null,
      });
    }
    const message = redactString(errorMessage(e));
    log.error('Unerwarteter Fehler in RPC-Methode', { method, error: message, stack: e instanceof Error ? e.stack : undefined });
    return errorBody(method, params, { code: ErrorCodes.INTERNAL, message: ROUTER_MESSAGES.internal, severity: 'blocker', userAction: ROUTER_MESSAGES.actionInternal, details: message }, message);
  }

  return {
    register<M extends RpcMethod>(method: M, handler: RpcHandler<M>): void {
      if (typeof method !== 'string' || !isRpcMethod(method)) {
        throw new NovaError(ErrorCodes.INTERNAL, `Unbekannte RPC-Methode kann nicht registriert werden: ${String(method)}`);
      }
      if (handlers.has(method)) {
        throw new NovaError(ErrorCodes.CONFLICT, `RPC-Methode ist bereits registriert: ${method}`);
      }
      if (typeof handler !== 'function') {
        throw new NovaError(ErrorCodes.INTERNAL, `Für die RPC-Methode fehlt die Funktion: ${method}`);
      }
      handlers.set(method, handler as unknown as AnyHandler);
    },

    async handle(req: RpcRequest): Promise<RpcResponse> {
      const id = typeof req?.id === 'string' ? req.id : req?.id === undefined || req?.id === null ? '' : String(req.id);
      const method = req?.method;
      if (typeof method !== 'string' || !isRpcMethod(method) || !handlers.has(method)) {
        const name = typeof method === 'string' ? method.slice(0, 200) : '(ohne Namen)';
        const details = { method: typeof method === 'string' ? method.slice(0, 200) : null };
        return {
          id,
          ok: false,
          error: errorBody(name, null, { code: ErrorCodes.NOT_FOUND, message: ROUTER_MESSAGES.notFound, severity: 'warning', userAction: ROUTER_MESSAGES.actionNotFound }, details),
        };
      }
      const contract = RpcContract[method] as { params: z.ZodType; result: z.ZodType };
      const parsed = contract.params.safeParse(req.params === null ? undefined : req.params, { error: germanErrorMap });
      if (!parsed.success) {
        const issues = compactIssues(parsed.error.issues);
        const info: ErrorInfoInput = { code: ErrorCodes.VALIDATION, message: summarizeIssues(issues), severity: 'warning', userAction: ROUTER_MESSAGES.actionCheckInput, details: { issues } };
        return { id, ok: false, error: errorBody(method, req.params, info, { issues }) };
      }
      const handler = handlers.get(method)!;
      const started = Date.now();
      try {
        const result = await handler(parsed.data, { requestId: id });
        const ms = Date.now() - started;
        if (ms > slowCallMs) log.warn('Langsame RPC-Methode', { method, ms });
        if (validateResults) {
          const check = contract.result.safeParse(result);
          if (!check.success) {
            log.warn('RPC-Ergebnis entspricht nicht dem Vertrag', { method, issues: compactIssues(check.error.issues) });
          }
        }
        return { id, ok: true, result };
      } catch (e) {
        return { id, ok: false, error: mapError(e, method, parsed.data) };
      }
    },

    registered(): string[] {
      return [...handlers.keys()].sort();
    },
  };
}
