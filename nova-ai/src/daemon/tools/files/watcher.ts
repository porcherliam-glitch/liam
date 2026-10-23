// FileWatcher (SPEC §6.3): detects changes made outside NOVA (other editors, Unity, tools) and emits
// files.changed {actor:'external'} so the editor/preview refresh.
// Key decisions:
// - fs.watch(root, {recursive:true}) per project (Windows: ReadDirectoryChangesW, one handle per project). Events
//   inside ignored folders (node_modules, .git, dist, build, Library …) and NOVA temp files are dropped.
// - Debounce 300 ms (at most 2 s delay while events keep coming), then paths the journal wrote in the last 2 s
//   (journal.recentlyWritten) are suppressed – NOVA's own writes are reported by the journal itself.
// - EMFILE/ENOSPC (inotify limits on Linux, handle exhaustion) or any later watcher error → fallback to a 5 s
//   size/mtime poll of the project tree (no links followed, ≤ 50 000 files).
// - At most 20 projects are watched; archived projects are skipped. Watch handles and timers are unref'd so they
//   never keep the daemon alive.
// - Platform and watch function are injectable for tests (Windows backslash paths, simulated EMFILE).
import { watch as fsWatch, realpathSync } from 'node:fs';
import type { FileWatcher, Services } from '../../contracts';
import { errorMessage } from '../../core/errors';
import { isIgnoredDirName, isNovaTempName, walkProjectFiles } from '../../changes/walk';

export interface WatchHandle {
  close(): void;
  on(event: 'error', listener: (e: Error) => void): unknown;
  unref?(): unknown;
}

export type WatchFn = (root: string, options: { recursive: boolean }, listener: (eventType: string, filename: string | Buffer | null) => void) => WatchHandle;

export interface FileWatcherOptions {
  platform?: NodeJS.Platform;
  watchFn?: WatchFn;
  debounceMs?: number;
  maxDelayMs?: number;
  pollIntervalMs?: number;
  suppressMs?: number;
  maxProjects?: number;
  maxPathsPerEvent?: number;
}

interface Entry {
  projectId: string;
  /** root as passed by the caller (project.path) */
  requestedRoot: string;
  /** canonical root (realpath) */
  root: string;
  handle: WatchHandle | null;
  pollTimer: NodeJS.Timeout | null;
  pollState: Map<string, string> | null;
  polling: boolean;
  pollBusy: boolean;
  pending: Set<string>;
  firstPendingAt: number;
  debounceTimer: NodeJS.Timeout | null;
  closed: boolean;
}

