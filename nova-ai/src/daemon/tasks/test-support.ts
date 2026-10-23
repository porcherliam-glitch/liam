// Orchestrator – TEST-ONLY support: small hand-written fakes of the services the orchestrator talks to, plus a harness
// that wires a real TaskService + WorkCycle on a temporary database (tests/helpers/core.ts). Not exported from the
// module barrel and never bundled into the daemon.
import type {
  AgentRun,
  AgentRunStatus,
  AgentStep,
  Approval,
  CheckKind,
  CheckRun,
  CheckStatus,
  Checkpoint,
  IntegrationStatus,
  MemoryEntry,
  Notification,
  Project,
  ProjectConfig,
  ProjectSummary,
  Task,
} from '@shared/schemas';
import type {
  AgentRunInput,
  AgentRunOutcome,
  CommandDecision,
  CoreContext,
  MemoryAddInput,
  PlanOutput,
  ResolvedModel,
  ReviewOutput,
  Services,
  TaskService,
  WorkCycle,
} from '../contracts';
import { NovaError, notFound } from '../core/errors';
import { toJson } from '../db/database';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { createTaskService } from './task-service';
import { createWorkCycle, type WorkCycleOptions } from './work-cycle';

let seq = 0;
const nextSeq = () => ++seq;

export function defaultConfig(patch: Omit<Partial<ProjectConfig>, 'commands'> & { commands?: Partial<ProjectConfig['commands']> } = {}): ProjectConfig {
  const commands: ProjectConfig['commands'] = { install: null, dev: null, build: null, test: null, lint: null, typecheck: null, e2e: null, security: null, package: null, run: null };
  return {
    preview: { kind: 'none', entry: null, url: null },
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: false,
    autoCommit: false,
    monthlyBudgetUsd: null,
    conventions: '',
    artifactGlobs: [],
    engineVersion: null,
    ...patch,
    commands: { ...commands, ...(patch.commands ?? {}) },
  };
}

// ---------------------------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------------------------

export class FakeProjects {
  map = new Map<string, Project>();
  constructor(private core: CoreContext) {}

  add(patch: Partial<Project> = {}): Project {
    const id = patch.id ?? `prj_${nextSeq()}`;
    const now = Date.now();
    const p: Project = {
      id,
      name: patch.name ?? `Projekt ${id}`,
      description: patch.description ?? '',
      path: patch.path ?? `/tmp/nova-fake/${id}`,
      kind: patch.kind ?? 'web',
      technologies: patch.technologies ?? [],
      status: patch.status ?? 'active',
      templateId: null,
      origin: 'new',
      config: patch.config ?? defaultConfig(),
      workState: patch.workState ?? 'running',
      gitAvailable: false,
      createdAt: now,
      updatedAt: now,
    };
    this.core.db.run(
      `INSERT INTO projects(id, name, description, path, path_key, kind, technologies, status, template_id, config, work_state, git_available, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '[]', ?, NULL, ?, ?, 0, ?, ?)`,
      [p.id, p.name, p.description, p.path, p.path + '#' + p.id, p.kind, p.status, toJson(p.config), p.workState, now, now],
    );
    this.map.set(id, p);
    return p;
  }

  get(id: string): Project | null {
    const p = this.map.get(id);
    return p ? structuredClone(p) : null;
  }

  require(id: string): Project {
    const p = this.get(id);
    if (!p) throw notFound('Projekt', id);
    return p;
  }

  list(): ProjectSummary[] {
    return [...this.map.values()].map((p) => ({
      ...structuredClone(p),
      progress: 0,
      openTasks: 0,
      runningTasks: 0,
      failedTasks: 0,
      blockedTasks: 0,
      pausedTasks: 0,
      waitingApprovalTasks: 0,
      taskCounts: {},
      pendingApprovals: 0,
      openErrors: 0,
      lastBuild: null,
      lastSuccessfulBuild: null,
      lastTest: null,
      lastActivityAt: null,
      pathMissing: false,
    }));
  }

