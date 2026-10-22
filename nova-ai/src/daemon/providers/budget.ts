// BudgetService: usage records (table `usage_records`), reservations for paid calls in flight, daily/monthly/project
// limits, the paid-work pause and the 'budget:resume' approval (SPEC §4.2 BudgetService, §6.2 Budget).
// Key decisions:
// - reserve() is synchronous: spent + all open reservations + this call's maximum cost must stay within every limit,
//   so concurrent paid calls can never overshoot together. Limit 0 = no paid usage at all; null = unlimited.
//   Project limits come from project.config.monthlyBudgetUsd and pause only that project.
// - Reservations are kept in memory AND persisted in table `meta` (`budget_reservation:<id>`). Reservations left by
//   a crashed daemon are booked as estimated usage at their maximum cost on the next start ("never 0 for paid").
// - A "budget stop" happens when recorded paid spending reaches a limit: pausePaid (meta `budget_paid_paused` or
//   `budget_paid_paused:<projectId>`), notification (category blocker), error report BUDGET_EXCEEDED (deduped) and an
//   approval kind paid_model subject 'budget:resume'. Approving it calls resumePaid (subscription to
//   approvals.onDecision made lazily on first use of any method, or by start()). A refused reservation without
//   reaching the limit only throws BUDGET_EXCEEDED (no pause, no notification spam).
// - Warnings at settings.budgets.warnAtRatio are sent once per local day per limit (meta `budget_warned`).
// - Day/month boundaries are local time (core/time.ts), using core.clock.
import { randomBytes } from 'node:crypto';
import type { BudgetBreakdownRow, BudgetStatus, ModelPricing, UsageRecord } from '@shared/schemas';
import type { Approval } from '@shared/schemas';
import type { BudgetReserveInput, BudgetService, Services } from '../contracts';
import { bool, fromJson, int, toJson } from '../db/database';
import { NovaError, errorMessage, validation } from '../core/errors';
import { newId } from '../core/ids';
import { isLocalEndpoint } from '../core/net';
import { startOfDay, startOfMonth } from '../core/time';
import { OLLAMA_LOCAL_ID } from './registry';

export const META_PAUSED = 'budget_paid_paused';
export const META_WARNED = 'budget_warned';
export const META_RESERVATION_PREFIX = 'budget_reservation:';
export const BUDGET_RESUME_SUBJECT = 'budget:resume';
const NOOP_RESERVATION = 'res_free';

type LimitScope = 'daily' | 'monthly' | 'project';

interface Reservation {
  id: string;
  providerId: string;
  modelId: string;
  projectId: string | null;
  maxCostUsd: number;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  createdAt: number;
  instanceId: string;
}

interface UsageRow {
  id: string;
  ts: number;
  provider_id: string;
  model_id: string;
  project_id: string | null;
  task_id: string | null;
  run_id: string | null;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number;
  cost_usd: number;
  cost_estimated: number;
  paid: number;
}

export interface BudgetServiceImpl extends BudgetService {
  /** Subscribes to approval decisions (budget:resume) and books reservations left by a crashed daemon. Idempotent. */
  start(): void;
  stop(): void;
}

const toUsage = (r: UsageRow): UsageRecord => ({
  id: r.id,
  ts: r.ts,
  providerId: r.provider_id,
  modelId: r.model_id,
  projectId: r.project_id,
  taskId: r.task_id,
  runId: r.run_id,
  inputTokens: Number(r.input_tokens),
  outputTokens: Number(r.output_tokens),
  durationMs: Number(r.duration_ms),
  costUsd: Number(r.cost_usd),
  costEstimated: bool(r.cost_estimated),
  paid: bool(r.paid),
});

/** German currency text, e.g. "0,0420 $" / "12,50 $". */
export function formatUsd(n: number): string {
  const v = Math.max(0, n);
  return `${v.toFixed(v > 0 && v < 0.1 ? 4 : 2).replace('.', ',')} $`;
}

/** Maximum cost of a call: input tokens × input price + max output tokens × output price. */
export function maxCostOf(pricing: ModelPricing, inputTokens: number, outputTokens: number): number {
  return (Math.max(0, inputTokens) * pricing.inputPerMTokUsd + Math.max(0, outputTokens) * pricing.outputPerMTokUsd) / 1_000_000;
}

