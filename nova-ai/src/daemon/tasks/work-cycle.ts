// Orchestrator – the autonomous work cycle (SPEC §4.5, §6.5).
// The WorkCycle is the ONLY writer of task.status, blocker, blockerCode, result, model, verification, attempts,
// startedAt, finishedAt and startRequested.
//
// Key decisions:
// - Scheduler: tick every 1 s plus coalesced event-driven wakeups (task/approval/settings/resource/project events).
//   A tick is a synchronous pass (no busy loop): it blocks queued tasks with failed dependencies, then starts ready
//   tasks by priority while governor.allowed(activeRunCount) leaves free slots. A queued task starts iff global state =
//   running AND (project.workState = running OR task.startRequested); archived projects never start work; two tasks
//   of one project run in parallel only when BOTH declare plannedFiles and those (plus already changed files) do not
//   overlap – a task without plannedFiles can touch anything, and its checks would measure the other task's
//   half-finished changes (read-only planner runs are exempt); at most one run per task.
// - Every run has its own AbortController and pause flags (user pause, work.pause scopes, shutdown). Abort reasons:
//   NovaError CANCELLED (stopTask → cancelled, work.stop → queued) or NovaError INTERRUPTED (shutdown → interrupted).
// - Resume vs fresh: a task is resumed iff it has a persisted continuation (written when its run paused, waited for an
//   approval, blocked with a RESUMABLE_BLOCKER_CODE, was interrupted, or while it was being verified). Fresh runs count
//   as attempts; the pre_task checkpoint is created only before the first fresh run (attempts = 0). AGENT_STEP_LIMIT and
//   checks that could not run because of the environment keep a `userResume` continuation: not auto-unblocked, but an
//   explicit user start continues the same run (new step budget) or only the verification instead of starting over.
// - Verification uses REAL results only: 'passed' needs a passed CheckRun, a reviewer verdict alone gives at most
//   'unavailable' ("nicht automatisch geprüft"), so checkpoints.afterTask neither marks such a state verified nor
//   commits it while commitOnlyWhenVerified is on. Coder: build (web/desktop/backend) → test (testAfterChange) →
//   typecheck/lint when configured; missing commands are listed as 'skipped' with a German reason; after a failed build
//   the remaining checks are skipped. A code/fix/test/custom task that changed no file gets an 'Änderungen' entry and is
//   never 'passed' (the checks still run). Reviewer pass (reviewChanges): a SEPARATE agent run with role 'reviewer' on
//   the same task (no extra review task) – only when the checks did not fail and files changed. Tester: CheckRuns of
//   this task started during the run; without a test/e2e run among them the orchestrator runs the test check itself;
//   only test/e2e results prove a tester task (no test command → unavailable). Review task: approve → unavailable,
//   changes_requested → failed verification + fix task with the findings. Plan task: unavailable. The verification is
//   patched BEFORE checkpoints.afterTask.
// - A check that could not run because of the environment (CheckService "env:" signature) never starts a coder retry:
//   install approval pending → waiting_approval and the verification re-runs after the decision; missing program →
//   blocked TOOL_MISSING (auto-unblock); denied/blocked install, Unity open, project folder missing → blocked with a
//   user action, "Starten" re-runs only the verification. In the integration pass: no fix task, an error report, and a
//   re-run once the approval is decided, after integrations.updated or at most every 10 minutes.
// - Failed verification: failure signature history (internal column) → after maxIdenticalFailures identical signatures
//   the next attempt gets "take a different approach" plus the previous attempts; the next identical failure blocks
//   with REPEATED_FAILURE (error report names checkpoints.latestVerified). Otherwise the task is re-queued (fresh run,
//   extra context with failures/findings) until attempts are exhausted → failed + error report + notification.
// - Planner done: child tasks (parentId, plannedFiles, "Voraussichtlich betroffene Dateien: …" in the description,
//   dependencies mapped from plan keys without creating cycles) when agents.autoCreatePlannedTasks; plan memory with
//   source 'system' (best effort). Integration pass (build, then test, taskId = plan task) when all non-cancelled
//   children are done; failure → fix task (bounded by maxIdenticalFailures and the plan's maxAttempts), error report,
//   notification. Missed passes (shutdown, paused work) are caught up by the periodic re-check.
// - Auto-unblock: blocked tasks with resumable codes are re-checked on provider/ollama/settings/budget/integration/
//   approval/note events and every 60 s (models.resolve, governor, integrations.get, pending notes, dependencies).
//   TOOL_MISSING without an identifiable integration is retried only after integrations.updated (no blind retry loop).
// - Approvals: onDecision re-queues waiting runs; the periodic re-check also re-queues waiting tasks whose approval was
//   decided or expired meanwhile (e.g. tasks.update expired it), so no task waits forever.
// - Notifications: generic German bodies (project name only). NEEDS_INPUT is notified only when the ask_user tool did
//   not already notify within the last 2 minutes (no double toasts). DEPENDENCY_FAILED neither reports nor notifies
//   (the root failure already did).
// - recover()/shutdown() exactly per SPEC §6.5; work.status is emitted whenever the computed status changes. After a
//   database restore (recover({ restoredFrom })) the restored agent conversations are stale against the current project
//   files: nothing is resumed automatically; running/interrupted/waiting tasks are paused for review with a fresh start,
//   and a warning explains that NOVA's later file changes are no longer journaled.
import type { AgentRole, AgentRun, Approval, CheckKind, CheckRun, Project, ProjectSummary, Task, TaskKind, TaskNote, TaskStatus, Verification, WorkStatus } from '@shared/schemas';
import { BUILTIN_INTEGRATIONS } from '@shared/schemas';
import { RESUMABLE_BLOCKER_CODES } from '@shared/errors';
import type { AgentRunOutcome, PlanOutput, ReviewOutput, Services, TesterOutput, WorkCycle } from '../contracts';
import { NovaError, conflict, errorMessage, isNovaError, notFound, validation } from '../core/errors';
import { checkEnvironmentProblem, type CheckEnvironmentProblem } from '../checks/check-service';
import { OPEN_STATUSES, TERMINAL_STATUSES, dedupePaths, emptyVerification, keysOverlap, pathKey, readFailures, rowToTask, writeFailures, type TaskRow } from './task-store';
import {
  buildRetryContext,
  buildReviewerContext,
  checkName,
  computeVerificationStatus,
  entryFromCheckRun,
  errorEntry,
  failureSignature,
  failureSummary,
  fixFromCheck,
  fixFromError,
  fixFromFindings,
  fixFromNote,
  formatPlanResult,
  isFailedEntry,
  reviewEntry,
  runningEntry,
  skippedEntry,
  trailingIdentical,
  type FixTaskDraft,
  type VerificationCheck,
} from './verification';
import {
  CHANGES_CHECK,
  INTEGRATION_BUILD,
  INTEGRATION_TESTS,
  INTERRUPTED_AFTER_RESTART,
  REVIEW_CHECK,
  blockerShortReason,
  blockerTitle,
  blockerUserAction,
  formatDateTime,
  shorten,
  verificationLabel,
} from './texts';
import { WorkStateStore, type Continuation, type ContinuationPhase } from './work-state';
import { idleReason, type IdleInput } from './work-status';

/** recover() after a database restore (app.ts passes the backup it applied before opening the database). */
export interface RecoverOptions {
  restoredFrom?: string | null;
}

export interface WorkCycleOptions {
  /** Scheduler tick interval (default 1000 ms; SPEC: timers ≥ 1 s). */
  tickIntervalMs?: number;
  /** Auto-unblock / approval reconciliation / integration catch-up interval (default 60 s). */
  recheckIntervalMs?: number;
  /** Delay of event-driven wakeups (coalescing, default 25 ms). */
  wakeDelayMs?: number;
  /** Debounce of event-driven re-checks (default 300 ms). */
  recheckDelayMs?: number;
  /** How long stopTask waits for the run to end before it marks the task cancelled itself (default 15 s). */
  stopWaitMs?: number;
}

interface RunCtx {
  taskId: string;
  projectId: string;
  controller: AbortController;
  userPause: boolean;
  /** 'global' and/or project ids of work.pause calls that affect this run. */
  pauseScopes: Set<string>;
  shutdownPause: boolean;
  stopMode: 'cancel' | 'requeue' | null;
  /** Current agent run (latest known). */
  runId: string | null;
  phase: ContinuationPhase;
  /** This execution started a fresh attempt (attempts was incremented). */
  freshAttempt: boolean;
  startedAt: number;
  /** Set when the task state was finalized outside the normal outcome path (forced stop, shutdown). */
  finalized: boolean;
  done: Promise<void>;
}

type AbortKind = 'interrupt' | 'requeue' | 'cancel';

const RISKY_RESTART_KINDS = ['publish', 'delete', 'install', 'admin', 'system_change'];
const MODEL_CODES = ['NO_MODEL', 'MODEL_UNAVAILABLE', 'OLLAMA_UNREACHABLE', 'VRAM_INSUFFICIENT', 'BUDGET_EXCEEDED', 'PAID_NOT_APPROVED', 'PRICE_UNKNOWN', 'APPROVAL_REQUIRED'];
const BUILD_KINDS = ['web', 'desktop', 'backend'];
const INTEGRATION_NAMES = [INTEGRATION_BUILD, INTEGRATION_TESTS];
/** Coder task kinds whose result must be a file change; without one the verification is never 'passed'. */
const CHANGE_KINDS: TaskKind[] = ['code', 'fix', 'test', 'custom'];
const TEST_CHECK_NAMES = [checkName('test'), checkName('e2e')];
const NO_CHANGES_TEXT = 'Der Agent hat keine Datei geändert – ob die Aufgabe umgesetzt ist, lässt sich nicht automatisch bestätigen.';
/** Earliest automatic re-run of an integration pass that could not run because of the environment. */
const ENV_RECHECK_MS = 10 * 60_000;
const RESTORED_BLOCKER = 'Nach Datenbank-Wiederherstellung angehalten – bitte prüfen und neu starten';

const isResumable = (code: string | null | undefined): boolean => !!code && RESUMABLE_BLOCKER_CODES.includes(code);

/** Coalescing timer job: request() schedules one execution after delayMs; executions never overlap. */
class CoalescedJob {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private rerun = false;
  private waiters: (() => void)[] = [];

  constructor(
    private delayMs: number,
    private fn: () => Promise<void> | void,
    private onError: (e: unknown) => void,
  ) {}

  request(): void {
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.execute();
    }, this.delayMs);
    this.timer.unref?.();
  }

  private async execute(): Promise<void> {
    if (this.running) {
      this.rerun = true;
      return;
    }
    const p = (async () => {
      try {
        await this.fn();
      } catch (e) {
        this.onError(e);
      }
    })();
    this.running = p;
    await p;
    this.running = null;
    if (this.rerun) {
      this.rerun = false;
      this.request();
      return;
    }
    if (!this.timer) this.flush();
  }

  private flush(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  /** Resolves when nothing is scheduled or running; null when already idle. */
  settled(): Promise<void> | null {
    if (!this.timer && !this.running) return null;
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.rerun = false;
    if (!this.running) this.flush();
  }
}

/** Resolves true when `p` settles within ms, false on timeout (timer always cleared). */
function settleWithin(p: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), Math.max(0, ms));
    t.unref?.();
    p.then(
      () => {
        clearTimeout(t);
        resolve(true);
      },
      () => {
        clearTimeout(t);
        resolve(true);
      },
    );
  });
}

function isInterruptReason(reason: unknown): boolean {
  return isNovaError(reason) && reason.code === 'INTERRUPTED';
}

