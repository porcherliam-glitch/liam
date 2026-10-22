// Output parsers for checks: test frameworks (vitest, jest, node --test TAP/spec, pytest, dotnet test, mocha),
// machine-readable result files (Unity NUnit XML, dotnet TRX) and compiler/linter errors (tsc, MSBuild/C#, ESLint
// stylish, gcc/esbuild-style file:line:col, node --check, Python tracebacks).
// Key decisions:
// - Exit codes decide pass/fail (CheckService); parsers only add counts and failure locations. Nothing is guessed:
//   counts stay null when no known summary was found.
// - Failure files are normalized to project-relative forward-slash paths (case-insensitive on Windows); paths outside
//   the project or inside node_modules/node internals are dropped (file = null) unless nothing better exists.
// - failureSignature = sha1 over the sorted "file|first message line" list (line numbers excluded so the same
//   failure after an edit keeps its signature), shortened to 16 hex chars.
import { createHash } from 'node:crypto';
import type { CheckFailure, CheckKind } from '@shared/schemas';
import { pathApiFor } from '../projects/root-safety';

export interface ParseContext {
  root: string;
  platform: NodeJS.Platform;
}

export interface ParsedCheck {
  framework: string | null;
  passed: number | null;
  failed: number | null;
  skipped: number | null;
  failures: CheckFailure[];
}

const MAX_FAILURES = 100;
const MAX_MESSAGE = 500;

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '').replace(/\r\n?/g, '\n');
}

function empty(framework: string | null = null): ParsedCheck {
  return { framework, passed: null, failed: null, skipped: null, failures: [] };
}

function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > MAX_MESSAGE ? `${t.slice(0, MAX_MESSAGE - 1)}…` : t;
}

function firstLine(text: string): string {
  return (text.split('\n').find((l) => l.trim() !== '') ?? '').trim();
}

// ------------------------------------------------------------------------------------------------ paths

