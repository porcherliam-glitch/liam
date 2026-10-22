// Builds the `window.nova` API (src/shared/bridge.ts) on top of ipcRenderer. Separated from index.ts so it can be
// tested without Electron.
// Key decisions:
// - Only plain data and functions cross the contextBridge; the IpcRendererEvent (which exposes `sender`) is never
//   handed to the page – listeners receive the payload only.
// - One ipcRenderer listener per channel, fanned out to any number of page listeners; every subscription returns an
//   unsubscribe function. Listener exceptions are isolated (one failing page listener never affects others).
// - invoke() never rejects: IPC failures (handler missing, payload not cloneable) become BridgeRpcResult errors.
// - The last navigation request received before the page subscribed to onNavigate is kept and delivered to the
//   first subscriber (a notification click can arrive while React is still mounting).
// - Unsaved-changes requests (main asks before quitting) go to the most recently registered handler and are always
//   answered, also when no handler exists or it throws (main waits for the answer with a timeout).
import {
  IPC,
  type AutostartSupport,
  type BridgeRpcResult,
  type DaemonConnectionState,
  type FileDialogFilter,
  type LocalBackupFile,
  type NovaBridge,
  type RecoveryResult,
  type UnsavedChangesAction,
  type UnsavedChangesInfo,
  type UnsavedChangesResult,
} from '@shared/bridge';
import type { AnyNovaEvent } from '@shared/events';
import type { RpcMethod, RpcParams } from '@shared/rpc';

/** The subset of Electron's ipcRenderer used here. */
export interface IpcRendererLike {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): unknown;
}

const BRIDGE_ERROR_MESSAGE = 'Die Verbindung zwischen Oberfläche und NOVA-Hauptprozess ist gestört. Bitte NOVA neu starten.';

type Listener<T> = (payload: T) => void;

class Channel<T> {
  private readonly listeners = new Set<Listener<T>>();
  private attached = false;
  private readonly onMessage = (_event: unknown, payload: unknown) => this.dispatch(payload as T);

  constructor(
    private readonly ipc: IpcRendererLike,
    private readonly name: string,
    private readonly validate: (payload: unknown) => boolean = () => true,
  ) {}

  subscribe(listener: unknown): () => void {
    if (typeof listener !== 'function') throw new TypeError('Listener muss eine Funktion sein.');
    const fn = listener as Listener<T>;
    this.listeners.add(fn);
    if (!this.attached) {
      this.ipc.on(this.name, this.onMessage);
      this.attached = true;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.listeners.delete(fn);
      if (this.listeners.size === 0 && this.attached) {
        this.ipc.removeListener(this.name, this.onMessage);
        this.attached = false;
      }
    };
  }

  size(): number {
    return this.listeners.size;
  }

