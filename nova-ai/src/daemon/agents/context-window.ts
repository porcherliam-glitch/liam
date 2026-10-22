// Context management for agent conversations (SPEC §4.4 step 7).
// Key decisions:
// - Token estimate = ceil(chars / 3.5) over message contents, tool-call JSON and (native mode) the tool specs – the
//   same heuristic ModelClient uses for budgets. No tokenizer dependency. The runner corrects it upwards with the
//   input token counts the provider reports (chars / 3.5 is optimistic for code, JSON and German text).
// - Effective window: Ollama models run with num_ctx = settings.models.ollamaNumCtx, so the window is
//   min(model context length, num_ctx); other providers use the reported context length (fallback 32k).
// - Prompt budget = (window − output reserve) × 0.85: the answer (max_tokens, at most a quarter of the window) has to
//   fit into the same window (Ollama shifts/truncates the context otherwise), 15 % headroom covers estimate errors.
//   Each tool result is capped to a quarter of that budget (2 000 – 16 000 characters, head + tail kept).
// - Compaction runs when the estimate exceeds the budget. The system prompt, the first user message (the task) and
//   all other user messages that are not tool results (notes, task edits, corrections) are never touched. Level 1
//   replaces tool results older than the last 6 messages with "[gekürzt: <first 200 chars>]" (SPEC wording); level 2
//   shortens their long assistant texts and tool-call arguments (e.g. write_file contents); level 3 drops the oldest
//   complete tool turns there (assistant + its results, keeping native tool_call/tool pairs intact) and leaves one
//   placeholder note. Level 4 works on the last 6 messages: earlier tool results and long arguments are shortened,
//   then the newest tool results are cut just enough (head + tail kept) to fit. Level 5 (last resort) drops earlier
//   turns of the tail and reduces the newest results to the short form. Each level only runs while still over.
import type { ChatMessage, ChatToolSpec, ResolvedModel } from '../contracts';
import { TOOL_RESULT_MARK, isToolResultMessage } from './state';

export const CHARS_PER_TOKEN = 3.5;
export const KEEP_LAST_MESSAGES = 6;
/** The output reserve takes at most this share of the window (small windows still leave room for the prompt). */
const OUTPUT_RESERVE_MAX_RATIO = 0.25;
/** Share of (window − output reserve) the estimated prompt may use; the rest absorbs estimate errors. */
const PROMPT_HEADROOM = 0.85;
/** Share of the prompt budget one tool result may take. */
const TOOL_RESULT_BUDGET_RATIO = 0.25;
export const TOOL_RESULT_MIN_CHARS = 2_000;
export const TOOL_RESULT_MAX_CHARS = 16_000;
/** The newest tool results are never cut below this size by level 4 (level 5 may still shorten them). */
const NEWEST_RESULT_MIN_CHARS = 1_000;
const DEFAULT_CONTEXT = 32_768;
const SHORT_PREVIEW = 200;
export const COMPACTED_PREFIX = '[gekürzt: ';
export const DROPPED_NOTE = '[Older steps of this conversation were removed to save space. Read files again if you need their current content.]';

