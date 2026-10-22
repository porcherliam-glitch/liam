// ModelProvider for Ollama (built-in factory "ollama"). Talks to /api/version, /api/tags, /api/show and /api/chat.
// Key decisions:
// - Chat is non-streaming (`stream:false`). Options: num_ctx, temperature, num_predict (= maxTokens), format "json".
// - Tool calls: Ollama sends `message.tool_calls[].function.{name, arguments(object)}` without ids → NOVA generates
//   ids. Outgoing assistant tool calls use the same shape; tool results are `{role:"tool", content, tool_name}`.
// - Usage: prompt_eval_count / eval_count. Ollama omits prompt_eval_count when the prompt was cached → usageReported
//   is false and the ModelClient estimates the missing number.
// - Connection refused → OLLAMA_UNREACHABLE, 404 → MODEL_UNAVAILABLE (classification in http.ts).
// - A default chat timeout of 60 min is a safety net only; the ModelClient passes a signal with the configured
//   settings.agents.modelTimeoutSec.
import { randomBytes } from 'node:crypto';
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas';
import type { ChatMessage, ChatRequest, ChatResponse, ChatToolCall, ModelProvider, ProviderFactory, ProviderFactoryDeps } from '../contracts';
import { isLocalEndpoint } from '../core/net';
import { errorMessage } from '../core/errors';
import { invalidResponse, providerErrorDetails } from './http';
import { OllamaApi, listOllamaModels } from './ollama-api';

const CHAT_SAFETY_TIMEOUT_MS = 60 * 60 * 1000;

export interface OllamaWireToolCall {
  function: { name: string; arguments: Record<string, unknown> };
}

export type OllamaWireMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: OllamaWireToolCall[] }
  | { role: 'tool'; content: string; tool_name: string };

export function newToolCallId(): string {
  return `call_${randomBytes(6).toString('hex')}`;
}

/** Tool call arguments as an object (strings are parsed; unparsable input is kept under `_unparsedArguments`). */
export function toArgumentsObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return {};
    try {
      const v = JSON.parse(t) as unknown;
      if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    } catch {
      /* fall through */
    }
    return { _unparsedArguments: raw };
  }
  return {};
}

export function toOllamaMessages(messages: ChatMessage[]): OllamaWireMessage[] {
  return messages.map((m): OllamaWireMessage => {
    switch (m.role) {
      case 'system':
      case 'user':
        return { role: m.role, content: m.content };
      case 'assistant': {
        const out: OllamaWireMessage = { role: 'assistant', content: m.content ?? '' };
        if (m.toolCalls?.length) out.tool_calls = m.toolCalls.map((tc) => ({ function: { name: tc.name, arguments: tc.arguments ?? {} } }));
        return out;
      }
      case 'tool':
        return { role: 'tool', content: m.content, tool_name: m.name };
    }
  });
}

export function fromOllamaToolCalls(raw: unknown): ChatToolCall[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const fn = (item as { function?: unknown }).function as { name?: unknown; arguments?: unknown } | undefined;
    if (!fn || typeof fn.name !== 'string' || !fn.name) continue;
    const id = typeof (item as { id?: unknown }).id === 'string' && (item as { id: string }).id ? (item as { id: string }).id : newToolCallId();
    out.push({ id, name: fn.name, arguments: toArgumentsObject(fn.arguments) });
  }
  return out;
}

export function buildOllamaChatBody(req: ChatRequest): Record<string, unknown> {
  const options: Record<string, number> = {};
  if (req.numCtx !== undefined) options.num_ctx = req.numCtx;
  if (req.temperature !== undefined) options.temperature = req.temperature;
  if (req.maxTokens !== undefined) options.num_predict = req.maxTokens;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: toOllamaMessages(req.messages),
    stream: false,
    options,
  };
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
  if (req.json) body.format = 'json';
  return body;
}

class OllamaProvider implements ModelProvider {
  readonly id: string;
  readonly type = 'ollama' as const;
  private readonly api: OllamaApi;

  constructor(
    private readonly cfg: ProviderConfig,
    private readonly deps: ProviderFactoryDeps,
  ) {
    this.id = cfg.id;
    this.api = new OllamaApi(cfg.baseUrl, deps.fetch ?? fetch, cfg.id);
  }

  config(): ProviderConfig {
    return { ...this.cfg, options: { ...this.cfg.options } };
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    try {
      const version = await this.api.version(undefined, 5000);
      return {
        providerId: this.id,
        status: 'ok',
        message: `Ollama antwortet (Version ${version ?? 'unbekannt'}).`,
        version,
        checkedAt: Date.now(),
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      const d = providerErrorDetails(e);
      const unreachable = d ? !d.requestSent || d.timedOut === true : true;
      return {
        providerId: this.id,
        status: unreachable ? 'unreachable' : d?.status === 401 || d?.status === 403 ? 'auth_error' : 'error',
        message: errorMessage(e),
        version: null,
        checkedAt: Date.now(),
        latencyMs: null,
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const details = await listOllamaModels(this.api, this.id, isLocalEndpoint(this.cfg.baseUrl));
    for (const d of details) if (d.showFailed) this.deps.log.debug('Modelldetails nicht abrufbar', { model: d.info.id });
    return details.map((d) => d.info);
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const started = Date.now();
    const data = await this.api.chat(buildOllamaChatBody(req), req.signal, CHAT_SAFETY_TIMEOUT_MS, req.model);
    if (!data || typeof data !== 'object') throw invalidResponse(this.api.ctx, 'leere Antwort');
    const d = data as {
      model?: unknown;
      message?: { content?: unknown; tool_calls?: unknown };
      done_reason?: unknown;
      prompt_eval_count?: unknown;
      eval_count?: unknown;
    };
    if (!d.message || typeof d.message !== 'object') throw invalidResponse(this.api.ctx, 'Antwort ohne Nachricht');
    const content = typeof d.message.content === 'string' ? d.message.content : '';
    const toolCalls = fromOllamaToolCalls(d.message.tool_calls);
    const inputTokens = typeof d.prompt_eval_count === 'number' ? d.prompt_eval_count : 0;
    const outputTokens = typeof d.eval_count === 'number' ? d.eval_count : 0;
    return {
      content,
      toolCalls,
      usage: {
        inputTokens,
        outputTokens,
        usageReported: typeof d.prompt_eval_count === 'number' && typeof d.eval_count === 'number',
      },
      durationMs: Date.now() - started,
      model: typeof d.model === 'string' ? d.model : req.model,
      finishReason: typeof d.done_reason === 'string' ? d.done_reason : null,
    };
  }
}

export const ollamaFactory: ProviderFactory = {
  type: 'ollama',
  create(config: ProviderConfig, deps: ProviderFactoryDeps): ModelProvider {
    return new OllamaProvider(config, deps);
  },
};
