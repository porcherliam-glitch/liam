// Unsaved studio edits when the UI quits (MASTERPROMPT §18: no data loss on process ends).
// The main process ends the UI itself (tray, close button, installer `--stop-daemon`, Windows logoff), which skips
// the renderer's beforeunload – so main asks before quitting, based on what the renderer reports
// (window.nova.app.setUnsavedChanges).
// Key decisions:
// - Interactive quit ("Oberfläche beenden", "NOVA vollständig beenden", close button, app.quit from the page): native
//   question "Speichern / Nicht speichern / Abbrechen". Save asks the renderer to save every draft; files that could
//   not be saved lead to a second question (quit anyway with a recovery copy, or cancel).
// - Quit that cannot wait for a person (Windows shutdown/logoff, the setup's `--stop-daemon`): never asks and never
//   blocks; the renderer writes its recovery copy (drafts in localStorage, offered again on the next start) and main
//   flushes DOM storage to disk. A stronger quit request arriving while the question is open closes the question
//   and takes this path.
// - Every wait on the renderer has a time limit: a crashed or hanging page never blocks quitting.
import type { UnsavedChangesAction, UnsavedChangesInfo, UnsavedChangesResult } from '@shared/bridge';
import type { QuitMode } from './quit-policy';
import { errorText, type MainLogger } from './log';
import { TEXTS } from './texts';

export type UnsavedChoice = 'save' | 'discard' | 'cancel';

/** Native message box contents (Electron MessageBoxOptions subset). */
export interface QuestionBox {
  type: 'warning';
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: number;
  cancelId: number;
  noLink: true;
}

function fileList(files: string[], total: number): string {
  const shown = files.slice(0, 10);
  const lines = shown.map((f) => `• ${f}`);
  if (total > shown.length) lines.push(TEXTS.unsavedMore(total - shown.length));
  return lines.join('\n');
}

