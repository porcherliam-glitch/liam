// Context management for agent conversations (SPEC §4.4 step 7).
// Key decisions:
// - Token estimate = ceil(chars / 3.5) over message contents, tool-call JSON and (native mode) the tool specs – the
//   same heuristic ModelClient uses for budgets. No tokenizer dependency.
// - Effective window: Ollama models run with num_ctx = settings.models.ollamaNumCtx, so the window is
//   min(model context length, num_ctx); other providers use the reported context length (fallback 32k).
// - Compaction starts when the estimate exceeds 75 % of the window. The system prompt, the first user message (the
//   task) and the last 6 messages are never touched. Level 1 replaces older tool results with
//   "[gekürzt: <first 200 chars>]" (SPEC wording); level 2 shortens long assistant texts and long tool-call arguments
//   (e.g. write_file contents); level 3 drops the oldest complete tool turns (assistant + its results, keeping native
//   tool_call/tool pairs intact) and leaves one placeholder note. Each level only runs while still over the limit.
import type { ChatMessage, ChatToolSpec, ResolvedModel } from '../contracts';
import { TOOL_RESULT_MARK, isToolResultMessage } from './state';

export const CHARS_PER_TOKEN = 3.5;
export const COMPACT_AT_RATIO = 0.75;
export const KEEP_LAST_MESSAGES = 6;
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

export function shortened(text: string): string {
  return `${COMPACTED_PREFIX}${text.slice(0, SHORT_PREVIEW)}]`;
}

function isCompacted(text: string): boolean {
  return text.startsWith(COMPACTED_PREFIX);
}

function compactToolResult(m: ChatMessage): ChatMessage | null {
  if (m.role === 'tool') {
    if (isCompacted(m.content) || m.content.length <= SHORT_PREVIEW + 20) return null;
    return { ...m, content: shortened(m.content) };
  }
  if (m.role === 'user' && m.content.startsWith(TOOL_RESULT_MARK)) {
    const nl = m.content.indexOf('\n');
    const header = nl === -1 ? m.content : m.content.slice(0, nl);
    const body = nl === -1 ? '' : m.content.slice(nl + 1);
    if (isCompacted(body) || body.length <= SHORT_PREVIEW + 20) return null;
    return { role: 'user', content: `${header}\n${shortened(body)}` };
  }
  return null;
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

/** Compacts a conversation until it fits `limitTokens` (or nothing more can be done). Never mutates the input. */
export function compactMessages(
  input: ChatMessage[],
  opts: { limitTokens: number; keepLast?: number; tools?: ChatToolSpec[] },
): CompactionResult {
  const keepLast = opts.keepLast ?? KEEP_LAST_MESSAGES;
  const messages = input.map((m) => ({ ...m }) as ChatMessage);
  const before = estimateTokens(messages, opts.tools);
  let level = 0;
  const fits = () => estimateTokens(messages, opts.tools) <= opts.limitTokens;
  if (before <= opts.limitTokens) return { messages: input, changed: false, level, before, after: before };

  const start = protectedPrefix(messages);
  const olderEnd = () => Math.max(start, messages.length - keepLast);

  // Level 1: older tool results.
  for (let i = start; i < olderEnd(); i++) {
    const c = compactToolResult(messages[i]);
    if (c) {
      messages[i] = c;
      level = 1;
    }
  }
  // Level 2: older assistant texts and long tool-call arguments.
  if (!fits()) {
    for (let i = start; i < olderEnd(); i++) {
      const c = compactAssistant(messages[i]);
      if (c) {
        messages[i] = c;
        level = 2;
      }
    }
  }
  // Level 3: drop the oldest complete tool turns.
  if (!fits()) {
    let hasPlaceholder = messages.some((m) => m.role === 'user' && m.content === DROPPED_NOTE);
    while (!fits()) {
      const end = olderEnd();
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
      if (groupEnd > end) break; // the turn reaches into the protected tail
      messages.splice(groupStart, groupEnd - groupStart);
      level = 3;
      if (!hasPlaceholder) {
        messages.splice(groupStart, 0, { role: 'user', content: DROPPED_NOTE });
        hasPlaceholder = true;
      }
    }
  }
  const after = estimateTokens(messages, opts.tools);
  return { messages, changed: level > 0, level, before, after };
}
