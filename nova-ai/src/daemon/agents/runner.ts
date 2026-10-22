// AgentRunner: the agent loop (SPEC §4.4 + §6.4). One RunExecution per run()/resume.
// Key decisions:
// - Loop per step: abort check → pause check → mode switch → task-edit message + user notes → step limit → context
//   compaction (prompt budget = window − output reserve, see context-window.ts) → persist → models.chat (retries
//   1 s / 4 s / 10 s or Retry-After for retryable provider errors) → parse tool calls (native, or the JSON protocol for
//   models without tool support) → execute the calls sequentially → persist after every call. A "step" is one model
//   call (run.stepCount, maxStepsPerRun).
// - Context: tool results are capped to a quarter of the prompt budget; the token estimate is corrected upwards with
//   the input tokens the provider reports (never below chars / 3.5, at most ×2). If even the compacted conversation
//   does not fit, the request is still sent and the activity log says so once (window too small for NOVA's prompt).
// - Native tool calling when ResolvedModel.supportsTools, else the JSON protocol (tools + JSON schemas listed in the
//   system prompt, json:true, first balanced JSON object, correction message, 3 consecutive failures → failed
//   AGENT_BAD_OUTPUT). Native text answers get up to 3 reminders; a JSON tool call written as plain text in native
//   mode is accepted (broken Ollama tool templates do that). If the answering model changes capability (fallback),
//   the history is converted and the mode switches at the next step boundary.
// - Tool calls outside role.toolNames (plus the finish tool) are rejected back to the model. Arguments are validated
//   with the tool's zod schema before describe()/execute; validation errors go back to the model as tool errors.
// - Repetition: the same call (tool + arguments after validation) with the same result counted within the last 12
//   completed calls; a successful call that changed files forgets the other calls (the project changed, re-reading
//   is legitimate). From the 3rd repetition on the tool result carries a note to the model, at the 5th the run stops
//   blocked AGENT_LOOP with a German explanation (not resumable – a restart or another model is needed).
// - inFlight is set before every tool execution and persisted BEFORE non-readOnly tools; it is cleared when the
//   result is persisted. Abort with reason NovaError INTERRUPTED keeps inFlight (resume: readOnly → run again,
//   otherwise the "Interrupted by a restart …" tool result + an error step); any other abort reason → cancelled.
// - approval_required → waiting_approval (the call stays at the head of the queue and is executed again on resume);
//   needs_input → blocked NEEDS_INPUT; models APPROVAL_REQUIRED → waiting_approval and the model call repeats.
//   NO_MODEL, VRAM_INSUFFICIENT, BUDGET_EXCEEDED, PAID_NOT_APPROVED, PRICE_UNKNOWN, MODEL_UNAVAILABLE, PROVIDER_AUTH,
//   APPROVAL_DENIED (cloud data denied for this task) → blocked (state saved); OLLAMA_UNREACHABLE after retries →
//   blocked; other retryable errors after retries → failed. models.resolve gets the task id, so it fails the same way
//   as models.chat (e.g. on a denied cloud-data approval).
// - Finish tool → role.parseOutput (+ optional checkFinish honesty gate of the built-in roles); up to 2 correction
//   retries, then failed AGENT_BAD_OUTPUT.
// - Resume: role changed / state missing → fresh run (old run marked cancelled); edited task → message to the model +
//   rebuilt system prompt; unconsumed user notes → "Note from the user: …" at every step boundary, then consumed.
// - The runner never writes the tasks table (only task notes consumption via TaskService). activeMs counts only the
//   time this process actually executed the run.
import { createHash } from 'node:crypto';
import { RESUMABLE_BLOCKER_CODES } from '@shared/errors';
import type { AgentRole, AgentRun, AgentRunStatus, AgentStepKind, MemoryEntry, TaskNote } from '@shared/schemas';
import type {
  AgentOutput,
  AgentRoleModule,
  AgentRunInput,
  AgentRunOutcome,
  AgentRunner,
  AgentTool,
  ChatMessage,
  ChatToolCall,
  ChatToolSpec,
  ModelChatResult,
  ResolvedModel,
  Services,
  ToolContext,
  ToolResult,
} from '../contracts';
import type { Logger } from '../core/logger';
import { conflict, errorMessage, isAbortError, isNovaError, validation } from '../core/errors';
import { redactString } from '../core/redact';
import { sleep as coreSleep } from '../core/time';
import { builtinRoles } from './roles';
import { finishToolSpec, formatIssues, type NovaRoleModule } from './roles/common';
import {
  KEEP_LAST_MESSAGES,
  TOOL_RESULT_MAX_CHARS,
  capToolResult,
  compactMessages,
  contextWindow,
  estimateTokens,
  promptBudget,
  toolResultMaxChars,
} from './context-window';
import { findFirstJsonObject, interpretToolCall, normalizeToolName, parseJsonToolCall } from './json-protocol';
import { convertMessages, formatJsonToolResult, freshState, parseRunState, snapshotOf, type RunState, type TaskSnapshot } from './state';

export const DEFAULT_RETRY_DELAYS_MS = [1000, 4000, 10000];
const MAX_RETRY_AFTER_MS = 120_000;
const MAX_BAD_OUTPUT = 3;
const MAX_TEXT_REMINDERS = 3;
const MAX_FINISH_RETRIES = 2;
/** Same call + same result: note to the model from this count on, stop (AGENT_LOOP) at LOOP_STOP_AT. */
const LOOP_HINT_AT = 3;
const LOOP_STOP_AT = 5;
/** Completed tool calls considered for the repetition count. */
const LOOP_WINDOW = 12;
/** Reported input tokens only calibrate the estimate for prompts of at least this size (estimated tokens). */
const CALIBRATE_MIN_TOKENS = 1000;
const MAX_TOKEN_FACTOR = 2;
export const INTERRUPTED_TOOL_TEXT = 'Interrupted by a restart; the action may be partially done. Inspect the current state before continuing.';
const TRUNCATED_HINT =
  'Your answer was cut off because it was too long. Keep each answer short: write big files in smaller parts (create the file with write_file, then add the rest with edit_file).';

/** Model errors that block the run (state kept, resumable by the work cycle where the code is resumable). */
const BLOCKING_MODEL_CODES = new Set([
  'NO_MODEL',
  'VRAM_INSUFFICIENT',
  'BUDGET_EXCEEDED',
  'PAID_NOT_APPROVED',
  'PRICE_UNKNOWN',
  'MODEL_UNAVAILABLE',
  'PROVIDER_AUTH',
  'RESOURCE_LIMIT',
  'DISK_FULL',
  'APPROVAL_DENIED',
]);
const RETRYABLE_MODEL_CODES = new Set(['PROVIDER_ERROR', 'PROVIDER_RATE_LIMIT', 'OLLAMA_UNREACHABLE']);
const BLOCK_AFTER_RETRIES = new Set(['OLLAMA_UNREACHABLE']);
const TERMINAL: AgentRunStatus[] = ['done', 'failed', 'cancelled'];

