// Test support for the integration modules/service (imported only by *.test.ts): an in-memory FsLike that follows
// Windows (case-insensitive, path.win32) or POSIX rules, a scripted argv runner and a detect-context builder.
// Keeps the Windows layouts (Unity Hub, Epic, WinGet, Steam …) testable on Linux without touching the real disk.
import { posix, win32 } from 'node:path';
import type { IntegrationDetectContext } from '../contracts';
import type { FsLike } from './helpers';

export interface MemFs extends FsLike {
  add(path: string, content?: string): void;
  addDir(path: string): void;
  remove(path: string): void;
}

export function memFs(platform: NodeJS.Platform, files: Record<string, string> = {}, realpaths: Record<string, string> = {}): MemFs {
  const p = platform === 'win32' ? win32 : posix;
  const key = (raw: string): string => {
    let n = p.normalize(raw);
    const root = p.parse(n).root;
    while (n.length > root.length && (n.endsWith('\\') || n.endsWith('/'))) n = n.slice(0, -1);
    return platform === 'win32' ? n.toLowerCase() : n;
  };
  const fileMap = new Map<string, { path: string; content: string }>();
  const dirMap = new Map<string, string>();
  const real = new Map(Object.entries(realpaths).map(([k, v]) => [key(k), v]));
  const addDir = (dir: string): void => {
    let cur = p.normalize(dir);
    for (let i = 0; i < 256; i++) {
      const k = key(cur);
      if (!dirMap.has(k)) dirMap.set(k, cur);
      const parent = p.dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
  };
  const add = (file: string, content = ''): void => {
    const n = p.normalize(file);
    fileMap.set(key(n), { path: n, content });
    addDir(p.dirname(n));
  };
  for (const [f, c] of Object.entries(files)) add(f, c);
  return {
    add,
    addDir,
    remove(path) {
      fileMap.delete(key(path));
      dirMap.delete(key(path));
    },
    exists: (path) => fileMap.has(key(path)) || dirMap.has(key(path)),
    isDir: (path) => dirMap.has(key(path)),
    listDir(path) {
      const k = key(path);
      const out = new Set<string>();
      for (const v of [...fileMap.values()].map((f) => f.path).concat([...dirMap.values()])) {
        if (key(p.dirname(v)) === k && key(v) !== k) out.add(p.basename(v));
      }
      return [...out].sort();
    },
    readText(path) {
      const f = fileMap.get(key(path));
      return f ? f.content.replace(/^\uFEFF/, '') : null;
    },
    realpath: (path) => real.get(key(path)) ?? path,
  };
}

export type RunScript = Record<string, { code: number | null; stdout?: string; stderr?: string }>;

/** argv runner answering from a script keyed by "file arg1 arg2 …"; unknown commands behave like a missing program. */
export function scriptedRun(script: RunScript) {
  const calls: Array<{ file: string; args: string[] }> = [];
  const run: IntegrationDetectContext['run'] = async (file, args) => {
    calls.push({ file, args });
    const r = script[[file, ...args].join(' ')];
    if (!r) return { code: null, stdout: '', stderr: 'not found' };
    return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  };
  return { run, calls, script };
}

export const WIN_ENV: Record<string, string> = {
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  ProgramData: 'C:\\ProgramData',
  LOCALAPPDATA: 'C:\\Users\\Ana\\AppData\\Local',
  APPDATA: 'C:\\Users\\Ana\\AppData\\Roaming',
  SystemRoot: 'C:\\Windows',
  USERPROFILE: 'C:\\Users\\Ana',
};

export function detectCtx(
  platform: NodeJS.Platform,
  opts: { run?: IntegrationDetectContext['run']; which?: Record<string, string | null>; env?: Record<string, string | undefined>; manualPath?: string | null } = {},
): IntegrationDetectContext {
  return {
    platform,
    manualPath: opts.manualPath ?? null,
    run: opts.run ?? scriptedRun({}).run,
    findExecutable: async (name) => opts.which?.[name] ?? null,
    env: opts.env ?? (platform === 'win32' ? WIN_ENV : { HOME: '/home/ana' }),
  };
}
