// Orchestrator tests – RPC registration/handlers (contract-validated results) and dashboard.summary robustness.
import { describe, it, expect, afterEach } from 'vitest';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import type { BudgetStatus, DaemonStatus, OllamaStatus, ProviderConfig, ProviderHealth } from '@shared/schemas';
import type { RpcRouter, Services } from '../contracts';
import { registerTasksRpc } from './rpc';
import { buildDashboardSummary } from './dashboard';
import { createHarness, defaultConfig, type Harness } from './test-support';

let h: Harness;
afterEach(async () => {
  await h.cleanup();
});

function router(s: Services) {
  const handlers = new Map<string, (params: unknown, ctx: { requestId: string }) => unknown>();
  const r = {
    register: (m: string, fn: (params: unknown, ctx: { requestId: string }) => unknown) => handlers.set(m, fn),
    handle: async () => {
      throw new Error('not used');
    },
    registered: () => [...handlers.keys()],
  } as unknown as RpcRouter;
  registerTasksRpc(r, s);
  return {
    methods: () => [...handlers.keys()].sort(),
    async call<M extends RpcMethod>(method: M, params: unknown) {
      const def = RpcContract[method];
      const parsed = def.params.parse(params);
      const res = await handlers.get(method)!(parsed, { requestId: 'req_1' });
      return def.result.parse(res) as never;
    },
  };
}

const EXPECTED = [
  'dashboard.summary',
  'errors.list',
  'errors.resolve',
  'tasks.addNote',
  'tasks.create',
  'tasks.createFix',
  'tasks.delete',
  'tasks.get',
  'tasks.list',
  'tasks.notes',
  'tasks.pause',
  'tasks.plan',
  'tasks.resume',
  'tasks.retry',
  'tasks.setPriority',
  'tasks.start',
  'tasks.stop',
  'tasks.update',
  'work.pause',
  'work.resume',
  'work.start',
  'work.status',
  'work.stop',
];

describe('registerTasksRpc', () => {
  it('registers exactly the orchestrator methods and they return contract-valid results', async () => {
    h = createHarness();
    const rpc = router(h.s);
    expect(rpc.methods()).toEqual(EXPECTED);
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    const created: { id: string } = await rpc.call('tasks.create', { projectId: p.id, title: 'Erste Aufgabe' });
    expect(((await rpc.call('tasks.list', { projectId: p.id })) as unknown[]).length).toBe(1);
    expect(await rpc.call('tasks.update', { id: created.id, description: 'mehr' })).toMatchObject({ description: 'mehr' });
    expect(await rpc.call('tasks.setPriority', { id: created.id, priority: 3 })).toMatchObject({ priority: 3 });
    expect(await rpc.call('tasks.pause', { id: created.id })).toMatchObject({ status: 'paused' });
    expect(await rpc.call('tasks.resume', { id: created.id })).toMatchObject({ status: 'queued', startRequested: true });
    expect(await rpc.call('tasks.addNote', { taskId: created.id, text: 'Bitte TypeScript' })).toMatchObject({ kind: 'note', author: 'user' });
    expect(((await rpc.call('tasks.notes', { taskId: created.id })) as unknown[]).length).toBe(1);
    expect(await rpc.call('work.pause', {})).toMatchObject({ state: 'paused' });
    expect(await rpc.call('work.status', {})).toMatchObject({ state: 'paused', idleReason: 'Arbeit pausiert' });
    expect(await rpc.call('work.resume', {})).toMatchObject({ state: 'running' });
    expect(await rpc.call('work.stop', { projectId: p.id })).toMatchObject({ projects: [{ projectId: p.id, state: 'stopped' }] });
    expect(await rpc.call('work.start', { projectId: p.id })).toMatchObject({ projects: [{ projectId: p.id, state: 'running' }] });
    const plan: { id: string } = await rpc.call('tasks.plan', { projectId: p.id, goal: 'Neue Startseite' });
    expect(await rpc.call('tasks.get', { id: plan.id })).toMatchObject({ kind: 'plan', startRequested: true });
    await h.drain();
    expect(await rpc.call('tasks.get', { id: created.id })).toMatchObject({ status: 'done' });
    expect(await rpc.call('tasks.retry', { id: created.id })).toMatchObject({ status: 'queued', attempts: 0 });
    expect(await rpc.call('tasks.stop', { id: created.id })).toMatchObject({ status: 'cancelled' });
    expect(await rpc.call('tasks.start', { id: created.id })).toMatchObject({ status: 'queued' });
    const fix: { id: string } = await rpc.call('tasks.createFix', { projectId: p.id, note: 'Knopf geht nicht' });
    expect(await rpc.call('tasks.delete', { id: fix.id })).toEqual({ ok: true });
    await expect(rpc.call('tasks.get', { id: fix.id })).rejects.toThrow(/nicht gefunden/);
  });

  it('lists and resolves errors (NOT_FOUND for unknown ids)', async () => {
    h = createHarness();
    const rpc = router(h.s);
    const p = h.projects.add();
    const e = h.core.errors.report({ code: 'TESTS_FAILED', severity: 'blocker', title: 'Tests rot', whatHappened: 'x', projectId: p.id });
    expect(await rpc.call('errors.list', { projectId: p.id })).toHaveLength(1);
    expect(await rpc.call('errors.resolve', { id: e.id })).toEqual({ ok: true });
    expect(await rpc.call('errors.list', {})).toHaveLength(0);
    expect(await rpc.call('errors.list', { includeResolved: true })).toHaveLength(1);
    await expect(rpc.call('errors.resolve', { id: 'err_missing' })).rejects.toThrow(/nicht gefunden/);
  });
});

