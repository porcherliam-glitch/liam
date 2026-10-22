// Tests of the notification presenter, the tray model/controller and the `--stop-daemon` CLI flow.
import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '@shared/schemas';
import { DaemonRpcError } from '../daemon/client';
import { NotificationPresenter, notificationTarget, type NotificationLike } from './notifications';
import { TrayController, buildTrayItems, trayTooltip, type TrayAction, type TrayLike } from './tray';
import { STOP_EXIT, stopDaemonCli } from './stop-daemon';
import type { ProbeOutcome } from './daemon-supervisor';
import { createMainLogger } from './log';
import { TEXTS } from './texts';

const log = createMainLogger({ file: null });

function notification(over: Partial<Notification> = {}): Notification {
  return { id: 'ntf_1', level: 'success', category: 'task_done', title: 'Aufgabe erledigt', body: 'Login-Seite fertig.', projectId: 'p1', taskId: 't1', ts: 1, readAt: null, ...over };
}

describe('notificationTarget', () => {
  it('routes to the most specific page', () => {
    expect(notificationTarget(notification({ category: 'approval' }))).toBe('/approvals');
    expect(notificationTarget(notification({ category: 'task_done' }))).toBe('/projects/p1?tab=tasks&task=t1');
    expect(notificationTarget(notification({ category: 'blocker', taskId: null }))).toBe('/projects/p1');
    expect(notificationTarget(notification({ category: 'blocker', projectId: null, taskId: null }))).toBe('/tasks');
    expect(notificationTarget(notification({ category: 'error', taskId: null }))).toBe('/projects/p1?tab=errors');
    expect(notificationTarget(notification({ category: 'error', projectId: null, taskId: null }))).toBe('/');
    expect(notificationTarget(notification({ category: 'update' }))).toBe('/settings');
    expect(notificationTarget(notification({ category: 'info', projectId: null, taskId: null }))).toBe('/');
    expect(notificationTarget(notification({ category: 'task_done', projectId: 'a/b', taskId: 't 1' }))).toBe('/projects/a%2Fb?tab=tasks&task=t%201');
  });
});

class FakeToast implements NotificationLike {
  shown = false;
  closed = false;
  private listeners = new Map<string, Array<() => void>>();
  constructor(readonly opts: { title: string; body: string }) {}
  on(event: 'click' | 'close' | 'failed', l: () => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), l]);
    return this;
  }
  show() {
    this.shown = true;
  }
  close() {
    this.closed = true;
  }
  fire(event: string) {
    for (const l of this.listeners.get(event) ?? []) l();
  }
}

function presenter(over: { looking?: boolean; supported?: boolean } = {}) {
  const toasts: FakeToast[] = [];
  const openTarget = vi.fn();
  const markRead = vi.fn();
  const p = new NotificationPresenter({
    isSupported: () => over.supported ?? true,
    create: (o) => {
      const t = new FakeToast(o);
      toasts.push(t);
      return t;
    },
    shouldShow: () => !(over.looking ?? false),
    openTarget,
    markRead,
    log,
  });
  return { p, toasts, openTarget, markRead };
}

