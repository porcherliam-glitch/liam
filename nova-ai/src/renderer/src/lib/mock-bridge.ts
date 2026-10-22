// In-memory implementation of the preload bridge (`window.nova`) for plain-browser development and
// tests. Implements EVERY RPC method of src/shared/rpc.ts on top of the demo data in mock-data.ts.
// Mutations change the in-memory state and emit the matching events, so the UI behaves "live".
//
// Tests:
//   installMockBridge();                 // window.nova = mock (no latency, no timers)
//   resetMockData();                     // fresh demo data, overrides and call log cleared
//   mockHandlers.set('tasks.pause', () => { throw new MockRpcError('CONFLICT', 'Geht nicht'); });
//   setMockHandler('projects.list', () => []);   // typed variant
//   emitMockEvent({ type: 'task.updated', payload: task });
//   getMockCalls('tasks.pause')          // -> [{ method, params }]
import { RpcContract, type RpcMethod, type RpcParams, type RpcParsedParams, type RpcResult } from '@shared/rpc';
import type { AnyNovaEvent, NovaEventMap, NovaEventType } from '@shared/events';
import type { BridgeRpcResult, DaemonConnectionState, NovaBridge } from '@shared/bridge';
import type {
  AgentRun,
  AgentStep,
  Approval,
  ApprovalKind,
  BudgetStatus,
  ChangedFile,
  CheckKind,
  CheckRun,
  FileDiff,
  FileNode,
  GitStatus,
  IntegrationStatus,
  LogEntry,
  MemoryEntry,
  ModelInfo,
  OllamaPull,
  Project,
  ProjectConfig,
  ProjectKind,
  ProjectSummary,
  ResourceSnapshot,
  RestoreResult,
  Task,
  TaskNote,
  Operation,
  ProviderConfig,
  TaskKind,
  WorkStatus,
} from '@shared/schemas';
import { SettingsSchema } from '@shared/settings';
import { APPROVAL_KINDS_ONCE_ONLY } from '@shared/schemas';
import { commands as mockCommands, createMockDb, DAY, GB, HOUR, languageOf, MB, MIN, mockHash, type MockDb, OLLAMA } from './mock-data';

// ---------------------------------------------------------------------------
// Public test API
// ---------------------------------------------------------------------------

/** Throw this from a handler/override to answer `ok: false` with a specific code. */
export class MockRpcError extends Error {
  readonly code: string;
  readonly details: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'MockRpcError';
    this.code = code;
    this.details = details;
  }
}

