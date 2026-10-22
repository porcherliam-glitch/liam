import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../../tests/helpers/core';
import { findArtifacts, globStaticPrefix, globToRegExp, matchesGlob } from './glob';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('glob matcher', () => {
  it.each([
    ['dist/**', 'dist/a.js', true],
    ['dist/**', 'dist/sub/b.css', true],
    ['dist/**', 'distx/a.js', false],
    ['dist/**', 'src/dist/a.js', false],
    ['**/bin/Release/**', 'src/App/bin/Release/net8.0/App.dll', true],
    ['**/bin/Release/**', 'bin/Release/App.dll', true],
    ['**/bin/Release/**', 'src/App/bin/Debug/App.dll', false],
    ['*.exe', 'Builds/Windows/Game.exe', true],
    ['Builds/*.exe', 'Builds/Game.exe', true],
    ['Builds/*.exe', 'Builds/x/Game.exe', false],
    ['out/app-?.zip', 'out/app-1.zip', true],
    ['out/app-?.zip', 'out/app-12.zip', false],
    ['release/*.{exe,msi}', 'release/setup.msi', true],
    ['release/*.{exe,msi}', 'release/setup.zip', false],
    ['data/[abc].txt', 'data/b.txt', true],
    ['data/[!abc].txt', 'data/b.txt', false],
    ['./dist/**', 'dist/a', true],
    ['a.b+c(d)', 'a.b+c(d)', true],
  ])('%s vs %s → %s', (pattern, path, expected) => {
    expect(matchesGlob(path, pattern, false)).toBe(expected);
  });

  it('is case-insensitive only when asked (Windows)', () => {
    expect(globToRegExp('Dist/**', true).test('dist/a.js')).toBe(true);
    expect(globToRegExp('Dist/**', false).test('dist/a.js')).toBe(false);
  });

  it('computes the static prefix', () => {
    expect(globStaticPrefix('dist/**')).toBe('dist');
    expect(globStaticPrefix('src/app/bin/*.dll')).toBe('src/app/bin');
    expect(globStaticPrefix('**/bin/**')).toBe('');
    expect(globStaticPrefix('*.exe')).toBe('');
  });
});

describe('findArtifacts', () => {
  it('finds matching files modified since the start, skipping links and old files', () => {
    const t = tempDir();
    cleanups.push(t.cleanup);
    mkdirSync(join(t.dir, 'dist', 'assets'), { recursive: true });
    writeFileSync(join(t.dir, 'dist', 'index.html'), '<html></html>');
    writeFileSync(join(t.dir, 'dist', 'assets', 'app.js'), 'x'.repeat(10));
    writeFileSync(join(t.dir, 'dist', 'old.txt'), 'old');
    const old = new Date(Date.now() - 3600_000);
    utimesSync(join(t.dir, 'dist', 'old.txt'), old, old);
    mkdirSync(join(t.dir, 'node_modules', 'x', 'dist'), { recursive: true });
    writeFileSync(join(t.dir, 'node_modules', 'x', 'dist', 'lib.js'), 'x');
    const outside = tempDir();
    cleanups.push(outside.cleanup);
    writeFileSync(join(outside.dir, 'secret.js'), 'x');
    symlinkSync(outside.dir, join(t.dir, 'dist', 'linked'));
    const found = findArtifacts(t.dir, ['dist/**', '**/lib.js'], { caseInsensitive: false, sinceMs: Date.now() - 60_000 });
    expect(found).toEqual([
      { path: 'dist/assets/app.js', sizeBytes: 10 },
      { path: 'dist/index.html', sizeBytes: 13 },
    ]);
  });

  it('returns [] without globs and respects the result limit', () => {
    const t = tempDir();
    cleanups.push(t.cleanup);
    mkdirSync(join(t.dir, 'out'));
    for (let i = 0; i < 10; i++) writeFileSync(join(t.dir, 'out', `f${i}.bin`), 'x');
    expect(findArtifacts(t.dir, [], { caseInsensitive: false, sinceMs: 0 })).toEqual([]);
    expect(findArtifacts(t.dir, ['out/**'], { caseInsensitive: false, sinceMs: 0, maxResults: 3 })).toHaveLength(3);
  });
});
