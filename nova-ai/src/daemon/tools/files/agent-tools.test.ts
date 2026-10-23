// Tests of the six file agent tools: metadata, outputs, masking, EOL/BOM/encoding preservation, edit matching hints,
// locks (FILE_LOCKED), approvals (pending/approved/denied, consume/acknowledge), journal + tasks.addFiles wiring.
import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { createHarness, makeTask, type Harness } from './test-support';
import { createFileTools } from './index';
import type { AgentTool, ToolResult } from '../../contracts';

let h: Harness;
afterEach(() => h?.cleanup());

function tools(h: Harness): Record<string, AgentTool> {
  return Object.fromEntries(createFileTools(h.s).map((t) => [t.name, t]));
}

async function run(h: Harness, name: string, args: unknown, taskId = 'task_a'): Promise<ToolResult> {
  const tool = tools(h)[name];
  const params = tool.schema.parse(args);
  return tool.execute(params, h.ctx(taskId));
}

function write(h: Harness, rel: string, content: string | Buffer) {
  const abs = join(h.root, ...rel.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content);
}

const content = (r: ToolResult) => ('content' in r ? r.content : '');

describe('file agent tools – metadata', () => {
  it('exposes the six tools with JSON-schema-able zod schemas, readOnly flags and German describe()', () => {
    h = createHarness();
    const list = createFileTools(h.s);
    expect(list.map((t) => t.name)).toEqual(['list_files', 'read_file', 'search_files', 'write_file', 'edit_file', 'delete_file']);
    expect(list.filter((t) => t.readOnly).map((t) => t.name)).toEqual(['list_files', 'read_file', 'search_files']);
    for (const t of list) {
      const schema = z.toJSONSchema(t.schema, { io: 'input' }) as { type: string };
      expect(schema.type).toBe('object');
    }
    const T = tools(h);
    expect(T.read_file.describe({ path: 'src/a.ts' })).toBe('Liest src/a.ts');
    expect(T.write_file.describe({ path: 'x.ts', content: '' })).toBe('Schreibt x.ts');
    expect(T.edit_file.describe({ path: 'x.ts', oldText: 'a', newText: 'b', replaceAll: false })).toBe('Bearbeitet x.ts');
    expect(T.delete_file.describe({ path: 'x.ts' })).toBe('Löscht x.ts');
    expect(T.list_files.describe({ path: '.', depth: 2 })).toBe('Listet Dateien im Projektordner (Tiefe 2)');
    expect(T.list_files.describe({ path: 'src', depth: 1 })).toBe('Listet Dateien in src (Tiefe 1)');
    expect(T.search_files.describe({ query: 'foo', path: 'src', regex: false, caseSensitive: false })).toBe('Sucht nach „foo“ in src');
  });
});

