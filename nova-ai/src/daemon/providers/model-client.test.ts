// Tests for the ModelClient with a real registry/budget and fake Ollama/OpenAI servers: candidate order, rejection
// reasons, fallback, rate limits, cloud-data approvals + redaction, paid gating, parallel budget use, usage booking,
// VRAM fit and governor checks. Cloud endpoints are https URLs rewritten to the local fake server by an injected fetch.
import { afterEach, describe, expect, it } from 'vitest';
import type { ModelRef } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { startFakeOllama, type FakeOllama, type FakeOllamaModel } from '../../../tests/fakes/fake-ollama';
import { startFakeOpenAi, type FakeOpenAi } from '../../../tests/fakes/fake-openai';
import { unusedLocalUrl } from '../../../tests/fakes/fake-http';
import { NovaError } from '../core/errors';
import { _clearRegisteredSecrets } from '../core/redact';
import type { ConcurrencyGovernor, ModelChatInput, OllamaFit, OllamaService } from '../contracts';
import { createProviderRegistry, OLLAMA_LOCAL_ID } from './registry';
import { createBudgetService } from './budget';
import { createModelClient } from './model-client';
import { fakeApprovals, fakeGovernor, fakeNotifications, fakeProjects, fakeSecrets } from './test-fakes';

const CLOUD = 'https://api.cloud.test/v1';
const KEY = 'sk-test-cloudkey0123456789abcdef';

let t: TestCore | null = null;
const servers: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  t?.cleanup();
  t = null;
  _clearRegisteredSecrets();
});

interface SetupOptions {
  ollamaModels?: Array<FakeOllamaModel | string>;
  cloudModels?: Array<string | Record<string, unknown>>;
  governor?: Partial<ConcurrencyGovernor>;
  ollamaDown?: boolean;
}

async function setup(o: SetupOptions = {}) {
  t = createTestCore();
  const core = t.core;
  const ollama: FakeOllama = await startFakeOllama({ models: o.ollamaModels ?? ['qwen2.5-coder:7b', 'llama3.2:3b'] });
  const cloud: FakeOpenAi = await startFakeOpenAi({ apiKey: KEY, models: o.cloudModels ?? ['gpt-test', 'gpt-mini'] });
  servers.push(ollama, cloud);
  const fetchImpl: typeof fetch = (input, init) => fetch(String(input).replace(CLOUD, cloud.url), init);
  const approvals = fakeApprovals();
  const notifications = fakeNotifications();
  const governor = fakeGovernor(o.governor);
  const fits: Record<string, OllamaFit> = {};
  const fitCalls: Array<[string, number | undefined]> = [];
  const ollamaStub = {
    fit: async (model: string, numCtx?: number): Promise<OllamaFit> => {
      fitCalls.push([model, numCtx]);
      return fits[model] ?? { fits: true, requiredBytes: 1, availableBytes: 2, estimated: false, message: 'passt', alternatives: [] };
    },
  } as unknown as OllamaService;
  const s = makeServices(core, { approvals, notifications, governor, secrets: fakeSecrets(), projects: fakeProjects({ P: null, Q: 1 }) as never, ollama: ollamaStub });
  const registry = createProviderRegistry(s, { fetch: fetchImpl });
  s.providers = registry;
  registry.ensureDefaults();
  registry.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: o.ollamaDown ? await unusedLocalUrl() : ollama.url });
  s.budget = createBudgetService(s);
  const models = createModelClient(s, { availabilityTtlMs: 0, availabilityErrorTtlMs: 0, fitTtlMs: 0 });
  s.models = models;
  const addCloud = async (paid: boolean, approved = true, options: Record<string, string> = {}) => {
    const p = registry.upsert({ id: 'cloud', type: 'openai_compatible', name: 'Cloud', baseUrl: CLOUD, paid, approved, options });
    await registry.setApiKey(p.id, KEY);
    return p;
  };
  const select = (sel: { defaultModel?: ModelRef | null; fallbacks?: ModelRef[]; coder?: ModelRef | null }) =>
    core.settings.update({ models: { defaultModel: sel.defaultModel ?? null, fallbacks: sel.fallbacks ?? [], roleOverrides: { coder: sel.coder ?? null } } });
  return { s, core, ollama, cloud, approvals, notifications, governor, fits, fitCalls, registry, models, addCloud, select };
}

