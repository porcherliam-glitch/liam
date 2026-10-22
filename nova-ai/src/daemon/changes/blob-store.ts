// Content-addressed snapshot store of the change journal: <dataDir>/snapshots/<aa>/<sha256>.
// Key decisions:
// - A blob's name IS its sha256, so identical contents are stored once and every read can be verified.
// - Blobs are written with atomicWriteFile (temp file + fsync + rename) and re-read + re-hashed after writing
//   ("fsync, verify" step of the journal's crash-safe order). A corrupt blob is rewritten on the next put and is
//   never returned by read() (null instead), so a restore can never write damaged content.
// - put() refreshes the mtime of an existing blob: pruning deletes only unreferenced blobs older than a cutoff, and a
//   blob that was just (re)used must not disappear between "blob written" and "row inserted".
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, readdirSync, rmdirSync, statSync, utimesSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWriteFile, unlinkWithRetry } from '../core/fs-atomic';
import { NovaError } from '../core/errors';

export const SHA256_HEX = /^[a-f0-9]{64}$/;

export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Streams a file through sha256 (large files are never loaded into memory at once). */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

/** sha256 of a file's bytes, or null when it does not exist (synchronous; used where the journal must not yield). */
export function sha256FileSyncOrNull(path: string): string | null {
  try {
    return sha256(readFileSync(path));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return null;
    throw e;
  }
}

export interface BlobStore {
  readonly dir: string;
  pathFor(hash: string): string;
  /** True when a blob file exists (not verified). */
  has(hash: string): boolean;
  /** Stores the content (idempotent) and returns its sha256. Throws when the written blob cannot be verified. */
  put(data: Buffer): string;
  /** Verified content or null (missing, invalid hash, corrupt). */
  read(hash: string): Buffer | null;
  /** Deletes blobs not in `referenced` whose mtime is older than cutoffMs, plus stale temp files. Returns deleted blobs. */
  prune(referenced: Set<string>, cutoffMs: number): number;
  /**
   * prune() with asynchronous directory reads and stats (the event loop stays responsive on large stores). The check
   * "mtime older than the cutoff" and the unlink of one blob still run back to back, so a blob that put() refreshed
   * meanwhile is never deleted.
   */
  pruneAsync(referenced: Set<string>, cutoffMs: number): Promise<number>;
}

const isBlobName = (name: string) => SHA256_HEX.test(name);
const isTempName = (name: string) => name.startsWith('.') && name.endsWith('.tmp~');
const isSubdirName = (name: string) => /^[a-f0-9]{2}$/.test(name);

export function createBlobStore(dir: string, onCorrupt?: (hash: string) => void): BlobStore {
  const pathFor = (hash: string) => join(dir, hash.slice(0, 2), hash);

  function readVerified(hash: string): Buffer | null {
    if (!SHA256_HEX.test(hash)) return null;
    let buf: Buffer;
    try {
      buf = readFileSync(pathFor(hash));
    } catch {
      return null;
    }
    if (sha256(buf) !== hash) {
      onCorrupt?.(hash);
      return null;
    }
    return buf;
  }

  return {
    dir,
    pathFor,
    has(hash) {
      return SHA256_HEX.test(hash) && existsSync(pathFor(hash));
    },
    put(data) {
      const hash = sha256(data);
      const target = pathFor(hash);
      if (existsSync(target)) {
        if (readVerified(hash)) {
          try {
            const now = new Date();
            utimesSync(target, now, now);
          } catch {
            /* mtime refresh is best effort */
          }
          return hash;
        }
        unlinkWithRetry(target); // corrupt copy: replace it
      }
      atomicWriteFile(target, data);
      if (!readVerified(hash)) {
        throw new NovaError('INTERNAL', 'Die Sicherungskopie einer Datei konnte nicht überprüft werden. Die Datei wurde nicht verändert.', {
          severity: 'blocker',
          details: { hash },
        });
      }
      return hash;
    },
    read: readVerified,
    prune(referenced, cutoffMs) {
      let deleted = 0;
      let subdirs: string[];
      try {
        subdirs = readdirSync(dir);
      } catch {
        return 0;
      }
      for (const sub of subdirs) {
        if (!isSubdirName(sub)) continue;
        const subPath = join(dir, sub);
        let names: string[];
        try {
          names = readdirSync(subPath);
        } catch {
          continue;
        }
        let remaining = names.length;
        for (const name of names) {
          const file = join(subPath, name);
          const isBlob = isBlobName(name);
          if (!isBlob && !isTempName(name)) continue;
          if (isBlob && referenced.has(name)) continue;
          try {
            if (statSync(file).mtimeMs >= cutoffMs) continue;
            unlinkWithRetry(file);
            remaining--;
            if (isBlob) deleted++;
          } catch {
            /* in use or vanished: try again at the next maintenance run */
          }
        }
        if (remaining === 0) {
          try {
            rmdirSync(subPath);
          } catch {
            /* not empty (concurrent put) or locked */
          }
        }
      }
      return deleted;
    },
    async pruneAsync(referenced, cutoffMs) {
      let deleted = 0;
      let subdirs: string[];
      try {
        subdirs = await readdir(dir);
      } catch {
        return 0;
      }
      for (const sub of subdirs) {
        if (!isSubdirName(sub)) continue;
        const subPath = join(dir, sub);
        let names: string[];
        try {
          names = await readdir(subPath);
        } catch {
          continue;
        }
        let remaining = names.length;
        for (const name of names) {
          const file = join(subPath, name);
          const isBlob = isBlobName(name);
          if (!isBlob && !isTempName(name)) continue;
          if (isBlob && referenced.has(name)) continue;
          try {
            // cheap async pre-check; the decisive check runs synchronously right before the unlink
            if ((await stat(file)).mtimeMs >= cutoffMs) continue;
            if (statSync(file).mtimeMs >= cutoffMs) continue;
            unlinkWithRetry(file);
            remaining--;
            if (isBlob) deleted++;
          } catch {
            /* in use or vanished: try again at the next maintenance run */
          }
        }
        if (remaining === 0) {
          try {
            rmdirSync(subPath); // synchronous: cannot interleave with a put() that just checked the folder exists
          } catch {
            /* not empty (concurrent put) or locked */
          }
        }
      }
      return deleted;
    },
  };
}
