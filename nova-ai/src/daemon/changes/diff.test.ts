// Tests of the in-house unified diff: format details (headers, hunks, no-newline markers), hunk merging, CRLF and a
// randomized round-trip property (an independent patch applier must turn a into b), plus the large-input fallback.
import { describe, it, expect } from 'vitest';
import { unifiedDiff } from './diff';

/** Minimal unified-diff applier (test oracle): applies hunks of `patch` to `a`. */
function applyPatch(a: string, patch: string): string {
  if (patch === '') return a;
  const aLines = a === '' ? [] : a.split('\n');
  const aNoEol = a !== '' && !a.endsWith('\n');
  if (!aNoEol && aLines.length) aLines.pop();
  const lines = patch.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  const out: string[] = [];
  let pos = 0;
  let outNoEol = false;
  let i = 2; // skip headers
  while (i < lines.length) {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@$/.exec(lines[i]);
    if (!m) throw new Error(`bad hunk header ${lines[i]}`);
    const aStart = Number(m[1]);
    const aLen = m[2] === undefined ? 1 : Number(m[2]);
    const startIdx = aLen === 0 ? aStart : aStart - 1;
    while (pos < startIdx) out.push(aLines[pos++]);
    i++;
    while (i < lines.length && !lines[i].startsWith('@@')) {
      const l = lines[i];
      if (l.startsWith('\\')) {
        // marker applies to the previous line; for '+'/' ' lines it means the result has no EOL
        const prev = lines[i - 1];
        if (prev.startsWith('+') || prev.startsWith(' ')) outNoEol = true;
        i++;
        continue;
      }
      const tag = l[0];
      const text = l.slice(1);
      if (tag === ' ') {
        expect(aLines[pos]).toBe(text);
        out.push(text);
        pos++;
        outNoEol = false;
      } else if (tag === '-') {
        expect(aLines[pos]).toBe(text);
        pos++;
      } else if (tag === '+') {
        out.push(text);
        outNoEol = false;
      }
      i++;
    }
  }
  while (pos < aLines.length) {
    out.push(aLines[pos++]);
    outNoEol = aNoEol && pos === aLines.length;
  }
  if (out.length === 0) return '';
  return out.join('\n') + (outNoEol ? '' : '\n');
}

function rng(seed: number) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

describe('unifiedDiff', () => {
  it('returns an empty string for identical texts', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n', 'x.txt')).toBe('');
  });

  it('produces git-style headers and hunks', () => {
    const d = unifiedDiff('one\ntwo\nthree\n', 'one\nTWO\nthree\n', 'src/a.ts');
    expect(d).toBe('--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,3 +1,3 @@\n one\n-two\n+TWO\n three\n');
  });

  it('handles new and deleted files', () => {
    expect(unifiedDiff('', 'a\nb\n', 'n.txt')).toBe('--- a/n.txt\n+++ b/n.txt\n@@ -0,0 +1,2 @@\n+a\n+b\n');
    expect(unifiedDiff('a\n', '', 'n.txt')).toBe('--- a/n.txt\n+++ b/n.txt\n@@ -1 +0,0 @@\n-a\n');
  });

  it('marks missing newlines at the end of file', () => {
    const d = unifiedDiff('a\nb', 'a\nb\n', 'f');
    expect(d).toContain('-b\n\\ No newline at end of file\n+b\n');
  });

  it('keeps distant changes in separate hunks and merges close ones', () => {
    const a = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const far = a.replace('line 2\n', 'LINE 2\n').replace('line 30\n', 'LINE 30\n');
    expect(unifiedDiff(a, far, 'f').match(/^@@/gm)).toHaveLength(2);
    const near = a.replace('line 2\n', 'LINE 2\n').replace('line 7\n', 'LINE 7\n');
    expect(unifiedDiff(a, near, 'f').match(/^@@/gm)).toHaveLength(1);
  });

  it('treats CRLF lines as different from LF lines', () => {
    expect(unifiedDiff('a\r\nb\r\n', 'a\nb\n', 'f')).toContain('-a\r\n');
  });

  it('round-trips random edits (patch applies back to the target)', () => {
    const rand = rng(12345);
    const vocab = ['alpha', 'beta', 'gamma', 'delta', '', '  indent', '}', '{'];
    for (let round = 0; round < 300; round++) {
      const n = Math.floor(rand() * 25);
      const aLines = Array.from({ length: n }, () => vocab[Math.floor(rand() * vocab.length)]);
      const bLines = [...aLines];
      const edits = Math.floor(rand() * 6);
      for (let e = 0; e < edits; e++) {
        const op = rand();
        const at = Math.floor(rand() * (bLines.length + 1));
        if (op < 0.4) bLines.splice(at, 0, vocab[Math.floor(rand() * vocab.length)]);
        else if (op < 0.7 && bLines.length) bLines.splice(Math.min(at, bLines.length - 1), 1);
        else if (bLines.length) bLines[Math.min(at, bLines.length - 1)] = `changed ${round}`;
      }
      const a = aLines.join('\n') + (rand() < 0.8 && n ? '\n' : '');
      const b = bLines.join('\n') + (rand() < 0.8 && bLines.length ? '\n' : '');
      const patch = unifiedDiff(a, b, 'f');
      expect(applyPatch(a, patch)).toBe(b);
    }
  });

  it('falls back to a single replace block for huge completely different inputs', () => {
    const a = Array.from({ length: 30000 }, (_, i) => `a${i}`).join('\n') + '\n';
    const b = Array.from({ length: 30000 }, (_, i) => `b${i}`).join('\n') + '\n';
    const started = Date.now();
    const patch = unifiedDiff(a, b, 'big.txt');
    expect(Date.now() - started).toBeLessThan(4000);
    expect(applyPatch(a, patch)).toBe(b);
  });
});