const L = (modelId: string): ModelRef => ({ providerId: OLLAMA_LOCAL_ID, modelId });
const C = (modelId: string): ModelRef => ({ providerId: 'cloud', modelId });

const chatInput = (extra: Partial<ModelChatInput> = {}): ModelChatInput => ({
  role: 'coder',
  projectId: null,
  taskId: null,
  runId: null,
  messages: [{ role: 'user', content: 'Hallo' }],
  ...extra,
});

async function caught(p: Promise<unknown>): Promise<NovaError> {
  try {
    await p;
  } catch (e) {
    return e as NovaError;
  }
  throw new Error('expected rejection');
}

describe('model client – candidate selection', () => {
  it('NO_MODEL explains how to choose a model when nothing is configured', async () => {
    const { models } = await setup();
    const e = await caught(models.resolve('coder'));
    expect(e.code).toBe('NO_MODEL');
    expect(e.message).toContain('„Modelle“');
  });

  it('uses exactly [preferred, roleOverride, default, ...fallbacks]; preferred only when still listed', async () => {
    const { models, select } = await setup({ ollamaModels: ['a:1b', 'b:1b', 'c:1b', 'd:1b'] });
    select({ coder: L('b:1b'), defaultModel: L('a:1b'), fallbacks: [L('c:1b')] });
    expect((await models.resolve('coder')).ref).toEqual(L('b:1b'));
    expect((await models.resolve('planner')).ref).toEqual(L('a:1b'));
    expect((await models.resolve('coder', { preferred: L('c:1b') })).ref).toEqual(L('c:1b'));
    // d:1b is installed but not part of the selection → never used, even when preferred
    expect((await models.resolve('coder', { preferred: L('d:1b') })).ref).toEqual(L('b:1b'));
    expect((await models.resolve('coder', { exclude: [L('b:1b'), L('a:1b')] })).ref).toEqual(L('c:1b'));
  });

  it("puts the project's own model first (all roles) and still falls back along the global chain", async () => {
    const { s, models, select, ollama } = await setup({ ollamaModels: ['a:1b', 'b:1b', 'p:1b'] });
    ollama.setDefaultChat(() => ({ content: 'ok' }));
    select({ coder: L('b:1b'), defaultModel: L('a:1b') });
    const projects = new Map<string, ModelRef | null>([['M', L('p:1b')], ['N', null], ['X', L('weg:1b')]]);
    s.projects = { get: (id: string) => (projects.has(id) ? ({ id, config: { model: projects.get(id), monthlyBudgetUsd: null } } as never) : null) } as never;
    expect((await models.resolve('coder', { projectId: 'M' })).ref).toEqual(L('p:1b'));
    expect((await models.resolve('planner', { projectId: 'M' })).ref).toEqual(L('p:1b'));
    expect((await models.chat(chatInput({ projectId: 'M' }))).resolved.ref).toEqual(L('p:1b'));
    // no own model → the global selection
    expect((await models.resolve('coder', { projectId: 'N' })).ref).toEqual(L('b:1b'));
    expect((await models.resolve('coder')).ref).toEqual(L('b:1b'));
    // the project's model is gone → role override/default instead of failing
    expect((await models.resolve('planner', { projectId: 'X' })).ref).toEqual(L('a:1b'));
  });

  it('a project model alone counts as configured (no global default needed)', async () => {
    const { s, models } = await setup({ ollamaModels: ['p:1b'] });
    s.projects = { get: (id: string) => (id === 'M' ? ({ id, config: { model: L('p:1b'), monthlyBudgetUsd: null } } as never) : null) } as never;
    expect((await models.resolve('coder', { projectId: 'M' })).ref).toEqual(L('p:1b'));
    expect((await caught(models.resolve('coder', { projectId: 'other' }))).code).toBe('NO_MODEL');
  });

  it('never falls back to an unlisted installed model; NO_MODEL lists the reasons', async () => {
    const { models, select } = await setup({ ollamaModels: ['installed:7b'] });
    select({ defaultModel: L('missing:7b'), fallbacks: [{ providerId: 'gone', modelId: 'x' }] });
    const e = await caught(models.resolve('coder'));
    expect(e.code).toBe('NO_MODEL');
    expect(e.message).toContain('missing:7b');
    expect(e.message).toContain('nicht installiert');
    expect(e.message).toContain('„gone“ ist nicht (mehr) eingerichtet');
    expect(e.message).not.toContain('installed:7b');
    expect((e.details as { rejections: unknown[] }).rejections).toHaveLength(2);
  });

  it('OLLAMA_UNREACHABLE when the only candidates are local and Ollama is down', async () => {
    const { models, select } = await setup({ ollamaDown: true });
    select({ defaultModel: L('qwen2.5-coder:7b'), fallbacks: [L('llama3.2:3b')] });
    const e = await caught(models.resolve('coder'));
    expect(e.code).toBe('OLLAMA_UNREACHABLE');
  });

  it('reports supportsTools and the effective Ollama context (min of num_ctx and model context)', async () => {
    const { models, select, core } = await setup({ ollamaModels: [{ name: 'big:7b', contextLength: 131072 }, { name: 'plain:1b', capabilities: ['completion'], contextLength: 4096 }] });
    core.settings.update({ models: { ollamaNumCtx: 16384 } });
    select({ defaultModel: L('big:7b'), coder: L('plain:1b') });
    expect(await models.resolve('planner')).toMatchObject({ supportsTools: true, contextLength: 16384, local: true, paid: false });
    expect(await models.resolve('coder')).toMatchObject({ supportsTools: false, contextLength: 4096 });
  });
});

