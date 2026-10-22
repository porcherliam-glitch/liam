// End-to-end test of the whole daemon: real services, real RPC transport (unix socket), real git, real child
// processes and the "web-app" template's real `node --test` suite. Only the LLM is replaced by the scripted
// fake Ollama server (tests/fakes/fake-ollama.ts) – clearly a test double.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDaemon, type DaemonApp } from '../../src/daemon/app';
import { DaemonClient } from '../../src/daemon/client';
import { startFakeOllama, type FakeOllama, type FakeOllamaChatRequest, type FakeChatReply } from '../fakes/fake-ollama';
import type { Task } from '../../src/shared/schemas';

const MODEL = 'qwen2.5-coder:7b';

let base: string;
let dataDir: string;
let endpoint: string;
let fake: FakeOllama;
let app: DaemonApp | null = null;
let client: DaemonClient;

async function waitFor<T>(fn: () => Promise<T | null | undefined | false>, timeoutMs = 60_000, label = 'condition'): Promise<T> {
  const until = Date.now() + timeoutMs;
  let last: unknown = null;
  while (Date.now() < until) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout waiting for ${label}${last ? `: ${String(last)}` : ''}`);
}

/** Windows needs a named pipe, POSIX a socket file in the temp dir. */
function socketPath(name: string): string {
  return process.platform === 'win32' ? `\\\\.\\pipe\\nova-e2e-${process.pid}-${name}` : join(base, `${name}.sock`);
}

function toolNames(req: FakeOllamaChatRequest): string[] {
  return req.tools.map((t) => t.function.name);
}

function toolResults(req: FakeOllamaChatRequest) {
  return req.messages.filter((m) => m.role === 'tool');
}

function call(name: string, args: Record<string, unknown>): FakeChatReply {
  return { content: '', tool_calls: [{ name, arguments: args }], prompt_eval_count: 900, eval_count: 60 };
}

async function boot(): Promise<void> {
  app = await startDaemon({ dataDir, endpoint, ollamaBaseUrl: fake.url, secretScheme: 'memory' });
  client = new DaemonClient({ endpoint, tokenPath: join(app.dataDir, 'daemon.token') });
}

async function shutdown(): Promise<void> {
  if (!app) return;
  await app.stop('test');
  client.close();
  app = null;
}

beforeAll(async () => {
  base = mkdtempSync(join(tmpdir(), 'nova-e2e-'));
  dataDir = join(base, 'data');
  endpoint = socketPath('d');
  fake = await startFakeOllama({ models: [{ name: MODEL, parameterSize: '7.6B', capabilities: ['completion', 'tools'] }] });
  await boot();
}, 60_000);

afterAll(async () => {
  await shutdown();
  await fake?.close();
  rmSync(base, { recursive: true, force: true });
}, 60_000);

describe('NOVA daemon end-to-end', { timeout: 120_000 }, () => {
  let projectId = '';
  let projectPath = '';
  let firstTask: Task;

  it('answers status over the authenticated channel and refuses a second daemon for the same data dir', async () => {
    const st = await client.rpc('daemon.status', {});
    expect(st.state === 'running' || st.state === 'paused').toBe(true);
    expect(st.methods.length).toBeGreaterThan(100);
    await expect(startDaemon({ dataDir, endpoint: socketPath('other'), secretScheme: 'memory' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // the running daemon is untouched
    expect((await client.rpc('daemon.status', {})).instanceId).toBe(st.instanceId);
  });

  it('sees the (fake) local Ollama and its tool-capable model', async () => {
    const status = await client.rpc('ollama.status', {});
    expect(status.running).toBe(true);
    const models = await client.rpc('ollama.models', {});
    expect(models.map((m) => m.id)).toContain(MODEL);
    expect(models.find((m) => m.id === MODEL)?.capabilities).toContain('tools');
    const sel = await client.rpc('models.setSelection', { defaultModel: { providerId: 'ollama-local', modelId: MODEL } });
    expect(sel.defaultModel?.modelId).toBe(MODEL);
    expect(sel.temperature).toBe(0.2); // patch did not reset other fields
  });

  it('creates a project from the web-app template with git', async () => {
    projectPath = join(base, 'projekte', 'rechner');
    const res = await client.rpc('projects.create', { mode: 'template', templateId: 'web-app', name: 'Rechner', description: '', path: projectPath, planNow: false });
    projectId = res.project.id;
    expect(res.project.origin).toBe('new');
    expect(existsSync(join(projectPath, 'package.json'))).toBe(true);
    const git = await client.rpc('git.status', { projectId });
    expect(git.isRepo).toBe(true);
    const updated = await client.rpc('projects.update', { id: projectId, config: { reviewChanges: true } });
    expect(updated.config.reviewChanges).toBe(true);
    expect(updated.config.commands.test).toBeTruthy();
  });

  it('lets the coder agent implement a function, verifies with real checks, reviews and commits', async () => {
    fake.setDefaultChat((req) => {
      const names = toolNames(req);
      const done = toolResults(req).length;
      if (names.includes('submit_review')) {
        return done === 0 ? call('git_diff', {}) : call('submit_review', { verdict: 'approve', summary: 'Die Änderung ist korrekt und getestet.', findings: [] });
      }
      if (names.includes('finish')) {
        switch (done) {
          case 0:
            return call('write_file', { path: 'src/math.js', content: 'export function add(a, b) {\n  return a + b;\n}\n' });
          case 1:
            return call('write_file', {
              path: 'tests/math.test.mjs',
              content: "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { add } from '../src/math.js';\n\ntest('add', () => {\n  assert.equal(add(2, 3), 5);\n});\n",
            });
          case 2:
            return call('run_checks', { kind: 'test' });
          default:
            return call('finish', { summary: 'Funktion add mit Test ergänzt, Tests bestanden.', status: 'done' });
        }
      }
      return { content: 'Unbekannte Rolle', status: 500, error: 'unexpected role in test' };
    });
    firstTask = await client.rpc('tasks.create', { projectId, title: 'Funktion add ergänzen', description: 'src/math.js mit add(a, b) und einem Test anlegen.', kind: 'code' });
    await client.rpc('tasks.start', { id: firstTask.id });
    const done = await waitFor(async () => {
      const t = await client.rpc('tasks.get', { id: firstTask.id });
      if (['failed', 'blocked', 'cancelled'].includes(t.status)) throw new Error(`task ${t.status}: ${t.blocker}`);
      return t.status === 'done' ? t : null;
    }, 90_000, 'task done');
    expect(done.files).toEqual(expect.arrayContaining(['src/math.js', 'tests/math.test.mjs']));
    expect(done.verification.status).toBe('passed');
    expect(done.verification.checks.map((c) => c.name).join(' ')).toMatch(/Test/i);
    expect(done.verification.checks.find((c) => /review/i.test(c.name))?.status).toBe('passed');
    expect(readFileSync(join(projectPath, 'src', 'math.js'), 'utf8')).toContain('return a + b');

    const checks = await client.rpc('checks.list', { projectId, kind: 'test' });
    expect(checks[0]?.status).toBe('passed');
    expect(checks[0]?.passed ?? 0).toBeGreaterThan(0);

    const log = await client.rpc('git.log', { projectId, limit: 5 });
    expect(log[0]?.byNova).toBe(true);
    expect(log[0]?.subject).toMatch(/^NOVA:/);

    const changed = await client.rpc('files.changed', { projectId });
    expect(changed.filter((f) => f.byNova).map((f) => f.path)).toEqual(expect.arrayContaining(['src/math.js']));

    const runs = await client.rpc('agents.runs', { taskId: firstTask.id });
    expect(runs.map((r) => r.role)).toEqual(expect.arrayContaining(['coder', 'reviewer']));
    const steps = await client.rpc('agents.steps', { runId: runs.find((r) => r.role === 'coder')!.id });
    expect(steps.some((st) => st.kind === 'tool_call')).toBe(true);

    const usage = await client.rpc('budget.usage', {});
    expect(usage.length).toBeGreaterThan(0);
    expect(usage.every((u) => !u.paid && u.costUsd === 0)).toBe(true);
  });

  it('restores the task changes without touching other files', async () => {
    const preview = await client.rpc('checkpoints.preview', { taskId: firstTask.id });
    expect(preview.restored).toEqual(expect.arrayContaining(['src/math.js']));
    const res = await client.rpc('checkpoints.restore', { taskId: firstTask.id, commit: true });
    expect(res.conflicts).toEqual([]);
    expect(existsSync(join(projectPath, 'src', 'math.js'))).toBe(false);
    expect(existsSync(join(projectPath, 'package.json'))).toBe(true);
    const cps = await client.rpc('checkpoints.list', { projectId });
    expect(cps.some((c) => c.kind === 'pre_restore')).toBe(true);
  });

  it('asks for approval before an unknown network command and continues after the decision', async () => {
    fake.setDefaultChat((req) => {
      const results = toolResults(req);
      if (!toolNames(req).includes('finish')) return { status: 500, error: 'unexpected role' };
      if (results.length === 0) return call('run_command', { command: 'curl https://evil.example.org/daten.json' });
      const last = results[results.length - 1]?.content ?? '';
      return call('finish', { summary: 'Befehl wurde abgelehnt.', status: 'blocked', blocker: /abgelehnt/i.test(last) ? 'Freigabe abgelehnt' : `Unerwartet: ${last.slice(0, 80)}` });
    });
    const task = await client.rpc('tasks.create', { projectId, title: 'Daten herunterladen', description: 'Lade die Daten.', kind: 'code' });
    await client.rpc('tasks.start', { id: task.id });
    await waitFor(async () => (await client.rpc('tasks.get', { id: task.id })).status === 'waiting_approval', 60_000, 'waiting_approval');
    const pending = await client.rpc('approvals.list', { status: 'pending' });
    const approval = pending.find((a) => a.taskId === task.id);
    expect(approval?.kind).toBe('network');
    await client.rpc('approvals.decide', { id: approval!.id, decision: 'deny', scope: 'once' });
    const final = await waitFor(async () => {
      const t = await client.rpc('tasks.get', { id: task.id });
      return ['blocked', 'done', 'failed'].includes(t.status) ? t : null;
    }, 60_000, 'task after denial');
    expect(final.status).toBe('blocked');
    expect(final.blocker).toMatch(/abgelehnt/i);
  });

  it('keeps projects and tasks across a daemon restart', async () => {
    await shutdown();
    await boot();
    const projects = await client.rpc('projects.list', {});
    expect(projects.map((p) => p.id)).toContain(projectId);
    const t = await client.rpc('tasks.get', { id: firstTask.id });
    expect(t.status).toBe('done');
    const st = await client.rpc('daemon.status', {});
    expect(st.previousShutdown?.clean).toBe(true);
  });
});
