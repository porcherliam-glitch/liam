// Tests of FileService against a real journal and temp project: tree, read/write (encodings, conflicts), delete/
// rename/mkdir, snapshots, search (incl. ReDoS timeout), changed/history/diff.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHarness, type Harness } from './test-support';
import { sha256 } from '../../changes/blob-store';

let h: Harness;
afterEach(() => h?.cleanup());

function write(h: Harness, rel: string, content: string | Buffer) {
  const abs = join(h.root, ...rel.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

describe('FileService.tree', () => {
  it('lists dirs first, does not descend ignored folders or links, marks NOVA changes and git status', async () => {
    h = createHarness({ projectPatch: { gitAvailable: true } });
    h.git.repo = true;
    write(h, 'src/app.ts', 'x');
    write(h, 'src/lib/util.ts', 'y');
    write(h, 'node_modules/pkg/index.js', 'z');
    write(h, 'README.md', 'r');
    write(h, '.README.md.nova-0123abcd.tmp~', 'temp');
    symlinkSync(join(h.root, 'src'), join(h.root, 'src-link'));
    h.git.status = [{ path: 'README.md', index: ' ', workTree: 'M' }];
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'src/lib/util.ts', content: 'changed', actor: 'nova', taskId: 'task_a' });
    const tree = await h.s.files.tree(h.project.id, '', 3);
    expect(tree.path).toBe('');
    expect(tree.children!.map((c) => `${c.type}:${c.name}`)).toEqual(['dir:node_modules', 'dir:src', 'dir:src-link', 'file:README.md']);
    const [nm, src, link, readme] = tree.children!;
    expect(nm.children).toBeNull();
    expect(link).toMatchObject({ type: 'dir', children: null });
    expect(readme).toMatchObject({ gitStatus: ' M', size: 1, changedByNova: false });
    expect(src.changedByNova).toBe(true);
    const lib = src.children!.find((c) => c.name === 'lib')!;
    expect(lib.changedByNova).toBe(true);
    expect(lib.children![0]).toMatchObject({ name: 'util.ts', path: 'src/lib/util.ts', changedByNova: true, type: 'file' });
    // depth limit
    const shallow = await h.s.files.tree(h.project.id, '', 1);
    expect(shallow.children!.find((c) => c.name === 'src')!.children).toBeNull();
    // explicitly opening an ignored folder lists it
    const nmTree = await h.s.files.tree(h.project.id, 'node_modules', 2);
    expect(nmTree.children![0]).toMatchObject({ name: 'pkg', type: 'dir' });
    expect(nmTree.children![0].children![0].name).toBe('index.js');
    await expect(h.s.files.tree(h.project.id, '../x', 1)).rejects.toMatchObject({ code: 'PATH_OUTSIDE_PROJECT' });
  });
});

describe('FileService.read / write', () => {
  it('reads text with language, hash and BOM stripped; detects binary; truncates over 2 MB', async () => {
    h = createHarness();
    write(h, 'src/a.ts', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('export const a = 1;\n')]));
    const a = await h.s.files.read(h.project.id, 'src/a.ts');
    expect(a).toMatchObject({ path: 'src/a.ts', content: 'export const a = 1;\n', encoding: 'utf8', language: 'typescript', truncated: false });
    expect(a.hash).toBe(sha256(readFileSync(join(h.root, 'src/a.ts'))));
    write(h, 'img.png', Buffer.from([0x89, 0x50, 0x00, 0x01]));
    expect(await h.s.files.read(h.project.id, 'img.png')).toMatchObject({ encoding: 'binary', content: '' });
    const big = 'ä'.repeat(1_100_000); // 2.2 MB in UTF-8
    write(h, 'big.txt', big);
    const b = await h.s.files.read(h.project.id, 'big.txt');
    expect(b.truncated).toBe(true);
    expect(Buffer.byteLength(b.content)).toBeLessThanOrEqual(2 * 1024 * 1024);
    expect(b.content.endsWith('ä')).toBe(true);
    expect(b.hash).toBe(sha256(Buffer.from(big)));
    await expect(h.s.files.read(h.project.id, 'missing.ts')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(h.s.files.read(h.project.id, 'src')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('writes user edits through the journal (actor user), keeps BOM and legacy encoding, checks expectedHash', async () => {
    h = createHarness();
    write(h, 'bom.cs', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('class A {}\r\n')]));
    const before = await h.s.files.read(h.project.id, 'bom.cs');
    const after = await h.s.files.write(h.project.id, 'bom.cs', 'class B {}\r\n', before.hash);
    expect(after.content).toBe('class B {}\r\n');
    expect(readFileSync(join(h.root, 'bom.cs')).subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    await expect(h.s.files.write(h.project.id, 'bom.cs', 'x', before.hash)).rejects.toMatchObject({ code: 'CONFLICT' });
    // Latin-1 file: lossless round trip
    write(h, 'legacy.txt', Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65, 0x0a])); // "Grüße"-ish in Latin-1
    const legacy = await h.s.files.read(h.project.id, 'legacy.txt');
    await h.s.files.write(h.project.id, 'legacy.txt', legacy.content + 'neu\n', legacy.hash);
    expect(readFileSync(join(h.root, 'legacy.txt'))).toEqual(Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65, 0x0a, 0x6e, 0x65, 0x75, 0x0a]));
    // new file
    const created = await h.s.files.write(h.project.id, 'docs/new.md', '# Titel\n', null);
    expect(created).toMatchObject({ path: 'docs/new.md', language: 'markdown' });
    const hist = h.s.files.history(h.project.id, { limit: 10 });
    expect(hist.every((c) => c.actor === 'user' && c.source === 'user')).toBe(true);
    expect(h.s.files.history(h.project.id, { path: 'docs/new.md', limit: 10 })).toHaveLength(1);
  });
});

