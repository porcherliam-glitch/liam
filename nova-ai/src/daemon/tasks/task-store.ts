// Orchestrator – persistence helpers shared by TaskService and WorkCycle (table `tasks`, `meta`).
// Key decisions:
// - Row ⇄ Task mapping lives in ONE place so both services use the same JSON column handling and fallbacks
//   (a corrupt JSON column never breaks listing; it falls back to an empty/neutral value).
// - `failure_signatures` is an internal column (repeat detection, SPEC §6.5). Only the WorkCycle reads/writes it through
//   readFailures()/writeFailures(); it is never part of the Task object.
// - Path keys: project-relative, forward slashes, no leading "./" or "/", lower-case on Windows (case-insensitive
//   file system). Used for addFiles dedupe and plannedFiles overlap detection.
// - Task results and blocker texts may contain model output → redacted on store (SPEC §6.0.4).
import type { AgentRole, Task, TaskKind, TaskStatus, Verification } from '@shared/schemas';
import { TaskStatus as TaskStatusEnum, VerificationSchema } from '@shared/schemas';
import type { Db, SqlValue } from '../db/database';
import { bool, fromJson, int, toJson } from '../db/database';
import { redactString } from '../core/redact';

export interface TaskRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  kind: string;
  role: string;
  status: string;
  priority: number;
  depends_on: string;
  attempts: number;
  max_attempts: number;
  blocker: string | null;
  blocker_code: string | null;
  result: string | null;
  acceptance: string | null;
  verification: string;
  files: string;
  planned_files: string;
  start_requested: number;
  model: string | null;
  source: string;
  failure_signatures: string;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export const TASK_STATUSES: TaskStatus[] = [...TaskStatusEnum.options];
/** Matches ProjectSummary.openTasks: queued + running + paused + waiting_approval + blocked + interrupted. */
export const OPEN_STATUSES: TaskStatus[] = ['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'interrupted'];
export const TERMINAL_STATUSES: TaskStatus[] = ['done', 'failed', 'cancelled'];

export function emptyVerification(): Verification {
  return { status: 'not_run', checks: [] };
}

function parseVerification(raw: string): Verification {
  const parsed = VerificationSchema.safeParse(fromJson<unknown>(raw, null));
  return parsed.success ? parsed.data : emptyVerification();
}

function stringArray(raw: string): string[] {
  const v = fromJson<unknown>(raw, []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    projectId: r.project_id,
    parentId: r.parent_id,
    title: r.title,
    description: r.description,
    kind: r.kind as TaskKind,
    role: r.role as AgentRole,
    status: r.status as TaskStatus,
    priority: Number(r.priority),
    dependsOn: stringArray(r.depends_on),
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    blocker: r.blocker,
    blockerCode: r.blocker_code,
    result: r.result,
    acceptance: r.acceptance,
    verification: parseVerification(r.verification),
    files: stringArray(r.files),
    plannedFiles: stringArray(r.planned_files),
    startRequested: bool(r.start_requested),
    model: r.model,
    source: (r.source === 'planner' || r.source === 'system' ? r.source : 'user') as Task['source'],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    startedAt: r.started_at === null ? null : Number(r.started_at),
    finishedAt: r.finished_at === null ? null : Number(r.finished_at),
  };
}

/** Default role by kind (SPEC §4.5): plan→planner, code/fix/build/custom→coder, test→tester, review→reviewer. */
export function defaultRoleForKind(kind: TaskKind): AgentRole {
  switch (kind) {
    case 'plan':
      return 'planner';
    case 'test':
      return 'tester';
    case 'review':
      return 'reviewer';
    default:
      return 'coder';
  }
}

const MAX_TEXT = 20000;

/** Column encoders for TaskService.patch (camelCase field → column). Unknown fields are ignored. */
export const PATCH_COLUMNS: Record<string, { col: string; enc: (v: unknown) => SqlValue }> = {
  parentId: { col: 'parent_id', enc: (v) => (typeof v === 'string' ? v : null) },
  title: { col: 'title', enc: (v) => String(v ?? '').slice(0, 300) },
  description: { col: 'description', enc: (v) => String(v ?? '') },
  kind: { col: 'kind', enc: (v) => String(v) },
  role: { col: 'role', enc: (v) => String(v) },
  status: { col: 'status', enc: (v) => String(v) },
  priority: { col: 'priority', enc: (v) => Math.max(0, Math.min(3, Math.trunc(Number(v) || 0))) },
  dependsOn: { col: 'depends_on', enc: (v) => toJson(Array.isArray(v) ? v : []) },
  attempts: { col: 'attempts', enc: (v) => Math.max(0, Math.trunc(Number(v) || 0)) },
  maxAttempts: { col: 'max_attempts', enc: (v) => Math.max(1, Math.trunc(Number(v) || 1)) },
  blocker: { col: 'blocker', enc: (v) => (typeof v === 'string' && v !== '' ? redactString(v).slice(0, MAX_TEXT) : null) },
  blockerCode: { col: 'blocker_code', enc: (v) => (typeof v === 'string' && v !== '' ? v : null) },
  result: { col: 'result', enc: (v) => (typeof v === 'string' ? redactString(v).slice(0, 50000) : null) },
  acceptance: { col: 'acceptance', enc: (v) => (typeof v === 'string' ? v : null) },
  verification: { col: 'verification', enc: (v) => toJson(v ?? emptyVerification()) },
  files: { col: 'files', enc: (v) => toJson(Array.isArray(v) ? v : []) },
  plannedFiles: { col: 'planned_files', enc: (v) => toJson(Array.isArray(v) ? v : []) },
  startRequested: { col: 'start_requested', enc: (v) => int(Boolean(v)) },
  model: { col: 'model', enc: (v) => (typeof v === 'string' && v !== '' ? v : null) },
  source: { col: 'source', enc: (v) => String(v) },
  startedAt: { col: 'started_at', enc: (v) => (typeof v === 'number' ? v : null) },
  finishedAt: { col: 'finished_at', enc: (v) => (typeof v === 'number' ? v : null) },
};

/** Project-relative path with forward slashes ("" when nothing usable is left). */
export function normalizeRelPath(p: string): string {
  let s = String(p ?? '').trim().replace(/\\/g, '/');
  s = s.replace(/\/{2,}/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  s = s.replace(/^\/+/, '').replace(/\/+$/, '');
  if (s === '.') return '';
  return s;
}

/** Canonical comparison key (lower-case on Windows). */
export function pathKey(p: string, platform: NodeJS.Platform): string {
  const rel = normalizeRelPath(p);
  return platform === 'win32' ? rel.toLowerCase() : rel;
}

/** Normalizes and de-duplicates a path list by key (first spelling wins). */
export function dedupePaths(paths: string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const rel = normalizeRelPath(p);
    if (!rel) continue;
    const key = pathKey(rel, platform);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rel);
  }
  return out;
}

