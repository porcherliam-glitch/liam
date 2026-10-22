import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '../contracts';
import { COMPACTED_PREFIX, DROPPED_NOTE, compactMessages, contextWindow, estimateTokens } from './context-window';
import { convertMessages, formatJsonToolResult } from './state';
import { resolvedModel } from './test-fixtures';

const big = (n: number, ch = 'x') => ch.repeat(n);

function conversation(turns: number, resultSize: number): ChatMessage[] {
  const msgs: ChatMessage[] = [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'task' },
  ];
  for (let i = 0; i < turns; i++) {
    msgs.push({ role: 'assistant', content: '', toolCalls: [{ id: `c${i}`, name: 'read_file', arguments: { path: `f${i}` } }] });
    msgs.push({ role: 'tool', toolCallId: `c${i}`, name: 'read_file', content: big(resultSize, String(i % 10)) });
  }
  return msgs;
}

describe('context window', () => {
  it('estimates tokens with chars/3.5', () => {
    expect(estimateTokens([{ role: 'user', content: big(342) }])).toBe(100);
    expect(estimateTokens([{ role: 'user', content: '' }], [{ name: 'a', description: 'b', parameters: {} }])).toBeGreaterThan(estimateTokens([{ role: 'user', content: '' }]));
  });

  it('uses min(context length, num_ctx) for Ollama and the reported length otherwise', () => {
    expect(contextWindow(resolvedModel({ contextLength: 131072 }), 16384)).toBe(16384);
    expect(contextWindow(resolvedModel({ contextLength: 8192 }), 16384)).toBe(8192);
    expect(contextWindow(resolvedModel({ contextLength: null }), 16384)).toBe(16384);
    expect(contextWindow(resolvedModel({ contextLength: 200000, type: 'openai_compatible' }), 16384)).toBe(200000);
    expect(contextWindow(resolvedModel({ contextLength: null, type: 'openai_compatible' }), 16384)).toBe(32768);
  });

  it('returns the input untouched when it fits', () => {
    const msgs = conversation(2, 100);
    const r = compactMessages(msgs, { limitTokens: 100_000 });
    expect(r.changed).toBe(false);
    expect(r.messages).toBe(msgs);
  });

  it('level 1: shortens old tool results, keeps system, task and the last 6 messages verbatim', () => {
    const msgs = conversation(6, 3000);
    const r = compactMessages(msgs, { limitTokens: Math.ceil(estimateTokens(msgs) * 0.7) });
    expect(r.changed).toBe(true);
    expect(r.level).toBe(1);
    expect(r.messages[0]).toEqual(msgs[0]);
    expect(r.messages[1]).toEqual(msgs[1]);
    const tail = r.messages.slice(-6);
    expect(tail).toEqual(msgs.slice(-6));
    const first = r.messages[3] as Extract<ChatMessage, { role: 'tool' }>;
    expect(first.content.startsWith(COMPACTED_PREFIX)).toBe(true);
    expect(first.content.length).toBeLessThanOrEqual(COMPACTED_PREFIX.length + 201);
    expect(msgs[3].content.length).toBe(3000); // input not mutated
  });

  it('level 2: shortens long tool-call arguments (e.g. write_file contents)', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'task' },
      { role: 'assistant', content: '', toolCalls: [{ id: 'w', name: 'write_file', arguments: { path: 'a.js', content: big(8000) } }] },
      { role: 'tool', toolCallId: 'w', name: 'write_file', content: 'ok' },
      ...conversation(3, 10).slice(2),
    ];
    const r = compactMessages(msgs, { limitTokens: 500 });
    expect(r.level).toBeGreaterThanOrEqual(2);
    const a = r.messages[2] as Extract<ChatMessage, { role: 'assistant' }>;
    expect(String(a.toolCalls![0].arguments.content).startsWith(COMPACTED_PREFIX)).toBe(true);
    expect(a.toolCalls![0].arguments.path).toBe('a.js');
  });

  it('level 3: drops the oldest complete turns and leaves one placeholder', () => {
    const msgs = conversation(10, 400);
    const r = compactMessages(msgs, { limitTokens: 700 });
    expect(r.level).toBe(3);
    expect(r.messages.filter((m) => m.role === 'user' && m.content === DROPPED_NOTE)).toHaveLength(1);
    // Native pairing intact: every tool message follows an assistant with the matching call id.
    for (let i = 0; i < r.messages.length; i++) {
      const m = r.messages[i];
      if (m.role === 'tool') {
        const prev = r.messages[i - 1];
        expect(prev.role === 'assistant' || prev.role === 'tool').toBe(true);
      }
    }
    expect(r.messages.slice(-6)).toEqual(msgs.slice(-6));
    expect(r.after).toBeLessThan(r.before);
  });

  it('compacts JSON-protocol tool results too', () => {
    const msgs: ChatMessage[] = [
      { role: 'system', content: 's' },
      { role: 'user', content: 'task' },
      { role: 'assistant', content: '{"tool":"read_file","arguments":{"path":"a"}}' },
      { role: 'user', content: formatJsonToolResult('read_file', big(5000), false) },
      ...Array.from({ length: 6 }, (_, i): ChatMessage => ({ role: i % 2 ? 'user' : 'assistant', content: 'short' })),
    ];
    const r = compactMessages(msgs, { limitTokens: 300 });
    expect(r.messages[3].content.startsWith('[tool result: read_file]\n[gekürzt: ')).toBe(true);
  });

  it('converts native history into the JSON protocol', () => {
    const msgs = conversation(1, 10);
    const converted = convertMessages(msgs, 'json');
    expect(converted.some((m) => m.role === 'tool')).toBe(false);
    expect(converted[2]).toEqual({ role: 'assistant', content: '{"tool":"read_file","arguments":{"path":"f0"}}' });
    expect(converted[3].content.startsWith('[tool result: read_file]')).toBe(true);
    expect(convertMessages(converted, 'native')).toEqual(converted);
  });
});
