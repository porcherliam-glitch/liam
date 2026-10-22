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

/** Network error codes that occur before any byte of the request reached the server. */
const CONNECT_CODES = new Set([
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
