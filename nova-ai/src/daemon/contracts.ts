// =====================================================================================
// NOVA AI daemon – service contracts.
// Every daemon module implements one or more of these interfaces and receives the fully
// populated `Services` container. RULE: constructors/factories must NOT call other services
// (the container is filled in app.ts after all factories ran); call them from methods or start().
// =====================================================================================
import type { z } from 'zod';
import { z as zod } from 'zod';
import type {
  AgentRole,
  AgentRoleInfo,
  AgentRun,
  AgentRunStatus,
  AgentStep,
  AgentStepKind,
  Approval,
  ApprovalKind,
  ApprovalRule,
  ApprovalScope,
  ApprovalStatus,
  BackupInfo,
  BudgetStatus,
  ChangeRecord,
  ChangedFile,
  CheckKind,
  CheckRun,
  Checkpoint,
  CheckpointKind,
  CreateProjectInput,
  CreateTaskInput,
  ExportSection,
  FileContent,
  FileDiff,
  FileNode,
  GitCommit,
  GitStatus,
  IntegrationId,
  IntegrationStatus,
  MemoryEntry,
  MemoryKind,
  MemorySearchResult,
  ModelInfo,
  ModelPricing,
  ModelRef,
  Notification,
  OllamaPull,
  OllamaRunningModel,
  OllamaStatus,
  PreviewStatus,
  ProcessInfo,
  ProcessKind,
  Project,
  ProjectConfig,
  ProjectKind,
  ProjectSummary,
  ProjectTemplateInfo,
  ProviderConfig,
  ProviderHealth,
  ProviderType,
  ResourceSnapshot,
  RestoreResult,
  SearchMatch,
  Task,
  TaskKind,
  TaskStatus,
  TerminalSession,
  UpdateInfo,
  UpdateTaskInput,
  UpsertProviderInput,
  UsageRecord,
  WorkStatus,
} from '@shared/schemas';
import type { RpcMethod, RpcParsedParams, RpcResult, RpcRequest, RpcResponse } from '@shared/rpc';
import type { Db } from './db/database';
import type { EventBus } from './core/bus';
import type { LogStore, Logger } from './core/logger';
import type { SettingsService } from './core/settings';
import type { ErrorService } from './core/error-service';
import type { DataPaths } from './core/paths';
import type { Clock } from './core/time';

// -------------------------------------------------------------------------------------
// Core (implemented in src/daemon/core, provided by app.ts)
// -------------------------------------------------------------------------------------

export interface CoreContext {
  db: Db;
  bus: EventBus;
  logs: LogStore;
  log: Logger;
  settings: SettingsService;
  errors: ErrorService;
  paths: DataPaths;
  clock: Clock;
  /** Random id of this daemon process (orphan detection). */
  instanceId: string;
  version: string;
  platform: NodeJS.Platform;
}

export interface NotificationService {
  /** Emits a 'notification' event if the category is enabled in settings.notifications. */
  notify(input: Omit<Notification, 'id' | 'ts'>): Notification | null;
}

// -------------------------------------------------------------------------------------
// Secrets (module: env → src/daemon/secrets)
// -------------------------------------------------------------------------------------

export interface SecretStore {
  /** dpapi (Windows), keychain (macOS), libsecret (Linux secret-tool), aes-local (fallback), memory (tests). */
  readonly scheme: 'dpapi' | 'keychain' | 'libsecret' | 'aes-local' | 'memory';
  /** false for the aes-local fallback (key file next to the DB) – the UI shows a warning. */
  readonly secure: boolean;
  set(id: string, value: string): Promise<void>;
  /** Decrypts and registers the value with the redactor (core/redact.registerSecret). */
  get(id: string): Promise<string | null>;
  delete(id: string): Promise<void>;
  has(id: string): boolean;
}

// -------------------------------------------------------------------------------------
// Approvals (module: env → src/daemon/approvals)
// -------------------------------------------------------------------------------------

export interface ApprovalRequest {
  projectId: string | null;
  taskId?: string | null;
  runId?: string | null;
  kind: ApprovalKind;
  title: string; // German
  action: string; // German explanation + the raw command/path
  consequences: string; // German
  /** Normalized subject used for the fingerprint (command line, absolute path, model ref ...). */
  subject: string;
  details?: Record<string, unknown>;
}

export type ApprovalCheck =
  | { state: 'approved'; approval: Approval | null; viaRule: boolean }
  | { state: 'denied'; approval: Approval }
  | { state: 'pending'; approval: Approval };