describe('model client – chat and fallback', () => {
  it('sends the chat with options and records free usage', async () => {
    const { models, select, ollama, s } = await setup();
    select({ defaultModel: L('qwen2.5-coder:7b') });
    ollama.queueChat({ tool_calls: [{ name: 'read_file', arguments: { path: 'a.ts' } }] });
    const res = await models.chat(chatInput({ projectId: 'P', taskId: 'task_1', runId: 'run_1', tools: [{ name: 'read_file', description: 'r', parameters: { type: 'object' } }] }));
    expect(res.resolved.ref).toEqual(L('qwen2.5-coder:7b'));
    expect(res.toolCalls[0]).toMatchObject({ name: 'read_file', arguments: { path: 'a.ts' } });
    const sent = ollama.chatRequests()[0];
    expect(sent.options).toMatchObject({ num_ctx: 16384, temperature: 0.2, num_predict: 4096 });
    const usage = s.budget.usage();
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({ providerId: OLLAMA_LOCAL_ID, paid: false, costUsd: 0, projectId: 'P', taskId: 'task_1', runId: 'run_1' });
  });

  it('falls back on 5xx and unavailable models, never to unlisted ones', async () => {
    const { models, select, ollama } = await setup({ ollamaModels: ['a:1b', 'b:1b', 'unlisted:1b'] });
    select({ defaultModel: L('a:1b'), fallbacks: [L('b:1b')] });
    ollama.queueChat({ status: 500, error: 'crash' });
    ollama.queueChat({ content: 'from b' });
    const res = await models.chat(chatInput());
    expect(res.content).toBe('from b');
    expect(res.resolved.ref).toEqual(L('b:1b'));
    expect(ollama.chatRequests().map((r) => r.model)).toEqual(['a:1b', 'b:1b']);
    ollama.queueChat({ status: 500, error: 'crash' });
    ollama.queueChat({ status: 500, error: 'crash again' });
    const e = await caught(models.chat(chatInput()));
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(ollama.chatRequests().map((r) => r.model)).not.toContain('unlisted:1b');
  });

  it('does not fall back on a 400 request error', async () => {
    const { models, select, ollama } = await setup({ ollamaModels: ['a:1b', 'b:1b'] });
    select({ defaultModel: L('a:1b'), fallbacks: [L('b:1b')] });
    ollama.queueChat({ status: 400, error: 'invalid request' });
    const e = await caught(models.chat(chatInput()));
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(ollama.chatRequests()).toHaveLength(1);
  });

  it('honours Retry-After on 429 and retries the same model', async () => {
    const { models, select, addCloud, cloud, core } = await setup();
    await addCloud(false);
    core.settings.update({ network: { approveCloudProjectData: false } });
    select({ defaultModel: C('gpt-test') });
    cloud.queueChat({ status: 429, headers: { 'retry-after-ms': '40' }, error: 'slow down' });
    cloud.queueChat({ content: 'ok' });
    const started = Date.now();
    const res = await models.chat(chatInput({ projectId: 'P' }));
    expect(res.content).toBe('ok');
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
    expect(cloud.chatRequests()).toHaveLength(2);
  });

  it('PROVIDER_AUTH falls back to the next model and reports the key problem', async () => {
    const { models, select, addCloud, cloud, ollama, core, registry } = await setup();
    await addCloud(false);
    await registry.setApiKey('cloud', 'sk-wrong-key-000000000000000000');
    core.settings.update({ network: { approveCloudProjectData: false } });
    select({ defaultModel: C('gpt-test'), fallbacks: [L('qwen2.5-coder:7b')] });
    ollama.queueChat({ content: 'local' });
    const res = await models.chat(chatInput());
    expect(res.resolved.ref).toEqual(L('qwen2.5-coder:7b'));
    // availability check already fails with the wrong key → the cloud model is skipped before sending
    expect(cloud.chatRequests()).toHaveLength(0);
    const e = await caught(models.resolve('coder', { exclude: [L('qwen2.5-coder:7b')] }));
    expect(e.code).toBe('NO_MODEL');
    expect(e.message).toContain('API-Schlüssel');
  });

  it('a 401 during the chat falls back and creates one error report', async () => {
    const { models, select, addCloud, cloud, ollama, core } = await setup();
    await addCloud(false);
    core.settings.update({ network: { approveCloudProjectData: false } });
    select({ defaultModel: C('gpt-test'), fallbacks: [L('qwen2.5-coder:7b')] });
    cloud.queueChat({ status: 401, error: 'key revoked' });
    ollama.queueChat({ content: 'local' });
    const res = await models.chat(chatInput({ projectId: 'P' }));
    expect(res.content).toBe('local');
    const reports = core.errors.list().filter((e) => e.code === 'PROVIDER_AUTH');
    expect(reports).toHaveLength(1);
    expect(reports[0].userAction).toContain('API-Schlüssel');
  });

  it('rate limit: maxConcurrent serialises requests to a provider', async () => {
    const { models, select, addCloud, cloud, core } = await setup();
    await addCloud(false, true, { maxConcurrent: '1' });
    core.settings.update({ network: { approveCloudProjectData: false } });
    select({ defaultModel: C('gpt-test') });
    cloud.setDefaultChat({ content: 'ok', delayMs: 40 });
    await Promise.all([1, 2, 3].map(() => models.chat(chatInput())));
    expect(cloud.chatRequests()).toHaveLength(3);
    expect(cloud.maxInFlight()).toBe(1);
  });

  it('a user abort is not retried or recovered', async () => {
    const { models, select, ollama } = await setup({ ollamaModels: ['a:1b', 'b:1b'] });
    select({ defaultModel: L('a:1b'), fallbacks: [L('b:1b')] });
    ollama.queueChat({ content: 'late', delayMs: 5000 });
    const c = new AbortController();
    // abort once the request has really reached the server (a fixed delay is too short on a slow CI machine)
    const watcher = setInterval(() => {
      if (ollama.chatRequests().length > 0) c.abort();
    }, 5);
    const e = await caught(models.chat(chatInput({ signal: c.signal }))).finally(() => clearInterval(watcher));
    expect(e.code).toBe('CANCELLED');
    expect(ollama.chatRequests()).toHaveLength(1);
  });
});

