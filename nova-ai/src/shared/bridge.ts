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
  /**
   * Recovery actions main can run itself while the daemon cannot start (from a fresh crash report, e.g. a damaged
   * database): 'restore_backup' = daemon.listBackups/restoreBackup, 'create_diagnostics' = daemon.createDiagnostics.
   */
  recovery?: DaemonRecoveryAction[];
}

export type DaemonRecoveryAction = 'restore_backup' | 'create_diagnostics';

/** A database backup in <dataDir>/backups that main can restore while the daemon cannot start. */
export interface LocalBackupFile {
  path: string;
  /** File name, e.g. nova-2026-10-22T03-00-00-000Z-taeglich.db */
  name: string;
  sizeBytes: number;
  /** Last modification time (ms). */
  createdAt: number;
}

/** Result of a recovery action run by main (German message for a toast). */
export interface RecoveryResult {
  ok: boolean;
  message: string;
  /** Created file (diagnostics bundle). */
  path?: string | null;
}

/** Why "Mit Windows starten" cannot be used (null = available). */
export type AutostartUnavailableReason = 'not-installed' | 'platform';

export interface AutostartSupport {
  supported: boolean;
  reason: AutostartUnavailableReason | null;
}

/** Unsaved editor changes (studio drafts) the renderer reports to main for the quit confirmation. */
export interface UnsavedChangesInfo {
  count: number;
  /** Display names ("Projekt › src/app.ts"), at most 20. */
  files: string[];
}

/**
 * What main asks the renderer to do with unsaved editor changes before the UI quits:
 * save = save all, discard = drop them, persist = keep a recovery copy (quit without asking: Windows shutdown, setup).
 */
export type UnsavedChangesAction = 'save' | 'discard' | 'persist';

export interface UnsavedChangesResult {
  ok: boolean;
  /** Display names of files that could not be saved (action 'save'). */
  failed: string[];
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
    /** Database backups on disk, newest first (recovery while the daemon cannot start). */
    listBackups(): Promise<LocalBackupFile[]>;
    /** Checks a backup from listBackups, queues it for the next daemon start and restarts the daemon. */
    restoreBackup(path: string): Promise<RecoveryResult>;
    /** Diagnostics bundle without the daemon (log files, crash report); shows it in Explorer. */
    createDiagnostics(): Promise<RecoveryResult>;
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
    /** Whether autostart can be used at all (not in a start without installation, see NOVA-STARTEN.cmd). */
    getAutostartSupport(): Promise<AutostartSupport>;
    /** Reports unsaved editor changes; main asks before quitting while count > 0. */
    setUnsavedChanges(info: UnsavedChangesInfo): Promise<void>;
    /** Handles main's request to save/discard/persist unsaved changes before quitting. Returns an unsubscribe function. */
    onUnsavedChangesRequest(handler: (action: UnsavedChangesAction) => Promise<UnsavedChangesResult>): () => void;
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
  getAutostartSupport: 'nova:get-autostart-support',
  quit: 'nova:quit',
  navigate: 'nova:navigate',
  daemonListBackups: 'nova:daemon-list-backups',
  daemonRestoreBackup: 'nova:daemon-restore-backup',
  daemonDiagnostics: 'nova:daemon-diagnostics',
  /** renderer → main: current unsaved editor changes (UnsavedChangesInfo). */
  setUnsavedChanges: 'nova:set-unsaved-changes',
  /** main → renderer: { id, action: UnsavedChangesAction }. */
  unsavedChangesRequest: 'nova:unsaved-changes-request',
  /** renderer → main: { id, ...UnsavedChangesResult } answering unsavedChangesRequest. */
  unsavedChangesResult: 'nova:unsaved-changes-result',
} as const;
