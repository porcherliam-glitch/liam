// ModelProvider for OpenAI-compatible APIs (built-in factory "openai_compatible"): OpenAI, OpenRouter, Groq, Mistral,
// LM Studio, vLLM … `POST {baseUrl}/chat/completions`, `GET {baseUrl}/models`.
// Key decisions:
// - Auth: `Authorization: Bearer <key>` or the stored key under `options.authHeader` (e.g. Azure "api-key").
//   `options.organization` → OpenAI-Organization header. Non-local endpoints without a key fail before sending
//   (PROVIDER_AUTH, requestSent=false). Local servers (LM Studio, vLLM) work without a key.
// - Messages: consecutive system/user messages (and assistant texts without tool calls) are merged; tool calls are
//   `{id, type:"function", function:{name, arguments:<JSON string>}}`; tool results `{role:"tool", tool_call_id}`.
// - Adaptive request shape: newer OpenAI reasoning models reject `max_tokens` (→ `max_completion_tokens`) or a custom
//   `temperature`. A 400 naming that parameter is retried once with the adapted shape and remembered per model.
//   400 responses are not billed, so the retry never costs twice.
// - Model list: OpenRouter-style `context_length`, `pricing` (per token → per MTok, estimated=false) and
//   `supported_parameters` are used when present; otherwise chat models are assumed to support tools.
import type { ModelCapability, ModelInfo, ModelPricing, ProviderConfig, ProviderHealth } from '@shared/schemas';
import type { ChatMessage, ChatRequest, ChatResponse, ChatToolCall, ModelProvider, ProviderFactory, ProviderFactoryDeps } from '../contracts';
import { isLocalEndpoint } from '../core/net';
import { errorMessage } from '../core/errors';
import { invalidResponse, joinUrl, providerError, providerErrorDetails, requestJson, type HttpContext } from './http';
import { newToolCallId, toArgumentsObject } from './ollama-provider';

const CHAT_SAFETY_TIMEOUT_MS = 60 * 60 * 1000;

interface OpenAiToolCallWire {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type OpenAiWireMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCallWire[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export function toOpenAiMessages(messages: ChatMessage[]): OpenAiWireMessage[] {
  const out: OpenAiWireMessage[] = [];
  for (const m of messages) {
    const prev = out[out.length - 1];
    if (m.role === 'system' || m.role === 'user') {
      if (prev && prev.role === m.role) {
        prev.content = `${prev.content}\n\n${m.content}`;
        continue;
      }
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const toolCalls: OpenAiToolCallWire[] | undefined = m.toolCalls?.length
        ? m.toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) } }))
        : undefined;
      if (prev && prev.role === 'assistant' && !prev.tool_calls) {
        const joined = [prev.content ?? '', m.content ?? ''].filter((x) => x.length > 0).join('\n\n');
        prev.content = joined.length ? joined : toolCalls ? null : '';
        if (toolCalls) prev.tool_calls = toolCalls;
        continue;
      }
      const msg: OpenAiWireMessage = { role: 'assistant', content: m.content ? m.content : toolCalls ? null : '' };
      if (toolCalls) msg.tool_calls = toolCalls;
      out.push(msg);
      continue;
    }
    out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
  }
  return out;
}

export function fromOpenAiToolCalls(message: Record<string, unknown>): ChatToolCall[] {
  const out: ChatToolCall[] = [];
  const raw = message.tool_calls;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const fn = (item as { function?: { name?: unknown; arguments?: unknown } }).function;
      if (!fn || typeof fn.name !== 'string' || !fn.name) continue;
      const id = typeof (item as { id?: unknown }).id === 'string' && (item as { id: string }).id ? (item as { id: string }).id : newToolCallId();
      out.push({ id, name: fn.name, arguments: toArgumentsObject(fn.arguments) });
    }
  }
  // Legacy single function_call
  const legacy = message.function_call as { name?: unknown; arguments?: unknown } | undefined;
  if (!out.length && legacy && typeof legacy.name === 'string' && legacy.name) {
    out.push({ id: newToolCallId(), name: legacy.name, arguments: toArgumentsObject(legacy.arguments) });
  }
  return out;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
      .join('');
  }
  return '';
}

/** OpenRouter-style per-token prices (strings) → per million tokens. */
function parsePricing(raw: unknown): ModelPricing | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as { prompt?: unknown; completion?: unknown };
  const toNum = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  const input = toNum(p.prompt);
  const output = toNum(p.completion);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  const round = (x: number) => Math.round(x * 1e6 * 1e6) / 1e6;
  return { inputPerMTokUsd: round(input), outputPerMTokUsd: round(output), estimated: false };
}

