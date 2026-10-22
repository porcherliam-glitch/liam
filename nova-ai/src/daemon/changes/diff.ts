// In-house unified line diff (no dependency): Myers' O((N+M)·D) greedy algorithm with a bounded trace.
// Key decisions:
// - Lines are compared exactly (including '\r' of CRLF files); the last line of a text without a trailing newline is
//   a different line than the same text with a newline, and is marked with "\ No newline at end of file" like git.
// - Common prefix/suffix are trimmed first (most edits are local), lines are interned to integers.
// - The search depth D is bounded by a work budget. When two huge, completely different texts exceed it, the middle
//   part is emitted as one delete block plus one insert block: still a correct diff, just not minimal.
// - Output: "--- a/<path>" / "+++ b/<path>" headers and git-style hunks with `context` lines (default 3);
//   identical inputs produce an empty string.

type OpType = 0 | 1 | 2; // 0 = equal, 1 = delete (from a), 2 = insert (from b)

interface Op {
  t: OpType;
  /** index into a (equal/delete) */
  a: number;
  /** index into b (equal/insert) */
  b: number;
}

interface SplitText {
  lines: string[];
  noEol: boolean;
}

function splitLines(text: string): SplitText {
  if (text === '') return { lines: [], noEol: false };
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') {
    lines.pop();
    return { lines, noEol: false };
  }
  return { lines, noEol: true };
}

const WORK_BUDGET = 40_000_000;
const MAX_DEPTH = 3000;

/** Edit script for a[aLo..aHi) vs b[bLo..bHi) on interned ids; null when the depth budget is exhausted. */
function myers(a: Int32Array, aLo: number, aHi: number, b: Int32Array, bLo: number, bHi: number): Op[] | null {
  const n = aHi - aLo;
  const m = bHi - bLo;
  const ops: Op[] = [];
  if (n === 0) {
    for (let j = 0; j < m; j++) ops.push({ t: 2, a: aLo, b: bLo + j });
    return ops;
  }
  if (m === 0) {
    for (let i = 0; i < n; i++) ops.push({ t: 1, a: aLo + i, b: bLo });
    return ops;
  }
  const max = n + m;
  const maxD = Math.min(max, MAX_DEPTH, Math.max(10, Math.floor(WORK_BUDGET / (max + 1))));
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // trace[d] = copy of v[-d..d] BEFORE iteration d (index k + d).
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= maxD; d++) {
    trace.push(v.slice(offset - d, offset + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])) x = v[offset + k + 1];
      else x = v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;

  // Backtrack from (n, m) to (0, 0), collecting ops in reverse.
  const rev: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const vd = trace[d];
    const at = (k: number) => vd[k + d];
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && at(k - 1) < at(k + 1))) prevK = k + 1;
    else prevK = k - 1;
    const prevX = d === 0 ? 0 : at(prevK);
    const prevY = d === 0 ? 0 : prevX - prevK;
    while (x > prevX && y > prevY) {
      rev.push({ t: 0, a: aLo + x - 1, b: bLo + y - 1 });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) rev.push({ t: 2, a: aLo + x, b: bLo + y - 1 });
      else rev.push({ t: 1, a: aLo + x - 1, b: bLo + y });
      x = prevX;
      y = prevY;
    }
  }
  for (let i = rev.length - 1; i >= 0; i--) ops.push(rev[i]);
  return ops;
}

function hunkRange(start1: number, len: number): string {
  if (len === 1) return `${start1}`;
  return `${len === 0 ? start1 - 1 : start1},${len}`;
}

/** Unified diff of two texts (line based). Returns '' when they are identical. */
export function unifiedDiff(a: string, b: string, path: string, context = 3): string {
  if (a === b) return '';
  const A = splitLines(a);
  const B = splitLines(b);
  const ids = new Map<string, number>();
  const intern = (line: string, isLastNoEol: boolean): number => {
    const key = isLastNoEol ? `${line}\u0000` : line;
    let id = ids.get(key);
    if (id === undefined) {
      id = ids.size;
      ids.set(key, id);
    }
    return id;
  };
  const aIds = new Int32Array(A.lines.length);
  for (let i = 0; i < A.lines.length; i++) aIds[i] = intern(A.lines[i], A.noEol && i === A.lines.length - 1);
  const bIds = new Int32Array(B.lines.length);
  for (let i = 0; i < B.lines.length; i++) bIds[i] = intern(B.lines[i], B.noEol && i === B.lines.length - 1);

  let pre = 0;
  while (pre < aIds.length && pre < bIds.length && aIds[pre] === bIds[pre]) pre++;
  let suf = 0;
  while (suf < aIds.length - pre && suf < bIds.length - pre && aIds[aIds.length - 1 - suf] === bIds[bIds.length - 1 - suf]) suf++;

  const ops: Op[] = [];
  for (let i = 0; i < pre; i++) ops.push({ t: 0, a: i, b: i });
  const aHi = aIds.length - suf;
  const bHi = bIds.length - suf;
  const mid = myers(aIds, pre, aHi, bIds, pre, bHi);
  if (mid) {
    for (const op of mid) ops.push(op);
  } else {
    for (let i = pre; i < aHi; i++) ops.push({ t: 1, a: i, b: pre });
    for (let j = pre; j < bHi; j++) ops.push({ t: 2, a: aHi, b: j });
  }
  for (let i = 0; i < suf; i++) ops.push({ t: 0, a: aHi + i, b: bHi + i });

  // Positions before each op (number of a/b lines consumed so far).
  const aPos = new Int32Array(ops.length + 1);
  const bPos = new Int32Array(ops.length + 1);
  for (let i = 0; i < ops.length; i++) {
    aPos[i + 1] = aPos[i] + (ops[i].t !== 2 ? 1 : 0);
    bPos[i + 1] = bPos[i] + (ops[i].t !== 1 ? 1 : 0);
  }

  const changeIdx: number[] = [];
  for (let i = 0; i < ops.length; i++) if (ops[i].t !== 0) changeIdx.push(i);
  if (changeIdx.length === 0) return '';

  const out: string[] = [`--- a/${path}`, `+++ b/${path}`];
  const lastA = A.lines.length - 1;
  const lastB = B.lines.length - 1;
  let g = 0;
  while (g < changeIdx.length) {
    let end = g;
    while (end + 1 < changeIdx.length && changeIdx[end + 1] - changeIdx[end] - 1 <= 2 * context) end++;
    const from = Math.max(0, changeIdx[g] - context);
    const to = Math.min(ops.length, changeIdx[end] + 1 + context);
    const aLen = aPos[to] - aPos[from];
    const bLen = bPos[to] - bPos[from];
    out.push(`@@ -${hunkRange(aPos[from] + 1, aLen)} +${hunkRange(bPos[from] + 1, bLen)} @@`);
    for (let i = from; i < to; i++) {
      const op = ops[i];
      if (op.t === 0) {
        out.push(` ${A.lines[op.a]}`);
        if (op.a === lastA && A.noEol) out.push('\\ No newline at end of file');
      } else if (op.t === 1) {
        out.push(`-${A.lines[op.a]}`);
        if (op.a === lastA && A.noEol) out.push('\\ No newline at end of file');
      } else {
        out.push(`+${B.lines[op.b]}`);
        if (op.b === lastB && B.noEol) out.push('\\ No newline at end of file');
      }
    }
    g = end + 1;
  }
  return out.join('\n') + '\n';
}
