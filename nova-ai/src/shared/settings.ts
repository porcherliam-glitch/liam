// Application settings. Stored per section in the daemon database (table `settings`).
// Every field has a default so partial updates and new versions never break old data.
// Updates are PATCHES: SettingsService deep-merges plain objects, so { models: { roleOverrides: { coder: X } } }
// changes only roleOverrides.coder.
import { z } from 'zod';
import { ModelRefSchema, LogLevel } from './schemas';

export const GeneralSettingsSchema = z.object({
  language: z.enum(['de']).default('de'),
  theme: z.enum(['dark']).default('dark'),
  /** Default parent folder for new projects. Empty = %USERPROFILE%\NOVA Projekte (not Documents: often OneDrive). */
  projectsDir: z.string().default(''),
});

export const AgentSettingsSchema = z.object({
  /** Upper bound of parallel agent runs (resources may lower it). */
  maxParallelAgents: z.number().int().min(1).max(8).default(2),
  /** Max model/tool steps per agent run before the run is stopped as blocked. */
  maxStepsPerRun: z.number().int().min(5).max(500).default(40),
  /** Max automatic fix attempts for a task (tests/review failures). Used when a task does not set its own. */
  maxAttempts: z.number().int().min(1).max(10).default(3),
  /** Identical failure signatures in a row before NOVA switches strategy / blocks. */
  maxIdenticalFailures: z.number().int().min(1).max(5).default(2),
  /** Timeout of one model call in seconds. */
  modelTimeoutSec: z.number().int().min(10).max(3600).default(600),
  /** Seeds project.config.autoCommit for NEW projects (the project setting is authoritative). */
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
  /** Above this VRAM usage a not-yet-loaded local model is not started (fallback or wait). */
  maxVramPercent: z.number().min(10).max(100).default(90),
  /** Max parallel child processes (commands, tests, builds). Dev servers/previews do not count. */
  maxProcesses: z.number().int().min(1).max(32).default(6),
  /** Default timeout for agent commands in seconds. */
  commandTimeoutSec: z.number().int().min(5).max(7200).default(600),
  /** Sampling interval of the resource monitor in seconds. */
  sampleIntervalSec: z.number().int().min(1).max(60).default(3),
  /** Minimum free disk space (MB) on the data/project drive before writes and new runs are blocked. */
  minFreeDiskMb: z.number().int().min(100).default(1024),
});

export const PermissionSettingsSchema = z.object({
  /**
   * Command prefixes agents may run without approval in every project. Only lines WITHOUT shell metacharacters
   * (& | < > ^ % ! ( ) ; $ `) can be auto-allowed. Generic interpreters ("node ", "python ") are intentionally absent.
   */
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
      'git status',
      'git diff',
      'git log',
      'python -m pytest',
      'pytest',
      'dotnet build',
      'dotnet test',
    ]),
  /** Ask before running commands that are not on an allowlist (fail-closed: if off, unknown commands still need approval when they contain metacharacters). */
  approveUnknownCommands: z.boolean().default(true),
  /** Ask before deleting files. */
  approveDeletes: z.boolean().default(true),
});

export const NetworkSettingsSchema = z.object({
  /**
   * Wenn aus: NOVA fragt vor Befehlen mit bekanntem Netzwerkzugriff nach (z. B. npm install, curl, git clone).
   * Programme und Tests, die selbst Verbindungen aufbauen, kann NOVA technisch nicht blockieren.
   */
  allowAgentNetwork: z.boolean().default(true),
  /** Ziele, die NOVA selbst (Update-Prüfung, Projekt-Import) und Agentenbefehle ohne Rückfrage kontaktieren dürfen ("*.example.com" erlaubt Subdomains). */
  allowedHosts: z
    .array(z.string())
    .default(['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org', 'github.com', 'codeload.github.com', 'api.nuget.org', 'nodejs.org']),
  /** Project content goes to non-local (cloud) model providers only after a one-time approval per project. */
  approveCloudProjectData: z.boolean().default(true),
});

export const BudgetSettingsSchema = z.object({
  /** 0 = no paid usage allowed; null = no limit. */
  dailyLimitUsd: z.number().nonnegative().nullable().default(0),
  monthlyLimitUsd: z.number().nonnegative().nullable().default(0),
  /** When a limit is reached, continue with approved local models from the model chain. */
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
  /** Keep at most this many database backups (and project snapshots per project). */
  retentionCount: z.number().int().min(1).max(200).default(20),
  /** Delete backups older than this many days (0 = never by age). */
  retentionDays: z.number().int().min(0).max(3650).default(30),
  dailyDatabaseBackup: z.boolean().default(true),
  /** Create a checkpoint before every task (needed for restore). */
  checkpointBeforeTasks: z.boolean().default(true),
  /** Delete unreferenced change-journal snapshots older than this many days (0 = forever). */
  snapshotRetentionDays: z.number().int().min(0).max(3650).default(60),
});

export const BackgroundSettingsSchema = z.object({
  /** Keep the background service running when the window is closed (the app stays in the tray). */
  keepRunningWhenUiClosed: z.boolean().default(true),
  /** Start NOVA (hidden in the tray) when Windows starts. */
  autostart: z.boolean().default(false),
  /** Resume safe tasks automatically after a restart/crash. */
  resumeAfterRestart: z.boolean().default(true),
  /** Minimize to tray instead of quitting when the window is closed. */
  closeToTray: z.boolean().default(true),
});

