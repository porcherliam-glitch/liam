// Tests of the MemoryService core: add (redaction, secret rejection, source rules, de-duplication), update, delete,
// clear, list/search projectId semantics, FTS5 search (prefix, OR, bm25, snippet, German umlaut variants), the LIKE
// fallback, FTS repair and latestNextStep. Real SQLite (temp data dir) + a hand-written ProjectService fake.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MemoryEntry } from '@shared/schemas';
import { NovaError } from '../core/errors';
import { REDACTED } from '../core/redact';
import { memoryHarness, type MemoryHarness } from './test-support';

let h: MemoryHarness;
afterEach(() => h?.cleanup());

function novaError(fn: () => unknown): NovaError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(NovaError);
    return e as NovaError;
  }
  throw new Error('expected a NovaError');
}

function rowCount(): number {
  return Number(h.t.core.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM memory_entries')!.n);
}

function setMemory(patch: Record<string, unknown>): void {
  h.t.core.settings.update({ memory: patch });
}

describe('add', () => {
  it('stores a user entry with normalised fields and emits memory.updated', () => {
    h = memoryHarness();
    h.setClock(1_700_000_123_000);
    const e = h.memory.add(
      { projectId: 'prj_a', kind: 'decision', title: '  Canvas   statt DOM ', content: 'Wir zeichnen alles\r\nauf ein Canvas.  ', tags: ['UI', 'ui', ' render ', ''], taskId: 'task_1' },
      'user',
    );
    expect(e).toMatchObject({
      projectId: 'prj_a',
      kind: 'decision',
      title: 'Canvas statt DOM',
      content: 'Wir zeichnen alles\nauf ein Canvas.',
      tags: ['UI', 'render'],
      source: 'user',
      shareable: false,
      taskId: 'task_1',
      createdAt: 1_700_000_123_000,
      updatedAt: 1_700_000_123_000,
    });
    expect(e.id).toMatch(/^mem_/);
    expect(h.events).toEqual([e]);
    expect(h.memory.list({ projectId: 'prj_a' })).toEqual([e]);
  });

  it('accepts global knowledge base entries (projectId null)', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: null, kind: 'insight', title: 'Kleine Commits', content: 'Ein Commit pro Aufgabe.', shareable: true }, 'user');
    expect(e.projectId).toBeNull();
    expect(e.shareable).toBe(true);
  });

  it('redacts secrets inside longer texts and keeps the rest', () => {
    h = memoryHarness();
    const e = h.memory.add(
      {
        projectId: 'prj_a',
        kind: 'note',
        title: 'Testzugang zur Bezahl-API',
        content: 'Für die Tests verwendet der Client api_key=abcdef123456 gegen die Sandbox, die Produktion hat einen eigenen Zugang.',
      },
      'user',
    );
    expect(e.content).toBe(`Für die Tests verwendet der Client api_key=${REDACTED} gegen die Sandbox, die Produktion hat einen eigenen Zugang.`);
    expect(JSON.stringify(h.t.core.db.all('SELECT * FROM memory_entries'))).not.toContain('abcdef123456');
  });

  it('rejects entries that are mainly a credential (VALIDATION, German, nothing stored)', () => {
    h = memoryHarness();
    for (const content of ['OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456', 'Das Passwort lautet hunter2', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789']) {
      const err = novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Zugang', content }, 'agent'));
      expect(err.code).toBe('VALIDATION');
      expect(err.message).toContain('Zugangsdaten');
    }
    const titleErr = novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'sk-ant-abcdefghijklmnopqrstuvwxyz', content: 'Hinweis' }, 'user'));
    expect(titleErr.code).toBe('VALIDATION');
    expect(rowCount()).toBe(0);
    expect(h.events).toEqual([]);
  });

  it('drops tags that contain a credential', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Tags', content: 'x', tags: ['ok', 'token=abcdef123456'] }, 'user');
    expect(e.tags).toEqual(['ok']);
  });

  it('validates input with German messages', () => {
    h = memoryHarness();
    expect(novaError(() => h.memory.add({ projectId: 'prj_x', kind: 'note', title: 'T', content: '' }, 'user')).code).toBe('NOT_FOUND');
    expect(novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: '   ', content: '' }, 'user')).message).toBe('Bitte einen Titel angeben.');
    expect(novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'quatsch' as never, title: 'T', content: '' }, 'user')).code).toBe('VALIDATION');
    expect(novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'T', content: 'x'.repeat(20001) }, 'user')).code).toBe('VALIDATION');
    expect(novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 't'.repeat(301), content: '' }, 'user')).code).toBe('VALIDATION');
    expect(novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'T', content: '' }, 'robot' as never)).code).toBe('VALIDATION');
    expect(rowCount()).toBe(0);
  });

  it('throws VALIDATION "Gedächtnis ist deaktiviert" for every source when memory is disabled', () => {
    h = memoryHarness();
    setMemory({ enabled: false });
    for (const source of ['user', 'agent', 'system'] as const) {
      const err = novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'T', content: 'x' }, source));
      expect(err.code).toBe('VALIDATION');
      expect(err.message).toContain('Gedächtnis ist deaktiviert');
    }
    expect(rowCount()).toBe(0);
  });

  it('blocks agent writes when agentsMayWrite is off but still accepts user/system entries', () => {
    h = memoryHarness();
    setMemory({ agentsMayWrite: false });
    const err = novaError(() => h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'T', content: 'x' }, 'agent'));
    expect(err.code).toBe('VALIDATION');
    expect(err.message).toContain('Agenten');
    expect(h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Vom System', content: 'x' }, 'system').source).toBe('system');
    expect(h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Vom Benutzer', content: 'x' }, 'user').source).toBe('user');
  });

  it('makes agent insights shareable only when autoShareAgentInsights is on', () => {
    h = memoryHarness();
    const off = h.memory.add({ projectId: 'prj_a', kind: 'insight', title: 'Insight 1', content: 'a', shareable: true }, 'agent');
    expect(off.shareable).toBe(false);
    setMemory({ autoShareAgentInsights: true });
    expect(h.memory.add({ projectId: 'prj_a', kind: 'insight', title: 'Insight 2', content: 'b' }, 'agent').shareable).toBe(true);
    expect(h.memory.add({ projectId: 'prj_a', kind: 'insight', title: 'Insight 3', content: 'c', shareable: false }, 'agent').shareable).toBe(false);
    // Non-insights of agents are never shareable.
    expect(h.memory.add({ projectId: 'prj_a', kind: 'decision', title: 'Entscheidung', content: 'd', shareable: true }, 'agent').shareable).toBe(false);
    // User and system keep the requested flag for every kind.
    expect(h.memory.add({ projectId: 'prj_a', kind: 'convention', title: 'Konvention', content: 'e', shareable: true }, 'user').shareable).toBe(true);
    expect(h.memory.add({ projectId: 'prj_a', kind: 'insight', title: 'System', content: 'f' }, 'system').shareable).toBe(false);
  });

  it('de-duplicates exact repeats: same id, merged tags, refreshed updatedAt', () => {
    h = memoryHarness();
    h.setClock(1000);
    const first = h.memory.add({ projectId: 'prj_a', kind: 'bug', title: 'Absturz beim Laden', content: 'Leere Datei', tags: ['laden'] }, 'agent');
    h.setClock(2000);
    const second = h.memory.add({ projectId: 'prj_a', kind: 'bug', title: 'Absturz beim Laden', content: 'Leere Datei', tags: ['datei'] }, 'agent');
    expect(second.id).toBe(first.id);
    expect(second.tags).toEqual(['laden', 'datei']);
    expect(second.createdAt).toBe(1000);
    expect(second.updatedAt).toBe(2000);
    expect(rowCount()).toBe(1);
    // A different scope is not a duplicate.
    expect(h.memory.add({ projectId: 'prj_b', kind: 'bug', title: 'Absturz beim Laden', content: 'Leere Datei' }, 'agent').id).not.toBe(first.id);
    expect(h.events).toHaveLength(3);
  });
});