describe('dashboard.summary', () => {
  it('never fails when every source fails and returns a contract-valid summary', async () => {
    h = createHarness();
    const boom = () => {
      throw new Error('Quelle kaputt');
    };
    const s = h.s;
    s.daemon = { status: boom } as unknown as Services['daemon'];
    s.work = { ...h.work, status: boom } as unknown as Services['work'];
    s.projects = { list: boom } as unknown as Services['projects'];
    s.runs = { list: boom } as unknown as Services['runs'];
    s.checks = { recent: boom, currentFailures: boom } as unknown as Services['checks'];
    s.approvals = { pendingCount: boom } as unknown as Services['approvals'];
    s.notifications = { unreadCount: boom } as unknown as Services['notifications'];
    // ollama, providers, budget, resources, secrets are not provided at all → the proxy throws
    const res = RpcContract['dashboard.summary'].result.parse(buildDashboardSummary(s));
    expect(res.daemon).toMatchObject({ state: 'error', version: h.core.version, methods: [] });
    expect(res.daemon.lastError).toContain('Quelle kaputt');
    expect(res.work.idleReason).toContain('Arbeitsstatus nicht verfügbar');
    expect(res).toMatchObject({ projects: [], activeRuns: [], recentBuilds: [], failedTests: [], pendingApprovals: 0, unreadNotifications: 0, budget: null, resources: null });
    expect(res.models).toEqual({ local: null, cloud: [], defaultModel: null });
  });

  it('aggregates cached local data from all sources', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    h.tasks.create({ projectId: p.id, title: 'Offen' } as never);
    h.checks.add({ projectId: p.id, kind: 'build', status: 'passed' });
    h.checks.add({ projectId: p.id, kind: 'build', status: 'failed' });
    h.checks.add({ projectId: p.id, kind: 'test', status: 'failed' });
    h.core.errors.report({ code: 'X', severity: 'warning', title: 'Hinweis', whatHappened: 'y' });
    h.approvals.add();
    h.core.settings.update({ models: { defaultModel: { providerId: 'ollama-local', modelId: 'qwen2.5-coder:7b' } } });
    h.core.db.run("INSERT INTO model_profiles(provider_id, model_id, info, pricing, updated_at) VALUES ('ollama-local', 'a', '{}', NULL, 0), ('ollama-local', 'b', '{}', NULL, 0), ('openai', 'gpt', '{}', NULL, 0)");
    const daemon: DaemonStatus = {
      state: 'running',
      version: '1.0.0',
      pid: 1,
      instanceId: 'inst_1',
      startedAt: 1,
      dataDir: h.t.dir,
      dbSchemaVersion: 1,
      work: 'running',
      activeRuns: 0,
      lastError: null,
      recovered: { tasks: 0, orphanProcesses: 0 },
      platform: 'linux',
      previousShutdown: null,
      secretStore: { scheme: 'memory', secure: true },
      methods: ['dashboard.summary'],
    };
    const ollama: OllamaStatus = { installed: true, running: true, baseUrl: 'http://127.0.0.1:11434', version: '0.12.0', binaryPath: null, message: 'Ollama läuft.', checkedAt: 1 };
    const health = (providerId: string): ProviderHealth => ({ providerId, status: 'ok', message: 'ok', version: null, checkedAt: 1, latencyMs: 5 });
    const providers = [
      { id: 'ollama-local', type: 'ollama' },
      { id: 'openai', type: 'openai_compatible' },
    ] as ProviderConfig[];
    const budget = {
      dailyLimitUsd: 1,
      monthlyLimitUsd: 10,
      spentTodayUsd: 0.1,
      spentMonthUsd: 2,
      remainingTodayUsd: 0.9,
      remainingMonthUsd: 8,
      containsEstimates: true,
      paidPaused: false,
      pausedReason: null,
      perProject: [],
      reservedUsd: 0,
      tokensToday: { input: 10, output: 5 },
      tokensMonth: { input: 100, output: 50 },
      localRuntimeMsToday: 0,
      cloudRuntimeMsToday: 0,
      localRuntimeMsMonth: 0,
      cloudRuntimeMsMonth: 0,
    } satisfies BudgetStatus;
    const s = h.s;
    s.daemon = { status: () => daemon };
    s.ollama = { lastStatus: () => ollama } as unknown as Services['ollama'];
    s.providers = { lastHealth: () => [health('ollama-local'), health('openai')], list: () => providers } as unknown as Services['providers'];
    s.budget = { status: () => budget } as unknown as Services['budget'];
    s.resources = { latest: () => null } as unknown as Services['resources'];
    const res = RpcContract['dashboard.summary'].result.parse(buildDashboardSummary(s));
    expect(res.daemon).toEqual(daemon);
    expect(res.work.projects).toHaveLength(1);
    expect(res.projects.map((x) => x.id)).toEqual([p.id]);
    expect(res.openTasks).toBe(1);
    expect(res.recentBuilds.map((c) => c.status)).toEqual(['passed']);
    expect(res.failedTests).toHaveLength(1);
    expect(res.errors).toHaveLength(1);
    expect(res.pendingApprovals).toBe(1);
    expect(res.budget?.spentMonthUsd).toBe(2);
    expect(res.models).toEqual({ local: { status: ollama, modelCount: 2 }, cloud: [health('openai')], defaultModel: 'ollama-local/qwen2.5-coder:7b' });
  });

  it('counts like the pages it links to: all open errors (not the newest 20), failed tasks are open', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    for (let i = 0; i < 35; i++) h.core.errors.report({ code: 'X', severity: i < 30 ? 'warning' : 'blocker', title: `Fehler ${i}`, whatHappened: 'y', dedupeKey: `e${i}` });
    const failed = h.tasks.create({ projectId: p.id, title: 'Fehlgeschlagen' } as never);
    h.tasks.patch(failed.id, { status: 'failed' });
    const done = h.tasks.create({ projectId: p.id, title: 'Erledigt' } as never);
    h.tasks.patch(done.id, { status: 'done' });
    h.tasks.create({ projectId: p.id, title: 'Wartet' } as never);
    const res = RpcContract['dashboard.summary'].result.parse(buildDashboardSummary(h.s));
    expect(res.errors).toHaveLength(35);
    expect(res.errors.filter((e) => e.severity === 'blocker')).toHaveLength(5);
    expect(res.openTasks).toBe(2);
  });
});
