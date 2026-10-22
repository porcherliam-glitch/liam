// Tests of contextFor (agent prompt context: core entries, query matches, shared knowledge, limits, anonymisation,
// cross-project isolation, redaction) and removeProject (deletes private entries, anonymises the shared ones).
import { afterEach, describe, expect, it } from 'vitest';
import type { MemoryEntry } from '@shared/schemas';
import { REDACTED, _clearRegisteredSecrets, registerSecret } from '../core/redact';
import { NAME_PLACEHOLDER, PATH_PLACEHOLDER } from './anonymize';
import { createMemoryService } from './memory-service';
import { memoryHarness, type MemoryHarness } from './test-support';

let h: MemoryHarness;
afterEach(() => {
  h?.cleanup();
  _clearRegisteredSecrets();
});

let ts = 1_000_000;
function add(
  projectId: string | null,
  kind: MemoryEntry['kind'],
  title: string,
  content = '',
  opts: { shareable?: boolean; source?: MemoryEntry['source'] } = {},
): MemoryEntry {
  h.setClock((ts += 1000));
  return h.memory.add({ projectId, kind, title, content, shareable: opts.shareable }, opts.source ?? 'user');
}

const titles = (entries: MemoryEntry[]) => entries.map((e) => e.title);

describe('contextFor', () => {
  it('returns goals, requirements, conventions and decisions of the project newest first', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel: Weltraumspiel');
    add('prj_a', 'note', 'Notiz ohne Bezug');
    add('prj_a', 'requirement', 'Anforderung: läuft im Browser');
    add('prj_a', 'convention', 'Konvention: ES-Module');
    add('prj_a', 'decision', 'Entscheidung: Canvas');
    add('prj_b', 'goal', 'Fremdes Ziel');
    expect(titles(h.memory.contextFor({ projectId: 'prj_a', query: '' }))).toEqual([
      'Entscheidung: Canvas',
      'Konvention: ES-Module',
      'Anforderung: läuft im Browser',
      'Ziel: Weltraumspiel',
    ]);
  });

  it('appends FTS matches of the query from the project after the core entries', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel: Weltraumspiel');
    add('prj_a', 'bug', 'Kollision mit Asteroiden ungenau', 'Hitbox zu groß');
    add('prj_a', 'attempt', 'Versuch: Kreis-Hitbox', 'Hat die Kollision verbessert');
    add('prj_a', 'test_result', 'Tests grün', 'Alle 12 Tests bestanden');
    add('prj_b', 'bug', 'Kollision im anderen Projekt');
    const ctx = h.memory.contextFor({ projectId: 'prj_a', query: 'Kollision der Asteroiden beheben' });
    expect(titles(ctx)[0]).toBe('Ziel: Weltraumspiel');
    expect(titles(ctx).slice(1).sort()).toEqual(['Kollision mit Asteroiden ungenau', 'Versuch: Kreis-Hitbox'].sort());
    expect(titles(ctx)).not.toContain('Kollision im anderen Projekt');
    expect(titles(ctx)).not.toContain('Tests grün');
  });

  it('adds shareable global entries and shareable insights of other projects – never their private entries', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel A');
    add(null, 'insight', 'Global geteilt', 'Kleine Commits helfen.', { shareable: true });
    add(null, 'note', 'Global privat', 'Nicht teilen.');
    add('prj_b', 'insight', 'Fremde Erkenntnis geteilt', 'Canvas skaliert mit devicePixelRatio.', { shareable: true });
    add('prj_b', 'insight', 'Fremde Erkenntnis privat', 'Intern.');
    add('prj_b', 'decision', 'Fremde Entscheidung geteilt', 'Vom Benutzer geteilt, aber keine Erkenntnis.', { shareable: true });
    add('prj_b', 'goal', 'Fremdes Ziel', 'Privat.');
    const ctx = titles(h.memory.contextFor({ projectId: 'prj_a', query: '' }));
    expect(ctx[0]).toBe('Ziel A');
    expect(ctx.slice(1).sort()).toEqual(['Fremde Erkenntnis geteilt', 'Global geteilt'].sort());
    // Same picture when the query matches the private entries.
    const matched = titles(h.memory.contextFor({ projectId: 'prj_a', query: 'Intern privat teilen Ziel Entscheidung' }));
    expect(matched).not.toContain('Fremde Erkenntnis privat');
    expect(matched).not.toContain('Global privat');
    expect(matched).not.toContain('Fremdes Ziel');
    expect(matched).not.toContain('Fremde Entscheidung geteilt');
  });

  it('puts query-matching shared knowledge before the newest non-matching shared entries', () => {
    h = memoryHarness();
    setMax(3);
    add(null, 'insight', 'Treffer: Spielschleife mit requestAnimationFrame', '', { shareable: true });
    add(null, 'insight', 'Neu, aber ohne Bezug 1', '', { shareable: true });
    add(null, 'insight', 'Neu, aber ohne Bezug 2', '', { shareable: true });
    add('prj_b', 'insight', 'Neueste fremde Erkenntnis', '', { shareable: true });
    expect(titles(h.memory.contextFor({ projectId: 'prj_a', query: 'requestAnimationFrame Spielschleife' }))).toEqual([
      'Treffer: Spielschleife mit requestAnimationFrame',
      'Neu, aber ohne Bezug 2',
      'Neu, aber ohne Bezug 1',
    ]);
  });

  it('includes no shared entries when useGlobalKnowledge is off', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel A');
    add(null, 'insight', 'Global geteilt', '', { shareable: true });
    add('prj_b', 'insight', 'Fremd geteilt', '', { shareable: true });
    h.t.core.settings.update({ memory: { useGlobalKnowledge: false } });
    expect(titles(h.memory.contextFor({ projectId: 'prj_a', query: 'geteilt' }))).toEqual(['Ziel A']);
  });

  it('returns [] when memory is disabled or the limit is 0', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel A');
    h.t.core.settings.update({ memory: { maxContextEntries: 0 } });
    expect(h.memory.contextFor({ projectId: 'prj_a', query: '' })).toEqual([]);
    h.t.core.settings.update({ memory: { maxContextEntries: 12, enabled: false } });
    expect(h.memory.contextFor({ projectId: 'prj_a', query: '' })).toEqual([]);
  });

  it('respects min(input.limit, maxContextEntries), keeps the goal and reserves slots for query matches', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel: Kassenbuch-App');
    for (let i = 1; i <= 10; i++) add('prj_a', 'decision', `Annahme ${i}`);
    add('prj_a', 'bug', 'Rundungsfehler bei Mehrwertsteuer', 'Beträge werden falsch gerundet.');
    setMax(4);
    const ctx = h.memory.contextFor({ projectId: 'prj_a', query: 'Mehrwertsteuer Rundung' });
    expect(ctx).toHaveLength(4);
    // 3 core entries (goal first by priority, shown newest first) + 1 reserved slot for the matching bug.
    expect(titles(ctx)).toEqual(['Annahme 10', 'Annahme 9', 'Ziel: Kassenbuch-App', 'Rundungsfehler bei Mehrwertsteuer']);
    setMax(12);
    expect(h.memory.contextFor({ projectId: 'prj_a', query: '', limit: 2 })).toHaveLength(2);
    expect(h.memory.contextFor({ projectId: 'prj_a', query: '', limit: 50 })).toHaveLength(11);
  });

  it('replaces paths and the source project name of other projects (POSIX)', () => {
    h = memoryHarness();
    add(
      'prj_b',
      'insight',
      'Kassenbuch: SQLite im WAL-Modus',
      'In Kassenbuch liegt die Datenbank unter /home/max/projekte/kassenbuch/data/kasse.db; Logs in /var/log/kasse.log und ~/kasse/tmp.',
      { shareable: true },
    );
    add(null, 'insight', 'Globale Notiz', 'Beispiel: /Users/erika/dev/app/README.md', { shareable: true });
    const ctx = h.memory.contextFor({ projectId: 'prj_a', query: 'SQLite' });
    const shared = ctx.find((e) => e.projectId === 'prj_b')!;
    expect(shared.title).toBe(`${NAME_PLACEHOLDER}: SQLite im WAL-Modus`);
    expect(shared.content).toBe(
      `In ${NAME_PLACEHOLDER} liegt die Datenbank unter ${PATH_PLACEHOLDER}/data/kasse.db; Logs in ${PATH_PLACEHOLDER} und ${PATH_PLACEHOLDER}.`,
    );
    expect(ctx.find((e) => e.projectId === null)!.content).toBe(`Beispiel: ${PATH_PLACEHOLDER}`);
    // The stored entry itself is unchanged (anonymisation happens on the way into the other project's context).
    expect(h.memory.list({ projectId: 'prj_b' })[0].content).toContain('/home/max/projekte/kassenbuch/data/kasse.db');
  });

  it('replaces Windows paths case-insensitively, including spaces and JSON-escaped backslashes', () => {
    h = memoryHarness([
      { id: 'prj_a', name: 'Sternenjäger', path: 'C:\\Users\\Max Mustermann\\NOVA Projekte\\Sternenjäger' },
      { id: 'prj_b', name: 'Mein Kassenbuch', path: 'C:\\Users\\Max Mustermann\\NOVA Projekte\\Mein Kassenbuch' },
    ]);
    h.t.core.platform = 'win32';
    add(
      'prj_b',
      'insight',
      'Build-Ausgabe',
      'In mein kassenbuch landet der Build in c:\\users\\max mustermann\\nova projekte\\mein kassenbuch\\dist\\app.exe, ' +
        'die Konfiguration in "C:\\\\Users\\\\Max Mustermann\\\\NOVA Projekte\\\\Mein Kassenbuch\\\\config.json" und Node in C:\\Program Files\\nodejs\\node.exe.',
      { shareable: true },
    );
    const shared = h.memory.contextFor({ projectId: 'prj_a', query: 'Build' }).find((e) => e.projectId === 'prj_b')!;
    expect(shared.content).toBe(
      `In ${NAME_PLACEHOLDER} landet der Build in ${PATH_PLACEHOLDER}\\dist\\app.exe, die Konfiguration in "${PATH_PLACEHOLDER}\\\\config.json" und Node in ${PATH_PLACEHOLDER}.`,
    );
    expect(shared.content).not.toMatch(/Mustermann|Kassenbuch/i);
  });

  it('redacts secrets that were registered after the entry was stored', () => {
    h = memoryHarness();
    add('prj_a', 'convention', 'Testserver', 'Der Testserver nutzt den Schlüssel QwErTy-778899-zz für die Anmeldung im Staging.');
    registerSecret('QwErTy-778899-zz');
    const [entry] = h.memory.contextFor({ projectId: 'prj_a', query: '' });
    expect(entry.content).toContain(REDACTED);
    expect(entry.content).not.toContain('QwErTy-778899-zz');
  });

  it('uses project names/paths learned from project.updated events for projects the ProjectService no longer returns', () => {
    h = memoryHarness([{ id: 'prj_a', name: 'Sternenjäger', path: '/home/max/projekte/sternenjaeger' }]);
    const ghost = h.projects.add({ id: 'prj_ghost', name: 'Geisterhaus', path: '/home/max/projekte/geisterhaus' });
    add('prj_ghost', 'insight', 'Erkenntnis', 'Siehe /home/max/projekte/spukschloss/src/main.js im Spukschloss.', { shareable: true });
    // Renamed and moved; afterwards the ProjectService no longer returns it.
    h.t.core.bus.emit('project.updated', { ...ghost, name: 'Spukschloss', path: '/home/max/projekte/spukschloss' });
    h.projects.drop('prj_ghost');
    const shared = h.memory.contextFor({ projectId: 'prj_a', query: '' }).find((e) => e.projectId === 'prj_ghost')!;
    // The known root keeps the project-relative tail; generic replacement alone would swallow the whole path.
    expect(shared.content).toBe(`Siehe ${PATH_PLACEHOLDER}/src/main.js im ${NAME_PLACEHOLDER}.`);
  });
});