describe('update / delete / clear', () => {
  it('updates only the given fields, sanitises them and emits the new entry', () => {
    h = memoryHarness();
    h.setClock(1000);
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Alt', content: 'Alter Inhalt', tags: ['a'] }, 'agent');
    h.setClock(5000);
    const u = h.memory.update(e.id, { title: ' Neu ', kind: 'decision', shareable: true });
    expect(u).toMatchObject({ id: e.id, title: 'Neu', content: 'Alter Inhalt', tags: ['a'], kind: 'decision', shareable: true, source: 'agent', createdAt: 1000, updatedAt: 5000 });
    expect(h.events.at(-1)).toEqual(u);
    expect(h.memory.update(e.id, { content: `Mit Geheimnis: token=abcdef123456 und mehr erklärender Text dazu.` }).content).toContain(REDACTED);
    expect(novaError(() => h.memory.update(e.id, { content: 'Kennwort: geheim123' })).code).toBe('VALIDATION');
  });

  it('returns the unchanged entry without an event when nothing changed', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Gleich', content: 'x', tags: ['t'] }, 'user');
    h.events.length = 0;
    expect(h.memory.update(e.id, { title: 'Gleich', tags: ['t'] })).toEqual(e);
    expect(h.events).toEqual([]);
  });

  it('keeps update, delete and clear available while memory is disabled', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'T', content: 'x' }, 'user');
    setMemory({ enabled: false });
    expect(h.memory.update(e.id, { title: 'Korrigiert' }).title).toBe('Korrigiert');
    expect(h.memory.list({ projectId: 'prj_a' })).toHaveLength(1);
    h.memory.delete(e.id);
    expect(h.memory.list()).toEqual([]);
  });

  it('delete emits {id, deleted, projectId}; unknown ids are NOT_FOUND', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_b', kind: 'note', title: 'Weg', content: '' }, 'user');
    h.memory.delete(e.id);
    expect(h.events.at(-1)).toEqual({ id: e.id, deleted: true, projectId: 'prj_b' });
    expect(novaError(() => h.memory.delete(e.id)).code).toBe('NOT_FOUND');
    expect(novaError(() => h.memory.update('mem_missing', { title: 'x' })).code).toBe('NOT_FOUND');
  });

  it('clear deletes one scope and emits exactly one {cleared:true} event', () => {
    h = memoryHarness();
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'A1', content: '' }, 'user');
    h.memory.add({ projectId: 'prj_a', kind: 'insight', title: 'A2', content: '', shareable: true }, 'user');
    h.memory.add({ projectId: 'prj_b', kind: 'note', title: 'B1', content: '' }, 'user');
    h.memory.add({ projectId: null, kind: 'insight', title: 'G1', content: '' }, 'user');
    h.events.length = 0;
    expect(h.memory.clear('prj_a')).toBe(2);
    expect(h.events).toEqual([{ projectId: 'prj_a', cleared: true, count: 2 }]);
    expect(h.memory.clear(null)).toBe(1);
    expect(h.events.at(-1)).toEqual({ projectId: null, cleared: true, count: 1 });
    expect(h.memory.list().map((e) => e.title)).toEqual(['B1']);
    expect(h.memory.clear('prj_a')).toBe(0);
    expect(h.events).toHaveLength(3);
  });
});

