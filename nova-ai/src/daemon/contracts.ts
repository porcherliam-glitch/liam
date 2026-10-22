// =====================================================================================
// NOVA AI daemon – service contracts (binding; revised after the contract review, see docs/SPEC.md §6).
// Every daemon module implements one or more of these interfaces and receives the fully
// populated `Services` container. RULE: constructors/factories must NOT call other services
// (the container is filled in app.ts after all factories ran); call them from methods or start().
// Subscribing to core.bus inside a factory IS allowed (the bus is core).
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
  BudgetBreakdownRow,
  BudgetStatus,
  ChangeRecord,
  ChangedFile,
  CheckKind,
  CheckRun,
  CheckStatus,
  Checkpoint,
  CheckpointKind,
  CreateProjectParams,
  CreateTaskParams,
  DaemonStatus,
  ExportSection,
  FileContent,
  FileDiff,
  FileNode,
  GitCommit,
  GitStatus,
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
  ProjectConfigPatch,
  ProjectKind,
  ProjectSummary,
  ProjectTemplateInfo,
  ProviderConfig,
  ProviderHealth,
  ProviderType,
  ResourceSnapshot,
  RestoreResult,
  ReviewFinding,
  SearchMatch,
  Task,
  TaskKind,
  TaskNote,
  TaskStatus,
  TerminalSession,
  UpdateInfo,
  UpdateTaskInput,
  UpsertProviderInput,
  UsageRecord,
  WorkStatus,
} from '@shared/schemas';
import { ReviewFindingSchema } from '@shared/schemas';
import type { RpcMethod, RpcParsedParams, RpcResult, RpcRequest, RpcResponse } from '@shared/rpc';
import type { Db } from './db/database';
import type { EventBus } from './core/bus';
import type { LogStore, Logger } from './core/logger';
import type { SettingsService } from './core/settings';
import type { ErrorService } from './core/error-service';
import type { DataPaths } from './core/paths';
import type { Clock } from './core/time';
import type { OperationService } from './core/operations';

// -------------------------------------------------------------------------------------
// Core (implemented in src/daemon/core by the integrator, provided by app.ts)
// Helpers every module must use: core/child-env.ts buildChildEnv (child process env), core/exec.ts execTool/
// findExecutable/runPowerShell (tools with argv), core/fs-atomic.ts atomicWriteFile/renameWithRetry/unlinkWithRetry,
// core/net.ts isLocalEndpoint/assertHostAllowed, core/redact.ts redact/redactString/maskSecretFile,
// core/subject.ts normalizeSubject (inside ApprovalService only), core/errors.ts NovaError.
// -------------------------------------------------------------------------------------

export interface CoreContext {
  db: Db;
  bus: EventBus;
  logs: LogStore;
  log: Logger;
  settings: SettingsService;
  errors: ErrorService;
  /** Long operations with progress + cancel (wrap long RPC work in operations.run). */
  operations: OperationService;
  paths: DataPaths;
  clock: Clock;
  /** Random id of this daemon process (orphan detection). */
  instanceId: string;
  version: string;
  platform: NodeJS.Platform;
}

/** Daemon status (built in app.ts; available to every module, e.g. for dashboard.summary). */
export interface DaemonInfo {
  status(): DaemonStatus;
}

export interface NotificationService {
  /** Persists and emits a 'notification' event if the category is enabled in settings.notifications. Bodies: generic German text, never commands/paths/content. */
  notify(input: Omit<Notification, 'id' | 'ts' | 'readAt'>): Notification | null;
  list(opts?: { unreadOnly?: boolean; limit?: number }): Notification[];
  /** ids omitted = all. */
  markRead(ids?: string[]): void;
  unreadCount(): number;
  prune(olderThanMs: number): number;
}

// -------------------------------------------------------------------------------------
// Secrets (module: env → src/daemon/secrets)
// -------------------------------------------------------------------------------------

export interface SecretStore {
  /** dpapi (Windows), keychain (macOS), libsecret (Linux secret-tool), aes-local (Linux/macOS fallback only), memory (tests). */
  readonly scheme: 'dpapi' | 'keychain' | 'libsecret' | 'aes-local' | 'memory';
  /** false for the aes-local fallback – reported as warning error 'secret-store-insecure' and shown in the UI. */
  readonly secure: boolean;
  /** Decrypts all stored secrets once (one batch call) and registers them with the redactor. Called at startup. */
  loadAll(): Promise<void>;
  set(id: string, value: string): Promise<void>;
  /** From the in-memory cache (filled by loadAll/set); decrypts on cache miss. Never logs values. */
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
  action: string; // German explanation + the raw command/path (redacted on store)
  consequences: string; // German
  /** RAW subject (command line, path, host, "cloud:<providerId>", "budget:resume" ...); normalized inside via normalizeSubject. */
  subject: string;
  details?: Record<string, unknown>;
}

export type ApprovalCheck =
  | { state: 'approved'; approval: Approval | null; viaRule: boolean }
  | { state: 'denied'; approval: Approval }
  | { state: 'pending'; approval: Approval };

