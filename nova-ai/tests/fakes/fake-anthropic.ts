// Fake Anthropic Messages API for tests (127.0.0.1, random port): GET /v1/models and POST /v1/messages.
// Validates like the real API: x-api-key + anthropic-version headers, max_tokens present, no "system" role inside
// messages, first message from the user, strict user/assistant alternation, non-empty text blocks, and every
// tool_result referring to a tool_use of the preceding assistant message. Violations → 400 invalid_request_error.
import { delay, sendJson, sendText, startFakeHttpServer, type RecordedRequest } from './fake-http';

export interface FakeAnthropicRequest {
  model: string;
  system: unknown;
  messages: Array<{ role: string; content: unknown }>;
  tools: Array<{ name: string; description?: string; input_schema?: unknown }>;
  raw: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface FakeAnthropicReply {
  text?: string;
  tool_uses?: Array<{ id?: string; name: string; input: Record<string, unknown> }>;
  stop_reason?: string;
  /** null = omit usage. */
  usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } | null;
  status?: number;
  headers?: Record<string, string>;
  errorType?: string;
  error?: string;
  delayMs?: number;
}

export type FakeAnthropicHandler = FakeAnthropicReply | ((req: FakeAnthropicRequest) => FakeAnthropicReply | Promise<FakeAnthropicReply>);

export interface FakeAnthropic {
  url: string;
  close(): Promise<void>;
  requests: RecordedRequest[];
  messageRequests(): FakeAnthropicRequest[];
  queueReply(reply: FakeAnthropicHandler): void;
  setModels(ids: string[]): void;
}

function validate(body: Record<string, unknown>): string | null {
  if (typeof body.model !== 'string' || !body.model) return 'model: Field required';
  if (typeof body.max_tokens !== 'number') return 'max_tokens: Field required';
  const messages = body.messages;
  if (!Array.isArray(messages) || !messages.length) return 'messages: at least one message is required';
  let prevRole: string | null = null;
  let prevToolUses = new Set<string>();
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as { role?: unknown; content?: unknown };
    if (m.role !== 'user' && m.role !== 'assistant') return `messages.${i}.role: Input should be 'user' or 'assistant'`;
    if (i === 0 && m.role !== 'user') return 'messages: first message must use the "user" role';
    if (m.role === prevRole) return 'messages: roles must alternate between "user" and "assistant"';
    const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? m.content : null;
    if (!blocks || !blocks.length) return `messages.${i}: content must be non-empty`;
    const toolUses = new Set<string>();
    let seenNonResult = false;
    for (const b of blocks as Array<Record<string, unknown>>) {
      if (b.type === 'text') {
        if (typeof b.text !== 'string' || !b.text.trim()) return `messages.${i}: text content blocks must contain non-whitespace text`;
        seenNonResult = true;
      } else if (b.type === 'tool_use') {
        if (m.role !== 'assistant') return `messages.${i}: tool_use only allowed in assistant messages`;
        if (typeof b.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(b.id)) return `messages.${i}: tool_use.id: String should match pattern '^[a-zA-Z0-9_-]+$'`;
        toolUses.add(b.id);
      } else if (b.type === 'tool_result') {
        if (m.role !== 'user') return `messages.${i}: tool_result only allowed in user messages`;
        if (seenNonResult) return `messages.${i}: tool_result blocks must come first`;
        if (!prevToolUses.has(String(b.tool_use_id))) return `messages.${i}: unexpected tool_use_id found in tool_result blocks: ${String(b.tool_use_id)}`;
      } else return `messages.${i}: unknown block type ${String(b.type)}`;
    }
    prevRole = m.role;
    prevToolUses = toolUses;
  }
  return null;
}

export async function startFakeAnthropic(opts: { apiKey?: string; models?: string[] } = {}): Promise<FakeAnthropic> {
  let models = opts.models ?? ['claude-test-1'];
  const queue: FakeAnthropicHandler[] = [];
  const reqs: FakeAnthropicRequest[] = [];
  const authorized = (req: RecordedRequest) => !opts.apiKey || req.headers['x-api-key'] === opts.apiKey;
  const server = await startFakeHttpServer(async (req, res) => {
    if (req.path.startsWith('/v1/') && !authorized(req)) {
      return sendJson(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    }
    if (req.path.startsWith('/v1/') && req.headers['anthropic-version'] !== '2023-06-01') {
      return sendJson(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'anthropic-version header is required' } });
    }
    if (req.method === 'GET' && req.path === '/v1/models') {
      return sendJson(res, 200, {
        data: models.map((id) => ({ type: 'model', id, display_name: id.replace(/-/g, ' '), created_at: '2026-01-01T00:00:00Z' })),
        has_more: false,
        first_id: models[0] ?? null,
        last_id: models[models.length - 1] ?? null,
      });
    }
    if (req.method === 'POST' && req.path === '/v1/messages') {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>;
      const problem = validate(body);
      if (problem) return sendJson(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: problem } });
      const parsed: FakeAnthropicRequest = {
        model: String(body.model),
        system: body.system,
        messages: body.messages as FakeAnthropicRequest['messages'],
        tools: Array.isArray(body.tools) ? (body.tools as FakeAnthropicRequest['tools']) : [],
        raw: body,
        headers: req.headers,
      };
      reqs.push(parsed);
      const handler = queue.shift();
      if (!handler) return sendJson(res, 500, { type: 'error', error: { type: 'api_error', message: 'fake-anthropic: no reply queued' } });
      const reply = typeof handler === 'function' ? await handler(parsed) : handler;
      if (reply.delayMs) await delay(reply.delayMs);
      if (reply.status && reply.status >= 400) {
        return sendJson(res, reply.status, { type: 'error', error: { type: reply.errorType ?? 'api_error', message: reply.error ?? 'fake error' } }, reply.headers ?? {});
      }
      const content: Array<Record<string, unknown>> = [];
      if (reply.text) content.push({ type: 'text', text: reply.text });
      for (const [i, tu] of (reply.tool_uses ?? []).entries()) content.push({ type: 'tool_use', id: tu.id ?? `toolu_fake_${reqs.length}_${i}`, name: tu.name, input: tu.input });
      const out: Record<string, unknown> = {
        id: `msg_fake_${reqs.length}`,
        type: 'message',
        role: 'assistant',
        model: parsed.model,
        content,
        stop_reason: reply.stop_reason ?? (reply.tool_uses?.length ? 'tool_use' : 'end_turn'),
        stop_sequence: null,
      };
      if (reply.usage !== null) out.usage = reply.usage ?? { input_tokens: 50, output_tokens: 10 };
      return sendJson(res, 200, out, reply.headers ?? {});
    }
    return sendText(res, 404, 'Not Found');
  });
  return {
    url: server.url,
    close: () => server.close(),
    requests: server.requests,
    messageRequests: () => [...reqs],
    queueReply(reply) {
      queue.push(reply);
    },
    setModels(ids) {
      models = ids;
    },
  };
}
