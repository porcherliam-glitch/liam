// Tests of the small pure modules of the main process: CLI parsing, restart budget, start log, app paths, quit
// policy, ui-state, background settings cache and autostart.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseCliArgs } from './cli';
import { RestartBudget } from './restart-budget';
import { closeQuietly, prepareStartLog, readStartLogSince, trimStartLog } from './start-log';
import { resolveAppPaths } from './app-paths';
import { decideCloseAction, decideDaemonShutdown, mergeQuitMode } from './quit-policy';
import { DEFAULT_UI_STATE, MIN_WINDOW_SIZE, UiStateStore, initialWindowBounds, parseUiState } from './ui-state';
import { BackgroundSettingsCache, DEFAULT_BACKGROUND, backgroundFromSettings } from './background-settings';
import { AUTOSTART_ARGS, AUTOSTART_NAME, AutostartManager, type LoginItemApi } from './autostart';
import { createMainLogger, errorText } from './log';

describe('parseCliArgs', () => {
  it('reads --hidden, --stop-daemon and --data-dir in both forms, ignores Chromium switches', () => {
    expect(parseCliArgs(['NOVA AI.exe', '--hidden'])).toEqual({ hidden: true, stopDaemon: false, dataDir: null });
    expect(parseCliArgs(['electron', '.', '--no-sandbox', '--stop-daemon', '--data-dir', 'D:\\Daten'])).toEqual({ hidden: false, stopDaemon: true, dataDir: 'D:\\Daten' });
    expect(parseCliArgs(['x', '--data-dir=/tmp/nova'])).toMatchObject({ dataDir: '/tmp/nova' });
    expect(parseCliArgs(['x', '--data-dir', '--hidden'])).toMatchObject({ dataDir: null, hidden: true });
    expect(parseCliArgs(['x', '--data-dir='])).toMatchObject({ dataDir: null });
  });
});

describe('RestartBudget', () => {
  it('allows max attempts per sliding window', () => {
    const b = new RestartBudget(3, 1000);
    expect(b.tryConsume(0)).toBe(true);
    expect(b.tryConsume(100)).toBe(true);
    expect(b.tryConsume(200)).toBe(true);
    expect(b.tryConsume(300)).toBe(false);
    expect(b.remaining(300)).toBe(0);
    expect(b.tryConsume(1000)).toBe(true); // the first attempt left the window
    b.reset();
    expect(b.remaining(1000)).toBe(3);
  });
});

describe('start log', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nova-startlog-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('trims to the tail at a line boundary', () => {
    const f = join(dir, 'daemon-start.log');
    writeFileSync(f, Array.from({ length: 200 }, (_, i) => `zeile ${i}`).join('\n'));
    trimStartLog(f, 100);
    const text = readFileSync(f, 'utf8');
    expect(text.length).toBeLessThanOrEqual(100);
    expect(text.startsWith('zeile')).toBe(true);
    expect(text.endsWith('zeile 199')).toBe(true);
    trimStartLog(join(dir, 'missing.log'), 100); // no throw
  });

  it('prepares a header, keeps it below the limit and reads only the new, redacted output', () => {
    const f = join(dir, 'logs', 'daemon-start.log');
    const first = prepareStartLog(f, 'Start 1', 2000);
    expect(first).not.toBeNull();
    closeQuietly(first!.fd);
    appendFileSync(f, 'alte Ausgabe\n');
    const second = prepareStartLog(f, 'Start 2', 2000)!;
    closeQuietly(second.fd);
    expect(readStartLogSince(f, second.offset)).toBe('');
    appendFileSync(f, 'Error: kaputt\n  key sk-ant-abcdefghijklmnopqrstuvwxyz\n');
    const tail = readStartLogSince(f, second.offset);
    expect(tail).toContain('Error: kaputt');
    expect(tail).not.toContain('alte Ausgabe');
    expect(tail).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz');
    expect(tail).toContain(' | ');
    appendFileSync(f, 'x'.repeat(5000));
    prepareStartLog(f, 'Start 3', 2000);
    expect(readFileSync(f).length).toBeLessThan(2000);
    expect(readStartLogSince(join(dir, 'nope.log'), 0)).toBe('');
  });
});

