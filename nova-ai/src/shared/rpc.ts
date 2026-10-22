// RPC contract between clients (Electron main -> renderer, tests, CLI) and the daemon.
// Transport: HTTP POST /rpc over a local named pipe (Windows) / unix socket, Bearer token auth.
// Request:  { id: string, method: RpcMethod, params: <params> }
// Response: { id, ok: true, result } | { id, ok: false, error: RpcError }
// Params are validated with the schemas below on BOTH sides. Electron main validates with safeParse but forwards the
// ORIGINAL params object (never the parsed output), so defaults are applied exactly once – in the daemon.
// Long operations (projects.create with import, backup.*, data.*, memory.export/import, checkpoints.restore) keep
// their result type but register an Operation while running: progress via 'operation.updated', cancel via
// operations.cancel (the original call then fails with CANCELLED). checks.run returns immediately (status running).
import { z } from 'zod';
import {
  ProjectSchema,
  ProjectSummarySchema,
  CreateProjectInputSchema,
  ProjectConfigSchema,
  ProjectConfigPatchSchema,
  TaskNoteSchema,
  NotificationSchema,
  OperationSchema,
  BudgetBreakdownRowSchema,
  ProjectTemplateInfoSchema,
  TaskSchema,
  TaskStatus,
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  TaskPriority,
  AgentRunSchema,
  AgentStepSchema,
  AgentRoleInfoSchema,
  WorkStatusSchema,
  ApprovalSchema,
  ApprovalStatus,
  ApprovalScope,
  ApprovalRuleSchema,
  ProviderConfigSchema,
  UpsertProviderInputSchema,
  ProviderHealthSchema,
  ModelInfoSchema,
  ModelPricingSchema,
  OllamaStatusSchema,
  OllamaPullSchema,
  OllamaRunningModelSchema,
  ThreeDEngineStatusSchema,
  ThreeDModelSchema,
  ThreeDModelId,
  ThreeDJobSchema,
  ThreeDGenerateInputSchema,
  UsageRecordSchema,
  BudgetStatusSchema,
  ResourceSnapshotSchema,
  MemoryEntrySchema,
  MemoryKind,
  MemorySearchResultSchema,
  FileNodeSchema,
  FileContentSchema,
  SearchMatchSchema,
  ChangedFileSchema,
  ChangeRecordSchema,
  GitStatusSchema,
  GitCommitSchema,
  FileDiffSchema,
  CheckpointSchema,
  RestoreResultSchema,
  ProcessInfoSchema,
  TerminalSessionSchema,
  CheckRunSchema,
  CheckKind,
  PreviewStatusSchema,
  IntegrationStatusSchema,
  IntegrationId,
  DaemonStatusSchema,
  LogEntrySchema,
  LogLevel,
  BackupInfoSchema,
  ExportSection,
  UpdateInfoSchema,
  ProjectKind,
  ProjectStatus,
} from './schemas';
import { NovaErrorInfoSchema } from './errors';
import {
  SettingsSchema,
  SettingsPatchSchema,
  ModelSettingsSchema,
  ModelSettingsPatchSchema,
  type SettingsPatch,
  type ModelSettingsPatch,
} from './settings';

/** Typed views of the default-free patch schemas (their runtime shape is built generically by patchOf). */
const SettingsPatchParams = SettingsPatchSchema as unknown as z.ZodType<SettingsPatch, SettingsPatch>;
const ModelSettingsPatchParams = ModelSettingsPatchSchema as unknown as z.ZodType<ModelSettingsPatch, ModelSettingsPatch>;
const GitRef = z
  .string()
  .regex(/^(?!-)[A-Za-z0-9._\/@{}~^-]+$/, 'Ungültige Git-Referenz.');
const CheckpointTarget = z
  .object({ checkpointId: z.string().optional(), taskId: z.string().optional() })
  .refine((p) => Boolean(p.checkpointId) !== Boolean(p.taskId), { message: 'Bitte genau einen Wiederherstellungspunkt oder eine Aufgabe angeben.' });