function localDate(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const SCOPE_LABEL: Record<LimitScope, string> = { daily: 'Tagesbudget', monthly: 'Monatsbudget', project: 'Projektbudget' };

export function createBudgetService(s: Services): BudgetServiceImpl {
  const core = s.core;
  const db = core.db;
  const log = core.log.child('budget');
  const reservations = new Map<string, Reservation>();
  let decisionUnsub: (() => void) | null = null;
  let staleRecovered = false;
  let starting = false;

  const pauseKey = (projectId: string | null) => (projectId ? `${META_PAUSED}:${projectId}` : META_PAUSED);
  const stopDedupeKey = (projectId: string | null) => `budget-stop:${projectId ?? 'global'}`;

  const metaGet = (key: string): string | null => db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])?.value ?? null;
  const metaSet = (key: string, value: string) =>
    db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  const metaDelete = (key: string) => db.run('DELETE FROM meta WHERE key = ?', [key]);

  const pausedInfo = (projectId: string | null): { reason: string; at: number } | null => {
    const raw = metaGet(pauseKey(projectId));
    if (!raw) return null;
    return fromJson<{ reason: string; at: number } | null>(raw, { reason: 'Budget erreicht', at: 0 });
  };

  const projectLimit = (projectId: string): number | null => {
    try {
      const p = s.projects.get(projectId);
      const v = p?.config.monthlyBudgetUsd;
      return typeof v === 'number' && Number.isFinite(v) ? v : null;
    } catch (e) {
      log.warn('Projektlimit konnte nicht gelesen werden', { projectId, error: errorMessage(e) });
      return null;
    }
  };

  const spent = (from: number, projectId?: string): { cost: number; estimated: boolean } => {
    const row = projectId
      ? db.get<{ cost: number; est: number }>(
          'SELECT COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(MAX(cost_estimated), 0) AS est FROM usage_records WHERE paid = 1 AND ts >= ? AND project_id = ?',
          [from, projectId],
        )
      : db.get<{ cost: number; est: number }>('SELECT COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(MAX(cost_estimated), 0) AS est FROM usage_records WHERE paid = 1 AND ts >= ?', [from]);
    return { cost: Number(row?.cost ?? 0), estimated: bool(row?.est ?? 0) };
  };

  const reservedTotal = (projectId?: string | null): number => {
    let sum = 0;
    for (const r of reservations.values()) if (projectId === undefined || r.projectId === projectId) sum += r.maxCostUsd;
    return sum;
  };

  const emitStatus = () => {
    try {
      core.bus.emit('budget.updated', service.status());
    } catch (e) {
      log.warn('Budgetstatus konnte nicht gesendet werden', { error: errorMessage(e) });
    }
  };

  const insertUsage = (u: Omit<UsageRecord, 'id'>): UsageRecord => {
    const rec: UsageRecord = {
      ...u,
      id: newId('use'),
      inputTokens: Math.max(0, Math.round(u.inputTokens)),
      outputTokens: Math.max(0, Math.round(u.outputTokens)),
      durationMs: Math.max(0, Math.round(u.durationMs)),
      costUsd: Math.max(0, u.costUsd),
    };
    db.run(
      `INSERT INTO usage_records(id, ts, provider_id, model_id, project_id, task_id, run_id, input_tokens, output_tokens, duration_ms, cost_usd, cost_estimated, paid)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rec.id,
        rec.ts,
        rec.providerId,
        rec.modelId,
        rec.projectId,
        rec.taskId,
        rec.runId,
        rec.inputTokens,
        rec.outputTokens,
        rec.durationMs,
        rec.costUsd,
        int(rec.costEstimated),
        int(rec.paid),
      ],
    );
    return rec;
  };

  const dropReservation = (id: string) => {
    if (id === NOOP_RESERVATION) return;
    reservations.delete(id);
    try {
      metaDelete(`${META_RESERVATION_PREFIX}${id}`);
    } catch (e) {
      log.warn('Reservierung konnte nicht gelöscht werden', { error: errorMessage(e) });
    }
  };

  const resumeFingerprint = (projectId: string | null): string => s.approvals.fingerprint('paid_model', projectId, BUDGET_RESUME_SUBJECT);

  const onDecision = (a: Approval) => {
    if (a.kind !== 'paid_model') return;
    let fp: string;
    try {
      fp = resumeFingerprint(a.projectId);
    } catch {
      return;
    }
    if (a.fingerprint !== fp) return;
    if (a.status === 'approved') {
      try {
        s.approvals.consume(a.id);
      } catch (e) {
        log.warn('Freigabe konnte nicht als verwendet markiert werden', { error: errorMessage(e) });
      }
      resumeInternal(a.projectId, true);
    } else if (a.status === 'denied') {
      try {
        s.approvals.acknowledgeDenial(a.id);
      } catch (e) {
        log.warn('Ablehnung konnte nicht bestätigt werden', { error: errorMessage(e) });
      }
    }
  };

  const ensureDecisionListener = () => {
    if (decisionUnsub) return;
    try {
      decisionUnsub = s.approvals.onDecision(onDecision);
    } catch (e) {
      log.debug('Freigabedienst noch nicht verfügbar', { error: errorMessage(e) });
    }
  };

  const recoverStaleReservations = () => {
    if (staleRecovered) return;
    staleRecovered = true;
    const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM meta WHERE key LIKE ?', [`${META_RESERVATION_PREFIX}%`]);
    let booked = 0;
    const touchedProjects = new Set<string | null>();
    for (const row of rows) {
      const r = fromJson<Reservation | null>(row.value, null);
      if (r && r.instanceId === core.instanceId) continue;
      if (r && r.maxCostUsd > 0) {
        insertUsage({
          ts: r.createdAt || core.clock.now(),
          providerId: r.providerId,
          modelId: r.modelId,
          projectId: r.projectId,
          taskId: null,
          runId: null,
          inputTokens: r.estimatedInputTokens,
          outputTokens: r.maxOutputTokens,
          durationMs: 0,
          costUsd: r.maxCostUsd,
          costEstimated: true,
          paid: true,
        });
        booked++;
        touchedProjects.add(r.projectId);
      }
      metaDelete(row.key);
    }
    if (booked > 0) {
      log.warn('Kostenpflichtige Anfragen eines beendeten Hintergrunddienstes als geschätzte Kosten verbucht', { count: booked });
      for (const p of touchedProjects) checkLimitsAfterUsage(p);
      emitStatus();
    }
  };

  const ensureStarted = () => {
    if (starting) return;
    starting = true;
    try {
      ensureDecisionListener();
      recoverStaleReservations();
    } finally {
      starting = false;
    }
  };

  const exceeded = (message: string, details: Record<string, unknown>) =>
    new NovaError('BUDGET_EXCEEDED', message, {
      severity: 'blocker',
      details,
      userAction: 'Unter „Kosten“ das Limit anpassen oder mit lokalen Modellen weiterarbeiten.',
    });

  const checkLimit = (scope: LimitScope, limit: number | null, committed: number, maxCost: number, projectId: string | null) => {
    if (limit === null) return;
    const details = { scope, limitUsd: limit, spentAndReservedUsd: committed, maxCostUsd: maxCost, projectId };
    if (limit <= 0) {
      throw exceeded(
        scope === 'project'
          ? 'Für dieses Projekt ist kein Budget für kostenpflichtige Modelle freigegeben (Projektlimit 0 $).'
          : `Für kostenpflichtige Modelle ist kein Budget freigegeben (${scope === 'daily' ? 'Tageslimit' : 'Monatslimit'} 0 $). Bitte unter „Kosten“ ein Limit festlegen.`,
        details,
      );
    }
    if (committed + maxCost > limit + 1e-9) {
      throw exceeded(
        `Das ${SCOPE_LABEL[scope]} reicht für diese Anfrage nicht aus (verbraucht bzw. reserviert ${formatUsd(committed)} von ${formatUsd(limit)}, diese Anfrage kostet bis zu ${formatUsd(maxCost)}).`,
        details,
      );
    }
  };

  const maybeWarn = (key: string, scope: LimitScope, projectId: string | null, spentValue: number, limit: number) => {
    const today = localDate(core.clock.now());
    const warned = fromJson<Record<string, string>>(metaGet(META_WARNED), {});
    if (warned[key] === today) return;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(warned)) if (v === today) next[k] = v;
    next[key] = today;
    metaSet(META_WARNED, toJson(next));
    const pct = Math.min(100, Math.floor((spentValue / limit) * 100));
    try {
      s.notifications.notify({
        level: 'warning',
        category: 'info',
        title: 'Budget fast aufgebraucht',
        body: `Das ${SCOPE_LABEL[scope]} für kostenpflichtige Modelle ist zu ${pct} % verbraucht.`,
        projectId,
        taskId: null,
      });
    } catch (e) {
      log.warn('Budgetwarnung konnte nicht gesendet werden', { error: errorMessage(e) });
    }
  };

  const requestResumeApproval = (projectId: string | null, scope: LimitScope, reason: string) => {
    ensureDecisionListener();
    const request = {
      projectId,
      taskId: null,
      runId: null,
      kind: 'paid_model' as const,
      title: projectId ? 'Kostenpflichtige Modelle für dieses Projekt wieder verwenden?' : 'Kostenpflichtige Modelle wieder verwenden?',
      action: `Kostenpflichtige Arbeit fortsetzen. Grund der Pause: ${reason}`,
      consequences:
        'Beim Cloud-Anbieter entstehen wieder Kosten, bis ein Limit erneut erreicht ist. Ist das Limit noch erreicht, bleibt kostenpflichtige Arbeit gesperrt, bis das Limit erhöht wird oder ein neuer Tag bzw. Monat beginnt.',
      subject: BUDGET_RESUME_SUBJECT,
      details: { purpose: BUDGET_RESUME_SUBJECT, scope, projectId },
    };
    try {
      let r = s.approvals.check(request);
      for (let i = 0; i < 2 && r.state !== 'pending'; i++) {
        // An old decision must not answer a new budget stop: settle it and ask again.
        if (r.state === 'denied') s.approvals.acknowledgeDenial(r.approval.id);
        else if (r.approval) s.approvals.consume(r.approval.id);
        else break;
        r = s.approvals.check(request);
      }
    } catch (e) {
      log.warn('Freigabe zum Fortsetzen konnte nicht angelegt werden', { error: errorMessage(e) });
    }
  };

  const budgetStop = (scope: LimitScope, projectId: string | null, spentValue: number, limit: number) => {
    const pid = scope === 'project' ? projectId : null;
    if (pausedInfo(pid)) return;
    const reason =
      scope === 'project'
        ? `Das Projektbudget ist erreicht (${formatUsd(spentValue)} von ${formatUsd(limit)} in diesem Monat).`
        : `Das ${SCOPE_LABEL[scope]} ist erreicht (${formatUsd(spentValue)} von ${formatUsd(limit)}).`;
    pauseInternal(reason, pid);
    const fallback = core.settings.section('budgets').fallbackToLocal;
    try {
      s.notifications.notify({
        level: 'warning',
        category: 'blocker',
        title: 'Budget erreicht – kostenpflichtige Modelle pausiert',
        body: fallback
          ? 'Kostenpflichtige Modelle werden nicht mehr verwendet. NOVA arbeitet mit freigegebenen lokalen Modellen weiter, soweit vorhanden.'
          : 'Kostenpflichtige Modelle werden nicht mehr verwendet. Betroffene Aufgaben warten auf eine Freigabe.',
        projectId: pid,
        taskId: null,
      });
    } catch (e) {
      log.warn('Benachrichtigung zum Budget konnte nicht gesendet werden', { error: errorMessage(e) });
    }
    try {
      core.errors.report({
        code: 'BUDGET_EXCEEDED',
        severity: 'blocker',
        title: 'Budget erreicht',
        whatHappened: `${reason} Kostenpflichtige Modelle werden ab jetzt nicht mehr verwendet.`,
        projectId: pid,
        attempted: fallback ? ['Weiterarbeit mit freigegebenen lokalen Modellen aus der Modellliste, soweit vorhanden'] : [],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Unter „Kosten“ das Limit prüfen und kostenpflichtige Arbeit über die Freigabe oder „Kostenpflichtige Arbeit fortsetzen“ wieder erlauben.',
        dedupeKey: stopDedupeKey(pid),
      });
    } catch (e) {
      log.warn('Fehlerbericht zum Budget konnte nicht angelegt werden', { error: errorMessage(e) });
    }
    requestResumeApproval(pid, scope, reason);
  };

  /** After paid usage: warnings and budget stops. */
  function checkLimitsAfterUsage(projectId: string | null) {
    const b = core.settings.section('budgets');
    const now = core.clock.now();
    const checks: { scope: LimitScope; key: string; limit: number | null; spent: number; projectId: string | null }[] = [
      { scope: 'daily', key: 'daily', limit: b.dailyLimitUsd, spent: spent(startOfDay(now)).cost, projectId: null },
      { scope: 'monthly', key: 'monthly', limit: b.monthlyLimitUsd, spent: spent(startOfMonth(now)).cost, projectId: null },
    ];
    if (projectId) checks.push({ scope: 'project', key: `project:${projectId}`, limit: projectLimit(projectId), spent: spent(startOfMonth(now), projectId).cost, projectId });
    for (const c of checks) {
      if (c.limit === null || c.limit <= 0) continue;
      if (c.spent >= c.limit - 1e-9) budgetStop(c.scope, c.projectId, c.spent, c.limit);
      else if (c.spent >= c.limit * b.warnAtRatio) maybeWarn(c.key, c.scope, c.projectId, c.spent, c.limit);
    }
  }

  function pauseInternal(reason: string, projectId: string | null) {
    metaSet(pauseKey(projectId), toJson({ reason, at: core.clock.now() }));
    log.info('Kostenpflichtige Arbeit pausiert', { projectId, reason });
    emitStatus();
  }

  function resumeInternal(projectId: string | null, fromApproval: boolean) {
    const was = metaGet(pauseKey(projectId)) !== null;
    metaDelete(pauseKey(projectId));
    try {
      core.errors.resolveWhere({ dedupeKey: stopDedupeKey(projectId) });
    } catch (e) {
      log.warn('Fehlerbericht konnte nicht geschlossen werden', { error: errorMessage(e) });
    }
    if (!fromApproval) {
      // The user resumed directly ("Kostenpflichtige Arbeit fortsetzen"): answer the open resume request accordingly.
      try {
        const fp = resumeFingerprint(projectId);
        for (const a of s.approvals.list({ status: 'pending' })) {
          if (a.kind === 'paid_model' && a.fingerprint === fp) s.approvals.decide(a.id, 'approve', 'once');
        }
      } catch (e) {
        log.debug('Offene Freigabe konnte nicht beantwortet werden', { error: errorMessage(e) });
      }
    }
    if (was) log.info('Kostenpflichtige Arbeit fortgesetzt', { projectId });
    emitStatus();
  }

  const classifyLocal = (providerId: string, paid: boolean): boolean => {
    if (paid) return false;
    try {
      const cfg = s.providers.getConfig(providerId);
      if (cfg) return isLocalEndpoint(cfg.baseUrl);
    } catch {
      /* registry not available */
    }
    return providerId === OLLAMA_LOCAL_ID;
  };

  // Settings changes of the budgets section are visible in the budget status.
  core.settings.onChange((_settings, changed) => {
    if (changed.includes('budgets')) emitStatus();
  });

  const service: BudgetServiceImpl = {
    status(): BudgetStatus {
      ensureStarted();
      const b = core.settings.section('budgets');
      const now = core.clock.now();
      const day = startOfDay(now);
      const month = startOfMonth(now);
      const today = spent(day);
      const monthSpent = spent(month);
      const tokens = (from: number) =>
        db.get<{ i: number; o: number }>('SELECT COALESCE(SUM(input_tokens), 0) AS i, COALESCE(SUM(output_tokens), 0) AS o FROM usage_records WHERE ts >= ?', [from]);
      const tDay = tokens(day);
      const tMonth = tokens(month);
      const runtime = { localDay: 0, cloudDay: 0, localMonth: 0, cloudMonth: 0 };
      const rows = db.all<{ provider_id: string; paid: number; day_ms: number; month_ms: number }>(
        `SELECT provider_id, paid, COALESCE(SUM(CASE WHEN ts >= ? THEN duration_ms ELSE 0 END), 0) AS day_ms, COALESCE(SUM(duration_ms), 0) AS month_ms
         FROM usage_records WHERE ts >= ? GROUP BY provider_id, paid`,
        [day, month],
      );
      for (const r of rows) {
        const local = classifyLocal(r.provider_id, bool(r.paid));
        if (local) {
          runtime.localDay += Number(r.day_ms);
          runtime.localMonth += Number(r.month_ms);
        } else {
          runtime.cloudDay += Number(r.day_ms);
          runtime.cloudMonth += Number(r.month_ms);
        }
      }
      const globalPause = pausedInfo(null);
      const projectIds = new Set<string>();
      for (const r of db.all<{ project_id: string }>('SELECT DISTINCT project_id FROM usage_records WHERE paid = 1 AND ts >= ? AND project_id IS NOT NULL', [month])) {
        projectIds.add(r.project_id);
      }
      for (const r of db.all<{ key: string }>('SELECT key FROM meta WHERE key LIKE ?', [`${META_PAUSED}:%`])) projectIds.add(r.key.slice(META_PAUSED.length + 1));
      for (const r of reservations.values()) if (r.projectId) projectIds.add(r.projectId);
      const perProject = [...projectIds].sort().map((projectId) => {
        const limit = projectLimit(projectId);
        const sp = spent(month, projectId);
        return {
          projectId,
          limitUsd: limit,
          spentMonthUsd: sp.cost,
          remainingUsd: limit === null ? null : Math.max(0, limit - sp.cost),
          paidPaused: pausedInfo(projectId) !== null,
          containsEstimates: sp.estimated,
        };
      });
      return {
        dailyLimitUsd: b.dailyLimitUsd,
        monthlyLimitUsd: b.monthlyLimitUsd,
        spentTodayUsd: today.cost,
        spentMonthUsd: monthSpent.cost,
        remainingTodayUsd: b.dailyLimitUsd === null ? null : Math.max(0, b.dailyLimitUsd - today.cost),
        remainingMonthUsd: b.monthlyLimitUsd === null ? null : Math.max(0, b.monthlyLimitUsd - monthSpent.cost),
        containsEstimates: monthSpent.estimated,
        paidPaused: globalPause !== null,
        pausedReason: globalPause?.reason ?? null,
        perProject,
        reservedUsd: reservedTotal(),
        tokensToday: { input: Number(tDay?.i ?? 0), output: Number(tDay?.o ?? 0) },
        tokensMonth: { input: Number(tMonth?.i ?? 0), output: Number(tMonth?.o ?? 0) },
        localRuntimeMsToday: runtime.localDay,
        cloudRuntimeMsToday: runtime.cloudDay,
        localRuntimeMsMonth: runtime.localMonth,
        cloudRuntimeMsMonth: runtime.cloudMonth,
      };
    },

    reserve(input: BudgetReserveInput) {
      ensureStarted();
      if (!input.paid) return { id: NOOP_RESERVATION, maxCostUsd: 0 };
      if (!input.pricing) {
        throw new NovaError('PRICE_UNKNOWN', `Für das Modell „${input.modelId}“ ist kein Preis hinterlegt. Bitte unter „Modelle“ den Preis eintragen.`, {
          severity: 'blocker',
          details: { providerId: input.providerId, modelId: input.modelId },
          userAction: 'Unter „Modelle“ den Preis pro Million Tokens eintragen.',
        });
      }
      const projectId = input.projectId ?? null;
      const globalPause = pausedInfo(null);
      if (globalPause) {
        throw exceeded(`Kostenpflichtige Arbeit ist pausiert: ${globalPause.reason} Bitte unter „Kosten“ fortsetzen.`, { scope: 'paused', projectId: null });
      }
      if (projectId) {
        const projectPause = pausedInfo(projectId);
        if (projectPause) throw exceeded(`Kostenpflichtige Arbeit ist für dieses Projekt pausiert: ${projectPause.reason}`, { scope: 'paused', projectId });
      }
      const maxCost = maxCostOf(input.pricing, input.estimatedInputTokens, input.maxOutputTokens);
      const b = core.settings.section('budgets');
      const now = core.clock.now();
      const reservedAll = reservedTotal();
      checkLimit('daily', b.dailyLimitUsd, spent(startOfDay(now)).cost + reservedAll, maxCost, null);
      checkLimit('monthly', b.monthlyLimitUsd, spent(startOfMonth(now)).cost + reservedAll, maxCost, null);
      if (projectId) {
        const limit = projectLimit(projectId);
        checkLimit('project', limit, spent(startOfMonth(now), projectId).cost + reservedTotal(projectId), maxCost, projectId);
      }
      const r: Reservation = {
        id: `res_${now.toString(36)}${randomBytes(6).toString('hex')}`,
        providerId: input.providerId,
        modelId: input.modelId,
        projectId,
        maxCostUsd: maxCost,
        estimatedInputTokens: Math.max(0, Math.round(input.estimatedInputTokens)),
        maxOutputTokens: Math.max(0, Math.round(input.maxOutputTokens)),
        createdAt: now,
        instanceId: core.instanceId,
      };
      reservations.set(r.id, r);
      try {
        metaSet(`${META_RESERVATION_PREFIX}${r.id}`, toJson(r));
      } catch (e) {
        log.warn('Reservierung konnte nicht gespeichert werden', { error: errorMessage(e) });
      }
      return { id: r.id, maxCostUsd: maxCost };
    },

    record(usage, reservationId) {
      ensureStarted();
      const res = reservationId ? reservations.get(reservationId) : undefined;
      let costUsd = Number.isFinite(usage.costUsd) ? usage.costUsd : 0;
      let costEstimated = usage.costEstimated;
      if (usage.paid && costUsd <= 0 && res && res.maxCostUsd > 0 && usage.inputTokens + usage.outputTokens <= 0) {
        // Never book 0 for a paid call: without any numbers the reserved maximum is the honest estimate.
        costUsd = res.maxCostUsd;
        costEstimated = true;
      }
      const rec = insertUsage({ ...usage, costUsd, costEstimated, projectId: usage.projectId ?? null, taskId: usage.taskId ?? null, runId: usage.runId ?? null });
      if (reservationId) dropReservation(reservationId);
      if (rec.paid) {
        checkLimitsAfterUsage(rec.projectId);
        emitStatus();
      }
      return rec;
    },

    release(reservationId) {
      dropReservation(reservationId);
    },

    usage(filter = {}) {
      ensureStarted();
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.from !== undefined) {
        where.push('ts >= ?');
        params.push(filter.from);
      }
      if (filter.to !== undefined) {
        where.push('ts < ?');
        params.push(filter.to);
      }
      if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
      }
      params.push(Math.max(1, Math.min(5000, filter.limit ?? 500)));
      return db
        .all<UsageRow>(`SELECT * FROM usage_records ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ts DESC, rowid DESC LIMIT ?`, params)
        .map(toUsage);
    },

    breakdown(input): BudgetBreakdownRow[] {
      ensureStarted();
      const keyExpr = {
        provider: 'provider_id',
        model: "provider_id || '/' || model_id",
        project: "COALESCE(project_id, '-')",
        day: "strftime('%Y-%m-%d', ts / 1000, 'unixepoch', 'localtime')",
      }[input.groupBy];
      const where: string[] = [];
      const params: number[] = [];
      if (input.from !== undefined) {
        where.push('ts >= ?');
        params.push(input.from);
      }
      if (input.to !== undefined) {
        where.push('ts < ?');
        params.push(input.to);
      }
      const order = input.groupBy === 'day' ? 'key ASC' : 'cost DESC, calls DESC, key ASC';
      const rows = db.all<{ key: string; calls: number; i: number; o: number; d: number; cost: number; est: number }>(
        `SELECT ${keyExpr} AS key, COUNT(*) AS calls, COALESCE(SUM(input_tokens), 0) AS i, COALESCE(SUM(output_tokens), 0) AS o,
                COALESCE(SUM(duration_ms), 0) AS d, COALESCE(SUM(cost_usd), 0) AS cost, COALESCE(MAX(cost_estimated), 0) AS est
         FROM usage_records ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY key ORDER BY ${order}`,
        params,
      );
      return rows.map((r) => ({
        key: String(r.key),
        calls: Number(r.calls),
        inputTokens: Number(r.i),
        outputTokens: Number(r.o),
        durationMs: Number(r.d),
        costUsd: Number(r.cost),
        costEstimated: bool(r.est),
      }));
    },

    setLimits(input) {
      ensureStarted();
      const patch: { dailyLimitUsd?: number | null; monthlyLimitUsd?: number | null } = {};
      for (const key of ['dailyLimitUsd', 'monthlyLimitUsd'] as const) {
        const v = input[key];
        if (v === undefined) continue;
        if (v !== null && (!Number.isFinite(v) || v < 0)) throw validation('Budgetgrenzen müssen Zahlen ≥ 0 sein (leer = unbegrenzt).');
        patch[key] = v;
      }
      if (Object.keys(patch).length) core.settings.update({ budgets: patch });
      const st = service.status();
      core.bus.emit('budget.updated', st);
      return st;
    },

    isPaidPaused(projectId) {
      ensureStarted();
      if (pausedInfo(null)) return true;
      return projectId ? pausedInfo(projectId) !== null : false;
    },

    pausePaid(reason, projectId) {
      ensureStarted();
      pauseInternal(reason.trim() || 'Manuell pausiert.', projectId ?? null);
    },

    resumePaid(projectId) {
      ensureStarted();
      resumeInternal(projectId ?? null, false);
      return service.status();
    },

    start() {
      ensureStarted();
    },

    stop() {
      decisionUnsub?.();
      decisionUnsub = null;
    },
  };
  return service;
}
