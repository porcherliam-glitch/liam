// HTTP plumbing shared by every provider adapter and the Ollama service: JSON requests over fetch with timeout and
// AbortSignal, NDJSON streaming with an idle timeout, Retry-After parsing and the ONE error classification used by all
// providers (SPEC §4.2, §6.2).
// Key decisions:
// - details.requestSent tells the budget whether the provider may have received the call. It is false only when the
//   failure provably happened before the request left this PC (connect-phase network errors, abort before sending).
//   HTTP responses and failures after the connection was established count as sent (never under-book costs).
// - details.billable marks failures where the provider may still charge: 5xx, timeouts, aborts after sending and lost
//   connections. 4xx responses (auth, rate limit, bad request, unknown model) are rejections and never billable.
// - details.retryable marks transient failures (5xx, network, timeout, 408, 429) that justify a retry/fallback.
// - API keys travel only in request headers. Provider error texts are redacted and truncated before they are stored
//   in error details; URLs never contain secrets.
// - Default transport is providerFetch (node:http/https), NOT the global fetch: undici's built-in 300 s
//   headersTimeout/bodyTimeout would cut off non-streaming model answers that take longer than 5 minutes (slow GPU,
//   CPU offload, queued second agent), whatever settings.agents.modelTimeoutSec says. The only limits are the
//   caller's AbortSignal / request timeout and a 10 s connect timeout.
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from 'node:http';
import { Agent as HttpsAgent, request as httpsRequest } from 'node:https';
import { pipeline, type Readable } from 'node:stream';
import { constants as zlibConstants, createBrotliDecompress, createGunzip } from 'node:zlib';
import { NovaError } from '../core/errors';
import { redactString } from '../core/redact';

export type ProviderFamily = 'ollama' | 'cloud';

/** Machine-readable details attached to every provider NovaError (`error.details`). */
export interface ProviderErrorDetails {
  providerId?: string;
  status?: number;
  requestSent: boolean;
  billable: boolean;
  retryable: boolean;
  retryAfterMs?: number;
  timedOut?: boolean;
  providerMessage?: string;
  networkCode?: string;
}

export interface HttpContext {
  fetch: typeof fetch;
  /** German display name used in messages, e.g. "Ollama" or "OpenAI". */
  label: string;
  family: ProviderFamily;
  providerId?: string;
}

export interface HttpRequest {
  method: 'GET' | 'POST' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  /** JSON-serialised when given. */
  body?: unknown;
  signal?: AbortSignal;
  /** Overall timeout (requestJson/requestText) or idle timeout between chunks (requestNdjson). */
  timeoutMs: number;
  /** German message for HTTP 404 (e.g. "Das Modell „x“ ist nicht installiert."). */
  notFoundMessage?: string;
}

export interface HttpTextResponse {
  status: number;
  headers: Headers;
  text: string;
}

const MAX_TIMER_MS = 2_147_483_647;

/** Error code of providerFetch's connect timeout (nothing was sent, like a refused connection). */
export const CONNECT_TIMEOUT_CODE = 'CONNECT_TIMEOUT';

/** Network error codes that occur before any byte of the request reached the server. */
const CONNECT_CODES = new Set([
  CONNECT_TIMEOUT_CODE,
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EAI_FAIL',
  'EAI_NONAME',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
  'ENETDOWN',
  'EADDRNOTAVAIL',
  'UND_ERR_CONNECT_TIMEOUT',
  'EPROTO',
]);

const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_NOT_YET_VALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
]);

/** Reads the provider details from any thrown value (null when it is not a provider error). */
export function providerErrorDetails(e: unknown): ProviderErrorDetails | null {
  if (!(e instanceof NovaError)) return null;
  const d = e.details as Partial<ProviderErrorDetails> | undefined;
  if (!d || typeof d !== 'object' || typeof d.requestSent !== 'boolean') return null;
  return d as ProviderErrorDetails;
}

