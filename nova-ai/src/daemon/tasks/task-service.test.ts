// Orchestrator tests – TaskService CRUD, validation, files, ready/counts and the task conversation.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import type { Task } from '@shared/schemas';
import { createHarness, type Harness } from './test-support';
import { readFailures, writeFailures } from './task-store';

let h: Harness;
beforeEach(() => {
  h = createHarness();
});
afterEach(async () => {
  await h.cleanup();
});

function events<T extends 'task.updated' | 'task.removed' | 'task.note'>(type: T) {
  const got: unknown[] = [];
  h.core.bus.on(type, (p) => got.push(p));
  return got;
}

describe('TaskService.create', () => {
  it('applies defaults: role by kind, maxAttempts from settings, queued, not_run, source', () => {
    const p = h.projects.add();
    h.core.settings.update({ agents: { maxAttempts: 5 } });
    const updated = events('task.updated');
    const roles = (['plan', 'code', 'fix', 'build', 'custom', 'test', 'review'] as const).map((kind) => h.tasks.create({ projectId: p.id, title: `  T ${kind}  `, kind } as never).role);
    expect(roles).toEqual(['planner', 'coder', 'coder', 'coder', 'coder', 'tester', 'reviewer']);
    const t = h.tasks.create({ projectId: p.id, title: 'Spiel bauen', plannedFiles: ['./src\\game.js', 'src/game.js', ' src/ui/ '] } as never, 'planner');
    expect(t).toMatchObject({ status: 'queued', maxAttempts: 5, attempts: 0, source: 'planner', startRequested: false, files: [], verification: { status: 'not_run', checks: [] } });
    expect(t.plannedFiles).toEqual(['src/game.js', 'src/ui']);
    expect(h.tasks.get(roles.length ? t.id : '')?.title).toBe('Spiel bauen');
    expect(updated.length).toBe(8);
    expect(h.tasks.create({ projectId: p.id, title: '  Titel  ' } as never).title).toBe('Titel');
  });

  it('rejects invalid input with German messages', () => {
    const p = h.projects.add();
    const other = h.projects.add();
    const foreign = h.tasks.create({ projectId: other.id, title: 'Fremd' } as never);
    expect(() => h.tasks.create({ projectId: 'prj_missing', title: 'X' } as never)).toThrow(/Projekt wurde nicht gefunden/);
    expect(() => h.tasks.create({ projectId: p.id, title: 'X', kind: 'plan', role: 'coder' } as never)).toThrow(/Planungsagenten/);
    expect(() => h.tasks.create({ projectId: p.id, title: 'X', kind: 'code', role: 'planner' } as never)).toThrow(/nur Planungsaufgaben/);
    expect(() => h.tasks.create({ projectId: p.id, title: '   ' } as never)).toThrow(/Titel/);
    expect(() => h.tasks.create({ projectId: p.id, title: '' } as never)).toThrow(/Ungültige Eingabe/);
    expect(() => h.tasks.create({ projectId: p.id, title: 'X', dependsOn: ['task_nope'] } as never)).toThrow(/Abhängigkeit wurde nicht gefunden/);
    expect(() => h.tasks.create({ projectId: p.id, title: 'X', dependsOn: [foreign.id] } as never)).toThrow(/anderen Projekt/);
    expect(() => h.tasks.create({ projectId: p.id, title: 'X', parentId: foreign.id } as never)).toThrow(/anderen Projekt/);
  });
});

