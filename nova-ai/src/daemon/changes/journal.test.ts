// Tests of the ChangeJournal: writes/deletes with blobs and events, DISK_FULL, protection, crash recovery at every
// crash-safe stage (simulated via crashHook), revert semantics (conflicts, missing blobs, skips, undo of a restore),
// command change recording (git-clean, session-written, untracked, parallel journal writes), queries and pruning.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync, utimesSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, type Harness } from '../tools/files/test-support';
import { createChangeJournal, type JournalCrashStage } from './journal';
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
  it('reverts newest first, journals restores (actor nova, source restore, task null) and marks rows reverted', async () => {
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
    expect(restores.length).toBe(3);
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

describe('ChangeJournal command changes', () => {
  it('records creates (revertible), git-clean modifications (revertible via HEAD blob) and untracked deletes (not revertible)', async () => {
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
    const res = await h.s.journal.revert({ projectId: h.project.id, projectRoot: h.root, taskId: 'task_a' });
    expect(res.restored.sort()).toEqual(['gen.txt', 'tracked.txt']);
    expect(readFileSync(join(h.root, 'tracked.txt'), 'utf8')).toBe('line1\r\nline2\r\n');
    expect(existsSync(join(h.root, 'gen.txt'))).toBe(false);
    expect(res.skipped).toHaveLength(1);
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
