// Persistent, user-facing error records (NovaErrorInfo). Services report important problems here;
// the dashboard and project views list open errors. Duplicate open errors (same dedupeKey) are merged.
import type { NovaErrorInfo, ErrorSeverity } from '@shared/errors';
import type { Db } from '../db/database';
import { bool, fromJson, int } from '../db/database';
import type { EventBus } from './bus';
import { newId } from './ids';
import { redactString } from './redact';

export interface ReportErrorInput {
  code: string;
  severity: ErrorSeverity;
  title: string;
  whatHappened: string;
  projectId?: string | null;
  taskId?: string | null;
  attempted?: string[];
  projectSafe?: boolean;
  autoFixable?: boolean;
  userAction?: string | null;
  details?: string | null;
  /** Errors with the same key that are still open are updated instead of duplicated. */
  dedupeKey?: string;
}

interface ErrorRow {
  id: string;
  code: string;
  severity: string;
  title: string;
  what_happened: string;
  project_id: string | null;
  task_id: string | null;
  attempted: string;
  project_safe: number;
  auto_fixable: number;
  user_action: string | null;
  details: string | null;
  created_at: number;
  resolved_at: number | null;
}

function toInfo(r: ErrorRow): NovaErrorInfo {
  return {
    id: r.id,
    code: r.code,
    severity: r.severity as ErrorSeverity,
    title: r.title,
    whatHappened: r.what_happened,
    projectId: r.project_id,
    taskId: r.task_id,
    attempted: fromJson<string[]>(r.attempted, []),
    projectSafe: bool(r.project_safe),
    autoFixable: bool(r.auto_fixable),
    userAction: r.user_action,
    details: r.details,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  };
}

export class ErrorService {
  constructor(private db: Db, private bus: EventBus | null) {}

  report(input: ReportErrorInput): NovaErrorInfo {
    const now = Date.now();
    const details = input.details ? redactString(input.details).slice(0, 20000) : null;
    if (input.dedupeKey) {
      const existing = this.db.get<ErrorRow>('SELECT * FROM errors WHERE dedupe_key = ? AND resolved_at IS NULL', [input.dedupeKey]);
      if (existing) {
        this.db.run(
          'UPDATE errors SET severity = ?, title = ?, what_happened = ?, attempted = ?, project_safe = ?, auto_fixable = ?, user_action = ?, details = ?, created_at = ? WHERE id = ?',
          [
            input.severity,
            input.title,
            redactString(input.whatHappened),
            JSON.stringify(input.attempted ?? []),
            int(input.projectSafe ?? true),
            int(input.autoFixable ?? false),
            input.userAction ?? null,
            details,
            now,
            existing.id,
          ],
        );
        const info = this.get(existing.id)!;
        this.bus?.emit('error.raised', info);
        return info;
      }
    }
    const id = newId('err');
    this.db.run(
      `INSERT INTO errors(id, code, severity, title, what_happened, project_id, task_id, attempted, project_safe, auto_fixable, user_action, details, dedupe_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.code,
        input.severity,
        input.title,
        redactString(input.whatHappened),
        input.projectId ?? null,
        input.taskId ?? null,
        JSON.stringify(input.attempted ?? []),
        int(input.projectSafe ?? true),
        int(input.autoFixable ?? false),
        input.userAction ?? null,
        details,
        input.dedupeKey ?? null,
        now,
      ],
    );
    const info = this.get(id)!;
    this.bus?.emit('error.raised', info);
    return info;
  }

  get(id: string): NovaErrorInfo | null {
    const r = this.db.get<ErrorRow>('SELECT * FROM errors WHERE id = ?', [id]);
    return r ? toInfo(r) : null;
  }

  list(opts: { projectId?: string; includeResolved?: boolean; limit?: number } = {}): NovaErrorInfo[] {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.projectId) {
      where.push('project_id = ?');
      params.push(opts.projectId);
    }
    if (!opts.includeResolved) where.push('resolved_at IS NULL');
    const sql = `SELECT * FROM errors ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT ?`;
    params.push(opts.limit ?? 100);
    return this.db.all<ErrorRow>(sql, params).map(toInfo);
  }

  resolve(id: string): void {
    const r = this.db.run('UPDATE errors SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL', [Date.now(), id]);
    if (r.changes > 0) this.bus?.emit('error.resolved', { id });
  }

  /** Resolve all open errors of a task (e.g. when it finally succeeds) or with a dedupe key. */
  resolveWhere(filter: { taskId?: string; dedupeKey?: string; code?: string; projectId?: string }): number {
    const where: string[] = ['resolved_at IS NULL'];
    const params: string[] = [];
    if (filter.taskId) {
      where.push('task_id = ?');
      params.push(filter.taskId);
    }
    if (filter.dedupeKey) {
      where.push('dedupe_key = ?');
      params.push(filter.dedupeKey);
    }
    if (filter.code) {
      where.push('code = ?');
      params.push(filter.code);
    }
    if (filter.projectId) {
      where.push('project_id = ?');
      params.push(filter.projectId);
    }
    if (where.length === 1) return 0;
    const ids = this.db.all<{ id: string }>(`SELECT id FROM errors WHERE ${where.join(' AND ')}`, params);
    for (const { id } of ids) this.resolve(id);
    return ids.length;
  }

  countOpen(projectId?: string): number {
    const row = projectId
      ? this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM errors WHERE resolved_at IS NULL AND project_id = ?', [projectId])
      : this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM errors WHERE resolved_at IS NULL');
    return Number(row?.n ?? 0);
  }
}
