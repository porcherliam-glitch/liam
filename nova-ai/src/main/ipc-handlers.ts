// IPC handlers of the preload bridge (src/shared/bridge.ts channel names), Electron-free for tests.
// Key decisions:
// - Every handler first checks the sender (main frame of the app window on the app origin, see security.ts).
//   `nova:rpc` answers an untrusted sender with a BridgeRpcResult error (the bridge promises not to reject for
//   daemon errors); every other channel rejects.
// - All renderer input is validated: RPC params with the contract schemas (rpc-bridge.ts), dialog options with zod,
//   URLs with validateExternalUrl, paths with validateLocalPath (absolute, no UNC/device paths on Windows).
// - openExternal: http/https only, at most 10 per 10 s (protects against a page spamming browser tabs).
// - openPath only opens existing DIRECTORIES (files are never executed); showInFolder accepts files and folders.
// - Dialogs are modal to the app window; invalid default paths are dropped instead of failing the dialog.
import { z } from 'zod';
import { IPC, type BridgeRpcResult, type DaemonConnectionState } from '@shared/bridge';
import type { RpcMethod } from '@shared/rpc';
import { handleBridgeRpc } from './rpc-bridge';
import { validateExternalUrl, validateLocalPath } from './security';
import { RestartBudget } from './restart-budget';
import { errorText, type MainLogger } from './log';
import { TEXTS } from './texts';

export interface FileStat {
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface OpenDialogRequest {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties: Array<'openFile' | 'openDirectory' | 'createDirectory' | 'dontAddToRecent' | 'showHiddenFiles'>;
}

export interface SaveDialogRequest {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties: Array<'createDirectory' | 'showOverwriteConfirmation' | 'dontAddToRecent'>;
}

export interface IpcSupervisor {
  rpc(method: RpcMethod, params?: unknown): Promise<unknown>;
  state(): DaemonConnectionState;
  restart(): Promise<DaemonConnectionState>;
  stop(reason?: string): Promise<DaemonConnectionState>;
}

export interface IpcDeps {
  supervisor: IpcSupervisor;
  appVersion: string;
  platform: NodeJS.Platform;
  openExternal(url: string): Promise<void>;
  /** shell.openPath: resolves with an error message, '' on success. */
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
  stat(path: string): Promise<FileStat | null>;
  showOpenDialog(req: OpenDialogRequest): Promise<{ canceled: boolean; filePaths: string[] }>;
  showSaveDialog(req: SaveDialogRequest): Promise<{ canceled: boolean; filePath?: string }>;
  getAutostart(): boolean;
  setAutostart(enabled: boolean): Promise<boolean>;
  requestQuit(): void;
  log: MainLogger;
  now?: () => number;
  /** Sliding window limit for openExternal (default 10 per 10 s). */
  externalLimiter?: RestartBudget;
}

/** Channels handled with ipcMain.handle (renderer → main requests). */
export const INVOKE_CHANNELS = [
  IPC.rpc,
  IPC.daemonGetState,
  IPC.daemonRestart,
  IPC.daemonStop,
  IPC.appVersion,
  IPC.openExternal,
  IPC.openPath,
  IPC.showInFolder,
  IPC.selectDirectory,
  IPC.selectFile,
  IPC.saveFile,
  IPC.getAutostart,
  IPC.setAutostart,
  IPC.quit,
] as const;

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number];
export type IpcHandler = (...args: unknown[]) => Promise<unknown>;

const FilterSchema = z.object({
  name: z.string().min(1).max(100),
  extensions: z
    .array(z.string().regex(/^(\*|[A-Za-z0-9_-]{1,20})$/))
    .min(1)
    .max(50),
});

const DialogOptionsSchema = z
  .object({
    title: z.string().max(200).optional(),
    defaultPath: z.string().max(4096).optional(),
    filters: z.array(FilterSchema).max(20).optional(),
  })
  .optional();

type DialogOptions = z.infer<typeof DialogOptionsSchema>;

function parseDialogOptions(raw: unknown, platform: NodeJS.Platform): { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> } {
  const parsed = DialogOptionsSchema.safeParse(raw ?? undefined);
  const o: DialogOptions = parsed.success ? parsed.data : undefined;
  const out: { title?: string; defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> } = {};
  if (o?.title) out.title = o.title;
  if (o?.defaultPath) {
    const p = validateLocalPath(o.defaultPath, { platform });
    if (p) out.defaultPath = p;
  }
  if (o?.filters && o.filters.length > 0) out.filters = o.filters;
  return out;
}

