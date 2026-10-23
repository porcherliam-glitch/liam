// Project text search used by FileService.search (editor) and the search_files agent tool.
// Key decisions:
// - Matching runs in a short-lived worker thread (node:worker_threads, inline source → works inside the esbuild
//   bundle) with a hard timeout: a catastrophic regex (ReDoS) from a model or the user can never freeze the daemon's
//   event loop (RPC, scheduler). Plain queries are escaped into a literal regex and use the same path.
// - Files: ignored folders skipped, links never followed, binary files (NUL in the first 8 KB) and files > 1 MB
//   skipped, at most 50 000 files. Decoding mirrors text.ts (UTF-8, UTF-16 with BOM, Latin-1 fallback).
// - Results are 1-based line/column (UTF-16 code units, like Monaco); each match carries a window of its line so
//   callers can build a ≤ 200 character preview (and mask sensitive files).
// - At most 3 searches run at the same time; further calls wait.
import { Worker } from 'node:worker_threads';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { NovaError } from '../../core/errors';
import { walkProjectFiles } from '../../changes/walk';

export interface RawSearchMatch {
  path: string;
  line: number;
  column: number;
  /** Part of the line around the match. */
  window: string;
  /** Offset of `window` within the line (0 = the window starts at the beginning of the line). */
  windowStart: number;
}