function fileUrlToPath(url: string, platform: NodeJS.Platform): string {
  let p = decodeURIComponent(url.replace(/^file:\/\//i, ''));
  if (platform === 'win32') {
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
    else if (!p.startsWith('/')) p = `\\\\${p}`; // file://server/share
    p = p.replace(/\//g, '\\');
  }
  return p;
}

/** Project-relative forward-slash path, or null when the location is outside the project / not a file. */
export function toProjectRelative(file: string, ctx: ParseContext): string | null {
  let f = file.trim().replace(/^["'(]+|["'),]+$/g, '');
  if (!f || /^node:/i.test(f) || /^internal\//.test(f) || f.startsWith('<')) return null;
  if (/^file:\/\//i.test(f)) f = fileUrlToPath(f, ctx.platform);
  const api = pathApiFor(ctx.platform);
  const isAbs = ctx.platform === 'win32' ? /^[A-Za-z]:[\\/]|^[\\/]{2}/.test(f) : f.startsWith('/');
  if (isAbs) {
    const root = api.normalize(ctx.root);
    const norm = api.normalize(f);
    const rel = ctx.platform === 'win32' ? winRelative(root, norm) : api.relative(root, norm);
    if (rel === null || rel === '' || rel.startsWith('..') || api.isAbsolute(rel)) return null;
    return rel.replace(/\\/g, '/');
  }
  const rel = f.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
  if (rel.startsWith('../') || rel === '..') return null;
  return rel;
}

function winRelative(root: string, file: string): string | null {
  const r = root.replace(/[\\/]+$/, '');
  if (file.toLowerCase() === r.toLowerCase()) return '';
  if (!file.toLowerCase().startsWith(`${r.toLowerCase()}\\`)) return null;
  return file.slice(r.length + 1);
}

function isNoise(rel: string | null): boolean {
  return rel === null || /(^|\/)node_modules\//.test(rel);
}

function failure(file: string | null, line: number | null, column: number | null, message: string, ctx: ParseContext): CheckFailure {
  const rel = file ? toProjectRelative(file, ctx) : null;
  return { file: rel, line: rel ? line : null, column: rel ? column : null, message: clip(message) };
}

/** Picks the first stack location inside the project (not node_modules) from a text block. */
function locationIn(block: string, ctx: ParseContext): { file: string; line: number; column: number | null } | null {
  const patterns = [
    /\(((?:file:\/\/)?[^()\s]+?):(\d+):(\d+)\)/g, // at fn (file:1:2)
    /\bat\s+((?:file:\/\/)?[^()\s]+?):(\d+):(\d+)/g, // at file:1:2
    /(?:❯|›|>)\s+((?:file:\/\/)?\S+?):(\d+):(\d+)/g, // vitest location
    /\sin\s+(.+?):line\s+(\d+)()/g, // .NET stack trace
    /\sin\s+((?:[A-Za-z]:)?[^:\n]+?\.cs):(\d+)()/g, // Mono/Unity stack trace
    /File "([^"]+)", line (\d+)()/g, // Python traceback
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block))) {
      const rel = toProjectRelative(m[1], ctx);
      if (!isNoise(rel)) return { file: m[1], line: Number(m[2]), column: m[3] ? Number(m[3]) : null };
    }
  }
  return null;
}

// ------------------------------------------------------------------------------------------------ counts helpers

function countsFrom(segment: string, map: Record<string, 'passed' | 'failed' | 'skipped' | 'ignore'>): { passed: number; failed: number; skipped: number; found: boolean } {
  const out = { passed: 0, failed: 0, skipped: 0, found: false };
  const re = /(\d+)\s+([A-Za-z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment))) {
    const target = map[m[2].toLowerCase()];
    if (!target || target === 'ignore') continue;
    out[target] += Number(m[1]);
    out.found = true;
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ vitest

export function parseVitest(text: string, ctx: ParseContext): ParsedCheck | null {
  const summary = /^\s*Tests\s{2,}(.+?)\s*\((\d+)\)\s*$/m.exec(text);
  if (!summary || !/^\s*Test Files\s{2,}/m.test(text)) return null;
  const c = countsFrom(summary[1], { passed: 'passed', failed: 'failed', skipped: 'skipped', todo: 'skipped' });
  const result = empty('vitest');
  result.passed = c.passed;
  result.failed = c.failed;
  result.skipped = c.skipped;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && result.failures.length < MAX_FAILURES; i++) {
    const m = /^\s*FAIL\s+(\S.*?)\s*$/.exec(lines[i]);
    if (!m) continue;
    const head = m[1].replace(/\s*\[[^\]]*\]\s*$/, '');
    const [file, ...nameParts] = head.split(' > ');
    const name = nameParts.join(' > ');
    const blockLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*FAIL\s+/.test(lines[j]) || /^⎯{3,}/.test(lines[j]) || /^\s*Test Files\s{2,}/.test(lines[j])) break;
      blockLines.push(lines[j]);
    }
    const block = blockLines.join('\n');
    const msg = firstLine(block) || 'Test fehlgeschlagen';
    const loc = locationIn(block, ctx);
    if (loc) result.failures.push(failure(loc.file, loc.line, loc.column, name ? `${name}: ${msg}` : msg, ctx));
    else result.failures.push(failure(file, null, null, name ? `${name}: ${msg}` : msg, ctx));
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ jest

export function parseJest(text: string, ctx: ParseContext): ParsedCheck | null {
  const summary = /^Tests:\s+(.+)$/m.exec(text);
  if (!summary || !/^Test Suites:\s+/m.test(text)) return null;
  const c = countsFrom(summary[1], { passed: 'passed', failed: 'failed', skipped: 'skipped', todo: 'skipped', pending: 'skipped', total: 'ignore' });
  const result = empty('jest');
  result.passed = c.passed;
  result.failed = c.failed;
  result.skipped = c.skipped;
  const lines = text.split('\n');
  let currentFile: string | null = null;
  for (let i = 0; i < lines.length && result.failures.length < MAX_FAILURES; i++) {
    const fileHead = /^\s*FAIL\s+(\S+)/.exec(lines[i]);
    if (fileHead) {
      currentFile = fileHead[1];
      continue;
    }
    const m = /^\s*●\s+(.+)$/.exec(lines[i]);
    if (!m || /^Console$/.test(m[1].trim())) continue;
    const blockLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*●\s+/.test(lines[j]) || /^\s*(PASS|FAIL)\s+\S/.test(lines[j]) || /^Test Suites:/.test(lines[j])) break;
      blockLines.push(lines[j]);
    }
    const block = blockLines.join('\n');
    const msg = firstLine(block) || 'Test fehlgeschlagen';
    const loc = locationIn(block, ctx);
    const title = m[1].trim();
    if (loc) result.failures.push(failure(loc.file, loc.line, loc.column, `${title}: ${msg}`, ctx));
    else result.failures.push(failure(currentFile, null, null, `${title}: ${msg}`, ctx));
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ node --test

function unquoteYaml(value: string): string {
  const v = value.trim();
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

export function parseNodeTest(text: string, ctx: ParseContext): ParsedCheck | null {
  const tap = /^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm;
  const spec = /^ℹ (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/gm;
  const counts: Record<string, number> = {};
  let format: 'tap' | 'spec' | null = null;
  for (const [re, f] of [
    [tap, 'tap'],
    [spec, 'spec'],
  ] as const) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text))) {
      counts[m[1]] = Number(m[2]);
      format = f;
    }
    if (format) break;
  }
  if (!format || counts.pass === undefined || counts.fail === undefined) return null;
  const result = empty('node-test');
  result.passed = counts.pass;
  result.failed = counts.fail + (counts.cancelled ?? 0);
  result.skipped = (counts.skipped ?? 0) + (counts.todo ?? 0);
  const lines = text.split('\n');

  if (format === 'tap') {
    for (let i = 0; i < lines.length && result.failures.length < MAX_FAILURES; i++) {
      const m = /^(\s*)not ok \d+ - (.+?)(?:\s+#\s+(?:TODO|SKIP).*)?$/.exec(lines[i]);
      if (!m) continue;
      const indent = m[1].length;
      const name = m[2].trim();
      const yaml: string[] = [];
      if (lines[i + 1]?.trim() === '---') {
        for (let j = i + 2; j < lines.length; j++) {
          if (lines[j].trim() === '...' && lines[j].length - lines[j].trimStart().length <= indent + 2) break;
          yaml.push(lines[j]);
        }
      }
      const field = (key: string) => {
        const idx = yaml.findIndex((l) => new RegExp(`^\\s*${key}:`).test(l));
        if (idx === -1) return null;
        const after = yaml[idx].replace(new RegExp(`^\\s*${key}:\\s?`), '');
        if (/^[|>][-+]?\s*$/.test(after)) {
          const base = yaml[idx].length - yaml[idx].trimStart().length;
          const body: string[] = [];
          for (let k = idx + 1; k < yaml.length; k++) {
            const l = yaml[k];
            if (l.trim() !== '' && l.length - l.trimStart().length <= base) break;
            body.push(l.trim());
          }
          return body.join('\n');
        }
        return unquoteYaml(after);
      };
      if (field('failureType') === 'subtestsFailed') continue;
      const error = field('error') ?? 'Test fehlgeschlagen';
      const location = field('location');
      const stack = field('stack') ?? '';
      let loc: { file: string; line: number; column: number | null } | null = null;
      const fromStack = locationIn(stack.split('\n').map((l) => `at ${l}`).join('\n'), ctx);
      if (fromStack) loc = fromStack;
      if (!loc && location) {
        const lm = /^(.*):(\d+):(\d+)$/.exec(location);
        if (lm) loc = { file: lm[1], line: Number(lm[2]), column: Number(lm[3]) };
      }
      const msg = `${name}: ${firstLine(error)}`;
      result.failures.push(loc ? failure(loc.file, loc.line, loc.column, msg, ctx) : failure(null, null, null, msg, ctx));
    }
  } else {
    const start = lines.findIndex((l) => /^✖ failing tests:/.test(l));
    if (start !== -1) {
      for (let i = start + 1; i < lines.length && result.failures.length < MAX_FAILURES; i++) {
        const at = /^test at (.+):(\d+):(\d+)\s*$/.exec(lines[i]);
        if (!at) continue;
        const nameLine = /^✖ (.+?)(?: \([\d.]+m?s\))?\s*$/.exec(lines[i + 1] ?? '');
        const block: string[] = [];
        for (let j = i + 2; j < lines.length; j++) {
          if (/^test at /.test(lines[j])) break;
          block.push(lines[j]);
        }
        const msg = `${nameLine ? nameLine[1] : 'Test'}: ${firstLine(block.join('\n')) || 'Test fehlgeschlagen'}`;
        const loc = locationIn(block.join('\n'), ctx);
        result.failures.push(loc ? failure(loc.file, loc.line, loc.column, msg, ctx) : failure(at[1], Number(at[2]), Number(at[3]), msg, ctx));
      }
    }
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ pytest

export function parsePytest(text: string, ctx: ParseContext): ParsedCheck | null {
  const summary = /^=*\s*((?:\d+ (?:passed|failed|errors?|skipped|xfailed|xpassed|deselected|warnings?|rerun)(?:, )?)+)\s+in\s+[\d.]+s(?:\s*\([^)]*\))?\s*=*\s*$/m.exec(text);
  const noTests = /^=+ no tests ran in [\d.]+s =+$/m.test(text);
  if (!summary && !noTests) return null;
  const result = empty('pytest');
  const c = summary
    ? countsFrom(summary[1], { passed: 'passed', xpassed: 'passed', failed: 'failed', error: 'failed', errors: 'failed', skipped: 'skipped', xfailed: 'skipped', deselected: 'ignore', warning: 'ignore', warnings: 'ignore', rerun: 'ignore' })
    : { passed: 0, failed: 0, skipped: 0 };
  result.passed = c.passed;
  result.failed = c.failed;
  result.skipped = c.skipped;
  const lines = text.split('\n');
  // Locations from the FAILURES/ERRORS sections: "____ test_name ____" … "path.py:12: AssertionError".
  const locations = new Map<string, { file: string; line: number }>();
  let current: string | null = null;
  for (const l of lines) {
    const head = /^_{3,} (?:ERROR (?:at setup of |collecting )?)?(.+?) _{3,}$/.exec(l);
    if (head) {
      current = head[1].trim();
      continue;
    }
    const loc = /^(\S+\.py):(\d+): \w/.exec(l);
    if (current && loc) {
      const value = { file: loc[1], line: Number(loc[2]) };
      locations.set(current, value);
      locations.set(current.split(/::|\./).pop()!, value);
    }
  }
  for (const l of lines) {
    if (result.failures.length >= MAX_FAILURES) break;
    const m = /^(FAILED|ERROR) (\S+?)(?:::(\S+))?(?: - (.*))?$/.exec(l);
    if (!m) continue;
    const testName = m[3] ? m[3].split('::').pop()! : m[2];
    const loc = locations.get(testName) ?? locations.get(m[3] ?? '') ?? null;
    const msg = `${m[3] ?? m[2]}: ${m[4] ?? (m[1] === 'ERROR' ? 'Fehler beim Ausführen' : 'Test fehlgeschlagen')}`;
    result.failures.push(loc ? failure(loc.file, loc.line, null, msg, ctx) : failure(m[2], null, null, msg, ctx));
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ dotnet test

export function parseDotnetTest(text: string, ctx: ParseContext): ParsedCheck | null {
  const re = /(Passed|Failed)!\s+-\s+Failed:\s+(\d+),\s+Passed:\s+(\d+),\s+Skipped:\s+(\d+),\s+Total:\s+(\d+)/g;
  let m: RegExpExecArray | null;
  let found = false;
  const result = empty('dotnet-test');
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  while ((m = re.exec(text))) {
    found = true;
    failed += Number(m[2]);
    passed += Number(m[3]);
    skipped += Number(m[4]);
  }
  if (!found) {
    const total = /^Total tests:\s*(\d+)/m.exec(text);
    if (!total) return null;
    passed = Number(/^\s*Passed:\s*(\d+)/m.exec(text)?.[1] ?? 0);
    failed = Number(/^\s*Failed:\s*(\d+)/m.exec(text)?.[1] ?? 0);
    skipped = Number(/^\s*Skipped:\s*(\d+)/m.exec(text)?.[1] ?? 0);
  }
  result.passed = passed;
  result.failed = failed;
  result.skipped = skipped;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && result.failures.length < MAX_FAILURES; i++) {
    const f = /^\s+Failed (\S.*?) \[[^\]]*\]\s*$/.exec(lines[i]);
    if (!f) continue;
    const block: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s+(Failed|Passed|Skipped) \S.*\[[^\]]*\]\s*$/.test(lines[j]) || /^(Passed|Failed)!\s+-/.test(lines[j].trim())) break;
      block.push(lines[j]);
    }
    const text2 = block.join('\n');
    const msgIdx = block.findIndex((l) => /^\s*Error Message:\s*$/.test(l));
    const msg = msgIdx !== -1 ? firstLine(block.slice(msgIdx + 1).join('\n')) : 'Test fehlgeschlagen';
    const loc = locationIn(text2, ctx);
    result.failures.push(loc ? failure(loc.file, loc.line, loc.column, `${f[1]}: ${msg}`, ctx) : failure(null, null, null, `${f[1]}: ${msg}`, ctx));
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ mocha

