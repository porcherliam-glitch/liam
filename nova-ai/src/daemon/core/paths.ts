// File system locations of the daemon. The data dir can be overridden with --data-dir or NOVA_DATA_DIR
// (tests always use a temporary directory).
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export const APP_DIR_NAME = 'NOVA AI';

export function defaultDataDir(): string {
  if (process.env.NOVA_DATA_DIR) return process.env.NOVA_DATA_DIR;
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
    return join(appData, APP_DIR_NAME);
  }
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', APP_DIR_NAME);
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(xdg, APP_DIR_NAME);
}

export interface DataPaths {
  root: string;
  db: string;
  token: string;
  lock: string;
  logs: string;
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
    logs: join(root, 'logs'),
    backups: join(root, 'backups'),
    snapshots: join(root, 'snapshots'),
    exports: join(root, 'exports'),
    diagnostics: join(root, 'diagnostics'),
    runState: join(root, 'run-state'),
  };
}

/**
 * Local IPC endpoint. Windows: per-user named pipe. Others: unix socket inside the data dir.
 * NOVA_DAEMON_ENDPOINT overrides (tests).
 */
export function defaultEndpoint(root: string): string {
  if (process.env.NOVA_DAEMON_ENDPOINT) return process.env.NOVA_DAEMON_ENDPOINT;
  if (process.platform === 'win32') {
    const user = createHash('sha256').update(`${userInfo().username}|${root}`).digest('hex').slice(0, 16);
    return `\\\\.\\pipe\\nova-ai-daemon-${user}`;
  }
  return join(root, 'daemon.sock');
}