describe('list', () => {
  function seed(): void {
    let ts = 1000;
    const add = (projectId: string | null, kind: MemoryEntry['kind'], title: string, shareable = false) => {
      h.setClock((ts += 1000));
      h.memory.add({ projectId, kind, title, content: '', shareable }, 'user');
    };
    add('prj_a', 'goal', 'A-Ziel');
    add('prj_a', 'note', 'A-Notiz');
    add('prj_b', 'note', 'B-Notiz');
    add(null, 'insight', 'G-geteilt', true);
    add(null, 'note', 'G-privat');
  }

  it('applies the projectId semantics: undefined = all, null = global, string = that project', () => {
    h = memoryHarness();
    seed();
    expect(h.memory.list().map((e) => e.title)).toEqual(['G-privat', 'G-geteilt', 'B-Notiz', 'A-Notiz', 'A-Ziel']);
    expect(h.memory.list({ projectId: null }).map((e) => e.title)).toEqual(['G-privat', 'G-geteilt']);
    expect(h.memory.list({ projectId: 'prj_a' }).map((e) => e.title)).toEqual(['A-Notiz', 'A-Ziel']);
    expect(h.memory.list({ projectId: 'prj_a', kind: 'goal' }).map((e) => e.title)).toEqual(['A-Ziel']);
    expect(h.memory.list({ limit: 2 })).toHaveLength(2);
    expect(h.memory.list({ limit: 0 })).toEqual([]);
  });
});

