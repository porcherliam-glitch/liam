// RunStore: persistence of agent runs (table agent_runs), their activity feed (agent_steps) and conversation state.
// Key decisions:
// - Every visible change emits 'run.updated' (full AgentRun) and every step 'run.step' (SPEC §3.3).
// - Step summaries and data are redacted (core/redact) before they are stored or emitted; data is bounded to 8 KB by
//   progressively shortening long strings/arrays (still valid JSON), finally a preview object.
// - Conversation state is JSON in agent_runs.state; above 2 MB it goes to <dataDir>/run-state/<runId>.json via
//   atomicWriteFile and the column stores a reference. Listing queries never select the state column.
// - markInterrupted() turns 'running' rows (left over from a crash) into 'interrupted'; endedAt stays null because
//   interrupted runs can resume. endedAt is set only for terminal statuses (done/failed/cancelled).
// - prune(): steps + state of runs that can never resume (terminal, or superseded by a newer run of the same task and
//   role) and that ended/changed before the cutoff; caps every run at 5000 steps; removes orphaned run-state files.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AgentRunStatus as AgentRunStatusEnum, type AgentRole, type AgentRun, type AgentRunStatus, type AgentStep, type AgentStepKind } from '@shared/schemas';
import type { RunStore, Services } from '../contracts';
import { fromJson, toJson, type SqlValue } from '../db/database';
import { NovaError, errorMessage, notFound, validation } from '../core/errors';
import { atomicWriteFile, unlinkWithRetry } from '../core/fs-atomic';
import { newId } from '../core/ids';
import { redact, redactString } from '../core/redact';

export const STEP_DATA_MAX_BYTES = 8 * 1024;
export const STATE_INLINE_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_STEPS_PER_RUN = 5000;
const SUMMARY_MAX = 500;
const TEXT_FIELD_MAX = 2000;
const STATE_REF_KEY = '$novaRunStateFile';
const TERMINAL: AgentRunStatus[] = ['done', 'failed', 'cancelled'];

export interface RunStoreOptions {
  /** Inline state limit in bytes (default 2 MB; tests use smaller values). */
  inlineStateMaxBytes?: number;
}

interface RunRow {
  id: string;
  task_id: string;
  project_id: string;
  role: string;
  status: string;
  provider_id: string | null;
  model_id: string | null;
  step_count: number;
  input_tokens: number;
  output_tokens: number;
  last_action: string | null;
  blocker: string | null;
  files: string;
  pending_approval_id: string | null;
  error: string | null;
  error_code: string | null;
  active_ms: number;
  started_at: number;
  updated_at: number;
  ended_at: number | null;
}

interface StepRow {
  id: number;
  run_id: string;
  task_id: string;
  project_id: string;
  ts: number;
  kind: string;
  summary: string;
  data: string | null;
}

const RUN_COLUMNS =
  'id, task_id, project_id, role, status, provider_id, model_id, step_count, input_tokens, output_tokens, last_action, blocker, files, pending_approval_id, error, error_code, active_ms, started_at, updated_at, ended_at';

function toRun(r: RunRow): AgentRun {
  return {
    id: r.id,
    taskId: r.task_id,
    projectId: r.project_id,
    role: r.role as AgentRole,
    status: r.status as AgentRunStatus,
    providerId: r.provider_id,
    modelId: r.model_id,
    stepCount: Number(r.step_count),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    lastAction: r.last_action,
    blocker: r.blocker,
    files: fromJson<string[]>(r.files, []),
    pendingApprovalId: r.pending_approval_id,
    error: r.error,
    errorCode: r.error_code,
    activeMs: Number(r.active_ms),
    startedAt: Number(r.started_at),
    updatedAt: Number(r.updated_at),
    endedAt: r.ended_at === null ? null : Number(r.ended_at),
  };
}

function toStep(r: StepRow): AgentStep {
  return {
    id: Number(r.id),
    runId: r.run_id,
    taskId: r.task_id,
    projectId: r.project_id,
    ts: Number(r.ts),
    kind: r.kind as AgentStepKind,
    summary: r.summary,
    data: r.data === null ? null : fromJson<unknown>(r.data, null),
  };
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
  } catch {
    return null;
  }
}