describe('FileService delete / rename / mkdir / snapshot', () => {
  it('journals deletes and renames (files and folders) and refuses links', async () => {
    h = createHarness();
    write(h, 'a.txt', 'A');
    write(h, 'dir/x.txt', 'X');
    write(h, 'dir/sub/y.txt', 'Y');
    await h.s.files.rename(h.project.id, 'a.txt', 'b.txt');
    expect(existsSync(join(h.root, 'a.txt'))).toBe(false);
    expect(readFileSync(join(h.root, 'b.txt'), 'utf8')).toBe('A');
    await h.s.files.rename(h.project.id, 'dir', 'moved/dir2');
    expect(readFileSync(join(h.root, 'moved/dir2/sub/y.txt'), 'utf8')).toBe('Y');
    expect(existsSync(join(h.root, 'dir'))).toBe(false);
    await expect(h.s.files.rename(h.project.id, 'b.txt', 'moved/dir2/x.txt')).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(h.s.files.rename(h.project.id, 'moved', 'moved/inner')).rejects.toMatchObject({ code: 'VALIDATION' });
    await h.s.files.delete(h.project.id, 'moved');
    expect(existsSync(join(h.root, 'moved'))).toBe(false);
    await h.s.files.delete(h.project.id, 'b.txt');
    const ops = h.s.files.history(h.project.id, { limit: 100 }).map((c) => `${c.op}:${c.path}`);
    expect(ops).toContain('delete:b.txt');
    expect(ops).toContain('create:moved/dir2/sub/y.txt');
    expect(ops).toContain('delete:moved/dir2/x.txt');
    write(h, 'target.txt', 't');
    symlinkSync(join(h.root, 'target.txt'), join(h.root, 'link.txt'));
    await expect(h.s.files.delete(h.project.id, 'link.txt')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(existsSync(join(h.root, 'target.txt'))).toBe(true);
    await expect(h.s.files.delete(h.project.id, '.')).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('creates folders idempotently and serves snapshots only for the owning project', async () => {
    h = createHarness();
    const events: unknown[] = [];
    h.t.core.bus.on('files.changed', (e) => events.push(e));
    await h.s.files.mkdir(h.project.id, 'a/b/c');
    await h.s.files.mkdir(h.project.id, 'a/b/c');
    expect(existsSync(join(h.root, 'a/b/c'))).toBe(true);
    expect(events).toEqual([{ projectId: h.project.id, paths: ['a/b/c'], actor: 'user' }]);
    write(h, 'file', 'x');
    await expect(h.s.files.mkdir(h.project.id, 'file')).rejects.toMatchObject({ code: 'CONFLICT' });
    write(h, 's.txt', 'old content');
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 's.txt', content: 'new', actor: 'nova' });
    expect(h.s.files.snapshot(h.project.id, sha256('old content'))).toEqual({ content: 'old content', binary: false });
    expect(() => h.s.files.snapshot(h.project.id, sha256('never stored'))).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });
});

describe('FileService.search', () => {
  it('finds plain and regex matches with 1-based positions, skipping binary, large and ignored files', async () => {
    h = createHarness();
    write(h, 'src/a.ts', 'const Foo = 1;\nfoo();\n  // FOO here\n');
    write(h, 'src/b.ts', 'nothing\n');
    write(h, 'node_modules/x/index.js', 'foo');
    write(h, 'bin.dat', Buffer.from([0x66, 0x6f, 0x6f, 0x00]));
    write(h, 'large.txt', 'foo\n' + 'x'.repeat(1_100_000));
    const plain = await h.s.files.search(h.project.id, 'foo', { regex: false, caseSensitive: false, limit: 50 });
    expect(plain.map((m) => `${m.path}:${m.line}:${m.column}`)).toEqual(['src/a.ts:1:7', 'src/a.ts:2:1', 'src/a.ts:3:6']);
    expect(plain[2].preview).toBe('// FOO here');
    const cs = await h.s.files.search(h.project.id, 'foo', { regex: false, caseSensitive: true, limit: 50 });
    expect(cs).toHaveLength(1);
    const re = await h.s.files.search(h.project.id, '^\\s*//', { regex: true, caseSensitive: false, limit: 50 });
    expect(re.map((m) => m.line)).toEqual([3]);
    const literal = await h.s.files.search(h.project.id, 'foo()', { regex: false, caseSensitive: true, limit: 50 });
    expect(literal.map((m) => m.line)).toEqual([2]);
    expect(await h.s.files.search(h.project.id, 'o', { regex: false, caseSensitive: false, limit: 2 })).toHaveLength(2);
    await expect(h.s.files.search(h.project.id, '(unclosed', { regex: true, caseSensitive: false, limit: 5 })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('stops a catastrophic regex by timeout instead of blocking the daemon', async () => {
    h = createHarness();
    h.s.files = (await import('./file-service')).createFileService(h.s, { searchTimeoutMs: 300 });
    write(h, 'evil.txt', 'a'.repeat(40) + '!\n');
    const started = Date.now();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 20);
    const res = await h.s.files.search(h.project.id, '^(a+)+$', { regex: true, caseSensitive: true, limit: 5 });
    clearInterval(timer);
    expect(res).toEqual([]);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(ticks).toBeGreaterThan(3); // event loop stayed responsive
  });
});

describe('FileService.changed / history / diff', () => {
  it('merges journal changes with git status and diffs against the first NOVA snapshot or git HEAD', async () => {
    h = createHarness({ projectPatch: { gitAvailable: true } });
    h.git.repo = true;
    write(h, 'a.txt', 'one\ntwo\n');
    write(h, 'user.txt', 'mine\n');
    h.git.head.set('user.txt', Buffer.from('original\n'));
    h.git.status = [
      { path: 'user.txt', index: ' ', workTree: 'M' },
      { path: 'a.txt', index: ' ', workTree: 'M' },
      { path: 'fresh.txt', index: '?', workTree: '?' },
    ];
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'a.txt', content: 'one\nTWO\n', actor: 'nova', taskId: 'task_a' });
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'a.txt', content: 'one\nTWO\nthree\n', actor: 'nova', taskId: 'task_b' });
    const changed = await h.s.files.changed(h.project.id);
    expect(changed).toEqual([
      { path: 'a.txt', op: 'modify', byNova: true, taskIds: ['task_b', 'task_a'], gitStatus: ' M', modifiedSinceNova: false },
      { path: 'fresh.txt', op: 'create', byNova: false, taskIds: [], gitStatus: '??', modifiedSinceNova: false },
      { path: 'user.txt', op: 'modify', byNova: false, taskIds: [], gitStatus: ' M', modifiedSinceNova: false },
    ]);
    const all = await h.s.files.diff(h.project.id, 'a.txt');
    expect(all).toMatchObject({ original: 'one\ntwo\n', modified: 'one\nTWO\nthree\n', binary: false });
    expect(all.unified).toContain('-two\n+TWO\n+three\n');
    const taskB = await h.s.files.diff(h.project.id, 'a.txt', { taskId: 'task_b' });
    expect(taskB.original).toBe('one\nTWO\n');
    const firstChange = h.s.files.history(h.project.id, { path: 'a.txt', limit: 10 }).at(-1)!;
    expect((await h.s.files.diff(h.project.id, 'a.txt', { changeId: firstChange.id })).original).toBe('one\ntwo\n');
    const userDiff = await h.s.files.diff(h.project.id, 'user.txt');
    expect(userDiff.unified).toContain('-original\n+mine\n');
    write(h, 'p.bin', Buffer.from([1, 0, 2]));
    expect(await h.s.files.diff(h.project.id, 'p.bin')).toMatchObject({ binary: true, original: '', modified: '' });
    await expect(h.s.files.diff(h.project.id, 'a.txt', { changeId: 99999 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('diffs a file NOVA created and later deleted', async () => {
    h = createHarness();
    await h.s.journal.writeFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'n.txt', content: 'new\n', actor: 'nova', taskId: 'task_a' });
    expect((await h.s.files.diff(h.project.id, 'n.txt')).unified).toContain('@@ -0,0 +1 @@\n+new\n');
    await h.s.journal.deleteFile({ projectId: h.project.id, projectRoot: h.root, relPath: 'n.txt', actor: 'nova', taskId: 'task_a' });
    expect(await h.s.files.diff(h.project.id, 'n.txt')).toMatchObject({ original: '', modified: '', unified: '' });
  });
});