export interface ApprovalService {
  fingerprint(kind: ApprovalKind, projectId: string | null, subject: string): string;
  /**
   * approved: an 'always' rule matches, or an approved-but-unconsumed 'once' approval with the same
   *           fingerprint exists for this task.
   * denied:   the latest approval with this fingerprint for this task was denied (not yet acknowledged).
   * pending:  otherwise – reuses an existing pending approval with the same fingerprint or creates one
   *           (emits 'approval.updated' + notification).
   */
  check(req: ApprovalRequest): ApprovalCheck;
  /** Marks a 'once' approval as used (call after the approved action ran). */
  consume(approvalId: string): void;
  /** Marks a denied approval as acknowledged so the same action can be requested again later. */
  acknowledgeDenial(approvalId: string): void;
  get(id: string): Approval | null;
  list(filter?: { status?: ApprovalStatus; projectId?: string; taskId?: string }): Approval[];
  decide(id: string, decision: 'approve' | 'deny', scope: ApprovalScope): Approval;
  /** Resolves when the approval is decided (or rejects on abort). */
  waitFor(id: string, signal?: AbortSignal): Promise<Approval>;
  onDecision(listener: (approval: Approval) => void): () => void;
  rules(): ApprovalRule[];
  deleteRule(id: string): void;
  pendingCount(): number;
  /** Expire pending approvals of a task (task cancelled/deleted). */
  expireForTask(taskId: string): void;
}

// -------------------------------------------------------------------------------------
// Model providers, model routing, budget, Ollama (module: providers → src/daemon/providers)
// -------------------------------------------------------------------------------------

export interface ChatToolSpec {
  name: string;
  description: string;
  /** JSON schema of the arguments (object). */
  parameters: Record<string, unknown>;
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ChatToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ChatToolSpec[];
  temperature?: number;
  maxTokens?: number;
  /** Ollama num_ctx. */
  numCtx?: number;
  /** Ask for a JSON object response (Ollama format:"json", OpenAI response_format). */
  json?: boolean;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  toolCalls: ChatToolCall[];
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number;
  model: string;
  finishReason: string | null;
}

export interface ModelProvider {
  readonly id: string;
  readonly type: ProviderType;
  config(): ProviderConfig;
  health(): Promise<ProviderHealth>;
  listModels(): Promise<ModelInfo[]>;
  /** Throws NovaError PROVIDER_ERROR / PROVIDER_AUTH / PROVIDER_RATE_LIMIT / MODEL_UNAVAILABLE / OLLAMA_UNREACHABLE / CANCELLED. */
  chat(req: ChatRequest): Promise<ChatResponse>;
}

export interface ProviderFactoryDeps {
  getApiKey(): Promise<string | null>;
  log: Logger;
  /** Injected for tests; defaults to global fetch. */
  fetch?: typeof fetch;
}

export interface ProviderFactory {
  type: ProviderType;
  create(config: ProviderConfig, deps: ProviderFactoryDeps): ModelProvider;
}

export interface ProviderRegistry {
  /** Adds a provider implementation (modular extension point). Built-ins: ollama, openai_compatible, anthropic. */
  registerFactory(factory: ProviderFactory): void;
  /** Ensures the built-in local Ollama provider row exists (id "ollama-local"). */
  ensureDefaults(): void;
  list(): ProviderConfig[];
  getConfig(id: string): ProviderConfig | null;
  get(id: string): ModelProvider | null;
  upsert(input: UpsertProviderInput): ProviderConfig;
  remove(id: string): void;
  setApiKey(providerId: string, apiKey: string): Promise<void>;
  clearApiKey(providerId: string): Promise<void>;
  test(providerId: string): Promise<ProviderHealth>;
  healthAll(): Promise<ProviderHealth[]>;
  /** All models of all enabled providers (cached; refresh forces re-query). */
  listModels(refresh?: boolean): Promise<ModelInfo[]>;
  getModel(ref: ModelRef): Promise<ModelInfo | null>;
  setPricing(ref: ModelRef, pricing: ModelPricing | null): Promise<ModelInfo>;
}

export interface ResolvedModel {
  ref: ModelRef;
  info: ModelInfo | null;
  provider: ProviderConfig;
  paid: boolean;
  supportsTools: boolean;
  contextLength: number | null;
}

export interface ModelChatInput {
  role: AgentRole;
  projectId: string | null;
  taskId: string | null;
  runId: string | null;
  messages: ChatMessage[];
  tools?: ChatToolSpec[];
  json?: boolean;
  signal?: AbortSignal;
  /** Prefer this model (e.g. continue a run with the same model) if still allowed. */
  preferred?: ModelRef | null;
}

