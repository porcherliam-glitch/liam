// Domain model shared by daemon, Electron main and renderer.
// All timestamps are milliseconds since epoch (number). All IDs are opaque strings with a prefix
// (see daemon/core/ids.ts). These schemas are the single source of truth for the RPC contract.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const ProjectKind = z.enum(['web', 'unity', 'desktop', 'backend', 'godot', 'unreal', 'generic']);
export type ProjectKind = z.infer<typeof ProjectKind>;

export const ProjectStatus = z.enum(['active', 'archived']);

export const WorkCycleState = z.enum(['running', 'paused', 'stopped']);
export type WorkCycleState = z.infer<typeof WorkCycleState>;
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** Commands NOVA uses for a project. null = not available / unknown. */
export const ProjectCommandsSchema = z.object({
  install: z.string().nullable(),
  dev: z.string().nullable(),
  build: z.string().nullable(),
  test: z.string().nullable(),
  lint: z.string().nullable(),
  typecheck: z.string().nullable(),
  e2e: z.string().nullable(),
  /** e.g. "npm audit --omit=dev --audit-level=high" */
  security: z.string().nullable(),
  /** Produces distributable builds/installers, e.g. "dotnet publish -c Release -o dist", "npm run dist". */
  package: z.string().nullable(),
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
  /** Globs (project-relative) of build artifacts recorded after package/build checks, e.g. "dist/**". */
  artifactGlobs: z.array(z.string()),
  /** Engine version the project requires (Unity m_EditorVersion, Godot/Unreal version) – null if not applicable. */
  engineVersion: z.string().nullable(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/** Partial update of a ProjectConfig: every field optional, nested commands/preview partial too (deep merge). */
export const ProjectConfigPatchSchema = ProjectConfigSchema.extend({
  commands: ProjectCommandsSchema.partial(),
  preview: ProjectConfigSchema.shape.preview.partial(),
}).partial();
export type ProjectConfigPatch = z.infer<typeof ProjectConfigPatchSchema>;

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
  /**
   * Autonomous work for this project: running = the scheduler starts queued tasks; paused = runs of this project
   * pause at the next step; stopped = nothing starts automatically (single tasks can still be started by the user).
   */
  workState: WorkCycleState,
  /** git executable found AND the folder is a git repository. */
  gitAvailable: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectSummarySchema = ProjectSchema.extend({
  progress: z.number().min(0).max(100), // done tasks / all non-cancelled tasks × 100 (0 when no tasks)
  /** queued + running + paused + waiting_approval + blocked + interrupted */
  openTasks: z.number(),
  runningTasks: z.number(),
  failedTasks: z.number(),
  blockedTasks: z.number(),
  pausedTasks: z.number(),
  waitingApprovalTasks: z.number(),
  /** Count per TaskStatus (all statuses present, 0 if none). */
  taskCounts: z.record(z.string(), z.number()),
  pendingApprovals: z.number(),
  openErrors: z.number(),
  lastBuild: z.lazy(() => CheckRunSchema).nullable(),
  lastSuccessfulBuild: z.lazy(() => CheckRunSchema).nullable(),
  lastTest: z.lazy(() => CheckRunSchema).nullable(),
  lastActivityAt: z.number().nullable(),
  /** The project folder no longer exists (moved/deleted) – projects.update({path}) relinks it. */
  pathMissing: z.boolean(),
});
export type ProjectSummary = z.infer<typeof ProjectSummarySchema>;

export const CreateProjectMode = z.enum(['description', 'wizard', 'template', 'open', 'import']);
export type CreateProjectMode = z.infer<typeof CreateProjectMode>;

export const CreateProjectInputSchema = z
  .object({
    mode: CreateProjectMode,
    name: z.string().min(1).max(120),
    description: z.string().max(20000).default(''),
    /**
     * EXACT target directory (for 'open': the existing project folder; for 'import': the clone target).
     * null → <projectsDir>/<safe name>.
     */
    path: z.string().nullable().default(null),
    templateId: z.string().nullable().default(null),
    kind: ProjectKind.nullable().default(null),
    technologies: z.array(z.string()).default([]),
    /** For 'import': git URL to clone (https://, ssh:// or git@host:path). */
    repoUrl: z
      .string()
      .regex(/^(https:\/\/|ssh:\/\/|git@[A-Za-z0-9.-]+:)/, 'Nur https://-, ssh://- oder git@-Adressen sind erlaubt.')
      .nullable()
      .default(null),
    /** Wizard answers (free-form key/value), stored in project memory as requirements. */
    answers: z.record(z.string(), z.string()).default({}),
    /** Create a planning task right away from the description. */
    planNow: z.boolean().default(true),
    /** Ignored for 'open' and 'import' (existing folders are never modified on creation). */
    initGit: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'import' && !v.repoUrl) ctx.addIssue({ code: 'custom', path: ['repoUrl'], message: 'Für den Import wird eine Git-Adresse benötigt.' });
    if (v.mode === 'open' && !v.path) ctx.addIssue({ code: 'custom', path: ['path'], message: 'Bitte einen vorhandenen Projektordner auswählen.' });
  });
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;
export type CreateProjectParams = z.output<typeof CreateProjectInputSchema>;

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

export const CheckStatus = z.enum(['passed', 'failed', 'error', 'not_run', 'running', 'skipped', 'cancelled']);
export type CheckStatus = z.infer<typeof CheckStatus>;

export const ReviewFindingSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'info']),
  file: z.string().nullable().default(null),
  line: z.number().int().nullable().default(null),
  message: z.string(),
});
export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;

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
      name: z.string(), // e.g. "Tests", "Build", "Review", "Integration: Tests"
      status: CheckStatus,
      details: z.string().nullable(),
      checkRunId: z.string().nullable(),
      /** Reviewer findings (shown as editor markers). */
      findings: z.array(ReviewFindingSchema).default([]),
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
  /**
   * Machine-readable reason (ErrorCode). Resumable codes (NO_MODEL, MODEL_UNAVAILABLE, OLLAMA_UNREACHABLE,
   * VRAM_INSUFFICIENT, BUDGET_EXCEEDED, PAID_NOT_APPROVED, PRICE_UNKNOWN, RESOURCE_LIMIT, TOOL_MISSING, NEEDS_INPUT,
   * DEPENDENCY_FAILED) are re-checked and auto-resumed by the work cycle.
   */
  blockerCode: z.string().nullable(),
  /** Final summary written by the agent (German). */
  result: z.string().nullable(),
  /** Acceptance criteria from the planner or the user. */
  acceptance: z.string().nullable(),
  verification: VerificationSchema,
  /** Files changed by NOVA for this task (project-relative, forward slashes). Written ONLY via tasks.addFiles by tools. */
  files: z.array(z.string()),
  /** Files the planner expects this task to touch (used to avoid parallel conflicts; never committed). */
  plannedFiles: z.array(z.string()),
  /** The user explicitly started this task – it runs even if the project's work state is not running. */
  startRequested: z.boolean(),
  /** "providerId/modelId" of the last model used (split at the FIRST '/'; provider ids never contain '/'). */
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
  /** Omitted → settings.agents.maxAttempts. */
  maxAttempts: z.number().int().min(1).max(10).optional(),
  plannedFiles: z.array(z.string()).default([]),
});
export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;
export type CreateTaskParams = z.output<typeof CreateTaskInputSchema>;

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
/** Active = status 'running' only. */
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
  /** ErrorCode of error/blocker (e.g. NO_MODEL, AGENT_STEP_LIMIT). */
  errorCode: z.string().nullable(),
  /** Time actually spent running (excluding paused/waiting). */
  activeMs: z.number().int(),
  startedAt: z.number(),
  updatedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type AgentRun = z.infer<typeof AgentRunSchema>;

