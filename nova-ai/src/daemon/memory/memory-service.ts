// MemoryService (SPEC §4.7, §6.7): per-project memory and the cross-project knowledge base on top of the
// memory_entries table and its FTS5 index memory_fts.
//
// Key decisions:
// - projectId semantics exactly as in the contract: undefined = everything, null = global knowledge base,
//   string = that project (search: + SHAREABLE global entries when includeGlobal, default true).
// - Writes: title/content/tags are redacted (guard.ts); content that is mainly a credential is rejected with
//   VALIDATION. Disabled memory → VALIDATION "Das Gedächtnis ist deaktiviert …" for every add/import; source 'agent'
//   additionally needs settings.memory.agentsMayWrite. Agent entries are shareable only for kind 'insight' and only
//   when autoShareAgentInsights is on (an agent may still opt out with shareable:false). User/system entries keep the
//   requested shareable flag. update/delete/clear/list/search/export stay available while memory is disabled, so
//   the user can always inspect, correct and delete stored data (MASTERPROMPT §10).
// - add() de-duplicates exact repeats (same scope, kind, title and content): the existing entry is refreshed
//   (updatedAt, merged tags) and returned instead of creating a copy – agents tend to write the same note again.
// - Search: FTS5 (prefix terms, OR, German spelling variants, bm25, snippet()); when there is no usable FTS term
//   ("C++", "#") or the FTS search finds nothing, a LIKE substring search runs (it also finds parts of German
//   compound words: "verbindung" → "Datenbankverbindung"). A broken FTS index is rebuilt once (at most every
//   10 minutes) and the LIKE search is used meanwhile.
// - contextFor: (1) goals, requirements, conventions, decisions of the project – kind priority, newest first;
//   (2) FTS matches of the query inside the project; (3) if useGlobalKnowledge: shareable entries of the global
//   knowledge base and shareable INSIGHTS of other projects that match the query, then the remaining shareable global
//   entries (newest first). Other projects' insights that do not match the query are left out (noise), non-shareable
//   entries of other projects never appear. Shared entries are anonymised (paths → <Projektpfad>, source project
//   name/folder → <Projekt>). Limit = min(input.limit, settings.memory.maxContextEntries); up to a quarter of the
//   slots is reserved for (2)/(3) when such entries exist, so many decisions cannot crowd out relevant matches.
//   Every returned entry is redacted again (secrets registered after the entry was stored).
// - removeProject deletes the non-shareable entries; the shareable ones stay (knowledge base) but references to the
//   removed project (root folder, name) are replaced by placeholders first. Project name/path come from
//   s.projects.get or – because ProjectService deletes its row before calling removeProject – from a small cache
//   fed by 'project.updated' events and earlier lookups.
// - Export/import: JSON files (export-format.ts), written atomically; CPU work runs in chunks with event-loop yields
//   and honours AbortSignal; an import is committed in ONE synchronous transaction at the end (all or nothing).
//   Imports skip existing ids, exact duplicates, invalid entries, mainly-secret entries and entries of unknown
//   projects (after trying to map them by folder or unique name).
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { MemoryEntry, MemoryKind, MemorySearchResult, Project } from '@shared/schemas';
import { MemoryKind as MemoryKindSchema } from '@shared/schemas';
import type { MemoryAddInput, MemoryService, Services } from '../contracts';
import type { SqlValue } from '../db/database';
import { NovaError, errorMessage, notFound, validation } from '../core/errors';
import { atomicWriteFile } from '../core/fs-atomic';
import { newId } from '../core/ids';
import { anonymizeProjectReferences, anonymizeSharedText, isWindowsStylePath, type AnonymizeSource } from './anonymize';
import {
  MAX_IMPORT_BYTES,
  MEMORY_EXPORT_FORMAT,
  MEMORY_EXPORT_VERSION,
  MemoryExportEnvelopeSchema,
  MemoryImportEntrySchema,
  defaultExportFileName,
  scopeFileLabel,
  type MemoryExportProject,
  type MemoryExportScope,
} from './export-format';
import { CONTENT_MAX, TITLE_MAX, normalizeTags, redactMemoryText, sanitizeContent, sanitizeText, sanitizeTitle } from './guard';
import { MemoryStore, scopeSql, toEntry, type FtsHit, type MemoryRow, type MemoryScope } from './store';
import { buildFtsQuery, buildFtsQueryFromTerms, escapeLike, extractTerms, likeNeedles, plainSnippet } from './text';

