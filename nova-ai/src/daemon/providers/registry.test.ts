// Tests for the ProviderRegistry: default row, upsert merge semantics and validation, API keys via the secret store,
// removal, model list cache/persistence/pricing and the health cache.
import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderConfig } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { startFakeOllama, type FakeOllama } from '../../../tests/fakes/fake-ollama';
import { startFakeOpenAi, type FakeOpenAi } from '../../../tests/fakes/fake-openai';
import { unusedLocalUrl } from '../../../tests/fakes/fake-http';
import { NovaError } from '../core/errors';
import { createProviderRegistry, OLLAMA_LOCAL_ID } from './registry';
import { fakeSecrets } from './test-fakes';

let t: TestCore | null = null;
const servers: Array<{ close(): Promise<void> }> = [];
afterEach(async () => {
  for (const s of servers.splice(0)) await s.close();
  t?.cleanup();
  t = null;
});

function setup() {
  t = createTestCore();
  const secrets = fakeSecrets();
  const s = makeServices(t.core, { secrets });
  const registry = createProviderRegistry(s);
  s.providers = registry;
  const events: { type: string; payload: unknown }[] = [];
  t.core.bus.onAny((e) => events.push({ type: e.type, payload: e.payload }));
  return { s, registry, secrets, events, core: t.core };
}