describe('list_files / read_file / search_files', () => {
  it('lists with full relative paths, ignored folders collapsed and links marked', async () => {
    h = createHarness();
    write(h, 'src/app.ts', 'x');
    write(h, 'src/deep/a/b.ts', 'y');
    write(h, 'node_modules/p/i.js', 'z');
    symlinkSync(join(h.root, 'src'), join(h.root, 'alias'));
    const r = await run(h, 'list_files', {});
    expect(r.status).toBe('ok');
    const text = content(r);
    expect(text).toContain('node_modules/  (Abhängigkeits-/Build-Ordner – nicht aufgeklappt)');
    expect(text).toContain('src/app.ts  (1 B)');
    expect(text).toContain('src/deep/');
    expect(text).not.toContain('src/deep/a/');
    expect(text).toContain('alias  (Verknüpfung – wird nicht verfolgt)');
    expect(text).not.toContain('node_modules/p');
    expect((await run(h, 'list_files', { path: '../' })).status).toBe('error');
  });

  it('reads numbered line ranges with continuation hints and masks sensitive files', async () => {
    h = createHarness();
    write(h, 'big.ts', Array.from({ length: 450 }, (_, i) => `line ${i + 1}`).join('\r\n') + '\r\n');
    const first = await run(h, 'read_file', { path: 'big.ts' });
    expect(content(first)).toMatch(/^big\.ts – Zeilen 1–400 von 450:\n1: line 1\n2: line 2/);
    expect(content(first)).toContain('Weiterlesen mit startLine=401.');
    expect(content(first)).not.toContain('\r');
    const range = await run(h, 'read_file', { path: 'big.ts', startLine: 449, endLine: 999 });
    expect(content(range)).toBe('big.ts – Zeilen 449–450 von 450:\n449: line 449\n450: line 450');
    expect((await run(h, 'read_file', { path: 'big.ts', startLine: 500 })).status).toBe('error');
    write(h, '.env', 'API_KEY=sk-test-abcdefghijklmnopqrstuvwx\nDEBUG=true\n# comment\n');
    const env = await run(h, 'read_file', { path: '.env' });
    expect(content(env)).toContain('1: API_KEY=[GEHEIM]');
    expect(content(env)).toContain('2: DEBUG=[GEHEIM]');
    expect(content(env)).toContain('Zugangsdaten');
    expect(content(env)).not.toContain('sk-test');
    write(h, 'pic.png', Buffer.from([0x89, 0, 1]));
    expect(content(await run(h, 'read_file', { path: 'pic.png' }))).toContain('Binärdatei');
    expect((await run(h, 'read_file', { path: 'nope.ts' })).status).toBe('error');
  });

  it('searches with grouped output and masks matches in sensitive files', async () => {
    h = createHarness();
    write(h, 'src/a.ts', 'const token = process.env.TOKEN;\n');
    write(h, 'src/b.ts', 'no match\n');
    write(h, '.env', 'TOKEN=supersecretvalue123\n');
    const r = await run(h, 'search_files', { query: 'TOKEN' });
    const text = content(r);
    expect(text).toMatch(/^3 Treffer für „TOKEN“ in 2 Dateien:/); // case-insensitive by default: token + TOKEN
    expect(text).toContain('src/a.ts\n  1:7: const token = process.env.TOKEN;\n  1:27: const token');
    expect(text).toContain('.env\n  1:1: TOKEN=[GEHEIM]');
    expect(text).not.toContain('supersecret');
    const limited = await run(h, 'search_files', { query: 'TOKEN', path: 'src', caseSensitive: true });
    expect(content(limited)).toMatch(/^1 Treffer/);
    const none = await run(h, 'search_files', { query: 'zzz' });
    expect(content(none)).toContain('Keine Treffer');
    expect((await run(h, 'search_files', { query: '(', regex: true })).status).toBe('error');
  });
});

