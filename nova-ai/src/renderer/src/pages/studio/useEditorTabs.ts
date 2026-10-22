// State of the open editor tabs: loading, dirty tracking, saving with conflict detection (expectedHash),
// reloading after external changes (NOVA, other programs) and unsaved drafts that survive leaving the studio.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileContent } from '@shared/schemas';
import { api, errorMessage, isRpcError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { disposeModel, disposeProjectModels, setModelContent } from './editor-models';
import { MAX_EDITABLE_BYTES } from './studio-utils';

export type ChangeActor = 'nova' | 'user' | 'external';

export interface EditorTab {
  path: string;
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  language: string;
  encoding: FileContent['encoding'];
  truncated: boolean;
  size: number;
  /** Hash of the file on disk at the last load/save (expectedHash for the next save). */
  hash: string | null;
  /** Content on disk at the last load/save. */
  savedContent: string;
  /** Content the editor model starts with (a restored draft or the saved content). */
  initialContent: string;
  dirty: boolean;
  saving: boolean;
  /** Last successful save (for the "Gespeichert" note). */
  savedAt: number | null;
  /** The file no longer exists on disk. */
  deleted: boolean;
  /** The file changed on disk while there were unsaved edits (or a save hit a conflict). */
  external: { hash: string | null; deleted: boolean; actor: ChangeActor | null } | null;
  /** Reloaded automatically after an external change (transient note). */
  reloaded: { at: number; actor: ChangeActor } | null;
}

export interface RevealRequest {
  path: string;
  line: number;
  column: number;
  /** Increments for every request so the same position can be revealed twice. */
  token: number;
}

export interface OpenOptions {
  line?: number | null;
  column?: number | null;
  /** Do not focus/activate (used when restoring tabs). */
  background?: boolean;
}

interface Draft {
  content: string;
  baseHash: string | null;
}

/** Unsaved edits per project and file. Kept in memory while the app runs, so leaving the studio loses nothing. */
const drafts = new Map<string, Map<string, Draft>>();

function projectDrafts(projectId: string): Map<string, Draft> {
  let map = drafts.get(projectId);
  if (!map) {
    map = new Map();
    drafts.set(projectId, map);
  }
  return map;
}

/** Number of unsaved files of a project (also for files whose tab is not open). */
export function unsavedDraftCount(projectId: string): number {
  return drafts.get(projectId)?.size ?? 0;
}

/** Clears all drafts (tests). */
export function resetDrafts(): void {
  drafts.clear();
}

const TABS_KEY = (projectId: string) => `nova.studio.tabs.${projectId}`;

function readStoredTabs(projectId: string): { paths: string[]; active: string | null } {
  try {
    const raw = globalThis.localStorage?.getItem(TABS_KEY(projectId));
    if (!raw) return { paths: [], active: null };
    const parsed = JSON.parse(raw) as { paths?: unknown; active?: unknown };
    const paths = Array.isArray(parsed.paths) ? parsed.paths.filter((p): p is string => typeof p === 'string').slice(0, 30) : [];
    return { paths, active: typeof parsed.active === 'string' ? parsed.active : null };
  } catch {
    return { paths: [], active: null };
  }
}

function writeStoredTabs(projectId: string, paths: string[], active: string | null): void {
  try {
    globalThis.localStorage?.setItem(TABS_KEY(projectId), JSON.stringify({ paths, active }));
  } catch {
    /* storage unavailable */
  }
}

/** True when the tab cannot be edited (binary, truncated, too large, not loaded). */
export function isReadOnly(tab: EditorTab): boolean {
  return tab.status !== 'ready' || tab.encoding === 'binary' || tab.truncated || tab.size > MAX_EDITABLE_BYTES;
}

function notFoundText(): string {
  return 'Die Datei wurde nicht gefunden. Vielleicht wurde sie gelöscht oder umbenannt.';
}

function loadingTab(path: string): EditorTab {
  return {
    path,
    status: 'loading',
    error: null,
    language: 'plaintext',
    encoding: 'utf8',
    truncated: false,
    size: 0,
    hash: null,
    savedContent: '',
    initialContent: '',
    dirty: false,
    saving: false,
    savedAt: null,
    deleted: false,
    external: null,
    reloaded: null,
  };
}

export interface EditorTabsApi {
  tabs: EditorTab[];
  activePath: string | null;
  active: EditorTab | null;
  reveal: RevealRequest | null;
  setActive: (path: string) => void;
  open: (path: string, options?: OpenOptions) => void;
  /** Closes a tab; returns false (and closes nothing) when it has unsaved changes. */
  close: (path: string) => boolean;
  /** Closes without asking (discards unsaved changes). */
  forceClose: (path: string) => void;
  /** Saves a tab. Resolves "conflict" when the file changed on disk in the meantime. */
  save: (path?: string | null) => Promise<'saved' | 'unchanged' | 'conflict' | 'failed'>;
  /** Saves even though the file changed on disk (expectedHash = the hash the user has just seen). */
  overwrite: (path: string, diskHash: string | null) => Promise<boolean>;
  /** Discards local changes and loads the file from disk. */
  reload: (path: string) => Promise<void>;
  /** Editor content change of the active tab. */
  handleChange: (path: string, value: string) => void;
  /** Current editor content of a tab (unsaved edits included). */
  getContent: (path: string) => string;
  /** files.changed event: re-check open tabs. */
  handleFilesChanged: (paths: readonly string[], actor: ChangeActor) => void;
  /** After a rename in the tree: move open tabs (and their unsaved edits) to the new path. */
  handleRenamed: (from: string, to: string) => void;
  /** After a delete in the tree: close clean tabs inside the deleted path. */
  handleDeleted: (path: string) => void;
  unsavedCount: number;
}

/**
 * Editor tab state of the studio for one project.
 * @example const editor = useEditorTabs(projectId); editor.open('src/main.ts', { line: 12 });
 */
export function useEditorTabs(projectId: string): EditorTabsApi {
  const [tabs, setTabsState] = useState<EditorTab[]>([]);
  const [activePath, setActivePathState] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealRequest | null>(null);
  /** Project whose stored tabs have been restored (the tab list is only written back afterwards). */
  const [hydrated, setHydrated] = useState<string | null>(null);
  const tabsRef = useRef<EditorTab[]>([]);
  const activeRef = useRef<string | null>(null);
  const contentRef = useRef(new Map<string, string>());
  const revealToken = useRef(0);
  const mounted = useRef(true);
  const projectRef = useRef(projectId);
  projectRef.current = projectId;

  const commit = useCallback((update: (prev: EditorTab[]) => EditorTab[]) => {
    const next = update(tabsRef.current);
    tabsRef.current = next;
    if (mounted.current) setTabsState(next);
  }, []);

  const patch = useCallback(
    (path: string, changes: Partial<EditorTab> | ((tab: EditorTab) => Partial<EditorTab>)) => {
      commit((prev) => prev.map((t) => (t.path === path ? { ...t, ...(typeof changes === 'function' ? changes(t) : changes) } : t)));
    },
    [commit],
  );

  const setActive = useCallback((path: string | null) => {
    activeRef.current = path;
    if (mounted.current) setActivePathState(path);
  }, []);

  const updateDraft = useCallback((path: string, content: string, tab: EditorTab | undefined) => {
    const map = projectDrafts(projectRef.current);
    if (!tab || content === tab.savedContent) map.delete(path);
    else map.set(path, { content, baseHash: tab.hash });
  }, []);

  const load = useCallback(
    async (path: string) => {
      const pid = projectRef.current;
      try {
        const file = await api('files.read', { projectId: pid, path });
        if (pid !== projectRef.current || !tabsRef.current.some((t) => t.path === path)) return;
        const stored = projectDrafts(pid).get(path);
        const draft = stored && file.encoding !== 'binary' && stored.content !== file.content ? stored : null;
        const initialContent = draft ? draft.content : file.content;
        contentRef.current.set(path, initialContent);
        patch(path, {
          status: 'ready',
          error: null,
          language: file.language || 'plaintext',
          encoding: file.encoding,
          truncated: file.truncated,
          size: file.size,
          hash: file.hash,
          savedContent: file.content,
          initialContent,
          dirty: draft !== null,
          deleted: false,
          external: draft && draft.baseHash !== file.hash ? { hash: file.hash, deleted: false, actor: null } : null,
        });
        if (!draft) projectDrafts(pid).delete(path);
        else if (draft.baseHash === file.hash) toast.info('Ungespeicherte Änderungen wiederhergestellt', path);
      } catch (e) {
        if (pid !== projectRef.current) return;
        const draft = projectDrafts(pid).get(path);
        if (isRpcError(e, 'NOT_FOUND') && draft) {
          // The file is gone, but there are unsaved edits: keep them so they can be saved again.
          contentRef.current.set(path, draft.content);
          patch(path, { status: 'ready', error: null, savedContent: '', initialContent: draft.content, hash: null, dirty: true, deleted: true, external: { hash: null, deleted: true, actor: null } });
          return;
        }
        patch(path, { status: 'error', error: isRpcError(e, 'NOT_FOUND') ? notFoundText() : errorMessage(e) });
      }
    },
    [patch],
  );

  const open = useCallback(
    (path: string, options: OpenOptions = {}) => {
      const exists = tabsRef.current.some((t) => t.path === path);
      if (!exists) {
        commit((prev) => [...prev, loadingTab(path)]);
        void load(path);
      }
      if (!options.background) setActive(path);
      if (options.line != null && options.line > 0) {
        revealToken.current++;
        setReveal({ path, line: Math.floor(options.line), column: Math.max(1, Math.floor(options.column ?? 1)), token: revealToken.current });
      }
    },
    [commit, load, setActive],
  );

  const removeTab = useCallback(
    (path: string) => {
      const prev = tabsRef.current;
      const index = prev.findIndex((t) => t.path === path);
      if (index < 0) return;
      const next = prev.filter((t) => t.path !== path);
      commit(() => next);
      contentRef.current.delete(path);
      disposeModel(projectRef.current, path);
      if (activeRef.current === path) setActive(next[Math.min(index, next.length - 1)]?.path ?? null);
    },
    [commit, setActive],
  );

  const forceClose = useCallback(
    (path: string) => {
      projectDrafts(projectRef.current).delete(path);
      removeTab(path);
    },
    [removeTab],
  );

  const close = useCallback(
    (path: string) => {
      const tab = tabsRef.current.find((t) => t.path === path);
      if (tab?.dirty) return false;
      forceClose(path);
      return true;
    },
    [forceClose],
  );

  const applyDiskContent = useCallback(
    (path: string, file: FileContent, extra: Partial<EditorTab> = {}) => {
      contentRef.current.set(path, file.content);
      projectDrafts(projectRef.current).delete(path);
      // Update the state (and its ref) first, so the model change event sees the new saved content.
      patch(path, {
        status: 'ready',
        error: null,
        language: file.language || 'plaintext',
        encoding: file.encoding,
        truncated: file.truncated,
        size: file.size,
        hash: file.hash,
        savedContent: file.content,
        dirty: false,
        deleted: false,
        external: null,
        ...extra,
      });
      setModelContent(projectRef.current, path, file.content);
    },
    [patch],
  );

  const write = useCallback(
    async (path: string, expectedHash: string | null): Promise<'saved' | 'conflict' | 'failed'> => {
      const pid = projectRef.current;
      const tab = tabsRef.current.find((t) => t.path === path);
      if (!tab) return 'failed';
      const content = contentRef.current.get(path) ?? tab.savedContent;
      patch(path, { saving: true });
      try {
        const result = await api('files.write', { projectId: pid, path, content, expectedHash });
        if (pid !== projectRef.current) return 'saved';
        const current = contentRef.current.get(path) ?? content;
        patch(path, {
          saving: false,
          hash: result.hash,
          size: result.size,
          savedContent: content,
          dirty: current !== content,
          deleted: false,
          external: null,
          savedAt: Date.now(),
          reloaded: null,
        });
        const updated = tabsRef.current.find((t) => t.path === path);
        updateDraft(path, current, updated);
        return 'saved';
      } catch (e) {
        patch(path, { saving: false });
        if (isRpcError(e, 'CONFLICT')) {
          patch(path, (t) => ({ external: t.external ?? { hash: null, deleted: false, actor: null } }));
          return 'conflict';
        }
        toast.error('Speichern fehlgeschlagen', errorMessage(e));
        return 'failed';
      }
    },
    [patch, updateDraft],
  );

  const save = useCallback(
    async (path?: string | null) => {
      const target = path ?? activeRef.current;
      const tab = tabsRef.current.find((t) => t.path === target);
      if (!target || !tab) return 'unchanged' as const;
      if (isReadOnly(tab) || tab.saving) return 'unchanged' as const;
      if (!tab.dirty && !tab.deleted) return 'unchanged' as const;
      return write(target, tab.deleted ? null : tab.hash);
    },
    [write],
  );

  const overwrite = useCallback(
    async (path: string, diskHash: string | null) => {
      const result = await write(path, diskHash);
      return result === 'saved';
    },
    [write],
  );

  const reload = useCallback(
    async (path: string) => {
      const pid = projectRef.current;
      try {
        const file = await api('files.read', { projectId: pid, path });
        if (pid !== projectRef.current) return;
        applyDiskContent(path, file, { reloaded: null });
      } catch (e) {
        if (isRpcError(e, 'NOT_FOUND')) {
          patch(path, { deleted: true, external: null });
          toast.warning('Die Datei gibt es nicht mehr', path);
          return;
        }
        toast.error('Neu laden fehlgeschlagen', errorMessage(e));
      }
    },
    [applyDiskContent, patch],
  );

  const handleChange = useCallback(
    (path: string, value: string) => {
      contentRef.current.set(path, value);
      const tab = tabsRef.current.find((t) => t.path === path);
      if (!tab || tab.status !== 'ready') return;
      const dirty = value !== tab.savedContent;
      if (dirty !== tab.dirty) patch(path, { dirty });
      updateDraft(path, value, tab);
    },
    [patch, updateDraft],
  );

  const getContent = useCallback((path: string) => {
    const tab = tabsRef.current.find((t) => t.path === path);
    return contentRef.current.get(path) ?? tab?.savedContent ?? '';
  }, []);

  const handleFilesChanged = useCallback(
    (paths: readonly string[], actor: ChangeActor) => {
      const pid = projectRef.current;
      const affected = tabsRef.current.filter((t) => t.status === 'ready' && paths.some((p) => t.path === p || t.path.startsWith(`${p}/`)));
      for (const tab of affected) {
        void (async () => {
          try {
            const file = await api('files.read', { projectId: pid, path: tab.path });
            if (pid !== projectRef.current) return;
            const current = tabsRef.current.find((t) => t.path === tab.path);
            if (!current || current.saving || file.hash === current.hash) return;
            if (!current.dirty) applyDiskContent(tab.path, file, { reloaded: { at: Date.now(), actor } });
            else patch(tab.path, { external: { hash: file.hash, deleted: false, actor } });
          } catch (e) {
            if (!isRpcError(e, 'NOT_FOUND')) return;
            const current = tabsRef.current.find((t) => t.path === tab.path);
            if (!current || current.deleted) return;
            patch(tab.path, current.dirty ? { deleted: true, external: { hash: null, deleted: true, actor } } : { deleted: true });
          }
        })();
      }
    },
    [applyDiskContent, patch],
  );

  const handleRenamed = useCallback(
    (from: string, to: string) => {
      const pid = projectRef.current;
      const affected = tabsRef.current.filter((t) => t.path === from || t.path.startsWith(`${from}/`));
      const wasActive = activeRef.current;
      for (const tab of affected) {
        const newPath = to + tab.path.slice(from.length);
        if (tab.dirty) projectDrafts(pid).set(newPath, { content: contentRef.current.get(tab.path) ?? tab.savedContent, baseHash: tab.hash });
        projectDrafts(pid).delete(tab.path);
        removeTab(tab.path);
        open(newPath, { background: wasActive !== tab.path });
      }
    },
    [open, removeTab],
  );

  const handleDeleted = useCallback(
    (path: string) => {
      for (const tab of tabsRef.current.filter((t) => t.path === path || t.path.startsWith(`${path}/`))) {
        if (!tab.dirty) forceClose(tab.path);
        else patch(tab.path, { deleted: true, external: { hash: null, deleted: true, actor: 'user' } });
      }
    },
    [forceClose, patch],
  );

  // Restore the tabs of the last visit; reset everything when the project changes.
  useEffect(() => {
    mounted.current = true;
    tabsRef.current = [];
    contentRef.current = new Map();
    setTabsState([]);
    setActive(null);
    setReveal(null);
    const stored = readStoredTabs(projectId);
    const pending = projectDrafts(projectId);
    const paths = [...new Set([...stored.paths, ...pending.keys()])];
    for (const p of paths) open(p, { background: true });
    const active = stored.active && paths.includes(stored.active) ? stored.active : (paths[0] ?? null);
    if (active) setActive(active);
    setHydrated(projectId);
    return () => {
      mounted.current = false;
      disposeProjectModels(projectId);
    };
  }, [projectId, open, setActive]);

  // Remember open tabs per project (per-user convenience).
  useEffect(() => {
    if (hydrated !== projectId) return;
    writeStoredTabs(
      projectId,
      tabs.filter((t) => t.status !== 'error').map((t) => t.path),
      activePath,
    );
  }, [projectId, hydrated, tabs, activePath]);

  // Drop failed restores of the last visit silently (file deleted since then).
  useEffect(() => {
    const gone = tabs.filter((t) => t.status === 'error' && t.error === notFoundText() && t.path !== activePath);
    if (gone.length === 0) return;
    for (const t of gone) removeTab(t.path);
  }, [tabs, activePath, removeTab]);

  const active = useMemo(() => tabs.find((t) => t.path === activePath) ?? null, [tabs, activePath]);
  const unsavedCount = tabs.filter((t) => t.dirty).length;

  return {
    tabs,
    activePath,
    active,
    reveal,
    setActive,
    open,
    close,
    forceClose,
    save,
    overwrite,
    reload,
    handleChange,
    getContent,
    handleFilesChanged,
    handleRenamed,
    handleDeleted,
    unsavedCount,
  };
}
