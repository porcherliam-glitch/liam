// Preload placeholder until wave 2.
import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('nova', {});