/** True when two path keys refer to the same file or one is a folder containing the other. */
export function keysOverlap(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a === b || a.startsWith(b + '/') || b.startsWith(a + '/');
}

// ---------------------------------------------------------------------------------------------
// Internal failure signature history (column tasks.failure_signatures)
// ---------------------------------------------------------------------------------------------

export interface FailureRecord {
  signature: string;
  /** task.attempts at the time of the failure. */
  attempt: number;
  /** Short German summary of what failed (shown to the next attempt as "previous attempts"). */
  summary: string;
  ts: number;
}

export const MAX_FAILURE_RECORDS = 10;

export function readFailures(db: Db, taskId: string): FailureRecord[] {
  const row = db.get<{ failure_signatures: string }>('SELECT failure_signatures FROM tasks WHERE id = ?', [taskId]);
  const raw = fromJson<unknown>(row?.failure_signatures, []);
  if (!Array.isArray(raw)) return [];
  const out: FailureRecord[] = [];
  for (const r of raw) {
    if (typeof r === 'string') {
      out.push({ signature: r, attempt: 0, summary: '', ts: 0 });
    } else if (r && typeof r === 'object' && typeof (r as FailureRecord).signature === 'string') {
      const f = r as Partial<FailureRecord>;
      out.push({ signature: f.signature!, attempt: Number(f.attempt ?? 0), summary: String(f.summary ?? ''), ts: Number(f.ts ?? 0) });
    }
  }
  return out;
}

export function writeFailures(db: Db, taskId: string, records: FailureRecord[]): void {
  db.run('UPDATE tasks SET failure_signatures = ? WHERE id = ?', [toJson(records.slice(-MAX_FAILURE_RECORDS)), taskId]);
}

// ---------------------------------------------------------------------------------------------
// meta table (key/value JSON)
// ---------------------------------------------------------------------------------------------

export function readMeta<T>(db: Db, key: string, fallback: T): T {
  const row = db.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return row ? fromJson<T>(row.value, fallback) : fallback;
}

export function writeMeta(db: Db, key: string, value: unknown): void {
  db.run('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, toJson(value)]);
}
