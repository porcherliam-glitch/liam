// Tests for the incremental SSE parser.
import { describe, expect, it } from 'vitest';
import { SseParser } from './sse-parser';

function collect(chunks: string[], max?: number): string[] {
  const out: string[] = [];
  const p = new SseParser((d) => out.push(d), max);
  for (const c of chunks) p.push(c);
  return out;
}

describe('SseParser', () => {
  it('parses data lines and ignores comments and other fields', () => {
    expect(collect([': connected\n\n', 'data: {"a":1}\n\n', 'event: x\nid: 3\nretry: 10\ndata: two\n\n', ': ping\n\n'])).toEqual(['{"a":1}', 'two']);
  });

  it('joins multi-line data and handles a missing space after the colon', () => {
    expect(collect(['data:first\ndata: second\n\n'])).toEqual(['first\nsecond']);
  });

  it('handles CRLF, CR and line breaks split across chunks', () => {
    expect(collect(['data: a\r\n\r\n', 'data: b\r', '\n\r\n', 'data: c\r\r'])).toEqual(['a', 'b', 'c']);
    expect(collect(['da', 'ta: sp', 'lit\n', '\n'])).toEqual(['split']);
  });

  it('does not dispatch empty messages or incomplete trailing data', () => {
    expect(collect(['\n\n\n', 'data: x'])).toEqual([]);
  });

  it('throws when a message exceeds the size cap', () => {
    const p = new SseParser(() => {}, 10);
    expect(() => p.push('data: 0123456789abc')).toThrow(/too large/);
  });
});
