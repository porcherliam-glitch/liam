// Shell UI state: page title shown in the top bar (set by <Page/>) and the sidebar collapse state.
import { create } from 'zustand';

export interface PageBackLink {
  to: string;
  label: string;
}

interface UiStore {
  /** Title shown in the top bar. null = derive from the navigation entry of the current route. */
  pageTitle: string | null;
  /** Optional back link left of the title (e.g. project detail -> projects). */
  pageBack: PageBackLink | null;
  sidebarCollapsed: boolean;
  /** Running on the in-memory mock bridge (plain browser) – shows the "Demo-Daten" marker. */
  demo: boolean;
  setDemo: (demo: boolean) => void;
  /** Notifications menu in the top bar is open. */
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  setPage: (title: string | null, back?: PageBackLink | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

const SIDEBAR_KEY = 'nova.sidebarCollapsed';

function readCollapsed(): boolean {
  try {
    return globalThis.localStorage?.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value: boolean): void {
  try {
    globalThis.localStorage?.setItem(SIDEBAR_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable – keep the in-memory value */
  }
}

export const useUiStore = create<UiStore>((set, get) => ({
  pageTitle: null,
  pageBack: null,
  sidebarCollapsed: readCollapsed(),
  demo: false,
  setDemo: (demo) => set({ demo }),
  notificationsOpen: false,
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
  setPage: (pageTitle, pageBack = null) => set({ pageTitle, pageBack }),
  setSidebarCollapsed: (sidebarCollapsed) => {
    writeCollapsed(sidebarCollapsed);
    set({ sidebarCollapsed });
  },
  toggleSidebar: () => get().setSidebarCollapsed(!get().sidebarCollapsed),
}));