describe('resolveAppPaths', () => {
  it('development layout', () => {
    expect(resolveAppPaths({ appPath: '/repo', resourcesPath: '/repo/node_modules/electron/dist/resources', isPackaged: false, platform: 'linux' })).toEqual({
      daemonEntry: '/repo/out/daemon/index.cjs',
      rendererRoot: '/repo/out/renderer',
      preload: '/repo/out/preload/index.cjs',
      trayIcon: '/repo/build/icon.png',
      windowIcon: '/repo/build/icon.png',
    });
  });

  it('packaged Windows layout uses app.asar.unpacked for the daemon and extraResources icons', () => {
    const p = resolveAppPaths({ appPath: 'C:\\Programme\\NOVA AI\\resources\\app.asar', resourcesPath: 'C:\\Programme\\NOVA AI\\resources', isPackaged: true, platform: 'win32' });
    expect(p.daemonEntry).toBe('C:\\Programme\\NOVA AI\\resources\\app.asar.unpacked\\out\\daemon\\index.cjs');
    expect(p.rendererRoot).toBe('C:\\Programme\\NOVA AI\\resources\\app.asar\\out\\renderer');
    expect(p.preload).toBe('C:\\Programme\\NOVA AI\\resources\\app.asar\\out\\preload\\index.cjs');
    expect(p.trayIcon).toBe('C:\\Programme\\NOVA AI\\resources\\icon.ico');
    expect(p.windowIcon).toBe('C:\\Programme\\NOVA AI\\resources\\icon.png');
  });
});

describe('quit policy', () => {
  it('close button', () => {
    expect(decideCloseAction({ quitting: true, closeToTray: true, trayAvailable: true })).toBe('allow');
    expect(decideCloseAction({ quitting: false, closeToTray: true, trayAvailable: true })).toBe('hide');
    expect(decideCloseAction({ quitting: false, closeToTray: true, trayAvailable: false })).toBe('quit');
    expect(decideCloseAction({ quitting: false, closeToTray: false, trayAvailable: true })).toBe('quit');
  });

  it('daemon shutdown on quit', () => {
    expect(decideDaemonShutdown('ui', true)).toEqual({ shutdown: false, reason: 'ui-closed' });
    expect(decideDaemonShutdown('ui', false)).toEqual({ shutdown: true, reason: 'ui-closed' });
    expect(decideDaemonShutdown('all', true)).toEqual({ shutdown: true, reason: 'ui-quit-all' });
    expect(decideDaemonShutdown('os-shutdown', true)).toEqual({ shutdown: true, reason: 'os-shutdown' });
    expect(decideDaemonShutdown('installer', true)).toEqual({ shutdown: true, reason: 'installer' });
  });

  it('stronger quit modes win', () => {
    expect(mergeQuitMode(null, 'ui')).toBe('ui');
    expect(mergeQuitMode('ui', 'all')).toBe('all');
    expect(mergeQuitMode('all', 'ui')).toBe('all');
    expect(mergeQuitMode('all', 'os-shutdown')).toBe('os-shutdown');
  });
});

