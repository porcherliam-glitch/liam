// Persistence of CheckRuns (table check_runs from migrations.ts, owned by the projects module).
// Key decisions: rows are mapped field by field with fromJson fallbacks (a corrupt JSON column never breaks a list);
// queries used by ProjectService (latest per kind, latest passed build) live here so both services share them.
import type { CheckKind, CheckRun, CheckStatus } from '@shared/schemas';
import type { Db } from '../db/database';
import { fromJson, toJson } from '../db/database';

export interface CheckRow {
  id: string;
  project_id: string;
  task_id: string | null;
  kind: string;
  command: string;
  status: string;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  duration_ms: number | null;
  output_tail: string;
  failures: string;
  failure_signature: string | null;
  message: string | null;
  process_id: string | null;
  artifacts: string;
  started_at: number;
  finished_at: number | null;
}

const n = (v: number | bigint | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));

export function rowToCheck(r: CheckRow): CheckRun {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    kind: r.kind as CheckKind,
    command: r.command,
    status: r.status as CheckStatus,
    passed: n(r.passed),
    failed: n(r.failed),
    skipped: n(r.skipped),
    durationMs: n(r.duration_ms),
    outputTail: r.output_tail ?? '',
    failures: fromJson<CheckRun['failures']>(r.failures, []),
    failureSignature: r.failure_signature,
    message: r.message,
    processId: r.process_id,
    artifacts: fromJson<CheckRun['artifacts']>(r.artifacts, []),
    startedAt: Number(r.started_at),
    finishedAt: n(r.finished_at),
  };
}

export function insertCheck(db: Db, c: CheckRun): void {
  db.run(
    `INSERT INTO check_runs(id, project_id, task_id, kind, command, status, passed, failed, skipped, duration_ms, output_tail, failures,
       failure_signature, message, process_id, artifacts, started_at, finished_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      c.projectId,
      c.taskId,
      c.kind,
      c.command,
      c.status,
      c.passed,
      c.failed,
      c.skipped,
      c.durationMs,
      c.outputTail,
      toJson(c.failures),
      c.failureSignature,
      c.message,
      c.processId,
      toJson(c.artifacts),
      c.startedAt,
      c.finishedAt,
    ],
  );
}

/** Returns false when the row no longer exists (project removed meanwhile). */
export function updateCheck(db: Db, c: CheckRun): boolean {
  const r = db.run(
    `UPDATE check_runs SET command = ?, status = ?, passed = ?, failed = ?, skipped = ?, duration_ms = ?, output_tail = ?, failures = ?,
       failure_signature = ?, message = ?, process_id = ?, artifacts = ?, finished_at = ? WHERE id = ?`,
    [c.command, c.status, c.passed, c.failed, c.skipped, c.durationMs, c.outputTail, toJson(c.failures), c.failureSignature, c.message, c.processId, toJson(c.artifacts), c.finishedAt, c.id],
  );
  return r.changes > 0;
}

export function getCheck(db: Db, id: string): CheckRun | null {
  const r = db.get<CheckRow>('SELECT * FROM check_runs WHERE id = ?', [id]);
  return r ? rowToCheck(r) : null;
}

export function latestCheck(db: Db, projectId: string, kind: CheckKind, status?: CheckStatus): CheckRun | null {
  const r = status
    ? db.get<CheckRow>('SELECT * FROM check_runs WHERE project_id = ? AND kind = ? AND status = ? ORDER BY started_at DESC, rowid DESC LIMIT 1', [projectId, kind, status])
    : db.get<CheckRow>('SELECT * FROM check_runs WHERE project_id = ? AND kind = ? ORDER BY started_at DESC, rowid DESC LIMIT 1', [projectId, kind]);
  return r ? rowToCheck(r) : null;
}

export function latestCheckActivity(db: Db, projectId: string): number | null {
  const r = db.get<{ ts: number | null }>('SELECT MAX(COALESCE(finished_at, started_at)) AS ts FROM check_runs WHERE project_id = ?', [projectId]);
  return r?.ts === null || r?.ts === undefined ? null : Number(r.ts);
}
