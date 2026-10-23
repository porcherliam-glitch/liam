import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreateProjectInputSchema, type CreateProjectInput, type Operation, type Project } from '@shared/schemas';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { MemoryAddInput, Services } from '../contracts';
import { NovaError } from '../core/errors';
import { createProjectService } from './project-service';
import { createTemplateRegistry } from './template-registry';
import { createProjectDetector } from './detector';
import { fakeApprovals, fakeGit, fakeIntegrations, fakeTasks, recorder, type Call } from './test-support';

let t: TestCore;
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  t?.cleanup();
});

function tmp(prefix = 'nova-ps-'): string {
  const d = tempDir(prefix);
  cleanups.push(d.cleanup);
  return realpathSync.native(d.dir);
}

interface SetupOptions {
  git?: ReturnType<typeof fakeGit>;
  tools?: Record<string, boolean>;
  taskCounts?: Parameters<typeof fakeTasks>[0];
  memoryFails?: boolean;
}

function setup(o: SetupOptions = {}) {
  t = createTestCore();
  const projectsDir = tmp('nova-projects-');
  const home = tmp('nova-home-');
  t.core.settings.update({ general: { projectsDir } });
  const calls: Call[] = [];
  const memoryAdds: { input: MemoryAddInput; source: string }[] = [];
  const planned: { projectId: string; goal: string }[] = [];
  const git = o.git ?? fakeGit();
  const s = makeServices(t.core, {
    git,
    integrations: fakeIntegrations(o.tools ?? { node: true, git: true, dotnet: false }) as unknown as Services['integrations'],
    tasks: fakeTasks(o.taskCounts) as unknown as Services['tasks'],
    approvals: recorder(fakeApprovals(), calls, 'approvals') as unknown as Services['approvals'],
    memory: {
      add(input: MemoryAddInput, source: string) {
        if (o.memoryFails) throw new NovaError('VALIDATION', 'nein');
        memoryAdds.push({ input, source });
        return { id: 'mem_1' };
      },
      removeProject: (id: string) => {
        calls.push({ method: 'memory.removeProject', args: [id] });
        return 0;
      },
    } as unknown as Services['memory'],
    work: {
      planGoal(projectId: string, goal: string) {
        planned.push({ projectId, goal });
        return { id: 'task_plan' };
      },
    } as unknown as Services['work'],
    watcher: recorder({ watch() {}, unwatch() {}, unwatchAll() {} }, calls, 'watcher'),
    resources: recorder({ trackPath() {} }, calls, 'resources') as unknown as Services['resources'],
    preview: recorder({ async stop() {}, async stopAll() {}, status() {}, async start() {} }, calls, 'preview') as unknown as Services['preview'],
    terminals: recorder({ closeProject() {} }, calls, 'terminals') as unknown as Services['terminals'],
    processes: recorder({ async killProject() {} }, calls, 'processes') as unknown as Services['processes'],
    locks: recorder({ releaseProject() {} }, calls, 'locks') as unknown as Services['locks'],
  });
  s.templates = createTemplateRegistry(s);
  s.detector = createProjectDetector(s);
  const projects = createProjectService(s, { homeDir: home, env: {}, knownFolders: async () => [] });
  s.projects = projects;
  const events: { type: string; payload: unknown }[] = [];
  t.core.bus.onAny((e) => events.push({ type: e.type, payload: e.payload }));
  return { s, projects, calls, memoryAdds, planned, git, events, projectsDir, home };
}

const input = (i: CreateProjectInput) => CreateProjectInputSchema.parse(i);

