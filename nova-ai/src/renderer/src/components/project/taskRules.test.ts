import { describe, expect, it } from 'vitest';
import type { AgentRun, Task, TaskStatus } from '@shared/schemas';
import {
  dependentsClosure,
  groupTasks,
  joinProjectPath,
  matchesRunFilter,
  matchesStatusFilter,
  openDependencies,
  sortRuns,
  sortTasks,
  startDisabledReason,
  taskCapabilities,
  upsertById,
} from './taskRules';

const t = (id: string, status: TaskStatus, extra: Partial<Task> = {}): Task =>
  ({ id, status, priority: 1, createdAt: 1, updatedAt: 1, dependsOn: [], startRequested: false, ...extra }) as Task;

describe('taskCapabilities', () => {
  it('allows editing everything except running tasks (also while paused)', () => {
    expect(taskCapabilities(t('a', 'running')).edit).toBe(false);
    expect(taskCapabilities(t('a', 'paused')).edit).toBe(true);
    expect(taskCapabilities(t('a', 'done')).edit).toBe(true);
  });

  it('matches the daemon rules for start, pause, resume, stop, retry and delete', () => {
    const running = taskCapabilities(t('a', 'running'));
    expect(running).toMatchObject({ start: false, pause: true, resume: false, stop: true, retry: false, remove: false });
    const paused = taskCapabilities(t('a', 'paused'));
    expect(paused).toMatchObject({ start: false, pause: false, resume: true, stop: true, remove: true });
    const failed = taskCapabilities(t('a', 'failed'));
    expect(failed).toMatchObject({ start: true, retry: true, stop: false, note: false });
    expect(taskCapabilities(t('a', 'waiting_approval')).remove).toBe(false);
    expect(taskCapabilities(t('a', 'done'))).toMatchObject({ start: false, retry: true, priority: false });
  });

  it('does not offer "start" again for a queued task the user already started', () => {
    expect(taskCapabilities(t('a', 'queued', { startRequested: true })).start).toBe(false);
    expect(startDisabledReason(t('a', 'queued', { startRequested: true }))).toBe('Startet, sobald ein Platz frei ist.');
    expect(taskCapabilities(t('a', 'queued')).start).toBe(true);
  });
});

describe('filters, grouping and sorting', () => {
  it('groups by what needs attention', () => {
    const g = groupTasks([t('a', 'blocked'), t('b', 'running'), t('c', 'queued'), t('d', 'done'), t('e', 'interrupted')]);
    expect(g.attention.map((x) => x.id)).toEqual(['a', 'e']);
    expect(g.active.map((x) => x.id)).toEqual(['b']);
    expect(g.queued.map((x) => x.id)).toEqual(['c']);
    expect(g.finished.map((x) => x.id)).toEqual(['d']);
    expect(matchesStatusFilter('failed', 'open')).toBe(true);
    expect(matchesStatusFilter('cancelled', 'open')).toBe(false);
  });

  it('sorts by priority, then urgency, then age', () => {
    const sorted = sortTasks([t('low', 'queued', { priority: 0 }), t('blocked', 'blocked'), t('running', 'running'), t('high', 'queued', { priority: 3 })], 'priority');
    expect(sorted.map((x) => x.id)).toEqual(['high', 'blocked', 'running', 'low']);
  });

  it('puts running agents first', () => {
    const r = (id: string, status: AgentRun['status'], startedAt: number) => ({ id, status, startedAt }) as AgentRun;
    expect(sortRuns([r('done', 'done', 9), r('wait', 'waiting_approval', 5), r('run', 'running', 1)]).map((x) => x.id)).toEqual(['run', 'wait', 'done']);
    expect(matchesRunFilter('blocked', 'waiting')).toBe(true);
    expect(matchesRunFilter('failed', 'ended')).toBe(true);
  });
});

describe('dependencies', () => {
  it('finds all tasks that depend on a task (to avoid cycles)', () => {
    const tasks = [t('a', 'queued'), t('b', 'queued', { dependsOn: ['a'] }), t('c', 'queued', { dependsOn: ['b'] }), t('d', 'queued')];
    expect([...dependentsClosure(tasks, 'a')].sort()).toEqual(['b', 'c']);
    expect(dependentsClosure(tasks, 'd').size).toBe(0);
  });

  it('lists dependencies that are not done', () => {
    const byId = new Map([
      ['a', t('a', 'done')],
      ['b', t('b', 'running')],
    ]);
    expect(openDependencies(t('x', 'queued', { dependsOn: ['a', 'b', 'gone'] }), byId)).toEqual(['b', 'gone']);
  });
});

describe('helpers', () => {
  it('upserts by id', () => {
    expect(upsertById([{ id: 'a', v: 1 }], { id: 'a', v: 2 })).toEqual([{ id: 'a', v: 2 }]);
    expect(upsertById([{ id: 'a', v: 1 }], { id: 'b', v: 2 }, 'start').map((x) => x.id)).toEqual(['b', 'a']);
  });

  it('joins project paths for Windows and POSIX', () => {
    expect(joinProjectPath('C:\\Projekte\\Spiel', 'dist/index.html')).toBe('C:\\Projekte\\Spiel\\dist\\index.html');
    expect(joinProjectPath('/home/a/spiel/', 'dist/index.html')).toBe('/home/a/spiel/dist/index.html');
  });
});