export function parseMocha(text: string, ctx: ParseContext): ParsedCheck | null {
  const passing = /^\s*(\d+) passing\b/m.exec(text);
  if (!passing) return null;
  const failing = /^\s*(\d+) failing\b/m.exec(text);
  const pending = /^\s*(\d+) pending\b/m.exec(text);
  const result = empty('mocha');
  result.passed = Number(passing[1]);
  result.failed = failing ? Number(failing[1]) : 0;
  result.skipped = pending ? Number(pending[1]) : 0;
  if (failing) {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => /^\s*\d+ failing\b/.test(l));
    for (let i = start + 1; i < lines.length && result.failures.length < MAX_FAILURES; i++) {
      const m = /^\s+(\d+)\) (.+)$/.exec(lines[i]);
      if (!m) continue;
      const block: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s+\d+\) \S/.test(lines[j])) break;
        block.push(lines[j]);
      }
      // Title continues on indented lines ending with ':'; the error message follows.
      const titleParts = [m[2].trim()];
      let k = 0;
      while (k < block.length && block[k].trim() !== '' && block[k].trim().endsWith(':') && !/Error/.test(block[k])) {
        titleParts.push(block[k].trim().replace(/:$/, ''));
        k++;
      }
      const msg = firstLine(block.slice(k).join('\n')) || 'Test fehlgeschlagen';
      const loc = locationIn(block.join('\n'), ctx);
      const title = titleParts.join(' ').replace(/:$/, '');
      result.failures.push(loc ? failure(loc.file, loc.line, loc.column, `${title}: ${msg}`, ctx) : failure(null, null, null, `${title}: ${msg}`, ctx));
    }
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ compilers / linters