/** What agents use. Encapsulates model choice, fallback, paid-approval and budget enforcement and usage recording. */
export interface ModelClient {
  /**
   * Order: preferred (if allowed) → settings.models.roleOverrides[role] → defaultModel → fallbacks.
   * A model is allowed if its provider is enabled and (not paid, or paid && provider.approved && pricing known
   * && budget allows && !budget.isPaidPaused()). Throws NovaError NO_MODEL (German message lists why each candidate was rejected).
   */
  resolve(role: AgentRole, opts?: { projectId?: string | null; exclude?: ModelRef[]; preferred?: ModelRef | null }): Promise<ResolvedModel>;
  /**
   * Chat with automatic fallback: on MODEL_UNAVAILABLE / OLLAMA_UNREACHABLE / PROVIDER_ERROR(5xx) / BUDGET_EXCEEDED the next allowed
   * candidate is tried. Never switches to a paid model that is not approved. Records usage (budget.record) for every call,
   * including failed paid calls that consumed tokens. Retries never bypass the budget.
   */
  chat(input: ModelChatInput): Promise<ChatResponse & { model: ResolvedModel }>;
}

export interface BudgetService {
  status(): BudgetStatus;
  /**
   * Throws NovaError BUDGET_EXCEEDED when (spent + estimated max cost) would exceed the daily, monthly or project limit,
   * or PRICE_UNKNOWN when a paid model has no pricing. Free (local) models never throw.
   */
  assertCanSpend(input: { providerId: string; modelId: string; paid: boolean; projectId: string | null; estimatedInputTokens: number; maxOutputTokens: number; pricing: ModelPricing | null }): void;
  record(usage: Omit<UsageRecord, 'id'>): UsageRecord;
  usage(filter?: { from?: number; to?: number; projectId?: string; limit?: number }): UsageRecord[];
  setLimits(input: { dailyLimitUsd?: number | null; monthlyLimitUsd?: number | null }): BudgetStatus;
  /** Paid work stays paused after a limit was hit until the user resumes it explicitly. */
  isPaidPaused(): boolean;
  pausePaid(reason: string): void;
  resumePaid(): BudgetStatus;
}

export interface OllamaFit {
  fits: boolean | null; // null = unknown (no GPU data)
  requiredBytes: number | null;
  availableBytes: number | null;
  estimated: boolean;
  message: string;
  alternatives: string[]; // smaller installed models that would fit
}

export interface OllamaService {
  baseUrl(): string;
  status(): Promise<OllamaStatus>;
  models(): Promise<ModelInfo[]>;
  show(model: string): Promise<{ model: ModelInfo; modelfile: string | null; license: string | null; parameters: string | null }>;
  /** Starts a streaming pull; progress via 'ollama.pull' events. */
  pull(model: string): OllamaPull;
  pulls(): OllamaPull[];
  cancelPull(id: string): OllamaPull;
  delete(model: string): Promise<void>;
  running(): Promise<OllamaRunningModel[]>;
  fit(model: string): Promise<OllamaFit>;
}

// -------------------------------------------------------------------------------------
// Files, sandbox, change journal, locks, commands, processes, terminal, agent tools
// (module: tools → src/daemon/tools, src/daemon/changes, src/daemon/processes)
// -------------------------------------------------------------------------------------

export interface PathGuard {
  /**
   * Resolves a project-relative (or absolute) path. Throws NovaError PATH_OUTSIDE_PROJECT if the result
   * (after resolving symlinks of existing parents) is outside projectRoot. rel uses forward slashes.
   */
  resolve(projectRoot: string, p: string): { abs: string; rel: string };
  isInside(projectRoot: string, abs: string): boolean;
  /** Paths agents must never write: .git/, node_modules/ internals, NOVA data dir, OS dirs. */
  isProtected(projectRoot: string, rel: string): boolean;
}

export interface ChangeJournal {
  /** Atomic write (temp file + rename) and journal entry. Snapshot of the previous content is stored first. */
  writeFile(input: { projectId: string; projectRoot: string; relPath: string; content: string | Buffer; taskId?: string | null; runId?: string | null; actor: 'nova' | 'user' }): Promise<ChangeRecord>;
  deleteFile(input: { projectId: string; projectRoot: string; relPath: string; taskId?: string | null; runId?: string | null; actor: 'nova' | 'user' }): Promise<ChangeRecord>;
  list(filter: { projectId: string; taskId?: string; path?: string; afterId?: number; includeReverted?: boolean; limit?: number }): ChangeRecord[];
  /** Highest change id of a project (0 if none). Used as checkpoint cursor. */
  maxId(projectId: string): number;
  readSnapshot(hash: string): Buffer | null;
  /** Files NOVA changed (not reverted), with "modified since" detection by comparing current hash with afterHash. */
  changedFiles(projectId: string, projectRoot: string): Promise<ChangedFile[]>;
  /**
   * Reverts NOVA changes (newest first). Selection: all non-reverted nova changes with id > afterId, or of taskId.
   * A change is only reverted if the file's current hash equals the change's afterHash (otherwise: conflict,
   * file untouched). Never touches files that NOVA did not change. dryRun reports without writing.
   */
  revert(input: { projectId: string; projectRoot: string; afterId?: number; taskId?: string; dryRun?: boolean }): Promise<{ restored: string[]; conflicts: { path: string; reason: string }[]; skipped: string[] }>;
  /** Delete snapshot blobs no longer referenced and older than the retention. */
  pruneSnapshots(olderThanMs: number): number;
}

