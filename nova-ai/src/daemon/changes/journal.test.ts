// Tests of the ChangeJournal: writes/deletes with blobs and events, DISK_FULL, protection, crash recovery at every
// crash-safe stage (simulated via crashHook), revert semantics (conflicts, missing blobs, skips, undo of a restore),
// command change recording (git-clean, session-written, untracked, parallel journal writes), queries and pruning.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, utimesSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, type Harness } from '../tools/files/test-support';
import { NOT_REVERTIBLE_REASON, commandChangeReason, createChangeJournal, type ChangeJournalImpl, type JournalCrashStage } from './journal';
import { sha256 } from './blob-store';

let h: Harness;
afterEach(() => h?.cleanup());

const blobPath = (h: Harness, hash: string) => join(h.t.core.paths.snapshots, hash.slice(0, 2), hash);

describe('ChangeJournal.writeFile / deleteFile', () => {
  it('creates, modifies and skips unchanged content; stores verified blobs and emits files.changed', async () => {
    h = createHarness();
    const events: unknown[] = [];
    h.t.core.bus.on('files.changed', (e) => events.push(e));
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const, taskId: 'task_a', runId: 'run_1' };
    const c1 = await h.s.journal.writeFile({ ...base, relPath: 'src/a.ts', content: 'one\n' });
    expect(c1).toMatchObject({ op: 'create', path: 'src/a.ts', beforeHash: null, afterHash: sha256('one\n'), source: 'tool', revertible: true, reverted: false });
    expect(readFileSync(join(h.root, 'src/a.ts'), 'utf8')).toBe('one\n');
    const c2 = await h.s.journal.writeFile({ ...base, relPath: 'src/a.ts', content: 'two\n' });
    expect(c2).toMatchObject({ op: 'modify', beforeHash: sha256('one\n'), afterHash: sha256('two\n') });
    expect(existsSync(blobPath(h, sha256('one\n')))).toBe(true);
    expect(h.s.journal.readSnapshot(sha256('one\n'))?.toString()).toBe('one\n');
    expect(await h.s.journal.writeFile({ ...base, relPath: 'src/a.ts', content: 'two\n' })).toBeNull();
    expect(events).toEqual([
      { projectId: h.project.id, paths: ['src/a.ts'], actor: 'nova' },
      { projectId: h.project.id, paths: ['src/a.ts'], actor: 'nova' },
    ]);
    const rows = h.t.core.db.all<{ state: string; path_key: string }>('SELECT state, path_key FROM changes');
    expect(rows.every((r) => r.state === 'committed' && r.path_key === 'src/a.ts')).toBe(true);
    expect(h.s.journal.maxId(h.project.id)).toBe(c2!.id);
  });

  it('refuses writes when the governor reports a full disk (DISK_FULL, nothing written, error reported)', async () => {
    h = createHarness();
    h.governor.ok = false;
    h.governor.reason = 'Nur noch 200 MB frei.';
    await expect(h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'x.txt', content: 'x', actor: 'nova' })).rejects.toMatchObject({ code: 'DISK_FULL' });
    expect(existsSync(join(h.root, 'x.txt'))).toBe(false);
    expect(h.t.core.db.all('SELECT * FROM changes')).toHaveLength(0);
    expect(h.t.core.errors.list().map((e) => e.code)).toContain('DISK_FULL');
  });

  it('refuses agent writes into protected areas and folders', async () => {
    h = createHarness();
    await expect(h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: '.git/config', content: 'x', actor: 'nova' })).rejects.toMatchObject({ code: 'VALIDATION' });
    mkdirSync(join(h.root, 'dir'));
    await expect(h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'dir', content: 'x', actor: 'user' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: '../escape.txt', content: 'x', actor: 'user' })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_PROJECT' });
  });

  it('deletes with a before snapshot and can recreate the file by revert', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'old.txt'), 'keep me');
    const del = await h.s.journal.deleteFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'old.txt', actor: 'nova', taskId: 'task_a' });
    expect(del).toMatchObject({ op: 'delete', beforeHash: sha256('keep me'), afterHash: null });
    expect(existsSync(join(h.root, 'old.txt'))).toBe(false);
    const res = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' });
    expect(res.restored).toEqual(['old.txt']);
    expect(readFileSync(join(h.root, 'old.txt'), 'utf8')).toBe('keep me');
    await expect(h.s.journal.deleteFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'missing.txt', actor: 'nova' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('ChangeJournal crash safety', () => {
  function crashingJournal(h: Harness, stage: JournalCrashStage) {
    return createChangeJournal(h.s, {
      crashHook: (st) => {
        if (st === stage) throw new Error(`simulated crash at ${st}`);
      },
    });
  }

  it('crash after the pending row (file untouched) → recoverPending deletes the row (create and modify)', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'm.txt'), 'before');
    const j = crashingJournal(h, 'pending-inserted');
    await expect(j.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'new.txt', content: 'x', actor: 'nova' })).rejects.toThrow(/simulated/);
    await expect(j.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'm.txt', content: 'after', actor: 'nova' })).rejects.toThrow(/simulated/);
    expect(h.t.core.db.all("SELECT * FROM changes WHERE state = 'pending'")).toHaveLength(2);
    const fresh = createChangeJournal(h.s);
    expect(fresh.recoverPending()).toBe(2);
    expect(h.t.core.db.all('SELECT * FROM changes')).toHaveLength(0);
    expect(readFileSync(join(h.root, 'm.txt'), 'utf8')).toBe('before');
  });

  it('crash after the file was written → recoverPending commits the row', async () => {
    h = createHarness();
    const j = crashingJournal(h, 'file-written');
    await expect(j.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'w.txt', content: 'written', actor: 'nova' })).rejects.toThrow(/simulated/);
    expect(readFileSync(join(h.root, 'w.txt'), 'utf8')).toBe('written');
    expect(createChangeJournal(h.s).recoverPending()).toBe(1);
    expect(h.s.journal.list({ projectId: h.project.id })).toMatchObject([{ path: 'w.txt', op: 'create' }]);
  });

  it('crash then an external modification → committed (a later revert reports a conflict)', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'e.txt'), 'orig');
    const j = crashingJournal(h, 'pending-inserted');
    await expect(j.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'e.txt', content: 'nova', actor: 'nova', taskId: 'task_a' })).rejects.toThrow();
    writeFileSync(join(h.root, 'e.txt'), 'someone else');
    createChangeJournal(h.s).recoverPending();
    const res = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' });
    expect(res.conflicts).toHaveLength(1);
    expect(readFileSync(join(h.root, 'e.txt'), 'utf8')).toBe('someone else');
  });

  it('deleteFile crash before unlink → row removed; after unlink → committed; temp files are cleaned', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'd1.txt'), '1');
    writeFileSync(join(h.root, 'd2.txt'), '2');
    writeFileSync(join(h.root, '.d1.txt.nova-0123abcd.tmp~'), 'leftover');
    await expect(crashingJournal(h, 'pending-inserted').deleteFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'd1.txt', actor: 'nova' })).rejects.toThrow();
    await expect(crashingJournal(h, 'file-written').deleteFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'd2.txt', actor: 'nova' })).rejects.toThrow();
    expect(createChangeJournal(h.s).recoverPending()).toBe(2);
    expect(h.s.journal.list({ projectId: h.project.id }).map((c) => c.path)).toEqual(['d2.txt']);
    expect(existsSync(join(h.root, '.d1.txt.nova-0123abcd.tmp~'))).toBe(false);
  });
});

