import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RPC_METHODS, RpcContract, type RpcMethod } from '@shared/rpc';
import type { AnyNovaEvent } from '@shared/events';
import {
  emitMockEvent,
  getMockCalls,
  getMockDb,
  installMockBridge,
  mockBridge,
  mockHandlers,
  MockRpcError,
  resetMockData,
  setMockConnection,
  uninstallMockBridge,
} from './mock-bridge';
import { AETHER, PIXEL, REZEPT } from './mock-data';
import { DEMO_REFERENCE_PNG_BASE64 } from './mock-threed-assets';

type ParamsFn = () => unknown;

/** Sample params for every RPC method (functions are evaluated lazily for ids created earlier). */
const SAMPLE: Record<RpcMethod, unknown | ParamsFn> = {
  'daemon.status': undefined,
  'daemon.shutdown': { reason: 'test' },
  'daemon.diagnostics': undefined,
  'daemon.logs': { limit: 50, level: 'warn' },
  'dashboard.summary': undefined,
  'projects.list': undefined,
  'projects.get': { id: PIXEL },
  'projects.create': { mode: 'description', name: 'Testprojekt', description: 'Ein kleines Browser-Spiel' },
  'projects.update': { id: PIXEL, description: 'Neu', config: { commands: { lint: 'npm run lint -- --fix' } } },
  'projects.detect': { id: PIXEL },
  'projects.remove': { id: AETHER },
  'projects.setWork': { id: AETHER, enabled: true },
  'templates.list': undefined,
  'tasks.list': { projectId: PIXEL },
  'tasks.get': { id: 'task_px3' },
  'tasks.create': { projectId: PIXEL, title: 'Neue Aufgabe' },
  'tasks.update': { id: 'task_px5', title: 'Level 2 (Höhle)' },
  'tasks.setPriority': { id: 'task_px6', priority: 2 },
  'tasks.start': { id: 'task_px7' },
  'tasks.pause': { id: 'task_px3' },
  'tasks.resume': { id: 'task_px3' },
  'tasks.stop': { id: 'task_rz6' },
  'tasks.retry': { id: 'task_ae1' },
  'tasks.delete': { id: 'task_px9' },
  'tasks.notes': { taskId: 'task_rz4' },
  'tasks.addNote': { taskId: 'task_rz4', text: 'Ja, Testdatenbank zurücksetzen' },
  'tasks.createFix': { projectId: PIXEL, checkRunId: 'crun_px_t2' },
  'tasks.plan': { projectId: PIXEL, goal: 'Level 3 mit Endgegner bauen' },
  'work.status': undefined,
  'work.start': {},
  'work.pause': { projectId: PIXEL },
  'work.resume': { projectId: PIXEL },
  'work.stop': { projectId: REZEPT },
  'agents.roles': undefined,
  'agents.runs': { activeOnly: true },
  'agents.steps': { runId: 'run_px3' },
  'errors.list': {},
  'errors.resolve': { id: 'err_vram' },
  'approvals.list': {},
  'approvals.decide': { id: 'apr_px_cmd', decision: 'approve', scope: 'always' },
  'approvals.rules': undefined,
  'approvals.deleteRule': { id: 'rule_2' },
  'providers.list': undefined,
  'providers.upsert': { type: 'openai_compatible', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' },
  'providers.remove': { id: 'lm-studio' },
  'providers.setApiKey': { providerId: 'openrouter', apiKey: 'sk-test-123' },
  'providers.clearApiKey': { providerId: 'openrouter' },
  'providers.test': { providerId: 'ollama-local' },
  'providers.health': undefined,
  'models.list': undefined,
  'models.getSelection': undefined,
  'models.setSelection': { temperature: 0.3 },
  'models.setPricing': { providerId: 'openrouter', modelId: 'deepseek/deepseek-chat-v3.1', pricing: { inputPerMTokUsd: 0.27, outputPerMTokUsd: 1.1, estimated: true } },
  'ollama.status': {},
  'ollama.models': undefined,
  'ollama.show': { model: 'llama3.1:8b' },
  'ollama.pull': { model: 'qwen2.5-coder:7b' },
  'ollama.pulls': undefined,
  'ollama.cancelPull': () => ({ id: getMockDb().pulls[0].id }),
  'ollama.delete': { model: 'nomic-embed-text:latest' },
  'ollama.running': undefined,
  'ollama.fit': { model: 'qwen2.5-coder:32b' },
  'threed.status': { refresh: true },
  'threed.configure': { modelsDir: 'D:\\ComfyUI\\models' },
  'threed.models': undefined,
  'threed.downloadModel': { id: 'pixal3d' },
  'threed.deleteModel': { id: 'z_image_turbo' },
  'threed.generate': { mode: 'image', imageBase64: DEMO_REFERENCE_PNG_BASE64, name: 'kiste', projectId: PIXEL },
  'threed.jobs': {},
  'threed.job': { id: 'job3d_kiste' },
  'threed.cancel': { id: 'job3d_truhe' },
  'threed.deleteJob': { id: 'job3d_stuhl', deleteFiles: true },
  'threed.readFile': { id: 'job3d_kiste', kind: 'model' },
  'budget.status': undefined,
  'budget.usage': {},
  'budget.setLimits': { dailyLimitUsd: 3 },
  'budget.resumePaid': {},
  'budget.breakdown': { groupBy: 'model' },
  'resources.snapshot': undefined,
  'resources.history': { minutes: 10 },
  'integrations.list': undefined,
  'integrations.setPath': { id: 'godot', path: 'C:\\Godot\\godot.exe' },
  'integrations.install': { id: 'dotnet' },
  'integrations.open': { id: 'vscode', projectId: PIXEL, path: 'src/main.ts', line: 3 },
  'memory.list': { projectId: PIXEL },
  'memory.search': { query: 'phaser' },
  'memory.add': { projectId: null, kind: 'insight', title: 'Test', content: 'Inhalt' },
  'memory.update': { id: 'mem_3', title: 'Ordnerstruktur (neu)' },
  'memory.delete': { id: 'mem_5' },
  'memory.clear': { projectId: REZEPT },
  'memory.export': {},
  'memory.import': { path: 'C:\\Users\\Demo\\wissen.json' },
  'files.tree': { projectId: PIXEL },
  'files.read': { projectId: PIXEL, path: 'src/main.ts' },
  'files.write': { projectId: PIXEL, path: 'README.md', content: '# Neu\n', expectedHash: null },
  'files.search': { projectId: PIXEL, query: 'Player' },
  'files.changed': { projectId: PIXEL },
  'files.history': { projectId: PIXEL },
  'files.diff': { projectId: PIXEL, path: 'src/game/player.ts' },
  'files.delete': { projectId: REZEPT, path: 'legacy/old-api.js' },
  'files.rename': { projectId: PIXEL, from: 'vite.config.ts', to: 'vite.config.mts' },
  'files.mkdir': { projectId: PIXEL, path: 'src/levels' },
  'files.snapshot': () => ({ projectId: PIXEL, hash: getMockDb().changes.find((c) => c.path === 'src/game/player.ts' && c.beforeHash)!.beforeHash }),
  'git.status': { projectId: PIXEL },
  'git.diff': { projectId: PIXEL },
  'git.log': { projectId: PIXEL },
  'git.init': { projectId: REZEPT },
  'checkpoints.list': { projectId: PIXEL },
  'checkpoints.create': { projectId: PIXEL, label: 'Vor dem Test' },
  'checkpoints.preview': { checkpointId: 'chk_px4' },
  'checkpoints.restore': { checkpointId: 'chk_px5' },
  'processes.list': {},
  'processes.kill': { id: 'proc_rz_test' },
  'processes.output': { id: 'proc_px_dev' },
  'terminal.create': { projectId: PIXEL },
  'terminal.list': {},
  'terminal.run': () => ({ sessionId: getMockDb().terminals[0].id, line: 'git status' }),
  'terminal.interrupt': () => ({ sessionId: getMockDb().terminals[0].id }),
  'terminal.close': () => ({ sessionId: getMockDb().terminals[0].id }),
  'checks.list': { projectId: PIXEL },
  'checks.get': { id: 'crun_px_t1' },
  'checks.run': { projectId: PIXEL, kind: 'build' },
  'checks.cancel': () => ({ id: getMockDb().checks.find((c) => c.status === 'running')!.id }),
  'preview.status': { projectId: PIXEL },
  'preview.start': { projectId: REZEPT },
  'preview.stop': { projectId: REZEPT },
  'settings.get': undefined,
  'settings.update': { agents: { maxParallelAgents: 2 } },
  'backup.list': undefined,
  'backup.create': {},
  'backup.snapshotProject': { projectId: PIXEL },
  'backup.restore': { id: 'bak_3' },
  'backup.delete': { id: 'bak_2' },
  'data.export': { sections: ['projects', 'memory'] },
  'data.import': { path: 'C:\\Users\\Demo\\export.json' },
  'updates.check': undefined,
  'notifications.list': {},
  'notifications.markRead': { ids: ['ntf_1'] },
  'operations.list': {},
  'operations.get': { id: 'op_demo_snapshot' },
  'operations.cancel': { id: 'op_demo_snapshot' },
};

/** Methods that must run last because they change global state (connection, project list). */
const LAST: RpcMethod[] = ['projects.remove', 'daemon.shutdown'];

describe('mock bridge', () => {
  beforeEach(() => {
    installMockBridge();
    resetMockData();
  });
  afterEach(() => uninstallMockBridge());

  it('implements every RPC method with contract-valid results', async () => {
    const order = [...RPC_METHODS.filter((m) => !LAST.includes(m)), ...LAST];
    const failures: string[] = [];
    for (const method of order) {
      expect(method in SAMPLE, `sample params for ${method}`).toBe(true);
      const sample = SAMPLE[method];
      const params = typeof sample === 'function' ? (sample as ParamsFn)() : sample;
      const res = await mockBridge.invoke(method, params as never);
      if (!res.ok) {
        failures.push(`${method}: ${res.error.code} ${res.error.message}`);
        continue;
      }
      const parsed = RpcContract[method].result.safeParse(res.result);
      if (!parsed.success) failures.push(`${method}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
    expect(failures).toEqual([]);
  });

  it('demo data covers every task status, pending approvals and a GPU', async () => {
    const tasks = await mockBridge.invoke('tasks.list', {});
    const statuses = new Set((tasks.ok ? (tasks.result as Array<{ status: string }>) : []).map((t) => t.status));
    for (const s of ['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'done', 'failed', 'cancelled', 'interrupted']) expect(statuses.has(s), s).toBe(true);
    const pending = await mockBridge.invoke('approvals.list', { status: 'pending' });
    expect(pending.ok && (pending.result as unknown[]).length).toBe(2);
    const snap = await mockBridge.invoke('resources.snapshot');
    expect(snap.ok && (snap.result as { gpus: Array<{ vendor: string }> }).gpus[0].vendor).toBe('nvidia');
  });

  it('mutations change state and emit matching events', async () => {
    const events: AnyNovaEvent[] = [];
    const off = mockBridge.onEvent((e) => events.push(e));
    const res = await mockBridge.invoke('tasks.pause', { id: 'task_px3' });
    off();
    expect(res.ok).toBe(true);
    expect(getMockDb().tasks.find((t) => t.id === 'task_px3')?.status).toBe('paused');
    const taskEvent = events.find((e) => e.type === 'task.updated');
    expect(taskEvent && taskEvent.type === 'task.updated' && taskEvent.payload.status).toBe('paused');
    expect(events.some((e) => e.type === 'run.updated')).toBe(true);
    expect(events.some((e) => e.type === 'work.status')).toBe(true);
    // Sequence numbers increase.
    expect(events.map((e) => e.seq)).toEqual([...events.map((e) => e.seq)].sort((a, b) => a - b));
  });

  it('validates params like the main process and supports overrides', async () => {
    const bad = await mockBridge.invoke('tasks.get', {} as never);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error.code).toBe('VALIDATION');

    mockHandlers.set('tasks.pause', () => {
      throw new MockRpcError('CONFLICT', 'Geht gerade nicht');
    });
    const res = await mockBridge.invoke('tasks.pause', { id: 'task_px3' });
    expect(res).toEqual({ ok: false, error: { code: 'CONFLICT', message: 'Geht gerade nicht', details: undefined } });
    expect(getMockCalls('tasks.pause')).toHaveLength(1);
  });

  it('refuses once-only approvals with scope always', async () => {
    const res = await mockBridge.invoke('approvals.decide', { id: 'apr_rz_del', decision: 'approve', scope: 'always' });
    expect(!res.ok && res.error.code).toBe('VALIDATION');
  });

  it('answers DAEMON_UNAVAILABLE while disconnected and notifies state listeners', async () => {
    const states: string[] = [];
    const off = mockBridge.daemon.onState((s) => states.push(s.state));
    setMockConnection({ state: 'reconnecting', message: 'Verbindung unterbrochen.' });
    const res = await mockBridge.invoke('daemon.status');
    expect(!res.ok && res.error.code).toBe('DAEMON_UNAVAILABLE');
    const restarted = await mockBridge.daemon.restart();
    off();
    expect(restarted.state).toBe('connected');
    expect(states).toEqual(['reconnecting', 'starting', 'connected']);
  });

  it('emitMockEvent fills ts and seq', () => {
    const seen: AnyNovaEvent[] = [];
    const off = mockBridge.onEvent((e) => seen.push(e));
    emitMockEvent({ type: 'error.resolved', payload: { id: 'x' } });
    off();
    expect(seen[0].type).toBe('error.resolved');
    expect(typeof seen[0].ts).toBe('number');
    expect(seen[0].seq).toBeGreaterThan(0);
  });
});