describe('NotificationPresenter', () => {
  it('shows a toast for daemon notifications and navigates + marks read on click', () => {
    const { p, toasts, openTarget, markRead } = presenter();
    expect(p.showDaemonNotification(notification())).toBe(true);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].shown).toBe(true);
    expect(toasts[0].opts).toMatchObject({ title: 'Aufgabe erledigt', body: 'Login-Seite fertig.' });
    toasts[0].fire('click');
    expect(openTarget).toHaveBeenCalledWith('/projects/p1?tab=tasks&task=t1');
    expect(markRead).toHaveBeenCalledWith('ntf_1');
  });

  it('skips duplicates, already read entries, invalid payloads and a focused window', () => {
    const { p, toasts } = presenter();
    p.showDaemonNotification(notification());
    expect(p.showDaemonNotification(notification())).toBe(false);
    expect(p.showDaemonNotification(notification({ id: 'ntf_2', readAt: 5 }))).toBe(false);
    expect(p.showDaemonNotification({ id: 'x' })).toBe(false);
    expect(toasts).toHaveLength(1);
    const focused = presenter({ looking: true });
    expect(focused.p.showDaemonNotification(notification())).toBe(false);
    expect(focused.toasts).toHaveLength(0);
    const unsupported = presenter({ supported: false });
    expect(unsupported.p.showDaemonNotification(notification())).toBe(false);
  });

  it('info toasts are shown regardless of focus; dispose closes open toasts', () => {
    const { p, toasts } = presenter({ looking: true });
    const onClick = vi.fn();
    expect(p.showInfo(TEXTS.closeToTrayTitle, TEXTS.closeToTrayBody, onClick)).toBe(true);
    toasts[0].fire('click');
    expect(onClick).toHaveBeenCalled();
    p.showInfo('a', 'b');
    p.dispose();
    expect(toasts[1].closed).toBe(true);
  });

  it('a failing Notification constructor is not fatal', () => {
    const p = new NotificationPresenter({
      isSupported: () => true,
      create: () => {
        throw new Error('no toast');
      },
      shouldShow: () => true,
      openTarget: () => undefined,
      log,
    });
    expect(p.showInfo('a', 'b')).toBe(false);
  });
});

describe('tray', () => {
  it('menu model per UI-SPEC with the work toggle following the work state', () => {
    const running = buildTrayItems({ connection: 'connected', work: 'running' });
    expect(running.filter((i) => i.type === 'normal').map((i) => i.label)).toEqual([
      TEXTS.trayStatus('Läuft'),
      TEXTS.trayOpen,
      TEXTS.trayPauseWork,
      TEXTS.trayQuitUi,
      TEXTS.trayQuitAll,
    ]);
    expect(running.find((i) => i.id === 'status')?.enabled).toBe(false);
    expect(running.find((i) => i.id === 'work')).toMatchObject({ action: 'work-pause', enabled: true });
    expect(buildTrayItems({ connection: 'connected', work: 'paused' }).find((i) => i.id === 'work')).toMatchObject({ label: TEXTS.trayResumeWork, action: 'work-resume' });
    expect(buildTrayItems({ connection: 'connected', work: 'stopped' }).find((i) => i.id === 'work')).toMatchObject({ label: TEXTS.trayStartWork, action: 'work-start' });
    expect(buildTrayItems({ connection: 'reconnecting', work: 'paused' }).find((i) => i.id === 'work')?.enabled).toBe(false);
    expect(buildTrayItems({ connection: 'connected', work: null }).find((i) => i.id === 'work')?.enabled).toBe(false);
    expect(trayTooltip({ connection: 'connected', work: 'paused' })).toBe('NOVA AI – Läuft · Arbeit pausiert');
    expect(trayTooltip({ connection: 'error', work: null })).toBe('NOVA AI – Fehler');
  });

  it('controller creates the tray, rebuilds the menu only on changes and routes clicks', () => {
    const menus: unknown[] = [];
    const tooltips: string[] = [];
    const listeners = new Map<string, () => void>();
    const fake: TrayLike = {
      setToolTip: (t) => tooltips.push(t),
      setContextMenu: (m) => menus.push(m),
      on: (event, l) => listeners.set(event, l),
      destroy: vi.fn(),
    };
    const actions: TrayAction[] = [];
    let captured: ((a: TrayAction) => void) | null = null;
    const ctl = new TrayController({
      createTray: () => fake,
      buildMenu: (items, onAction) => {
        captured = onAction;
        return items.map((i) => i.label);
      },
      onAction: (a) => actions.push(a),
    });
    expect(ctl.init()).toBe(true);
    expect(ctl.available()).toBe(true);
    expect(menus).toHaveLength(1);
    ctl.update({ connection: 'connected', work: 'running' });
    ctl.update({ connection: 'connected', work: 'running' });
    expect(menus).toHaveLength(2);
    expect(tooltips.at(-1)).toBe('NOVA AI – Läuft · Arbeit läuft');
    listeners.get('click')?.();
    captured!('quit-all');
    expect(actions).toEqual(['open', 'quit-all']);
    ctl.destroy();
    expect(fake.destroy).toHaveBeenCalled();
    expect(ctl.available()).toBe(false);
  });

  it('no tray available → init() false', () => {
    const onError = vi.fn();
    const ctl = new TrayController({
      createTray: () => {
        throw new Error('kein Infobereich');
      },
      buildMenu: () => null,
      onAction: () => undefined,
      onError,
    });
    expect(ctl.init()).toBe(false);
    expect(onError).toHaveBeenCalled();
    ctl.update({ connection: 'connected' }); // no throw
    expect(new TrayController({ createTray: () => null, buildMenu: () => null, onAction: () => undefined }).init()).toBe(false);
  });
});