describe('ProjectService.create (description/wizard/template)', () => {
  it('description: chooses the template, scaffolds, git init + commit, memory, plan, watch', async () => {
    const { projects, git, memoryAdds, planned, calls, events, projectsDir } = setup();
    const res = await projects.create(input({ mode: 'description', name: 'Sterne', description: 'Ein Browserspiel, in dem man Sterne sammelt.' }));
    const p = res.project;
    expect(p.path).toBe(join(projectsDir, 'Sterne'));
    expect(p).toMatchObject({ templateId: 'web-game', kind: 'web', workState: 'running', status: 'active', gitAvailable: true });
    expect(p.config.commands.test).toBe('node --test');
    expect(p.config.preview.kind).toBe('browser-dev-server');
    expect(existsSync(join(p.path, 'src', 'game.js'))).toBe(true);
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0].message).toBe('NOVA: Projekt „Sterne“ angelegt');
    expect(git.commits[0].paths).toContain('package.json');
    expect(memoryAdds.map((m) => [m.input.kind, m.source])).toEqual([
      ['goal', 'system'],
      ['decision', 'system'],
    ]);
    expect(memoryAdds[1].input.tags).toContain('annahme');
    expect(planned).toEqual([{ projectId: p.id, goal: 'Ein Browserspiel, in dem man Sterne sammelt.' }]);
    expect(res.planTaskId).toBe('task_plan');
    expect(res.warnings).toEqual([]);
    expect(calls.map((c) => c.method)).toEqual(expect.arrayContaining(['watcher.watch', 'resources.trackPath']));
    expect(events.some((e) => e.type === 'project.updated')).toBe(true);
    expect(projects.get(p.id)?.name).toBe('Sterne');
  });

  it('derived default target gets a unique suffix when the folder is taken', async () => {
    const { projects, projectsDir } = setup();
    mkdirSync(join(projectsDir, 'Spiel'));
    writeFileSync(join(projectsDir, 'Spiel', 'datei.txt'), 'von Hand');
    const res = await projects.create(input({ mode: 'template', name: 'Spiel', templateId: 'empty', planNow: false }));
    expect(res.project.path).toBe(join(projectsDir, 'Spiel (2)'));
    expect(readFileSync(join(projectsDir, 'Spiel', 'datei.txt'), 'utf8')).toBe('von Hand');
  });

  it('explicit target must be empty; root safety applies (data dir); nothing is created on rejection', async () => {
    const { projects } = setup();
    const full = tmp();
    writeFileSync(join(full, 'x.txt'), 'x');
    await expect(projects.create(input({ mode: 'template', name: 'A', templateId: 'empty', path: full }))).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringMatching(/nicht leer/) });
    await expect(projects.create(input({ mode: 'template', name: 'B', templateId: 'empty', path: join(t.core.paths.root, 'proj') }))).rejects.toThrow(/Dieser Ordner kann nicht als Projektordner verwendet werden: .*Datenordner/);
    expect(existsSync(join(t.core.paths.root, 'proj'))).toBe(false);
    await expect(projects.create(input({ mode: 'template', name: 'C', templateId: 'gibt-es-nicht', path: join(tmp(), 'neu') }))).rejects.toThrow(/Vorlage „gibt-es-nicht“/);
    expect(projects.list()).toEqual([]);
  });

  it('empty existing folder (only desktop.ini) is accepted; the folder is reused', async () => {
    const { projects } = setup();
    const dir = tmp();
    writeFileSync(join(dir, 'desktop.ini'), '');
    const res = await projects.create(input({ mode: 'template', name: 'Leer', templateId: 'empty', path: dir, planNow: false }));
    expect(res.project.path).toBe(dir);
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
  });

  it('template with missing tools, initGit=false, wizard answers → requirements + composed goal', async () => {
    const { projects, git, memoryAdds, planned } = setup({ tools: { node: false } });
    const res = await projects.create(
      input({ mode: 'wizard', name: 'API', templateId: 'backend-api', initGit: false, description: 'Eine API.', answers: { Zielgruppe: 'Vereine', Datenbank: 'SQLite' } }),
    );
    expect(res.project.kind).toBe('backend');
    expect(res.warnings.join('\n')).toMatch(/Für diese Vorlage fehlt noch: Node\.js/);
    expect(git.commits).toEqual([]);
    expect(res.project.gitAvailable).toBe(false);
    expect(memoryAdds.map((m) => [m.input.kind, m.input.title])).toEqual([
      ['goal', 'Projektziel'],
      ['requirement', 'Zielgruppe'],
      ['requirement', 'Datenbank'],
    ]);
    expect(planned[0].goal).toBe('Eine API.\n\nAngaben aus dem Assistenten:\n- Zielgruppe: Vereine\n- Datenbank: SQLite');
  });

  it('git missing and memory failures become warnings; planNow=false creates no plan', async () => {
    const { projects, planned } = setup({ git: fakeGit({ available: false }), memoryFails: true });
    const res = await projects.create(input({ mode: 'description', name: 'X', description: 'Webseite', planNow: false }));
    expect(res.warnings.join('\n')).toMatch(/Git wurde nicht gefunden/);
    expect(res.warnings.join('\n')).toMatch(/Projektgedächtnis/);
    expect(res.planTaskId).toBeNull();
    expect(planned).toEqual([]);
  });

  it('kind of the empty template follows the requested kind (Godot)', async () => {
    const { projects } = setup();
    const res = await projects.create(input({ mode: 'description', name: 'Godot', kind: 'godot', planNow: false }));
    expect(res.project).toMatchObject({ templateId: 'empty', kind: 'godot' });
    expect(res.project.config.preview.kind).toBe('engine-external');
  });
});