/** Creates a NovaError with provider details; severity follows retryability. */
export function providerError(code: string, message: string, details: ProviderErrorDetails, cause?: unknown): NovaError {
  return new NovaError(code, message, {
    severity: code === 'CANCELLED' ? 'warning' : details.retryable ? 'retryable' : 'blocker',
    details,
    cause,
    autoFixable: details.retryable,
  });
}

/** Extracts a short, redacted error text from a provider error body (OpenAI, Anthropic, Ollama shapes). */
export function extractProviderMessage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  let msg: string | undefined;
  try {
    const j = JSON.parse(trimmed) as unknown;
    if (typeof j === 'string') msg = j;
    else if (j && typeof j === 'object') {
      const o = j as Record<string, unknown>;
      const err = o.error;
      if (typeof err === 'string') msg = err;
      else if (err && typeof err === 'object' && typeof (err as Record<string, unknown>).message === 'string') msg = (err as Record<string, unknown>).message as string;
      else if (typeof o.message === 'string') msg = o.message;
      else if (typeof o.detail === 'string') msg = o.detail;
    }
  } catch {
    msg = trimmed.startsWith('<') ? undefined : trimmed; // ignore HTML error pages
  }
  if (!msg) return undefined;
  return redactString(msg.replace(/\s+/g, ' ').trim()).slice(0, 500);
}

/** Retry-After in ms: `retry-after-ms` (OpenAI), `retry-after` seconds or HTTP date. */
export function parseRetryAfter(headers: Headers, now: number = Date.now()): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms && /^\d+(\.\d+)?$/.test(ms.trim())) return Math.ceil(Number(ms.trim()));
  const ra = headers.get('retry-after');
  if (!ra) return undefined;
  const t = ra.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.ceil(Number(t) * 1000);
  const date = Date.parse(t);
  if (!Number.isNaN(date)) return Math.max(0, date - now);
  return undefined;
}

