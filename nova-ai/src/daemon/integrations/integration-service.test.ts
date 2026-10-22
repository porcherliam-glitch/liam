// Tests for the IntegrationService: status cache (10 min, persisted), manual paths, resolvePath with versions, module
// registration, the winget install flow behind an 'install' approval (real ApprovalService, fake ProcessManager,
// simulated Windows) and "open in external program".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUILTIN_INTEGRATIONS, IntegrationStatusSchema, type IntegrationStatus, type Notification, type Project } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { CommandResult, IntegrationModule, NotificationService, PathGuard, ProcessManager, ProjectService, RunCommandInput, Services } from '../contracts';
import { NovaError } from '../core/errors';
import { createApprovalService } from '../approvals/approval-service';
import { createIntegrationService, userProgramEnv, type IntegrationServiceOptions } from './integration-service';
import { wingetCommandFor } from './winget';
import { WIN_ENV, memFs, scriptedRun, type MemFs, type RunScript } from './test-helpers';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

function fakeNotifications() {
  const sent: Array<Omit<Notification, 'id' | 'ts' | 'readAt'>> = [];
  const svc: NotificationService = {
    notify(input) {
      sent.push(input);
      return { ...input, id: `ntf_${sent.length}`, ts: Date.now(), readAt: null };
    },
    list: () => [],
    markRead: () => undefined,
    unreadCount: () => 0,
    prune: () => 0,
  };
  return { svc, sent };
}

function result(patch: Partial<CommandResult> = {}): CommandResult {
  return { processId: 'proc_1', exitCode: 0, signal: null, stdout: '', stderr: '', output: '', timedOut: false, cancelled: false, durationMs: 5, ...patch };
}

interface FakeModuleState {
  available: boolean;
  version?: string | null;
  path?: string | null;
  installations?: { version: string; path: string }[];
  throws?: string;
}

function fakeModule(id: string, state: FakeModuleState, extra: Partial<IntegrationModule> = {}) {
  const seen: Array<string | null> = [];
  const module: IntegrationModule = {
    id,
    name: `Tool ${id}`,
    category: 'runtime',
    async detect(ctx) {
      seen.push(ctx.manualPath);
      if (state.throws) throw new Error(state.throws);
      const path = ctx.manualPath ?? state.path ?? null;
      return {
        available: state.available,
        version: state.version ?? null,
        path: state.available ? path : null,
        message: state.available ? `Tool ${id} da.` : `Tool ${id} fehlt.`,
        installations: state.installations ?? (state.available && path ? [{ version: state.version ?? 'unbekannt', path }] : []),
      };
    },
    installHint: () => ({ command: null, url: `https://example.org/${id}`, requiresAdmin: false }),
    ...extra,
  };
  return { module, seen, state };
}

interface SetupOpts extends IntegrationServiceOptions {
  provided?: Partial<Omit<Services, 'core'>>;
}

