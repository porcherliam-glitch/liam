// Crash-safe file writes for every module (journal, token, lock, exports, run-state, snapshots, diagnostics).
// Temp file in the same directory (name ignored by Unity/watchers), fsync, rename with retries for the Windows
// EPERM/EBUSY/EACCES cases (antivirus, indexer, editors, OneDrive).
import { openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync, statSync, existsSync, mkdirSync, rmSync, ftruncateSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { NovaError } from './errors';

const RETRY_DELAYS_MS = [50, 100, 200, 400, 800, 1600];
const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** `.name.nova-<8hex>.tmp~` next to the target (leading dot + trailing ~ are ignored by Unity and most watchers). */
export function tempNameFor(target: string): string {
  return join(dirname(target), `.${basename(target)}.nova-${randomBytes(4).toString('hex')}.tmp~`);
}

/** True if the file exists and is read-only (Windows read-only attribute / no write permission bit). */
export function isReadOnly(path: string): boolean {
  try {
    return (statSync(path).mode & 0o200) === 0;
  } catch {
    return false;
  }
}

export function renameWithRetry(from: string, to: string): void {
  for (let i = 0; ; i++) {
    try {
      renameSync(from, to);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code) || i >= RETRY_DELAYS_MS.length) throw e;
      sleepSync(RETRY_DELAYS_MS[i]);
    }
  }
}

export function unlinkWithRetry(path: string): void {
  for (let i = 0; ; i++) {
    try {
      unlinkSync(path);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (code === 'ENOENT') return;
      if (!RETRYABLE.has(code) || i >= RETRY_DELAYS_MS.length) throw e;
      sleepSync(RETRY_DELAYS_MS[i]);
    }
  }
}

export function removeDirWithRetry(path: string): void {
  rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

function writeAllSync(fd: number, data: Buffer): void {
  let off = 0;
  while (off < data.length) off += writeSync(fd, data, off, data.length - off);
}

export interface AtomicWriteOptions {
  /** fsync file data before rename (default true). */
  fsync?: boolean;
  /** POSIX file mode for new files (ignored on Windows). */
  mode?: number;
}

/**
 * Writes data atomically: temp file + fsync + rename (with retries). If the rename keeps failing but the target is
 * writable in place, falls back to an in-place rewrite (logged by the caller via the returned flag).
 * Throws FILE_IN_USE (German) for read-only targets or when nothing works.
 */
export function atomicWriteFile(target: string, data: string | Buffer, opts: AtomicWriteOptions = {}): { inPlaceFallback: boolean } {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  const dir = dirname(target);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (existsSync(target) && isReadOnly(target)) {
    throw new NovaError('FILE_IN_USE', 'Die Datei ist schreibgeschützt oder von einem anderen Programm geöffnet.', { severity: 'warning', details: { path: target } });
  }
  const tmp = tempNameFor(target);
  const fd = openSync(tmp, 'w', opts.mode ?? 0o644);
  try {
    writeAllSync(fd, buf);
    if (opts.fsync !== false) fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameWithRetry(tmp, target);
    return { inPlaceFallback: false };
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    // Last resort: rewrite in place (not atomic, but keeps working when a viewer holds the file without delete share).
    try {
      const fd2 = openSync(target, 'r+');
      try {
        writeAllSync(fd2, buf);
        ftruncateSync(fd2, buf.length);
        if (opts.fsync !== false) fsyncSync(fd2);
      } finally {
        closeSync(fd2);
      }
      return { inPlaceFallback: true };
    } catch {
      throw new NovaError('FILE_IN_USE', 'Die Datei ist schreibgeschützt oder von einem anderen Programm geöffnet.', {
        severity: 'warning',
        details: { path: target, error: (e as Error).message },
        cause: e,
      });
    }
  }
}