describe('TaskService.update / setPriority / patch', () => {
  it('detects dependency cycles and self references', () => {
    const p = h.projects.add();
    const a = h.tasks.create({ projectId: p.id, title: 'A' } as never);
    const b = h.tasks.create({ projectId: p.id, title: 'B', dependsOn: [a.id] } as never);
    const c = h.tasks.create({ projectId: p.id, title: 'C', dependsOn: [b.id, b.id] } as never);
    expect(c.dependsOn).toEqual([b.id]);
    expect(() => h.tasks.update({ id: a.id, dependsOn: [c.id] })).toThrow(/Kreis bilden: „A“ → „C“ → „B“ → „A“/);
    expect(() => h.tasks.update({ id: a.id, dependsOn: [a.id] })).toThrow(/sich selbst/);
    expect(h.tasks.update({ id: c.id, dependsOn: [a.id] }).dependsOn).toEqual([a.id]);
  });

  it('refuses edits while running, expires approvals, and applies changes', () => {
    const p = h.projects.add();
    const t = h.tasks.create({ projectId: p.id, title: 'A', kind: 'code' } as never);
    const updated = h.tasks.update({ id: t.id, title: 'Neu', description: 'Beschreibung', priority: 3, acceptance: 'ok', role: 'tester', maxAttempts: 7 });
    expect(updated).toMatchObject({ title: 'Neu', description: 'Beschreibung', priority: 3, acceptance: 'ok', role: 'tester', maxAttempts: 7 });
    expect(h.approvals.expiredForTask).toContain(t.id);
    expect(() => h.tasks.update({ id: t.id, role: 'planner' })).toThrow(/nur Planungsaufgaben/);
    h.tasks.patch(t.id, { status: 'running' });
    expect(() => h.tasks.update({ id: t.id, title: 'X' })).toThrow(/läuft gerade/);
    expect(() => h.tasks.update({ id: 'task_missing', title: 'X' })).toThrow(/nicht gefunden/);
  });

  it('validates priorities and redacts stored results', () => {
    const p = h.projects.add();
    const t = h.tasks.create({ projectId: p.id, title: 'A' } as never);
    expect(h.tasks.setPriority(t.id, 3).priority).toBe(3);
    expect(() => h.tasks.setPriority(t.id, 4)).toThrow(/zwischen 0/);
    const patched = h.tasks.patch(t.id, { result: 'Schlüssel OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123', blocker: 'token=abcdefghijk' });
    expect(patched.result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123');
    expect(patched.result).toContain('[GEHEIM]');
    expect(patched.blocker).toContain('[GEHEIM]');
    // internal failure signatures are not part of the task and survive patches
    writeFailures(h.core.db, t.id, [{ signature: 'a', attempt: 1, summary: 's', ts: 1 }]);
    h.tasks.patch(t.id, { priority: 0 });
    expect(readFailures(h.core.db, t.id)).toHaveLength(1);
    expect(Object.keys(h.tasks.require(t.id))).not.toContain('failureSignatures');
  });
});

describe('TaskService.delete', () => {
  it('refuses running tasks and open dependents, cleans up closed dependents and children', () => {
    const p = h.projects.add();
    const plan = h.tasks.create({ projectId: p.id, title: 'Plan', kind: 'plan' } as never);
    const a = h.tasks.create({ projectId: p.id, title: 'A', parentId: plan.id } as never);
    const open = h.tasks.create({ projectId: p.id, title: 'Offen', dependsOn: [a.id] } as never);
    expect(() => h.tasks.delete(a.id)).toThrow(/„Offen“/);
    h.tasks.patch(open.id, { status: 'done' });
    h.tasks.patch(a.id, { status: 'running' });
    expect(() => h.tasks.delete(a.id)).toThrow(/läuft gerade/);
    h.tasks.patch(a.id, { status: 'failed' });
    h.tasks.addNote({ taskId: a.id, author: 'user', kind: 'note', text: 'Hinweis' });
    h.core.errors.report({ code: 'X', severity: 'blocker', title: 'T', whatHappened: 'W', taskId: a.id });
    const removed = events('task.removed');
    h.tasks.delete(a.id);
    expect(h.tasks.get(a.id)).toBeNull();
    expect(h.tasks.require(open.id).dependsOn).toEqual([]);
    expect(removed).toEqual([{ id: a.id, projectId: p.id }]);
    expect(h.locks.released).toContain(a.id);
    expect(h.approvals.expiredForTask).toContain(a.id);
    expect(h.core.errors.countOpen()).toBe(0);
    expect(h.core.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM task_notes WHERE task_id = ?', [a.id])?.n).toBe(0);
    h.tasks.delete(plan.id);
    expect(h.tasks.list({ projectId: p.id }).every((t: Task) => t.parentId === null)).toBe(true);
  });
});

describe('TaskService files, ready, counts, list', () => {
  it('dedupes files by key (case-insensitive on Windows) and emits only on change', () => {
    // Explicit platform on every host: POSIX keys are case-sensitive, Windows keys are not.
    (h.core as { platform: NodeJS.Platform }).platform = 'linux';
    const p = h.projects.add();
    const t = h.tasks.create({ projectId: p.id, title: 'A' } as never);
    const updated = events('task.updated');
    expect(h.tasks.addFiles(t.id, ['src\\App.ts', './src/App.ts', 'README.md']).files).toEqual(['src/App.ts', 'README.md']);
    h.tasks.addFiles(t.id, ['src/App.ts']);
    expect(updated).toHaveLength(1);
    expect(h.tasks.addFiles(t.id, ['src/app.ts']).files).toEqual(['src/App.ts', 'README.md', 'src/app.ts']);
    (h.core as { platform: NodeJS.Platform }).platform = 'win32';
    expect(h.tasks.addFiles(t.id, ['SRC/APP.TS', 'readme.md']).files).toHaveLength(3);
  });

  it('ready() orders by priority then creation and requires done dependencies', () => {
    const p = h.projects.add();
    const low = h.tasks.create({ projectId: p.id, title: 'low', priority: 0 } as never);
    const a = h.tasks.create({ projectId: p.id, title: 'a', priority: 2 } as never);
    const b = h.tasks.create({ projectId: p.id, title: 'b', priority: 2 } as never);
    const dep = h.tasks.create({ projectId: p.id, title: 'dep', priority: 3, dependsOn: [low.id] } as never);
    expect(h.tasks.ready(p.id).map((t) => t.title)).toEqual(['a', 'b', 'low']);
    h.tasks.patch(low.id, { status: 'done' });
    expect(h.tasks.ready().map((t) => t.id)).toEqual([dep.id, a.id, b.id]);
    // a dependency that no longer exists does not block forever
    h.core.db.run('UPDATE tasks SET depends_on = ? WHERE id = ?', [JSON.stringify(['task_gone']), b.id]);
    expect(h.tasks.ready().map((t) => t.id)).toContain(b.id);
    const counts = h.tasks.counts(p.id);
    expect(counts).toMatchObject({ queued: 3, done: 1, running: 0, failed: 0, cancelled: 0, interrupted: 0 });
    expect(Object.keys(counts)).toHaveLength(9);
  });

  it('list() filters and returns the newest tasks in creation order', () => {
    const p = h.projects.add();
    const ids = Array.from({ length: 5 }, (_, i) => h.tasks.create({ projectId: p.id, title: `T${i}` } as never).id);
    h.tasks.patch(ids[1], { status: 'done' });
    expect(h.tasks.list({ projectId: p.id, limit: 3 }).map((t) => t.title)).toEqual(['T2', 'T3', 'T4']);
    expect(h.tasks.list({ status: ['done'] }).map((t) => t.id)).toEqual([ids[1]]);
  });
});

describe('TaskService notes', () => {
  it('stores redacted notes, tracks pending user notes and consumption', () => {
    const p = h.projects.add();
    const t = h.tasks.create({ projectId: p.id, title: 'A' } as never);
    const noteEvents = events('task.note');
    h.tasks.addNote({ taskId: t.id, author: 'agent', kind: 'question', text: 'Welche Farbe?', options: ['Rot', 'Blau'], assumption: 'Blau' });
    const answer = h.tasks.addNote({ taskId: t.id, author: 'user', kind: 'answer', text: 'Rot, und API_KEY=supersecretvalue123' });
    expect(answer.text).toContain('[GEHEIM]');
    expect(answer.id.startsWith('note_')).toBe(true);
    expect(h.tasks.notes(t.id).map((n) => n.kind)).toEqual(['question', 'answer']);
    expect(h.tasks.notes(t.id)[0]).toMatchObject({ options: ['Rot', 'Blau'], assumption: 'Blau', consumedRunId: null });
    expect(h.tasks.pendingNotes(t.id).map((n) => n.id)).toEqual([answer.id]);
    h.tasks.markNotesConsumed([answer.id, answer.id], 'run_1');
    expect(h.tasks.pendingNotes(t.id)).toEqual([]);
    expect(h.tasks.notes(t.id)[1].consumedRunId).toBe('run_1');
    h.tasks.markNotesConsumed([answer.id], 'run_2');
    expect(h.tasks.notes(t.id)[1].consumedRunId).toBe('run_1');
    expect(noteEvents).toHaveLength(3);
    expect(() => h.tasks.addNote({ taskId: t.id, author: 'user', kind: 'note', text: '   ' })).toThrow(/leer/);
    expect(() => h.tasks.notes('task_missing')).toThrow(/nicht gefunden/);
  });
});
