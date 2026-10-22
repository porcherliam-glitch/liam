import { describe, it, expect, afterEach } from 'vitest';
import { request } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PreviewStatus, ProcessInfo, Project, ProjectConfigPatch } from '@shared/schemas';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { PathGuard, ProcessHandle, ProcessManager, ProjectService, StartProcessInput } from '../contracts';
import { NovaError } from '../core/errors';
import { defaultConfig, mergeConfig } from '../projects/config';
import { createWebAppTemplate } from '../projects/templates/web-app';
import { fakePathGuard, shellProcesses } from '../projects/test-support';
import { createPreviewService, isLoopbackHttpUrl } from './preview-service';

let t: TestCore;
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  t?.cleanup();
});

function makeProject(dir: string, patch: Omit<Partial<Project>, 'config'> & { config?: ProjectConfigPatch } = {}): Project {
  const kind = patch.kind ?? 'web';
  return {
    id: `prj_${Math.random().toString(36).slice(2)}`,
    name: 'P',
    description: '',
    path: dir,
    kind,
    technologies: [],
    status: 'active',
    templateId: null,
    workState: 'stopped',
    gitAvailable: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
    config: mergeConfig(defaultConfig(kind, true), patch.config ?? {}),
  };
}

/** Controllable fake ProcessManager.start for dev-server previews. */
function fakeStarter(behaviour: { url?: string | null; exitAfterMs?: number; exitCode?: number }) {
  const killed: string[] = [];
  const started: StartProcessInput[] = [];
  let n = 0;
  const pm = {
    killed,
    started,
    async start(input: StartProcessInput): Promise<ProcessHandle> {
      started.push(input);
      const id = `proc_${++n}`;
      let status: ProcessInfo['status'] = 'running';
      let exitCode: number | null = null;
      let resolveExit!: (c: number | null) => void;
      const exited = new Promise<number | null>((r) => (resolveExit = r));
      const finish = (code: number | null, st: ProcessInfo['status']) => {
        if (status !== 'running') return;
        status = st;
        exitCode = code;
        resolveExit(code);
      };
      if (behaviour.exitAfterMs !== undefined) setTimeout(() => finish(behaviour.exitCode ?? 1, 'exited'), behaviour.exitAfterMs);
      input.signal?.addEventListener('abort', () => finish(null, 'killed'), { once: true });
      (pm as unknown as { finishers: Map<string, typeof finish> }).finishers.set(id, finish);
      return {
        info: () => ({ id, projectId: input.projectId ?? null, taskId: null, kind: input.kind, command: input.command, cwd: input.cwd, pid: 1, status, exitCode, url: null, startedAt: 0, endedAt: null }),
        exited,
        waitForUrl: async (timeoutMs: number) => {
          if (behaviour.url !== undefined && behaviour.url !== null) return behaviour.url;
          return Promise.race([exited.then(() => null), new Promise<null>((r) => setTimeout(() => r(null), Math.min(timeoutMs, 200)))]);
        },
      };
    },
    async kill(id: string): Promise<ProcessInfo> {
      killed.push(id);
      (pm as unknown as { finishers: Map<string, (c: number | null, s: ProcessInfo['status']) => void> }).finishers.get(id)?.(null, 'killed');
      return { id } as ProcessInfo;
    },
    finishers: new Map(),
  };
  return pm;
}

function setup(projects: Project[], processes: unknown, opts: { startTimeoutMs?: number; reloadDebounceMs?: number } = {}) {
  t = createTestCore();
  const map = new Map(projects.map((p) => [p.id, p]));
  const projectService = {
    require(id: string) {
      const p = map.get(id);
      if (!p) throw new NovaError('NOT_FOUND', 'fehlt');
      return p;
    },
    get(id: string) {
      return map.get(id) ?? null;
    },
  } as unknown as ProjectService;
  const s = makeServices(t.core, { projects: projectService, processes: processes as ProcessManager, pathGuard: fakePathGuard() as PathGuard });
  const events: PreviewStatus[] = [];
  t.core.bus.on('preview.updated', (p) => events.push(p));
  const preview = createPreviewService(s, { startTimeoutMs: opts.startTimeoutMs ?? 2000, reloadDebounceMs: opts.reloadDebounceMs ?? 30 });
  return { preview, events };
}

