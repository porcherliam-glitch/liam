import { describe, expect, it, vi } from 'vitest';
import type { UnsavedChangesAction, UnsavedChangesResult } from '@shared/bridge';
import { failedSaveQuestion, UNSAVED_CHOICES, UnsavedChangesGuard, unsavedQuestion, type UnsavedChoice } from './unsaved-guard';
import { createMainLogger } from './log';
import { TEXTS } from './texts';

const log = createMainLogger({ file: null });

/** Renderer stand-in: answers requests (or not) like the preload bridge would. */
function setup(o: { answer?: (action: UnsavedChangesAction) => UnsavedChangesResult | null; choice?: UnsavedChoice; afterFailed?: 'quit' | 'cancel'; canSend?: boolean } = {}) {
  const sent: UnsavedChangesAction[] = [];
  const asked: string[] = [];
  let guard: UnsavedChangesGuard;
  const flushStorage = vi.fn(async () => undefined);
  const showWindow = vi.fn();
  let askSignal: AbortSignal | null = null;
  let releaseAsk: ((c: UnsavedChoice) => void) | null = null;
  guard = new UnsavedChangesGuard({
    send: (id, action) => {
      if (o.canSend === false) return false;
      sent.push(action);
      const r = o.answer ? o.answer(action) : { ok: true, failed: [] };
      if (r) queueMicrotask(() => guard.resolve(id, r));
      return true;
    },
    ask: (info, signal) => {
      asked.push(`ask:${info.count}`);
      askSignal = signal;
      if (o.choice) return Promise.resolve(o.choice);
      return new Promise<UnsavedChoice>((resolve) => {
        releaseAsk = resolve;
        signal.addEventListener('abort', () => resolve('cancel'));
      });
    },
    askAfterFailedSave: async (failed, answered) => {
      asked.push(`failed:${failed.join(',')}:${answered}`);
      return o.afterFailed ?? 'cancel';
    },
    flushStorage,
    showWindow,
    log,
    saveTimeoutMs: 50,
    quickTimeoutMs: 50,
  });
  return { guard, sent, asked, flushStorage, showWindow, signal: () => askSignal, releaseAsk: (c: UnsavedChoice) => releaseAsk?.(c) };
}