export interface FileLockService {
  acquire(projectId: string, relPath: string, taskId: string): { ok: true } | { ok: false; heldBy: string };
  heldBy(projectId: string, relPath: string): string | null;
  listForTask(taskId: string): string[];
  releaseTask(taskId: string): void;
  releaseAll(): void;
}

export type CommandDecision =
  | { action: 'allow'; reason: string }
  | { action: 'approve'; kind: ApprovalKind; reason: string; consequences: string }
  | { action: 'block'; reason: string };

export interface CommandPolicy {
  /** Decides whether an AGENT may run a command (user terminal commands are not checked). */
  evaluate(input: { projectId: string; projectRoot: string; command: string; config: ProjectConfig }): CommandDecision;
}

export interface RunCommandInput {
  command: string;
  cwd: string;
  projectId?: string | null;
  taskId?: string | null;
  kind: ProcessKind;
  timeoutMs?: number;
  env?: Record<string, string>;
  signal?: AbortSignal;
  onOutput?: (stream: 'stdout' | 'stderr', chunk: string) => void;
  /** Max bytes kept per stream (tail). Default 1 MB. */
  maxOutputBytes?: number;
  stdin?: string;
}

export interface CommandResult {
  processId: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Interleaved output tail (redacted). */
  output: string;
  timedOut: boolean;
  cancelled: boolean;
  durationMs: number;
}

export interface StartProcessInput extends Omit<RunCommandInput, 'timeoutMs'> {
  /** Regex source to detect a URL in the output (dev servers). Default: loopback http URLs. */
  urlPattern?: string;
}

export interface ProcessHandle {
  info(): ProcessInfo;
  /** Resolves with the first detected URL or null when the process exits first / timeout. */
  waitForUrl(timeoutMs: number): Promise<string | null>;
  exited: Promise<number | null>;
}

export interface ProcessManager {
  /** Runs a command through the platform shell (cmd.exe on Windows, /bin/sh elsewhere) with secret-free env. */
  run(input: RunCommandInput): Promise<CommandResult>;
  /** Starts a long-running process (dev server, preview). */
  start(input: StartProcessInput): ProcessHandle;
  /** Kills the whole process tree (taskkill /T /F on Windows, process group elsewhere). */
  kill(id: string): Promise<ProcessInfo>;
  killTask(taskId: string): Promise<void>;
  get(id: string): ProcessInfo | null;
  list(filter?: { projectId?: string; includeExited?: boolean }): ProcessInfo[];
  output(id: string, tailLines: number): string;
  /** Processes recorded by previous daemon instances: kills those still alive (verified by pid + start time), marks them orphaned. */
  recoverOrphans(): Promise<number>;
  runningCount(): number;
  shutdown(): Promise<void>;
}

export interface TerminalService {
  create(projectId: string): TerminalSession;
  list(projectId?: string): TerminalSession[];
  /** Runs one line (PowerShell on Windows, bash/sh elsewhere). "cd <dir>" changes the tracked cwd (inside the project only). Output via events. */
  run(sessionId: string, line: string): { accepted: boolean };
  interrupt(sessionId: string): void;
  close(sessionId: string): void;
  closeAll(): void;
}

export interface FileService {
  tree(projectId: string, path: string, depth: number): Promise<FileNode>;
  read(projectId: string, path: string): Promise<FileContent>;
  /** User edit (actor "user"). Throws CONFLICT if expectedHash is given and differs from the current file. */
  write(projectId: string, path: string, content: string, expectedHash: string | null): Promise<FileContent>;
  search(projectId: string, query: string, opts: { regex: boolean; caseSensitive: boolean; limit: number }): Promise<SearchMatch[]>;
  changed(projectId: string): Promise<ChangedFile[]>;
  history(projectId: string, filter: { path?: string; taskId?: string; limit: number }): ChangeRecord[];
  diff(projectId: string, path: string, taskId?: string): Promise<FileDiff>;
}

