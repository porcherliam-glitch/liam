// Single-instance lock per data directory, acquired BEFORE the database is opened.
// Windows: a dedicated named pipe – the first pipe instance is exclusive and the kernel frees it when the process dies.
// Linux: an abstract unix socket (same semantics). macOS/other: exclusive lock file with a stale-pid check.
import { createServer, type Server } from 'node:net';
import { openSync, closeSync, writeSync, readFileSync, unlinkSync, existsSync } from 'node:fs';
import { instanceLockName } from './paths';

export interface InstanceLock {
  release(): Promise<void>;
}

function listenExclusive(name: string): Promise<Server | null> {
  return new Promise((resolve, reject) => {
    const server = createServer((socket) => socket.destroy());
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') resolve(null);
      else reject(err);
    });
    server.listen(name, () => resolve(server));
  });
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Returns the lock, or null when another daemon holds it. */
export async function acquireInstanceLock(canonicalRoot: string, lockFile: string, platform: NodeJS.Platform = process.platform): Promise<InstanceLock | null> {
  if (platform === 'win32' || platform === 'linux') {
    const server = await listenExclusive(instanceLockName(canonicalRoot, platform));
    if (!server) return null;
    server.unref();
    return { release: () => new Promise<void>((r) => server.close(() => r())) };
  }
  // Fallback: exclusive file with pid; a lock of a dead pid is stale.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockFile, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return {
        release: async () => {
          try {
            unlinkSync(lockFile);
          } catch {
            /* already gone */
          }
        },
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      let pid = 0;
      try {
        pid = Number(JSON.parse(readFileSync(lockFile, 'utf8')).pid) || 0;
      } catch {
        /* corrupt → treat as stale */
      }
      if (pid && pidAlive(pid)) return null;
      if (existsSync(lockFile)) unlinkSync(lockFile);
    }
  }
  return null;
}