function capabilitiesFor(id: string, raw: Record<string, unknown>): ModelCapability[] {
  const lower = id.toLowerCase();
  if (/embed/.test(lower)) return ['embedding'];
  const supported = raw.supported_parameters;
  const caps = new Set<ModelCapability>();
  if (Array.isArray(supported)) {
    caps.add('completion');
    if (supported.includes('tools')) caps.add('tools');
  } else {
    if (/(whisper|tts|dall-e|moderation|transcribe|realtime|audio|image|sora|davinci|babbage|guard)/.test(lower)) return [];
    caps.add('completion');
    caps.add('tools');
  }
  const arch = raw.architecture as { input_modalities?: unknown } | undefined;
  if (arch && Array.isArray(arch.input_modalities) && arch.input_modalities.includes('image')) caps.add('vision');
  return [...caps];
}

class OpenAiCompatibleProvider implements ModelProvider {
  readonly id: string;
  readonly type = 'openai_compatible' as const;
  private readonly ctx: HttpContext;
  private readonly useMaxCompletionTokens = new Set<string>();
  private readonly omitTemperature = new Set<string>();

  constructor(
    private readonly cfg: ProviderConfig,
    private readonly deps: ProviderFactoryDeps,
  ) {
    this.id = cfg.id;
    this.ctx = { fetch: deps.fetch ?? fetch, label: cfg.name, family: 'cloud', providerId: cfg.id };
  }

  config(): ProviderConfig {
    return { ...this.cfg, options: { ...this.cfg.options } };
  }

  private local(): boolean {
    return isLocalEndpoint(this.cfg.baseUrl);
  }

  private async headers(): Promise<Record<string, string> | null> {
    const key = await this.deps.getApiKey();
    const h: Record<string, string> = {};
    if (key) {
      const name = this.cfg.options.authHeader?.trim();
      if (name && name.toLowerCase() !== 'authorization') h[name] = key;
      else h.authorization = `Bearer ${key}`;
    } else if (!this.local()) {
      return null;
    }
    if (this.cfg.options.organization) h['openai-organization'] = this.cfg.options.organization;
    return h;
  }

  private missingKey(): Error {
    return providerError('PROVIDER_AUTH', `Für „${this.cfg.name}“ ist kein API-Schlüssel hinterlegt. Bitte unter „Modelle“ einen Schlüssel eintragen.`, {
      providerId: this.id,
      requestSent: false,
      billable: false,
      retryable: false,
    });
  }

  async health(): Promise<ProviderHealth> {
    const started = Date.now();
    const headers = await this.headers();
    if (!headers) {
      return { providerId: this.id, status: 'not_configured', message: 'Kein API-Schlüssel hinterlegt.', version: null, checkedAt: Date.now(), latencyMs: null };
    }
    try {
      const { data } = await requestJson(this.ctx, { method: 'GET', url: joinUrl(this.cfg.baseUrl, '/models'), headers, timeoutMs: 10_000 });
      const count = Array.isArray((data as { data?: unknown })?.data) ? (data as { data: unknown[] }).data.length : null;
      return {
        providerId: this.id,
        status: 'ok',
        message: count === null ? 'Verbunden.' : `Verbunden (${count} Modelle verfügbar).`,
        version: null,
        checkedAt: Date.now(),
        latencyMs: Date.now() - started,
      };
    } catch (e) {
      const d = providerErrorDetails(e);
      if (d?.status === 404 || d?.status === 405) {
        return { providerId: this.id, status: 'ok', message: 'Erreichbar (der Anbieter stellt keine Modellliste bereit).', version: null, checkedAt: Date.now(), latencyMs: Date.now() - started };
      }
      return {
        providerId: this.id,
        status: d?.status === 401 || d?.status === 403 ? 'auth_error' : d && !d.requestSent ? 'unreachable' : 'error',
        message: errorMessage(e),
        version: null,
        checkedAt: Date.now(),
        latencyMs: null,
      };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const headers = await this.headers();
    if (!headers) throw this.missingKey();
    const { data } = await requestJson(this.ctx, { method: 'GET', url: joinUrl(this.cfg.baseUrl, '/models'), headers, timeoutMs: 15_000 });
    const list = (data as { data?: unknown })?.data;
    if (!Array.isArray(list)) throw invalidResponse(this.ctx, 'Modellliste unlesbar');
    const local = this.local();
    const out: ModelInfo[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const raw = item as Record<string, unknown>;
      if (typeof raw.id !== 'string' || !raw.id) continue;
      const ctxLen = typeof raw.context_length === 'number' ? raw.context_length : typeof raw.context_window === 'number' ? raw.context_window : null;
      out.push({
        providerId: this.id,
        id: raw.id,
        displayName: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
        local,
        paid: this.cfg.paid,
        sizeBytes: null,
        parameterSize: null,
        quantization: null,
        family: typeof raw.owned_by === 'string' ? raw.owned_by : null,
        contextLength: ctxLen,
        capabilities: capabilitiesFor(raw.id, raw),
        pricing: parsePricing(raw.pricing),
        modifiedAt: typeof raw.created === 'number' ? raw.created * 1000 : null,
      });
    }
    return out;
  }

  private buildBody(req: ChatRequest): Record<string, unknown> {
    const body: Record<string, unknown> = { model: req.model, messages: toOpenAiMessages(req.messages), stream: false };
    if (req.tools?.length) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }
    if (req.temperature !== undefined && !this.omitTemperature.has(req.model)) body.temperature = req.temperature;
    if (req.maxTokens !== undefined) {
      if (this.useMaxCompletionTokens.has(req.model)) body.max_completion_tokens = req.maxTokens;
      else body.max_tokens = req.maxTokens;
    }
    if (req.json) body.response_format = { type: 'json_object' };
    return body;
  }

