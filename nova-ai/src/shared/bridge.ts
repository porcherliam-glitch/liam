// The API the preload script exposes to the renderer as `window.nova` (contextBridge).
// Everything crossing this bridge is plain JSON (no class instances, no functions except listeners).
import type { RpcMethod, RpcParams } from './rpc';
import type { AnyNovaEvent } from './events';

export type DaemonConnectionStateName =
  | 'connecting' // trying to reach an existing daemon
  | 'starting' // daemon process was spawned, waiting for it to answer
  | 'connected'
  | 'reconnecting' // connection lost, retrying
  | 'stopped' // daemon was stopped on purpose
  | 'error'; // could not start/reach the daemon (see message)

export interface DaemonConnectionState {
  state: DaemonConnectionStateName;
  /** German explanation for the UI banner. */
  message: string;
  since: number;
  daemonPid: number | null;
  daemonVersion: string | null;
  endpoint: string;
  /** Automatic restart attempts since the last successful connection. */
  restartAttempts: number;
}

export type BridgeRpcResult =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export interface FileDialogFilter {
  name: string;
  extensions: string[];
}

export interface NovaBridge {
  /** Sends an RPC call to the daemon (validated in main). Never rejects for daemon errors – check `ok`. */
  invoke<M extends RpcMethod>(method: M, params?: RpcParams<M>): Promise<BridgeRpcResult>;
  /** Daemon events forwarded by main. Returns an unsubscribe function. */
  onEvent(listener: (event: AnyNovaEvent) => void): () => void;
  daemon: {
    state(): Promise<DaemonConnectionState>;
    onState(listener: (state: DaemonConnectionState) => void): () => void;
    /** Stops (if running) and starts the daemon again. */
    restart(): Promise<DaemonConnectionState>;
    /** Graceful daemon shutdown (all background work stops). */
    stop(): Promise<DaemonConnectionState>;
  };
  app: {
    version(): Promise<string>;
    platform: string;
    /** Opens http(s) URLs in the default browser. Returns false if the URL was rejected. */
    openExternal(url: string): Promise<boolean>;
    /** Opens an existing FOLDER in Explorer (files are never executed). */
    openPath(path: string): Promise<boolean>;
    /** Shows a file or folder selected in Explorer ("Im Explorer zeigen"). */
    showInFolder(path: string): Promise<boolean>;
    selectDirectory(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
    selectFile(options?: { title?: string; defaultPath?: string; filters?: FileDialogFilter[] }): Promise<string | null>;
    saveFile(options?: { title?: string; defaultPath?: string; filters?: FileDialogFilter[] }): Promise<string | null>;
    getAutostart(): Promise<boolean>;
    setAutostart(enabled: boolean): Promise<boolean>;
    /** Closes the UI. The daemon keeps running if settings.background.keepRunningWhenUiClosed. */
    quit(): Promise<void>;
    /** Main asks the renderer to navigate (e.g. notification click). */
    onNavigate(listener: (path: string) => void): () => void;
  };
}

declare global {
  interface Window {
    nova: NovaBridge;
  }
}

/** IPC channel names (main <-> preload). */
export const IPC = {
  rpc: 'nova:rpc',
  event: 'nova:event',
  daemonState: 'nova:daemon-state',
  daemonGetState: 'nova:daemon-get-state',
  daemonRestart: 'nova:daemon-restart',
  daemonStop: 'nova:daemon-stop',
  appVersion: 'nova:app-version',
  openExternal: 'nova:open-external',
  openPath: 'nova:open-path',
  showInFolder: 'nova:show-in-folder',
  selectDirectory: 'nova:select-directory',
  selectFile: 'nova:select-file',
  saveFile: 'nova:save-file',
  getAutostart: 'nova:get-autostart',
  setAutostart: 'nova:set-autostart',
  quit: 'nova:quit',
  navigate: 'nova:navigate',
} as const;
