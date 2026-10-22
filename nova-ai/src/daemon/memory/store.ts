// SQL access of the memory module (tables memory_entries + external-content FTS5 index memory_fts from
// db/migrations.ts, kept in sync by the migration's triggers – this file never writes memory_fts directly except for
// the 'rebuild' repair command).
//
// Key decisions:
// - Scope semantics (MemoryService contract): undefined = every entry, null = global knowledge base only,
//   string = that project (optionally + SHAREABLE global entries). "allProjects" (projectId undefined with
//   includeGlobal=false) excludes the global knowledge base.
// - Ranking: bm25(memory_fts, 4, 1, 2) – title matches weigh 4×, tags 2×, content 1×. bm25 is negative (smaller =
//   better); results expose score = -bm25 (larger = better). Snippets come from the content column via snippet()
//   without highlight markers (plain text for the UI and for prompts).
// - SQL texts are static or built from a bounded set of shapes, so the Db statement cache stays small.
import type { MemoryEntry, MemoryKind } from '@shared/schemas';
import { MemoryKind as MemoryKindSchema } from '@shared/schemas';
import type { Db, SqlValue } from '../db/database';
import { bool, fromJson } from '../db/database';

export interface MemoryRow {
  id: string;
  project_id: string | null;
  kind: string;
  title: string;
  content: string;
  tags: string;
  source: string;
  shareable: number;
  task_id: string | null;
  created_at: number;
  updated_at: number;
}

export type MemoryScope =
  | { type: 'all' }
  | { type: 'allProjects' }
  | { type: 'global' }
  | { type: 'project'; projectId: string; includeSharedGlobal: boolean };

const SOURCES = new Set(['user', 'agent', 'system']);

