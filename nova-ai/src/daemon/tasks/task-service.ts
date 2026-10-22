// Orchestrator – TaskService: task CRUD, validation, file bookkeeping and the task conversation (table `task_notes`).
// Key decisions:
// - Inputs are (re)parsed with the shared zod schemas, so internal callers get the same validation and defaults as RPC.
// - dependsOn: same project, existing tasks, no self-reference, no cycles (DFS) – German VALIDATION messages.
// - Role/kind consistency: 'plan' tasks always run the planner and the planner only runs 'plan' tasks (the planner's
//   output is a plan; any other combination would make the outcome mapping ambiguous).
// - delete: CONFLICT while running or while OPEN tasks depend on it. Closed dependents (done/failed/cancelled) get the
//   reference removed and children lose their parentId, so no dangling ids remain. Runs, steps and notes go via
//   ON DELETE CASCADE; pending approvals expire; locks are released; open errors of the task are resolved.
// - update: allowed in every status except running; expires pending approvals of the task BEFORE writing (an edited
//   task must not continue with approvals given for the old content).
// - Only the WorkCycle changes status/blocker/result/verification/attempts/times/startRequested (via patch()).
// - Note texts, options and assumptions are redacted on store; every note change emits 'task.note'.
import { z } from 'zod';
import type { Task, TaskKind, AgentRole, TaskNote, TaskStatus } from '@shared/schemas';
import { CreateTaskInputSchema, UpdateTaskInputSchema } from '@shared/schemas';
import type { Services, TaskService } from '../contracts';
import { fromJson, toJson } from '../db/database';
import { newId, type IdPrefix } from '../core/ids';
import { conflict, notFound, validation } from '../core/errors';
import { redactString } from '../core/redact';
import {
  OPEN_STATUSES,
  PATCH_COLUMNS,
  TASK_STATUSES,
  dedupePaths,
  defaultRoleForKind,
  emptyVerification,
  normalizeRelPath,
  pathKey,
  rowToTask,
  type TaskRow,
} from './task-store';

interface NoteRow {
  id: string;
  task_id: string;
  project_id: string;
  author: string;
  kind: string;
  text: string;
  options: string;
  assumption: string | null;
  created_at: number;
  consumed_run_id: string | null;
}

function rowToNote(r: NoteRow): TaskNote {
  const options = fromJson<unknown>(r.options, []);
  return {
    id: r.id,
    taskId: r.task_id,
    projectId: r.project_id,
    author: r.author as TaskNote['author'],
    kind: r.kind as TaskNote['kind'],
    text: r.text,
    options: Array.isArray(options) ? options.filter((o): o is string => typeof o === 'string') : [],
    assumption: r.assumption,
    createdAt: Number(r.created_at),
    consumedRunId: r.consumed_run_id,
  };
}

