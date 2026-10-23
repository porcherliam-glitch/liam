// Global connection state of the background service (daemon), last daemon/work status and the
// pending approvals count. `initDaemonStore()` is called once by <App/>; components read via hooks.
import { create } from 'zustand';
import type { DaemonConnectionState } from '@shared/bridge';
import type { RpcMethod } from '@shared/rpc';
import type { DaemonStatus, WorkStatus } from '@shared/schemas';
import { api, getBridge } from '../lib/api';
import { notifyResync, subscribeNovaEvent, subscribeResync } from './events';
import { toast } from './toasts';
import { useUiStore } from './ui';

export interface DaemonStore {
  /** Bridge connection state (null until the first answer). */
  connection: DaemonConnectionState | null;
  /** Last `daemon.status` (RPC or event). */
  status: DaemonStatus | null;
  /** Last `work.status` (RPC or event). */
  work: WorkStatus | null;
  /** Number of pending approvals (sidebar badge, approvals icon). */
  pendingApprovals: number;
  /** Number of unread notifications (bell). */
  unreadNotifications: number;
  /** App version from the bridge. */
  appVersion: string | null;
  setConnection: (connection: DaemonConnectionState) => void;
  setStatus: (status: DaemonStatus) => void;
  setWork: (work: WorkStatus) => void;
  setPendingApprovals: (count: number) => void;
  setUnreadNotifications: (count: number) => void;
  /** Re-reads daemon status, work status and the approvals count. */
  refresh: () => Promise<void>;
  refreshApprovals: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const NO_BRIDGE_STATE: DaemonConnectionState = {
  state: 'error',
  message: 'Die Oberfläche hat keine Verbindung zu NOVA. Bitte NOVA neu starten.',
  since: Date.now(),
  daemonPid: null,
  daemonVersion: null,
  endpoint: '',
  restartAttempts: 0,
};

export const useDaemonStore = create<DaemonStore>((set, get) => ({
  connection: null,
  status: null,
  work: null,
  pendingApprovals: 0,
  unreadNotifications: 0,
  appVersion: null,
  setConnection: (connection) => set({ connection }),
  setStatus: (status) => set({ status }),
  setWork: (work) => set({ work }),
  setPendingApprovals: (pendingApprovals) => set({ pendingApprovals }),
  setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),
  refresh: async () => {
    const results = await Promise.allSettled([api('daemon.status'), api('work.status'), get().refreshApprovals(), get().refreshNotifications()]);
    const [status, work] = results;
    if (status.status === 'fulfilled') set({ status: status.value });
    if (work.status === 'fulfilled') set({ work: work.value });
  },
  refreshApprovals: async () => {
    try {
      const pending = await api('approvals.list', { status: 'pending' });
      set({ pendingApprovals: pending.length });
    } catch {
      /* keep the last known count */
    }
  },
  refreshNotifications: async () => {
    if (!isMethodSupported('notifications.list')) return;
    try {
      const unread = await api('notifications.list', { unreadOnly: true, limit: 1000 });
      set({ unreadNotifications: unread.length });
    } catch {
      /* keep the last known count */
    }
  },
}));

/**
 * False when the connected daemon does not offer `method` (DaemonStatus.methods). Unknown = true.
 * Use it to hide features of newer versions.
 */
export function isMethodSupported(method: RpcMethod): boolean {
  const methods = useDaemonStore.getState().status?.methods;
  return !methods || methods.length === 0 || methods.includes(method);
}

/** Hook variant of isMethodSupported. */
export function useSupports(method: RpcMethod): boolean {
  return useDaemonStore((s) => !s.status?.methods || s.status.methods.length === 0 || s.status.methods.includes(method));
}

/** True when the bridge is connected to the daemon. */
export function selectOnline(s: Pick<DaemonStore, 'connection'>): boolean {
  return s.connection?.state === 'connected';
}

/** Non-React check used by mutations: false only when the state is known and not connected. */
export function isDaemonReachable(): boolean {
  const c = useDaemonStore.getState().connection;
  return !c || c.state === 'connected';
}

/** Hook: daemon connected? (false while starting/reconnecting/stopped/error). */
export function useDaemonOnline(): boolean {
  return useDaemonStore(selectOnline);
}

let initCount = 0;
let teardown: (() => void) | null = null;

/**
 * Subscribes to the bridge connection state and status events. Ref-counted and idempotent;
 * returns a cleanup function (call it from a useEffect cleanup).
 */
export function initDaemonStore(): () => void {
  initCount++;
  if (initCount === 1) teardown = start();
  return () => {
    initCount = Math.max(0, initCount - 1);
    if (initCount === 0) {
      teardown?.();
      teardown = null;
    }
  };
}

function start(): () => void {
  const bridge = getBridge();
  const store = useDaemonStore.getState();
  if (!bridge) {
    store.setConnection({ ...NO_BRIDGE_STATE, since: Date.now() });
    return () => {};
  }
  let disposed = false;
  let approvalsTimer: ReturnType<typeof setTimeout> | null = null;
  const offs: Array<() => void> = [];

  const applyConnection = (next: DaemonConnectionState) => {
    if (disposed) return;
    const prev = useDaemonStore.getState().connection;
    useDaemonStore.getState().setConnection(next);
    if (next.state === 'connected' && prev?.state !== 'connected') {
      void useDaemonStore
        .getState()
        .refresh()
        .then(() => announceUnread());
      // Events may have been missed while disconnected.
      if (prev) notifyResync();
    }
  };

  bridge.daemon
    .state()
    .then(applyConnection)
    .catch(() => applyConnection({ ...NO_BRIDGE_STATE, since: Date.now() }));
  try {
    offs.push(bridge.daemon.onState(applyConnection));
  } catch {
    /* bridge without state events */
  }
  bridge.app
    .version()
    .then((v) => !disposed && useDaemonStore.setState({ appVersion: v }))
    .catch(() => {});

  offs.push(subscribeNovaEvent('daemon.status', (s) => useDaemonStore.getState().setStatus(s)));
  offs.push(subscribeNovaEvent('work.status', (w) => useDaemonStore.getState().setWork(w)));
  offs.push(
    subscribeNovaEvent('approval.updated', () => {
      if (approvalsTimer) clearTimeout(approvalsTimer);
      approvalsTimer = setTimeout(() => void useDaemonStore.getState().refreshApprovals(), 150);
    }),
  );
  offs.push(
    subscribeNovaEvent('notification', (n) => {
      if (n.readAt == null) useDaemonStore.setState((s) => ({ unreadNotifications: s.unreadNotifications + 1 }));
    }),
  );
  offs.push(subscribeResync(() => void useDaemonStore.getState().refresh()));

  return () => {
    disposed = true;
    if (approvalsTimer) clearTimeout(approvalsTimer);
    for (const off of offs) off();
  };
}

/** After (re)connecting: tell the user about notifications that arrived while the window was closed. */
function announceUnread(): void {
  const unread = useDaemonStore.getState().unreadNotifications;
  if (unread <= 0) return;
  toast.show({
    tone: 'info',
    title: unread === 1 ? '1 neue Meldung' : `${unread} neue Meldungen`,
    message: 'Seit dem letzten Öffnen von NOVA ist etwas passiert.',
    action: { label: 'Anzeigen', onClick: () => useUiStore.getState().setNotificationsOpen(true) },
  });
}

/** Resets the store (tests). */
export function resetDaemonStore(): void {
  teardown?.();
  teardown = null;
  initCount = 0;
  useDaemonStore.setState({ connection: null, status: null, work: null, pendingApprovals: 0, unreadNotifications: 0, appVersion: null });
}