export interface ApprovalService {
  /** sha256(kind | projectId | normalizeSubject(kind, subject)). */
  fingerprint(kind: ApprovalKind, projectId: string | null, subject: string): string;
  /**
   * approved: an 'always' rule matches (projectId-scoped or global), or an approved 'once' approval with the same
   *           fingerprint AND the same taskId that is not consumed yet.
   * denied:   the latest decided approval with this fingerprint + taskId was denied and not yet acknowledged.
   * pending:  otherwise – reuses a pending approval only if fingerprint AND taskId (null-safe) match, else creates one
   *           (emits 'approval.updated' + notification category 'approval').
   */
  check(req: ApprovalRequest): ApprovalCheck;
  /** Atomically marks a 'once' approval as used. Call BEFORE executing the approved action (never reused after a crash). */
  consume(approvalId: string): void;
  /** Marks a denied approval as acknowledged so the same action can be requested again later. */
  acknowledgeDenial(approvalId: string): void;
  get(id: string): Approval | null;
  list(filter?: { status?: ApprovalStatus; projectId?: string; taskId?: string }): Approval[];
  /** deny ignores scope; scope 'always' → VALIDATION for APPROVAL_KINDS_ONCE_ONLY; 'always' creates a rule. */
  decide(id: string, decision: 'approve' | 'deny', scope: ApprovalScope): Approval;
  /** Resolves when the approval is decided (or rejects on abort). */
  waitFor(id: string, signal?: AbortSignal): Promise<Approval>;
  onDecision(listener: (approval: Approval) => void): () => void;
  rules(): ApprovalRule[];
  deleteRule(id: string): void;
  pendingCount(projectId?: string): number;
  /** Expire pending approvals of a task (task edited, stopped, deleted, finished). */
  expireForTask(taskId: string): void;
  expireForProject(projectId: string): void;
  /** Delete decided/expired approvals older than the cutoff (not referenced by rules). */
  prune(olderThanMs: number): number;
}

// -------------------------------------------------------------------------------------
// Model providers, model routing, budget, Ollama (module: providers → src/daemon/providers)
// -------------------------------------------------------------------------------------

export interface ChatToolSpec {
  name: string;
  description: string;
  /** JSON schema of the arguments (object) – generated with z.toJSONSchema(schema, { io: 'input' }) minus $schema. */
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
  /** Upper bound for generated tokens; ALWAYS sent for paid providers (budget reservation relies on it). */
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
  /** usageReported=false when the provider sent no usage (ModelClient then estimates). */
  usage: { inputTokens: number; outputTokens: number; usageReported: boolean };
  durationMs: number;
  /** Raw provider model string. */
  model: string;
  finishReason: string | null;
}