const STATUS_LABEL: Record<AgentRunStatus, string> = {
  running: 'lief noch',
  paused: 'pausiert',
  waiting_approval: 'wartete auf Freigabe',
  done: 'abgeschlossen',
  failed: 'fehlgeschlagen',
  cancelled: 'abgebrochen',
  interrupted: 'unterbrochen',
  blocked: 'blockiert',
};

export interface AgentRunnerOptions {
  /** Backoff before retry 1..n of a retryable model error (default 1 s, 4 s, 10 s). */
  retryDelaysMs?: number[];
  /** Sleep used for backoff (must reject when the signal aborts). Tests inject a fast one. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** Platform told to the model (default core.platform). */
  platform?: NodeJS.Platform;
  /** Role modules registered at creation (default: the 4 built-in roles). */
  roles?: AgentRoleModule[];
}

interface Env {
  s: Services;
  log: Logger;
  delays: number[];
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  platform: NodeJS.Platform;
}

type ModelCall = { result: ModelChatResult; outcome?: undefined } | { result?: undefined; outcome: AgentRunOutcome };

/** True when an abort reason means "daemon shutdown" (state kept for resume). */
export function isInterruptReason(reason: unknown): boolean {
  return !!reason && typeof reason === 'object' && (reason as { code?: unknown }).code === 'INTERRUPTED';
}