/** tsc and MSBuild/C# style: `file(line,col): error CODE: message [project]`, plus tsc pretty `file:line:col - error`. */
export function parseCompilerErrors(text: string, ctx: ParseContext): CheckFailure[] {
  const out: CheckFailure[] = [];
  const seen = new Set<string>();
  const add = (file: string, line: number, col: number | null, msg: string) => {
    const key = `${file}|${line}|${col}|${msg}`;
    if (seen.has(key) || out.length >= MAX_FAILURES) return;
    seen.add(key);
    out.push(failure(file, line, col, msg, ctx));
  };
  const paren = /^\s*(.+?)\((\d+),(\d+)(?:,\d+,\d+)?\):\s+(?:fatal\s+)?error\s+([A-Z]{2,}\d+):\s*(.+?)(?:\s+\[[^\]]+\])?\s*$/gm;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(text))) add(m[1].trim(), Number(m[2]), Number(m[3]), `${m[4]}: ${m[5]}`);
  const pretty = /^(\S.*?):(\d+):(\d+) - error (TS\d+): (.+)$/gm;
  while ((m = pretty.exec(text))) add(m[1], Number(m[2]), Number(m[3]), `${m[4]}: ${m[5]}`);
  return out;
}

/** ESLint "stylish" format: a file path line followed by "  line:col  error  message  rule" lines. */
export function parseEslintStylish(text: string, ctx: ParseContext): CheckFailure[] {
  const out: CheckFailure[] = [];
  let file: string | null = null;
  for (const l of text.split('\n')) {
    if (/^(?:[A-Za-z]:[\\/]|\/)\S.*\.(?:[cm]?[jt]sx?|vue|svelte|astro)\s*$/.test(l)) {
      file = l.trim();
      continue;
    }
    const m = /^\s+(\d+):(\d+)\s+error\s+(.+?)(?:\s{2,}(\S+))?\s*$/.exec(l);
    if (m && file && out.length < MAX_FAILURES) out.push(failure(file, Number(m[1]), Number(m[2]), m[4] ? `${m[3]} (${m[4]})` : m[3], ctx));
    else if (l.trim() === '') file = null;
  }
  return out;
}