export const TaskNoteSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  projectId: z.string(),
  author: z.enum(['user', 'agent', 'system']),
  /** note = hint from the user to the agent; question = agent asks (ask_user); answer = user answers a question. */
  kind: z.enum(['note', 'question', 'answer']),
  text: z.string(),
  /** For questions: suggested options and the assumption the agent would make. */
  options: z.array(z.string()),
  assumption: z.string().nullable(),
  createdAt: z.number(),
  /** Run that received this note (null = not yet delivered to an agent). */
  consumedRunId: z.string().nullable(),
});
export type TaskNote = z.infer<typeof TaskNoteSchema>;

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
      state: WorkCycleState,
      activeRuns: z.number().int(),
      queuedTasks: z.number().int(),
      waitingApproval: z.number().int(),
      blocked: z.number().int(),
      paused: z.number().int(),
      idleReason: z.string().nullable(),
      /** Clearly justified next step when idle (latest next_step memory entry or "Neues Ziel planen"). Never auto-created. */
      suggestion: z.string().nullable(),
    }),
  ),
});
export type WorkStatus = z.infer<typeof WorkStatusSchema>;

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export const ApprovalKind = z.enum([
  'command', // command not on the allowlist (or with shell metacharacters)
  'admin', // needs administrator rights
  'delete', // destructive delete / discarding changes
  'outside_project', // a command writes to a path outside the project folder (agent file tools never can)
  'system_change', // system-wide change (PATH, registry, global installs ...)
  'security_config', // security relevant configuration (git config --global, icacls, sensitive files like .env)
  'publish', // publish/transfer data (git push, npm publish, upload ...)
  'sensitive_data', // send project data to a non-local (cloud) model provider
  'paid_model', // continue paid usage after a budget stop ("budget:resume")
  'install', // install a tool (winget ...)
  'network', // network access to a host that is not allowed
]);
/** Kinds for which "Immer erlauben" is not offered (each action needs its own decision). */
export const APPROVAL_KINDS_ONCE_ONLY: ApprovalKind[] = ['admin', 'system_change', 'security_config', 'publish', 'paid_model', 'delete'];
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