function networkCode(e: unknown): string | undefined {
  const pick = (v: unknown): string | undefined => {
    if (!v || typeof v !== 'object') return undefined;
    const o = v as { code?: unknown; errors?: unknown[]; cause?: unknown };
    if (typeof o.code === 'string') return o.code;
    if (Array.isArray(o.errors)) for (const x of o.errors) {
      const c = pick(x);
      if (c) return c;
    }
    return undefined;
  };
  if (e && typeof e === 'object') {
    const cause = (e as { cause?: unknown }).cause;
    return pick(cause) ?? pick(e);
  }
  return undefined;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

/** Error for a non-2xx HTTP response. */
export function httpStatusError(ctx: HttpContext, status: number, headers: Headers, text: string, notFoundMessage?: string): NovaError {
  const providerMessage = extractProviderMessage(text);
  const suffix = providerMessage ? ` Meldung des Anbieters: ${providerMessage}` : '';
  const base = { providerId: ctx.providerId, status, requestSent: true, providerMessage };
  if (status === 401 || status === 403) {
    const msg =
      ctx.family === 'ollama'
        ? `${ctx.label} hat die Anfrage abgelehnt (HTTP ${status}).${suffix}`
        : `${ctx.label}: Der API-Schlüssel wurde abgelehnt oder hat keine Berechtigung (HTTP ${status}). Bitte den Schlüssel unter „Modelle“ prüfen.${suffix}`;
    return providerError('PROVIDER_AUTH', msg, { ...base, billable: false, retryable: false });
  }
  if (status === 429) {
    return providerError('PROVIDER_RATE_LIMIT', `${ctx.label}: Das Anfragelimit des Anbieters ist erreicht (HTTP 429). NOVA wartet kurz und versucht es erneut.${suffix}`, {
      ...base,
      billable: false,
      retryable: true,
      retryAfterMs: parseRetryAfter(headers),
    });
  }
  if (status === 404) {
    return providerError('MODEL_UNAVAILABLE', notFoundMessage ? `${notFoundMessage}${suffix}` : `${ctx.label}: Das Modell oder die Adresse wurde nicht gefunden (HTTP 404).${suffix}`, {
      ...base,
      billable: false,
      retryable: false,
    });
  }
  if (status >= 500) {
    return providerError('PROVIDER_ERROR', `${ctx.label} meldet einen Serverfehler (HTTP ${status}).${suffix}`, { ...base, billable: true, retryable: true });
  }
  if (status === 408) {
    return providerError('PROVIDER_ERROR', `${ctx.label} hat die Anfrage wegen Zeitüberschreitung abgebrochen (HTTP 408).${suffix}`, { ...base, billable: false, retryable: true });
  }
  return providerError('PROVIDER_ERROR', `${ctx.label} hat die Anfrage abgelehnt (HTTP ${status}).${suffix}`, { ...base, billable: false, retryable: false });
}

interface CallState {
  callerAborted: boolean;
  timedOut: boolean;
  responseReceived: boolean;
}

/** Classifies anything thrown by fetch / body reading into a provider NovaError. */
function classifyThrown(e: unknown, ctx: HttpContext, req: HttpRequest, state: CallState): NovaError {
  if (e instanceof NovaError && providerErrorDetails(e)) return e;
  if (state.callerAborted || (req.signal?.aborted && !state.timedOut)) {
    return providerError(
      'CANCELLED',
      `Die Anfrage an ${ctx.label} wurde abgebrochen.`,
      { providerId: ctx.providerId, requestSent: true, billable: true, retryable: false },
      req.signal?.reason ?? e,
    );
  }
  if (state.timedOut) {
    const sec = Math.round(req.timeoutMs / 1000);
    return providerError('PROVIDER_ERROR', `${ctx.label} hat nicht rechtzeitig geantwortet (Zeitüberschreitung nach ${sec} s).`, {
      providerId: ctx.providerId,
      requestSent: true,
      billable: true,
      retryable: true,
      timedOut: true,
    }, e);
  }
  const code = networkCode(e);
  if (!state.responseReceived && code && TLS_CODES.has(code)) {
    return providerError('PROVIDER_ERROR', `Das Sicherheitszertifikat von ${ctx.label} ist ungültig (${code}). Die Verbindung wurde nicht aufgebaut.`, {
      providerId: ctx.providerId,
      requestSent: false,
      billable: false,
      retryable: false,
      networkCode: code,
    }, e);
  }
  if (!state.responseReceived && code && CONNECT_CODES.has(code)) {
    if (ctx.family === 'ollama') {
      return providerError('OLLAMA_UNREACHABLE', `Ollama ist nicht erreichbar (${originOf(req.url)}). Bitte Ollama starten oder unter „Modelle“ die Adresse prüfen.`, {
        providerId: ctx.providerId,
        requestSent: false,
        billable: false,
        retryable: true,
        networkCode: code,
      }, e);
    }
    return providerError('PROVIDER_ERROR', `${ctx.label} ist nicht erreichbar (${code}). Bitte Internetverbindung und Adresse prüfen.`, {
      providerId: ctx.providerId,
      requestSent: false,
      billable: false,
      retryable: true,
      networkCode: code,
    }, e);
  }
  const detail = e instanceof Error ? redactString(e.message).slice(0, 200) : 'unbekannter Fehler';
  return providerError('PROVIDER_ERROR', `Die Verbindung zu ${ctx.label} wurde unterbrochen (${code ?? detail}).`, {
    providerId: ctx.providerId,
    requestSent: true,
    billable: true,
    retryable: true,
    networkCode: code,
  }, e);
}

interface StartedCall {
  state: CallState;
  init: RequestInit;
  /** Restarts the timer (idle timeout for streams). */
  touch(): void;
  dispose(): void;
}

function startCall(ctx: HttpContext, req: HttpRequest): StartedCall {
  if (req.signal?.aborted) {
    throw providerError(
      'CANCELLED',
      `Die Anfrage an ${ctx.label} wurde abgebrochen.`,
      { providerId: ctx.providerId, requestSent: false, billable: false, retryable: false },
      req.signal.reason,
    );
  }
  const controller = new AbortController();
  const state: CallState = { callerAborted: false, timedOut: false, responseReceived: false };
  const onAbort = () => {
    state.callerAborted = true;
    controller.abort(req.signal?.reason);
  };
  req.signal?.addEventListener('abort', onAbort, { once: true });
  const ms = Math.max(1, Math.min(MAX_TIMER_MS, Math.floor(req.timeoutMs)));
  let timer: NodeJS.Timeout | null = null;
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      state.timedOut = true;
      controller.abort(new DOMException('Zeitüberschreitung', 'TimeoutError'));
    }, ms);
  };
  arm();
  const headers: Record<string, string> = { accept: 'application/json', ...(req.headers ?? {}) };
  let body: string | undefined;
  if (req.body !== undefined) {
    body = JSON.stringify(req.body);
    headers['content-type'] = 'application/json';
  }
  return {
    state,
    init: { method: req.method, headers, body, signal: controller.signal },
    touch: arm,
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      req.signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** Sends a request and returns the raw text. Throws provider NovaErrors (HTTP status, network, timeout, abort). */
export async function requestText(ctx: HttpContext, req: HttpRequest): Promise<HttpTextResponse> {
  const call = startCall(ctx, req);
  try {
    const res = await ctx.fetch(req.url, call.init);
    call.state.responseReceived = true;
    const text = await res.text();
    if (!res.ok) throw httpStatusError(ctx, res.status, res.headers, text, req.notFoundMessage);
    return { status: res.status, headers: res.headers, text };
  } catch (e) {
    throw classifyThrown(e, ctx, req, call.state);
  } finally {
    call.dispose();
  }
}

/** Sends a request and parses the JSON body (null for an empty body). */
export async function requestJson(ctx: HttpContext, req: HttpRequest): Promise<{ data: unknown; headers: Headers; status: number }> {
  const res = await requestText(ctx, req);
  if (!res.text.trim()) return { data: null, headers: res.headers, status: res.status };
  try {
    return { data: JSON.parse(res.text) as unknown, headers: res.headers, status: res.status };
  } catch (e) {
    throw invalidResponse(ctx, 'keine gültigen JSON-Daten', e);
  }
}

/** Error for a 2xx response whose content cannot be used. */
export function invalidResponse(ctx: HttpContext, what: string, cause?: unknown): NovaError {
  return providerError('PROVIDER_ERROR', `${ctx.label} hat eine unerwartete Antwort geschickt (${what}).`, {
    providerId: ctx.providerId,
    requestSent: true,
    billable: true,
    retryable: false,
  }, cause);
}

/**
 * Streams an NDJSON response (Ollama pull). `onLine` is called for each parsed object; throwing inside `onLine`
 * aborts the stream and rejects with that error. `req.timeoutMs` is an IDLE timeout (reset on every chunk).
 */
export async function requestNdjson(ctx: HttpContext, req: HttpRequest, onLine: (value: unknown) => void): Promise<void> {
  const call = startCall(ctx, req);
  let callbackError: unknown = null;
  try {
    const res = await ctx.fetch(req.url, call.init);
    call.state.responseReceived = true;
    if (!res.ok) {
      const text = await res.text();
      throw httpStatusError(ctx, res.status, res.headers, text, req.notFoundMessage);
    }
    if (!res.body) throw invalidResponse(ctx, 'leere Antwort');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const handle = (line: string) => {
      const t = line.trim();
      if (!t) return;
      let value: unknown;
      try {
        value = JSON.parse(t);
      } catch (e) {
        throw invalidResponse(ctx, 'ungültige Zeile im Datenstrom', e);
      }
      try {
        onLine(value);
      } catch (e) {
        callbackError = e;
        throw e;
      }
    };
    for (;;) {
      const { done, value } = await reader.read();
      call.touch();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl = buffer.indexOf('\n');
      while (nl !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        try {
          handle(line);
        } catch (e) {
          await reader.cancel().catch(() => undefined);
          throw e;
        }
        nl = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    handle(buffer);
  } catch (e) {
    if (callbackError !== null && e === callbackError) throw e;
    throw classifyThrown(e, ctx, req, call.state);
  } finally {
    call.dispose();
  }
}

/** Joins a base URL and a path without double slashes. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

// ---------------------------------------------------------------------------------------------------------------
// providerFetch: fetch-compatible transport without built-in response timeouts
// ---------------------------------------------------------------------------------------------------------------

const CONNECT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);
/** Headers kept when a redirect leaves the origin; credentials (authorization, x-api-key, custom key headers) are dropped. */
const CROSS_ORIGIN_SAFE_HEADERS = new Set(['accept', 'accept-encoding', 'accept-language', 'content-type', 'user-agent']);
/** Valid HTTP reason phrase (anything else is dropped instead of making the Response constructor throw). */
const REASON_PHRASE = /^[\t\x20-\x7e\x80-\xff]*$/;
// Idle keep-alive sockets close after 4 s (like undici). Node only destroys FREE sockets on this timeout; a socket
// with a request in flight merely emits an ignored 'timeout' event, so long answers are not affected.
const httpAgent = new HttpAgent({ keepAlive: true, timeout: 4_000 });
const httpsAgent = new HttpsAgent({ keepAlive: true, timeout: 4_000 });

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
}

function requestBody(body: RequestInit['body']): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof Uint8Array) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  throw new TypeError('providerFetch supports string and byte bodies only');
}

