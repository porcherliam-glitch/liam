// Unit tests of the git runner helpers: environment hygiene (redirecting variables removed, literal pathspecs,
// optional locks only for reads), the per-repository mutex and the stderr classifiers.
import { describe, expect, it } from 'vitest';
import { KeyedMutex, dubiousPath, gitEnv, isDubiousOwnership, isLockFailure, GIT_REF_RE } from './runner';

describe('gitEnv', () => {
  it('removes variables that redirect git and sets C locale, literal pathspecs and optional locks for reads', () => {
    const saved = { ...process.env };
    try {
      process.env.GIT_DIR = '/elsewhere/.git';
      process.env.GIT_WORK_TREE = '/elsewhere';
      process.env.GIT_CONFIG_PARAMETERS = "'core.fsmonitor=evil'";
      process.env.MY_API_KEY = 'sk-should-not-leak-123456';
      const env = gitEnv({ platform: 'linux', write: false, literalPathspecs: true });
      expect(env.GIT_DIR).toBeUndefined();
      expect(env.GIT_WORK_TREE).toBeUndefined();
      expect(env.GIT_CONFIG_PARAMETERS).toBeUndefined();
      expect(env.MY_API_KEY).toBeUndefined();
      expect(env.LC_ALL).toBe('C');
      expect(env.LANG).toBe('C');
      expect(env.GIT_TERMINAL_PROMPT).toBe('0');
      expect(env.GIT_LITERAL_PATHSPECS).toBe('1');
      expect(env.GIT_OPTIONAL_LOCKS).toBe('0');
      const w = gitEnv({ platform: 'linux', write: true, literalPathspecs: false, extra: { GIT_ALLOW_PROTOCOL: 'https:ssh' } });
      expect(w.GIT_OPTIONAL_LOCKS).toBeUndefined();
      expect(w.GIT_LITERAL_PATHSPECS).toBeUndefined();
      expect(w.GIT_ALLOW_PROTOCOL).toBe('https:ssh');
    } finally {
      process.env = saved;
    }
  });
});

describe('KeyedMutex', () => {
  it('serializes work per key and runs different keys in parallel', async () => {
    const m = new KeyedMutex();
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const a = m.run('repo', async () => {
      order.push('a-start');
      expect(m.holders('repo')).toBe(1);
      await gate;
      order.push('a-end');
    });
    const b = m.run('repo', async () => {
      order.push('b');
    });
    const c = m.run('other', async () => {
      order.push('c');
    });
    await c;
    expect(order).toEqual(['a-start', 'c']);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(['a-start', 'c', 'a-end', 'b']);
    expect(m.holders('repo')).toBe(0);
  });

  it('releases the lock when the work throws', async () => {
    const m = new KeyedMutex();
    await expect(m.run('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(m.run('k', async () => 42)).resolves.toBe(42);
  });
});

describe('stderr classifiers', () => {
  it('detects dubious ownership and extracts the path', () => {
    const err = "fatal: detected dubious ownership in repository at 'C:/Users/x/proj'\nTo add an exception for this directory, call:\n";
    expect(isDubiousOwnership(err)).toBe(true);
    expect(dubiousPath(err)).toBe('C:/Users/x/proj');
    expect(isDubiousOwnership('fatal: not a git repository')).toBe(false);
  });

  it('detects lock failures', () => {
    expect(isLockFailure("fatal: Unable to create '/r/.git/index.lock': File exists.\n\nAnother git process seems to be running")).toBe(true);
    expect(isLockFailure('error: pathspec did not match')).toBe(false);
  });

  it('validates refs like the RPC contract', () => {
    for (const ok of ['HEAD', 'HEAD~1', 'main', 'origin/main', 'v1.0.0', 'HEAD@{1}', 'abc123^']) expect(GIT_REF_RE.test(ok)).toBe(true);
    for (const bad of ['-n', '--output=x', 'a b', 'a;b', '']) expect(GIT_REF_RE.test(bad)).toBe(false);
  });
});