function shrink(value: unknown, maxString: number, maxItems: number, depth = 0): unknown {
  if (typeof value === 'string') return value.length > maxString ? `${value.slice(0, maxString)} … [gekürzt]` : value;
  if (depth > 8) return '[gekürzt]';
  if (Array.isArray(value)) {
    const items = value.slice(0, maxItems).map((v) => shrink(v, maxString, maxItems, depth + 1));
    if (value.length > maxItems) items.push(`… ${value.length - maxItems} weitere Einträge`);
    return items;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = shrink(v, maxString, maxItems, depth + 1);
    return out;
  }
  return value;
}

const PRE_REDACT_MAX_STRING = 4000;
const PRE_REDACT_MAX_ITEMS = 200;
const LONG_RUN = /\S{513,}/g;
const OMITTED_BLOCK = '[langer Block ausgelassen]';

/**
 * Cuts a string BEFORE redaction. Two reasons: the redaction patterns are slow on huge whitespace-free runs, and a
 * cut must never leave a partial secret behind that the patterns no longer recognise. So the cut backs up to a
 * whitespace boundary, whitespace-free runs > 512 chars (base64, minified code, key material) are dropped, and a
 * private-key block whose END marker was cut away is removed.
 */
export function preTruncate(text: string, max = PRE_REDACT_MAX_STRING): string {
  let out = text;
  let cut = false;
  if (out.length > max) {
    const head = out.slice(0, max);
    const boundary = head.search(/\s\S*$/);
    out = boundary === -1 ? OMITTED_BLOCK : head.slice(0, boundary);
    cut = true;
  }
  out = out.replace(LONG_RUN, OMITTED_BLOCK);
  const begin = out.search(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
  if (begin !== -1 && !/-----END [A-Z ]*PRIVATE KEY-----/.test(out.slice(begin))) out = `${out.slice(0, begin)}[privater Schlüssel ausgelassen]`;
  return cut ? `${out} … [gekürzt]` : out;
}

function prepare(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return preTruncate(value);
  if (typeof value === 'bigint') return value.toString();
  if (depth > 10) return '[gekürzt]';
  if (Array.isArray(value)) {
    const items = value.slice(0, PRE_REDACT_MAX_ITEMS).map((v) => prepare(v, depth + 1));
    if (value.length > PRE_REDACT_MAX_ITEMS) items.push(`… ${value.length - PRE_REDACT_MAX_ITEMS} weitere Einträge`);
    return items;
  }
  if (value instanceof Error) return { name: value.name, message: preTruncate(value.message) };
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = prepare(v, depth + 1);
    return out;
  }
  return value;
}

/** Redacts step data and bounds its JSON size to STEP_DATA_MAX_BYTES (valid JSON is kept). */
export function boundStepData(data: unknown): unknown {
  if (data === undefined || data === null) return null;
  const redacted = redact(prepare(data));
  const json = safeStringify(redacted);
  if (json === null) return { hinweis: 'Daten nicht darstellbar' };
  if (byteLength(json) <= STEP_DATA_MAX_BYTES) return redacted;
  for (const [maxString, maxItems] of [
    [2000, 50],
    [600, 20],
    [160, 10],
  ] as const) {
    const shrunk = shrink(redacted, maxString, maxItems);
    const j = safeStringify(shrunk);
    if (j !== null && byteLength(j) <= STEP_DATA_MAX_BYTES) return shrunk;
  }
  return { gekuerzt: true, vorschau: json.slice(0, 1800) };
}

function clip(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null;
  const red = redactString(preTruncate(text, max * 2));
  return red.length > max ? `${red.slice(0, max - 1)}…` : red;
}

