// Tests of the bounded output tails, UTF-8 decoding, line tails, the throttled event emitter and ANSI stripping.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { OutputEmitter, OutputTail, StreamDecoders, TextRing, TRUNCATION_NOTE, dropUtf8Prefix, lastLines, stripAnsi, utf8Tail } from './output-tail';

afterEach(() => vi.useRealTimers());

describe('TextRing', () => {
  it('keeps everything below the cap and drops the oldest text above it', () => {
    const r = new TextRing(10);
    r.push('abc');
    r.push('def');
    expect(r.text()).toBe('abcdef');
    expect(r.truncated).toBe(false);
    r.push('ghijk');
    expect(r.text()).toBe('bcdefghijk');
    expect(r.size).toBe(10);
    expect(r.truncated).toBe(true);
  });

  it('keeps only the tail of a single oversized chunk', () => {
    const r = new TextRing(5);
    r.push('0123456789');
    expect(r.text()).toBe('56789');
    expect(r.truncated).toBe(true);
  });

  it('never cuts a multi-byte character in half', () => {
    expect(dropUtf8Prefix('äöü', 1)).toBe('öü');
    expect(utf8Tail('aäb', 3)).toBe('äb');
    const r = new TextRing(5);
    r.push('ääää'); // 8 bytes
    expect(Buffer.byteLength(r.text())).toBeLessThanOrEqual(5);
    expect(r.text()).toBe('ää');
  });
});

describe('OutputTail', () => {
  it('interleaves streams, redacts on read and marks truncation', () => {
    const t = new OutputTail(2048);
    t.append('stdout', 'erste Zeile\n');
    t.append('stderr', 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456\n');
    t.append('stdout', 'letzte Zeile\n');
    const r = t.result();
    expect(r.stdout).toBe('erste Zeile\nletzte Zeile\n');
    expect(r.stderr).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(r.stderr).toContain('[GEHEIM]');
    expect(r.output.split('\n')[0]).toBe('erste Zeile');
    const big = new OutputTail(1024);
    big.append('stdout', 'x'.repeat(3000));
    expect(big.output().startsWith(TRUNCATION_NOTE)).toBe(true);
  });

  it('returns the last n lines', () => {
    const t = new OutputTail(4096);
    t.append('stdout', 'a\nb\nc\nd\n');
    expect(t.tailLines(2)).toBe('c\nd\n');
    expect(t.tailLines(0)).toBe('');
    expect(lastLines('a\nb', 5)).toBe('a\nb');
    expect(lastLines('a\nb\nc', 2)).toBe('b\nc');
  });
});

describe('StreamDecoders', () => {
  it('decodes multi-byte characters split across chunks', () => {
    const d = new StreamDecoders();
    const bytes = Buffer.from('Grüße', 'utf8');
    const a = d.write('stdout', bytes.subarray(0, 3));
    const b = d.write('stdout', bytes.subarray(3));
    expect(a + b + d.end('stdout')).toBe('Grüße');
  });
});

describe('OutputEmitter', () => {
  it('batches chunks per throttle window, merges same-stream chunks and redacts', () => {
    vi.useFakeTimers();
    const emitted: { stream: string; data: string }[] = [];
    const em = new OutputEmitter((stream, data) => emitted.push({ stream, data }), 100);
    em.push('stdout', 'a');
    em.push('stdout', 'b');
    em.push('stderr', 'password=hunter2secret');
    em.push('stdout', 'c');
    expect(emitted).toHaveLength(0);
    vi.advanceTimersByTime(100);
    expect(emitted.map((e) => e.stream)).toEqual(['stdout', 'stderr', 'stdout']);
    expect(emitted[0].data).toBe('ab');
    expect(emitted[1].data).not.toContain('hunter2secret');
    em.push('stdout', 'd');
    em.close();
    expect(emitted[3].data).toBe('d');
    em.push('stdout', 'ignored after close');
    vi.advanceTimersByTime(200);
    expect(emitted).toHaveLength(4);
  });

  it('caps a single event at 64 KB', () => {
    const emitted: string[] = [];
    const em = new OutputEmitter((_s, data) => emitted.push(data), 100);
    em.push('stdout', 'y'.repeat(200 * 1024));
    em.flush();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].length).toBeLessThan(70 * 1024);
    expect(emitted[0].startsWith('[… gekürzt]')).toBe(true);
  });
});

describe('stripAnsi', () => {
  it('removes color and OSC sequences', () => {
    expect(stripAnsi('\u001b[31mrot\u001b[0m \u001b]0;Titel\u0007ok')).toBe('rot ok');
  });
});
