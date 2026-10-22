// Tests for the OpenAI-compatible ModelProvider against a fake server: message merging, tool calls, auth headers,
// error classification (401/429/5xx/missing key), adaptive request shape and model list parsing.
import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderConfig } from '@shared/schemas';
import { nullLogger } from '../core/logger';
import { NovaError } from '../core/errors';
import { startFakeOpenAi, type FakeOpenAi } from '../../../tests/fakes/fake-openai';
import { openAiCompatibleFactory, toOpenAiMessages } from './openai-provider';
import { providerErrorDetails } from './http';

let server: FakeOpenAi | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

function cfg(baseUrl: string, options: Record<string, string> = {}): ProviderConfig {
  return { id: 'openai', type: 'openai_compatible', name: 'OpenAI', baseUrl, enabled: true, paid: true, approved: true, hasApiKey: true, options, createdAt: 0, updatedAt: 0 };
}

const KEY = 'sk-test-0123456789abcdefghij';
const deps = (key: string | null = KEY) => ({ getApiKey: async () => key, log: nullLogger });

describe('openai-compatible provider', () => {
  it('maps system prompt, merges consecutive messages, tool specs, tool calls and tool results', async () => {
    server = await startFakeOpenAi({ apiKey: KEY });
    server.queueChat({ content: null, tool_calls: [{ id: 'call_abc', name: 'read_file', arguments: { path: 'a.ts' } }], usage: { prompt_tokens: 321, completion_tokens: 12 } });
    const p = openAiCompatibleFactory.create(cfg(server.url), deps());
    const res = await p.chat({
      model: 'gpt-test',
      messages: [
        { role: 'system', content: 'S1' },
        { role: 'system', content: 'S2' },
        { role: 'user', content: 'U1' },
        { role: 'user', content: 'U2' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'list_files', arguments: { path: '.' } }] },
        { role: 'tool', toolCallId: 'call_1', name: 'list_files', content: 'a.ts' },
      ],
      tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object' } }],
      temperature: 0.2,
      maxTokens: 1000,
      json: true,
    });
    const sent = server.chatRequests()[0];
    expect(sent.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(sent.messages).toEqual([
      { role: 'system', content: 'S1\n\nS2' },
      { role: 'user', content: 'U1\n\nU2' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'list_files', arguments: '{"path":"."}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'a.ts' },
    ]);
    expect(sent.tools).toEqual([{ type: 'function', function: { name: 'read_file', description: 'Read', parameters: { type: 'object' } } }]);
    expect(sent.raw).toMatchObject({ max_tokens: 1000, temperature: 0.2, response_format: { type: 'json_object' }, stream: false });
    expect(res.toolCalls).toEqual([{ id: 'call_abc', name: 'read_file', arguments: { path: 'a.ts' } }]);
    expect(res.usage).toEqual({ inputTokens: 321, outputTokens: 12, usageReported: true });
    expect(res.finishReason).toBe('tool_calls');
  });

  it('uses options.authHeader and organization, keeps the key out of the URL', async () => {
    server = await startFakeOpenAi({ apiKey: KEY, authHeader: 'api-key' });
    server.queueChat({ content: 'ok' });
    const p = openAiCompatibleFactory.create(cfg(server.url, { authHeader: 'api-key', organization: 'org-1' }), deps());
    await p.chat({ model: 'gpt-test', messages: [{ role: 'user', content: 'x' }] });
    const req = server.requests.find((r) => r.path.endsWith('/chat/completions'))!;
    expect(req.headers['api-key']).toBe(KEY);
    expect(req.headers.authorization).toBeUndefined();
    expect(req.headers['openai-organization']).toBe('org-1');
    expect(JSON.stringify(req.query)).not.toContain(KEY);
  });

  it('classifies 401, 429 with Retry-After, 503 and a missing key', async () => {
    server = await startFakeOpenAi({ apiKey: KEY });
    const bad = openAiCompatibleFactory.create(cfg(server.url), deps('sk-wrong-0123456789abcdefghij'));
    const e401 = (await bad.chat({ model: 'gpt-test', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e401.code).toBe('PROVIDER_AUTH');
    expect(e401.message).toContain('API-Schlüssel');
    expect(providerErrorDetails(e401)).toMatchObject({ status: 401, billable: false, retryable: false });
    expect(await bad.health()).toMatchObject({ status: 'auth_error' });

    const p = openAiCompatibleFactory.create(cfg(server.url), deps());
    server.queueChat({ status: 429, headers: { 'retry-after': '7' }, error: 'Rate limit reached' });
    const e429 = (await p.chat({ model: 'gpt-test', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e429.code).toBe('PROVIDER_RATE_LIMIT');
    expect(providerErrorDetails(e429)).toMatchObject({ status: 429, retryAfterMs: 7000, retryable: true, billable: false });

    server.queueChat({ status: 503, error: 'overloaded' });
    const e503 = (await p.chat({ model: 'gpt-test', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e503.code).toBe('PROVIDER_ERROR');
    expect(providerErrorDetails(e503)).toMatchObject({ status: 503, retryable: true, billable: true, requestSent: true });

    const noKey = openAiCompatibleFactory.create(cfg('https://api.example.invalid/v1'), deps(null));
    const eKey = (await noKey.chat({ model: 'gpt-test', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(eKey.code).toBe('PROVIDER_AUTH');
    expect(providerErrorDetails(eKey)).toMatchObject({ requestSent: false });
    expect(await noKey.health()).toMatchObject({ status: 'not_configured' });
  });

  it('adapts to max_completion_tokens and unsupported temperature (400 is not billed)', async () => {
    server = await startFakeOpenAi({ apiKey: KEY });
    server.setDefaultChat((req) =>
      'max_tokens' in req.raw
        ? { status: 400, body: { error: { message: "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.", type: 'invalid_request_error' } } }
        : 'temperature' in req.raw
          ? { status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0.2 with this model. Only the default (1) value is supported." } } }
          : { content: 'adapted' },
    );
    const p = openAiCompatibleFactory.create(cfg(server.url), deps());
    const res = await p.chat({ model: 'o-test', messages: [{ role: 'user', content: 'x' }], maxTokens: 100, temperature: 0.2 });
    expect(res.content).toBe('adapted');
    const last = server.chatRequests().at(-1)!.raw;
    expect(last.max_completion_tokens).toBe(100);
    expect('max_tokens' in last).toBe(false);
    expect('temperature' in last).toBe(false);
  });

  it('lists models with OpenRouter pricing, context and tool support', async () => {
    server = await startFakeOpenAi({
      apiKey: KEY,
      models: [
        { id: 'vendor/model-a', name: 'Model A', context_length: 128000, pricing: { prompt: '0.000003', completion: '0.000015' }, supported_parameters: ['tools', 'temperature'] },
        { id: 'vendor/model-b', supported_parameters: ['temperature'] },
        { id: 'text-embedding-3-small' },
        'gpt-4o',
      ],
    });
    const models = await openAiCompatibleFactory.create(cfg(server.url), deps()).listModels();
    const a = models.find((m) => m.id === 'vendor/model-a')!;
    expect(a).toMatchObject({ displayName: 'Model A', contextLength: 128000, paid: true, local: true, capabilities: ['completion', 'tools'] });
    expect(a.pricing).toEqual({ inputPerMTokUsd: 3, outputPerMTokUsd: 15, estimated: false });
    expect(models.find((m) => m.id === 'vendor/model-b')!.capabilities).toEqual(['completion']);
    expect(models.find((m) => m.id === 'text-embedding-3-small')!.capabilities).toEqual(['embedding']);
    expect(models.find((m) => m.id === 'gpt-4o')!.capabilities).toEqual(['completion', 'tools']);
  });

  it('assistant text followed by a tool call message is merged into one assistant turn', () => {
    expect(
      toOpenAiMessages([
        { role: 'assistant', content: 'Thinking' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c', name: 'x', arguments: {} }] },
      ]),
    ).toEqual([{ role: 'assistant', content: 'Thinking', tool_calls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{}' } }] }]);
  });
});