describe('ChangeJournal.revert', () => {
  it('restores the state at the cursor with one journaled restore per file (actor nova, source restore, task null) and marks rows reverted', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'a.txt'), 'v0');
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const, taskId: 'task_a' };
    await h.s.journal.writeFile({ ...base, relPath: 'a.txt', content: 'v1' });
    await h.s.journal.writeFile({ ...base, relPath: 'a.txt', content: 'v2' });
    await h.s.journal.writeFile({ ...base, relPath: 'b/new.txt', content: 'created' });
    const cursor = 0;
    const dry = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: cursor, dryRun: true });
    expect(dry.restored.sort()).toEqual(['a.txt', 'b/new.txt']);
    expect(readFileSync(join(h.root, 'a.txt'), 'utf8')).toBe('v2');
    const res = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: cursor });
    expect(res.conflicts).toEqual([]);
    expect(readFileSync(join(h.root, 'a.txt'), 'utf8')).toBe('v0');
    expect(existsSync(join(h.root, 'b/new.txt'))).toBe(false);
    const restores = h.s.journal.list({ projectId: h.project.id }).filter((c) => c.source === 'restore');
    expect(restores.length).toBe(2); // a.txt v2 → v0 in ONE write, b/new.txt deleted
    expect(restores.find((c) => c.path === 'a.txt')).toMatchObject({ beforeHash: sha256('v2'), afterHash: sha256('v0') });
    expect(restores.every((c) => c.actor === 'nova' && c.taskId === null)).toBe(true);
    expect(h.s.journal.list({ projectId: h.project.id, includeReverted: true }).filter((c) => c.reverted)).toHaveLength(3);
    // nothing NOVA changed is shown any more
    expect(await h.s.journal.changedFiles(h.project.id, h.root)).toEqual([]);
    // the restore itself can be undone (pre_restore checkpoint = cursor before the restore)
    const preRestoreCursor = Math.min(...restores.map((r) => r.id)) - 1;
    const undo = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: preRestoreCursor });
    expect(undo.restored.sort()).toEqual(['a.txt', 'b/new.txt']);
    expect(readFileSync(join(h.root, 'a.txt'), 'utf8')).toBe('v2');
    expect((await h.s.journal.changedFiles(h.project.id, h.root)).map((c) => c.path).sort()).toEqual(['a.txt', 'b/new.txt']);
  });

  it('leaves files the user changed afterwards untouched (conflict) and never touches user-only changes', async () => {
    h = createHarness();
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const, taskId: 'task_a' };
    await h.s.journal.writeFile({ ...base, relPath: 'c.txt', content: 'nova' });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'c.txt', content: 'user edit', actor: 'user' });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'u.txt', content: 'user only', actor: 'user' });
    const res = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: 0 });
    expect(res.restored).toEqual([]);
    expect(res.conflicts).toEqual([{ path: 'c.txt', reason: expect.stringContaining('verändert') }]);
    expect(readFileSync(join(h.root, 'c.txt'), 'utf8')).toBe('user edit');
    expect(readFileSync(join(h.root, 'u.txt'), 'utf8')).toBe('user only');
  });

  it('reports a missing blob as conflict "Sicherung nicht mehr vorhanden" and skips non-revertible changes with a reason', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'm.txt'), 'orig');
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'm.txt', content: 'changed', actor: 'nova', taskId: 'task_a' });
    unlinkSync(blobPath(h, sha256('orig')));
    // untracked file modified by a command → not revertible
    writeFileSync(join(h.root, 'untracked.txt'), 'before');
    const before = await h.s.journal.scanState(h.root);
    writeFileSync(join(h.root, 'untracked.txt'), 'after!!');
    await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    const res = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' });
    expect(res.conflicts).toEqual([{ path: 'm.txt', reason: 'Sicherung nicht mehr vorhanden' }]);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0].path).toBe('untracked.txt');
    expect(res.skipped[0].reason).toMatch(/rückgängig/);
    expect(readFileSync(join(h.root, 'untracked.txt'), 'utf8')).toBe('after!!');
  });

  it('detects corrupt blobs on read', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'k.txt'), 'original');
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'k.txt', content: 'new', actor: 'nova' });
    writeFileSync(blobPath(h, sha256('original')), 'tampered');
    expect(h.s.journal.readSnapshot(sha256('original'))).toBeNull();
    expect(h.s.journal.readSnapshot('not-a-hash')).toBeNull();
    expect(h.t.core.errors.list().some((e) => e.title === 'Sicherungskopie beschädigt')).toBe(true);
  });
});