/**
 * Create (no id / unknown id): enabled=true, paid = type!=='ollama' && !isLocalEndpoint(baseUrl),
 * approved = type==='ollama', options={}. Update (existing id): omitted fields keep their stored values;
 * changing `type` → VALIDATION; type 'ollama' rows always have paid=false, approved=true.
 * Options must not contain secrets (keys matching the redaction key pattern are rejected); use providers.setApiKey.
 * Supported option keys: authHeader (header name for the API key, e.g. "api-key"), maxConcurrent, maxRequestsPerMinute, organization.
 */
export const UpsertProviderInputSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Kennung: nur Kleinbuchstaben, Ziffern und Bindestriche.')
    .optional(),
  type: ProviderType,
  name: z.string().min(1),
  baseUrl: z.string().url(),
  enabled: z.boolean().optional(),
  paid: z.boolean().optional(),
  approved: z.boolean().optional(),
  options: z.record(z.string(), z.string()).optional(),
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
  /** Provider endpoint is local (Ollama on loopback or any loopback URL). Non-local = cloud (needs data approval). */
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
      remainingUsd: z.number().nullable(),
      /** A project limit pauses paid work of that project only. */
      paidPaused: z.boolean(),
      containsEstimates: z.boolean(),
    }),
  ),
  /** Sum of open reservations (paid calls in flight). */
  reservedUsd: z.number(),
  tokensToday: z.object({ input: z.number(), output: z.number() }),
  tokensMonth: z.object({ input: z.number(), output: z.number() }),
  localRuntimeMsToday: z.number(),
  cloudRuntimeMsToday: z.number(),
  localRuntimeMsMonth: z.number(),
  cloudRuntimeMsMonth: z.number(),
});

export const BudgetBreakdownRowSchema = z.object({
  key: z.string(), // provider id, "providerId/modelId", project id or "YYYY-MM-DD"
  calls: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  durationMs: z.number().int(),
  costUsd: z.number(),
  costEstimated: z.boolean(),
});
export type BudgetBreakdownRow = z.infer<typeof BudgetBreakdownRowSchema>;
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
  /** tool = agent file tool; command = detected after an agent command; user = editor; restore = written by a restore. */
  source: z.enum(['tool', 'command', 'user', 'restore']),
  /** false when no "before" snapshot exists (e.g. a command modified an untracked file) – restore skips it with a note. */
  revertible: z.boolean(),
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
  /** Known-good marker: post_task = task verification; manual = latest checks if newer than the last change. */
  verification: z.enum(['passed', 'failed', 'unavailable', 'not_run']).nullable(),
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