  setWorkState(id: string, state: Project['workState']): Project {
    const p = this.map.get(id);
    if (!p) throw notFound('Projekt', id);
    p.workState = state;
    this.core.bus.emit('project.updated', structuredClone(p));
    return structuredClone(p);
  }

  patchConfig(id: string, patch: Partial<ProjectConfig>): void {
    const p = this.map.get(id)!;
    p.config = defaultConfig({ ...p.config, ...patch, commands: { ...p.config.commands, ...(patch.commands ?? {}) } });
  }
}

// ---------------------------------------------------------------------------------------------
// Runs + agents
// ---------------------------------------------------------------------------------------------

export class FakeRunStore {
  runs = new Map<string, AgentRun & { seq: number }>();
  states = new Map<string, unknown>();
  stepsList: AgentStep[] = [];
  constructor(private core: CoreContext) {}

  create(input: { taskId: string; projectId: string; role: AgentRun['role'] }): AgentRun {
    const id = `run_${nextSeq()}`;
    const now = Date.now();
    const run = {
      id,
      taskId: input.taskId,
      projectId: input.projectId,
      role: input.role,
      status: 'running' as AgentRunStatus,
      providerId: null,
      modelId: null,
      stepCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      lastAction: null,
      blocker: null,
      files: [],
      pendingApprovalId: null,
      error: null,
      errorCode: null,
      activeMs: 0,
      startedAt: now,
      updatedAt: now,
      endedAt: null,
      seq: nextSeq(),
    };
    this.runs.set(id, run);
    this.core.bus.emit('run.updated', this.strip(run));
    return this.strip(run);
  }

  private strip(r: AgentRun & { seq: number }): AgentRun {
    const { seq: _seq, ...rest } = r;
    return structuredClone(rest);
  }

  get(id: string): AgentRun | null {
    const r = this.runs.get(id);
    return r ? this.strip(r) : null;
  }

  update(id: string, patch: Partial<AgentRun>): AgentRun {
    const r = this.runs.get(id);
    if (!r) throw notFound('Lauf', id);
    Object.assign(r, patch, { updatedAt: Date.now() });
    this.core.bus.emit('run.updated', this.strip(r));
    return this.strip(r);
  }

  list(filter: { projectId?: string; taskId?: string; activeOnly?: boolean; pendingApprovalId?: string; status?: AgentRunStatus[]; limit?: number } = {}): AgentRun[] {
    return [...this.runs.values()]
      .filter((r) => !filter.projectId || r.projectId === filter.projectId)
      .filter((r) => !filter.taskId || r.taskId === filter.taskId)
      .filter((r) => !filter.activeOnly || r.status === 'running')
      .filter((r) => !filter.pendingApprovalId || r.pendingApprovalId === filter.pendingApprovalId)
      .filter((r) => !filter.status || filter.status.includes(r.status))
      .sort((a, b) => b.seq - a.seq)
      .slice(0, filter.limit ?? 1000)
      .map((r) => this.strip(r));
  }

  latestForTask(taskId: string, role?: AgentRun['role']): AgentRun | null {
    const list = [...this.runs.values()].filter((r) => r.taskId === taskId && (!role || r.role === role)).sort((a, b) => b.seq - a.seq);
    return list[0] ? this.strip(list[0]) : null;
  }

  addStep(runId: string, kind: AgentStep['kind'], summary: string, data?: unknown): AgentStep {
    const r = this.runs.get(runId);
    const step: AgentStep = { id: this.stepsList.length + 1, runId, taskId: r?.taskId ?? '', projectId: r?.projectId ?? '', ts: Date.now(), kind, summary, data: data ?? null };
    this.stepsList.push(step);
    return step;
  }

  steps(runId: string): AgentStep[] {
    return this.stepsList.filter((s) => s.runId === runId);
  }

  saveState(runId: string, state: unknown): void {
    this.states.set(runId, state);
  }

  loadState<T>(runId: string): T | null {
    return (this.states.get(runId) as T) ?? null;
  }