describe('model client – cloud data, approvals and redaction', () => {
  it('pending approval skips the cloud candidate; APPROVAL_REQUIRED when nothing else; approved → redacted request', async () => {
    const { models, select, addCloud, cloud, approvals, ollama } = await setup();
    await addCloud(false);
    select({ defaultModel: C('gpt-test') });
    const secretMsg = { role: 'user' as const, content: 'Mein Schlüssel ist sk-abcdefghijklmnopqrstuvwx1234 bitte nutzen' };
    const input = chatInput({
      projectId: 'P',
      taskId: 'task_1',
      messages: [secretMsg, { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'write_file', arguments: { path: '.env', content: 'API_KEY=supersecretvalue123', token: 'abc' } }] }, { role: 'tool', toolCallId: 'c1', name: 'write_file', content: 'ok' }],
    });
    const e = await caught(models.chat(input));
    expect(e.code).toBe('APPROVAL_REQUIRED');
    const approvalId = (e.details as { approvalId: string }).approvalId;
    const apr = approvals.rows.find((a) => a.id === approvalId)!;
    expect(apr).toMatchObject({ kind: 'sensitive_data', projectId: 'P', taskId: 'task_1', status: 'pending', fingerprint: approvals.fingerprint('sensitive_data', 'P', 'cloud:cloud') });
    expect(cloud.chatRequests()).toHaveLength(0);
    // same task asks again → same approval, no duplicate
    await caught(models.chat(input));
    expect(approvals.rows).toHaveLength(1);

    approvals.decide(approvalId, 'approve', 'once');
    cloud.queueChat({ content: 'done' });
    const res = await models.chat(input);
    expect(res.content).toBe('done');
    expect(res.resolved.local).toBe(false);
    const sent = cloud.chatRequests()[0].messages;
    expect(JSON.stringify(sent)).not.toContain('sk-abcdefghijklmnopqrstuvwx1234');
    expect(JSON.stringify(sent)).not.toContain('supersecretvalue123');
    expect(String(sent[0].content)).toContain('[GEHEIM]');
    const args = JSON.parse((sent[1].tool_calls as Array<{ function: { arguments: string } }>)[0].function.arguments) as Record<string, string>;
    expect(args.token).toBe('[GEHEIM]');
    expect(args.content).toContain('[GEHEIM]');
    // ModelClient never consumes the cloud data approval (valid for the whole task)
    expect(approvals.consumeCalls).toEqual([]);
    cloud.queueChat({ content: 'again' });
    expect((await models.chat(input)).content).toBe('again');
    // a different task needs its own approval
    expect((await caught(models.chat({ ...input, taskId: 'task_2' }))).code).toBe('APPROVAL_REQUIRED');
    expect(ollama.chatRequests()).toHaveLength(0);
  });

  it('with a local fallback the pending cloud candidate is skipped; denial is respected per task', async () => {
    const { models, select, addCloud, cloud, approvals, ollama } = await setup();
    await addCloud(false);
    select({ defaultModel: C('gpt-test'), fallbacks: [L('qwen2.5-coder:7b')] });
    ollama.setDefaultChat({ content: 'local' });
    const res = await models.chat(chatInput({ projectId: 'P', taskId: 'task_1' }));
    expect(res.resolved.ref).toEqual(L('qwen2.5-coder:7b'));
    const pending = approvals.rows.find((a) => a.status === 'pending')!;
    approvals.decide(pending.id, 'deny', 'once');
    const again = await models.chat(chatInput({ projectId: 'P', taskId: 'task_1' }));
    expect(again.resolved.ref).toEqual(L('qwen2.5-coder:7b'));
    expect(cloud.chatRequests()).toHaveLength(0);
  });

  it('resolve without taskId only peeks (never creates approvals); always-rules approve', async () => {
    const { models, select, addCloud, approvals } = await setup();
    await addCloud(false);
    select({ defaultModel: C('gpt-test') });
    expect((await models.resolve('coder', { projectId: 'P' })).ref).toEqual(C('gpt-test'));
    expect(approvals.rows).toHaveLength(0);
    const e = await caught(models.resolve('coder', { projectId: 'P', taskId: 'task_9' }));
    expect(e.code).toBe('APPROVAL_REQUIRED');
    expect((await caught(models.resolve('coder', { projectId: 'P' }))).code).toBe('APPROVAL_REQUIRED');
    approvals.decide(approvals.rows[0].id, 'approve', 'always');
    expect((await models.resolve('coder', { projectId: 'P', taskId: 'task_10' })).ref).toEqual(C('gpt-test'));
  });

  it('no approval needed when approveCloudProjectData is off or the endpoint is local', async () => {
    const { models, select, addCloud, core, approvals } = await setup();
    await addCloud(false);
    core.settings.update({ network: { approveCloudProjectData: false } });
    select({ defaultModel: C('gpt-test') });
    expect((await models.resolve('coder', { projectId: 'P', taskId: 't' })).ref).toEqual(C('gpt-test'));
    expect(approvals.rows).toHaveLength(0);
  });
});

