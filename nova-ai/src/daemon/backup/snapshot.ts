// Project snapshot copy (BackupService.snapshotProject and the restore of a snapshot into a NEW folder).
// Key decisions:
// - The walker never follows links: symbolic links and junctions (reported as links by readdir on Windows) are
//   skipped, and every file is lstat-ed again right before copying (a link swapped in meanwhile is skipped, too).
// - Skipped folders (SPEC §4.6): node_modules, .git and .venv everywhere; out, dist, build, Library, Temp, obj and bin
//   only directly in the project folder – deeper folders with these names are usually sources (e.g. a Node package's
//   bin/cli.js) – plus bin/obj next to a .NET project file (*.csproj/*.vbproj/*.fsproj) at any depth. Names are
//   compared case-insensitively on Windows.
// - A first pass counts files and bytes (exact progress and the 2 GB cap BEFORE anything is copied); the copy pass
//   re-checks the cap with the bytes actually copied (files can grow). Abort is honoured between files.
// - Files that cannot be read (locked by another program, deleted meanwhile) are skipped and reported, the rest
//   is copied; mtimes are preserved.
import { copyFile, lstat, mkdir, readdir, stat, utimes } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { NovaError } from '../core/errors';

export const SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
const SKIP_ANYWHERE = ['node_modules', '.git', '.venv'];
const SKIP_AT_ROOT = ['out', 'dist', 'build', 'Library', 'Temp', 'obj', 'bin'];
const DOTNET_PROJECT = /\.(csproj|vbproj|fsproj)$/i;

export interface TreeEntry {
  rel: string; // forward slashes
  size: number;
}

export interface TreeScan {
  files: TreeEntry[];
  dirs: string[];
  totalBytes: number;
  skippedLinks: number;
  skippedDirs: string[];
}

export interface ScanOptions {
  platform: NodeJS.Platform;
  /** Apply the snapshot skip rules (false when copying a snapshot back – everything inside it is restored). */
  applySkipRules: boolean;
  maxBytes: number;
  signal?: AbortSignal;
  /** German message for the size-cap error. */
  tooLargeMessage?: string;
}

function cancelled(): NovaError {
  return new NovaError('CANCELLED', 'Der Vorgang wurde abgebrochen.', { severity: 'warning' });
}

/** Walks a directory tree without following links. Throws RESOURCE_LIMIT when the size cap is exceeded. */
export async function scanTree(root: string, opts: ScanOptions): Promise<TreeScan> {
  const ci = opts.platform === 'win32';
  const name = (n: string) => (ci ? n.toLowerCase() : n);
  const anywhere = new Set(SKIP_ANYWHERE.map(name));
  const atRoot = new Set(SKIP_AT_ROOT.map(name));
  const result: TreeScan = { files: [], dirs: [], totalBytes: 0, skippedLinks: 0, skippedDirs: [] };
  const stack: string[] = [''];
  let visited = 0;
  while (stack.length > 0) {
    if (opts.signal?.aborted) throw cancelled();
    const relDir = stack.pop()!;
    const absDir = relDir ? join(root, ...relDir.split('/')) : root;
    let entries;
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch (e) {
      if (relDir === '') throw e;
      result.skippedDirs.push(relDir);
      continue;
    }
    const hasDotnetProject = opts.applySkipRules && entries.some((e) => e.isFile() && DOTNET_PROJECT.test(e.name));
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        result.skippedLinks++;
        continue;
      }
      if (entry.isDirectory()) {
        if (opts.applySkipRules) {
          const n = name(entry.name);
          const skip = anywhere.has(n) || (relDir === '' && atRoot.has(n)) || (hasDotnetProject && (n === name('bin') || n === name('obj')));
          if (skip) {
            result.skippedDirs.push(rel);
            continue;
          }
        }
        result.dirs.push(rel);
        stack.push(rel);
        continue;
      }
      if (!entry.isFile()) continue; // sockets, FIFOs, devices
      let st;
      try {
        st = await lstat(join(absDir, entry.name));
      } catch {
        continue; // vanished
      }
      if (!st.isFile()) {
        if (st.isSymbolicLink()) result.skippedLinks++;
        continue;
      }
      result.files.push({ rel, size: st.size });
      result.totalBytes += st.size;
      if (result.totalBytes > opts.maxBytes) {
        throw new NovaError('RESOURCE_LIMIT', opts.tooLargeMessage ?? 'Der Ordner ist zu groß für eine Sicherungskopie.', {
          severity: 'warning',
          details: { limitBytes: opts.maxBytes },
        });
      }
      if (++visited % 500 === 0 && opts.signal?.aborted) throw cancelled();
    }
  }
  result.dirs.sort();
  return result;
}

export interface CopyResult {
  fileCount: number;
  bytes: number;
  skipped: { path: string; reason: string }[];
}

export interface CopyOptions {
  maxBytes: number;
  signal?: AbortSignal;
  onProgress?: (percent: number | null, message: string) => void;
  tooLargeMessage?: string;
}

/** Copies the scanned tree from `src` into `dest` (which must not contain these files yet). */
export async function copyTree(src: string, dest: string, scan: TreeScan, opts: CopyOptions): Promise<CopyResult> {
  await mkdir(dest, { recursive: true });
  for (const d of scan.dirs) await mkdir(join(dest, ...d.split('/')), { recursive: true });
  const skipped: { path: string; reason: string }[] = [];
  let bytes = 0;
  let fileCount = 0;
  let lastEmit = 0;
  const total = Math.max(1, scan.totalBytes);
  for (const f of scan.files) {
    if (opts.signal?.aborted) throw cancelled();
    const from = join(src, ...f.rel.split('/'));
    const to = join(dest, ...f.rel.split('/'));
    let st;
    try {
      st = await lstat(from);
    } catch {
      skipped.push({ path: f.rel, reason: 'Datei wurde während der Sicherung gelöscht.' });
      continue;
    }
    if (!st.isFile()) {
      skipped.push({ path: f.rel, reason: 'Keine normale Datei mehr (z. B. Verknüpfung) – nicht kopiert.' });
      continue;
    }
    if (bytes + st.size > opts.maxBytes) {
      throw new NovaError('RESOURCE_LIMIT', opts.tooLargeMessage ?? 'Der Ordner ist zu groß für eine Sicherungskopie.', { severity: 'warning', details: { limitBytes: opts.maxBytes } });
    }
    try {
      await copyFile(from, to, constants.COPYFILE_EXCL);
      try {
        await utimes(to, st.atime, st.mtime);
      } catch {
        /* timestamps are best effort */
      }
      const copied = await stat(to);
      bytes += copied.size;
      fileCount++;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (code === 'ENOSPC') throw new NovaError('DISK_FULL', 'Nicht genug freier Speicherplatz für die Sicherungskopie.', { severity: 'blocker', cause: e });
      const reason = code === 'EBUSY' || code === 'EPERM' || code === 'EACCES' ? 'Datei ist gesperrt oder nicht lesbar (von einem anderen Programm geöffnet?).' : `Kopieren fehlgeschlagen (${code || 'Fehler'}).`;
      skipped.push({ path: f.rel, reason });
      continue;
    }
    const now = Date.now();
    if (opts.onProgress && now - lastEmit >= 250) {
      lastEmit = now;
      opts.onProgress(Math.min(99, Math.round((bytes / total) * 100)), `${fileCount} von ${scan.files.length} Dateien kopiert …`);
    }
  }
  return { fileCount, bytes, skipped };
}