describe('stopDaemonCli', () => {
  type Status = 'ours' | 'none' | 'foreign' | 'transient';
  function harness(sequence: Status[], opts: { shutdownFails?: boolean } = {}) {
    let t = 0;
    const lines: string[] = [];
    const rpc = vi.fn(async () => {
      if (opts.shutdownFails) throw new DaemonRpcError('DAEMON_UNAVAILABLE', 'weg', { reason: 'connection_lost' });
      return { ok: true };
    });
    const close = vi.fn();
    let i = 0;
    const deps = {
      probe: async (): Promise<ProbeOutcome> => {
        const s = sequence[Math.min(i++, sequence.length - 1)];
        if (s === 'ours') return { status: 'ours', health: { pid: 1, version: '1', instanceId: 'a' }, unverifiedNova: false, handshake: 'ok', detail: '' };
        if (s === 'none') return { status: 'none', health: null, unverifiedNova: false, handshake: 'none', detail: '' };
        return { status: 'foreign', health: null, unverifiedNova: false, handshake: s === 'transient' ? 'mismatch' : 'foreign', detail: '' };
      },
      createClient: () => ({ rpc: rpc as never, close }),
      sleep: async (ms: number) => {
        t += ms;
      },
      now: () => t,
      out: (l: string) => lines.push(l),
    };
    return { deps, lines, rpc, close };
  }

  it('nothing running → exit 0 without shutdown', async () => {
    const h = harness(['none']);
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, h.deps)).toBe(STOP_EXIT.stopped);
    expect(h.lines).toEqual([TEXTS.cliNotRunning]);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it('running → daemon.shutdown(installer), waits for the endpoint to vanish → exit 0', async () => {
    const h = harness(['ours', 'ours', 'ours', 'none']);
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, h.deps)).toBe(STOP_EXIT.stopped);
    expect(h.rpc).toHaveBeenCalledWith('daemon.shutdown', { reason: 'installer' }, { timeoutMs: 10_000 });
    expect(h.close).toHaveBeenCalled();
    expect(h.lines).toEqual([TEXTS.cliStopping, TEXTS.cliStopped]);
  });

  it('a lost connection while acknowledging is fine as long as the endpoint vanishes', async () => {
    const h = harness(['ours', 'none'], { shutdownFails: true });
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, h.deps)).toBe(STOP_EXIT.stopped);
  });

  it('still running after 20 s → exit 1', async () => {
    const h = harness(['ours']);
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, h.deps)).toBe(STOP_EXIT.timeout);
    expect(h.lines.at(-1)).toBe(TEXTS.cliStopTimeout(20));
  });

  it('foreign endpoint → exit 2; transient foreign (daemon starting) is retried', async () => {
    const foreign = harness(['foreign']);
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, foreign.deps)).toBe(STOP_EXIT.foreign);
    expect(foreign.lines).toEqual([TEXTS.cliForeign]);
    const transient = harness(['transient', 'transient', 'ours', 'none']);
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, transient.deps)).toBe(STOP_EXIT.stopped);
    expect(transient.rpc).toHaveBeenCalled();
  });

  it('a probe that throws counts as "not running"', async () => {
    const h = harness(['none']);
    h.deps.probe = async () => Promise.reject(new Error('EACCES'));
    expect(await stopDaemonCli({ endpoint: 'e', tokenPath: 't' }, h.deps)).toBe(STOP_EXIT.stopped);
  });
});
