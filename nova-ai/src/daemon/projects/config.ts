// Project configuration helpers shared by ProjectService, TemplateRegistry, ProjectDetector and CheckService.
// Key decisions:
// - One place defines the default config per project kind (commands all null = "unknown", preview kind per kind,
//   artifact globs per kind). `autoCommit` is seeded from settings.agents.autoCommit for NEW projects only.
// - Config patches deep-merge exactly two nested objects (commands, preview); every other field is replaced.
// - Stored configs are re-validated on read; broken/old rows are repaired by merging onto the kind defaults so a
//   single bad value never makes a project unreadable.
import { ProjectConfigSchema, type ProjectCommands, type ProjectConfig, type ProjectConfigPatch, type ProjectKind, type PreviewKind } from '@shared/schemas';

export const COMMAND_KEYS: (keyof ProjectCommands)[] = ['install', 'dev', 'build', 'test', 'lint', 'typecheck', 'e2e', 'security', 'package', 'run'];

export function emptyCommands(partial: Partial<ProjectCommands> = {}): ProjectCommands {
  const out = {} as ProjectCommands;
  for (const k of COMMAND_KEYS) out[k] = partial[k] ?? null;
  return out;
}

export function defaultPreviewKind(kind: ProjectKind): PreviewKind {
  switch (kind) {
    case 'web':
      return 'browser-static';
    case 'backend':
      return 'browser-dev-server';
    case 'desktop':
      return 'desktop-run';
    case 'unity':
    case 'godot':
    case 'unreal':
      return 'engine-external';
    default:
      return 'none';
  }
}

export function defaultArtifactGlobs(kind: ProjectKind): string[] {
  switch (kind) {
    case 'web':
      return ['dist/**', 'build/**'];
    case 'desktop':
      return ['dist/**', '**/bin/Release/**'];
    case 'backend':
      return ['dist/**'];
    case 'unity':
      return ['Builds/**'];
    case 'godot':
      return ['build/**', 'export/**'];
    case 'unreal':
      return ['Packaged/**', 'Saved/StagedBuilds/**'];
    default:
      return [];
  }
}

export function defaultConfig(kind: ProjectKind, autoCommit: boolean): ProjectConfig {
  const previewKind = defaultPreviewKind(kind);
  return {
    commands: emptyCommands(),
    preview: { kind: previewKind, entry: previewKind === 'browser-static' ? 'index.html' : null, url: null },
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: true,
    autoCommit,
    monthlyBudgetUsd: null,
    conventions: '',
    artifactGlobs: defaultArtifactGlobs(kind),
    engineVersion: null,
  };
}

function definedEntries<T extends object>(obj: T | undefined): Partial<T> {
  const out: Partial<T> = {};
  if (!obj) return out;
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Deep merge for ProjectConfigPatch: commands and preview are merged key by key, everything else replaced. */
export function mergeConfig(base: ProjectConfig, patch: ProjectConfigPatch | Partial<ProjectConfig> | undefined): ProjectConfig {
  if (!patch) return base;
  const { commands, preview, ...rest } = patch;
  return {
    ...base,
    ...definedEntries(rest as Partial<ProjectConfig>),
    commands: { ...base.commands, ...definedEntries(commands as Partial<ProjectCommands> | undefined) },
    preview: { ...base.preview, ...definedEntries(preview as Partial<ProjectConfig['preview']> | undefined) },
  };
}

/** Parses a stored config JSON value; invalid/missing parts fall back to the defaults of the kind. */
export function parseStoredConfig(raw: unknown, kind: ProjectKind, autoCommit: boolean): ProjectConfig {
  const direct = ProjectConfigSchema.safeParse(raw);
  if (direct.success) return direct.data;
  const base = defaultConfig(kind, autoCommit);
  if (!raw || typeof raw !== 'object') return base;
  const candidate = mergeConfig(base, raw as ProjectConfigPatch);
  const repaired = ProjectConfigSchema.safeParse(candidate);
  if (repaired.success) return repaired.data;
  // Field by field: keep only the values that validate on their own.
  const out: ProjectConfig = { ...base, commands: { ...base.commands }, preview: { ...base.preview } };
  const shape = ProjectConfigSchema.shape;
  for (const key of Object.keys(shape) as (keyof ProjectConfig)[]) {
    const value = (candidate as Record<string, unknown>)[key];
    const one = shape[key].safeParse(value);
    if (one.success) (out as Record<string, unknown>)[key] = one.data;
  }
  return out;
}
