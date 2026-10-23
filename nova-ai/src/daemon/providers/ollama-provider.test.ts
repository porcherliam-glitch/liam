// Tests for the Ollama ModelProvider against the fake Ollama server: model listing (capabilities, context length,
// pre-0.6 servers), message/tool-call mapping both ways, usage, error classification and abort handling.
import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderConfig } from '@shared/schemas';
import { nullLogger } from '../core/logger';
import { NovaError } from '../core/errors';
import type { ChatMessage } from '../contracts';
import { startFakeOllama, type FakeOllama } from '../../../tests/fakes/fake-ollama';
import { unusedLocalUrl } from '../../../tests/fakes/fake-http';
import { ollamaFactory, toOllamaMessages, fromOllamaToolCalls } from './ollama-provider';
import { providerErrorDetails } from './http';

let ollama: FakeOllama | null = null;
afterEach(async () => {
  await ollama?.close();
  ollama = null;
});

function cfg(baseUrl: string): ProviderConfig {
  return { id: 'ollama-local', type: 'ollama', name: 'Ollama (lokal)', baseUrl, enabled: true, paid: false, approved: true, hasApiKey: false, options: {}, createdAt: 0, updatedAt: 0 };
}

const deps = { getApiKey: async () => null, log: nullLogger };

describe('ollama provider', () => {
  it('lists models with capabilities, context length and details', async () => {
    ollama = await startFakeOllama({
      models: [
        { name: 'qwen2.5-coder:7b', parameterSize: '7.6B', contextLength: 32768, architecture: 'qwen2' },
        { name: 'nomic-embed-text', capabilities: ['embedding'], architecture: 'nomic-bert', contextLength: 2048 },
        { name: 'old-model:1b', omitCapabilities: true, architecture: 'llama', contextLength: 8192 },
      ],
    });
    const p = ollamaFactory.create(cfg(ollama.url), deps);
    const models = await p.listModels();
    const coder = models.find((m) => m.id === 'qwen2.5-coder:7b')!;
    expect(coder).toMatchObject({ providerId: 'ollama-local', local: true, paid: false, contextLength: 32768, family: 'qwen2', parameterSize: '7.6B', quantization: 'Q4_K_M' });
    expect(coder.capabilities).toEqual(['completion', 'tools']);
    expect(coder.sizeBytes).toBeGreaterThan(1e9);
    expect(models.find((m) => m.id === 'nomic-embed-text:latest')!.capabilities).toEqual(['embedding']);
    // Older Ollama without `capabilities`: derived from the template like Ollama does.
    const old = models.find((m) => m.id === 'old-model:1b')!;
    expect(old.capabilities).toEqual(['completion', 'tools']);
    expect(old.contextLength).toBe(8192);
  });

  it('maps messages and tool calls both ways and sends options', async () => {
    ollama = await startFakeOllama({ models: ['qwen2.5-coder:7b'] });
    ollama.queueChat((req) => {
      expect(req.stream).toBe(false);
      return { content: '', tool_calls: [{ name: 'read_file', arguments: { path: 'src/a.ts' } }, { function: { name: 'list_files', arguments: '{"path":"."}' } }] };
    });
    const p = ollamaFactory.create(cfg(ollama.url), deps);
    const messages: ChatMessage[] = [
      { role: 'system', content: 'You are a coder.' },
      { role: 'user', content: 'Fix the bug.' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'call_1', name: 'search_files', arguments: { query: 'bug' } }] },
      { role: 'tool', toolCallId: 'call_1', name: 'search_files', content: 'src/a.ts:3' },
    ];
    const res = await p.chat({
      model: 'qwen2.5-coder:7b',
      messages,
      tools: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } }],
      temperature: 0.2,
      maxTokens: 512,
      numCtx: 8192,
      json: true,
    });
    const sent = ollama.chatRequests()[0];
    expect(sent.raw.options).toEqual({ num_ctx: 8192, temperature: 0.2, num_predict: 512 });
    expect(sent.format).toBe('json');
    expect(sent.tools[0]).toEqual({ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } });
    expect(sent.messages[2]).toEqual({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'search_files', arguments: { query: 'bug' } } }] });
    expect(sent.messages[3]).toEqual({ role: 'tool', content: 'src/a.ts:3', tool_name: 'search_files' });
    expect(res.toolCalls).toHaveLength(2);
    expect(res.toolCalls[0]).toMatchObject({ name: 'read_file', arguments: { path: 'src/a.ts' } });
    expect(res.toolCalls[0].id).toMatch(/^call_[0-9a-f]{12}$/);
    expect(res.toolCalls[1].arguments).toEqual({ path: '.' });
    expect(res.toolCalls[0].id).not.toBe(res.toolCalls[1].id);
    expect(res.usage.usageReported).toBe(true);
    expect(res.usage.inputTokens).toBeGreaterThan(0);
    expect(res.usage.outputTokens).toBeGreaterThan(0);
    expect(res.finishReason).toBe('stop');
  });

  it('reports missing usage (cached prompt) as not reported', async () => {
    ollama = await startFakeOllama({ models: ['m:1b'] });
    ollama.queueChat({ content: 'hi', omitUsage: true });
    const res = await ollamaFactory.create(cfg(ollama.url), deps).chat({ model: 'm:1b', messages: [{ role: 'user', content: 'x' }] });
    expect(res.content).toBe('hi');
    expect(res.usage).toEqual({ inputTokens: 0, outputTokens: 0, usageReported: false });
  });

  it('classifies errors: 404 → MODEL_UNAVAILABLE, refused → OLLAMA_UNREACHABLE, 500 → retryable PROVIDER_ERROR', async () => {
    ollama = await startFakeOllama({ models: ['m:1b'] });
    const p = ollamaFactory.create(cfg(ollama.url), deps);
    const e404 = await p.chat({ model: 'missing:7b', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e);
    expect(e404).toBeInstanceOf(NovaError);
    expect((e404 as NovaError).code).toBe('MODEL_UNAVAILABLE');
    expect((e404 as NovaError).message).toContain('nicht installiert');
    expect(providerErrorDetails(e404)).toMatchObject({ status: 404, requestSent: true, billable: false, retryable: false });

    ollama.queueChat({ status: 500, error: 'out of memory' });
    const e500 = (await p.chat({ model: 'm:1b', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(e500.code).toBe('PROVIDER_ERROR');
    expect(e500.message).toContain('out of memory');
    expect(providerErrorDetails(e500)).toMatchObject({ status: 500, requestSent: true, billable: true, retryable: true });

    const down = ollamaFactory.create(cfg(await unusedLocalUrl()), deps);
    const eDown = (await down.chat({ model: 'm:1b', messages: [{ role: 'user', content: 'x' }] }).catch((e: unknown) => e)) as NovaError;
    expect(eDown.code).toBe('OLLAMA_UNREACHABLE');
    expect(eDown.message).toMatch(/Ollama ist nicht erreichbar.*Bitte Ollama starten/);
    expect(providerErrorDetails(eDown)).toMatchObject({ requestSent: false, billable: false, retryable: true, networkCode: 'ECONNREFUSED' });
    const h = await down.health();
    expect(h.status).toBe('unreachable');
  });

  it('honours AbortSignal (CANCELLED, sent) and a pre-aborted signal (not sent)', async () => {
    ollama = await startFakeOllama({ models: ['m:1b'] });
    ollama.queueChat({ content: 'late', delayMs: 2000 });
    const p = ollamaFactory.create(cfg(ollama.url), deps);
    const c = new AbortController();
    // abort once the request has really reached the server (a fixed delay is too short on a slow CI machine)
    const watcher = setInterval(() => {
      if (ollama!.chatRequests().length > 0) c.abort();
    }, 5);
    const e = (await p.chat({ model: 'm:1b', messages: [{ role: 'user', content: 'x' }], signal: c.signal }).catch((x: unknown) => x).finally(() => clearInterval(watcher))) as NovaError;
    expect(e.code).toBe('CANCELLED');
    expect(providerErrorDetails(e)).toMatchObject({ requestSent: true, billable: true });
    const pre = new AbortController();
    pre.abort();
    const e2 = (await p.chat({ model: 'm:1b', messages: [{ role: 'user', content: 'x' }], signal: pre.signal }).catch((x: unknown) => x)) as NovaError;
    expect(e2.code).toBe('CANCELLED');
    expect(providerErrorDetails(e2)).toMatchObject({ requestSent: false, billable: false });
  });

  it('health reports version', async () => {
    ollama = await startFakeOllama({ version: '0.9.1' });
    const h = await ollamaFactory.create(cfg(ollama.url), deps).health();
    expect(h).toMatchObject({ status: 'ok', version: '0.9.1' });
    expect(h.message).toContain('0.9.1');
  });

  it('pure mapping helpers', () => {
    expect(toOllamaMessages([{ role: 'assistant', content: 'ok' }])).toEqual([{ role: 'assistant', content: 'ok' }]);
    expect(fromOllamaToolCalls([{ function: { name: 'x', arguments: 'not json' } }, { function: {} }, null])[0]).toMatchObject({ name: 'x', arguments: { _unparsedArguments: 'not json' } });
    expect(fromOllamaToolCalls(undefined)).toEqual([]);
  });
});