export function estimateTokens(messages: ChatMessage[], tools?: ChatToolSpec[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += m.content.length + 8;
    if (m.role === 'assistant' && m.toolCalls) chars += JSON.stringify(m.toolCalls).length;
    if (m.role === 'tool') chars += m.name.length + m.toolCallId.length;
  }
  if (tools && tools.length > 0) chars += JSON.stringify(tools).length;
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

/** Effective context window in tokens for the resolved model. */
export function contextWindow(resolved: Pick<ResolvedModel, 'contextLength' | 'provider'>, ollamaNumCtx: number): number {
  const reported = resolved.contextLength && resolved.contextLength > 0 ? resolved.contextLength : null;
  if (resolved.provider.type === 'ollama') return Math.max(512, Math.min(reported ?? ollamaNumCtx, ollamaNumCtx));
  return Math.max(512, reported ?? DEFAULT_CONTEXT);
}

/**
 * Token budget for the prompt (messages + tool specs): the window minus the tokens reserved for the answer
 * (max_tokens, at most a quarter of the window), with headroom for estimate errors.
 */
export function promptBudget(window: number, maxOutputTokens: number): number {
  const reserve = Math.min(Math.max(0, maxOutputTokens), Math.floor(window * OUTPUT_RESERVE_MAX_RATIO));
  return Math.max(256, Math.floor((window - reserve) * PROMPT_HEADROOM));
}

/** Maximum characters of one tool result for a prompt budget (in estimated tokens). */
export function toolResultMaxChars(budgetTokens: number): number {
  const chars = Math.floor(budgetTokens * TOOL_RESULT_BUDGET_RATIO * CHARS_PER_TOKEN);
  return Math.max(TOOL_RESULT_MIN_CHARS, Math.min(TOOL_RESULT_MAX_CHARS, chars));
}

/** Cuts a tool result to about `maxChars`, keeping the beginning and the end and telling the model what is missing. */
export function capToolResult(content: string, maxChars: number): string {
  const room = Math.max(200, maxChars - 220);
  if (content.length <= Math.max(maxChars, room)) return content;
  const head = Math.floor(room * 0.8);
  const tail = room - head;
  const omitted = content.length - head - tail;
  return `${content.slice(0, head)}\n[… ${omitted} characters omitted by NOVA to fit the context window. If you need them, request a smaller part (read_file: startLine/endLine) …]\n${content.slice(content.length - tail)}`;
}

export function shortened(text: string): string {
  return `${COMPACTED_PREFIX}${text.slice(0, SHORT_PREVIEW)}]`;
}

function isCompacted(text: string): boolean {
  return text.startsWith(COMPACTED_PREFIX);
}

/** Applies `fn` to the body of a tool result (native or JSON protocol); null when `m` is none or `fn` keeps it. */
function withToolResultBody(m: ChatMessage, fn: (body: string) => string | null): ChatMessage | null {
  if (m.role === 'tool') {
    const body = fn(m.content);
    return body === null ? null : { ...m, content: body };
  }
  if (m.role === 'user' && m.content.startsWith(TOOL_RESULT_MARK)) {
    const nl = m.content.indexOf('\n');
    const header = nl === -1 ? m.content : m.content.slice(0, nl);
    const body = fn(nl === -1 ? '' : m.content.slice(nl + 1));
    return body === null ? null : { role: 'user', content: `${header}\n${body}` };
  }
  return null;
}

function compactToolResult(m: ChatMessage): ChatMessage | null {
  return withToolResultBody(m, (body) => (isCompacted(body) || body.length <= SHORT_PREVIEW + 20 ? null : shortened(body)));
}

/** Cuts the body of a tool result by about `tokens` estimated tokens (head + tail kept, never below the minimum). */
function trimToolResult(m: ChatMessage, tokens: number): ChatMessage | null {
  return withToolResultBody(m, (body) => {
    if (isCompacted(body)) return null;
    const keep = Math.max(NEWEST_RESULT_MIN_CHARS, body.length - Math.ceil(tokens * CHARS_PER_TOKEN) - 300);
    return keep < body.length ? capToolResult(body, keep) : null;
  });
}

function shortenValues(value: unknown, maxLen: number): { value: unknown; changed: boolean } {
  if (typeof value === 'string') {
    if (value.length > maxLen && !isCompacted(value)) return { value: shortened(value), changed: true };
    return { value, changed: false };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const r = shortenValues(v, maxLen);
      changed ||= r.changed;
      return r.value;
    });
    return { value: out, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const r = shortenValues(v, maxLen);
      changed ||= r.changed;
      out[k] = r.value;
    }
    return { value: out, changed };
  }
  return { value, changed: false };
}

function compactAssistant(m: ChatMessage): ChatMessage | null {
  if (m.role !== 'assistant') return null;
  let changed = false;
  let content = m.content;
  if (content.length > 600 && !isCompacted(content)) {
    content = shortened(content);
    changed = true;
  }
  let toolCalls = m.toolCalls;
  if (toolCalls) {
    toolCalls = toolCalls.map((c) => {
      const r = shortenValues(c.arguments, 300);
      if (!r.changed) return c;
      changed = true;
      return { ...c, arguments: r.value as Record<string, unknown> };
    });
  }
  if (!changed) return null;
  return toolCalls ? { role: 'assistant', content, toolCalls } : { role: 'assistant', content };
}

export interface CompactionResult {
  messages: ChatMessage[];
  changed: boolean;
  /** Highest level applied (0 = nothing). */
  level: number;
  before: number;
  after: number;
}