describe('UnsavedChangesGuard (R5-2: unsaved studio edits on quit)', () => {
  it('quits without asking when nothing is unsaved', async () => {
    const t = setup();
    expect(await t.guard.confirmQuit('ui')).toBe(true);
    expect(t.asked).toEqual([]);
    expect(t.sent).toEqual([]);
  });

  it('asks before an interactive quit; "Speichern" saves everything, then quits', async () => {
    const t = setup({ choice: 'save' });
    t.guard.update({ count: 2, files: ['Web › src/a.ts', 'Web › src/b.ts'] });
    expect(await t.guard.confirmQuit('ui')).toBe(true);
    expect(t.showWindow).toHaveBeenCalled();
    expect(t.asked).toEqual(['ask:2']);
    expect(t.sent).toEqual(['save']);
    expect(t.flushStorage).toHaveBeenCalled();
  });

  it('"Abbrechen" keeps the UI open; "Nicht speichern" discards and quits', async () => {
    const cancel = setup({ choice: 'cancel' });
    cancel.guard.update({ count: 1, files: ['a.ts'] });
    expect(await cancel.guard.confirmQuit('all')).toBe(false);
    expect(cancel.sent).toEqual([]);
    const discard = setup({ choice: 'discard' });
    discard.guard.update({ count: 1, files: ['a.ts'] });
    expect(await discard.guard.confirmQuit('ui')).toBe(true);
    expect(discard.sent).toEqual(['discard']);
  });

  it('a failed save asks again: cancel keeps the UI, "Trotzdem beenden" keeps a recovery copy', async () => {
    const answer = (a: UnsavedChangesAction) => (a === 'save' ? { ok: false, failed: ['Web › src/a.ts'] } : { ok: true, failed: [] });
    const stay = setup({ choice: 'save', answer, afterFailed: 'cancel' });
    stay.guard.update({ count: 1, files: ['Web › src/a.ts'] });
    expect(await stay.guard.confirmQuit('ui')).toBe(false);
    expect(stay.asked).toEqual(['ask:1', 'failed:Web › src/a.ts:true']);
    const quit = setup({ choice: 'save', answer, afterFailed: 'quit' });
    quit.guard.update({ count: 1, files: ['Web › src/a.ts'] });
    expect(await quit.guard.confirmQuit('ui')).toBe(true);
    expect(quit.sent).toEqual(['save', 'persist']);
  });

  it('a renderer that does not answer never blocks: the second question says so', async () => {
    const t = setup({ choice: 'save', answer: () => null, afterFailed: 'quit' });
    t.guard.update({ count: 1, files: ['a.ts'] });
    expect(await t.guard.confirmQuit('ui')).toBe(true);
    expect(t.asked).toEqual(['ask:1', 'failed::false']);
  });

  it('Windows shutdown and the setup never ask: recovery copy, storage flushed, quit', async () => {
    for (const mode of ['os-shutdown', 'installer'] as const) {
      const t = setup();
      t.guard.update({ count: 3, files: ['a', 'b', 'c'] });
      expect(await t.guard.confirmQuit(mode)).toBe(true);
      expect(t.asked).toEqual([]);
      expect(t.sent).toEqual(['persist']);
      expect(t.flushStorage).toHaveBeenCalled();
    }
    const noPage = setup({ canSend: false });
    noPage.guard.update({ count: 1, files: ['a'] });
    expect(await noPage.guard.confirmQuit('installer')).toBe(true);
  });

  it('a shutdown arriving while the question is open closes it and quits with a recovery copy', async () => {
    const t = setup();
    t.guard.update({ count: 1, files: ['a.ts'] });
    const result = t.guard.confirmQuit('ui');
    await vi.waitFor(() => expect(t.signal()).not.toBeNull());
    t.guard.interrupt();
    expect(await result).toBe(true);
    expect(t.signal()!.aborted).toBe(true);
    expect(t.sent).toEqual(['persist']);
  });

  it('a crashed renderer resets the report and releases pending waits', async () => {
    const t = setup({ choice: 'save', answer: () => null, afterFailed: 'cancel' });
    t.guard.update({ count: 1, files: ['a.ts'] });
    const result = t.guard.confirmQuit('ui');
    await vi.waitFor(() => expect(t.sent).toEqual(['save']));
    t.guard.rendererReset();
    expect(await result).toBe(false);
    expect(t.guard.current()).toEqual({ count: 0, files: [] });
  });

  it('German questions with the file list', () => {
    const q = unsavedQuestion({ count: 12, files: Array.from({ length: 12 }, (_, i) => `Web › f${i}.ts`) });
    expect(q.message).toBe(TEXTS.unsavedTitle(12));
    expect(q.detail).toContain('• Web › f0.ts');
    expect(q.detail).toContain(TEXTS.unsavedMore(2));
    expect(q.buttons).toEqual(['Speichern', 'Nicht speichern', 'Abbrechen']);
    expect(UNSAVED_CHOICES[q.cancelId]).toBe('cancel');
    expect(UNSAVED_CHOICES[q.defaultId]).toBe('save');
    expect(unsavedQuestion({ count: 1, files: ['a.ts'] }).message).toBe('Eine Datei im Studio ist noch nicht gespeichert.');
    const f = failedSaveQuestion(['Web › a.ts'], true);
    expect(f.buttons[f.cancelId]).toBe('Abbrechen');
    expect(f.detail).toContain(TEXTS.unsavedRecoveryCopy);
    expect(failedSaveQuestion([], false).message).toBe(TEXTS.unsavedNoAnswer);
  });
});
