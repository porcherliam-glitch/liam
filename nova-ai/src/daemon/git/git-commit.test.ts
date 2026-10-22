// GitService mutating paths against real repositories: commitPaths (identity fallback, configured identity, only the
// given paths, other staged changes untouched, deletions, ignored/missing paths, nothing-to-commit, many paths via
// --pathspec-from-file, failing hooks with exact index restore, subdirectory roots), lock-file handling (stale lock
// removed only when no git process runs, fresh lock retried then GIT_ERROR) and dubious ownership (approval flow,
// never automatic).
import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { chmodSync, chownSync, existsSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { anyGitProcessRunning } from './git-service';
import { gitFixture, type GitFixture } from './test-support';

let f: GitFixture;
afterEach(() => f?.cleanup());

const committedFiles = (fx: GitFixture, root: string, rev = 'HEAD') =>
  fx
    .sh(root, 'show', '--name-only', '--format=', rev)
    .split('\n')
    .filter(Boolean)
    .sort();

describe('commitPaths', () => {
  it('uses the NOVA fallback identity when none is configured and returns the new HEAD', async () => {
    f = gitFixture();
    const root = f.repo('fresh', { identity: false });
    f.write(root, 'index.html', '<h1>Hallo</h1>\n');
    f.write(root, 'src/game.js', 'export {};\n');
    const hash = await f.git.commitPaths(root, ['index.html', 'src/game.js'], 'NOVA: Projekt „Test“ angelegt');
    expect(hash).toMatch(/^[0-9a-f]{40}$/);
    expect(hash).toBe(await f.git.head(root));
    expect(f.sh(root, 'log', '-1', '--format=%an <%ae>|%s').trim()).toBe('NOVA AI <nova@localhost>|NOVA: Projekt „Test“ angelegt');
    const [commit] = await f.git.log(root, 1);
    expect(commit.byNova).toBe(true);
    // The fallback was only for this commit: nothing was written to the repository config.
    expect(() => f.sh(root, 'config', '--get', 'user.name')).toThrow();
  });

  it('keeps a configured identity', async () => {
    f = gitFixture();
    const root = f.repo('ident', { files: { 'a.txt': '1\n' } });
    f.write(root, 'a.txt', '2\n');
    await f.git.commitPaths(root, ['a.txt'], 'NOVA: Änderung');
    expect(f.sh(root, 'log', '-1', '--format=%an').trim()).toBe('Test User');
  });

  it('commits only the given paths and leaves the user’s other staged and unstaged changes untouched', async () => {
    f = gitFixture();
    const root = f.repo('only', { files: { 'nova.txt': 'n1\n', 'user-staged.txt': 'u1\n', 'user-unstaged.txt': 'x1\n' } });
    f.write(root, 'nova.txt', 'n2\n');
    f.write(root, 'user-staged.txt', 'u2\n');
    f.sh(root, 'add', 'user-staged.txt');
    f.write(root, 'user-unstaged.txt', 'x2\n');
    const hash = await f.git.commitPaths(root, ['nova.txt'], 'NOVA: nur meine Datei');
    expect(hash).not.toBeNull();
    expect(committedFiles(f, root)).toEqual(['nova.txt']);
    const status = f.sh(root, 'status', '--porcelain').split('\n').filter(Boolean).sort();
    expect(status).toEqual([' M user-unstaged.txt', 'M  user-staged.txt']);
  });

  it('stages deletions, skips ignored and unknown paths and returns null when nothing changed', async () => {
    f = gitFixture();
    const root = f.repo('del', { files: { 'old.txt': 'o\n', 'same.txt': 's\n', '.gitignore': '*.log\n' } });
    rmSync(join(root, 'old.txt'));
    f.write(root, 'debug.log', 'secret-ish log\n');
    const hash = await f.git.commitPaths(root, ['old.txt', 'debug.log', 'never-existed.txt', 'same.txt'], 'NOVA: Aufräumen');
    expect(hash).not.toBeNull();
    expect(committedFiles(f, root)).toEqual(['old.txt']);
    expect(f.sh(root, 'ls-files', 'debug.log').trim()).toBe('');
    expect(await f.git.commitPaths(root, ['same.txt'], 'NOVA: nichts')).toBeNull();
    expect(await f.git.commitPaths(root, ['debug.log', 'never-existed.txt'], 'NOVA: nichts')).toBeNull();
    expect(await f.git.commitPaths(root, [], 'NOVA: nichts')).toBeNull();
    expect(f.sh(root, 'diff', '--cached', '--name-only').trim()).toBe('');
  });

  it('commits hundreds of long paths through --pathspec-from-file', async () => {
    f = gitFixture();
    const root = f.repo('bulk', { files: { 'seed.txt': 's\n' } });
    const paths: string[] = [];
    for (let i = 0; i < 300; i++) {
      const rel = `assets/very/long/directory/name/for/testing/file-number-${String(i).padStart(4, '0')}-with-extra-text.txt`;
      paths.push(rel);
      f.write(root, rel, `${i}\n`);
    }
    expect(paths.join(' ').length).toBeGreaterThan(8000);
    const hash = await f.git.commitPaths(root, paths, 'NOVA: viele Dateien');
    expect(hash).not.toBeNull();
    expect(committedFiles(f, root)).toHaveLength(300);
  });

  it('respects failing hooks: GIT_ERROR and the index is restored exactly', async () => {
    f = gitFixture();
    const root = f.repo('hook', { files: { 'a.txt': '1\n', 'b.txt': '1\n' } });
    const hook = join(root, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\necho "lint failed" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    f.write(root, 'b.txt', 'user staged\n');
    f.sh(root, 'add', 'b.txt');
    f.write(root, 'b.txt', 'user staged plus more\n');
    f.write(root, 'a.txt', 'nova\n');
    f.write(root, 'new.txt', 'nova new\n');
    await expect(f.git.commitPaths(root, ['a.txt', 'b.txt', 'new.txt'], 'NOVA: blockiert')).rejects.toMatchObject({
      code: 'GIT_ERROR',
      message: expect.stringContaining('Commit'),
    });
    // a.txt not staged, new.txt untracked again, b.txt keeps the user's staged version.
    expect(f.sh(root, 'diff', '--cached', '--name-only').trim()).toBe('b.txt');
    expect(f.sh(root, 'show', ':b.txt')).toBe('user staged\n');
    expect(f.sh(root, 'status', '--porcelain', 'new.txt').trim()).toBe('?? new.txt');
    expect(f.sh(root, 'log', '--format=%s').trim()).toBe('Initial commit');
  });

  it('works on a subdirectory root with root-relative paths and rejects .git paths', async () => {
    f = gitFixture();
    const top = f.repo('mono', { files: { 'app/a.txt': '1\n', 'lib/b.txt': '1\n' } });
    f.write(top, 'app/a.txt', '2\n');
    f.write(top, 'lib/b.txt', '2\n');
    const root = join(top, 'app');
    await f.git.commitPaths(root, ['a.txt'], 'NOVA: App');
    expect(committedFiles(f, top)).toEqual(['app/a.txt']);
    await expect(f.git.commitPaths(root, ['.git/config'], 'NOVA: x')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(f.git.commitPaths(root, ['../lib/b.txt'], 'NOVA: x')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('fails clearly outside a repository', async () => {
    f = gitFixture();
    const plain = join(f.dir, 'plain');
    mkdirSync(plain);
    writeFileSync(join(plain, 'a.txt'), 'a');
    await expect(f.git.commitPaths(plain, ['a.txt'], 'NOVA: x')).rejects.toMatchObject({ code: 'GIT_ERROR' });
  });

  it('serializes concurrent commits in the same repository', async () => {
    f = gitFixture();
    const root = f.repo('conc', { files: { 'seed.txt': 's\n' } });
    for (let i = 0; i < 4; i++) f.write(root, `f${i}.txt`, `${i}\n`);
    const hashes = await Promise.all([0, 1, 2, 3].map((i) => f.git.commitPaths(root, [`f${i}.txt`], `NOVA: Datei ${i}`)));
    expect(new Set(hashes).size).toBe(4);
    expect(f.sh(root, 'log', '--format=%s').trim().split('\n')).toHaveLength(5);
  });
});

describe('lock files', () => {
  it('removes a stale index.lock (older than the limit, no git process running) and retries once', async () => {
    f = gitFixture({ staleLockMs: 60_000, lockRetryDelayMs: 20, gitProcessRunning: async () => false });
    const root = f.repo('stale', { files: { 'a.txt': '1\n' } });
    const lock = join(root, '.git', 'index.lock');
    writeFileSync(lock, '');
    const old = (Date.now() - 5 * 60_000) / 1000;
    utimesSync(lock, old, old);
    f.write(root, 'a.txt', '2\n');
    expect(await f.git.commitPaths(root, ['a.txt'], 'NOVA: trotz Sperre')).not.toBeNull();
    expect(existsSync(lock)).toBe(false);
  });

  it('never removes an old lock while any git process runs (e.g. the user\'s `git commit` waiting for its message)', async () => {
    let asked = 0;
    f = gitFixture({
      staleLockMs: 60_000,
      lockRetryDelayMs: 10,
      lockRetries: 2,
      gitProcessRunning: async () => {
        asked++;
        return true;
      },
    });
    const root = f.repo('held', { files: { 'a.txt': '1\n' } });
    const lock = join(root, '.git', 'index.lock');
    writeFileSync(lock, 'index of the user\'s commit in progress');
    const old = (Date.now() - 5 * 60_000) / 1000;
    utimesSync(lock, old, old);
    f.write(root, 'a.txt', '2\n');
    await expect(f.git.commitPaths(root, ['a.txt'], 'NOVA: x')).rejects.toMatchObject({ code: 'GIT_ERROR', message: expect.stringContaining('gesperrt') });
    expect(asked).toBeGreaterThan(0);
    expect(readFileSync(lock, 'utf8')).toBe('index of the user\'s commit in progress');
  });

  it('detects a running git process on this computer (process listing without localized text)', async () => {
    const child = spawn('git', ['cat-file', '--batch'], { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true });
    try {
      await new Promise((r) => setTimeout(r, 300));
      expect(await anyGitProcessRunning()).toBe(true);
    } finally {
      child.stdin.end();
      child.kill();
    }
  });

  it('retries a fresh lock and fails with GIT_ERROR when it stays', async () => {
    f = gitFixture({ lockRetryDelayMs: 10, lockRetries: 2 });
    const root = f.repo('fresh', { files: { 'a.txt': '1\n' } });
    const lock = join(root, '.git', 'index.lock');
    writeFileSync(lock, '');
    f.write(root, 'a.txt', '2\n');
    await expect(f.git.commitPaths(root, ['a.txt'], 'NOVA: x')).rejects.toMatchObject({ code: 'GIT_ERROR', message: expect.stringContaining('gesperrt') });
    expect(existsSync(lock)).toBe(true); // a fresh lock of another program is never removed
    rmSync(lock);
    expect(await f.git.commitPaths(root, ['a.txt'], 'NOVA: jetzt')).not.toBeNull();
  });

  it('succeeds when the other program releases the lock during the retries', async () => {
    f = gitFixture({ lockRetryDelayMs: 50, lockRetries: 5 });
    const root = f.repo('release', { files: { 'a.txt': '1\n' } });
    const lock = join(root, '.git', 'index.lock');
    writeFileSync(lock, '');
    f.write(root, 'a.txt', '2\n');
    setTimeout(() => rmSync(lock, { force: true }), 80);
    expect(await f.git.commitPaths(root, ['a.txt'], 'NOVA: x')).not.toBeNull();
  });
});

const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe.skipIf(!isRoot)('dubious ownership (needs root to chown a repository to another user)', () => {
  it('creates a security_config approval, never adds safe.directory automatically, and adds it after approval', async () => {
    f = gitFixture();
    const root = f.repo('foreign', { files: { 'a.txt': '1\n' } });
    chownSync(root, 4321, 4321);
    chownSync(join(root, '.git'), 4321, 4321);
    const globalCfg = f.env.GIT_CONFIG_GLOBAL;
    // Pending: GIT_ERROR, approval requested, config untouched.
    await expect(f.git.status(root)).rejects.toMatchObject({ code: 'GIT_ERROR', details: { approvalId: expect.any(String) } });
    expect(f.approvals.requests).toHaveLength(1);
    expect(f.approvals.requests[0]).toMatchObject({ kind: 'security_config', subject: `git config --global --add safe.directory ${root}` });
    expect(readFileSync(globalCfg, 'utf8')).not.toContain('[safe]');
    // Denied: still GIT_ERROR, still untouched.
    f.approvals.answer = 'denied';
    await expect(f.git.status(root)).rejects.toMatchObject({ code: 'GIT_ERROR', message: expect.stringContaining('abgelehnt') });
    expect(readFileSync(globalCfg, 'utf8')).not.toContain('[safe]');
    // Approved: the exact command runs once, the approval is consumed and the call is retried.
    f.approvals.answer = 'approved';
    const st = await f.git.status(root);
    expect(st.isRepo).toBe(true);
    expect(readFileSync(globalCfg, 'utf8')).toContain(`directory = ${root}`);
    expect(f.approvals.consumed).toHaveLength(1);
  });

  it('applies an approval decided later through onDecision', async () => {
    f = gitFixture();
    const root = f.repo('later', { files: { 'a.txt': '1\n' } });
    chownSync(root, 4321, 4321);
    chownSync(join(root, '.git'), 4321, 4321);
    const err = await f.git.status(root).catch((e) => e);
    const approvalId = err.details.approvalId as string;
    f.approvals.decide(approvalId, 'approve');
    for (let i = 0; i < 100 && !readFileSync(f.env.GIT_CONFIG_GLOBAL, 'utf8').includes(`directory = ${root}`); i++) await new Promise((r) => setTimeout(r, 10));
    expect(readFileSync(f.env.GIT_CONFIG_GLOBAL, 'utf8')).toContain(`directory = ${root}`);
    f.approvals.answer = 'pending';
    expect((await f.git.status(root)).isRepo).toBe(true);
  });
});