  markInterrupted(): AgentRun[] {
    const out: AgentRun[] = [];
    for (const r of this.runs.values()) {
      if (r.status === 'running') {
        r.status = 'interrupted';
        out.push(this.strip(r));
      }
    }
    return out;
  }

  prune(): number {
    return 0;
  }
}

export type AgentScript = (input: AgentRunInput, run: AgentRun) => Promise<AgentRunOutcome> | AgentRunOutcome;

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isInterrupt(reason: unknown): boolean {
  return reason instanceof NovaError && reason.code === 'INTERRUPTED';
}

export const outcomes = {
  coderDone: (summary = 'Änderung umgesetzt.') => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({
    status: 'done',
    runId: run.id,
    summary,
    output: { role: 'coder', result: { summary, status: 'done', blocker: null, notes: null } },
    files: [],
  }),
  coderBlocked: (blocker: string) => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({
    status: 'done',
    runId: run.id,
    summary: 'Blockiert',
    output: { role: 'coder', result: { summary: 'Blockiert', status: 'blocked', blocker, notes: null } },
    files: [],
  }),
  testerDone: (passed: boolean | null, summary = 'Tests geprüft.') => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({
    status: 'done',
    runId: run.id,
    summary,
    output: { role: 'tester', result: { summary, passed, failures: [], fixed: false } },
    files: [],
  }),
  review: (review: Partial<ReviewOutput>) => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({
    status: 'done',
    runId: run.id,
    summary: review.summary ?? 'Review',
    output: { role: 'reviewer', review: { verdict: review.verdict ?? 'approve', summary: review.summary ?? 'Sieht gut aus.', findings: review.findings ?? [] } },
    files: [],
  }),
  plan: (plan: Partial<PlanOutput>) => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({
    status: 'done',
    runId: run.id,
    summary: plan.summary ?? 'Plan',
    output: { role: 'planner', plan: { summary: plan.summary ?? 'Plan erstellt.', tasks: plan.tasks ?? [], memory: plan.memory ?? [] } },
    files: [],
  }),
  paused: () => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({ status: 'paused', runId: run.id }),
  waiting: (approvalId: string) => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({ status: 'waiting_approval', runId: run.id, approvalId }),
  blocked: (code: string, reason: string) => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({ status: 'blocked', runId: run.id, code, reason }),
  failed: (code: string, reason: string) => (_i: AgentRunInput, run: AgentRun): AgentRunOutcome => ({ status: 'failed', runId: run.id, code, reason }),
};

/** Simulates the runner's step boundaries: checks abort/pause every few ms, finishes after `steps` steps (Infinity = until stopped). */
export function stepping(final: AgentScript, steps = Infinity, stepMs = 3): AgentScript {
  return async (input, run) => {
    for (let i = 0; ; i++) {
      await sleep(stepMs);
      if (input.signal.aborted) return isInterrupt(input.signal.reason) ? { status: 'interrupted', runId: run.id } : { status: 'cancelled', runId: run.id };
      if (input.pauseRequested()) return { status: 'paused', runId: run.id };
      if (i >= steps) return final(input, run);
    }
  };
}

/** A script that waits until released (or aborted). */
export function gate(): { script: AgentScript; release: (final?: AgentScript) => void; started: Promise<void> } {
  let release!: (final?: AgentScript) => void;
  let markStarted!: () => void;
  const started = new Promise<void>((r) => (markStarted = r));
  const released = new Promise<AgentScript | undefined>((r) => (release = r));
  return {
    started,
    release: (final) => release(final),
    script: async (input, run) => {
      markStarted();
      const abort = new Promise<'abort'>((r) => input.signal.addEventListener('abort', () => r('abort'), { once: true }));
      const res = await Promise.race([released, abort]);
      if (res === 'abort') return isInterrupt(input.signal.reason) ? { status: 'interrupted', runId: run.id } : { status: 'cancelled', runId: run.id };
      return (res ?? outcomes.coderDone())(input, run);
    },
  };
}