/** "Speichern / Nicht speichern / Abbrechen" (button index → UnsavedChoice via UNSAVED_CHOICES). */
export function unsavedQuestion(info: UnsavedChangesInfo): QuestionBox {
  return {
    type: 'warning',
    title: TEXTS.appName,
    message: TEXTS.unsavedTitle(info.count),
    detail: [fileList(info.files, info.count), TEXTS.unsavedQuestion].filter(Boolean).join('\n\n'),
    buttons: [TEXTS.unsavedSave, TEXTS.unsavedDiscard, TEXTS.unsavedCancel],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
}

export const UNSAVED_CHOICES: readonly UnsavedChoice[] = ['save', 'discard', 'cancel'];

/** Second question after a failed save: "Trotzdem beenden" (index 0) / "Abbrechen" (index 1, default). */
export function failedSaveQuestion(failed: string[], rendererAnswered: boolean): QuestionBox {
  return {
    type: 'warning',
    title: TEXTS.appName,
    message: rendererAnswered ? TEXTS.unsavedSaveFailed : TEXTS.unsavedNoAnswer,
    detail: [fileList(failed, failed.length), TEXTS.unsavedRecoveryCopy].filter(Boolean).join('\n\n'),
    buttons: [TEXTS.unsavedQuitAnyway, TEXTS.unsavedCancel],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  };
}

export interface UnsavedGuardDeps {
  /** Sends a request to the renderer (IPC unsavedChangesRequest). False when no page can receive it. */
  send(id: string, action: UnsavedChangesAction): boolean;
  /** The question before quitting; `signal` closes it (resolve with 'cancel' then). */
  ask(info: UnsavedChangesInfo, signal: AbortSignal): Promise<UnsavedChoice>;
  /** After a failed save: quit anyway (recovery copy) or cancel. */
  askAfterFailedSave(failed: string[], rendererAnswered: boolean, signal: AbortSignal): Promise<'quit' | 'cancel'>;
  /** Writes pending DOM storage (the renderer's recovery copies) to disk. */
  flushStorage(): Promise<void>;
  /** Brings the window to the front before asking. */
  showWindow(): void;
  log: MainLogger;
  /** Time limit for "save all" (default 20 s). */
  saveTimeoutMs?: number;
  /** Time limit for persist/discard (default 1.5 s). */
  quickTimeoutMs?: number;
}

const EMPTY: UnsavedChangesInfo = { count: 0, files: [] };

export class UnsavedChangesGuard {
  private info: UnsavedChangesInfo = EMPTY;
  private readonly pending = new Map<string, (r: UnsavedChangesResult | null) => void>();
  private seq = 0;
  private question: AbortController | null = null;

  constructor(private readonly d: UnsavedGuardDeps) {}

  /** Latest report of the renderer. */
  update(info: UnsavedChangesInfo): void {
    this.info = { count: Math.max(0, Math.floor(info.count)), files: info.files.slice(0, 20) };
  }

  current(): UnsavedChangesInfo {
    return this.info;
  }

  /** The renderer process crashed or reloads: its in-memory edits are gone (the recovery copy stays). */
  rendererReset(): void {
    this.info = EMPTY;
    for (const [id, done] of [...this.pending]) {
      this.pending.delete(id);
      done(null);
    }
  }

  /** Answer of the renderer to a request (IPC unsavedChangesResult). */
  resolve(id: string, result: UnsavedChangesResult): void {
    const done = this.pending.get(id);
    if (!done) return;
    this.pending.delete(id);
    done(result);
  }

  /** A quit that must not wait for a person arrived while the question is open: close the question. */
  interrupt(): void {
    this.question?.abort();
  }

  /** Recovery copy now (Windows asks whether the session may end; setup; quit without asking). Never throws. */
  async persistNow(): Promise<void> {
    if (this.info.count > 0) await this.request('persist', this.d.quickTimeoutMs ?? 1_500);
    await this.flush();
  }

  /** Resolves true when the UI may quit now, false when the person cancelled. */
  async confirmQuit(mode: QuitMode): Promise<boolean> {
    if (this.info.count === 0) return true;
    if (mode === 'os-shutdown' || mode === 'installer') {
      this.d.log.info('Beenden ohne Rückfrage – ungespeicherte Änderungen werden als Wiederherstellungskopie behalten', { mode, files: this.info.count });
      await this.persistNow();
      return true;
    }
    const question = new AbortController();
    this.question = question;
    const interrupted = async () => {
      this.d.log.info('Rückfrage zu ungespeicherten Änderungen unterbrochen (Windows wird beendet oder Installation)');
      await this.persistNow();
      return true;
    };
    try {
      this.d.showWindow();
      const choice = await this.d.ask(this.info, question.signal);
      if (question.signal.aborted) return await interrupted();
      if (choice === 'cancel') {
        this.d.log.info('Beenden abgebrochen – ungespeicherte Änderungen');
        return false;
      }
      if (choice === 'discard') {
        await this.request('discard', this.d.quickTimeoutMs ?? 1_500);
        await this.flush();
        this.d.log.info('Ungespeicherte Änderungen verworfen');
        return true;
      }
      const result = await this.request('save', this.d.saveTimeoutMs ?? 20_000);
      if (question.signal.aborted) return await interrupted();
      if (result?.ok) {
        await this.flush();
        return true;
      }
      this.d.log.warn('Nicht alle Änderungen konnten vor dem Beenden gespeichert werden', { failed: result?.failed.length ?? null });
      const next = await this.d.askAfterFailedSave(result?.failed ?? [], result !== null, question.signal);
      if (question.signal.aborted) return await interrupted();
      if (next === 'cancel') return false;
      await this.persistNow();
      return true;
    } catch (e) {
      // The question itself failed (no window, dialog error): never trap the person in the app – keep a copy and quit.
      this.d.log.error('Rückfrage zu ungespeicherten Änderungen fehlgeschlagen', { error: errorText(e) });
      await this.persistNow();
      return true;
    } finally {
      if (this.question === question) this.question = null;
    }
  }

  // --- internals -------------------------------------------------------------------------------------------------

  /** Sends a request and waits for the answer; null when the renderer cannot be asked or did not answer in time. */
  private request(action: UnsavedChangesAction, timeoutMs: number): Promise<UnsavedChangesResult | null> {
    const id = `u${++this.seq}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          this.d.log.warn('Oberfläche hat nicht rechtzeitig geantwortet', { action });
          resolve(null);
        }
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, (r) => {
        clearTimeout(timer);
        resolve(r);
      });
      let sent = false;
      try {
        sent = this.d.send(id, action);
      } catch (e) {
        this.d.log.warn('Anfrage an die Oberfläche fehlgeschlagen', { action, error: errorText(e) });
      }
      if (!sent) this.resolveMissing(id);
    });
  }

  private resolveMissing(id: string): void {
    const done = this.pending.get(id);
    if (!done) return;
    this.pending.delete(id);
    done(null);
  }

  private async flush(): Promise<void> {
    try {
      await this.d.flushStorage();
    } catch (e) {
      this.d.log.warn('Wiederherstellungskopie konnte nicht auf die Festplatte geschrieben werden', { error: errorText(e) });
    }
  }
}
