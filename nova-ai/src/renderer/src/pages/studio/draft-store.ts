// Unsaved studio edits ("drafts") per project and file – the one place that knows about them.
// Key decisions:
// - Kept in memory while the app runs (leaving the studio loses nothing) AND as a recovery copy in localStorage,
//   written shortly after each change and immediately when main asks before quitting. A renderer crash, Windows
//   shutdown or the setup's `--stop-daemon` end the UI without asking – the copy is offered again the next time the
//   studio of that project is opened (useEditorTabs restores it as unsaved edits).
// - The unsaved files are reported to main (window.nova.app.setUnsavedChanges) whenever the set changes, so an
//   interactive quit asks "Speichern / Nicht speichern / Abbrechen"; main's request (save / discard / persist) is
//   answered here.
// - "Speichern" uses the studio's own save when the editor of that project is open (tab state stays right);
//   otherwise files.write with expectedHash = the hash the draft is based on, so a file that changed in the meantime
//   is never overwritten – it is reported as not saved and its draft stays.
// - The copy is per user and computer (localStorage of the app origin). When it does not fit (storage quota), the
//   edits stay in memory and the quit question still protects them.
import type { UnsavedChangesAction, UnsavedChangesResult } from '@shared/bridge';
import { api, getBridge } from '../../lib/api';

export interface Draft {
  content: string;
  /** Hash of the file the edits are based on (null: the file did not exist / was deleted). */
  baseHash: string | null;
}

interface StoredDraft extends Draft {
  updatedAt: number;
}

const KEY_PREFIX = 'nova.studio.drafts.';
const PERSIST_DELAY_MS = 400;

/** Drafts per project (only projects whose recovery copy was read or that were edited in this session). */
const drafts = new Map<string, Map<string, Draft>>();
const projectLabels = new Map<string, string>();
const liveSavers = new Map<string, () => Promise<string[]>>();
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
let lastReport: string | null = null;
let handlerInstalled = false;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStored(projectId: string): Map<string, Draft> {
  const map = new Map<string, Draft>();
  try {
    const raw = storage()?.getItem(KEY_PREFIX + projectId);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as { drafts?: Record<string, Partial<StoredDraft>> };
    for (const [path, d] of Object.entries(parsed.drafts ?? {})) {
      if (typeof d?.content === 'string' && (typeof d.baseHash === 'string' || d.baseHash === null)) map.set(path, { content: d.content, baseHash: d.baseHash });
    }
  } catch {
    /* unreadable copy: nothing to restore */
  }
  return map;
}

function projectMap(projectId: string): Map<string, Draft> {
  let map = drafts.get(projectId);
  if (!map) {
    map = readStored(projectId);
    drafts.set(projectId, map);
  }
  return map;
}

function writeStored(projectId: string): void {
  const timer = persistTimers.get(projectId);
  if (timer) clearTimeout(timer);
  persistTimers.delete(projectId);
  const s = storage();
  if (!s) return;
  const map = drafts.get(projectId);
  try {
    if (!map || map.size === 0) {
      s.removeItem(KEY_PREFIX + projectId);
      return;
    }
    const now = Date.now();
    const out: Record<string, StoredDraft> = {};
    for (const [path, d] of map) out[path] = { content: d.content, baseHash: d.baseHash, updatedAt: now };
    s.setItem(KEY_PREFIX + projectId, JSON.stringify({ v: 1, drafts: out }));
  } catch {
    /* quota exceeded or storage blocked: the edits stay in memory (the quit question still asks) */
  }
}

function schedulePersist(projectId: string): void {
  if (persistTimers.has(projectId)) return;
  persistTimers.set(
    projectId,
    setTimeout(() => writeStored(projectId), PERSIST_DELAY_MS),
  );
}

function label(projectId: string, path: string): string {
  const name = projectLabels.get(projectId);
  return name ? `${name} › ${path}` : path;
}

/** Tells main which files are unsaved (only when the set changed). */
function report(): void {
  const files: string[] = [];
  let count = 0;
  for (const [projectId, map] of drafts) {
    for (const path of map.keys()) {
      count++;
      if (files.length < 20) files.push(label(projectId, path));
    }
  }
  const key = `${count}|${files.join('\n')}`;
  if (key === lastReport) return;
  lastReport = key;
  ensureUnsavedChangesHandler();
  getBridge()
    ?.app.setUnsavedChanges?.({ count, files })
    .catch(() => undefined);
}

function changed(projectId: string): void {
  schedulePersist(projectId);
  report();
}

// --- public API ------------------------------------------------------------------------------------------------

export function getDraft(projectId: string, path: string): Draft | undefined {
  return projectMap(projectId).get(path);
}