describe('model client – paid models and budget', () => {
  const PRICE = { inputPerMTokUsd: 1000, outputPerMTokUsd: 1000, estimated: false };

  it('gates paid models: approval, pricing, budget, pause', async () => {
    const { models, select, addCloud, core, registry, s } = await setup();
    core.settings.update({ network: { approveCloudProjectData: false } });
    select({ defaultModel: C('gpt-test') });
    await addCloud(true, false);
    expect((await caught(models.resolve('coder'))).code).toBe('PAID_NOT_APPROVED');
    await addCloud(true, true);
    expect((await caught(models.resolve('coder'))).code).toBe('PRICE_UNKNOWN');
    await registry.setPricing(C('gpt-test'), PRICE);
    const e = await caught(models.resolve('coder'));
    expect(e.code).toBe('BUDGET_EXCEEDED'); // default limits are 0 $
    core.settings.update({ budgets: { dailyLimitUsd: 50, monthlyLimitUsd: 100 } });
    expect((await models.resolve('coder')).paid).toBe(true);
    s.budget.pausePaid('Test');
    expect((await caught(models.resolve('coder'))).code).toBe('BUDGET_EXCEEDED');
    s.budget.resumePaid();
    s.budget.pausePaid('Projekt', 'Q');
    expect((await caught(models.resolve('coder', { projectId: 'Q' }))).code).toBe('BUDGET_EXCEEDED');
    expect((await models.resolve('coder', { projectId: 'P' })).paid).toBe(true);
  });

  it('4 parallel paid chats with budget for exactly one → exactly one request is sent', async () => {
    const { models, select, addCloud, core, registry, cloud, s } = await setup();
    core.settings.update({ network: { approveCloudProjectData: false }, models: { maxOutputTokens: 256 }, budgets: { dailyLimitUsd: 0.4, monthlyLimitUsd: 10 } });
    await addCloud(true, true);
    await registry.setPricing(C('gpt-test'), PRICE);
    select({ defaultModel: C('gpt-test') });
    cloud.setDefaultChat({ content: 'ok', delayMs: 30, usage: { prompt_tokens: 10, completion_tokens: 10 } });
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => models.chat(chatInput())));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(3);
    for (const r of rejected) expect((r.reason as NovaError).code).toBe('BUDGET_EXCEEDED');
    expect(cloud.chatRequests()).toHaveLength(1);
    const st = s.budget.status();
    expect(st.reservedUsd).toBe(0);
    expect(st.spentTodayUsd).toBeCloseTo(0.02);
    expect(cloud.chatRequests()[0].raw.max_tokens).toBe(256);
  });

  it('budget stop: continues with the local fallback (fallbackToLocal) or stops (off)', async () => {
    const { models, select, addCloud, core, registry, s, ollama } = await setup();
    core.settings.update({ network: { approveCloudProjectData: false }, budgets: { dailyLimitUsd: 5, monthlyLimitUsd: 10 } });
    await addCloud(true, true);
    await registry.setPricing(C('gpt-test'), PRICE);
    select({ defaultModel: C('gpt-test'), fallbacks: [L('qwen2.5-coder:7b')] });
    s.budget.pausePaid('Tagesbudget erreicht');
    ollama.setDefaultChat({ content: 'lokal' });
    const res = await models.chat(chatInput());
    expect(res.resolved.ref).toEqual(L('qwen2.5-coder:7b'));
    core.settings.update({ budgets: { fallbackToLocal: false } });
    const e = await caught(models.chat(chatInput()));
    expect(e.code).toBe('BUDGET_EXCEEDED');
  });

  it('estimates usage when the provider reports none and books the maximum after an abort', async () => {
    const { models, select, addCloud, core, registry, cloud, s } = await setup();
    core.settings.update({ network: { approveCloudProjectData: false }, models: { maxOutputTokens: 256 }, budgets: { dailyLimitUsd: 10, monthlyLimitUsd: 10 } });
    await addCloud(true, true);
    await registry.setPricing(C('gpt-test'), PRICE);
    select({ defaultModel: C('gpt-test') });
    cloud.queueChat({ content: 'x'.repeat(35), usage: null });
    const res = await models.chat(chatInput({ messages: [{ role: 'user', content: 'y'.repeat(70) }] }));
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 10, usageReported: false });
    expect(s.budget.usage()[0]).toMatchObject({ inputTokens: 20, outputTokens: 10, costEstimated: true, paid: true });
    expect(s.budget.usage()[0].costUsd).toBeCloseTo(0.03);

    cloud.queueChat({ content: 'late', delayMs: 5000 });
    const c = new AbortController();
    const sent = cloud.chatRequests().length;
    // abort once the request has really reached the server (a fixed delay is too short on a slow CI machine)
    const watcher = setInterval(() => {
      if (cloud.chatRequests().length > sent) c.abort();
    }, 5);
    const e = await caught(models.chat(chatInput({ messages: [{ role: 'user', content: 'y'.repeat(70) }], signal: c.signal }))).finally(() => clearInterval(watcher));
    expect(e.code).toBe('CANCELLED');
    const aborted = s.budget.usage()[0];
    expect(aborted).toMatchObject({ costEstimated: true, outputTokens: 256, inputTokens: 20 });
    expect(aborted.costUsd).toBeCloseTo((20 + 256) / 1000);
    expect(s.budget.status().reservedUsd).toBe(0);
  });

  it('a 4xx rejection releases the reservation (nothing booked)', async () => {
    const { models, select, addCloud, core, registry, cloud, s } = await setup();
    core.settings.update({ network: { approveCloudProjectData: false }, budgets: { dailyLimitUsd: 10, monthlyLimitUsd: 10 } });
    await addCloud(true, true);
    await registry.setPricing(C('gpt-test'), PRICE);
    select({ defaultModel: C('gpt-test') });
    cloud.queueChat({ status: 400, error: 'context too long' });
    expect((await caught(models.chat(chatInput()))).code).toBe('PROVIDER_ERROR');
    expect(s.budget.usage()).toHaveLength(0);
    expect(s.budget.status().reservedUsd).toBe(0);
  });
});

