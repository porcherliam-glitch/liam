import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { App } from './App';
import { getBridge } from './lib/api';

async function bootstrap(): Promise<void> {
  let demo = false;
  // Plain browser (no Electron preload): use the in-memory demo bridge. Loaded lazily so it is
  // not part of the main bundle.
  if (!getBridge()) {
    const { installMockBridge } = await import('./lib/mock-bridge');
    installMockBridge({ latencyMs: 120, live: true });
    demo = true;
  }
  const root = document.getElementById('root');
  if (!root) throw new Error('#root fehlt in index.html');
  createRoot(root).render(
    <StrictMode>
      <App demo={demo} />
    </StrictMode>,
  );
}

void bootstrap();