const m = <P extends z.ZodType, R extends z.ZodType>(params: P, result: R) => ({ params, result });
const Empty = z.object({}).default({});
const Ok = z.object({ ok: z.literal(true) });
const ById = z.object({ id: z.string() });
const ByProject = z.object({ projectId: z.string() });

export const RpcContract = {
  // --- daemon -------------------------------------------------------------
  'daemon.status': m(Empty, DaemonStatusSchema),
  /** Graceful shutdown: stop new work, let runs reach a safe point, persist, exit. */
  'daemon.shutdown': m(z.object({ reason: z.string().default('ui') }).default({ reason: 'ui' }), Ok),
  /** Writes a redacted diagnostics bundle (JSON) and returns its path. */
  'daemon.diagnostics': m(Empty, z.object({ path: z.string(), sizeBytes: z.number() })),
  'daemon.logs': m(
    z.object({ limit: z.number().int().min(1).max(5000).default(500), level: LogLevel.optional(), scope: z.string().optional() }).default({ limit: 500 }),
    z.array(LogEntrySchema),
  ),
  'dashboard.summary': m(
    Empty,
    z.object({
      daemon: DaemonStatusSchema,
      work: WorkStatusSchema,
      projects: z.array(ProjectSummarySchema),
      activeRuns: z.array(AgentRunSchema),
      openTasks: z.number().int(),
      recentBuilds: z.array(CheckRunSchema),
      failedTests: z.array(CheckRunSchema),
      errors: z.array(NovaErrorInfoSchema),
      pendingApprovals: z.number().int(),
      unreadNotifications: z.number().int(),
      activeOperations: z.array(OperationSchema),
      // Each part may be null when its source failed; the summary never fails as a whole and makes no network calls.
      budget: BudgetStatusSchema.nullable(),
      resources: ResourceSnapshotSchema.nullable(),
      models: z.object({
        local: z.object({ status: OllamaStatusSchema, modelCount: z.number().int() }).nullable(),
        cloud: z.array(ProviderHealthSchema), // cached health (lastHealth)
        defaultModel: z.string().nullable(), // "providerId/modelId"
      }),
    }),
  ),

  // --- projects -----------------------------------------------------------
  'projects.list': m(z.object({ includeArchived: z.boolean().default(false) }).default({ includeArchived: false }), z.array(ProjectSummarySchema)),
  'projects.get': m(ById, ProjectSummarySchema),
  'projects.create': m(CreateProjectInputSchema, z.object({ project: ProjectSchema, planTaskId: z.string().nullable(), warnings: z.array(z.string()) })),
  'projects.update': m(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      kind: ProjectKind.optional(),
      technologies: z.array(z.string()).optional(),
      status: ProjectStatus.optional(),
      /** Relink a moved project folder (must exist; same safety rules as creation). */
      path: z.string().optional(),
      config: ProjectConfigPatchSchema.optional(),
    }),
    ProjectSchema,
  ),
  /** Re-detect commands/technologies from the files on disk. */
  'projects.detect': m(ById, z.object({ kind: ProjectKind, technologies: z.array(z.string()), config: ProjectConfigSchema })),
  /** Removes the project from NOVA only (fails while tasks run). Project files are NEVER deleted by this call. */
  'projects.remove': m(ById, Ok),
  /** Alias: enabled=true → work.start({projectId}), false → work.stop({projectId}). */
  'projects.setWork': m(z.object({ id: z.string(), enabled: z.boolean() }), ProjectSchema),
  'templates.list': m(Empty, z.array(ProjectTemplateInfoSchema)),

  // --- tasks & work cycle -------------------------------------------------
  'tasks.list': m(
    z.object({ projectId: z.string().optional(), status: z.array(TaskStatus).optional(), limit: z.number().int().max(2000).default(500) }).default({ limit: 500 }),
    z.array(TaskSchema),
  ),
  'tasks.get': m(ById, TaskSchema),
  'tasks.create': m(CreateTaskInputSchema, TaskSchema),
  /** Allowed for every status except running. Edits of a paused task are given to the agent on resume; pending approvals of the task expire. */
  'tasks.update': m(UpdateTaskInputSchema, TaskSchema),
  'tasks.setPriority': m(z.object({ id: z.string(), priority: TaskPriority }), TaskSchema),
  /** Queue a task (or re-queue a blocked/failed/cancelled/interrupted one). */
  'tasks.start': m(ById, TaskSchema),
  /** Pause at the next safe point; conversation state is kept. */
  'tasks.pause': m(ById, TaskSchema),
  'tasks.resume': m(ById, TaskSchema),
  /** Stop: cancel model call, kill child processes, mark cancelled. Files stay as they are. */
  'tasks.stop': m(ById, TaskSchema),
  'tasks.retry': m(ById, TaskSchema),
  /** Only for tasks that are not running and that no other open task depends on (CONFLICT lists them). */
  'tasks.delete': m(ById, Ok),
  /** Conversation between user and agents for a task (hints, agent questions via ask_user, answers). */
  'tasks.notes': m(z.object({ taskId: z.string() }), z.array(TaskNoteSchema)),
  /** Adds a user note/answer. Delivered to the agent at the next step / on resume; a task blocked with NEEDS_INPUT is re-queued. */
  'tasks.addNote': m(z.object({ taskId: z.string(), text: z.string().min(1).max(20000) }), TaskNoteSchema),
  /** Creates a 'fix' task from a failed check or an error (description built from failures/output/whatHappened). */
  'tasks.createFix': m(
    z.object({ projectId: z.string(), checkRunId: z.string().optional(), errorId: z.string().optional(), note: z.string().max(20000).optional() }),
    TaskSchema,
  ),
  /** Ask the planner to break a goal into tasks for a project. Returns the plan task. */
  'tasks.plan': m(z.object({ projectId: z.string(), goal: z.string().min(1) }), TaskSchema),
  'work.status': m(Empty, WorkStatusSchema),
  /** Global start/pause/resume/stop of the autonomous work cycle. projectId limits to one project. */
  'work.start': m(z.object({ projectId: z.string().optional() }).default({}), WorkStatusSchema),
  'work.pause': m(z.object({ projectId: z.string().optional() }).default({}), WorkStatusSchema),
  'work.resume': m(z.object({ projectId: z.string().optional() }).default({}), WorkStatusSchema),
  'work.stop': m(z.object({ projectId: z.string().optional() }).default({}), WorkStatusSchema),
  'agents.roles': m(Empty, z.array(AgentRoleInfoSchema)),
  'agents.runs': m(
    z.object({ projectId: z.string().optional(), taskId: z.string().optional(), activeOnly: z.boolean().default(false), limit: z.number().int().max(1000).default(100) }).default({ activeOnly: false, limit: 100 }),
    z.array(AgentRunSchema),
  ),
  'agents.steps': m(z.object({ runId: z.string(), afterId: z.number().int().optional(), limit: z.number().int().max(2000).default(300) }), z.array(AgentStepSchema)),
  'errors.list': m(
    z.object({ projectId: z.string().optional(), includeResolved: z.boolean().default(false), limit: z.number().int().max(1000).default(100) }).default({ includeResolved: false, limit: 100 }),
    z.array(NovaErrorInfoSchema),
  ),
  'errors.resolve': m(ById, Ok),

  // --- approvals ----------------------------------------------------------
  'approvals.list': m(z.object({ status: ApprovalStatus.optional(), projectId: z.string().optional() }).default({}), z.array(ApprovalSchema)),
  /** deny ignores scope (no deny rules). scope 'always' is rejected for APPROVAL_KINDS_ONCE_ONLY. */
  'approvals.decide': m(z.object({ id: z.string(), decision: z.enum(['approve', 'deny']), scope: ApprovalScope.default('once') }), ApprovalSchema),
  'approvals.rules': m(Empty, z.array(ApprovalRuleSchema)),
  'approvals.deleteRule': m(ById, Ok),

  // --- providers / models / ollama / budget -------------------------------
  'providers.list': m(Empty, z.array(ProviderConfigSchema)),
  'providers.upsert': m(UpsertProviderInputSchema, ProviderConfigSchema),
  'providers.remove': m(ById, Ok),
  /** Write-only. The key is stored in the OS secret store and never returned. */
  'providers.setApiKey': m(z.object({ providerId: z.string(), apiKey: z.string().min(1).max(4096) }), Ok),
  'providers.clearApiKey': m(z.object({ providerId: z.string() }), Ok),
  'providers.test': m(z.object({ providerId: z.string() }), ProviderHealthSchema),
  'providers.health': m(Empty, z.array(ProviderHealthSchema)),
  'models.list': m(z.object({ refresh: z.boolean().default(false) }).default({ refresh: false }), z.array(ModelInfoSchema)),
  'models.getSelection': m(Empty, ModelSettingsSchema),
  /** Patch: only given fields change (nested roleOverrides too). */
  'models.setSelection': m(ModelSettingsPatchParams, ModelSettingsSchema),
  /** User-entered price for a paid model (required before a paid model can be used). */
  'models.setPricing': m(z.object({ providerId: z.string(), modelId: z.string(), pricing: ModelPricingSchema.nullable() }), ModelInfoSchema),
  /** baseUrl tests a candidate endpoint without saving it (default: provider "ollama-local"). */
  'ollama.status': m(z.object({ baseUrl: z.string().url().optional() }).default({}), OllamaStatusSchema),
  'ollama.models': m(Empty, z.array(ModelInfoSchema)),
  'ollama.show': m(z.object({ model: z.string() }), z.object({ model: ModelInfoSchema, modelfile: z.string().nullable(), license: z.string().nullable(), parameters: z.string().nullable() })),
  /** Starts a download; progress via 'ollama.pull' events. */
  'ollama.pull': m(z.object({ model: z.string().min(1).max(200) }), OllamaPullSchema),
  'ollama.pulls': m(Empty, z.array(OllamaPullSchema)),
  'ollama.cancelPull': m(ById, OllamaPullSchema),
  'ollama.delete': m(z.object({ model: z.string().min(1) }), Ok),
  'ollama.running': m(Empty, z.array(OllamaRunningModelSchema)),
  /** VRAM fit check for a model against the current GPU data. */
  'ollama.fit': m(z.object({ model: z.string() }), z.object({ fits: z.boolean().nullable(), requiredBytes: z.number().nullable(), availableBytes: z.number().nullable(), estimated: z.boolean(), message: z.string(), alternatives: z.array(z.string()) })),
  // 3D workshop (local ComfyUI). Downloads run as operations (kind 'threed_download'), jobs report via 'threed.job' events.
  'threed.status': m(z.object({ refresh: z.boolean().default(false) }).default({ refresh: false }), ThreeDEngineStatusSchema),
  /** Saves engineUrl/modelsDir (settings threeD) after checking them; returns the new status. */
  'threed.configure': m(z.object({ engineUrl: z.string().max(500).optional(), modelsDir: z.string().max(1000).optional() }), ThreeDEngineStatusSchema),
  'threed.models': m(Empty, z.array(ThreeDModelSchema)),
  'threed.downloadModel': m(z.object({ id: ThreeDModelId }), OperationSchema),
  /** Deletes the model's files that no other installed 3D model needs. */
  'threed.deleteModel': m(z.object({ id: ThreeDModelId }), Ok),
  'threed.generate': m(ThreeDGenerateInputSchema, ThreeDJobSchema),
  'threed.jobs': m(z.object({ projectId: z.string().optional(), limit: z.number().int().min(1).max(500).default(100) }).default({ limit: 100 }), z.array(ThreeDJobSchema)),
  'threed.job': m(ById, ThreeDJobSchema),
  'threed.cancel': m(ById, ThreeDJobSchema),
  'threed.deleteJob': m(z.object({ id: z.string(), deleteFiles: z.boolean().default(false) }), Ok),
  /** File of a job for the 3D viewer: the .glb ("model") or the reference/source image ("image"); base64, ≤ 150 MB. */
  'threed.readFile': m(z.object({ id: z.string(), kind: z.enum(['model', 'image']) }), z.object({ dataBase64: z.string(), mimeType: z.string(), sizeBytes: z.number() })),
  'budget.status': m(Empty, BudgetStatusSchema),
  'budget.usage': m(z.object({ from: z.number().optional(), to: z.number().optional(), projectId: z.string().optional(), limit: z.number().int().max(5000).default(500) }).default({ limit: 500 }), z.array(UsageRecordSchema)),
  'budget.setLimits': m(z.object({ dailyLimitUsd: z.number().nonnegative().nullable().optional(), monthlyLimitUsd: z.number().nonnegative().nullable().optional() }), BudgetStatusSchema),
  /** Resume paid work after a budget stop (explicit user decision); projectId resumes only that project. */
  'budget.resumePaid': m(z.object({ projectId: z.string().optional() }).default({}), BudgetStatusSchema),
  'budget.breakdown': m(
    z.object({ from: z.number().optional(), to: z.number().optional(), groupBy: z.enum(['provider', 'model', 'project', 'day']) }),
    z.array(BudgetBreakdownRowSchema),
  ),

  // --- resources & integrations -------------------------------------------
  'resources.snapshot': m(Empty, ResourceSnapshotSchema.nullable()),
  'resources.history': m(z.object({ minutes: z.number().int().min(1).max(120).default(10) }).default({ minutes: 10 }), z.array(ResourceSnapshotSchema)),
  'integrations.list': m(z.object({ refresh: z.boolean().default(false) }).default({ refresh: false }), z.array(IntegrationStatusSchema)),
  'integrations.setPath': m(z.object({ id: IntegrationId, path: z.string().nullable() }), IntegrationStatusSchema),
  /** Requests installation (creates an approval; never runs silently). */
  'integrations.install': m(z.object({ id: IntegrationId }), z.object({ approvalId: z.string().nullable(), message: z.string() })),
  /** Opens a project/file in an external program: vscode (file:line), windows_terminal (project folder), unity/godot/unreal (project). */
  'integrations.open': m(z.object({ id: IntegrationId, projectId: z.string(), path: z.string().optional(), line: z.number().int().optional() }), Ok),

  // --- memory / knowledge -------------------------------------------------
  'memory.list': m(
    z.object({ projectId: z.string().nullable().optional(), kind: MemoryKind.optional(), limit: z.number().int().max(2000).default(200) }).default({ limit: 200 }),
    z.array(MemoryEntrySchema),
  ),
  'memory.search': m(
    z.object({ query: z.string().min(1), projectId: z.string().nullable().optional(), includeGlobal: z.boolean().default(true), limit: z.number().int().max(200).default(30) }),
    z.array(MemorySearchResultSchema),
  ),
  'memory.add': m(
    z.object({ projectId: z.string().nullable(), kind: MemoryKind, title: z.string().min(1).max(300), content: z.string().max(20000), tags: z.array(z.string()).default([]), shareable: z.boolean().default(false) }),
    MemoryEntrySchema,
  ),
  'memory.update': m(z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional(), tags: z.array(z.string()).optional(), kind: MemoryKind.optional(), shareable: z.boolean().optional() }), MemoryEntrySchema),
  'memory.delete': m(ById, Ok),
  /** Delete all memory of a project (or the global knowledge base when projectId is null). */
  'memory.clear': m(z.object({ projectId: z.string().nullable() }), z.object({ deleted: z.number().int() })),
  /** projectId: undefined = everything, null = global knowledge base, string = that project. */
  'memory.export': m(z.object({ projectId: z.string().nullable().optional(), path: z.string().optional() }).default({}), z.object({ path: z.string(), count: z.number().int() })),
  'memory.import': m(z.object({ path: z.string() }), z.object({ imported: z.number().int(), skipped: z.number().int() })),

  // --- files / editor -----------------------------------------------------
  'files.tree': m(z.object({ projectId: z.string(), path: z.string().default(''), depth: z.number().int().min(1).max(10).default(3) }), FileNodeSchema),
  'files.read': m(z.object({ projectId: z.string(), path: z.string() }), FileContentSchema),
  /** User edit from the editor (recorded with actor "user"). expectedHash guards against overwriting newer changes. */
  'files.write': m(z.object({ projectId: z.string(), path: z.string(), content: z.string(), expectedHash: z.string().nullable().default(null) }), FileContentSchema),
  'files.search': m(z.object({ projectId: z.string(), query: z.string().min(1), regex: z.boolean().default(false), caseSensitive: z.boolean().default(false), limit: z.number().int().max(5000).default(500) }), z.array(SearchMatchSchema)),
  'files.changed': m(ByProject, z.array(ChangedFileSchema)),
  'files.history': m(z.object({ projectId: z.string(), path: z.string().optional(), taskId: z.string().optional(), limit: z.number().int().max(2000).default(200) }), z.array(ChangeRecordSchema)),
  /** Diff: before = content before the first non-reverted NOVA change (of taskId, or exactly changeId if given), after = current. */
  'files.diff': m(z.object({ projectId: z.string(), path: z.string(), taskId: z.string().optional(), changeId: z.number().int().optional() }), FileDiffSchema),
  /** User file operations from the editor (journaled as actor "user", undoable). */
  'files.delete': m(z.object({ projectId: z.string(), path: z.string() }), Ok),
  'files.rename': m(z.object({ projectId: z.string(), from: z.string(), to: z.string() }), Ok),
  'files.mkdir': m(z.object({ projectId: z.string(), path: z.string() }), Ok),
  /** Content of a journal snapshot (older version) by hash. */
  'files.snapshot': m(z.object({ projectId: z.string(), hash: z.string().regex(/^[a-f0-9]{64}$/) }), z.object({ content: z.string(), binary: z.boolean() })),

  // --- git & restore ------------------------------------------------------
  'git.status': m(ByProject, GitStatusSchema),
  'git.diff': m(z.object({ projectId: z.string(), path: z.string().optional(), ref: GitRef.optional(), staged: z.boolean().default(false) }), z.array(FileDiffSchema)),
  'git.log': m(z.object({ projectId: z.string(), limit: z.number().int().max(500).default(50) }), z.array(GitCommitSchema)),
  'git.init': m(ByProject, GitStatusSchema),
  'checkpoints.list': m(ByProject, z.array(CheckpointSchema)),
  'checkpoints.create': m(z.object({ projectId: z.string(), label: z.string().min(1).max(200) }), CheckpointSchema),
  /** Preview what a restore would do (no changes). */
  'checkpoints.preview': m(CheckpointTarget, RestoreResultSchema),
  /** Undo NOVA changes made after a checkpoint, or the changes of one task. Never touches files changed by the user afterwards. */
  'checkpoints.restore': m(
    z
      .object({ checkpointId: z.string().optional(), taskId: z.string().optional(), commit: z.boolean().default(true) })
      .refine((p) => Boolean(p.checkpointId) !== Boolean(p.taskId), { message: 'Bitte genau einen Wiederherstellungspunkt oder eine Aufgabe angeben.' }),
    RestoreResultSchema,
  ),

  // --- processes / terminal / checks / preview ----------------------------
  'processes.list': m(z.object({ projectId: z.string().optional(), includeExited: z.boolean().default(false) }).default({ includeExited: false }), z.array(ProcessInfoSchema)),
  'processes.kill': m(ById, ProcessInfoSchema),
  'processes.output': m(z.object({ id: z.string(), tailLines: z.number().int().max(5000).default(500) }), z.object({ output: z.string() })),
  'terminal.create': m(ByProject, TerminalSessionSchema),
  'terminal.list': m(z.object({ projectId: z.string().optional() }).default({}), z.array(TerminalSessionSchema)),
  /** Runs one command line in the session (user action; not subject to agent approvals). */
  'terminal.run': m(z.object({ sessionId: z.string(), line: z.string().max(10000) }), z.object({ accepted: z.boolean() })),
  'terminal.interrupt': m(z.object({ sessionId: z.string() }), Ok),
  'terminal.close': m(z.object({ sessionId: z.string() }), Ok),
  'checks.list': m(z.object({ projectId: z.string(), kind: CheckKind.optional(), taskId: z.string().optional(), limit: z.number().int().max(500).default(50) }), z.array(CheckRunSchema)),
  'checks.get': m(ById, CheckRunSchema),
  /** Starts a check now (user action) and returns it immediately with status running; completion via 'check.updated'. */
  'checks.run': m(z.object({ projectId: z.string(), kind: CheckKind }), CheckRunSchema),
  'checks.cancel': m(ById, CheckRunSchema),
  'preview.status': m(ByProject, PreviewStatusSchema),
  'preview.start': m(ByProject, PreviewStatusSchema),
  'preview.stop': m(ByProject, PreviewStatusSchema),

  // --- settings / backup / data -------------------------------------------
  'settings.get': m(Empty, SettingsSchema),
  /** Deep patch: only given fields change. */
  'settings.update': m(SettingsPatchParams, SettingsSchema),
  'backup.list': m(Empty, z.array(BackupInfoSchema)),
  'backup.create': m(z.object({ reason: z.string().default('manuell') }).default({ reason: 'manuell' }), BackupInfoSchema),
  /** Copy of a project folder (without node_modules, .git, build outputs) into the backup directory. */
  'backup.snapshotProject': m(ByProject, BackupInfoSchema),
  /**
   * Database backup: validated, current DB backed up, swapped on restart (restartRequired=true; the daemon restarts itself).
   * Project snapshot: copied to targetDir (default "<projectsDir>/<name> (Wiederherstellung <Datum>)"), never over the original.
   */
  'backup.restore': m(z.object({ id: z.string(), targetDir: z.string().optional() }), z.object({ message: z.string(), restartRequired: z.boolean(), path: z.string().nullable() })),
  'backup.delete': m(ById, Ok),
  'data.export': m(z.object({ sections: z.array(ExportSection).min(1), path: z.string().optional() }), z.object({ path: z.string(), counts: z.record(z.string(), z.number()) })),
  'data.import': m(z.object({ path: z.string() }), z.object({ counts: z.record(z.string(), z.number()), warnings: z.array(z.string()) })),
  'updates.check': m(Empty, UpdateInfoSchema),

  // --- notifications & operations -----------------------------------------
  'notifications.list': m(z.object({ unreadOnly: z.boolean().default(false), limit: z.number().int().max(1000).default(100) }).default({ unreadOnly: false, limit: 100 }), z.array(NotificationSchema)),
  /** ids omitted = mark all as read. */
  'notifications.markRead': m(z.object({ ids: z.array(z.string()).optional() }).default({}), Ok),
  'operations.list': m(z.object({ activeOnly: z.boolean().default(true) }).default({ activeOnly: true }), z.array(OperationSchema)),
  'operations.get': m(ById, OperationSchema),
  'operations.cancel': m(ById, OperationSchema),
} as const;

export type RpcContractType = typeof RpcContract;
export type RpcMethod = keyof RpcContractType;
export type RpcParams<M extends RpcMethod> = z.input<RpcContractType[M]['params']>;
export type RpcParsedParams<M extends RpcMethod> = z.output<RpcContractType[M]['params']>;
export type RpcResult<M extends RpcMethod> = z.output<RpcContractType[M]['result']>;
export const RPC_METHODS = Object.keys(RpcContract) as RpcMethod[];

export function isRpcMethod(name: string): name is RpcMethod {
  return Object.prototype.hasOwnProperty.call(RpcContract, name);
}

export interface RpcRequest {
  id: string;
  method: string;
  params?: unknown;
}

export type RpcResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: string; message: string; details?: unknown; error?: unknown } };