interface ScriptEntry {
  match: (input: AgentRunInput) => boolean;
  fn: AgentScript;
  once: boolean;
}

export class FakeAgents {
  calls: (AgentRunInput & { roleUsed: string; runId: string })[] = [];
  private scripts: ScriptEntry[] = [];
  /** Fallback when no script matches. */
  fallback: AgentScript = outcomes.coderDone();
  model = { providerId: 'ollama-local', modelId: 'qwen2.5-coder:7b' };

  constructor(private runStore: FakeRunStore) {}

  /** Adds a script for runs of a task (and optionally a role). Scripts are matched in insertion order. */
  on(match: { taskId?: string; role?: string } | ((i: AgentRunInput) => boolean), fn: AgentScript, once = true): void {
    const m = typeof match === 'function' ? match : (i: AgentRunInput) => (!match.taskId || i.task.id === match.taskId) && (!match.role || (i.role ?? i.task.role) === match.role);
    this.scripts.push({ match: m, fn, once });
  }

  callsFor(taskId: string): (AgentRunInput & { roleUsed: string; runId: string })[] {
    return this.calls.filter((c) => c.task.id === taskId);
  }

  async run(input: AgentRunInput): Promise<AgentRunOutcome> {
    const role = input.role ?? input.task.role;
    let run: AgentRun;
    const existing = input.resumeRunId ? this.runStore.get(input.resumeRunId) : null;
    if (existing && existing.role === role) run = this.runStore.update(existing.id, { status: 'running', pendingApprovalId: null });
    else run = this.runStore.create({ taskId: input.task.id, projectId: input.project.id, role });
    this.runStore.update(run.id, { providerId: this.model.providerId, modelId: this.model.modelId });
    this.calls.push({ ...input, roleUsed: role, runId: run.id });
    const idx = this.scripts.findIndex((s) => s.match(input));
    const entry = idx >= 0 ? this.scripts[idx] : null;
    if (entry?.once) this.scripts.splice(idx, 1);
    const outcome = await (entry?.fn ?? this.fallback)(input, run);
    const status: AgentRunStatus = outcome.status === 'done' ? 'done' : outcome.status;
    this.runStore.update(run.id, {
      status,
      pendingApprovalId: outcome.status === 'waiting_approval' ? outcome.approvalId : null,
      errorCode: outcome.status === 'blocked' || outcome.status === 'failed' ? outcome.code : null,
      endedAt: ['done', 'failed', 'cancelled', 'blocked'].includes(status) ? Date.now() : null,
    });
    return outcome;
  }

  roles() {
    return [];
  }

  registerRole() {}
}

// ---------------------------------------------------------------------------------------------
// Checks, checkpoints, approvals, memory, governor, models, notifications, locks, processes, misc
// ---------------------------------------------------------------------------------------------

type CheckScript = Partial<CheckRun> | ((input: { projectId: string; kind: CheckKind; taskId?: string | null; signal?: AbortSignal }) => Partial<CheckRun> | Promise<Partial<CheckRun>>);

export class FakeChecks {
  all: CheckRun[] = [];
  calls: { projectId: string; kind: CheckKind; taskId: string | null; actor?: string }[] = [];
  private queues = new Map<CheckKind, CheckScript[]>();

  /** Queue results for the next runs of a kind (FIFO). Without a queued result a run passes. */
  queue(kind: CheckKind, ...results: CheckScript[]): void {
    this.queues.set(kind, [...(this.queues.get(kind) ?? []), ...results]);
  }

