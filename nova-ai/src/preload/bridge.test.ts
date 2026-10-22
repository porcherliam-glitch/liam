import { describe, expect, it, vi } from 'vitest';
import { IPC, type NovaBridge } from '@shared/bridge';
import { createNovaBridge, type IpcRendererLike } from './bridge';

class FakeIpc implements IpcRendererLike {
  invoked: Array<{ channel: string; args: unknown[] }> = [];
  listeners = new Map<string, Set<(event: unknown, ...args: unknown[]) => void>>();
  answer: (channel: string, args: unknown[]) => unknown = () => undefined;

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    this.invoked.push({ channel, args });
    return this.answer(channel, args);
  }

  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void) {
    if (!this.listeners.has(channel)) this.listeners.set(channel, new Set());
    this.listeners.get(channel)!.add(listener);
    return this;
  }

  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void) {
    this.listeners.get(channel)?.delete(listener);
    return this;
  }

  emit(channel: string, payload: unknown): void {
    const fakeEvent = { sender: { secret: true } };
    for (const l of [...(this.listeners.get(channel) ?? [])]) l(fakeEvent, payload);
  }

  count(channel: string): number {
    return this.listeners.get(channel)?.size ?? 0;
  }
}

function setup(): { ipc: FakeIpc; nova: NovaBridge } {
  const ipc = new FakeIpc();
  return { ipc, nova: createNovaBridge(ipc, 'win32') };
}

describe('window.nova bridge', () => {
  it('has exactly the shape of NovaBridge', () => {
    const { nova } = setup();
    expect(Object.keys(nova).sort()).toEqual(['app', 'daemon', 'invoke', 'onEvent']);
    expect(Object.keys(nova.daemon).sort()).toEqual(['onState', 'restart', 'state', 'stop']);
    expect(Object.keys(nova.app).sort()).toEqual(
      ['getAutostart', 'onNavigate', 'openExternal', 'openPath', 'platform', 'quit', 'saveFile', 'selectDirectory', 'selectFile', 'setAutostart', 'showInFolder', 'version'].sort(),
    );
    expect(nova.app.platform).toBe('win32');
  });

  it('invoke forwards method + params and never rejects', async () => {
    const { ipc, nova } = setup();
    ipc.answer = () => ({ ok: true, result: { n: 1 } });
    expect(await nova.invoke('daemon.status')).toEqual({ ok: true, result: { n: 1 } });
    expect(ipc.invoked[0]).toEqual({ channel: IPC.rpc, args: ['daemon.status', undefined] });
    ipc.answer = () => {
      throw new Error('No handler registered');
    };
    const failed = await nova.invoke('tasks.get', { id: 'x' });
    expect(failed).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
    ipc.answer = () => 'garbage';
    expect(await nova.invoke('daemon.status')).toMatchObject({ ok: false, error: { code: 'INTERNAL' } });
  });

  it('maps every request to its IPC channel', async () => {
    const { ipc, nova } = setup();
    ipc.answer = (channel) => (channel === IPC.appVersion ? '1.0.0' : channel === IPC.selectDirectory ? 'C:\\x' : true);
    await nova.daemon.state();
    await nova.daemon.restart();
    await nova.daemon.stop();
    expect(await nova.app.version()).toBe('1.0.0');
    await nova.app.openExternal('https://x.y');
    await nova.app.openPath('C:\\Projekte');
    await nova.app.showInFolder('C:\\Projekte\\a.txt');
    expect(await nova.app.selectDirectory({ title: 'T', defaultPath: 'C:\\' })).toBe('C:\\x');
    await nova.app.selectFile({ filters: [{ name: 'JSON', extensions: ['json', 5 as unknown as string] }] });
    await nova.app.saveFile();
    await nova.app.getAutostart();
    await nova.app.setAutostart(true);
    await nova.app.quit();
    expect(ipc.invoked.map((i) => i.channel)).toEqual([
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
    ]);
    expect(ipc.invoked.find((i) => i.channel === IPC.selectFile)?.args).toEqual([{ filters: [{ name: 'JSON', extensions: ['json'] }] }]);
    expect(ipc.invoked.find((i) => i.channel === IPC.saveFile)?.args).toEqual([undefined]);
    expect(ipc.invoked.find((i) => i.channel === IPC.setAutostart)?.args).toEqual([true]);
  });

  it('event listeners get the payload only (never the IPC event) and can unsubscribe', () => {
    const { ipc, nova } = setup();
    const a = vi.fn();
    const b = vi.fn();
    const offA = nova.onEvent(a);
    const offB = nova.onEvent(b);
    expect(ipc.count(IPC.event)).toBe(1);
    const event = { type: 'project.removed', payload: { id: 'p' }, ts: 1, seq: 1 };
    ipc.emit(IPC.event, event);
    expect(a).toHaveBeenCalledWith(event);
    expect(a.mock.calls[0]).toHaveLength(1);
    ipc.emit(IPC.event, 'not an event');
    expect(a).toHaveBeenCalledTimes(1);
    offA();
    offA();
    ipc.emit(IPC.event, event);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
    offB();
    expect(ipc.count(IPC.event)).toBe(0);
  });

  it('a throwing listener does not break the others', () => {
    vi.useFakeTimers();
    try {
      const { ipc, nova } = setup();
      const good = vi.fn();
      nova.daemon.onState(() => {
        throw new Error('page bug');
      });
      nova.daemon.onState(good);
      ipc.emit(IPC.daemonState, { state: 'connected' });
      expect(good).toHaveBeenCalledWith({ state: 'connected' });
      expect(() => vi.runAllTimers()).toThrow('page bug');
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects non-function listeners', () => {
    const { nova } = setup();
    expect(() => nova.onEvent('x' as never)).toThrow(TypeError);
  });

  it('a navigation request that arrives before the page subscribes is delivered to the first subscriber', async () => {
    const { ipc, nova } = setup();
    ipc.emit(IPC.navigate, '/approvals');
    const nav = vi.fn();
    const off = nova.app.onNavigate(nav);
    await new Promise((r) => setTimeout(r, 5));
    expect(nav).toHaveBeenCalledWith('/approvals');
    ipc.emit(IPC.navigate, '/tasks');
    expect(nav).toHaveBeenLastCalledWith('/tasks');
    expect(nav).toHaveBeenCalledTimes(2);
    off();
    const late = vi.fn();
    nova.app.onNavigate(late);
    await new Promise((r) => setTimeout(r, 5));
    expect(late).not.toHaveBeenCalled();
  });
});

describe('preload entry', () => {
  it('exposes the bridge as window.nova through contextBridge', async () => {
    const exposeInMainWorld = vi.fn();
    vi.doMock('electron', () => ({
      contextBridge: { exposeInMainWorld },
      ipcRenderer: { invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() },
    }));
    try {
      await import('./index');
      expect(exposeInMainWorld).toHaveBeenCalledTimes(1);
      const [key, api] = exposeInMainWorld.mock.calls[0] as [string, NovaBridge];
      expect(key).toBe('nova');
      expect(typeof api.invoke).toBe('function');
      expect(api.app.platform).toBe(process.platform);
    } finally {
      vi.doUnmock('electron');
    }
  });
});
