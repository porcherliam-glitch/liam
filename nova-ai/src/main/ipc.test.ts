// Tests of the IPC layer: nova:rpc validation/forwarding (rpc-bridge.ts) and the other bridge handlers with the
// sender check (ipc-handlers.ts).
import { describe, expect, it, vi } from 'vitest';
import { IPC, type DaemonConnectionState } from '@shared/bridge';
import { DaemonRpcError } from '../daemon/client';
import { handleBridgeRpc, toBridgeError, validateRpcRequest } from './rpc-bridge';
import { INVOKE_CHANNELS, createIpcHandlers, registerIpcHandlers, type IpcDeps, type IpcMainLike } from './ipc-handlers';
import { createMainLogger } from './log';
import { RestartBudget } from './restart-budget';
import { TEXTS } from './texts';

const log = createMainLogger({ file: null });

describe('nova:rpc', () => {
  it('rejects unknown methods and malformed names', async () => {
    const rpc = vi.fn();
    expect(await handleBridgeRpc('nope.method', {}, { rpc })).toEqual({ ok: false, error: { code: 'NOT_FOUND', message: TEXTS.unknownMethod('nope.method') } });
    expect(await handleBridgeRpc(42, {}, { rpc })).toEqual({ ok: false, error: { code: 'VALIDATION', message: TEXTS.invalidMethod } });
    expect(await handleBridgeRpc('__proto__', {}, { rpc })).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('validates params with the contract and reports German issues', async () => {
    const rpc = vi.fn();
    const res = await handleBridgeRpc('tasks.get', { id: 5 }, { rpc });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('VALIDATION');
    expect(res.error.message.startsWith(TEXTS.invalidParamsPrefix)).toBe(true);
    expect(res.error.message).toContain('id');
    expect(res.error.details).toMatchObject({ issues: [{ path: 'id' }] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('forwards the ORIGINAL params (defaults are applied by the daemon only)', async () => {
    const rpc = vi.fn(async () => ({ entries: [] }));
    const params = { limit: 10 };
    const res = await handleBridgeRpc('daemon.logs', params, { rpc });
    expect(res).toEqual({ ok: true, result: { entries: [] } });
    expect(rpc).toHaveBeenCalledWith('daemon.logs', params);
    expect((rpc.mock.calls[0] as unknown[])[1]).toBe(params);
    await handleBridgeRpc('daemon.status', null, { rpc });
    expect(rpc).toHaveBeenLastCalledWith('daemon.status', undefined);
  });

  it('maps daemon errors (incl. NovaErrorInfo) and unknown errors to plain objects', async () => {
    const info = { id: 'err_1', code: 'BUDGET_EXCEEDED' };
    const daemonErr = new DaemonRpcError('BUDGET_EXCEEDED', 'Budget erreicht.', { details: { limit: 5 }, error: info });
    expect(await handleBridgeRpc('daemon.status', undefined, { rpc: async () => Promise.reject(daemonErr) })).toEqual({
      ok: false,
      error: { code: 'BUDGET_EXCEEDED', message: 'Budget erreicht.', details: { limit: 5 }, error: info },
    });
    expect(toBridgeError(new Error('boom'))).toEqual({ ok: false, error: { code: 'INTERNAL', message: TEXTS.internalBridgeError, details: 'boom' } });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const r = toBridgeError({ code: 'X', message: 'y', details: circular });
    expect(r).toMatchObject({ ok: false, error: { code: 'X', message: 'y' } });
    expect(() => structuredClone(r)).not.toThrow();
  });

  it('validateRpcRequest accepts valid requests', () => {
    expect(validateRpcRequest('work.status', undefined)).toBeNull();
    expect(validateRpcRequest('settings.update', { background: { keepRunningWhenUiClosed: false } })).toBeNull();
  });
});

function makeDeps(over: Partial<IpcDeps> = {}) {
  const state: DaemonConnectionState = { state: 'connected', message: 'ok', since: 1, daemonPid: 1, daemonVersion: '1', endpoint: 'e', restartAttempts: 0 };
  const deps: IpcDeps = {
    supervisor: {
      rpc: vi.fn(async () => ({ ok: true })),
      state: () => state,
      restart: vi.fn(async () => ({ ...state, message: 'neu' })),
      stop: vi.fn(async () => ({ ...state, state: 'stopped' as const })),
    },
    appVersion: '1.2.3',
    platform: 'linux',
    openExternal: vi.fn(async () => undefined),
    openPath: vi.fn(async () => ''),
    showItemInFolder: vi.fn(),
    stat: vi.fn(async (p: string) =>
      p === '/home/ana/projekt' ? { isDirectory: () => true, isFile: () => false } : p === '/home/ana/projekt/a.txt' ? { isDirectory: () => false, isFile: () => true } : null,
    ),
    showOpenDialog: vi.fn(async () => ({ canceled: false, filePaths: ['/home/ana/gewählt'] })),
    showSaveDialog: vi.fn(async () => ({ canceled: false, filePath: '/home/ana/export.json' })),
    getAutostart: vi.fn(() => false),
    setAutostart: vi.fn(async (v: boolean) => v),
    requestQuit: vi.fn(),
    log,
    ...over,
  };
  return { deps, handlers: createIpcHandlers(deps), state };
}

describe('bridge handlers', () => {
  it('covers every invoke channel of the bridge', () => {
    const { handlers } = makeDeps();
    expect(Object.keys(handlers).sort()).toEqual([...INVOKE_CHANNELS].sort());
    const all = Object.values(IPC).filter((c) => c !== IPC.event && c !== IPC.daemonState && c !== IPC.navigate);
    expect([...INVOKE_CHANNELS].sort()).toEqual(all.sort());
  });

  it('daemon state/restart/stop and version', async () => {
    const { deps, handlers, state } = makeDeps();
    expect(await handlers[IPC.daemonGetState]()).toEqual(state);
    expect(await handlers[IPC.daemonRestart]()).toMatchObject({ message: 'neu' });
    expect(await handlers[IPC.daemonStop]()).toMatchObject({ state: 'stopped' });
    expect(deps.supervisor.stop).toHaveBeenCalledWith('ui');
    expect(await handlers[IPC.appVersion]()).toBe('1.2.3');
  });

  it('openExternal: http(s) only, rate limited', async () => {
    const { deps, handlers } = makeDeps({ externalLimiter: new RestartBudget(2, 10_000), now: () => 0 });
    expect(await handlers[IPC.openExternal]('file:///etc/passwd')).toBe(false);
    expect(await handlers[IPC.openExternal]('javascript:alert(1)')).toBe(false);
    expect(await handlers[IPC.openExternal]('https://ollama.com')).toBe(true);
    expect(deps.openExternal).toHaveBeenCalledWith('https://ollama.com/');
    expect(await handlers[IPC.openExternal]('https://ollama.com/a')).toBe(true);
    expect(await handlers[IPC.openExternal]('https://ollama.com/b')).toBe(false);
    expect(deps.openExternal).toHaveBeenCalledTimes(2);
  });

  it('openExternal reports failures as false', async () => {
    const { handlers } = makeDeps({ openExternal: async () => Promise.reject(new Error('kein Browser')) });
    expect(await handlers[IPC.openExternal]('https://example.com')).toBe(false);
  });

  it('openPath: existing directories only (files are never opened)', async () => {
    const { deps, handlers } = makeDeps();
    expect(await handlers[IPC.openPath]('/home/ana/projekt')).toBe(true);
    expect(deps.openPath).toHaveBeenCalledWith('/home/ana/projekt');
    expect(await handlers[IPC.openPath]('/home/ana/projekt/a.txt')).toBe(false);
    expect(await handlers[IPC.openPath]('/missing')).toBe(false);
    expect(await handlers[IPC.openPath]('relative/path')).toBe(false);
    expect(await handlers[IPC.openPath](null)).toBe(false);
    expect(deps.openPath).toHaveBeenCalledTimes(1);
    const failing = makeDeps({ openPath: async () => 'Zugriff verweigert' });
    expect(await failing.handlers[IPC.openPath]('/home/ana/projekt')).toBe(false);
  });

  it('openPath on Windows refuses UNC paths before touching the file system', async () => {
    const stat = vi.fn(async () => ({ isDirectory: () => true, isFile: () => false }));
    const { handlers } = makeDeps({ platform: 'win32', stat });
    expect(await handlers[IPC.openPath]('\\\\server\\share')).toBe(false);
    expect(stat).not.toHaveBeenCalled();
    expect(await handlers[IPC.openPath]('C:\\Users\\Ana')).toBe(true);
  });

  it('showInFolder accepts files and folders', async () => {
    const { deps, handlers } = makeDeps();
    expect(await handlers[IPC.showInFolder]('/home/ana/projekt/a.txt')).toBe(true);
    expect(await handlers[IPC.showInFolder]('/home/ana/projekt')).toBe(true);
    expect(await handlers[IPC.showInFolder]('/missing')).toBe(false);
    expect(deps.showItemInFolder).toHaveBeenCalledTimes(2);
  });

  it('dialogs: validated options, modal results, cancel → null', async () => {
    const { deps, handlers } = makeDeps();
    expect(await handlers[IPC.selectDirectory]({ title: 'Ordner', defaultPath: '/home/ana', extra: 'x' })).toBe('/home/ana/gewählt');
    expect(deps.showOpenDialog).toHaveBeenLastCalledWith({ title: 'Ordner', defaultPath: '/home/ana', properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'] });
    await handlers[IPC.selectFile]({ defaultPath: 'relativ', filters: [{ name: 'JSON', extensions: ['json'] }] });
    expect(deps.showOpenDialog).toHaveBeenLastCalledWith({ title: undefined, defaultPath: undefined, filters: [{ name: 'JSON', extensions: ['json'] }], properties: ['openFile', 'dontAddToRecent'] });
    await handlers[IPC.selectFile]({ filters: [{ name: 'Böse', extensions: ['../x'] }] });
    expect(deps.showOpenDialog).toHaveBeenLastCalledWith(expect.objectContaining({ filters: undefined }));
    expect(await handlers[IPC.saveFile]({ title: 'Export' })).toBe('/home/ana/export.json');
    expect(deps.showSaveDialog).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Export', properties: ['createDirectory', 'showOverwriteConfirmation', 'dontAddToRecent'] }));
    const canceled = makeDeps({ showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) });
    expect(await canceled.handlers[IPC.selectDirectory](undefined)).toBeNull();
    expect(await canceled.handlers[IPC.saveFile](undefined)).toBeNull();
  });

  it('autostart and quit', async () => {
    vi.useFakeTimers();
    try {
      const { deps, handlers } = makeDeps();
      expect(await handlers[IPC.getAutostart]()).toBe(false);
      expect(await handlers[IPC.setAutostart](true)).toBe(true);
      expect(deps.setAutostart).toHaveBeenCalledWith(true);
      expect(await handlers[IPC.setAutostart]('ja')).toBe(false);
      expect(deps.setAutostart).toHaveBeenCalledTimes(1);
      expect(await handlers[IPC.quit]()).toBeUndefined();
      expect(deps.requestQuit).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(deps.requestQuit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('registerIpcHandlers', () => {
  function fakeIpcMain() {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const ipc: IpcMainLike = {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
      removeHandler: (channel) => {
        handlers.delete(channel);
      },
    };
    return { ipc, handlers };
  }

  it('checks the sender on every channel', async () => {
    const { ipc, handlers } = fakeIpcMain();
    const { handlers: h } = makeDeps();
    const trusted = { ok: true };
    const off = registerIpcHandlers(ipc, h, (e) => e === trusted, log);
    expect(handlers.size).toBe(INVOKE_CHANNELS.length);
    expect(await handlers.get(IPC.appVersion)!(trusted)).toBe('1.2.3');
    await expect(Promise.resolve(handlers.get(IPC.appVersion)!({ evil: true }))).rejects.toThrow(TEXTS.untrustedSender);
    expect(await handlers.get(IPC.rpc)!({ evil: true }, 'daemon.status')).toEqual({ ok: false, error: { code: 'UNAUTHORIZED', message: TEXTS.untrustedSender } });
    off();
    expect(handlers.size).toBe(0);
  });

  it('turns handler crashes into safe answers', async () => {
    const { ipc, handlers } = fakeIpcMain();
    const { handlers: h } = makeDeps();
    h[IPC.rpc] = async () => {
      throw new Error('kaputt');
    };
    h[IPC.appVersion] = async () => {
      throw new Error('kaputt');
    };
    registerIpcHandlers(ipc, h, () => true, log);
    expect(await handlers.get(IPC.rpc)!({}, 'daemon.status')).toEqual({ ok: false, error: { code: 'INTERNAL', message: TEXTS.internalBridgeError } });
    await expect(Promise.resolve(handlers.get(IPC.appVersion)!({}))).rejects.toThrow(TEXTS.internalBridgeError);
  });
});
