// Tests of memory export/import: default file names, explicit targets (relative, directory, overwrite protection),
// envelope validation, redaction, id/duplicate/secret/unknown-project skipping, project mapping, progress, cancel.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NovaError } from '../core/errors';
import { REDACTED, _clearRegisteredSecrets, registerSecret } from '../core/redact';
import { MEMORY_EXPORT_FORMAT, MemoryExportEnvelopeSchema, fileSlug, fileTimestamp } from './export-format';
import { memoryHarness, type MemoryHarness } from './test-support';

const harnesses: MemoryHarness[] = [];
function harness(...args: Parameters<typeof memoryHarness>): MemoryHarness {
  const h = memoryHarness(...args);
  harnesses.push(h);
  return h;
}
afterEach(() => {
  while (harnesses.length) harnesses.pop()!.cleanup();
  _clearRegisteredSecrets();
});

async function rejection(p: Promise<unknown>): Promise<NovaError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(NovaError);
    return e as NovaError;
  }
  throw new Error('expected a rejection');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function seed(h: MemoryHarness): void {
  h.memory.add({ projectId: 'prj_a', kind: 'goal', title: 'Ziel', content: 'Ein Weltraumspiel.', tags: ['projekt'], taskId: 'task_1' }, 'system');
  h.memory.add({ projectId: 'prj_a', kind: 'insight', title: 'Canvas', content: 'devicePixelRatio beachten.', shareable: true }, 'user');
  h.memory.add({ projectId: 'prj_b', kind: 'note', title: 'Kasse', content: 'Beträge in Cent.' }, 'user');
  h.memory.add({ projectId: null, kind: 'insight', title: 'Commits', content: 'Klein halten.', shareable: true }, 'user');
}

describe('exportTo', () => {
  it('writes a validated envelope to <dataDir>/exports/memory-<project>-<timestamp>.json', async () => {
    const h = harness();
    seed(h);
    const ts = 1_700_000_000_000;
    h.setClock(ts);
    const progress: number[] = [];
    const res = await h.memory.exportTo('prj_a', undefined, { onProgress: (p) => progress.push(p ?? -1) });
    expect(res.count).toBe(2);
    expect(res.path).toBe(join(h.t.core.paths.exports, `memory-${fileSlug('Sternenjäger')}-${fileTimestamp(ts)}.json`));
    expect(res.path).toContain('memory-sternenjaeger-');
    const doc = MemoryExportEnvelopeSchema.parse(readJson(res.path));
    expect(doc).toMatchObject({ format: MEMORY_EXPORT_FORMAT, version: 1, exportedAt: ts, scope: { type: 'project', projectId: 'prj_a' } });
    expect(doc.projects).toEqual([{ id: 'prj_a', name: 'Sternenjäger', path: '/home/max/projekte/sternenjaeger' }]);
    expect((doc.entries as { title: string }[]).map((e) => e.title)).toEqual(['Ziel', 'Canvas']);
    expect(progress.at(-1)).toBe(100);
    // Same second again → a unique name instead of overwriting.
    const again = await h.memory.exportTo('prj_a');
    expect(again.path).toBe(res.path.replace(/\.json$/, '-2.json'));
  });

  it('uses "global" for the knowledge base and "gesamt" for everything', async () => {
    const h = harness();
    seed(h);
    const global = await h.memory.exportTo(null);
    expect(global.path).toMatch(/memory-global-\d{8}-\d{6}\.json$/);
    expect(global.count).toBe(1);
    const all = await h.memory.exportTo(undefined);
    expect(all.path).toMatch(/memory-gesamt-\d{8}-\d{6}\.json$/);
    expect(all.count).toBe(4);
    const doc = MemoryExportEnvelopeSchema.parse(readJson(all.path));
    expect(doc.scope).toEqual({ type: 'all', projectId: null });
    expect(doc.projects.map((p) => p.id).sort()).toEqual(['prj_a', 'prj_b']);
  });

  it('never exports secrets (entries are redacted again on export)', async () => {
    const h = harness();
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Staging', content: 'Der Staging-Server nutzt XyZ-445566-geheim zur Anmeldung im Testbetrieb.' }, 'user');
    registerSecret('XyZ-445566-geheim');
    const res = await h.memory.exportTo('prj_a');
    const text = readFileSync(res.path, 'utf8');
    expect(text).not.toContain('XyZ-445566-geheim');
    expect(text).toContain(REDACTED);
  });

  it('resolves relative paths below the exports folder and writes into given directories', async () => {
    const h = harness();
    seed(h);
    const rel = await h.memory.exportTo('prj_b', 'sicherung/kasse.json');
    expect(rel.path).toBe(join(h.t.core.paths.exports, 'sicherung', 'kasse.json'));
    expect(existsSync(rel.path)).toBe(true);
    const dir = join(h.t.dir, 'ziel');
    mkdirSync(dir);
    const inDir = await h.memory.exportTo('prj_b', dir);
    expect(inDir.path.startsWith(join(dir, 'memory-kassenbuch-'))).toBe(true);
  });

  it('overwrites an earlier memory export but never another file', async () => {
    const h = harness();
    seed(h);
    const target = join(h.t.dir, 'export.json');
    const first = await h.memory.exportTo('prj_a', target);
    expect(first.path).toBe(target);
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Neu', content: '' }, 'user');
    expect((await h.memory.exportTo('prj_a', target)).count).toBe(3);

    const foreign = join(h.t.dir, 'notizen.json');
    writeFileSync(foreign, '{"wichtig": true}');
    const err = await rejection(h.memory.exportTo('prj_a', foreign));
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toContain('nicht überschrieben');
    expect(readFileSync(foreign, 'utf8')).toBe('{"wichtig": true}');
  });

  it('honours an aborted signal', async () => {
    const h = harness();
    seed(h);
    const ac = new AbortController();
    ac.abort();
    expect((await rejection(h.memory.exportTo('prj_a', undefined, { signal: ac.signal }))).code).toBe('CANCELLED');
  });
});

