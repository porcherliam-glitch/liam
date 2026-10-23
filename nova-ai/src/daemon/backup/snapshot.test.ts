// Snapshot walker/copier: skip rules (dependency folders anywhere, build folders at the root only, bin/obj next to
// .NET projects), links never followed, size cap before and during the copy, abort, preserved mtimes and files that
// vanish or turn into links between scan and copy.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../../tests/helpers/core';
import { copyTree, scanTree } from './snapshot';

const dirs: { cleanup(): void }[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) d.cleanup();
});

function tree(files: Record<string, string>): string {
  const t = tempDir('nova-snap-');
  dirs.push(t);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(t.dir, ...rel.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return t.dir;
}

describe('scanTree', () => {
  it('applies the skip rules and never follows links', async () => {
    const root = tree({
      'src/index.js': 'a',
      'node_modules/x/index.js': 'skip',
      'packages/p/node_modules/y.js': 'skip',
      '.git/HEAD': 'skip',
      '.venv/lib.py': 'skip',
      'build/out.js': 'skip at root',
      'dist/app.js': 'skip at root',
      'Library/cache.bin': 'unity',
      'Temp/x': 'unity',
      'src/build/helper.js': 'keep (deep build folder is source)',
      'tools/bin/cli.js': 'keep (deep bin without .NET project)',
      'App/App.csproj': '<Project/>',
      'App/bin/Debug/app.dll': 'skip',
      'App/obj/x.cache': 'skip',
      'App/Main.cs': 'keep',
    });
    symlinkSync(join(root, 'src'), join(root, 'link-to-src'));
    symlinkSync('/etc/hostname', join(root, 'outside-link.txt'));
    const scan = await scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1e9 });
    expect(scan.files.map((f) => f.rel).sort()).toEqual(['App/App.csproj', 'App/Main.cs', 'src/build/helper.js', 'src/index.js', 'tools/bin/cli.js']);
    expect(scan.skippedLinks).toBe(2);
    expect(scan.skippedDirs.sort()).toEqual(['.git', '.venv', 'App/bin', 'App/obj', 'Library', 'Temp', 'build', 'dist', 'node_modules', 'packages/p/node_modules'].sort());
    expect(scan.totalBytes).toBe(scan.files.reduce((n, f) => n + f.size, 0));
  });

  it('compares skipped names case-insensitively only on Windows', async () => {
    const root = tree({ 'Node_Modules/a.js': 'x', 'BUILD/b.js': 'y', 'keep.txt': 'z' });
    const linux = await scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1e9 });
    expect(linux.files.map((f) => f.rel).sort()).toEqual(['BUILD/b.js', 'Node_Modules/a.js', 'keep.txt']);
    const win = await scanTree(root, { platform: 'win32', applySkipRules: true, maxBytes: 1e9 });
    expect(win.files.map((f) => f.rel)).toEqual(['keep.txt']);
  });

  it('copies everything when the skip rules are off (restoring a snapshot)', async () => {
    const root = tree({ 'build/x.js': 'x', 'bin/y': 'y' });
    const scan = await scanTree(root, { platform: 'linux', applySkipRules: false, maxBytes: 1e9 });
    expect(scan.files.map((f) => f.rel).sort()).toEqual(['bin/y', 'build/x.js']);
  });

  it('stops with RESOURCE_LIMIT above the size cap and honours abort', async () => {
    const root = tree({ 'a.bin': 'x'.repeat(600), 'b.bin': 'y'.repeat(600) });
    await expect(scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1000, tooLargeMessage: 'zu groß' })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT', message: 'zu groß' });
    const c = new AbortController();
    c.abort();
    await expect(scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1e9, signal: c.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('copyTree', () => {
  it('copies files with directories and mtimes, reporting progress', async () => {
    const root = tree({ 'src/a.txt': 'hallo', 'docs/b.md': '# b', 'empty/.keep': '' });
    const old = new Date('2024-01-02T03:04:05Z');
    utimesSync(join(root, 'src/a.txt'), old, old);
    const scan = await scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1e9 });
    const destBase = tempDir('nova-dest-');
    dirs.push(destBase);
    const dest = join(destBase.dir, 'copy');
    const progress: (number | null)[] = [];
    const r = await copyTree(root, dest, scan, { maxBytes: 1e9, onProgress: (p) => progress.push(p) });
    expect(r).toMatchObject({ fileCount: 3, skipped: [] });
    expect(readFileSync(join(dest, 'src/a.txt'), 'utf8')).toBe('hallo');
    expect(existsSync(join(dest, 'empty/.keep'))).toBe(true);
    expect(Math.round(statSync(join(dest, 'src/a.txt')).mtimeMs / 1000)).toBe(Math.round(old.getTime() / 1000));
  });

  it('skips files that vanished or became links after the scan, and enforces the cap while copying', async () => {
    const root = tree({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' });
    const scan = await scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1e9 });
    unlinkSync(join(root, 'a.txt'));
    unlinkSync(join(root, 'b.txt'));
    symlinkSync('/etc/hostname', join(root, 'b.txt'));
    const destBase = tempDir('nova-dest-');
    dirs.push(destBase);
    const r = await copyTree(root, join(destBase.dir, 'c1'), scan, { maxBytes: 1e9 });
    expect(r.fileCount).toBe(1);
    expect(r.skipped.map((x) => x.path).sort()).toEqual(['a.txt', 'b.txt']);
    writeFileSync(join(root, 'c.txt'), 'c'.repeat(5000)); // grew after the scan
    await expect(copyTree(root, join(destBase.dir, 'c2'), scan, { maxBytes: 100 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
  });

  it('aborts between files', async () => {
    const root = tree({ 'a.txt': 'a' });
    const scan = await scanTree(root, { platform: 'linux', applySkipRules: true, maxBytes: 1e9 });
    const c = new AbortController();
    c.abort();
    const destBase = tempDir('nova-dest-');
    dirs.push(destBase);
    await expect(copyTree(root, join(destBase.dir, 'x'), scan, { maxBytes: 1e9, signal: c.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});
