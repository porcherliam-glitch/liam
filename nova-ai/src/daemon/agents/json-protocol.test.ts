import { describe, it, expect } from 'vitest';
import { findFirstJsonObject, interpretToolCall, parseJsonToolCall, repairJson } from './json-protocol';

describe('JSON tool protocol parser', () => {
  it('parses a plain object', () => {
    expect(parseJsonToolCall('{"tool": "read_file", "arguments": {"path": "a.js"}}')).toEqual({ ok: true, name: 'read_file', arguments: { path: 'a.js' } });
  });

  it('prefers objects inside ```json fences and ignores braces inside strings', () => {
    const text = 'Plan: use {curly} braces.\n```json\n{"tool": "write_file", "arguments": {"path": "a.js", "content": "function f() { return \\"}\\"; }"}}\n```';
    const r = parseJsonToolCall(text);
    expect(r).toEqual({ ok: true, name: 'write_file', arguments: { path: 'a.js', content: 'function f() { return "}"; }' } });
  });

  it('takes the first balanced object when several are present', () => {
    expect(findFirstJsonObject('x {"tool":"a","arguments":{}} y {"tool":"b"}')).toEqual({ tool: 'a', arguments: {} });
  });

  it('skips unbalanced or invalid candidates', () => {
    expect(findFirstJsonObject('{broken {"tool":"ok","arguments":{"n":1}}')).toEqual({ tool: 'ok', arguments: { n: 1 } });
    expect(findFirstJsonObject('no json here')).toBeNull();
    expect(parseJsonToolCall('')).toEqual({ ok: false, reason: 'the answer was empty' });
    expect(parseJsonToolCall('just text').ok).toBe(false);
  });

  it('repairs trailing commas and Python literals outside strings', () => {
    expect(repairJson('{"a": True, "b": [1, 2,], "c": "True,"}')).toBe('{"a": true, "b": [1, 2], "c": "True,"}');
    expect(parseJsonToolCall('{"tool": "finish", "arguments": {"passed": None, "fixed": False,},}')).toEqual({
      ok: true,
      name: 'finish',
      arguments: { passed: null, fixed: false },
    });
  });

  it('accepts common aliases and string arguments', () => {
    expect(interpretToolCall({ name: 'functions.list_files', parameters: { path: '.' } })).toEqual({ ok: true, name: 'list_files', arguments: { path: '.' } });
    expect(interpretToolCall({ function: { name: 'read_file', arguments: '{"path":"x"}' } })).toEqual({ ok: true, name: 'read_file', arguments: { path: 'x' } });
    expect(interpretToolCall({ tool_calls: [{ tool: 'git_diff' }] })).toEqual({ ok: true, name: 'git_diff', arguments: {} });
    expect(interpretToolCall({ tool: 'x', arguments: 'not json' }).ok).toBe(false);
    expect(interpretToolCall({ arguments: {} })).toEqual({ ok: false, reason: 'the JSON object has no "tool" field with the tool name' });
    expect(interpretToolCall({ tool: 'x', arguments: [1] }).ok).toBe(false);
  });

  it('handles inline fences', () => {
    expect(parseJsonToolCall('```{"tool":"git_diff","arguments":{}}```')).toEqual({ ok: true, name: 'git_diff', arguments: {} });
  });
});