function decoderFor(encoding: string): NodeJS.ReadWriteStream | null {
  // Lenient flush modes (like undici) so a gzip stream without proper trailer still yields its data.
  if (encoding === 'gzip' || encoding === 'x-gzip') return createGunzip({ flush: zlibConstants.Z_SYNC_FLUSH, finishFlush: zlibConstants.Z_SYNC_FLUSH });
  if (encoding === 'br') return createBrotliDecompress();
  return null;
}

interface PreparedRequest {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: Buffer | undefined;
  signal: AbortSignal | undefined;
}

/** Method, body and headers for the next hop of a redirect (fetch semantics, credentials only within the origin). */
function redirectRequest(prev: PreparedRequest, status: number, next: URL): PreparedRequest {
  let method = prev.method;
  let body = prev.body;
  const headers = { ...prev.headers };
  if ((status === 303 && method !== 'GET' && method !== 'HEAD') || ((status === 301 || status === 302) && method === 'POST')) {
    method = 'GET';
    body = undefined;
    delete headers['content-type'];
  }
  const sameOrigin = next.origin === prev.url.origin || (next.hostname === prev.url.hostname && next.protocol === 'https:');
  if (!sameOrigin) for (const key of Object.keys(headers)) if (!CROSS_ORIGIN_SAFE_HEADERS.has(key)) delete headers[key];
  return { url: next, method, headers, body, signal: prev.signal };
}

