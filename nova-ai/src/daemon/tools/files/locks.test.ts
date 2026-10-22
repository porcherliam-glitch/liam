// Tests of FileLockService: exclusive per key, idempotent for the holder, releases, stale-lock takeover rules.
import { describe, it, expect, afterEach } from 'vitest';
import { createHarness, makeTask, type Harness } from './test-support';

let h: Harness;
afterEach(() => h?.cleanup());

describe('FileLockService', () => {
  it('grants one task at a time per key, is idempotent for the holder and releases per task/project/all', () => {
    h = createHarness();
    h.tasks.set('task_b', makeTask('task_b', h.project.id, { status: 'running' }));
    const L = h.s.locks;
    expect(L.acquire(h.project.id, 'src/app.ts', 'task_a')).toEqual({ ok: true });
    expect(L.acquire(h.project.id, 'src/app.ts', 'task_a')).toEqual({ ok: true });
    expect(L.acquire(h.project.id, 'src/app.ts', 'task_b')).toEqual({ ok: false, heldBy: 'task_a' });
    expect(L.acquire('prj_other', 'src/app.ts', 'task_b')).toEqual({ ok: true });
    expect(L.acquire(h.project.id, 'src/b.ts', 'task_a')).toEqual({ ok: true });
    expect(L.heldBy(h.project.id, 'src/app.ts')).toBe('task_a');
    expect(L.listForTask('task_a')).toEqual(['src/app.ts', 'src/b.ts']);
    L.releaseTask('task_a');
    expect(L.heldBy(h.project.id, 'src/app.ts')).toBeNull();
    expect(L.acquire(h.project.id, 'src/app.ts', 'task_b')).toEqual({ ok: true });
    L.releaseProject(h.project.id);
    expect(L.heldBy(h.project.id, 'src/app.ts')).toBeNull();
    expect(L.heldBy('prj_other', 'src/app.ts')).toBe('task_b');
    L.releaseAll();
    expect(L.heldBy('prj_other', 'src/app.ts')).toBeNull();
    expect(() => L.acquire(h.project.id, '', 'task_a')).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
  });

  it('keeps locks of paused/waiting holders and takes over stale locks of finished or deleted tasks', () => {
    h = createHarness();
    h.tasks.set('task_paused', makeTask('task_paused', h.project.id, { status: 'waiting_approval' }));
    h.tasks.set('task_done', makeTask('task_done', h.project.id, { status: 'done' }));
    const L = h.s.locks;
    L.acquire(h.project.id, 'a.ts', 'task_paused');
    L.acquire(h.project.id, 'b.ts', 'task_done');
    L.acquire(h.project.id, 'c.ts', 'task_deleted');
    expect(L.acquire(h.project.id, 'a.ts', 'task_a')).toEqual({ ok: false, heldBy: 'task_paused' });
    expect(L.acquire(h.project.id, 'b.ts', 'task_a')).toEqual({ ok: true });
    expect(L.acquire(h.project.id, 'c.ts', 'task_a')).toEqual({ ok: true });
    expect(L.heldBy(h.project.id, 'b.ts')).toBe('task_a');
  });
});