/** runtime = start run/dev command briefly and check it stays alive / answers (no own command). */
export const CheckKind = z.enum(['test', 'build', 'lint', 'typecheck', 'e2e', 'security', 'runtime', 'package']);
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
  /** German explanation for not_run/error/skipped (e.g. "Kein Testbefehl eingerichtet"). */
  message: z.string().nullable(),
  processId: z.string().nullable(),
  /** Files matching project.config.artifactGlobs modified during this run (package/build). */
  artifacts: z.array(z.object({ path: z.string(), sizeBytes: z.number() })),
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

/** Integration ids are open (modules can register more); these are built in. */
export const BUILTIN_INTEGRATIONS = [
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
] as const;
export const IntegrationId = z.string().min(1).max(64);
export type IntegrationId = string;

export const IntegrationStatusSchema = z.object({
  id: IntegrationId,
  name: z.string(),
  category: z.enum(['vcs', 'runtime', 'shell', 'ai', 'engine', 'editor', 'testing', 'package_manager']),
  available: z.boolean(),
  version: z.string().nullable(),
  path: z.string().nullable(), // resolved executable path
  manualPath: z.string().nullable(), // user override
  /** All installations found (e.g. several Unity editor versions), newest first. */
  installations: z.array(z.object({ version: z.string(), path: z.string() })),
  /** integrations.open supported (editor/terminal/engine). */
  canOpen: z.boolean(),
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
  previousShutdown: z.object({ at: z.number(), clean: z.boolean(), reason: z.string() }).nullable(),
  /** The UI warns when secure=false (fallback store). */
  secretStore: z.object({ scheme: z.string(), secure: z.boolean() }),
  /** Registered RPC methods (features not listed are not available in this version). */
  methods: z.array(z.string()),
});
export type DaemonStatus = z.infer<typeof DaemonStatusSchema>;

/** Written to <dataDir>/crash.json on fatal daemon errors; read by Electron main when the daemon exits early. */
export const DaemonCrashReportSchema = z.object({
  ts: z.number(),
  version: z.string(),
  phase: z.enum(['startup', 'instance_lock', 'database_open', 'migration', 'runtime']),
  code: z.string(),
  message: z.string(), // German
  details: z.string().nullable(), // redacted
  logFile: z.string().nullable(),
  suggestedActions: z.array(z.enum(['restore_backup', 'open_logs', 'create_diagnostics', 'retry'])),
});
export type DaemonCrashReport = z.infer<typeof DaemonCrashReportSchema>;

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
  readAt: z.number().nullable(),
});
export type Notification = z.infer<typeof NotificationSchema>;

export const OperationKind = z.enum([
  'check',
  'project_create',
  'clone',
  'backup',
  'backup_restore',
  'project_snapshot',
  'export',
  'import',
  'memory_export',
  'memory_import',
  'restore',
  'install',
  'diagnostics',
]);
export type OperationKind = z.infer<typeof OperationKind>;

/** A long-running daemon operation with progress and cancel (shown in "Laufende Vorgänge"). */
export const OperationSchema = z.object({
  id: z.string(),
  kind: OperationKind,
  projectId: z.string().nullable(),
  title: z.string(), // German
  status: z.enum(['running', 'done', 'failed', 'cancelled']),
  progress: z.number().min(0).max(100).nullable(), // null = indeterminate
  message: z.string().nullable(),
  cancellable: z.boolean(),
  error: z.string().nullable(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
});
export type Operation = z.infer<typeof OperationSchema>;

export const UpdateInfoSchema = z.object({
  /** When an update is available the UI offers "Daten jetzt sichern" (backup.create) before the manual install. */
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  downloadUrl: z.string().nullable(),
  notes: z.string().nullable(),
  checkedAt: z.number().nullable(),
  message: z.string(),
});
export type UpdateInfo = z.infer<typeof UpdateInfoSchema>;
