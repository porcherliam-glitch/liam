// FileService: the editor's view of a project (tree, read, user edits, search, changed files, history, diffs).
// Key decisions:
// - Every path goes through PathGuard; every user change goes through the ChangeJournal with actor 'user'
//   (undoable, visible in the history). Rename = journaled create at the target + journaled delete of the source.
// - tree(): never follows symlinks/junctions (listed as dirs with children=null), ignored folders (node_modules,
//   .git, dist …) are listed but not descended, at most 20 000 nodes per call. changedByNova comes from
//   journal.changedFiles (cached for 3 s, invalidated by files.changed), gitStatus from git.status when the project
//   is a repository; projects.refreshGit is called lazily (at most once per minute and project).
// - read(): at most 2 MB of content (truncated=true beyond; the hash is always of the whole file – the editor must
//   treat truncated files as read-only), binary = NUL in the first 8 KB, BOM stripped, legacy 8-bit files decoded
//   losslessly (write() re-encodes them with the original encoding/BOM, so an editor round trip changes no bytes).
// - search(): worker-thread search with timeout (see search.ts).
// - diff(): before = snapshot before the first non-reverted NOVA change of the file (optionally of one task, or of one
//   exact change); files NOVA never changed are compared with git HEAD when available.
import { lstatSync, mkdirSync, readFileSync, rmdirSync, statSync, existsSync } from 'node:fs';
import { open, readdir, lstat, readFile, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { ChangedFile, FileContent, FileNode, Project } from '@shared/schemas';
import type { FileService, Services } from '../../contracts';
import { NovaError, conflict, errorMessage, validation } from '../../core/errors';
import { renameWithRetry } from '../../core/fs-atomic';
import { sha256, sha256File } from '../../changes/blob-store';
import { unifiedDiff } from '../../changes/diff';
import { isIgnoredDirName, isNovaTempName } from '../../changes/walk';
import { languageForPath } from './language';
import { buildPreview, searchProjectFiles } from './search';
import { decodeText, encodeText, isBinaryContent, utf8SafeSlice } from './text';

export const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;
const MAX_FOLDER_OPERATION_FILES = 2000;
const CHANGED_CACHE_MS = 3000;
const GIT_REFRESH_MS = 60_000;

export interface FileServiceOptions {
  treeNodeBudget?: number;
  searchTimeoutMs?: number;
}

interface FolderContent {
  files: string[]; // rel paths
  dirs: string[]; // rel paths, parents before children
}

function notFoundFile(rel: string): NovaError {
  return new NovaError('NOT_FOUND', `Die Datei „${rel || '.'}“ wurde nicht gefunden.`, { severity: 'warning' });
}

function sortNodes(a: FileNode, b: FileNode): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  const x = a.name.toLowerCase();
  const y = b.name.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a.name < b.name ? -1 : 1;
}

/** Reads at most `max` bytes from the start of a file. */
async function readHead(abs: string, max: number): Promise<Buffer> {
  const fh = await open(abs, 'r');
  try {
    const buf = Buffer.alloc(max);
    let off = 0;
    while (off < max) {
      const { bytesRead } = await fh.read(buf, off, max - off, off);
      if (bytesRead === 0) break;
      off += bytesRead;
    }
    return buf.subarray(0, off);
  } finally {
    await fh.close();
  }
}

/** Cuts decoded-to-be content at a character boundary (UTF-16 even, UTF-8 sequence aware). */
function cutForDecode(buf: Buffer, max: number): Buffer {
  if (buf.length <= max) return buf;
  const utf16 = buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff));
  if (utf16) return buf.subarray(0, max - (max % 2));
  return utf8SafeSlice(buf, max);
}

