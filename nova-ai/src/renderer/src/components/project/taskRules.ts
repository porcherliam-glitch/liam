// Pure rules for tasks shown in the projects/agents/tasks pages: which controls are allowed per status,
// status groups for the boards, sorting and dependency helpers. No React, no data access.
import type { AgentRun, Task, TaskStatus } from '@shared/schemas';

export interface TaskCapabilities {
  /** tasks.start – queue (or re-queue) the task. */
  start: boolean;
  /** tasks.pause */
  pause: boolean;
  /** tasks.resume */
  resume: boolean;
  /** tasks.stop */
  stop: boolean;
  /** tasks.retry – fresh start with reset attempts. */
  retry: boolean;
  /** tasks.update – everything except running (also allowed while paused). */
  edit: boolean;
  /** tasks.delete */
  remove: boolean;
  /** tasks.setPriority (pointless for finished tasks). */
  priority: boolean;
  /** tasks.addNote – hints/answers for open tasks. */
  note: boolean;
}

const START = new Set<TaskStatus>(['queued', 'blocked', 'failed', 'cancelled', 'interrupted']);
const PAUSE = new Set<TaskStatus>(['running', 'queued', 'waiting_approval', 'blocked']);
const STOP = new Set<TaskStatus>(['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'interrupted']);
const RETRY = new Set<TaskStatus>(['failed', 'blocked', 'cancelled', 'interrupted', 'done']);
const FINISHED = new Set<TaskStatus>(['done', 'failed', 'cancelled']);
const CLOSED = new Set<TaskStatus>(['done', 'cancelled']);

/** Which task controls are enabled for the task's current status (mirrors the daemon rules, SPEC §6.5). */
export function taskCapabilities(task: Pick<Task, 'status' | 'startRequested'>): TaskCapabilities {
  const s = task.status;
  return {
    // A queued task the user already started is just waiting for a free slot.
    start: START.has(s) && !(s === 'queued' && task.startRequested),
    pause: PAUSE.has(s),
    resume: s === 'paused',
    stop: STOP.has(s),
    retry: RETRY.has(s),
    edit: s !== 'running',
    remove: s !== 'running' && s !== 'waiting_approval',
    priority: !CLOSED.has(s),
    note: !FINISHED.has(s),
  };
}

/** German reason why the start button is disabled (tooltip), or null when it is enabled. */
export function startDisabledReason(task: Pick<Task, 'status' | 'startRequested'>): string | null {
  switch (task.status) {
    case 'running':
      return 'Die Aufgabe läuft bereits.';
    case 'waiting_approval':
      return 'Die Aufgabe wartet auf eine Freigabe.';
    case 'paused':
      return null; // resume instead
    case 'done':
      return 'Bereits erledigt – „Wiederholen“ startet sie noch einmal.';
    case 'queued':
      return task.startRequested ? 'Startet, sobald ein Platz frei ist.' : null;
    default:
      return null;
  }
}

/** True for finished tasks (done/failed/cancelled). */
export function isFinished(status: TaskStatus): boolean {
  return FINISHED.has(status);
}

/** Status groups of the task boards. */
export type TaskGroup = 'attention' | 'active' | 'queued' | 'finished';

export const TASK_GROUP_ORDER: TaskGroup[] = ['attention', 'active', 'queued', 'finished'];

export const TASK_GROUP_LABEL: Record<TaskGroup, { title: string; description: string }> = {
  attention: { title: 'Braucht Aufmerksamkeit', description: 'Wartet auf eine Freigabe, ist blockiert, fehlgeschlagen oder wurde unterbrochen.' },
  active: { title: 'In Arbeit', description: 'Läuft gerade oder ist pausiert.' },
  queued: { title: 'Warteschlange', description: 'Wartet darauf, bearbeitet zu werden.' },
  finished: { title: 'Abgeschlossen', description: 'Erledigt oder abgebrochen.' },
};

const GROUP_OF: Record<TaskStatus, TaskGroup> = {
  waiting_approval: 'attention',
  blocked: 'attention',
  failed: 'attention',
  interrupted: 'attention',
  running: 'active',
  paused: 'active',
  queued: 'queued',
  done: 'finished',
  cancelled: 'finished',
};

export function taskGroup(status: TaskStatus): TaskGroup {
  return GROUP_OF[status] ?? 'queued';
}

/** Status filter of the boards: everything, open tasks, or one group. */
export type TaskStatusFilter = 'all' | 'open' | TaskGroup;

export function matchesStatusFilter(status: TaskStatus, filter: TaskStatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'open') return !CLOSED.has(status);
  return taskGroup(status) === filter;
}

export type TaskSort = 'priority' | 'updated' | 'created';

/** Display order within a status: what needs the user first. */
const STATUS_ORDER: Record<TaskStatus, number> = {
  waiting_approval: 0,
  blocked: 1,
  failed: 2,
  interrupted: 3,
  running: 4,
  paused: 5,
  queued: 6,
  done: 7,
  cancelled: 8,
};

/** Returns a sorted copy. priority = highest first, then status urgency, then oldest first. */
export function sortTasks(tasks: readonly Task[], sort: TaskSort): Task[] {
  const copy = [...tasks];
  if (sort === 'updated') return copy.sort((a, b) => b.updatedAt - a.updatedAt);
  if (sort === 'created') return copy.sort((a, b) => b.createdAt - a.createdAt);
  return copy.sort((a, b) => b.priority - a.priority || STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.createdAt - b.createdAt);
}

/** Groups tasks by board group (keeps the given order inside each group). */
export function groupTasks(tasks: readonly Task[]): Record<TaskGroup, Task[]> {
  const out: Record<TaskGroup, Task[]> = { attention: [], active: [], queued: [], finished: [] };
  for (const t of tasks) out[taskGroup(t.status)].push(t);
  return out;
}

/**
 * Ids of all tasks that depend on `taskId` directly or indirectly. Such tasks must not become a dependency of
 * `taskId` (that would create a cycle).
 */
export function dependentsClosure(tasks: readonly Pick<Task, 'id' | 'dependsOn'>[], taskId: string): Set<string> {
  const result = new Set<string>();
  const queue = [taskId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const t of tasks) {
      if (t.dependsOn.includes(current) && !result.has(t.id) && t.id !== taskId) {
        result.add(t.id);
        queue.push(t.id);
      }
    }
  }
  return result;
}