type Handler<M extends RpcMethod> = (params: RpcParsedParams<M>) => RpcResult<M> | Promise<RpcResult<M>>;
type HandlerMap = { [M in RpcMethod]: Handler<M> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseHandler = (params: any) => unknown;

/** Per-method overrides (checked before the built-in handlers). Cleared by resetMockData(). */
export const mockHandlers = new Map<RpcMethod, LooseHandler>();

/** Typed override helper. */
export function setMockHandler<M extends RpcMethod>(method: M, handler: (params: RpcParsedParams<M>) => RpcResult<M> | Promise<RpcResult<M>>): void {
  mockHandlers.set(method, handler as LooseHandler);
}

/** Every invoke() call since the last reset (params as passed by the UI, before defaults). */
export const mockCalls: Array<{ method: RpcMethod; params: unknown }> = [];

/** Calls of one method (or all). */
export function getMockCalls<M extends RpcMethod>(method?: M): Array<{ method: M; params: RpcParams<M> }> {
  return (method ? mockCalls.filter((c) => c.method === method) : mockCalls) as Array<{ method: M; params: RpcParams<M> }>;
}

export interface MockBridgeOptions {
  /** Artificial latency per RPC call in ms (default 0). */
  latencyMs?: number;
  /** Live simulation: resource snapshots every 2 s, agent steps, download/check progress (default false). */
  live?: boolean;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let db: MockDb = createMockDb();
let seq = 0;
let options: Required<MockBridgeOptions> = { latencyMs: 0, live: false };
const eventListeners = new Set<(event: AnyNovaEvent) => void>();
const stateListeners = new Set<(state: DaemonConnectionState) => void>();
const navigateListeners = new Set<(path: string) => void>();
const timeouts = new Set<ReturnType<typeof setTimeout>>();
let intervals: Array<ReturnType<typeof setInterval>> = [];
let connection: DaemonConnectionState = connectedState();
/** Tasks paused by a global work.pause (restored by work.resume). */
let pausedByWork = new Set<string>();
let liveTick = 0;

function connectedState(): DaemonConnectionState {
  return {
    state: 'connected',
    message: 'Mit dem Hintergrunddienst verbunden.',
    since: Date.now(),
    daemonPid: 14872,
    daemonVersion: '0.1.0',
    endpoint: '\\\\.\\pipe\\nova-ai-daemon-demo',
    restartAttempts: 0,
  };
}

/** Direct access to the in-memory data (tests). */
export function getMockDb(): MockDb {
  return db;
}

/** Fresh demo data; clears overrides, call log and pending timers. Keeps event subscriptions. */
export function resetMockData(now: number = Date.now()): void {
  for (const t of timeouts) clearTimeout(t);
  timeouts.clear();
  db = createMockDb(now);
  mockHandlers.clear();
  mockCalls.length = 0;
  pausedByWork = new Set();
  liveTick = 0;
  setConnection(connectedState(), false);
}

/** Emits an event to all onEvent listeners (ts/seq are filled in when omitted). */
export function emitMockEvent<T extends NovaEventType>(event: { type: T; payload: NovaEventMap[T]; ts?: number; seq?: number }): void {
  const full = { type: event.type, payload: event.payload, ts: event.ts ?? Date.now(), seq: event.seq ?? ++seq } as AnyNovaEvent;
  if (event.seq !== undefined) seq = Math.max(seq, event.seq);
  for (const fn of [...eventListeners]) {
    try {
      fn(full);
    } catch (e) {
      console.error('[mock] listener failed', e);
    }
  }
}

/** Changes the simulated connection state (e.g. `setMockConnection({ state: 'error', message: '…' })`). */
export function setMockConnection(patch: Partial<DaemonConnectionState>): void {
  setConnection({ ...connection, since: Date.now(), ...patch });
}

/** Simulates main asking the renderer to navigate (notification click). */
export function emitMockNavigate(path: string): void {
  for (const fn of [...navigateListeners]) fn(path);
}

function setConnection(next: DaemonConnectionState, notify = true): void {
  connection = next;
  if (!notify) return;
  for (const fn of [...stateListeners]) {
    try {
      fn({ ...connection });
    } catch (e) {
      console.error('[mock] state listener failed', e);
    }
  }
}

function emit<T extends NovaEventType>(type: T, payload: NovaEventMap[T]): void {
  emitMockEvent({ type, payload: clone(payload) });
}

function later(ms: number, fn: () => void): void {
  const t = setTimeout(() => {
    timeouts.delete(t);
    fn();
  }, ms);
  timeouts.add(t);
}

/** Runs `fn` after `ms` only in live mode (simulated progress). */
function liveLater(ms: number, fn: () => void): void {
  if (options.live) later(ms, fn);
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function nid(prefix: string): string {
  return `${prefix}_mock${(db.counter++).toString(36)}${Date.now().toString(36).slice(-4)}`;
}

function now(): number {
  return Date.now();
}

function log(level: LogEntry['level'], scope: string, msg: string, data?: unknown): void {
  const entry: LogEntry = { ts: now(), level, scope, msg, ...(data !== undefined ? { data } : {}) };
  db.logs.push(entry);
  if (db.logs.length > 5000) db.logs.splice(0, db.logs.length - 5000);
  // Like the real daemon: only warn/error entries are pushed as events.
  if (level === 'warn' || level === 'error') emit('log', { level, scope, msg, ts: entry.ts });
}

const notFound = (what: string) => new MockRpcError('NOT_FOUND', `${what} wurde nicht gefunden.`);
const conflict = (message: string) => new MockRpcError('CONFLICT', message);

// ---------------------------------------------------------------------------
// Derived data
// ---------------------------------------------------------------------------

function project(id: string): Project {
  const p = db.projects.find((x) => x.id === id);
  if (!p) throw notFound('Das Projekt');
  return p;
}

function task(id: string): Task {
  const t = db.tasks.find((x) => x.id === id);
  if (!t) throw notFound('Die Aufgabe');
  return t;
}

function runOfTask(taskId: string): AgentRun | undefined {
  return db.runs.filter((r) => r.taskId === taskId).sort((a, b) => b.startedAt - a.startedAt)[0];
}

/** Contract: an active run is a run with status 'running'. */
const ACTIVE_RUN = new Set<AgentRun['status']>(['running']);
/** Runs that may continue (used for pause/stop handling). */
const LIVE_RUN = new Set<AgentRun['status']>(['running', 'paused', 'waiting_approval']);

function latestCheck(projectId: string, kind: CheckKind): CheckRun | null {
  return db.checks.filter((c) => c.projectId === projectId && c.kind === kind).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
}

function summary(p: Project): ProjectSummary {
  const tasks = db.tasks.filter((t) => t.projectId === p.id);
  const relevant = tasks.filter((t) => t.status !== 'cancelled');
  const done = relevant.filter((t) => t.status === 'done').length;
  const activity = [...tasks.map((t) => t.updatedAt), ...db.runs.filter((r) => r.projectId === p.id).map((r) => r.updatedAt)];
  const count = (status: Task['status']) => tasks.filter((t) => t.status === status).length;
  const taskCounts: Record<string, number> = {};
  for (const st of TASK_STATUSES) taskCounts[st] = count(st);
  const lastSuccessfulBuild =
    db.checks.filter((c) => c.projectId === p.id && (c.kind === 'build' || c.kind === 'package') && c.status === 'passed').sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  return {
    ...p,
    progress: relevant.length ? Math.round((done / relevant.length) * 100) : 0,
    openTasks: tasks.filter((t) => OPEN_TASK.has(t.status)).length,
    runningTasks: count('running'),
    failedTasks: count('failed'),
    blockedTasks: count('blocked'),
    pausedTasks: count('paused'),
    waitingApprovalTasks: count('waiting_approval'),
    taskCounts,
    pendingApprovals: db.approvals.filter((a) => a.projectId === p.id && a.status === 'pending').length,
    openErrors: db.errors.filter((e) => e.projectId === p.id && !e.resolvedAt).length,
    lastBuild: latestCheck(p.id, 'build'),
    lastSuccessfulBuild,
    lastTest: latestCheck(p.id, 'test'),
    lastActivityAt: activity.length ? Math.max(...activity) : null,
    pathMissing: false,
  };
}

const TASK_STATUSES: Task['status'][] = ['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'done', 'failed', 'cancelled', 'interrupted'];
const OPEN_TASK = new Set<Task['status']>(['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'interrupted']);

/** Effective work state of a project (global state wins when it is not running). */
function effectiveWork(p: Project): Project['workState'] {
  if (db.workState !== 'running') return db.workState;
  return p.workState;
}

function workStatus(): WorkStatus {
  const activeRuns = db.runs.filter((r) => r.status === 'running').length;
  const queued = db.tasks.filter((t) => t.status === 'queued' && effectiveWork(project(t.projectId)) === 'running').length;
  const waiting = db.tasks.some((t) => t.status === 'waiting_approval');
  let idleReason: string | null = null;
  if (db.workState === 'paused') idleReason = 'Die Arbeit ist pausiert.';
  else if (db.workState === 'stopped') idleReason = 'Die Arbeit ist gestoppt. Es werden keine Aufgaben automatisch gestartet.';
  else if (activeRuns === 0) idleReason = queued > 0 ? 'Aufgaben warten auf freie Plätze.' : waiting ? 'Alle offenen Aufgaben warten auf eine Freigabe.' : 'Es gibt gerade keine offenen Aufgaben.';
  return {
    state: db.workState,
    allowedConcurrency: Math.min(2, db.settings.agents.maxParallelAgents),
    configuredConcurrency: db.settings.agents.maxParallelAgents,
    activeRuns,
    queuedTasks: queued,
    idleReason,
    projects: db.projects
      .filter((p) => p.status !== 'archived')
      .map((p) => {
        const tasks = db.tasks.filter((t) => t.projectId === p.id);
        const runs = db.runs.filter((r) => r.projectId === p.id && r.status === 'running').length;
        const q = tasks.filter((t) => t.status === 'queued').length;
        const w = tasks.filter((t) => t.status === 'waiting_approval').length;
        const b = tasks.filter((t) => t.status === 'blocked').length;
        const pa = tasks.filter((t) => t.status === 'paused').length;
        let reason: string | null = null;
        if (p.workState === 'stopped') reason = 'Die autonome Arbeit für dieses Projekt ist aus.';
        else if (p.workState === 'paused') reason = 'Die Arbeit an diesem Projekt ist pausiert.';
        else if (runs === 0 && w > 0) reason = 'Wartet auf eine Freigabe.';
        else if (runs === 0 && b > 0 && q === 0) reason = 'Alle offenen Aufgaben sind blockiert.';
        else if (runs === 0 && q === 0) reason = 'Keine offenen Aufgaben.';
        const nextStep = db.memory.filter((m) => m.projectId === p.id && m.kind === 'next_step').sort((a, c) => c.updatedAt - a.updatedAt)[0];
        const suggestion = runs === 0 && q === 0 ? (nextStep?.title ?? 'Neues Ziel planen') : null;
        return { projectId: p.id, state: p.workState, activeRuns: runs, queuedTasks: q, waitingApproval: w, blocked: b, paused: pa, idleReason: reason, suggestion };
      }),
  };
}

function daemonStatus() {
  return {
    ...db.daemon,
    state: db.workState === 'paused' ? ('paused' as const) : ('running' as const),
    work: db.workState,
    activeRuns: db.runs.filter((r) => r.status === 'running').length,
  };
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function budgetStatus(): BudgetStatus {
  const t = now();
  const day = startOfDay(t);
  const month = startOfMonth(t);
  const paid = db.usage.filter((u) => u.paid);
  const today = db.usage.filter((u) => u.ts >= day);
  const monthRows = db.usage.filter((u) => u.ts >= month);
  const sum = (rows: typeof db.usage) => Math.round(rows.reduce((s, u) => s + u.costUsd, 0) * 10000) / 10000;
  const spentToday = sum(paid.filter((u) => u.ts >= day));
  const spentMonth = sum(paid.filter((u) => u.ts >= month));
  const { dailyLimitUsd, monthlyLimitUsd } = db.settings.budgets;
  return {
    dailyLimitUsd,
    monthlyLimitUsd,
    spentTodayUsd: spentToday,
    spentMonthUsd: spentMonth,
    remainingTodayUsd: dailyLimitUsd == null ? null : Math.max(0, Math.round((dailyLimitUsd - spentToday) * 100) / 100),
    remainingMonthUsd: monthlyLimitUsd == null ? null : Math.max(0, Math.round((monthlyLimitUsd - spentMonth) * 100) / 100),
    containsEstimates: paid.some((u) => u.costEstimated && u.ts >= month),
    paidPaused: db.paidPaused,
    pausedReason: db.pausedReason,
    perProject: db.projects.map((p) => {
      const rows = paid.filter((u) => u.projectId === p.id && u.ts >= month);
      const spent = sum(rows);
      const limit = p.config.monthlyBudgetUsd;
      return {
        projectId: p.id,
        limitUsd: limit,
        spentMonthUsd: spent,
        remainingUsd: limit == null ? null : Math.max(0, Math.round((limit - spent) * 100) / 100),
        paidPaused: limit != null && spent >= limit,
        containsEstimates: rows.some((u) => u.costEstimated),
      };
    }),
    reservedUsd: 0,
    tokensToday: { input: today.reduce((s, u) => s + u.inputTokens, 0), output: today.reduce((s, u) => s + u.outputTokens, 0) },
    tokensMonth: { input: monthRows.reduce((s, u) => s + u.inputTokens, 0), output: monthRows.reduce((s, u) => s + u.outputTokens, 0) },
    localRuntimeMsToday: today.filter((u) => !u.paid).reduce((s, u) => s + u.durationMs, 0) + 2 * HOUR,
    cloudRuntimeMsToday: today.filter((u) => u.paid).reduce((s, u) => s + u.durationMs, 0),
    localRuntimeMsMonth: monthRows.filter((u) => !u.paid).reduce((s, u) => s + u.durationMs, 0) + 31 * HOUR,
    cloudRuntimeMsMonth: monthRows.filter((u) => u.paid).reduce((s, u) => s + u.durationMs, 0),
  };
}

function touchTask(t: Task, patch: Partial<Task>): Task {
  Object.assign(t, patch, { updatedAt: now() });
  emit('task.updated', t);
  return t;
}

function touchRun(r: AgentRun, patch: Partial<AgentRun>): AgentRun {
  const t = now();
  // activeMs counts only time spent in status 'running'.
  if (r.status === 'running') r.activeMs += Math.max(0, t - r.updatedAt);
  Object.assign(r, patch, { updatedAt: t });
  emit('run.updated', r);
  return r;
}

function addStep(r: AgentRun, kind: AgentStep['kind'], summaryText: string, data: unknown = null): AgentStep {
  const step: AgentStep = { id: db.nextStepId++, runId: r.id, taskId: r.taskId, projectId: r.projectId, ts: now(), kind, summary: summaryText, data };
  db.steps.push(step);
  r.stepCount++;
  emit('run.step', step);
  return step;
}

function emitWork(): void {
  emit('work.status', workStatus());
  emit('daemon.status', daemonStatus());
}

function roleForKind(kind: TaskKind): Task['role'] {
  if (kind === 'plan') return 'planner';
  if (kind === 'test' || kind === 'fix') return 'tester';
  if (kind === 'review') return 'reviewer';
  return 'coder';
}

function defaultConfig(kind: ProjectKind): ProjectConfig {
  const node = kind === 'web' || kind === 'backend';
  return {
    commands: node
      ? mockCommands({ install: 'npm install', dev: 'npm run dev', build: 'npm run build', test: 'npm test', run: kind === 'backend' ? 'npm start' : null, typecheck: 'npx tsc --noEmit' })
      : mockCommands(),
    preview:
      kind === 'web' || kind === 'backend'
        ? { kind: 'browser-dev-server', entry: null, url: null }
        : kind === 'desktop'
          ? { kind: 'desktop-run', entry: null, url: null }
          : kind === 'generic'
            ? { kind: 'none', entry: null, url: null }
            : { kind: 'engine-external', entry: null, url: null },
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: true,
    autoCommit: true,
    monthlyBudgetUsd: null,
    conventions: '',
    artifactGlobs: [],
    engineVersion: null,
  };
}

function guessKind(text: string): ProjectKind {
  const t = text.toLowerCase();
  if (t.includes('unity')) return 'unity';
  if (t.includes('godot')) return 'godot';
  if (t.includes('unreal')) return 'unreal';
  if (/\b(api|server|backend|datenbank)\b/.test(t)) return 'backend';
  if (/\b(desktop|windows-programm|wpf)\b/.test(t)) return 'desktop';
  if (/\b(web|webseite|browser|spiel|app)\b/.test(t)) return 'web';
  return 'generic';
}

// --- files -----------------------------------------------------------------

function projectFiles(projectId: string): Record<string, string> {
  project(projectId);
  return (db.files[projectId] ??= {});
}

function isBinary(projectId: string, path: string): boolean {
  return db.binaryFiles.has(`${projectId}:${path}`);
}

function gitStatusOf(projectId: string): Map<string, string> {
  const out = new Map<string, string>();
  if (!db.gitRepos[projectId]) return out;
  const lastCommit = db.commits[projectId]?.[0]?.date ?? 0;
  for (const c of db.changes) {
    if (c.projectId !== projectId || c.reverted || c.ts <= lastCommit) continue;
    out.set(c.path, c.op === 'create' ? '??' : c.op === 'delete' ? ' D' : ' M');
  }
  return out;
}

function buildTree(projectId: string, root: string, depth: number): FileNode {
  const files = projectFiles(projectId);
  const novaChanged = new Set(db.changes.filter((c) => c.projectId === projectId && c.actor === 'nova' && !c.reverted).map((c) => c.path));
  const git = gitStatusOf(projectId);
  const emptyDirs = db.emptyDirs[projectId] ?? [];
  const paths = [...Object.keys(files), ...emptyDirs.map((d) => `${d}/\u0000`)];
  const prefix = root ? `${root.replace(/\/+$/, '')}/` : '';
  if (root && !paths.some((p) => p.startsWith(prefix))) {
    if (files[root] !== undefined) throw new MockRpcError('VALIDATION', 'Der Pfad ist eine Datei, kein Ordner.');
    throw notFound('Der Ordner');
  }
  const make = (dirPath: string, level: number): FileNode => {
    const pre = dirPath ? `${dirPath}/` : '';
    const childNames = new Map<string, 'file' | 'dir'>();
    for (const p of paths) {
      if (!p.startsWith(pre)) continue;
      const rest = p.slice(pre.length);
      const slash = rest.indexOf('/');
      if (rest === '\u0000') continue; // marker of an empty folder
      if (slash === -1) childNames.set(rest, 'file');
      else childNames.set(rest.slice(0, slash), 'dir');
    }
    const children: FileNode[] = [...childNames.entries()]
      .sort(([an, at], [bn, bt]) => (at === bt ? an.localeCompare(bn, 'de') : at === 'dir' ? -1 : 1))
      .map(([name, type]) => {
        const path = pre + name;
        if (type === 'file') {
          return {
            name,
            path,
            type: 'file' as const,
            size: isBinary(projectId, path) ? 18_432 : new TextEncoder().encode(files[path]).length,
            children: null,
            changedByNova: novaChanged.has(path),
            gitStatus: git.get(path) ?? null,
          };
        }
        const node = level < depth ? make(path, level + 1) : null;
        return {
          name,
          path,
          type: 'dir' as const,
          size: null,
          children: node ? node.children : null,
          changedByNova: [...novaChanged].some((p) => p.startsWith(`${path}/`)),
          gitStatus: null,
        };
      });
    const name = dirPath ? dirPath.slice(dirPath.lastIndexOf('/') + 1) : project(projectId).name;
    return { name, path: dirPath, type: 'dir', size: null, children, changedByNova: [...novaChanged].some((p) => p.startsWith(pre)), gitStatus: null };
  };
  return make(root.replace(/\/+$/, ''), 1);
}

function fileContent(projectId: string, path: string) {
  const files = projectFiles(projectId);
  const content = files[path];
  if (content === undefined) throw notFound('Die Datei');
  const binary = isBinary(projectId, path);
  return {
    path,
    content: binary ? '' : content,
    encoding: binary ? ('binary' as const) : ('utf8' as const),
    size: binary ? 18_432 : new TextEncoder().encode(content).length,
    hash: mockHash(`${path}\n${content}`),
    mtime: lastChangeTs(projectId, path) ?? db.now - 3 * DAY,
    language: languageOf(path),
    truncated: false,
  };
}

function lastChangeTs(projectId: string, path: string): number | null {
  const c = db.changes.filter((x) => x.projectId === projectId && x.path === path).sort((a, b) => b.ts - a.ts)[0];
  return c?.ts ?? null;
}

function recordUserChange(projectId: string, path: string, op: 'create' | 'modify' | 'delete', before: string | null, after: string | null): void {
  const beforeHash = before == null ? null : mockHash(before);
  if (beforeHash && before != null) db.snapshots[beforeHash] = before;
  const afterHash = after == null ? null : mockHash(after);
  if (afterHash && after != null) db.snapshots[afterHash] = after;
  db.changes.push({ id: db.nextChangeId++, projectId, taskId: null, runId: null, path, op, beforeHash, afterHash, actor: 'user', source: 'user', revertible: true, ts: now(), reverted: false });
}

function changedFiles(projectId: string): ChangedFile[] {
  const git = gitStatusOf(projectId);
  const byPath = new Map<string, ChangedFile & { lastNova: number }>();
  const sorted = db.changes.filter((c) => c.projectId === projectId && !c.reverted).sort((a, b) => a.ts - b.ts);
  for (const c of sorted) {
    if (c.actor !== 'nova') continue;
    const prev = byPath.get(c.path);
    if (prev) {
      if (c.taskId && !prev.taskIds.includes(c.taskId)) prev.taskIds.push(c.taskId);
      if (c.op === 'delete') prev.op = 'delete';
      prev.lastNova = c.ts;
    } else {
      byPath.set(c.path, { path: c.path, op: c.op, byNova: true, taskIds: c.taskId ? [c.taskId] : [], gitStatus: git.get(c.path) ?? null, modifiedSinceNova: false, lastNova: c.ts });
    }
  }
  for (const c of sorted) {
    const entry = byPath.get(c.path);
    if (entry && c.actor === 'user' && c.ts > entry.lastNova) entry.modifiedSinceNova = true;
  }
  return [...byPath.values()].map(({ lastNova: _lastNova, ...rest }) => rest);
}

function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return '';
  const a = before === '' ? [] : before.replace(/\n$/, '').split('\n');
  const b = after === '' ? [] : after.replace(/\n$/, '').split('\n');
  const lines: string[] = [];
  if (a.length * b.length <= 250_000) {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        lines.push(` ${a[i]}`);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) lines.push(`-${a[i++]}`);
      else lines.push(`+${b[j++]}`);
    }
    while (i < a.length) lines.push(`-${a[i++]}`);
    while (j < b.length) lines.push(`+${b[j++]}`);
  } else {
    lines.push(...a.map((l) => `-${l}`), ...b.map((l) => `+${l}`));
  }
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -1,${a.length} +1,${b.length} @@`, ...lines].join('\n') + '\n';
}

function fileDiff(projectId: string, path: string): FileDiff {
  const files = projectFiles(projectId);
  const modified = files[path] ?? '';
  const created = db.changes.some((c) => c.projectId === projectId && c.path === path && c.op === 'create' && !c.reverted);
  const original = db.originals[projectId]?.[path] ?? (created ? '' : modified);
  return { path, original, modified, unified: unifiedDiff(path, original, modified), binary: isBinary(projectId, path) };
}

function gitStatus(projectId: string): GitStatus {
  project(projectId);
  if (!db.gitRepos[projectId]) return { isRepo: false, branch: null, head: null, ahead: 0, behind: 0, files: [], clean: true };
  const files = [...gitStatusOf(projectId).entries()].map(([path, code]) => ({ path, index: code[0], workTree: code[1] }));
  return { isRepo: true, branch: 'main', head: db.commits[projectId]?.[0]?.shortHash ?? null, ahead: 0, behind: 0, files, clean: files.length === 0 };
}

function restorePlan(checkpointId?: string, taskId?: string): { result: RestoreResult; projectId: string; changeIds: number[] } {
  let projectId: string;
  let candidates;
  if (checkpointId) {
    const cp = db.checkpoints.find((c) => c.id === checkpointId);
    if (!cp) throw notFound('Der Wiederherstellungspunkt');
    projectId = cp.projectId;
    candidates = db.changes.filter((c) => c.projectId === cp.projectId && c.id > cp.changeCursor && c.actor === 'nova' && !c.reverted);
  } else if (taskId) {
    const t = task(taskId);
    projectId = t.projectId;
    candidates = db.changes.filter((c) => c.taskId === taskId && c.actor === 'nova' && !c.reverted);
  } else {
    throw new MockRpcError('VALIDATION', 'Bitte einen Wiederherstellungspunkt oder eine Aufgabe angeben.');
  }
  const paths = [...new Set(candidates.map((c) => c.path))];
  const conflicts: RestoreResult['conflicts'] = [];
  const restored: string[] = [];
  for (const path of paths) {
    const lastNova = Math.max(...candidates.filter((c) => c.path === path).map((c) => c.ts));
    const userAfter = db.changes.some((c) => c.projectId === projectId && c.path === path && c.actor === 'user' && c.ts > lastNova && !c.reverted);
    if (userAfter) conflicts.push({ path, reason: 'Die Datei wurde danach von Hand geändert. Diese Änderungen bleiben erhalten.' });
    else restored.push(path);
  }
  const changeIds = candidates.filter((c) => restored.includes(c.path)).map((c) => c.id);
  return { result: { restored, conflicts, skipped: [], commit: null, checkpointId: null }, projectId, changeIds };
}

function checkCommand(p: Project, kind: CheckKind): string | null {
  const c = p.config.commands;
  if (kind === 'runtime') return c.run ?? c.dev;
  return c[kind];
}

const CHECK_TEXT: Record<CheckKind, string> = {
  test: 'Testbefehl',
  build: 'Build-Befehl',
  lint: 'Lint-Befehl',
  typecheck: 'Befehl für die Typprüfung',
  e2e: 'Befehl für Oberflächentests',
  security: 'Befehl für die Sicherheitsprüfung',
  runtime: 'Start- oder Entwicklungsbefehl',
  package: 'Befehl zum Paketbau',
};

// --- ollama ------------------------------------------------------------------

const KNOWN_MODEL_SIZES: Record<string, number> = {
  'qwen2.5-coder:7b': 4.7 * GB,
  'qwen2.5-coder:14b': 9.0 * GB,
  'qwen2.5-coder:32b': 19.9 * GB,
  'llama3.1:8b': 4.9 * GB,
  'deepseek-coder-v2:16b': 8.9 * GB,
  'mistral-nemo': 7.1 * GB,
  'mistral-nemo:latest': 7.1 * GB,
};

function localModels(): ModelInfo[] {
  return db.models.filter((m) => m.providerId === OLLAMA);
}

function newLocalModel(name: string, size: number): ModelInfo {
  const coder = name.includes('coder');
  return {
    providerId: OLLAMA,
    id: name.includes(':') ? name : `${name}:latest`,
    displayName: name,
    local: true,
    paid: false,
    sizeBytes: size,
    parameterSize: /(\d+)b/i.exec(name)?.[1] ? `${/(\d+)b/i.exec(name)![1]}B` : null,
    quantization: 'Q4_K_M',
    family: name.split(/[:.\d-]/)[0] || null,
    contextLength: 32_768,
    capabilities: coder ? ['completion', 'tools', 'insert'] : ['completion', 'tools'],
    pricing: null,
    modifiedAt: now(),
  };
}

function simulatePull(pull: OllamaPull): void {
  liveLater(700, () => {
    const p = db.pulls.find((x) => x.id === pull.id);
    if (!p || p.status !== 'running') return;
    const percent = Math.min(100, (p.percent ?? 0) + 9 + Math.round(Math.random() * 6));
    p.percent = percent;
    p.completedBytes = Math.round(((p.totalBytes ?? 0) * percent) / 100);
    p.phase = percent < 5 ? 'pulling manifest' : percent < 97 ? 'downloading' : 'verifying sha256 digest';
    p.updatedAt = now();
    if (percent >= 100) {
      p.status = 'done';
      p.phase = 'success';
      if (!db.models.some((m) => m.providerId === OLLAMA && m.id === p.model)) db.models.push(newLocalModel(p.model, p.totalBytes ?? 4 * GB));
      emit('ollama.pull', p);
      emit('ollama.models.changed', { providerId: OLLAMA });
      log('info', 'ollama', `Modell heruntergeladen: ${p.model}`);
      return;
    }
    emit('ollama.pull', p);
    simulatePull(p);
  });
}

// --- resources -----------------------------------------------------------------

function jitter(value: number, spread: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value + (Math.random() - 0.5) * 2 * spread));
}

function nextSnapshot(): ResourceSnapshot {
  const prev = db.resources;
  const running = db.runs.filter((r) => r.status === 'running').length;
  const cpu = Math.round(jitter(prev.cpu.percent, 6, 8 + running * 6, 92));
  const used = jitter(prev.memory.usedBytes, 0.25 * GB, 14 * GB, 26 * GB);
  const gpu = prev.gpus[0];
  const snap: ResourceSnapshot = {
    ...prev,
    ts: now(),
    cpu: { ...prev.cpu, percent: cpu },
    memory: { ...prev.memory, usedBytes: used, freeBytes: prev.memory.totalBytes - used },
    gpus: gpu
      ? [{ ...gpu, utilPercent: Math.round(jitter(gpu.utilPercent ?? 50, 9, running ? 35 : 3, 99)), vramUsedBytes: jitter(gpu.vramUsedBytes ?? 8 * GB, 0.08 * GB, 13.9 * GB, 15.2 * GB) }]
      : [],
    ollamaLoaded: db.ollamaRunning,
    daemon: { rssBytes: jitter(prev.daemon.rssBytes, 2 * MB, 160 * MB, 240 * MB), cpuPercent: Math.round(jitter(prev.daemon.cpuPercent, 0.6, 0.3, 6) * 10) / 10 },
    childProcesses: db.processes.filter((p) => p.status === 'running').length,
  };
  db.resources = snap;
  db.resourceHistory.push(snap);
  if (db.resourceHistory.length > 3600) db.resourceHistory.splice(0, db.resourceHistory.length - 3600);
  return snap;
}

// --- live agent simulation -------------------------------------------------------

const LIVE_SCRIPT: Record<AgentRun['role'], Array<[AgentStep['kind'], string]>> = {
  coder: [
    ['tool_call', 'Liest src/game/physics.ts'],
    ['tool_result', 'Datei gelesen (11 Zeilen)'],
    ['model_call', 'Modell überarbeitet die Sprunglogik'],
    ['tool_call', 'Ändert src/game/player.ts'],
    ['tool_result', 'Änderung übernommen (+6 −3 Zeilen)'],
    ['tool_call', 'Führt „npm test“ aus'],
    ['tool_result', '22 von 22 Tests bestanden'],
    ['thought', 'Die Gnadenzeit von 120 ms wirkt gut – als Konstante auslagern.'],
  ],
  tester: [
    ['tool_result', '12 von 12 Tests bestanden (tests/recipes.test.ts)'],
    ['tool_call', 'Ergänzt den Testfall „Suche mit Umlauten“'],
    ['model_call', 'Modell prüft die Testabdeckung'],
    ['tool_call', 'Führt „npm test -- search“ aus'],
    ['tool_result', '3 von 3 Suchtests bestanden'],
    ['thought', 'Eine leere Suche soll die neuesten 50 Rezepte liefern – Testfall ergänzen.'],
  ],
  planner: [
    ['model_call', 'Modell zerlegt das Ziel in Teilaufgaben'],
    ['tool_call', 'Legt Aufgaben an'],
  ],
  reviewer: [
    ['tool_call', 'Liest die Änderungen der Aufgabe'],
    ['model_call', 'Modell prüft die Änderungen'],
  ],
};

function liveAgentTick(): void {
  liveTick++;
  for (const r of db.runs.filter((x) => x.status === 'running')) {
    const script = LIVE_SCRIPT[r.role];
    const [kind, text] = script[(r.stepCount + liveTick) % script.length];
    addStep(r, kind, text);
    const tokensIn = kind === 'model_call' ? 1800 + Math.round(Math.random() * 2400) : 0;
    const tokensOut = kind === 'model_call' ? 300 + Math.round(Math.random() * 700) : 0;
    touchRun(r, {
      inputTokens: r.inputTokens + tokensIn,
      outputTokens: r.outputTokens + tokensOut,
      lastAction: kind === 'tool_call' || kind === 'model_call' ? text : r.lastAction,
    });
    if (kind === 'tool_call' && text.startsWith('Ändert ')) {
      emit('files.changed', { projectId: r.projectId, paths: [text.replace('Ändert ', '')], actor: 'nova' });
    }
    if (kind === 'model_call') log('debug', `agent.${r.role}`, `model_call ${r.modelId ?? ''} (${tokensIn} → ${tokensOut} Tokens)`);
  }
}

function liveOperationTick(): void {
  for (const o of db.operations.filter((x) => x.status === 'running')) {
    const progress = Math.min(100, (o.progress ?? 0) + 4 + Math.round(Math.random() * 4));
    if (progress >= 100) {
      Object.assign(o, { status: 'done', progress: 100, endedAt: now(), message: 'Fertig' });
      emit('operation.updated', o);
      if (o.kind === 'project_snapshot' && o.projectId) {
        const p = db.projects.find((x) => x.id === o.projectId);
        db.backups.push({ id: nid('bak'), kind: 'project_snapshot', path: `${db.daemon.dataDir}\\backups\\${p?.name ?? 'Projekt'}-${new Date().toISOString().slice(0, 10)}`, sizeBytes: 1.7 * MB, reason: 'manuell', projectId: o.projectId, createdAt: now() });
      }
      log('info', 'operations', `Vorgang abgeschlossen: ${o.title}`);
      continue;
    }
    const total = 1180;
    Object.assign(o, { progress, message: `Dateien werden kopiert (${Math.round((progress / 100) * total)} von ${total.toLocaleString('de-DE')})` });
    emit('operation.updated', o);
  }
}

function startLive(): void {
  stopLive();
  if (!options.live) return;
  intervals.push(
    setInterval(() => {
      if (eventListeners.size === 0 || connection.state !== 'connected') return;
      emit('resources.snapshot', nextSnapshot());
    }, 2000),
  );
  intervals.push(
    setInterval(() => {
      if (eventListeners.size === 0 || connection.state !== 'connected' || db.workState !== 'running') return;
      liveAgentTick();
    }, 4500),
  );
  intervals.push(
    setInterval(() => {
      if (eventListeners.size === 0 || connection.state !== 'connected') return;
      liveOperationTick();
    }, 1500),
  );
}

function stopLive(): void {
  for (const i of intervals) clearInterval(i);
  intervals = [];
}

function newTask(t: Partial<Task> & Pick<Task, 'projectId' | 'title' | 'kind' | 'role'>): Task {
  const ts = now();
  const created: Task = {
    id: nid('task'),
    parentId: null,
    description: '',
    status: 'queued',
    priority: 1,
    dependsOn: [],
    attempts: 0,
    maxAttempts: db.settings.agents.maxAttempts,
    blocker: null,
    blockerCode: null,
    result: null,
    acceptance: null,
    verification: { status: 'not_run', checks: [] },
    files: [],
    plannedFiles: [],
    startRequested: false,
    model: null,
    source: 'user',
    createdAt: ts,
    updatedAt: ts,
    startedAt: null,
    finishedAt: null,
    ...t,
  };
  db.tasks.push(created);
  return created;
}

/** Sets the global (no projectId) or per-project work state and emits the matching events. */
function setWork(state: WorkStatus['state'], projectId?: string): WorkStatus {
  if (projectId) {
    const p = project(projectId);
    p.workState = state;
    p.updatedAt = now();
    emit('project.updated', p);
  } else {
    db.workState = state;
  }
  emitWork();
  const verb = state === 'running' ? 'gestartet' : state === 'paused' ? 'pausiert' : 'gestoppt';
  log('info', 'scheduler', projectId ? `Arbeit für ${project(projectId).name} ${verb}` : `Autonome Arbeit ${verb}`);
  return workStatus();
}

// ---------------------------------------------------------------------------
// Handlers (one per RPC method – TypeScript enforces completeness)
// ---------------------------------------------------------------------------

const handlers: HandlerMap = {
  // --- daemon -----------------------------------------------------------------
  'daemon.status': () => daemonStatus(),
  'daemon.shutdown': () => {
    log('info', 'daemon', 'Hintergrunddienst wird beendet (Anfrage der Oberfläche)');
    later(50, () => setConnection({ ...connection, state: 'stopped', message: 'Der Hintergrunddienst wurde beendet.', since: now(), daemonPid: null }));
    return { ok: true as const };
  },
  'daemon.diagnostics': () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    log('info', 'diagnostics', 'Diagnose-Paket erstellt');
    return { path: `${db.daemon.dataDir}\\diagnostics\\nova-diagnose-${stamp}.json`, sizeBytes: 184_322 };
  },
  'daemon.logs': ({ limit, level, scope }) => {
    const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
    let rows = db.logs;
    if (level) rows = rows.filter((l) => order[l.level] >= order[level]);
    if (scope) rows = rows.filter((l) => l.scope.startsWith(scope));
    return rows.slice(-limit);
  },
  'dashboard.summary': () => {
    const passedBuilds = db.checks.filter((c) => (c.kind === 'build' || c.kind === 'package') && c.status === 'passed').sort((a, b) => (b.finishedAt ?? b.startedAt) - (a.finishedAt ?? a.startedAt));
    const failedTests = db.projects
      .map((p) => latestCheck(p.id, 'test'))
      .filter((c): c is CheckRun => !!c && c.status === 'failed');
    return {
      daemon: daemonStatus(),
      work: workStatus(),
      projects: db.projects.filter((p) => p.status !== 'archived').map(summary),
      activeRuns: db.runs.filter((r) => ACTIVE_RUN.has(r.status)).sort((a, b) => b.updatedAt - a.updatedAt),
      openTasks: db.tasks.filter((t) => OPEN_TASK.has(t.status)).length,
      recentBuilds: passedBuilds.slice(0, 10),
      failedTests,
      errors: db.errors.filter((e) => !e.resolvedAt).sort((a, b) => b.createdAt - a.createdAt),
      pendingApprovals: db.approvals.filter((a) => a.status === 'pending').length,
      unreadNotifications: db.notifications.filter((n) => n.readAt == null).length,
      activeOperations: db.operations.filter((o) => o.status === 'running'),
      budget: budgetStatus(),
      resources: db.resources,
      models: {
        local: { status: db.ollama, modelCount: localModels().length },
        cloud: db.providerHealth.filter((h) => h.providerId !== OLLAMA),
        defaultModel: db.settings.models.defaultModel ? `${db.settings.models.defaultModel.providerId}/${db.settings.models.defaultModel.modelId}` : null,
      },
    };
  },

  // --- projects -----------------------------------------------------------------
  'projects.list': ({ includeArchived }) => db.projects.filter((p) => includeArchived || p.status !== 'archived').map(summary),
  'projects.get': ({ id }) => summary(project(id)),
  'projects.create': (input) => {
    if (db.projects.some((p) => p.name.toLowerCase() === input.name.toLowerCase())) throw conflict(`Ein Projekt mit dem Namen „${input.name}“ gibt es schon.`);
    const template = input.templateId ? db.templates.find((t) => t.id === input.templateId) : undefined;
    if (input.templateId && !template) throw notFound('Die Vorlage');
    const kind = input.kind ?? template?.kind ?? guessKind(`${input.name} ${input.description} ${Object.values(input.answers).join(' ')}`);
    const id = nid('prj');
    const t = now();
    const p: Project = {
      id,
      name: input.name,
      description: input.description,
      path: input.path ?? `${db.settings.general.projectsDir}\\${input.name}`,
      kind,
      technologies: input.technologies.length ? input.technologies : (template?.technologies ?? []),
      status: 'active',
      templateId: input.templateId,
      origin: input.mode === 'open' ? 'open' : input.mode === 'import' ? 'import' : 'new',
      config: defaultConfig(kind),
      // Opened/imported folders start with autonomous work switched off (SPEC: trust first).
      workState: input.mode === 'open' || input.mode === 'import' ? 'stopped' : 'running',
      gitAvailable: input.mode === 'import' || (input.mode !== 'open' && input.initGit),
      createdAt: t,
      updatedAt: t,
    };
    db.projects.push(p);
    db.gitRepos[id] = p.gitAvailable;
    db.commits[id] = [];
    db.files[id] = { 'README.md': `# ${input.name}\n\n${input.description || 'Neues Projekt, angelegt mit NOVA AI.'}\n` };
    db.previews[id] = { projectId: id, kind: p.config.preview.kind, state: p.config.preview.kind === 'engine-external' || p.config.preview.kind === 'none' ? 'unsupported' : 'stopped', url: null, processId: null, message: 'Die Vorschau ist gestoppt.', reloadToken: 0 };
    let planTaskId: string | null = null;
    if (input.planNow && (input.description || Object.keys(input.answers).length)) {
      const plan: Task = {
        id: nid('task'), projectId: id, parentId: null, title: `Projekt planen: ${input.name}`, description: input.description, kind: 'plan', role: 'planner',
        status: 'queued', priority: 2, dependsOn: [], attempts: 0, maxAttempts: db.settings.agents.maxAttempts, blocker: null, blockerCode: null, result: null, acceptance: null,
        verification: { status: 'unavailable', checks: [] }, files: [], plannedFiles: [], startRequested: false, model: null, source: 'system', createdAt: t, updatedAt: t, startedAt: null, finishedAt: null,
      };
      db.tasks.push(plan);
      planTaskId = plan.id;
      emit('task.updated', plan);
    }
    const warnings: string[] = [];
    if (template?.missingTools.length) warnings.push(`Für diese Vorlage fehlt noch: ${template.missingTools.join(', ')}. Unter „Werkzeuge“ kann es installiert werden.`);
    if (!p.gitAvailable) warnings.push('Ohne Git kann NOVA Änderungen nur über eigene Wiederherstellungspunkte rückgängig machen.');
    if (p.workState === 'stopped') warnings.push('Die autonome Arbeit ist für dieses Projekt noch aus. Sie kann in der Projektübersicht eingeschaltet werden.');
    emit('project.updated', p);
    emitWork();
    log('info', 'projects', `Projekt angelegt: ${p.name}`);
    return { project: p, planTaskId, warnings };
  },
  'projects.update': ({ id, config, ...patch }) => {
    const p = project(id);
    Object.assign(p, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    if (config) {
      const { commands: cmdPatch, preview: previewPatch, ...rest } = config;
      p.config = {
        ...p.config,
        ...(Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<ProjectConfig>),
        commands: { ...p.config.commands, ...(Object.fromEntries(Object.entries(cmdPatch ?? {}).filter(([, v]) => v !== undefined)) as Partial<ProjectConfig['commands']>) },
        preview: { ...p.config.preview, ...(Object.fromEntries(Object.entries(previewPatch ?? {}).filter(([, v]) => v !== undefined)) as Partial<ProjectConfig['preview']>) },
      };
    }
    p.updatedAt = now();
    emit('project.updated', p);
    return p;
  },
  'projects.detect': ({ id }) => {
    const p = project(id);
    return { kind: p.kind, technologies: p.technologies, config: p.config };
  },
  'projects.remove': ({ id }) => {
    const p = project(id);
    if (db.tasks.some((t) => t.projectId === id && t.status === 'running')) throw conflict('Im Projekt laufen noch Aufgaben. Bitte zuerst die Arbeit stoppen.');
    db.projects = db.projects.filter((x) => x.id !== id);
    db.tasks = db.tasks.filter((t) => t.projectId !== id);
    db.runs = db.runs.filter((r) => r.projectId !== id);
    db.approvals = db.approvals.filter((a) => a.projectId !== id);
    db.errors = db.errors.filter((e) => e.projectId !== id);
    emit('project.removed', { id });
    emitWork();
    log('info', 'projects', `Projekt aus NOVA entfernt (Dateien bleiben erhalten): ${p.name}`);
    return { ok: true as const };
  },
  'projects.setWork': async ({ id, enabled }) => {
    project(id);
    await (enabled ? handlers['work.start']({ projectId: id }) : handlers['work.stop']({ projectId: id }));
    return project(id);
  },
  'templates.list': () => db.templates,

  // --- tasks --------------------------------------------------------------------
  'tasks.list': ({ projectId, status, limit }) =>
    db.tasks
      .filter((t) => (!projectId || t.projectId === projectId) && (!status || status.includes(t.status)))
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)
      .slice(0, limit),
  'tasks.get': ({ id }) => task(id),
  'tasks.create': (input) => {
    project(input.projectId);
    for (const dep of input.dependsOn) task(dep);
    const created = newTask({
      projectId: input.projectId, parentId: input.parentId, title: input.title, description: input.description, kind: input.kind,
      role: input.role ?? roleForKind(input.kind), priority: input.priority, dependsOn: input.dependsOn,
      maxAttempts: input.maxAttempts ?? db.settings.agents.maxAttempts, acceptance: input.acceptance, plannedFiles: input.plannedFiles, source: 'user',
    });
    emit('task.updated', created);
    emitWork();
    log('info', 'tasks', `Aufgabe angelegt: ${created.title}`);
    return created;
  },
  'tasks.update': ({ id, ...patch }) => {
    const t = task(id);
    if (t.status === 'running') throw conflict('Die Aufgabe läuft gerade. Bitte zuerst pausieren.');
    for (const dep of patch.dependsOn ?? []) {
      if (dep === id) throw new MockRpcError('VALIDATION', 'Eine Aufgabe kann nicht von sich selbst abhängen.');
      task(dep);
    }
    for (const a of db.approvals.filter((x) => x.taskId === id && x.status === 'pending')) {
      Object.assign(a, { status: 'expired', decidedAt: now() });
      emit('approval.updated', a);
    }
    return touchTask(t, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<Task>);
  },
  'tasks.setPriority': ({ id, priority }) => touchTask(task(id), { priority }),
  'tasks.start': ({ id }) => {
    const t = task(id);
    if (t.status === 'running' || t.status === 'waiting_approval') throw conflict('Die Aufgabe läuft bereits.');
    if (t.status === 'paused') throw conflict('Die Aufgabe ist pausiert. Bitte „Fortsetzen“ verwenden.');
    if (t.status === 'done') throw conflict('Die Aufgabe ist schon erledigt. Für einen neuen Durchlauf bitte „Wiederholen“ verwenden.');
    touchTask(t, { status: 'queued', blocker: null, blockerCode: null, finishedAt: null, startRequested: true });
    emitWork();
    log('info', 'scheduler', `Aufgabe eingeplant: ${t.title}`);
    return t;
  },
  'tasks.pause': ({ id }) => {
    const t = task(id);
    if (!['running', 'queued', 'waiting_approval', 'blocked'].includes(t.status)) throw conflict('Nur laufende oder wartende Aufgaben können pausiert werden.');
    const r = runOfTask(id);
    if (r && LIVE_RUN.has(r.status)) {
      touchRun(r, { status: 'paused', lastAction: 'Vom Benutzer pausiert' });
      addStep(r, 'status', 'Vom Benutzer pausiert');
    }
    touchTask(t, { status: 'paused' });
    emitWork();
    log('info', 'scheduler', `Aufgabe pausiert: ${t.title}`);
    return t;
  },
  'tasks.resume': ({ id }) => {
    const t = task(id);
    if (t.status !== 'paused') throw conflict('Nur pausierte Aufgaben können fortgesetzt werden.');
    const r = runOfTask(id);
    const resumeRun = !!r && r.status === 'paused' && effectiveWork(project(t.projectId)) === 'running';
    if (r && resumeRun) {
      touchRun(r, { status: 'running', lastAction: 'Arbeitet weiter' });
      addStep(r, 'status', 'Fortgesetzt');
    }
    touchTask(t, { status: resumeRun ? 'running' : 'queued', startRequested: true });
    pausedByWork.delete(id);
    emitWork();
    log('info', 'scheduler', `Aufgabe fortgesetzt: ${t.title}`);
    return t;
  },
  'tasks.stop': ({ id }) => {
    const t = task(id);
    if (['done', 'cancelled', 'failed'].includes(t.status)) throw conflict('Die Aufgabe ist bereits beendet.');
    const r = runOfTask(id);
    if (r && (LIVE_RUN.has(r.status) || r.status === 'blocked')) touchRun(r, { status: 'cancelled', endedAt: now(), lastAction: 'Vom Benutzer gestoppt', pendingApprovalId: null });
    for (const a of db.approvals.filter((x) => x.taskId === id && x.status === 'pending')) {
      Object.assign(a, { status: 'expired', decidedAt: now() });
      emit('approval.updated', a);
    }
    touchTask(t, { status: 'cancelled', finishedAt: now(), blocker: null, blockerCode: null });
    emitWork();
    log('info', 'scheduler', `Aufgabe gestoppt: ${t.title} (Dateien bleiben unverändert)`);
    return t;
  },
  'tasks.retry': ({ id }) => {
    const t = task(id);
    if (!['failed', 'blocked', 'cancelled', 'interrupted', 'done'].includes(t.status)) throw conflict('Diese Aufgabe kann gerade nicht wiederholt werden.');
    touchTask(t, { status: 'queued', blocker: null, blockerCode: null, result: null, finishedAt: null, attempts: 0, startRequested: true, verification: { status: 'not_run', checks: [] } });
    emitWork();
    log('info', 'scheduler', `Aufgabe wird wiederholt: ${t.title}`);
    return t;
  },
  'tasks.delete': ({ id }) => {
    const t = task(id);
    if (t.status === 'running' || t.status === 'waiting_approval') throw conflict('Laufende Aufgaben können nicht gelöscht werden. Bitte zuerst stoppen.');
    const dependents = db.tasks.filter((x) => x.dependsOn.includes(id) && OPEN_TASK.has(x.status));
    if (dependents.length) throw new MockRpcError('CONFLICT', `Andere Aufgaben hängen davon ab: ${dependents.map((d) => `„${d.title}“`).join(', ')}.`, { taskIds: dependents.map((d) => d.id) });
    db.tasks = db.tasks.filter((x) => x.id !== id);
    emit('task.removed', { id, projectId: t.projectId });
    emitWork();
    log('info', 'tasks', `Aufgabe gelöscht: ${t.title}`);
    return { ok: true as const };
  },
  'tasks.notes': ({ taskId }) => {
    task(taskId);
    return db.notes.filter((n) => n.taskId === taskId).sort((a, b) => a.createdAt - b.createdAt);
  },
  'tasks.addNote': ({ taskId, text }) => {
    const t = task(taskId);
    const openQuestion = db.notes.some((n) => n.taskId === taskId && n.kind === 'question' && !db.notes.some((a) => a.taskId === taskId && a.kind === 'answer' && a.createdAt > n.createdAt));
    const note: TaskNote = {
      id: nid('note'), taskId, projectId: t.projectId, author: 'user', kind: openQuestion ? 'answer' : 'note', text, options: [], assumption: null, createdAt: now(),
      consumedRunId: null,
    };
    db.notes.push(note);
    emit('task.note', note);
    if (t.status === 'blocked' && t.blockerCode === 'NEEDS_INPUT') {
      touchTask(t, { status: 'queued', blocker: null, blockerCode: null });
      emitWork();
    }
    log('info', 'tasks', `${note.kind === 'answer' ? 'Antwort' : 'Hinweis'} an den Agenten: ${t.title}`);
    return note;
  },
  'tasks.createFix': ({ projectId, checkRunId, errorId, note }) => {
    project(projectId);
    let title = 'Fehler beheben';
    let description = '';
    if (checkRunId) {
      const c = db.checks.find((x) => x.id === checkRunId);
      if (!c) throw notFound('Die Prüfung');
      title = `${c.kind === 'test' ? 'Fehlgeschlagene Tests' : c.kind === 'build' ? 'Build-Fehler' : 'Prüfungsfehler'} beheben`;
      description = c.failures.length ? c.failures.map((f) => `- ${f.file ?? ''}${f.line != null ? `:${f.line}` : ''} ${f.message}`).join('\n') : c.outputTail;
    } else if (errorId) {
      const e = db.errors.find((x) => x.id === errorId);
      if (!e) throw notFound('Der Fehler');
      title = `Reparieren: ${e.title}`;
      description = `${e.whatHappened}${e.details ? `\n\nTechnische Details:\n${e.details}` : ''}`;
    } else {
      throw new MockRpcError('VALIDATION', 'Bitte eine Prüfung oder einen Fehler angeben.');
    }
    if (note) description = `${description}\n\nHinweis: ${note}`;
    const fix = newTask({ projectId, title, description, kind: 'fix', role: 'tester', priority: 2, source: 'user' });
    emit('task.updated', fix);
    emitWork();
    log('info', 'tasks', `Reparatur-Aufgabe angelegt: ${title}`);
    return fix;
  },
  'tasks.plan': ({ projectId, goal }) => {
    const p = project(projectId);
    const title = goal.length > 70 ? `${goal.slice(0, 69).trimEnd()}…` : goal;
    const plan = newTask({ projectId, title: `Ziel planen: ${title}`, description: goal, kind: 'plan', role: 'planner', priority: 2, source: 'user', verification: { status: 'unavailable', checks: [] } });
    emit('task.updated', plan);
    emitWork();
    log('info', 'planner', `Neues Ziel für ${p.name}: ${title}`);
    liveLater(2500, () => {
      if (!db.tasks.includes(plan) || plan.status !== 'queued') return;
      touchTask(plan, { status: 'running', startedAt: now(), model: `${OLLAMA}/qwen2.5-coder:14b` });
      liveLater(4000, () => {
        if (plan.status !== 'running') return;
        const subtitles = [`Anforderungen klären: ${title}`, `Umsetzen: ${title}`, `Tests schreiben: ${title}`];
        let prev: string | null = null;
        for (const st of subtitles) {
          const test = st.startsWith('Tests');
          const sub = newTask({ projectId, parentId: plan.id, title: st, kind: test ? 'test' : 'code', role: test ? 'tester' : 'coder', dependsOn: prev ? [prev] : [], source: 'planner' });
          emit('task.updated', sub);
          prev = sub.id;
        }
        touchTask(plan, { status: 'done', finishedAt: now(), result: `${subtitles.length} Aufgaben angelegt.`, attempts: 1 });
        emitWork();
      });
    });
    return plan;
  },
  'work.status': () => workStatus(),
  'work.start': ({ projectId }) => setWork('running', projectId),
  'work.pause': ({ projectId }) => {
    const affected = db.runs.filter((r) => r.status === 'running' && (!projectId || r.projectId === projectId));
    for (const r of affected) {
      touchRun(r, { status: 'paused', lastAction: 'Pausiert (Arbeit angehalten)' });
      const t = db.tasks.find((x) => x.id === r.taskId);
      if (t && t.status === 'running') {
        touchTask(t, { status: 'paused' });
        pausedByWork.add(t.id);
      }
    }
    return setWork('paused', projectId);
  },
  'work.resume': ({ projectId }) => {
    const result = setWork('running', projectId);
    for (const id of [...pausedByWork]) {
      const t = db.tasks.find((x) => x.id === id);
      if (!t || (projectId && t.projectId !== projectId) || effectiveWork(project(t.projectId)) !== 'running') continue;
      const r = runOfTask(id);
      if (t.status === 'paused') touchTask(t, { status: 'running' });
      if (r && r.status === 'paused') touchRun(r, { status: 'running', lastAction: 'Arbeitet weiter' });
      pausedByWork.delete(id);
    }
    emitWork();
    return projectId ? result : workStatus();
  },
  'work.stop': ({ projectId }) => {
    for (const r of db.runs.filter((x) => x.status === 'running' && (!projectId || x.projectId === projectId))) {
      touchRun(r, { status: 'cancelled', endedAt: now(), lastAction: 'Gestoppt (Arbeit beendet)' });
      const t = db.tasks.find((x) => x.id === r.taskId);
      if (t && t.status === 'running') touchTask(t, { status: 'queued' });
    }
    for (const id of [...pausedByWork]) {
      const t = db.tasks.find((x) => x.id === id);
      if (!projectId || t?.projectId === projectId) pausedByWork.delete(id);
    }
    return setWork('stopped', projectId);
  },
  'agents.roles': () => db.roles,
  'agents.runs': ({ projectId, taskId, activeOnly, limit }) =>
    db.runs
      .filter((r) => (!projectId || r.projectId === projectId) && (!taskId || r.taskId === taskId) && (!activeOnly || ACTIVE_RUN.has(r.status)))
      .sort((a, b) => Number(ACTIVE_RUN.has(b.status)) - Number(ACTIVE_RUN.has(a.status)) || b.startedAt - a.startedAt)
      .slice(0, limit),
  'agents.steps': ({ runId, afterId, limit }) =>
    db.steps
      .filter((s) => s.runId === runId && (afterId === undefined || s.id > afterId))
      .sort((a, b) => a.id - b.id)
      .slice(0, limit),
  'errors.list': ({ projectId, includeResolved, limit }) =>
    db.errors
      .filter((e) => (!projectId || e.projectId === projectId) && (includeResolved || !e.resolvedAt))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit),
  'errors.resolve': ({ id }) => {
    const e = db.errors.find((x) => x.id === id);
    if (!e) throw notFound('Der Fehler');
    e.resolvedAt = now();
    emit('error.resolved', { id });
    log('info', 'errors', `Fehler als erledigt markiert: ${e.title}`);
    return { ok: true as const };
  },

  // --- approvals ------------------------------------------------------------------
  'approvals.list': ({ status, projectId }) =>
    db.approvals.filter((a) => (!status || a.status === status) && (!projectId || a.projectId === projectId)).sort((a, b) => b.createdAt - a.createdAt),
  'approvals.decide': ({ id, decision, scope }) => {
    const a = db.approvals.find((x) => x.id === id);
    if (!a) throw notFound('Die Freigabe');
    if (a.status !== 'pending') throw conflict('Diese Freigabe wurde bereits entschieden.');
    if (decision === 'approve' && scope === 'always' && APPROVAL_KINDS_ONCE_ONLY.includes(a.kind)) {
      throw new MockRpcError('VALIDATION', 'Diese Art von Aktion muss jedes Mal einzeln erlaubt werden.');
    }
    Object.assign(a, { status: decision === 'approve' ? 'approved' : 'denied', scope: decision === 'approve' ? scope : null, decidedAt: now() });
    emit('approval.updated', a);
    if (decision === 'approve' && scope === 'always') {
      const projectName = a.projectId ? db.projects.find((p) => p.id === a.projectId)?.name : null;
      db.rules.push({ id: nid('rule'), projectId: a.projectId, kind: a.kind, fingerprint: a.fingerprint, description: `${a.title}${projectName ? ` (Projekt ${projectName})` : ''}`, createdAt: now() });
    }
    const t = a.taskId ? db.tasks.find((x) => x.id === a.taskId) : undefined;
    const r = a.runId ? db.runs.find((x) => x.id === a.runId) : undefined;
    if (decision === 'approve') {
      if (r && r.status === 'waiting_approval') {
        touchRun(r, { status: 'running', pendingApprovalId: null, lastAction: 'Freigabe erhalten – arbeitet weiter' });
        addStep(r, 'approval', scope === 'always' ? 'Freigabe erteilt (immer)' : 'Freigabe erteilt (einmal)');
      }
      if (t && t.status === 'waiting_approval') touchTask(t, { status: 'running', blocker: null });
      if (a.kind === 'install') {
        liveLater(3000, () => {
          const integ = db.integrations.find((i) => a.details.integrationId === i.id);
          if (!integ) return;
          Object.assign(integ, { available: true, message: `${integ.name} wurde installiert.`, checkedAt: now(), version: integ.version ?? '1.0.0' });
          emit('integrations.updated', db.integrations);
        });
      }
    } else {
      if (r && r.status === 'waiting_approval') {
        touchRun(r, { status: 'blocked', pendingApprovalId: null, blocker: `Freigabe abgelehnt: ${a.title}`, lastAction: 'Freigabe abgelehnt' });
        addStep(r, 'approval', 'Freigabe abgelehnt');
      }
      if (t && t.status === 'waiting_approval') touchTask(t, { status: 'blocked', blocker: `Freigabe abgelehnt: ${a.title}. Die Aufgabe braucht einen anderen Weg oder eine neue Beschreibung.` });
    }
    emitWork();
    log('info', 'approvals', `Freigabe ${decision === 'approve' ? `erteilt (${scope === 'always' ? 'immer' : 'einmal'})` : 'abgelehnt'}: ${a.title}`);
    return a;
  },
  'approvals.rules': () => [...db.rules].sort((a, b) => b.createdAt - a.createdAt),
  'approvals.deleteRule': ({ id }) => {
    if (!db.rules.some((r) => r.id === id)) throw notFound('Die Regel');
    db.rules = db.rules.filter((r) => r.id !== id);
    log('info', 'approvals', 'Dauerhafte Freigabe entfernt');
    return { ok: true as const };
  },

  // --- providers / models / ollama / budget ------------------------------------------
  'providers.list': () => db.providers,
  'providers.upsert': (input) => {
    const t = now();
    const existing = input.id ? db.providers.find((x) => x.id === input.id) : undefined;
    if (input.options && Object.keys(input.options).some((k) => /key|token|secret|password/i.test(k))) {
      throw new MockRpcError('VALIDATION', 'Optionen dürfen keine Schlüssel enthalten. Den API-Schlüssel bitte separat speichern.');
    }
    let p: ProviderConfig;
    if (existing) {
      if (input.type !== existing.type) throw new MockRpcError('VALIDATION', 'Die Art eines Anbieters kann nicht geändert werden.');
      const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      Object.assign(existing, patch, { id: existing.id, updatedAt: t });
      p = existing;
    } else {
      const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(input.baseUrl);
      const slug = (input.id ?? input.name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'anbieter';
      let id = slug;
      for (let i = 2; db.providers.some((x) => x.id === id); i++) id = `${slug}-${i}`;
      p = {
        id, type: input.type, name: input.name, baseUrl: input.baseUrl, enabled: input.enabled ?? true,
        paid: input.paid ?? (input.type !== 'ollama' && !local), approved: input.approved ?? input.type === 'ollama',
        hasApiKey: false, options: input.options ?? {}, createdAt: t, updatedAt: t,
      };
      db.providers.push(p);
      db.providerHealth.push({ providerId: p.id, status: p.type === 'ollama' ? 'ok' : 'not_configured', message: p.type === 'ollama' ? 'Erreichbar.' : 'Es ist noch kein API-Schlüssel gespeichert.', version: null, checkedAt: t, latencyMs: null });
    }
    if (p.type === 'ollama') {
      p.paid = false;
      p.approved = true;
      if (p.id === OLLAMA) db.ollama = { ...db.ollama, baseUrl: p.baseUrl };
    }
    emit('provider.updated', p);
    log('info', 'providers', `Anbieter gespeichert: ${p.name}`);
    return p;
  },
  'providers.remove': ({ id }) => {
    if (id === OLLAMA) throw conflict('Der lokale Ollama-Anbieter kann nicht entfernt werden.');
    if (!db.providers.some((p) => p.id === id)) throw notFound('Der Anbieter');
    db.providers = db.providers.filter((p) => p.id !== id);
    db.providerHealth = db.providerHealth.filter((h) => h.providerId !== id);
    db.models = db.models.filter((m) => m.providerId !== id);
    emit('provider.removed', { id });
    return { ok: true as const };
  },
  'providers.setApiKey': ({ providerId }) => {
    const p = db.providers.find((x) => x.id === providerId);
    if (!p) throw notFound('Der Anbieter');
    p.hasApiKey = true;
    p.updatedAt = now();
    db.apiKeys[providerId] = true;
    emit('provider.updated', p);
    log('info', 'providers', `API-Schlüssel gespeichert für ${p.name} (im Windows-Tresor)`);
    return { ok: true as const };
  },
  'providers.clearApiKey': ({ providerId }) => {
    const p = db.providers.find((x) => x.id === providerId);
    if (!p) throw notFound('Der Anbieter');
    p.hasApiKey = false;
    p.updatedAt = now();
    delete db.apiKeys[providerId];
    emit('provider.updated', p);
    return { ok: true as const };
  },
  'providers.test': ({ providerId }) => {
    const p = db.providers.find((x) => x.id === providerId);
    if (!p) throw notFound('Der Anbieter');
    const t = now();
    const health =
      !p.enabled
        ? { providerId, status: 'disabled' as const, message: 'Der Anbieter ist ausgeschaltet.', version: null, checkedAt: t, latencyMs: null }
        : p.type !== 'ollama' && !p.hasApiKey && p.paid
          ? { providerId, status: 'auth_error' as const, message: 'Es ist kein API-Schlüssel gespeichert.', version: null, checkedAt: t, latencyMs: null }
          : {
              providerId,
              status: 'ok' as const,
              message: p.type === 'ollama' ? `Ollama läuft (Version ${db.ollama.version}).` : p.approved ? 'Erreichbar.' : 'Erreichbar. Die kostenpflichtige Nutzung ist noch nicht freigegeben.',
              version: p.type === 'ollama' ? db.ollama.version : null,
              checkedAt: t,
              latencyMs: p.type === 'ollama' ? 3 + Math.round(Math.random() * 4) : 140 + Math.round(Math.random() * 90),
            };
    db.providerHealth = [...db.providerHealth.filter((h) => h.providerId !== providerId), health];
    return health;
  },
  'providers.health': () => db.providerHealth,
  'models.list': () => db.models.filter((m) => db.providers.find((p) => p.id === m.providerId)?.enabled),
  'models.getSelection': () => db.settings.models,
  'models.setSelection': (patch) => {
    db.settings.models = { ...db.settings.models, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    emit('settings.updated', db.settings);
    log('info', 'models', 'Modellauswahl gespeichert');
    return db.settings.models;
  },
  'models.setPricing': ({ providerId, modelId, pricing }) => {
    const m = db.models.find((x) => x.providerId === providerId && x.id === modelId);
    if (!m) throw notFound('Das Modell');
    m.pricing = pricing;
    return m;
  },
  'ollama.status': ({ baseUrl }) => {
    if (!baseUrl || baseUrl.replace(/\/$/, '') === db.ollama.baseUrl.replace(/\/$/, '')) return { ...db.ollama, checkedAt: now() };
    const local = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/i.test(baseUrl);
    return {
      ...db.ollama,
      baseUrl,
      running: local && baseUrl.includes(':11434'),
      version: local && baseUrl.includes(':11434') ? db.ollama.version : null,
      message: local && baseUrl.includes(':11434') ? `Ollama läuft (Version ${db.ollama.version}).` : `Unter ${baseUrl} antwortet kein Ollama. Bitte Adresse und Port prüfen.`,
      checkedAt: now(),
    };
  },
  'ollama.models': () => localModels(),
  'ollama.show': ({ model }) => {
    const m = localModels().find((x) => x.id === model || x.id === `${model}:latest`);
    if (!m) throw notFound('Das Modell');
    return {
      model: m,
      modelfile: `FROM ${m.id}\nPARAMETER num_ctx ${m.contextLength ?? 4096}\nPARAMETER temperature 0.2`,
      license: m.family === 'llama' ? 'LLAMA 3.1 COMMUNITY LICENSE AGREEMENT (Auszug)' : 'Apache License 2.0',
      parameters: 'stop "<|im_end|>"\nnum_ctx 32768',
    };
  },
  'ollama.pull': ({ model }) => {
    if (!db.ollama.running) throw new MockRpcError('OLLAMA_UNREACHABLE', 'Ollama ist nicht erreichbar. Bitte Ollama starten.');
    const name = model.trim();
    const existing = db.pulls.find((p) => p.model === name && p.status === 'running');
    if (existing) return existing;
    const t = now();
    const pull: OllamaPull = {
      id: nid('pull'), model: name, status: 'running', phase: 'pulling manifest', completedBytes: 0, totalBytes: KNOWN_MODEL_SIZES[name] ?? 4.1 * GB,
      percent: 0, error: null, startedAt: t, updatedAt: t,
    };
    db.pulls.push(pull);
    emit('ollama.pull', pull);
    log('info', 'ollama', `Download gestartet: ${name}`);
    simulatePull(pull);
    return pull;
  },
  'ollama.pulls': () => db.pulls,
  'ollama.cancelPull': ({ id }) => {
    const p = db.pulls.find((x) => x.id === id);
    if (!p) throw notFound('Der Download');
    if (p.status === 'running') {
      Object.assign(p, { status: 'cancelled', phase: 'abgebrochen', updatedAt: now() });
      emit('ollama.pull', p);
    }
    return p;
  },
  'ollama.delete': ({ model }) => {
    const m = localModels().find((x) => x.id === model);
    if (!m) throw notFound('Das Modell');
    db.models = db.models.filter((x) => x !== m);
    db.ollamaRunning = db.ollamaRunning.filter((r) => r.model !== model);
    emit('ollama.models.changed', { providerId: OLLAMA });
    log('info', 'ollama', `Modell gelöscht: ${model}`);
    return { ok: true as const };
  },
  'ollama.running': () => db.ollamaRunning,
  'ollama.fit': ({ model }) => {
    const gpu = db.resources.gpus[0];
    const size = localModels().find((m) => m.id === model)?.sizeBytes ?? KNOWN_MODEL_SIZES[model] ?? null;
    const available = gpu?.vramTotalBytes ?? null;
    if (size == null || available == null) {
      return { fits: null, requiredBytes: size, availableBytes: available, estimated: true, message: 'Ob das Modell in den Grafikspeicher passt, lässt sich nicht sicher sagen.', alternatives: [] };
    }
    const required = Math.round(size * 1.12 + 0.6 * GB);
    const fits = required <= available * 0.95;
    return {
      fits,
      requiredBytes: required,
      availableBytes: available,
      estimated: true,
      message: fits
        ? 'Passt in den Grafikspeicher und läuft schnell.'
        : 'Passt voraussichtlich nicht vollständig in den Grafikspeicher. Teile laufen dann auf dem Prozessor und sind deutlich langsamer.',
      alternatives: fits ? [] : ['qwen2.5-coder:14b', 'qwen2.5-coder:7b'],
    };
  },
  'budget.status': () => budgetStatus(),
  'budget.usage': ({ from, to, projectId, limit }) =>
    db.usage
      .filter((u) => (from === undefined || u.ts >= from) && (to === undefined || u.ts <= to) && (!projectId || u.projectId === projectId))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit),
  'budget.setLimits': ({ dailyLimitUsd, monthlyLimitUsd }) => {
    if (dailyLimitUsd !== undefined) db.settings.budgets.dailyLimitUsd = dailyLimitUsd;
    if (monthlyLimitUsd !== undefined) db.settings.budgets.monthlyLimitUsd = monthlyLimitUsd;
    const b = budgetStatus();
    emit('budget.updated', b);
    log('info', 'budget', 'Budget-Grenzen gespeichert');
    return b;
  },
  'budget.resumePaid': ({ projectId }) => {
    if (projectId) project(projectId);
    db.paidPaused = false;
    db.pausedReason = null;
    const b = budgetStatus();
    emit('budget.updated', b);
    return b;
  },

  // --- resources & integrations ---------------------------------------------------
  'resources.snapshot': () => db.resources,
  'resources.history': ({ minutes }) => db.resourceHistory.filter((s) => s.ts >= now() - minutes * MIN),
  'integrations.list': () => db.integrations,
  'integrations.setPath': ({ id, path }) => {
    const integ = db.integrations.find((i) => i.id === id);
    if (!integ) throw notFound('Das Werkzeug');
    if (path) {
      Object.assign(integ, { manualPath: path, path, available: true, message: 'Der manuell gewählte Pfad wird verwendet.', checkedAt: now() });
    } else {
      const fresh = createMockDb(db.now).integrations.find((i) => i.id === id)!;
      Object.assign(integ, { ...fresh, checkedAt: now() });
    }
    emit('integrations.updated', db.integrations);
    return integ;
  },
  'integrations.install': ({ id }) => {
    const integ = db.integrations.find((i) => i.id === id);
    if (!integ) throw notFound('Das Werkzeug');
    if (integ.available) return { approvalId: null, message: `${integ.name} ist bereits installiert.` };
    if (!integ.installHint?.command) {
      return { approvalId: null, message: `Für ${integ.name} gibt es keine automatische Installation.${integ.installHint?.url ? ` Bitte von ${integ.installHint.url} herunterladen.` : ''}` };
    }
    const kind: ApprovalKind = integ.installHint.requiresAdmin ? 'admin' : 'install';
    const approval: Approval = {
      id: nid('apr'), projectId: null, taskId: null, runId: null, kind, fingerprint: `${kind}:*:${integ.id}`, title: `${integ.name} installieren`,
      action: `Befehl ausführen:\n${integ.installHint.command}`,
      consequences: `Installiert ${integ.name} für diesen Windows-Benutzer${integ.installHint.requiresAdmin ? ' (benötigt Administratorrechte)' : ''}. Bestehende Projekte werden nicht verändert.`,
      details: { integrationId: integ.id, command: integ.installHint.command }, status: 'pending', scope: null, createdAt: now(), decidedAt: null,
    };
    db.approvals.push(approval);
    emit('approval.updated', approval);
    log('info', 'integrations', `Installation angefragt: ${integ.name}`);
    return { approvalId: approval.id, message: 'Eine Freigabe wurde angelegt. Nach der Bestätigung unter „Freigaben“ installiert NOVA das Werkzeug.' };
  },

  // --- memory ----------------------------------------------------------------------
  'memory.list': ({ projectId, kind, limit }) =>
    db.memory
      .filter((m) => (projectId === undefined || m.projectId === projectId) && (!kind || m.kind === kind))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit),
  'memory.search': ({ query, projectId, includeGlobal, limit }) => {
    const q = query.toLowerCase();
    return db.memory
      .filter((m) => projectId === undefined || m.projectId === projectId || (includeGlobal && m.projectId === null && (projectId === null || m.shareable)))
      .map((m) => {
        const hay = `${m.title}\n${m.content}\n${m.tags.join(' ')}`.toLowerCase();
        const score = hay.split(q).length - 1 + (m.title.toLowerCase().includes(q) ? 2 : 0);
        const idx = m.content.toLowerCase().indexOf(q);
        const snippet = idx >= 0 ? `${idx > 30 ? '…' : ''}${m.content.slice(Math.max(0, idx - 30), idx + q.length + 60)}${idx + q.length + 60 < m.content.length ? '…' : ''}` : m.content.slice(0, 100);
        return { ...m, score, snippet };
      })
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },
  'memory.add': (input) => {
    if (input.projectId) project(input.projectId);
    const t = now();
    const entry: MemoryEntry = { id: nid('mem'), ...input, source: 'user', taskId: null, createdAt: t, updatedAt: t };
    db.memory.push(entry);
    emit('memory.updated', entry);
    return entry;
  },
  'memory.update': ({ id, ...patch }) => {
    const m = db.memory.find((x) => x.id === id);
    if (!m) throw notFound('Der Eintrag');
    Object.assign(m, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: now() });
    emit('memory.updated', m);
    return m;
  },
  'memory.delete': ({ id }) => {
    const m = db.memory.find((x) => x.id === id);
    if (!m) throw notFound('Der Eintrag');
    db.memory = db.memory.filter((x) => x.id !== id);
    emit('memory.updated', { id, deleted: true, projectId: m.projectId });
    return { ok: true as const };
  },
  'memory.clear': ({ projectId }) => {
    const removed = db.memory.filter((m) => m.projectId === projectId);
    db.memory = db.memory.filter((m) => m.projectId !== projectId);
    emit('memory.updated', { projectId, cleared: true, count: removed.length });
    return { deleted: removed.length };
  },
  'memory.export': ({ projectId, path }) => {
    const name = projectId ? project(projectId).name : projectId === null ? 'wissensdatenbank' : 'alles';
    const rows = db.memory.filter((m) => projectId === undefined || m.projectId === projectId);
    return { path: path ?? `C:\\Users\\Demo\\Documents\\NOVA Export\\gedaechtnis-${name.toLowerCase()}.json`, count: rows.length };
  },
  'memory.import': ({ path }) => {
    const t = now();
    const imported: MemoryEntry[] = [
      { id: nid('mem'), projectId: null, kind: 'insight', title: 'Importiert: Git-Commits klein halten', content: 'Ein Commit pro Aufgabe macht das Zurücksetzen einfacher.', tags: ['git'], source: 'user', shareable: true, taskId: null, createdAt: t, updatedAt: t },
      { id: nid('mem'), projectId: null, kind: 'insight', title: 'Importiert: Tests vor dem Build', content: 'Erst Tests, dann Build – Fehler werden so früher sichtbar.', tags: ['tests'], source: 'user', shareable: true, taskId: null, createdAt: t, updatedAt: t },
    ];
    db.memory.push(...imported);
    for (const m of imported) emit('memory.updated', m);
    log('info', 'memory', `Wissen importiert aus ${path}`);
    return { imported: imported.length, skipped: 1 };
  },

  // --- files -------------------------------------------------------------------------
  'files.tree': ({ projectId, path, depth }) => buildTree(projectId, path, depth),
  'files.read': ({ projectId, path }) => fileContent(projectId, path),
  'files.write': ({ projectId, path, content, expectedHash }) => {
    const files = projectFiles(projectId);
    if (isBinary(projectId, path)) throw new MockRpcError('VALIDATION', 'Binärdateien können im Editor nicht gespeichert werden.');
    const exists = files[path] !== undefined;
    if (exists && expectedHash !== null && expectedHash !== fileContent(projectId, path).hash) {
      throw new MockRpcError('CONFLICT', 'Die Datei wurde inzwischen geändert (z. B. von NOVA). Bitte neu laden oder die Unterschiede ansehen.', { currentHash: fileContent(projectId, path).hash });
    }
    const previous = exists ? files[path] : null;
    files[path] = content;
    recordUserChange(projectId, path, exists ? 'modify' : 'create', previous, content);
    emit('files.changed', { projectId, paths: [path], actor: 'user' });
    return fileContent(projectId, path);
  },
  'files.search': ({ projectId, query, regex, caseSensitive, limit }) => {
    const files = projectFiles(projectId);
    let re: RegExp;
    try {
      re = new RegExp(regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? '' : 'i');
    } catch {
      throw new MockRpcError('VALIDATION', 'Der Suchausdruck ist ungültig.');
    }
    const out = [];
    for (const [path, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      if (isBinary(projectId, path)) continue;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length && out.length < limit; i++) {
        const m = re.exec(lines[i]);
        if (m) out.push({ path, line: i + 1, column: m.index + 1, preview: lines[i].trim().slice(0, 200) });
      }
    }
    return out;
  },
  'files.changed': ({ projectId }) => changedFiles(projectId),
  'files.history': ({ projectId, path, taskId, limit }) =>
    db.changes
      .filter((c) => c.projectId === projectId && (!path || c.path === path) && (!taskId || c.taskId === taskId))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit),
  'files.diff': ({ projectId, path }) => {
    if (projectFiles(projectId)[path] === undefined && !db.originals[projectId]?.[path]) throw notFound('Die Datei');
    return fileDiff(projectId, path);
  },

  // --- git & restore -----------------------------------------------------------------
  'git.status': ({ projectId }) => gitStatus(projectId),
  'git.diff': ({ projectId, path }) => {
    const status = gitStatus(projectId);
    return status.files.filter((f) => !path || f.path === path).map((f) => fileDiff(projectId, f.path));
  },
  'git.log': ({ projectId, limit }) => {
    project(projectId);
    return (db.commits[projectId] ?? []).slice(0, limit);
  },
  'git.init': ({ projectId }) => {
    const p = project(projectId);
    db.gitRepos[projectId] = true;
    p.gitAvailable = true;
    p.updatedAt = now();
    db.commits[projectId] = [
      { hash: mockHash(`${projectId}:init`).slice(0, 40), shortHash: mockHash(`${projectId}:init`).slice(0, 7), author: 'NOVA AI', date: now(), subject: 'NOVA: Git eingerichtet (erster Stand)', byNova: true },
    ];
    emit('project.updated', p);
    log('info', 'git', `Git eingerichtet für ${p.name}`);
    return gitStatus(projectId);
  },
  'checkpoints.list': ({ projectId }) => {
    project(projectId);
    return db.checkpoints.filter((c) => c.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  },
  'checkpoints.create': ({ projectId, label }) => {
    project(projectId);
    const cp = {
      id: nid('chk'), projectId, taskId: null, kind: 'manual' as const, label, gitHead: db.commits[projectId]?.[0]?.shortHash ?? null, gitCommit: null,
      changeCursor: Math.max(0, ...db.changes.map((c) => c.id)), verification: null, createdAt: now(), restoredAt: null,
    };
    db.checkpoints.push(cp);
    emit('checkpoint.updated', cp);
    log('info', 'checkpoints', `Wiederherstellungspunkt angelegt: ${label}`);
    return cp;
  },
  'checkpoints.preview': ({ checkpointId, taskId }) => restorePlan(checkpointId, taskId).result,
  'checkpoints.restore': ({ checkpointId, taskId, commit }) => {
    const { result, projectId, changeIds } = restorePlan(checkpointId, taskId);
    const pre = {
      id: nid('chk'), projectId, taskId: null, kind: 'pre_restore' as const, label: 'Vor der Wiederherstellung', gitHead: db.commits[projectId]?.[0]?.shortHash ?? null,
      gitCommit: null, changeCursor: Math.max(0, ...db.changes.map((c) => c.id)), verification: null, createdAt: now(), restoredAt: null,
    };
    db.checkpoints.push(pre);
    emit('checkpoint.updated', pre);
    const files = projectFiles(projectId);
    for (const c of db.changes) if (changeIds.includes(c.id)) c.reverted = true;
    for (const path of result.restored) {
      const created = db.changes.some((c) => c.projectId === projectId && c.path === path && c.op === 'create' && changeIds.includes(c.id));
      if (created) delete files[path];
      else if (db.originals[projectId]?.[path] !== undefined) files[path] = db.originals[projectId][path];
    }
    const cp = checkpointId ? db.checkpoints.find((c) => c.id === checkpointId) : undefined;
    if (cp) cp.restoredAt = now();
    let commitHash: string | null = null;
    if (commit && db.gitRepos[projectId] && result.restored.length) {
      commitHash = mockHash(`${projectId}:restore:${now()}`).slice(0, 40);
      db.commits[projectId] = [{ hash: commitHash, shortHash: commitHash.slice(0, 7), author: 'NOVA AI', date: now(), subject: `NOVA: ${result.restored.length} Datei(en) wiederhergestellt`, byNova: true }, ...(db.commits[projectId] ?? [])];
    }
    if (result.restored.length) emit('files.changed', { projectId, paths: result.restored, actor: 'nova' });
    log('info', 'checkpoints', `Wiederherstellung: ${result.restored.length} Datei(en), ${result.conflicts.length} Konflikt(e)`);
    return { ...result, commit: commitHash, checkpointId: pre.id };
  },

  // --- processes / terminal / checks / preview ------------------------------------------
  'processes.list': ({ projectId, includeExited }) =>
    db.processes.filter((p) => (!projectId || p.projectId === projectId) && (includeExited || p.status === 'running')).sort((a, b) => b.startedAt - a.startedAt),
  'processes.kill': ({ id }) => {
    const p = db.processes.find((x) => x.id === id);
    if (!p) throw notFound('Der Prozess');
    if (p.status === 'running') {
      Object.assign(p, { status: 'killed', endedAt: now(), exitCode: null });
      emit('process.updated', p);
      for (const pv of Object.values(db.previews)) {
        if (pv.processId === id) {
          Object.assign(pv, { state: 'stopped', url: null, processId: null, message: 'Die Vorschau ist gestoppt.' });
          emit('preview.updated', pv);
        }
      }
    }
    return p;
  },
  'processes.output': ({ id, tailLines }) => {
    if (!db.processes.some((p) => p.id === id)) throw notFound('Der Prozess');
    return { output: (db.processOutput[id] ?? '').split('\n').slice(-tailLines).join('\n') };
  },
  'terminal.create': ({ projectId }) => {
    const p = project(projectId);
    const session = { id: nid('term'), projectId, cwd: p.path, shell: 'powershell', busy: false, createdAt: now() };
    db.terminals.push(session);
    return session;
  },
  'terminal.list': ({ projectId }) => db.terminals.filter((t) => !projectId || t.projectId === projectId),
  'terminal.run': ({ sessionId, line }) => {
    const s = db.terminals.find((t) => t.id === sessionId);
    if (!s) throw notFound('Die Terminal-Sitzung');
    if (s.busy) return { accepted: false };
    const cmd = line.trim();
    const out = (stream: 'stdout' | 'stderr' | 'system', data: string) => emit('terminal.output', { sessionId, projectId: s.projectId, stream, data });
    const finish = (exitCode: number) => {
      s.busy = false;
      emit('terminal.exit', { sessionId, projectId: s.projectId, exitCode, cwd: s.cwd });
    };
    if (!cmd) {
      finish(0);
      return { accepted: true };
    }
    s.busy = true;
    const files = Object.keys(projectFiles(s.projectId));
    const root = project(s.projectId).path;
    const rel = s.cwd.startsWith(root) ? s.cwd.slice(root.length).replace(/^\\/, '').replace(/\\/g, '/') : '';
    const respond = () => {
      if (/^cd(\s|$)/i.test(cmd)) {
        const target = cmd.slice(2).trim();
        if (!target || target === '.') return finish(0);
        if (target === '..') {
          if (s.cwd !== root) s.cwd = s.cwd.slice(0, s.cwd.lastIndexOf('\\'));
          return finish(0);
        }
        const next = (rel ? `${rel}/` : '') + target.replace(/\\/g, '/').replace(/\/$/, '');
        if (files.some((f) => f.startsWith(`${next}/`))) {
          s.cwd = `${root}\\${next.replace(/\//g, '\\')}`;
          return finish(0);
        }
        out('stderr', `cd: Der Ordner „${target}“ wurde nicht gefunden.\r\n`);
        return finish(1);
      }
      if (/^(ls|dir)\b/i.test(cmd)) {
        const pre = rel ? `${rel}/` : '';
        const names = [...new Set(files.filter((f) => f.startsWith(pre)).map((f) => f.slice(pre.length).split('/')[0]))].sort();
        out('stdout', `${names.join('\r\n')}\r\n`);
        return finish(0);
      }
      if (/^echo\s/i.test(cmd)) {
        out('stdout', `${cmd.slice(5)}\r\n`);
        return finish(0);
      }
      if (/^node\s+(-v|--version)$/i.test(cmd)) {
        out('stdout', 'v22.14.0\r\n');
        return finish(0);
      }
      if (/^npm\s+(-v|--version)$/i.test(cmd)) {
        out('stdout', '10.9.2\r\n');
        return finish(0);
      }
      if (/^git\s+status/i.test(cmd)) {
        const st = gitStatus(s.projectId);
        if (!st.isRepo) {
          out('stderr', 'fatal: not a git repository (or any of the parent directories): .git\r\n');
          return finish(128);
        }
        out('stdout', `On branch main\r\n${st.files.length ? `Changes not staged for commit:\r\n${st.files.map((f) => `\tmodified:   ${f.path}`).join('\r\n')}\r\n` : 'nothing to commit, working tree clean\r\n'}`);
        return finish(0);
      }
      if (/^npm\s+(test|run\s+test)/i.test(cmd)) {
        out('stdout', '\r\n> vitest run\r\n\r\n RUN  v2.1.4\r\n\r\n');
        const lines = s.projectId === 'prj_pixel'
          ? [' ✓ tests/menu.test.ts (19)\r\n', ' ❯ tests/player.test.ts (5)\r\n   × bleibt an der rechten Plattformkante stehen\r\n', '\r\n Tests  2 failed | 22 passed (24)\r\n']
          : [' ✓ tests/recipes.test.ts (12)\r\n', ' ✓ tests/search.test.ts (3)\r\n', '\r\n Tests  15 passed (15)\r\n'];
        const failed = s.projectId === 'prj_pixel';
        if (!options.live) {
          for (const l of lines) out('stdout', l);
          return finish(failed ? 1 : 0);
        }
        lines.forEach((l, i) => later(400 * (i + 1), () => s.busy && out('stdout', l)));
        later(400 * (lines.length + 1), () => s.busy && finish(failed ? 1 : 0));
        return;
      }
      out('system', `In der Demo werden keine echten Befehle ausgeführt („${cmd}“).\r\n`);
      return finish(0);
    };
    if (options.live) later(150, respond);
    else respond();
    return { accepted: true };
  },
  'terminal.interrupt': ({ sessionId }) => {
    const s = db.terminals.find((t) => t.id === sessionId);
    if (!s) throw notFound('Die Terminal-Sitzung');
    if (s.busy) {
      s.busy = false;
      emit('terminal.output', { sessionId, projectId: s.projectId, stream: 'system', data: '^C\r\n' });
      emit('terminal.exit', { sessionId, projectId: s.projectId, exitCode: 130, cwd: s.cwd });
    }
    return { ok: true as const };
  },
  'terminal.close': ({ sessionId }) => {
    db.terminals = db.terminals.filter((t) => t.id !== sessionId);
    return { ok: true as const };
  },
  'checks.list': ({ projectId, kind, taskId, limit }) =>
    db.checks
      .filter((c) => c.projectId === projectId && (!kind || c.kind === kind) && (!taskId || c.taskId === taskId))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit),
  'checks.get': ({ id }) => {
    const c = db.checks.find((x) => x.id === id);
    if (!c) throw notFound('Die Prüfung');
    return c;
  },
  'checks.run': ({ projectId, kind }) => {
    const p = project(projectId);
    const command = checkCommand(p, kind);
    if (!command) throw conflict(`Für dieses Projekt ist kein ${CHECK_TEXT[kind]} eingerichtet – Prüfung nicht möglich.`);
    if (db.checks.some((c) => c.projectId === projectId && c.kind === kind && c.status === 'running')) throw conflict('Diese Prüfung läuft bereits.');
    const c: CheckRun = {
      id: nid('crun'), projectId, taskId: null, kind, command, status: 'running', passed: null, failed: null, skipped: null, durationMs: null,
      outputTail: `> ${command}\n`, failures: [], failureSignature: null, message: null, processId: nid('proc'), artifacts: [], startedAt: now(), finishedAt: null,
    };
    db.checks.push(c);
    emit('check.updated', c);
    log('info', 'checks', `Prüfung gestartet: ${command} (${p.name})`);
    liveLater(2500, () => {
      if (c.status !== 'running') return;
      const failing = kind === 'test' && projectId === 'prj_pixel';
      const previousFailures = db.checks.find((x) => x.id === 'crun_px_t2')?.failures ?? [];
      Object.assign(c, failing
        ? { status: 'failed', passed: 22, failed: 2, skipped: 0, failures: previousFailures, failureSignature: 'player.test.ts:48|player.test.ts:63', outputTail: `${c.outputTail}Tests  2 failed | 22 passed (24)\n` }
        : { status: 'passed', passed: kind === 'test' ? 24 : null, failed: kind === 'test' ? 0 : null, skipped: kind === 'test' ? 0 : null, outputTail: `${c.outputTail}✓ fertig\n` });
      c.finishedAt = now();
      c.durationMs = c.finishedAt - c.startedAt;
      emit('check.updated', c);
      log(failing ? 'warn' : 'info', 'checks', `Prüfung ${failing ? 'fehlgeschlagen' : 'bestanden'}: ${command}`);
    });
    return c;
  },
  'preview.status': ({ projectId }) => {
    project(projectId);
    return db.previews[projectId];
  },
  'preview.start': ({ projectId }) => {
    const p = project(projectId);
    const pv = db.previews[projectId];
    if (pv.state === 'unsupported' || pv.state === 'running') return pv;
    const url = p.config.preview.url ?? 'http://127.0.0.1:5173/';
    const run = () => {
      const proc = { id: nid('proc'), projectId, taskId: null, kind: 'preview' as const, command: p.config.commands.dev ?? 'npm run dev', cwd: p.path, pid: 20000 + Math.round(Math.random() * 9000), status: 'running' as const, exitCode: null, url, startedAt: now(), endedAt: null };
      db.processes.push(proc);
      emit('process.updated', proc);
      Object.assign(pv, { state: 'running', url, processId: proc.id, message: 'Die Vorschau läuft.', reloadToken: pv.reloadToken + 1 });
      emit('preview.updated', pv);
    };
    if (options.live) {
      Object.assign(pv, { state: 'starting', message: 'Die Vorschau wird gestartet …' });
      emit('preview.updated', pv);
      later(1200, run);
    } else {
      run();
    }
    return pv;
  },
  'preview.stop': ({ projectId }) => {
    project(projectId);
    const pv = db.previews[projectId];
    if (pv.state === 'unsupported') return pv;
    const proc = db.processes.find((x) => x.id === pv.processId);
    if (proc && proc.status === 'running') {
      Object.assign(proc, { status: 'killed', endedAt: now() });
      emit('process.updated', proc);
    }
    Object.assign(pv, { state: 'stopped', url: null, processId: null, message: 'Die Vorschau ist gestoppt.' });
    emit('preview.updated', pv);
    return pv;
  },

  // --- settings / backup / data --------------------------------------------------------
  'settings.get': () => db.settings,
  'settings.update': (patch) => {
    const merged: Record<string, unknown> = { ...db.settings };
    for (const [section, values] of Object.entries(patch)) {
      if (!(section in db.settings)) throw new MockRpcError('VALIDATION', `Unbekannter Einstellungsbereich: ${section}`, { issues: [{ path: [section], message: 'Unbekannter Bereich' }] });
      merged[section] = { ...(db.settings as Record<string, Record<string, unknown>>)[section], ...values };
    }
    const parsed = SettingsSchema.safeParse(merged);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message }));
      throw new MockRpcError('VALIDATION', `Ungültige Einstellung: ${issues[0]?.path.join('.')}`, { issues });
    }
    db.settings = parsed.data;
    emit('settings.updated', db.settings);
    log('info', 'settings', `Einstellungen gespeichert (${Object.keys(patch).join(', ')})`);
    return db.settings;
  },
  'backup.list': () => [...db.backups].sort((a, b) => b.createdAt - a.createdAt),
  'backup.create': ({ reason }) => {
    const b = { id: nid('bak'), kind: 'database' as const, path: `${db.daemon.dataDir}\\backups\\nova-${new Date().toISOString().slice(0, 10)}-${db.counter}.db`, sizeBytes: 4.3 * MB, reason, projectId: null, createdAt: now() };
    db.backups.push(b);
    log('info', 'backup', `Datensicherung erstellt (${reason})`);
    return b;
  },
  'backup.snapshotProject': ({ projectId }) => {
    const p = project(projectId);
    const b = { id: nid('bak'), kind: 'project_snapshot' as const, path: `${db.daemon.dataDir}\\backups\\${p.name}-${new Date().toISOString().slice(0, 10)}`, sizeBytes: 1.7 * MB, reason: 'manuell', projectId, createdAt: now() };
    db.backups.push(b);
    return b;
  },
  'data.export': ({ sections, path }) => {
    const counts: Record<string, number> = {};
    for (const s of sections) {
      counts[s] = s === 'projects' ? db.projects.length : s === 'tasks' ? db.tasks.length : s === 'memory' ? db.memory.length : s === 'providers' ? db.providers.length : 1;
    }
    return { path: path ?? `C:\\Users\\Demo\\Documents\\NOVA Export\\nova-export-${new Date().toISOString().slice(0, 10)}.json`, counts };
  },
  'data.import': () => ({
    counts: { projects: 0, tasks: 0, settings: 1, memory: 4, providers: 1 },
    warnings: ['Anbieter wurden ohne API-Schlüssel übernommen. Bitte die Schlüssel unter „Modelle“ neu eingeben.'],
  }),
  'updates.check': () => {
    const feed = db.settings.updates.feedUrl;
    return {
      currentVersion: '0.1.0',
      latestVersion: feed ? '0.1.0' : null,
      updateAvailable: false,
      downloadUrl: null,
      notes: null,
      checkedAt: now(),
      message: feed ? 'NOVA ist auf dem neuesten Stand.' : 'Es ist keine Update-Quelle eingerichtet.',
    };
  },

  // --- added after the contract review -------------------------------------------------
  'budget.breakdown': ({ from, to, groupBy }) => {
    const rows = new Map<string, { key: string; calls: number; inputTokens: number; outputTokens: number; durationMs: number; costUsd: number; costEstimated: boolean }>();
    for (const u of db.usage) {
      if ((from !== undefined && u.ts < from) || (to !== undefined && u.ts > to)) continue;
      const d = new Date(u.ts);
      const key =
        groupBy === 'provider' ? u.providerId
        : groupBy === 'model' ? `${u.providerId}/${u.modelId}`
        : groupBy === 'project' ? (u.projectId ?? 'ohne Projekt')
        : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const r = rows.get(key) ?? { key, calls: 0, inputTokens: 0, outputTokens: 0, durationMs: 0, costUsd: 0, costEstimated: false };
      r.calls++;
      r.inputTokens += u.inputTokens;
      r.outputTokens += u.outputTokens;
      r.durationMs += u.durationMs;
      r.costUsd = Math.round((r.costUsd + u.costUsd) * 10000) / 10000;
      r.costEstimated ||= u.costEstimated;
      rows.set(key, r);
    }
    return [...rows.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls);
  },
  'integrations.open': ({ id, projectId, path, line }) => {
    const integ = db.integrations.find((i) => i.id === id);
    if (!integ) throw notFound('Das Werkzeug');
    const p = project(projectId);
    if (!integ.available || !integ.canOpen) throw conflict(`${integ.name} kann das Projekt nicht öffnen.`);
    log('info', 'integrations', `${integ.name} geöffnet: ${p.name}${path ? ` (${path}${line ? `:${line}` : ''})` : ''}`);
    return { ok: true as const };
  },
  'files.delete': ({ projectId, path }) => {
    const files = projectFiles(projectId);
    const inDir = Object.keys(files).filter((f) => f.startsWith(`${path}/`));
    if (files[path] === undefined && !inDir.length && !(db.emptyDirs[projectId] ?? []).includes(path)) throw notFound('Die Datei');
    for (const f of [path, ...inDir]) {
      if (files[f] === undefined) continue;
      recordUserChange(projectId, f, 'delete', files[f], null);
      delete files[f];
    }
    db.emptyDirs[projectId] = (db.emptyDirs[projectId] ?? []).filter((d) => d !== path && !d.startsWith(`${path}/`));
    emit('files.changed', { projectId, paths: [path, ...inDir], actor: 'user' });
    return { ok: true as const };
  },
  'files.rename': ({ projectId, from, to }) => {
    const files = projectFiles(projectId);
    if (files[to] !== undefined || Object.keys(files).some((f) => f.startsWith(`${to}/`))) throw conflict(`„${to}“ gibt es schon.`);
    const moved = Object.keys(files).filter((f) => f === from || f.startsWith(`${from}/`));
    if (!moved.length) throw notFound('Die Datei');
    for (const f of moved) {
      const target = to + f.slice(from.length);
      files[target] = files[f];
      recordUserChange(projectId, f, 'delete', files[f], null);
      recordUserChange(projectId, target, 'create', null, files[target]);
      delete files[f];
    }
    emit('files.changed', { projectId, paths: [from, to], actor: 'user' });
    return { ok: true as const };
  },
  'files.mkdir': ({ projectId, path }) => {
    const files = projectFiles(projectId);
    const clean = path.replace(/\/+$/, '');
    if (!clean) throw new MockRpcError('VALIDATION', 'Bitte einen Ordnernamen angeben.');
    if (files[clean] !== undefined) throw conflict(`„${clean}“ ist bereits eine Datei.`);
    db.emptyDirs[projectId] = [...new Set([...(db.emptyDirs[projectId] ?? []), clean])];
    emit('files.changed', { projectId, paths: [clean], actor: 'user' });
    return { ok: true as const };
  },
  'files.snapshot': ({ projectId, hash }) => {
    project(projectId);
    const content = db.snapshots[hash];
    if (content === undefined) throw notFound('Die ältere Version');
    return { content, binary: false };
  },
  'checks.cancel': ({ id }) => {
    const c = db.checks.find((x) => x.id === id);
    if (!c) throw notFound('Die Prüfung');
    if (c.status === 'running') {
      Object.assign(c, { status: 'cancelled', finishedAt: now(), durationMs: now() - c.startedAt, message: 'Vom Benutzer abgebrochen.' });
      emit('check.updated', c);
      log('info', 'checks', `Prüfung abgebrochen: ${c.command}`);
    }
    return c;
  },
  'backup.restore': ({ id, targetDir }) => {
    const b = db.backups.find((x) => x.id === id);
    if (!b) throw notFound('Die Sicherung');
    if (b.kind === 'database') {
      log('warn', 'backup', `Datenbank-Sicherung wird beim Neustart eingespielt: ${b.path}`);
      return { message: 'Die Sicherung wird eingespielt. NOVA startet dafür den Hintergrunddienst neu.', restartRequired: true, path: null };
    }
    const projectName = b.projectId ? (db.projects.find((p) => p.id === b.projectId)?.name ?? 'Projekt') : 'Projekt';
    const d = new Date();
    const target = targetDir ?? `${db.settings.general.projectsDir}\\${projectName} (Wiederherstellung ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()})`;
    log('info', 'backup', `Projektkopie wiederhergestellt nach ${target}`);
    return { message: 'Die Projektkopie wurde in einen neuen Ordner kopiert. Das Original bleibt unverändert.', restartRequired: false, path: target };
  },
  'backup.delete': ({ id }) => {
    if (!db.backups.some((b) => b.id === id)) throw notFound('Die Sicherung');
    db.backups = db.backups.filter((b) => b.id !== id);
    return { ok: true as const };
  },
  'notifications.list': ({ unreadOnly, limit }) =>
    db.notifications
      .filter((n) => !unreadOnly || n.readAt == null)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit),
  'notifications.markRead': ({ ids }) => {
    const t = now();
    for (const n of db.notifications) if (n.readAt == null && (!ids || ids.includes(n.id))) n.readAt = t;
    return { ok: true as const };
  },
  'operations.list': ({ activeOnly }) => db.operations.filter((o) => !activeOnly || o.status === 'running').sort((a, b) => b.startedAt - a.startedAt),
  'operations.get': ({ id }) => {
    const o = db.operations.find((x) => x.id === id);
    if (!o) throw notFound('Der Vorgang');
    return o;
  },
  'operations.cancel': ({ id }) => {
    const o = db.operations.find((x) => x.id === id);
    if (!o) throw notFound('Der Vorgang');
    if (o.status === 'running') {
      if (!o.cancellable) throw conflict('Dieser Vorgang kann nicht abgebrochen werden.');
      Object.assign(o, { status: 'cancelled', endedAt: now(), message: 'Vom Benutzer abgebrochen.' });
      emit('operation.updated', o);
      log('info', 'operations', `Vorgang abgebrochen: ${o.title}`);
    }
    return o;
  },
};

