// Project tree walker shared by the change journal (scanState), FileService (search), the file watcher (poll
// fallback) and the agent file tools.
// Key decisions:
// - Never follows symlinks or junctions (SPEC §6.0.3): entries are classified with readdir({withFileTypes:true}) and
//   lstat, links are skipped entirely (callers that display trees list them separately).
// - The ignored directory names are the FileService.tree list from SPEC §4.3 (+ .git). They are compared
//   case-insensitively on every platform ("Library"/"library" both mean the Unity cache folder).
// - Bounded: at most `maxFiles` files (default 50 000), errors on single directories (EACCES, vanished) are skipped.
// - Deterministic order: entries are sorted by name, files of a directory come before its sub directories.
import { readdir, lstat } from 'node:fs/promises';
import { join } from 'node:path';

const IGNORED = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'library', 'temp', 'obj', 'bin', '.venv', '__pycache__']);

/** The directory names FileService.tree shows but does not descend into, also skipped by scans, search and watcher. */
export const PROJECT_IGNORED_DIR_NAMES: readonly string[] = ['node_modules', '.git', 'dist', 'out', 'build', 'Library', 'Temp', 'obj', 'bin', '.venv', '__pycache__'];

export function isIgnoredDirName(name: string): boolean {
  return IGNORED.has(name.toLowerCase());
}

/** Temp files written by core/fs-atomic (`.name.nova-<8hex>.tmp~`). */
export function isNovaTempName(name: string): boolean {
  return /^\..+\.nova-[0-9a-f]{8}\.tmp~$/.test(name);
}

export interface WalkedFile {
  /** Project-relative, forward slashes, on-disk case. */
  rel: string;
  abs: string;
  size: number;
  mtimeMs: number;
}

export interface WalkOptions {
  /** Start below the root (project-relative, forward slashes). The start directory itself is always descended. */
  startRel?: string;
  /** Default 50 000. */
  maxFiles?: number;
  /** Skip files larger than this (they are not returned at all). */
  maxFileBytes?: number;
  signal?: AbortSignal;
}

export interface WalkResult {
  files: WalkedFile[];
  /** true when maxFiles was reached (the remaining files were not visited). */
  truncated: boolean;
}

const STAT_BATCH = 64;

/** Walks regular files below `root` (an absolute, canonical directory). */
export async function walkProjectFiles(root: string, opts: WalkOptions = {}): Promise<WalkResult> {
  const maxFiles = opts.maxFiles ?? 50_000;
  const files: WalkedFile[] = [];
  const startRel = (opts.startRel ?? '').replace(/^\/+|\/+$/g, '');
  const stack: string[] = [startRel];
  let truncated = false;

  while (stack.length > 0) {
    if (opts.signal?.aborted) break;
    const relDir = stack.pop()!;
    const absDir = relDir ? join(root, ...relDir.split('/')) : root;
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      continue; // vanished, no permission, not a directory
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const subDirs: string[] = [];
    const fileNames: string[] = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) continue; // never follow links/junctions
      if (e.isDirectory()) {
        if (!isIgnoredDirName(e.name)) subDirs.push(relDir ? `${relDir}/${e.name}` : e.name);
      } else if (e.isFile()) {
        if (!isNovaTempName(e.name)) fileNames.push(e.name);
      }
    }
    for (let i = 0; i < fileNames.length; i += STAT_BATCH) {
      const batch = fileNames.slice(i, i + STAT_BATCH);
      const stats = await Promise.all(
        batch.map(async (name) => {
          const abs = join(absDir, name);
          try {
            const st = await lstat(abs);
            return st.isFile() ? { name, abs, size: st.size, mtimeMs: st.mtimeMs } : null;
          } catch {
            return null;
          }
        }),
      );
      for (const st of stats) {
        if (!st) continue;
        if (opts.maxFileBytes !== undefined && st.size > opts.maxFileBytes) continue;
        if (files.length >= maxFiles) {
          truncated = true;
          break;
        }
        files.push({ rel: relDir ? `${relDir}/${st.name}` : st.name, abs: st.abs, size: st.size, mtimeMs: st.mtimeMs });
      }
      if (truncated) break;
    }
    if (truncated) break;
    // Push in reverse so the alphabetically first sub directory is visited next.
    for (let i = subDirs.length - 1; i >= 0; i--) stack.push(subDirs[i]);
  }
  return { files, truncated };
}
