// Unit tests of the pure git output parsers: branch header variants, porcelain v1 -z with renames and prefix
// re-basing, name-status, log records with NOVA detection, clone progress mapping and error line extraction.
import { describe, expect, it } from 'vitest';
import {
  createProgressSplitter,
  lastErrorLine,
  parseBranchHeader,
  parseCloneProgressLine,
  parseLog,
  parseNameStatusZ,
  parseStatusZ,
  splitZ,
  stripPrefix,
} from './porcelain';

describe('parseBranchHeader', () => {
  it('parses branch, upstream, ahead and behind', () => {
    expect(parseBranchHeader('## main...origin/main [ahead 2, behind 3]')).toEqual({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 3,
      unborn: false,
      detached: false,
    });
    expect(parseBranchHeader('## feature/x...origin/feature/x [behind 1]')).toMatchObject({ branch: 'feature/x', ahead: 0, behind: 1 });
    expect(parseBranchHeader('## dev...origin/dev [gone]')).toMatchObject({ branch: 'dev', upstream: 'origin/dev', ahead: 0, behind: 0 });
    expect(parseBranchHeader('## main')).toMatchObject({ branch: 'main', upstream: null });
  });

  it('recognises unborn and detached HEAD', () => {
    expect(parseBranchHeader('## No commits yet on main')).toMatchObject({ branch: 'main', unborn: true });
    expect(parseBranchHeader('## Initial commit on master')).toMatchObject({ branch: 'master', unborn: true });
    expect(parseBranchHeader('## HEAD (no branch)')).toMatchObject({ branch: null, detached: true });
  });
});

describe('parseStatusZ', () => {
  it('parses entries including renames (orig path follows as an extra field)', () => {
    const out = '## main\0 M src/a.ts\0R  new name.ts\0old name.ts\0?? ümlaut ä.txt\0A  b.txt\0';
    const parsed = parseStatusZ(out);
    expect(parsed.branch.branch).toBe('main');
    expect(parsed.entries).toEqual([
      { index: ' ', workTree: 'M', path: 'src/a.ts', origPath: null },
      { index: 'R', workTree: ' ', path: 'new name.ts', origPath: 'old name.ts' },
      { index: '?', workTree: '?', path: 'ümlaut ä.txt', origPath: null },
      { index: 'A', workTree: ' ', path: 'b.txt', origPath: null },
    ]);
  });

  it('re-bases paths onto a prefix and drops entries outside it', () => {
    const out = '## main\0 M sub/a.txt\0?? other/x.txt\0 D sub/deep/b.txt\0';
    const parsed = parseStatusZ(out, 'sub/');
    expect(parsed.entries.map((e) => e.path)).toEqual(['a.txt', 'deep/b.txt']);
    expect(parsed.outside).toBe(1);
  });

  it('matches the prefix case-insensitively when asked (Windows)', () => {
    const parsed = parseStatusZ(' M Sub/A.txt\0', 'sub/', true);
    expect(parsed.entries.map((e) => e.path)).toEqual(['A.txt']);
    expect(stripPrefix('sub/x', 'sub/', false)).toBe('x');
    expect(stripPrefix('Sub/x', 'sub/', false)).toBeNull();
    expect(stripPrefix('sub/', 'sub/', false)).toBeNull();
  });
});

describe('parseNameStatusZ / splitZ', () => {
  it('parses alternating status and path fields', () => {
    expect(parseNameStatusZ('M\0a.txt\0A\0dir/b c.txt\0D\0gone.txt\0')).toEqual([
      { status: 'M', path: 'a.txt' },
      { status: 'A', path: 'dir/b c.txt' },
      { status: 'D', path: 'gone.txt' },
    ]);
    expect(parseNameStatusZ('')).toEqual([]);
  });

  it('reports a rename record defensively as an addition of the new path', () => {
    expect(parseNameStatusZ('R100\0old.txt\0new.txt\0M\0x\0')).toEqual([
      { status: 'A', path: 'new.txt' },
      { status: 'M', path: 'x' },
    ]);
  });

  it('splits NUL lists', () => {
    expect(splitZ('a\0b c\0\0')).toEqual(['a', 'b c']);
  });
});

describe('parseLog', () => {
  it('parses records and flags NOVA commits', () => {
    const out =
      'a'.repeat(40) + '\x1faaaaaaa\x1fNOVA AI\x1f1700000000\x1fNOVA: Login bauen\x1e\n' + 'b'.repeat(40) + '\x1fbbbbbbb\x1fJane\x1f1700000100\x1fFix: typo\x1e\n';
    const commits = parseLog(out);
    expect(commits).toHaveLength(2);
    expect(commits[0]).toEqual({ hash: 'a'.repeat(40), shortHash: 'aaaaaaa', author: 'NOVA AI', date: 1700000000000, subject: 'NOVA: Login bauen', byNova: true });
    expect(commits[1].byNova).toBe(false);
    expect(parseLog('')).toEqual([]);
  });
});

describe('clone progress', () => {
  it('maps phases to one overall percentage with German messages', () => {
    expect(parseCloneProgressLine('Receiving objects:  50% (500/1000), 1.20 MiB | 1.00 MiB/s')).toEqual({
      percent: 45,
      message: 'Objekte werden empfangen … 50 % (500 von 1000), 1.20 MiB',
    });
    expect(parseCloneProgressLine('remote: Compressing objects: 100% (10/10), done.')).toMatchObject({ percent: 10 });
    expect(parseCloneProgressLine('Resolving deltas:   0% (0/5)')).toMatchObject({ percent: 80, message: expect.stringContaining('aufgelöst') });
    expect(parseCloneProgressLine('Updating files: 100% (3/3), done.')).toMatchObject({ percent: 100 });
    expect(parseCloneProgressLine("Cloning into 'x'...")).toMatchObject({ percent: 0 });
    expect(parseCloneProgressLine('warning: something')).toBeNull();
  });

  it('splits \\r-rewritten progress lines across chunks', () => {
    const split = createProgressSplitter();
    expect(split('Receiving objects:  10% (1/10)\rReceiving obj')).toHaveLength(1);
    const next = split('ects:  20% (2/10)\r');
    expect(next).toHaveLength(1);
    expect(next[0].percent).toBe(24);
  });
});

describe('lastErrorLine', () => {
  it('prefers the last fatal/error line and skips hints and progress', () => {
    const stderr = "Cloning into 'x'...\nhint: some hint\nfatal: repository 'https://h/x/' not found\nReceiving objects: 10% (1/10)\n";
    expect(lastErrorLine(stderr)).toBe("fatal: repository 'https://h/x/' not found");
    expect(lastErrorLine('just text\n')).toBe('just text');
    expect(lastErrorLine('')).toBe('');
  });
});