/** Dependencies of `task` that are not done yet (unknown ids count as open). */
export function openDependencies(task: Pick<Task, 'dependsOn'>, byId: ReadonlyMap<string, Pick<Task, 'status'>>): string[] {
  return task.dependsOn.filter((id) => byId.get(id)?.status !== 'done');
}

/** Inserts or replaces an item by id (keeps the position of an existing item). */
export function upsertById<T extends { id: string }>(list: readonly T[], item: T, position: 'start' | 'end' = 'end'): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return position === 'start' ? [item, ...list] : [...list, item];
  const copy = [...list];
  copy[i] = item;
  return copy;
}

/** Agent runs: active (running) first, then waiting, then newest first. */
const RUN_ORDER: Record<AgentRun['status'], number> = {
  running: 0,
  waiting_approval: 1,
  paused: 2,
  blocked: 3,
  interrupted: 4,
  failed: 5,
  done: 6,
  cancelled: 7,
};

export function sortRuns(runs: readonly AgentRun[]): AgentRun[] {
  return [...runs].sort((a, b) => {
    const activeA = a.status === 'running' ? 0 : 1;
    const activeB = b.status === 'running' ? 0 : 1;
    return activeA - activeB || RUN_ORDER[a.status] - RUN_ORDER[b.status] || b.startedAt - a.startedAt;
  });
}

/** Run filter groups of the agents views. */
export type RunFilter = 'all' | 'active' | 'waiting' | 'ended';

export function matchesRunFilter(status: AgentRun['status'], filter: RunFilter): boolean {
  switch (filter) {
    case 'active':
      return status === 'running';
    case 'waiting':
      return status === 'paused' || status === 'waiting_approval' || status === 'blocked' || status === 'interrupted';
    case 'ended':
      return status === 'done' || status === 'failed' || status === 'cancelled';
    default:
      return true;
  }
}

/** Joins a project root (Windows or POSIX) and a project-relative path with forward slashes. */
export function joinProjectPath(root: string, relative: string): string {
  const windows = root.includes('\\') || /^[a-zA-Z]:/.test(root);
  const sep = windows ? '\\' : '/';
  const rel = windows ? relative.replace(/\//g, '\\') : relative;
  return root.endsWith(sep) ? `${root}${rel}` : `${root}${sep}${rel}`;
}
