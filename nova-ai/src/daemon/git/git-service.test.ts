// GitService against real git repositories in temp dirs: availability, init, status (unborn, branch, untracked,
// renames, subdirectory roots), head, showFile (binary-safe, missing → null), isClean, diff (worktree/staged/ref,
// untracked, deleted, binary, path filter, ref validation) and log with NOVA detection.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitFixture, type GitFixture } from './test-support';
import { createGitService, unifiedForNewFile } from './git-service';

let f: GitFixture;
afterEach(() => f?.cleanup());

describe('GitService basics', () => {
  it('reports availability and caches a missing executable as unavailable', async () => {
    f = gitFixture();
    expect(await f.git.available()).toBe(true);
    const missing = createGitService(f.s, { gitPath: join(f.dir, 'no-such-git'), extraEnv: f.env });
    expect(await missing.available()).toBe(false);
    await expect(missing.status(f.dir)).rejects.toMatchObject({ code: 'TOOL_MISSING' });
  });

  it('init creates a repository on branch main and is idempotent', async () => {
    f = gitFixture();
    const root = join(f.dir, 'proj');
    mkdirSync(root);
    expect(await f.git.isRepo(root)).toBe(false);
    await f.git.init(root);
    expect(await f.git.isRepo(root)).toBe(true);
    await f.git.init(root);
    const st = await f.git.status(root);
    expect(st).toMatchObject({ isRepo: true, branch: 'main', head: null, clean: true, files: [] });
  });

  it('rejects relative or missing roots', async () => {
    f = gitFixture();
    await expect(f.git.status('relative/path')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(f.git.status(join(f.dir, 'missing'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await f.git.isRepo(join(f.dir, 'missing'))).toBe(false);
    expect(await f.git.head(join(f.dir, 'missing'))).toBeNull();
  });

  it('returns an empty status for a folder that is not a repository', async () => {
    f = gitFixture();
    const plain = join(f.dir, 'plain');
    mkdirSync(plain);
    expect(await f.git.status(plain)).toEqual({ isRepo: false, branch: null, head: null, ahead: 0, behind: 0, files: [], clean: true });
    expect(await f.git.log(plain, 10)).toEqual([]);
    expect(await f.git.diff(plain, {})).toEqual([]);
    expect(await f.git.showFile(plain, 'HEAD', 'x.txt')).toBeNull();
  });
});

describe('status / head / showFile / isClean', () => {
  it('lists modified, untracked (individual files) and renamed entries with the branch and head', async () => {
    f = gitFixture();
    const root = f.repo('r', { files: { 'a.txt': 'a\n', 'old.txt': 'old\n', 'keep.txt': 'k\n' } });
    f.write(root, 'a.txt', 'a2\n');
    f.write(root, 'new dir/ä ö.txt', 'neu\n');
    f.sh(root, 'mv', 'old.txt', 'renamed.txt');
    const st = await f.git.status(root);
    expect(st.isRepo).toBe(true);
    expect(st.branch).toBe('main');
    expect(st.head).toMatch(/^[0-9a-f]{40}$/);
    expect(st.head).toBe(await f.git.head(root));
    expect(st.clean).toBe(false);
    const byPath = Object.fromEntries(st.files.map((x) => [x.path, `${x.index}${x.workTree}`]));
    expect(byPath['a.txt']).toBe(' M');
    expect(byPath['new dir/ä ö.txt']).toBe('??');
    expect(byPath['renamed.txt']).toBe('R ');
    expect(byPath['keep.txt']).toBeUndefined();
  });

  it('re-bases every path onto a root that is a subdirectory of the repository', async () => {
    f = gitFixture();
    const top = f.repo('mono', { files: { 'app/src/x.ts': 'x\n', 'other/y.ts': 'y\n' } });
    const root = join(top, 'app');
    f.write(top, 'app/src/x.ts', 'x2\n');
    f.write(top, 'other/y.ts', 'y2\n');
    f.write(top, 'app/new.ts', 'n\n');
    const st = await f.git.status(root);
    expect(st.files.map((x) => x.path).sort()).toEqual(['new.ts', 'src/x.ts']);
    expect((await f.git.showFile(root, 'HEAD', 'src/x.ts'))?.toString()).toBe('x\n');
    expect(await f.git.showFile(root, 'HEAD', 'other/y.ts')).toBeNull();
    const clean = await f.git.isClean(root, ['src/x.ts', 'new.ts']);
    expect([...clean]).toEqual([]);
    const diffs = await f.git.diff(root, {});
    expect(diffs.map((d) => d.path)).toEqual(['new.ts', 'src/x.ts']);
    expect(diffs[1]).toMatchObject({ original: 'x\n', modified: 'x2\n', binary: false });
  });

  it('showFile returns exact bytes (binary safe), null for missing paths and validates refs/paths', async () => {
    f = gitFixture();
    const bytes = Buffer.from([0, 1, 2, 255, 254, 10, 13, 0, 65]);
    const root = f.repo('b', { files: { 'bin.dat': bytes as unknown as string, 'dir/t.txt': 'text\n' } });
    const got = await f.git.showFile(root, 'HEAD', 'bin.dat');
    expect(got && Buffer.compare(got, bytes)).toBe(0);
    expect((await f.git.showFile(root, 'HEAD', './dir/t.txt'))?.toString()).toBe('text\n');
    expect(await f.git.showFile(root, 'HEAD', 'missing.txt')).toBeNull();
    expect(await f.git.showFile(root, 'HEAD', 'dir')).toBeNull(); // a tree, not a blob
    expect(await f.git.showFile(root, 'nosuchbranch', 'dir/t.txt')).toBeNull();
    await expect(f.git.showFile(root, '--output=x', 'a')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(f.git.showFile(root, 'HEAD', '../escape.txt')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(f.git.showFile(root, 'HEAD', '/abs.txt')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('isClean returns exactly the tracked unmodified paths of the input', async () => {
    f = gitFixture();
    const root = f.repo('c', { files: { 'clean.txt': '1\n', 'mod.txt': '2\n', 'staged.txt': '3\n', 'sub/deep.txt': '4\n' } });
    f.write(root, 'mod.txt', 'changed\n');
    f.write(root, 'staged.txt', 'changed\n');
    f.sh(root, 'add', 'staged.txt');
    f.write(root, 'untracked.txt', 'u\n');
    const input = ['clean.txt', 'mod.txt', 'staged.txt', 'untracked.txt', 'sub/deep.txt', 'missing.txt', '../bad'];
    const clean = await f.git.isClean(root, input);
    expect([...clean].sort()).toEqual(['clean.txt', 'sub/deep.txt']);
    expect((await f.git.isClean(root, [])).size).toBe(0);
  });

  it('isClean handles tens of thousands of paths without putting them on the command line', async () => {
    f = gitFixture();
    const root = f.repo('many', { files: { 'a.txt': 'a\n' } });
    const paths = Array.from({ length: 50_000 }, (_, i) => `generated/some/long/directory/name/file-${i}.txt`);
    paths.push('a.txt');
    const clean = await f.git.isClean(root, paths);
    expect([...clean]).toEqual(['a.txt']);
  });
});

describe('diff', () => {
  it('builds FileDiffs for modified, deleted, untracked and binary files against HEAD', async () => {
    f = gitFixture();
    const root = f.repo('d', { files: { 'mod.txt': 'one\ntwo\n', 'del.txt': 'gone\n', 'img.bin': Buffer.from([0, 1, 2]) as unknown as string } });
    f.write(root, 'mod.txt', 'one\nzwei\n');
    rmSync(join(root, 'del.txt'));
    f.write(root, 'img.bin', Buffer.from([0, 9, 9]));
    f.write(root, 'neu.txt', 'hallo\nwelt');
    const diffs = await f.git.diff(root, {});
    const by = Object.fromEntries(diffs.map((d) => [d.path, d]));
    expect(Object.keys(by).sort()).toEqual(['del.txt', 'img.bin', 'mod.txt', 'neu.txt']);
    expect(by['mod.txt']).toMatchObject({ original: 'one\ntwo\n', modified: 'one\nzwei\n', binary: false });
    expect(by['mod.txt'].unified).toContain('-two');
    expect(by['mod.txt'].unified).toContain('+zwei');
    expect(by['del.txt']).toMatchObject({ original: 'gone\n', modified: '' });
    expect(by['del.txt'].unified).toContain('deleted file');
    expect(by['img.bin']).toMatchObject({ binary: true, original: '', modified: '' });
    expect(by['img.bin'].unified).toMatch(/Binary files/);
    expect(by['neu.txt']).toMatchObject({ original: '', modified: 'hallo\nwelt', binary: false });
    expect(by['neu.txt'].unified).toContain('+hallo');
    expect(by['neu.txt'].unified).toContain('\\ No newline at end of file');
  });

  it('supports staged diffs, a path filter and explicit refs', async () => {
    f = gitFixture();
    const root = f.repo('s', { files: { 'a.txt': 'v1\n', 'b.txt': 'b\n' } });
    f.write(root, 'a.txt', 'v2\n');
    f.sh(root, 'commit', '-qam', 'second');
    f.write(root, 'a.txt', 'v3\n');
    f.write(root, 'b.txt', 'b2\n');
    f.sh(root, 'add', 'b.txt');
    const staged = await f.git.diff(root, { staged: true });
    expect(staged.map((d) => d.path)).toEqual(['b.txt']);
    expect(staged[0]).toMatchObject({ original: 'b\n', modified: 'b2\n' });
    const one = await f.git.diff(root, { path: 'a.txt' });
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({ original: 'v2\n', modified: 'v3\n' });
    const vsFirst = await f.git.diff(root, { path: 'a.txt', ref: 'HEAD~1' });
    expect(vsFirst[0]).toMatchObject({ original: 'v1\n', modified: 'v3\n' });
    expect(await f.git.diff(root, { path: 'unchanged-missing.txt' })).toEqual([]);
    await expect(f.git.diff(root, { ref: '--evil' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(f.git.diff(root, { ref: 'does-not-exist' })).rejects.toMatchObject({ code: 'GIT_ERROR' });
  });

  it('works in a repository without commits (everything is new)', async () => {
    f = gitFixture();
    const root = f.repo('unborn', { files: { 'x.txt': 'x\n' }, commit: false });
    f.sh(root, 'add', 'x.txt');
    f.write(root, 'y.txt', 'y\n');
    const diffs = await f.git.diff(root, {});
    expect(diffs.map((d) => [d.path, d.original, d.modified])).toEqual([
      ['x.txt', '', 'x\n'],
      ['y.txt', '', 'y\n'],
    ]);
    const staged = await f.git.diff(root, { staged: true });
    expect(staged.map((d) => d.path)).toEqual(['x.txt']);
  });
});

describe('log', () => {
  it('lists commits newest first with NOVA detection and limit', async () => {
    f = gitFixture();
    const root = f.repo('l', { files: { 'a.txt': '1\n' } });
    f.write(root, 'a.txt', '2\n');
    f.sh(root, 'commit', '-qam', 'NOVA: Aufgabe erledigt');
    f.write(root, 'a.txt', '3\n');
    f.sh(root, 'commit', '-qam', 'Manuelle Änderung');
    const all = await f.git.log(root, 50);
    expect(all.map((c) => c.subject)).toEqual(['Manuelle Änderung', 'NOVA: Aufgabe erledigt', 'Initial commit']);
    expect(all.map((c) => c.byNova)).toEqual([false, true, false]);
    expect(all[0].author).toBe('Test User');
    expect(all[0].shortHash.length).toBeGreaterThanOrEqual(7);
    expect(all[0].date).toBeGreaterThan(1_600_000_000_000);
    expect(await f.git.log(root, 1)).toHaveLength(1);
    const empty = f.repo('empty');
    expect(await f.git.log(empty, 10)).toEqual([]);
  });

  it('limits the log of a subdirectory root to commits touching it', async () => {
    f = gitFixture();
    const top = f.repo('m', { files: { 'app/a.txt': '1\n', 'lib/b.txt': '1\n' } });
    f.write(top, 'lib/b.txt', '2\n');
    f.sh(top, 'commit', '-qam', 'lib only');
    const commits = await f.git.log(join(top, 'app'), 10);
    expect(commits.map((c) => c.subject)).toEqual(['Initial commit']);
  });
});

describe('unifiedForNewFile', () => {
  it('formats additions, empty and binary files', () => {
    expect(unifiedForNewFile('a.txt', 'x\ny\n', false)).toBe('diff --git a/a.txt b/a.txt\nnew file mode 100644\n--- /dev/null\n+++ b/a.txt\n@@ -0,0 +1,2 @@\n+x\n+y\n');
    expect(unifiedForNewFile('e.txt', '', false)).toBe('diff --git a/e.txt b/e.txt\nnew file mode 100644\n');
    expect(unifiedForNewFile('b.bin', '', true)).toContain('Binary files /dev/null and b/b.bin differ');
    expect(unifiedForNewFile('one.txt', 'z', false)).toContain('@@ -0,0 +1 @@\n+z\n\\ No newline at end of file\n');
  });
});

it('writes nothing into the repository when only reading', async () => {
  f = gitFixture();
  const root = f.repo('ro', { files: { 'a.txt': 'a\n' } });
  writeFileSync(join(root, 'a.txt'), 'changed\n');
  await f.git.status(root);
  await f.git.diff(root, {});
  // GIT_OPTIONAL_LOCKS=0: no index.lock left behind and the index was not rewritten by status.
  expect(f.sh(root, 'status', '--porcelain')).toBe(' M a.txt\n');
});
