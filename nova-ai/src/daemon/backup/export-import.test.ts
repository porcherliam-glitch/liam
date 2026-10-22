// Export/import: format v1 without secrets, export targets, a full round trip into a fresh data dir, and every import
// rule (existing ids / path_key collisions / unsafe or overlapping folders skipped with German warnings, projects
// stopped without allowedCommands, task status normalization, dependency/parent filtering, memory redaction, providers not
// approved and without secret/unsupported options, non-local providers always paid, permissions/network/budgets and
// the update address never imported, invalid items skipped, one transaction with rollback, events only after the commit).
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnyNovaEvent } from '@shared/events';
import { backupHarness, defaultConfig, type BackupHarness } from './test-support';
import { unsafeProjectRoot } from './export-import';

const harnesses: BackupHarness[] = [];
afterEach(() => {
  for (const x of harnesses.splice(0)) x.cleanup();
});
function harness(): BackupHarness {
  const h = backupHarness();
  harnesses.push(h);
  return h;
}

function seed(h: BackupHarness): { root: string } {
  const root = join(h.scratch, 'spiel');
  mkdirSync(root);
  h.addProject({ id: 'prj_a', name: 'Spiel', path: root, config: { ...defaultConfig(), allowedCommands: ['rm -rf'] } });
  h.addTask({ id: 'task_1', projectId: 'prj_a', title: 'Fertig', status: 'done' });
  h.addTask({
    id: 'task_2',
    projectId: 'prj_a',
    title: 'Läuft',
    status: 'running',
    blocker: 'x',
    startRequested: true,
    dependsOn: ['task_1', 'task_gone'],
    description: 'Nutze OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456 zum Testen',
  });
  h.addTask({ id: 'task_3', projectId: 'prj_a', title: 'Wartet', status: 'waiting_approval', parentId: 'task_gone' });
  h.addTask({ id: 'task_4', projectId: 'prj_a', title: 'Pausiert', status: 'paused', parentId: 'task_1' });
  h.addMemory({ id: 'mem_1', projectId: 'prj_a', title: 'Ziel', content: 'Ein Spiel bauen' });
  h.addMemory({ id: 'mem_g', projectId: null, title: 'Global', content: 'token: ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  h.addProvider({ id: 'openrouter', name: 'OpenRouter', paid: true, approved: true, options: { organization: 'org-1', apiKey: 'sk-should-never-leave' } });
  h.addProvider({ id: 'ollama-local', type: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434', paid: false, approved: true });
  h.t.core.settings.update({ agents: { maxParallelAgents: 4 }, permissions: { approveDeletes: false }, network: { allowAgentNetwork: false }, budgets: { dailyLimitUsd: 50 } });
  return { root };
}

describe('exportData', () => {
  it('writes format v1 with all sections, registers the file and never contains secrets', async () => {
    const h = harness();
    seed(h);
    const progress: (number | null)[] = [];
    const r = await h.backups.exportData(['projects', 'tasks', 'settings', 'memory', 'providers'], undefined, { onProgress: (p) => progress.push(p) });
    expect(r.counts).toEqual({ projects: 1, tasks: 4, settings: 13, memory: 2, providers: 2 });
    expect(r.path.startsWith(h.t.core.paths.exports)).toBe(true);
    const text = readFileSync(r.path, 'utf8');
    const data = JSON.parse(text);
    expect(data).toMatchObject({ format: 'nova-export', version: 1, appVersion: h.t.core.version });
    expect(typeof data.exportedAt).toBe('number');
    expect(text).not.toContain('sk-should-never-leave');
    expect(text).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(text).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    expect(text).not.toContain('hasApiKey');
    expect(data.sections.providers.find((p: { id: string }) => p.id === 'openrouter').options).toEqual({ organization: 'org-1' });
    expect(data.sections.projects[0]).not.toHaveProperty('progress'); // summary fields stripped
    expect(h.backups.list().find((b) => b.path === r.path)?.kind).toBe('export');
    expect(progress.length).toBeGreaterThan(0);
  });

  it('supports a target folder or file and validates the path', async () => {
    const h = harness();
    seed(h);
    const dir = join(h.scratch, 'out');
    mkdirSync(dir);
    const inDir = await h.backups.exportData(['memory'], dir);
    expect(inDir.path.startsWith(dir)).toBe(true);
    const file = join(dir, 'meine-daten.json');
    expect((await h.backups.exportData(['settings'], file)).path).toBe(file);
    expect(h.backups.list().some((b) => b.path === file)).toBe(false); // user files are not managed backups
    await expect(h.backups.exportData(['settings'], join(h.scratch, 'nope', 'x.json'))).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.exportData(['settings'], 'relativ.json')).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.exportData([] as never[])).rejects.toMatchObject({ code: 'VALIDATION' });
    const c = new AbortController();
    c.abort();
    await expect(h.backups.exportData(['settings'], undefined, { signal: c.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('importData', () => {
  it('round-trips into a fresh data dir applying every import rule', async () => {
    const src = harness();
    const { root } = seed(src);
    const exported = await src.backups.exportData(['projects', 'tasks', 'settings', 'memory', 'providers']);
    const dst = harness();
    dst.addProvider({ id: 'ollama-local', type: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434', paid: false, approved: true });
    const events: AnyNovaEvent[] = [];
    dst.t.core.bus.onAny((e) => events.push(e));
    const r = await dst.backups.importData(exported.path);
    expect(r.counts).toEqual({ projects: 1, tasks: 4, memory: 2, providers: 1, settings: 10, skipped: 1 });
    const project = dst.s.projects.get('prj_a')!;
    expect(project).toMatchObject({ path: root, workState: 'stopped', gitAvailable: false });
    expect(project.config.allowedCommands).toEqual([]);
    const t2 = dst.s.tasks.get('task_2')!;
    expect(t2).toMatchObject({ status: 'queued', blocker: null, startRequested: false, dependsOn: ['task_1'] });
    expect(t2.description).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz123456');
    expect(dst.s.tasks.get('task_3')).toMatchObject({ status: 'queued', parentId: null });
    expect(dst.s.tasks.get('task_4')).toMatchObject({ status: 'paused', parentId: 'task_1' });
    expect(dst.s.tasks.get('task_1')?.status).toBe('done');
    const provider = dst.s.providers.getConfig('openrouter')!;
    expect(provider).toMatchObject({ approved: false, paid: true, options: { organization: 'org-1' } });
    const settings = dst.t.core.settings.get();
    expect(settings.agents.maxParallelAgents).toBe(4);
    expect(settings.permissions.approveDeletes).toBe(true); // never imported
    expect(settings.network.allowAgentNetwork).toBe(true);
    expect(settings.budgets.dailyLimitUsd).toBe(0);
    expect(r.warnings.join('\n')).toMatch(/permissions.*nie importiert/);
    expect(r.warnings.join('\n')).toMatch(/erlaubten Befehle/);
    expect(r.warnings.join('\n')).toMatch(/Ollama.*bereits vorhanden/);
    expect(r.warnings.join('\n')).toMatch(/API-Schlüssel neu eingeben/);
    expect(r.warnings.join('\n')).toMatch(/Abhängigkeiten zu fehlenden Aufgaben/);
    expect(r.warnings.join('\n')).toMatch(/Wartet.*ohne übergeordnete Aufgabe/);
    // Events after the commit, git re-detected, folder watched.
    const types = events.map((e) => e.type);
    expect(types).toContain('project.updated');
    expect(types.filter((t) => t === 'task.updated')).toHaveLength(4);
    expect(types.filter((t) => t === 'memory.updated')).toHaveLength(2);
    expect(types).toContain('provider.updated');
    expect(dst.refreshed).toEqual(['prj_a']);
    expect(dst.watched).toEqual(['prj_a']);
    // Importing the same file again skips everything with warnings.
    const again = await dst.backups.importData(exported.path);
    expect(again.counts).toMatchObject({ projects: 0, tasks: 0, memory: 0, providers: 0 });
    expect(again.counts.skipped).toBe(1 + 4 + 2 + 2);
    expect(again.warnings.join('\n')).toMatch(/bereits vorhanden/);
  });

  it('skips path_key collisions, unsafe and overlapping folders, missing projects and invalid items', async () => {
    const h = harness();
    const existingRoot = join(h.scratch, 'vorhanden');
    mkdirSync(existingRoot);
    h.addProject({ id: 'prj_old', name: 'Alt', path: existingRoot });
    const project = (id: string, path: string) => ({
      id,
      name: id,
      description: '',
      path,
      kind: 'web',
      technologies: [],
      status: 'active',
      templateId: null,
      origin: 'open',
      config: defaultConfig(),
      workState: 'running',
      gitAvailable: true,
      createdAt: 1,
      updatedAt: 1,
    });
    const file = join(h.scratch, 'import.json');
    writeFileSync(
      file,
      JSON.stringify({
        format: 'nova-export',
        version: 1,
        exportedAt: 1,
        sections: {
          projects: [
            project('prj_same', existingRoot + '/'),
            project('prj_inside', join(existingRoot, 'sub')),
            project('prj_data', join(h.t.core.paths.root, 'x')),
            project('prj_root', '/'),
            project('prj_sys', '/etc/nova'),
            project('prj_ok', join(h.scratch, 'neu')),
            { id: 'broken' },
          ],
          tasks: [{ id: 'task_x', projectId: 'prj_missing', title: 'Waise' }],
          memory: [
            { id: 'mem_x', projectId: 'prj_missing', kind: 'note', title: 'Waise', content: 'x', tags: [], source: 'user', shareable: false, taskId: null, createdAt: 1, updatedAt: 1 },
          ],
          providers: [
            { id: 'plain-http', type: 'openai_compatible', name: 'Unsicher', baseUrl: 'http://api.example.com', enabled: true, paid: true, approved: true, options: {}, createdAt: 1, updatedAt: 1 },
            { id: 'Bad_ID', type: 'openai_compatible', name: 'Falsch', baseUrl: 'https://x.example.com', enabled: true, paid: true, approved: true, options: {}, createdAt: 1, updatedAt: 1 },
            { id: 'creds', type: 'openai_compatible', name: 'Creds', baseUrl: 'https://user:pw@x.example.com', enabled: true, paid: true, approved: true, options: {}, createdAt: 1, updatedAt: 1 },
          ],
          settings: { agents: { maxParallelAgents: 99 }, unknown: {} },
        },
      }),
    );
    const r = await h.backups.importData(file);
    expect(r.counts).toMatchObject({ projects: 1, tasks: 0, memory: 0, providers: 0, settings: 0 });
    const w = r.warnings.join('\n');
    expect(w).toMatch(/prj_same.*bereits als Projekt „Alt“/);
    expect(w).toMatch(/prj_inside.*überschneidet sich mit dem Projekt „Alt“/);
    expect(w).toMatch(/prj_data.*NOVA-Datenordner/);
    expect(w).toMatch(/prj_root.*Stammordner/);
    expect(w).toMatch(/prj_sys.*Systemordner/);
    expect(w).toMatch(/ungültige Daten/);
    expect(w).toMatch(/Waise.*Projekt ist nicht vorhanden/);
    expect(w).toMatch(/Unsicher.*https/);
    expect(w).toMatch(/Falsch.*ungültige Kennung/);
    expect(w).toMatch(/Creds.*Zugangsdaten/);
    expect(w).toMatch(/„agents“ sind ungültig/);
    expect(w).toMatch(/Unbekannter Einstellungsbereich „unknown“/);
    expect(w).toMatch(/existiert auf diesem PC nicht/); // prj_ok folder does not exist
    expect(h.t.core.settings.get().agents.maxParallelAgents).toBe(2);
  });

  it('treats non-local providers as paid, keeps only supported options and never imports the update address', async () => {
    const h = harness();
    const file = join(h.scratch, 'import.json');
    const provider = (id: string, name: string, baseUrl: string, options: Record<string, string>) => ({
      id,
      type: 'openai_compatible',
      name,
      baseUrl,
      enabled: true,
      paid: false,
      approved: true,
      options,
      createdAt: 1,
      updatedAt: 1,
    });
    writeFileSync(
      file,
      JSON.stringify({
        format: 'nova-export',
        version: 1,
        exportedAt: 1,
        sections: {
          providers: [
            provider('free-cloud', 'Gratis', 'https://api.example.com/v1', { organization: 'org-1', authHeader: 'api-key', maxConcurrent: '999', proxy: 'http://evil.example.com', apiKey: 'x' }),
            provider('lm-studio', 'LM Studio', 'http://127.0.0.1:1234/v1', { maxRequestsPerMinute: '60', organization: '' }),
          ],
          settings: { updates: { checkForUpdates: true, feedUrl: 'https://evil.example.com/feed.json' } },
        },
      }),
    );
    const r = await h.backups.importData(file);
    expect(r.counts).toMatchObject({ providers: 2, settings: 1, skipped: 0 });
    expect(h.s.providers.getConfig('free-cloud')).toMatchObject({ paid: true, approved: false, options: { organization: 'org-1', authHeader: 'api-key' } });
    expect(Object.keys(h.s.providers.getConfig('free-cloud')!.options).sort()).toEqual(['authHeader', 'organization']);
    expect(h.s.providers.getConfig('lm-studio')).toMatchObject({ paid: false, approved: false, options: { maxRequestsPerMinute: '60' } });
    expect(h.t.core.settings.get().updates).toMatchObject({ checkForUpdates: true, feedUrl: '' });
    const w = r.warnings.join('\n');
    expect(w).toMatch(/„Gratis“ wird als kostenpflichtig übernommen/);
    expect(w).not.toMatch(/„LM Studio“ wird als kostenpflichtig/);
    expect(w).toMatch(/ungültige Optionen von „Gratis“/);
    expect(w).not.toMatch(/Optionen von „LM Studio“/);
    expect(w).toMatch(/Update-Prüfung.*nicht importiert/);
  });

  it('rolls back everything when a step inside the transaction fails', async () => {
    const h = harness();
    const file = join(h.scratch, 'import.json');
    writeFileSync(
      file,
      JSON.stringify({
        format: 'nova-export',
        version: 1,
        exportedAt: 1,
        sections: {
          memory: [{ id: 'mem_1', projectId: null, kind: 'note', title: 'A', content: 'B', tags: [], source: 'user', shareable: false, taskId: null, createdAt: 1, updatedAt: 1 }],
          settings: { agents: { maxParallelAgents: 3 } },
        },
      }),
    );
    const events: string[] = [];
    h.t.core.bus.onAny((e) => events.push(e.type));
    const original = h.t.core.settings.update.bind(h.t.core.settings);
    h.t.core.settings.update = () => {
      throw new Error('Speicher defekt');
    };
    await expect(h.backups.importData(file)).rejects.toThrow('Speicher defekt');
    h.t.core.settings.update = original;
    expect(h.t.core.db.get('SELECT COUNT(*) AS n FROM memory_entries')).toMatchObject({ n: 0 });
    expect(events).not.toContain('memory.updated');
  });

  it('rejects invalid files with German messages', async () => {
    const h = harness();
    const bad = join(h.scratch, 'bad.json');
    writeFileSync(bad, '{ kein json');
    await expect(h.backups.importData(bad)).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('kein gültiges JSON') });
    writeFileSync(bad, JSON.stringify({ format: 'other', version: 1, exportedAt: 1, sections: {} }));
    await expect(h.backups.importData(bad)).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('keine gültige NOVA-Exportdatei') });
    writeFileSync(bad, JSON.stringify({ format: 'nova-export', version: 2, exportedAt: 1, sections: {} }));
    await expect(h.backups.importData(bad)).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('neueren NOVA-Version') });
    await expect(h.backups.importData(join(h.scratch, 'fehlt.json'))).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(h.backups.importData('relativ.json')).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(existsSync(bad)).toBe(true);
  });

  it('restoring an export backup imports it', async () => {
    const src = harness();
    seed(src);
    const exported = await src.backups.exportData(['memory']);
    const dst = harness();
    mkdirSync(dst.t.core.paths.exports, { recursive: true });
    const target = join(dst.t.core.paths.exports, exported.path.split(/[\\/]/).pop()!);
    writeFileSync(target, readFileSync(exported.path));
    const info = dst.backups.list().find((b) => b.kind === 'export')!;
    const r = await dst.backups.restore(info.id);
    expect(r).toMatchObject({ restartRequired: false, path: null });
    expect(r.message).toMatch(/Export eingespielt: 1 Einträge übernommen, 1 übersprungen/);
  });
});

describe('unsafeProjectRoot (Windows rules with injected environment)', () => {
  const env = { WINDIR: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', APPDATA: 'C:\\Users\\a\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\a\\AppData\\Local', USERPROFILE: 'C:\\Users\\a' };
  it('refuses drive roots, system folders, the profile itself and the data dir', () => {
    const data = 'C:\\Users\\a\\AppData\\Local\\NOVA AI';
    expect(unsafeProjectRoot('C:\\', 'win32', data, env)).toMatch(/Stammordner/);
    expect(unsafeProjectRoot('\\\\server\\share', 'win32', data, env)).toMatch(/Stammordner/);
    expect(unsafeProjectRoot('c:\\windows\\system32\\x', 'win32', data, env)).toMatch(/Systemordner/);
    expect(unsafeProjectRoot('C:\\Program Files\\App', 'win32', data, env)).toMatch(/Systemordner/);
    expect(unsafeProjectRoot('C:\\Users\\A', 'win32', 'D:\\NOVA Daten', env)).toMatch(/Benutzerordner/);
    expect(unsafeProjectRoot('C:\\Users\\A', 'win32', data, env)).toMatch(/Datenordner/); // ancestor of the data dir
    expect(unsafeProjectRoot('C:\\Users\\a\\AppData\\Local\\NOVA AI\\x', 'win32', data, env)).toMatch(/Datenordner|Systemordner/);
    expect(unsafeProjectRoot('relative\\x', 'win32', data, env)).toMatch(/nicht absolut/);
    expect(unsafeProjectRoot('C:\\Users\\a\\NOVA Projekte\\Spiel', 'win32', data, env)).toBeNull();
  });
});
