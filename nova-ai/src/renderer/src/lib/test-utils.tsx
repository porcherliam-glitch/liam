// Shared helpers for renderer tests (vitest + @testing-library/react + jsdom).
// Usage in a test file (first line must be the jsdom pragma):
//   /** @vitest-environment jsdom */
//   import { setupRendererTest, renderWithRouter } from '../lib/test-utils';
//   setupRendererTest();
//   it('…', async () => { renderWithRouter(<MyPage />, { route: '/x' }); expect(await screen.findByText('…')).toBeTruthy(); });
import type { ReactElement, ReactNode } from 'react';
import { cleanup, configure, render, type RenderResult } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { installMockBridge, resetMockData, uninstallMockBridge } from './mock-bridge';
import { resetEventBus } from '../stores/events';
import { initDaemonStore, resetDaemonStore } from '../stores/daemon';
import { useToastStore } from '../stores/toasts';
import { useUiStore } from '../stores/ui';
import { AppRoutes } from '../routes';

/**
 * Registers beforeEach/afterEach hooks: fresh mock bridge + demo data, clean stores, RTL cleanup.
 * Call once at the top level of a test file.
 */
export function setupRendererTest(): void {
  // CI machines and parallel test runs can be slow – give async queries more time than the 1 s default.
  configure({ asyncUtilTimeout: 4000 });
  beforeEach(() => {
    try {
      globalThis.localStorage?.clear();
    } catch {
      /* no storage */
    }
    installMockBridge();
    resetMockData();
    resetEventBus();
    resetDaemonStore();
    useToastStore.getState().clear();
    useUiStore.setState({ pageTitle: null, pageBack: null, sidebarCollapsed: false, demo: false, notificationsOpen: false });
  });
  afterEach(() => {
    cleanup();
    resetDaemonStore();
    resetEventBus();
    uninstallMockBridge();
  });
}

export interface RenderOptions {
  /** Initial location (default "/"). */
  route?: string;
  /** Route pattern for the element, e.g. "/projects/:projectId" (default: matches everything). */
  path?: string;
  /** Start the daemon store (connection state, work status, approvals count). Default true. */
  daemon?: boolean;
}

/** Renders `ui` inside a MemoryRouter (and starts the daemon store). */
export function renderWithRouter(ui: ReactElement, options: RenderOptions = {}): RenderResult {
  if (options.daemon !== false) initDaemonStore();
  return render(
    <MemoryRouter initialEntries={[options.route ?? '/']}>
      <Routes>
        <Route path={options.path ?? '*'} element={ui} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Renders the whole app shell with routes at `route` (MemoryRouter instead of HashRouter). */
export function renderApp(route = '/'): RenderResult {
  initDaemonStore();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppRoutes />
    </MemoryRouter>,
  );
}

/** Minimal wrapper for components that need a router context but no route. */
export function RouterWrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}
