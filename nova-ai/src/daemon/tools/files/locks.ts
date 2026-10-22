// FileLockService (table file_locks): one agent task at a time may change a file (MASTERPROMPT §5 "Koordination").
// Key decisions:
// - The lock key is `${projectId}:${ResolvedPath.key}` (lower-case on Windows), so "Src/App.ts" and "src/app.ts" are
//   the same lock. The `path` column stores the key for listing.
// - acquire() is idempotent for the holding task and runs in one DB transaction (no check-then-insert race).
// - Stale locks are taken over: when the holding task no longer exists or is done/failed/cancelled (WorkCycle normally
//   releases them, this is the safety net after crashes or manual DB edits). Paused/waiting/interrupted holders keep
//   their locks (SPEC §6.5 "Locks").
import type { FileLockService, Services } from '../../contracts';
import { validation } from '../../core/errors';

const FINISHED = new Set(['done', 'failed', 'cancelled']);

export function createFileLockService(s: Services): FileLockService {
  const db = s.core.db;
  const log = s.core.log.child('locks');
  const lockKey = (projectId: string, key: string) => `${projectId}:${key}`;

  function isStale(holder: string): boolean {
    try {
      const task = s.tasks.get(holder);
      return !task || FINISHED.has(task.status);
    } catch (e) {
      log.debug('Status der sperrenden Aufgabe nicht ermittelbar', { holder, error: String(e) });
      return false;
    }
  }

  return {
    acquire(projectId, key, taskId) {
      if (!key) throw validation('Für eine Dateisperre wird ein Dateipfad benötigt.');
      const lk = lockKey(projectId, key);
      return db.transaction(() => {
        const row = db.get<{ task_id: string }>('SELECT task_id FROM file_locks WHERE lock_key = ?', [lk]);
        if (row) {
          if (row.task_id === taskId) return { ok: true as const };
          if (!isStale(row.task_id)) return { ok: false as const, heldBy: row.task_id };
          log.info('Veraltete Dateisperre übernommen', { path: key, previous: row.task_id, taskId });
        }
        db.run(
          `INSERT INTO file_locks(lock_key, project_id, path, task_id, acquired_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(lock_key) DO UPDATE SET task_id = excluded.task_id, acquired_at = excluded.acquired_at`,
          [lk, projectId, key, taskId, s.core.clock.now()],
        );
        return { ok: true as const };
      });
    },

    heldBy(projectId, key) {
      return db.get<{ task_id: string }>('SELECT task_id FROM file_locks WHERE lock_key = ?', [lockKey(projectId, key)])?.task_id ?? null;
    },

    listForTask(taskId) {
      return db.all<{ path: string }>('SELECT path FROM file_locks WHERE task_id = ? ORDER BY path', [taskId]).map((r) => r.path);
    },

    releaseTask(taskId) {
      db.run('DELETE FROM file_locks WHERE task_id = ?', [taskId]);
    },

    releaseProject(projectId) {
      db.run('DELETE FROM file_locks WHERE project_id = ?', [projectId]);
    },

    releaseAll() {
      db.run('DELETE FROM file_locks');
    },
  };
}
