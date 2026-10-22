// File system locations of the daemon. The data dir can be overridden with --data-dir or NOVA_DATA_DIR
// (tests always use a temporary directory).
// Windows default: %LOCALAPPDATA%\NOVA AI (NOT Roaming: roaming profiles may live on SMB shares where SQLite WAL breaks).
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { NovaError } from './errors';

export const APP_DIR_NAME = 'NOVA AI';

export function defaultDataDir(): string {
  if (process.env.NOVA_DATA_DIR) return process.env.NOVA_DATA_DIR;
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
    return join(local, APP_DIR_NAME);
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', APP_DIR_NAME);
  const xdg = process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share');
  return join(xdg, APP_DIR_NAME);
}

function isUncPath(p: string): boolean {
  return /^[\\/]{2}/.test(p);
}

/**
 * Creates the data dir if needed and returns its canonical form (realpath; used for the instance lock and the
 * endpoint name so "C:\Data\" and "c:\data" are the same daemon). Network paths are refused on Windows.
 */
export function canonicalDataDir(dir: string, platform: NodeJS.Platform = process.platform): string {
  if (platform === 'win32' && isUncPath(dir)) {
    throw new NovaError('VALIDATION', 'Der Datenordner darf nicht auf einem Netzlaufwerk liegen.', { severity: 'critical' });
  }
  mkdirSync(dir, { recursive: true });
  const real = realpathSync.native(dir);
  if (platform === 'win32' && isUncPath(real)) {
    throw new NovaError('VALIDATION', 'Der Datenordner darf nicht auf einem Netzlaufwerk liegen.', { severity: 'critical' });
  }
  return real;
}

/** Key used for hashing (case-insensitive on Windows). */
export function dataDirKey(canonical: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? canonical.toLowerCase() : canonical;
}

export interface DataPaths {
  root: string;
  db: string;
  token: string;
  lock: string;
  /** POSIX fallback instance lock file (Windows uses a named pipe). */
  instanceLock: string;
  /** Fatal error report for Electron main (DaemonCrashReport JSON). */
  crash: string;
  /** Pending database restore ({ backupPath }), applied before the DB is opened. */
  restorePending: string;
  logs: string;
  /** stdout/stderr of the detached daemon process (early failures before the logger exists). */
  startLog: string;
  backups: string;
  snapshots: string; // content-addressed blobs of files before NOVA changed them
  exports: string;
  diagnostics: string;
  runState: string; // large agent conversation states
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    db: join(root, 'nova.db'),
    token: join(root, 'daemon.token'),
    lock: join(root, 'daemon.lock'),
    instanceLock: join(root, 'daemon.instance'),
    crash: join(root, 'crash.json'),
    restorePending: join(root, 'restore-pending.json'),
    logs: join(root, 'logs'),
    startLog: join(root, 'logs', 'daemon-start.log'),
    backups: join(root, 'backups'),
    snapshots: join(root, 'snapshots'),
    exports: join(root, 'exports'),
    diagnostics: join(root, 'diagnostics'),
    runState: join(root, 'run-state'),
  };
}

function shortHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 24);
}

/**
 * Local IPC endpoint. Windows: per-user named pipe derived from the canonical data dir. Others: unix socket inside
 * the data dir. NOVA_DAEMON_ENDPOINT overrides (tests) – the instance lock is never skipped by an override.
 */
export function defaultEndpoint(canonicalRoot: string, platform: NodeJS.Platform = process.platform): string {
  if (process.env.NOVA_DAEMON_ENDPOINT) return process.env.NOVA_DAEMON_ENDPOINT;
  if (platform === 'win32') {
    return `\\\\.\\pipe\\nova-ai-daemon-${shortHash(`${userInfo().username}|${dataDirKey(canonicalRoot, platform)}`)}`;
  }
  return join(canonicalRoot, 'daemon.sock');
}

/** Name of the Windows instance-lock pipe / Linux abstract socket for a data dir. */
export function instanceLockName(canonicalRoot: string, platform: NodeJS.Platform = process.platform): string {
  const h = shortHash(dataDirKey(canonicalRoot, platform));
  if (platform === 'win32') return `\\\\.\\pipe\\nova-ai-instance-${h}`;
  return `\0nova-ai-instance-${h}`; // Linux abstract namespace (kernel frees it when the process dies)
}