function root(): string {
  const d = tempDir('nova-prev-');
  cleanups.push(d.cleanup);
  return d.dir;
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    request(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    })
      .on('error', reject)
      .end();
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('PreviewService', () => {
  it('engine-external and none are unsupported with German explanations', async () => {
    const unity = makeProject(root(), { kind: 'unity' });
    const none = makeProject(root(), { kind: 'generic' });
    const { preview } = setup([unity, none], {});
    expect(preview.status(unity.id)).toMatchObject({ state: 'unsupported', kind: 'engine-external', message: expect.stringMatching(/Unity-Projekte haben keine eingebettete Live-Vorschau/) });
    expect((await preview.start(unity.id)).state).toBe('unsupported');
    expect((await preview.start(none.id)).message).toMatch(/keine Vorschau eingerichtet/);
    expect((await preview.stop(unity.id)).state).toBe('unsupported');
  });

  it('browser-static: built-in server, reload token on files.changed (debounced), stop', async () => {
    const dir = root();
    writeFileSync(join(dir, 'index.html'), '<h1>Hallo</h1>');
    const p = makeProject(dir, { config: { preview: { kind: 'browser-static', entry: 'index.html', url: null } } });
    const { preview, events } = setup([p], {});
    const st = await preview.start(p.id);
    expect(st.state).toBe('running');
    expect(st.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/p\/[0-9a-f]{32}\/index\.html$/);
    expect(await httpGet(st.url!)).toEqual({ status: 200, body: '<h1>Hallo</h1>' });
    const token = st.reloadToken;
    t.core.bus.emit('files.changed', { projectId: p.id, paths: ['index.html'], actor: 'nova' });
    t.core.bus.emit('files.changed', { projectId: p.id, paths: ['app.js'], actor: 'external' });
    t.core.bus.emit('files.changed', { projectId: 'prj_other', paths: ['x'], actor: 'external' });
    await sleep(80);
    expect(preview.status(p.id).reloadToken).toBe(token + 1);
    expect((await preview.start(p.id)).url).toBe(st.url); // already running → same
    const stopped = await preview.stop(p.id);
    expect(stopped).toMatchObject({ state: 'stopped', url: null });
    await expect(httpGet(st.url!)).rejects.toThrow();
    expect(events.map((e) => e.state)).toEqual(['starting', 'running', 'running', 'stopped']);
  });

  it('browser-static: missing entry file is reported, unsafe entry rejected', async () => {
    const dir = root();
    const p = makeProject(dir, { config: { preview: { kind: 'browser-static', entry: 'start.html', url: null } } });
    const bad = makeProject(dir, { config: { preview: { kind: 'browser-static', entry: '../x.html', url: null } } });
    const { preview } = setup([p, bad], {});
    expect((await preview.start(p.id)).message).toMatch(/„start\.html“ wurde \(noch\) nicht gefunden/);
    expect((await preview.start(bad.id)).state).toBe('failed');
    await preview.stopAll();
  });

  it('browser-dev-server: accepts loopback URLs from the output', async () => {
    const p = makeProject(root(), { config: { commands: { dev: 'npm run dev' }, preview: { kind: 'browser-dev-server', entry: null, url: null } } });
    const pm = fakeStarter({ url: 'http://localhost:5173/.' });
    const { preview } = setup([p], pm);
    const st = await preview.start(p.id);
    expect(st).toMatchObject({ state: 'running', url: 'http://localhost:5173/', processId: 'proc_1' });
    expect(pm.started[0]).toMatchObject({ command: 'npm run dev', kind: 'preview', cwd: p.path });
    await preview.stop(p.id);
    expect(pm.killed).toEqual(['proc_1']);
  });

  it('browser-dev-server: non-loopback URL, early exit, timeout and missing command fail honestly', async () => {
    const mk = () => makeProject(root(), { config: { commands: { dev: 'npm run dev' }, preview: { kind: 'browser-dev-server', entry: null, url: null } } });
    const a = mk();
    const r1 = await setup([a], fakeStarter({ url: 'http://192.168.0.10:3000/' })).preview.start(a.id);
    expect(r1).toMatchObject({ state: 'failed', url: null });
    expect(r1.message).toMatch(/keine lokale Adresse/);
    t.cleanup();
    const b = mk();
    const r2 = await setup([b], fakeStarter({ url: null, exitAfterMs: 10, exitCode: 1 })).preview.start(b.id);
    expect(r2.message).toMatch(/beendet \(Exit-Code 1\), bevor eine Adresse erschien/);
    t.cleanup();
    const c = mk();
    const pm = fakeStarter({ url: null });
    const r3 = await setup([c], pm, { startTimeoutMs: 100 }).preview.start(c.id);
    expect(r3.message).toMatch(/keine Vorschau-Adresse erkannt/);
    expect(pm.killed).toEqual(['proc_1']);
    t.cleanup();
    const d = makeProject(root(), { config: { preview: { kind: 'browser-dev-server', entry: null, url: null } } });
    expect((await setup([d], fakeStarter({})).preview.start(d.id)).message).toMatch(/Kein Startbefehl/);
  });

  it('a crashing dev server turns the preview into failed', async () => {
    const p = makeProject(root(), { config: { commands: { dev: 'x' }, preview: { kind: 'browser-dev-server', entry: null, url: null } } });
    const pm = fakeStarter({ url: 'http://127.0.0.1:4000/', exitAfterMs: 30, exitCode: 2 });
    const { preview } = setup([p], pm);
    expect((await preview.start(p.id)).state).toBe('running');
    await sleep(80);
    expect(preview.status(p.id)).toMatchObject({ state: 'failed', message: expect.stringMatching(/Exit-Code 2/) });
  });

  it('desktop-run: running while the process lives, stopped after a clean exit', async () => {
    const p = makeProject(root(), { kind: 'desktop', config: { commands: { run: 'dotnet run --project src/App/App.csproj' } } });
    const pm = fakeStarter({ exitAfterMs: 40, exitCode: 0 });
    const { preview } = setup([p], pm);
    const st = await preview.start(p.id);
    expect(st).toMatchObject({ state: 'running', url: null, processId: 'proc_1', kind: 'desktop-run' });
    expect(st.message).toMatch(/eigenen Fenster/);
    await sleep(90);
    expect(preview.status(p.id)).toMatchObject({ state: 'stopped', message: 'Das Programm wurde beendet.' });
  });

  it('stop() during starting discards the late result', async () => {
    const p = makeProject(root(), { config: { commands: { dev: 'x' }, preview: { kind: 'browser-dev-server', entry: null, url: null } } });
    const pm = fakeStarter({ url: null });
    const { preview } = setup([p], pm, { startTimeoutMs: 150 });
    const pending = preview.start(p.id);
    await sleep(20);
    const stopped = await preview.stop(p.id);
    expect(stopped.state).toBe('stopped');
    await pending;
    expect(preview.status(p.id).state).toBe('stopped');
    expect(pm.killed).toContain('proc_1');
  });

  it.skipIf(process.platform === 'win32')('real dev server of the web-app template (node server.mjs)', async () => {
    const dir = root();
    await createWebAppTemplate().scaffold(dir, { name: 'App', description: '' });
    const p = makeProject(dir, { config: { commands: { dev: 'node server.mjs' }, preview: { kind: 'browser-dev-server', entry: 'index.html', url: null } } });
    const processes = shellProcesses();
    const { preview } = setup([p], processes, { startTimeoutMs: 10_000 });
    const st = await preview.start(p.id);
    expect(st.state, st.message).toBe('running');
    const res = await httpGet(st.url!);
    expect(res.status).toBe(200);
    expect(res.body).toMatch(/<html/);
    await preview.stopAll();
    expect(processes.runningCount()).toBe(0);
  }, 20_000);

  it('isLoopbackHttpUrl', () => {
    expect(isLoopbackHttpUrl('http://127.0.0.1:5173/')).toBe(true);
    expect(isLoopbackHttpUrl('https://localhost/')).toBe(true);
    expect(isLoopbackHttpUrl('http://[::1]:8080/x')).toBe(true);
    expect(isLoopbackHttpUrl('http://user:pw@127.0.0.1/')).toBe(false);
    expect(isLoopbackHttpUrl('http://example.com/')).toBe(false);
    expect(isLoopbackHttpUrl('file:///C:/x')).toBe(false);
  });
});