describe('ui-state', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1040 };
  const second = { x: 1920, y: 0, width: 2560, height: 1400 };

  it('parses defensively', () => {
    expect(parseUiState(null)).toEqual(DEFAULT_UI_STATE);
    expect(parseUiState('{kaputt')).toEqual(DEFAULT_UI_STATE);
    expect(parseUiState('[1,2]')).toEqual(DEFAULT_UI_STATE);
    expect(parseUiState(JSON.stringify({ window: { width: 'x' }, closeToTrayHintShown: 'ja', background: { closeToTray: true } }))).toEqual(DEFAULT_UI_STATE);
    expect(
      parseUiState(JSON.stringify({ window: { x: 10.4, y: 20, width: 1500, height: 950, maximized: true }, closeToTrayHintShown: true, background: { keepRunningWhenUiClosed: false, closeToTray: true } })),
    ).toEqual({
      window: { x: 10, y: 20, width: 1500, height: 950, maximized: true },
      closeToTrayHintShown: true,
      background: { keepRunningWhenUiClosed: false, closeToTray: true, autostart: false },
    });
  });

  it('defaults to 1440×900 centred, clamped to small screens but not below the minimum', () => {
    expect(initialWindowBounds(null, [primary])).toEqual({ width: 1440, height: 900, maximized: false });
    expect(initialWindowBounds(null, [{ x: 0, y: 0, width: 1366, height: 728 }])).toEqual({ width: 1366, height: 728, maximized: false });
    expect(initialWindowBounds(null, [{ x: 0, y: 0, width: 1024, height: 600 }])).toEqual({ width: MIN_WINDOW_SIZE.width, height: MIN_WINDOW_SIZE.height, maximized: false });
    expect(initialWindowBounds(null, [])).toEqual({ width: 1440, height: 900, maximized: false });
  });

  it('restores a saved position on a connected display', () => {
    expect(initialWindowBounds({ x: 2000, y: 100, width: 1600, height: 1000, maximized: true }, [primary, second])).toEqual({ x: 2000, y: 100, width: 1600, height: 1000, maximized: true });
  });

  it('drops the position of a window on a display that is gone and clamps sizes', () => {
    expect(initialWindowBounds({ x: 3000, y: 100, width: 1600, height: 1000, maximized: false }, [primary])).toEqual({ width: 1600, height: 1000, maximized: false });
    expect(initialWindowBounds({ x: 10, y: 10, width: 400, height: 300, maximized: false }, [primary])).toEqual({ x: 10, y: 10, width: MIN_WINDOW_SIZE.width, height: MIN_WINDOW_SIZE.height, maximized: false });
    expect(initialWindowBounds({ x: 0, y: 0, width: 5000, height: 4000, maximized: false }, [primary])).toEqual({ x: 0, y: 0, width: 1920, height: 1040, maximized: false });
    expect(initialWindowBounds({ x: null, y: null, width: 1500, height: 900, maximized: false }, [primary])).toEqual({ width: 1500, height: 900, maximized: false });
  });

  it('keeps the title bar reachable (negative y is moved into the work area)', () => {
    const b = initialWindowBounds({ x: 100, y: -5, width: 1500, height: 900, maximized: false }, [primary]);
    expect(b.y).toBe(0);
  });

  describe('UiStateStore', () => {
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'nova-uistate-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('loads, coalesces writes and flushes atomically', () => {
      vi.useFakeTimers();
      try {
        const file = join(dir, 'ui-state.json');
        const store = new UiStateStore({ file, writeDelayMs: 500 });
        expect(store.get()).toEqual(DEFAULT_UI_STATE);
        store.update({ closeToTrayHintShown: true });
        store.update({ window: { x: 1, y: 2, width: 1200, height: 800, maximized: false } });
        expect(existsSync(file)).toBe(false);
        vi.advanceTimersByTime(600);
        const saved = JSON.parse(readFileSync(file, 'utf8')) as unknown;
        expect(saved).toEqual({ window: { x: 1, y: 2, width: 1200, height: 800, maximized: false }, closeToTrayHintShown: true, background: null });
        store.update({ background: { keepRunningWhenUiClosed: false, closeToTray: false, autostart: true } });
        store.flush();
        expect(new UiStateStore({ file }).get().background).toEqual({ keepRunningWhenUiClosed: false, closeToTray: false, autostart: true });
      } finally {
        vi.useRealTimers();
      }
    });

    it('reports write errors instead of throwing', () => {
      const onError = vi.fn();
      const store = new UiStateStore({
        file: join(dir, 'x.json'),
        write: () => {
          throw new Error('voll');
        },
        onError,
      });
      store.update({ closeToTrayHintShown: true });
      store.flush();
      expect(onError).toHaveBeenCalledTimes(1);
      store.flush(); // nothing pending
      expect(onError).toHaveBeenCalledTimes(1);
    });
  });
});

