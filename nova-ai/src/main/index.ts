// Electron main entry point (placeholder until wave 2).
import { app, BrowserWindow } from 'electron';
app.whenReady().then(() => {
  const w = new BrowserWindow({ webPreferences: { sandbox: true, contextIsolation: true } });
  void w.loadURL('data:text/html,NOVA');
});
