// File dialogs and Explorer helpers on top of the bridge (window.nova.app via getBridge()).
// Every helper catches bridge failures: dialogs resolve `null` when the user cancelled and `undefined` when no
// dialog could be shown (then the caller falls back to the daemon's default path or reports the problem).
import type { FileDialogFilter } from '@shared/bridge';
import { getBridge } from '../../../lib/api';
import { dirname } from '../../../lib/format';
import { toast } from '../../../stores/toasts';

export const JSON_FILTER: FileDialogFilter[] = [{ name: 'JSON-Datei', extensions: ['json'] }];
export const PROGRAM_FILTER: FileDialogFilter[] = [
  { name: 'Programme', extensions: ['exe', 'cmd', 'bat', 'com'] },
  { name: 'Alle Dateien', extensions: ['*'] },
];

/** Removes characters Windows does not allow in file names. */
export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim() || 'NOVA';
}

/** Today as "2026-10-22" (for default file names). */
export function todayStamp(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "Speichern unter" dialog. null = cancelled, undefined = no dialog available. */
export async function chooseSaveFile(options: { title: string; defaultPath?: string; filters?: FileDialogFilter[] }): Promise<string | null | undefined> {
  const bridge = getBridge();
  if (!bridge?.app?.saveFile) return undefined;
  try {
    return await bridge.app.saveFile(options);
  } catch {
    return undefined;
  }
}

/** "Datei öffnen" dialog. null = cancelled, undefined = no dialog available. */
export async function chooseFile(options: { title: string; defaultPath?: string; filters?: FileDialogFilter[] }): Promise<string | null | undefined> {
  const bridge = getBridge();
  if (!bridge?.app?.selectFile) return undefined;
  try {
    return await bridge.app.selectFile(options);
  } catch {
    return undefined;
  }
}

/** Folder dialog. null = cancelled, undefined = no dialog available. */
export async function chooseDirectory(options: { title: string; defaultPath?: string }): Promise<string | null | undefined> {
  const bridge = getBridge();
  if (!bridge?.app?.selectDirectory) return undefined;
  try {
    return await bridge.app.selectDirectory(options);
  } catch {
    return undefined;
  }
}

/** Toast shown when no file dialog could be opened. */
export function dialogUnavailable(): void {
  toast.error('Dateiauswahl nicht möglich', 'Das Auswahlfenster konnte nicht geöffnet werden. Bitte NOVA neu starten.');
}

/** Shows a file or folder selected in Explorer ("Im Explorer zeigen"); toast when that fails. */
export async function revealInExplorer(path: string): Promise<void> {
  let ok = false;
  try {
    ok = (await getBridge()?.app.showInFolder(path)) ?? false;
  } catch {
    ok = false;
  }
  if (!ok) toast.error('Explorer konnte nicht geöffnet werden', `Der Ort ist nicht (mehr) vorhanden: ${dirname(path)}`);
}

/** Opens an existing folder in Explorer; toast when that fails. */
export async function openFolder(path: string): Promise<void> {
  let ok = false;
  try {
    ok = (await getBridge()?.app.openPath(path)) ?? false;
  } catch {
    ok = false;
  }
  if (!ok) toast.error('Ordner konnte nicht geöffnet werden', path);
}

/** Opens an http(s) address in the default browser; toast when it was rejected. */
export async function openWebsite(url: string): Promise<void> {
  let ok = false;
  try {
    ok = (await getBridge()?.app.openExternal(url)) ?? false;
  } catch {
    ok = false;
  }
  if (!ok) toast.error('Die Webseite konnte nicht geöffnet werden', url);
}