  /** Learns from a 400 that names an unsupported parameter. Returns true when the request shape changed. */
  private adapt(e: unknown, model: string): boolean {
    const d = providerErrorDetails(e);
    if (!d || d.status !== 400 || !d.providerMessage) return false;
    const msg = d.providerMessage.toLowerCase();
    if (msg.includes('max_tokens') && msg.includes('max_completion_tokens') && !this.useMaxCompletionTokens.has(model)) {
      this.useMaxCompletionTokens.add(model);
      return true;
    }
    if (msg.includes('temperature') && /(unsupported|not support|does not support|only the default)/.test(msg) && !this.omitTemperature.has(model)) {
      this.omitTemperature.add(model);
      return true;
    }
    return false;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const headers = await this.headers();
    if (!headers) throw this.missingKey();
    const started = Date.now();
    let data: unknown;
    for (let attempt = 0; ; attempt++) {
      try {
        ({ data } = await requestJson(this.ctx, {
          method: 'POST',
          url: joinUrl(this.cfg.baseUrl, '/chat/completions'),
          headers,
          body: this.buildBody(req),
          signal: req.signal,
          timeoutMs: CHAT_SAFETY_TIMEOUT_MS,
          notFoundMessage: `${this.cfg.name}: Das Modell „${req.model}“ wurde nicht gefunden.`,
        }));
        break;
      } catch (e) {
        if (attempt < 2 && this.adapt(e, req.model)) {
          this.deps.log.info('Anfrageformat an das Modell angepasst', { provider: this.id, model: req.model });
          continue;
        }
        throw e;
      }
    }
    const choices = (data as { choices?: unknown })?.choices;
    if (!Array.isArray(choices) || !choices.length || !choices[0] || typeof choices[0] !== 'object') throw invalidResponse(this.ctx, 'Antwort ohne Auswahl');
    const choice = choices[0] as { message?: Record<string, unknown>; finish_reason?: unknown };
    const message = choice.message && typeof choice.message === 'object' ? choice.message : {};
    const usage = (data as { usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } }).usage;
    const inputTokens = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const outputTokens = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : 0;
    return {
      content: contentText(message.content),
      toolCalls: fromOpenAiToolCalls(message),
      usage: { inputTokens, outputTokens, usageReported: typeof usage?.prompt_tokens === 'number' && typeof usage?.completion_tokens === 'number' },
      durationMs: Date.now() - started,
      model: typeof (data as { model?: unknown }).model === 'string' ? (data as { model: string }).model : req.model,
      finishReason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
    };
  }
}

export const openAiCompatibleFactory: ProviderFactory = {
  type: 'openai_compatible',
  create(config: ProviderConfig, deps: ProviderFactoryDeps): ModelProvider {
    return new OpenAiCompatibleProvider(config, deps);
  },
};
