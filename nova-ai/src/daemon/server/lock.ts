// Daemon lock file <dataDir>/daemon.lock: who serves this data dir (diagnostics, Electron main, scripts).
// Key decisions:
// - The lock FILE is informational; single-instance safety comes from the instance lock (core/instance-lock.ts),
//   which app.ts acquires before opening the database (SPEC §6.1).
// - JSON { pid, instanceId, endpoint, startedAt, version }, written atomically after the endpoint is bound and the
//   token file is written. readLock() validates with zod and returns null for missing/corrupt files.
// - removeLock() deletes the file only while it still belongs to the given instance, so a shutting-down daemon never
//   removes the lock of a successor.
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import type { DataPaths } from '../core/paths';
import { atomicWriteFile, unlinkWithRetry } from '../core/fs-atomic';

export const LockInfoSchema = z.object({
  pid: z.number().int().positive(),
  instanceId: z.string().min(1),
  endpoint: z.string().min(1),
  startedAt: z.number(),
  version: z.string(),
});
export type LockInfo = z.infer<typeof LockInfoSchema>;

export function writeLock(paths: Pick<DataPaths, 'lock'>, info: LockInfo): void {
  const valid = LockInfoSchema.parse(info);
  atomicWriteFile(paths.lock, JSON.stringify(valid, null, 2), { mode: 0o600 });
}

export function readLock(paths: Pick<DataPaths, 'lock'>): LockInfo | null {
  let raw: string;
  try {
    raw = readFileSync(paths.lock, 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = LockInfoSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Removes the lock file if it belongs to `instanceId`. Returns true when a file was removed. */
export function removeLock(paths: Pick<DataPaths, 'lock'>, instanceId: string): boolean {
  const current = readLock(paths);
  if (!current || current.instanceId !== instanceId) return false;
  unlinkWithRetry(paths.lock);
  return true;
}