/** Context handed to every agent tool call. */
export interface ToolContext {
  project: Project;
  task: Task;
  runId: string;
  role: AgentRole;
  signal: AbortSignal;
  log: Logger;
  /** Adds an entry to the run's activity feed. */
  step(kind: AgentStepKind, summary: string, data?: unknown): void;
}

export type ToolResult =
  | { status: 'ok'; content: string; data?: unknown; filesChanged?: string[] }
  | { status: 'error'; content: string; code?: string }
  /** The run pauses (task → waiting_approval) and re-executes this exact tool call after the decision. */
  | { status: 'approval_required'; approvalId: string; content: string }
  /** Terminal tool: ends the run successfully with structured data. */
  | { status: 'finish'; content: string; data: unknown };

export interface AgentTool<P = any> {
  name: string; // snake_case, e.g. "read_file"
  /** English description for the model. */
  description: string;
  schema: z.ZodType<P>;
  roles: AgentRole[];
  /** true = no side effects (safe to repeat after a crash). */
  readOnly: boolean;
  /** German one-liner for the activity feed, e.g. "Liest src/app.ts". */
  describe(params: P): string;
  execute(params: P, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: AgentTool): void;
  get(name: string): AgentTool | null;
  forRole(role: AgentRole): AgentTool[];
  /** JSON-schema specs for the model (zod → z.toJSONSchema). */
  specs(role: AgentRole): ChatToolSpec[];
}

// -------------------------------------------------------------------------------------
// Agents (module: agents → src/daemon/agents)
// -------------------------------------------------------------------------------------

export const PlanTaskSchema = zod.object({
  key: zod.string().min(1), // planner-local key used in dependsOn
  title: zod.string().min(1).max(300),
  description: zod.string().max(20000),
  role: zod.enum(['coder', 'tester', 'reviewer']),
  kind: zod.enum(['code', 'test', 'fix', 'review', 'build', 'custom']),
  dependsOn: zod.array(zod.string()).default([]),
  priority: zod.number().int().min(0).max(3).default(1),
  acceptance: zod.string().nullable().default(null),
  files: zod.array(zod.string()).default([]),
});
export type PlanTask = z.infer<typeof PlanTaskSchema>;