describe('provider registry', () => {
  it('creates the ollama-local default row once', () => {
    const { registry, events } = setup();
    registry.ensureDefaults();
    registry.ensureDefaults();
    const list = registry.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: OLLAMA_LOCAL_ID, type: 'ollama', baseUrl: 'http://127.0.0.1:11434', enabled: true, paid: false, approved: true, hasApiKey: false });
    expect(events.filter((e) => e.type === 'provider.updated')).toHaveLength(1);
  });

  it('applies create defaults and update merge semantics', () => {
    const { registry, events } = setup();
    const created = registry.upsert({ type: 'openai_compatible', name: 'OpenAI Cloud', baseUrl: 'https://api.openai.com/v1/' });
    expect(created).toMatchObject({ id: 'openai-cloud', enabled: true, paid: true, approved: false, options: {}, baseUrl: 'https://api.openai.com/v1' });
    const local = registry.upsert({ type: 'openai_compatible', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1' });
    expect(local).toMatchObject({ id: 'lm-studio', paid: false, approved: false });
    const second = registry.upsert({ type: 'openai_compatible', name: 'OpenAI Cloud', baseUrl: 'https://api.openai.com/v1' });
    expect(second.id).toBe('openai-cloud-2');

    const updated = registry.upsert({ id: 'openai-cloud', type: 'openai_compatible', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', approved: true, options: { maxConcurrent: '2' } });
    expect(updated).toMatchObject({ name: 'OpenAI', paid: true, approved: true, enabled: true, options: { maxConcurrent: '2' } });
    const kept = registry.upsert({ id: 'openai-cloud', type: 'openai_compatible', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', enabled: false });
    expect(kept).toMatchObject({ approved: true, enabled: false, options: { maxConcurrent: '2' } });
    expect(events.filter((e) => e.type === 'provider.updated').length).toBeGreaterThanOrEqual(5);

    expect(() => registry.upsert({ id: 'openai-cloud', type: 'anthropic', name: 'X', baseUrl: 'https://api.anthropic.com' })).toThrow(/Typ/);
    const ollamaRow = registry.upsert({ id: 'ollama-lan', type: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11500', paid: true, approved: false });
    expect(ollamaRow).toMatchObject({ paid: false, approved: true });
  });

  it('validates ids, https for remote endpoints and secret-free options', () => {
    const { registry } = setup();
    expect(() => registry.upsert({ id: 'Bad_Id', type: 'openai_compatible', name: 'X', baseUrl: 'https://x.example' })).toThrow(NovaError);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'http://api.example.com/v1' })).toThrow(/https/);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'https://user:pw@api.example.com' })).toThrow(/Zugangsdaten/);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'https://api.example.com', options: { apiKey: 'abc' } })).toThrow(/Schlüssel/);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'https://api.example.com', options: { organization: 'sk-abcdefghijklmnopqrstuvwxyz0123' } })).toThrow(/Schlüssel/);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'https://api.example.com', options: { foo: 'bar' } })).toThrow(/Unbekannte/);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'https://api.example.com', options: { maxConcurrent: '0' } })).toThrow(/maxConcurrent/);
    expect(() => registry.upsert({ type: 'openai_compatible', name: 'X', baseUrl: 'https://api.example.com', options: { authHeader: 'bad header' } })).toThrow(/authHeader/);
    const ok = registry.upsert({ type: 'openai_compatible', name: 'Azure', baseUrl: 'https://x.openai.azure.com/openai/v1', options: { authHeader: 'api-key', maxRequestsPerMinute: '60', organization: '' } });
    expect(ok.options).toEqual({ authHeader: 'api-key', maxRequestsPerMinute: '60' });
  });

  it('stores API keys in the secret store, never in the row, and removes providers completely', async () => {
    const { registry, secrets, core, events } = setup();
    registry.ensureDefaults();
    const p = registry.upsert({ type: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com' });
    await registry.setApiKey(p.id, '  sk-ant-api03-secretvalue1234567890  ');
    expect(secrets.values.get('provider:anthropic')).toBe('sk-ant-api03-secretvalue1234567890');
    expect(registry.getConfig(p.id)!.hasApiKey).toBe(true);
    const raw = core.db.all<Record<string, unknown>>('SELECT * FROM providers');
    expect(JSON.stringify(raw)).not.toContain('secretvalue');
    await expect(registry.setApiKey(p.id, 'has space inside')).rejects.toThrow(/ungültig/);
    await expect(registry.setApiKey('nope', 'abcdefgh')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await registry.setPricing({ providerId: p.id, modelId: 'claude-x' }, { inputPerMTokUsd: 3, outputPerMTokUsd: 15, estimated: true });
    expect(() => registry.remove(OLLAMA_LOCAL_ID)).toThrow(/deaktivieren/);
    registry.remove(p.id);
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.getConfig(p.id)).toBeNull();
    expect(secrets.values.has('provider:anthropic')).toBe(false);
    expect(core.db.all('SELECT * FROM model_profiles WHERE provider_id = ?', [p.id])).toHaveLength(0);
    expect(events.some((e) => e.type === 'provider.removed' && (e.payload as { id: string }).id === p.id)).toBe(true);
    expect(() => registry.remove('nope')).toThrow(/nicht gefunden/);
  });

  it('removing a provider drops its models from the model selection', () => {
    const { registry, core } = setup();
    registry.ensureDefaults();
    const p = registry.upsert({ type: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com' });
    const cloud = { providerId: p.id, modelId: 'claude-x' };
    const local = { providerId: OLLAMA_LOCAL_ID, modelId: 'qwen2.5-coder:7b' };
    core.settings.update({ models: { defaultModel: cloud, fallbacks: [cloud, local], roleOverrides: { reviewer: cloud, coder: local } } });
    registry.remove(p.id);
    const m = core.settings.section('models');
    expect(m.defaultModel).toBeNull();
    expect(m.fallbacks).toEqual([local]);
    expect(m.roleOverrides).toMatchObject({ reviewer: null, coder: local });
  });

  it('caches model lists, persists profiles, merges user pricing and falls back to the persisted list when offline', async () => {
    const { registry, core } = setup();
    const ollama: FakeOllama = await startFakeOllama({ models: ['qwen2.5-coder:7b', 'llama3.2:3b'] });
    servers.push(ollama);
    registry.ensureDefaults();
    registry.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: ollama.url });
    const first = await registry.listModels();
    expect(first.map((m) => m.id).sort()).toEqual(['llama3.2:3b', 'qwen2.5-coder:7b']);
    const tagCalls = () => ollama.requests.filter((r) => r.path === '/api/tags').length;
    const before = tagCalls();
    await registry.listModels();
    expect(tagCalls()).toBe(before);
    await registry.listModels(true);
    expect(tagCalls()).toBe(before + 1);
    expect(core.db.all('SELECT * FROM model_profiles WHERE provider_id = ?', [OLLAMA_LOCAL_ID])).toHaveLength(2);

    const priced = await registry.setPricing({ providerId: OLLAMA_LOCAL_ID, modelId: 'qwen2.5-coder:7b' }, { inputPerMTokUsd: 0, outputPerMTokUsd: 0, estimated: true });
    expect(priced.pricing).toEqual({ inputPerMTokUsd: 0, outputPerMTokUsd: 0, estimated: true });
    expect((await registry.getModel({ providerId: OLLAMA_LOCAL_ID, modelId: 'qwen2.5-coder:7b' }))!.pricing).not.toBeNull();

    // A model that disappeared is removed unless it carries user pricing.
    const events: string[] = [];
    core.bus.on('ollama.models.changed', (p) => events.push(p.providerId));
    ollama.setModels(['qwen2.5-coder:7b']);
    await registry.listModels(true);
    expect(events).toEqual([OLLAMA_LOCAL_ID]);
    expect(core.db.all('SELECT model_id FROM model_profiles WHERE provider_id = ?', [OLLAMA_LOCAL_ID])).toHaveLength(1);

    registry.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: await unusedLocalUrl() });
    const offline = await registry.listModels(true);
    expect(offline.map((m) => m.id)).toEqual(['qwen2.5-coder:7b']);
  });

  it('pricing of cloud models: user pricing overrides provider pricing and works before the list is known', async () => {
    const { registry } = setup();
    const cloud: FakeOpenAi = await startFakeOpenAi({ apiKey: 'sk-test-0123456789abcdefghijkl', models: [{ id: 'm1', pricing: { prompt: '0.000001', completion: '0.000002' } }] });
    servers.push(cloud);
    const p = registry.upsert({ type: 'openai_compatible', name: 'Router', baseUrl: cloud.url, paid: true });
    await registry.setApiKey(p.id, 'sk-test-0123456789abcdefghijkl');
    const before = await registry.getModel({ providerId: p.id, modelId: 'm1' });
    expect(before!.pricing).toEqual({ inputPerMTokUsd: 1, outputPerMTokUsd: 2, estimated: false });
    const user = await registry.setPricing({ providerId: p.id, modelId: 'm1' }, { inputPerMTokUsd: 5, outputPerMTokUsd: 6, estimated: true });
    expect(user.pricing).toEqual({ inputPerMTokUsd: 5, outputPerMTokUsd: 6, estimated: true });
    const cleared = await registry.setPricing({ providerId: p.id, modelId: 'm1' }, null);
    expect(cleared.pricing).toEqual({ inputPerMTokUsd: 1, outputPerMTokUsd: 2, estimated: false });
    const unknown = await registry.setPricing({ providerId: p.id, modelId: 'future-model' }, { inputPerMTokUsd: 1, outputPerMTokUsd: 1, estimated: true });
    expect(unknown).toMatchObject({ id: 'future-model', paid: true, pricing: { inputPerMTokUsd: 1 } });
    await expect(registry.setPricing({ providerId: 'nope', modelId: 'x' }, null)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('health: test() is live, lastHealth() is a cache, disabled providers are not contacted', async () => {
    const { registry } = setup();
    const ollama = await startFakeOllama({ version: '0.10.0' });
    servers.push(ollama);
    registry.ensureDefaults();
    registry.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: ollama.url });
    const off: ProviderConfig = registry.upsert({ type: 'openai_compatible', name: 'Off', baseUrl: 'https://api.example.invalid/v1', enabled: false });
    expect(registry.lastHealth()).toEqual([]);
    const all = await registry.healthAll();
    expect(all.map((h) => [h.providerId, h.status])).toEqual([
      [OLLAMA_LOCAL_ID, 'ok'],
      [off.id, 'disabled'],
    ]);
    expect(registry.lastHealth()).toHaveLength(2);
    const versionCalls = ollama.requests.filter((r) => r.path === '/api/version').length;
    registry.lastHealth();
    expect(ollama.requests.filter((r) => r.path === '/api/version').length).toBe(versionCalls);
    const tested = await registry.test(OLLAMA_LOCAL_ID);
    expect(tested).toMatchObject({ status: 'ok', version: '0.10.0' });
    await expect(registry.test('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    registry.stop();
  });

  it('get() returns a wrapper whose listModels is live and persisted', async () => {
    const { registry } = setup();
    const ollama = await startFakeOllama({ models: ['a:1b'] });
    servers.push(ollama);
    registry.ensureDefaults();
    registry.upsert({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: 'Ollama (lokal)', baseUrl: ollama.url });
    const p = registry.get(OLLAMA_LOCAL_ID)!;
    expect(p.type).toBe('ollama');
    expect(p.config().baseUrl).toBe(ollama.url);
    expect((await p.listModels()).map((m) => m.id)).toEqual(['a:1b']);
    expect(registry.get('nope')).toBeNull();
  });
});
