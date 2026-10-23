// Tests for the Anthropic ModelProvider against a fake Messages API that validates requests like the real one:
// top-level system prompt, merged turns with tool_result blocks, usage incl. cache tokens, errors, model list.
import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderConfig } from '@shared/schemas';
import { nullLogger } from '../core/logger';
import { NovaError } from '../core/errors';
import type { ChatMessage } from '../contracts';
import { startFakeAnthropic, type FakeAnthropic } from '../../../tests/fakes/fake-anthropic';
import { anthropicFactory, toAnthropicRequest } from './anthropic-provider';
import { providerErrorDetails } from './http';

let server: FakeAnthropic | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const KEY = 'sk-ant-test-0123456789abcdef';
function cfg(baseUrl: string): ProviderConfig {
  return { id: 'anthropic', type: 'anthropic', name: 'Anthropic', baseUrl, enabled: true, paid: true, approved: true, hasApiKey: true, options: {}, createdAt: 0, updatedAt: 0 };
}
const deps = { getApiKey: async () => KEY, log: nullLogger };

const conversation: ChatMessage[] = [
  { role: 'system', content: 'You are the coder.' },
  { role: 'user', content: 'Implement it.' },
  { role: 'user', content: 'Note from the user: use TypeScript.' },
  { role: 'assistant', content: 'Let me look.', toolCalls: [{ id: 'call_1', name: 'list_files', arguments: { path: '.' } }, { id: 'call.2', name: 'read_file', arguments: { path: 'a.ts' } }] },
  { role: 'tool', toolCallId: 'call_1', name: 'list_files', content: 'a.ts' },
  { role: 'tool', toolCallId: 'call.2', name: 'read_file', content: '' },
  { role: 'user', content: 'Note from the user: hurry.' },
];

describe('anthropic provider', () => {
  it('sends a valid Messages request (system top-level, merged turns, tool_result blocks) and maps the answer', async () => {
    server = await startFakeAnthropic({ apiKey: KEY });
    server.queueReply({ text: 'Reading.', tool_uses: [{ id: 'toolu_1', name: 'read_file', input: { path: 'b.ts' } }], usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 30 } });
    const p = anthropicFactory.create(cfg(server.url), deps);
    const res = await p.chat({
      model: 'claude-test-1',
      messages: conversation,
      tools: [{ name: 'read_file', description: 'Read', parameters: { type: 'object', properties: { path: { type: 'string' } } } }],
      maxTokens: 2048,
      temperature: 0.2,
    });
    const req = server.messageRequests()[0];
    expect(req.headers['x-api-key']).toBe(KEY);
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.system).toBe('You are the coder.');
    expect(req.raw.max_tokens).toBe(2048);
    expect(req.tools).toEqual([{ name: 'read_file', description: 'Read', input_schema: { type: 'object', properties: { path: { type: 'string' } } } }]);
    expect(req.messages).toHaveLength(3);
    expect(req.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Implement it.' }, { type: 'text', text: 'Note from the user: use TypeScript.' }] });
    expect(req.messages[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 'call_1', content: 'a.ts' },
      { type: 'tool_result', tool_use_id: 'call_2', content: '(no output)' },
      { type: 'text', text: 'Note from the user: hurry.' },
    ]);
    expect(res.content).toBe('Reading.');
    expect(res.toolCalls).toEqual([{ id: 'toolu_1', name: 'read_file', arguments: { path: 'b.ts' } }]);
    expect(res.usage).toEqual({ inputTokens: 130, outputTokens: 20, usageReported: true });
    expect(res.finishReason).toBe('tool_use');
  });

  it('JSON mode adds a system instruction and a leading assistant turn gets a user turn first', () => {
    const r = toAnthropicRequest([{ role: 'assistant', content: 'Hi' }], true);
    expect(r.system).toContain('JSON');
    expect(r.messages[0]).toEqual({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
    expect(r.messages[1].role).toBe('assistant');
  });

  it('classifies 429 with retry-after, 529 overloaded and 401', async () => {
    server = await startFakeAnthropic({ apiKey: KEY });
    const p = anthropicFactory.create(cfg(server.url), deps);
    server.queueReply({ status: 429, headers: { 'retry-after': '3' }, errorType: 'rate_limit_error', error: 'Number of requests has exceeded your rate limit' });
    const e429 = (await p.chat({ model: 'claude-test-1', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e429.code).toBe('PROVIDER_RATE_LIMIT');
    expect(providerErrorDetails(e429)?.retryAfterMs).toBe(3000);
    server.queueReply({ status: 529, errorType: 'overloaded_error', error: 'Overloaded' });
    const e529 = (await p.chat({ model: 'claude-test-1', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e529.code).toBe('PROVIDER_ERROR');
    expect(providerErrorDetails(e529)).toMatchObject({ retryable: true, status: 529 });
    const bad = anthropicFactory.create(cfg(server.url), { getApiKey: async () => 'sk-ant-wrong-0123456789', log: nullLogger });
    const e401 = (await bad.chat({ model: 'claude-test-1', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e401.code).toBe('PROVIDER_AUTH');
  });

  it('lists models (base URL with or without /v1) with 200k context', async () => {
    server = await startFakeAnthropic({ apiKey: KEY, models: ['claude-sonnet-test', 'claude-haiku-test'] });
    for (const base of [server.url, `${server.url}/v1`]) {
      const models = await anthropicFactory.create(cfg(base), deps).listModels();
      expect(models.map((m) => m.id)).toEqual(['claude-sonnet-test', 'claude-haiku-test']);
      expect(models[0]).toMatchObject({ contextLength: 200000, capabilities: ['completion', 'tools', 'vision'], paid: true });
    }
    expect(await anthropicFactory.create(cfg(server.url), deps).health()).toMatchObject({ status: 'ok' });
  });
});