describe('ProjectService.create (open/import)', () => {
  it('open: detects, never modifies files, work stays stopped, honest warning', async () => {
    const { projects, git, planned } = setup();
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest run', dev: 'vite' }, devDependencies: { vite: '7' } }));
    writeFileSync(join(dir, 'index.html'), '<html></html>');
    const before = readdirSync(dir).sort();
    const res = await projects.create(input({ mode: 'open', name: 'Vorhanden', path: dir, description: 'Bestehendes Projekt verbessern.' }));
    expect(readdirSync(dir).sort()).toEqual(before);
    expect(res.project).toMatchObject({ kind: 'web', workState: 'stopped', templateId: null, path: dir });
    expect(res.project.config.commands.test).toBe('npm test');
    expect(git.commits).toEqual([]);
    expect(res.warnings.join('\n')).toMatch(/autonome Arbeit ist für dieses Projekt noch aus/);
    expect(res.warnings.join('\n')).toMatch(/kein Git-Repository/);
    expect(planned).toHaveLength(1);
    await expect(projects.create(input({ mode: 'open', name: 'Doppelt', path: dir }))).rejects.toThrow(/bereits als Projekt „Vorhanden“/);
    await expect(projects.create(input({ mode: 'open', name: 'Fehlt', path: join(tmp(), 'gibt-es-nicht') }))).rejects.toThrow(/existiert nicht/);
    await expect(projects.create(input({ mode: 'open', name: 'Innen', path: join(dir, 'src') }))).rejects.toThrow(/im Ordner des Projekts „Vorhanden“/);
  });

  it('import: clones inside an operation with progress, then registers like open', async () => {
    const git = fakeGit({
      onClone: async (_url, dir, onProgress) => {
        onProgress?.(50, 'Empfange Objekte');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), '<html></html>');
      },
    });
    const { projects, events, projectsDir } = setup({ git });
    const res = await projects.create(input({ mode: 'import', name: 'Fremd', repoUrl: 'https://github.com/example/site.git', planNow: false }));
    expect(res.project).toMatchObject({ kind: 'web', workState: 'stopped', path: join(projectsDir, 'Fremd'), gitAvailable: true });
    const ops = events.filter((e) => e.type === 'operation.updated').map((e) => e.payload as Operation);
    expect(ops[0]).toMatchObject({ kind: 'clone', status: 'running' });
    expect(ops.some((o) => o.progress === 50 && o.message === 'Empfange Objekte')).toBe(true);
    expect(ops[ops.length - 1].status).toBe('done');
  });

  it('import without git → TOOL_MISSING', async () => {
    const { projects } = setup({ git: fakeGit({ available: false }) });
    await expect(projects.create(input({ mode: 'import', name: 'X', repoUrl: 'https://github.com/a/b.git' }))).rejects.toMatchObject({ code: 'TOOL_MISSING' });
  });
});