describe('ChangeJournal.revert to a checkpoint after earlier restores (regressions)', () => {
  const read = (h: Harness, rel: string) => (existsSync(join(h.root, rel)) ? readFileSync(join(h.root, rel), 'utf8') : null);
  const restoreTo = (h: Harness, afterId: number, dryRun = false) => h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId, dryRun });

  it('restoring the same checkpoint twice keeps the checkpoint state (no toggling back to NOVA\'s changes)', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'a.txt'), 'A');
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const, taskId: 'task_a' };
    const x = h.s.journal.maxId(h.project.id);
    await h.s.journal.writeFile({ ...base, relPath: 'a.txt', content: 'B' });
    await h.s.journal.writeFile({ ...base, relPath: 'new.txt', content: 'N' });
    await restoreTo(h, x);
    expect([read(h, 'a.txt'), read(h, 'new.txt')]).toEqual(['A', null]);
    expect(await restoreTo(h, x, true)).toEqual({ restored: [], conflicts: [], skipped: [] });
    expect(await restoreTo(h, x)).toEqual({ restored: [], conflicts: [], skipped: [] });
    expect([read(h, 'a.txt'), read(h, 'new.txt')]).toEqual(['A', null]);
    // a later task changes the file again; restoring X once more lands on X, not on the first task's content
    await h.s.journal.writeFile({ ...base, taskId: 'task_b', relPath: 'a.txt', content: 'C' });
    const r = await restoreTo(h, x);
    expect(r).toEqual({ restored: ['a.txt'], conflicts: [], skipped: [] });
    expect([read(h, 'a.txt'), read(h, 'new.txt')]).toEqual(['A', null]);
  });

  it('step-wise restore: undo the last task, then the one before – lands on the older state without false conflicts', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'app.js'), 'A');
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const };
    const p1 = h.s.journal.maxId(h.project.id);
    await h.s.journal.writeFile({ ...base, taskId: 'task_1', relPath: 'app.js', content: 'B' });
    const p2 = h.s.journal.maxId(h.project.id);
    await h.s.journal.writeFile({ ...base, taskId: 'task_2', relPath: 'app.js', content: 'C' });
    await restoreTo(h, p2);
    expect(read(h, 'app.js')).toBe('B');
    const preview = await restoreTo(h, p1, true);
    expect(preview).toEqual({ restored: ['app.js'], conflicts: [], skipped: [] });
    expect(await restoreTo(h, p1)).toEqual({ restored: ['app.js'], conflicts: [], skipped: [] });
    expect(read(h, 'app.js')).toBe('A');
    // and the pre_restore checkpoint of that restore still brings task 1's state back
    const restoreRow = h.s.journal.list({ projectId: h.project.id, includeReverted: true })[0];
    expect(restoreRow.source).toBe('restore');
    await restoreTo(h, restoreRow.id - 1);
    expect(read(h, 'app.js')).toBe('B');
  });

  it('restoring a checkpoint after "undo task" does not replay the task undo', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'k.txt'), 'A');
    const x = h.s.journal.maxId(h.project.id);
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'k.txt', content: 'B', actor: 'nova', taskId: 'task_a' });
    await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' });
    expect(read(h, 'k.txt')).toBe('A');
    expect(await restoreTo(h, x)).toEqual({ restored: [], conflicts: [], skipped: [] });
    expect(read(h, 'k.txt')).toBe('A');
  });

  it('stops at a change made outside NOVA between two NOVA writes and keeps it (conflict for the older NOVA part)', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 's.txt'), 'A');
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const, taskId: 'task_a' };
    const x = h.s.journal.maxId(h.project.id);
    await h.s.journal.writeFile({ ...base, relPath: 's.txt', content: 'B' });
    writeFileSync(join(h.root, 's.txt'), 'U (VS Code)'); // not journaled
    await h.s.journal.writeFile({ ...base, relPath: 's.txt', content: 'C' });
    const r = await restoreTo(h, x);
    expect(r.restored).toEqual(['s.txt']);
    expect(r.conflicts).toEqual([{ path: 's.txt', reason: expect.stringContaining('von Hand oder mit einem anderen Programm') }]);
    expect(read(h, 's.txt')).toBe('U (VS Code)');
    // the same for a change through the editor (actor user)
    await h.s.journal.writeFile({ ...base, relPath: 's.txt', content: 'D' });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 's.txt', content: 'E (Editor)', actor: 'user' });
    await h.s.journal.writeFile({ ...base, relPath: 's.txt', content: 'F' });
    const cursor = h.s.journal.list({ projectId: h.project.id, includeReverted: true })[2].id - 1; // before "D"
    const r2 = await restoreTo(h, cursor);
    expect(r2.restored).toEqual(['s.txt']);
    expect(r2.conflicts).toHaveLength(1);
    expect(read(h, 's.txt')).toBe('E (Editor)');
  });

  it('a later restore across a command change stops there (skipped) and still undoes the newer tool writes', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'c.txt'), 'A');
    const x = h.s.journal.maxId(h.project.id);
    const before = await h.s.journal.scanState(h.root);
    writeFileSync(join(h.root, 'c.txt'), 'by command');
    await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'c.txt', content: 'by tool', actor: 'nova', taskId: 'task_a' });
    const r = await restoreTo(h, x);
    expect(r.restored).toEqual(['c.txt']);
    expect(r.skipped).toEqual([{ path: 'c.txt', reason: NOT_REVERTIBLE_REASON }]); // untracked: no before snapshot
    expect(read(h, 'c.txt')).toBe('by command');
  });
});