/** Progress/cancel hooks for export/import (wired to core.operations by the RPC layer). */
export interface MemoryIoOptions {
  signal?: AbortSignal;
  /** progress 0..100 or null; German message. */
  onProgress?: (progress: number | null, message?: string) => void;
}

/** MemoryService plus optional progress/cancel support for the long operations. */
export interface MemoryServiceImpl extends MemoryService {
  exportTo(projectId: string | null | undefined, path?: string, opts?: MemoryIoOptions): Promise<{ path: string; count: number }>;
  importFrom(path: string, opts?: MemoryIoOptions): Promise<{ imported: number; skipped: number }>;
}

export interface MemoryServiceOptions {
  /** Entries processed between two event-loop yields during export/import (default 250). */
  chunkSize?: number;
}

const SOURCES: ReadonlyArray<MemoryEntry['source']> = ['user', 'agent', 'system'];
const PROJECT_CACHE_MAX = 256;
const FTS_REPAIR_INTERVAL_MS = 10 * 60 * 1000;
const LIKE_MAX_TERMS = 6;
const LIKE_MAX_PATTERNS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

const yieldNow = () => new Promise<void>((r) => setImmediate(r));

function cancelledError(signal: AbortSignal): NovaError {
  const reason: unknown = signal.reason;
  if (reason instanceof NovaError) return reason;
  return new NovaError('CANCELLED', 'Der Vorgang wurde abgebrochen.', { severity: 'warning' });
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError(signal);
}

function clampLimit(value: number | undefined, fallback: number, max: number): number {
  const n = value === undefined || !Number.isFinite(value) ? fallback : Math.floor(value);
  return Math.max(0, Math.min(max, n));
}

