// One terminal session per project while the studio is open. The session is closed shortly after the last
// user releases it – the short delay keeps it alive across React StrictMode's mount/unmount/mount cycle and
// quick re-renders, so no second session is created.
import type { TerminalSession } from '@shared/schemas';
import { api } from '../../lib/api';

interface Entry {
  promise: Promise<TerminalSession>;
  refs: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

const sessions = new Map<string, Entry>();

/** Delay before an unused session is closed. */
export const RELEASE_DELAY_MS = 150;

function closeEntry(projectId: string, entry: Entry): void {
  if (sessions.get(projectId) === entry) sessions.delete(projectId);
  entry.promise.then(
    (s) => api('terminal.close', { sessionId: s.id }).catch(() => {}),
    () => {},
  );
}

/**
 * Gets (or creates) the terminal session of a project and registers a user.
 * Always pair with `releaseTerminalSession(projectId)`.
 */
export function acquireTerminalSession(projectId: string): Promise<TerminalSession> {
  let entry = sessions.get(projectId);
  if (!entry) {
    const promise = api('terminal.create', { projectId });
    entry = { promise, refs: 0, closeTimer: null };
    sessions.set(projectId, entry);
    const created = entry;
    promise.catch(() => {
      // A failed creation must not be reused.
      if (sessions.get(projectId) === created) sessions.delete(projectId);
    });
  }
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }
  entry.refs++;
  return entry.promise;
}

/** Unregisters a user; the session is closed when nobody uses it anymore. */
export function releaseTerminalSession(projectId: string): void {
  const entry = sessions.get(projectId);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  if (entry.refs > 0) return;
  if (entry.closeTimer) clearTimeout(entry.closeTimer);
  entry.closeTimer = setTimeout(() => {
    entry.closeTimer = null;
    if (entry.refs === 0) closeEntry(projectId, entry);
  }, RELEASE_DELAY_MS);
}

/**
 * Replaces the session of a project with a fresh one (e.g. "Neu starten" or after the daemon lost it).
 * Keeps the reference count.
 */
export function restartTerminalSession(projectId: string): Promise<TerminalSession> {
  const old = sessions.get(projectId);
  const refs = old?.refs ?? 0;
  if (old) {
    if (old.closeTimer) clearTimeout(old.closeTimer);
    closeEntry(projectId, old);
  }
  const promise = api('terminal.create', { projectId });
  const entry: Entry = { promise, refs, closeTimer: null };
  sessions.set(projectId, entry);
  promise.catch(() => {
    if (sessions.get(projectId) === entry) sessions.delete(projectId);
  });
  return promise;
}

/** Forgets all sessions without closing them (tests). */
export function resetTerminalSessions(): void {
  for (const entry of sessions.values()) if (entry.closeTimer) clearTimeout(entry.closeTimer);
  sessions.clear();
}