describe('model client – VRAM and resources', () => {
  it('skips models that do not fit; VRAM_INSUFFICIENT with alternatives and an error report when none is left', async () => {
    const { models, select, fits, core, fitCalls } = await setup({ ollamaModels: ['big:70b', 'small:1b'] });
    fits['big:70b'] = { fits: false, requiredBytes: 40e9, availableBytes: 8e9, estimated: false, message: 'Passt nicht in den Grafikspeicher.', alternatives: ['small:1b'] };
    select({ defaultModel: L('big:70b'), fallbacks: [L('small:1b')] });
    expect((await models.resolve('coder')).ref).toEqual(L('small:1b'));
    expect(fitCalls[0]).toEqual(['big:70b', 16384]);
    select({ defaultModel: L('big:70b') });
    const e = await caught(models.resolve('coder', { projectId: 'P' }));
    expect(e.code).toBe('VRAM_INSUFFICIENT');
    expect((e.details as { alternatives: string[] }).alternatives).toEqual(['small:1b']);
    expect(e.message).toContain('small:1b');
    expect(core.errors.list().find((x) => x.code === 'VRAM_INSUFFICIENT')).toMatchObject({ projectId: 'P' });
  });

  it('governor.allowedFor=false rejects a local model (NO_MODEL with the reason)', async () => {
    const { models, select } = await setup({ governor: { allowedFor: () => ({ ok: false, reason: 'Grafikspeicher zu 95 % belegt.' }) } });
    select({ defaultModel: L('qwen2.5-coder:7b') });
    const e = await caught(models.resolve('coder'));
    expect(e.code).toBe('NO_MODEL');
    expect(e.message).toContain('Grafikspeicher zu 95 % belegt.');
  });
});
