// Shared helpers of the integration modules: injectable file system access, Windows environment folders, version
// parsing/sorting and the generic "find executable + ask its version" detection.
// Key decisions:
// - Built-in modules never touch node:fs directly: they receive an FsLike, so Windows layouts (Unity Hub, Epic,
//   WinGet, Steam …) are unit-tested on Linux with path.win32 and an in-memory file system.
// - exists() uses lstat: Windows app execution aliases (wt.exe, winget.exe in %LOCALAPPDATA%\Microsoft\WindowsApps)
//   are reparse points that stat() cannot open.
// - Versions come from exit code 0 + stdout/stderr of version commands or from machine-readable files
//   (package.json, Build.version, editors-v2.json); localized texts are never interpreted.
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import type { IntegrationDetectContext, IntegrationModule } from '../contracts';

export type DetectResult = Awaited<ReturnType<IntegrationModule['detect']>>;
export type Installation = DetectResult['installations'][number];

export interface FsLike {
  exists(p: string): boolean;
  isDir(p: string): boolean;
  /** Entry names (empty when the folder is missing or unreadable). */
  listDir(p: string): string[];
  /** File content (UTF-8, BOM stripped) or null; files above maxBytes are not read. */
  readText(p: string, maxBytes?: number): string | null;
  /** Canonical path (symlinks resolved) or the input when that fails. */
  realpath(p: string): string;
}

export const nodeFs: FsLike = {
  exists(p) {
    try {
      lstatSync(p);
      return true;
    } catch {
      return false;
    }
  },
  isDir(p) {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  listDir(p) {
    try {
      return readdirSync(p);
    } catch {
      return [];
    }
  },
  readText(p, maxBytes = 4 * 1024 * 1024) {
    try {
      if (statSync(p).size > maxBytes) return null;
      return readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
    } catch {
      return null;
    }
  },
  realpath(p) {
    try {
      return realpathSync.native(p);
    } catch {
      return p;
    }
  },
};

export interface ModuleDeps {
  fs: FsLike;
  /** Platform for open() (detect() uses ctx.platform). */
  platform: NodeJS.Platform;
}

export function pathFor(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix;
}

export function envGet(env: Record<string, string | undefined>, name: string): string | undefined {
  const direct = env[name];
  if (direct !== undefined && direct !== '') return direct;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(env)) if (k.toLowerCase() === lower && v) return v;
  return undefined;
}

export interface WinFolders {
  programFiles: string;
  programFilesX86: string;
  programData: string;
  localAppData: string;
  appData: string;
  systemRoot: string;
  userProfile: string;
}

export function winFolders(env: Record<string, string | undefined>): WinFolders {
  const userProfile = envGet(env, 'USERPROFILE') ?? 'C:\\Users\\Default';
  return {
    programFiles: envGet(env, 'ProgramFiles') ?? 'C:\\Program Files',
    programFilesX86: envGet(env, 'ProgramFiles(x86)') ?? 'C:\\Program Files (x86)',
    programData: envGet(env, 'ProgramData') ?? 'C:\\ProgramData',
    localAppData: envGet(env, 'LOCALAPPDATA') ?? win32.join(userProfile, 'AppData', 'Local'),
    appData: envGet(env, 'APPDATA') ?? win32.join(userProfile, 'AppData', 'Roaming'),
    systemRoot: envGet(env, 'SystemRoot') ?? 'C:\\Windows',
    userProfile,
  };
}

export function homeDir(env: Record<string, string | undefined>): string {
  return envGet(env, 'HOME') ?? envGet(env, 'USERPROFILE') ?? '/';
}

/** First dotted version number in a text ("git version 2.43.0.windows.1" → "2.43.0"). */
export function firstVersion(text: string, minParts = 2): string | null {
  const re = minParts >= 3 ? /(\d+\.\d+\.\d+(?:\.\d+)?)/ : /(\d+\.\d+(?:\.\d+){0,2})/;
  const m = re.exec(text);
  return m ? m[1] : null;
}

/** Numeric comparison of dotted versions; non-numeric parts are compared after the numbers. Returns >0 if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.match(/\d+/g)?.map(Number) ?? [];
  const pb = b.match(/\d+/g)?.map(Number) ?? [];
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return 0;
}

const UNITY_RE = /^(\d+)\.(\d+)\.(\d+)([abfpcx]|rc)(\d+)/i;
const UNITY_STAGE: Record<string, number> = { a: 0, b: 1, rc: 2, x: 2, c: 3, f: 3, p: 4 };

/** Unity versions "2022.3.10f1", "6000.0.23f1", "2023.1.0b5"; unknown versions sort last. */
export function compareUnityVersions(a: string, b: string): number {
  const ma = UNITY_RE.exec(a);
  const mb = UNITY_RE.exec(b);
  if (!ma && !mb) return compareVersions(a, b);
  if (!ma) return -1;
  if (!mb) return 1;
  for (const i of [1, 2, 3]) {
    const d = Number(ma[i]) - Number(mb[i]);
    if (d !== 0) return d;
  }
  const sd = (UNITY_STAGE[ma[4].toLowerCase()] ?? 0) - (UNITY_STAGE[mb[4].toLowerCase()] ?? 0);
  if (sd !== 0) return sd;
  return Number(ma[5]) - Number(mb[5]);
}