export const PlanOutputSchema = zod.object({
  summary: zod.string(),
  tasks: zod.array(PlanTaskSchema).max(50),
  memory: zod
    .array(zod.object({ kind: zod.enum(['goal', 'decision', 'requirement', 'convention', 'question', 'next_step', 'note']), title: zod.string(), content: zod.string() }))
    .default([]),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export const ReviewFindingSchema = zod.object({
  severity: zod.enum(['critical', 'major', 'minor', 'info']),
  file: zod.string().nullable().default(null),
  line: zod.number().int().nullable().default(null),
  message: zod.string(),
});
export const ReviewOutputSchema = zod.object({
  verdict: zod.enum(['approve', 'changes_requested']),
  summary: zod.string(),
  findings: zod.array(ReviewFindingSchema).default([]),
});
export type ReviewOutput = z.infer<typeof ReviewOutputSchema>;

export const CoderOutputSchema = zod.object({
  summary: zod.string(),
  status: zod.enum(['done', 'blocked']).default('done'),
  blocker: zod.string().nullable().default(null),
  notes: zod.string().nullable().default(null),
});
export type CoderOutput = z.infer<typeof CoderOutputSchema>;

export const TesterOutputSchema = zod.object({
  summary: zod.string(),
  passed: zod.boolean().nullable(), // null = could not run tests
  failures: zod.array(zod.string()).default([]),
  fixed: zod.boolean().default(false), // tester changed files to fix failures
});
export type TesterOutput = z.infer<typeof TesterOutputSchema>;

export type AgentOutput =
  | { role: 'planner'; plan: PlanOutput }
  | { role: 'coder'; result: CoderOutput }
  | { role: 'tester'; result: TesterOutput }
  | { role: 'reviewer'; review: ReviewOutput };

export type AgentRunOutcome =
  | { status: 'done'; runId: string; summary: string; output: AgentOutput; files: string[] }
  | { status: 'paused'; runId: string }
  | { status: 'waiting_approval'; runId: string; approvalId: string }
  | { status: 'blocked'; runId: string; reason: string; code: string }
  | { status: 'failed'; runId: string; reason: string; code: string }
  | { status: 'cancelled'; runId: string };

export interface AgentRunInput {
  task: Task;
  project: Project;
  /** Resume this run (paused / waiting_approval / interrupted) from its saved conversation state. */
  resumeRunId?: string | null;
  signal: AbortSignal;
  /** Checked between steps; when true the run saves its state and returns 'paused'. */
  pauseRequested: () => boolean;
  /** Extra context from the orchestrator (previous failures, review findings, test output ...). */
  extraContext?: string;
}

export interface AgentRunner {
  run(input: AgentRunInput): Promise<AgentRunOutcome>;
  roles(): AgentRoleInfo[];
  /** Exchangeable role modules (planner/coder/tester/reviewer implementations). */
  registerRole(module: AgentRoleModule): void;
}

export interface AgentRoleModule {
  info: AgentRoleInfo;
  /** System prompt for this role (English), given project + task + memory context. */
  systemPrompt(ctx: { project: Project; task: Task; memory: MemoryEntry[]; platform: NodeJS.Platform; extraContext?: string }): string;
  /**
   * Terminal tool that finishes the run (e.g. "submit_plan", "finish", "submit_review"). It is NOT registered in the
   * ToolRegistry: the runner adds its spec to the role's tool list and handles the call itself.
   */
  finishTool: { name: string; description: string; schema: z.ZodType };
  /** Generic tools (ToolRegistry names) this role may use. */
  toolNames: string[];
  /** Parses/validates the finish tool data into the role output (throws on invalid data; message goes back to the model). */
  parseOutput(data: unknown): AgentOutput;
}

export interface RunStore {
  create(input: { taskId: string; projectId: string; role: AgentRole }): AgentRun;
  get(id: string): AgentRun | null;
  update(id: string, patch: Partial<Omit<AgentRun, 'id' | 'taskId' | 'projectId' | 'role' | 'startedAt'>>): AgentRun;
  list(filter?: { projectId?: string; taskId?: string; activeOnly?: boolean; limit?: number }): AgentRun[];
  latestForTask(taskId: string): AgentRun | null;
  addStep(runId: string, kind: AgentStepKind, summary: string, data?: unknown): AgentStep;
  steps(runId: string, afterId?: number, limit?: number): AgentStep[];
  saveState(runId: string, state: unknown): void;
  loadState<T>(runId: string): T | null;
  /** Runs with status running at startup → interrupted. Returns affected runs. */
  markInterrupted(): AgentRun[];
}

// -------------------------------------------------------------------------------------
// Tasks and the autonomous work cycle (module: orchestrator → src/daemon/tasks)
// -------------------------------------------------------------------------------------

export interface TaskService {
  list(filter?: { projectId?: string; status?: TaskStatus[]; limit?: number }): Task[];
  get(id: string): Task | null;
  require(id: string): Task;
  create(input: CreateTaskInput, source?: Task['source']): Task;
  update(input: UpdateTaskInput): Task;
  setPriority(id: string, priority: number): Task;
  delete(id: string): void;
  /** Internal state change (emits task.updated). */
  patch(id: string, patch: Partial<Omit<Task, 'id' | 'projectId' | 'createdAt'>>): Task;
  addFiles(id: string, files: string[]): Task;
  /** Queued tasks whose dependencies are all done, ordered by priority desc, createdAt asc. */
  ready(projectId?: string): Task[];
  counts(projectId?: string): Record<TaskStatus, number>;
}

export interface WorkCycle {
  start(projectId?: string): WorkStatus;
  pause(projectId?: string): WorkStatus;
  resume(projectId?: string): WorkStatus;
  /** Stops new work, cancels running runs (kills their processes) and leaves tasks re-startable. */
  stop(projectId?: string): WorkStatus;
  status(): WorkStatus;
  startTask(id: string): Task;
  pauseTask(id: string): Task;
  resumeTask(id: string): Task;
  stopTask(id: string): Promise<Task>;
  retryTask(id: string): Task;
  /** Creates a planning task for a goal and queues it. */
  planGoal(projectId: string, goal: string): Task;
  /** Startup recovery: interrupted runs/tasks, stale locks; re-queues safe tasks when settings allow. */
  recover(): Promise<{ tasks: number }>;
  /** Starts the scheduler loop. */
  startLoop(): void;
  /** Graceful stop: no new runs, request pause of running runs, wait up to timeoutMs. */
  shutdown(timeoutMs: number): Promise<void>;
  /** Test hook: run one scheduling pass immediately. */
  tick(): Promise<void>;
}

// -------------------------------------------------------------------------------------
// Projects, templates, checks (tests/builds), preview (module: projects → src/daemon/projects, checks, preview)
// -------------------------------------------------------------------------------------

export interface ProjectService {
  list(opts?: { includeArchived?: boolean }): ProjectSummary[];
  get(id: string): Project | null;
  require(id: string): Project;
  summary(id: string): ProjectSummary;
  create(input: CreateProjectInput): Promise<{ project: Project; planTaskId: string | null; warnings: string[] }>;
  update(input: { id: string; name?: string; description?: string; kind?: ProjectKind; technologies?: string[]; status?: Project['status']; config?: Partial<ProjectConfig> }): Project;
  /** Removes the project from NOVA (DB rows). NEVER deletes files on disk. */
  remove(id: string): void;
  setWork(id: string, enabled: boolean): Project;
  detect(id: string): Promise<{ kind: ProjectKind; technologies: string[]; config: ProjectConfig }>;
  /** Default config for a kind (used by templates and detection). */
  defaultConfig(kind: ProjectKind): ProjectConfig;
}

export interface ProjectTemplate {
  info: Omit<ProjectTemplateInfo, 'missingTools'>;
  /** Creates the initial files in an EMPTY target directory. Must not run network installs. */
  scaffold(dir: string, opts: { name: string; description: string }): Promise<{ files: string[]; config: Partial<ProjectConfig>; notes: string[] }>;
}

export interface TemplateRegistry {
  register(template: ProjectTemplate): void;
  get(id: string): ProjectTemplate | null;
  list(): Promise<ProjectTemplateInfo[]>;
}

export interface ProjectDetector {
  detect(dir: string): Promise<{ kind: ProjectKind; technologies: string[]; config: ProjectConfig }>;
}

export interface CheckService {
  /** Runs the project's test/build/lint command, parses results; status not_run when no command is configured. */
  run(input: { projectId: string; kind: CheckKind; taskId?: string | null; signal?: AbortSignal }): Promise<CheckRun>;
  get(id: string): CheckRun | null;
  list(projectId: string, kind?: CheckKind, limit?: number): CheckRun[];
  latest(projectId: string, kind: CheckKind): CheckRun | null;
  recentFailed(limit: number): CheckRun[];
  recent(kind: CheckKind, limit: number): CheckRun[];
}

export interface PreviewService {
  status(projectId: string): PreviewStatus;
  start(projectId: string): Promise<PreviewStatus>;
  stop(projectId: string): Promise<PreviewStatus>;
  stopAll(): Promise<void>;
  /** Called after file changes (by journal/file service events) to bump reloadToken for static previews. */
  notifyFilesChanged(projectId: string, paths: string[]): void;
}

// -------------------------------------------------------------------------------------
// Git, checkpoints, backups, export/import (module: git → src/daemon/git, checkpoints, backup)
// -------------------------------------------------------------------------------------

export interface GitService {
  available(): Promise<boolean>;
  isRepo(root: string): Promise<boolean>;
  init(root: string): Promise<void>;
  status(root: string): Promise<GitStatus>;
  head(root: string): Promise<string | null>;
  diff(root: string, opts: { path?: string; ref?: string; staged?: boolean }): Promise<FileDiff[]>;
  log(root: string, limit: number): Promise<GitCommit[]>;
  /** Stages and commits ONLY the given paths (never `add -A`). Returns the commit hash or null if nothing changed. */
  commitPaths(root: string, paths: string[], message: string): Promise<string | null>;
  clone(url: string, dir: string, signal?: AbortSignal): Promise<void>;
  showFile(root: string, ref: string, path: string): Promise<string | null>;
}

export interface CheckpointService {
  list(projectId: string): Checkpoint[];
  create(input: { projectId: string; kind: CheckpointKind; label: string; taskId?: string | null }): Promise<Checkpoint>;
  preview(input: { checkpointId?: string; taskId?: string }): Promise<RestoreResult>;
  /** Creates a pre_restore checkpoint, reverts via ChangeJournal, optionally commits the restored files. */
  restore(input: { checkpointId?: string; taskId?: string; commit: boolean }): Promise<RestoreResult>;
  /** After a successful task: commit NOVA's files for that task if autoCommit (project/settings) and verification allow. */
  afterTask(task: Task): Promise<Checkpoint | null>;
}

export interface BackupService {
  list(): BackupInfo[];
  createDatabaseBackup(reason: string): BackupInfo;
  snapshotProject(projectId: string): Promise<BackupInfo>;
  applyRetention(): number;
  /** Daily backup if enabled and none exists for today. */
  maybeDailyBackup(): BackupInfo | null;
  exportData(sections: ExportSection[], path?: string): Promise<{ path: string; counts: Record<string, number> }>;
  importData(path: string): Promise<{ counts: Record<string, number>; warnings: string[] }>;
}

// -------------------------------------------------------------------------------------
// Memory / knowledge base (module: memory → src/daemon/memory)
// -------------------------------------------------------------------------------------

export interface MemoryAddInput {
  projectId: string | null;
  kind: MemoryKind;
  title: string;
  content: string;
  tags?: string[];
  shareable?: boolean;
  taskId?: string | null;
}

export interface MemoryService {
  list(filter?: { projectId?: string | null; kind?: MemoryKind; limit?: number }): MemoryEntry[];
  search(query: string, opts?: { projectId?: string | null; includeGlobal?: boolean; limit?: number }): MemorySearchResult[];
  /** Redacts secrets; refuses (throws VALIDATION) content that is mostly a credential. Agent writes respect settings.memory.agentsMayWrite. */
  add(input: MemoryAddInput, source: MemoryEntry['source']): MemoryEntry;
  update(id: string, patch: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'kind' | 'shareable'>>): MemoryEntry;
  delete(id: string): void;
  clear(projectId: string | null): number;
  exportTo(projectId: string | null | undefined, path?: string): Promise<{ path: string; count: number }>;
  importFrom(path: string): Promise<{ imported: number; skipped: number }>;
  /** Relevant entries for an agent prompt: project entries (FTS-ranked + goals/conventions) + shareable global insights if enabled. */
  contextFor(input: { projectId: string; query: string; limit?: number }): MemoryEntry[];
}

// -------------------------------------------------------------------------------------
// Resources, integrations, updates (module: env → src/daemon/resources, integrations, updates)
// -------------------------------------------------------------------------------------

export interface ResourceMonitor {
  start(): void;
  stop(): void;
  latest(): ResourceSnapshot | null;
  history(minutes: number): ResourceSnapshot[];
  /** Takes one sample now. */
  sample(): Promise<ResourceSnapshot>;
}

export interface ConcurrencyGovernor {
  /** Allowed parallel agent runs now, considering settings.agents.maxParallelAgents and resource limits. */
  allowed(): { allowed: number; configured: number; reason: string | null };
  canStartProcess(): { ok: boolean; reason: string | null };
}

export interface IntegrationService {
  list(refresh?: boolean): Promise<IntegrationStatus[]>;
  get(id: IntegrationId, refresh?: boolean): Promise<IntegrationStatus>;
  /** Executable path (manual override first) or null. */
  resolvePath(id: IntegrationId): Promise<string | null>;
  setPath(id: IntegrationId, path: string | null): Promise<IntegrationStatus>;
  /** Creates an 'install' approval with the winget/download command; installs only after approval. */
  requestInstall(id: IntegrationId): Promise<{ approvalId: string | null; message: string }>;
}

export interface UpdateService {
  check(): Promise<UpdateInfo>;
}

// -------------------------------------------------------------------------------------
// RPC (module: server → src/daemon/server)
// -------------------------------------------------------------------------------------

export type RpcHandler<M extends RpcMethod> = (params: RpcParsedParams<M>, ctx: { requestId: string }) => Promise<RpcResult<M>> | RpcResult<M>;

export interface RpcRouter {
  register<M extends RpcMethod>(method: M, handler: RpcHandler<M>): void;
  /** Validates params (zod) → calls handler → validates result in dev/tests → maps NovaError to RpcError. */
  handle(req: RpcRequest): Promise<RpcResponse>;
  registered(): string[];
}

/** Each module exports `register<Module>Rpc(router, services)` registering its methods. */
export type RpcRegistrar = (router: RpcRouter, services: Services) => void;

// -------------------------------------------------------------------------------------
// The container
// -------------------------------------------------------------------------------------

export interface Services {
  core: CoreContext;
  notifications: NotificationService;
  secrets: SecretStore;
  approvals: ApprovalService;
  providers: ProviderRegistry;
  models: ModelClient;
  budget: BudgetService;
  ollama: OllamaService;
  pathGuard: PathGuard;
  journal: ChangeJournal;
  locks: FileLockService;
  policy: CommandPolicy;
  processes: ProcessManager;
  terminals: TerminalService;
  files: FileService;
  tools: ToolRegistry;
  agents: AgentRunner;
  runs: RunStore;
  tasks: TaskService;
  work: WorkCycle;
  projects: ProjectService;
  templates: TemplateRegistry;
  detector: ProjectDetector;
  checks: CheckService;
  preview: PreviewService;
  git: GitService;
  checkpoints: CheckpointService;
  backups: BackupService;
  memory: MemoryService;
  resources: ResourceMonitor;
  governor: ConcurrencyGovernor;
  integrations: IntegrationService;
  updates: UpdateService;
}

export type { AgentRunStatus, TaskKind };