  add(patch: Partial<CheckRun> & { projectId: string; kind: CheckKind }): CheckRun {
    const now = Date.now();
    const run: CheckRun = {
      id: patch.id ?? `crun_${nextSeq()}`,
      projectId: patch.projectId,
      taskId: patch.taskId ?? null,
      kind: patch.kind,
      command: patch.command ?? `npm run ${patch.kind}`,
      status: patch.status ?? 'passed',
      passed: patch.passed ?? (patch.status === undefined || patch.status === 'passed' ? 1 : 0),
      failed: patch.failed ?? (patch.status === 'failed' ? 1 : 0),
      skipped: patch.skipped ?? 0,
      durationMs: patch.durationMs ?? 5,
      outputTail: patch.outputTail ?? '',
      failures: patch.failures ?? [],
      failureSignature: patch.failureSignature ?? null,
      message: patch.message ?? null,
      processId: null,
      artifacts: [],
      startedAt: patch.startedAt ?? now,
      finishedAt: patch.finishedAt ?? now,
    };
    this.all.push(run);
    return run;
  }

  async run(input: { projectId: string; kind: CheckKind; taskId?: string | null; signal?: AbortSignal; actor?: 'user' | 'agent' | 'system' }): Promise<CheckRun> {
    this.calls.push({ projectId: input.projectId, kind: input.kind, taskId: input.taskId ?? null, actor: input.actor });
    const q = this.queues.get(input.kind) ?? [];
    const script = q.shift();
    const patch = typeof script === 'function' ? await script(input) : (script ?? {});
    return this.add({ ...patch, projectId: input.projectId, kind: input.kind, taskId: input.taskId ?? null });
  }

  get(id: string): CheckRun | null {
    return this.all.find((c) => c.id === id) ?? null;
  }

  list(projectId: string, opts: { kind?: CheckKind; taskId?: string; since?: number; limit?: number } = {}): CheckRun[] {
    return this.all
      .filter((c) => c.projectId === projectId && (!opts.kind || c.kind === opts.kind) && (!opts.taskId || c.taskId === opts.taskId) && (opts.since === undefined || c.startedAt >= opts.since))
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, opts.limit ?? 50);
  }

  recent(kind: CheckKind | CheckKind[], limit: number, status?: CheckStatus): CheckRun[] {
    const kinds = Array.isArray(kind) ? kind : [kind];
    return this.all.filter((c) => kinds.includes(c.kind) && (!status || c.status === status)).slice(-limit).reverse();
  }

  currentFailures(limit: number): CheckRun[] {
    return this.all.filter((c) => c.kind === 'test' && (c.status === 'failed' || c.status === 'error')).slice(-limit);
  }
}

export class FakeCheckpoints {
  created: { projectId: string; kind: string; label: string; taskId?: string | null }[] = [];
  afterTaskCalls: Task[] = [];
  latest: Checkpoint | null = null;
  failAfterTask = false;

  async create(input: { projectId: string; kind: Checkpoint['kind']; label: string; taskId?: string | null }): Promise<Checkpoint> {
    this.created.push(input);
    return this.cp(input.projectId, input.kind, input.label, input.taskId ?? null);
  }

  async afterTask(task: Task): Promise<Checkpoint | null> {
    this.afterTaskCalls.push(structuredClone(task));
    if (this.failAfterTask) throw new NovaError('GIT_ERROR', 'Git ist nicht verfügbar.');
    return this.cp(task.projectId, 'post_task', `Nach Aufgabe: ${task.title}`, task.id);
  }

  latestVerified(): Checkpoint | null {
    return this.latest;
  }

  cp(projectId: string, kind: Checkpoint['kind'], label: string, taskId: string | null): Checkpoint {
    return { id: `chk_${nextSeq()}`, projectId, taskId, kind, label, gitHead: null, gitCommit: null, changeCursor: 0, verification: null, createdAt: Date.now(), restoredAt: null };
  }
}

export class FakeApprovals {
  approvals = new Map<string, Approval>();
  listeners = new Set<(a: Approval) => void>();
  expiredForTask: string[] = [];

  add(patch: Partial<Approval> = {}): Approval {
    const a: Approval = {
      id: patch.id ?? `apr_${nextSeq()}`,
      projectId: patch.projectId ?? null,
      taskId: patch.taskId ?? null,
      runId: patch.runId ?? null,
      kind: patch.kind ?? 'command',
      fingerprint: 'fp',
      title: patch.title ?? 'Befehl ausführen',
      action: 'npm run deploy',
      consequences: '',
      details: {},
      status: patch.status ?? 'pending',
      scope: null,
      createdAt: Date.now(),
      decidedAt: null,
    };
    this.approvals.set(a.id, a);
    return a;
  }