// ---------------------------------------------------------------------------
// Bridge
// ---------------------------------------------------------------------------

async function invoke<M extends RpcMethod>(method: M, params?: RpcParams<M>): Promise<BridgeRpcResult> {
  mockCalls.push({ method, params: clone(params) });
  if (options.latencyMs > 0) await new Promise((r) => setTimeout(r, options.latencyMs * (0.6 + Math.random() * 0.8)));
  if (connection.state !== 'connected') {
    return { ok: false, error: { code: 'DAEMON_UNAVAILABLE', message: 'Der Hintergrunddienst ist nicht verbunden.' } };
  }
  const contract = RpcContract[method];
  if (!contract) return { ok: false, error: { code: 'NOT_FOUND', message: `Unbekannte Methode: ${String(method)}` } };
  const parsed = contract.params.safeParse(params);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message }));
    return { ok: false, error: { code: 'VALIDATION', message: `Die Eingabe ist ungültig (${issues[0]?.path.join('.') || 'Parameter'}).`, details: { issues } } };
  }
  try {
    const override = mockHandlers.get(method);
    const handler = (override ?? handlers[method]) as LooseHandler;
    const result = await handler(parsed.data);
    return { ok: true, result: clone(result) };
  } catch (e) {
    if (e instanceof MockRpcError) return { ok: false, error: { code: e.code, message: e.message, details: e.details } };
    const err = e as { code?: unknown; message?: unknown };
    return { ok: false, error: { code: typeof err?.code === 'string' ? err.code : 'INTERNAL', message: typeof err?.message === 'string' ? err.message : 'Interner Fehler im Demo-Dienst.' } };
  }
}