describe('ChangeJournal command changes', () => {
  it('records creates, git-clean modifications (before = HEAD blob) and untracked deletes (not revertible); revert never resets them (origin uncertain)', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'tracked.txt'), 'line1\r\nline2\r\n'); // working tree with CRLF (autocrlf)
    writeFileSync(join(h.root, 'loose.txt'), 'loose');
    mkdirSync(join(h.root, 'node_modules/pkg'), { recursive: true });
    h.git.repo = true;
    h.git.clean.add('tracked.txt');
    h.git.head.set('tracked.txt', Buffer.from('line1\nline2\n')); // HEAD stores LF
    const before = await h.s.journal.scanState(h.root);
    expect(before.has('tracked.txt')).toBe(true);
    expect(h.git.isCleanCalls[0].sort()).toEqual(['loose.txt', 'tracked.txt']);
    writeFileSync(join(h.root, 'tracked.txt'), 'formatted\r\n');
    unlinkSync(join(h.root, 'loose.txt'));
    writeFileSync(join(h.root, 'gen.txt'), 'generated');
    writeFileSync(join(h.root, 'node_modules/pkg/index.js'), 'ignored');
    const events: unknown[] = [];
    h.t.core.bus.on('files.changed', (e) => events.push(e));
    const recs = await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    const byPath = Object.fromEntries(recs.map((r) => [r.path, r]));
    expect(Object.keys(byPath).sort()).toEqual(['gen.txt', 'loose.txt', 'tracked.txt']);
    expect(byPath['gen.txt']).toMatchObject({ op: 'create', revertible: true, source: 'command', actor: 'nova' });
    expect(byPath['tracked.txt']).toMatchObject({ op: 'modify', revertible: true, beforeHash: sha256('line1\r\nline2\r\n') });
    expect(byPath['loose.txt']).toMatchObject({ op: 'delete', revertible: false, beforeHash: null });
    expect(h.addedFiles.get('task_a')?.sort()).toEqual(['gen.txt', 'loose.txt', 'tracked.txt']);
    expect(events).toEqual([{ projectId: h.project.id, paths: ['gen.txt', 'loose.txt', 'tracked.txt'], actor: 'nova' }]);
    // A tree diff cannot tell the command's writes from files the user saved meanwhile: skipped with the reason.
    for (const res of [
      await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' }),
      await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: 0 }),
    ]) {
      expect(res.restored).toEqual([]);
      expect(res.conflicts).toEqual([]);
      const skipped = Object.fromEntries(res.skipped.map((x) => [x.path, x.reason]));
      expect(Object.keys(skipped).sort()).toEqual(['gen.txt', 'loose.txt', 'tracked.txt']);
      expect(skipped['gen.txt']).toBe(commandChangeReason('create'));
      expect(skipped['tracked.txt']).toBe(commandChangeReason('modify'));
      expect(skipped['loose.txt']).toBe(NOT_REVERTIBLE_REASON);
    }
    expect(readFileSync(join(h.root, 'tracked.txt'), 'utf8')).toBe('formatted\r\n');
    expect(readFileSync(join(h.root, 'gen.txt'), 'utf8')).toBe('generated');
  });

  it('never deletes or resets a file the user created or saved in another program while a command ran', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'README.md'), 'readme v1');
    h.git.repo = true;
    h.git.clean.add('README.md');
    h.git.head.set('README.md', Buffer.from('readme v1'));
    const cursor = h.s.journal.maxId(h.project.id); // pre_task checkpoint
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'src/app.ts', content: 'by tool', actor: 'nova', taskId: 'task_a' });
    const before = await h.s.journal.scanState(h.root);
    // meanwhile in VS Code: a new notes file and an edit of a git-clean file
    writeFileSync(join(h.root, 'my-notes.md'), 'meine Ideen');
    writeFileSync(join(h.root, 'README.md'), 'readme v1 + Notiz vom Benutzer');
    await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    const preview = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: cursor, dryRun: true });
    expect(preview.restored).toEqual(['src/app.ts']);
    expect(preview.skipped.map((x) => x.path).sort()).toEqual(['README.md', 'my-notes.md']);
    for (const res of [
      await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' }),
      await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: cursor }),
    ]) {
      expect(res.restored).not.toContain('my-notes.md');
      expect(res.restored).not.toContain('README.md');
    }
    expect(existsSync(join(h.root, 'src/app.ts'))).toBe(false); // NOVA's own tool write is undone
    expect(readFileSync(join(h.root, 'my-notes.md'), 'utf8')).toBe('meine Ideen');
    expect(readFileSync(join(h.root, 'README.md'), 'utf8')).toBe('readme v1 + Notiz vom Benutzer');
  });

  it('persists a "command running" marker per scan; a leftover marker (crash during the command) is reported at startup', async () => {
    h = createHarness();
    (h.s.projects as unknown as { list: () => unknown[] }).list = () => [h.project];
    const markerDir = join(h.t.core.paths.runState, 'commands');
    const before = await h.s.journal.scanState(h.root);
    expect(readdirSync(markerDir)).toHaveLength(1);
    await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    expect(readdirSync(markerDir)).toHaveLength(0);
    // the daemon is killed while the next command runs: the marker stays
    await h.s.journal.scanState(h.root);
    expect(readdirSync(markerDir)).toHaveLength(1);
    const fresh = createChangeJournal(h.s);
    expect(fresh.recoverPending()).toBe(0);
    expect(readdirSync(markerDir)).toHaveLength(0);
    const reported = h.t.core.errors.list().filter((e) => e.code === 'INTERRUPTED');
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({ projectId: h.project.id, severity: 'warning', title: 'Befehl unterbrochen – Änderungen nicht protokolliert' });
    expect(reported[0].whatHappened).toMatch(/nicht protokolliert/);
  });

  it('makes command changes to files NOVA wrote this session revertible (hash + snapshot at scan time)', async () => {
    h = createHarness();
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'src/new.ts', content: 'let a=1', actor: 'nova', taskId: 'task_a' });
    const before = await h.s.journal.scanState(h.root);
    writeFileSync(join(h.root, 'src/new.ts'), 'let a = 1;\n');
    const future = new Date(Date.now() + 5000);
    utimesSync(join(h.root, 'src/new.ts'), future, future);
    const recs = await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ op: 'modify', revertible: true, beforeHash: sha256('let a=1') });
    expect(h.s.journal.recentlyWritten(h.project.id, 2000).has('src/new.ts')).toBe(true);
  });

  it('does not re-record files that the journal (parallel task / editor) wrote while the command ran', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'keep.txt'), 'k');
    const before = await h.s.journal.scanState(h.root);
    // task_b's write_file during task_a's command
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'b-tool.txt', content: 'from b', actor: 'nova', taskId: 'task_b' });
    // the editor writes, then the command overwrites that file
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'edited.txt', content: 'user', actor: 'user' });
    writeFileSync(join(h.root, 'edited.txt'), 'command output');
    // task_b deletes a file during the command
    await h.s.journal.deleteFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'keep.txt', actor: 'nova', taskId: 'task_b' });
    writeFileSync(join(h.root, 'cmd.txt'), 'by command');
    const recs = await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a', runId: 'run_1', before });
    expect(recs.map((r) => `${r.op}:${r.path}`).sort()).toEqual(['create:cmd.txt', 'modify:edited.txt']);
    expect(recs.find((r) => r.path === 'edited.txt')).toMatchObject({ beforeHash: sha256('user'), revertible: true });
    expect(h.addedFiles.get('task_a')?.sort()).toEqual(['cmd.txt', 'edited.txt']);
  });

  it('ignores a pure mtime touch when the content is known to be identical', async () => {
    h = createHarness();
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 't.txt', content: 'same', actor: 'nova' });
    const before = await h.s.journal.scanState(h.root);
    const future = new Date(Date.now() + 10_000);
    utimesSync(join(h.root, 't.txt'), future, future);
    expect(await h.s.journal.recordCommandChanges({ projectId: h.project.id, projectRoot: h.root, taskId: null, runId: null, before })).toEqual([]);
  });
});