  decide(id: string, decision: 'approve' | 'deny'): Approval {
    const a = this.approvals.get(id)!;
    a.status = decision === 'approve' ? 'approved' : 'denied';
    a.decidedAt = Date.now();
    for (const l of this.listeners) l(structuredClone(a));
    return a;
  }

  onDecision(listener: (a: Approval) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(id: string): Approval | null {
    const a = this.approvals.get(id);
    return a ? structuredClone(a) : null;
  }

  list(): Approval[] {
    return [...this.approvals.values()];
  }

  expireForTask(taskId: string): void {
    this.expiredForTask.push(taskId);
    for (const a of this.approvals.values()) if (a.taskId === taskId && a.status === 'pending') a.status = 'expired';
  }

  pendingCount(): number {
    return [...this.approvals.values()].filter((a) => a.status === 'pending').length;
  }
}

export class FakeMemory {
  added: { input: MemoryAddInput; source: MemoryEntry['source'] }[] = [];
  next: MemoryEntry | null = null;
  throwOnAdd = false;

  add(input: MemoryAddInput, source: MemoryEntry['source']): MemoryEntry {
    if (this.throwOnAdd) throw new NovaError('VALIDATION', 'Gedächtnis ist deaktiviert');
    this.added.push({ input, source });
    return { id: `mem_${nextSeq()}`, projectId: input.projectId, kind: input.kind, title: input.title, content: input.content, tags: input.tags ?? [], source, shareable: false, taskId: input.taskId ?? null, createdAt: Date.now(), updatedAt: Date.now() };
  }

  latestNextStep(): MemoryEntry | null {
    return this.next;
  }
}

export class FakeGovernor {
  allowedN = 2;
  configuredN = 2;
  reason: string | null = null;
  canWriteOk = true;

  allowed(_active: number) {
    return { allowed: this.allowedN, configured: this.configuredN, reason: this.reason };
  }

  allowedFor() {
    return { ok: true, reason: null };
  }

  canStartProcess() {
    return { ok: true, reason: null };
  }

  canWrite() {
    return { ok: this.canWriteOk, reason: this.canWriteOk ? null : 'Speicher voll' };
  }
}

export class FakeModels {
  resolveError: NovaError | null = null;
  resolveCalls = 0;

  async resolve(): Promise<ResolvedModel> {
    this.resolveCalls++;
    if (this.resolveError) throw this.resolveError;
    return {
      ref: { providerId: 'ollama-local', modelId: 'qwen2.5-coder:7b' },
      info: null,
      provider: { id: 'ollama-local', type: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434', enabled: true, paid: false, approved: true, hasApiKey: false, options: {}, createdAt: 0, updatedAt: 0 },
      paid: false,
      local: true,
      supportsTools: true,
      contextLength: 32768,
    };
  }

  async chat(): Promise<never> {
    throw new Error('not used');
  }
}

export class FakeNotifications {
  list_: Notification[] = [];

  notify(input: Omit<Notification, 'id' | 'ts' | 'readAt'>): Notification {
    const n: Notification = { ...input, id: `ntf_${nextSeq()}`, ts: Date.now(), readAt: null };
    this.list_.push(n);
    return n;
  }

  list(opts: { limit?: number } = {}): Notification[] {
    return [...this.list_].reverse().slice(0, opts.limit ?? 100);
  }

  unreadCount(): number {
    return this.list_.filter((n) => !n.readAt).length;
  }

  markRead(): void {}