/** The mock bridge object (singleton). */
export const mockBridge: NovaBridge = {
  invoke,
  onEvent(listener) {
    eventListeners.add(listener);
    return () => {
      eventListeners.delete(listener);
    };
  },
  daemon: {
    state: async () => ({ ...connection }),
    onState(listener) {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    restart: async () => {
      setConnection({ ...connection, state: 'starting', message: 'Der Hintergrunddienst wird neu gestartet …', since: now() });
      await new Promise<void>((resolve) => later(options.live ? 900 : 10, resolve));
      db.daemon = { ...db.daemon, startedAt: now(), pid: db.daemon.pid + 1 };
      setConnection({ ...connectedState(), daemonPid: db.daemon.pid });
      log('info', 'daemon', 'Hintergrunddienst neu gestartet');
      emitWork();
      return { ...connection };
    },
    stop: async () => {
      setConnection({ ...connection, state: 'stopped', message: 'Der Hintergrunddienst wurde beendet.', since: now(), daemonPid: null });
      return { ...connection };
    },
  },
  app: {
    version: async () => '0.1.0',
    platform: 'win32',
    openExternal: async (url) => {
      if (!/^https?:\/\//i.test(url)) return false;
      try {
        globalThis.open?.(url, '_blank', 'noopener,noreferrer');
      } catch {
        /* ignore */
      }
      return true;
    },
    openPath: async (path) => /^[a-zA-Z]:\\|^\//.test(path),
    showInFolder: async (path) => /^[a-zA-Z]:\\|^\//.test(path),
    selectDirectory: async () => `${db.settings.general.projectsDir}\\Neues Projekt`,
    selectFile: async (opts) => (opts?.filters?.some((f) => f.extensions.includes('json')) ? 'C:\\Users\\Demo\\Downloads\\wissen-export.json' : 'C:\\Program Files\\Godot\\Godot_v4.3-stable_win64.exe'),
    saveFile: async (opts) => opts?.defaultPath ?? 'C:\\Users\\Demo\\Documents\\NOVA Export\\nova-export.json',
    getAutostart: async () => db.autostart,
    setAutostart: async (enabled) => {
      db.autostart = enabled;
      return enabled;
    },
    quit: async () => {},
    onNavigate(listener) {
      navigateListeners.add(listener);
      return () => {
        navigateListeners.delete(listener);
      };
    },
  },
};

type MockGlobal = { nova?: NovaBridge; __NOVA_MOCK_BRIDGE__?: NovaBridge };

/** True when the mock bridge is installed. */
export function isMockBridgeInstalled(): boolean {
  const g = globalThis as MockGlobal;
  return g.nova === mockBridge || g.__NOVA_MOCK_BRIDGE__ === mockBridge;
}

/**
 * Installs the mock as `window.nova`. Browser dev: `installMockBridge({ latencyMs: 120, live: true })`.
 * Tests: `installMockBridge()` (no latency, no timers).
 */
export function installMockBridge(opts: MockBridgeOptions = {}): NovaBridge {
  options = { latencyMs: opts.latencyMs ?? 0, live: opts.live ?? false };
  const g = globalThis as MockGlobal;
  g.__NOVA_MOCK_BRIDGE__ = mockBridge;
  try {
    // A preload placeholder may expose a read-only, incomplete `window.nova`; getBridge() then uses the fallback.
    g.nova = mockBridge;
  } catch {
    /* read-only window.nova */
  }
  startLive();
  // Debug handle for the browser console (plain-browser demo only): __NOVA_MOCK__.setMockConnection({ state: 'error', message: '…' })
  (globalThis as { __NOVA_MOCK__?: unknown }).__NOVA_MOCK__ = { setMockConnection, emitMockEvent, resetMockData, getMockDb, mockHandlers };
  return mockBridge;
}

/** Stops live timers and removes window.nova (tests). */
export function uninstallMockBridge(): void {
  stopLive();
  for (const t of timeouts) clearTimeout(t);
  timeouts.clear();
  const g = globalThis as MockGlobal;
  if (g.__NOVA_MOCK_BRIDGE__ === mockBridge) delete g.__NOVA_MOCK_BRIDGE__;
  if (g.nova === mockBridge) {
    try {
      delete g.nova;
    } catch {
      /* ignore */
    }
  }
}

/** Fixture helpers for tests. */
export const mockFixtures = { MIN, HOUR, DAY, GB, MB };