describe('export file names', () => {
  it('builds ASCII slugs and local timestamps', () => {
    expect(fileSlug('Mein Spiel – Größe 2')).toBe('mein-spiel-groesse-2');
    expect(fileSlug('Ärger über Café')).toBe('aerger-ueber-cafe');
    expect(fileSlug('***')).toBe('');
    expect(fileTimestamp(new Date(2026, 0, 2, 3, 4, 5).getTime())).toBe('20260102-030405');
  });
});

describe('importFrom', () => {
  it('round-trips an export into another installation, keeps ids and emits events', async () => {
    const src = harness();
    seed(src);
    const exported = await src.memory.exportTo(undefined);
    const dst = harness();
    const res = await dst.memory.importFrom(exported.path);
    expect(res).toEqual({ imported: 4, skipped: 0 });
    const srcAll = src.memory.list().map((e) => ({ ...e })).sort((a, b) => a.id.localeCompare(b.id));
    const dstAll = dst.memory.list().sort((a, b) => a.id.localeCompare(b.id));
    expect(dstAll).toEqual(srcAll);
    expect(dst.events).toHaveLength(4);
    // A second import skips every existing id.
    expect(await dst.memory.importFrom(exported.path)).toEqual({ imported: 0, skipped: 4 });
  });

  it('maps entries to projects with another id by folder, else by unique name; unknown projects are skipped', async () => {
    const src = harness();
    seed(src);
    const exported = await src.memory.exportTo(undefined);
    const dst = harness([
      { id: 'prj_x', name: 'Anderer Name', path: '/home/max/projekte/sternenjaeger/' },
      { id: 'prj_y', name: 'kassenbuch', path: '/mnt/daten/kasse' },
    ]);
    expect(await dst.memory.importFrom(exported.path)).toEqual({ imported: 4, skipped: 0 });
    expect(dst.memory.list({ projectId: 'prj_x' }).map((e) => e.title).sort()).toEqual(['Canvas', 'Ziel']);
    // Task ids only mean something in the original project.
    expect(dst.memory.list({ projectId: 'prj_x', kind: 'goal' })[0].taskId).toBeNull();
    expect(dst.memory.list({ projectId: 'prj_y' }).map((e) => e.title)).toEqual(['Kasse']);

    const none = harness([{ id: 'prj_z', name: 'Fremd', path: '/home/max/fremd' }]);
    expect(await none.memory.importFrom(exported.path)).toEqual({ imported: 1, skipped: 3 });
    expect(none.memory.list().map((e) => e.title)).toEqual(['Commits']);
  });

  it('skips invalid entries, credentials and duplicates, clamps future timestamps and redacts', async () => {
    const h = harness();
    h.setClock(1_700_000_000_000);
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Schon da', content: 'Gleicher Inhalt' }, 'user');
    const file = join(h.t.dir, 'import.json');
    writeFileSync(
      file,
      JSON.stringify({
        format: MEMORY_EXPORT_FORMAT,
        version: 1,
        exportedAt: 1,
        entries: [
          { id: 'mem_ok', projectId: 'prj_a', kind: 'decision', title: 'Gültig', content: 'Mit token=abcdef123456 als Beispiel für die Doku des Testzugangs.', createdAt: 9_999_999_999_999 },
          { id: 'mem_bad_kind', projectId: 'prj_a', kind: 'quatsch', title: 'x' },
          { id: 'mem_no_title', projectId: 'prj_a', kind: 'note', title: '' },
          { id: 'mem_secret', projectId: 'prj_a', kind: 'note', title: 'Schlüssel', content: 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456' },
          { id: 'mem_dup', projectId: 'prj_a', kind: 'note', title: 'Schon da', content: 'Gleicher Inhalt' },
          { id: 'mem_ok', projectId: 'prj_a', kind: 'note', title: 'Gleiche Id', content: '' },
          'kein Objekt',
          { id: 'mem_global', projectId: null, kind: 'insight', title: 'Minimal' },
        ],
      }),
    );
    expect(await h.memory.importFrom(file)).toEqual({ imported: 2, skipped: 6 });
    const ok = h.memory.list({ projectId: 'prj_a', kind: 'decision' })[0];
    expect(ok).toMatchObject({ id: 'mem_ok', title: 'Gültig', source: 'user', shareable: false, createdAt: 1_700_000_000_000 });
    expect(ok.content).toContain(REDACTED);
    expect(h.memory.list({ projectId: null })[0]).toMatchObject({ id: 'mem_global', content: '', tags: [] });
  });

  it('rejects files that are not memory exports with German messages', async () => {
    const h = harness();
    const write = (name: string, content: string) => {
      const p = join(h.t.dir, name);
      writeFileSync(p, content);
      return p;
    };
    expect((await rejection(h.memory.importFrom(write('a.json', '{kaputt')))).message).toContain('kein gültiges JSON');
    expect((await rejection(h.memory.importFrom(write('b.json', '{"format":"nova-export","version":1}')))).message).toContain('kein gültiger NOVA-Gedächtnisexport');
    const newer = await rejection(h.memory.importFrom(write('c.json', JSON.stringify({ format: MEMORY_EXPORT_FORMAT, version: 2, exportedAt: 1, entries: [] }))));
    expect(newer.message).toContain('neueren NOVA-Version');
    expect((await rejection(h.memory.importFrom(join(h.t.dir, 'fehlt.json')))).code).toBe('NOT_FOUND');
    expect((await rejection(h.memory.importFrom(h.t.dir))).code).toBe('VALIDATION');
    expect((await rejection(h.memory.importFrom(''))).code).toBe('VALIDATION');
    // A UTF-8 BOM is accepted.
    const bom = write('d.json', `﻿${JSON.stringify({ format: MEMORY_EXPORT_FORMAT, version: 1, exportedAt: 1, entries: [] })}`);
    expect(await h.memory.importFrom(bom)).toEqual({ imported: 0, skipped: 0 });
  });

  it('refuses imports while memory is disabled', async () => {
    const h = harness();
    const exported = await h.memory.exportTo(undefined);
    h.t.core.settings.update({ memory: { enabled: false } });
    const err = await rejection(h.memory.importFrom(exported.path));
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toContain('Gedächtnis ist deaktiviert');
  });

  it('cancels between chunks without storing anything', async () => {
    const src = harness();
    for (let i = 0; i < 10; i++) src.memory.add({ projectId: null, kind: 'insight', title: `Eintrag ${i}`, content: '' }, 'user');
    const exported = await src.memory.exportTo(null);
    const dst = harness(undefined, { chunkSize: 2 });
    const ac = new AbortController();
    const progress: Array<number | null> = [];
    const err = await rejection(
      dst.memory.importFrom(exported.path, {
        signal: ac.signal,
        onProgress: (p) => {
          progress.push(p);
          if (progress.length === 3) ac.abort();
        },
      }),
    );
    expect(err.code).toBe('CANCELLED');
    expect(dst.memory.list()).toEqual([]);
    expect(dst.events).toEqual([]);
  });

  it('emits the events of large imports in chunks', async () => {
    const src = harness();
    for (let i = 0; i < 250; i++) src.memory.add({ projectId: null, kind: 'insight', title: `Wissen ${i}`, content: '' }, 'user');
    const exported = await src.memory.exportTo(null);
    const dst = harness();
    expect(await dst.memory.importFrom(exported.path)).toEqual({ imported: 250, skipped: 0 });
    expect(dst.events).toHaveLength(250);
  });
});