/** Creates the handler functions (without the sender check; see registerIpcHandlers). */
export function createIpcHandlers(deps: IpcDeps): Record<InvokeChannel, IpcHandler> {
  const now = deps.now ?? (() => Date.now());
  const limiter = deps.externalLimiter ?? new RestartBudget(10, 10_000);
  const localPath = (raw: unknown) => validateLocalPath(raw, { platform: deps.platform });

  return {
    [IPC.rpc]: async (method, params): Promise<BridgeRpcResult> => handleBridgeRpc(method, params, { rpc: (m, p) => deps.supervisor.rpc(m, p) }),
    [IPC.daemonGetState]: async () => deps.supervisor.state(),
    [IPC.daemonRestart]: async () => deps.supervisor.restart(),
    [IPC.daemonStop]: async () => deps.supervisor.stop('ui'),
    [IPC.appVersion]: async () => deps.appVersion,
    [IPC.openExternal]: async (raw) => {
      const url = validateExternalUrl(raw);
      if (!url) {
        deps.log.warn('Externer Link abgelehnt', { url: typeof raw === 'string' ? raw.slice(0, 200) : typeof raw });
        return false;
      }
      if (!limiter.tryConsume(now())) {
        deps.log.warn('Zu viele externe Links in kurzer Zeit – abgelehnt');
        return false;
      }
      try {
        await deps.openExternal(url);
        return true;
      } catch (e) {
        deps.log.warn('Externer Link konnte nicht geöffnet werden', { error: errorText(e) });
        return false;
      }
    },
    [IPC.openPath]: async (raw) => {
      const p = localPath(raw);
      if (!p) return false;
      const st = await deps.stat(p);
      if (!st || !st.isDirectory()) return false; // files are never opened (they could be executed)
      try {
        const err = await deps.openPath(p);
        if (err) deps.log.warn('Ordner konnte nicht geöffnet werden', { error: err });
        return err === '';
      } catch (e) {
        deps.log.warn('Ordner konnte nicht geöffnet werden', { error: errorText(e) });
        return false;
      }
    },
    [IPC.showInFolder]: async (raw) => {
      const p = localPath(raw);
      if (!p) return false;
      const st = await deps.stat(p);
      if (!st || (!st.isDirectory() && !st.isFile())) return false;
      try {
        deps.showItemInFolder(p);
        return true;
      } catch (e) {
        deps.log.warn('Explorer konnte nicht geöffnet werden', { error: errorText(e) });
        return false;
      }
    },
    [IPC.selectDirectory]: async (raw) => {
      const o = parseDialogOptions(raw, deps.platform);
      const r = await deps.showOpenDialog({ title: o.title, defaultPath: o.defaultPath, properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'] });
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
    },
    [IPC.selectFile]: async (raw) => {
      const o = parseDialogOptions(raw, deps.platform);
      const r = await deps.showOpenDialog({ title: o.title, defaultPath: o.defaultPath, filters: o.filters, properties: ['openFile', 'dontAddToRecent'] });
      return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0];
    },
    [IPC.saveFile]: async (raw) => {
      const o = parseDialogOptions(raw, deps.platform);
      const r = await deps.showSaveDialog({
        title: o.title,
        defaultPath: o.defaultPath,
        filters: o.filters,
        properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'],
      });
      return r.canceled || !r.filePath ? null : r.filePath;
    },
    [IPC.getAutostart]: async () => deps.getAutostart(),
    [IPC.setAutostart]: async (enabled) => {
      if (typeof enabled !== 'boolean') return deps.getAutostart();
      return deps.setAutostart(enabled);
    },
    [IPC.quit]: async () => {
      // Answer first, then quit (the renderer's promise should settle before the window goes away).
      setTimeout(() => deps.requestQuit(), 0);
      return undefined;
    },
  };
}

/** Minimal ipcMain surface (Electron's IpcMain satisfies it). */
export interface IpcMainLike {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
  removeHandler(channel: string): void;
}

/** Registers the handlers with the sender check. Returns a function that removes them again. */
export function registerIpcHandlers(
  ipcMain: IpcMainLike,
  handlers: Record<InvokeChannel, IpcHandler>,
  isTrusted: (event: unknown) => boolean,
  log: MainLogger,
): () => void {
  for (const channel of INVOKE_CHANNELS) {
    const handler = handlers[channel];
    ipcMain.handle(channel, async (event, ...args) => {
      if (!isTrusted(event)) {
        log.warn('IPC-Anfrage aus nicht vertrauenswürdigem Fenster abgelehnt', { channel });
        if (channel === IPC.rpc) return { ok: false, error: { code: 'UNAUTHORIZED', message: TEXTS.untrustedSender } } satisfies BridgeRpcResult;
        throw new Error(TEXTS.untrustedSender);
      }
      try {
        return await handler(...args);
      } catch (e) {
        log.error('IPC-Handler fehlgeschlagen', { channel, error: errorText(e) });
        if (channel === IPC.rpc) return { ok: false, error: { code: 'INTERNAL', message: TEXTS.internalBridgeError } } satisfies BridgeRpcResult;
        throw new Error(TEXTS.internalBridgeError);
      }
    });
  }
  return () => {
    for (const channel of INVOKE_CHANNELS) ipcMain.removeHandler(channel);
  };
}