  dispatch(payload: T): void {
    if (!this.validate(payload)) return;
    for (const l of [...this.listeners]) {
      try {
        l(payload);
      } catch (e) {
        // Keep other listeners working; surface the error asynchronously in the page console.
        setTimeout(() => {
          throw e;
        }, 0);
      }
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function sanitizeDialogOptions(o: unknown): { title?: string; defaultPath?: string; filters?: FileDialogFilter[] } | undefined {
  if (!isPlainObject(o)) return undefined;
  const out: { title?: string; defaultPath?: string; filters?: FileDialogFilter[] } = {};
  if (typeof o.title === 'string') out.title = o.title;
  if (typeof o.defaultPath === 'string') out.defaultPath = o.defaultPath;
  if (Array.isArray(o.filters)) {
    out.filters = o.filters
      .filter((f): f is { name: string; extensions: unknown[] } => isPlainObject(f) && typeof f.name === 'string' && Array.isArray(f.extensions))
      .map((f) => ({ name: f.name, extensions: f.extensions.filter((x): x is string => typeof x === 'string') }));
  }
  return out;
}

const UNSAVED_ACTIONS: readonly UnsavedChangesAction[] = ['save', 'discard', 'persist'];

function sanitizeUnsaved(info: unknown): UnsavedChangesInfo {
  if (!isPlainObject(info)) return { count: 0, files: [] };
  const count = typeof info.count === 'number' && Number.isFinite(info.count) ? Math.max(0, Math.floor(info.count)) : 0;
  const files = Array.isArray(info.files) ? info.files.filter((f): f is string => typeof f === 'string').slice(0, 20).map((f) => f.slice(0, 300)) : [];
  return { count, files };
}

export function createNovaBridge(ipc: IpcRendererLike, platform: string): NovaBridge {
  const events = new Channel<AnyNovaEvent>(ipc, IPC.event, (p) => isPlainObject(p) && typeof p.type === 'string');
  const states = new Channel<DaemonConnectionState>(ipc, IPC.daemonState, (p) => isPlainObject(p) && typeof p.state === 'string');

  // Navigation: listen right away so an early request is not lost.
  let pendingNavigation: string | null = null;
  const navigation = new Channel<string>(ipc, IPC.navigate, (p) => typeof p === 'string');
  ipc.on(IPC.navigate, (_event: unknown, path: unknown) => {
    if (typeof path === 'string' && navigation.size() === 0) pendingNavigation = path;
  });

  const call = <T>(channel: string, ...args: unknown[]): Promise<T> => ipc.invoke(channel, ...args) as Promise<T>;

  // Unsaved-changes requests from main (quit confirmation): answered by the latest handler, always answered.
  const unsavedHandlers: Array<(action: UnsavedChangesAction) => Promise<UnsavedChangesResult>> = [];
  ipc.on(IPC.unsavedChangesRequest, (_event: unknown, payload: unknown) => {
    if (!isPlainObject(payload) || typeof payload.id !== 'string' || !UNSAVED_ACTIONS.includes(payload.action as UnsavedChangesAction)) return;
    const id = payload.id;
    const handler = unsavedHandlers.at(-1);
    const reply = (r: UnsavedChangesResult) => {
      void ipc.invoke(IPC.unsavedChangesResult, { id, ok: r.ok === true, failed: Array.isArray(r.failed) ? r.failed.filter((f) => typeof f === 'string').slice(0, 20) : [] }).catch(() => undefined);
    };
    if (!handler) {
      reply({ ok: false, failed: [] });
      return;
    }
    Promise.resolve()
      .then(() => handler(payload.action as UnsavedChangesAction))
      .then((r) => reply(isPlainObject(r) ? (r as UnsavedChangesResult) : { ok: false, failed: [] }))
      .catch(() => reply({ ok: false, failed: [] }));
  });

  const bridge: NovaBridge = {
    async invoke<M extends RpcMethod>(method: M, params?: RpcParams<M>): Promise<BridgeRpcResult> {
      try {
        const res = (await ipc.invoke(IPC.rpc, method, params)) as BridgeRpcResult | undefined;
        if (res && typeof res === 'object' && typeof res.ok === 'boolean') return res;
        return { ok: false, error: { code: 'INTERNAL', message: BRIDGE_ERROR_MESSAGE } };
      } catch (e) {
        return { ok: false, error: { code: 'INTERNAL', message: BRIDGE_ERROR_MESSAGE, details: e instanceof Error ? e.message : String(e) } };
      }
    },
    onEvent: (listener) => events.subscribe(listener),
    daemon: {
      state: () => call<DaemonConnectionState>(IPC.daemonGetState),
      onState: (listener) => states.subscribe(listener),
      restart: () => call<DaemonConnectionState>(IPC.daemonRestart),
      stop: () => call<DaemonConnectionState>(IPC.daemonStop),
      listBackups: () => call<LocalBackupFile[]>(IPC.daemonListBackups),
      restoreBackup: (path) => call<RecoveryResult>(IPC.daemonRestoreBackup, typeof path === 'string' ? path : ''),
      createDiagnostics: () => call<RecoveryResult>(IPC.daemonDiagnostics),
    },
    app: {
      version: () => call<string>(IPC.appVersion),
      platform,
      openExternal: (url) => call<boolean>(IPC.openExternal, typeof url === 'string' ? url : ''),
      openPath: (path) => call<boolean>(IPC.openPath, typeof path === 'string' ? path : ''),
      showInFolder: (path) => call<boolean>(IPC.showInFolder, typeof path === 'string' ? path : ''),
      selectDirectory: (options) => call<string | null>(IPC.selectDirectory, sanitizeDialogOptions(options)),
      selectFile: (options) => call<string | null>(IPC.selectFile, sanitizeDialogOptions(options)),
      saveFile: (options) => call<string | null>(IPC.saveFile, sanitizeDialogOptions(options)),
      getAutostart: () => call<boolean>(IPC.getAutostart),
      setAutostart: (enabled) => call<boolean>(IPC.setAutostart, enabled === true),
      getAutostartSupport: () => call<AutostartSupport>(IPC.getAutostartSupport),
      setUnsavedChanges: async (info) => {
        await call<void>(IPC.setUnsavedChanges, sanitizeUnsaved(info));
      },
      onUnsavedChangesRequest: (handler) => {
        if (typeof handler !== 'function') throw new TypeError('Listener muss eine Funktion sein.');
        unsavedHandlers.push(handler);
        let active = true;
        return () => {
          if (!active) return;
          active = false;
          const i = unsavedHandlers.lastIndexOf(handler);
          if (i >= 0) unsavedHandlers.splice(i, 1);
        };
      },
      quit: async () => {
        await call<void>(IPC.quit);
      },
      onNavigate: (listener) => {
        const off = navigation.subscribe(listener);
        if (pendingNavigation !== null) {
          const path = pendingNavigation;
          pendingNavigation = null;
          setTimeout(() => navigation.dispatch(path), 0);
        }
        return off;
      },
    },
  };
  return bridge;
}