export function createWorkCycle(s: Services, options: WorkCycleOptions = {}): WorkCycle & { recover(opts?: RecoverOptions): Promise<{ tasks: number }> } {
  const core = s.core;
  const db = core.db;
  const log = core.log.child('work');
  const store = new WorkStateStore(db);
  const opts = {
    tickIntervalMs: Math.max(1, options.tickIntervalMs ?? 1000),
    recheckIntervalMs: Math.max(1, options.recheckIntervalMs ?? 60_000),
    wakeDelayMs: Math.max(0, options.wakeDelayMs ?? 25),
    recheckDelayMs: Math.max(0, options.recheckDelayMs ?? 300),
    stopWaitMs: Math.max(0, options.stopWaitMs ?? 15_000),
  };

  const runs = new Map<string, RunCtx>();
  const integrationPasses = new Map<string, { controller: AbortController; done: Promise<void>; projectId: string }>();
  const integrationRerun = new Set<string>();
  const background = new Set<Promise<unknown>>();
  const pendingTriggers = new Set<string>();
  let loopStarted = false;
  let shuttingDown = false;
  let decisionSubscribed = false;
  let tickTimer: NodeJS.Timeout | null = null;
  let recheckTimer: NodeJS.Timeout | null = null;
  let lastStatusJson = '';
  let projectCache: { at: number; list: ProjectSummary[] } | null = null;

  const now = () => core.clock.now();
  const settings = () => core.settings.get();

  function safe<T>(fn: () => T, what?: string): T | null {
    try {
      return fn();
    } catch (e) {
      if (what) log.debug(`${what} fehlgeschlagen`, { error: errorMessage(e) });
      return null;
    }
  }

  async function safeAsync<T>(fn: () => Promise<T>, what?: string): Promise<T | null> {
    try {
      return await fn();
    } catch (e) {
      if (what) log.debug(`${what} fehlgeschlagen`, { error: errorMessage(e) });
      return null;
    }
  }

  function track<T>(p: Promise<T>): Promise<T> {
    background.add(p);
    p.finally(() => background.delete(p)).catch(() => undefined);
    return p;
  }

  const wakeJob = new CoalescedJob(opts.wakeDelayMs, () => tickPass(), (e) => log.error('Planungsdurchlauf fehlgeschlagen', { error: errorMessage(e) }));
  const recheckJob = new CoalescedJob(
    opts.recheckDelayMs,
    async () => {
      const triggers = new Set(pendingTriggers);
      pendingTriggers.clear();
      await recheck(triggers);
    },
    (e) => log.error('Erneute Prüfung blockierter Aufgaben fehlgeschlagen', { error: errorMessage(e) }),
  );

  function requestWake(): void {
    if (!loopStarted || shuttingDown) return;
    wakeJob.request();
  }

  function requestRecheck(trigger: string): void {
    pendingTriggers.add(trigger);
    if (!loopStarted || shuttingDown) return;
    recheckJob.request();
  }

  // -------------------------------------------------------------------------------------------
  // Task state helpers
  // -------------------------------------------------------------------------------------------

  function getTask(id: string): Task | null {
    return safe(() => s.tasks.get(id));
  }

  function patchTask(id: string, patch: Partial<Omit<Task, 'id' | 'projectId' | 'createdAt'>>): Task | null {
    try {
      return s.tasks.patch(id, patch);
    } catch (e) {
      if (isNovaError(e) && e.code === 'NOT_FOUND') {
        log.warn('Aufgabe existiert nicht mehr', { taskId: id });
        return null;
      }
      throw e;
    }
  }

  function projectName(projectId: string): string {
    return safe(() => s.projects.get(projectId))?.name ?? 'Unbekannt';
  }

  function releaseLocks(taskId: string): void {
    safe(() => s.locks.releaseTask(taskId), 'Dateisperren freigeben');
  }

  function expireApprovals(taskId: string): void {
    safe(() => s.approvals.expireForTask(taskId), 'Freigaben ablaufen lassen');
  }

  function killProcesses(taskId: string): Promise<void> {
    let p: Promise<void>;
    try {
      p = Promise.resolve(s.processes.killTask(taskId)).catch((e) => log.warn('Prozesse der Aufgabe konnten nicht beendet werden', { taskId, error: errorMessage(e) }));
    } catch (e) {
      log.warn('Prozesse der Aufgabe konnten nicht beendet werden', { taskId, error: errorMessage(e) });
      p = Promise.resolve();
    }
    return track(p);
  }

  function notify(input: Parameters<Services['notifications']['notify']>[0]): void {
    safe(() => s.notifications.notify(input), 'Benachrichtigung');
  }

  function recentNotification(taskId: string, category: string, withinMs: number): boolean {
    const list = safe(() => s.notifications.list({ limit: 30 })) ?? [];
    return list.some((n) => n.taskId === taskId && n.category === category && now() - n.ts < withinMs);
  }

  function setContinuation(taskId: string, c: Continuation): void {
    if (c.phase === 'agent' && !c.runId) store.clearContinuation(taskId);
    else store.setContinuation(taskId, c);
  }

  function phaseFor(task: Task, run: Pick<AgentRun, 'role'>): ContinuationPhase {
    return run.role === 'reviewer' && task.role !== 'reviewer' ? 'review' : 'agent';
  }

  function taskStatuses(ids: string[]): Map<string, { status: TaskStatus; title: string }> {
    const out = new Map<string, { status: TaskStatus; title: string }>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 400) {
      const part = unique.slice(i, i + 400);
      for (const r of db.all<{ id: string; status: string; title: string }>(`SELECT id, status, title FROM tasks WHERE id IN (${part.map(() => '?').join(',')})`, part)) {
        out.set(r.id, { status: r.status as TaskStatus, title: r.title });
      }
    }
    return out;
  }

  function depsAllDone(task: Task): boolean {
    const st = taskStatuses(task.dependsOn);
    return task.dependsOn.every((d) => !st.has(d) || st.get(d)!.status === 'done');
  }

  function taskKeys(task: Task): string[] {
    return dedupePaths([...task.plannedFiles, ...task.files], core.platform).map((p) => pathKey(p, core.platform));
  }

  /** Queue a task so that it resumes its continuation (or a given run). */
  function requeueForResume(task: Task, run?: AgentRun | null): Task | null {
    if (run) {
      const existing = store.continuation(task.id);
      if (!existing || (existing.phase !== 'verify' && existing.runId !== run.id)) {
        setContinuation(task.id, { phase: phaseFor(task, run), runId: run.id, role: run.role });
      }
    }
    const t = patchTask(task.id, { status: 'queued', blocker: null, blockerCode: null });
    requestWake();
    return t;
  }

  function unblock(task: Task, why: string): void {
    log.info('Blockierte Aufgabe wird fortgesetzt', { taskId: task.id, code: task.blockerCode, why });
    patchTask(task.id, { status: 'queued', blocker: null, blockerCode: null });
    safe(() => core.errors.resolveWhere({ taskId: task.id }), 'Fehler auflösen');
    requestWake();
  }

  /** Marks a fresh restart: the previous non-terminal run is cancelled so it is not shown as paused forever. */
  function discardRun(taskId: string): void {
    const run = safe(() => s.runs.latestForTask(taskId));
    if (run && (run.status === 'paused' || run.status === 'waiting_approval' || run.status === 'interrupted')) {
      safe(() => s.runs.update(run.id, { status: 'cancelled', endedAt: now(), pendingApprovalId: null }), 'Lauf verwerfen');
    }
  }

  function finishTerminal(task: Task, status: 'done' | 'failed' | 'cancelled', extra: Partial<Task>): Task | null {
    store.forgetTask(task.id);
    const t = patchTask(task.id, { ...extra, status, finishedAt: now(), startRequested: false });
    releaseLocks(task.id);
    expireApprovals(task.id);
    return t;
  }

  function afterTerminal(taskId: string): void {
    const t = getTask(taskId);
    if (!t) return;
    if (t.status === 'done') requeueDependents(t);
    if (t.parentId && (t.status === 'done' || t.status === 'cancelled')) maybeIntegration(t.parentId);
    requestWake();
  }

  function requeueDependents(done: Task): void {
    const rows = db.all<TaskRow>("SELECT * FROM tasks WHERE project_id = ? AND status = 'blocked' AND blocker_code = 'DEPENDENCY_FAILED'", [done.projectId]);
    for (const t of rows.map(rowToTask)) {
      if (t.dependsOn.includes(done.id) && !runs.has(t.id) && depsAllDone(t)) unblock(t, 'Vorgängeraufgabe erledigt');
    }
  }

  // -------------------------------------------------------------------------------------------
  // Error reports, notifications, memory
  // -------------------------------------------------------------------------------------------

  function attemptsList(task: Task): string[] {
    const list = [`${task.attempts} von ${task.maxAttempts} Versuchen ausgeführt`];
    for (const c of task.verification.checks) {
      if (c.status !== 'skipped') list.push(`Prüfung „${c.name}“: ${c.status === 'passed' ? 'bestanden' : c.status === 'failed' ? 'fehlgeschlagen' : c.status}`);
    }
    return list;
  }

  /** Text overrides for a blocker whose code is shared with other causes (e.g. a check that could not run). */
  interface BlockTexts {
    userAction?: string;
    title?: string;
    shortReason?: string;
  }

  function reportBlocked(task: Task, code: string, reason: string, runId: string | null, texts: BlockTexts = {}): void {
    if (code === 'NEEDS_INPUT' || code === 'DEPENDENCY_FAILED') return;
    safe(
      () =>
        core.errors.report({
          code,
          severity: 'blocker',
          title: texts.title ?? blockerTitle(code),
          whatHappened: `Die Aufgabe „${task.title}“ ist blockiert: ${reason}`,
          projectId: task.projectId,
          taskId: task.id,
          attempted: attemptsList(task),
          projectSafe: true,
          autoFixable: isResumable(code),
          userAction: texts.userAction ?? blockerUserAction(code),
          details: reason,
          related: { checkRunId: null, runId: runId || null, approvalId: null, file: null, line: null },
          dedupeKey: `task:${task.id}`,
        }),
      'Fehlerbericht',
    );
  }

  function notifyBlocked(task: Task, code: string, shortReason?: string): void {
    if (code === 'DEPENDENCY_FAILED') return;
    if (code === 'NEEDS_INPUT' && recentNotification(task.id, 'blocker', 120_000)) return;
    const body = `Eine Aufgabe im Projekt „${projectName(task.projectId)}“ kann nicht weiterarbeiten: ${shortReason ?? blockerShortReason(code)}`;
    // The same blocker of the same task (e.g. a model that is still missing after an auto-unblock) toasts once per 30 min.
    const recent = safe(() => s.notifications.list({ limit: 50 })) ?? [];
    if (recent.some((n) => n.taskId === task.id && n.category === 'blocker' && n.body === body && now() - n.ts < 30 * 60_000)) return;
    notify({
      level: 'warning',
      category: 'blocker',
      title: code === 'NEEDS_INPUT' ? 'Rückfrage des Agenten' : 'Aufgabe blockiert',
      body,
      projectId: task.projectId,
      taskId: task.id,
    });
  }

  function reportFailed(task: Task, code: string, reason: string, runId: string | null, related?: { checkRunId?: string | null; file?: string | null; line?: number | null }): void {
    safe(
      () =>
        core.errors.report({
          code,
          severity: 'blocker',
          title: 'Aufgabe fehlgeschlagen',
          whatHappened: `Die Aufgabe „${task.title}“ ist fehlgeschlagen: ${reason}`,
          projectId: task.projectId,
          taskId: task.id,
          attempted: attemptsList(task),
          projectSafe: true,
          autoFixable: false,
          userAction:
            'Bitte die Details prüfen, die Aufgabe bei Bedarf anpassen und mit „Wiederholen“ neu starten. Änderungen von NOVA lassen sich unter „Änderungen“ rückgängig machen.',
          details: reason,
          related: { checkRunId: related?.checkRunId ?? null, runId: runId || null, approvalId: null, file: related?.file ?? null, line: related?.line ?? null },
          dedupeKey: `task:${task.id}`,
        }),
      'Fehlerbericht',
    );
    notify({
      level: 'error',
      category: 'error',
      title: 'Aufgabe fehlgeschlagen',
      body: `Eine Aufgabe im Projekt „${projectName(task.projectId)}“ ist fehlgeschlagen. Die Details stehen in NOVA.`,
      projectId: task.projectId,
      taskId: task.id,
    });
  }

  function addMemory(input: { projectId: string; kind: 'task_status' | 'test_result' | 'attempt' | 'bug'; title: string; content: string; taskId: string }): void {
    safe(() => s.memory.add({ projectId: input.projectId, kind: input.kind, title: shorten(input.title, 300), content: input.content.slice(0, 20000), taskId: input.taskId, tags: ['nova'] }, 'system'), 'Gedächtniseintrag');
  }

  function rememberSuccess(task: Task, verification: Verification): void {
    addMemory({
      projectId: task.projectId,
      kind: 'task_status',
      title: `Erledigt: ${task.title}`,
      content: [task.result ?? '', `Prüfung: ${verificationLabel(verification.status)}`, task.files.length ? `Geänderte Dateien: ${task.files.slice(0, 50).join(', ')}` : '']
        .filter(Boolean)
        .join('\n'),
      taskId: task.id,
    });
    const testEntries = verification.checks.filter((c) => (c.name === 'Tests' || c.name === 'E2E-Tests') && (c.status === 'passed' || c.status === 'failed'));
    if (testEntries.length) {
      addMemory({
        projectId: task.projectId,
        kind: 'test_result',
        title: `Testergebnis: ${task.title}`,
        content: testEntries.map((c) => `${c.name}: ${c.details ?? c.status}`).join('\n'),
        taskId: task.id,
      });
    }
  }

  function checkpointWarning(task: Task, e: unknown, before: boolean): void {
    log.warn('Wiederherstellungspunkt konnte nicht angelegt werden', { taskId: task.id, error: errorMessage(e) });
    safe(() =>
      core.errors.report({
        code: isNovaError(e) ? String(e.code) : 'INTERNAL',
        severity: 'warning',
        title: 'Wiederherstellungspunkt fehlt',
        whatHappened: before
          ? `Vor dem Start der Aufgabe „${task.title}“ konnte kein Wiederherstellungspunkt angelegt werden: ${errorMessage(e)}`
          : `Nach Abschluss der Aufgabe „${task.title}“ konnte kein Wiederherstellungspunkt angelegt werden: ${errorMessage(e)}`,
        projectId: task.projectId,
        taskId: task.id,
        attempted: ['Wiederherstellungspunkt anlegen'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Die Arbeit geht weiter. Änderungen von NOVA bleiben über das Änderungsprotokoll einzeln rückgängig machbar.',
        details: errorMessage(e),
        dedupeKey: `checkpoint:${task.id}`,
      }),
    );
  }

  // -------------------------------------------------------------------------------------------
  // Outcome mapping
  // -------------------------------------------------------------------------------------------

  function abortKind(ctx: RunCtx): AbortKind {
    if (isInterruptReason(ctx.controller.signal.reason) || ctx.shutdownPause) return 'interrupt';
    return ctx.stopMode === 'requeue' ? 'requeue' : 'cancel';
  }

  function markInterrupted(task: Task, cont: Continuation): void {
    if (cont.runId || cont.phase !== 'agent') setContinuation(task.id, cont);
    patchTask(task.id, { status: 'interrupted', blocker: null, blockerCode: null });
  }

  function markPaused(ctx: RunCtx, task: Task, cont: Continuation): void {
    if (shuttingDown || ctx.shutdownPause) return markInterrupted(task, cont);
    setContinuation(task.id, cont);
    patchTask(task.id, { status: 'paused', blocker: null, blockerCode: null });
    if (!ctx.userPause) for (const scope of ctx.pauseScopes) store.rememberPaused(scope, task.id);
  }

  function requeueAfterStop(ctx: RunCtx, task: Task): void {
    store.clearContinuation(task.id);
    const attempts = ctx.freshAttempt ? Math.max(0, task.attempts - 1) : task.attempts;
    patchTask(task.id, { status: 'queued', startRequested: false, blocker: null, blockerCode: null, attempts });
    releaseLocks(task.id);
    void killProcesses(task.id);
  }

  function cancelTask(task: Task, reason: string | null): void {
    finishTerminal(task, 'cancelled', { blocker: reason, blockerCode: null });
    void killProcesses(task.id);
    afterTerminal(task.id);
  }

  function applyAbort(ctx: RunCtx, task: Task, cont: Continuation): void {
    if (ctx.finalized) return;
    const kind = abortKind(ctx);
    if (kind === 'interrupt') return markInterrupted(task, cont);
    if (kind === 'requeue') return requeueAfterStop(ctx, task);
    return cancelTask(task, 'Vom Benutzer gestoppt.');
  }

  function blockTask(task: Task, code: string, reason: string, runId: string | null, cont: Continuation | null, texts: BlockTexts = {}): void {
    const resumable = isResumable(code);
    if (cont && (resumable || cont.userResume)) setContinuation(task.id, cont);
    else if (!resumable) store.clearContinuation(task.id);
    const t = patchTask(task.id, { status: 'blocked', blocker: shorten(reason, 4000) || blockerShortReason(code), blockerCode: code }) ?? task;
    if (!resumable) releaseLocks(task.id);
    reportBlocked(t, code, reason, runId, texts);
    notifyBlocked(t, code, texts.shortReason);
    requestWake();
  }

  function failTask(task: Task, code: string, reason: string, runId: string | null, related?: { checkRunId?: string | null; file?: string | null; line?: number | null }): void {
    const t = finishTerminal(task, 'failed', { blocker: shorten(reason, 4000), blockerCode: code }) ?? task;
    reportFailed(t, code, reason, runId, related);
    addMemory({ projectId: t.projectId, kind: 'attempt', title: `Fehlgeschlagen: ${t.title}`, content: `${reason}\n${attemptsList(t).join('\n')}`, taskId: t.id });
    afterTerminal(t.id);
  }

  function applyNonDone(ctx: RunCtx, task: Task, outcome: Exclude<AgentRunOutcome, { status: 'done' }>, phase: ContinuationPhase, role: AgentRole): void {
    if (ctx.finalized) return;
    const cont: Continuation = { phase, runId: outcome.runId || null, role };
    // A stop request wins over whatever the run reported at the same moment.
    if (ctx.stopMode === 'requeue') return requeueAfterStop(ctx, task);
    if (ctx.stopMode === 'cancel') return cancelTask(task, 'Vom Benutzer gestoppt.');
    switch (outcome.status) {
      case 'paused':
        return markPaused(ctx, task, cont);
      case 'waiting_approval': {
        setContinuation(task.id, { ...cont, approvalId: outcome.approvalId });
        const approval = safe(() => s.approvals.get(outcome.approvalId));
        patchTask(task.id, {
          status: 'waiting_approval',
          blocker: approval ? `Wartet auf Freigabe: ${approval.title}` : 'Wartet auf eine Freigabe.',
          blockerCode: null,
        });
        // Decided between the runner returning and now → onDecision saw a running task; re-queue here.
        if (approval && approval.status !== 'pending') {
          const t = getTask(task.id);
          if (t) requeueForResume(t);
        }
        return;
      }
      case 'blocked':
        // Step limit: keep the run so "Starten" continues it with a new step budget instead of starting over.
        return blockTask(task, outcome.code, outcome.reason, outcome.runId || null, outcome.code === 'AGENT_STEP_LIMIT' ? { ...cont, userResume: true } : cont);
      case 'failed':
        return failTask(task, outcome.code || 'INTERNAL', outcome.reason, outcome.runId || null);
      case 'cancelled':
        if (shuttingDown || ctx.shutdownPause || isInterruptReason(ctx.controller.signal.reason)) return markInterrupted(task, cont);
        return cancelTask(task, 'Abgebrochen.');
      case 'interrupted':
        return markInterrupted(task, cont);
    }
  }

  function outcomeFromError(ctx: RunCtx, e: unknown): Exclude<AgentRunOutcome, { status: 'done' }> {
    const runId = ctx.runId ?? '';
    if (ctx.controller.signal.aborted) {
      return abortKind(ctx) === 'interrupt' ? { status: 'interrupted', runId } : { status: 'cancelled', runId };
    }
    if (isNovaError(e)) {
      if (e.code === 'INTERRUPTED') return { status: 'interrupted', runId };
      if (e.code === 'CANCELLED') return { status: 'cancelled', runId };
      if (isResumable(String(e.code))) return { status: 'blocked', runId, reason: e.message, code: String(e.code) };
      return { status: 'failed', runId, reason: e.message, code: String(e.code) };
    }
    log.error('Unerwarteter Fehler im Agentenlauf', { taskId: ctx.taskId, error: errorMessage(e) });
    return { status: 'failed', runId, reason: `Interner Fehler im Agentenlauf: ${errorMessage(e)}`, code: 'INTERNAL' };
  }

  function updateModel(taskId: string, runId: string | null): void {
    if (!runId) return;
    const run = safe(() => s.runs.get(runId));
    if (run?.providerId && run.modelId) {
      const model = `${run.providerId}/${run.modelId}`;
      const t = getTask(taskId);
      if (t && t.model !== model) patchTask(taskId, { model });
    }
  }

  function pauseRequested(ctx: RunCtx): boolean {
    return ctx.userPause || ctx.pauseScopes.size > 0 || ctx.shutdownPause;
  }

  async function runAgent(ctx: RunCtx, input: { task: Task; project: Project; role: AgentRole; resumeRunId: string | null; extraContext?: string }): Promise<AgentRunOutcome> {
    if (input.resumeRunId) ctx.runId = input.resumeRunId;
    try {
      const outcome = await s.agents.run({
        task: input.task,
        project: input.project,
        role: input.role,
        resumeRunId: input.resumeRunId,
        signal: ctx.controller.signal,
        pauseRequested: () => pauseRequested(ctx),
        extraContext: input.extraContext,
      });
      if (outcome.runId) ctx.runId = outcome.runId;
      updateModel(ctx.taskId, ctx.runId);
      return outcome;
    } catch (e) {
      updateModel(ctx.taskId, ctx.runId);
      return outcomeFromError(ctx, e);
    }
  }

  // -------------------------------------------------------------------------------------------
  // Run execution
  // -------------------------------------------------------------------------------------------

  function launch(task: Task, project: Project): void {
    const cont = store.continuation(task.id);
    const ctx: RunCtx = {
      taskId: task.id,
      projectId: task.projectId,
      controller: new AbortController(),
      userPause: false,
      pauseScopes: new Set(),
      shutdownPause: false,
      stopMode: null,
      runId: cont?.runId ?? null,
      phase: cont?.phase ?? 'agent',
      freshAttempt: false,
      startedAt: now(),
      finalized: false,
      done: Promise.resolve(),
    };
    runs.set(task.id, ctx);
    try {
      patchTask(task.id, { status: 'running', blocker: null, blockerCode: null, startedAt: task.startedAt ?? now(), finishedAt: null });
    } catch (e) {
      runs.delete(task.id);
      log.error('Aufgabe konnte nicht gestartet werden', { taskId: task.id, error: errorMessage(e) });
      return;
    }
    log.info('Aufgabe gestartet', { taskId: task.id, role: task.role, resume: cont?.phase ?? null });
    ctx.done = executeRun(ctx, cont, project)
      .catch((e) => handleUnexpected(ctx, e))
      .finally(() => finishCtx(ctx));
  }

  function handleUnexpected(ctx: RunCtx, e: unknown): void {
    log.error('Interner Fehler im Arbeitszyklus', { taskId: ctx.taskId, error: errorMessage(e) });
    if (ctx.finalized) return;
    const t = getTask(ctx.taskId);
    if (t && t.status === 'running') {
      if (ctx.controller.signal.aborted) return applyAbort(ctx, t, { phase: ctx.phase, runId: ctx.runId, role: t.role });
      failTask(t, 'INTERNAL', `Interner Fehler im Arbeitszyklus: ${errorMessage(e)}`, ctx.runId);
    }
  }

  function finishCtx(ctx: RunCtx): void {
    if (runs.get(ctx.taskId) === ctx) runs.delete(ctx.taskId);
    if (!ctx.finalized) {
      const t = getTask(ctx.taskId);
      if (t && t.status === 'running') {
        log.error('Lauf endete ohne Status – Aufgabe wird als fehlgeschlagen markiert', { taskId: t.id });
        failTask(t, 'INTERNAL', 'Interner Fehler: Der Lauf endete ohne Ergebnis.', ctx.runId);
      }
    }
    emitStatusIfChanged();
    requestWake();
  }

  async function executeRun(ctx: RunCtx, cont: Continuation | null, launchProject: Project): Promise<void> {
    let task = s.tasks.require(ctx.taskId);
    const project = safe(() => s.projects.get(task.projectId)) ?? launchProject;

    if (cont?.phase === 'verify' && cont.runId) {
      ctx.phase = 'verify';
      ctx.runId = cont.runId;
      if (task.role === 'tester') return finishTester(ctx, task, project, cont.runId, task.result ?? '', null);
      return verifyCoder(ctx, task, project, cont.runId, task.result ?? '');
    }
    if (cont?.phase === 'review') {
      const checks = task.verification.checks.filter((c) => c.name !== REVIEW_CHECK);
      return reviewPass(ctx, task, project, checks, cont.runId, task.result ?? '');
    }

    const resumeRunId = cont?.phase === 'agent' ? cont.runId : null;
    let extraContext: string | undefined;
    if (!resumeRunId) {
      store.clearContinuation(task.id);
      const firstRun = task.attempts === 0;
      task = patchTask(task.id, { attempts: task.attempts + 1 }) ?? task;
      ctx.freshAttempt = true;
      if (firstRun && task.role !== 'planner' && settings().backup.checkpointBeforeTasks) {
        try {
          await s.checkpoints.create({ projectId: task.projectId, kind: 'pre_task', label: `Vor Aufgabe: ${shorten(task.title, 120)}`, taskId: task.id });
        } catch (e) {
          checkpointWarning(task, e, true);
        }
      }
      extraContext = retryContextFor(task);
    }
    if (ctx.controller.signal.aborted) return applyAbort(ctx, task, { phase: 'agent', runId: resumeRunId, role: task.role });
    ctx.phase = 'agent';
    const outcome = await runAgent(ctx, { task, project, role: task.role, resumeRunId, extraContext });
    return handleAgentOutcome(ctx, outcome, project);
  }

  function retryContextFor(task: Task): string | undefined {
    if (task.attempts <= 1 || task.verification.status !== 'failed') return undefined;
    const history = readFailures(db, task.id);
    const n = trailingIdentical(history);
    return buildRetryContext({
      attemptNumber: task.attempts,
      maxAttempts: Math.max(task.maxAttempts, task.attempts),
      verification: task.verification,
      runs: fetchCheckRuns(task.verification.checks),
      history,
      differentApproach: n >= settings().agents.maxIdenticalFailures,
      identicalCount: n,
    });
  }

  function fetchCheckRuns(entries: VerificationCheck[]): Map<string, CheckRun> {
    const out = new Map<string, CheckRun>();
    for (const e of entries) {
      if (!e.checkRunId || out.has(e.checkRunId)) continue;
      const run = safe(() => s.checks.get(e.checkRunId!));
      if (run) out.set(run.id, run);
    }
    return out;
  }

  async function handleAgentOutcome(ctx: RunCtx, outcome: AgentRunOutcome, project: Project): Promise<void> {
    if (ctx.finalized) return;
    const task = getTask(ctx.taskId);
    if (!task) return;
    if (outcome.status !== 'done') return applyNonDone(ctx, task, outcome, 'agent', task.role);
    const out = outcome.output;
    switch (out.role) {
      case 'planner':
        return finishPlanner(ctx, task, project, outcome.runId, out.plan);
      case 'coder':
        if (out.result.status === 'blocked') {
          return blockTask(task, 'AGENT_BLOCKED', out.result.blocker?.trim() || out.result.summary || outcome.summary, outcome.runId, null);
        }
        return verifyCoder(ctx, task, project, outcome.runId, out.result.summary || outcome.summary);
      case 'tester':
        return finishTester(ctx, task, project, outcome.runId, out.result.summary || outcome.summary, out.result);
      case 'reviewer':
        return finishReviewTask(ctx, task, project, out.review);
    }
  }

  async function runCheck(ctx: RunCtx | null, signal: AbortSignal, projectId: string, taskId: string, kind: CheckKind, name: string): Promise<{ entry: VerificationCheck; run: CheckRun | null } | null> {
    if (signal.aborted) return null;
    try {
      const run = await s.checks.run({ projectId, kind, taskId, signal, actor: 'system' });
      if (signal.aborted) return null;
      if (run.status === 'cancelled') return { entry: errorEntry(name, 'Die Prüfung wurde abgebrochen.', run.id), run };
      return { entry: entryFromCheckRun(name, run), run };
    } catch (e) {
      if (signal.aborted) return null;
      log.warn('Prüfung konnte nicht ausgeführt werden', { taskId, kind, error: errorMessage(e), ctx: !!ctx });
      return { entry: errorEntry(name, `Die Prüfung konnte nicht gestartet werden: ${errorMessage(e)}`), run: null };
    }
  }

  /** Coder checks in fixed order; null when aborted. */
  async function runCoderChecks(ctx: RunCtx, task: Task, project: Project): Promise<VerificationCheck[] | null> {
    const cmds = project.config.commands;
    type Slot = { name: string; kind: CheckKind | null; reason?: string };
    const slots: Slot[] = [];
    if (BUILD_KINDS.includes(project.kind)) slots.push(cmds.build ? { name: checkName('build'), kind: 'build' } : { name: checkName('build'), kind: null, reason: 'Kein Build-Befehl eingerichtet.' });
    if (project.config.testAfterChange) slots.push(cmds.test ? { name: checkName('test'), kind: 'test' } : { name: checkName('test'), kind: null, reason: 'Kein Testbefehl eingerichtet.' });
    if (cmds.typecheck) slots.push({ name: checkName('typecheck'), kind: 'typecheck' });
    if (cmds.lint) slots.push({ name: checkName('lint'), kind: 'lint' });
    const entries: VerificationCheck[] = [];
    let buildFailed = false;
    for (const slot of slots) {
      if (!slot.kind) {
        entries.push(skippedEntry(slot.name, slot.reason ?? 'Nicht eingerichtet.'));
        continue;
      }
      if (buildFailed) {
        entries.push(skippedEntry(slot.name, 'Übersprungen, weil der Build fehlgeschlagen ist.'));
        continue;
      }
      const r = await runCheck(ctx, ctx.controller.signal, project.id, task.id, slot.kind, slot.name);
      if (!r) return null;
      entries.push(r.entry);
      patchTask(task.id, { verification: { status: 'not_run', checks: [...entries] } });
      if (slot.kind === 'build' && isFailedEntry(r.entry)) buildFailed = true;
    }
    return entries;
  }

  async function verifyCoder(ctx: RunCtx, task: Task, project: Project, coderRunId: string, summary: string): Promise<void> {
    ctx.phase = 'verify';
    setContinuation(task.id, { phase: 'verify', runId: coderRunId, role: task.role });
    let t = patchTask(task.id, { result: summary || task.result, verification: emptyVerification() }) ?? task;
    const proj = safe(() => s.projects.get(project.id)) ?? project;
    const checks = await runCoderChecks(ctx, t, proj);
    t = getTask(t.id) ?? t;
    if (!checks) return applyAbort(ctx, t, { phase: 'verify', runId: coderRunId, role: t.role });
    const env = environmentProblem(checks);
    if (env) return holdVerification(ctx, t, checks, coderRunId, env);
    // task.files is written by the tools (journal) for file tools and run_command alike, across all attempts.
    const unchanged = t.role === 'coder' && CHANGE_KINDS.includes(t.kind) && t.files.length === 0;
    if (unchanged) checks.unshift(skippedEntry(CHANGES_CHECK, NO_CHANGES_TEXT));
    if (proj.config.reviewChanges) {
      if (checks.some(isFailedEntry)) {
        checks.push(skippedEntry(REVIEW_CHECK, 'Übersprungen, weil andere Prüfungen fehlgeschlagen sind.'));
      } else if (unchanged) {
        checks.push(skippedEntry(REVIEW_CHECK, 'Übersprungen, weil keine Datei geändert wurde.'));
      } else {
        t = patchTask(t.id, { verification: { status: 'not_run', checks } }) ?? t;
        return reviewPass(ctx, t, proj, checks, null, summary);
      }
    }
    return finalizeVerification(ctx, t, proj, checks, summary, coderRunId);
  }

  async function reviewPass(ctx: RunCtx, task: Task, project: Project, checks: VerificationCheck[], reviewerRunId: string | null, summary: string): Promise<void> {
    ctx.phase = 'review';
    const cont: Continuation = { phase: 'review', runId: reviewerRunId, role: 'reviewer' };
    setContinuation(task.id, cont);
    if (ctx.controller.signal.aborted) return applyAbort(ctx, task, cont);
    if (!reviewerRunId && pauseRequested(ctx)) return markPaused(ctx, task, cont);
    const extraContext = reviewerRunId ? undefined : buildReviewerContext({ coderSummary: summary, files: task.files, checks });
    const outcome = await runAgent(ctx, { task, project, role: 'reviewer', resumeRunId: reviewerRunId, extraContext });
    if (ctx.finalized) return;
    const t = getTask(task.id) ?? task;
    if (outcome.status === 'done') {
      if (outcome.output.role !== 'reviewer') {
        const entry = errorEntry(REVIEW_CHECK, 'Der Review-Agent hat kein Review geliefert.');
        patchTask(t.id, { verification: { status: 'failed', checks: [...checks, entry] } });
        return failTask(t, 'AGENT_BAD_OUTPUT', 'Der Review-Agent hat kein gültiges Review geliefert.', outcome.runId);
      }
      return finalizeVerification(ctx, t, project, [...checks, reviewEntry(outcome.output.review)], summary, outcome.runId);
    }
    if (outcome.status === 'failed') {
      const reason = `Die Überprüfung durch den Review-Agenten ist fehlgeschlagen: ${outcome.reason}`;
      patchTask(t.id, { verification: { status: 'failed', checks: [...checks, errorEntry(REVIEW_CHECK, reason)] } });
      return failTask(t, outcome.code || 'INTERNAL', reason, outcome.runId);
    }
    return applyNonDone(ctx, t, outcome, 'review', 'reviewer');
  }

  async function finishTester(ctx: RunCtx, task: Task, project: Project, runId: string, summary: string, output: TesterOutput | null): Promise<void> {
    ctx.phase = 'verify';
    setContinuation(task.id, { phase: 'verify', runId, role: task.role });
    let t = patchTask(task.id, { result: summary || task.result }) ?? task;
    const run = safe(() => s.runs.get(runId));
    const since = run?.startedAt ?? ctx.startedAt;
    const all = safe(() => s.checks.list(project.id, { taskId: t.id, since, limit: 200 })) ?? [];
    const latestByKind = new Map<CheckKind, CheckRun>();
    for (const c of [...all].sort((a, b) => b.startedAt - a.startedAt)) {
      if (c.taskId !== t.id || c.startedAt < since || c.status === 'running' || c.status === 'cancelled') continue;
      // A check that could not start because of the environment is no result (it is repeated below if needed).
      if (checkEnvironmentProblem(c)) continue;
      if (!latestByKind.has(c.kind)) latestByKind.set(c.kind, c);
    }
    const entries = [...latestByKind.values()].sort((a, b) => a.startedAt - b.startedAt).map((c) => entryFromCheckRun(checkName(c.kind), c));
    if (!latestByKind.has('test') && !latestByKind.has('e2e')) {
      if (project.config.commands.test) {
        // Lint/build/runtime runs of the agent do not show that the tests pass: NOVA runs the test check itself.
        const r = await runCheck(ctx, ctx.controller.signal, project.id, t.id, 'test', checkName('test'));
        t = getTask(t.id) ?? t;
        if (!r) return applyAbort(ctx, t, { phase: 'verify', runId, role: t.role });
        entries.push(r.entry);
      } else {
        entries.unshift(skippedEntry(checkName('test'), 'Kein Testbefehl eingerichtet – das Ergebnis kann nicht automatisch geprüft werden.'));
      }
    }
    const env = environmentProblem(entries);
    if (env) return holdVerification(ctx, t, entries, runId, env);
    if (output?.passed === true && computeVerificationStatus(entries) === 'failed') {
      safe(() => s.runs.addStep(runId, 'error', 'Der Testagent hat Erfolg gemeldet, die echte Prüfung ist aber fehlgeschlagen.', { checks: entries.map((e) => ({ name: e.name, status: e.status })) }), 'Fehlerschritt');
    }
    return finalizeVerification(ctx, t, project, entries, summary, runId);
  }

  /** Which executed passes count as evidence: tests for tester tasks, nothing when the coder changed no file. */
  function proofFor(task: Task, checks: VerificationCheck[]): (e: VerificationCheck) => boolean {
    if (checks.some((c) => c.name === CHANGES_CHECK)) return () => false;
    if (task.role === 'tester') return (e) => TEST_CHECK_NAMES.includes(e.name);
    return () => true;
  }

  /** First entry whose CheckRun could not run because of the environment (approval, missing tool, Unity open …). */
  function environmentProblem(entries: VerificationCheck[]): { entry: VerificationCheck; problem: CheckEnvironmentProblem; ranAt: number } | null {
    for (const e of entries) {
      if (e.status !== 'error' || !e.checkRunId) continue;
      const run = safe(() => s.checks.get(e.checkRunId!));
      const problem = run ? checkEnvironmentProblem(run) : null;
      if (run && problem) return { entry: e, problem, ranAt: run.startedAt };
    }
    return null;
  }

  /** Error code, German reason and user action for a check that could not run because of the environment. */
  function environmentAdvice(
    entry: VerificationCheck,
    problem: CheckEnvironmentProblem,
    thenStart = 'und die Aufgabe dann mit „Starten“ weiterprüfen lassen. Die Änderungen des Agenten bleiben erhalten.',
  ): { code: string; reason: string; userAction: string; title: string; shortReason: string } {
    const reason = `Die Prüfung „${entry.name}“ konnte nicht laufen: ${entry.details ?? 'Die Prüfung konnte nicht ausgeführt werden.'}`;
    const advice = adviceFor(problem, reason, thenStart);
    const title = problem.kind === 'tool_missing' ? blockerTitle(advice.code) : 'Prüfung konnte nicht laufen';
    const shortReason = problem.kind === 'approval_denied' ? 'Die Installation der Abhängigkeiten für eine Prüfung wurde abgelehnt.' : blockerShortReason(advice.code);
    return { ...advice, title, shortReason };
  }

  function adviceFor(problem: CheckEnvironmentProblem, reason: string, thenStart: string): { code: string; reason: string; userAction: string } {
    switch (problem.kind) {
      case 'approval':
        return { code: 'APPROVAL_REQUIRED', reason, userAction: 'Bitte unter „Freigaben“ über die Installation der Abhängigkeiten entscheiden. NOVA prüft danach automatisch weiter.' };
      case 'tool_missing':
        return {
          code: 'TOOL_MISSING',
          reason,
          userAction: `Bitte das fehlende Werkzeug${problem.program ? ` („${problem.program}“)` : ''} unter „Werkzeuge“ installieren oder seinen Pfad eintragen. NOVA prüft danach automatisch weiter.`,
        };
      case 'approval_denied':
        return { code: 'APPROVAL_DENIED', reason, userAction: `Die Installation der Abhängigkeiten wurde abgelehnt. Bitte die Abhängigkeiten selbst installieren (z. B. im Terminal) oder die Installation erlauben ${thenStart}` };
      case 'command_blocked':
        return { code: 'COMMAND_BLOCKED', reason, userAction: `Der Installationsbefehl ist durch die Sicherheitsregeln gesperrt. Bitte die Abhängigkeiten selbst installieren oder die Regeln in den Einstellungen anpassen ${thenStart}` };
      case 'engine_open':
        return { code: 'FILE_IN_USE', reason, userAction: `Bitte Unity schließen ${thenStart}` };
      case 'project_missing':
        return { code: 'NOT_FOUND', reason, userAction: `Bitte den Projektordner wiederherstellen oder in den Projekteinstellungen den neuen Ort eintragen ${thenStart}` };
    }
  }

  /**
   * The verification could not run because of the environment: no coder retry. Waits for the install approval, or
   * blocks with a continuation that re-runs only the verification (TOOL_MISSING auto-unblocks, the rest on "Starten").
   */
  function holdVerification(ctx: RunCtx, task: Task, checks: VerificationCheck[], runId: string, env: { entry: VerificationCheck; problem: CheckEnvironmentProblem }): void {
    if (ctx.finalized) return;
    const t = patchTask(task.id, { verification: { status: 'not_run', checks } }) ?? task;
    const cont: Continuation = { phase: 'verify', runId, role: t.role };
    const p = env.problem;
    if (p.kind === 'approval') {
      setContinuation(t.id, { ...cont, approvalId: p.approvalId });
      const approval = safe(() => s.approvals.get(p.approvalId));
      patchTask(t.id, {
        status: 'waiting_approval',
        blocker: `Wartet auf Freigabe: ${approval?.title ?? 'Abhängigkeiten installieren'} – danach prüft NOVA die Änderungen automatisch.`,
        blockerCode: null,
      });
      log.info('Prüfung wartet auf eine Freigabe', { taskId: t.id, approvalId: p.approvalId });
      // Decided (or gone) between the check and now → onDecision may have missed it; re-queue here.
      if (!approval || approval.status !== 'pending') {
        const fresh = getTask(t.id);
        if (fresh) requeueForResume(fresh);
      }
      return;
    }
    const advice = environmentAdvice(env.entry, p);
    log.info('Prüfung konnte wegen der Umgebung nicht laufen – kein neuer Agentenlauf', { taskId: t.id, code: advice.code });
    blockTask(t, advice.code, advice.reason, runId, isResumable(advice.code) ? cont : { ...cont, userResume: true }, { userAction: advice.userAction, title: advice.title, shortReason: advice.shortReason });
  }

  async function finalizeVerification(ctx: RunCtx, task: Task, project: Project, checks: VerificationCheck[], summary: string, runId: string | null): Promise<void> {
    if (ctx.finalized) return;
    const verification: Verification = { status: computeVerificationStatus(checks, proofFor(task, checks)), checks };
    if (verification.status === 'failed') return handleFailedVerification(task, verification, summary, runId);
    return succeedTask(ctx, task, project, verification, summary);
  }

  function handleFailedVerification(task: Task, verification: Verification, summary: string, runId: string | null): void {
    const t = patchTask(task.id, { verification, result: summary || task.result }) ?? task;
    const checkRuns = fetchCheckRuns(verification.checks);
    const signature = failureSignature(verification.checks, checkRuns);
    const history = readFailures(db, t.id);
    history.push({ signature, attempt: t.attempts, summary: `${summary ? `${shorten(summary, 200)} – ` : ''}${failureSummary(verification.checks)}`, ts: now() });
    writeFailures(db, t.id, history);
    const identical = trailingIdentical(history);
    const maxIdentical = settings().agents.maxIdenticalFailures;
    store.clearContinuation(t.id);
    const firstFailed = verification.checks.find(isFailedEntry);
    const failedRun = firstFailed?.checkRunId ? checkRuns.get(firstFailed.checkRunId) : undefined;
    const related = { checkRunId: failedRun?.id ?? null, file: failedRun?.failures[0]?.file ?? null, line: failedRun?.failures[0]?.line ?? null };

    if (identical > maxIdentical) {
      const latest = safe(() => s.checkpoints.latestVerified(t.projectId));
      const reason = `Derselbe Fehler ist ${identical}-mal hintereinander aufgetreten – auch ein anderer Lösungsweg hat nicht geholfen. NOVA versucht es nicht endlos weiter. Zuletzt: ${failureSummary(verification.checks)}`;
      const userAction = latest
        ? `Bitte die Aufgabe anpassen oder einen Hinweis geben und „Wiederholen“ wählen. Der letzte geprüfte Stand ist der Wiederherstellungspunkt „${latest.label}“ vom ${formatDateTime(latest.createdAt)}; er kann unter „Änderungen“ wiederhergestellt werden.`
        : 'Bitte die Aufgabe anpassen oder einen Hinweis geben und „Wiederholen“ wählen. Es gibt noch keinen geprüften Wiederherstellungspunkt; die Änderungen dieser Aufgabe lassen sich unter „Änderungen“ rückgängig machen.';
      log.warn('Wiederholter identischer Fehler – Aufgabe wird blockiert', { taskId: t.id, identical });
      addMemory({ projectId: t.projectId, kind: 'attempt', title: `Wiederholter Fehler: ${t.title}`, content: history.slice(-6).map((h) => `Versuch ${h.attempt}: ${h.summary}`).join('\n'), taskId: t.id });
      blockTask(t, 'REPEATED_FAILURE', reason, runId, null, { userAction });
      return;
    }
    if (t.attempts >= t.maxAttempts) {
      const code = verification.checks.some((c) => isFailedEntry(c) && c.name === checkName('build')) ? 'BUILD_FAILED' : 'TESTS_FAILED';
      failTask(t, code, `Die Prüfungen sind auch nach ${t.attempts} ${t.attempts === 1 ? 'Versuch' : 'Versuchen'} fehlgeschlagen: ${failureSummary(verification.checks)}`, runId, related);
      return;
    }
    log.info('Prüfung fehlgeschlagen – neuer Versuch wird eingeplant', { taskId: t.id, attempt: t.attempts, identical });
    patchTask(t.id, { status: 'queued', blocker: null, blockerCode: null });
    requestWake();
  }

  async function succeedTask(ctx: RunCtx, task: Task, project: Project, verification: Verification, summary: string, notice?: { title: string; body: string }): Promise<void> {
    let t = patchTask(task.id, { verification, result: summary || task.result }) ?? task;
    if (t.role !== 'planner') {
      try {
        await s.checkpoints.afterTask(t);
      } catch (e) {
        checkpointWarning(t, e, false);
      }
    }
    if (ctx.finalized) return;
    t = getTask(t.id) ?? t;
    rememberSuccess(t, verification);
    safe(() => core.errors.resolveWhere({ taskId: t.id }), 'Fehler auflösen');
    const phrase = verification.status === 'passed' ? 'alle Prüfungen bestanden' : verification.status === 'unavailable' ? uncheckedPhrase(verification) : 'Prüfung fehlgeschlagen';
    notify({
      level: 'success',
      category: 'task_done',
      title: notice?.title ?? 'Aufgabe erledigt',
      body: notice?.body ?? `Eine Aufgabe im Projekt „${project.name}“ ist fertig – ${phrase}.`,
      projectId: t.projectId,
      taskId: t.id,
    });
    finishTerminal(t, 'done', { blocker: null, blockerCode: null });
    log.info('Aufgabe erledigt', { taskId: t.id, verification: verification.status });
    afterTerminal(t.id);
  }

  function uncheckedPhrase(verification: Verification): string {
    if (verification.checks.some((c) => c.name === CHANGES_CHECK)) return 'keine Datei geändert, nicht automatisch geprüft';
    if (verification.checks.some((c) => c.name === REVIEW_CHECK && c.status === 'passed')) return 'nur vom Review-Agenten durchgesehen, nicht automatisch geprüft';
    return 'keine automatische Prüfung möglich';
  }

  async function finishReviewTask(ctx: RunCtx, task: Task, project: Project, review: ReviewOutput): Promise<void> {
    const entry = reviewEntry(review);
    // approve → unavailable (a verdict is no check), changes_requested → failed.
    const verification: Verification = { status: computeVerificationStatus([entry]), checks: [entry] };
    if (review.verdict === 'approve') return succeedTask(ctx, task, project, verification, review.summary);
    let fix: Task | null = null;
    try {
      fix = createFixTask({ projectId: task.projectId, draft: fixFromFindings(task, review), parentId: task.parentId, source: 'system', priority: Math.max(task.priority, 2), startRequested: task.startRequested });
    } catch (e) {
      log.warn('Reparatur-Aufgabe aus Review-Befunden konnte nicht angelegt werden', { taskId: task.id, error: errorMessage(e) });
    }
    return succeedTask(ctx, task, project, verification, review.summary, {
      title: 'Review abgeschlossen: Änderungen nötig',
      body: fix
        ? `Ein Review im Projekt „${project.name}“ hat Änderungen verlangt. NOVA hat eine Reparatur-Aufgabe angelegt.`
        : `Ein Review im Projekt „${project.name}“ hat Änderungen verlangt.`,
    });
  }

  async function finishPlanner(ctx: RunCtx, task: Task, project: Project, runId: string, plan: PlanOutput): Promise<void> {
    let created: Task[] | null = null;
    plan = { summary: String(plan.summary ?? ''), tasks: Array.isArray(plan.tasks) ? plan.tasks : [], memory: Array.isArray(plan.memory) ? plan.memory : [] };
    if (settings().agents.autoCreatePlannedTasks && plan.tasks.length) {
      try {
        created = createPlannedTasks(task, plan);
      } catch (e) {
        log.error('Geplante Aufgaben konnten nicht angelegt werden', { taskId: task.id, error: errorMessage(e) });
        return failTask(task, isNovaError(e) ? String(e.code) : 'INTERNAL', `Die geplanten Aufgaben konnten nicht angelegt werden: ${errorMessage(e)}`, runId);
      }
    }
    for (const m of plan.memory) {
      safe(() => s.memory.add({ projectId: task.projectId, kind: m.kind, title: shorten(m.title, 300) || 'Planungsnotiz', content: m.content.slice(0, 20000), taskId: task.id, tags: ['plan'] }, 'system'), 'Plan-Gedächtnis');
    }
    const n = created?.length ?? 0;
    return succeedTask(ctx, task, project, { status: 'unavailable', checks: [] }, formatPlanResult(plan, created), {
      title: 'Plan erstellt',
      body:
        created !== null
          ? `Für das Projekt „${project.name}“ liegt ein Plan vor: ${n} ${n === 1 ? 'neue Aufgabe' : 'neue Aufgaben'}.`
          : `Für das Projekt „${project.name}“ liegt ein Plan vor.`,
    });
  }

  function createPlannedTasks(planTask: Task, plan: PlanOutput): Task[] {
    return db.transaction(() => {
      const keyToId = new Map<string, string>();
      const created: { task: Task; deps: string[] }[] = [];
      for (const pt of plan.tasks) {
        const files = dedupePaths(Array.isArray(pt.files) ? pt.files : [], core.platform);
        const base = String(pt.description ?? '').trim();
        const description = files.length ? `${base}${base ? '\n\n' : ''}Voraussichtlich betroffene Dateien: ${files.join(', ')}` : base;
        const t = s.tasks.create(
          {
            projectId: planTask.projectId,
            title: shorten(pt.title, 300) || 'Geplante Aufgabe',
            description,
            kind: pt.kind,
            role: pt.role,
            priority: pt.priority,
            dependsOn: [],
            acceptance: pt.acceptance,
            parentId: planTask.id,
            plannedFiles: files,
          },
          'planner',
        );
        if (!keyToId.has(pt.key)) keyToId.set(pt.key, t.id);
        created.push({ task: t, deps: Array.isArray(pt.dependsOn) ? pt.dependsOn : [] });
      }
      // Map plan keys to ids; drop unknown keys, self-references and edges that would close a cycle.
      const graph = new Map<string, string[]>();
      const reaches = (from: string, to: string): boolean => {
        const stack = [from];
        const seen = new Set<string>();
        while (stack.length) {
          const cur = stack.pop()!;
          if (cur === to) return true;
          if (seen.has(cur)) continue;
          seen.add(cur);
          stack.push(...(graph.get(cur) ?? []));
        }
        return false;
      };
      const result: Task[] = [];
      for (const { task, deps } of created) {
        const mapped: string[] = [];
        for (const key of deps) {
          const id = keyToId.get(key);
          if (!id || id === task.id || mapped.includes(id)) continue;
          if (reaches(id, task.id)) continue;
          mapped.push(id);
          graph.set(task.id, [...(graph.get(task.id) ?? []), id]);
        }
        result.push(mapped.length ? (patchTask(task.id, { dependsOn: mapped }) ?? task) : task);
      }
      return result;
    });
  }

  function createFixTask(input: { projectId: string; draft: FixTaskDraft; parentId: string | null; source: Task['source']; priority: number; startRequested: boolean }): Task {
    const t = s.tasks.create(
      {
        projectId: input.projectId,
        title: input.draft.title,
        description: input.draft.description,
        kind: 'fix',
        role: 'coder',
        priority: Math.max(0, Math.min(3, input.priority)),
        dependsOn: [],
        acceptance: input.draft.acceptance,
        parentId: input.parentId,
        plannedFiles: input.draft.plannedFiles,
      },
      input.source,
    );
    const out = input.startRequested ? (patchTask(t.id, { startRequested: true }) ?? t) : t;
    requestWake();
    return out;
  }

  // -------------------------------------------------------------------------------------------
  // Integration pass
  // -------------------------------------------------------------------------------------------

  function childrenOf(parentId: string): Task[] {
    return db.all<TaskRow>('SELECT * FROM tasks WHERE parent_id = ? ORDER BY created_at, rowid', [parentId]).map(rowToTask);
  }

  function allChildrenDone(parentId: string): { done: boolean; children: Task[] } {
    const children = childrenOf(parentId);
    const relevant = children.filter((c) => c.status !== 'cancelled');
    return { done: relevant.length > 0 && relevant.every((c) => c.status === 'done'), children: relevant };
  }

  function maybeIntegration(parentId: string): void {
    const parent = getTask(parentId);
    if (!parent || parent.role !== 'planner' || parent.status !== 'done') return;
    if (!allChildrenDone(parentId).done) return;
    if (store.globalState() !== 'running' || shuttingDown) return; // caught up by the periodic re-check
    startIntegration(parent);
  }

  /** An integration check blocked by the environment may be repeated: approval decided, tool installed, or 10 min later. */
  function environmentGone(problem: CheckEnvironmentProblem, ranAt: number, triggers: Set<string>): boolean {
    if (problem.kind === 'approval') return safe(() => s.approvals.get(problem.approvalId))?.status !== 'pending';
    if (problem.kind === 'tool_missing' && triggers.has('integrations')) return true;
    return now() - ranAt >= ENV_RECHECK_MS;
  }

  function integrationNeeded(parent: Task, triggers: Set<string>): boolean {
    const { done, children } = allChildrenDone(parent.id);
    if (!done) return false;
    const entries = parent.verification.checks.filter((c) => INTEGRATION_NAMES.includes(c.name));
    if (!entries.length) return true;
    if (entries.some((e) => e.status === 'running' || e.status === 'cancelled')) return true;
    const env = environmentProblem(entries);
    if (env && environmentGone(env.problem, env.ranAt, triggers)) return true;
    const lastChild = Math.max(0, ...children.map((c) => c.finishedAt ?? 0));
    const ranAt = Math.max(0, ...entries.map((e) => (e.checkRunId ? (safe(() => s.checks.get(e.checkRunId!))?.startedAt ?? 0) : 0)));
    return ranAt > 0 && lastChild > ranAt;
  }

  function startIntegration(parent: Task): void {
    if (integrationPasses.has(parent.id)) {
      integrationRerun.add(parent.id);
      return;
    }
    const controller = new AbortController();
    const entry = { controller, projectId: parent.projectId, done: Promise.resolve() };
    integrationPasses.set(parent.id, entry);
    entry.done = runIntegration(parent.id, controller.signal)
      .catch((e) => log.error('Integrationsprüfung fehlgeschlagen', { taskId: parent.id, error: errorMessage(e) }))
      .finally(() => {
        integrationPasses.delete(parent.id);
        if (integrationRerun.delete(parent.id) && !shuttingDown) maybeIntegration(parent.id);
        emitStatusIfChanged();
      });
  }

  function withIntegration(verification: Verification, entries: VerificationCheck[]): Verification {
    const checks = [...verification.checks.filter((c) => !INTEGRATION_NAMES.includes(c.name)), ...entries];
    const hasRunning = entries.some((e) => e.status === 'running');
    return { status: hasRunning ? verification.status : computeVerificationStatus(checks), checks };
  }

  async function runIntegration(parentId: string, signal: AbortSignal): Promise<void> {
    const parent = getTask(parentId);
    if (!parent) return;
    const project = safe(() => s.projects.get(parent.projectId));
    if (!project) return;
    log.info('Integrationsprüfung startet', { taskId: parent.id });
    patchTask(parent.id, { verification: withIntegration(parent.verification, [runningEntry(INTEGRATION_BUILD), runningEntry(INTEGRATION_TESTS)]) });
    const cmds = project.config.commands;
    const entries: VerificationCheck[] = [];
    const failedRuns: CheckRun[] = [];
    const markCancelled = () => {
      const cur = getTask(parent.id);
      if (!cur) return;
      const done = new Set(entries.map((e) => e.name));
      const rest = INTEGRATION_NAMES.filter((n) => !done.has(n)).map((n): VerificationCheck => ({ name: n, status: 'cancelled', details: 'Abgebrochen.', checkRunId: null, findings: [] }));
      patchTask(parent.id, { verification: withIntegration(cur.verification, [...entries, ...rest]) });
    };
    let buildFailed = false;
    if (cmds.build) {
      const r = await runCheck(null, signal, project.id, parent.id, 'build', INTEGRATION_BUILD);
      if (!r) return markCancelled();
      entries.push(r.entry);
      if (isFailedEntry(r.entry)) {
        buildFailed = true;
        if (r.run) failedRuns.push(r.run);
      }
    } else {
      entries.push(skippedEntry(INTEGRATION_BUILD, 'Kein Build-Befehl eingerichtet.'));
    }
    if (!cmds.test) {
      entries.push(skippedEntry(INTEGRATION_TESTS, 'Kein Testbefehl eingerichtet.'));
    } else if (buildFailed) {
      entries.push(skippedEntry(INTEGRATION_TESTS, 'Übersprungen, weil der Build fehlgeschlagen ist.'));
    } else {
      const r = await runCheck(null, signal, project.id, parent.id, 'test', INTEGRATION_TESTS);
      if (!r) return markCancelled();
      entries.push(r.entry);
      if (isFailedEntry(r.entry) && r.run) failedRuns.push(r.run);
    }
    const current = getTask(parent.id);
    if (!current) return;
    const env = environmentProblem(entries);
    const verification = withIntegration(current.verification, entries);
    patchTask(parent.id, { verification: env ? { ...verification, status: 'not_run' } : verification });
    if (env) return onIntegrationBlocked(current, project, env);
    const executed = entries.filter((e) => e.status !== 'skipped');
    if (executed.length) {
      addMemory({
        projectId: parent.projectId,
        kind: 'test_result',
        title: `Integrationsprüfung: ${parent.title}`,
        content: entries.map((e) => `${e.name}: ${e.details ?? e.status}`).join('\n'),
        taskId: parent.id,
      });
    }
    if (entries.some(isFailedEntry)) onIntegrationFailed(current, project, entries, failedRuns);
    else safe(() => core.errors.resolveWhere({ dedupeKey: `integration:${parent.id}` }), 'Fehler auflösen');
  }

  /** The integration checks could not run because of the environment: no fix task (no agent can fix that). */
  function onIntegrationBlocked(parent: Task, project: Project, env: { entry: VerificationCheck; problem: CheckEnvironmentProblem }): void {
    const advice = environmentAdvice(env.entry, env.problem, '– NOVA wiederholt die Integrationsprüfung danach automatisch innerhalb von 10 Minuten.');
    log.info('Integrationsprüfung konnte wegen der Umgebung nicht laufen', { taskId: parent.id, code: advice.code });
    safe(
      () =>
        core.errors.report({
          code: advice.code,
          severity: 'blocker',
          title: 'Integrationsprüfung konnte nicht laufen',
          whatHappened: `Nach Abschluss aller Teilaufgaben von „${parent.title}“ sollte die gemeinsame Prüfung laufen. ${advice.reason}`,
          projectId: parent.projectId,
          taskId: parent.id,
          attempted: ['Integrationsprüfung (Build und Tests) gestartet'],
          projectSafe: true,
          autoFixable: env.problem.kind === 'approval' || env.problem.kind === 'tool_missing',
          userAction: advice.userAction,
          details: env.entry.details,
          related: { checkRunId: env.entry.checkRunId, runId: null, approvalId: env.problem.kind === 'approval' ? env.problem.approvalId : null, file: null, line: null },
          dedupeKey: `integration:${parent.id}`,
        }),
      'Fehlerbericht',
    );
    // The approval request notifies by itself; repeated passes (every 10 min) must not toast again.
    if (env.problem.kind !== 'approval' && !recentNotification(parent.id, 'blocker', 6 * 60 * 60_000)) {
      notify({
        level: 'warning',
        category: 'blocker',
        title: 'Integrationsprüfung konnte nicht laufen',
        body: `Im Projekt „${project.name}“ konnte die gemeinsame Prüfung nicht laufen: ${advice.shortReason}`,
        projectId: parent.projectId,
        taskId: parent.id,
      });
    }
  }

  function onIntegrationFailed(parent: Task, project: Project, entries: VerificationCheck[], failedRuns: CheckRun[]): void {
    const runsMap = new Map(failedRuns.map((r) => [r.id, r]));
    const summary = failureSummary(entries);
    const history = readFailures(db, parent.id);
    history.push({ signature: failureSignature(entries, runsMap), attempt: history.length + 1, summary, ts: now() });
    writeFailures(db, parent.id, history);
    const identical = trailingIdentical(history);
    const fixCount = childrenOf(parent.id).filter((c) => c.source === 'system' && c.kind === 'fix').length;
    const limitReached = identical > settings().agents.maxIdenticalFailures || fixCount >= parent.maxAttempts;
    let fix: Task | null = null;
    if (!limitReached) {
      try {
        const draft = failedRuns[0] ? fixFromCheck(failedRuns[0]) : fixFromNote(`Integrationsprüfung fehlgeschlagen: ${summary}`);
        fix = createFixTask({ projectId: parent.projectId, draft, parentId: parent.id, source: 'system', priority: 2, startRequested: false });
      } catch (e) {
        log.warn('Reparatur-Aufgabe für die Integrationsprüfung konnte nicht angelegt werden', { taskId: parent.id, error: errorMessage(e) });
      }
    }
    const latest = limitReached ? safe(() => s.checkpoints.latestVerified(parent.projectId)) : null;
    const buildFailed = entries.some((e) => e.name === INTEGRATION_BUILD && isFailedEntry(e));
    safe(() =>
      core.errors.report({
        code: limitReached ? 'REPEATED_FAILURE' : buildFailed ? 'BUILD_FAILED' : 'TESTS_FAILED',
        severity: limitReached ? 'blocker' : 'retryable',
        title: 'Integrationsprüfung fehlgeschlagen',
        whatHappened: `Nach Abschluss aller Teilaufgaben von „${parent.title}“ ist die gemeinsame Prüfung fehlgeschlagen: ${summary}`,
        projectId: parent.projectId,
        taskId: parent.id,
        attempted: [`Integrationsprüfung (Build und Tests) ausgeführt`, ...(fixCount ? [`${fixCount} Reparatur-Aufgabe(n) bereits angelegt`] : [])],
        projectSafe: true,
        autoFixable: !!fix,
        userAction: fix
          ? 'NOVA hat eine Reparatur-Aufgabe angelegt und bearbeitet sie automatisch.'
          : `NOVA legt keine weitere Reparatur-Aufgabe an, weil der Fehler wiederholt auftritt. Bitte die Ausgabe prüfen und gezielt eine Aufgabe anlegen.${
              latest ? ` Der letzte geprüfte Stand ist der Wiederherstellungspunkt „${latest.label}“ vom ${formatDateTime(latest.createdAt)}.` : ''
            }`,
        details: summary,
        related: { checkRunId: failedRuns[0]?.id ?? null, runId: null, approvalId: null, file: failedRuns[0]?.failures[0]?.file ?? null, line: failedRuns[0]?.failures[0]?.line ?? null },
        dedupeKey: `integration:${parent.id}`,
      }),
    );
    notify({
      level: 'error',
      category: 'error',
      title: 'Integrationsprüfung fehlgeschlagen',
      body: fix
        ? `Im Projekt „${project.name}“ ist nach Abschluss aller Teilaufgaben eine Prüfung fehlgeschlagen. NOVA hat eine Reparatur-Aufgabe angelegt.`
        : `Im Projekt „${project.name}“ ist nach Abschluss aller Teilaufgaben eine Prüfung wiederholt fehlgeschlagen. Bitte prüfen.`,
      projectId: parent.projectId,
      taskId: parent.id,
    });
  }

  // -------------------------------------------------------------------------------------------
  // Scheduling
  // -------------------------------------------------------------------------------------------

  function governorAllowed(): { allowed: number; configured: number; reason: string | null } {
    try {
      const g = s.governor.allowed(runs.size);
      return { allowed: Math.max(0, Math.trunc(g.allowed)), configured: Math.max(0, Math.trunc(g.configured)), reason: g.reason };
    } catch (e) {
      const n = settings().agents.maxParallelAgents;
      log.debug('Governor nicht verfügbar – Einstellung wird verwendet', { error: errorMessage(e) });
      return { allowed: n, configured: n, reason: null };
    }
  }

  function blockFailedDependencies(): void {
    const queued = db.all<TaskRow>("SELECT * FROM tasks WHERE status = 'queued' AND depends_on != '[]'").map(rowToTask);
    if (!queued.length) return;
    const st = taskStatuses(queued.flatMap((t) => t.dependsOn));
    for (const t of queued) {
      if (runs.has(t.id)) continue;
      const bad = t.dependsOn.map((d) => st.get(d)).find((d) => d && (d.status === 'failed' || d.status === 'cancelled'));
      if (!bad) continue;
      blockTask(
        t,
        'DEPENDENCY_FAILED',
        `Die Vorgängeraufgabe „${bad.title}“ ist ${bad.status === 'failed' ? 'fehlgeschlagen' : 'abgebrochen'}. Diese Aufgabe startet, sobald sie erfolgreich erledigt ist.`,
        null,
        null,
      );
    }
  }

  /**
   * Two runs of one project may overlap only when both tasks declare plannedFiles and those (plus already changed
   * files) are disjoint. Without plannedFiles a task may touch any file and its checks would see the other run's
   * half-finished changes. Planner runs only read and never conflict.
   */
  function overlapsActive(task: Task): boolean {
    if (task.role === 'planner') return false;
    const keys = taskKeys(task);
    for (const ctx of runs.values()) {
      if (ctx.projectId !== task.projectId || ctx.taskId === task.id) continue;
      const other = getTask(ctx.taskId);
      if (!other || other.role === 'planner') continue;
      if (!task.plannedFiles.length || !other.plannedFiles.length) return true;
      const otherKeys = taskKeys(other);
      if (otherKeys.some((a) => keys.some((b) => keysOverlap(a, b)))) return true;
    }
    return false;
  }

  function scheduleOnce(): void {
    if (shuttingDown) return;
    blockFailedDependencies();
    if (store.globalState() !== 'running') return;
    const ready = s.tasks.ready();
    if (!ready.length) return;
    let free = governorAllowed().allowed - runs.size;
    if (free <= 0) return;
    const projects = new Map<string, Project | null>();
    for (const task of ready) {
      if (free <= 0) break;
      if (runs.has(task.id)) continue;
      let project = projects.get(task.projectId);
      if (project === undefined) {
        project = safe(() => s.projects.get(task.projectId), 'Projekt laden') ?? null;
        projects.set(task.projectId, project);
      }
      if (!project || project.status !== 'active') continue;
      if (project.workState !== 'running' && !task.startRequested) continue;
      if (overlapsActive(task)) continue;
      launch(task, project);
      free--;
    }
  }

  function tickPass(): void {
    if (shuttingDown) return;
    try {
      ensureSubscriptions();
      scheduleOnce();
    } catch (e) {
      log.error('Planungsdurchlauf fehlgeschlagen', { error: errorMessage(e) });
    }
    emitStatusIfChanged();
  }

  // -------------------------------------------------------------------------------------------
  // Re-check: approvals, auto-unblock, integration catch-up
  // -------------------------------------------------------------------------------------------

  function mentionedIntegrations(text: string | null): string[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    const aliases: Record<string, string[]> = { node: ['node', 'node.js', 'nodejs'], windows_terminal: ['windows terminal', 'wt.exe'], vscode: ['vs code', 'visual studio code', 'vscode'] };
    const found: string[] = [];
    for (const id of BUILTIN_INTEGRATIONS) {
      const names = aliases[id] ?? [id];
      if (names.some((n) => new RegExp(`(^|[^a-z0-9_])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9_])`).test(lower))) found.push(id);
    }
    return found;
  }

  async function conditionGone(task: Task, triggers: Set<string>): Promise<boolean> {
    const code = task.blockerCode ?? '';
    switch (code) {
      case 'NEEDS_INPUT':
        return (safe(() => s.tasks.pendingNotes(task.id)) ?? []).length > 0;
      case 'DEPENDENCY_FAILED':
        return depsAllDone(task);
      case 'RESOURCE_LIMIT':
        return governorAllowed().allowed > runs.size;
      case 'DISK_FULL': {
        const project = safe(() => s.projects.get(task.projectId));
        const okProject = project ? (safe(() => s.governor.canWrite(project.path))?.ok ?? false) : false;
        const okData = safe(() => s.governor.canWrite(core.paths.root))?.ok ?? false;
        return okProject && okData;
      }
      case 'TOOL_MISSING': {
        const ids = mentionedIntegrations(task.blocker);
        if (ids.length) {
          for (const id of ids) {
            const st = await safeAsync(() => s.integrations.get(id));
            if (!st?.available) return false;
          }
          return true;
        }
        return triggers.has('integrations');
      }
      default: {
        if (!MODEL_CODES.includes(code)) return false;
        const role = store.continuation(task.id)?.role ?? task.role;
        try {
          await s.models.resolve(role, { projectId: task.projectId });
          return true;
        } catch (e) {
          if (isNovaError(e) && isResumable(String(e.code)) && String(e.code) !== code) {
            patchTask(task.id, { blocker: e.message, blockerCode: String(e.code) });
          }
          return false;
        }
      }
    }
  }

  async function recheck(triggers: Set<string>): Promise<void> {
    if (shuttingDown) return;
    // 1. Waiting approvals that were decided or expired while nobody listened.
    for (const t of s.tasks.list({ status: ['waiting_approval'], limit: 100000 })) {
      if (runs.has(t.id)) continue;
      try {
        const cont = store.continuation(t.id);
        const run = cont?.runId ? s.runs.get(cont.runId) : s.runs.latestForTask(t.id);
        const approvalId = cont?.approvalId ?? run?.pendingApprovalId ?? null;
        if (!approvalId) {
          log.debug('Wartende Aufgabe ohne bekannte Freigabe', { taskId: t.id });
          continue;
        }
        const approval = s.approvals.get(approvalId);
        if (!approval || approval.status !== 'pending') requeueForResume(t, run && run.status !== 'done' ? run : null);
      } catch (e) {
        log.debug('Freigabestatus konnte nicht geprüft werden', { taskId: t.id, error: errorMessage(e) });
      }
    }
    // 2. Blocked tasks with resumable codes.
    for (const t of s.tasks.list({ status: ['blocked'], limit: 100000 })) {
      if (shuttingDown) return;
      if (runs.has(t.id) || !isResumable(t.blockerCode)) continue;
      const fresh = getTask(t.id);
      if (!fresh || fresh.status !== 'blocked' || !isResumable(fresh.blockerCode)) continue;
      if (await conditionGone(fresh, triggers)) {
        const again = getTask(t.id);
        if (again && again.status === 'blocked' && again.blockerCode === fresh.blockerCode) unblock(again, [...triggers].join(',') || 'timer');
      }
    }
    // 3. Integration passes that were missed (shutdown, paused work).
    if (store.globalState() === 'running') {
      const parents = db.all<{ parent_id: string }>("SELECT DISTINCT parent_id FROM tasks WHERE parent_id IS NOT NULL");
      for (const { parent_id } of parents) {
        if (integrationPasses.has(parent_id)) continue;
        const p = getTask(parent_id);
        if (!p || p.role !== 'planner' || p.status !== 'done') continue;
        const project = safe(() => s.projects.get(p.projectId));
        if (!project || project.status !== 'active' || project.workState !== 'running') continue;
        if (integrationNeeded(p, triggers)) startIntegration(p);
      }
    }
    requestWake();
    emitStatusIfChanged();
  }

  // -------------------------------------------------------------------------------------------
  // Status
  // -------------------------------------------------------------------------------------------

  function projectList(): ProjectSummary[] {
    if (projectCache && now() - projectCache.at < 3000) return projectCache.list;
    const list = safe(() => s.projects.list(), 'Projektliste') ?? projectCache?.list ?? [];
    projectCache = { at: now(), list };
    return list;
  }

  interface Counts {
    queued: number;
    running: number;
    waiting: number;
    paused: number;
    interrupted: number;
    blocked: number;
    blockedByCode: Record<string, number>;
  }

  function emptyCounts(): Counts {
    return { queued: 0, running: 0, waiting: 0, paused: 0, interrupted: 0, blocked: 0, blockedByCode: {} };
  }

  function openCountsByProject(): Map<string, Counts> {
    const rows = db.all<{ project_id: string; status: string; blocker_code: string | null; n: number }>(
      `SELECT project_id, status, blocker_code, COUNT(*) AS n FROM tasks WHERE status IN (${OPEN_STATUSES.map(() => '?').join(',')}) GROUP BY project_id, status, blocker_code`,
      OPEN_STATUSES,
    );
    const out = new Map<string, Counts>();
    for (const r of rows) {
      const c = out.get(r.project_id) ?? emptyCounts();
      const n = Number(r.n);
      switch (r.status) {
        case 'queued':
          c.queued += n;
          break;
        case 'running':
          c.running += n;
          break;
        case 'waiting_approval':
          c.waiting += n;
          break;
        case 'paused':
          c.paused += n;
          break;
        case 'interrupted':
          c.interrupted += n;
          break;
        case 'blocked':
          c.blocked += n;
          c.blockedByCode[r.blocker_code ?? 'UNKNOWN'] = (c.blockedByCode[r.blocker_code ?? 'UNKNOWN'] ?? 0) + n;
          break;
      }
      out.set(r.project_id, c);
    }
    return out;
  }

  function computeStatus(): WorkStatus {
    const globalState = store.globalState();
    const gov = governorAllowed();
    const projects = projectList().filter((p) => p.status === 'active');
    const counts = openCountsByProject();
    const ready = safe(() => s.tasks.ready(), 'Bereite Aufgaben') ?? [];
    const readyByProject = new Map<string, Task[]>();
    for (const t of ready) readyByProject.set(t.projectId, [...(readyByProject.get(t.projectId) ?? []), t]);
    const activeByProject = new Map<string, number>();
    for (const ctx of runs.values()) activeByProject.set(ctx.projectId, (activeByProject.get(ctx.projectId) ?? 0) + 1);
    const noFreeSlot = gov.allowed - runs.size <= 0;

    const aggregate: IdleInput = {
      globalState,
      projectState: null,
      activeRuns: runs.size,
      open: 0,
      eligibleReady: 0,
      ineligibleReady: 0,
      notReadyQueued: 0,
      waiting: 0,
      blockedByCode: {},
      paused: 0,
      interrupted: 0,
      noFreeSlot,
      resourceReason: gov.reason,
    };

    const projectStatuses: WorkStatus['projects'] = projects.map((p) => {
      const c = counts.get(p.id) ?? emptyCounts();
      const r = readyByProject.get(p.id) ?? [];
      const eligible = r.filter((t) => p.workState === 'running' || t.startRequested).length;
      const active = activeByProject.get(p.id) ?? 0;
      const open = c.queued + c.running + c.waiting + c.paused + c.interrupted + c.blocked;
      const input: IdleInput = {
        globalState,
        projectState: p.workState,
        activeRuns: active,
        open,
        eligibleReady: eligible,
        ineligibleReady: r.length - eligible,
        notReadyQueued: Math.max(0, c.queued - r.length),
        waiting: c.waiting,
        blockedByCode: c.blockedByCode,
        paused: c.paused,
        interrupted: c.interrupted,
        noFreeSlot,
        resourceReason: gov.reason,
      };
      aggregate.open += open;
      aggregate.eligibleReady += eligible;
      aggregate.ineligibleReady += r.length - eligible;
      aggregate.notReadyQueued += input.notReadyQueued;
      aggregate.waiting += c.waiting;
      aggregate.paused += c.paused;
      aggregate.interrupted += c.interrupted;
      for (const [code, n] of Object.entries(c.blockedByCode)) aggregate.blockedByCode[code] = (aggregate.blockedByCode[code] ?? 0) + n;
      let suggestion: string | null = null;
      if (active === 0) {
        const next = safe(() => s.memory.latestNextStep(p.id), 'Nächster Schritt');
        if (next) suggestion = shorten(`Nächster Schritt: ${next.title}`, 300);
        else if (open === 0) suggestion = 'Neues Ziel planen';
      }
      return {
        projectId: p.id,
        state: p.workState,
        activeRuns: active,
        queuedTasks: c.queued,
        waitingApproval: c.waiting,
        blocked: c.blocked,
        paused: c.paused,
        idleReason: idleReason(input),
        suggestion,
      };
    });

    const queuedTotal = Number(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'queued'")?.n ?? 0);
    return {
      state: globalState,
      allowedConcurrency: gov.allowed,
      configuredConcurrency: gov.configured,
      activeRuns: runs.size,
      queuedTasks: queuedTotal,
      idleReason: idleReason(aggregate),
      projects: projectStatuses,
    };
  }

  function emitStatusIfChanged(): void {
    let st: WorkStatus;
    try {
      st = computeStatus();
    } catch (e) {
      log.warn('Arbeitsstatus konnte nicht berechnet werden', { error: errorMessage(e) });
      return;
    }
    const json = JSON.stringify(st);
    if (json === lastStatusJson) return;
    lastStatusJson = json;
    core.bus.emit('work.status', st);
  }

  // -------------------------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------------------------

  function ensureSubscriptions(): void {
    if (decisionSubscribed) return;
    decisionSubscribed = true;
    try {
      s.approvals.onDecision((approval) => onApprovalDecided(approval));
    } catch (e) {
      log.warn('Freigabe-Entscheidungen können nicht abonniert werden', { error: errorMessage(e) });
    }
  }

  function onApprovalDecided(approval: Approval): void {
    if (shuttingDown) return;
    const handled = new Set<string>();
    let waiting: AgentRun[] = [];
    try {
      waiting = s.runs.list({ status: ['waiting_approval'], pendingApprovalId: approval.id, limit: 1000 });
    } catch (e) {
      log.warn('Wartende Läufe konnten nicht gelesen werden', { error: errorMessage(e) });
    }
    for (const run of waiting) {
      if (run.pendingApprovalId !== approval.id) continue;
      const task = getTask(run.taskId);
      if (task && task.status === 'waiting_approval' && !runs.has(task.id)) {
        log.info('Freigabe entschieden – Aufgabe wird fortgesetzt', { taskId: task.id, approvalId: approval.id, status: approval.status });
        requeueForResume(task, run);
        handled.add(task.id);
      }
    }
    for (const t of safe(() => s.tasks.list({ status: ['waiting_approval'], limit: 100000 })) ?? []) {
      if (handled.has(t.id) || runs.has(t.id)) continue;
      if (store.continuation(t.id)?.approvalId === approval.id) requeueForResume(t);
    }
    emitStatusIfChanged();
  }

  function onRunUpdated(run: AgentRun): void {
    if (shuttingDown) return;
    const ctx = runs.get(run.taskId);
    if (!ctx) return;
    if (run.status === 'running' && ctx.runId !== run.id) {
      ctx.runId = run.id;
      if (ctx.phase === 'review' && run.role === 'reviewer') {
        const c = store.continuation(run.taskId);
        if (c?.phase === 'review' && c.runId !== run.id) store.setContinuation(run.taskId, { ...c, runId: run.id });
      }
    }
    if (run.providerId && run.modelId) {
      const model = `${run.providerId}/${run.modelId}`;
      const t = getTask(run.taskId);
      if (t && t.model !== model) patchTask(run.taskId, { model });
    }
  }

  function onNote(note: TaskNote): void {
    if (shuttingDown || note.author !== 'user') return;
    const t = getTask(note.taskId);
    if (t && t.status === 'blocked' && t.blockerCode === 'NEEDS_INPUT' && !runs.has(t.id)) unblock(t, 'Antwort des Benutzers');
  }

  core.bus.on('run.updated', (run) => safe(() => onRunUpdated(run), 'Laufaktualisierung'));
  core.bus.on('task.updated', (t) => {
    if (t.status === 'waiting_approval' && !runs.has(t.id)) requestRecheck('approval');
    else if (t.status === 'queued') requestWake();
  });
  core.bus.on('task.removed', ({ id }) => {
    safe(() => store.forgetTask(id));
    requestWake();
  });
  core.bus.on('task.note', (n) => safe(() => onNote(n), 'Notiz'));
  core.bus.on('approval.updated', () => {
    requestRecheck('approval');
    requestWake();
  });
  core.bus.on('provider.updated', () => requestRecheck('models'));
  core.bus.on('provider.removed', () => requestRecheck('models'));
  core.bus.on('ollama.models.changed', () => requestRecheck('models'));
  core.bus.on('budget.updated', (b) => {
    if (!b.paidPaused) requestRecheck('budget');
  });
  core.bus.on('integrations.updated', () => requestRecheck('integrations'));
  core.bus.on('project.updated', () => {
    projectCache = null;
    requestWake();
  });
  core.bus.on('project.removed', () => {
    projectCache = null;
    for (const id of safe(() => store.referencedTaskIds()) ?? []) if (!getTask(id)) safe(() => store.forgetTask(id));
    requestWake();
  });
  core.bus.on('resources.snapshot', () => requestWake());
  core.settings.onChange((_settings, changed) => {
    if (changed.some((c) => c === 'models' || c === 'budgets' || c === 'resources')) requestRecheck('settings');
    requestWake();
  });

  // -------------------------------------------------------------------------------------------
  // Recovery and shutdown helpers
  // -------------------------------------------------------------------------------------------

  function inFlightRisky(task: Task, run: AgentRun): boolean {
    const state = safe(() => s.runs.loadState<{ inFlight?: { name?: string; args?: Record<string, unknown>; readOnly?: boolean } | null }>(run.id));
    const f = state?.inFlight;
    if (!f || f.readOnly !== false) return false;
    if (f.name === 'delete_file') return true;
    if (f.name !== 'run_command') return false;
    try {
      const project = s.projects.require(task.projectId);
      const decision = s.policy.evaluate({ projectId: project.id, projectRoot: project.path, command: String(f.args?.command ?? ''), config: project.config, taskId: task.id });
      if (decision.action === 'block') return true;
      return decision.action === 'approve' && RISKY_RESTART_KINDS.includes(decision.kind);
    } catch (e) {
      log.warn('Unterbrochener Befehl konnte nicht eingeordnet werden – Aufgabe wird zur Prüfung pausiert', { taskId: task.id, error: errorMessage(e) });
      return true;
    }
  }

  /**
   * After a database restore every saved conversation/verification is from the backup time, while the project files
   * are newer (and NOVA's later changes are no longer journaled). Nothing continues automatically: affected tasks are
   * paused for review and start fresh when the user resumes them.
   */
  function recoverAfterRestore(restoredFrom: string): { tasks: number } {
    let count = 0;
    const open = s.tasks.list({ status: ['running', 'interrupted', 'waiting_approval', 'queued', 'paused', 'blocked'], limit: 100000 });
    for (const t of open) {
      const inFlight = t.status === 'running' || t.status === 'interrupted' || t.status === 'waiting_approval';
      if (!inFlight && !store.continuation(t.id)) continue;
      count++;
      store.forgetTask(t.id);
      const run = safe(() => s.runs.latestForTask(t.id));
      if (run && ['running', 'paused', 'waiting_approval', 'interrupted', 'blocked'].includes(run.status)) {
        safe(() => s.runs.update(run.id, { status: 'cancelled', endedAt: now(), pendingApprovalId: null }), 'Lauf verwerfen');
      }
      expireApprovals(t.id);
      releaseLocks(t.id);
      patchTask(t.id, { status: 'paused', blocker: RESTORED_BLOCKER, blockerCode: 'INTERRUPTED', startRequested: false });
    }
    const name = restoredFrom.split(/[\\/]/).pop() || restoredFrom;
    log.warn('Datenbank wiederhergestellt – Aufgaben werden nicht automatisch fortgesetzt', { tasks: count });
    safe(
      () =>
        core.errors.report({
          code: 'INTERRUPTED',
          severity: 'warning',
          title: 'Datenbank wiederhergestellt',
          whatHappened: `NOVA hat die Datenbank aus der Sicherung „${name}“ wiederhergestellt.${
            count ? ` ${count === 1 ? '1 Aufgabe, die damals in Arbeit war, wurde' : `${count} Aufgaben, die damals in Arbeit waren, wurden`} angehalten und nicht automatisch fortgesetzt, weil sich die Projektdateien seitdem verändert haben können.` : ''
          } Änderungen, die NOVA nach dem Zeitpunkt der Sicherung an Projektdateien vorgenommen hat, stehen nicht mehr im Änderungsprotokoll und lassen sich nicht über NOVA rückgängig machen.`,
          projectId: null,
          taskId: null,
          attempted: ['Datenbank aus der Sicherung übernommen', 'Unterbrochene Aufgaben angehalten statt fortgesetzt'],
          projectSafe: true,
          autoFixable: false,
          userAction: 'Bitte die angehaltenen Aufgaben prüfen und mit „Fortsetzen“ neu starten. Den aktuellen Stand der Projektdateien bei Bedarf im Studio oder mit Git prüfen.',
          details: null,
          dedupeKey: 'database-restore',
        }),
      'Fehlerbericht',
    );
    return { tasks: count };
  }

  // -------------------------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------------------------

  function setProjectState(projectId: string, state: Project['workState']): void {
    s.projects.require(projectId);
    s.projects.setWorkState(projectId, state);
    projectCache = null;
  }

  function clearStartRequestedQueued(projectId: string): void {
    for (const t of s.tasks.list({ projectId, status: ['queued'], limit: 100000 })) {
      if (t.startRequested && !runs.has(t.id)) patchTask(t.id, { startRequested: false });
    }
  }

  function stopRun(ctx: RunCtx, mode: 'cancel' | 'requeue'): void {
    ctx.stopMode = mode;
    if (!ctx.controller.signal.aborted) {
      ctx.controller.abort(new NovaError('CANCELLED', mode === 'requeue' ? 'Die Arbeit wurde gestoppt.' : 'Die Aufgabe wurde vom Benutzer gestoppt.', { severity: 'warning' }));
    }
    void killProcesses(ctx.taskId);
  }

  function resumeScope(scope: string): void {
    for (const ctx of runs.values()) {
      if (scope === 'global' || ctx.projectId === scope) ctx.pauseScopes.delete(scope);
    }
    for (const id of store.takePaused(scope)) {
      const t = getTask(id);
      if (t && t.status === 'paused') requeueForResume(t);
    }
  }

  const work: WorkCycle & { recover(opts?: RecoverOptions): Promise<{ tasks: number }> } = {
    start(projectId) {
      if (projectId) setProjectState(projectId, 'running');
      else store.setGlobalState('running');
      resumeScope(projectId ?? 'global');
      requestWake();
      emitStatusIfChanged();
      return computeStatus();
    },

    pause(projectId) {
      if (projectId) {
        setProjectState(projectId, 'paused');
        for (const ctx of runs.values()) if (ctx.projectId === projectId) ctx.pauseScopes.add(projectId);
        clearStartRequestedQueued(projectId);
      } else {
        store.setGlobalState('paused');
        for (const ctx of runs.values()) ctx.pauseScopes.add('global');
      }
      emitStatusIfChanged();
      return computeStatus();
    },

    resume(projectId) {
      return work.start(projectId);
    },

    stop(projectId) {
      if (projectId) {
        setProjectState(projectId, 'stopped');
        for (const ctx of runs.values()) if (ctx.projectId === projectId) stopRun(ctx, 'requeue');
        for (const ip of integrationPasses.values()) if (ip.projectId === projectId) ip.controller.abort(new NovaError('CANCELLED', 'Die Arbeit wurde gestoppt.'));
        clearStartRequestedQueued(projectId);
      } else {
        store.setGlobalState('stopped');
        for (const ctx of runs.values()) stopRun(ctx, 'requeue');
        for (const ip of integrationPasses.values()) ip.controller.abort(new NovaError('CANCELLED', 'Die Arbeit wurde gestoppt.'));
      }
      emitStatusIfChanged();
      return computeStatus();
    },

    status() {
      return computeStatus();
    },

    activeRunCount() {
      return runs.size;
    },

    startTask(id) {
      const t = s.tasks.require(id);
      let out: Task | null = t;
      switch (t.status) {
        case 'running':
        case 'queued':
        case 'waiting_approval':
          out = t.startRequested ? t : patchTask(id, { startRequested: true });
          break;
        case 'paused':
          return work.resumeTask(id);
        case 'blocked':
        case 'interrupted':
          // A non-auto-resumable blocker continues only a deliberately kept (userResume) continuation.
          if (t.status === 'blocked' && !isResumable(t.blockerCode) && !store.continuation(id)?.userResume) store.clearContinuation(id);
          store.forgetPaused(id);
          out = patchTask(id, { status: 'queued', startRequested: true, blocker: null, blockerCode: null, finishedAt: null });
          safe(() => core.errors.resolveWhere({ taskId: id }));
          break;
        case 'failed':
        case 'cancelled':
          store.forgetTask(id);
          discardRun(id);
          out = patchTask(id, { status: 'queued', startRequested: true, blocker: null, blockerCode: null, finishedAt: null });
          safe(() => core.errors.resolveWhere({ taskId: id }));
          break;
        case 'done':
          throw conflict('Die Aufgabe ist bereits erledigt. Zum erneuten Ausführen bitte „Wiederholen“ verwenden.');
      }
      requestWake();
      emitStatusIfChanged();
      return out ?? s.tasks.require(id);
    },

    pauseTask(id) {
      const t = s.tasks.require(id);
      const ctx = runs.get(id);
      if (ctx) {
        ctx.userPause = true;
        store.forgetPaused(id);
        return t;
      }
      switch (t.status) {
        case 'paused':
          return t;
        case 'done':
        case 'failed':
        case 'cancelled':
          throw conflict('Die Aufgabe ist bereits beendet und kann nicht pausiert werden.');
        default: {
          const out = patchTask(id, { status: 'paused', blocker: null, blockerCode: null }) ?? t;
          emitStatusIfChanged();
          return out;
        }
      }
    },

    resumeTask(id) {
      const t = s.tasks.require(id);
      store.forgetPaused(id);
      const ctx = runs.get(id);
      if (ctx) {
        ctx.userPause = false;
        ctx.pauseScopes.delete(ctx.projectId);
        return t.startRequested ? t : (patchTask(id, { startRequested: true }) ?? t);
      }
      if (t.status === 'paused') {
        const out = patchTask(id, { status: 'queued', startRequested: true, blocker: null, blockerCode: null }) ?? t;
        requestWake();
        emitStatusIfChanged();
        return out;
      }
      return work.startTask(id);
    },

    async stopTask(id) {
      const t = s.tasks.require(id);
      expireApprovals(id);
      store.forgetPaused(id);
      const integration = integrationPasses.get(id);
      if (integration && !integration.controller.signal.aborted) {
        integration.controller.abort(new NovaError('CANCELLED', 'Die Integrationsprüfung wurde vom Benutzer gestoppt.', { severity: 'warning' }));
        await settleWithin(integration.done, opts.stopWaitMs);
      }
      const ctx = runs.get(id);
      if (ctx) {
        stopRun(ctx, 'cancel');
        await killProcesses(id);
        const settled = await settleWithin(ctx.done, opts.stopWaitMs);
        if (!settled && !ctx.finalized) {
          ctx.finalized = true;
          if (runs.get(id) === ctx) runs.delete(id);
          log.warn('Lauf reagiert nicht auf Stopp – Aufgabe wird trotzdem als gestoppt markiert', { taskId: id });
          const cur = getTask(id);
          if (cur && !TERMINAL_STATUSES.includes(cur.status)) cancelTask(cur, 'Vom Benutzer gestoppt.');
          emitStatusIfChanged();
        }
        return s.tasks.require(id);
      }
      if (TERMINAL_STATUSES.includes(t.status)) return t;
      await killProcesses(id);
      discardRun(id);
      cancelTask(t, 'Vom Benutzer gestoppt.');
      emitStatusIfChanged();
      return s.tasks.require(id);
    },

    retryTask(id) {
      const t = s.tasks.require(id);
      if (t.status === 'running' || runs.has(id)) throw conflict('Die Aufgabe läuft gerade. Bitte zuerst stoppen oder pausieren.');
      expireApprovals(id);
      discardRun(id);
      store.forgetTask(id);
      writeFailures(db, id, []);
      releaseLocks(id);
      const out = patchTask(id, {
        status: 'queued',
        attempts: 0,
        verification: emptyVerification(),
        blocker: null,
        blockerCode: null,
        result: null,
        startedAt: null,
        finishedAt: null,
        startRequested: true,
      });
      safe(() => core.errors.resolveWhere({ taskId: id }));
      requestWake();
      emitStatusIfChanged();
      return out ?? s.tasks.require(id);
    },

    addNote(taskId, text) {
      const task = s.tasks.require(taskId);
      const notes = s.tasks.notes(taskId);
      const lastQuestion = [...notes].reverse().find((n) => n.author === 'agent' && n.kind === 'question');
      const answered = lastQuestion ? notes.some((n) => n.author === 'user' && n.createdAt >= lastQuestion.createdAt && notes.indexOf(n) > notes.indexOf(lastQuestion)) : true;
      const kind: TaskNote['kind'] = task.blockerCode === 'NEEDS_INPUT' || (lastQuestion && !answered) ? 'answer' : 'note';
      const note = s.tasks.addNote({ taskId, author: 'user', kind, text });
      const fresh = getTask(taskId);
      if (fresh && fresh.status === 'blocked' && fresh.blockerCode === 'NEEDS_INPUT' && !runs.has(taskId)) unblock(fresh, 'Antwort des Benutzers');
      emitStatusIfChanged();
      return note;
    },

    createFix(input) {
      const project = s.projects.require(input.projectId);
      let draft: FixTaskDraft;
      let parentId: string | null = null;
      const parentFor = (taskId: string | null | undefined): string | null => {
        if (!taskId) return null;
        const t = getTask(taskId);
        if (!t || t.projectId !== project.id) return null;
        return t.kind === 'plan' ? t.id : t.parentId;
      };
      if (input.checkRunId) {
        const run = s.checks.get(input.checkRunId);
        if (!run) throw notFound('Prüfung', input.checkRunId);
        if (run.projectId !== project.id) throw validation('Die Prüfung gehört zu einem anderen Projekt.');
        draft = fixFromCheck(run, input.note);
        parentId = parentFor(run.taskId);
      } else if (input.errorId) {
        const err = core.errors.get(input.errorId);
        if (!err) throw notFound('Fehler', input.errorId);
        if (err.projectId && err.projectId !== project.id) throw validation('Der Fehler gehört zu einem anderen Projekt.');
        const run = err.related?.checkRunId ? safe(() => s.checks.get(err.related!.checkRunId!)) : null;
        draft = fixFromError(err, run, input.note);
        parentId = parentFor(err.taskId);
      } else if (input.note && input.note.trim()) {
        draft = fixFromNote(input.note);
      } else {
        throw validation('Bitte eine fehlgeschlagene Prüfung, einen Fehler oder eine Beschreibung angeben.');
      }
      const task = createFixTask({ projectId: project.id, draft, parentId, source: 'user', priority: 2, startRequested: true });
      emitStatusIfChanged();
      return task;
    },

    planGoal(projectId, goal) {
      const project = s.projects.require(projectId);
      const text = String(goal ?? '').trim();
      if (!text) throw validation('Bitte ein Ziel beschreiben.');
      const firstLine = text.split(/\r?\n/).find((l) => l.trim()) ?? text;
      const task = s.tasks.create(
        {
          projectId: project.id,
          title: shorten(`Ziel planen: ${firstLine}`, 300),
          description: text.slice(0, 50000),
          kind: 'plan',
          role: 'planner',
          priority: 2,
          dependsOn: [],
          acceptance: 'Ein Plan mit kleinen, prüfbaren Aufgaben, Abhängigkeiten und Abnahmekriterien liegt vor.',
          parentId: null,
          plannedFiles: [],
        },
        'user',
      );
      const out = patchTask(task.id, { startRequested: true }) ?? task;
      requestWake();
      emitStatusIfChanged();
      return out;
    },

    async recover(opts: RecoverOptions = {}) {
      ensureSubscriptions();
      let interrupted: AgentRun[] = [];
      try {
        interrupted = s.runs.markInterrupted();
      } catch (e) {
        log.warn('Unterbrochene Läufe konnten nicht markiert werden', { error: errorMessage(e) });
      }
      if (opts.restoredFrom) {
        const res = recoverAfterRestore(opts.restoredFrom);
        requestRecheck('recover');
        emitStatusIfChanged();
        return res;
      }
      const runByTask = new Map<string, AgentRun>();
      for (const r of interrupted) {
        const prev = runByTask.get(r.taskId);
        if (!prev || r.startedAt >= prev.startedAt) runByTask.set(r.taskId, r);
      }
      const running = s.tasks.list({ status: ['running'], limit: 100000 });
      for (const t of running) patchTask(t.id, { status: 'interrupted' });
      const resumeAfterRestart = settings().background.resumeAfterRestart;
      const candidates = s.tasks.list({ status: ['interrupted'], limit: 100000 });
      let count = 0;
      for (const t of candidates) {
        count++;
        const run = runByTask.get(t.id) ?? safe(() => s.runs.latestForTask(t.id));
        let cont = store.continuation(t.id);
        if (!cont && run && ['interrupted', 'paused', 'waiting_approval', 'blocked'].includes(run.status)) {
          cont = { phase: phaseFor(t, run), runId: run.id, role: run.role };
          setContinuation(t.id, cont);
        }
        if (run && inFlightRisky(t, run)) {
          patchTask(t.id, { status: 'paused', blocker: INTERRUPTED_AFTER_RESTART, blockerCode: 'INTERRUPTED' });
          releaseLocks(t.id);
          log.warn('Aufgabe nach Neustart zur Prüfung pausiert', { taskId: t.id });
          continue;
        }
        if (resumeAfterRestart) {
          patchTask(t.id, { status: 'queued', blocker: null, blockerCode: null });
        } else {
          releaseLocks(t.id);
        }
      }
      log.info('Aufgaben nach dem Start geprüft', { tasks: count, resume: resumeAfterRestart });
      requestRecheck('recover');
      emitStatusIfChanged();
      return { tasks: count };
    },

    startLoop() {
      if (loopStarted || shuttingDown) return;
      loopStarted = true;
      ensureSubscriptions();
      tickTimer = setInterval(() => wakeJob.request(), opts.tickIntervalMs);
      tickTimer.unref?.();
      recheckTimer = setInterval(() => requestRecheck('timer'), opts.recheckIntervalMs);
      recheckTimer.unref?.();
      requestRecheck('start');
      requestWake();
    },

    async shutdown(timeoutMs) {
      shuttingDown = true;
      if (tickTimer) clearInterval(tickTimer);
      if (recheckTimer) clearInterval(recheckTimer);
      tickTimer = null;
      recheckTimer = null;
      wakeJob.cancel();
      recheckJob.cancel();
      for (const ctx of runs.values()) ctx.shutdownPause = true;
      const all = () => [...[...runs.values()].map((c) => c.done), ...[...integrationPasses.values()].map((i) => i.done)];
      if (all().length) await settleWithin(Promise.allSettled(all()), timeoutMs);
      const reason = new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.');
      for (const ctx of runs.values()) if (!ctx.controller.signal.aborted) ctx.controller.abort(reason);
      for (const ip of integrationPasses.values()) if (!ip.controller.signal.aborted) ip.controller.abort(reason);
      if (all().length) await settleWithin(Promise.allSettled(all()), 2000);
      // Persist anything still running as interrupted.
      for (const ctx of [...runs.values()]) {
        ctx.finalized = true;
        const t = getTask(ctx.taskId);
        if (t && t.status === 'running') {
          markInterrupted(t, { phase: ctx.phase, runId: ctx.runId, role: ctx.phase === 'review' ? 'reviewer' : t.role });
        }
        runs.delete(ctx.taskId);
      }
      for (const t of safe(() => s.tasks.list({ status: ['running'], limit: 100000 })) ?? []) patchTask(t.id, { status: 'interrupted' });
      await settleWithin(Promise.allSettled([...background]), 1000);
      loopStarted = false;
      emitStatusIfChanged();
    },

    async tick() {
      tickPass();
    },

    async idle() {
      for (let i = 0; i < 100000; i++) {
        const waits: Promise<unknown>[] = [];
        for (const c of runs.values()) waits.push(c.done);
        for (const ip of integrationPasses.values()) waits.push(ip.done);
        const w1 = wakeJob.settled();
        if (w1) waits.push(w1);
        const w2 = recheckJob.settled();
        if (w2) waits.push(w2);
        for (const b of background) waits.push(b);
        if (!waits.length) return;
        await Promise.allSettled(waits);
      }
    },
  };


  return work;
}
