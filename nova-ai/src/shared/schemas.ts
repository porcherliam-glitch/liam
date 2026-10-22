// Domain model shared by daemon, Electron main and renderer.
// All timestamps are milliseconds since epoch (number). All IDs are opaque strings with a prefix
// (see daemon/core/ids.ts). These schemas are the single source of truth for the RPC contract.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const ProjectKind = z.enum(['web', 'unity', 'desktop', 'backend', 'godot', 'unreal', 'generic']);
export type ProjectKind = z.infer<typeof ProjectKind>;

export const ProjectStatus = z.enum(['active', 'paused', 'archived']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** Commands NOVA uses for a project. null = not available / unknown. */
export const ProjectCommandsSchema = z.object({
  install: z.string().nullable(),
  dev: z.string().nullable(),
  build: z.string().nullable(),
  test: z.string().nullable(),
  lint: z.string().nullable(),
  run: z.string().nullable(),
});
export type ProjectCommands = z.infer<typeof ProjectCommandsSchema>;

export const PreviewKind = z.enum(['browser-dev-server', 'browser-static', 'desktop-run', 'engine-external', 'none']);
export type PreviewKind = z.infer<typeof PreviewKind>;

export const ProjectConfigSchema = z.object({
  commands: ProjectCommandsSchema,
  preview: z.object({
    kind: PreviewKind,
    /** For browser-static: entry file relative to project root (e.g. "index.html"). */
    entry: z.string().nullable(),
    /** For browser-dev-server: fixed URL if known, otherwise detected from process output. */
    url: z.string().nullable(),
  }),
  /** Extra command prefixes the agents may run without approval in this project. */
  allowedCommands: z.array(z.string()),
  /** Run tests automatically after code tasks. */
  testAfterChange: z.boolean(),
  /** Let the reviewer agent review each code task. */
  reviewChanges: z.boolean(),
  /** Commit NOVA's changes to git after successful tasks (only NOVA-touched files). */
  autoCommit: z.boolean(),
  /** Per-project cloud budget in USD per month, null = no extra project limit. */
  monthlyBudgetUsd: z.number().nonnegative().nullable(),
  /** Free-form notes / conventions given to the agents. */
  conventions: z.string(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  path: z.string(), // absolute path on disk
  kind: ProjectKind,
  technologies: z.array(z.string()),
  status: ProjectStatus,
  templateId: z.string().nullable(),
  config: ProjectConfigSchema,
  /** Autonomous work cycle enabled for this project. */
  workEnabled: z.boolean(),
  gitAvailable: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectSummarySchema = ProjectSchema.extend({
  progress: z.number().min(0).max(100), // done tasks / all non-cancelled tasks
  openTasks: z.number(),
  runningTasks: z.number(),
  failedTasks: z.number(),
  blockedTasks: z.number(),
  openErrors: z.number(),
  lastBuild: z.lazy(() => CheckRunSchema).nullable(),
  lastTest: z.lazy(() => CheckRunSchema).nullable(),
  lastActivityAt: z.number().nullable(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const CreateProjectMode = z.enum(['description', 'wizard', 'template', 'open', 'import']);
export type CreateProjectMode = z.infer<typeof CreateProjectMode>;

export const CreateProjectInputSchema = z.object({
  mode: CreateProjectMode,
  name: z.string().min(1).max(120),
  description: z.string().max(20000).default(''),
  /** Target directory. For 'open' an existing folder; otherwise parent dir + name is used when omitted. */
  path: z.string().nullable().default(null),
  templateId: z.string().nullable().default(null),
  kind: ProjectKind.nullable().default(null),
  technologies: z.array(z.string()).default([]),
  /** For 'import': git URL to clone. */
  repoUrl: z.string().nullable().default(null),
  /** Wizard answers (free-form key/value), stored in project memory as requirements. */
  answers: z.record(z.string(), z.string()).default({}),
  /** Create a planning task right away from the description. */
  planNow: z.boolean().default(true),
  initGit: z.boolean().default(true),
});
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;

export const ProjectTemplateInfoSchema = z.object({
  id: z.string(),
  name: z.string(), // German
  description: z.string(), // German
  kind: ProjectKind,
  technologies: z.array(z.string()),
  requiredTools: z.array(z.string()), // integration ids, e.g. ["node", "npm"]
  previewKind: PreviewKind,
  /** Missing integrations right now (computed). */
  missingTools: z.array(z.string()),
});
export type ProjectTemplateInfo = z.infer<typeof ProjectTemplateInfoSchema>;

// ---------------------------------------------------------------------------
// Tasks, agents, work cycle
// ---------------------------------------------------------------------------

export const AgentRole = z.enum(['planner', 'coder', 'tester', 'reviewer']);
export type AgentRole = z.infer<typeof AgentRole>;

export const TaskKind = z.enum(['plan', 'code', 'test', 'fix', 'review', 'build', 'custom']);
export type TaskKind = z.infer<typeof TaskKind>;

export const TaskStatus = z.enum([
  'queued', // waiting to be picked up (dependencies may still be open)
  'running',
  'paused', // paused by the user, conversation state kept
  'waiting_approval', // waiting for a user decision
  'blocked', // cannot continue (missing model, budget, lock, repeated failure ...), see blocker
  'done',
  'failed',
  'cancelled',
  'interrupted', // daemon stopped while running; recovery decides what happens
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskPriority = z.number().int().min(0).max(3); // 0 low, 1 normal, 2 high, 3 critical
export type TaskPriority = z.infer<typeof TaskPriority>;

export const CheckStatus = z.enum(['passed', 'failed', 'error', 'not_run', 'running', 'skipped']);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const VerificationSchema = z.object({
  /**
   * passed     = all relevant executable checks passed
   * failed     = at least one check failed
   * not_run    = no checks were run (yet)
   * unavailable = no checks exist/can be executed for this task (shown clearly as "nicht geprüft")
   */
  status: z.enum(['passed', 'failed', 'not_run', 'unavailable']),
  checks: z.array(
    z.object({
      name: z.string(), // e.g. "Tests", "Build", "Review"
      status: CheckStatus,
      details: z.string().nullable(),
      checkRunId: z.string().nullable(),
    }),
  ),
});
export type Verification = z.infer<typeof VerificationSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  kind: TaskKind,
  role: AgentRole,
  status: TaskStatus,
  priority: TaskPriority,
  dependsOn: z.array(z.string()),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  /** Human readable reason why the task is blocked/failed/waiting (German). */
  blocker: z.string().nullable(),
  /** Final summary written by the agent (German). */
  result: z.string().nullable(),
  /** Acceptance criteria from the planner or the user. */
  acceptance: z.string().nullable(),
  verification: VerificationSchema,
  /** Files changed by NOVA for this task (project-relative, forward slashes). */
  files: z.array(z.string()),
  /** "providerId/modelId" of the last model used. */
  model: z.string().nullable(),
  source: z.enum(['user', 'planner', 'system']),
  createdAt: z.number(),
  updatedAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskInputSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(300),
  description: z.string().max(50000).default(''),
  kind: TaskKind.default('code'),
  role: AgentRole.optional(),
  priority: TaskPriority.default(1),
  dependsOn: z.array(z.string()).default([]),
  acceptance: z.string().nullable().default(null),
  parentId: z.string().nullable().default(null),
  maxAttempts: z.number().int().min(1).max(10).default(3),
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(50000).optional(),
  priority: TaskPriority.optional(),
  dependsOn: z.array(z.string()).optional(),
  acceptance: z.string().nullable().optional(),
  role: AgentRole.optional(),
  maxAttempts: z.number().int().min(1).max(10).optional(),
});
export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

export const AgentRunStatus = z.enum(['running', 'paused', 'waiting_approval', 'done', 'failed', 'cancelled', 'interrupted', 'blocked']);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const AgentRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  projectId: z.string(),
  role: AgentRole,
  status: AgentRunStatus,
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  stepCount: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  lastAction: z.string().nullable(), // German one-liner, e.g. "Schreibt src/app.ts"
  blocker: z.string().nullable(),
  files: z.array(z.string()),
  pendingApprovalId: z.string().nullable(),
  error: z.string().nullable(),
  startedAt: z.number(),
  updatedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const AgentStepKind = z.enum(['status', 'thought', 'model_call', 'tool_call', 'tool_result', 'message', 'error', 'approval']);
export type AgentStepKind = z.infer<typeof AgentStepKind>;

export const AgentStepSchema = z.object({
  id: z.number().int(),
  runId: z.string(),
  taskId: z.string(),
  projectId: z.string(),
  ts: z.number(),
  kind: AgentStepKind,
  summary: z.string(), // German one-liner for the activity feed
  data: z.unknown().nullable(), // redacted structured payload (tool args/result excerpt ...)
});
export type AgentStep = z.infer<typeof AgentStepSchema>;

export const AgentRoleInfoSchema = z.object({
  role: AgentRole,
  name: z.string(), // German display name
  description: z.string(),
  tools: z.array(z.string()),
  moduleId: z.string(), // implementation module (exchangeable)
});
export type AgentRoleInfo = z.infer<typeof AgentRoleInfoSchema>;

export const WorkCycleState = z.enum(['running', 'paused', 'stopped']);
export type WorkCycleState = z.infer<typeof WorkCycleState>;

export const WorkStatusSchema = z.object({
  state: WorkCycleState,
  /** Allowed parallel agents right now (after resource adaptation). */
  allowedConcurrency: z.number().int(),
  configuredConcurrency: z.number().int(),
  activeRuns: z.number().int(),
  queuedTasks: z.number().int(),
  /** German explanation when nothing runs, e.g. "Alle Aufgaben warten auf Freigabe". */
  idleReason: z.string().nullable(),
  /** Per-project state. */
  projects: z.array(
    z.object({
      projectId: z.string(),
      workEnabled: z.boolean(),
      activeRuns: z.number().int(),
      queuedTasks: z.number().int(),
      idleReason: z.string().nullable(),
    }),
  ),
});
export type WorkStatus = z.infer<typeof WorkStatusSchema>;

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const ApprovalKind = z.enum([
  'command', // command not on the allowlist
  'admin', // needs administrator rights
  'delete', // destructive delete
  'outside_project', // access outside the project folder
  'system_change', // system-wide change (PATH, registry, global installs ...)
  'security_config', // changes to security relevant configuration
  'publish', // publish/transfer data (git push, upload ...)
  'sensitive_data', // send sensitive data to a cloud provider
  'paid_model', // use a paid model / exceed budget
  'install', // install a tool
  'network', // network access to a non-allowed host
]);
export type ApprovalKind = z.infer<typeof ApprovalKind>;

export const ApprovalStatus = z.enum(['pending', 'approved', 'denied', 'expired']);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

export const ApprovalScope = z.enum(['once', 'always']);
export type ApprovalScope = z.infer<typeof ApprovalScope>;

export const ApprovalSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  kind: ApprovalKind,
  /** Stable hash of (kind, projectId, normalized action). Equal fingerprints = same action. */
  fingerprint: z.string(),
  title: z.string(), // German
  action: z.string(), // exactly what will be executed (German explanation + raw command/path)
  consequences: z.string(), // German: possible consequences
  details: z.record(z.string(), z.unknown()),
  status: ApprovalStatus,
  scope: ApprovalScope.nullable(),
  createdAt: z.number(),
  decidedAt: z.number().nullable(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalRuleSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  kind: ApprovalKind,
  fingerprint: z.string(),
  description: z.string(),
  createdAt: z.number(),
});
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;

// ---------------------------------------------------------------------------
// Models and providers
// ---------------------------------------------------------------------------

export const ProviderType = z.enum(['ollama', 'openai_compatible', 'anthropic']);
export type ProviderType = z.infer<typeof ProviderType>;

export const ProviderConfigSchema = z.object({
  id: z.string(),
  type: ProviderType,
  name: z.string(),
  baseUrl: z.string(),
  enabled: z.boolean(),
  /** Calls cost money. Ollama is never paid. */
  paid: z.boolean(),
  /** User explicitly approved paid usage of this provider. */
  approved: z.boolean(),
  /** True when an API key is stored in the secret store (the key itself never leaves the daemon). */
  hasApiKey: z.boolean(),
  /** Extra provider options (e.g. organization, headers without secrets). */
  options: z.record(z.string(), z.string()),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const UpsertProviderInputSchema = z.object({
  id: z.string().optional(),
  type: ProviderType,
  name: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
  paid: z.boolean().default(true),
  approved: z.boolean().default(false),
  options: z.record(z.string(), z.string()).default({}),
});
export type UpsertProviderInput = z.input<typeof UpsertProviderInputSchema>;

export const ProviderHealthSchema = z.object({
  providerId: z.string(),
  status: z.enum(['ok', 'unreachable', 'auth_error', 'error', 'disabled', 'not_configured']),
  message: z.string(), // German explanation
  version: z.string().nullable(),
  checkedAt: z.number(),
  latencyMs: z.number().nullable(),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const ModelCapability = z.enum(['completion', 'tools', 'vision', 'embedding', 'thinking', 'insert']);
export type ModelCapability = z.infer<typeof ModelCapability>;

export const ModelPricingSchema = z.object({
  inputPerMTokUsd: z.number().nonnegative(),
  outputPerMTokUsd: z.number().nonnegative(),
  /** true when the price is a user/default estimate rather than reported by the provider. */
  estimated: z.boolean(),
});
export type ModelPricing = z.infer<typeof ModelPricingSchema>;

export const ModelInfoSchema = z.object({
  providerId: z.string(),
  id: z.string(), // provider model id, e.g. "qwen2.5-coder:7b"
  displayName: z.string(),
  local: z.boolean(),
  paid: z.boolean(),
  sizeBytes: z.number().nullable(), // on-disk size (Ollama)
  parameterSize: z.string().nullable(), // e.g. "7.6B"
  quantization: z.string().nullable(),
  family: z.string().nullable(),
  contextLength: z.number().nullable(),
  capabilities: z.array(ModelCapability),
  pricing: ModelPricingSchema.nullable(),
  modifiedAt: z.number().nullable(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const ModelRefSchema = z.object({ providerId: z.string(), modelId: z.string() });
export type ModelRef = z.infer<typeof ModelRefSchema>;

// The global model selection lives in settings.ts (ModelSettingsSchema, settings section "models").

export const OllamaStatusSchema = z.object({
  installed: z.boolean(), // binary found on disk/PATH
  running: z.boolean(), // API reachable
  baseUrl: z.string(),
  version: z.string().nullable(),
  binaryPath: z.string().nullable(),
  message: z.string(), // German explanation incl. how to fix
  checkedAt: z.number(),
});
export type OllamaStatus = z.infer<typeof OllamaStatusSchema>;

export const OllamaPullSchema = z.object({
  id: z.string(),
  model: z.string(),
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  phase: z.string(), // raw Ollama status text ("pulling manifest", "downloading", "verifying sha256 digest" ...)
  completedBytes: z.number().nullable(),
  totalBytes: z.number().nullable(),
  percent: z.number().nullable(),
  error: z.string().nullable(),
  startedAt: z.number(),
  updatedAt: z.number(),
});
export type OllamaPull = z.infer<typeof OllamaPullSchema>;

export const OllamaRunningModelSchema = z.object({
  model: z.string(),
  sizeBytes: z.number(),
  vramBytes: z.number(),
  expiresAt: z.string().nullable(),
  contextLength: z.number().nullable(),
});
export type OllamaRunningModel = z.infer<typeof OllamaRunningModelSchema>;

// ---------------------------------------------------------------------------
// Budget and usage
// ---------------------------------------------------------------------------

export const UsageRecordSchema = z.object({
  id: z.string(),
  ts: z.number(),
  providerId: z.string(),
  modelId: z.string(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  durationMs: z.number().int(),
  costUsd: z.number(),
  costEstimated: z.boolean(),
  paid: z.boolean(),
});
export type UsageRecord = z.infer<typeof UsageRecordSchema>;

export const BudgetStatusSchema = z.object({
  dailyLimitUsd: z.number().nullable(),
  monthlyLimitUsd: z.number().nullable(),
  spentTodayUsd: z.number(),
  spentMonthUsd: z.number(),
  remainingTodayUsd: z.number().nullable(),
  remainingMonthUsd: z.number().nullable(),
  /** true when any spent value contains estimated costs. */
  containsEstimates: z.boolean(),
  /** Paid work is currently paused because a limit was reached. */
  paidPaused: z.boolean(),
  pausedReason: z.string().nullable(),
  perProject: z.array(
    z.object({
      projectId: z.string(),
      limitUsd: z.number().nullable(),
      spentMonthUsd: z.number(),
    }),
  ),
  tokensToday: z.object({ input: z.number(), output: z.number() }),
  tokensMonth: z.object({ input: z.number(), output: z.number() }),
  localRuntimeMsToday: z.number(),
  cloudRuntimeMsToday: z.number(),
});
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export const GpuInfoSchema = z.object({
  name: z.string(),
  vendor: z.enum(['nvidia', 'amd', 'intel', 'apple', 'unknown']),
  utilPercent: z.number().nullable(),
  vramTotalBytes: z.number().nullable(),
  vramUsedBytes: z.number().nullable(),
  /** Where the numbers come from, e.g. "nvidia-smi", "windows-perf-counter", "registry". */
  source: z.string(),
  /** true when values are estimates (e.g. WMI AdapterRAM). */
  estimated: z.boolean(),
});
export type GpuInfo = z.infer<typeof GpuInfoSchema>;

export const ResourceSnapshotSchema = z.object({
  ts: z.number(),
  cpu: z.object({ percent: z.number(), cores: z.number(), model: z.string() }),
  memory: z.object({ totalBytes: z.number(), usedBytes: z.number(), freeBytes: z.number() }),
  disks: z.array(z.object({ path: z.string(), totalBytes: z.number(), freeBytes: z.number() })),
  gpus: z.array(GpuInfoSchema),
  /** German note when GPU data is unavailable, e.g. "Keine GPU-Messwerte verfügbar (nvidia-smi nicht gefunden)". */
  gpuNote: z.string().nullable(),
  ollamaLoaded: z.array(OllamaRunningModelSchema),
  daemon: z.object({ rssBytes: z.number(), cpuPercent: z.number() }),
  childProcesses: z.number().int(),
});
export type ResourceSnapshot = z.infer<typeof ResourceSnapshotSchema>;

// ---------------------------------------------------------------------------
// Memory / knowledge base
// ---------------------------------------------------------------------------

export const MemoryKind = z.enum([
  'goal',
  'decision',
  'requirement',
  'convention',
  'task_status',
  'bug',
  'attempt',
  'test_result',
  'question',
  'next_step',
  'note',
  'insight', // general technical insight, may be shared across projects
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  /** null = global knowledge base entry (cross-project). */
  projectId: z.string().nullable(),
  kind: MemoryKind,
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()),
  source: z.enum(['user', 'agent', 'system']),
  /** May be reused in other projects (only insights without project secrets). */
  shareable: z.boolean(),
  taskId: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemorySearchResultSchema = MemoryEntrySchema.extend({ score: z.number(), snippet: z.string() });
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;

// ---------------------------------------------------------------------------
// Files, git, checkpoints
// ---------------------------------------------------------------------------

export const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.string(), // project-relative, forward slashes, "" = root
    type: z.enum(['file', 'dir']),
    size: z.number().nullable(),
    children: z.array(FileNodeSchema).nullable(), // null = not loaded (depth limit)
    changedByNova: z.boolean(),
    gitStatus: z.string().nullable(), // porcelain XY code, e.g. " M", "??"
  }),
);
export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size: number | null;
  children: FileNode[] | null;
  changedByNova: boolean;
  gitStatus: string | null;
}

export const FileContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  encoding: z.enum(['utf8', 'binary']), // binary files are not returned (content = "")
  size: z.number(),
  hash: z.string(), // sha256 of the bytes
  mtime: z.number(),
  language: z.string(), // Monaco language id guess
  truncated: z.boolean(),
});
export type FileContent = z.infer<typeof FileContentSchema>;

export const SearchMatchSchema = z.object({
  path: z.string(),
  line: z.number().int(), // 1-based
  column: z.number().int(), // 1-based
  preview: z.string(),
});
export type SearchMatch = z.infer<typeof SearchMatchSchema>;

export const ChangeOp = z.enum(['create', 'modify', 'delete']);
export type ChangeOp = z.infer<typeof ChangeOp>;

export const ChangeRecordSchema = z.object({
  id: z.number().int(),
  projectId: z.string(),
  taskId: z.string().nullable(),
  runId: z.string().nullable(),
  path: z.string(), // project-relative
  op: ChangeOp,
  beforeHash: z.string().nullable(), // null for create
  afterHash: z.string().nullable(), // null for delete
  actor: z.enum(['nova', 'user']),
  ts: z.number(),
  reverted: z.boolean(),
});
export type ChangeRecord = z.infer<typeof ChangeRecordSchema>;

export const ChangedFileSchema = z.object({
  path: z.string(),
  op: ChangeOp,
  byNova: z.boolean(),
  taskIds: z.array(z.string()),
  gitStatus: z.string().nullable(),
  /** File was modified by someone else after NOVA's last write. */
  modifiedSinceNova: z.boolean(),
});
export type ChangedFile = z.infer<typeof ChangedFileSchema>;

export const GitStatusSchema = z.object({
  isRepo: z.boolean(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
  ahead: z.number().int(),
  behind: z.number().int(),
  files: z.array(z.object({ path: z.string(), index: z.string(), workTree: z.string() })),
  clean: z.boolean(),
});
export type GitStatus = z.infer<typeof GitStatusSchema>;

export const GitCommitSchema = z.object({
  hash: z.string(),
  shortHash: z.string(),
  author: z.string(),
  date: z.number(),
  subject: z.string(),
  byNova: z.boolean(),
});
export type GitCommit = z.infer<typeof GitCommitSchema>;

export const FileDiffSchema = z.object({
  path: z.string(),
  original: z.string(), // content before ("" for new files)
  modified: z.string(), // content after ("" for deleted files)
  unified: z.string(), // unified diff text
  binary: z.boolean(),
});
export type FileDiff = z.infer<typeof FileDiffSchema>;

export const CheckpointKind = z.enum(['pre_task', 'post_task', 'manual', 'pre_restore']);
export type CheckpointKind = z.infer<typeof CheckpointKind>;

export const CheckpointSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().nullable(),
  kind: CheckpointKind,
  label: z.string(),
  gitHead: z.string().nullable(), // HEAD at checkpoint time
  gitCommit: z.string().nullable(), // commit NOVA created for this checkpoint (post_task)
  /** Highest change-journal id at the time of the checkpoint. Restoring undoes all later NOVA changes. */
  changeCursor: z.number().int(),
  createdAt: z.number(),
  restoredAt: z.number().nullable(),
});
export type Checkpoint = z.infer<typeof CheckpointSchema>;

export const RestoreResultSchema = z.object({
  restored: z.array(z.string()), // paths restored
  conflicts: z.array(z.object({ path: z.string(), reason: z.string() })), // skipped, user changed the file
  skipped: z.array(z.string()),
  commit: z.string().nullable(), // git commit created for the restore, if any
  checkpointId: z.string().nullable(), // pre_restore checkpoint so the restore itself can be undone
});
export type RestoreResult = z.infer<typeof RestoreResultSchema>;

// ---------------------------------------------------------------------------
// Processes, terminal, checks (tests/builds), preview
// ---------------------------------------------------------------------------

export const ProcessKind = z.enum(['command', 'dev_server', 'test', 'build', 'terminal', 'preview', 'install']);
export type ProcessKind = z.infer<typeof ProcessKind>;

export const ProcessInfoSchema = z.object({
  id: z.string(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  kind: ProcessKind,
  command: z.string(),
  cwd: z.string(),
  pid: z.number().int().nullable(),
  status: z.enum(['running', 'exited', 'killed', 'orphaned', 'failed']),
  exitCode: z.number().int().nullable(),
  url: z.string().nullable(), // detected dev-server URL
  startedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type ProcessInfo = z.infer<typeof ProcessInfoSchema>;

export const TerminalSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  cwd: z.string(), // current working directory (tracked across "cd")
  shell: z.string(), // e.g. "powershell", "bash"
  busy: z.boolean(),
  createdAt: z.number(),
});
export type TerminalSession = z.infer<typeof TerminalSessionSchema>;

export const CheckKind = z.enum(['test', 'build', 'lint', 'typecheck', 'runtime']);
export type CheckKind = z.infer<typeof CheckKind>;

export const CheckFailureSchema = z.object({
  file: z.string().nullable(), // project-relative if resolvable
  line: z.number().int().nullable(),
  column: z.number().int().nullable(),
  message: z.string(),
});
export type CheckFailure = z.infer<typeof CheckFailureSchema>;

export const CheckRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  taskId: z.string().nullable(),
  kind: CheckKind,
  command: z.string(),
  status: CheckStatus,
  passed: z.number().int().nullable(),
  failed: z.number().int().nullable(),
  skipped: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
  outputTail: z.string(), // last ~200 lines, redacted
  failures: z.array(CheckFailureSchema),
  /** Short stable signature of the failure (used to detect identical repeated failures). */
  failureSignature: z.string().nullable(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
});
export type CheckRun = z.infer<typeof CheckRunSchema>;

export const PreviewStatusSchema = z.object({
  projectId: z.string(),
  kind: PreviewKind,
  state: z.enum(['stopped', 'starting', 'running', 'failed', 'unsupported']),
  url: z.string().nullable(), // http://127.0.0.1:port/... (only loopback URLs)
  processId: z.string().nullable(),
  message: z.string(), // German, e.g. "Unity-Projekte haben keine eingebettete Live-Vorschau ..."
  reloadToken: z.number().int(), // increments when the preview should reload
});
export type PreviewStatus = z.infer<typeof PreviewStatusSchema>;

// ---------------------------------------------------------------------------
// Integrations / tools
// ---------------------------------------------------------------------------

export const IntegrationId = z.enum([
  'git',
  'node',
  'npm',
  'python',
  'dotnet',
  'powershell',
  'windows_terminal',
  'ollama',
  'unity',
  'unreal',
  'godot',
  'vscode',
  'playwright',
  'winget',
]);
export type IntegrationId = z.infer<typeof IntegrationId>;

export const IntegrationStatusSchema = z.object({
  id: IntegrationId,
  name: z.string(),
  category: z.enum(['vcs', 'runtime', 'shell', 'ai', 'engine', 'editor', 'testing', 'package_manager']),
  available: z.boolean(),
  version: z.string().nullable(),
  path: z.string().nullable(), // resolved executable path
  manualPath: z.string().nullable(), // user override
  message: z.string(), // German diagnosis
  installHint: z
    .object({
      command: z.string().nullable(), // e.g. "winget install --id Git.Git -e"
      url: z.string().nullable(),
      requiresAdmin: z.boolean(),
    })
    .nullable(),
  checkedAt: z.number(),
});
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

// ---------------------------------------------------------------------------
// Daemon status, logs, backups, diagnostics
// ---------------------------------------------------------------------------

export const DaemonStatusSchema = z.object({
  state: z.enum(['starting', 'running', 'paused', 'error', 'stopping']),
  version: z.string(),
  pid: z.number().int(),
  instanceId: z.string(),
  startedAt: z.number(),
  dataDir: z.string(),
  dbSchemaVersion: z.number().int(),
  work: WorkCycleState,
  activeRuns: z.number().int(),
  lastError: z.string().nullable(),
  recovered: z.object({ tasks: z.number().int(), orphanProcesses: z.number().int() }),
  platform: z.string(),
});
export type DaemonStatus = z.infer<typeof DaemonStatusSchema>;

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error']);
export type LogLevel = z.infer<typeof LogLevel>;

export const LogEntrySchema = z.object({
  ts: z.number(),
  level: LogLevel,
  scope: z.string(),
  msg: z.string(),
  data: z.unknown().optional(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const BackupInfoSchema = z.object({
  id: z.string(),
  kind: z.enum(['database', 'project_snapshot', 'export']),
  path: z.string(),
  sizeBytes: z.number(),
  reason: z.string(), // e.g. "vor Update", "manuell", "täglich", "vor Migration"
  projectId: z.string().nullable(),
  createdAt: z.number(),
});
export type BackupInfo = z.infer<typeof BackupInfoSchema>;

export const ExportSection = z.enum(['projects', 'tasks', 'settings', 'memory', 'providers']);
export type ExportSection = z.infer<typeof ExportSection>;

export const NotificationSchema = z.object({
  id: z.string(),
  level: z.enum(['info', 'success', 'warning', 'error']),
  category: z.enum(['task_done', 'error', 'approval', 'blocker', 'update', 'info']),
  title: z.string(),
  body: z.string(),
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  ts: z.number(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const UpdateInfoSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  downloadUrl: z.string().nullable(),
  notes: z.string().nullable(),
  checkedAt: z.number().nullable(),
  message: z.string(),
});
export type UpdateInfo = z.infer<typeof UpdateInfoSchema>;
