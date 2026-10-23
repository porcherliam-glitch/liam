// Preload script of the NOVA window: exposes `window.nova` (src/shared/bridge.ts) through contextBridge.
// Runs sandboxed (sandbox: true, contextIsolation: true): only `electron` (contextBridge, ipcRenderer) is available,
// everything else is bundled by esbuild. No Node APIs reach the page.
import { contextBridge, ipcRenderer } from 'electron';
import { createNovaBridge } from './bridge';

contextBridge.exposeInMainWorld('nova', createNovaBridge(ipcRenderer, process.platform));
