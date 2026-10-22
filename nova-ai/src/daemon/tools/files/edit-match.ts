// edit_file matching (SPEC §6.3): exact text replacement on a CRLF→LF normalized view of the file, written back
// into the ORIGINAL text so untouched lines keep their exact line endings (mixed-EOL files stay as they are) and the
// inserted text uses the file's dominant EOL.
// Key decisions:
// - Offsets are mapped from the normalized view back to the original by counting the CRLF line breaks before them.
// - Replacement uses slicing, never String.replace (no "$&" surprises in newText).
// - When oldText is not found, a German hint shows the most likely intended region: first a whitespace/indentation
//   insensitive line match, then the most similar line (bigram Dice coefficient). Ambiguous matches list their lines.
import type { Eol } from './text';

export interface NormalizedText {
  norm: string;
  /** Normalized indexes of '\n' characters that were "\r\n" in the original. */
  crlfAt: number[];
}

export function normalizeNewlines(text: string): NormalizedText {
  const crlfAt: number[] = [];
  let norm = '';
  let last = 0;
  let removed = 0;
  for (let i = text.indexOf('\r\n'); i !== -1; i = text.indexOf('\r\n', i + 2)) {
    norm += text.slice(last, i);
    crlfAt.push(i - removed);
    removed++;
    last = i + 1; // keep the '\n'
  }
  norm += text.slice(last);
  return { norm, crlfAt };
}

/** Maps an offset of the normalized view to the original text. */
export function toOriginalOffset(nOffset: number, crlfAt: number[]): number {
  // number of CRLF breaks strictly before nOffset (binary search)
  let lo = 0;
  let hi = crlfAt.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (crlfAt[mid] < nOffset) lo = mid + 1;
    else hi = mid;
  }
  return nOffset + lo;
}

/** Non-overlapping occurrences (start offsets). */
export function findOccurrences(haystack: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

export type EditOutcome =
  | { kind: 'ok'; text: string; count: number; lines: number[]; insertedLines: number }
  | { kind: 'not_found'; hint: string | null }
  | { kind: 'ambiguous'; lines: number[] }
  | { kind: 'empty_old' };

/**
 * Applies oldText → newText on `original` (decoded file content without BOM).
 * `eol` is the line ending used for the inserted text (the file's dominant EOL).
 */
export function applyEdit(original: string, oldText: string, newText: string, replaceAll: boolean, eol: Eol): EditOutcome {
  const oldNorm = normalizeNewlines(stripLeadingBom(oldText)).norm;
  if (oldNorm === '') return { kind: 'empty_old' };
  const { norm, crlfAt } = normalizeNewlines(original);
  const hits = findOccurrences(norm, oldNorm);
  if (hits.length === 0) return { kind: 'not_found', hint: nearestMatchHint(norm, oldNorm) };
  if (hits.length > 1 && !replaceAll) return { kind: 'ambiguous', lines: hits.map((h) => lineAt(norm, h)) };
  const insert = normalizeNewlines(stripLeadingBom(newText)).norm.replace(/\n/g, eol);
  const parts: string[] = [];
  let prev = 0;
  for (const h of hits) {
    const oStart = toOriginalOffset(h, crlfAt);
    const oEnd = toOriginalOffset(h + oldNorm.length, crlfAt);
    parts.push(original.slice(prev, oStart), insert);
    prev = oEnd;
  }
  parts.push(original.slice(prev));
  const insertedLines = insert === '' ? 0 : insert.split(eol).length;
  return { kind: 'ok', text: parts.join(''), count: hits.length, lines: hits.map((h) => lineAt(norm, h)), insertedLines };
}

function stripLeadingBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function numbered(lines: string[], firstLine: number, maxLines = 12): string {
  const shown = lines.slice(0, maxLines).map((l, i) => `${firstLine + i}: ${l.length > 300 ? `${l.slice(0, 300)} …` : l}`);
  if (lines.length > maxLines) shown.push(`… (${lines.length - maxLines} weitere Zeilen)`);
  return shown.join('\n');
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient over character bigrams (0..1). */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0);
  return (2 * inter) / (a.length - 1 + (b.length - 1));
}

/** German hint pointing at the most likely intended region, or null when nothing is reasonably close. */
export function nearestMatchHint(norm: string, oldNorm: string): string | null {
  const fileLines = norm.split('\n');
  const needle = oldNorm.split('\n');
  while (needle.length > 1 && needle[needle.length - 1].trim() === '') needle.pop();
  while (needle.length > 1 && needle[0].trim() === '') needle.shift();
  const trimmedNeedle = needle.map((l) => l.trim());
  if (fileLines.length > 100_000) return null;

  // 1) Same lines, different indentation/whitespace.
  const squash = (l: string) => l.trim().replace(/\s+/g, ' ');
  const sqNeedle = needle.map(squash);
  if (sqNeedle.some((l) => l !== '')) {
    const sqFile = fileLines.map(squash);
    for (let i = 0; i + sqNeedle.length <= sqFile.length; i++) {
      let ok = true;
      for (let j = 0; j < sqNeedle.length; j++) {
        if (sqFile[i + j] !== sqNeedle[j]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        return `Ein Abschnitt mit gleichem Text, aber anderer Einrückung bzw. anderen Leerzeichen steht in Zeile ${i + 1}–${i + sqNeedle.length}. Tatsächlicher Text:\n${numbered(fileLines.slice(i, i + sqNeedle.length), i + 1)}`;
      }
    }
  }

  // 2) Most similar line to the first meaningful line of oldText.
  const probe = trimmedNeedle.find((l) => l.length >= 3) ?? trimmedNeedle[0];
  if (!probe) return null;
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < fileLines.length; i++) {
    const line = fileLines[i].trim();
    if (!line || line.length > 1000) continue;
    const score = similarity(probe, line);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0 || bestScore < 0.5) return null;
  const offsetInNeedle = Math.max(0, trimmedNeedle.indexOf(probe));
  const start = Math.max(0, best - offsetInNeedle);
  const count = Math.min(Math.max(needle.length, 1) + 1, 12);
  return `Am ähnlichsten ist der Abschnitt ab Zeile ${start + 1} (Übereinstimmung ${Math.round(bestScore * 100)} %):\n${numbered(fileLines.slice(start, start + count), start + 1)}`;
}