export interface SearchRequest {
  /** Canonical absolute project root. */
  root: string;
  /** Folder or file to search (project-relative, '/' separated); '' = whole project. */
  startRel?: string;
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  limit: number;
  maxFileBytes?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SearchOutcome {
  matches: RawSearchMatch[];
  /** The limit was reached (more matches may exist). */
  truncated: boolean;
  /** The time budget ran out (results are incomplete). */
  timedOut: boolean;
  filesSearched: number;
}

const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { readFileSync } = require('node:fs');
(function main() {
  const { files, source, flags, limit } = workerData;
  const re = new RegExp(source, flags);
  const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  function decode(buf) {
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
      const body = buf.subarray(2);
      const n = body.length - (body.length % 2);
      const b = Buffer.alloc(n);
      for (let i = 0; i < n; i += 2) { b[i] = body[i + 1]; b[i + 1] = body[i]; }
      return b.toString('utf16le');
    }
    const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
    const body = bom ? buf.subarray(3) : buf;
    try { return utf8.decode(body); } catch (e) { return body.toString('latin1'); }
  }
  function isBinary(buf) {
    if (buf.length >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return false;
    const n = Math.min(buf.length, 8192);
    for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
    return false;
  }
  let total = 0;
  let batch = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    let buf;
    try { buf = readFileSync(f.abs); } catch (e) { continue; }
    if (!isBinary(buf)) {
      const lines = decode(buf).split(/\r?\n/);
      for (let ln = 0; ln < lines.length && total < limit; ln++) {
        const line = lines[ln];
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(line)) !== null) {
          const start = Math.max(0, m.index - 80);
          batch.push([f.rel, ln + 1, m.index + 1, line.slice(start, start + 400), start]);
          total++;
          if (m[0].length === 0) re.lastIndex++;
          if (total >= limit) break;
        }
      }
    }
    if (total >= limit || batch.length >= 200 || i % 50 === 49 || i === files.length - 1) {
      parentPort.postMessage({ type: 'batch', matches: batch, filesSearched: i + 1 });
      batch = [];
    }
    if (total >= limit) { parentPort.postMessage({ type: 'done', truncated: true }); return; }
  }
  parentPort.postMessage({ type: 'done', truncated: false });
})();
`;

const MAX_CONCURRENT = 3;
let running = 0;
const waiting: Array<() => void> = [];

async function acquireSlot(): Promise<() => void> {
  if (running >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  return () => {
    running--;
    waiting.shift()?.();
  };
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Validates the query and returns regex source + flags (throws VALIDATION in German for invalid patterns). */
export function compileQuery(query: string, regex: boolean, caseSensitive: boolean): { source: string; flags: string } {
  const source = regex ? query : escapeRegExp(query);
  const flags = caseSensitive ? 'g' : 'gi';
  try {
    new RegExp(source, flags);
  } catch (e) {
    throw new NovaError('VALIDATION', `Ungültiger regulärer Ausdruck: ${(e as Error).message}`, { severity: 'warning' });
  }
  return { source, flags };
}

export async function searchProjectFiles(req: SearchRequest): Promise<SearchOutcome> {
  const { source, flags } = compileQuery(req.query, req.regex, req.caseSensitive);
  const maxFileBytes = req.maxFileBytes ?? 1024 * 1024;
  const limit = Math.max(1, req.limit);
  const startRel = (req.startRel ?? '').replace(/^\/+|\/+$/g, '');
  let files: { abs: string; rel: string }[];
  const startAbs = startRel ? join(req.root, ...startRel.split('/')) : req.root;
  const st = await stat(startAbs).catch(() => null);
  if (!st) throw new NovaError('NOT_FOUND', `„${startRel || '.'}“ wurde nicht gefunden.`, { severity: 'warning' });
  if (st.isFile()) {
    files = st.size <= maxFileBytes ? [{ abs: startAbs, rel: startRel }] : [];
  } else {
    const walk = await walkProjectFiles(req.root, { startRel, maxFileBytes, signal: req.signal });
    files = walk.files.map((f) => ({ abs: f.abs, rel: f.rel }));
  }
  if (files.length === 0) return { matches: [], truncated: false, timedOut: false, filesSearched: 0 };

  const release = await acquireSlot();
  try {
    return await new Promise<SearchOutcome>((resolve, reject) => {
      const matches: RawSearchMatch[] = [];
      let filesSearched = 0;
      let settled = false;
      const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { files, source, flags, limit } });
      const finish = (outcome: { truncated: boolean; timedOut: boolean } | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        req.signal?.removeEventListener('abort', onAbort);
        void worker.terminate();
        if (outcome instanceof Error) reject(outcome);
        else resolve({ matches: matches.slice(0, limit), truncated: outcome.truncated, timedOut: outcome.timedOut, filesSearched });
      };
      const timer = setTimeout(() => finish({ truncated: false, timedOut: true }), req.timeoutMs ?? 15_000);
      const onAbort = () => finish(new NovaError('CANCELLED', 'Die Suche wurde abgebrochen.', { severity: 'warning' }));
      req.signal?.addEventListener('abort', onAbort, { once: true });
      worker.on('message', (msg: { type: 'batch'; matches: [string, number, number, string, number][]; filesSearched: number } | { type: 'done'; truncated: boolean }) => {
        if (msg.type === 'batch') {
          filesSearched = msg.filesSearched;
          for (const [path, line, column, window, windowStart] of msg.matches) matches.push({ path, line, column, window, windowStart });
        } else {
          finish({ truncated: msg.truncated, timedOut: false });
        }
      });
      worker.once('error', (e) => finish(new NovaError('INTERNAL', 'Die Suche ist fehlgeschlagen.', { details: { error: e.message }, cause: e })));
      worker.once('exit', () => finish({ truncated: false, timedOut: false }));
    });
  } finally {
    release();
  }
}

/** ≤ maxLen characters of the match's line, starting a little before the match. */
export function buildPreview(m: RawSearchMatch, maxLen = 200): string {
  const rel = m.column - 1 - m.windowStart;
  const from = Math.max(0, rel - 60);
  let text = m.window.slice(from, from + maxLen);
  const cutStart = from > 0 || m.windowStart > 0;
  const cutEnd = from + maxLen < m.window.length;
  if (!cutStart) text = text.replace(/^\s+/, '');
  if (cutStart) text = `…${text.slice(1)}`;
  if (cutEnd) text = `${text.slice(0, -1)}…`;
  return text.trimEnd().slice(0, maxLen);
}
