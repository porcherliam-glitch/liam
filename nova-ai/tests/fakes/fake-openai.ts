// Fake OpenAI-compatible server for tests (127.0.0.1, random port): GET /v1/models and POST /v1/chat/completions.
// `url` already ends with /v1 (use it as provider baseUrl). Checks the API key (Authorization: Bearer … or a custom
// header name) when `apiKey` is set, records requests, and answers with queued replies (object or function of the
// parsed request). Replies can simulate HTTP errors with headers (429 + Retry-After, 5xx, 401 …).
import type { ServerResponse } from 'node:http';
import { delay, sendJson, sendText, startFakeHttpServer, type RecordedRequest } from './fake-http';

export interface FakeOpenAiChatRequest {
  model: string;
  messages: Array<Record<string, unknown>>;
  tools: Array<{ type: string; function: { name: string; description?: string; parameters?: unknown } }>;
  raw: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface FakeOpenAiReply {
  content?: string | null;
  tool_calls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> | string }>;
  finish_reason?: string;
  /** null = omit usage. */
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
  status?: number;
  headers?: Record<string, string>;
  /** Raw JSON body for error replies (default OpenAI error shape). */
  body?: unknown;
  error?: string;
  delayMs?: number;
}

export type FakeOpenAiHandler = FakeOpenAiReply | ((req: FakeOpenAiChatRequest) => FakeOpenAiReply | Promise<FakeOpenAiReply>);

export interface FakeOpenAiOptions {
  apiKey?: string;
  /** Header that carries the key (default "authorization" with "Bearer "). */
  authHeader?: string;
  models?: Array<string | Record<string, unknown>>;
  defaultChat?: FakeOpenAiHandler;
}

export interface FakeOpenAi {
  url: string;
  close(): Promise<void>;
  requests: RecordedRequest[];
  chatRequests(): FakeOpenAiChatRequest[];
  setModels(list: Array<string | Record<string, unknown>>): void;
  queueChat(reply: FakeOpenAiHandler): void;
  setDefaultChat(reply: FakeOpenAiHandler | null): void;
  maxInFlight(): number;
  inFlight(): number;
}

export async function startFakeOpenAi(opts: FakeOpenAiOptions = {}): Promise<FakeOpenAi> {
  let models: Array<Record<string, unknown>> = (opts.models ?? ['gpt-test']).map((m) => (typeof m === 'string' ? { id: m } : m));
  let defaultChat: FakeOpenAiHandler | null = opts.defaultChat ?? null;
  const queue: FakeOpenAiHandler[] = [];
  const chats: FakeOpenAiChatRequest[] = [];

  const authorized = (req: RecordedRequest): boolean => {
    if (!opts.apiKey) return true;
    if (opts.authHeader) return req.headers[opts.authHeader.toLowerCase()] === opts.apiKey;
    return req.headers.authorization === `Bearer ${opts.apiKey}`;
  };

  const unauthorized = (res: ServerResponse) =>
    sendJson(res, 401, { error: { message: 'Incorrect API key provided: sk-te***st.', type: 'invalid_request_error', param: null, code: 'invalid_api_key' } });

  const server = await startFakeHttpServer(async (req, res) => {
    if (req.method === 'GET' && req.path === '/v1/models') {
      if (!authorized(req)) return unauthorized(res);
      return sendJson(res, 200, { object: 'list', data: models.map((m) => ({ object: 'model', created: 1_700_000_000, owned_by: 'fake', ...m })) });
    }
    if (req.method === 'POST' && req.path === '/v1/chat/completions') {
      if (!authorized(req)) return unauthorized(res);
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const parsed: FakeOpenAiChatRequest = {
        model: String(body.model ?? ''),
        messages: Array.isArray(body.messages) ? (body.messages as Array<Record<string, unknown>>) : [],
        tools: Array.isArray(body.tools) ? (body.tools as FakeOpenAiChatRequest['tools']) : [],
        raw: body,
        headers: req.headers,
      };
      chats.push(parsed);
      const handler = queue.shift() ?? defaultChat;
      if (!handler) return sendJson(res, 500, { error: { message: 'fake-openai: no chat response queued', type: 'server_error' } });
      const reply = typeof handler === 'function' ? await handler(parsed) : handler;
      if (reply.delayMs) await delay(reply.delayMs);
      if (res.destroyed) return;
      if (reply.status && reply.status >= 400) {
        return sendJson(res, reply.status, reply.body ?? { error: { message: reply.error ?? `fake error ${reply.status}`, type: 'error' } }, reply.headers ?? {});
      }
      const toolCalls = (reply.tool_calls ?? []).map((tc, i) => ({
        id: tc.id ?? `call_fake_${chats.length}_${i}`,
        type: 'function',
        function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments) },
      }));
      const message: Record<string, unknown> = { role: 'assistant', content: reply.content === undefined ? (toolCalls.length ? null : '') : reply.content };
      if (toolCalls.length) message.tool_calls = toolCalls;
      const out: Record<string, unknown> = {
        id: `chatcmpl-fake-${chats.length}`,
        object: 'chat.completion',
        created: 1_700_000_000,
        model: parsed.model,
        choices: [{ index: 0, message, finish_reason: reply.finish_reason ?? (toolCalls.length ? 'tool_calls' : 'stop') }],
      };
      if (reply.usage !== null) {
        const usage = reply.usage ?? { prompt_tokens: 100, completion_tokens: 20 };
        out.usage = { ...usage, total_tokens: usage.prompt_tokens + usage.completion_tokens };
      }
      return sendJson(res, 200, out, reply.headers ?? {});
    }
    return sendText(res, 404, 'Not Found');
  });

  return {
    url: `${server.url}/v1`,
    close: () => server.close(),
    requests: server.requests,
    chatRequests: () => [...chats],
    setModels(list) {
      models = list.map((m) => (typeof m === 'string' ? { id: m } : m));
    },
    queueChat(reply) {
      queue.push(reply);
    },
    setDefaultChat(reply) {
      defaultChat = reply;
    },
    maxInFlight: () => server.maxInFlight(),
    inFlight: () => server.inFlight(),
  };
}
