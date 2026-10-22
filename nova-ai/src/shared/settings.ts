// Application settings. Stored per section in the daemon database (table `settings`).
// Every field has a default so partial updates and new versions never break old data.
import { z } from 'zod';
import { ModelRefSchema, LogLevel } from './schemas';

export const GeneralSettingsSchema = z.object({
  language: z.enum(['de']).default('de'),
  theme: z.enum(['dark']).default('dark'),
  /** Default parent folder for new projects. Empty = <Documents>/NOVA Projekte. */
  projectsDir: z.string().default(''),
});

export const AgentSettingsSchema = z.object({
  /** Upper bound of parallel agent runs (resources may lower it). */
  maxParallelAgents: z.number().int().min(1).max(8).default(2),
  /** Max model/tool steps per agent run before the run is stopped as blocked. */
  maxStepsPerRun: z.number().int().min(5).max(500).default(40),
  /** Max automatic fix attempts for a task (tests/review failures). */
  maxAttempts: z.number().int().min(1).max(10).default(3),
  /** Identical failure signatures in a row before NOVA switches strategy / blocks. */
  maxIdenticalFailures: z.number().int().min(1).max(5).default(2),
  /** Timeout of one model call in seconds. */
  modelTimeoutSec: z.number().int().min(10).max(3600).default(600),
  /** Commit NOVA changes after a successful task (projects can override). */
  autoCommit: z.boolean().default(true),
  /** Only commit when the relevant checks passed. */
  commitOnlyWhenVerified: z.boolean().default(true),
  /** Planner creates follow-up tasks automatically after a plan task. */
  autoCreatePlannedTasks: z.boolean().default(true),
});

export const ResourceSettingsSchema = z.object({
  adaptive: z.boolean().default(true),
  /** Above this total CPU load no new agent runs are started. */
  maxCpuPercent: z.number().min(10).max(100).default(85),
  /** Below this free RAM (MB) no new agent runs are started. */
  minFreeRamMb: z.number().int().min(256).default(2048),
  /** Max parallel child processes (commands, tests, builds, dev servers). */
  maxProcesses: z.number().int().min(1).max(32).default(6),
  /** Default timeout for agent commands in seconds. */
  commandTimeoutSec: z.number().int().min(5).max(7200).default(600),
  /** Sampling interval of the resource monitor in seconds. */
  sampleIntervalSec: z.number().int().min(1).max(60).default(3),
  /** Minimum free disk space (MB) before writes are blocked. */
  minFreeDiskMb: z.number().int().min(100).default(1024),
});

export const PermissionSettingsSchema = z.object({
  /** Command prefixes agents may run without approval in every project. */
  commandAllowlist: z
    .array(z.string())
    .default([
      'npm test',
      'npm run test',
      'npm run build',
      'npm run lint',
      'npm run typecheck',
      'npm install',
      'npm ci',
      'npx vitest',
      'npx tsc',
      'npx eslint',
      'node ',
      'git status',
      'git diff',
      'git log',
      'python -m pytest',
      'pytest',
      'dotnet build',
      'dotnet test',
    ]),
  /** Ask before running commands that are not on an allowlist. */
  approveUnknownCommands: z.boolean().default(true),
  /** Agents may read/write outside the project folder (each access still needs approval). */
  allowOutsideProject: z.boolean().default(false),
  /** Ask before deleting files (always true for directories). */
  approveDeletes: z.boolean().default(true),
});

export const NetworkSettingsSchema = z.object({
  /** Agents/commands may access the network (package managers, docs). */
  allowAgentNetwork: z.boolean().default(true),
  /** Hosts NOVA itself may contact (besides configured providers and localhost). */
  allowedHosts: z
    .array(z.string())
    .default(['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'github.com', 'api.nuget.org', 'nodejs.org']),
  /** Send project content to cloud providers only after approval per project. */
  approveCloudProjectData: z.boolean().default(true),
});

export const BudgetSettingsSchema = z.object({
  dailyLimitUsd: z.number().nonnegative().nullable().default(0),
  monthlyLimitUsd: z.number().nonnegative().nullable().default(0),
  /** Fall back to approved local models when a budget is reached. */
  fallbackToLocal: z.boolean().default(true),
  /** Warn at this share of a limit (0..1). */
  warnAtRatio: z.number().min(0.1).max(1).default(0.8),
});

export const NotificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  onTaskDone: z.boolean().default(true),
  onError: z.boolean().default(true),
  onApproval: z.boolean().default(true),
  onBlocker: z.boolean().default(true),
});

