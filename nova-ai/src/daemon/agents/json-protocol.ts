// JSON tool protocol for models without native tool calling (SPEC §4.4 step 3).
// The model answers with exactly one object {"tool": "<name>", "arguments": {...}}. Small local models are sloppy,
// so parsing is tolerant where it is unambiguous:
// - the FIRST balanced JSON object is used, objects inside ```json fences are preferred;
// - string-aware brace matching (braces inside strings do not count);
// - trailing commas and Python literals (True/False/None) outside strings are repaired;
// - aliases name/function/tool_name for "tool" and parameters/args/input for "arguments"; arguments given as a JSON
//   string are decoded; {"tool_calls":[...]} takes the first call.
// Anything else is reported as a parse failure so the runner can send a correction message.

const MAX_SCAN_STARTS = 200;
const MAX_TEXT = 400_000;

export type JsonToolCallParse =
  | { ok: true; name: string; arguments: Record<string, unknown> }
  | { ok: false; reason: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Index of the brace that closes the object starting at `start`, or -1. Strings and escapes are respected. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Removes trailing commas and replaces Python literals outside of strings. */
export function repairJson(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      if (text[j] === '}' || text[j] === ']') continue; // trailing comma
      out += ch;
      continue;
    }
    const rest = text.slice(i);
    const lit = /^(True|False|None)\b/.exec(rest);
    const prev = i > 0 ? text[i - 1] : '';
    if (lit && !/[A-Za-z0-9_]/.test(prev)) {
      out += lit[1] === 'True' ? 'true' : lit[1] === 'False' ? 'false' : 'null';
      i += lit[1].length - 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function tryParseObject(candidate: string): Record<string, unknown> | null {
  for (const text of [candidate, repairJson(candidate)]) {
    try {
      const v: unknown = JSON.parse(text);
      if (isPlainObject(v)) return v;
    } catch {
      /* try the next variant */
    }
  }
  return null;
}

function scanForObject(text: string): Record<string, unknown> | null {
  let starts = 0;
  for (let i = text.indexOf('{'); i !== -1 && starts < MAX_SCAN_STARTS; i = text.indexOf('{', i + 1)) {
    starts++;
    const end = matchingBrace(text, i);
    if (end === -1) continue;
    const obj = tryParseObject(text.slice(i, end + 1));
    if (obj) return obj;
  }
  return null;
}

/** The first balanced JSON object in a model answer (fenced code blocks first), or null. */
export function findFirstJsonObject(input: string): Record<string, unknown> | null {
  if (!input) return null;
  const text = input.length > MAX_TEXT ? input.slice(0, MAX_TEXT) : input;
  const fence = /```[ \t]*(?:[A-Za-z][A-Za-z0-9_-]*)?[ \t]*\r?\n?([\s\S]*?)```/g;
  for (let m = fence.exec(text); m; m = fence.exec(text)) {
    const obj = scanForObject(m[1]);
    if (obj) return obj;
  }
  return scanForObject(text);
}

/** Interprets a parsed object as a tool call (with tolerant aliases). */
export function interpretToolCall(obj: Record<string, unknown>, depth = 0): JsonToolCallParse {
  if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0 && depth === 0) {
    const first: unknown = obj.tool_calls[0];
    if (isPlainObject(first)) return interpretToolCall(first, depth + 1);
  }
  const fn = isPlainObject(obj.function) ? obj.function : null;
  const rawName = obj.tool ?? obj.name ?? obj.tool_name ?? fn?.name ?? (typeof obj.function === 'string' ? obj.function : undefined);
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return { ok: false, reason: 'the JSON object has no "tool" field with the tool name' };
  }
  let args: unknown = obj.arguments ?? obj.parameters ?? obj.args ?? obj.input ?? fn?.arguments ?? fn?.parameters;
  if (typeof args === 'string') {
    const trimmed = args.trim();
    if (trimmed === '') args = {};
    else {
      const parsed = tryParseObject(trimmed);
      if (!parsed) return { ok: false, reason: '"arguments" must be a JSON object' };
      args = parsed;
    }
  }
  if (args === undefined || args === null) args = {};
  if (!isPlainObject(args)) return { ok: false, reason: '"arguments" must be a JSON object' };
  return { ok: true, name: normalizeToolName(rawName), arguments: args };
}

/** Strips decorations some models add ("functions.read_file", " read_file "). */
export function normalizeToolName(name: string): string {
  return name.trim().replace(/^functions\./, '').replace(/^tools\./, '');
}

/** Parses a JSON-protocol answer. */
export function parseJsonToolCall(text: string): JsonToolCallParse {
  const obj = findFirstJsonObject(text);
  if (!obj) {
    return { ok: false, reason: text.trim() === '' ? 'the answer was empty' : 'no JSON object was found in the answer' };
  }
  return interpretToolCall(obj);
}