export function unityVersionIn(text: string): string | null {
  const m = /(\d{4,}\.\d+\.\d+(?:[abfpcx]|rc)\d+)/i.exec(text);
  return m ? m[1] : null;
}

export function sortInstallations(list: Installation[], compare: (a: string, b: string) => number = compareVersions): Installation[] {
  return [...list].sort((x, y) => {
    const xu = x.version === 'unbekannt';
    const yu = y.version === 'unbekannt';
    if (xu !== yu) return xu ? 1 : -1;
    return compare(y.version, x.version);
  });
}

export function dedupeInstallations(list: Installation[], platform: NodeJS.Platform, fs?: FsLike): Installation[] {
  const seen = new Set<string>();
  const out: Installation[] = [];
  for (const inst of list) {
    const canonical = fs ? fs.realpath(inst.path) : inst.path;
    const key = platform === 'win32' ? canonical.toLowerCase() : canonical;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(inst);
  }
  return out;
}

export function readJson(fs: FsLike, p: string): unknown {
  const text = fs.readText(p, 8 * 1024 * 1024);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** "version" field of a package.json. */
export function packageJsonVersion(fs: FsLike, p: string): string | null {
  const data = readJson(fs, p);
  if (data && typeof data === 'object' && typeof (data as { version?: unknown }).version === 'string') {
    const v = (data as { version: string }).version.trim();
    return /^\d+\.\d+/.test(v) ? v : null;
  }
  return null;
}

/** All matches of `where.exe <name>` (Windows) or the single PATH match elsewhere. */
export async function findAllOnPath(ctx: IntegrationDetectContext, name: string): Promise<string[]> {
  if (!/^[A-Za-z0-9_.+-]+$/.test(name)) return [];
  if (ctx.platform === 'win32') {
    const r = await ctx.run('where.exe', [name], 5000);
    if (r.code !== 0) return [];
    return r.stdout
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  const one = await ctx.findExecutable(name);
  return one ? [one] : [];
}

export function uniquePaths(paths: Array<string | null | undefined>, platform: NodeJS.Platform): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (!p) continue;
    const key = platform === 'win32' ? p.toLowerCase() : p;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Keeps only paths that exist (for guessed default install locations). */
export function existingOnly(fs: FsLike, paths: Array<string | null | undefined>): string[] {
  return paths.filter((p): p is string => !!p && fs.exists(p));
}

export interface VersionToolSpec {
  name: string;
  /** German sentence explaining what the tool is needed for (appended when it is missing). */
  purpose: string;
  /** Candidate executables in priority order (manual path is added first automatically). */
  candidates: (ctx: IntegrationDetectContext) => Promise<Array<string | null | undefined>>;
  versionArgs: string[];
  parseVersion: (output: string) => string | null;
  timeoutMs?: number;
  /** Fallback when running the version command fails (e.g. read package.json next to a .cmd shim). */
  fallbackVersion?: (exe: string, ctx: IntegrationDetectContext) => string | null;
  /** Message when an executable exists but its version command fails. */
  badResponseMessage?: (exe: string) => string;
  /** Optional extra installations (e.g. SDK list) after a successful detection. */
  extraInstallations?: (ctx: IntegrationDetectContext, exe: string, version: string) => Promise<Installation[]>;
  availableMessage?: (version: string | null, exe: string) => string;
}

/** Finds the first candidate that answers its version command with exit code 0 and a parsable version. */
export async function detectVersionTool(ctx: IntegrationDetectContext, deps: ModuleDeps, spec: VersionToolSpec): Promise<DetectResult> {
  const manualNote = ctx.manualPath && !deps.fs.exists(ctx.manualPath) ? `Der eingetragene Pfad wurde nicht gefunden (${ctx.manualPath}). ` : '';
  // PATH lookups are trusted as found; guessed default locations must be filtered by the module (existingOnly()).
  const found = uniquePaths([ctx.manualPath && deps.fs.exists(ctx.manualPath) ? ctx.manualPath : null, ...(await spec.candidates(ctx))], ctx.platform);
  let respondedBadly: string | null = null;
  for (const exe of found) {
    const r = await ctx.run(exe, spec.versionArgs, spec.timeoutMs ?? 10_000);
    let version = r.code === 0 ? spec.parseVersion(`${r.stdout}\n${r.stderr}`) : null;
    if (!version && spec.fallbackVersion) version = spec.fallbackVersion(exe, ctx);
    if (version) {
      const extra = spec.extraInstallations ? await spec.extraInstallations(ctx, exe, version) : [];
      return {
        available: true,
        version,
        path: exe,
        message: manualNote + (spec.availableMessage ? spec.availableMessage(version, exe) : `${spec.name} ${version} ist installiert.`),
        installations: extra.length ? extra : [{ version, path: exe }],
      };
    }
    respondedBadly ??= exe;
  }
  if (respondedBadly) {
    return {
      available: false,
      version: null,
      path: null,
      message:
        manualNote +
        (spec.badResponseMessage
          ? spec.badResponseMessage(respondedBadly)
          : `${spec.name} wurde gefunden (${respondedBadly}), antwortet aber nicht auf die Versionsabfrage. Eventuell ist die Installation beschädigt.`),
      installations: [],
    };
  }
  return { available: false, version: null, path: null, message: `${manualNote}${spec.name} wurde nicht gefunden. ${spec.purpose}`.trim(), installations: [] };
}
