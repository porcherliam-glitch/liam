// Free-space lookup shared by the ResourceMonitor (disk list) and the ConcurrencyGovernor (canWrite).
// Key decisions:
// - fs.statfsSync on the nearest EXISTING ancestor (a project folder, a file that is about to be created or a missing
//   models dir still belong to a drive). Free space = bavail × bsize (what the current user may use).
// - Volume identity: Windows → drive root ("C:\", case-insensitive); POSIX → st_dev of the existing ancestor.
// - Everything is injectable so Windows paths can be tested on Linux (path.win32 for win32).
import { existsSync, statSync, statfsSync } from 'node:fs';
import { posix, win32 } from 'node:path';

export interface StatfsLike {
  bsize: number;
  blocks: number;
  bavail: number;
}

export interface DiskDeps {
  platform: NodeJS.Platform;
  statfs: (p: string) => StatfsLike;
  exists: (p: string) => boolean;
  /** Device id of an existing path (POSIX volume identity); null when unknown. */
  devOf: (p: string) => string | null;
}

export interface DiskStat {
  /** Display path: drive root on Windows, the requested path on POSIX. */
  path: string;
  totalBytes: number;
  freeBytes: number;
  /** Volume identity used for de-duplication and caching. */
  key: string;
}

export const defaultDiskDeps = (platform: NodeJS.Platform): DiskDeps => ({
  platform,
  statfs: (p) => {
    const st = statfsSync(p);
    return { bsize: Number(st.bsize), blocks: Number(st.blocks), bavail: Number(st.bavail) };
  },
  exists: (p) => existsSync(p),
  devOf: (p) => {
    try {
      return String(statSync(p).dev);
    } catch {
      return null;
    }
  },
});

export function pathModule(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix;
}

/** Nearest existing ancestor of p (p itself included); null when nothing exists (e.g. a missing drive). */
export function nearestExisting(p: string, deps: Pick<DiskDeps, 'platform' | 'exists'>): string | null {
  const path = pathModule(deps.platform);
  let cur = path.resolve(p);
  for (let i = 0; i < 256; i++) {
    if (deps.exists(cur)) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}

/** Free/total space of the volume holding p; null when it cannot be determined. */
export function diskUsage(p: string, deps: DiskDeps): DiskStat | null {
  const existing = nearestExisting(p, deps);
  if (!existing) return null;
  let st: StatfsLike;
  try {
    st = deps.statfs(existing);
  } catch {
    return null;
  }
  const bsize = Number(st.bsize);
  if (!Number.isFinite(bsize) || bsize <= 0) return null;
  const totalBytes = Math.max(0, Number(st.blocks) * bsize);
  const freeBytes = Math.max(0, Number(st.bavail) * bsize);
  if (deps.platform === 'win32') {
    const root = win32.parse(existing).root || existing;
    return { path: root, totalBytes, freeBytes, key: root.toLowerCase() };
  }
  const dev = deps.devOf(existing);
  return { path: posix.resolve(p), totalBytes, freeBytes, key: dev ? `dev:${dev}` : existing };
}

export function formatMb(bytes: number): string {
  return `${Math.floor(bytes / (1024 * 1024)).toLocaleString('de-DE')} MB`;
}