function send(prep: PreparedRequest, redirects: number): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const { url, method, signal } = prep;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      reject(new TypeError(`providerFetch: unsupported protocol ${url.protocol}`));
      return;
    }
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const secure = url.protocol === 'https:';
    const headers = { ...prep.headers };
    if (prep.body) headers['content-length'] = String(prep.body.length);
    const req = (secure ? httpsRequest : httpRequest)(url, { method, headers, agent: secure ? httpsAgent : httpAgent });

    let settled = false;
    let res: IncomingMessage | null = null;
    let connectTimer: NodeJS.Timeout | null = null;
    let failBody: ((e: unknown) => void) | null = null;
    const clearConnect = () => {
      if (connectTimer) clearTimeout(connectTimer);
      connectTimer = null;
    };
    const detach = () => signal?.removeEventListener('abort', onAbort);
    // Terminal failure: rejects the pending promise, or errors the body stream once the Response was handed out.
    const fail = (e: unknown) => {
      clearConnect();
      detach();
      if (!settled) {
        settled = true;
        reject(e);
      } else {
        failBody?.(e);
      }
    };
    function onAbort() {
      fail(abortReason(signal!));
      req.destroy();
      res?.destroy();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    req.on('error', fail);
    req.on('socket', (socket) => {
      if (!socket.connecting) return; // reused keep-alive socket
      connectTimer = setTimeout(() => {
        const e = Object.assign(new Error(`Connection to ${url.host} not established within ${CONNECT_TIMEOUT_MS / 1000} s`), { code: CONNECT_TIMEOUT_CODE });
        fail(e);
        req.destroy(e);
      }, CONNECT_TIMEOUT_MS);
      socket.once(secure ? 'secureConnect' : 'connect', clearConnect);
    });

    req.on('response', (incoming) => {
      clearConnect();
      res = incoming;
      const status = incoming.statusCode ?? 0;
      const location = incoming.headers.location;
      if (REDIRECT_STATUSES.has(status) && location && redirects < MAX_REDIRECTS) {
        incoming.resume();
        detach();
        settled = true;
        let next: URL;
        try {
          next = new URL(location, url);
        } catch (e) {
          reject(e);
          return;
        }
        send(redirectRequest(prep, status, next), redirects + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status > 599) {
        fail(new TypeError(`providerFetch: invalid HTTP status ${status}`));
        incoming.destroy();
        return;
      }
      const responseHeaders = new Headers();
      const raw = incoming.rawHeaders;
      for (let i = 0; i + 1 < raw.length; i += 2) {
        try {
          responseHeaders.append(raw[i], raw[i + 1]);
        } catch {
          /* header with characters the Headers class rejects – skipped */
        }
      }
      let body: ReadableStream<Uint8Array> | null = null;
      if (method === 'HEAD' || NULL_BODY_STATUSES.has(status)) {
        detach();
        incoming.resume();
      } else {
        const decoder = decoderFor(String(incoming.headers['content-encoding'] ?? '').trim().toLowerCase());
        const source: Readable = decoder ? (pipeline(incoming, decoder, () => undefined) as unknown as Readable) : incoming;
        let done = false;
        body = new ReadableStream<Uint8Array>(
          {
            start(controller) {
              failBody = (e) => {
                if (done) return;
                done = true;
                try {
                  controller.error(e);
                } catch {
                  /* already closed */
                }
              };
              source.on('data', (chunk: Buffer) => {
                if (done) return;
                controller.enqueue(new Uint8Array(chunk));
                if ((controller.desiredSize ?? 1) <= 0) source.pause();
              });
              source.once('end', () => {
                if (done) return;
                done = true;
                detach();
                controller.close();
              });
              source.once('error', fail);
              source.once('close', () => {
                if (!done) fail(Object.assign(new Error('Connection closed before the response was complete'), { code: 'ECONNRESET' }));
              });
            },
            pull() {
              source.resume();
            },
            cancel() {
              done = true;
              detach();
              req.destroy();
              source.destroy();
            },
          },
          { highWaterMark: 64 * 1024, size: (chunk) => chunk.byteLength },
        );
      }
      const statusText = incoming.statusMessage && REASON_PHRASE.test(incoming.statusMessage) ? incoming.statusMessage : '';
      settled = true;
      resolve(new Response(body, { status, statusText, headers: responseHeaders }));
    });

    if (prep.body) req.end(prep.body);
    else req.end();
  });
}

/**
 * fetch-compatible HTTP client over node:http/https for all provider calls (Ollama, OpenAI-compatible, Anthropic).
 * Unlike the global fetch (undici: 300 s headersTimeout and bodyTimeout) it has no response timeout of its own, so a
 * non-streaming answer may take as long as the caller allows (settings.agents.modelTimeoutSec, up to 60 min).
 * Supported: string/URL input, string or byte bodies, AbortSignal, gzip/br decoding, up to 5 redirects (credentials
 * are only forwarded within the origin or to https on the same host), keep-alive, 10 s connect timeout.
 */
export const providerFetch: typeof fetch = (input, init = {}) => {
  if (typeof input !== 'string' && !(input instanceof URL)) return Promise.reject(new TypeError('providerFetch accepts URL strings only'));
  let prep: PreparedRequest;
  try {
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((value, key) => {
      headers[key] = value;
    });
    headers['accept-encoding'] ??= 'gzip, br';
    headers['user-agent'] ??= 'node';
    prep = { url: new URL(input), method: (init.method ?? 'GET').toUpperCase(), headers, body: requestBody(init.body), signal: init.signal ?? undefined };
  } catch (e) {
    return Promise.reject(e);
  }
  return send(prep, 0);
};
