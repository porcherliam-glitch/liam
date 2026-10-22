import { describe, it, expect } from 'vitest';
import type { ChatMessage } from '../contracts';
import {
  COMPACTED_PREFIX,
  DROPPED_NOTE,
  TOOL_RESULT_MAX_CHARS,
  TOOL_RESULT_MIN_CHARS,
  capToolResult,
  compactMessages,
  contextWindow,
  estimateTokens,
  promptBudget,
  toolResultMaxChars,
} from './context-window';
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

  it('prompt budget reserves the answer and headroom; tool results get a quarter of it', () => {
    expect(promptBudget(16384, 4096)).toBe(Math.floor((16384 - 4096) * 0.85)); // 10 444
    expect(promptBudget(8192, 4096)).toBe(Math.floor((8192 - 2048) * 0.85)); // reserve ≤ a quarter of the window
    expect(promptBudget(200_000, 4096)).toBe(Math.floor((200_000 - 4096) * 0.85));
    expect(toolResultMaxChars(promptBudget(16384, 4096))).toBe(Math.floor(10444 * 0.25 * 3.5)); // 9 138 instead of 16 000
    expect(toolResultMaxChars(500)).toBe(TOOL_RESULT_MIN_CHARS);
    expect(toolResultMaxChars(promptBudget(200_000, 4096))).toBe(TOOL_RESULT_MAX_CHARS);
  });

  it('caps a tool result to the limit and keeps its beginning and end', () => {
    const text = `ANFANG\n${big(50_000)}\nENDE`;
    const capped = capToolResult(text, 9000);
    expect(capped.length).toBeLessThanOrEqual(9000);
    expect(capped.startsWith('ANFANG\n')).toBe(true);
    expect(capped.endsWith('\nENDE')).toBe(true);
    expect(capped).toContain('characters omitted by NOVA');
    expect(capToolResult('kurz', 9000)).toBe('kurz');
  });

  it('16k window: big results inside the last 6 messages are shortened until the request fits; task and notes stay', () => {
    const limit = promptBudget(contextWindow(resolvedModel({ contextLength: 32768 }), 16384), 4096);
    const msgs: ChatMessage[] = [
      { role: 'system', content: big(13_600, 's') }, // coder prompt in JSON mode, without memory
      { role: 'user', content: 'Work on the task' },
    ];
    for (let i = 0; i < 4; i++) {
      msgs.push({ role: 'assistant', content: '', toolCalls: [{ id: `c${i}`, name: 'read_file', arguments: { path: `src/f${i}.js` } }] });
      msgs.push({ role: 'tool', toolCallId: `c${i}`, name: 'read_file', content: big(16_000, String(i)) });
    }
    msgs.push({ role: 'user', content: 'Note from the user: Bitte Canvas verwenden.' });
    expect(estimateTokens(msgs)).toBeGreaterThan(limit * 2);
    const r = compactMessages(msgs, { limitTokens: limit });
    expect(r.after).toBeLessThanOrEqual(limit);
    expect(r.level).toBe(4);
    expect(r.messages[0]).toEqual(msgs[0]);
    expect(r.messages[1]).toEqual(msgs[1]);
    expect(r.messages[r.messages.length - 1]).toEqual(msgs[msgs.length - 1]);
    const tools = r.messages.filter((m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool');
    expect(tools[tools.length - 1]).toEqual(msgs[9]); // the newest result is only cut when that is still needed
    expect(tools.slice(0, -1).every((m) => m.content.startsWith(COMPACTED_PREFIX))).toBe(true);
    for (let i = 0; i < r.messages.length; i++) {
      if (r.messages[i].role === 'tool') expect(['assistant', 'tool']).toContain(r.messages[i - 1].role);
    }
  });

  it('cuts even the newest result (head and tail kept) when nothing else is left', () => {
    const limit = promptBudget(16384, 4096);
    const result = `ANFANG\n${big(30_000)}\nENDE`;
    const msgs: ChatMessage[] = [
      { role: 'system', content: big(30_000, 's') }, // prompt with memory and retry context
      { role: 'user', content: 'task' },
      { role: 'assistant', content: '{"tool":"read_file","arguments":{"path":"a.js"}}' },
      { role: 'user', content: formatJsonToolResult('read_file', result, false) },
      { role: 'user', content: 'Note from the user: kurz halten' },
    ];
    const r = compactMessages(msgs, { limitTokens: limit });
    expect(r.after).toBeLessThanOrEqual(limit);
    expect(r.level).toBe(4);
    const newest = r.messages[3].content;
    expect(newest.startsWith('[tool result: read_file]\nANFANG\n')).toBe(true);
    expect(newest.endsWith('\nENDE')).toBe(true);
    expect(newest).toContain('characters omitted by NOVA');
    expect(newest.length).toBeGreaterThan(4000); // only as much as needed
    expect(r.messages.slice(0, 3)).toEqual(msgs.slice(0, 3));
    expect(r.messages[4]).toEqual(msgs[4]);
  });

  it('level 5 drops earlier turns of the tail before giving up on the newest result', () => {
    const msgs: ChatMessage[] = [{ role: 'system', content: 's' }, { role: 'user', content: 'task' }, ...conversation(3, 50).slice(2)];
    msgs.push({ role: 'user', content: 'Note from the user: bleib dran' });
    const r = compactMessages(msgs, { limitTokens: estimateTokens(msgs.slice(0, 2)) + 60 });
    expect(r.level).toBe(5);
    expect(r.messages.filter((m) => m.role === 'assistant')).toHaveLength(1);
    expect(r.messages.some((m) => m.role === 'user' && m.content === DROPPED_NOTE)).toBe(true);
    expect(r.messages[r.messages.length - 1].content).toBe('Note from the user: bleib dran');
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