const FALLBACK_CODES = new Set(['EMFILE', 'ENFILE', 'ENOSPC', 'ENOSYS', 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM']);

/** Normalizes a watcher filename to a project-relative '/' path, or null when it must be ignored. */
export function normalizeWatchPath(filename: string, platform: NodeJS.Platform): string | null {
  let rel = platform === 'win32' ? filename.replace(/\\/g, '/') : filename;
  rel = rel.replace(/^\.\/+/, '').replace(/^\/+|\/+$/g, '');
  if (!rel) return '';
  const segments = rel.split('/');
  if (segments.some((seg) => isIgnoredDirName(seg))) return null;
  if (isNovaTempName(segments[segments.length - 1])) return null;
  return rel;
}

export function createFileWatcher(s: Services, opts: FileWatcherOptions = {}): FileWatcher {
  const platform = opts.platform ?? s.core.platform;
  const watchFn: WatchFn = opts.watchFn ?? ((root, o, listener) => fsWatch(root, { recursive: o.recursive, persistent: false }, listener));
  const debounceMs = opts.debounceMs ?? 300;
  const maxDelayMs = opts.maxDelayMs ?? 2000;
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const suppressMs = opts.suppressMs ?? 2000;
  const maxProjects = opts.maxProjects ?? 20;
  const maxPaths = opts.maxPathsPerEvent ?? 1000;
  const log = s.core.log.child('watcher');
  const entries = new Map<string, Entry>();
  const keyOf = (rel: string) => (platform === 'win32' ? rel.toLowerCase() : rel);

  function flush(entry: Entry): void {
    entry.debounceTimer = null;
    entry.firstPendingAt = 0;
    if (entry.closed || entry.pending.size === 0) return;
    const paths = [...entry.pending];
    entry.pending.clear();
    let recent = new Set<string>();
    try {
      recent = new Set([...s.journal.recentlyWritten(entry.projectId, suppressMs)].map(keyOf));
    } catch (e) {
      log.debug('Kürzlich geschriebene Dateien nicht abrufbar', { error: errorMessage(e) });
    }
    const external = paths.filter((p) => !recent.has(keyOf(p)));
    if (external.length === 0) return;
    external.sort();
    s.core.bus.emit('files.changed', { projectId: entry.projectId, paths: external.slice(0, maxPaths), actor: 'external' });
  }

  function schedule(entry: Entry, rel: string): void {
    if (entry.closed) return;
    entry.pending.add(rel);
    const now = Date.now();
    if (!entry.firstPendingAt) entry.firstPendingAt = now;
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    const delay = Math.max(0, Math.min(debounceMs, maxDelayMs - (now - entry.firstPendingAt)));
    entry.debounceTimer = setTimeout(() => flush(entry), delay);
    entry.debounceTimer.unref?.();
  }

  async function snapshot(root: string): Promise<Map<string, string>> {
    const walk = await walkProjectFiles(root, { maxFiles: 50_000 });
    const m = new Map<string, string>();
    for (const f of walk.files) m.set(f.rel, `${f.size}:${f.mtimeMs}`);
    return m;
  }

  async function pollOnce(entry: Entry): Promise<void> {
    if (entry.closed || entry.pollBusy) return;
    entry.pollBusy = true;
    try {
      const next = await snapshot(entry.root);
      if (entry.closed) return;
      const prev = entry.pollState;
      entry.pollState = next;
      if (!prev) return;
      for (const [rel, sig] of next) if (prev.get(rel) !== sig) schedule(entry, rel);
      for (const rel of prev.keys()) if (!next.has(rel)) schedule(entry, rel);
    } catch (e) {
      log.debug('Abfrage des Projektordners fehlgeschlagen', { projectId: entry.projectId, error: errorMessage(e) });
    } finally {
      entry.pollBusy = false;
    }
  }

  function startPolling(entry: Entry, reason: string): void {
    if (entry.closed || entry.polling) return;
    entry.polling = true;
    log.warn('Dateiüberwachung nutzt regelmäßige Abfrage', { projectId: entry.projectId, reason, intervalMs: pollIntervalMs });
    void pollOnce(entry);
    entry.pollTimer = setInterval(() => void pollOnce(entry), pollIntervalMs);
    entry.pollTimer.unref?.();
  }

  function closeHandle(entry: Entry): void {
    if (!entry.handle) return;
    try {
      entry.handle.close();
    } catch {
      /* already closed */
    }
    entry.handle = null;
  }

  const watcher: FileWatcher = {
    watch(projectId, root) {
      const existing = entries.get(projectId);
      if (existing && !existing.closed && (existing.requestedRoot === root || existing.root === root)) return;
      if (existing) watcher.unwatch(projectId);
      try {
        if (s.projects.get(projectId)?.status === 'archived') return;
      } catch {
        /* project service unavailable: watch anyway */
      }
      if (entries.size >= maxProjects) {
        log.warn('Dateiüberwachung: Höchstzahl überwachter Projekte erreicht', { projectId, max: maxProjects });
        return;
      }
      let canonical: string;
      try {
        canonical = realpathSync.native(root);
      } catch (e) {
        log.warn('Projektordner für die Dateiüberwachung nicht gefunden', { projectId, error: errorMessage(e) });
        return;
      }
      const entry: Entry = {
        projectId,
        requestedRoot: root,
        root: canonical,
        handle: null,
        pollTimer: null,
        pollState: null,
        polling: false,
        pollBusy: false,
        pending: new Set(),
        firstPendingAt: 0,
        debounceTimer: null,
        closed: false,
      };
      entries.set(projectId, entry);
      try {
        entry.handle = watchFn(canonical, { recursive: true }, (_type, filename) => {
          if (entry.closed) return;
          if (filename === null || filename === undefined) return schedule(entry, '');
          const rel = normalizeWatchPath(String(filename), platform);
          if (rel !== null) schedule(entry, rel);
        });
        entry.handle.on('error', (e: Error) => {
          const code = (e as NodeJS.ErrnoException).code ?? 'unknown';
          closeHandle(entry);
          startPolling(entry, `Überwachungsfehler ${code}`);
        });
        entry.handle.unref?.();
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code ?? '';
        if (FALLBACK_CODES.has(code)) {
          startPolling(entry, code);
        } else {
          log.warn('Dateiüberwachung konnte nicht gestartet werden – nutze regelmäßige Abfrage', { projectId, error: errorMessage(e) });
          startPolling(entry, code || 'unbekannt');
        }
      }
    },

    unwatch(projectId) {
      const entry = entries.get(projectId);
      if (!entry) return;
      entry.closed = true;
      closeHandle(entry);
      if (entry.pollTimer) clearInterval(entry.pollTimer);
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      entry.pending.clear();
      entries.delete(projectId);
    },

    unwatchAll() {
      for (const id of [...entries.keys()]) watcher.unwatch(id);
    },
  };
  return watcher;
}