function setup(opts: SetupOpts = {}) {
  t = createTestCore();
  let now = 1_000_000;
  (t.core as { clock: { now(): number } }).clock = { now: () => now };
  const notifications = fakeNotifications();
  const s = makeServices(t.core, { notifications: notifications.svc, ...opts.provided });
  s.approvals = createApprovalService(s, { platform: opts.platform ?? 'linux' });
  const { provided: _p, ...serviceOpts } = opts;
  const refreshPath = vi.fn(async () => null);
  const svc = createIntegrationService(s, {
    platform: 'linux',
    env: { HOME: '/home/ana' },
    fs: memFs(opts.platform ?? 'linux'),
    run: scriptedRun({}).run,
    findExecutable: async () => null,
    spawnDetached: vi.fn(async () => undefined),
    refreshPath,
    ...serviceOpts,
  });
  s.integrations = svc;
  const events: IntegrationStatus[][] = [];
  t.core.bus.on('integrations.updated', (list) => events.push(list));
  return {
    s,
    core: t.core,
    svc,
    events,
    sent: notifications.sent,
    refreshPath,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('IntegrationService – detection, cache, manual paths', () => {
  it('lists every built-in integration in order with schema-valid German statuses', async () => {
    const { svc, events } = setup();
    const list = await svc.list();
    expect(list.map((x) => x.id)).toEqual([...BUILTIN_INTEGRATIONS]);
    for (const st of list) {
      expect(IntegrationStatusSchema.safeParse(st).success).toBe(true);
      expect(st.message.length).toBeGreaterThan(5);
    }
    expect(list.find((x) => x.id === 'git')).toMatchObject({ available: false, canOpen: false, manualPath: null, installHint: { command: null, url: 'https://git-scm.com/downloads' } });
    expect(events).toHaveLength(1);
  });

  it('caches results for 10 minutes, refresh forces detection, changes emit integrations.updated', async () => {
    const a = fakeModule('alpha', { available: false });
    const { svc, events, advance } = setup({ modules: [a.module] });
    await svc.list();
    await svc.list();
    await svc.get('alpha');
    expect(a.seen).toHaveLength(1);
    expect(events).toHaveLength(1);
    advance(9 * 60_000);
    await svc.list();
    expect(a.seen).toHaveLength(1);
    advance(60_000);
    await svc.list();
    expect(a.seen).toHaveLength(2);
    expect(events).toHaveLength(1); // nothing changed
    a.state.available = true;
    a.state.path = '/usr/bin/alpha';
    a.state.version = '1.0.0';
    const refreshed = await svc.list(true);
    expect(refreshed[0]).toMatchObject({ available: true, version: '1.0.0', path: '/usr/bin/alpha' });
    expect(events).toHaveLength(2);
    expect(events[1][0].available).toBe(true);
  });

  it('persists statuses: a new service instance reuses fresh rows without detecting again', async () => {
    const a = fakeModule('alpha', { available: true, version: '2.0', path: '/opt/alpha' });
    const { s, svc, core } = setup({ modules: [a.module] });
    await svc.list();
    const b = fakeModule('alpha', { available: false });
    const second = createIntegrationService(s, { platform: 'linux', modules: [b.module], fs: memFs('linux'), run: scriptedRun({}).run, findExecutable: async () => null });
    expect((await second.get('alpha')).version).toBe('2.0');
    expect(b.seen).toHaveLength(0);
    const row = core.db.get<{ last_status: string }>('SELECT last_status FROM integrations WHERE id = ?', ['alpha']);
    expect(IntegrationStatusSchema.parse(JSON.parse(row!.last_status)).path).toBe('/opt/alpha');
  });

  it('setPath validates, persists and passes the manual path to the module; null resets it', async () => {
    const fs = memFs('linux', { '/opt/tools/alpha': '', '/opt/tools/dir/x': '' });
    const a = fakeModule('alpha', { available: true, version: '1.0' });
    const { svc, core, events } = setup({ modules: [a.module], fs });
    await expect(svc.setPath('alpha', 'relative/alpha')).rejects.toThrow(/vollständigen Pfad/);
    await expect(svc.setPath('alpha', '/opt/tools/missing')).rejects.toThrow(/nicht gefunden/);
    await expect(svc.setPath('alpha', '/opt/tools/dir')).rejects.toThrow(/nicht einen Ordner/);
    await expect(svc.setPath('nope', '/opt/tools/alpha')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const st = await svc.setPath('alpha', '  "/opt/tools/alpha"  ');
    expect(st).toMatchObject({ manualPath: '/opt/tools/alpha', path: '/opt/tools/alpha', available: true });
    expect(a.seen.at(-1)).toBe('/opt/tools/alpha');
    expect(events.length).toBeGreaterThan(0);
    expect(core.db.get<{ manual_path: string }>('SELECT manual_path FROM integrations WHERE id = ?', ['alpha'])?.manual_path).toBe('/opt/tools/alpha');
    expect(await svc.resolvePath('alpha')).toBe('/opt/tools/alpha');
    const cleared = await svc.setPath('alpha', null);
    expect(cleared.manualPath).toBeNull();
    expect(a.seen.at(-1)).toBeNull();
  });

  it('resolvePath: detected path, exact version match only (Unity), null for unknown ids or missing tools', async () => {
    const unity = fakeModule('unity', {
      available: true,
      version: '6000.0.23f1',
      path: '/u/6000/Unity',
      installations: [
        { version: '6000.0.23f1', path: '/u/6000/Unity' },
        { version: '2022.3.10f1', path: '/u/2022/Unity' },
      ],
    });
    const missing = fakeModule('ghost', { available: false });
    const { svc } = setup({ modules: [unity.module, missing.module] });
    expect(await svc.resolvePath('unity')).toBe('/u/6000/Unity');
    expect(await svc.resolvePath('unity', { version: '2022.3.10F1' })).toBe('/u/2022/Unity');
    expect(await svc.resolvePath('unity', { version: '2021.1.1f1' })).toBeNull();
    expect(await svc.resolvePath('ghost')).toBeNull();
    expect(await svc.resolvePath('nope')).toBeNull();
  });

  it('get() of unknown ids is NOT_FOUND; failing or invalid modules give an honest unavailable status', async () => {
    const broken = fakeModule('broken', { available: false, throws: 'boom' });
    const invalid: IntegrationModule = {
      id: 'invalid',
      name: 'Kaputt',
      category: 'editor',
      detect: async () => ({ available: true, version: null, path: 42 as unknown as string, message: 'x', installations: [] }),
      installHint: () => null,
    };
    const { svc } = setup({ modules: [broken.module, invalid] });
    await expect(svc.get('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await svc.get('broken')).toMatchObject({ available: false, message: 'Die Prüfung von „Tool broken“ ist fehlgeschlagen: boom' });
    expect(await svc.get('invalid')).toMatchObject({ available: false, canOpen: false, message: 'Die Prüfung von „Kaputt“ hat ein ungültiges Ergebnis geliefert.' });
  });

  it('register() adds modules (modular extension point) and validates them', async () => {
    const { svc } = setup({ modules: [] });
    expect(() => svc.register({ id: 'Bad Id' } as IntegrationModule)).toThrow(NovaError);
    expect(() => svc.register({ id: 'custom' } as IntegrationModule)).toThrow(/detect\(\) und installHint\(\)/);
    svc.register(fakeModule('custom', { available: true, version: '3.1', path: '/c' }).module);
    expect((await svc.list()).map((x) => x.id)).toEqual(['custom']);
    expect(svc.ids()).toEqual(['custom']);
  });
});

// ---------------------------------------------------------------------------------------------------------- installs

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const NPM = 'C:\\Program Files\\nodejs\\npm.cmd';
const WINGET = 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe';

function windowsInstallSetup(opts: { wingetAvailable?: boolean; nodeInstalled?: boolean; installExit?: number; installNode?: boolean } = {}) {
  const fs: MemFs = memFs('win32');
  const which: Record<string, string | null> = {};
  const script: RunScript = {};
  const installNode = () => {
    fs.add(NODE);
    fs.add(NPM);
    which.node = NODE;
    which['npm.cmd'] = NPM;
    script[`${NODE} --version`] = { code: 0, stdout: 'v22.11.0\r\n' };
    script[`${NPM} --version`] = { code: 0, stdout: '10.9.0\r\n' };
  };
  if (opts.wingetAvailable !== false) {
    fs.add(WINGET);
    which.winget = WINGET;
    script[`${WINGET} --version`] = { code: 0, stdout: 'v1.9.25200\r\n' };
  }
  if (opts.nodeInstalled) installNode();
  const runs: RunCommandInput[] = [];
  const processes = {
    run: vi.fn(async (input: RunCommandInput) => {
      runs.push(input);
      if (opts.installNode !== false && (opts.installExit ?? 0) === 0) installNode();
      return result({ exitCode: opts.installExit ?? 0, output: 'Found Node.js LTS [OpenJS.NodeJS.LTS]\nSuccessfully installed' });
    }),
  } as unknown as ProcessManager;
  const ctx = setup({
    platform: 'win32',
    env: WIN_ENV,
    fs,
    run: scriptedRun(script).run,
    findExecutable: async (name) => which[name] ?? null,
    provided: { processes },
  });
  return { ...ctx, runs, processes, fs };
}

describe('IntegrationService – installs (winget, Windows simulated)', () => {
  it('outside Windows: no approval, German hint to install manually', async () => {
    const { svc, s } = setup();
    const r = await svc.requestInstall('git');
    expect(r).toEqual({ approvalId: null, message: 'Automatische Installationen gibt es nur unter Windows (winget). Bitte „Git“ manuell installieren: https://git-scm.com/downloads' });
    expect(s.approvals.list()).toHaveLength(0);
  });

  it('creates an install approval with the exact winget command; installs only after approval, exactly once', async () => {
    const { svc, s, core, runs, events, sent, refreshPath } = windowsInstallSetup();
    const command = wingetCommandFor('node')!;
    const r = await svc.requestInstall('node');
    expect(r.approvalId).toEqual(expect.any(String));
    expect(r.message).toContain('Freigabe');
    expect(runs).toHaveLength(0);
    const approval = s.approvals.get(r.approvalId!)!;
    expect(approval).toMatchObject({ kind: 'install', status: 'pending', projectId: null, taskId: null });
    expect(approval.fingerprint).toBe(s.approvals.fingerprint('install', null, command));
    expect(approval.action).toContain(command);
    expect(approval.consequences).toContain('Lizenzbedingungen');
    expect(approval.consequences).toContain('Benutzerkontensteuerung (UAC)');
    expect(command).toBe('winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity');
    // asking again reuses the pending approval
    expect((await svc.requestInstall('npm')).approvalId).toBe(r.approvalId);

    s.approvals.decide(r.approvalId!, 'approve', 'once');
    await svc.whenIdle();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ command, kind: 'install', cwd: core.paths.root, projectId: null, taskId: null });
    expect(refreshPath).toHaveBeenCalledWith(true);
    expect((await svc.get('node')).available).toBe(true);
    expect((await svc.get('npm')).version).toBe('10.9.0'); // related integration refreshed too
    expect(events.at(-1)!.find((x) => x.id === 'node')).toMatchObject({ available: true, version: '22.11.0' });
    expect(sent.at(-1)).toMatchObject({ level: 'success', title: '„Node.js“ wurde installiert' });
    expect(sent.at(-1)!.body).not.toContain('winget');
    expect(core.db.get<{ consumed_at: number | null }>('SELECT consumed_at FROM approvals WHERE id = ?', [r.approvalId!])?.consumed_at).not.toBeNull();
    expect(core.operations.list(false).some((o) => o.kind === 'install' && o.status === 'done')).toBe(true);

    s.approvals.decide(r.approvalId!, 'approve', 'once'); // idempotent, no second install
    await svc.whenIdle();
    expect(runs).toHaveLength(1);
    expect(await svc.requestInstall('node')).toEqual({ approvalId: null, message: '„Node.js“ ist bereits installiert (Version 22.11.0).' });
  });

  it('a decision made before any service call (bus listener) still installs, de-duplicated with onDecision', async () => {
    const { svc, s, runs } = windowsInstallSetup();
    const command = wingetCommandFor('git')!;
    // approval created by someone else with the same request shape (e.g. before a restart of the UI)
    const created = s.approvals.check({
      projectId: null,
      kind: 'install',
      title: 'Git installieren?',
      action: command,
      consequences: '…',
      subject: command,
      details: { integrationId: 'git' },
    });
    if (created.state !== 'pending') throw new Error('expected pending');
    await svc.list(); // subscribes onDecision as well
    s.approvals.decide(created.approval.id, 'approve', 'once');
    await svc.whenIdle();
    expect(runs.map((r) => r.command)).toEqual([command]);
  });

  it('approvals whose command does not match the fixed package table are ignored', async () => {
    const { svc, s, runs } = windowsInstallSetup();
    const evil = s.approvals.check({
      projectId: null,
      kind: 'install',
      title: 'x',
      action: 'x',
      consequences: 'x',
      subject: 'winget install --id Evil.Package -e',
      details: { integrationId: 'git' },
    });
    if (evil.state !== 'pending') throw new Error('expected pending');
    s.approvals.decide(evil.approval.id, 'approve', 'once');
    await svc.whenIdle();
    expect(runs).toHaveLength(0);
  });

  it('a denial installs nothing, is acknowledged, and a new request asks again', async () => {
    const { svc, s, runs } = windowsInstallSetup();
    const first = await svc.requestInstall('git');
    s.approvals.decide(first.approvalId!, 'deny', 'once');
    await svc.whenIdle();
    expect(runs).toHaveLength(0);
    const again = await svc.requestInstall('git');
    expect(again.approvalId).not.toBe(first.approvalId);
    expect(s.approvals.get(again.approvalId!)?.status).toBe('pending');
  });

  it('an "always" rule for the command starts later installs immediately', async () => {
    const { svc, s, runs } = windowsInstallSetup({ installNode: false });
    const first = await svc.requestInstall('dotnet');
    s.approvals.decide(first.approvalId!, 'approve', 'always');
    await svc.whenIdle();
    expect(runs).toHaveLength(1);
    const second = await svc.requestInstall('dotnet'); // still not detected → rule allows a new attempt
    expect(second.message).toContain('wurde gestartet (bereits freigegeben)');
    await svc.whenIdle();
    expect(runs).toHaveLength(2);
  });

  it('a failing winget run reports TOOL_MISSING with the outcome and notifies', async () => {
    const { svc, s, core, sent } = windowsInstallSetup({ installExit: 0x8a150014 });
    const r = await svc.requestInstall('node');
    s.approvals.decide(r.approvalId!, 'approve', 'once');
    await svc.whenIdle();
    const err = core.errors.list().find((e) => e.code === 'TOOL_MISSING');
    expect(err).toMatchObject({ severity: 'warning', title: 'Installation von „Node.js“ fehlgeschlagen', whatHappened: 'Das Paket wurde in der winget-Quelle nicht gefunden.' });
    expect(err?.userAction).toContain('https://nodejs.org/');
    expect(sent.at(-1)).toMatchObject({ level: 'error', category: 'error' });
  });

  it('missing winget, already installed tools, Playwright and Unreal get explanations instead of approvals', async () => {
    const noWinget = windowsInstallSetup({ wingetAvailable: false });
    expect((await noWinget.svc.requestInstall('git')).message).toContain('App-Installer');
    expect(noWinget.s.approvals.list()).toHaveLength(0);
    t?.cleanup();
    t = null;
    const ctx = windowsInstallSetup({ nodeInstalled: true });
    expect((await ctx.svc.requestInstall('node')).message).toBe('„Node.js“ ist bereits installiert (Version 22.11.0).');
    expect((await ctx.svc.requestInstall('playwright')).message).toContain('npm install -D @playwright/test');
    expect((await ctx.svc.requestInstall('unreal')).message).toContain('https://www.unrealengine.com/download');
    await expect(ctx.svc.requestInstall('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(ctx.s.approvals.list()).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------------------------------------------ open

function project(path: string, engineVersion: string | null = null): Project {
  return { id: 'prj_1', name: 'Spiel', path, config: { engineVersion } } as unknown as Project;
}

function openSetup(fs: MemFs, modules: IntegrationModule[], proj: Project) {
  const projects = { get: (id: string) => (id === proj.id ? proj : null) } as unknown as ProjectService;
  const pathGuard = {
    resolve: (root: string, p: string) => {
      if (p.includes('..')) throw new NovaError('PATH_OUTSIDE_PROJECT', 'Pfad liegt außerhalb des Projekts.');
      return { abs: `${root}/${p}`, rel: p, key: p };
    },
  } as unknown as PathGuard;
  const spawnDetached = vi.fn(async () => undefined);
  const ctx = setup({ fs, modules, spawnDetached, provided: { projects, pathGuard } });
  return { ...ctx, spawnDetached };
}

describe('IntegrationService – open', () => {
  it('opens a file at a line in the editor (detached user action)', async () => {
    const fs = memFs('linux', { '/home/ana/spiel/src/main.ts': '' });
    const editor = fakeModule(
      'vscode',
      { available: true, version: '1.95.3', path: '/usr/bin/code' },
      { open: ({ executable, projectRoot, file, line }) => ({ file: executable, args: [projectRoot, '-g', `${file}:${line}`] }) },
    );
    const { svc, spawnDetached } = openSetup(fs, [editor.module], project('/home/ana/spiel'));
    expect((await svc.get('vscode')).canOpen).toBe(true);
    await svc.open({ id: 'vscode', projectId: 'prj_1', path: 'src/main.ts', line: 7 });
    expect(spawnDetached).toHaveBeenCalledWith('/usr/bin/code', ['/home/ana/spiel', '-g', '/home/ana/spiel/src/main.ts:7'], { cwd: '/home/ana/spiel' });
    await expect(svc.open({ id: 'vscode', projectId: 'prj_1', path: 'src/main.ts', line: 0 })).rejects.toThrow(/Zeilennummer/);
    await expect(svc.open({ id: 'vscode', projectId: 'prj_1', path: '../etc/passwd' })).rejects.toMatchObject({ code: 'PATH_OUTSIDE_PROJECT' });
    await expect(svc.open({ id: 'vscode', projectId: 'prj_x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('passes the project engine version and installations to the module', async () => {
    const fs = memFs('linux', { '/home/ana/kart/Assets/x': '' });
    const calls: unknown[] = [];
    const unity = fakeModule(
      'unity',
      { available: true, version: '6000.0.23f1', path: '/u/6000', installations: [{ version: '6000.0.23f1', path: '/u/6000' }, { version: '2022.3.10f1', path: '/u/2022' }] },
      {
        open: (input) => {
          calls.push(input);
          return { file: '/u/2022', args: ['-projectPath', input.projectRoot] };
        },
      },
    );
    const { svc, spawnDetached } = openSetup(fs, [unity.module], project('/home/ana/kart', '2022.3.10f1'));
    await svc.open({ id: 'unity', projectId: 'prj_1' });
    expect(calls[0]).toMatchObject({ executable: '/u/6000', projectRoot: '/home/ana/kart', engineVersion: '2022.3.10f1', file: undefined });
    expect(spawnDetached).toHaveBeenCalledWith('/u/2022', ['-projectPath', '/home/ana/kart'], { cwd: '/home/ana/kart' });
  });

  it('refuses modules without open(), missing tools and missing project folders', async () => {
    const fs = memFs('linux', { '/home/ana/spiel/a': '' });
    const plain = fakeModule('git', { available: true, version: '2.43.0', path: '/usr/bin/git' });
    const missing = fakeModule('vscode', { available: false }, { open: () => ({ file: 'code', args: [] }) });
    const { svc, spawnDetached } = openSetup(fs, [plain.module, missing.module], project('/home/ana/spiel'));
    await expect(svc.open({ id: 'git', projectId: 'prj_1' })).rejects.toThrow(/kann keine Projekte oder Dateien öffnen/);
    await expect(svc.open({ id: 'vscode', projectId: 'prj_1' })).rejects.toMatchObject({ code: 'TOOL_MISSING' });
    fs.remove('/home/ana/spiel');
    await expect(svc.open({ id: 'git', projectId: 'prj_1' })).rejects.toThrow(/Projektordner wurde nicht gefunden/);
    expect(spawnDetached).not.toHaveBeenCalled();
  });
});

describe('IntegrationService – default detached spawner', () => {
  function spawnerSetup(platform: NodeJS.Platform, file: string, args: string[]) {
    t = createTestCore();
    const proj = project(t.dir);
    const tool: IntegrationModule = {
      id: 'tool',
      name: 'Werkzeug',
      category: 'editor',
      detect: async () => ({ available: true, version: '1.0.0', path: file, message: 'ok', installations: [] }),
      installHint: () => null,
      open: () => ({ file, args }),
    };
    const s = makeServices(t.core, {
      notifications: fakeNotifications().svc,
      projects: { get: (id: string) => (id === proj.id ? proj : null) } as unknown as ProjectService,
    });
    s.approvals = createApprovalService(s);
    const fs = memFs(platform);
    fs.addDir(t.dir);
    return createIntegrationService(s, { platform, modules: [tool], fs, run: scriptedRun({}).run, findExecutable: async () => null });
  }

  it('starts the program detached and returns once it is running', async () => {
    const svc = spawnerSetup('linux', process.execPath, ['-e', 'process.exit(0)']);
    await expect(svc.open({ id: 'tool', projectId: 'prj_1' })).resolves.toBeUndefined();
  });

  it('a missing program is TOOL_MISSING', async () => {
    const svc = spawnerSetup('linux', '/nonexistent/nova-tool', []);
    await expect(svc.open({ id: 'tool', projectId: 'prj_1' })).rejects.toMatchObject({ code: 'TOOL_MISSING' });
  });

  it('Windows .cmd shims are refused for arguments that cmd.exe could interpret', async () => {
    const svc = spawnerSetup('win32', 'C:\\Tools\\code.cmd', ['C:\\Projekte\\A&B']);
    await expect(svc.open({ id: 'tool', projectId: 'prj_1' })).rejects.toThrow(/über eine .cmd-Datei nicht sicher übergeben/);
  });
});

describe('userProgramEnv', () => {
  it('drops the CI/no-color switches that buildChildEnv forces unless the user had them', () => {
    const env = userProgramEnv('linux', { NO_COLOR: '1' });
    expect(env.CI).toBeUndefined();
    expect(env.FORCE_COLOR).toBeUndefined();
    expect(env.npm_config_yes).toBeUndefined();
    expect(env.NO_COLOR).toBe('1');
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });
});
