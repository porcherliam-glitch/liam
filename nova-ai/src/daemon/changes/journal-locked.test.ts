// The change journal never rewrites a project file in place (R3-9): when another program holds the file so that the
// atomic rename keeps failing, the agent write and a restore fail cleanly with FILE_IN_USE – the file keeps its old
// content, no temp file stays in the project and no change row remains.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, type Harness } from '../tools/files/test-support';

const ctl = vi.hoisted(() => ({ lockedTarget: null as string | null }));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const mocked = {
    ...actual,
    renameSync: (from: string, to: string) => {
      if (ctl.lockedTarget && to === ctl.lockedTarget) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
      return actual.renameSync(from, to);
    },
  };
  return { ...mocked, default: mocked };
});

let h: Harness;
afterEach(() => {
  ctl.lockedTarget = null;
  h?.cleanup();
});

describe('ChangeJournal with a file held by another program', () => {
  it('fails with FILE_IN_USE instead of a non-atomic in-place rewrite (write and restore)', async () => {
    h = createHarness();
    const target = join(h.root, 'data.csv');
    writeFileSync(target, 'a;b\n1;2\n');
    const cursor = h.s.journal.maxId(h.project.id);
    ctl.lockedTarget = target;
    await expect(
      h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'data.csv', content: 'a;b\n1;2\n3;4\n', actor: 'nova', taskId: 'task_a' }),
    ).rejects.toMatchObject({ code: 'FILE_IN_USE' });
    expect(readFileSync(target, 'utf8')).toBe('a;b\n1;2\n');
    expect(readdirSync(h.root)).toEqual(['data.csv']);
    expect(h.t.core.db.all('SELECT * FROM changes')).toEqual([]);
    // written while unlocked, restored while locked again → conflict, file untouched
    ctl.lockedTarget = null;
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'data.csv', content: 'neu', actor: 'nova', taskId: 'task_a' });
    ctl.lockedTarget = target;
    const r = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: cursor });
    expect(r.restored).toEqual([]);
    expect(r.conflicts).toEqual([{ path: 'data.csv', reason: expect.stringContaining('nicht wiederhergestellt') }]);
    expect(readFileSync(target, 'utf8')).toBe('neu');
    expect(readdirSync(h.root)).toEqual(['data.csv']);
  });
});