/** zod parse with a German VALIDATION error listing the issues. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const issues = r.error.issues.map((i) => `${i.path.length ? i.path.join('.') : 'Eingabe'}: ${i.message}`).join('; ');
    throw validation(`Ungültige Eingabe: ${issues}`, r.error.issues);
  }
  return r.data;
}

function checkRoleKind(kind: TaskKind, role: AgentRole): void {
  if (kind === 'plan' && role !== 'planner') {
    throw validation('Planungsaufgaben werden immer vom Planungsagenten bearbeitet.');
  }
  if (role === 'planner' && kind !== 'plan') {
    throw validation('Der Planungsagent bearbeitet nur Planungsaufgaben (Art „plan“).');
  }
}

const NOTE_PREFIX = 'note' as IdPrefix; // core/ids.ts has no 'note' prefix yet (contract change requested)
const CHUNK = 400;

export function createTaskService(s: Services): TaskService {
  const core = s.core;
  const db = core.db;

  function getRow(id: string): TaskRow | undefined {
    return db.get<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  }

  function get(id: string): Task | null {
    const r = getRow(id);
    return r ? rowToTask(r) : null;
  }

  function require(id: string): Task {
    const t = get(id);
    if (!t) throw notFound('Aufgabe', id);
    return t;
  }

  /** Statuses of the given ids (missing ids are absent from the map). */
  function statusMap(ids: string[]): Map<string, { status: TaskStatus; title: string }> {
    const out = new Map<string, { status: TaskStatus; title: string }>();
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += CHUNK) {
      const part = unique.slice(i, i + CHUNK);
      const rows = db.all<{ id: string; status: string; title: string }>(
        `SELECT id, status, title FROM tasks WHERE id IN (${part.map(() => '?').join(',')})`,
        part,
      );
      for (const r of rows) out.set(r.id, { status: r.status as TaskStatus, title: r.title });
    }
    return out;
  }

  function emitUpdated(task: Task): void {
    core.bus.emit('task.updated', task);
  }

  function patchInternal(id: string, patch: Record<string, unknown>): Task {
    const sets: string[] = [];
    const params: (string | number | null | bigint | Uint8Array)[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const col = PATCH_COLUMNS[key];
      if (!col) continue;
      sets.push(`${col.col} = ?`);
      params.push(col.enc(value));
    }
    if (!getRow(id)) throw notFound('Aufgabe', id);
    sets.push('updated_at = ?');
    params.push(core.clock.now());
    params.push(id);
    db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
    const task = require(id);
    emitUpdated(task);
    return task;
  }

  /** Validates a dependency list for a task of `projectId` (selfId = null for new tasks). Returns the deduped list. */
  function validateDeps(projectId: string, selfId: string | null, deps: string[]): string[] {
    const unique = [...new Set(deps.map((d) => String(d).trim()).filter(Boolean))];
    for (const dep of unique) {
      if (selfId && dep === selfId) throw validation('Eine Aufgabe kann nicht von sich selbst abhängen.');
      const row = getRow(dep);
      if (!row) throw validation(`Die Abhängigkeit wurde nicht gefunden (${dep}).`);
      if (row.project_id !== projectId) {
        throw validation(`Die Aufgabe „${row.title}“ gehört zu einem anderen Projekt und kann keine Abhängigkeit sein.`);
      }
    }
    if (selfId && unique.length) {
      // DFS over the dependency graph: a path from any new dependency back to selfId is a cycle.
      const titles = new Map<string, string>();
      const depsOf = (id: string): string[] => {
        const r = getRow(id);
        if (!r) return [];
        titles.set(id, r.title);
        return fromJson<string[]>(r.depends_on, []);
      };
      for (const start of unique) {
        const stack: { id: string; path: string[] }[] = [{ id: start, path: [start] }];
        const seen = new Set<string>();
        while (stack.length) {
          const { id, path } = stack.pop()!;
          if (id === selfId) {
            const selfTitle = getRow(selfId)?.title ?? selfId;
            const names = [selfTitle, ...path.map((p) => titles.get(p) ?? getRow(p)?.title ?? p)];
            throw validation(`Diese Abhängigkeit würde einen Kreis bilden: ${names.map((n) => `„${n}“`).join(' → ')}.`);
          }
          if (seen.has(id)) continue;
          seen.add(id);
          for (const next of depsOf(id)) stack.push({ id: next, path: [...path, next] });
        }
      }
    }
    return unique;
  }

  function dependentsOf(task: Task): Task[] {
    const rows = db.all<TaskRow>("SELECT * FROM tasks WHERE project_id = ? AND depends_on != '[]' AND id != ?", [task.projectId, task.id]);
    return rows.map(rowToTask).filter((t) => t.dependsOn.includes(task.id));
  }

  const service: TaskService = {
    list(filter = {}) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
      }
      if (filter.parentId) {
        where.push('parent_id = ?');
        params.push(filter.parentId);
      }
      if (filter.status && filter.status.length) {
        where.push(`status IN (${filter.status.map(() => '?').join(',')})`);
        params.push(...filter.status);
      }
      const limit = Math.max(1, Math.min(100000, filter.limit ?? 500));
      params.push(limit);
      // Newest `limit` tasks, returned in creation order.
      const sql = `SELECT * FROM (SELECT *, rowid AS _rid FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                   ORDER BY created_at DESC, rowid DESC LIMIT ?) ORDER BY created_at ASC, _rid ASC`;
      return db.all<TaskRow>(sql, params).map(rowToTask);
    },

    get,
    require,

    create(input, source = 'user') {
      const p = parseInput(CreateTaskInputSchema, input);
      const title = p.title.trim();
      if (!title) throw validation('Bitte einen Titel für die Aufgabe angeben.');
      const project = s.projects.get(p.projectId);
      if (!project) throw notFound('Projekt', p.projectId);
      const role = p.role ?? defaultRoleForKind(p.kind);
      checkRoleKind(p.kind, role);
      const dependsOn = validateDeps(p.projectId, null, p.dependsOn);
      if (p.parentId) {
        const parent = getRow(p.parentId);
        if (!parent) throw validation(`Die übergeordnete Aufgabe wurde nicht gefunden (${p.parentId}).`);
        if (parent.project_id !== p.projectId) throw validation('Die übergeordnete Aufgabe gehört zu einem anderen Projekt.');
      }
      const maxAttempts = p.maxAttempts ?? core.settings.section('agents').maxAttempts;
      const plannedFiles = dedupePaths(p.plannedFiles, core.platform);
      const id = newId('task');
      const now = core.clock.now();
      db.run(
        `INSERT INTO tasks(id, project_id, parent_id, title, description, kind, role, status, priority, depends_on, attempts,
           max_attempts, blocker, blocker_code, result, acceptance, verification, files, planned_files, start_requested, model,
           source, failure_signatures, created_at, updated_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, 0, ?, NULL, NULL, NULL, ?, ?, '[]', ?, 0, NULL, ?, '[]', ?, ?, NULL, NULL)`,
        [
          id,
          p.projectId,
          p.parentId,
          title,
          p.description,
          p.kind,
          role,
          p.priority,
          toJson(dependsOn),
          maxAttempts,
          p.acceptance,
          toJson(emptyVerification()),
          toJson(plannedFiles),
          source,
          now,
          now,
        ],
      );
      const task = require(id);
      emitUpdated(task);
      return task;
    },

    update(input) {
      const p = parseInput(UpdateTaskInputSchema, input);
      const task = require(p.id);
      if (task.status === 'running') {
        throw conflict('Die Aufgabe läuft gerade und kann nicht bearbeitet werden. Bitte die Aufgabe zuerst pausieren.');
      }
      const role = p.role ?? task.role;
      checkRoleKind(task.kind, role);
      const dependsOn = p.dependsOn !== undefined ? validateDeps(task.projectId, task.id, p.dependsOn) : undefined;
      let title: string | undefined;
      if (p.title !== undefined) {
        title = p.title.trim();
        if (!title) throw validation('Bitte einen Titel für die Aufgabe angeben.');
      }
      // Pending approvals were requested for the old task content → expire them before the edit is stored.
      s.approvals.expireForTask(task.id);
      return patchInternal(task.id, {
        title,
        description: p.description,
        priority: p.priority,
        dependsOn,
        acceptance: p.acceptance,
        role: p.role !== undefined ? role : undefined,
        maxAttempts: p.maxAttempts,
      });
    },

    setPriority(id, priority) {
      if (!Number.isInteger(priority) || priority < 0 || priority > 3) {
        throw validation('Die Priorität muss zwischen 0 (niedrig) und 3 (kritisch) liegen.');
      }
      require(id);
      return patchInternal(id, { priority });
    },

    delete(id) {
      const task = require(id);
      if (task.status === 'running') throw conflict('Die Aufgabe läuft gerade und kann nicht gelöscht werden. Bitte zuerst stoppen.');
      const dependents = dependentsOf(task);
      const open = dependents.filter((d) => OPEN_STATUSES.includes(d.status));
      if (open.length) {
        throw conflict(
          `Andere offene Aufgaben hängen von dieser Aufgabe ab: ${open.map((d) => `„${d.title}“`).join(', ')}. Bitte diese zuerst anpassen oder löschen.`,
          { dependents: open.map((d) => d.id) },
        );
      }
      s.approvals.expireForTask(id);
      s.locks.releaseTask(id);
      const now = core.clock.now();
      const changedIds: string[] = [];
      db.transaction(() => {
        for (const d of dependents) {
          db.run('UPDATE tasks SET depends_on = ?, updated_at = ? WHERE id = ?', [toJson(d.dependsOn.filter((x) => x !== id)), now, d.id]);
          changedIds.push(d.id);
        }
        const children = db.all<{ id: string }>('SELECT id FROM tasks WHERE parent_id = ?', [id]);
        db.run('UPDATE tasks SET parent_id = NULL, updated_at = ? WHERE parent_id = ?', [now, id]);
        changedIds.push(...children.map((c) => c.id));
        db.run('DELETE FROM tasks WHERE id = ?', [id]);
      });
      for (const cid of new Set(changedIds)) {
        const t = get(cid);
        if (t) emitUpdated(t);
      }
      core.errors.resolveWhere({ taskId: id });
      core.bus.emit('task.removed', { id, projectId: task.projectId });
    },

    patch(id, patch) {
      return patchInternal(id, patch as Record<string, unknown>);
    },

    addFiles(id, files) {
      const task = require(id);
      const keys = new Set(task.files.map((f) => pathKey(f, core.platform)));
      const added: string[] = [];
      for (const f of files) {
        const rel = normalizeRelPath(f);
        if (!rel) continue;
        const key = pathKey(rel, core.platform);
        if (keys.has(key)) continue;
        keys.add(key);
        added.push(rel);
      }
      if (!added.length) return task;
      return patchInternal(id, { files: [...task.files, ...added] });
    },

    ready(projectId) {
      const rows = projectId
        ? db.all<TaskRow>("SELECT * FROM tasks WHERE status = 'queued' AND project_id = ? ORDER BY priority DESC, created_at ASC, rowid ASC", [projectId])
        : db.all<TaskRow>("SELECT * FROM tasks WHERE status = 'queued' ORDER BY priority DESC, created_at ASC, rowid ASC");
      const tasks = rows.map(rowToTask);
      const deps = statusMap(tasks.flatMap((t) => t.dependsOn));
      // Missing dependencies count as satisfied (deleted tasks cannot block forever).
      return tasks.filter((t) => t.dependsOn.every((d) => !deps.has(d) || deps.get(d)!.status === 'done'));
    },

    counts(projectId) {
      const out = Object.fromEntries(TASK_STATUSES.map((st) => [st, 0])) as Record<TaskStatus, number>;
      const rows = projectId
        ? db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status', [projectId])
        : db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM tasks GROUP BY status');
      for (const r of rows) if (r.status in out) out[r.status as TaskStatus] = Number(r.n);
      return out;
    },

    notes(taskId) {
      require(taskId);
      return db.all<NoteRow>('SELECT * FROM task_notes WHERE task_id = ? ORDER BY created_at ASC, rowid ASC', [taskId]).map(rowToNote);
    },

    addNote(input) {
      const task = require(input.taskId);
      const text = redactString(String(input.text ?? '')).trim();
      if (!text) throw validation('Die Nachricht darf nicht leer sein.');
      if (text.length > 20000) throw validation('Die Nachricht ist zu lang (höchstens 20 000 Zeichen).');
      const options = (input.options ?? []).map((o) => redactString(String(o)).slice(0, 500)).filter(Boolean).slice(0, 20);
      const assumption = input.assumption ? redactString(input.assumption).slice(0, 5000) : null;
      const id = newId(NOTE_PREFIX);
      db.run(
        `INSERT INTO task_notes(id, task_id, project_id, author, kind, text, options, assumption, created_at, consumed_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
        [id, task.id, task.projectId, input.author, input.kind, text, toJson(options), assumption, core.clock.now()],
      );
      const note = rowToNote(db.get<NoteRow>('SELECT * FROM task_notes WHERE id = ?', [id])!);
      core.bus.emit('task.note', note);
      return note;
    },

    pendingNotes(taskId) {
      return db
        .all<NoteRow>("SELECT * FROM task_notes WHERE task_id = ? AND author = 'user' AND consumed_run_id IS NULL ORDER BY created_at ASC, rowid ASC", [taskId])
        .map(rowToNote);
    },

    markNotesConsumed(noteIds, runId) {
      const ids = [...new Set(noteIds)].filter(Boolean);
      if (!ids.length) return;
      const changed: string[] = [];
      db.transaction(() => {
        for (const id of ids) {
          const r = db.run('UPDATE task_notes SET consumed_run_id = ? WHERE id = ? AND consumed_run_id IS NULL', [runId, id]);
          if (r.changes > 0) changed.push(id);
        }
      });
      for (const id of changed) {
        const row = db.get<NoteRow>('SELECT * FROM task_notes WHERE id = ?', [id]);
        if (row) core.bus.emit('task.note', rowToNote(row));
      }
    },
  };
  return service;
}