export function createRunStore(s: Services, options: RunStoreOptions = {}): RunStore {
  const { core } = s;
  const inlineMax = options.inlineStateMaxBytes ?? STATE_INLINE_MAX_BYTES;
  const log = core.log.child('runs');
  const runRefs = new Map<string, { taskId: string; projectId: string }>();

  const stateFile = (runId: string): string => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw validation('Ungültige Lauf-Kennung.');
    return join(core.paths.runState, `${runId}.json`);
  };

  const getRow = (id: string): RunRow | undefined => core.db.get<RunRow>(`SELECT ${RUN_COLUMNS} FROM agent_runs WHERE id = ?`, [id]);

  const emitRun = (id: string): AgentRun => {
    const row = getRow(id);
    if (!row) throw notFound('Agentenlauf', id);
    const run = toRun(row);
    core.bus.emit('run.updated', run);
    return run;
  };

  const refFor = (runId: string): { taskId: string; projectId: string } => {
    const cached = runRefs.get(runId);
    if (cached) return cached;
    const row = core.db.get<{ task_id: string; project_id: string }>('SELECT task_id, project_id FROM agent_runs WHERE id = ?', [runId]);
    if (!row) throw notFound('Agentenlauf', runId);
    const ref = { taskId: row.task_id, projectId: row.project_id };
    if (runRefs.size > 500) runRefs.clear();
    runRefs.set(runId, ref);
    return ref;
  };

  const removeStateFile = (runId: string): boolean => {
    try {
      const f = stateFile(runId);
      if (!existsSync(f)) return false;
      unlinkWithRetry(f);
      return true;
    } catch (e) {
      log.warn('Gesprächsstand-Datei konnte nicht gelöscht werden', { runId, error: errorMessage(e) });
      return false;
    }
  };

  const store: RunStore = {
    create(input) {
      const now = core.clock.now();
      const id = newId('run');
      try {
        core.db.run(
          `INSERT INTO agent_runs(id, task_id, project_id, role, status, step_count, input_tokens, output_tokens, files, active_ms, started_at, updated_at)
           VALUES (?, ?, ?, ?, 'running', 0, 0, 0, '[]', 0, ?, ?)`,
          [id, input.taskId, input.projectId, input.role, now, now],
        );
      } catch (e) {
        if (/FOREIGN KEY/i.test(errorMessage(e))) throw notFound('Aufgabe', input.taskId);
        throw e;
      }
      runRefs.set(id, { taskId: input.taskId, projectId: input.projectId });
      return emitRun(id);
    },

    get(id) {
      const row = getRow(id);
      return row ? toRun(row) : null;
    },

    update(id, patch) {
      if (!getRow(id)) throw notFound('Agentenlauf', id);
      const sets: string[] = [];
      const params: SqlValue[] = [];
      const set = (column: string, value: SqlValue) => {
        sets.push(`${column} = ?`);
        params.push(value);
      };
      if (patch.status !== undefined) {
        if (!AgentRunStatusEnum.safeParse(patch.status).success) throw validation(`Ungültiger Laufstatus: ${String(patch.status)}`);
        set('status', patch.status);
      }
      if (patch.providerId !== undefined) set('provider_id', patch.providerId);
      if (patch.modelId !== undefined) set('model_id', patch.modelId);
      if (patch.stepCount !== undefined) set('step_count', Math.max(0, Math.round(patch.stepCount)));
      if (patch.inputTokens !== undefined) set('input_tokens', Math.max(0, Math.round(patch.inputTokens)));
      if (patch.outputTokens !== undefined) set('output_tokens', Math.max(0, Math.round(patch.outputTokens)));
      if (patch.lastAction !== undefined) set('last_action', clip(patch.lastAction, TEXT_FIELD_MAX));
      if (patch.blocker !== undefined) set('blocker', clip(patch.blocker, TEXT_FIELD_MAX));
      if (patch.files !== undefined) set('files', toJson([...new Set(patch.files)]));
      if (patch.pendingApprovalId !== undefined) set('pending_approval_id', patch.pendingApprovalId);
      if (patch.error !== undefined) set('error', clip(patch.error, TEXT_FIELD_MAX));
      if (patch.errorCode !== undefined) set('error_code', patch.errorCode);
      if (patch.activeMs !== undefined) set('active_ms', Math.max(0, Math.round(patch.activeMs)));
      if (patch.endedAt !== undefined) set('ended_at', patch.endedAt);
      set('updated_at', patch.updatedAt ?? core.clock.now());
      params.push(id);
      core.db.run(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = ?`, params);
      return emitRun(id);
    },

    list(filter = {}) {
      const where: string[] = [];
      const params: SqlValue[] = [];
      if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
      }
      if (filter.taskId) {
        where.push('task_id = ?');
        params.push(filter.taskId);
      }
      if (filter.pendingApprovalId) {
        where.push('pending_approval_id = ?');
        params.push(filter.pendingApprovalId);
      }
      if (filter.activeOnly) where.push("status = 'running'");
      if (filter.status && filter.status.length > 0) {
        where.push(`status IN (${filter.status.map(() => '?').join(', ')})`);
        params.push(...filter.status);
      }
      const limit = Math.max(1, Math.min(1000, Math.round(filter.limit ?? 100)));
      params.push(limit);
      const rows = core.db.all<RunRow>(
        `SELECT ${RUN_COLUMNS} FROM agent_runs ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC, rowid DESC LIMIT ?`,
        params,
      );
      return rows.map(toRun);
    },

    latestForTask(taskId, role) {
      const row = role
        ? core.db.get<RunRow>(`SELECT ${RUN_COLUMNS} FROM agent_runs WHERE task_id = ? AND role = ? ORDER BY started_at DESC, rowid DESC LIMIT 1`, [taskId, role])
        : core.db.get<RunRow>(`SELECT ${RUN_COLUMNS} FROM agent_runs WHERE task_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 1`, [taskId]);
      return row ? toRun(row) : null;
    },

    addStep(runId, kind, summary, data) {
      const ref = refFor(runId);
      const ts = core.clock.now();
      const text = clip(summary, SUMMARY_MAX) ?? '';
      const bounded = data === undefined ? null : boundStepData(data);
      const json = bounded === null ? null : (safeStringify(bounded) ?? null);
      const r = core.db.run('INSERT INTO agent_steps(run_id, task_id, project_id, ts, kind, summary, data) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        runId,
        ref.taskId,
        ref.projectId,
        ts,
        kind,
        text,
        json,
      ]);
      const step: AgentStep = {
        id: r.lastInsertRowid,
        runId,
        taskId: ref.taskId,
        projectId: ref.projectId,
        ts,
        kind,
        summary: text,
        data: json === null ? null : (JSON.parse(json) as unknown),
      };
      core.bus.emit('run.step', step);
      return step;
    },

    steps(runId, afterId, limit) {
      const n = Math.max(1, Math.min(2000, Math.round(limit ?? 300)));
      if (afterId !== undefined && afterId !== null) {
        return core.db
          .all<StepRow>('SELECT * FROM agent_steps WHERE run_id = ? AND id > ? ORDER BY id ASC LIMIT ?', [runId, afterId, n])
          .map(toStep);
      }
      // Without a cursor: the newest `limit` steps, oldest first (feed view).
      return core.db
        .all<StepRow>('SELECT * FROM (SELECT * FROM agent_steps WHERE run_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC', [runId, n])
        .map(toStep);
    },

    saveState(runId, state) {
      if (!getRow(runId)) throw notFound('Agentenlauf', runId);
      const json = safeStringify(state);
      if (json === null) throw new NovaError('INTERNAL', 'Der Gesprächsstand konnte nicht gespeichert werden.');
      if (byteLength(json) > inlineMax) {
        const file = stateFile(runId);
        atomicWriteFile(file, json);
        core.db.run('UPDATE agent_runs SET state = ? WHERE id = ?', [JSON.stringify({ [STATE_REF_KEY]: `${runId}.json` }), runId]);
      } else {
        core.db.run('UPDATE agent_runs SET state = ? WHERE id = ?', [json, runId]);
        removeStateFile(runId);
      }
    },

    loadState<T>(runId: string): T | null {
      const row = core.db.get<{ state: string | null }>('SELECT state FROM agent_runs WHERE id = ?', [runId]);
      if (!row || row.state === null || row.state === '') return null;
      const parsed = fromJson<unknown>(row.state, undefined);
      if (parsed === undefined) {
        log.warn('Gesprächsstand ist beschädigt', { runId });
        return null;
      }
      if (parsed && typeof parsed === 'object' && STATE_REF_KEY in (parsed as Record<string, unknown>)) {
        try {
          const file = stateFile(runId);
          if (!existsSync(file)) {
            log.warn('Gesprächsstand-Datei fehlt', { runId });
            return null;
          }
          return JSON.parse(readFileSync(file, 'utf8')) as T;
        } catch (e) {
          log.warn('Gesprächsstand-Datei ist beschädigt', { runId, error: errorMessage(e) });
          return null;
        }
      }
      return parsed as T;
    },

    markInterrupted() {
      const rows = core.db.all<{ id: string }>("SELECT id FROM agent_runs WHERE status = 'running'");
      const out: AgentRun[] = [];
      for (const { id } of rows) {
        const run = store.update(id, { status: 'interrupted', lastAction: 'Durch Beenden des Hintergrunddienstes unterbrochen' });
        try {
          store.addStep(id, 'status', 'Der Lauf wurde unterbrochen, weil der Hintergrunddienst beendet wurde. Er kann fortgesetzt werden.');
        } catch (e) {
          log.warn('Schritt konnte nicht gespeichert werden', { runId: id, error: errorMessage(e) });
        }
        out.push(run);
      }
      return out;
    },

    prune(olderThanMs) {
      let deleted = 0;
      const candidates = core.db.all<{ id: string }>(
        `SELECT r.id FROM agent_runs r
         WHERE r.status != 'running' AND COALESCE(r.ended_at, r.updated_at) < ?
           AND (r.status IN (${TERMINAL.map(() => '?').join(', ')})
                OR EXISTS (SELECT 1 FROM agent_runs n WHERE n.task_id = r.task_id AND n.role = r.role AND n.rowid > r.rowid))`,
        [olderThanMs, ...TERMINAL],
      );
      for (const { id } of candidates) {
        core.db.transaction(() => {
          deleted += core.db.run('DELETE FROM agent_steps WHERE run_id = ?', [id]).changes;
          core.db.run('UPDATE agent_runs SET state = NULL WHERE id = ?', [id]);
        });
        removeStateFile(id);
      }
      // Cap steps per run.
      const big = core.db.all<{ run_id: string }>('SELECT run_id FROM agent_steps GROUP BY run_id HAVING COUNT(*) > ?', [MAX_STEPS_PER_RUN]);
      for (const { run_id } of big) {
        const cut = core.db.get<{ id: number }>('SELECT id FROM agent_steps WHERE run_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?', [run_id, MAX_STEPS_PER_RUN]);
        if (cut) deleted += core.db.run('DELETE FROM agent_steps WHERE run_id = ? AND id <= ?', [run_id, cut.id]).changes;
      }
      // Orphaned state files (run deleted with its task, or state moved back inline) and stale temp files.
      try {
        if (existsSync(core.paths.runState)) {
          for (const name of readdirSync(core.paths.runState)) {
            const full = join(core.paths.runState, name);
            if (name.endsWith('.tmp~')) {
              try {
                if (statSync(full).mtimeMs < core.clock.now() - 60 * 60 * 1000) unlinkWithRetry(full);
              } catch {
                /* ignore */
              }
              continue;
            }
            const m = /^(.+)\.json$/.exec(name);
            if (!m) continue;
            const row = core.db.get<{ state: string | null }>('SELECT state FROM agent_runs WHERE id = ?', [m[1]]);
            const referenced = !!row?.state && row.state.startsWith(`{"${STATE_REF_KEY}"`);
            if (!referenced) removeStateFile(m[1]);
          }
        }
      } catch (e) {
        log.warn('Aufräumen der Gesprächsstand-Dateien fehlgeschlagen', { error: errorMessage(e) });
      }
      return deleted;
    },
  };
  return store;
}