export function createFileService(s: Services, opts: FileServiceOptions = {}): FileService {
  const log = s.core.log.child('files');
  const treeBudget = opts.treeNodeBudget ?? 20_000;
  const changedCache = new Map<string, { at: number; files: ChangedFile[] }>();
  const gitRefreshedAt = new Map<string, number>();
  const keyOf = (rel: string) => (s.core.platform === 'win32' ? rel.toLowerCase() : rel);
  const now = () => s.core.clock.now();

  // Subscribing to the bus inside the factory is allowed (core).
  s.core.bus.on('files.changed', (e) => changedCache.delete(e.projectId));

  function project(projectId: string): Project {
    return s.projects.require(projectId);
  }

  async function maybeRefreshGit(p: Project): Promise<Project> {
    const last = gitRefreshedAt.get(p.id) ?? 0;
    if (now() - last < GIT_REFRESH_MS) return p;
    gitRefreshedAt.set(p.id, now());
    try {
      return await s.projects.refreshGit(p.id);
    } catch (e) {
      log.debug('Git-Status des Projekts konnte nicht aktualisiert werden', { error: errorMessage(e) });
      return p;
    }
  }

  async function novaChanged(p: Project): Promise<ChangedFile[]> {
    const cached = changedCache.get(p.id);
    if (cached && now() - cached.at < CHANGED_CACHE_MS) return cached.files;
    let files: ChangedFile[] = [];
    try {
      files = await s.journal.changedFiles(p.id, p.path);
    } catch (e) {
      log.warn('Von NOVA geänderte Dateien konnten nicht ermittelt werden', { error: errorMessage(e) });
    }
    changedCache.set(p.id, { at: now(), files });
    return files;
  }

  async function gitFiles(p: Project): Promise<{ path: string; xy: string }[] | null> {
    if (!p.gitAvailable) return null;
    try {
      const st = await s.git.status(p.path);
      if (!st.isRepo) return null;
      return st.files.map((f) => ({ path: f.path.replace(/\\/g, '/'), xy: `${f.index}${f.workTree}` }));
    } catch (e) {
      log.debug('git status nicht verfügbar', { error: errorMessage(e) });
      return null;
    }
  }

  async function gitStatusMap(p: Project): Promise<Map<string, string> | null> {
    const files = await gitFiles(p);
    return files ? new Map(files.map((f) => [keyOf(f.path), f.xy])) : null;
  }

  /** True when the entry named by the caller's (non-canonical) path is itself a symlink/junction. */
  function isLinkEntry(p: Project, input: string): boolean {
    const trimmed = input.trim();
    const lexical = isAbsolute(trimmed) ? trimmed : join(p.path, trimmed);
    try {
      return lstatSync(lexical).isSymbolicLink();
    } catch {
      return false;
    }
  }

  /** Files and folders below a folder (no links allowed, bounded). */
  async function folderContent(rootAbs: string, rel: string): Promise<FolderContent> {
    const out: FolderContent = { files: [], dirs: [] };
    const stack = [rel];
    while (stack.length) {
      const dirRel = stack.pop()!;
      out.dirs.push(dirRel);
      const entries = await readdir(join(rootAbs, ...dirRel.split('/')), { withFileTypes: true });
      for (const e of entries) {
        const childRel = `${dirRel}/${e.name}`;
        if (e.isSymbolicLink()) {
          throw validation(`Der Ordner „${rel}“ enthält eine Verknüpfung („${childRel}“). Solche Ordner können in NOVA nicht gelöscht oder umbenannt werden – bitte den Windows-Explorer verwenden.`);
        }
        if (e.isDirectory()) stack.push(childRel);
        else if (e.isFile()) {
          out.files.push(childRel);
          if (out.files.length > MAX_FOLDER_OPERATION_FILES) {
            throw validation(`Der Ordner „${rel}“ enthält mehr als ${MAX_FOLDER_OPERATION_FILES} Dateien. Er kann in NOVA nicht sicher (mit Sicherung jeder Datei) verändert werden – bitte den Windows-Explorer verwenden.`);
          }
        }
      }
    }
    return out;
  }

  function removeEmptyDirs(rootAbs: string, dirs: string[]): void {
    for (const d of [...dirs].reverse()) {
      try {
        rmdirSync(join(rootAbs, ...d.split('/')));
      } catch {
        /* not empty (e.g. temp files of another program) – leave it */
      }
    }
  }

  const service: FileService = {
    async tree(projectId, path, depth) {
      let p = project(projectId);
      p = await maybeRefreshGit(p);
      const r = s.pathGuard.resolve(p.path, path || '.');
      const st = await stat(r.abs).catch(() => null);
      if (!st) throw notFoundFile(r.rel);
      const changed = await novaChanged(p);
      const changedKeys = new Set<string>();
      for (const c of changed) {
        const k = keyOf(c.path);
        changedKeys.add(k);
        const parts = k.split('/');
        for (let i = 1; i < parts.length; i++) changedKeys.add(parts.slice(0, i).join('/'));
      }
      const git = await gitStatusMap(p);
      const rootName = basename(p.path) || p.path;
      if (st.isFile()) {
        return { name: basename(r.rel), path: r.rel, type: 'file', size: st.size, children: null, changedByNova: changedKeys.has(r.key), gitStatus: git?.get(r.key) ?? null };
      }
      let budget = treeBudget;
      const build = async (abs: string, rel: string, depthLeft: number): Promise<FileNode[] | null> => {
        if (depthLeft <= 0) return null;
        let entries;
        try {
          entries = await readdir(abs, { withFileTypes: true });
        } catch {
          return [];
        }
        const nodes: FileNode[] = [];
        const files: { name: string; rel: string; abs: string }[] = [];
        for (const e of entries) {
          if (budget <= 0) break;
          if (isNovaTempName(e.name)) continue;
          const childRel = rel ? `${rel}/${e.name}` : e.name;
          const key = keyOf(childRel);
          if (e.isSymbolicLink()) {
            budget--;
            nodes.push({ name: e.name, path: childRel, type: 'dir', size: null, children: null, changedByNova: changedKeys.has(key), gitStatus: git?.get(key) ?? null });
          } else if (e.isDirectory()) {
            budget--;
            const children = isIgnoredDirName(e.name) ? null : await build(join(abs, e.name), childRel, depthLeft - 1);
            nodes.push({ name: e.name, path: childRel, type: 'dir', size: null, children, changedByNova: changedKeys.has(key), gitStatus: git?.get(key) ?? null });
          } else if (e.isFile()) {
            budget--;
            files.push({ name: e.name, rel: childRel, abs: join(abs, e.name) });
          }
        }
        const sizes = await Promise.all(files.map((f) => lstat(f.abs).then((x) => x.size).catch(() => null)));
        files.forEach((f, i) => {
          const key = keyOf(f.rel);
          nodes.push({ name: f.name, path: f.rel, type: 'file', size: sizes[i], children: null, changedByNova: changedKeys.has(key), gitStatus: git?.get(key) ?? null });
        });
        nodes.sort(sortNodes);
        return nodes;
      };
      const children = await build(r.abs, r.rel, depth);
      return { name: r.rel ? basename(r.rel) : rootName, path: r.rel, type: 'dir', size: null, children, changedByNova: r.rel ? changedKeys.has(r.key) : changed.length > 0, gitStatus: null };
    },

    async read(projectId, path) {
      const p = project(projectId);
      const r = s.pathGuard.resolve(p.path, path);
      if (!r.rel) throw validation('Der Projektordner ist keine Datei.');
      const st = await stat(r.abs).catch(() => null);
      if (!st) throw notFoundFile(r.rel);
      if (st.isDirectory()) throw validation(`„${r.rel}“ ist ein Ordner, keine Datei.`);
      let head: Buffer;
      let hash: string;
      const truncated = st.size > MAX_READ_BYTES;
      if (truncated) {
        head = await readHead(r.abs, MAX_READ_BYTES);
        hash = await sha256File(r.abs);
      } else {
        head = await readFile(r.abs);
        hash = sha256(head);
      }
      const binary = isBinaryContent(head);
      const content = binary ? '' : decodeText(cutForDecode(head, MAX_READ_BYTES)).text;
      return { path: r.rel, content, encoding: binary ? 'binary' : 'utf8', size: st.size, hash, mtime: st.mtimeMs, language: languageForPath(r.rel), truncated };
    },

    async write(projectId, path, content, expectedHash) {
      const p = project(projectId);
      const r = s.pathGuard.resolve(p.path, path);
      if (!r.rel) throw validation('Bitte eine Datei angeben, nicht den Projektordner.');
      let current: Buffer | null = null;
      try {
        const st = statSync(r.abs);
        if (st.isDirectory()) throw validation(`„${r.rel}“ ist ein Ordner, keine Datei.`);
        current = readFileSync(r.abs);
      } catch (e) {
        if (e instanceof NovaError) throw e;
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      }
      const currentHash = current ? sha256(current) : null;
      if (expectedHash !== null && expectedHash !== currentHash) {
        throw conflict(
          currentHash === null
            ? `„${r.rel}“ wurde inzwischen gelöscht. Bitte die Änderung als neue Datei speichern oder verwerfen.`
            : `„${r.rel}“ wurde inzwischen geändert (z. B. von einem Agenten oder einem anderen Programm). Bitte die Datei neu laden und die Änderung erneut vornehmen.`,
          { path: r.rel, currentHash },
        );
      }
      let data: Buffer;
      if (current && !isBinaryContent(current)) {
        const d = decodeText(current);
        data = encodeText(content, { bom: d.bom, encoding: d.encoding }).data;
      } else {
        data = encodeText(content, { bom: false, encoding: 'utf8' }).data;
      }
      await s.journal.writeFile({ projectId, projectRoot: p.path, relPath: r.rel, content: data, actor: 'user', source: 'user' });
      return service.read(projectId, r.rel) as Promise<FileContent>;
    },

    async delete(projectId, path) {
      const p = project(projectId);
      if (isLinkEntry(p, path)) throw validation('Verknüpfungen können in NOVA nicht gelöscht werden – bitte den Windows-Explorer verwenden.');
      const r = s.pathGuard.resolve(p.path, path);
      if (!r.rel) throw validation('Der Projektordner selbst kann nicht gelöscht werden.');
      const st = await stat(r.abs).catch(() => null);
      if (!st) throw notFoundFile(r.rel);
      if (st.isFile()) {
        await s.journal.deleteFile({ projectId, projectRoot: p.path, relPath: r.rel, actor: 'user', source: 'user' });
        return;
      }
      if (!st.isDirectory()) throw validation(`„${r.rel}“ ist keine normale Datei.`);
      const root = s.pathGuard.resolve(p.path, '.').abs;
      const content = await folderContent(root, r.rel);
      for (const f of content.files) await s.journal.deleteFile({ projectId, projectRoot: p.path, relPath: f, actor: 'user', source: 'user' });
      removeEmptyDirs(root, content.dirs);
      s.core.bus.emit('files.changed', { projectId, paths: [r.rel], actor: 'user' });
    },

    async rename(projectId, from, to) {
      const p = project(projectId);
      if (isLinkEntry(p, from)) throw validation('Verknüpfungen können in NOVA nicht umbenannt werden – bitte den Windows-Explorer verwenden.');
      const a = s.pathGuard.resolve(p.path, from);
      const b = s.pathGuard.resolve(p.path, to);
      if (!a.rel || !b.rel) throw validation('Der Projektordner selbst kann nicht umbenannt werden.');
      const st = await stat(a.abs).catch(() => null);
      if (!st) throw notFoundFile(a.rel);
      if (a.key === b.key) {
        // Same canonical file. On a case-insensitive file system PathGuard returns the ON-DISK case for an existing
        // target, so the requested spelling is taken from the caller's input (already validated by resolve()).
        const requestedName = to.trim().replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '';
        const currentName = basename(a.abs);
        if (!requestedName || requestedName === currentName) return;
        // Case-only rename: content is unchanged, nothing to journal.
        renameWithRetry(a.abs, join(dirname(a.abs), requestedName));
        const newRel = a.rel.slice(0, a.rel.length - currentName.length) + requestedName;
        s.core.bus.emit('files.changed', { projectId, paths: [a.rel, newRel], actor: 'user' });
        return;
      }
      if (b.key.startsWith(`${a.key}/`)) throw validation('Ein Ordner kann nicht in sich selbst verschoben werden.');
      if (existsSync(b.abs)) throw conflict(`„${b.rel}“ existiert bereits.`, { path: b.rel });
      if (st.isFile()) {
        const data = readFileSync(a.abs);
        await s.journal.writeFile({ projectId, projectRoot: p.path, relPath: b.rel, content: data, actor: 'user', source: 'user' });
        await s.journal.deleteFile({ projectId, projectRoot: p.path, relPath: a.rel, actor: 'user', source: 'user' });
        return;
      }
      if (!st.isDirectory()) throw validation(`„${a.rel}“ ist keine normale Datei.`);
      const root = s.pathGuard.resolve(p.path, '.').abs;
      const content = await folderContent(root, a.rel);
      const target = (rel: string) => b.rel + rel.slice(a.rel.length);
      for (const d of content.dirs) mkdirSync(join(root, ...target(d).split('/')), { recursive: true });
      for (const f of content.files) {
        const data = readFileSync(join(root, ...f.split('/')));
        await s.journal.writeFile({ projectId, projectRoot: p.path, relPath: target(f), content: data, actor: 'user', source: 'user' });
        await s.journal.deleteFile({ projectId, projectRoot: p.path, relPath: f, actor: 'user', source: 'user' });
      }
      removeEmptyDirs(root, content.dirs);
      s.core.bus.emit('files.changed', { projectId, paths: [a.rel, b.rel], actor: 'user' });
    },

    async mkdir(projectId, path) {
      const p = project(projectId);
      const r = s.pathGuard.resolve(p.path, path);
      if (!r.rel) return;
      const st = await stat(r.abs).catch(() => null);
      if (st) {
        if (st.isDirectory()) return;
        throw conflict(`„${r.rel}“ existiert bereits als Datei.`, { path: r.rel });
      }
      try {
        mkdirSync(r.abs, { recursive: true });
      } catch (e) {
        throw new NovaError('VALIDATION', `Der Ordner „${r.rel}“ konnte nicht angelegt werden: ${errorMessage(e)}`, { severity: 'warning', cause: e });
      }
      s.core.bus.emit('files.changed', { projectId, paths: [r.rel], actor: 'user' });
    },

    snapshot(projectId, hash) {
      project(projectId);
      const owned = s.core.db.get('SELECT 1 AS x FROM changes WHERE project_id = ? AND (before_hash = ? OR after_hash = ?) LIMIT 1', [projectId, hash, hash]);
      if (!owned) throw new NovaError('NOT_FOUND', 'Diese Dateiversion gehört nicht zu diesem Projekt.', { severity: 'warning' });
      const blob = s.journal.readSnapshot(hash);
      if (!blob) throw new NovaError('NOT_FOUND', 'Diese Dateiversion ist nicht mehr gespeichert (Sicherung nicht mehr vorhanden).', { severity: 'warning' });
      if (blob.length > MAX_SNAPSHOT_BYTES) throw validation('Diese Dateiversion ist zu groß für die Anzeige (über 10 MB).');
      if (isBinaryContent(blob)) return { content: '', binary: true };
      return { content: decodeText(blob).text, binary: false };
    },

    async search(projectId, query, o) {
      const p = project(projectId);
      const root = s.pathGuard.resolve(p.path, '.').abs;
      const res = await searchProjectFiles({ root, query, regex: o.regex, caseSensitive: o.caseSensitive, limit: Math.max(1, Math.min(o.limit, 5000)), timeoutMs: opts.searchTimeoutMs });
      if (res.timedOut) log.info('Suche nach Zeitlimit beendet', { projectId, results: res.matches.length });
      return res.matches.map((m) => ({ path: m.path, line: m.line, column: m.column, preview: buildPreview(m) }));
    },

    async changed(projectId) {
      const p = project(projectId);
      const nova = await novaChanged(p);
      const git = await gitFiles(p);
      const gitMap = new Map((git ?? []).map((f) => [keyOf(f.path), f.xy]));
      const out: ChangedFile[] = nova.map((c) => ({ ...c, gitStatus: gitMap.get(keyOf(c.path)) ?? null }));
      const seen = new Set(out.map((c) => keyOf(c.path)));
      for (const f of git ?? []) {
        if (seen.has(keyOf(f.path))) continue;
        const op: ChangedFile['op'] = f.xy.includes('?') || f.xy.includes('A') ? 'create' : f.xy.includes('D') ? 'delete' : 'modify';
        out.push({ path: f.path, op, byNova: false, taskIds: [], gitStatus: f.xy, modifiedSinceNova: false });
      }
      out.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
      return out;
    },

    history(projectId, filter) {
      const p = project(projectId);
      const rel = filter.path ? s.pathGuard.resolve(p.path, filter.path).rel : undefined;
      return s.journal.list({ projectId, path: rel, taskId: filter.taskId, includeReverted: true, limit: filter.limit });
    },

    async diff(projectId, path, o = {}) {
      const p = project(projectId);
      const r = s.pathGuard.resolve(p.path, path);
      if (!r.rel) throw validation('Bitte eine Datei angeben.');
      let baseline: string | null | undefined; // undefined = no NOVA change recorded
      if (o.changeId !== undefined) {
        const rec = s.journal.get(o.changeId);
        if (!rec || rec.projectId !== projectId) throw new NovaError('NOT_FOUND', 'Diese Änderung wurde nicht gefunden.', { severity: 'warning' });
        if (keyOf(rec.path) !== r.key) throw validation('Diese Änderung gehört zu einer anderen Datei.');
        baseline = rec.beforeHash;
      } else {
        const recs = s.journal.list({ projectId, path: r.rel, taskId: o.taskId, includeReverted: false, limit: 5000 }).filter((c) => c.actor === 'nova');
        if (recs.length > 0) baseline = recs[recs.length - 1].beforeHash; // list is newest first
      }
      const current = await readFile(r.abs).catch((e: NodeJS.ErrnoException) => {
        if (e.code === 'ENOENT' || e.code === 'ENOTDIR') return null;
        if (e.code === 'EISDIR') throw validation(`„${r.rel}“ ist ein Ordner.`);
        throw e;
      });
      let original: Buffer;
      if (baseline === undefined) {
        let head: Buffer | null = null;
        if (p.gitAvailable) head = await s.git.showFile(p.path, 'HEAD', r.rel).catch(() => null);
        original = head ?? (p.gitAvailable ? Buffer.alloc(0) : (current ?? Buffer.alloc(0)));
      } else if (baseline === null) {
        original = Buffer.alloc(0);
      } else {
        const blob = s.journal.readSnapshot(baseline);
        if (!blob) throw new NovaError('NOT_FOUND', 'Die Sicherung der früheren Version ist nicht mehr vorhanden.', { severity: 'warning' });
        original = blob;
      }
      const modified = current ?? Buffer.alloc(0);
      if (isBinaryContent(original) || isBinaryContent(modified)) {
        return { path: r.rel, original: '', modified: '', unified: original.equals(modified) ? '' : 'Binärdateien unterscheiden sich.\n', binary: true };
      }
      if (original.length > MAX_DIFF_BYTES || modified.length > MAX_DIFF_BYTES) {
        return { path: r.rel, original: '', modified: '', unified: original.equals(modified) ? '' : 'Die Datei ist zu groß für eine Vergleichsansicht (über 2 MB).\n', binary: true };
      }
      const a = decodeText(original).text;
      const b = decodeText(modified).text;
      return { path: r.rel, original: a, modified: b, unified: unifiedDiff(a, b, r.rel), binary: false };
    },
  };
  return service;
}