function roundScore(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function codePoints(s: string): number {
  return Array.from(s).length;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** Identity of an entry's content (scope, kind, title, content) for duplicate detection within one import. */
function contentFingerprint(e: MemoryEntry): string {
  return createHash('sha1').update(JSON.stringify([e.projectId, e.kind, e.title, e.content])).digest('hex');
}

function parseKind(kind: unknown): MemoryKind {
  const parsed = MemoryKindSchema.safeParse(kind);
  if (!parsed.success) throw validation(`Unbekannte Art des Gedächtniseintrags: ${String(kind)}`);
  return parsed.data;
}

function disabledError(): NovaError {
  return validation('Das Gedächtnis ist deaktiviert. Es kann unter Einstellungen → Gedächtnis eingeschaltet werden.');
}

export function createMemoryService(s: Services, options: MemoryServiceOptions = {}): MemoryServiceImpl {
  const log = s.core.log.child('memory');
  const store = new MemoryStore(s.core.db);
  const chunkSize = Math.max(1, options.chunkSize ?? 250);
  const projectCache = new Map<string, { name: string; path: string }>();
  let lastFtsRepairAt = Number.NEGATIVE_INFINITY;

  // The bus is core: subscribing in the factory is allowed (contracts.ts header).
  s.core.bus.on('project.updated', (p) => rememberProject(p));
  s.core.bus.on('project.removed', ({ id }) => projectCache.delete(id));

  const settings = () => s.core.settings.section('memory');
  const now = () => s.core.clock.now();

  function emit(payload: MemoryEntry | { id: string; deleted: true; projectId: string | null } | { projectId: string | null; cleared: true; count: number }): void {
    s.core.bus.emit('memory.updated', payload);
  }

  function rememberProject(p: Pick<Project, 'id' | 'name' | 'path'>): void {
    if (!p || typeof p.id !== 'string') return;
    projectCache.delete(p.id);
    projectCache.set(p.id, { name: p.name, path: p.path });
    while (projectCache.size > PROJECT_CACHE_MAX) {
      const oldest = projectCache.keys().next().value;
      if (oldest === undefined) break;
      projectCache.delete(oldest);
    }
  }

  /** Name/path of a project: live lookup first (tolerant), then the cache. */
  function projectInfo(id: string): AnonymizeSource | null {
    try {
      const p = s.projects.get(id);
      if (p) {
        rememberProject(p);
        return { name: p.name, path: p.path };
      }
    } catch (e) {
      log.debug('Projekt konnte für das Gedächtnis nicht gelesen werden', { projectId: id, error: errorMessage(e) });
    }
    return projectCache.get(id) ?? null;
  }

  function scopeOf(projectId: string | null | undefined, includeGlobal: boolean): MemoryScope {
    if (projectId === undefined) return includeGlobal ? { type: 'all' } : { type: 'allProjects' };
    if (projectId === null) return { type: 'global' };
    if (typeof projectId !== 'string' || !projectId) throw validation('Ungültige Projektkennung.');
    return { type: 'project', projectId, includeSharedGlobal: includeGlobal };
  }

  /** FTS query with one repair attempt for a broken index; null → caller uses the LIKE search. */
  function safeFts(match: string, where: { sql: string; params: SqlValue[] }, limit: number): FtsHit[] | null {
    try {
      return store.fts(match, where, limit);
    } catch (e) {
      const message = errorMessage(e);
      if (/malformed|corrupt|missing row|fts5/i.test(message) && now() - lastFtsRepairAt > FTS_REPAIR_INTERVAL_MS) {
        lastFtsRepairAt = now();
        try {
          store.rebuildIndex();
          log.warn('Suchindex des Gedächtnisses wurde neu aufgebaut', { error: message });
          return store.fts(match, where, limit);
        } catch (e2) {
          log.error('Suchindex des Gedächtnisses ist beschädigt – einfache Suche wird verwendet', { error: errorMessage(e2) });
          return null;
        }
      }
      log.warn('Volltextsuche im Gedächtnis fehlgeschlagen – einfache Suche wird verwendet', { error: message });
      return null;
    }
  }

  function snippetFor(entry: MemoryEntry, needles: readonly string[]): string {
    return plainSnippet(entry.content, needles) || plainSnippet(entry.title, needles);
  }

  /** LIKE substring search: per-term needles (≥ 3 characters) or, without such terms, the whole query. */
  function likeSearch(query: string, terms: readonly string[], where: { sql: string; params: SqlValue[] }, limit: number): MemorySearchResult[] {
    const longTerms = terms
      .filter((t) => codePoints(t) >= 3)
      .map((term, index) => ({ term, index }))
      .sort((a, b) => codePoints(b.term) - codePoints(a.term) || a.index - b.index)
      .slice(0, LIKE_MAX_TERMS)
      .map((x) => x.term);
    const groups = longTerms.length > 0 ? longTerms.map((t) => likeNeedles(t)) : [[query]];
    const needles = [...new Set(groups.flat())].slice(0, LIKE_MAX_PATTERNS);
    const rows = store.like(
      needles.map((n) => `%${escapeLike(n)}%`),
      where,
      Math.min(limit * 3, 600),
    );
    const scored = rows.map((row) => {
      const entry = toEntry(row);
      const title = entry.title.toLowerCase();
      const body = `${entry.content}\n${entry.tags.join(' ')}`.toLowerCase();
      let points = 0;
      for (const group of groups) {
        const lowered = group.map((n) => n.toLowerCase());
        if (lowered.some((n) => title.includes(n))) points += 2;
        else if (lowered.some((n) => body.includes(n))) points += 1;
      }
      // LIKE results always rank below FTS results: score in (0, 0.5].
      const score = roundScore((Math.max(points, 1) / (2 * groups.length)) * 0.5);
      return { ...entry, score, snippet: snippetFor(entry, needles) };
    });
    scored.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
    return scored.slice(0, limit);
  }

  function redactEntry(e: MemoryEntry): MemoryEntry {
    return { ...e, title: redactMemoryText(e.title), content: redactMemoryText(e.content), tags: e.tags.map((t) => redactMemoryText(t)) };
  }

  function anonymizeEntry(e: MemoryEntry): MemoryEntry {
    const source = e.projectId ? projectInfo(e.projectId) : null;
    const platform = s.core.platform;
    return {
      ...e,
      title: anonymizeSharedText(e.title, source, platform),
      content: anonymizeSharedText(e.content, source, platform),
      tags: e.tags.map((t) => anonymizeSharedText(t, source, platform)),
    };
  }

  function pathKey(p: string): string {
    const normalized = p.trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '');
    return s.core.platform === 'win32' || isWindowsStylePath(p) ? normalized.toLowerCase() : normalized;
  }

  function resolveUserPath(path: string): string {
    if (typeof path !== 'string' || !path.trim() || path.includes('\0')) throw validation('Bitte einen gültigen Dateipfad angeben.');
    const trimmed = path.trim();
    return isAbsolute(trimmed) ? resolve(trimmed) : resolve(s.core.paths.exports, trimmed);
  }

  function uniquePath(p: string): string {
    if (!existsSync(p)) return p;
    const base = p.replace(/\.json$/i, '');
    for (let i = 2; i < 10000; i++) {
      const candidate = `${base}-${i}.json`;
      if (!existsSync(candidate)) return candidate;
    }
    return p;
  }

  function exportTarget(path: string | undefined, label: string, ts: number): string {
    const fileName = defaultExportFileName(label, ts);
    if (path === undefined || path.trim() === '') return uniquePath(join(s.core.paths.exports, fileName));
    const target = resolveUserPath(path);
    let isDirectory = /[\\/]$/.test(path.trim());
    if (!isDirectory) {
      try {
        isDirectory = statSync(target).isDirectory();
      } catch {
        isDirectory = false;
      }
    }
    return isDirectory ? uniquePath(join(target, fileName)) : target;
  }

  const service: MemoryServiceImpl = {
    list(filter = {}) {
      const limit = clampLimit(filter.limit, 200, 2000);
      if (limit === 0) return [];
      const kind = filter.kind === undefined ? undefined : parseKind(filter.kind);
      return store.list(scopeOf(filter.projectId, filter.projectId === undefined), kind, limit).map(toEntry);
    },

    search(query, opts = {}) {
      const limit = clampLimit(opts.limit, 30, 200);
      const q = typeof query === 'string' ? query.trim() : '';
      if (limit === 0 || !q) return [];
      const where = scopeSql(scopeOf(opts.projectId, opts.includeGlobal ?? true));
      const terms = extractTerms(q);
      const match = buildFtsQueryFromTerms(terms);
      if (match) {
        const hits = safeFts(match, where, limit);
        if (hits && hits.length > 0) {
          return hits.map((h) => {
            const entry = toEntry(h.row);
            return { ...entry, score: roundScore(-h.rank), snippet: h.snippet.trim() || snippetFor(entry, terms) };
          });
        }
      }
      return likeSearch(q, terms, where, limit);
    },

    add(input: MemoryAddInput, source: MemoryEntry['source']) {
      if (!SOURCES.includes(source)) throw validation('Unbekannte Quelle für den Gedächtniseintrag.');
      const cfg = settings();
      if (!cfg.enabled) throw disabledError();
      if (source === 'agent' && !cfg.agentsMayWrite) {
        throw validation('Agenten dürfen derzeit keine Gedächtniseinträge speichern (Einstellung „Agenten dürfen Einträge speichern“ ist aus).');
      }
      if (!input || typeof input !== 'object') throw validation('Ungültiger Gedächtniseintrag.');
      const kind = parseKind(input.kind);
      const projectId = input.projectId ?? null;
      if (projectId !== null) {
        if (typeof projectId !== 'string' || !projectId) throw validation('Ungültige Projektkennung.');
        const project = s.projects.get(projectId);
        if (!project) throw notFound('Das Projekt', projectId);
        rememberProject(project);
      }
      const title = sanitizeTitle(input.title);
      const content = sanitizeContent(input.content ?? '');
      const tags = normalizeTags(input.tags);
      const shareable = source === 'agent' ? kind === 'insight' && cfg.autoShareAgentInsights && input.shareable !== false : input.shareable === true;
      const taskId = typeof input.taskId === 'string' && input.taskId ? input.taskId : null;
      const ts = now();

      const duplicate = store.findDuplicate(projectId, kind, title, content);
      if (duplicate) {
        const existing = toEntry(duplicate);
        const refreshed: MemoryEntry = {
          ...existing,
          tags: normalizeTags([...existing.tags, ...tags]),
          // An agent never changes the sharing decision of an existing entry; the user/system may share it.
          shareable: source === 'agent' ? existing.shareable : existing.shareable || shareable,
          taskId: existing.taskId ?? taskId,
          updatedAt: Math.max(ts, existing.updatedAt),
        };
        store.update(refreshed);
        emit(refreshed);
        return refreshed;
      }

      const entry: MemoryEntry = { id: newId('mem'), projectId, kind, title, content, tags, source, shareable, taskId, createdAt: ts, updatedAt: ts };
      store.insert(entry);
      emit(entry);
      return entry;
    },

    update(id, patch) {
      const row = typeof id === 'string' && id ? store.get(id) : undefined;
      if (!row) throw notFound('Der Gedächtniseintrag', String(id));
      const existing = toEntry(row);
      const next: MemoryEntry = { ...existing };
      const p = patch ?? {};
      if (p.title !== undefined) next.title = sanitizeTitle(p.title);
      if (p.content !== undefined) next.content = sanitizeContent(p.content);
      if (p.tags !== undefined) next.tags = normalizeTags(p.tags);
      if (p.kind !== undefined) next.kind = parseKind(p.kind);
      if (p.shareable !== undefined) {
        if (typeof p.shareable !== 'boolean') throw validation('„Teilbar“ muss ja oder nein sein.');
        next.shareable = p.shareable;
      }
      const changed =
        next.title !== existing.title ||
        next.content !== existing.content ||
        next.kind !== existing.kind ||
        next.shareable !== existing.shareable ||
        !sameTags(next.tags, existing.tags);
      if (!changed) return existing;
      next.updatedAt = Math.max(now(), existing.updatedAt);
      store.update(next);
      emit(next);
      return next;
    },

    delete(id) {
      const row = typeof id === 'string' && id ? store.get(id) : undefined;
      if (!row) throw notFound('Der Gedächtniseintrag', String(id));
      store.delete(id);
      emit({ id, deleted: true, projectId: row.project_id ?? null });
    },

    clear(projectId) {
      if (projectId !== null && (typeof projectId !== 'string' || !projectId)) {
        throw validation('Bitte ein Projekt oder die Wissensdatenbank zum Leeren angeben.');
      }
      const count = store.transaction(() => store.deleteScope(projectId));
      emit({ projectId, cleared: true, count });
      log.info(projectId === null ? 'Wissensdatenbank geleert' : 'Projektgedächtnis geleert', { projectId, count });
      return count;
    },

    removeProject(projectId) {
      if (typeof projectId !== 'string' || !projectId) return 0;
      const info = projectInfo(projectId);
      let anonymized = 0;
      let kept = 0;
      const deleted = store.transaction(() => {
        for (const row of store.shareableOfProject(projectId)) {
          kept++;
          if (!info) continue;
          const e = toEntry(row);
          const title = anonymizeProjectReferences(e.title, info, s.core.platform).slice(0, TITLE_MAX);
          const content = anonymizeProjectReferences(e.content, info, s.core.platform).slice(0, CONTENT_MAX);
          const tags = normalizeTags(e.tags.map((t) => anonymizeProjectReferences(t, info, s.core.platform)));
          if (title !== e.title || content !== e.content || !sameTags(tags, e.tags)) {
            store.update({ ...e, title, content, tags });
            anonymized++;
          }
        }
        return store.deleteNonShareable(projectId);
      });
      projectCache.delete(projectId);
      if (deleted > 0 || anonymized > 0) emit({ projectId, cleared: true, count: deleted });
      if (kept > 0 && !info) {
        log.warn('Geteilte Gedächtniseinträge eines entfernten Projekts konnten nicht anonymisiert werden (Projektdaten unbekannt)', { projectId, kept });
      }
      log.info('Projektgedächtnis bereinigt', { projectId, deleted, kept, anonymized });
      return deleted;
    },

    async exportTo(projectId, path, opts = {}) {
      const { signal, onProgress } = opts;
      checkAbort(signal);
      const scope = scopeOf(projectId, true);
      const info = typeof projectId === 'string' ? projectInfo(projectId) : null;
      const target = exportTarget(path, scopeFileLabel(projectId, info?.name ?? null), now());
      const rows: MemoryRow[] = store.listForExport(scope);
      onProgress?.(5, `${rows.length} Einträge werden vorbereitet …`);

      const entries: MemoryEntry[] = [];
      for (let i = 0; i < rows.length; i += chunkSize) {
        checkAbort(signal);
        for (const row of rows.slice(i, i + chunkSize)) entries.push(redactEntry(toEntry(row)));
        onProgress?.(5 + Math.round((85 * Math.min(rows.length, i + chunkSize)) / Math.max(1, rows.length)), `${entries.length} von ${rows.length} Einträgen vorbereitet`);
        await yieldNow();
      }

      const projects: MemoryExportProject[] = [];
      for (const pid of [...new Set(entries.map((e) => e.projectId).filter((x): x is string => x !== null))]) {
        const p = projectInfo(pid);
        if (p) projects.push({ id: pid, name: p.name ?? '', path: p.path ?? '' });
      }
      const exportScope: MemoryExportScope =
        projectId === undefined ? { type: 'all', projectId: null } : projectId === null ? { type: 'global', projectId: null } : { type: 'project', projectId };
      const document = {
        format: MEMORY_EXPORT_FORMAT,
        version: MEMORY_EXPORT_VERSION,
        exportedAt: now(),
        scope: exportScope,
        projects,
        entries,
      };
      checkAbort(signal);
      onProgress?.(95, 'Datei wird geschrieben …');
      try {
        atomicWriteFile(target, `${JSON.stringify(document, null, 2)}\n`);
      } catch (e) {
        if (e instanceof NovaError) throw e;
        if ((e as NodeJS.ErrnoException).code === 'ENOSPC') {
          throw new NovaError('DISK_FULL', 'Nicht genügend Speicherplatz für den Export.', { severity: 'warning', details: { path: target }, cause: e });
        }
        throw new NovaError('VALIDATION', 'Die Exportdatei konnte nicht geschrieben werden. Bitte einen anderen Speicherort wählen.', {
          severity: 'warning',
          details: { path: target, error: errorMessage(e) },
          cause: e,
        });
      }
      onProgress?.(100, 'Export abgeschlossen');
      log.info('Gedächtnis exportiert', { path: target, count: entries.length, scope: exportScope.type });
      return { path: target, count: entries.length };
    },

    async importFrom(path, opts = {}) {
      const { signal, onProgress } = opts;
      if (!settings().enabled) throw disabledError();
      const target = resolveUserPath(path);
      checkAbort(signal);

      let size: number;
      try {
        const st = await stat(target);
        if (!st.isFile()) throw validation('Bitte eine Exportdatei (.json) auswählen, keinen Ordner.');
        size = st.size;
      } catch (e) {
        if (e instanceof NovaError) throw e;
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new NovaError('NOT_FOUND', 'Die Importdatei wurde nicht gefunden.', { severity: 'warning', details: { path: target } });
        }
        throw validation('Die Importdatei kann nicht gelesen werden.', { path: target, error: errorMessage(e) });
      }
      if (size > MAX_IMPORT_BYTES) throw validation('Die Importdatei ist zu groß (höchstens 100 MB).');

      let text: string;
      try {
        text = await readFile(target, 'utf8');
      } catch (e) {
        throw validation('Die Importdatei kann nicht gelesen werden.', { path: target, error: errorMessage(e) });
      }
      checkAbort(signal);
      onProgress?.(5, 'Datei wird geprüft …');

      let raw: unknown;
      try {
        raw = JSON.parse(text.replace(/^﻿/, ''));
      } catch {
        throw validation('Die Datei enthält kein gültiges JSON und kann nicht importiert werden.');
      }
      const envelope = MemoryExportEnvelopeSchema.safeParse(raw);
      if (!envelope.success) {
        const issues = envelope.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(Datei)'}: ${i.message}`);
        throw validation(`Die Datei ist kein gültiger NOVA-Gedächtnisexport (${issues.join('; ')}).`, envelope.error.issues);
      }
      if (envelope.data.version > MEMORY_EXPORT_VERSION) {
        throw validation(`Die Datei stammt aus einer neueren NOVA-Version (Format ${envelope.data.version}) und kann hier nicht importiert werden.`);
      }

      // Project mapping: same id → same project; else same folder; else a unique project with the same name.
      const fileProjects = new Map(envelope.data.projects.map((p) => [p.id, p]));
      const resolved = new Map<string, string | null>();
      let allProjects: Project[] | null = null;
      const resolveProject = (pid: string): string | null => {
        const cached = resolved.get(pid);
        if (cached !== undefined) return cached;
        let result: string | null = null;
        let direct: Project | null = null;
        try {
          direct = s.projects.get(pid);
        } catch (e) {
          log.debug('Projekt konnte beim Import nicht gelesen werden', { projectId: pid, error: errorMessage(e) });
        }
        if (direct) {
          result = pid;
        } else {
          const meta = fileProjects.get(pid);
          if (meta) {
            if (!allProjects) {
              try {
                allProjects = s.projects.list({ includeArchived: true });
              } catch (e) {
                log.warn('Projektliste für den Gedächtnisimport nicht verfügbar', { error: errorMessage(e) });
                allProjects = [];
              }
            }
            const byPath = meta.path ? allProjects.filter((p) => pathKey(p.path) === pathKey(meta.path)) : [];
            const wanted = meta.name.trim().toLocaleLowerCase('de-DE');
            const byName = wanted ? allProjects.filter((p) => p.name.trim().toLocaleLowerCase('de-DE') === wanted) : [];
            if (byPath.length === 1) result = byPath[0].id;
            else if (byName.length === 1) result = byName[0].id;
          }
        }
        resolved.set(pid, result);
        return result;
      };

      const ts = now();
      const prepared: MemoryEntry[] = [];
      const seenIds = new Set<string>();
      const seenContent = new Set<string>();
      const stats = { invalid: 0, existing: 0, duplicate: 0, unknownProject: 0, secret: 0 };
      const total = envelope.data.entries.length;
      for (let i = 0; i < total; i += chunkSize) {
        checkAbort(signal);
        for (const rawEntry of envelope.data.entries.slice(i, i + chunkSize)) {
          const parsed = MemoryImportEntrySchema.safeParse(rawEntry);
          if (!parsed.success) {
            stats.invalid++;
            continue;
          }
          const e = parsed.data;
          if (seenIds.has(e.id) || store.exists(e.id)) {
            stats.existing++;
            continue;
          }
          seenIds.add(e.id);
          const projectId = e.projectId === null ? null : resolveProject(e.projectId);
          if (e.projectId !== null && projectId === null) {
            stats.unknownProject++;
            continue;
          }
          const title = sanitizeText(e.title.replace(/\s+/g, ' ').trim());
          const content = sanitizeText(e.content.replace(/\r\n?/g, '\n').trim());
          if (!title.text || title.mostlySecret || content.mostlySecret) {
            if (title.mostlySecret || content.mostlySecret) stats.secret++;
            else stats.invalid++;
            continue;
          }
          const createdAt = e.createdAt === undefined || e.createdAt > ts + DAY_MS ? ts : e.createdAt;
          const updatedAt = e.updatedAt === undefined || e.updatedAt > ts + DAY_MS ? Math.max(createdAt, ts) : Math.max(createdAt, e.updatedAt);
          const entry: MemoryEntry = {
            id: e.id,
            projectId,
            kind: e.kind,
            title: title.text.slice(0, TITLE_MAX),
            content: content.text.slice(0, CONTENT_MAX),
            tags: normalizeTags(e.tags),
            source: e.source,
            shareable: e.shareable,
            // Task ids only mean something in the original project.
            taskId: projectId === e.projectId ? e.taskId : null,
            createdAt,
            updatedAt,
          };
          const contentKey = contentFingerprint(entry);
          if (seenContent.has(contentKey) || store.findDuplicate(entry.projectId, entry.kind, entry.title, entry.content)) {
            stats.duplicate++;
            continue;
          }
          seenContent.add(contentKey);
          prepared.push(entry);
        }
        onProgress?.(5 + Math.round((80 * Math.min(total, i + chunkSize)) / Math.max(1, total)), `${Math.min(total, i + chunkSize)} von ${total} Einträgen geprüft`);
        await yieldNow();
      }

      checkAbort(signal);
      onProgress?.(90, 'Einträge werden gespeichert …');
      const inserted = store.transaction(() => prepared.filter((entry) => store.insert(entry)));
      for (const entry of inserted) emit(entry);
      const imported = inserted.length;
      const skipped = total - imported;
      onProgress?.(100, 'Import abgeschlossen');
      log.info('Gedächtnis importiert', { path: target, imported, skipped, ...stats, raced: prepared.length - imported });
      return { imported, skipped };
    },

    contextFor(input) {
      const cfg = settings();
      if (!cfg.enabled || !input || typeof input.projectId !== 'string' || !input.projectId) return [];
      const projectId = input.projectId;
      const max = cfg.maxContextEntries;
      const cap = clampLimit(input.limit ?? max, max, max);
      if (cap === 0) return [];
      const match = buildFtsQuery(typeof input.query === 'string' ? input.query : '');

      const core = store.coreEntries(projectId, cap).map(toEntry);
      const matches = match ? (safeFts(match, scopeSql({ type: 'project', projectId, includeSharedGlobal: false }), cap * 2) ?? []).map((h) => toEntry(h.row)) : [];
      let shared: MemoryEntry[] = [];
      if (cfg.useGlobalKnowledge) {
        const sharedWhere = { sql: "e.shareable = 1 AND (e.project_id IS NULL OR (e.project_id <> ? AND e.kind = 'insight'))", params: [projectId] };
        const matched = match ? (safeFts(match, sharedWhere, cap) ?? []).map((h) => toEntry(h.row)) : [];
        const matchedIds = new Set(matched.map((e) => e.id));
        shared = [...matched, ...store.sharedGlobal(cap).map(toEntry).filter((e) => !matchedIds.has(e.id))];
      }

      const coreIds = new Set(core.map((e) => e.id));
      const otherAvailable = matches.filter((e) => !coreIds.has(e.id)).length + shared.length;
      const reserve = Math.min(Math.ceil(cap / 4), otherAvailable);
      const out: MemoryEntry[] = core.slice(0, Math.max(0, cap - reserve));
      const seen = new Set(out.map((e) => e.id));
      for (const e of matches) {
        if (out.length >= cap) break;
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(e);
      }
      for (const e of shared) {
        if (out.length >= cap) break;
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        out.push(anonymizeEntry(e));
      }
      return out.map(redactEntry);
    },

    latestNextStep(projectId) {
      if (!settings().enabled || typeof projectId !== 'string' || !projectId) return null;
      const row = store.latestOfKind(projectId, 'next_step');
      return row ? toEntry(row) : null;
    },
  };

  return service;
}
