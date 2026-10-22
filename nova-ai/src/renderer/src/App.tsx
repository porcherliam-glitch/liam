import { useEffect } from 'react';
import { HashRouter, useNavigate } from 'react-router';
import { getBridge } from './lib/api';
import { initDaemonStore } from './stores/daemon';
import { ensureEventBus } from './stores/events';
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
      <AppRoutes />
    </HashRouter>
  );
}

export default App;