describe('removeProject', () => {
  it('deletes only the private entries of the project and emits one event', () => {
    h = memoryHarness();
    add('prj_a', 'goal', 'Ziel A');
    add('prj_a', 'note', 'Notiz A');
    const shared = add('prj_a', 'insight', 'Erkenntnis A', 'Allgemein nützlich.', { shareable: true });
    add('prj_b', 'note', 'Notiz B');
    add(null, 'note', 'Global');
    h.events.length = 0;
    expect(h.memory.removeProject('prj_a')).toBe(2);
    expect(h.events).toEqual([{ projectId: 'prj_a', cleared: true, count: 2 }]);
    expect(titles(h.memory.list()).sort()).toEqual(['Erkenntnis A', 'Global', 'Notiz B'].sort());
    expect(h.memory.list({ projectId: 'prj_a' }).map((e) => e.id)).toEqual([shared.id]);
    expect(h.memory.removeProject('prj_a')).toBe(0);
    expect(h.events).toHaveLength(1);
  });

  it('anonymises the remaining shared entries although the project row is already gone', () => {
    h = memoryHarness();
    // First call after "daemon start": warms the project cache.
    expect(h.memory.list()).toEqual([]);
    const shared = add('prj_b', 'insight', 'Kassenbuch nutzt WAL', 'Die Datei /home/max/projekte/kassenbuch/kasse.db liegt im Kassenbuch-Ordner.', { shareable: true });
    h.projects.drop('prj_b'); // ProjectService deletes its row before calling memory.removeProject
    h.memory.removeProject('prj_b');
    const stored = h.memory.list({ projectId: 'prj_b' })[0];
    expect(stored.id).toBe(shared.id);
    expect(stored.title).toBe(`${NAME_PLACEHOLDER} nutzt WAL`);
    expect(stored.content).toBe(`Die Datei ${PATH_PLACEHOLDER}/kasse.db liegt im ${NAME_PLACEHOLDER}-Ordner.`);
    // It stays useful knowledge for the other projects.
    const ctx = h.memory.contextFor({ projectId: 'prj_a', query: 'WAL' });
    expect(ctx.map((e) => e.id)).toContain(shared.id);
  });

  it('warms the project cache lazily on the first call after a restart (needed because the row is deleted first)', () => {
    h = memoryHarness();
    const shared = add('prj_b', 'insight', 'Im Kassenbuch gelernt', 'Kassenbuch: Beträge in Cent speichern.', { shareable: true });
    // "Daemon restart": new service instances on the same database with empty caches.
    const warm = createMemoryService(h.s);
    expect(warm.list({ projectId: 'prj_a' })).toEqual([]); // first call → warm-up via s.projects.list
    h.projects.drop('prj_b');
    // Negative control: an instance whose very first call is removeProject cannot know the removed project anymore.
    const cold = createMemoryService(h.s);
    expect(cold.removeProject('prj_b')).toBe(0);
    expect(h.memory.list({ projectId: 'prj_b' })[0].content).toBe('Kassenbuch: Beträge in Cent speichern.');
    expect(warm.removeProject('prj_b')).toBe(0);
    const stored = h.memory.list({ projectId: 'prj_b' })[0];
    expect(stored.id).toBe(shared.id);
    expect(stored.title).toBe(`Im ${NAME_PLACEHOLDER} gelernt`);
    expect(stored.content).toBe(`${NAME_PLACEHOLDER}: Beträge in Cent speichern.`);
  });

  it('still knows the project when project.removed is emitted before removeProject is called', () => {
    h = memoryHarness();
    add('prj_b', 'insight', 'Kassenbuch-Wissen', 'Gilt für Kassenbuch.', { shareable: true });
    h.projects.drop('prj_b');
    h.t.core.bus.emit('project.removed', { id: 'prj_b' });
    h.memory.removeProject('prj_b');
    expect(h.memory.list({ projectId: 'prj_b' })[0].content).toBe(`Gilt für ${NAME_PLACEHOLDER}.`);
  });

  it('ignores invalid project ids', () => {
    h = memoryHarness();
    expect(h.memory.removeProject('')).toBe(0);
    expect(h.events).toEqual([]);
  });
});

function setMax(n: number): void {
  h.t.core.settings.update({ memory: { maxContextEntries: n } });
}
