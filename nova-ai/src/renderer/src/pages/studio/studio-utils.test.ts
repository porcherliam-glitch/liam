import { describe, expect, it } from 'vitest';
import type { CheckRun, FileNode, Task } from '@shared/schemas';
import {
  absolutePath,
  ancestorPaths,
  childrenOf,
  findNode,
  gitStatusInfo,
  groupSearchMatches,
  highlightSegments,
  isHttpUrl,
  isLoopbackHttpUrl,
  languageForPath,
  languageLabel,
  latestFailures,
  latestRunsByKind,
  markersForFile,
  modelUri,
  porcelainCode,
  regexError,
  stripAnsi,
  tailText,
  validateEntryName,
  visibleRows,
} from './studio-utils';

const file = (path: string, extra: Partial<FileNode> = {}): FileNode => ({
  name: path.split('/').pop() ?? path,
  path,
  type: 'file',
  size: 10,
  children: null,
  changedByNova: false,
  gitStatus: null,
  ...extra,
});
const dir = (path: string, children: FileNode[] | null): FileNode => ({ ...file(path), type: 'dir', size: null, children });

const run = (r: Partial<CheckRun> & Pick<CheckRun, 'id' | 'kind' | 'status' | 'startedAt'>): CheckRun => ({
  projectId: 'p',
  taskId: null,
  command: 'npm test',
  passed: null,
  failed: null,
  skipped: null,
  durationMs: null,
  outputTail: '',
  failures: [],
  failureSignature: null,
  message: null,
  processId: null,
  artifacts: [],
  finishedAt: null,
  ...r,
});

describe('gitStatusInfo', () => {
  it('maps porcelain codes to letters and German labels', () => {
    expect(gitStatusInfo(' M')).toMatchObject({ letter: 'M', tone: 'warning' });
    expect(gitStatusInfo('??')).toMatchObject({ letter: 'U', label: 'Neu, noch nicht in Git erfasst' });
    expect(gitStatusInfo('A ')).toMatchObject({ letter: 'A' });
    expect(gitStatusInfo(' D')).toMatchObject({ letter: 'D', tone: 'danger' });
    expect(gitStatusInfo('R ')).toMatchObject({ letter: 'R' });
    expect(gitStatusInfo('UU')).toMatchObject({ letter: '!', tone: 'danger' });
  });

  it('ignores clean, ignored and empty codes', () => {
    expect(gitStatusInfo(null)).toBeNull();
    expect(gitStatusInfo('  ')).toBeNull();
    expect(gitStatusInfo('!!')).toBeNull();
  });

  it('builds porcelain codes from git.status entries', () => {
    expect(porcelainCode({ index: 'M', workTree: ' ' })).toBe('M ');
    expect(porcelainCode({ index: '', workTree: 'M' })).toBe(' M');
  });
});