function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function excerpt(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

function firstLine(text: string, max: number): string {
  const line = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? '';
  return oneLine(line, max);
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

function fmtSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;
}

/** JSON with sorted object keys (argument comparison independent of key order). */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function detailsOf(e: unknown): Record<string, unknown> | null {
  if (!isNovaError(e)) return null;
  const d = e.details;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function summaryOf(output: AgentOutput): string {
  switch (output.role) {
    case 'planner':
      return output.plan.summary;
    case 'coder':
      return output.result.summary;
    case 'tester':
      return output.result.summary;
    case 'reviewer':
      return output.review.summary;
  }
}

function editMessage(before: TaskSnapshot, task: AgentRunInput['task']): string {
  const changed: string[] = [];
  if (before.title !== task.title) changed.push('title');
  if (before.description !== task.description) changed.push('description');
  if ((before.acceptance ?? null) !== (task.acceptance ?? null)) changed.push('acceptance criteria');
  return [
    'The user edited this task while it was paused. New version of the task:',
    `Title: ${task.title}`,
    `Description: ${task.description.trim() || '(none)'}`,
    `Acceptance criteria: ${task.acceptance?.trim() || '(none)'}`,
    `Changed: ${changed.join(', ')}. Continue with the updated task; earlier instructions that conflict with it no longer apply.`,
  ].join('\n');
}

class RunExecution {
  private run: AgentRun;
  private state: RunState;
  private readonly segmentStart: number;
  private readonly baseActiveMs: number;
  private resolved: ResolvedModel | null = null;
  private specsCache: ChatToolSpec[] | null = null;
  private memoryCache: { query: string; entries: MemoryEntry[] } | null = null;
  private nextMode: 'native' | 'json' | null = null;
  /** The latest model answer hit the output token limit (arguments may be cut off). */
  private lastTruncated = false;
  private readonly injectedNotes = new Set<string>();
  private readonly finishName: string;
  /** Correction of the chars / 3.5 estimate from reported input tokens (≥ 1, only grows). */
  private tokenFactor = 1;
  /** Estimated tokens of the request currently sent to the model. */
  private sentEstimate = 0;
  /** The "window too small" note was already added to the activity log in this execution. */
  private contextWarned = false;
  /** Fingerprints (tool, arguments, result) of the latest completed tool calls, oldest first. */
  private recentCalls: string[] = [];

  constructor(
    private readonly env: Env,
    private readonly input: AgentRunInput,
    private readonly role: NovaRoleModule,
    run: AgentRun,
    state: RunState,
    private readonly resumed: boolean,
  ) {
    this.run = run;
    this.state = state;
    this.segmentStart = env.s.core.clock.now();
    this.baseActiveMs = run.activeMs;
    this.finishName = role.finishTool.name;
  }

  async execute(): Promise<AgentRunOutcome> {
    try {
      return await this.main();
    } catch (e) {
      return this.unexpected(e);
    }
  }

  // ------------------------------------------------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------------------------------------------------

  private async main(): Promise<AgentRunOutcome> {
    if (this.aborted()) return this.abortOutcome();
    const resolveOutcome = await this.resolveModel();
    if (resolveOutcome) return resolveOutcome;
    if (this.resumed) {
      const o = await this.continueAfterResume();
      if (o) return o;
    }
    for (;;) {
      if (this.aborted()) return this.abortOutcome();
      if (this.input.pauseRequested()) return this.pausedOutcome();
      this.applyModeSwitch();
      this.injectUserUpdates();
      const limit = this.stepLimitOutcome();
      if (limit) return limit;
      this.compactIfNeeded();
      this.persist();
      const call = await this.callModel();
      if (call.outcome) return call.outcome;
      const o = await this.handleResponse(call.result);
      if (o) return o;
    }
  }

  private async resolveModel(): Promise<AgentRunOutcome | null> {
    const { s } = this.env;
    const preferred =
      this.state.model ?? (this.run.providerId && this.run.modelId ? { providerId: this.run.providerId, modelId: this.run.modelId } : null);
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await s.models.resolve(this.run.role, { projectId: this.input.project.id, preferred, taskId: this.input.task.id, runId: this.run.id });
        this.resolved = r;
        this.state.model = r.ref;
        this.setMode(r.supportsTools ? 'native' : 'json');
        this.ensureConversation();
        this.updateRun({ providerId: r.ref.providerId, modelId: r.ref.modelId });
        this.step(
          'status',
          `Modell: ${r.ref.modelId} (${r.local ? 'lokal' : 'Cloud'}${r.paid ? ', kostenpflichtig' : ''}, ${r.supportsTools ? 'mit Werkzeugaufrufen' : 'über JSON-Anweisungen'})`,
          { providerId: r.ref.providerId, modelId: r.ref.modelId, contextLength: r.contextLength, supportsTools: r.supportsTools },
        );
        this.persist();
        return null;
      } catch (e) {
        if (this.aborted()) return this.abortOutcome();
        const handled = await this.handleModelError(e, attempt, 'resolve');
        if (handled === 'retry') continue;
        return handled;
      }
    }
  }

  /** Finishes what was interrupted or waiting when the run stopped (interrupted tool, approval, queued calls). */
  private async continueAfterResume(): Promise<AgentRunOutcome | null> {
    const f = this.state.inFlight;
    if (f) {
      if (f.readOnly) {
        if (!this.state.queue.some((c) => c.id === f.toolCallId)) this.state.queue.unshift({ id: f.toolCallId, name: f.name, arguments: f.args });
        this.step('status', `Unterbrochene Leseaktion wird wiederholt (${f.name}).`, { tool: f.name });
      } else {
        const call: ChatToolCall = { id: f.toolCallId, name: f.name, arguments: f.args };
        this.completeCall(call, INTERRUPTED_TOOL_TEXT, true);
        this.step('error', `Die Aktion „${f.name}“ wurde durch einen Neustart unterbrochen und wird nicht wiederholt. Der Agent prüft zuerst den aktuellen Stand.`, {
          tool: f.name,
          args: f.args,
          startedAt: f.startedAt,
        });
      }
      this.state.inFlight = null;
    }
    this.state.pending = null;
    this.persist();
    return this.runQueue();
  }

  private stepLimitOutcome(): AgentRunOutcome | null {
    const max = this.env.s.core.settings.get().agents.maxStepsPerRun;
    if (this.run.stepCount - this.state.stepBudgetStart >= max) {
      return this.blockedOutcome(
        'AGENT_STEP_LIMIT',
        `Der Agent hat die Höchstzahl von ${max} Schritten erreicht, ohne die Aufgabe abzuschließen. Die Aufgabe ist vermutlich zu groß – bitte aufteilen oder erneut starten.`,
      );
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------------------------
  // Model calls
  // ------------------------------------------------------------------------------------------------------------

  private async callModel(): Promise<ModelCall> {
    const { s } = this.env;
    for (let attempt = 0; ; attempt++) {
      if (this.aborted()) return { outcome: this.abortOutcome() };
      this.updateRun({ lastAction: `Wartet auf eine Antwort von ${this.state.model?.modelId ?? 'dem Modell'}` });
      const tools = this.state.mode === 'native' ? this.specs() : undefined;
      this.sentEstimate = estimateTokens(this.state.messages, tools);
      try {
        const result = await s.models.chat({
          role: this.run.role,
          projectId: this.input.project.id,
          taskId: this.input.task.id,
          runId: this.run.id,
          messages: this.state.messages.slice(),
          tools,
          json: this.state.mode === 'json' ? true : undefined,
          signal: this.input.signal,
          preferred: this.state.model,
        });
        return { result };
      } catch (e) {
        if (this.aborted()) return { outcome: this.abortOutcome() };
        const handled = await this.handleModelError(e, attempt, 'chat');
        if (handled === 'retry') continue;
        return { outcome: handled };
      }
    }
  }

  private async handleModelError(e: unknown, attempt: number, phase: 'resolve' | 'chat'): Promise<'retry' | AgentRunOutcome> {
    const code = isNovaError(e) ? String(e.code) : null;
    const message = redactString(errorMessage(e));
    const details = detailsOf(e);
    if (code === 'APPROVAL_REQUIRED') {
      const approvalId = typeof details?.approvalId === 'string' ? details.approvalId : null;
      if (approvalId) {
        this.state.pending = { kind: 'model', approvalId };
        this.step('approval', `Freigabe erforderlich: ${oneLine(message, 300)}`, { approvalId });
        return this.waitingOutcome(approvalId, `Wartet auf Freigabe: ${oneLine(message, 200)}`);
      }
      return this.blockedOutcome('APPROVAL_REQUIRED', message);
    }
    if (code && BLOCKING_MODEL_CODES.has(code)) return this.blockedOutcome(code, message);
    const timeout = !code ? isAbortError(e) : code === 'CANCELLED';
    const retryable = (code !== null && RETRYABLE_MODEL_CODES.has(code)) || timeout;
    const shownMessage = timeout ? 'Das Modell hat nicht rechtzeitig geantwortet.' : message;
    if (retryable && attempt < this.env.delays.length) {
      const retryAfter = typeof details?.retryAfterMs === 'number' && Number.isFinite(details.retryAfterMs) ? details.retryAfterMs : null;
      const wait = retryAfter !== null ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, retryAfter)) : this.env.delays[attempt];
      const what = phase === 'resolve' ? 'Modellauswahl' : 'Modellaufruf';
      this.step('error', `${what} fehlgeschlagen: ${oneLine(shownMessage, 300)} Neuer Versuch ${attempt + 1} von ${this.env.delays.length} in ${fmtSeconds(wait)}.`, {
        code: code ?? 'TIMEOUT',
        attempt: attempt + 1,
        waitMs: wait,
      });
      this.updateRun({ lastAction: `Wartet auf einen neuen Modellversuch (${attempt + 1}/${this.env.delays.length})` });
      const stop = await this.waitInterruptible(wait);
      if (stop) return stop;
      return 'retry';
    }
    if (retryable) {
      const finalCode = timeout ? 'PROVIDER_ERROR' : (code as string);
      const reason = `${shownMessage} (auch nach ${this.env.delays.length} Wiederholungen)`;
      if (BLOCK_AFTER_RETRIES.has(finalCode)) return this.blockedOutcome(finalCode, reason);
      return this.failedOutcome(finalCode, reason);
    }
    if (code) return this.failedOutcome(code, message);
    this.env.log.error('Unerwarteter Fehler beim Modellaufruf', { runId: this.run.id, error: message });
    return this.failedOutcome('INTERNAL', `Unerwarteter Fehler beim Modellaufruf: ${oneLine(message, 500)}`);
  }

  /** Waits in ≤ 1 s slices so abort and pause stay responsive. */
  private async waitInterruptible(ms: number): Promise<AgentRunOutcome | null> {
    let remaining = ms;
    while (remaining > 0) {
      const slice = Math.min(remaining, 1000);
      try {
        await this.env.sleep(slice, this.input.signal);
      } catch {
        /* aborted – handled below */
      }
      remaining -= slice;
      if (this.aborted()) return this.abortOutcome();
      if (this.input.pauseRequested()) return this.pausedOutcome();
    }
    return null;
  }

  private async handleResponse(result: ModelChatResult): Promise<AgentRunOutcome | null> {
    const requestedMode = this.state.mode;
    this.lastTruncated = result.finishReason === 'length' || result.finishReason === 'max_tokens';
    this.calibrate(result.usage);
    this.resolved = result.resolved;
    this.state.model = result.resolved.ref;
    this.updateRun({
      stepCount: this.run.stepCount + 1,
      inputTokens: this.run.inputTokens + Math.max(0, result.usage.inputTokens),
      outputTokens: this.run.outputTokens + Math.max(0, result.usage.outputTokens),
      providerId: result.resolved.ref.providerId,
      modelId: result.resolved.ref.modelId,
    });
    const desired = result.resolved.supportsTools ? 'native' : 'json';
    if (desired !== requestedMode) this.nextMode = desired;

    const content = typeof result.content === 'string' ? result.content : '';
    let calls: ChatToolCall[] | null = null;
    let assistant: ChatMessage;
    let problem: string | null = null;
    if (requestedMode === 'native') {
      if (result.toolCalls.length > 0) {
        calls = this.normalizeCalls(result.toolCalls);
        assistant = { role: 'assistant', content, toolCalls: calls };
      } else {
        const fromText = this.toolCallFromText(content);
        if (fromText) {
          calls = [fromText];
          assistant = { role: 'assistant', content: '', toolCalls: calls };
        } else {
          assistant = { role: 'assistant', content: content.trim() || '(no tool call)' };
        }
      }
    } else {
      assistant = { role: 'assistant', content: content.trim() || '(empty answer)' };
      const parsed = parseJsonToolCall(content);
      if (parsed.ok) calls = [{ id: this.nextCallId(), name: parsed.name, arguments: parsed.arguments }];
      else problem = parsed.reason;
    }

    const callText = calls ? `${calls.length} Werkzeugaufruf${calls.length === 1 ? '' : 'e'}` : 'Antwort ohne Werkzeugaufruf';
    this.step(
      'model_call',
      `Modell ${result.resolved.ref.modelId}: ${callText} · ${fmtInt(result.usage.inputTokens)} Eingabe- / ${fmtInt(result.usage.outputTokens)} Ausgabe-Tokens${result.usage.usageReported ? '' : ' (geschätzt)'}`,
      {
        providerId: result.resolved.ref.providerId,
        modelId: result.resolved.ref.modelId,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        usageReported: result.usage.usageReported,
        durationMs: result.durationMs,
        finishReason: result.finishReason,
        content: excerpt(content, 1500),
        toolCalls: calls?.map((c) => ({ name: c.name, arguments: c.arguments })) ?? [],
      },
    );
    this.state.messages.push(assistant);
    if (!calls) return this.badAnswer(result, requestedMode, problem);
    this.state.counters.badOutput = 0;
    this.state.counters.textReminders = 0;
    this.state.queue = calls;
    this.persist();
    return this.runQueue();
  }

  private badAnswer(result: ModelChatResult, mode: 'native' | 'json', problem: string | null): AgentRunOutcome | null {
    const truncated = this.lastTruncated;
    if (mode === 'json') {
      this.state.counters.badOutput++;
      const n = this.state.counters.badOutput;
      if (n >= MAX_BAD_OUTPUT) {
        return this.failedOutcome('AGENT_BAD_OUTPUT', `Das Modell hat ${MAX_BAD_OUTPUT}-mal hintereinander keine gültige Werkzeug-Anweisung geliefert. Ein anderes Modell könnte besser geeignet sein.`, {
          problem,
        });
      }
      const msg = truncated
        ? TRUNCATED_HINT
        : `Your last answer was not a valid tool call (${problem ?? 'unknown problem'}). Answer with exactly one JSON object and nothing else, for example:\n{"tool": "list_files", "arguments": {"path": "."}}\nWhen the task is complete, answer with {"tool": "${this.finishName}", "arguments": {...}}.`;
      this.state.messages.push({ role: 'user', content: msg });
      this.step('error', `Die Antwort des Modells war keine gültige Werkzeug-Anweisung – Korrektur gesendet (${n} von ${MAX_BAD_OUTPUT - 1}).`, {
        problem,
        content: excerpt(result.content ?? '', 1000),
      });
    } else {
      if (this.state.counters.textReminders >= MAX_TEXT_REMINDERS) {
        return this.failedOutcome(
          'AGENT_BAD_OUTPUT',
          `Das Modell hat wiederholt ohne Werkzeugaufruf geantwortet, obwohl es ${MAX_TEXT_REMINDERS}-mal daran erinnert wurde. Ein anderes Modell könnte besser geeignet sein.`,
        );
      }
      this.state.counters.textReminders++;
      const n = this.state.counters.textReminders;
      const msg = truncated
        ? TRUNCATED_HINT
        : `You answered without calling a tool. Every action must be a tool call. If the task is complete, call ${this.finishName} now with all required fields. If you are blocked, call ${this.finishName} and explain why.`;
      this.state.messages.push({ role: 'user', content: msg });
      this.step('error', `Das Modell hat ohne Werkzeugaufruf geantwortet – Erinnerung gesendet (${n} von ${MAX_TEXT_REMINDERS}).`, {
        content: excerpt(result.content ?? '', 1000),
      });
    }
    this.persist();
    return null;
  }

  private toolCallFromText(content: string): ChatToolCall | null {
    if (!content.includes('{')) return null;
    const obj = findFirstJsonObject(content);
    if (!obj) return null;
    const parsed = interpretToolCall(obj);
    if (!parsed.ok) return null;
    if (parsed.name !== this.finishName && !this.role.toolNames.includes(parsed.name)) return null;
    return { id: this.nextCallId(), name: parsed.name, arguments: parsed.arguments };
  }

  private normalizeCalls(raw: ChatToolCall[]): ChatToolCall[] {
    const seen = new Set<string>();
    return raw.map((c) => {
      let id = typeof c.id === 'string' ? c.id.trim() : '';
      if (!id || seen.has(id)) id = this.nextCallId();
      seen.add(id);
      let args: unknown = c.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      return { id, name: normalizeToolName(typeof c.name === 'string' ? c.name : ''), arguments: isPlainObject(args) ? args : {} };
    });
  }

  private nextCallId(): string {
    this.state.callSeq += 1;
    return `call_${this.run.id.slice(-6)}_${this.state.callSeq}`;
  }

  // ------------------------------------------------------------------------------------------------------------
  // Tool execution
  // ------------------------------------------------------------------------------------------------------------

  private async runQueue(): Promise<AgentRunOutcome | null> {
    while (this.state.queue.length > 0) {
      if (this.aborted()) return this.abortOutcome();
      const o = await this.executeCall(this.state.queue[0]);
      if (o) return o;
    }
    return null;
  }

  private async executeCall(call: ChatToolCall): Promise<AgentRunOutcome | null> {
    const { s } = this.env;
    if (call.name === this.finishName) return this.handleFinish(call);
    if (!call.name || !this.role.toolNames.includes(call.name)) {
      const content = `Error: the tool "${call.name}" is not available for your role. Available tools: ${[...this.role.toolNames, this.finishName].join(', ')}.`;
      const n = this.trackRepeat(call.name, call.arguments, content, true, false);
      this.completeCall(call, content, true, this.loopNote(call.name, n));
      this.step('error', `Das Modell wollte ein Werkzeug verwenden, das für diese Rolle nicht erlaubt ist: ${call.name || '(ohne Namen)'}`, { tool: call.name });
      return this.loopOutcome(`nicht erlaubtes Werkzeug ${call.name || '(ohne Namen)'}`, n);
    }
    const tool = s.tools.get(call.name);
    if (!tool) {
      const content = `Error: the tool "${call.name}" is not available right now. Use another tool.`;
      const n = this.trackRepeat(call.name, call.arguments, content, true, false);
      this.completeCall(call, content, true, this.loopNote(call.name, n));
      this.step('error', `Das Werkzeug „${call.name}“ ist nicht verfügbar.`, { tool: call.name });
      return this.loopOutcome(`nicht verfügbares Werkzeug ${call.name}`, n);
    }
    const parsed = tool.schema.safeParse(call.arguments);
    if (!parsed.success) {
      const hint = this.lastTruncated ? `\n${TRUNCATED_HINT}` : '';
      const content = `Error: invalid arguments for ${call.name}: ${formatIssues(parsed.error)}. Check the argument names and types and call the tool again.${hint}`;
      const n = this.trackRepeat(call.name, call.arguments, content, true, false);
      this.completeCall(call, content, true, this.loopNote(call.name, n));
      this.step('error', `Ungültige Angaben für das Werkzeug ${call.name} – Hinweis an das Modell gesendet.`, { tool: call.name, args: call.arguments });
      return this.loopOutcome(`ungültiger Aufruf von ${call.name}`, n);
    }
    const description = this.describe(tool, parsed.data, call.name);
    this.updateRun({ lastAction: description });
    this.step('tool_call', description, { tool: call.name, args: call.arguments });
    this.state.inFlight = { toolCallId: call.id, name: call.name, args: call.arguments, readOnly: tool.readOnly, startedAt: this.env.s.core.clock.now() };
    if (!tool.readOnly) this.persist();

    let result: ToolResult;
    try {
      result = await s.tools.execute(call.name, call.arguments, this.toolContext());
    } catch (e) {
      if (this.aborted()) return this.abortOutcome();
      result = { status: 'error', content: redactString(errorMessage(e)), code: isNovaError(e) ? String(e.code) : undefined };
    }
    if (this.aborted()) return this.abortOutcome();

    switch (result.status) {
      case 'approval_required': {
        this.state.inFlight = null;
        this.state.pending = { kind: 'tool', toolCallId: call.id, approvalId: result.approvalId };
        this.step('approval', `Freigabe erforderlich: ${description}`, { approvalId: result.approvalId, details: excerpt(result.content, 1500) });
        return this.waitingOutcome(result.approvalId, `Wartet auf Freigabe: ${description}`);
      }
      case 'needs_input': {
        this.markUsed(call.name);
        const q = call.arguments.question;
        const question = typeof q === 'string' && q.trim() ? q.trim() : result.content;
        this.completeCall(call, `${result.content}\nThe question was sent to the user. The run pauses now; the answer will arrive as a note from the user.`, false);
        this.state.pending = { kind: 'input', toolCallId: call.id, noteId: result.noteId };
        this.step('message', `Rückfrage an den Benutzer: ${oneLine(question, 300)}`, { noteId: result.noteId });
        return this.blockedOutcome('NEEDS_INPUT', `Wartet auf eine Antwort des Benutzers: ${oneLine(question, 300)}`, false);
      }
      case 'ok': {
        this.markUsed(call.name);
        const files = result.filesChanged ?? [];
        if (files.length > 0) this.addFiles(files);
        const n = this.trackRepeat(call.name, parsed.data, result.content, false, files.length > 0);
        this.completeCall(call, result.content, false, this.loopNote(call.name, n));
        this.step('tool_result', `${description} – erledigt`, { content: excerpt(result.content, 1500), filesChanged: result.filesChanged ?? [] });
        return this.loopOutcome(description, n);
      }
      default: {
        this.markUsed(call.name);
        const content = result.status === 'error' ? result.content : String((result as { content?: unknown }).content ?? '');
        const n = this.trackRepeat(call.name, parsed.data, content, true, false);
        this.completeCall(call, `Error: ${content}`, true, this.loopNote(call.name, n));
        this.step('tool_result', `${description} – fehlgeschlagen: ${firstLine(content, 200)}`, {
          content: excerpt(content, 1500),
          code: result.status === 'error' ? (result.code ?? null) : null,
        });
        return this.loopOutcome(description, n);
      }
    }
  }

  private handleFinish(call: ChatToolCall): AgentRunOutcome | null {
    let output: AgentOutput | null = null;
    let problem: string | null = null;
    try {
      output = this.role.parseOutput(call.arguments);
      problem = this.role.checkFinish?.(output, { toolsUsed: [...this.state.toolsUsed] }) ?? null;
    } catch (e) {
      problem = errorMessage(e) || 'invalid data';
    }
    if (problem !== null || output === null) {
      this.state.counters.finishRetries++;
      const n = this.state.counters.finishRetries;
      if (n > MAX_FINISH_RETRIES) {
        this.completeCall(call, `Error: ${problem}`, true);
        return this.failedOutcome('AGENT_BAD_OUTPUT', `Das Modell hat ${MAX_FINISH_RETRIES + 1}-mal ungültige Abschlussdaten geliefert (${this.finishName}).`, {
          problem,
        });
      }
      this.completeCall(call, `Error: the data for ${this.finishName} is not valid: ${problem}\nFix this and call ${this.finishName} again.`, true);
      this.step('error', `Die Abschlussdaten waren ungültig – Korrektur angefordert (${n} von ${MAX_FINISH_RETRIES}).`, { problem, args: call.arguments });
      return null;
    }
    this.completeCall(call, 'Finished. The result was handed over to NOVA.', false);
    this.state.queue = [];
    this.state.pending = null;
    const summary = summaryOf(output);
    this.step('message', `Ergebnis: ${oneLine(summary, 400)}`, output);
    return this.doneOutcome(output, summary);
  }

  /**
   * Records a completed tool call and returns how often exactly this call (tool + arguments) with exactly this result
   * occurs among the latest LOOP_WINDOW calls. A successful call that changed files forgets the other calls.
   */
  private trackRepeat(name: string, args: unknown, content: string, isError: boolean, changedFiles: boolean): number {
    const key = createHash('sha256').update(`${name}\u0000${stableJson(args)}\u0000${isError ? 'error' : 'ok'}\u0000${content}`).digest('hex');
    if (changedFiles) this.recentCalls = this.recentCalls.filter((k) => k === key);
    this.recentCalls.push(key);
    if (this.recentCalls.length > LOOP_WINDOW) this.recentCalls.shift();
    return this.recentCalls.filter((k) => k === key).length;
  }

  /** Note appended to the tool result for the model while the repetition is below the stop threshold. */
  private loopNote(name: string, n: number): string | undefined {
    if (n < LOOP_HINT_AT || n >= LOOP_STOP_AT) return undefined;
    return `\n\n[NOVA: You have now made exactly this call (${name || 'this tool'} with the same arguments) ${n} times and got the same result every time. Repeating it will not change anything. Use the result you already have, try a different approach, or call ${this.finishName} and explain honestly what blocks you.]`;
  }

  /** Activity note when the model repeats itself; blocked AGENT_LOOP at the stop threshold. */
  private loopOutcome(description: string, n: number): AgentRunOutcome | null {
    if (n >= LOOP_STOP_AT) {
      return this.blockedOutcome(
        'AGENT_LOOP',
        `Das Modell wiederholt immer wieder dieselbe Aktion („${oneLine(description, 200)}“, ${n}-mal mit demselben Ergebnis) und kommt nicht weiter. NOVA hat den Lauf angehalten, damit keine Zeit verschwendet wird. Ein anderes Modell ist vermutlich besser geeignet: bitte unter „Modelle“ ein anderes Modell wählen oder die Aufgabe mit einem Hinweis erneut starten.`,
      );
    }
    if (n >= LOOP_HINT_AT) {
      this.step('error', `Das Modell wiederholt dieselbe Aktion (${oneLine(description, 200)}, ${n}-mal mit demselben Ergebnis) – Hinweis an das Modell gesendet.`, {
        repeats: n,
      });
    }
    return null;
  }

  /** Appends the tool result (capped to the context budget, plus an optional note), dequeues the call and persists. */
  private completeCall(call: ChatToolCall, content: string, isError: boolean, note?: string): void {
    const text = (capToolResult(content, this.toolResultCap()) || '(empty result)') + (note ?? '');
    if (this.state.mode === 'native' && this.isNativeCall(call.id)) this.state.messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: text });
    else this.state.messages.push({ role: 'user', content: formatJsonToolResult(call.name, text, isError) });
    const idx = this.state.queue.findIndex((c) => c.id === call.id);
    if (idx !== -1) this.state.queue.splice(idx, 1);
    if (this.state.inFlight?.toolCallId === call.id) this.state.inFlight = null;
    this.persist();
  }

  /** True when the latest assistant message carries this native tool call id (tool messages must answer it). */
  private isNativeCall(id: string): boolean {
    for (let i = this.state.messages.length - 1; i >= 0; i--) {
      const m = this.state.messages[i];
      if (m.role === 'assistant') return !!m.toolCalls?.some((c) => c.id === id);
    }
    return false;
  }

  private describe(tool: AgentTool, params: unknown, name: string): string {
    try {
      const d = tool.describe(params);
      return oneLine(redactString(typeof d === 'string' && d.trim() ? d : `Werkzeug ${name}`), 300);
    } catch {
      return `Werkzeug ${name}`;
    }
  }

  private toolContext(): ToolContext {
    return {
      project: this.input.project,
      task: this.input.task,
      runId: this.run.id,
      role: this.run.role,
      signal: this.input.signal,
      log: this.env.log.child('tool'),
      step: (kind, summary, data) => this.step(kind, summary, data),
    };
  }

  private markUsed(name: string): void {
    if (!this.state.toolsUsed.includes(name)) this.state.toolsUsed.push(name);
  }

  private addFiles(files: string[]): void {
    const merged = [...new Set([...this.run.files, ...files.map((f) => f.replace(/\\/g, '/'))])];
    if (merged.length !== this.run.files.length) this.updateRun({ files: merged });
  }

  // ------------------------------------------------------------------------------------------------------------
  // Conversation building
  // ------------------------------------------------------------------------------------------------------------

  private specs(): ChatToolSpec[] {
    if (!this.specsCache) {
      const generic = this.env.s.tools.specs(this.role.toolNames).filter((sp) => sp.name !== this.finishName);
      this.specsCache = [...generic, finishToolSpec(this.role.finishTool)];
    }
    return this.specsCache;
  }

  private memory(): MemoryEntry[] {
    const t = this.input.task;
    const query = `${t.title}\n${t.description}`.slice(0, 2000);
    if (this.memoryCache && this.memoryCache.query === query) return this.memoryCache.entries;
    let entries: MemoryEntry[] = [];
    try {
      entries = this.env.s.memory.contextFor({ projectId: this.input.project.id, query, limit: this.env.s.core.settings.get().memory.maxContextEntries });
    } catch (e) {
      this.env.log.warn('Gedächtnis-Kontext konnte nicht geladen werden', { runId: this.run.id, error: errorMessage(e) });
    }
    this.memoryCache = { query, entries };
    return entries;
  }

  private buildSystemPrompt(): string {
    return this.role.systemPrompt({
      project: this.input.project,
      task: this.input.task,
      memory: this.memory(),
      platform: this.env.platform,
      extraContext: this.input.extraContext,
      toolsInPrompt: this.state.mode === 'json' ? this.specs() : undefined,
    });
  }

  private taskMessage(): string {
    return `Work on the task "${this.input.task.title}" now. Follow the steps under "How to work". Call ${this.finishName} when you are done.`;
  }

  /** Creates [system, user] for a new conversation or replaces the system prompt of an existing one. */
  private ensureConversation(): void {
    const system: ChatMessage = { role: 'system', content: this.buildSystemPrompt() };
    if (this.state.messages.length === 0) this.state.messages = [system, { role: 'user', content: this.taskMessage() }];
    else if (this.state.messages[0].role === 'system') this.state.messages[0] = system;
    else this.state.messages.unshift(system);
  }

  private setMode(mode: 'native' | 'json'): void {
    if (this.state.mode === mode) return;
    if (this.state.messages.length > 0) this.state.messages = convertMessages(this.state.messages, mode);
    this.state.mode = mode;
  }

  private applyModeSwitch(): void {
    const next = this.nextMode;
    this.nextMode = null;
    if (!next || next === this.state.mode) return;
    this.setMode(next);
    this.ensureConversation();
    this.step(
      'status',
      next === 'json'
        ? 'Das antwortende Modell unterstützt keine Werkzeugaufrufe – NOVA verwendet ab jetzt JSON-Anweisungen.'
        : 'Das antwortende Modell unterstützt Werkzeugaufrufe – NOVA verwendet sie ab jetzt.',
    );
  }

  /** Task edits made while the run was stopped and unconsumed user notes (SPEC §6.4). Called at step boundaries. */
  private injectUserUpdates(): void {
    const { s } = this.env;
    const additions: string[] = [];
    const task = this.input.task;
    const snap = this.state.taskSnapshot;
    let edited = false;
    if (snap.title !== task.title || snap.description !== task.description || (snap.acceptance ?? null) !== (task.acceptance ?? null)) {
      additions.push(editMessage(snap, task));
      this.state.taskSnapshot = snapshotOf(task, this.run.role);
      edited = true;
    }
    let notes: TaskNote[] = [];
    try {
      notes = s.tasks.pendingNotes(task.id).filter((n) => n.author === 'user' && !n.consumedRunId && !this.injectedNotes.has(n.id));
    } catch (e) {
      this.env.log.warn('Hinweise des Benutzers konnten nicht gelesen werden', { runId: this.run.id, error: errorMessage(e) });
    }
    for (const n of notes) {
      additions.push(n.kind === 'answer' ? `Note from the user (answer to your question): ${n.text}` : `Note from the user: ${n.text}`);
    }
    if (additions.length === 0) return;
    if (edited) this.ensureConversation();
    for (const text of additions) this.state.messages.push({ role: 'user', content: text });
    this.persist();
    if (notes.length > 0) {
      for (const n of notes) this.injectedNotes.add(n.id);
      try {
        s.tasks.markNotesConsumed(
          notes.map((n) => n.id),
          this.run.id,
        );
      } catch (e) {
        this.env.log.warn('Hinweise konnten nicht als gelesen markiert werden', { runId: this.run.id, error: errorMessage(e) });
      }
      for (const n of notes) this.step('message', `Hinweis des Benutzers an den Agenten übergeben: ${oneLine(n.text, 300)}`, { noteId: n.id });
    }
    if (edited) this.step('message', 'Die geänderte Aufgabe wurde an den Agenten übergeben.', { title: task.title });
  }

  /** Corrects the token estimate upwards when the provider reports more input tokens than estimated. */
  private calibrate(usage: ModelChatResult['usage']): void {
    if (!usage.usageReported || !(usage.inputTokens > 0) || this.sentEstimate < CALIBRATE_MIN_TOKENS) return;
    const ratio = usage.inputTokens / this.sentEstimate;
    if (ratio > this.tokenFactor) this.tokenFactor = Math.min(MAX_TOKEN_FACTOR, ratio);
  }

  /** Window and prompt budget (in chars / 3.5 estimate units, i.e. already divided by the calibration factor). */
  private promptLimit(): { window: number; budget: number; limit: number } | null {
    if (!this.resolved) return null;
    const m = this.env.s.core.settings.get().models;
    const window = contextWindow(this.resolved, m.ollamaNumCtx);
    const budget = promptBudget(window, m.maxOutputTokens);
    return { window, budget, limit: Math.floor(budget / this.tokenFactor) };
  }

  private toolResultCap(): number {
    const p = this.promptLimit();
    return p ? toolResultMaxChars(p.limit) : TOOL_RESULT_MAX_CHARS;
  }

  private compactIfNeeded(): void {
    const p = this.promptLimit();
    if (!p) return;
    const { window, budget, limit } = p;
    const tools = this.state.mode === 'native' ? this.specs() : undefined;
    if (estimateTokens(this.state.messages, tools) <= limit) return;
    const r = compactMessages(this.state.messages, { limitTokens: limit, keepLast: KEEP_LAST_MESSAGES, tools });
    const f = this.tokenFactor;
    if (r.changed) {
      this.state.messages = r.messages;
      this.state.compactions += 1;
      this.step(
        'status',
        `Der Gesprächsverlauf wurde gekürzt, damit er in das Kontextfenster des Modells passt (etwa ${fmtInt(r.before * f)} → ${fmtInt(r.after * f)} Tokens).`,
        { level: r.level, before: r.before, after: r.after, limit, window, tokenFactor: f },
      );
    }
    if (r.after > limit) {
      this.env.log.warn('Gesprächsverlauf passt trotz Kürzung nicht vollständig ins Kontextfenster', { runId: this.run.id, estimate: r.after, limit, window });
      if (!this.contextWarned) {
        this.contextWarned = true;
        this.step(
          'error',
          `Die Arbeitsanweisungen passen selbst nach dem Kürzen nicht vollständig in das Kontextfenster des Modells (etwa ${fmtInt(r.after * f)} Tokens, Platz ist für etwa ${fmtInt(budget)}). Das Modell kann dadurch Teile der Anweisungen übersehen. Abhilfe: unter „Modelle“ die Kontextgröße erhöhen oder ein Modell mit größerem Kontextfenster wählen.`,
          { estimate: r.after, limit, window },
        );
      }
    }
  }

  // ------------------------------------------------------------------------------------------------------------
  // Outcomes and persistence
  // ------------------------------------------------------------------------------------------------------------

  private aborted(): boolean {
    return this.input.signal.aborted;
  }

  private persist(): void {
    this.env.s.runs.saveState(this.run.id, this.state);
  }

  private persistSafe(): void {
    try {
      this.persist();
    } catch (e) {
      this.env.log.error('Gesprächsstand konnte nicht gespeichert werden', { runId: this.run.id, error: errorMessage(e) });
    }
  }

  private updateRun(patch: Parameters<Services['runs']['update']>[1]): void {
    const now = this.env.s.core.clock.now();
    this.run = this.env.s.runs.update(this.run.id, { ...patch, activeMs: this.baseActiveMs + Math.max(0, now - this.segmentStart) });
  }

  private step(kind: AgentStepKind, summary: string, data?: unknown): void {
    try {
      this.env.s.runs.addStep(this.run.id, kind, summary, data);
    } catch (e) {
      this.env.log.warn('Aktivitätseintrag konnte nicht gespeichert werden', { runId: this.run.id, error: errorMessage(e) });
    }
  }

  private doneOutcome(output: AgentOutput, summary: string): AgentRunOutcome {
    this.state.inFlight = null;
    this.persistSafe();
    this.updateRun({
      status: 'done',
      endedAt: this.env.s.core.clock.now(),
      lastAction: 'Abgeschlossen',
      blocker: null,
      error: null,
      errorCode: null,
      pendingApprovalId: null,
    });
    return { status: 'done', runId: this.run.id, summary, output, files: [...this.run.files] };
  }

  private pausedOutcome(): AgentRunOutcome {
    this.persistSafe();
    this.updateRun({ status: 'paused', lastAction: 'Pausiert', pendingApprovalId: null });
    this.step('status', 'Der Lauf wurde pausiert. Der Gesprächsstand ist gespeichert.');
    return { status: 'paused', runId: this.run.id };
  }

  private waitingOutcome(approvalId: string, lastAction: string): AgentRunOutcome {
    this.persistSafe();
    this.updateRun({ status: 'waiting_approval', pendingApprovalId: approvalId, lastAction });
    return { status: 'waiting_approval', runId: this.run.id, approvalId };
  }

  private blockedOutcome(code: string, reason: string, withStep = true): AgentRunOutcome {
    this.persistSafe();
    this.updateRun({ status: 'blocked', blocker: reason, errorCode: code, lastAction: `Blockiert: ${oneLine(reason, 200)}`, pendingApprovalId: null });
    if (withStep) this.step('error', reason, { code });
    return { status: 'blocked', runId: this.run.id, reason, code };
  }

  private failedOutcome(code: string, reason: string, data?: Record<string, unknown>): AgentRunOutcome {
    this.persistSafe();
    this.updateRun({
      status: 'failed',
      error: reason,
      errorCode: code,
      endedAt: this.env.s.core.clock.now(),
      lastAction: 'Fehlgeschlagen',
      pendingApprovalId: null,
    });
    this.step('error', reason, { code, ...(data ?? {}) });
    return { status: 'failed', runId: this.run.id, reason, code };
  }

  private abortOutcome(): AgentRunOutcome {
    this.persistSafe();
    if (isInterruptReason(this.input.signal.reason)) {
      this.updateRun({ status: 'interrupted', lastAction: 'Unterbrochen (Hintergrunddienst wird beendet)', pendingApprovalId: null });
      this.step('status', 'Der Lauf wurde unterbrochen, weil der Hintergrunddienst beendet wird. Er kann später fortgesetzt werden.');
      return { status: 'interrupted', runId: this.run.id };
    }
    this.updateRun({ status: 'cancelled', endedAt: this.env.s.core.clock.now(), lastAction: 'Abgebrochen', pendingApprovalId: null });
    this.step('status', 'Der Lauf wurde abgebrochen.');
    return { status: 'cancelled', runId: this.run.id };
  }

  private unexpected(e: unknown): AgentRunOutcome {
    const message = redactString(errorMessage(e));
    const code = isNovaError(e) ? String(e.code) : 'INTERNAL';
    this.env.log.error('Agentenlauf mit unerwartetem Fehler beendet', { runId: this.run.id, code, error: message });
    if (this.aborted()) {
      try {
        return this.abortOutcome();
      } catch (e2) {
        this.env.log.error('Laufstatus konnte nach dem Abbruch nicht gespeichert werden', { runId: this.run.id, error: errorMessage(e2) });
        return isInterruptReason(this.input.signal.reason) ? { status: 'interrupted', runId: this.run.id } : { status: 'cancelled', runId: this.run.id };
      }
    }
    try {
      if (RESUMABLE_BLOCKER_CODES.includes(code)) return this.blockedOutcome(code, message);
      return this.failedOutcome(code, code === 'INTERNAL' ? `Interner Fehler im Agentenlauf: ${oneLine(message, 500)}` : message);
    } catch (e2) {
      this.env.log.error('Laufstatus konnte nach einem Fehler nicht gespeichert werden', { runId: this.run.id, error: errorMessage(e2) });
      return { status: 'failed', runId: this.run.id, reason: message, code };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------------------------

function supersede(env: Env, run: AgentRun, reason: string): void {
  if (TERMINAL.includes(run.status)) return; // 'running' here is stale: active runs are rejected in run() before
  try {
    env.s.runs.update(run.id, { status: 'cancelled', endedAt: env.s.core.clock.now(), error: reason, pendingApprovalId: null, lastAction: 'Durch einen neuen Lauf ersetzt' });
    env.s.runs.addStep(run.id, 'status', `Dieser Lauf wird nicht fortgesetzt: ${reason} Ein neuer Lauf übernimmt die Aufgabe.`);
  } catch (e) {
    env.log.warn('Alter Lauf konnte nicht beendet werden', { runId: run.id, error: errorMessage(e) });
  }
}

function prepareResume(
  env: Env,
  input: AgentRunInput,
  role: AgentRole,
  runId: string,
): { run: AgentRun; state: RunState } | { reason: string } {
  const { s } = env;
  const old = s.runs.get(runId);
  if (!old) return { reason: 'Der gespeicherte Lauf wurde nicht gefunden.' };
  if (old.taskId !== input.task.id) return { reason: 'Der gespeicherte Lauf gehört zu einer anderen Aufgabe.' };
  if (TERMINAL.includes(old.status)) return { reason: `Der vorherige Lauf ist bereits ${STATUS_LABEL[old.status]}.` };
  if (old.role !== role) {
    const reason = 'Die Rolle der Aufgabe wurde geändert.';
    supersede(env, old, reason);
    return { reason };
  }
  const state = parseRunState(s.runs.loadState<unknown>(runId));
  if (!state || state.role !== role) {
    const reason = state ? 'Die Rolle der Aufgabe wurde geändert.' : 'Der gespeicherte Gesprächsstand fehlt oder ist beschädigt.';
    supersede(env, old, reason);
    return { reason };
  }
  if (old.errorCode === 'AGENT_STEP_LIMIT') state.stepBudgetStart = old.stepCount;
  const run = s.runs.update(runId, {
    status: 'running',
    endedAt: null,
    pendingApprovalId: null,
    blocker: null,
    error: null,
    errorCode: null,
    lastAction: 'Wird fortgesetzt',
  });
  try {
    s.runs.addStep(runId, 'status', `Der Lauf wird fortgesetzt (vorher ${STATUS_LABEL[old.status]}).`);
  } catch (e) {
    env.log.warn('Schritt konnte nicht gespeichert werden', { runId, error: errorMessage(e) });
  }
  return { run, state };
}

export function createAgentRunner(s: Services, options: AgentRunnerOptions = {}): AgentRunner {
  const roles = new Map<AgentRole, NovaRoleModule>();
  const active = new Set<string>();
  const env: Env = {
    s,
    log: s.core.log.child('agents'),
    delays: options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS,
    sleep: options.sleep ?? ((ms, signal) => coreSleep(ms, signal)),
    platform: options.platform ?? s.core.platform,
  };

  const register = (module: AgentRoleModule): void => {
    if (!module || !module.info || !['planner', 'coder', 'tester', 'reviewer'].includes(module.info.role)) {
      throw validation('Ungültiges Agentenmodul: unbekannte Rolle.');
    }
    if (!module.finishTool?.name || typeof module.parseOutput !== 'function' || typeof module.systemPrompt !== 'function') {
      throw validation(`Ungültiges Agentenmodul für die Rolle „${module.info.role}“: Abschlusswerkzeug, Prompt oder Auswertung fehlt.`);
    }
    if (module.toolNames.includes(module.finishTool.name)) {
      throw validation(`Das Abschlusswerkzeug „${module.finishTool.name}“ darf nicht zugleich ein normales Werkzeug sein.`);
    }
    roles.set(module.info.role, module as NovaRoleModule);
  };

  for (const m of options.roles ?? builtinRoles()) register(m);

  return {
    async run(input: AgentRunInput): Promise<AgentRunOutcome> {
      const roleName: AgentRole = input.role ?? input.task.role;
      const role = roles.get(roleName);
      if (!role) throw validation(`Für die Rolle „${roleName}“ ist kein Agentenmodul registriert.`);
      if (input.task.projectId !== input.project.id) throw validation('Aufgabe und Projekt passen nicht zusammen.');
      if (input.resumeRunId && active.has(input.resumeRunId)) throw conflict('Dieser Agentenlauf wird bereits ausgeführt.');

      let prepared: { run: AgentRun; state: RunState } | null = null;
      let freshReason: string | null = null;
      if (input.resumeRunId) {
        const r = prepareResume(env, input, roleName, input.resumeRunId);
        if ('run' in r) prepared = r;
        else freshReason = r.reason;
      }
      const resumed = prepared !== null;
      if (!prepared) {
        const run = s.runs.create({ taskId: input.task.id, projectId: input.project.id, role: roleName });
        try {
          s.runs.addStep(run.id, 'status', `Lauf gestartet: ${role.info.name}${freshReason ? ` – neuer Lauf, weil: ${freshReason}` : ''}`);
        } catch (e) {
          env.log.warn('Schritt konnte nicht gespeichert werden', { runId: run.id, error: errorMessage(e) });
        }
        prepared = { run, state: freshState(input.task, roleName) };
      }
      active.add(prepared.run.id);
      try {
        return await new RunExecution(env, input, role, prepared.run, prepared.state, resumed).execute();
      } finally {
        active.delete(prepared.run.id);
      }
    },
    roles() {
      return [...roles.values()].map((m) => ({ ...m.info, tools: [...m.info.tools] }));
    },
    registerRole(module) {
      register(module);
    },
  };
}