/** Index of the first message that may be compacted (after the system prompt and the first user message). */
function protectedPrefix(messages: ChatMessage[]): number {
  let i = 0;
  if (messages[0]?.role === 'system') i = 1;
  const firstUser = messages.findIndex((m, idx) => idx >= i && m.role === 'user');
  return firstUser === -1 ? i : firstUser + 1;
}

/** Index of the newest assistant message at or after `from` (the start of the newest turn), else messages.length. */
function newestTurnStart(messages: ChatMessage[], from: number): number {
  for (let i = messages.length - 1; i >= from; i--) if (messages[i].role === 'assistant') return i;
  return messages.length;
}

/** Compacts a conversation until it fits `limitTokens` (or nothing more can be done). Never mutates the input. */
export function compactMessages(
  input: ChatMessage[],
  opts: { limitTokens: number; keepLast?: number; tools?: ChatToolSpec[] },
): CompactionResult {
  const keepLast = opts.keepLast ?? KEEP_LAST_MESSAGES;
  const messages = input.map((m) => ({ ...m }) as ChatMessage);
  const before = estimateTokens(messages, opts.tools);
  let level = 0;
  const estimate = () => estimateTokens(messages, opts.tools);
  const fits = () => estimate() <= opts.limitTokens;
  if (before <= opts.limitTokens) return { messages: input, changed: false, level, before, after: before };

  const start = protectedPrefix(messages);
  const olderEnd = () => Math.max(start, messages.length - keepLast);
  const replace = (i: number, m: ChatMessage | null, lvl: number) => {
    if (!m) return;
    messages[i] = m;
    level = lvl;
  };
  /** Drops the oldest complete tool turns that end before `endOf()` while over the limit; one placeholder note. */
  const dropTurns = (endOf: () => number, lvl: number) => {
    let hasPlaceholder = messages.some((m) => m.role === 'user' && m.content === DROPPED_NOTE);
    while (!fits()) {
      const end = endOf();
      let groupStart = -1;
      for (let i = start; i < end; i++) {
        if (messages[i].role === 'assistant') {
          groupStart = i;
          break;
        }
      }
      if (groupStart === -1) break;
      let groupEnd = groupStart + 1;
      while (groupEnd < messages.length && isToolResultMessage(messages[groupEnd])) groupEnd++;
      if (groupEnd > end) break; // the turn reaches into the protected part
      messages.splice(groupStart, groupEnd - groupStart);
      level = lvl;
      if (!hasPlaceholder) {
        messages.splice(groupStart, 0, { role: 'user', content: DROPPED_NOTE });
        hasPlaceholder = true;
      }
    }
  };
  /** Tool results of the newest turn, largest first. */
  const newestResults = () => {
    const out: number[] = [];
    for (let i = newestTurnStart(messages, start) + 1; i < messages.length; i++) if (isToolResultMessage(messages[i])) out.push(i);
    return out.sort((a, b) => messages[b].content.length - messages[a].content.length);
  };

  // Level 1: older tool results.
  for (let i = start; i < olderEnd(); i++) replace(i, compactToolResult(messages[i]), 1);
  // Level 2: older assistant texts and long tool-call arguments.
  if (!fits()) for (let i = start; i < olderEnd(); i++) replace(i, compactAssistant(messages[i]), 2);
  // Level 3: drop the oldest complete tool turns.
  if (!fits()) dropTurns(olderEnd, 3);
  // Level 4: the last messages – earlier tool results, long arguments, then the newest results only as far as needed.
  if (!fits()) {
    const newest = newestTurnStart(messages, start);
    for (let i = olderEnd(); i < newest && !fits(); i++) replace(i, compactToolResult(messages[i]), 4);
    for (let i = olderEnd(); i < messages.length && !fits(); i++) replace(i, compactAssistant(messages[i]), 4);
    for (const i of newestResults()) {
      const over = estimate() - opts.limitTokens;
      if (over <= 0) break;
      replace(i, trimToolResult(messages[i], over), 4);
    }
  }
  // Level 5 (last resort): drop earlier turns of the tail, then shorten the newest results to the short form.
  if (!fits()) {
    dropTurns(() => newestTurnStart(messages, start), 5);
    for (const i of newestResults()) {
      if (fits()) break;
      replace(i, compactToolResult(messages[i]), 5);
    }
  }
  const after = estimate();
  return { messages, changed: level > 0, level, before, after };
}
