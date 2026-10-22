// Fake Ollama server for unit and end-to-end tests (127.0.0.1, random port). Implements the endpoints NOVA uses with
// realistic payloads: GET /api/version, GET /api/tags, POST /api/show (capabilities incl. "tools", model_info with
// general.architecture + "<arch>.context_length", block/head counts, details), POST /api/pull (NDJSON stream with
// realistic statuses, scriptable per model), DELETE /api/delete, GET /api/ps, POST /api/chat (non-stream and stream;
// message.tool_calls with function {name, arguments object}; prompt_eval_count / eval_count).
//
// Usage:
//   const ollama = await startFakeOllama({ models: ['qwen2.5-coder:7b'] });
//   ollama.queueChat({ tool_calls: [{ name: 'read_file', arguments: { path: 'a.ts' } }] });
//   ollama.queueChat((req) => ({ content: `saw ${req.messages.length} messages` }));
//   ... point provider "ollama-local" at ollama.url ...
//   await ollama.close();
// Unknown models → 404 like Ollama; tools for a model without the "tools" capability → 400; empty chat queue → 500
// with a clear message (or opts.defaultChat).
import type { ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { delay, sendJson, sendText, startFakeHttpServer, type RecordedRequest } from './fake-http';

export interface FakeOllamaModel {
  name: string;
  /** On-disk size in bytes (default derived from parameterSize, ≈ 4.7 GB for 7B). */
  size?: number;
  digest?: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  /** Default ["completion", "tools"]. */
  capabilities?: string[];
  /** Simulate Ollama < 0.6 (no `capabilities` in /api/show; tools derived from the template). */
  omitCapabilities?: boolean;
  /** Default 32768. */
  contextLength?: number;
  /** general.architecture (default "qwen2"). */
  architecture?: string;
  blockCount?: number;
  embeddingLength?: number;
  headCount?: number;
  headCountKv?: number;
  template?: string;
  license?: string;
  modifiedAt?: string;
}

export interface FakeOllamaRunning {
  name: string;
  size?: number;
  size_vram?: number;
  expires_at?: string;
  context_length?: number;
}

export interface FakeOllamaChatRequest {
  model: string;
  messages: Array<{ role: string; content: string; tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>; tool_name?: string }>;
  tools: Array<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>;
  options: Record<string, unknown>;
  format?: unknown;
  stream: boolean;
  raw: Record<string, unknown>;
}

export type FakeToolCall = { name: string; arguments: Record<string, unknown> | string } | { function: { name: string; arguments: Record<string, unknown> | string } };

export interface FakeChatReply {
  content?: string;
  tool_calls?: FakeToolCall[];
  thinking?: string;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  /** Leave out prompt_eval_count/eval_count. */
  omitUsage?: boolean;
  /** Wait before answering (ms). */
  delayMs?: number;
  /** Answer with this HTTP status and `{error}` instead of a chat response. */
  status?: number;
  error?: string;
}

export type FakeChatHandler = FakeChatReply | ((req: FakeOllamaChatRequest) => FakeChatReply | Promise<FakeChatReply>);

export type FakePullEvent = Record<string, unknown> & { delayMs?: number };

export interface FakeOllamaOptions {
  models?: Array<FakeOllamaModel | string>;
  version?: string;
  running?: Array<FakeOllamaRunning | string>;
  /** Used when the chat queue is empty (default: HTTP 500 "no chat response queued"). */
  defaultChat?: FakeChatHandler;
  /** Delay between default pull progress lines (ms, default 5). */
  pullStepDelayMs?: number;
}

export interface FakeOllama {
  url: string;
  close(): Promise<void>;
  requests: { method: string; path: string; body: unknown; headers: Record<string, string>; query: Record<string, string> }[];
  /** Only the parsed /api/chat requests. */
  chatRequests(): FakeOllamaChatRequest[];
  setModels(list: Array<FakeOllamaModel | string>): void;
  models(): FakeOllamaModel[];
  queueChat(response: FakeChatHandler): void;
  setDefaultChat(response: FakeChatHandler | null): void;
  /** Number of queued chat responses not yet consumed. */
  pendingChats(): number;
  pullScript(model: string, events: FakePullEvent[]): void;
  setRunning(list: Array<FakeOllamaRunning | string>): void;
  setVersion(version: string): void;
  /** Every request answers with this status (null = normal operation). */
  failAll(status: number | null, error?: string): void;
  maxInFlight(): number;
}

const DEFAULT_VERSION = '0.12.6';

function sizeFor(parameterSize: string | undefined): number {
  const m = /([\d.]+)\s*B/i.exec(parameterSize ?? '');
  const billions = m ? Number(m[1]) : 7;
  return Math.round(billions * 0.62 * 1e9 + 0.3e9);
}

function digestOf(name: string): string {
  return createHash('sha256').update(name).digest('hex');
}

function normalizeModel(m: FakeOllamaModel | string): FakeOllamaModel {
  const base = typeof m === 'string' ? { name: m } : { ...m };
  if (!base.name.includes(':')) base.name = `${base.name}:latest`;
  return base;
}

function sameName(a: string, b: string): boolean {
  const n = (x: string) => (x.includes(':') ? x : `${x}:latest`).toLowerCase();
  return n(a) === n(b);
}

function details(m: FakeOllamaModel) {
  const family = m.family ?? m.architecture ?? 'qwen2';
  return {
    parent_model: '',
    format: 'gguf',
    family,
    families: [family],
    parameter_size: m.parameterSize ?? '7.6B',
    quantization_level: m.quantization ?? 'Q4_K_M',
  };
}

function tagOf(m: FakeOllamaModel) {
  return {
    name: m.name,
    model: m.name,
    modified_at: m.modifiedAt ?? '2026-10-01T12:00:00.000000+02:00',
    size: m.size ?? sizeFor(m.parameterSize),
    digest: m.digest ?? digestOf(m.name),
    details: details(m),
  };
}

function showOf(m: FakeOllamaModel) {
  const arch = m.architecture ?? 'qwen2';
  const caps = m.capabilities ?? ['completion', 'tools'];
  const template =
    m.template ??
    (caps.includes('tools')
      ? '{{- if .Tools }}<tools>{{ range .Tools }}{{ . }}{{ end }}</tools>{{ end }}{{ range .Messages }}{{ .Content }}{{ end }}'
      : '{{ range .Messages }}{{ .Content }}{{ end }}');
  const body: Record<string, unknown> = {
    license: m.license ?? 'Apache License 2.0',
    modelfile: `# Modelfile generated by "ollama show"\nFROM ${m.name}\nTEMPLATE """${template}"""\nPARAMETER stop <|im_end|>`,
    parameters: 'stop                           "<|im_end|>"',
    template,
    details: details(m),
    model_info: {
      'general.architecture': arch,
      'general.parameter_count': 7_615_616_512,
      'general.file_type': 15,
      [`${arch}.context_length`]: m.contextLength ?? 32768,
      [`${arch}.block_count`]: m.blockCount ?? 28,
      [`${arch}.embedding_length`]: m.embeddingLength ?? 3584,
      [`${arch}.attention.head_count`]: m.headCount ?? 28,
      [`${arch}.attention.head_count_kv`]: m.headCountKv ?? 4,
    },
    modified_at: m.modifiedAt ?? '2026-10-01T12:00:00.000000+02:00',
  };
  if (!m.omitCapabilities) body.capabilities = caps;
  return body;
}

function normalizeToolCalls(list: FakeToolCall[] | undefined) {
  return (list ?? []).map((tc) => {
    const fn = 'function' in tc ? tc.function : tc;
    return { function: { name: fn.name, arguments: fn.arguments } };
  });
}

export async function startFakeOllama(opts: FakeOllamaOptions = {}): Promise<FakeOllama> {
  let models: FakeOllamaModel[] = (opts.models ?? []).map(normalizeModel);
  let running: FakeOllamaRunning[] = (opts.running ?? []).map((r) => (typeof r === 'string' ? { name: r } : r));
  let version = opts.version ?? DEFAULT_VERSION;
  let defaultChat: FakeChatHandler | null = opts.defaultChat ?? null;
  let failure: { status: number; error: string } | null = null;
  const chatQueue: FakeChatHandler[] = [];
  const pullScripts = new Map<string, FakePullEvent[]>();
  const chatRequests: FakeOllamaChatRequest[] = [];
  const stepDelay = opts.pullStepDelayMs ?? 5;

  const find = (name: unknown) => (typeof name === 'string' ? models.find((m) => sameName(m.name, name)) : undefined);

  const notFound = (res: ServerResponse, name: string) => sendJson(res, 404, { error: `model '${name}' not found` });

  const handleChat = async (req: RecordedRequest, res: ServerResponse) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const name = typeof body.model === 'string' ? body.model : '';
    const model = find(name);
    if (!model) return sendJson(res, 404, { error: `model "${name}" not found, try pulling it first` });
    const tools = Array.isArray(body.tools) ? (body.tools as FakeOllamaChatRequest['tools']) : [];
    if (tools.length && !(model.capabilities ?? ['completion', 'tools']).includes('tools')) {
      return sendJson(res, 400, { error: `registry.ollama.ai/library/${model.name} does not support tools` });
    }
    const parsed: FakeOllamaChatRequest = {
      model: name,
      messages: Array.isArray(body.messages) ? (body.messages as FakeOllamaChatRequest['messages']) : [],
      tools,
      options: body.options && typeof body.options === 'object' ? (body.options as Record<string, unknown>) : {},
      format: body.format,
      stream: body.stream !== false,
      raw: body,
    };
    chatRequests.push(parsed);
    const handler = chatQueue.shift() ?? defaultChat;
    if (!handler) return sendJson(res, 500, { error: 'fake-ollama: no chat response queued' });
    const reply = typeof handler === 'function' ? await handler(parsed) : handler;
    if (reply.delayMs) await delay(reply.delayMs);
    if (res.destroyed) return;
    if (reply.status && reply.status >= 400) return sendJson(res, reply.status, { error: reply.error ?? 'fake error' });
    const content = reply.content ?? '';
    const toolCalls = normalizeToolCalls(reply.tool_calls);
    const promptChars = parsed.messages.reduce((n, m) => n + (typeof m.content === 'string' ? m.content.length : 0), 0) + JSON.stringify(tools).length;
    const message: Record<string, unknown> = { role: 'assistant', content };
    if (toolCalls.length) message.tool_calls = toolCalls;
    if (reply.thinking) message.thinking = reply.thinking;
    const usage = reply.omitUsage
      ? {}
      : {
          prompt_eval_count: reply.prompt_eval_count ?? Math.max(1, Math.ceil(promptChars / 4)),
          prompt_eval_duration: 120_000_000,
          eval_count: reply.eval_count ?? Math.max(1, Math.ceil((content.length + JSON.stringify(toolCalls).length) / 4)),
          eval_duration: 480_000_000,
        };
    const final = {
      model: model.name,
      created_at: new Date().toISOString(),
      message,
      done_reason: reply.done_reason ?? 'stop',
      done: true,
      total_duration: 650_000_000,
      load_duration: 30_000_000,
      ...usage,
    };
    if (!parsed.stream) return sendJson(res, 200, final);
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    res.write(`${JSON.stringify({ model: model.name, created_at: final.created_at, message, done: false })}\n`);
    res.end(`${JSON.stringify({ ...final, message: { role: 'assistant', content: '' } })}\n`);
  };

  const handlePull = async (req: RecordedRequest, res: ServerResponse) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
    const name = String(body.model ?? body.name ?? '');
    const full = name.includes(':') ? name : `${name}:latest`;
    const digest = digestOf(full);
    const total = 1_000_000;
    const script =
      pullScripts.get(full) ??
      pullScripts.get(name) ?? [
        { status: 'pulling manifest' },
        { status: `pulling ${digest.slice(0, 12)}`, digest: `sha256:${digest}`, total, completed: 0 },
        { status: `pulling ${digest.slice(0, 12)}`, digest: `sha256:${digest}`, total, completed: total / 2 },
        { status: `pulling ${digest.slice(0, 12)}`, digest: `sha256:${digest}`, total, completed: total },
        { status: 'verifying sha256 digest' },
        { status: 'writing manifest' },
        { status: 'success' },
      ];
    res.writeHead(200, { 'content-type': 'application/x-ndjson' });
    for (const ev of script) {
      const { delayMs, ...line } = ev;
      await delay(typeof delayMs === 'number' ? delayMs : stepDelay);
      if (res.destroyed || res.writableEnded) return;
      res.write(`${JSON.stringify(line)}\n`);
      if (line.status === 'success' && !find(full)) models.push({ name: full, size: total });
    }
    res.end();
  };

  const server = await startFakeHttpServer(async (req, res) => {
    if (failure) return sendJson(res, failure.status, { error: failure.error });
    const route = `${req.method} ${req.path}`;
    switch (route) {
      case 'GET /':
      case 'HEAD /':
        return sendText(res, 200, 'Ollama is running');
      case 'GET /api/version':
        return sendJson(res, 200, { version });
      case 'GET /api/tags':
        return sendJson(res, 200, { models: models.map(tagOf) });
      case 'POST /api/show': {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = String(body.model ?? body.name ?? '');
        const m = find(name);
        return m ? sendJson(res, 200, showOf(m)) : notFound(res, name);
      }
      case 'GET /api/ps':
        return sendJson(res, 200, {
          models: running.map((r) => {
            const m = find(r.name);
            const size = r.size ?? m?.size ?? sizeFor(m?.parameterSize);
            return {
              name: r.name,
              model: r.name,
              size,
              digest: digestOf(r.name),
              details: m ? details(m) : details({ name: r.name }),
              expires_at: r.expires_at ?? '2026-10-22T12:05:00.000000+02:00',
              size_vram: r.size_vram ?? size,
              context_length: r.context_length ?? 4096,
            };
          }),
        });
      case 'DELETE /api/delete': {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const name = String(body.model ?? body.name ?? '');
        const m = find(name);
        if (!m) return notFound(res, name);
        models = models.filter((x) => x !== m);
        res.writeHead(200);
        res.end();
        return;
      }
      case 'POST /api/pull':
        return handlePull(req, res);
      case 'POST /api/chat':
        return handleChat(req, res);
      default:
        return sendText(res, 404, '404 page not found');
    }
  });

  return {
    url: server.url,
    close: () => server.close(),
    requests: server.requests,
    chatRequests: () => [...chatRequests],
    setModels(list) {
      models = list.map(normalizeModel);
    },
    models: () => models.map((m) => ({ ...m })),
    queueChat(response) {
      chatQueue.push(response);
    },
    setDefaultChat(response) {
      defaultChat = response;
    },
    pendingChats: () => chatQueue.length,
    pullScript(model, events) {
      pullScripts.set(model.includes(':') ? model : `${model}:latest`, events);
    },
    setRunning(list) {
      running = list.map((r) => (typeof r === 'string' ? { name: r } : r));
    },
    setVersion(v) {
      version = v;
    },
    failAll(status, error = 'fake failure') {
      failure = status === null ? null : { status, error };
    },
    maxInFlight: () => server.maxInFlight(),
  };
}