export function setDraft(projectId: string, path: string, draft: Draft): void {
  const map = projectMap(projectId);
  const prev = map.get(path);
  if (prev && prev.content === draft.content && prev.baseHash === draft.baseHash) return;
  map.set(path, { content: draft.content, baseHash: draft.baseHash });
  changed(projectId);
}

export function deleteDraft(projectId: string, path: string): void {
  const map = projectMap(projectId);
  if (!map.delete(path)) return;
  changed(projectId);
}

/** Paths with drafts (including a recovery copy from the last session). */
export function draftPaths(projectId: string): string[] {
  return [...projectMap(projectId).keys()];
}

/** Number of unsaved files of a project (also for files whose tab is not open). */
export function unsavedDraftCount(projectId: string): number {
  return projectMap(projectId).size;
}

/** Project name for the quit question ("Projekt › Datei"). */
export function setDraftProjectLabel(projectId: string, name: string): void {
  if (projectLabels.get(projectId) === name) return;
  projectLabels.set(projectId, name);
  if ((drafts.get(projectId)?.size ?? 0) > 0) report();
}

/**
 * The open studio of a project saves its drafts itself (keeps the tab state right). The saver resolves with the
 * paths it could not save. Returns an unregister function.
 */
export function registerLiveSaver(projectId: string, saver: () => Promise<string[]>): () => void {
  liveSavers.set(projectId, saver);
  return () => {
    if (liveSavers.get(projectId) === saver) liveSavers.delete(projectId);
  };
}

/** Writes every recovery copy now (main asks before quitting without a question). */
export function persistDraftsNow(): void {
  for (const projectId of drafts.keys()) writeStored(projectId);
}

/** Drops every draft known in this session (and its recovery copy). */
export function discardAllDrafts(): void {
  for (const [projectId, map] of drafts) {
    map.clear();
    writeStored(projectId);
  }
  report();
}

/** Saves every draft known in this session. */
export async function saveAllDrafts(): Promise<UnsavedChangesResult> {
  const failed: string[] = [];
  for (const [projectId, map] of [...drafts]) {
    if (map.size === 0) continue;
    const live = liveSavers.get(projectId);
    let notSaved: string[] = [];
    if (live) {
      try {
        notSaved = await live();
      } catch {
        notSaved = [...map.keys()];
      }
    }
    // Drafts the open editor did not cover (or no editor open): save directly, never over a changed file.
    for (const [path, d] of [...map]) {
      if (notSaved.includes(path)) continue;
      try {
        await api('files.write', { projectId, path, content: d.content, expectedHash: d.baseHash });
        if (map.get(path) === d) map.delete(path);
      } catch {
        notSaved.push(path); // changed on disk meanwhile (CONFLICT) or not writable: the draft stays
      }
    }
    for (const path of notSaved) failed.push(label(projectId, path));
    writeStored(projectId);
  }
  report();
  return { ok: failed.length === 0, failed: failed.slice(0, 20) };
}

/** Projects with a recovery copy from an earlier session (for the start notice). Reads storage only. */
export function storedDraftProjects(): Array<{ projectId: string; files: number }> {
  const s = storage();
  if (!s) return [];
  const out: Array<{ projectId: string; files: number }> = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const key = s.key(i);
      if (!key?.startsWith(KEY_PREFIX)) continue;
      const projectId = key.slice(KEY_PREFIX.length);
      const files = readStored(projectId).size;
      if (files > 0) out.push({ projectId, files });
    }
  } catch {
    return out;
  }
  return out;
}

/** Answers main's request before quitting. */
export async function handleUnsavedChangesRequest(action: UnsavedChangesAction): Promise<UnsavedChangesResult> {
  if (action === 'persist') {
    persistDraftsNow();
    return { ok: true, failed: [] };
  }
  if (action === 'discard') {
    discardAllDrafts();
    return { ok: true, failed: [] };
  }
  const result = await saveAllDrafts();
  if (!result.ok) persistDraftsNow();
  return result;
}

/** Registers the request handler with the bridge (once; called at app start and on the first draft). */
export function ensureUnsavedChangesHandler(): void {
  if (handlerInstalled) return;
  const bridge = getBridge();
  if (!bridge?.app.onUnsavedChangesRequest) return;
  handlerInstalled = true;
  bridge.app.onUnsavedChangesRequest(handleUnsavedChangesRequest);
}

/** Clears all drafts, recovery copies and registrations (tests). */
export function resetDrafts(): void {
  for (const t of persistTimers.values()) clearTimeout(t);
  persistTimers.clear();
  drafts.clear();
  projectLabels.clear();
  liveSavers.clear();
  lastReport = null;
  handlerInstalled = false;
  const s = storage();
  try {
    for (let i = (s?.length ?? 0) - 1; i >= 0; i--) {
      const key = s?.key(i);
      if (key?.startsWith(KEY_PREFIX)) s?.removeItem(key);
    }
  } catch {
    /* no storage */
  }
}