export function toEntry(r: MemoryRow): MemoryEntry {
  const kind = MemoryKindSchema.safeParse(r.kind);
  const tags = fromJson<unknown>(r.tags, []);
  return {
    id: r.id,
    projectId: r.project_id ?? null,
    kind: kind.success ? kind.data : 'note',
    title: r.title,
    content: r.content,
    tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [],
    source: (SOURCES.has(r.source) ? r.source : 'user') as MemoryEntry['source'],
    shareable: bool(r.shareable),
    taskId: r.task_id ?? null,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

/** WHERE fragment (alias e) for a scope. */
export function scopeSql(scope: MemoryScope): { sql: string; params: SqlValue[] } {
  switch (scope.type) {
    case 'all':
      return { sql: '1 = 1', params: [] };
    case 'allProjects':
      return { sql: 'e.project_id IS NOT NULL', params: [] };
    case 'global':
      return { sql: 'e.project_id IS NULL', params: [] };
    case 'project':
      return scope.includeSharedGlobal
        ? { sql: '(e.project_id = ? OR (e.project_id IS NULL AND e.shareable = 1))', params: [scope.projectId] }
        : { sql: 'e.project_id = ?', params: [scope.projectId] };
  }
}

export interface FtsHit {
  row: MemoryRow;
  rank: number;
  snippet: string;
}

const ENTRY_COLUMNS = 'e.id, e.project_id, e.kind, e.title, e.content, e.tags, e.source, e.shareable, e.task_id, e.created_at, e.updated_at';

export class MemoryStore {
  constructor(private readonly db: Db) {}

  get(id: string): MemoryRow | undefined {
    return this.db.get<MemoryRow>(`SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE e.id = ?`, [id]);
  }

  exists(id: string): boolean {
    return !!this.db.get('SELECT 1 FROM memory_entries WHERE id = ?', [id]);
  }

  /** Exact duplicate (same scope, kind, title and content). */
  findDuplicate(projectId: string | null, kind: MemoryKind, title: string, content: string): MemoryRow | undefined {
    return this.db.get<MemoryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE e.project_id IS ? AND e.kind = ? AND e.title = ? AND e.content = ? ORDER BY e.updated_at DESC LIMIT 1`,
      [projectId, kind, title, content],
    );
  }

  list(scope: MemoryScope, kind: MemoryKind | undefined, limit: number): MemoryRow[] {
    const where = scopeSql(scope);
    const params: SqlValue[] = [...where.params];
    let sql = `SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE ${where.sql}`;
    if (kind) {
      sql += ' AND e.kind = ?';
      params.push(kind);
    }
    sql += ' ORDER BY e.updated_at DESC, e.created_at DESC, e.rowid DESC LIMIT ?';
    params.push(limit);
    return this.db.all<MemoryRow>(sql, params);
  }

  /** All rows of a scope in creation order (export). */
  listForExport(scope: MemoryScope): MemoryRow[] {
    const where = scopeSql(scope);
    return this.db.all<MemoryRow>(`SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE ${where.sql} ORDER BY e.created_at ASC, e.rowid ASC`, where.params);
  }

  insert(entry: MemoryEntry): boolean {
    const r = this.db.run(
      `INSERT OR IGNORE INTO memory_entries(id, project_id, kind, title, content, tags, source, shareable, task_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        entry.projectId,
        entry.kind,
        entry.title,
        entry.content,
        JSON.stringify(entry.tags),
        entry.source,
        entry.shareable ? 1 : 0,
        entry.taskId,
        entry.createdAt,
        entry.updatedAt,
      ],
    );
    return r.changes > 0;
  }

  update(entry: MemoryEntry): void {
    this.db.run('UPDATE memory_entries SET kind = ?, title = ?, content = ?, tags = ?, shareable = ?, task_id = ?, updated_at = ? WHERE id = ?', [
      entry.kind,
      entry.title,
      entry.content,
      JSON.stringify(entry.tags),
      entry.shareable ? 1 : 0,
      entry.taskId,
      entry.updatedAt,
      entry.id,
    ]);
  }

  delete(id: string): boolean {
    return this.db.run('DELETE FROM memory_entries WHERE id = ?', [id]).changes > 0;
  }

  deleteScope(projectId: string | null): number {
    return projectId === null
      ? this.db.run('DELETE FROM memory_entries WHERE project_id IS NULL').changes
      : this.db.run('DELETE FROM memory_entries WHERE project_id = ?', [projectId]).changes;
  }

  deleteNonShareable(projectId: string): number {
    return this.db.run('DELETE FROM memory_entries WHERE project_id = ? AND shareable = 0', [projectId]).changes;
  }

  shareableOfProject(projectId: string): MemoryRow[] {
    return this.db.all<MemoryRow>(`SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE e.project_id = ? AND e.shareable = 1`, [projectId]);
  }

  /** Goals, requirements, conventions and decisions of a project: kind priority, then most recent first. */
  coreEntries(projectId: string, limit: number): MemoryRow[] {
    return this.db.all<MemoryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM memory_entries e
       WHERE e.project_id = ? AND e.kind IN ('goal', 'requirement', 'convention', 'decision')
       ORDER BY CASE e.kind WHEN 'goal' THEN 0 WHEN 'requirement' THEN 1 WHEN 'convention' THEN 2 ELSE 3 END, e.updated_at DESC, e.rowid DESC
       LIMIT ?`,
      [projectId, limit],
    );
  }

  /** Shareable global entries, most recent first. */
  sharedGlobal(limit: number): MemoryRow[] {
    return this.db.all<MemoryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE e.project_id IS NULL AND e.shareable = 1 ORDER BY e.updated_at DESC, e.rowid DESC LIMIT ?`,
      [limit],
    );
  }

  latestOfKind(projectId: string, kind: MemoryKind): MemoryRow | undefined {
    return this.db.get<MemoryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE e.project_id = ? AND e.kind = ? ORDER BY e.updated_at DESC, e.created_at DESC, e.rowid DESC LIMIT 1`,
      [projectId, kind],
    );
  }

  /** FTS5 search with bm25 ranking within an arbitrary WHERE fragment (alias e). Throws on SQLite errors. */
  fts(match: string, where: { sql: string; params: SqlValue[] }, limit: number): FtsHit[] {
    const rows = this.db.all<MemoryRow & { bm: number; snip: string | null }>(
      `SELECT ${ENTRY_COLUMNS}, bm25(memory_fts, 4.0, 1.0, 2.0) AS bm, snippet(memory_fts, 1, '', '', '…', 24) AS snip
       FROM memory_fts JOIN memory_entries e ON e.rowid = memory_fts.rowid
       WHERE memory_fts MATCH ? AND ${where.sql}
       ORDER BY bm ASC, e.updated_at DESC
       LIMIT ?`,
      [match, ...where.params, limit],
    );
    return rows.map((r) => ({ row: r, rank: Number(r.bm), snippet: r.snip ?? '' }));
  }

  /** Substring search (title/content/tags) for the given LIKE patterns, OR-ed, most recent first. */
  like(patterns: readonly string[], where: { sql: string; params: SqlValue[] }, limit: number): MemoryRow[] {
    if (patterns.length === 0) return [];
    const ors = patterns.map(() => "(e.title LIKE ? ESCAPE '\\' OR e.content LIKE ? ESCAPE '\\' OR e.tags LIKE ? ESCAPE '\\')").join(' OR ');
    const params: SqlValue[] = [];
    for (const p of patterns) params.push(p, p, p);
    return this.db.all<MemoryRow>(
      `SELECT ${ENTRY_COLUMNS} FROM memory_entries e WHERE (${ors}) AND ${where.sql} ORDER BY e.updated_at DESC, e.rowid DESC LIMIT ?`,
      [...params, ...where.params, limit],
    );
  }

  /** Rebuilds the FTS index from memory_entries (repair after an inconsistent index). */
  rebuildIndex(): void {
    this.db.run("INSERT INTO memory_fts(memory_fts) VALUES ('rebuild')");
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn);
  }
}
