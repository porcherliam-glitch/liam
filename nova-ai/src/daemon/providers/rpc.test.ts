// Tests for registerProvidersRpc: every providers./models./ollama./budget. method is registered and returns results that
// match the RPC contract schemas; models.setSelection validation.
import { afterEach, describe, expect, it } from 'vitest';
import { RPC_METHODS, RpcContract, type RpcMethod } from '@shared/rpc';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { startFakeOllama, type FakeOllama } from '../../../tests/fakes/fake-ollama';
import type { RpcHandler, RpcRouter, Services } from '../contracts';
import { createBudgetService, createModelClient, createOllamaService, createProviderRegistry, registerProvidersRpc, OLLAMA_LOCAL_ID } from './index';
import { fakeApprovals, fakeGovernor, fakeNotifications, fakeProjects, fakeResources, fakeSecrets } from './test-fakes';

let t: TestCore | null = null;
let fake: FakeOllama | null = null;
afterEach(async () => {
  await fake?.close();
  fake = null;
  t?.cleanup();
  t = null;
});

function stubRouter() {
  const handlers = new Map<string, RpcHandler<RpcMethod>>();
  const router: RpcRouter = {
    register(method, handler) {
      handlers.set(method, handler as unknown as RpcHandler<RpcMethod>);
    },
    async handle() {
      throw new Error('not used');
    },
    registered: () => [...handlers.keys()],
  };
  /** Parses params like the real router, then calls the handler. */
  const call = async (method: RpcMethod, params: unknown = {}) => {
    const parsed = (RpcContract[method].params as { parse(v: unknown): unknown }).parse(params);
    const result = await handlers.get(method)!(parsed as never, { requestId: 'r1' });
    (RpcContract[method].result as { parse(v: unknown): unknown }).parse(result);
    return result as unknown;
  };
  return { router, handlers, call };
}

async function setup() {
  t = createTestCore();
  fake = await startFakeOllama({ models: ['qwen2.5-coder:7b'] });
  const s: Services = makeServices(t.core, {
    secrets: fakeSecrets(),
    approvals: fakeApprovals(),
    notifications: fakeNotifications(),
    projects: fakeProjects({}) as never,
    governor: fakeGovernor(),
    resources: fakeResources(null),
  });
  s.budget = createBudgetService(s);
  s.providers = createProviderRegistry(s);
  s.models = createModelClient(s);
  s.ollama = createOllamaService(s, { findExecutable: async () => null, fileExists: () => false });
  s.providers.ensureDefaults();
  s.providers.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: fake.url });
  const r = stubRouter();
  registerProvidersRpc(r.router, s);
  return { s, ...r };
}

describe('registerProvidersRpc', () => {
  it('registers every providers.*, models.*, ollama.* and budget.* method of the contract', async () => {
    const { router } = await setup();
    const expected = RPC_METHODS.filter((m) => /^(providers|models|ollama|budget)\./.test(m)).sort();
    expect(router.registered().sort()).toEqual(expected);
  });

  it('handlers return contract-valid results', async () => {
    const { call } = await setup();
    expect(((await call('providers.list')) as unknown[]).length).toBe(1);
    const created = (await call('providers.upsert', { type: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com' })) as { id: string };
    expect(await call('providers.setApiKey', { providerId: created.id, apiKey: 'sk-ant-api03-abcdefghijklmnop' })).toEqual({ ok: true });
    expect(await call('providers.clearApiKey', { providerId: created.id })).toEqual({ ok: true });
    expect(await call('providers.remove', { id: created.id })).toEqual({ ok: true });
    expect(await call('providers.test', { providerId: OLLAMA_LOCAL_ID })).toMatchObject({ status: 'ok' });
    expect(((await call('providers.health')) as unknown[]).length).toBe(1);
    expect(((await call('models.list')) as Array<{ id: string }>).map((m) => m.id)).toEqual(['qwen2.5-coder:7b']);
    expect(await call('models.setPricing', { providerId: OLLAMA_LOCAL_ID, modelId: 'qwen2.5-coder:7b', pricing: null })).toMatchObject({ id: 'qwen2.5-coder:7b' });
    expect(await call('ollama.status')).toMatchObject({ running: true, installed: false });
    expect(((await call('ollama.models')) as unknown[]).length).toBe(1);
    expect(await call('ollama.show', { model: 'qwen2.5-coder:7b' })).toMatchObject({ model: { id: 'qwen2.5-coder:7b' } });
    expect(await call('ollama.running')).toEqual([]);
    expect(await call('ollama.fit', { model: 'qwen2.5-coder:7b' })).toMatchObject({ fits: null });
    expect(await call('ollama.pulls')).toEqual([]);
    expect(await call('budget.status')).toMatchObject({ dailyLimitUsd: 0, paidPaused: false });
    expect(await call('budget.setLimits', { dailyLimitUsd: 2 })).toMatchObject({ dailyLimitUsd: 2 });
    expect(await call('budget.usage')).toEqual([]);
    expect(await call('budget.breakdown', { groupBy: 'day' })).toEqual([]);
    expect(await call('budget.resumePaid')).toMatchObject({ paidPaused: false });
  });

  it('models.setSelection validates providers and removes duplicate fallbacks', async () => {
    const { call, s } = await setup();
    await expect(call('models.setSelection', { defaultModel: { providerId: 'nope', modelId: 'x' } })).rejects.toMatchObject({ code: 'VALIDATION' });
    const ref = { providerId: OLLAMA_LOCAL_ID, modelId: 'qwen2.5-coder:7b' };
    const out = (await call('models.setSelection', { defaultModel: ref, fallbacks: [ref, ref], roleOverrides: { coder: ref } })) as { fallbacks: unknown[]; roleOverrides: Record<string, unknown> };
    expect(out.fallbacks).toEqual([ref]);
    expect(out.roleOverrides).toMatchObject({ coder: ref, planner: null });
    expect(s.core.settings.section('models').defaultModel).toEqual(ref);
    const partial = (await call('models.setSelection', { temperature: 0.5 })) as { defaultModel: unknown; temperature: number };
    expect(partial).toMatchObject({ defaultModel: ref, temperature: 0.5 });
    expect(await call('models.getSelection')).toMatchObject({ temperature: 0.5 });
  });

  it('ollama.pull / cancelPull / delete through RPC', async () => {
    const { call } = await setup();
    fake!.pullScript('slow:1b', [{ status: 'pulling manifest', delayMs: 500 }, { status: 'success' }]);
    const pull = (await call('ollama.pull', { model: 'slow:1b' })) as { id: string };
    expect(await call('ollama.cancelPull', { id: pull.id })).toMatchObject({ status: 'cancelled' });
    expect(await call('ollama.delete', { model: 'qwen2.5-coder:7b' })).toEqual({ ok: true });
  });
});