export interface ModelProvider {
  readonly id: string;
  readonly type: ProviderType;
  config(): ProviderConfig;
  health(): Promise<ProviderHealth>;
  listModels(): Promise<ModelInfo[]>;
  /**
   * Throws NovaError PROVIDER_ERROR / PROVIDER_AUTH / PROVIDER_RATE_LIMIT (details.retryAfterMs from Retry-After) /
   * MODEL_UNAVAILABLE / OLLAMA_UNREACHABLE / CANCELLED. details.requestSent=true when the request body reached the
   * provider (relevant for budget settlement).
   */
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
  /** Ensures the built-in local Ollama provider row exists (id "ollama-local", http://127.0.0.1:11434). */
  ensureDefaults(): void;
  list(): ProviderConfig[];
  getConfig(id: string): ProviderConfig | null;
  get(id: string): ModelProvider | null;
  /** Merge semantics, see UpsertProviderInputSchema doc. Emits provider.updated. */
  upsert(input: UpsertProviderInput): ProviderConfig;
  /** "ollama-local" cannot be removed (disable instead). Emits provider.removed. */
  remove(id: string): void;
  setApiKey(providerId: string, apiKey: string): Promise<void>;
  clearApiKey(providerId: string): Promise<void>;
  /** Live check (network). Updates the cached health. */
  test(providerId: string): Promise<ProviderHealth>;
  healthAll(): Promise<ProviderHealth[]>;
  /** Cached health (no network); refreshed in the background at most every 60 s and by test/healthAll. */
  lastHealth(): ProviderHealth[];
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
  /** Loopback endpoint (core/net isLocalEndpoint). Non-local = cloud: messages are redacted + sensitive_data approval. */
  local: boolean;
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

export interface ModelChatResult extends ChatResponse {
  /** The candidate that actually answered (after fallback). ChatResponse.model stays the raw provider string. */
  resolved: ResolvedModel;
}

/** What agents use. Encapsulates model choice, fallback, approvals, VRAM fit, budget and usage recording. */
export interface ModelClient {
  /**
   * Candidates are EXACTLY [preferred, roleOverrides[role], defaultModel, ...fallbacks] (deduped) – unlisted installed
   * models are never used. A candidate is allowed if: provider enabled; model available; for local Ollama models
   * ollama.fit(...).fits !== false (cached 60 s) and governor.allowedFor(ref).ok; for paid models provider.approved
   * && pricing known && budget allows && paid work not paused (globally/for the project); for non-local providers
   * (when settings.network.approveCloudProjectData) a 'sensitive_data' approval (subject `cloud:<providerId>`) exists –
   * a pending approval makes the candidate skipped. Throws: NO_MODEL (German message lists why each candidate was
   * rejected), VRAM_INSUFFICIENT (details.alternatives), APPROVAL_REQUIRED (details.approvalId, when the only remaining
   * candidates wait for an approval), BUDGET_EXCEEDED / PAID_NOT_APPROVED / PRICE_UNKNOWN (when that is the only reason).
   */
  resolve(role: AgentRole, opts?: { projectId?: string | null; exclude?: ModelRef[]; preferred?: ModelRef | null }): Promise<ResolvedModel>;
  /**
   * Chat with automatic fallback: on MODEL_UNAVAILABLE / OLLAMA_UNREACHABLE / PROVIDER_ERROR(5xx/network) /
   * BUDGET_EXCEEDED the next allowed candidate is tried; PROVIDER_RATE_LIMIT honours Retry-After (≤ 120 s) and per
   * provider options.maxConcurrent / maxRequestsPerMinute. Non-local providers get deep-redacted messages and tool
   * arguments. Paid calls: budget.reserve before sending (max_tokens = reserved output), budget.record after (estimated
   * when usage is missing or the call aborted after sending; never 0). Every retry/fallback reserves again.
   */
  chat(input: ModelChatInput): Promise<ModelChatResult>;
}

export interface BudgetReserveInput {
  providerId: string;
  modelId: string;
  paid: boolean;
  projectId: string | null;
  estimatedInputTokens: number;
  maxOutputTokens: number;
  pricing: ModelPricing | null;
}

export interface BudgetService {
  status(): BudgetStatus;
  /**
   * Synchronous check + reservation: throws BUDGET_EXCEEDED when spent + open reservations + this call's maximum cost
   * would exceed the daily, monthly or project limit; PRICE_UNKNOWN for paid models without pricing. Free (local)
   * models return a no-op reservation.
   */
  reserve(input: BudgetReserveInput): { id: string; maxCostUsd: number };
  /** Records usage and settles the reservation (if given). Emits budget.updated for paid usage. */
  record(usage: Omit<UsageRecord, 'id'>, reservationId?: string): UsageRecord;
  /** Only for calls that provably never reached the provider (connection refused, DNS, 401/403). */
  release(reservationId: string): void;
  usage(filter?: { from?: number; to?: number; projectId?: string; limit?: number }): UsageRecord[];
  breakdown(input: { from?: number; to?: number; groupBy: 'provider' | 'model' | 'project' | 'day' }): BudgetBreakdownRow[];
  setLimits(input: { dailyLimitUsd?: number | null; monthlyLimitUsd?: number | null }): BudgetStatus;
  /** Paid work stays paused after a limit was hit until the user resumes it explicitly (global or per project). */
  isPaidPaused(projectId?: string | null): boolean;
  pausePaid(reason: string, projectId?: string | null): void;
  resumePaid(projectId?: string | null): BudgetStatus;
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
  /** Base URL of provider row "ollama-local" (the only source of truth for the endpoint). */
  baseUrl(): string;
  /** baseUrl tests a candidate endpoint without saving. Updates lastStatus when testing the configured endpoint. */
  status(baseUrl?: string): Promise<OllamaStatus>;
  /** Cached last status (no network). */
  lastStatus(): OllamaStatus | null;
  models(): Promise<ModelInfo[]>;
  show(model: string): Promise<{ model: ModelInfo; modelfile: string | null; license: string | null; parameters: string | null }>;
  /** Starts a streaming pull (governor.canWrite checked); progress via 'ollama.pull' events. */
  pull(model: string): OllamaPull;
  pulls(): OllamaPull[];
  cancelPull(id: string): OllamaPull;
  delete(model: string): Promise<void>;
  running(): Promise<OllamaRunningModel[]>;
  fit(model: string, numCtx?: number): Promise<OllamaFit>;
}

// -------------------------------------------------------------------------------------
// Files, sandbox, change journal, locks, commands, processes, terminal, watcher, agent tools
// (module: tools → src/daemon/tools, src/daemon/changes, src/daemon/processes)
// -------------------------------------------------------------------------------------

export interface ResolvedPath {
  abs: string;
  /** Project-relative with forward slashes, on-disk case (for display, task.files). */
  rel: string;
  /** Canonical comparison key: rel lower-cased on Windows (locks, journal comparisons, dedupe, protection checks). */
  key: string;
}

export interface PathGuard {
  /**
   * Validates the INPUT (rejects NUL/C0, UNC/device forms \\?\ \\.\ \??\, drive-relative "C:foo", ':' other than the
   * drive colon (ADS), segments ending in '.' or ' ', characters < > " | ? *, reserved names CON PRN AUX NUL COM0-9
   * LPT0-9 COM¹²³ LPT¹²³ CONIN$ CONOUT$ CLOCK$ also with extensions), then canonicalizes (realpath of the root and of
   * the deepest existing ancestor) and checks containment (case-insensitive on Windows).
   * Throws NovaError PATH_OUTSIDE_PROJECT / VALIDATION. TOCTOU swaps cannot be prevented (honest limit).
   */
  resolve(projectRoot: string, p: string): ResolvedPath;
  isInside(projectRoot: string, abs: string): boolean;
  /** Agent writes forbidden: .git/**, .nova/**, anything inside the NOVA data dir (matched on key). */
  isProtected(projectRoot: string, key: string): boolean;
  /** Secret files: .env, .env.* (except .env.example/.env.sample/.env.template), *.pem, *.key, *.pfx, *.p12, id_rsa*,
   * id_ed25519*, .npmrc, .pypirc, .git-credentials, credentials*.json, secrets.* – read masked, write needs approval. */
  isSensitive(rel: string): boolean;
}

/** rel → {size, mtimeMs} snapshot of a project tree (ignored dirs skipped, ≤ 50 000 files). */
export type FileStateMap = Map<string, { size: number; mtimeMs: number }>;

export interface ChangeJournal {
  /**
   * Crash-safe order: compute afterHash → write snapshot blob (fsync, verify) → INSERT row state 'pending' → temp file +
   * fsync + rename (fs-atomic) → UPDATE state 'committed'. Skips unchanged content. Checks governor.canWrite (DISK_FULL).
   * Emits files.changed. Returns null-safe record (unchanged content → the previous record for the file is NOT created).
   */
  writeFile(input: { projectId: string; projectRoot: string; relPath: string; content: string | Buffer; taskId?: string | null; runId?: string | null; actor: 'nova' | 'user'; source?: 'tool' | 'user' | 'restore' }): Promise<ChangeRecord | null>;
  deleteFile(input: { projectId: string; projectRoot: string; relPath: string; taskId?: string | null; runId?: string | null; actor: 'nova' | 'user'; source?: 'tool' | 'user' | 'restore' }): Promise<ChangeRecord>;
  /** Pending rows after a crash: current hash == after → committed; == before (or missing for create) → row deleted; else committed. */
  recoverPending(): number;
  /** Snapshot of the project tree before an agent command. */
  scanState(projectRoot: string): Promise<FileStateMap>;
  /**
   * After an agent command: records created/modified/deleted files (source 'command'). Creates are revertible;
   * modify/delete are revertible only if a before blob exists (git: file was clean → blob from `git show HEAD:path`).
   * Calls tasks.addFiles, emits files.changed {actor:'nova'}.
   */
  recordCommandChanges(input: { projectId: string; projectRoot: string; taskId: string | null; runId: string | null; before: FileStateMap }): Promise<ChangeRecord[]>;
  list(filter: { projectId: string; taskId?: string; path?: string; afterId?: number; includeReverted?: boolean; limit?: number }): ChangeRecord[];
  get(id: number): ChangeRecord | null;
  /** Highest change id of a project (0 if none). Used as checkpoint cursor. */
  maxId(projectId: string): number;
  /** Verifies sha256; null if missing or corrupt. */
  readSnapshot(hash: string): Buffer | null;
  /** Files NOVA changed (not reverted), with "modified since" detection by comparing current hash with afterHash. */
  changedFiles(projectId: string, projectRoot: string): Promise<ChangedFile[]>;
  /**
   * Reverts NOVA changes (newest first). Selection: all non-reverted nova changes with id > afterId, or of taskId.
   * A change is only reverted if the file's current hash equals the change's afterHash (otherwise conflict, file
   * untouched); not revertible → skipped with reason; missing blob → conflict "Sicherung nicht mehr vorhanden".
   * Reverts are journaled (source 'restore'). Never touches files NOVA did not change. dryRun reports only.
   */
  revert(input: { projectId: string; projectRoot: string; afterId?: number; taskId?: string; dryRun?: boolean }): Promise<{ restored: string[]; conflicts: { path: string; reason: string }[]; skipped: string[] }>;
  /** Delete snapshot blobs no longer referenced by non-reverted changes and older than the cutoff. */
  pruneSnapshots(olderThanMs: number): number;
  /** Paths the journal wrote in the last `withinMs` (watcher suppression). */
  recentlyWritten(projectId: string, withinMs: number): Set<string>;
}

export interface FileLockService {
  /** Uses ResolvedPath.key. Locks are kept while a task is paused/waiting_approval/interrupted. */
  acquire(projectId: string, key: string, taskId: string): { ok: true } | { ok: false; heldBy: string };
  heldBy(projectId: string, key: string): string | null;
  listForTask(taskId: string): string[];
  releaseTask(taskId: string): void;
  releaseProject(projectId: string): void;
  releaseAll(): void;
}

export type CommandDecision =
  | { action: 'allow'; reason: string }
  | { action: 'approve'; kind: ApprovalKind; reason: string; consequences: string; subject: string }
  | { action: 'block'; reason: string };

export interface CommandPolicy {
  /**
   * Decides whether an AGENT may run a command line (user terminal commands are not checked). Fail-closed rules in
   * SPEC §6.3: control chars → block; auto-allow only metacharacter-free lines matching an allowlist prefix exactly;
   * taint rule (running files NOVA wrote in this task); nested interpreters; encoded PowerShell → block; network,
   * outside-project, security-config, publish, delete, install, admin classification.
   */
  evaluate(input: { projectId: string; projectRoot: string; command: string; config: ProjectConfig; taskId: string | null }): CommandDecision;
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
  /** Terminal lines run through PowerShell (-EncodedCommand) instead of cmd.exe on Windows. */
  shell?: 'default' | 'powershell';
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
  /**
   * Runs a command line through the platform shell: Windows `cmd.exe /d /s /c "chcp 65001>nul & <line>"` (wrapper never
   * shown), POSIX `/bin/sh -c` in its own process group; env = buildChildEnv(). Waits for governor.canStartProcess()
   * (dev_server/preview kinds do not count). Output decoded as UTF-8, redacted tails.
   */
  run(input: RunCommandInput): Promise<CommandResult>;
  /** Starts a long-running process (dev server, preview, desktop run). */
  start(input: StartProcessInput): Promise<ProcessHandle>;
  /** Kills the whole process tree (descendant walk by ParentProcessId + creation time on Windows, process group on POSIX). */
  kill(id: string): Promise<ProcessInfo>;
  killTask(taskId: string): Promise<void>;
  killProject(projectId: string): Promise<void>;
  get(id: string): ProcessInfo | null;
  list(filter?: { projectId?: string; includeExited?: boolean }): ProcessInfo[];
  output(id: string, tailLines: number): string;
  /**
   * Rows with status running from other instances: identity = (pid, OS creation time within [started_at−2s,
   * started_at+5s]); matching process trees are killed leaves-first, then rows are marked orphaned. Returns count.
   */
  recoverOrphans(): Promise<number>;
  runningCount(): number;
  prune(olderThanMs: number): number;
  shutdown(): Promise<void>;
}

export interface TerminalService {
  create(projectId: string): TerminalSession;
  list(projectId?: string): TerminalSession[];
  /** Runs one line (PowerShell -EncodedCommand on Windows, bash -lc / sh -c elsewhere). "cd" handled internally (stays in the project). */
  run(sessionId: string, line: string): { accepted: boolean };
  interrupt(sessionId: string): void;
  close(sessionId: string): void;
  closeProject(projectId: string): void;
  closeAll(): void;
}

/** Watches project folders for external changes (other editors, Unity) → files.changed {actor:'external'}. */
export interface FileWatcher {
  watch(projectId: string, root: string): void;
  unwatch(projectId: string): void;
  unwatchAll(): void;
}

export interface FileService {
  /** Walkers never follow symlinks/junctions (listed with children=null). Calls projects.refreshGit lazily. */
  tree(projectId: string, path: string, depth: number): Promise<FileNode>;
  read(projectId: string, path: string): Promise<FileContent>;
  /** User edit (actor "user"). Throws CONFLICT if expectedHash is given and differs from the current file. */
  write(projectId: string, path: string, content: string, expectedHash: string | null): Promise<FileContent>;
  delete(projectId: string, path: string): Promise<void>;
  rename(projectId: string, from: string, to: string): Promise<void>;
  mkdir(projectId: string, path: string): Promise<void>;
  snapshot(projectId: string, hash: string): { content: string; binary: boolean };
  search(projectId: string, query: string, opts: { regex: boolean; caseSensitive: boolean; limit: number }): Promise<SearchMatch[]>;
  changed(projectId: string): Promise<ChangedFile[]>;
  history(projectId: string, filter: { path?: string; taskId?: string; limit: number }): ChangeRecord[];
  diff(projectId: string, path: string, opts?: { taskId?: string; changeId?: number }): Promise<FileDiff>;
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
  /** The run pauses (run → waiting_approval) and re-executes this exact tool call after the decision. */
  | { status: 'approval_required'; approvalId: string; content: string }
  /** ask_user: the run pauses (task blocked NEEDS_INPUT) until the user answers via tasks.addNote. */
  | { status: 'needs_input'; noteId: string; content: string };

export interface AgentTool<P = any> {
  name: string; // snake_case, e.g. "read_file"
  /** English description for the model. */
  description: string;
  schema: z.ZodType<P>;
  /** true = no side effects (safe to repeat after a crash). */
  readOnly: boolean;
  /** German one-liner for the activity feed, e.g. "Liest src/app.ts". */
  describe(params: P): string;
  /** Result content is passed through redactString by the registry before it reaches the model. */
  execute(params: P, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolRegistry {
  register(tool: AgentTool): void;
  get(name: string): AgentTool | null;
  names(): string[];
  /** JSON-schema specs for the given tool names (z.toJSONSchema(schema, { io: 'input' }) minus $schema). */
  specs(names: string[]): ChatToolSpec[];
  /** Validates args with the tool's schema, executes, redacts the result content. Unknown tool → error result. */
  execute(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>;
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
  /** Expected files → task.plannedFiles (NEVER task.files). */
  files: zod.array(zod.string()).default([]),
});
export type PlanTask = z.infer<typeof PlanTaskSchema>;

export const PlanOutputSchema = zod.object({
  summary: zod.string(),
  tasks: zod.array(PlanTaskSchema).max(15),
  memory: zod
    .array(zod.object({ kind: zod.enum(['goal', 'decision', 'requirement', 'convention', 'question', 'next_step', 'note']), title: zod.string(), content: zod.string() }))
    .default([]),
});
export type PlanOutput = z.infer<typeof PlanOutputSchema>;

export { ReviewFindingSchema };
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
  /** Informational only – verification comes exclusively from real CheckRuns. */
  passed: zod.boolean().nullable(),
  failures: zod.array(zod.string()).default([]),
  fixed: zod.boolean().default(false),
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
  /** ask_user (code NEEDS_INPUT) and resumable model problems are 'blocked' with a code. */
  | { status: 'blocked'; runId: string; reason: string; code: string }
  | { status: 'failed'; runId: string; reason: string; code: string }
  | { status: 'cancelled'; runId: string }
  /** Daemon shutdown (abort reason NovaError INTERRUPTED): state kept for resume. */
  | { status: 'interrupted'; runId: string };

export interface AgentRunInput {
  task: Task;
  project: Project;
  /** Role to run (default task.role). The reviewer pass runs role 'reviewer' on a coder task. */
  role?: AgentRole;
  /** Resume this run (paused / waiting_approval / interrupted / resumable-blocked) from its saved conversation state. */
  resumeRunId?: string | null;
  /** Aborted with reason NovaError('INTERRUPTED') → outcome interrupted (state kept); any other reason → cancelled. */
  signal: AbortSignal;
  /** Checked between steps; when true the run saves its state and returns 'paused'. */
  pauseRequested: () => boolean;
  /** Extra context from the orchestrator (previous failures, review findings, test output, changed files ...). */
  extraContext?: string;
}

export interface AgentRunner {
  /** Never writes the tasks table (only runs/steps, task notes consumption and tasks.addFiles via tools). */
  run(input: AgentRunInput): Promise<AgentRunOutcome>;
  roles(): AgentRoleInfo[];
  /** Exchangeable role modules (planner/coder/tester/reviewer implementations). */
  registerRole(module: AgentRoleModule): void;
}

export interface AgentRoleModule {
  info: AgentRoleInfo;
  /** System prompt for this role (English), given project + task + memory context. */
  systemPrompt(ctx: { project: Project; task: Task; memory: MemoryEntry[]; platform: NodeJS.Platform; extraContext?: string; toolsInPrompt?: ChatToolSpec[] }): string;
  /**
   * Terminal tool that finishes the run (e.g. "submit_plan", "finish", "submit_review"). It is NOT registered in the
   * ToolRegistry: the runner adds its spec to the role's tool list and handles the call itself.
   */
  finishTool: { name: string; description: string; schema: z.ZodType };
  /** Generic tools (ToolRegistry names) this role may use – authoritative (calls to other tools are rejected). */
  toolNames: string[];
  /** Parses/validates the finish tool data into the role output (throws on invalid data; message goes back to the model). */
  parseOutput(data: unknown): AgentOutput;
}

export interface RunStore {
  create(input: { taskId: string; projectId: string; role: AgentRole }): AgentRun;
  get(id: string): AgentRun | null;
  update(id: string, patch: Partial<Omit<AgentRun, 'id' | 'taskId' | 'projectId' | 'role' | 'startedAt'>>): AgentRun;
  /** activeOnly = status 'running' only. */
  list(filter?: { projectId?: string; taskId?: string; activeOnly?: boolean; pendingApprovalId?: string; status?: AgentRunStatus[]; limit?: number }): AgentRun[];
  latestForTask(taskId: string, role?: AgentRole): AgentRun | null;
  addStep(runId: string, kind: AgentStepKind, summary: string, data?: unknown): AgentStep;
  steps(runId: string, afterId?: number, limit?: number): AgentStep[];
  saveState(runId: string, state: unknown): void;
  loadState<T>(runId: string): T | null;
  /** Runs with status running at startup → interrupted. Returns affected runs. */
  markInterrupted(): AgentRun[];
  /** Deletes steps + run-state files of runs ended before the cutoff (run rows are kept); caps steps per run at 5000. */
  prune(olderThanMs: number): number;
}

// -------------------------------------------------------------------------------------
// Tasks and the autonomous work cycle (module: orchestrator → src/daemon/tasks)
// -------------------------------------------------------------------------------------

export interface TaskService {
  list(filter?: { projectId?: string; status?: TaskStatus[]; parentId?: string; limit?: number }): Task[];
  get(id: string): Task | null;
  require(id: string): Task;
  /** Parsed input; maxAttempts defaults to settings.agents.maxAttempts. dependsOn validated (same project, no cycles). */
  create(input: CreateTaskParams, source?: Task['source']): Task;
  /** Not while running. Expires pending approvals of the task. */
  update(input: UpdateTaskInput): Task;
  setPriority(id: string, priority: number): Task;
  /** CONFLICT if running or if open tasks depend on it (lists their titles). */
  delete(id: string): void;
  /** Internal state change (emits task.updated). Only WorkCycle changes status/blocker/result/verification/attempts/times. */
  patch(id: string, patch: Partial<Omit<Task, 'id' | 'projectId' | 'createdAt'>>): Task;
  /** Dedupes by canonical key; project-relative forward-slash paths. Called by tools. */
  addFiles(id: string, files: string[]): Task;
  /** Queued tasks whose dependencies are all done, ordered by priority desc, createdAt asc. */
  ready(projectId?: string): Task[];
  counts(projectId?: string): Record<TaskStatus, number>;
  notes(taskId: string): TaskNote[];
  addNote(input: { taskId: string; author: TaskNote['author']; kind: TaskNote['kind']; text: string; options?: string[]; assumption?: string | null }): TaskNote;
  /** Unconsumed user notes/answers for a task. */
  pendingNotes(taskId: string): TaskNote[];
  markNotesConsumed(noteIds: string[], runId: string): void;
}

export interface WorkCycle {
  start(projectId?: string): WorkStatus;
  pause(projectId?: string): WorkStatus;
  resume(projectId?: string): WorkStatus;
  /** Stops new work, cancels running runs (kills their processes), re-queues their tasks; state 'stopped'. */
  stop(projectId?: string): WorkStatus;
  status(): WorkStatus;
  /** Number of runs currently executing (in-memory controllers). */
  activeRunCount(): number;
  startTask(id: string): Task;
  pauseTask(id: string): Task;
  resumeTask(id: string): Task;
  stopTask(id: string): Promise<Task>;
  retryTask(id: string): Task;
  /** Adds a user note; a task blocked with NEEDS_INPUT is re-queued. */
  addNote(taskId: string, text: string): TaskNote;
  /** Creates a 'fix' task from a failed check or an error. */
  createFix(input: { projectId: string; checkRunId?: string; errorId?: string; note?: string }): Task;
  /** Creates a planning task for a goal and queues it (startRequested=true). */
  planGoal(projectId: string, goal: string): Task;
  /** Startup recovery (SPEC §6.5). */
  recover(): Promise<{ tasks: number }>;
  /** Starts the scheduler loop. */
  startLoop(): void;
  /** Graceful stop: pause flags → wait timeoutMs → abort remaining with INTERRUPTED → persist interrupted. */
  shutdown(timeoutMs: number): Promise<void>;
  /** Test hook: run one scheduling pass immediately (returns after scheduling, not after runs finished). */
  tick(): Promise<void>;
  /** Test hook: resolves when no run is executing. */
  idle(): Promise<void>;
}

// -------------------------------------------------------------------------------------
// Projects, templates, checks (tests/builds), preview (module: projects → src/daemon/projects, checks, preview)
// -------------------------------------------------------------------------------------

export interface ProjectService {
  list(opts?: { includeArchived?: boolean }): ProjectSummary[];
  get(id: string): Project | null;
  require(id: string): Project;
  summary(id: string): ProjectSummary;
  /** Parsed input. Safety rules for the root folder (SPEC §6.8). */
  create(input: CreateProjectParams): Promise<{ project: Project; planTaskId: string | null; warnings: string[] }>;
  update(input: { id: string; name?: string; description?: string; kind?: ProjectKind; technologies?: string[]; status?: Project['status']; path?: string; config?: ProjectConfigPatch }): Project;
  /** Only the work cycle calls this (work.start/pause/resume/stop). Emits project.updated. */
  setWorkState(id: string, state: Project['workState']): Project;
  /** Removes the project from NOVA (SPEC §6.8 order). NEVER deletes files on disk. CONFLICT while tasks run. */
  remove(id: string): Promise<void>;
  detect(id: string): Promise<{ kind: ProjectKind; technologies: string[]; config: ProjectConfig }>;
  /** gitAvailable = git executable found && folder is a repository. Emits project.updated when it changed. */
  refreshGit(id: string): Promise<Project>;
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
  /** Runs and awaits a check (agents, work cycle). Status not_run (with German message) when no command is configured. */
  run(input: { projectId: string; kind: CheckKind; taskId?: string | null; signal?: AbortSignal; actor?: 'user' | 'agent' | 'system' }): Promise<CheckRun>;
  /** Starts a check in the background and returns it with status running (RPC checks.run). */
  start(input: { projectId: string; kind: CheckKind; taskId?: string | null; actor?: 'user' | 'agent' | 'system' }): CheckRun;
  cancel(id: string): Promise<CheckRun>;
  get(id: string): CheckRun | null;
  list(projectId: string, opts?: { kind?: CheckKind; taskId?: string; since?: number; limit?: number }): CheckRun[];
  latest(projectId: string, kind: CheckKind): CheckRun | null;
  /** Newest runs of a kind across projects, optionally only with a status (e.g. passed builds). */
  recent(kind: CheckKind | CheckKind[], limit: number, status?: CheckStatus): CheckRun[];
  /** Per project: the latest test/e2e run if its status is failed/error. */
  currentFailures(limit: number): CheckRun[];
  prune(olderThanMs: number): number;
}

export interface PreviewService {
  status(projectId: string): PreviewStatus;
  start(projectId: string): Promise<PreviewStatus>;
  stop(projectId: string): Promise<PreviewStatus>;
  stopAll(): Promise<void>;
  // Reload: the service subscribes to core.bus 'files.changed' itself (debounced 300 ms). Nobody calls it for that.
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
  /** `git add -- <paths>` then `git commit --only -m <msg> -- <paths>` (user's other staged changes untouched). Null if nothing changed. */
  commitPaths(root: string, paths: string[], message: string): Promise<string | null>;
  /** Only https://, ssh://, git@host: URLs; `git clone --end-of-options <url> <dir>`; host must pass assertHostAllowed (else network approval). */
  clone(url: string, dir: string, signal?: AbortSignal, onProgress?: (percent: number | null, message: string) => void): Promise<void>;
  showFile(root: string, ref: string, path: string): Promise<Buffer | null>;
  /** Paths (rel) that are clean (tracked, unmodified) – used by the journal to snapshot before commands. */
  isClean(root: string, paths: string[]): Promise<Set<string>>;
}

export interface CheckpointService {
  list(projectId: string): Checkpoint[];
  create(input: { projectId: string; kind: CheckpointKind; label: string; taskId?: string | null; verification?: Checkpoint['verification'] }): Promise<Checkpoint>;
  preview(input: { checkpointId?: string; taskId?: string }): Promise<RestoreResult>;
  /** CONFLICT while tasks of the project run. Creates a pre_restore checkpoint, reverts via ChangeJournal, optionally commits restored files. */
  restore(input: { checkpointId?: string; taskId?: string; commit: boolean }): Promise<RestoreResult>;
  /**
   * After a successful task (verification already patched by WorkCycle): commits task.files that are not
   * modifiedSinceNova and contain no secrets (containsSecret → SECRET_IN_CODE warning, file skipped) when
   * project.config.autoCommit and verification allows. Always creates a post_task checkpoint (gitCommit may be null).
   */
  afterTask(task: Task): Promise<Checkpoint | null>;
  /** Latest checkpoint of a project with verification 'passed' (for error userActions). */
  latestVerified(projectId: string): Checkpoint | null;
}

export interface BackupService {
  list(): BackupInfo[];
  createDatabaseBackup(reason: string): BackupInfo;
  snapshotProject(projectId: string, signal?: AbortSignal, onProgress?: (p: number | null, m: string) => void): Promise<BackupInfo>;
  /** Database: validate, back up current DB, write restore-pending.json, request daemon restart. Snapshot: copy to targetDir (never over the original). */
  restore(id: string, opts?: { targetDir?: string }): Promise<{ message: string; restartRequired: boolean; path: string | null }>;
  delete(id: string): void;
  /** Count/age retention for DB backups and project snapshots (per project) + journal.pruneSnapshots(snapshotRetentionDays). */
  applyRetention(): number;
  /** Daily backup if enabled and none exists for today. */
  maybeDailyBackup(): BackupInfo | null;
  exportData(sections: ExportSection[], path?: string): Promise<{ path: string; counts: Record<string, number> }>;
  /** Never imports permissions/network/budgets sections; imported providers get approved=false; tasks normalized to queued. */
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
  /** projectId: undefined = all entries; null = global knowledge base only; string = that project only. */
  list(filter?: { projectId?: string | null; kind?: MemoryKind; limit?: number }): MemoryEntry[];
  /** projectId string → that project (+ shareable global entries if includeGlobal); null → global only; undefined → all. */
  search(query: string, opts?: { projectId?: string | null; includeGlobal?: boolean; limit?: number }): MemorySearchResult[];
  /**
   * Redacts secrets; rejects content that is mainly a credential (VALIDATION). source 'agent': VALIDATION if memory
   * disabled or !agentsMayWrite; agent insights shareable only if settings.memory.autoShareAgentInsights.
   * source 'system'/'user': VALIDATION only if memory disabled.
   */
  add(input: MemoryAddInput, source: MemoryEntry['source']): MemoryEntry;
  update(id: string, patch: Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'kind' | 'shareable'>>): MemoryEntry;
  delete(id: string): void;
  clear(projectId: string | null): number;
  /** Delete all non-shareable entries of a project (project removal). */
  removeProject(projectId: string): number;
  exportTo(projectId: string | null | undefined, path?: string): Promise<{ path: string; count: number }>;
  importFrom(path: string): Promise<{ imported: number; skipped: number }>;
  /**
   * Relevant entries for an agent prompt: project goals/requirements/conventions/decisions + FTS matches + (if enabled)
   * shareable global entries and shareable insights of other projects with absolute paths/project names replaced by
   * placeholders. Never non-shareable entries of other projects. [] when memory is disabled.
   */
  contextFor(input: { projectId: string; query: string; limit?: number }): MemoryEntry[];
  /** Latest next_step entry of a project (idle suggestion). */
  latestNextStep(projectId: string): MemoryEntry | null;
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
  /** Watch a project's drive for free-space reporting. */
  trackPath(path: string): void;
}

export interface ConcurrencyGovernor {
  /** activeRuns = WorkCycle.activeRunCount(). Considers maxParallelAgents, CPU, RAM, data-drive free space. */
  allowed(activeRuns: number): { allowed: number; configured: number; reason: string | null };
  /** Local model not yet loaded + VRAM usage above maxVramPercent → not ok. */
  allowedFor(model: ModelRef): { ok: boolean; reason: string | null };
  canStartProcess(): { ok: boolean; reason: string | null };
  /** Free space on the drive of absPath < minFreeDiskMb → not ok. */
  canWrite(absPath: string): { ok: boolean; reason: string | null };
}

export interface IntegrationDetectContext {
  platform: NodeJS.Platform;
  manualPath: string | null;
  /** argv execution with timeout (execTool). */
  run(file: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }>;
  findExecutable(name: string): Promise<string | null>;
  env: Record<string, string | undefined>;
}

export interface IntegrationModule {
  id: string;
  name: string;
  category: IntegrationStatus['category'];
  detect(ctx: IntegrationDetectContext): Promise<{ available: boolean; version: string | null; path: string | null; message: string; installations: { version: string; path: string }[] }>;
  installHint(platform: NodeJS.Platform): IntegrationStatus['installHint'];
  /** Optional "open project/file" support (detached, user action). */
  open?(input: { executable: string; projectRoot: string; file?: string; line?: number; engineVersion?: string | null; installations: { version: string; path: string }[] }): { file: string; args: string[] };
}

export interface IntegrationService {
  register(module: IntegrationModule): void;
  list(refresh?: boolean): Promise<IntegrationStatus[]>;
  /** NOT_FOUND for unknown ids. */
  get(id: string, refresh?: boolean): Promise<IntegrationStatus>;
  /** Executable path (manual override first) or null. For unity with engineVersion: the matching installation only. */
  resolvePath(id: string, opts?: { version?: string | null }): Promise<string | null>;
  setPath(id: string, path: string | null): Promise<IntegrationStatus>;
  /** Creates an 'install' approval with the winget command; installs only after approval; refreshes PATH + status. */
  requestInstall(id: string): Promise<{ approvalId: string | null; message: string }>;
  open(input: { id: string; projectId: string; path?: string; line?: number }): Promise<void>;
}

export interface UpdateService {
  check(): Promise<UpdateInfo>;
  /** Daily check when settings.updates.checkForUpdates; notifies once per new version. */
  start(): void;
  stop(): void;
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
  daemon: DaemonInfo;
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
  watcher: FileWatcher;
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

export type { AgentRunStatus, TaskKind, ReviewFinding };