describe('BackgroundSettingsCache', () => {
  it('extracts the background section with schema defaults', () => {
    expect(backgroundFromSettings({ background: {} })).toEqual(DEFAULT_BACKGROUND);
    expect(backgroundFromSettings({ background: { keepRunningWhenUiClosed: false } })).toMatchObject({ keepRunningWhenUiClosed: false, closeToTray: true });
    expect(backgroundFromSettings({ background: { closeToTray: 'ja' } })).toBeNull();
    expect(backgroundFromSettings(null)).toBeNull();
  });

  it('uses persisted values until the daemon answers, persists and notifies changes', () => {
    const persist = vi.fn();
    const onChange = vi.fn();
    const cache = new BackgroundSettingsCache({ initial: { keepRunningWhenUiClosed: false, closeToTray: false, autostart: false }, persist, onChange });
    expect(cache.get().keepRunningWhenUiClosed).toBe(false);
    expect(cache.fresh()).toBe(false);
    expect(cache.apply({ background: { keepRunningWhenUiClosed: true, closeToTray: true, autostart: true } })).toBe(true);
    expect(cache.fresh()).toBe(true);
    expect(persist).toHaveBeenCalledWith({ keepRunningWhenUiClosed: true, closeToTray: true, autostart: true });
    expect(onChange).toHaveBeenLastCalledWith({ keepRunningWhenUiClosed: true, closeToTray: true, autostart: true }, { keepRunningWhenUiClosed: false, closeToTray: false, autostart: false }, true);
    cache.apply({ background: { keepRunningWhenUiClosed: true, closeToTray: true, autostart: true } });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(cache.apply({ nope: 1 })).toBe(false);
    expect(new BackgroundSettingsCache({ initial: null, persist }).get()).toEqual(DEFAULT_BACKGROUND);
  });

  it('first daemon load notifies even without a change', () => {
    const onChange = vi.fn();
    const cache = new BackgroundSettingsCache({ initial: { ...DEFAULT_BACKGROUND }, persist: () => undefined, onChange });
    cache.apply({ background: {} });
    expect(onChange).toHaveBeenCalledWith(DEFAULT_BACKGROUND, DEFAULT_BACKGROUND, true);
  });

  it('refresh() re-reads with a timeout and keeps cached values on failure', async () => {
    const cache = new BackgroundSettingsCache({ initial: null, persist: () => undefined });
    expect((await cache.refresh(async () => ({ background: { keepRunningWhenUiClosed: false } }), 1000)).keepRunningWhenUiClosed).toBe(false);
    expect((await cache.refresh(async () => Promise.reject(new Error('weg')), 1000)).keepRunningWhenUiClosed).toBe(false);
    expect((await cache.refresh(() => new Promise(() => undefined), 20)).keepRunningWhenUiClosed).toBe(false);
  });
});