describe('ChangeJournal queries and maintenance', () => {
  it('lists with filters, reports changed files with modifiedSinceNova and recently written paths', async () => {
    h = createHarness();
    h.tasks.set('task_b', { ...h.tasks.get('task_a')!, id: 'task_b' });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'a.txt', content: 'a', actor: 'nova', taskId: 'task_a' });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'b.txt', content: 'b', actor: 'nova', taskId: 'task_b' });
    expect(h.s.journal.list({ projectId: h.project.id, taskId: 'task_b' }).map((c) => c.path)).toEqual(['b.txt']);
    expect(h.s.journal.list({ projectId: h.project.id, path: './a.txt' }).map((c) => c.path)).toEqual(['a.txt']);
    const first = h.s.journal.list({ projectId: h.project.id }).at(-1)!;
    expect(h.s.journal.list({ projectId: h.project.id, afterId: first.id }).map((c) => c.path)).toEqual(['b.txt']);
    expect(h.s.journal.get(first.id)?.path).toBe('a.txt');
    expect(h.s.journal.get(99999)).toBeNull();
    writeFileSync(join(h.root, 'b.txt'), 'edited outside');
    const changed = await h.s.journal.changedFiles(h.project.id, h.root);
    expect(changed).toEqual([
      { path: 'a.txt', op: 'create', byNova: true, taskIds: ['task_a'], gitStatus: null, modifiedSinceNova: false },
      { path: 'b.txt', op: 'create', byNova: true, taskIds: ['task_b'], gitStatus: null, modifiedSinceNova: true },
    ]);
    expect([...h.s.journal.recentlyWritten(h.project.id, 2000)].sort()).toEqual(['a.txt', 'b.txt']);
    expect(h.s.journal.recentlyWritten('other', 2000).size).toBe(0);
  });

  it('prunes only unreferenced blobs older than the cutoff', async () => {
    h = createHarness();
    writeFileSync(join(h.root, 'p.txt'), 'v0');
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'p.txt', content: 'v1', actor: 'nova', taskId: 'task_a' });
    // orphan blob (unreferenced) that is old
    const orphan = Buffer.from('orphan');
    const orphanHash = sha256(orphan);
    mkdirSync(join(h.t.core.paths.snapshots, orphanHash.slice(0, 2)), { recursive: true });
    writeFileSync(blobPath(h, orphanHash), orphan);
    const old = new Date(Date.now() - 100 * 24 * 3600 * 1000);
    utimesSync(blobPath(h, orphanHash), old, old);
    utimesSync(blobPath(h, sha256('v0')), old, old);
    const young = sha256('young');
    mkdirSync(join(h.t.core.paths.snapshots, young.slice(0, 2)), { recursive: true });
    writeFileSync(blobPath(h, young), 'young');
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
    expect(h.s.journal.pruneSnapshots(cutoff)).toBe(1);
    expect(existsSync(blobPath(h, orphanHash))).toBe(false);
    expect(existsSync(blobPath(h, sha256('v0')))).toBe(true); // referenced by a non-reverted change
    expect(existsSync(blobPath(h, young))).toBe(true);
    // a duration instead of a timestamp is interpreted as "older than now - duration"
    expect(h.s.journal.pruneSnapshots(30 * 24 * 3600 * 1000)).toBe(0);
    expect(readdirSync(h.t.core.paths.snapshots).length).toBeGreaterThan(0);
    expect(statSync(blobPath(h, young)).isFile()).toBe(true);
  });

  it('deletes old rows no checkpoint can restore across and their blobs; keeps everything a remaining checkpoint needs', async () => {
    h = createHarness();
    const base = { projectId: h.project.id, projectRoot: h.root, actor: 'nova' as const, taskId: 'task_a' };
    for (let i = 1; i <= 20; i++) await h.s.journal.writeFile({ ...base, relPath: 'big.txt', content: `version ${i}` });
    // the oldest remaining checkpoint was created after version 15
    const cursor = h.s.journal.list({ projectId: h.project.id }).find((c) => c.afterHash === sha256('version 15'))!.id;
    h.t.core.db.exec('PRAGMA foreign_keys = OFF'); // the harness project has no row in "projects"
    h.t.core.db.run(
      "INSERT INTO checkpoints(id, project_id, task_id, kind, label, git_head, git_commit, change_cursor, verification, created_at) VALUES ('chk_1', ?, NULL, 'manual', 'x', NULL, NULL, ?, NULL, 1)",
      [h.project.id, cursor],
    );
    const future = Date.now() + 365 * 24 * 3600 * 1000; // every row and blob counts as "old"
    expect(h.s.journal.pruneSnapshots(future)).toBe(14); // blobs of versions 1…14 are history only
    const left = h.s.journal.list({ projectId: h.project.id, includeReverted: true });
    expect(left.map((c) => c.afterHash)).toEqual([16, 17, 18, 19, 20].reverse().map((i) => sha256(`version ${i}`)));
    for (let i = 15; i <= 20; i++) expect(h.s.journal.readSnapshot(sha256(`version ${i}`))?.toString()).toBe(`version ${i}`);
    // the checkpoint still restores exactly
    const r = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, afterId: cursor });
    expect(r).toEqual({ restored: ['big.txt'], conflicts: [], skipped: [] });
    expect(readFileSync(join(h.root, 'big.txt'), 'utf8')).toBe('version 15');
    // without any checkpoint, rows older than the cutoff are history only; pending rows are never touched
    h.t.core.db.run('DELETE FROM checkpoints');
    h.t.core.db.run(
      "INSERT INTO changes(project_id, path, op, before_hash, after_hash, actor, source, revertible, state, path_key, ts, reverted) VALUES (?, 'p.txt', 'create', NULL, 'x', 'nova', 'tool', 1, 'pending', 'p.txt', 1, 0)",
      [h.project.id],
    );
    await (h.s.journal as ChangeJournalImpl).pruneSnapshotsAsync(future);
    expect(h.t.core.db.all<{ state: string }>('SELECT state FROM changes')).toEqual([{ state: 'pending' }]);
    expect(h.s.journal.readSnapshot(sha256('version 20'))).toBeNull();
  });

  it('uses lower-case path keys on Windows (platform injection)', async () => {
    h = createHarness();
    const j = createChangeJournal(h.s, { platform: 'win32' });
    h.t.core.db.run(
      "INSERT INTO changes(project_id, path, op, before_hash, after_hash, actor, source, revertible, state, path_key, ts, reverted) VALUES (?, 'Src/App.ts', 'create', NULL, 'x', 'nova', 'tool', 1, 'committed', 'src/app.ts', 1, 0)",
      [h.project.id],
    );
    expect(j.list({ projectId: h.project.id, path: 'SRC\\APP.TS' }).map((c) => c.path)).toEqual(['Src/App.ts']);
  });
});
