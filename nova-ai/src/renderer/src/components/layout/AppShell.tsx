import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { cn } from '../../lib/cn';
import { useDaemonStore } from '../../stores/daemon';
import { Toaster } from '../ui/Toaster';
import { LoadingState } from '../ui/EmptyState';
import { DaemonBanner } from '../common/DaemonBanner';
import { ShutdownNotice } from '../common/ShutdownNotice';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * App frame: sidebar, top bar, daemon banner, routed page and toasts.
 * While the daemon is not connected all form controls in the page are disabled (native <fieldset disabled>)
 * and, when the connection is lost, the cached content is greyed out (UI-SPEC §2).
 */
export function AppShell() {
  const location = useLocation();
  const connection = useDaemonStore((s) => s.connection);
  const blocked = connection != null && connection.state !== 'connected';
  const greyed = connection != null && (connection.state === 'reconnecting' || connection.state === 'stopped' || connection.state === 'error');

  return (
    <div className="flex h-full w-full overflow-hidden bg-bg text-text">
      <a
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
        className="sr-only z-[70] rounded-md bg-violet px-3 py-2 text-white focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Zum Inhalt springen
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <DaemonBanner />
        <ShutdownNotice />
        <main id="main" tabIndex={-1} aria-busy={blocked || undefined} className={cn('relative min-h-0 flex-1 overflow-auto focus:outline-none', greyed && 'opacity-60 saturate-50')}>
          <fieldset disabled={blocked} className="contents">
            <ErrorBoundary key={location.pathname}>
              <Suspense fallback={<LoadingState />}>
                <Outlet />
              </Suspense>
            </ErrorBoundary>
          </fieldset>
        </main>
      </div>
      <Toaster />
    </div>
  );
}