export const UpdateSettingsSchema = z.object({
  /** Check daily (never installs anything). */
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
  /** Delete activity history (agent steps, finished processes, old check runs, resolved errors, decided approvals, read notifications) older than this (0 = keep). */
  historyRetentionDays: z.number().int().min(0).max(3650).default(90),
});

export const MemorySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Agents may store memory entries automatically. */
  agentsMayWrite: z.boolean().default(true),
  /** Use shareable insights from the global knowledge base in other projects. */
  useGlobalKnowledge: z.boolean().default(true),
  /** When false, insights written by agents stay project-private until the user shares them. */
  autoShareAgentInsights: z.boolean().default(false),
  /** Max memory entries injected into an agent prompt. */
  maxContextEntries: z.number().int().min(0).max(50).default(12),
});

/** 3D workshop: local text/image → 3D via ComfyUI (TRELLIS.2 / Pixal3D, Z-Image Turbo for text → reference image). */
export const ThreeDSettingsSchema = z.object({
  /** ComfyUI API address; empty = auto-detect (127.0.0.1:8000 ComfyUI Desktop, 127.0.0.1:8188 portable/manual). Local addresses only. */
  engineUrl: z.string().default(''),
  /** ComfyUI "models" folder NOVA downloads model files into; empty = auto-detect. */
  modelsDir: z.string().default(''),
  defaultModel: z.enum(['trellis2', 'pixal3d']).default('trellis2'),
  defaultQuality: z.enum(['draft', 'standard', 'high']).default('standard'),
  /** Project-relative folder for generated models (forward slashes). */
  outputFolder: z.string().default('assets/3d'),
  /** Unload loaded Ollama models before a 3D job so both do not compete for graphics memory. */
  unloadLanguageModels: z.boolean().default(true),
  /** Agents may create 3D models with the tool generate_3d_model. */
  agentsMayGenerate: z.boolean().default(true),
});

export const RoleOverridesSchema = z.object({
  planner: ModelRefSchema.nullable().default(null),
  coder: ModelRefSchema.nullable().default(null),
  tester: ModelRefSchema.nullable().default(null),
  reviewer: ModelRefSchema.nullable().default(null),
});

/**
 * Global model choice. The Ollama endpoint is NOT here: it is the baseUrl of provider row "ollama-local".
 * Candidate order for a role: [preferred, roleOverrides[role], defaultModel, ...fallbacks] – nothing else is ever used.
 */
export const ModelSettingsSchema = z.object({
  defaultModel: ModelRefSchema.nullable().default(null),
  /** Ordered, user-approved fallbacks (used only if the default is unavailable, too large for VRAM or over budget). */
  fallbacks: z.array(ModelRefSchema).default([]),
  roleOverrides: RoleOverridesSchema.default(RoleOverridesSchema.parse({})),
  ollamaNumCtx: z.number().int().min(2048).max(262144).default(16384),
  temperature: z.number().min(0).max(2).default(0.2),
  maxOutputTokens: z.number().int().min(256).max(65536).default(4096),
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
  threeD: ThreeDSettingsSchema.default(ThreeDSettingsSchema.parse({})),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsSection = keyof Settings;
export const SETTINGS_SECTIONS = Object.keys(SettingsSchema.shape) as SettingsSection[];

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

// ---------------------------------------------------------------------------
// Patch schemas: same fields, all optional, NO defaults (so a partial patch never resets other fields).
// ---------------------------------------------------------------------------

type AnyZod = z.ZodType;

/** Builds a default-free, deeply optional version of an object schema. */
export function patchOf<T extends z.ZodObject>(schema: T): z.ZodObject {
  const shape: Record<string, AnyZod> = {};
  for (const [key, value] of Object.entries(schema.shape as Record<string, AnyZod>)) {
    let inner: AnyZod = value;
    if (inner instanceof z.ZodDefault) inner = inner.unwrap() as AnyZod;
    if (inner instanceof z.ZodObject) inner = patchOf(inner);
    shape[key] = inner.optional();
  }
  return z.object(shape);
}

export const ModelSettingsPatchSchema = patchOf(ModelSettingsSchema);

export const SettingsPatchSchema = z.object({
  general: patchOf(GeneralSettingsSchema).optional(),
  models: ModelSettingsPatchSchema.optional(),
  agents: patchOf(AgentSettingsSchema).optional(),
  resources: patchOf(ResourceSettingsSchema).optional(),
  permissions: patchOf(PermissionSettingsSchema).optional(),
  network: patchOf(NetworkSettingsSchema).optional(),
  budgets: patchOf(BudgetSettingsSchema).optional(),
  notifications: patchOf(NotificationSettingsSchema).optional(),
  backup: patchOf(BackupSettingsSchema).optional(),
  background: patchOf(BackgroundSettingsSchema).optional(),
  updates: patchOf(UpdateSettingsSchema).optional(),
  diagnostics: patchOf(DiagnosticsSettingsSchema).optional(),
  memory: patchOf(MemorySettingsSchema).optional(),
  threeD: patchOf(ThreeDSettingsSchema).optional(),
});

/** Deep partial patch type for settings.update / SettingsService.update. */
export type DeepPartial<T> = T extends unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type SettingsPatch = { [K in SettingsSection]?: DeepPartial<Settings[K]> };
export type ModelSettingsPatch = DeepPartial<ModelSettings>;