describe('preview URLs', () => {
  it('accepts only plain http loopback URLs for the iframe', () => {
    expect(isLoopbackHttpUrl('http://127.0.0.1:5173/')).toBe(true);
    expect(isLoopbackHttpUrl('http://localhost:3000/app')).toBe(true);
    expect(isLoopbackHttpUrl('http://[::1]:8080/')).toBe(true);
    expect(isLoopbackHttpUrl('https://127.0.0.1:5173/')).toBe(false);
    expect(isLoopbackHttpUrl('http://192.168.0.10:5173/')).toBe(false);
    expect(isLoopbackHttpUrl('http://user:pw@localhost:5173/')).toBe(false);
    expect(isLoopbackHttpUrl('http://localhost.evil.com/')).toBe(false);
    expect(isLoopbackHttpUrl('file:///C:/x.html')).toBe(false);
    expect(isLoopbackHttpUrl('kein url')).toBe(false);
    expect(isLoopbackHttpUrl(null)).toBe(false);
  });

  it('allows http(s) for "Im Browser öffnen"', () => {
    expect(isHttpUrl('https://example.com')).toBe(true);
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('paths and names', () => {
  it('builds model URIs that keep the extension', () => {
    expect(modelUri('prj_1', 'src/a b.ts')).toBe('file:///prj_1/src/a%20b.ts');
  });

  it('guesses languages and labels', () => {
    expect(languageForPath('src/main.tsx')).toBe('typescript');
    expect(languageForPath('Dockerfile')).toBe('dockerfile');
    expect(languageForPath('README')).toBe('plaintext');
    expect(languageLabel('csharp')).toBe('C#');
    expect(languageLabel('plaintext')).toBe('Nur Text');
    expect(languageLabel('fsharp')).toBe('Fsharp');
  });

  it('lists ancestors and builds absolute paths for Windows and POSIX roots', () => {
    expect(ancestorPaths('a/b/c.ts')).toEqual(['a', 'a/b']);
    expect(ancestorPaths('c.ts')).toEqual([]);
    expect(absolutePath('C:\\Projekte\\Spiel\\', 'src/main.ts')).toBe('C:\\Projekte\\Spiel\\src\\main.ts');
    expect(absolutePath('/home/demo/spiel', 'src/main.ts')).toBe('/home/demo/spiel/src/main.ts');
    expect(absolutePath('C:\\Projekte\\Spiel', '')).toBe('C:\\Projekte\\Spiel');
  });

  it('validates new entry names with German messages', () => {
    expect(validateEntryName('ui/menu.ts')).toBeNull();
    expect(validateEntryName('  ')).toBe('Bitte einen Namen eingeben.');
    expect(validateEntryName('../x')).toMatch(/nicht erlaubt/);
    expect(validateEntryName('C:\\x')).toMatch(/keinen vollständigen Pfad/);
    expect(validateEntryName('a?.ts')).toMatch(/Zeichen/);
    expect(validateEntryName('con.txt')).toMatch(/reservierter Name/);
    expect(validateEntryName('name.')).toMatch(/Punkt/);
  });
});

describe('file tree helpers', () => {
  const root = dir('', [dir('src', [file('src/main.ts'), dir('src/game', null)]), file('package.json')]);

  it('finds nodes, also inside lazily loaded folders', () => {
    const loaded = new Map([['src/game', [file('src/game/player.ts')]]]);
    expect(findNode(root, 'src/main.ts')?.name).toBe('main.ts');
    expect(findNode(root, 'src/game/player.ts', loaded)?.name).toBe('player.ts');
    expect(findNode(root, 'nope.ts')).toBeNull();
    expect(childrenOf(root, loaded, 'src/game')?.map((n) => n.name)).toEqual(['player.ts']);
    expect(childrenOf(root, new Map(), 'src/game')).toBeNull();
  });

  it('flattens only expanded folders', () => {
    const rows = visibleRows(root, new Map(), new Set(['src']));
    expect(rows.map((r) => `${r.level}:${r.node.path}`)).toEqual(['1:src', '2:src/main.ts', '2:src/game', '1:package.json']);
    expect(rows[2].childCount).toBeNull();
    expect(rows[0].expanded).toBe(true);
  });
});

describe('search helpers', () => {
  it('groups matches by file in order of appearance', () => {
    const groups = groupSearchMatches([
      { path: 'b.ts', line: 1, column: 1, preview: 'x' },
      { path: 'a.ts', line: 2, column: 1, preview: 'x' },
      { path: 'b.ts', line: 5, column: 1, preview: 'x' },
    ]);
    expect(groups.map((g) => [g.path, g.matches.length])).toEqual([
      ['b.ts', 2],
      ['a.ts', 1],
    ]);
  });

  it('highlights literal and regex matches as text segments', () => {
    expect(highlightSegments('const player = new Player()', 'player', { regex: false, caseSensitive: false })).toEqual([
      { text: 'const ', match: false },
      { text: 'player', match: true },
      { text: ' = new ', match: false },
      { text: 'Player', match: true },
      { text: '()', match: false },
    ]);
    expect(highlightSegments('a.b', '.', { regex: false, caseSensitive: true })).toEqual([
      { text: 'a', match: false },
      { text: '.', match: true },
      { text: 'b', match: false },
    ]);
    expect(highlightSegments('abc', '(', { regex: true, caseSensitive: true })).toEqual([{ text: 'abc', match: false }]);
    expect(regexError('(')).toBe('Der reguläre Ausdruck ist ungültig.');
    expect(regexError('a+')).toBeNull();
  });
});

describe('checks and markers', () => {
  const runs = [
    run({ id: 'old', kind: 'test', status: 'failed', startedAt: 1, failures: [{ file: 'a.ts', line: 1, column: 1, message: 'alt' }] }),
    run({ id: 'new', kind: 'test', status: 'failed', startedAt: 5, failures: [{ file: 'a.ts', line: 3, column: 7, message: 'neu' }, { file: null, line: null, column: null, message: 'ohne Datei' }] }),
    run({ id: 'build', kind: 'build', status: 'passed', startedAt: 4 }),
  ];

  it('uses only the latest run per kind', () => {
    expect(latestRunsByKind(runs).map((r) => r.id)).toEqual(['new', 'build']);
    expect(latestFailures(runs).map((f) => f.failure.message)).toEqual(['neu', 'ohne Datei']);
  });

  it('builds editor markers from failures and review findings', () => {
    const task = {
      id: 't1',
      title: 'Spieler',
      status: 'done',
      verification: { status: 'passed', checks: [{ name: 'Review', status: 'passed', details: null, checkRunId: null, findings: [{ severity: 'major', file: 'a.ts', line: 9, message: 'Doppelter Code' }] }] },
    } as unknown as Task;
    const markers = markersForFile('a.ts', runs, [task]);
    expect(markers).toEqual([
      { line: 3, column: 7, message: 'neu', severity: 'error', source: 'NOVA · Tests' },
      { line: 9, column: 1, message: 'Doppelter Code', severity: 'warning', source: 'NOVA · Review: Spieler' },
    ]);
    expect(markersForFile('b.ts', runs, [task])).toEqual([]);
  });
});

describe('process output', () => {
  it('strips ANSI sequences and normalizes line breaks', () => {
    expect(stripAnsi('\u001b[32mok\u001b[0m\r\nweiter\r')).toBe('ok\nweiter\n');
  });

  it('keeps the tail at a line start', () => {
    expect(tailText('eins\nzwei\ndrei', 8)).toBe('drei');
    expect(tailText('kurz', 10)).toBe('kurz');
  });
});