/** gcc/esbuild/vite style `file:line:col: error: message`, node --check output and Python tracebacks. */
export function parseGenericErrors(text: string, ctx: ParseContext): CheckFailure[] {
  const out: CheckFailure[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && out.length < MAX_FAILURES; i++) {
    const l = lines[i];
    const gcc = /^\s*((?:[A-Za-z]:)?[^\s:()"']+\.[A-Za-z0-9]+):(\d+)(?::(\d+))?:?\s+(?:-\s+)?(?:fatal\s+)?(?:error|Error|ERROR)(?:\s+[A-Z]+\d+)?:?\s*(.*)$/.exec(l);
    if (gcc) {
      out.push(failure(gcc[1], Number(gcc[2]), gcc[3] ? Number(gcc[3]) : null, gcc[4] || 'Fehler', ctx));
      continue;
    }
    // esbuild: "✘ [ERROR] message" … "    src/main.ts:1:7:"
    const esb = /^\s*(?:✘|X)\s+\[ERROR\]\s+(.+)$/.exec(l);
    if (esb) {
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const at = /^\s+((?:[A-Za-z]:)?[^\s:]+\.[A-Za-z0-9]+):(\d+):(\d+):\s*$/.exec(lines[j]);
        if (at) {
          out.push(failure(at[1], Number(at[2]), Number(at[3]), esb[1], ctx));
          break;
        }
      }
      continue;
    }
    // node --check: "<file>:<line>" … "SyntaxError: …"
    const nodeCheck = /^((?:[A-Za-z]:)?[\\/]?\S*?\.(?:m?js|cjs)):(\d+)\s*$/.exec(l);
    if (nodeCheck) {
      for (let j = i + 1; j < Math.min(lines.length, i + 8); j++) {
        const se = /^(SyntaxError|ReferenceError|TypeError): (.+)$/.exec(lines[j].trim());
        if (se) {
          out.push(failure(nodeCheck[1], Number(nodeCheck[2]), null, `${se[1]}: ${se[2]}`, ctx));
          break;
        }
      }
      continue;
    }
    // Python traceback: last "File" line before the exception line.
    if (/^Traceback \(most recent call last\):/.test(l)) {
      let file: { f: string; line: number } | null = null;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const fm = /^\s+File "([^"]+)", line (\d+)/.exec(lines[j]);
        if (fm) {
          const rel = toProjectRelative(fm[1], ctx);
          if (rel && !/site-packages|\.venv\//.test(rel)) file = { f: fm[1], line: Number(fm[2]) };
          continue;
        }
        if (/^\S/.test(lines[j])) break;
      }
      const exc = lines[j]?.trim();
      if (exc) out.push(failure(file?.f ?? null, file?.line ?? null, null, exc, ctx));
      i = j;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ XML results

function xmlDecode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? xmlDecode(m[1]) : null;
}

/** NUnit 3 XML (Unity Test Framework): counts from <test-run>, failures from <test-case result="Failed">. */
export function parseNunitXml(xml: string, ctx: ParseContext): ParsedCheck | null {
  const run = /<test-run\b[^>]*>/.exec(xml);
  if (!run) return null;
  const result = empty('unity-nunit');
  const num = (n: string) => {
    const v = attr(run[0], n);
    return v !== null && /^\d+$/.test(v) ? Number(v) : null;
  };
  result.passed = num('passed');
  const failed = num('failed');
  result.failed = failed === null ? null : failed;
  const skipped = (num('skipped') ?? 0) + (num('inconclusive') ?? 0);
  result.skipped = num('skipped') === null && num('inconclusive') === null ? null : skipped;
  const caseRe = /<test-case\b([^>]*?)(?:\/>|>([\s\S]*?)<\/test-case>)/g;
  let m: RegExpExecArray | null;
  while ((m = caseRe.exec(xml)) && result.failures.length < MAX_FAILURES) {
    const tag = `<test-case${m[1]}>`;
    const res = attr(tag, 'result') ?? '';
    if (!/^Failed/i.test(res)) continue;
    const name = attr(tag, 'fullname') ?? attr(tag, 'name') ?? 'Test';
    const body = m[2] ?? '';
    const message = xmlDecode(/<message>([\s\S]*?)<\/message>/.exec(body)?.[1] ?? '').trim();
    const stack = xmlDecode(/<stack-trace>([\s\S]*?)<\/stack-trace>/.exec(body)?.[1] ?? '');
    const loc = locationIn(stack, ctx);
    const msg = `${name}: ${firstLine(message) || 'Test fehlgeschlagen'}`;
    result.failures.push(loc ? failure(loc.file, loc.line, loc.column, msg, ctx) : failure(null, null, null, msg, ctx));
  }
  return result;
}

/** Visual Studio TRX (dotnet test --logger trx): counts from <Counters>, failures from <UnitTestResult outcome="Failed">. */
export function parseTrx(xml: string, ctx: ParseContext): ParsedCheck | null {
  const counters = /<Counters\b[^>]*\/?>/.exec(xml);
  if (!counters) return null;
  const n = (name: string) => Number(attr(counters[0], name) ?? 0) || 0;
  const result = empty('dotnet-trx');
  result.passed = n('passed');
  result.failed = n('failed') + n('error') + n('timeout') + n('aborted');
  result.skipped = n('notExecuted') + n('inconclusive');
  const re = /<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) && result.failures.length < MAX_FAILURES) {
    const tag = `<UnitTestResult${m[1]}>`;
    if ((attr(tag, 'outcome') ?? '') !== 'Failed') continue;
    const name = attr(tag, 'testName') ?? 'Test';
    const body = m[2] ?? '';
    const message = xmlDecode(/<Message>([\s\S]*?)<\/Message>/.exec(body)?.[1] ?? '');
    const stack = xmlDecode(/<StackTrace>([\s\S]*?)<\/StackTrace>/.exec(body)?.[1] ?? '');
    const loc = locationIn(stack, ctx);
    const msg = `${name}: ${firstLine(message) || 'Test fehlgeschlagen'}`;
    result.failures.push(loc ? failure(loc.file, loc.line, loc.column, msg, ctx) : failure(null, null, null, msg, ctx));
  }
  return result;
}

