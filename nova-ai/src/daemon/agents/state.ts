// Persisted conversation state of an agent run (agent_runs.state, or <dataDir>/run-state/<runId>.json when large).
// Key decisions:
// - The state holds everything needed to continue a run after pause, approval, NEEDS_INPUT, model blockers and
//   daemon restarts: the full message list (system prompt at index 0), the tool calls of the current assistant
//   message that are not executed yet (`queue`), `inFlight` (SPEC §6.4: saved before a non-readOnly tool executes,
//   cleared once its result is persisted), the pending approval / question and a snapshot of the task text so edits
//   made while paused can be told to the model.
// - Loaded states are validated with zod; a corrupt or foreign state is treated as missing (the runner then starts a
//   fresh run instead of crashing).
// - Two message formats exist: native tool calling (assistant.toolCalls + role 'tool' results) and the JSON protocol
//   for models without tool support (tool results are user messages starting with TOOL_RESULT_MARK). When the
//   answering model changes capability mid-run the history is converted (native → JSON is lossless enough; JSON →
//   native needs no conversion because plain text turns are valid for every provider).
import { z } from 'zod';
import { AgentRole, ModelRefSchema, type Task } from '@shared/schemas';
import type { ChatMessage, ChatToolCall } from '../contracts';

export const RUN_STATE_VERSION = 1;

/** Prefix of JSON-protocol tool results (user messages). Also used by context compaction to find tool results. */
export const TOOL_RESULT_MARK = '[tool result: ';

const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

const ChatMessageSchema = z.discriminatedUnion('role', [
  z.object({ role: z.literal('system'), content: z.string() }),
  z.object({ role: z.literal('user'), content: z.string() }),
  z.object({ role: z.literal('assistant'), content: z.string(), toolCalls: z.array(ToolCallSchema).optional() }),
  z.object({ role: z.literal('tool'), toolCallId: z.string(), name: z.string(), content: z.string() }),
]);

export const TaskSnapshotSchema = z.object({
  title: z.string(),
  description: z.string(),
  acceptance: z.string().nullable(),
  role: AgentRole,
});
export type TaskSnapshot = z.infer<typeof TaskSnapshotSchema>;

export const InFlightSchema = z.object({
  toolCallId: z.string(),
  name: z.string(),
  args: z.record(z.string(), z.unknown()),
  readOnly: z.boolean(),
  startedAt: z.number(),
});
export type InFlight = z.infer<typeof InFlightSchema>;

export const PendingSchema = z.discriminatedUnion('kind', [
  /** A tool returned approval_required; the call stays at the head of `queue` and is executed again on resume. */
  z.object({ kind: z.literal('tool'), toolCallId: z.string(), approvalId: z.string() }),
  /** models.chat threw APPROVAL_REQUIRED (e.g. sensitive_data for a cloud provider); the model call repeats on resume. */
  z.object({ kind: z.literal('model'), approvalId: z.string() }),
  /** ask_user returned needs_input; the answer arrives as a user note. */
  z.object({ kind: z.literal('input'), toolCallId: z.string(), noteId: z.string() }),
]);
export type Pending = z.infer<typeof PendingSchema>;

export const RunStateSchema = z.object({
  version: z.literal(RUN_STATE_VERSION),
  role: AgentRole,
  mode: z.enum(['native', 'json']),
  messages: z.array(ChatMessageSchema),
  taskSnapshot: TaskSnapshotSchema,
  inFlight: InFlightSchema.nullable(),
  pending: PendingSchema.nullable(),
  /** Tool calls of the latest assistant message that still have to be executed (head = next). */
  queue: z.array(ToolCallSchema),
  /** Model that answered last (preferred for the next call so the conversation stays with one model). */
  model: ModelRefSchema.nullable(),
  counters: z.object({
    /** Consecutive unparseable JSON-protocol answers. */
    badOutput: z.number().int(),
    /** Consecutive text-only answers in native mode (reminders sent). */
    textReminders: z.number().int(),
    /** Invalid finish-tool calls. */
    finishRetries: z.number().int(),
  }),
  /** Tools that actually executed in this run (honesty gates of the role modules). */
  toolsUsed: z.array(z.string()),
  /** run.stepCount when the current step budget started (a resumed AGENT_STEP_LIMIT run gets a new budget). */
  stepBudgetStart: z.number().int(),
  /** Counter for generated tool call ids. */
  callSeq: z.number().int(),
  compactions: z.number().int(),
});
export type RunState = z.infer<typeof RunStateSchema>;

export function snapshotOf(task: Task, role: AgentRole): TaskSnapshot {
  return { title: task.title, description: task.description, acceptance: task.acceptance ?? null, role };
}

export function freshState(task: Task, role: AgentRole): RunState {
  return {
    version: RUN_STATE_VERSION,
    role,
    mode: 'native',
    messages: [],
    taskSnapshot: snapshotOf(task, role),
    inFlight: null,
    pending: null,
    queue: [],
    model: null,
    counters: { badOutput: 0, textReminders: 0, finishRetries: 0 },
    toolsUsed: [],
    stepBudgetStart: 0,
    callSeq: 0,
    compactions: 0,
  };
}

/** Validates a loaded state; null when missing, from another version or corrupt. */
export function parseRunState(raw: unknown): RunState | null {
  if (raw === null || raw === undefined) return null;
  const parsed = RunStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function formatJsonToolResult(name: string, content: string, isError: boolean): string {
  return `${TOOL_RESULT_MARK}${name}${isError ? ' – ERROR' : ''}]\n${content}`;
}

export function isToolResultMessage(m: ChatMessage): boolean {
  return m.role === 'tool' || (m.role === 'user' && m.content.startsWith(TOOL_RESULT_MARK));
}

/** One JSON-protocol line for a tool call (also used when converting native history). */
export function toolCallAsJson(call: Pick<ChatToolCall, 'name' | 'arguments'>): string {
  return JSON.stringify({ tool: call.name, arguments: call.arguments });
}

/**
 * Converts a native tool-calling history into the JSON-protocol format: assistant tool calls become JSON text,
 * tool results become marked user messages. JSON → native needs no conversion (text turns are valid everywhere).
 */
export function convertMessages(messages: ChatMessage[], to: 'native' | 'json'): ChatMessage[] {
  if (to === 'native') return messages.map((m) => ({ ...m }));
  return messages.map((m): ChatMessage => {
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const calls = m.toolCalls.map((c) => toolCallAsJson(c)).join('\n');
      return { role: 'assistant', content: m.content.trim() ? `${m.content.trim()}\n${calls}` : calls };
    }
    if (m.role === 'tool') {
      const isError = /^error:/i.test(m.content);
      return { role: 'user', content: formatJsonToolResult(m.name, m.content, isError) };
    }
    return { ...m };
  });
}
