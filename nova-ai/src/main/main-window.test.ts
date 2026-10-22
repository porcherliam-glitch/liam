// MainWindowController against a mocked Electron BrowserWindow: webPreferences, lazy loading, navigation queue,
// navigation/window-open/subframe guards, session-end and close hooks, sender check, bounds persistence.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

const h = vi.hoisted(() => {
  const created: unknown[] = [];
  return { created };
});

vi.mock('electron', async () => {
  const { EventEmitter: EE } = await import('node:events');
  class FakeWebContents extends EE {
    id = 11;
    mainFrame = { processId: 1, routingId: 2, url: 'app://nova/index.html', parent: null };
    windowOpenHandler: ((d: { url: string }) => { action: string }) | null = null;
    sent: Array<[string, unknown]> = [];
    reloads = 0;
    isCrashed() {
      return false;
    }
    setWindowOpenHandler(fn: (d: { url: string }) => { action: string }) {
      this.windowOpenHandler = fn;
    }
    send(channel: string, payload: unknown) {
      this.sent.push([channel, payload]);
    }
    reload() {
      this.reloads++;
    }
  }
  class FakeWindow extends EE {
    options: Record<string, unknown>;
    webContents = new FakeWebContents();
    visible = false;
    minimized = false;
    focused = false;
    maximized = false;
    destroyed = false;
    loaded: string[] = [];
    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      h.created.push(this);
    }
    loadURL(url: string) {
      this.loaded.push(url);
      return Promise.resolve();
    }
    show() {
      this.visible = true;
    }
    hide() {
      this.visible = false;
    }
    maximize() {
      this.maximized = true;
      this.visible = true;
    }
    restore() {
      this.minimized = false;
    }
    focus() {
      this.focused = true;
    }
    isVisible() {
      return this.visible;
    }
    isMinimized() {
      return this.minimized;
    }
    isFocused() {
      return this.focused;
    }
    isMaximized() {
      return this.maximized;
    }
    isFullScreen() {
      return false;
    }
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
    }
    getNormalBounds() {
      return { x: 10, y: 20, width: 1300, height: 800 };
    }
  }
  return {
    BrowserWindow: FakeWindow,
    screen: {
      getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }),
      getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }],
    },
  };
});

import { IPC } from '@shared/bridge';
import { MainWindowController, WINDOW_BACKGROUND } from './main-window';
import { UiStateStore } from './ui-state';
import { createMainLogger } from './log';

interface FakeWin extends EventEmitter {
  options: Record<string, unknown>;
  webContents: EventEmitter & {
    id: number;
    mainFrame: { processId: number; routingId: number; url: string; parent: null };
    windowOpenHandler: ((d: { url: string }) => { action: string }) | null;
    sent: Array<[string, unknown]>;
    reloads: number;
  };
  visible: boolean;
  focused: boolean;
  maximized: boolean;
  minimized: boolean;
  loaded: string[];
}

function setup(over: { saved?: { x: number; y: number; width: number; height: number; maximized: boolean } } = {}) {
  h.created.length = 0;
  const writes: string[] = [];
  const uiState = new UiStateStore({
    file: '/x/ui-state.json',
    read: () => (over.saved ? JSON.stringify({ window: over.saved }) : null),
    write: (_f, d) => writes.push(d),
    writeDelayMs: 0,
  });
  const onCloseRequest = vi.fn(() => 'handled' as const);
  const onSessionEnd = vi.fn();
  const openExternal = vi.fn();
  const ctl = new MainWindowController({
    appUrl: 'app://nova/index.html',
    appOrigin: 'app://nova',
    preload: '/app/out/preload/index.cjs',
    icon: null,
    devTools: false,
    uiState,
    log: createMainLogger({ file: null }),
    onCloseRequest,
    onSessionEnd,
    openExternal,
  });
  ctl.create();
  const win = h.created[0] as FakeWin;
  return { ctl, win, onCloseRequest, onSessionEnd, openExternal, uiState, writes };
}

function navEvent(url: string, isMainFrame = true) {
  return { url, isMainFrame, preventDefault: vi.fn() };
}