  prune(): number {
    return 0;
  }
}

export class FakeLocks {
  released: string[] = [];
  releaseTask(taskId: string): void {
    this.released.push(taskId);
  }
  releaseProject(): void {}
  releaseAll(): void {}
  listForTask(): string[] {
    return [];
  }
  acquire() {
    return { ok: true as const };
  }
  heldBy() {
    return null;
  }
}

export class FakeProcesses {
  killed: string[] = [];
  async killTask(taskId: string): Promise<void> {
    this.killed.push(taskId);
  }
}

export class FakeIntegrations {
  available = new Map<string, boolean>();
  async get(id: string): Promise<IntegrationStatus> {
    const ok = this.available.get(id) ?? false;
    return { id, name: id, category: 'runtime', available: ok, version: ok ? '1.0.0' : null, path: ok ? `/usr/bin/${id}` : null, manualPath: null, installations: [], canOpen: false, message: '', installHint: null, checkedAt: Date.now() };
  }
}

export class FakePolicy {
  decision: CommandDecision = { action: 'allow', reason: 'erlaubt' };
  evaluate(): CommandDecision {
    return this.decision;
  }
}

// ---------------------------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------------------------

export interface Harness {
  t: TestCore;
  core: CoreContext;
  s: Services;
  tasks: TaskService;
  work: WorkCycle;
  projects: FakeProjects;
  runs: FakeRunStore;
  agents: FakeAgents;
  checks: FakeChecks;
  checkpoints: FakeCheckpoints;
  approvals: FakeApprovals;
  memory: FakeMemory;
  governor: FakeGovernor;
  models: FakeModels;
  notifications: FakeNotifications;
  locks: FakeLocks;
  processes: FakeProcesses;
  integrations: FakeIntegrations;
  policy: FakePolicy;
  /** tick + idle until nothing new starts. */
  drain(maxRounds?: number): Promise<void>;
  cleanup(): Promise<void>;
}

export function createHarness(opts: { work?: WorkCycleOptions; services?: Partial<Omit<Services, 'core'>> } = {}): Harness {
  const t = createTestCore();
  const core = t.core;
  const projects = new FakeProjects(core);
  const runs = new FakeRunStore(core);
  const agents = new FakeAgents(runs);
  const checks = new FakeChecks();
  const checkpoints = new FakeCheckpoints();
  const approvals = new FakeApprovals();
  const memory = new FakeMemory();
  const governor = new FakeGovernor();
  const models = new FakeModels();
  const notifications = new FakeNotifications();
  const locks = new FakeLocks();
  const processes = new FakeProcesses();
  const integrations = new FakeIntegrations();
  const policy = new FakePolicy();
  const s = makeServices(core, {
    projects: projects as unknown as Services['projects'],
    runs: runs as unknown as Services['runs'],
    agents: agents as unknown as Services['agents'],
    checks: checks as unknown as Services['checks'],
    checkpoints: checkpoints as unknown as Services['checkpoints'],
    approvals: approvals as unknown as Services['approvals'],
    memory: memory as unknown as Services['memory'],
    governor: governor as unknown as Services['governor'],
    models: models as unknown as Services['models'],
    notifications: notifications as unknown as Services['notifications'],
    locks: locks as unknown as Services['locks'],
    processes: processes as unknown as Services['processes'],
    integrations: integrations as unknown as Services['integrations'],
    policy: policy as unknown as Services['policy'],
    ...(opts.services ?? {}),
  });
  const tasks = createTaskService(s);
  s.tasks = tasks;
  const work = createWorkCycle(s, opts.work);
  s.work = work;
  const h: Harness = {
    t,
    core,
    s,
    tasks,
    work,
    projects,
    runs,
    agents,
    checks,
    checkpoints,
    approvals,
    memory,
    governor,
    models,
    notifications,
    locks,
    processes,
    integrations,
    policy,
    async drain(maxRounds = 40) {
      await work.idle();
      for (let i = 0; i < maxRounds; i++) {
        await work.tick();
        // After idle() nothing runs, so any active run now was launched by this tick.
        const launched = work.activeRunCount() > 0;
        await work.idle();
        if (!launched) return;
      }
    },
    async cleanup() {
      await work.shutdown(200);
      t.cleanup();
    },
  };
  return h;
}