describe('write_file', () => {
  it('creates files with per-type default EOL, records the change for the task and never adds a BOM', async () => {
    h = createHarness();
    const r = await run(h, 'write_file', { path: 'src/Game.cs', content: '﻿class Game {\n}\n' });
    expect(r.status).toBe('ok');
    expect(readFileSync(join(h.root, 'src/Game.cs'), 'utf8')).toBe('class Game {\r\n}\r\n');
    await run(h, 'write_file', { path: 'src/app.ts', content: 'a\r\nb\r\n' });
    expect(readFileSync(join(h.root, 'src/app.ts'), 'utf8')).toBe('a\nb\n');
    expect(h.addedFiles.get('task_a')).toEqual(['src/Game.cs', 'src/app.ts']);
    expect(h.s.journal.list({ projectId: h.project.id })[0]).toMatchObject({ actor: 'nova', taskId: 'task_a', runId: 'run_1', source: 'tool' });
    expect(r).toMatchObject({ filesChanged: ['src/Game.cs'] });
    const same = await run(h, 'write_file', { path: 'src/app.ts', content: 'a\nb\n' });
    expect(content(same)).toContain('unverändert');
  });

  it('keeps the dominant EOL and the BOM of existing files', async () => {
    h = createHarness();
    write(h, 'win.txt', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('x\r\ny\r\nz\n')]));
    await run(h, 'write_file', { path: 'win.txt', content: 'new1\nnew2\n' });
    expect(readFileSync(join(h.root, 'win.txt'))).toEqual(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('new1\r\nnew2\r\n')]));
  });

  it('refuses protected paths, paths outside the project and folders', async () => {
    h = createHarness();
    expect(await run(h, 'write_file', { path: '.git/hooks/pre-commit', content: 'x' })).toMatchObject({ status: 'error', code: 'VALIDATION' });
    expect(await run(h, 'write_file', { path: '../outside.txt', content: 'x' })).toMatchObject({ status: 'error', code: 'PATH_OUTSIDE_PROJECT' });
    expect(await run(h, 'write_file', { path: '/tmp/abs.txt', content: 'x' })).toMatchObject({ status: 'error', code: 'PATH_OUTSIDE_PROJECT' });
    mkdirSync(join(h.root, 'folder'));
    expect(await run(h, 'write_file', { path: 'folder', content: 'x' })).toMatchObject({ status: 'error', code: 'VALIDATION' });
  });

  it('returns FILE_LOCKED naming the task that holds the file', async () => {
    h = createHarness();
    h.tasks.set('task_b', makeTask('task_b', h.project.id, { title: 'Menü überarbeiten' }));
    expect((await run(h, 'write_file', { path: 'shared.ts', content: '1' }, 'task_b')).status).toBe('ok');
    const r = await run(h, 'write_file', { path: 'shared.ts', content: '2' }, 'task_a');
    expect(r).toMatchObject({ status: 'error', code: 'FILE_LOCKED' });
    expect(content(r)).toContain('Datei wird gerade von Aufgabe „Menü überarbeiten“ bearbeitet');
    expect(readFileSync(join(h.root, 'shared.ts'), 'utf8')).toBe('1');
  });

  it('needs a security_config approval for sensitive files: pending → approval_required, approved → consumed + written, denied → acknowledged', async () => {
    h = createHarness();
    const pending = await run(h, 'write_file', { path: '.env', content: 'A=1\n' });
    expect(pending).toMatchObject({ status: 'approval_required', approvalId: 'apr_1' });
    expect(h.approvals.requests[0]).toMatchObject({ kind: 'security_config', subject: '.env', taskId: 'task_a', runId: 'run_1', projectId: h.project.id });
    expect(existsSync(join(h.root, '.env'))).toBe(false);
    h.approvals.decision.security_config = 'approved';
    const ok = await run(h, 'write_file', { path: '.env', content: 'A=1\n' });
    expect(ok.status).toBe('ok');
    expect(h.approvals.consumed).toEqual(['apr_2']);
    expect(readFileSync(join(h.root, '.env'), 'utf8')).toBe('A=1\n');
    h.approvals.decision.security_config = 'denied';
    const denied = await run(h, 'write_file', { path: '.env', content: 'A=2\n' });
    expect(denied).toMatchObject({ status: 'error', code: 'APPROVAL_DENIED' });
    expect(content(denied)).toContain('Vom Benutzer abgelehnt');
    expect(h.approvals.acknowledged).toEqual(['apr_3']);
    expect(readFileSync(join(h.root, '.env'), 'utf8')).toBe('A=1\n');
  });

  it('warns (and logs an activity step) when content looks like a secret', async () => {
    h = createHarness();
    const ctx = h.ctx();
    const tool = tools(h).write_file;
    const r = await tool.execute(tool.schema.parse({ path: 'src/config.ts', content: 'export const key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456";\n' }), ctx);
    expect(r.status).toBe('ok');
    expect(content(r)).toContain('Warnung: Der Inhalt sieht nach einem Zugangsschlüssel');
    expect(ctx.steps).toEqual([{ kind: 'status', summary: 'Warnung: src/config.ts enthält möglicherweise einen Zugangsschlüssel.' }]);
  });

  it('does nothing when the run was aborted', async () => {
    h = createHarness();
    const ac = new AbortController();
    ac.abort();
    const tool = tools(h).write_file;
    const r = await tool.execute(tool.schema.parse({ path: 'x.ts', content: 'x' }), h.ctx('task_a', ac.signal));
    expect(r).toMatchObject({ status: 'error', code: 'CANCELLED' });
    expect(existsSync(join(h.root, 'x.ts'))).toBe(false);
  });
});