describe('search', () => {
  it('uses FTS prefix terms with OR, ranks title matches first and returns snippets', () => {
    h = memoryHarness();
    const inTitle = h.memory.add({ projectId: 'prj_a', kind: 'decision', title: 'Spielstand speichern', content: 'Als JSON im lokalen Speicher.' }, 'user');
    const inContent = h.memory.add(
      { projectId: 'prj_a', kind: 'note', title: 'Menü', content: 'Das Hauptmenü bietet einen Knopf, der den Spielstand lädt, und einen für die Optionen.' },
      'user',
    );
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Grafik', content: 'Sprites werden vorab geladen.' }, 'user');
    // Prefix term: "Spielst" finds "Spielstand"; a title hit (weight 4) ranks above a content hit.
    const results = h.memory.search('Spielst', { projectId: 'prj_a' });
    expect(results.map((r) => r.id)).toEqual([inTitle.id, inContent.id]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
    expect(results[1].score).toBeGreaterThan(0);
    // Title-only hit → title snippet; content hit → content snippet; plain text without markers.
    expect(results[0].snippet).toBe('Spielstand speichern');
    expect(results[1].snippet).toContain('Spielstand');
    expect(results[1].snippet).not.toMatch(/[\u0002\u0003<>]/);
    // OR of terms: an entry matching both terms outranks entries matching one.
    const both = h.memory.search('Spielst Optionen', { projectId: 'prj_a' });
    expect(both.map((r) => r.id)).toEqual([inContent.id, inTitle.id]);
  });

  it('applies projectId/includeGlobal semantics and never returns other projects for a project search', () => {
    h = memoryHarness();
    const own = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Kollision eigene', content: 'Kollisionserkennung' }, 'user');
    const other = h.memory.add({ projectId: 'prj_b', kind: 'insight', title: 'Kollision fremd', content: 'Kollisionserkennung', shareable: true }, 'user');
    const globalShared = h.memory.add({ projectId: null, kind: 'insight', title: 'Kollision geteilt', content: 'Kollisionserkennung', shareable: true }, 'user');
    const globalPrivate = h.memory.add({ projectId: null, kind: 'note', title: 'Kollision privat', content: 'Kollisionserkennung' }, 'user');
    const ids = (r: { id: string }[]) => r.map((x) => x.id).sort();
    expect(ids(h.memory.search('Kollision', { projectId: 'prj_a' }))).toEqual([own.id, globalShared.id].sort());
    expect(ids(h.memory.search('Kollision', { projectId: 'prj_a', includeGlobal: false }))).toEqual([own.id]);
    expect(ids(h.memory.search('Kollision', { projectId: null }))).toEqual([globalShared.id, globalPrivate.id].sort());
    expect(ids(h.memory.search('Kollision'))).toEqual([own.id, other.id, globalShared.id, globalPrivate.id].sort());
    expect(ids(h.memory.search('Kollision', { includeGlobal: false }))).toEqual([own.id, other.id].sort());
  });

  it('finds German umlaut spellings (ä/ae, ö/oe, ü/ue, ß/ss) in both directions', () => {
    h = memoryHarness();
    const spellings = ['Größe', 'Grösse', 'Groesse', 'Große', 'Grosse'];
    const byTitle = new Map(spellings.map((w) => [h.memory.add({ projectId: 'prj_a', kind: 'note', title: `${w} des Spielfelds`, content: '' }, 'user').id, w]));
    const found = (q: string) => h.memory.search(q, { projectId: 'prj_a' }).map((r) => byTitle.get(r.id)).sort();
    expect(found('Größe')).toEqual([...spellings].sort());
    expect(found('groesse')).toEqual([...spellings].sort());
    expect(found('GRÖSSE')).toEqual([...spellings].sort());
    // Documented limit: an unmarked "Grosse" cannot know that the "o" stands for "ö" – it misses only "Groesse".
    expect(found('Grosse')).toEqual(['Grosse', 'Grösse', 'Große', 'Größe'].sort());

    const uebung = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Übungsmodus', content: '' }, 'user');
    expect(h.memory.search('Uebung', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([uebung.id]);
    const cafe = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Café-Szene', content: '' }, 'user');
    expect(h.memory.search('cafe', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([cafe.id]);
  });

  it('treats FTS syntax in user queries as plain words', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'NEAR und AND', content: 'Operatoren' }, 'user');
    for (const q of ['AND OR NOT', '"unbalanced', 'title:near(', '*', 'NEAR(a b, 2)', "a'b\"c"]) {
      expect(() => h.memory.search(q, { projectId: 'prj_a' })).not.toThrow();
    }
    expect(h.memory.search('near AND', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([e.id]);
  });

  it('falls back to LIKE for symbol-only queries and for parts of compound words', () => {
    h = memoryHarness();
    const cpp = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Sprache', content: 'Das Plugin ist in C++ geschrieben.' }, 'user');
    const compound = h.memory.add({ projectId: 'prj_a', kind: 'bug', title: 'Datenbankverbindung bricht ab', content: 'Nach 30 s ohne Anfrage.' }, 'user');
    expect(h.memory.search('C++', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([cpp.id]);
    const r = h.memory.search('verbindung', { projectId: 'prj_a' });
    expect(r.map((x) => x.id)).toEqual([compound.id]);
    expect(r[0].score).toBeGreaterThan(0);
    expect(r[0].score).toBeLessThanOrEqual(0.5);
    expect(r[0].snippet).toContain('Datenbankverbindung');
  });

  it('escapes LIKE wildcards', () => {
    h = memoryHarness();
    const pct = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Rabatt', content: 'Es gibt 100% Rabatt.' }, 'user');
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Zahl', content: 'Es gibt 1000 Punkte.' }, 'user');
    expect(h.memory.search('%', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([pct.id]);
    expect(h.memory.search('_', { projectId: 'prj_a' })).toEqual([]);
  });

  it('returns [] for empty queries and limit 0', () => {
    h = memoryHarness();
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'x', content: '' }, 'user');
    expect(h.memory.search('   ')).toEqual([]);
    expect(h.memory.search('x', { limit: 0 })).toEqual([]);
  });

  it('rebuilds a broken FTS index once and answers from it', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Wegfindung', content: 'A*-Algorithmus' }, 'user');
    const db = h.t.core.db;
    const realAll = db.all.bind(db);
    let failures = 0;
    vi.spyOn(db, 'all').mockImplementation(((sql: string, params?: never) => {
      if (sql.includes('memory_fts MATCH') && failures === 0) {
        failures++;
        throw new Error('database disk image is malformed');
      }
      return realAll(sql, params);
    }) as typeof db.all);
    const run = vi.spyOn(db, 'run');
    expect(h.memory.search('Wegfindung', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([e.id]);
    expect(failures).toBe(1);
    expect(run.mock.calls.some(([sql]) => String(sql).includes("'rebuild'"))).toBe(true);
  });

  it('uses the LIKE search when the FTS table is unusable', () => {
    h = memoryHarness();
    const e = h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Pfadsuche', content: 'Breitensuche' }, 'user');
    h.t.core.db.exec('DROP TRIGGER memory_ai; DROP TRIGGER memory_ad; DROP TRIGGER memory_au; DROP TABLE memory_fts;');
    expect(h.memory.search('Pfadsuche', { projectId: 'prj_a' }).map((r) => r.id)).toEqual([e.id]);
  });
});

describe('latestNextStep', () => {
  it('returns the newest next_step entry of the project (null when none or disabled)', () => {
    h = memoryHarness();
    expect(h.memory.latestNextStep('prj_a')).toBeNull();
    h.setClock(1000);
    h.memory.add({ projectId: 'prj_a', kind: 'next_step', title: 'Erst', content: '' }, 'system');
    h.setClock(2000);
    const latest = h.memory.add({ projectId: 'prj_a', kind: 'next_step', title: 'Dann Highscore', content: '' }, 'system');
    h.memory.add({ projectId: 'prj_b', kind: 'next_step', title: 'Anderes Projekt', content: '' }, 'system');
    h.setClock(3000);
    h.memory.add({ projectId: 'prj_a', kind: 'note', title: 'Keine Aufgabe', content: '' }, 'system');
    expect(h.memory.latestNextStep('prj_a')).toEqual(latest);
    setMemory({ enabled: false });
    expect(h.memory.latestNextStep('prj_a')).toBeNull();
  });
});
