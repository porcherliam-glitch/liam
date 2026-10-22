// Persistence of 3D jobs (table threed_jobs, migration v2): insert, patch, list, delete and crash recovery.
// Key decisions:
// - The row maps 1:1 to ThreeDJob (snake_case columns); progress is stored rounded to one decimal.
// - project_id is ON DELETE SET NULL in the schema: when a project is removed its jobs stay (library view).
// - prune(olderThanMs) deletes ended jobs (done/failed/cancelled) older than the cutoff; files are not touched here.
import type { ThreeDJob } from '@shared/schemas';
import type { Db } from '../db/database';

interface JobRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  mode: string;
  prompt: string | null;
  image_path: string | null;
  model: string;
  quality: string;
  seed: number;
  name: string;
  status: string;
  phase: string | null;
  progress: number | null;
  output_path: string | null;
  output_rel: string | null;
  error: string | null;
  created_at: number;
  started_at: number | null;
  ended_at: number | null;
}

const COLUMNS: Record<keyof Omit<ThreeDJob, 'id'>, keyof JobRow> = {
  projectId: 'project_id',
  taskId: 'task_id',
  mode: 'mode',
  prompt: 'prompt',
  imagePath: 'image_path',
  model: 'model',
  quality: 'quality',
  seed: 'seed',
  name: 'name',
  status: 'status',
  phase: 'phase',
  progress: 'progress',
  outputPath: 'output_path',
  outputRel: 'output_rel',
  error: 'error',
  createdAt: 'created_at',
  startedAt: 'started_at',
  endedAt: 'ended_at',
};

function toJob(r: JobRow): ThreeDJob {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    mode: r.mode === 'text' ? 'text' : 'image',
    prompt: r.prompt,
    imagePath: r.image_path,
    model: r.model === 'pixal3d' ? 'pixal3d' : 'trellis2',
    quality: r.quality === 'draft' || r.quality === 'high' ? r.quality : 'standard',
    seed: Number(r.seed),
    name: r.name,
    status: (['queued', 'running', 'done', 'failed', 'cancelled'] as const).find((s) => s === r.status) ?? 'failed',
    phase: r.phase,
    progress: r.progress === null ? null : Math.max(0, Math.min(100, Number(r.progress))),
    outputPath: r.output_path,
    outputRel: r.output_rel,
    error: r.error,
    createdAt: Number(r.created_at),
    startedAt: r.started_at === null ? null : Number(r.started_at),
    endedAt: r.ended_at === null ? null : Number(r.ended_at),
  };
}

function value(key: keyof Omit<ThreeDJob, 'id'>, v: unknown): string | number | null {
  if (v === null || v === undefined) return null;
  if (key === 'progress' && typeof v === 'number') return Math.round(v * 10) / 10;
  return v as string | number;
}

export interface ThreeDJobStore {
  insert(job: ThreeDJob): ThreeDJob;
  get(id: string): ThreeDJob | null;
  update(id: string, patch: Partial<Omit<ThreeDJob, 'id' | 'createdAt'>>): ThreeDJob;
  list(filter?: { projectId?: string; status?: ThreeDJob['status'][]; limit?: number }): ThreeDJob[];
  delete(id: string): boolean;
  /** Jobs left queued/running by a previous daemon run → failed with `message`. Returns the affected jobs. */
  failUnfinished(message: string, now: number): ThreeDJob[];
  prune(olderThanMs: number): number;
}

export function createThreeDJobStore(db: Db): ThreeDJobStore {
  const get = (id: string): ThreeDJob | null => {
    const r = db.get<JobRow>('SELECT * FROM threed_jobs WHERE id = ?', [id]);
    return r ? toJob(r) : null;
  };
  return {
    insert(job) {
      const keys = Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>;
      db.run(`INSERT INTO threed_jobs(id, ${keys.map((k) => COLUMNS[k]).join(', ')}) VALUES (?, ${keys.map(() => '?').join(', ')})`, [job.id, ...keys.map((k) => value(k, job[k]))]);
      return get(job.id) as ThreeDJob;
    },
    get,
    update(id, patch) {
      const p = patch as Partial<Record<keyof typeof COLUMNS, unknown>>;
      const keys = (Object.keys(p) as Array<keyof typeof COLUMNS>).filter((k) => k in COLUMNS && k !== 'createdAt');
      if (keys.length > 0) {
        db.run(`UPDATE threed_jobs SET ${keys.map((k) => `${COLUMNS[k]} = ?`).join(', ')} WHERE id = ?`, [...keys.map((k) => value(k, p[k])), id]);
      }
      const job = get(id);
      if (!job) throw new Error(`3D job not found: ${id}`);
      return job;
    },
    list(filter = {}) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
      }
      if (filter.status && filter.status.length > 0) {
        where.push(`status IN (${filter.status.map(() => '?').join(', ')})`);
        params.push(...filter.status);
      }
      const limit = Math.max(1, Math.min(1000, Math.floor(filter.limit ?? 100)));
      const rows = db.all<JobRow>(`SELECT * FROM threed_jobs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC, id DESC LIMIT ${limit}`, params);
      return rows.map(toJob);
    },
    delete(id) {
      return db.run('DELETE FROM threed_jobs WHERE id = ?', [id]).changes > 0;
    },
    failUnfinished(message, now) {
      const rows = db.all<JobRow>("SELECT * FROM threed_jobs WHERE status IN ('queued', 'running')");
      if (rows.length === 0) return [];
      db.run("UPDATE threed_jobs SET status = 'failed', error = ?, phase = NULL, ended_at = ? WHERE status IN ('queued', 'running')", [message, now]);
      return rows.map((r) => get(r.id)).filter((j): j is ThreeDJob => j !== null);
    },
    prune(olderThanMs) {
      return db.run("DELETE FROM threed_jobs WHERE status IN ('done', 'failed', 'cancelled') AND COALESCE(ended_at, created_at) < ?", [olderThanMs]).changes;
    },
  };
}