describe('AutostartManager', () => {
  function fakeApi(initial: { openAtLogin: boolean; executableWillLaunchAtLogin?: boolean }) {
    const state = { ...initial };
    const calls: unknown[] = [];
    const api: LoginItemApi = {
      getLoginItemSettings: (o) => {
        calls.push(['get', o]);
        return { ...state };
      },
      setLoginItemSettings: (s) => {
        calls.push(['set', s]);
        state.openAtLogin = s.openAtLogin;
        state.executableWillLaunchAtLogin = s.openAtLogin;
      },
    };
    return { api, state, calls };
  }

  it('is unsupported on Linux and in development builds', () => {
    const { api } = fakeApi({ openAtLogin: true });
    expect(new AutostartManager({ platform: 'linux', isPackaged: true, execPath: '/x', api }).supported()).toBe(false);
    const dev = new AutostartManager({ platform: 'win32', isPackaged: false, execPath: 'C:\\x.exe', api });
    expect(dev.supported()).toBe(false);
    expect(dev.get()).toBe(false);
    expect(dev.set(true)).toBe(false);
  });

  it('tells the settings page why autostart is unavailable (R6-7: start without installation)', () => {
    const { api } = fakeApi({ openAtLogin: false });
    expect(new AutostartManager({ platform: 'win32', isPackaged: false, execPath: 'C:\\x\\electron.exe', api }).support()).toEqual({ supported: false, reason: 'not-installed' });
    expect(new AutostartManager({ platform: 'linux', isPackaged: true, execPath: '/x', api }).support()).toEqual({ supported: false, reason: 'platform' });
    expect(new AutostartManager({ platform: 'win32', isPackaged: true, execPath: 'C:\\NOVA\\NOVA AI.exe', api }).support()).toEqual({ supported: true, reason: null });
  });

  it('windows: registers with --hidden under the AppUserModelId and reads the effective state', () => {
    const { api, calls, state } = fakeApi({ openAtLogin: false });
    const m = new AutostartManager({ platform: 'win32', isPackaged: true, execPath: 'C:\\NOVA\\NOVA AI.exe', api });
    expect(m.set(true)).toBe(true);
    expect(calls).toContainEqual(['set', { openAtLogin: true, path: 'C:\\NOVA\\NOVA AI.exe', args: AUTOSTART_ARGS, name: AUTOSTART_NAME, enabled: true }]);
    expect(calls).toContainEqual(['get', { path: 'C:\\NOVA\\NOVA AI.exe', args: ['--hidden'] }]);
    state.executableWillLaunchAtLogin = false; // disabled in Task Manager
    expect(m.get()).toBe(false);
    expect(m.set(false)).toBe(false);
    expect(calls).toContainEqual(['set', { openAtLogin: false, path: 'C:\\NOVA\\NOVA AI.exe', args: AUTOSTART_ARGS, name: AUTOSTART_NAME }]);
  });

  it('reconcile() follows the saved setting but respects a Task-Manager deactivation', () => {
    const a = fakeApi({ openAtLogin: false });
    const m = new AutostartManager({ platform: 'win32', isPackaged: true, execPath: 'C:\\n.exe', api: a.api });
    expect(m.reconcile(true)).toBe(true); // missing / moved Run value → registered again
    expect(a.state.openAtLogin).toBe(true);
    expect(m.reconcile(true)).toBe(false);
    const b = fakeApi({ openAtLogin: true, executableWillLaunchAtLogin: false });
    const m2 = new AutostartManager({ platform: 'win32', isPackaged: true, execPath: 'C:\\n.exe', api: b.api });
    expect(m2.reconcile(true)).toBe(false); // deactivated by the user: untouched
    expect(m2.reconcile(false)).toBe(true);
    expect(b.state.openAtLogin).toBe(false);
  });

  it('errors never escape', () => {
    const api: LoginItemApi = {
      getLoginItemSettings: () => {
        throw new Error('registry');
      },
      setLoginItemSettings: () => {
        throw new Error('registry');
      },
    };
    const m = new AutostartManager({ platform: 'win32', isPackaged: true, execPath: 'C:\\n.exe', api, log: createMainLogger({ file: null }) });
    expect(m.get()).toBe(false);
    expect(m.set(true)).toBe(false);
    expect(m.reconcile(true)).toBe(false);
  });
});

describe('main logger', () => {
  it('writes redacted JSON lines and never throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-mainlog-'));
    try {
      const file = join(dir, 'logs', 'ui-main.log');
      const log = createMainLogger({ file, maxBytes: 200 });
      log.info('Start mit Schlüssel sk-ant-abcdefghijklmnopqrstuvwxyz', { token: 'x', nested: { apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz' } });
      const line = readFileSync(file, 'utf8').trim();
      expect(line).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz');
      expect(line).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz');
      expect(JSON.parse(line)).toMatchObject({ level: 'info', scope: 'ui-main' });
      for (let i = 0; i < 10; i++) log.warn(`Eintrag ${i}`);
      expect(existsSync(`${file}.1`)).toBe(true);
      expect(errorText(new Error('x'))).toBe('x');
      expect(errorText('y')).toBe('y');
      expect(errorText(3)).toBe('3');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
