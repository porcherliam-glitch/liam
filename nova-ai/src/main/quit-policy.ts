// Pure decisions about closing the window and quitting the UI (UI-SPEC §5, SPEC §6.10).
// - Close button: hide to the tray when background.closeToTray is on and a tray icon exists, otherwise quit the UI.
// - "Oberfläche beenden" / window.nova.app.quit(): the Electron process exits; the daemon keeps running when
//   background.keepRunningWhenUiClosed is on, otherwise it is asked to shut down (daemon.shutdown).
// - "NOVA vollständig beenden (inkl. Hintergrunddienst)" and a Windows session end always shut the daemon down
//   (session end with reason 'os-shutdown', which makes the daemon use its fast shutdown path).

export type CloseDecision = 'allow' | 'hide' | 'quit';

export function decideCloseAction(o: { quitting: boolean; closeToTray: boolean; trayAvailable: boolean }): CloseDecision {
  if (o.quitting) return 'allow';
  return o.closeToTray && o.trayAvailable ? 'hide' : 'quit';
}

/** ui = quit the UI only; all = UI and daemon; os-shutdown = Windows logoff/shutdown; installer = `--stop-daemon` from a second instance. */
export type QuitMode = 'ui' | 'all' | 'os-shutdown' | 'installer';

export interface DaemonShutdownDecision {
  shutdown: boolean;
  /** Reason passed to daemon.shutdown (logged by the daemon, stored as last_shutdown reason). */
  reason: string;
}

export function decideDaemonShutdown(mode: QuitMode, keepRunningWhenUiClosed: boolean): DaemonShutdownDecision {
  switch (mode) {
    case 'all':
      return { shutdown: true, reason: 'ui-quit-all' };
    case 'os-shutdown':
      return { shutdown: true, reason: 'os-shutdown' };
    case 'installer':
      return { shutdown: true, reason: 'installer' };
    case 'ui':
      return keepRunningWhenUiClosed ? { shutdown: false, reason: 'ui-closed' } : { shutdown: true, reason: 'ui-closed' };
  }
}

/** Stronger modes win when several quit requests overlap (e.g. "quit UI" followed by a session end). */
export function mergeQuitMode(current: QuitMode | null, next: QuitMode): QuitMode {
  const rank: Record<QuitMode, number> = { ui: 0, all: 1, installer: 2, 'os-shutdown': 3 };
  if (!current) return next;
  return rank[next] > rank[current] ? next : current;
}
