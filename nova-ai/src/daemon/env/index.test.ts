// Tests for registerEnvRpc: exactly the env methods (approvals.*, resources.*, integrations.*, updates.check) are
// registered, params are parsed like the real router and every result matches the RPC contract schema.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RPC_METHODS, RpcContract, type RpcMethod } from '@shared/rpc';
import type { Notification, Project } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { IntegrationModule, NotificationService, OllamaService, PathGuard, ProcessManager, ProjectService, RpcHandler, RpcRouter, Services } from '../contracts';
import {
  createApprovalService,
  createConcurrencyGovernor,
  createIntegrationService,
  createResourceMonitor,
  createSecretStore,
  createUpdateService,
  registerEnvRpc,
} from './index';
import { memFs, scriptedRun } from '../integrations/test-helpers';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

function stubRouter() {
  const handlers = new Map<string, RpcHandler<RpcMethod>>();
  const router: RpcRouter = {
    register(method, handler) {
      if (handlers.has(method)) throw new Error(`registered twice: ${method}`);
      handlers.set(method, handler as unknown as RpcHandler<RpcMethod>);
    },
    async handle() {
      throw new Error('not used');
    },
    registered: () => [...handlers.keys()],
  };
  const call = async (method: RpcMethod, params: unknown = {}) => {
    const parsed = (RpcContract[method].params as { parse(v: unknown): unknown }).parse(params);
    const result = await handlers.get(method)!(parsed as never, { requestId: 'r1' });
    return (RpcContract[method].result as { parse(v: unknown): unknown }).parse(result) as never;
  };
  return { router, handlers, call };
}

const notifications: NotificationService = {
  notify: (input) => ({ ...input, id: 'ntf_1', ts: Date.now(), readAt: null }) as Notification,
  list: () => [],
  markRead: () => undefined,
  unreadCount: () => 0,
  prune: () => 0,
};

function setup() {
  t = createTestCore();
  const projectDir = t.dir;
  const project = { id: 'prj_1', name: 'Spiel', path: projectDir, config: { engineVersion: null } } as unknown as Project;
  const s: Services = makeServices(t.core, {
    notifications,
    ollama: { running: async () => [] } as unknown as OllamaService,
    processes: { runningCount: () => 0, list: () => [] } as unknown as ProcessManager,
    projects: { get: (id: string) => (id === 'prj_1' ? project : null) } as unknown as ProjectService,
    pathGuard: { resolve: (root: string, p: string) => ({ abs: `${root}/${p}`, rel: p, key: p }) } as unknown as PathGuard,
  });
  const spawnDetached = vi.fn(async () => undefined);
  const editor: IntegrationModule = {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'editor',
    detect: async () => ({ available: true, version: '1.95.3', path: '/usr/bin/code', message: 'Visual Studio Code 1.95.3 ist installiert.', installations: [{ version: '1.95.3', path: '/usr/bin/code' }] }),
    installHint: () => ({ command: null, url: 'https://code.visualstudio.com/download', requiresAdmin: false }),
    open: ({ executable, projectRoot }) => ({ file: executable, args: [projectRoot] }),
  };
  s.secrets = createSecretStore(s, { scheme: 'memory' });
  s.approvals = createApprovalService(s);
  s.resources = createResourceMonitor(s, { gpu: { findExecutable: async () => null }, firstGpuWaitMs: 50, firstOllamaWaitMs: 50 });
  s.governor = createConcurrencyGovernor(s);
  s.integrations = createIntegrationService(s, {
    platform: 'linux',
    modules: [editor],
    fs: memFs('linux', { [`${projectDir}/x`]: '', '/usr/bin/code': '' }),
    run: scriptedRun({}).run,
    findExecutable: async () => null,
    spawnDetached,
  });
  s.updates = createUpdateService(s, { fetch: vi.fn() as unknown as typeof fetch });
  const r = stubRouter();
  registerEnvRpc(r.router, s);
  return { s, ...r, spawnDetached, projectDir };
}

describe('registerEnvRpc', () => {
  it('registers exactly the env methods of the RPC contract', () => {
    const { router } = setup();
    const expected = RPC_METHODS.filter((m) => /^(approvals|resources|integrations)\./.test(m) || m === 'updates.check').sort();
    expect(router.registered().sort()).toEqual(expected);
    expect(expected).toContain('integrations.open');
  });

  it('approvals.* round trip with contract-valid results', async () => {
    const { s, call } = setup();
    expect(await call('approvals.list')).toEqual([]);
    const c = s.approvals.check({ projectId: 'prj_1', taskId: 'task_1', kind: 'publish', title: 'Veröffentlichen?', action: 'git push', consequences: 'Code wird hochgeladen.', subject: 'git push' });
    if (c.state !== 'pending') throw new Error('expected pending');
    expect(await call('approvals.list', { status: 'pending', projectId: 'prj_1' })).toHaveLength(1);
    await expect(call('approvals.decide', { id: c.approval.id, decision: 'approve', scope: 'always' })).rejects.toMatchObject({ code: 'VALIDATION' });
    expect(await call('approvals.decide', { id: c.approval.id, decision: 'approve' })).toMatchObject({ status: 'approved', scope: 'once' });

    const n = s.approvals.check({ projectId: 'prj_1', taskId: 'task_1', kind: 'network', title: 'Netzwerk?', action: 'curl', consequences: '…', subject: 'example.org' });
    if (n.state !== 'pending') throw new Error('expected pending');
    await call('approvals.decide', { id: n.approval.id, decision: 'approve', scope: 'always' });
    const rules = (await call('approvals.rules')) as Array<{ id: string }>;
    expect(rules).toHaveLength(1);
    expect(await call('approvals.deleteRule', { id: rules[0].id })).toEqual({ ok: true });
    await expect(call('approvals.deleteRule', { id: rules[0].id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('resources.snapshot samples once when nothing was measured yet; history filters by minutes', async () => {
    const { call } = setup();
    const snap = (await call('resources.snapshot')) as { cpu: { cores: number }; gpuNote: string | null; disks: unknown[] };
    expect(snap.cpu.cores).toBeGreaterThan(0);
    expect(snap.disks.length).toBeGreaterThan(0);
    expect(snap.gpuNote).toContain('nvidia-smi nicht gefunden');
    expect(await call('resources.history', { minutes: 5 })).toHaveLength(1);
    expect(await call('resources.history')).toHaveLength(1);
  });

  it('integrations.* and updates.check', async () => {
    const { call, spawnDetached, projectDir } = setup();
    const list = (await call('integrations.list')) as Array<{ id: string; canOpen: boolean }>;
    expect(list).toEqual([expect.objectContaining({ id: 'vscode', canOpen: true })]);
    expect(await call('integrations.setPath', { id: 'vscode', path: null })).toMatchObject({ id: 'vscode', manualPath: null });
    expect(await call('integrations.install', { id: 'vscode' })).toEqual({
      approvalId: null,
      message: 'Automatische Installationen gibt es nur unter Windows (winget). Bitte „Visual Studio Code“ manuell installieren: https://code.visualstudio.com/download',
    });
    expect(await call('integrations.open', { id: 'vscode', projectId: 'prj_1' })).toEqual({ ok: true });
    expect(spawnDetached).toHaveBeenCalledWith('/usr/bin/code', [projectDir], { cwd: projectDir });
    expect(await call('updates.check')).toMatchObject({ updateAvailable: false, message: 'Keine Update-Quelle eingerichtet.' });
  });
});