export const BackupSettingsSchema = z.object({
  /** Keep at most this many database backups. */
  retentionCount: z.number().int().min(1).max(200).default(20),
  /** Delete backups older than this many days (0 = never by age). */
  retentionDays: z.number().int().min(0).max(3650).default(30),
  dailyDatabaseBackup: z.boolean().default(true),
  /** Create a checkpoint before every task (needed for restore). */
  checkpointBeforeTasks: z.boolean().default(true),
  /** Keep change-journal snapshots this many days (0 = forever). */
  snapshotRetentionDays: z.number().int().min(0).max(3650).default(60),
});

export const BackgroundSettingsSchema = z.object({
  /** Keep the background service running when the window is closed. */
  keepRunningWhenUiClosed: z.boolean().default(true),
  /** Start NOVA (hidden in the tray) when Windows starts. */
  autostart: z.boolean().default(false),
  /** Resume safe tasks automatically after a restart/crash. */
  resumeAfterRestart: z.boolean().default(true),
  /** Minimize to tray instead of quitting when the window is closed. */
  closeToTray: z.boolean().default(true),
});

export const UpdateSettingsSchema = z.object({
  checkForUpdates: z.boolean().default(false),
  /** URL of a JSON document {version, url, notes}. Empty = no update source configured. */
  feedUrl: z.string().default(''),
});

export const DiagnosticsSettingsSchema = z.object({
  logLevel: LogLevel.default('info'),
  maxLogFileMb: z.number().min(1).max(100).default(5),
  maxLogFiles: z.number().int().min(1).max(50).default(5),
  /** Never sends anything anywhere; only controls local diagnostic bundle contents. */
  includeSystemInfo: z.boolean().default(true),
});

export const MemorySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Agents may store memory entries automatically. */
  agentsMayWrite: z.boolean().default(true),
  /** Use shareable insights from the global knowledge base in other projects. */
  useGlobalKnowledge: z.boolean().default(true),
  /** Max memory entries injected into an agent prompt. */
  maxContextEntries: z.number().int().min(0).max(50).default(12),
});

export const RoleOverridesSchema = z.object({
  planner: ModelRefSchema.nullable().default(null),
  coder: ModelRefSchema.nullable().default(null),
  tester: ModelRefSchema.nullable().default(null),
  reviewer: ModelRefSchema.nullable().default(null),
});

/** Global model choice. Same shape as ModelSelection plus the Ollama endpoint. */
export const ModelSettingsSchema = z.object({
  defaultModel: ModelRefSchema.nullable().default(null),
  /** Ordered, user-approved fallbacks (used only if the default is unavailable or over budget). */
  fallbacks: z.array(ModelRefSchema).default([]),
  roleOverrides: RoleOverridesSchema.default(RoleOverridesSchema.parse({})),
  ollamaNumCtx: z.number().int().min(2048).max(262144).default(16384),
  temperature: z.number().min(0).max(2).default(0.2),
  maxOutputTokens: z.number().int().min(256).max(65536).default(4096),
  ollamaBaseUrl: z.string().default('http://127.0.0.1:11434'),
});
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;

export const SettingsSchema = z.object({
  general: GeneralSettingsSchema.default(GeneralSettingsSchema.parse({})),
  models: ModelSettingsSchema.default(ModelSettingsSchema.parse({})),
  agents: AgentSettingsSchema.default(AgentSettingsSchema.parse({})),
  resources: ResourceSettingsSchema.default(ResourceSettingsSchema.parse({})),
  permissions: PermissionSettingsSchema.default(PermissionSettingsSchema.parse({})),
  network: NetworkSettingsSchema.default(NetworkSettingsSchema.parse({})),
  budgets: BudgetSettingsSchema.default(BudgetSettingsSchema.parse({})),
  notifications: NotificationSettingsSchema.default(NotificationSettingsSchema.parse({})),
  backup: BackupSettingsSchema.default(BackupSettingsSchema.parse({})),
  background: BackgroundSettingsSchema.default(BackgroundSettingsSchema.parse({})),
  updates: UpdateSettingsSchema.default(UpdateSettingsSchema.parse({})),
  diagnostics: DiagnosticsSettingsSchema.default(DiagnosticsSettingsSchema.parse({})),
  memory: MemorySettingsSchema.default(MemorySettingsSchema.parse({})),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsSection = keyof Settings;
export const SETTINGS_SECTIONS = Object.keys(SettingsSchema.shape) as SettingsSection[];

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

/** Partial update: any subset of sections, each with any subset of fields. */
export type SettingsPatch = { [K in SettingsSection]?: Partial<Settings[K]> };
export const SettingsPatchSchema = z.record(z.string(), z.record(z.string(), z.unknown()));
