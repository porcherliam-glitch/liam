import { useEffect } from 'react';
import { HashRouter, useNavigate } from 'react-router';
import { getBridge } from './lib/api';
import { plural } from './lib/format';
import { paths } from './lib/paths';
import { ensureUnsavedChangesHandler, storedDraftProjects } from './pages/studio/draft-store';
import { initDaemonStore } from './stores/daemon';
import { ensureEventBus } from './stores/events';
import { toast } from './stores/toasts';
import { useUiStore } from './stores/ui';
import { AppRoutes } from './routes';

/** Follows navigation requests from the main process (e.g. a notification click). */
function NavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    const bridge = getBridge();
    if (!bridge?.app?.onNavigate) return;
    return bridge.app.onNavigate((path) => {
      if (typeof path === 'string' && path.startsWith('/')) navigate(path);
    });
  }, [navigate]);
  return null;
}

/**
 * Unsaved studio edits: answers main's question before quitting, and after a crash / Windows shutdown / update
 * points to the recovery copy kept from the last session (it is restored when the studio of the project opens).
 */
function UnsavedDraftsBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    ensureUnsavedChangesHandler();
    const stored = storedDraftProjects();
    if (stored.length === 0) return;
    const files = stored.reduce((n, p) => n + p.files, 0);
    const first = stored[0].projectId;
    toast.show({
      tone: 'info',
      title: 'Ungespeicherte Änderungen aus der letzten Sitzung',
      message: `${plural(files, 'Datei hat', 'Dateien haben')} noch ungespeicherte Änderungen. Sie werden im Studio des Projekts wieder angezeigt und lassen sich dort speichern oder verwerfen.`,
      action: { label: 'Studio öffnen', onClick: () => navigate(paths.studio(first)) },
    });
  }, [navigate]);
  return null;
}

export interface AppProps {
  /** True when running on the in-memory demo bridge (plain browser). */
  demo?: boolean;
}

/** Root component: global subscriptions + router. */
export function App({ demo = false }: AppProps) {
  useEffect(() => {
    useUiStore.getState().setDemo(demo);
  }, [demo]);

  useEffect(() => {
    ensureEventBus();
    return initDaemonStore();
  }, []);

  return (
    <HashRouter>
      <NavigationBridge />
      <UnsavedDraftsBridge />
      <AppRoutes />
    </HashRouter>
  );
}

export default App;