describe('ProjectService update / state / summary / remove', () => {
  async function created(ctx: ReturnType<typeof setup>, name = 'Web'): Promise<Project> {
    return (await ctx.projects.create(input({ mode: 'template', name, templateId: 'web-app', planNow: false }))).project;
  }

  it('update: rename, deep-merge config, validation', async () => {
    const ctx = setup();
    const p = await created(ctx);
    const u = ctx.projects.update({ id: p.id, name: '  Neu  ', config: { commands: { lint: 'npx eslint .' }, preview: { url: 'http://127.0.0.1:5175/' }, testAfterChange: false } });
    expect(u.name).toBe('Neu');
    expect(u.config.commands).toMatchObject({ lint: 'npx eslint .', test: 'node --test', dev: 'node server.mjs' });
    expect(u.config.preview).toEqual({ kind: 'browser-dev-server', entry: 'index.html', url: 'http://127.0.0.1:5175/' });
    expect(u.config.testAfterChange).toBe(false);
    expect(() => ctx.projects.update({ id: p.id, name: ' ' })).toThrow(/nicht leer/);
    expect(() => ctx.projects.update({ id: p.id, config: { monthlyBudgetUsd: -1 } })).toThrow(/Ungültige Projekteinstellungen/);
    expect(() => ctx.projects.update({ id: 'prj_x', name: 'a' })).toThrow(/nicht gefunden/);
  });

  it('update({path}) relinks a moved folder with the same safety rules', async () => {
    const ctx = setup();
    const p = await created(ctx);
    const moved = join(tmp(), 'verschoben');
    mkdirSync(moved);
    ctx.calls.length = 0;
    const u = ctx.projects.update({ id: p.id, path: moved });
    expect(u.path).toBe(moved);
    expect(ctx.calls.map((c) => c.method)).toEqual(expect.arrayContaining(['watcher.unwatch', 'preview.stop', 'watcher.watch', 'resources.trackPath']));
    expect(() => ctx.projects.update({ id: p.id, path: join(moved, 'fehlt') })).toThrow(/existiert nicht/);
    expect(() => ctx.projects.update({ id: p.id, path: ctx.home })).toThrow(/Benutzerordner/);
    const other = await created(ctx, 'Zweites');
    expect(() => ctx.projects.update({ id: other.id, path: moved })).toThrow(/bereits als Projekt/);
  });

  it('archiving unwatches; setWorkState emits project.updated', async () => {
    const ctx = setup();
    const p = await created(ctx);
    ctx.calls.length = 0;
    ctx.projects.update({ id: p.id, status: 'archived' });
    expect(ctx.calls.map((c) => c.method)).toContain('watcher.unwatch');
    expect(ctx.projects.list().map((x) => x.id)).toEqual([]);
    expect(ctx.projects.list({ includeArchived: true }).map((x) => x.id)).toEqual([p.id]);
    ctx.events.length = 0;
    expect(ctx.projects.setWorkState(p.id, 'paused').workState).toBe('paused');
    expect(ctx.events.map((e) => e.type)).toEqual(['project.updated']);
    expect(() => ctx.projects.setWorkState(p.id, 'kaputt' as never)).toThrow(/Arbeitszustand/);
  });

  it('summary: counts, progress, approvals, errors, checks, pathMissing', async () => {
    const ctx = setup({ taskCounts: { done: 3, queued: 1, running: 1, cancelled: 2, blocked: 1 } });
    const p = await created(ctx);
    const now = Date.now();
    const insert = (id: string, kind: string, status: string, ts: number) =>
      t.core.db.run("INSERT INTO check_runs(id, project_id, kind, command, status, output_tail, failures, artifacts, started_at, finished_at) VALUES (?, ?, ?, 'x', ?, '', '[]', '[]', ?, ?)", [id, p.id, kind, status, ts, ts]);
    insert('chk_b1', 'build', 'passed', now - 3000);
    insert('chk_b2', 'build', 'failed', now - 1000);
    insert('chk_t1', 'test', 'passed', now - 2000);
    t.core.errors.report({ code: 'X', severity: 'blocker', title: 'T', whatHappened: 'W', projectId: p.id });
    const sum = ctx.projects.summary(p.id);
    expect(sum).toMatchObject({ progress: 50, openTasks: 3, runningTasks: 1, blockedTasks: 1, pendingApprovals: 2, openErrors: 1, pathMissing: false });
    expect(sum.taskCounts).toMatchObject({ done: 3, cancelled: 2, failed: 0 });
    expect(sum.lastBuild?.id).toBe('chk_b2');
    expect(sum.lastSuccessfulBuild?.id).toBe('chk_b1');
    expect(sum.lastTest?.id).toBe('chk_t1');
    expect(sum.lastActivityAt).toBeGreaterThanOrEqual(now - 1000);
    rmSync(p.path, { recursive: true, force: true });
    expect(ctx.projects.summary(p.id).pathMissing).toBe(true);
  });

  it('remove: CONFLICT while tasks run', async () => {
    const ctx = setup({ taskCounts: { running: 1 } });
    const p = await created(ctx);
    await expect(ctx.projects.remove(p.id)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('remove: SPEC order, rows deleted, files kept, project.removed emitted', async () => {
    const ctx = setup();
    const p = await created(ctx);
    const db = t.core.db;
    db.run("INSERT INTO changes(project_id, path, op, actor, source, ts) VALUES (?, 'a.txt', 'create', 'nova', 'tool', 1)", [p.id]);
    db.run("INSERT INTO approval_rules(id, project_id, kind, fingerprint, description, created_at) VALUES ('rule_1', ?, 'command', 'fp', 'd', 1)", [p.id]);
    db.run("INSERT INTO file_locks(lock_key, project_id, path, task_id, acquired_at) VALUES ('k', ?, 'a.txt', 'task_1', 1)", [p.id]);
    db.run("INSERT INTO usage_records(id, ts, provider_id, model_id, project_id) VALUES ('use_1', 1, 'ollama-local', 'm', ?)", [p.id]);
    t.core.errors.report({ code: 'X', severity: 'blocker', title: 'T', whatHappened: 'W', projectId: p.id });
    ctx.calls.length = 0;
    ctx.events.length = 0;
    await ctx.projects.remove(p.id);
    expect(ctx.calls.map((c) => c.method)).toEqual([
      'preview.stop',
      'terminals.closeProject',
      'processes.killProject',
      'approvals.expireForProject',
      'locks.releaseProject',
      'watcher.unwatch',
      'memory.removeProject',
    ]);
    for (const table of ['projects', 'changes', 'approval_rules', 'file_locks']) {
      const col = table === 'projects' ? 'id' : 'project_id';
      expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`, [p.id])?.n).toBe(0);
    }
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM usage_records WHERE project_id = ?', [p.id])?.n).toBe(1);
    expect(t.core.errors.countOpen(p.id)).toBe(0);
    expect(existsSync(join(p.path, 'index.html'))).toBe(true);
    expect(ctx.events.some((e) => e.type === 'project.removed' && (e.payload as { id: string }).id === p.id)).toBe(true);
    expect(ctx.projects.get(p.id)).toBeNull();
  });

  it('detect() re-detects from disk; refreshGit follows git availability', async () => {
    const git = fakeGit();
    const ctx = setup({ git });
    const p = await created(ctx);
    const d = await ctx.projects.detect(p.id);
    expect(d.kind).toBe('web');
    expect(p.gitAvailable).toBe(true);
    git.repos.clear();
    expect((await ctx.projects.refreshGit(p.id)).gitAvailable).toBe(false);
    expect(ctx.projects.defaultConfig('unity').preview.kind).toBe('engine-external');
  });

  it('repairs a corrupt stored config with the kind defaults', async () => {
    const ctx = setup();
    const p = await created(ctx);
    t.core.db.run('UPDATE projects SET config = ? WHERE id = ?', ['{"commands":{"test":"npm test"},"testAfterChange":"ja"}', p.id]);
    const got = ctx.projects.require(p.id);
    expect(got.config.commands.test).toBe('npm test');
    expect(got.config.testAfterChange).toBe(true);
    expect(got.config.preview.kind).toBe('browser-static');
  });
});
