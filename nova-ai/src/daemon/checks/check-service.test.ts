import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckRun, Project, ProjectConfigPatch } from '@shared/schemas';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { ApprovalService, CommandPolicy, IntegrationService, ProcessManager, ProjectService, Services } from '../contracts';
import { NovaError } from '../core/errors';
import { toJson } from '../db/database';
import { defaultConfig, mergeConfig } from '../projects/config';
import { createWebAppTemplate } from '../projects/templates/web-app';
import { createWebGameTemplate } from '../projects/templates/web-game';
import { fakeApprovals, fakeIntegrations, fakePolicy, scriptedProcesses, shellProcesses, type ScriptedResult } from '../projects/test-support';
import { createCheckService, missingDependencyMarker } from './check-service';

let t: TestCore;
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  t?.cleanup();
});

const TAP_OK = '# tests 3\n# suites 0\n# pass 3\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const TAP_ZERO = '# tests 0\n# suites 0\n# pass 0\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

function root(): string {
  const d = tempDir('nova-chk-');
  cleanups.push(d.cleanup);
  return d.dir;
}

function insertProject(core: TestCore['core'], dir: string, patch: Omit<Partial<Project>, 'config'> & { config?: ProjectConfigPatch } = {}): Project {
  const kind = patch.kind ?? 'web';
  const p: Project = {
    id: `prj_${Math.random().toString(36).slice(2)}`,
    name: 'Testprojekt',
    description: '',
    path: dir,
    kind,
    technologies: [],
    status: 'active',
    templateId: null,
    workState: 'stopped',
    gitAvailable: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...patch,
    config: mergeConfig(defaultConfig(kind, true), patch.config ?? {}),
  };
  core.db.run(
    `INSERT INTO projects(id, name, description, path, path_key, kind, technologies, status, template_id, config, work_state, git_available, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.id, p.name, p.description, p.path, p.path + p.id, p.kind, toJson(p.technologies), p.status, null, toJson(p.config), p.workState, 0, p.createdAt, p.updatedAt],
  );
  return p;
}

function setup(opts: { processes?: ProcessManager; script?: { match: RegExp; result: ScriptedResult }[]; extra?: Partial<Services>; platform?: NodeJS.Platform; runtime?: { aliveMs?: number; webMaxMs?: number; pollMs?: number } } = {}) {
  t = createTestCore();
  const projects = new Map<string, Project>();
  const projectService = {
    require(id: string) {
      const p = projects.get(id);
      if (!p) throw new NovaError('NOT_FOUND', 'Projekt fehlt');
      return p;
    },
    get(id: string) {
      return projects.get(id) ?? null;
    },
  } as unknown as ProjectService;
  const processes = opts.processes ?? scriptedProcesses(opts.script ?? []);
  const s = makeServices(t.core, { projects: projectService, processes, ...opts.extra });
  const events: CheckRun[] = [];
  t.core.bus.on('check.updated', (c) => events.push(c));
  const checks = createCheckService(s, { platform: opts.platform, runtime: opts.runtime });
  const add = (dir: string, patch: Parameters<typeof insertProject>[2] = {}) => {
    const p = insertProject(t.core, dir, patch);
    projects.set(p.id, p);
    return p;
  };
  return { s, checks, processes, events, add };
}

describe('CheckService basics', () => {
  it('not_run with a German message when no command is configured', async () => {
    const { checks, add, events } = setup();
    const p = add(root());
    const run = checks.start({ projectId: p.id, kind: 'test' });
    expect(run.status).toBe('not_run');
    expect(run.message).toMatch(/Kein Testbefehl eingerichtet/);
    expect(checks.get(run.id)?.status).toBe('not_run');
    expect(events.map((e) => e.status)).toEqual(['not_run']);
    const viaRun = await checks.run({ projectId: p.id, kind: 'runtime' });
    expect(viaRun.message).toMatch(/Kein Startbefehl/);
  });

  it('runs a test command, parses counts, keeps a redacted output tail', async () => {
    const out = `${'line\n'.repeat(300)}API_KEY=sk-ant-abcdefghijklmnop1234\n${TAP_OK}`;
    const { checks, add, events, processes } = setup({ script: [{ match: /node --test/, result: { exitCode: 0, output: out } }] });
    const p = add(root(), { config: { commands: { test: 'node --test' } } });
    const started = checks.start({ projectId: p.id, kind: 'test', taskId: null });
    expect(started.status).toBe('running');
    const done = await checks.run({ projectId: p.id, kind: 'test', taskId: 'task_1', actor: 'agent' });
    expect(done).toMatchObject({ status: 'passed', passed: 3, failed: 0, skipped: 0, failureSignature: null, taskId: 'task_1', processId: expect.stringMatching(/^proc_/) });
    expect(done.outputTail.split('\n').length).toBeLessThanOrEqual(200);
    expect(done.outputTail).not.toContain('sk-ant-abcdefghijklmnop1234');
    expect((processes as ReturnType<typeof scriptedProcesses>).runs[0]).toMatchObject({ kind: 'test', cwd: p.path });
    expect(events.filter((e) => e.id === done.id).map((e) => e.status)).toEqual(['running', 'passed']);
  });

  it('failed run: failures, signature and German message', async () => {
    const output = `not ok 1 - adds\n  ---\n  location: '${'/x'}/tests/a.test.mjs:5:3'\n  failureType: 'testCodeFailure'\n  error: 'expected 3'\n  ...\n# tests 2\n# pass 1\n# fail 1\n`;
    const { checks, add } = setup({ script: [{ match: /./, result: { exitCode: 1, output } }] });
    const p = add(root(), { config: { commands: { test: 'node --test' } } });
    const r1 = await checks.run({ projectId: p.id, kind: 'test' });
    const r2 = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r1).toMatchObject({ status: 'failed', passed: 1, failed: 1, message: '1 Test ist fehlgeschlagen.' });
    expect(r1.failures[0].message).toBe('adds: expected 3');
    expect(r1.failureSignature).toMatch(/^[0-9a-f]{16}$/);
    expect(r2.failureSignature).toBe(r1.failureSignature);
  });

  it('a test run without tests is skipped, never passed', async () => {
    const { checks, add } = setup({ script: [{ match: /./, result: { exitCode: 0, output: TAP_ZERO } }] });
    const p = add(root(), { config: { commands: { test: 'node --test' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r.status).toBe('skipped');
    expect(r.message).toMatch(/keine Tests gefunden/);
  });

  it('unknown command → error (exit 127 POSIX, 9009 cmd.exe)', async () => {
    const posix = setup({ script: [{ match: /./, result: { exitCode: 127, output: 'sh: 1: pytest: not found' } }] });
    const p = posix.add(root(), { config: { commands: { test: 'pytest -q' } } });
    const r = await posix.checks.run({ projectId: p.id, kind: 'test' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/„pytest“ wurde nicht gefunden/);
    expect(r.failureSignature).toMatch(/^[0-9a-f]{16}$/);
    t.cleanup();
    const win = setup({ platform: 'win32', script: [{ match: /./, result: { exitCode: 9009, output: '' } }] });
    const p2 = win.add(root(), { config: { commands: { build: 'dotnet build' } } });
    expect((await win.checks.run({ projectId: p2.id, kind: 'build' })).status).toBe('error');
  });

  it('timeout → failed with explanation', async () => {
    const { checks, add } = setup({ script: [{ match: /./, result: { exitCode: null, timedOut: true, output: 'hängt' } }] });
    const p = add(root(), { config: { commands: { build: 'npm run build' } } });
    const r = await checks.run({ projectId: p.id, kind: 'build' });
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/Zeitlimit/);
  });

  it('cancel() stops a running check; start() rejects a second run of the same kind', async () => {
    const { checks, add } = setup({ script: [{ match: /./, result: { hang: true } }] });
    const p = add(root(), { config: { commands: { test: 'node --test' } } });
    const run = checks.start({ projectId: p.id, kind: 'test' });
    expect(() => checks.start({ projectId: p.id, kind: 'test' })).toThrow(/läuft bereits/);
    const cancelled = await checks.cancel(run.id);
    expect(cancelled.status).toBe('cancelled');
    expect(checks.get(run.id)?.status).toBe('cancelled');
  });

  it('run() waits for a running check of the same kind and honours its own abort signal', async () => {
    let calls = 0;
    const { checks, add } = setup({
      script: [
        {
          match: /./,
          result: {
            effect: async () => {
              calls++;
              await new Promise((r) => setTimeout(r, 50));
            },
            exitCode: 0,
            output: TAP_OK,
          },
        },
      ],
    });
    const p = add(root(), { config: { commands: { test: 'node --test' } } });
    const first = checks.start({ projectId: p.id, kind: 'test' });
    const second = checks.run({ projectId: p.id, kind: 'test' });
    const ac = new AbortController();
    ac.abort();
    const third = await checks.run({ projectId: p.id, kind: 'test', signal: ac.signal });
    const r2 = await second;
    expect(checks.get(first.id)?.status).toBe('passed');
    expect(r2.status).toBe('passed');
    expect(third.status).toBe('cancelled');
    expect(calls).toBe(2);
  });

  it('error for a missing project folder', async () => {
    const { checks, add } = setup();
    const p = add('/nicht/vorhanden/projekt', { config: { commands: { test: 'node --test' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/Projektordner wurde nicht gefunden/);
  });

  it('records artifacts after a passed build', async () => {
    const dir = root();
    const { checks, add } = setup({
      script: [
        {
          match: /build/,
          result: {
            exitCode: 0,
            output: 'ok',
            effect: () => {
              mkdirSync(join(dir, 'dist'), { recursive: true });
              writeFileSync(join(dir, 'dist', 'app.js'), 'console.log(1)');
            },
          },
        },
      ],
    });
    const p = add(dir, { config: { commands: { build: 'node scripts/build.mjs' }, artifactGlobs: ['dist/**'] } });
    const r = await checks.run({ projectId: p.id, kind: 'build' });
    expect(r.status).toBe('passed');
    expect(r.artifacts).toEqual([{ path: 'dist/app.js', sizeBytes: 14 }]);
  });
});

describe('install-first rule', () => {
  function npmProject(dir: string) {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { leftpad: '1.0.0' } }));
  }

  it('detects missing markers', () => {
    const dir = root();
    npmProject(dir);
    expect(missingDependencyMarker(dir, 'npm ci')).toBe('node_modules fehlt');
    mkdirSync(join(dir, 'node_modules'));
    expect(missingDependencyMarker(dir, 'npm ci')).toBeNull();
    const net = root();
    mkdirSync(join(net, 'src', 'App'), { recursive: true });
    writeFileSync(join(net, 'src', 'App', 'App.csproj'), '<Project/>');
    expect(missingDependencyMarker(net, 'dotnet restore App.sln')).toBe('obj-Ordner fehlt');
    const py = root();
    writeFileSync(join(py, 'requirements.txt'), 'pytest');
    expect(missingDependencyMarker(py, 'python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt')).toBe('.venv fehlt');
  });

  it('user-triggered: runs the install command first (no policy), then the check', async () => {
    const dir = root();
    npmProject(dir);
    const { checks, add, processes } = setup({ script: [{ match: /npm ci/, result: { exitCode: 0, output: 'added 1 package' } }, { match: /npm test/, result: { exitCode: 0, output: TAP_OK } }] });
    const p = add(dir, { config: { commands: { install: 'npm ci', test: 'npm test' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test', actor: 'user' });
    expect(r.status).toBe('passed');
    const runs = (processes as ReturnType<typeof scriptedProcesses>).runs;
    expect(runs.map((x) => [x.command, x.kind])).toEqual([
      ['npm ci', 'install'],
      ['npm test', 'test'],
    ]);
    expect(r.outputTail).toMatch(/Abhängigkeiten werden installiert/);
  });

  it('install failure → error status and an error report', async () => {
    const dir = root();
    npmProject(dir);
    const { checks, add } = setup({ script: [{ match: /npm ci/, result: { exitCode: 1, output: 'npm ERR! network' } }] });
    const p = add(dir, { config: { commands: { install: 'npm ci', test: 'npm test' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test', actor: 'user' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/^Abhängigkeiten konnten nicht installiert werden/);
    expect(t.core.errors.list({ projectId: p.id })[0]).toMatchObject({ code: 'COMMAND_FAILED' });
  });

  it('agent-triggered: CommandPolicy approval pending → error, nothing installed', async () => {
    const dir = root();
    npmProject(dir);
    const approvals = fakeApprovals('pending');
    const policy = fakePolicy({ action: 'approve', kind: 'network', reason: 'Netzwerk', consequences: 'Lädt Pakete', subject: 'npm ci' });
    const { checks, add, processes } = setup({ extra: { approvals: approvals as unknown as ApprovalService, policy: policy as unknown as CommandPolicy } });
    const p = add(dir, { config: { commands: { install: 'npm ci', test: 'npm test' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test', actor: 'agent', taskId: 'task_9' });
    expect(r.status).toBe('error');
    expect(r.message).toMatch(/wartet auf eine Freigabe/);
    expect(approvals.requests[0]).toMatchObject({ kind: 'network', subject: 'npm ci', taskId: 'task_9' });
    expect((processes as ReturnType<typeof scriptedProcesses>).runs).toHaveLength(0);
  });

  it('agent-triggered: approved once → consumed before installing; blocked → error', async () => {
    const dir = root();
    npmProject(dir);
    const approvals = fakeApprovals('approved');
    const policy = fakePolicy({ action: 'approve', kind: 'network', reason: 'Netzwerk', consequences: 'Lädt Pakete', subject: 'npm ci' });
    const ok = setup({ extra: { approvals: approvals as unknown as ApprovalService, policy: policy as unknown as CommandPolicy }, script: [{ match: /npm test/, result: { exitCode: 0, output: TAP_OK } }] });
    const p = ok.add(dir, { config: { commands: { install: 'npm ci', test: 'npm test' } } });
    expect((await ok.checks.run({ projectId: p.id, kind: 'test', actor: 'system' })).status).toBe('passed');
    expect(approvals.consumed).toEqual(['apr_1']);
    t.cleanup();
    const blocked = setup({ extra: { policy: fakePolicy({ action: 'block', reason: 'Verboten' }) as unknown as CommandPolicy } });
    const p2 = blocked.add(dir, { config: { commands: { install: 'npm ci', test: 'npm test' } } });
    const r2 = await blocked.checks.run({ projectId: p2.id, kind: 'test', actor: 'agent' });
    expect(r2).toMatchObject({ status: 'error', message: 'Abhängigkeiten konnten nicht installiert werden: Verboten' });
  });
});

describe('Unity and dotnet specifics', () => {
  const UNITY_CMD = '"C:\\Program Files\\Unity\\Hub\\Editor\\2021.1.0f1\\Editor\\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults TestResults/editmode.xml -logFile -';

  it('Unity: missing editor version → not_run', async () => {
    const dir = root();
    mkdirSync(join(dir, 'ProjectSettings'));
    writeFileSync(join(dir, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 2022.3.10f1\n');
    const integrations = fakeIntegrations({}, null);
    const { checks, add } = setup({ extra: { integrations: integrations as unknown as IntegrationService } });
    const p = add(dir, { kind: 'unity', config: { commands: { test: UNITY_CMD } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r.status).toBe('not_run');
    expect(r.message).toMatch(/^Unity 2022\.3\.10f1 ist nicht installiert/);
    expect(integrations.resolveCalls).toContainEqual({ id: 'unity', version: '2022.3.10f1' });
  });

  it('Unity: project open in the editor → error', async () => {
    const dir = root();
    mkdirSync(join(dir, 'Temp'));
    writeFileSync(join(dir, 'Temp', 'UnityLockfile'), '');
    const { checks, add } = setup({ extra: { integrations: fakeIntegrations({}, '/opt/unity/Editor/Unity') as unknown as IntegrationService } });
    const p = add(dir, { kind: 'unity', config: { commands: { test: UNITY_CMD } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r).toMatchObject({ status: 'error', message: 'Projekt ist in Unity geöffnet – bitte Unity schließen.' });
  });

  it('Unity: runs the matching editor and parses the NUnit XML', async () => {
    const dir = root();
    const xml =
      '<test-run id="2" total="2" passed="1" failed="1" inconclusive="0" skipped="0"><test-case fullname="G.T.Fails" result="Failed"><failure><message><![CDATA[Expected: 1]]></message><stack-trace><![CDATA[at G.T.Fails () in ' +
      dir +
      '/Assets/Tests/EditMode/GameTests.cs:12]]></stack-trace></failure></test-case></test-run>';
    const { checks, add, processes } = setup({
      extra: { integrations: fakeIntegrations({}, '/opt/unity/Editor/Unity') as unknown as IntegrationService },
      script: [
        {
          match: /Unity/,
          result: {
            exitCode: 2,
            output: 'Unity log …',
            effect: () => {
              mkdirSync(join(dir, 'TestResults'), { recursive: true });
              writeFileSync(join(dir, 'TestResults', 'editmode.xml'), xml);
            },
          },
        },
      ],
    });
    const p = add(dir, { kind: 'unity', config: { commands: { test: UNITY_CMD } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect((processes as ReturnType<typeof scriptedProcesses>).runs[0].command.startsWith('"/opt/unity/Editor/Unity" -batchmode')).toBe(true);
    expect(r).toMatchObject({ status: 'failed', passed: 1, failed: 1, command: UNITY_CMD });
    expect(r.failures[0]).toMatchObject({ file: 'Assets/Tests/EditMode/GameTests.cs', line: 12 });
  });

  it('Unity: no results file → error (or failed with compile errors)', async () => {
    const dir = root();
    const { checks, add } = setup({
      extra: { integrations: fakeIntegrations({}, '/opt/unity/Editor/Unity') as unknown as IntegrationService },
      script: [{ match: /Unity/, result: { exitCode: 1, output: 'Assets/Scripts/Game.cs(3,5): error CS1002: ; expected' } }],
    });
    const p = add(dir, { kind: 'unity', config: { commands: { test: UNITY_CMD } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r.status).toBe('failed');
    expect(r.message).toMatch(/Kompilierfehler/);
    expect(r.failures[0]).toMatchObject({ file: 'Assets/Scripts/Game.cs', line: 3 });
  });

  it('dotnet test: TRX logger into the data dir, counts from TRX, temp dir removed', async () => {
    const dir = root();
    let resultsDir = '';
    const trx = '<TestRun><Results><UnitTestResult testName="A.B" outcome="Passed" /></Results><ResultSummary><Counters total="3" passed="3" failed="0" error="0" notExecuted="0" /></ResultSummary></TestRun>';
    const { checks, add, processes } = setup({
      script: [
        {
          match: /dotnet test/,
          result: {
            exitCode: 0,
            output: 'Passed!  - Failed:     0, Passed:     3, Skipped:     0, Total:     3',
            effect: (input) => {
              resultsDir = /--results-directory "([^"]+)"/.exec(input.command)![1];
              writeFileSync(join(resultsDir, 'ada_PC_2026.trx'), trx);
            },
          },
        },
      ],
    });
    const p = add(dir, { kind: 'desktop', config: { commands: { test: 'dotnet test Calc.sln' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    const run = (processes as ReturnType<typeof scriptedProcesses>).runs[0];
    expect(run.command).toMatch(/^dotnet test Calc\.sln --logger trx --results-directory "/);
    expect(run.env).toMatchObject({ DOTNET_CLI_UI_LANGUAGE: 'en' });
    expect(resultsDir.startsWith(t.core.paths.root)).toBe(true);
    expect(r).toMatchObject({ status: 'passed', passed: 3, failed: 0, command: 'dotnet test Calc.sln' });
    expect(existsSync(resultsDir)).toBe(false);
  });
});

describe('queries, prune and recovery', () => {
  it('list/latest/recent/currentFailures/prune', async () => {
    const { checks, add } = setup({ script: [{ match: /node --test/, result: { exitCode: 0, output: TAP_OK } }, { match: /b\.mjs/, result: { exitCode: 0, output: 'ok' } }] });
    const p = add(root(), { config: { commands: { test: 'node --test', build: 'node b.mjs' } } });
    const a = await checks.run({ projectId: p.id, kind: 'test' });
    const b = await checks.run({ projectId: p.id, kind: 'build' });
    expect(checks.list(p.id).map((c) => c.id)).toEqual([b.id, a.id]);
    expect(checks.list(p.id, { kind: 'test' }).map((c) => c.id)).toEqual([a.id]);
    expect(checks.latest(p.id, 'build')?.id).toBe(b.id);
    expect(checks.recent(['build', 'package'], 10, 'passed').map((c) => c.id)).toEqual([b.id]);
    expect(checks.currentFailures(10)).toEqual([]);
    // a failing test afterwards becomes the current failure
    t.core.db.run("UPDATE check_runs SET status = 'failed' WHERE id = ?", [a.id]);
    expect(checks.currentFailures(10).map((c) => c.id)).toEqual([a.id]);
    // prune keeps the latest run per project+kind
    const old = await checks.run({ projectId: p.id, kind: 'test' });
    t.core.db.run('UPDATE check_runs SET started_at = 1, finished_at = 1 WHERE id = ?', [a.id]);
    expect(checks.prune(Date.now() - 1000)).toBe(1);
    expect(checks.get(a.id)).toBeNull();
    expect(checks.get(old.id)).not.toBeNull();
  });

  it('marks running rows of a previous daemon as interrupted on first use', () => {
    const { checks, add } = setup();
    const p = add(root());
    t.core.db.run(
      "INSERT INTO check_runs(id, project_id, task_id, kind, command, status, output_tail, failures, artifacts, started_at) VALUES ('chk_old', ?, NULL, 'test', 'x', 'running', '', '[]', '[]', 1)",
      [p.id],
    );
    expect(checks.get('chk_old')).toMatchObject({ status: 'error', message: expect.stringMatching(/Unterbrochen/) });
  });

  it('cancel of an unknown id → NOT_FOUND', async () => {
    const { checks } = setup();
    await expect(checks.cancel('chk_nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('real processes (POSIX shell)', () => {
  it.skipIf(process.platform === 'win32')('runs the web-game template tests for real', async () => {
    const dir = root();
    await createWebGameTemplate().scaffold(dir, { name: 'Spiel', description: '' });
    const { checks, add } = setup({ processes: shellProcesses() });
    const p = add(dir, { config: { commands: { test: 'node --test' } } });
    const r = await checks.run({ projectId: p.id, kind: 'test' });
    expect(r.status, r.outputTail).toBe('passed');
    expect(r.passed).toBeGreaterThanOrEqual(10);
    expect(r.failed).toBe(0);
  }, 20_000);

  it.skipIf(process.platform === 'win32')('runtime check: web app answers 2xx; the process is killed afterwards', async () => {
    const dir = root();
    await createWebAppTemplate().scaffold(dir, { name: 'App', description: '' });
    const processes = shellProcesses();
    const { checks, add } = setup({ processes, runtime: { aliveMs: 500, webMaxMs: 8000, pollMs: 50 } });
    const p = add(dir, { config: { commands: { run: 'node server.mjs' }, preview: { kind: 'browser-dev-server', entry: 'index.html', url: null } } });
    const r = await checks.run({ projectId: p.id, kind: 'runtime' });
    expect(r.status, r.outputTail).toBe('passed');
    expect(r.message).toMatch(/antwortet unter http:\/\/127\.0\.0\.1:\d+\/ \(HTTP 200\)/);
    expect(processes.killed).toHaveLength(1);
    expect(processes.runningCount()).toBe(0);
  }, 20_000);

  it.skipIf(process.platform === 'win32')('runtime check: alive after the wait → passed; early crash → failed', async () => {
    const processes = shellProcesses();
    const { checks, add } = setup({ processes, runtime: { aliveMs: 300, webMaxMs: 300, pollMs: 50 } });
    const alive = add(root(), { kind: 'generic', config: { commands: { run: 'sleep 5' } } });
    const r1 = await checks.run({ projectId: alive.id, kind: 'runtime' });
    expect(r1.status).toBe('passed');
    expect(r1.message).toMatch(/ohne Absturz/);
    const crash = add(root(), { kind: 'generic', config: { commands: { run: 'echo kaputt; exit 3' } } });
    const r2 = await checks.run({ projectId: crash.id, kind: 'runtime' });
    expect(r2.status).toBe('failed');
    expect(r2.message).toMatch(/Exit-Code 3/);
    expect(r2.outputTail).toMatch(/kaputt/);
  }, 20_000);
});
