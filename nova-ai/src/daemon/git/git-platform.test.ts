// Windows branches of GitService/GitRunner exercised on Linux with an injected platform (real git, temp repos):
// backslash paths in the API are normalized to '/', Windows path forms are rejected, paths compare case-insensitively,
// and the strict argument rule for .cmd/.bat shims refuses shell metacharacters before anything is spawned.
// Not covered here (needs Windows): taskkill of the clone process tree, real case-insensitive file systems.
import { afterEach, describe, expect, it } from 'vitest';
import { tempDir } from '../../../tests/helpers/core';
import { GitRunner } from './runner';
import { gitFixture, type GitFixture } from './test-support';

let f: GitFixture | undefined;
afterEach(() => {
  f?.cleanup();
  f = undefined;
});

describe('GitService with platform win32 (injected)', () => {
  it('accepts backslash paths and hands out root-relative paths with forward slashes', async () => {
    f = gitFixture({ platform: 'win32' });
    const root = f.repo('r', { files: { 'src/main.js': 'one\n', 'src/util.js': 'u\n', 'README.md': '# x\n' } });
    expect((await f.git.showFile(root, 'HEAD', 'src\\main.js'))?.toString('utf8')).toBe('one\n');
    f.write(root, 'src/util.js', 'changed\n');
    const clean = await f.git.isClean(root, ['src\\main.js', 'src\\util.js', 'README.md']);
    expect([...clean].sort()).toEqual(['README.md', 'src\\main.js']);
    const diffs = await f.git.diff(root, { path: 'src\\util.js' });
    expect(diffs.map((d) => d.path)).toEqual(['src/util.js']);
    expect((await f.git.status(root)).files).toEqual([{ path: 'src/util.js', index: ' ', workTree: 'M' }]);
    const hash = await f.git.commitPaths(root, ['src\\util.js'], 'NOVA: Windows-Pfade');
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect((await f.git.status(root)).clean).toBe(true);
    expect((await f.git.log(root, 1))[0]).toMatchObject({ subject: 'NOVA: Windows-Pfade', byNova: true });
  });

  it('rejects drive paths, drive-relative, rooted and parent paths', async () => {
    f = gitFixture({ platform: 'win32' });
    const root = f.repo('r', { files: { 'a.txt': 'a\n' } });
    for (const bad of ['C:\\Windows\\win.ini', 'C:foo', '\\a.txt', '..\\outside.txt', 'sub\\..\\..\\x', 'a\u0000b']) {
      await expect(f.git.showFile(root, 'HEAD', bad)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
    await expect(f.git.commitPaths(root, ['.GIT\\config'], 'NOVA: x')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('compares paths case-insensitively (isClean, duplicate paths in one commit)', async () => {
    f = gitFixture({ platform: 'win32' });
    const root = f.repo('r', { files: { 'src/main.js': 'one\n' } });
    expect([...(await f.git.isClean(root, ['SRC\\MAIN.JS']))]).toEqual(['SRC\\MAIN.JS']);
    f.write(root, 'src/main.js', 'two\n');
    expect((await f.git.isClean(root, ['SRC\\MAIN.JS'])).size).toBe(0);
    const hash = await f.git.commitPaths(root, ['src\\main.js', 'SRC/MAIN.JS', 'src/main.js'], 'NOVA: einmal');
    expect(hash).not.toBeNull();
    expect(f.sh(root, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe('src/main.js');
  });
});

describe('GitRunner with a Windows .cmd shim (injected)', () => {
  it('refuses arguments with shell metacharacters before spawning', async () => {
    const d = tempDir('nova-git-shim-');
    let missingCalls = 0;
    try {
      const runner = new GitRunner('win32', async () => 'C:\\Tools\\git.cmd', {}, () => missingCalls++);
      await expect(runner.run(['log', '--format=%H|%s'], { cwd: d.dir })).rejects.toMatchObject({ code: 'VALIDATION' });
      await expect(runner.raw(['cat-file', 'blob', 'HEAD:a&b.txt'], { cwd: d.dir })).rejects.toMatchObject({ code: 'VALIDATION' });
      expect(missingCalls).toBe(0);
    } finally {
      d.cleanup();
    }
  });
});
