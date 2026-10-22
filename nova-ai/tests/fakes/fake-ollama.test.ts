// Self-test of the fake Ollama server used by unit and end-to-end tests.
import { afterEach, describe, expect, it } from 'vitest';
import { startFakeOllama, type FakeOllama } from './fake-ollama';

let ollama: FakeOllama | null = null;
afterEach(async () => {
  await ollama?.close();
  ollama = null;
});

const post = (path: string, body: unknown) => fetch(`${ollama!.url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('fake ollama', () => {
  it('serves version, tags, show (capabilities + model_info) and ps', async () => {
    ollama = await startFakeOllama({ models: ['qwen2.5-coder:7b', { name: 'embed', capabilities: ['embedding'] }], running: ['qwen2.5-coder:7b'] });
    expect(await (await fetch(`${ollama.url}/api/version`)).json()).toEqual({ version: '0.12.6' });
    const tags = (await (await fetch(`${ollama.url}/api/tags`)).json()) as { models: Array<{ name: string; details: Record<string, unknown> }> };
    expect(tags.models.map((m) => m.name)).toEqual(['qwen2.5-coder:7b', 'embed:latest']);
    expect(tags.models[0].details).toMatchObject({ format: 'gguf', parameter_size: '7.6B' });
    const show = (await (await post('/api/show', { model: 'qwen2.5-coder:7b' })).json()) as { capabilities: string[]; model_info: Record<string, unknown> };
    expect(show.capabilities).toEqual(['completion', 'tools']);
    expect(show.model_info['general.architecture']).toBe('qwen2');
    expect(show.model_info['qwen2.context_length']).toBe(32768);
    expect((await post('/api/show', { model: 'nope' })).status).toBe(404);
    const ps = (await (await fetch(`${ollama.url}/api/ps`)).json()) as { models: Array<{ name: string; size_vram: number }> };
    expect(ps.models[0].name).toBe('qwen2.5-coder:7b');
    expect((await fetch(`${ollama.url}/unknown`)).status).toBe(404);
  });

  it('chat: queued function replies see messages and tools; tool calls, usage, stream mode and errors', async () => {
    ollama = await startFakeOllama({ models: ['m:1b', { name: 'notools:1b', capabilities: ['completion'] }] });
    ollama.queueChat((req) => ({ content: `${req.messages.length} msgs, tools: ${req.tools.map((t) => t.function.name).join(',')}` }));
    ollama.queueChat({ tool_calls: [{ name: 'finish', arguments: { summary: 'ok' } }], prompt_eval_count: 11, eval_count: 7 });
    const tools = [{ type: 'function', function: { name: 'finish', parameters: {} } }];
    const r1 = (await (await post('/api/chat', { model: 'm:1b', messages: [{ role: 'user', content: 'a' }], tools, stream: false })).json()) as { message: { content: string } };
    expect(r1.message.content).toBe('1 msgs, tools: finish');
    const r2 = (await (await post('/api/chat', { model: 'm:1b', messages: [], stream: false })).json()) as Record<string, unknown>;
    expect(r2).toMatchObject({ done: true, prompt_eval_count: 11, eval_count: 7, message: { tool_calls: [{ function: { name: 'finish', arguments: { summary: 'ok' } } }] } });
    expect(ollama.chatRequests()).toHaveLength(2);
    expect(ollama.pendingChats()).toBe(0);
    expect((await post('/api/chat', { model: 'm:1b', messages: [], stream: false })).status).toBe(500);
    expect((await post('/api/chat', { model: 'notools:1b', messages: [], tools, stream: false })).status).toBe(400);
    expect((await post('/api/chat', { model: 'missing', messages: [] })).status).toBe(404);
    ollama.setDefaultChat({ content: 'streamed' });
    const text = await (await post('/api/chat', { model: 'm:1b', messages: [] })).text();
    const lines = text.trim().split('\n').map((l) => JSON.parse(l) as { done: boolean; message: { content: string } });
    expect(lines[0].message.content).toBe('streamed');
    expect(lines.at(-1)!.done).toBe(true);
    ollama.failAll(503, 'down');
    expect((await fetch(`${ollama.url}/api/version`)).status).toBe(503);
  });

  it('pull streams NDJSON and adds the model; delete removes it', async () => {
    ollama = await startFakeOllama({ pullStepDelayMs: 0 });
    const text = await (await post('/api/pull', { model: 'tiny', stream: true })).text();
    const statuses = text.trim().split('\n').map((l) => (JSON.parse(l) as { status: string }).status);
    expect(statuses[0]).toBe('pulling manifest');
    expect(statuses.at(-1)).toBe('success');
    expect(ollama.models().map((m) => m.name)).toEqual(['tiny:latest']);
    expect((await fetch(`${ollama.url}/api/delete`, { method: 'DELETE', body: JSON.stringify({ model: 'tiny' }) })).status).toBe(200);
    expect(ollama.models()).toEqual([]);
  });
});