/** Sums several TRX results (one file per test project). */
export function mergeParsed(parts: ParsedCheck[]): ParsedCheck | null {
  if (parts.length === 0) return null;
  const sum = (k: 'passed' | 'failed' | 'skipped') => (parts.some((p) => p[k] !== null) ? parts.reduce((a, p) => a + (p[k] ?? 0), 0) : null);
  return { framework: parts[0].framework, passed: sum('passed'), failed: sum('failed'), skipped: sum('skipped'), failures: parts.flatMap((p) => p.failures).slice(0, MAX_FAILURES) };
}

// ------------------------------------------------------------------------------------------------ dispatcher

const TEST_PARSERS = [parseVitest, parseJest, parseNodeTest, parsePytest, parseDotnetTest, parseMocha];

/** Parses console output of a check. Test kinds get counts (when a known summary exists) + failures. */
export function parseCheckOutput(kind: CheckKind, rawOutput: string, ctx: ParseContext): ParsedCheck {
  const text = stripAnsi(rawOutput);
  let result: ParsedCheck = empty();
  if (kind === 'test' || kind === 'e2e') {
    for (const parser of TEST_PARSERS) {
      const r = parser(text, ctx);
      if (r) {
        result = r;
        break;
      }
    }
  }
  if (result.failures.length === 0) {
    const compiler = parseCompilerErrors(text, ctx);
    const eslint = compiler.length ? [] : parseEslintStylish(text, ctx);
    const generic = compiler.length || eslint.length ? [] : parseGenericErrors(text, ctx);
    result.failures = [...compiler, ...eslint, ...generic].slice(0, MAX_FAILURES);
  }
  return result;
}

// ------------------------------------------------------------------------------------------------ signature

function normalizeForSignature(line: string): string {
  return line
    .replace(/\(\s*[\d.]+\s*m?s\s*\)/g, '')
    .replace(/\b\d+(\.\d+)?\s*(ms|s|sec|seconds)\b/g, '')
    .replace(/0x[0-9a-f]+/gi, '0x')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** sha1 of sorted (file + first failure line); falls back to the last output lines when nothing was parsed. */
export function failureSignature(failures: CheckFailure[], fallback: { exitCode: number | null; output: string }): string {
  let items: string[];
  if (failures.length > 0) {
    items = failures.map((f) => `${f.file ?? ''}|${normalizeForSignature(firstLine(f.message))}`);
  } else {
    const tail = stripAnsi(fallback.output)
      .split('\n')
      .map((l) => normalizeForSignature(l))
      .filter(Boolean)
      .slice(-10);
    items = [`exit:${fallback.exitCode ?? 'none'}`, ...tail];
  }
  items = [...new Set(items)].sort();
  return createHash('sha1').update(items.join('\n')).digest('hex').slice(0, 16);
}