describe('edit_file', () => {
  it('matches LF oldText in a CRLF file and keeps every untouched line ending (mixed files stay mixed)', async () => {
    h = createHarness();
    write(h, 'mixed.cs', 'using System;\r\nclass A\r\n{\n    int x = 1;\r\n}\r\n');
    const r = await run(h, 'edit_file', { path: 'mixed.cs', oldText: 'class A\n{\n    int x = 1;', newText: 'class B\n{\n    int x = 2;\n    int y = 3;' });
    expect(r.status).toBe('ok');
    expect(readFileSync(join(h.root, 'mixed.cs'), 'utf8')).toBe('using System;\r\nclass B\r\n{\r\n    int x = 2;\r\n    int y = 3;\r\n}\r\n');
    expect(content(r)).toContain('1 Stelle ersetzt (Zeile 2)');
    expect(content(r)).toContain('3: {');
    expect(h.addedFiles.get('task_a')).toEqual(['mixed.cs']);
  });

  it('inserts newText literally (no $-replacement patterns) and supports replaceAll', async () => {
    h = createHarness();
    write(h, 'a.ts', 'x = 1;\nx = 1;\n');
    const ambiguous = await run(h, 'edit_file', { path: 'a.ts', oldText: 'x = 1;', newText: 'y' });
    expect(ambiguous).toMatchObject({ status: 'error' });
    expect(content(ambiguous)).toContain('2-mal vor (Zeilen 1, 2)');
    const all = await run(h, 'edit_file', { path: 'a.ts', oldText: 'x = 1;', newText: "s.replace(/a/, '$&$1')", replaceAll: true });
    expect(content(all)).toContain('2 Stellen ersetzt');
    expect(readFileSync(join(h.root, 'a.ts'), 'utf8')).toBe("s.replace(/a/, '$&$1')\ns.replace(/a/, '$&$1')\n");
  });

  it('gives helpful hints when oldText is not found', async () => {
    h = createHarness();
    write(h, 'h.ts', 'function main() {\n    console.log("hallo");\n    return 1;\n}\n');
    const ws = await run(h, 'edit_file', { path: 'h.ts', oldText: 'console.log("hallo");\n  return 1;', newText: 'x' });
    expect(ws.status).toBe('error');
    expect(content(ws)).toContain('anderer Einrückung');
    expect(content(ws)).toContain('2:     console.log("hallo");');
    const similar = await run(h, 'edit_file', { path: 'h.ts', oldText: 'console.log("hello");', newText: 'x' });
    expect(content(similar)).toContain('Am ähnlichsten ist der Abschnitt ab Zeile 2');
    const nothing = await run(h, 'edit_file', { path: 'h.ts', oldText: 'zzzzzzzz qqqqq', newText: 'x' });
    expect(content(nothing)).toContain('nicht gefunden');
    expect((await run(h, 'edit_file', { path: 'h.ts', oldText: '', newText: 'x' })).status).toBe('error');
    expect(await run(h, 'edit_file', { path: 'missing.ts', oldText: 'a', newText: 'b' })).toMatchObject({ status: 'error', code: 'NOT_FOUND' });
    expect(readFileSync(join(h.root, 'h.ts'), 'utf8')).toContain('hallo');
  });

  it('keeps BOM and Latin-1 encoding when editing', async () => {
    h = createHarness();
    write(h, 'l1.txt', Buffer.from([0x41, 0xe4, 0x0a])); // "Aä\n" in Latin-1
    await run(h, 'edit_file', { path: 'l1.txt', oldText: 'A', newText: 'Ö' });
    expect(readFileSync(join(h.root, 'l1.txt'))).toEqual(Buffer.from([0xd6, 0xe4, 0x0a]));
    write(h, 'u16.ps1', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Write-Host "a"\r\n', 'utf16le')]));
    await run(h, 'edit_file', { path: 'u16.ps1', oldText: '"a"', newText: '"b"' });
    expect(readFileSync(join(h.root, 'u16.ps1'))).toEqual(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Write-Host "b"\r\n', 'utf16le')]));
  });

  it('asks for approval before editing sensitive files (after the match check)', async () => {
    h = createHarness();
    write(h, '.npmrc', 'registry=https://registry.npmjs.org/\n');
    const notFound = await run(h, 'edit_file', { path: '.npmrc', oldText: 'nope', newText: 'x' });
    expect(notFound.status).toBe('error');
    expect(h.approvals.requests).toHaveLength(0);
    const pending = await run(h, 'edit_file', { path: '.npmrc', oldText: 'registry=', newText: '; registry=' });
    expect(pending.status).toBe('approval_required');
  });
});

describe('delete_file', () => {
  it('asks for a delete approval when permissions.approveDeletes, consumes it and journals the delete', async () => {
    h = createHarness();
    write(h, 'old.ts', 'bye');
    const pending = await run(h, 'delete_file', { path: 'old.ts' });
    expect(pending).toMatchObject({ status: 'approval_required' });
    expect(h.approvals.requests[0]).toMatchObject({ kind: 'delete', subject: 'old.ts' });
    expect(existsSync(join(h.root, 'old.ts'))).toBe(true);
    h.approvals.decision.delete = 'approved';
    const ok = await run(h, 'delete_file', { path: 'old.ts' });
    expect(ok).toMatchObject({ status: 'ok', filesChanged: ['old.ts'] });
    expect(h.approvals.consumed).toHaveLength(1);
    expect(existsSync(join(h.root, 'old.ts'))).toBe(false);
    expect(h.s.journal.list({ projectId: h.project.id })[0]).toMatchObject({ op: 'delete', taskId: 'task_a', revertible: true });
    expect(h.addedFiles.get('task_a')).toEqual(['old.ts']);
  });

  it('deletes without approval when approveDeletes is off; refuses folders, links and missing files', async () => {
    h = createHarness();
    h.t.core.settings.update({ permissions: { approveDeletes: false } });
    write(h, 'tmp.txt', 'x');
    expect((await run(h, 'delete_file', { path: 'tmp.txt' })).status).toBe('ok');
    expect(h.approvals.requests).toHaveLength(0);
    mkdirSync(join(h.root, 'dir'));
    expect(await run(h, 'delete_file', { path: 'dir' })).toMatchObject({ status: 'error', code: 'VALIDATION' });
    write(h, 'target.txt', 't');
    symlinkSync(join(h.root, 'target.txt'), join(h.root, 'l.txt'));
    expect(await run(h, 'delete_file', { path: 'l.txt' })).toMatchObject({ status: 'error', code: 'VALIDATION' });
    expect(existsSync(join(h.root, 'target.txt'))).toBe(true);
    expect(await run(h, 'delete_file', { path: 'gone.txt' })).toMatchObject({ status: 'error', code: 'NOT_FOUND' });
    expect(await run(h, 'delete_file', { path: '.git/config' })).toMatchObject({ status: 'error', code: 'VALIDATION' });
  });

  it('sensitive files need a security_config approval even when approveDeletes is off', async () => {
    h = createHarness();
    h.t.core.settings.update({ permissions: { approveDeletes: false } });
    write(h, 'server.key', 'k');
    expect(await run(h, 'delete_file', { path: 'server.key' })).toMatchObject({ status: 'approval_required' });
    expect(h.approvals.requests[0].kind).toBe('security_config');
  });
});