describe('MainWindowController', () => {
  beforeEach(() => {
    h.created.length = 0;
  });

  it('creates a hardened, dark, hidden window with the minimum size', () => {
    const { win } = setup();
    expect(win.options).toMatchObject({ width: 1440, height: 900, minWidth: 1100, minHeight: 700, show: false, backgroundColor: WINDOW_BACKGROUND });
    expect(win.options.webPreferences).toMatchObject({
      preload: '/app/out/preload/index.cjs',
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      devTools: false,
    });
    expect(win.loaded).toEqual([]); // lazy: nothing loaded until the first show()
  });

  it('restores saved bounds and maximises on the first show', () => {
    const { ctl, win } = setup({ saved: { x: 50, y: 60, width: 1500, height: 950, maximized: true } });
    expect(win.options).toMatchObject({ x: 50, y: 60, width: 1500, height: 950 });
    ctl.show();
    expect(win.loaded).toEqual(['app://nova/index.html']);
    expect(win.visible).toBe(false);
    win.emit('ready-to-show');
    expect(win.maximized).toBe(true);
    expect(win.visible).toBe(true);
  });

  it('show() loads once, reveals on ready-to-show and later just focuses', () => {
    const { ctl, win } = setup();
    ctl.show();
    ctl.show();
    expect(win.loaded).toHaveLength(1);
    win.emit('ready-to-show');
    expect(win.visible).toBe(true);
    ctl.hide();
    expect(win.visible).toBe(false);
    win.minimized = true;
    ctl.show();
    expect(win.visible).toBe(true);
    expect(win.minimized).toBe(false);
    expect(win.loaded).toHaveLength(1);
  });

  it('navigation is queued until the page has loaded; messages before the first load are dropped, during loading sent', () => {
    const { ctl, win } = setup();
    ctl.send(IPC.event, { x: 1 });
    ctl.navigate('/approvals');
    expect(win.webContents.sent).toEqual([]);
    ctl.send(IPC.daemonState, { state: 'starting' });
    expect(win.webContents.sent).toEqual([[IPC.daemonState, { state: 'starting' }]]);
    win.webContents.sent.length = 0;
    win.webContents.emit('did-finish-load');
    expect(win.webContents.sent).toEqual([[IPC.navigate, '/approvals']]);
    ctl.navigate('/tasks');
    ctl.send(IPC.daemonState, { state: 'connected' });
    expect(win.webContents.sent.slice(1)).toEqual([
      [IPC.navigate, '/tasks'],
      [IPC.daemonState, { state: 'connected' }],
    ]);
    ctl.navigate('https://evil.example');
    expect(win.webContents.sent).toHaveLength(3);
  });

  it('window.open is always denied; valid http(s) URLs go to the browser', () => {
    const { win, openExternal } = setup();
    const handler = win.webContents.windowOpenHandler!;
    expect(handler({ url: 'https://ollama.com/' })).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledWith('https://ollama.com/');
    expect(handler({ url: 'file:///C:/Windows/notepad.exe' })).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenCalledTimes(1);
  });

  it('blocks navigation away from the app and non-loopback subframes', () => {
    const { win } = setup();
    const away = navEvent('https://evil.example/');
    win.webContents.emit('will-navigate', away);
    expect(away.preventDefault).toHaveBeenCalled();
    const inside = navEvent('app://nova/index.html#/projects');
    win.webContents.emit('will-navigate', inside);
    expect(inside.preventDefault).not.toHaveBeenCalled();
    const previewOk = navEvent('http://127.0.0.1:5173/', false);
    win.webContents.emit('will-frame-navigate', previewOk);
    expect(previewOk.preventDefault).not.toHaveBeenCalled();
    const previewBad = navEvent('https://example.com/', false);
    win.webContents.emit('will-frame-navigate', previewBad);
    expect(previewBad.preventDefault).toHaveBeenCalled();
    const redirect = navEvent('https://evil.example/', false);
    win.webContents.emit('will-redirect', redirect);
    expect(redirect.preventDefault).toHaveBeenCalled();
    const webview = { preventDefault: vi.fn() };
    win.webContents.emit('will-attach-webview', webview);
    expect(webview.preventDefault).toHaveBeenCalled();
  });

  it('close and session-end are delegated to main', () => {
    const { win, onCloseRequest, onSessionEnd } = setup();
    const e = { preventDefault: vi.fn() };
    win.emit('close', e);
    expect(onCloseRequest).toHaveBeenCalled();
    expect(e.preventDefault).toHaveBeenCalled();
    onCloseRequest.mockReturnValueOnce('allow' as never);
    const e2 = { preventDefault: vi.fn() };
    win.emit('close', e2);
    expect(e2.preventDefault).not.toHaveBeenCalled();
    win.emit('query-session-end', {});
    win.emit('session-end', {});
    expect(onSessionEnd.mock.calls).toEqual([['query'], ['end']]);
  });

  it('accepts IPC only from the main frame of this window on the app origin', () => {
    const { ctl, win } = setup();
    const main = win.webContents.mainFrame;
    const ev = (frame: unknown, senderId = 11) => ({ sender: { id: senderId }, senderFrame: frame }) as never;
    expect(ctl.isTrustedSender(ev(main))).toBe(true);
    expect(ctl.isTrustedSender(ev({ ...main, url: 'http://127.0.0.1:3000/' }))).toBe(false);
    expect(ctl.isTrustedSender(ev({ processId: 1, routingId: 9, url: 'app://nova/index.html', parent: main }))).toBe(false);
    expect(ctl.isTrustedSender(ev(main, 12))).toBe(false);
    expect(ctl.isTrustedSender(ev(null))).toBe(false);
  });

  it('reloads a crashed renderer at most 3 times per 5 minutes', () => {
    vi.useFakeTimers();
    try {
      const { win } = setup();
      for (let i = 0; i < 5; i++) {
        win.webContents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
        vi.advanceTimersByTime(1100);
      }
      expect(win.webContents.reloads).toBe(3);
      win.webContents.emit('render-process-gone', {}, { reason: 'clean-exit', exitCode: 0 });
      vi.advanceTimersByTime(1100);
      expect(win.webContents.reloads).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('saves the normal bounds after the window was shown', () => {
    const { ctl, win, uiState } = setup();
    ctl.saveBoundsNow();
    expect(uiState.get().window).toBeNull(); // never shown: nothing to remember
    ctl.show();
    win.emit('ready-to-show');
    ctl.saveBoundsNow();
    expect(uiState.get().window).toEqual({ x: 10, y: 20, width: 1300, height: 800, maximized: false });
  });

  it('reports whether the user looks at the window', () => {
    const { ctl, win } = setup();
    expect(ctl.isUserLooking()).toBe(false);
    ctl.show();
    win.emit('ready-to-show');
    expect(ctl.isUserLooking()).toBe(true);
    win.focused = false;
    expect(ctl.isUserLooking()).toBe(false);
    expect(ctl.webContentsId()).toBe(11);
    ctl.destroy();
    expect(ctl.webContentsId()).toBeNull();
  });
});
