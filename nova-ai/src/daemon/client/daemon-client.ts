// DaemonClient – typed RPC + event-stream client for the NOVA daemon. Used by Electron main (DaemonSupervisor),
// scripts and integration tests. Pure Node (node:http/net/fs/crypto), no Electron imports, no runtime dependency on
// zod or daemon internals (shared contract types are imported type-only).
//
// Key decisions:
// - Transport: HTTP/1.1 over the daemon's Windows named pipe or unix socket (`socketPath`), Bearer token auth.
// - Every NEW connection is verified before the token is sent on it (SPEC §6.1): a custom keep-alive Agent creates
//   sockets asynchronously, runs `GET /health` with a fresh nonce on that very socket and checks the HMAC proof.
//   Keep-alive sockets are pooled per token (pool key includes a token tag), so a socket verified for one token is
//   never reused for another. A proof mismatch fails with DAEMON_UNAVAILABLE ("fremdes Programm") after re-reading
//   the token file a few times (a freshly started daemon binds the endpoint shortly before it writes its new token).
// - rpc(): default timeout 120 s, 30 min for long methods (projects.create, backup.*, data.*, memory.export/import,
//   checkpoints.restore, integrations.install). On HTTP 401 the token file is re-read and the call is retried once.
//   A request that failed with ECONNRESET on a reused keep-alive socket (server closed the idle socket at the same
//   moment) is retried once – the documented node:http pattern; the daemon never processed such a request. On a
//   Windows named pipe the same race surfaces as EPIPE (the write fails because the server end is already closed), so
//   EPIPE on a reused socket is retried once as well.
// - subscribe(): SSE with automatic reconnect (exponential backoff 0.5 s → 10 s, reset after a successful connect),
//   re-reads the token file before every (re)connect and verifies the proof first. A silent stream (no data and no
//   ping for 45 s; the daemon pings every 15 s) counts as lost. Events are hints: after 'reconnecting' → 'connected'
//   callers should re-fetch state via RPC (events may have been missed; NovaEvent.seq shows gaps).
// - Errors: daemon errors keep their code/message/details; transport problems become DaemonRpcError with code
//   DAEMON_UNAVAILABLE (or UNAUTHORIZED / VALIDATION) and a machine-readable `reason`.
import { Agent, request, type ClientRequest, type ClientRequestArgs, type IncomingMessage, type RequestOptions } from 'node:http';
import type { Duplex } from 'node:stream';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { RpcMethod, RpcParams, RpcResult } from '@shared/rpc';
import type { AnyNovaEvent, NovaEventType } from '@shared/events';
import { CLIENT_MESSAGES, DaemonRpcError, transportError, type DaemonErrorReason } from './errors';
import { handshake, type DaemonHealth, type HandshakeResult } from './handshake';
import { tokenTag } from './proof';
import { SseParser } from './sse-parser';

export const DEFAULT_RPC_TIMEOUT_MS = 120_000;
export const LONG_RPC_TIMEOUT_MS = 30 * 60_000;
/** Same limit as the server (SPEC §4.1): larger requests are rejected locally without sending anything. */
export const MAX_RPC_REQUEST_BYTES = 25 * 1024 * 1024;
const MAX_RPC_RESPONSE_BYTES = 512 * 1024 * 1024;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_SSE_IDLE_TIMEOUT_MS = 45_000;
const DEFAULT_BACKOFF_MIN_MS = 500;
const DEFAULT_BACKOFF_MAX_MS = 10_000;
/** Re-read attempts after a proof mismatch (new daemon: endpoint bound, token not yet written). */
const MISMATCH_RETRIES = 3;
const MISMATCH_RETRY_DELAY_MS = 250;

const LONG_METHODS = new Set<string>(['projects.create', 'memory.export', 'memory.import', 'checkpoints.restore', 'integrations.install']);
const LONG_PREFIXES = ['backup.', 'data.'];

/** True for RPC methods that may legitimately run for many minutes (SPEC §6.1). */
export function isLongRpcMethod(method: string): boolean {
  return LONG_METHODS.has(method) || LONG_PREFIXES.some((p) => method.startsWith(p));
}

/** Timeout used for an RPC call when the caller gives none. */
export function rpcTimeoutFor(method: string, defaultTimeoutMs: number = DEFAULT_RPC_TIMEOUT_MS): number {
  return isLongRpcMethod(method) ? Math.max(LONG_RPC_TIMEOUT_MS, defaultTimeoutMs) : defaultTimeoutMs;
}

export interface DaemonClientOptions {
  /** Named pipe (`\\.\pipe\…`) or unix socket path. */
  endpoint: string;
  /** Token file of the daemon (`<dataDir>/daemon.token`); re-read on 401, proof mismatch and every SSE reconnect. */
  tokenPath?: string;
  /** Fixed token (tests/scripts). With tokenPath as well, this is only the initial value. */
  token?: string;
  /** Default timeout for normal methods (120 s). Long methods use at least 30 min. */
  defaultTimeoutMs?: number;
  /** Timeout of the per-connection proof handshake (10 s). */
  handshakeTimeoutMs?: number;
  /** Reconnect backoff of subscribe() (0.5 s → 10 s). */
  reconnect?: { minMs?: number; maxMs?: number };
  /** A stream without any data for this long is treated as lost (45 s; the daemon pings every 15 s). */
  sseIdleTimeoutMs?: number;
}

export interface RpcCallOptions {
  timeoutMs?: number;
}

export type SubscriptionState = 'connected' | 'reconnecting' | 'closed';

export interface SubscribeOptions {
  /** Server-side filter (`GET /events?types=a,b`). */
  types?: NovaEventType[];
}

export type { DaemonHealth };

interface NovaRequestArgs extends RequestOptions {
  /** Token the request carries; used by the agent for the pool key and the proof check of new sockets. */
  novaToken?: string;
}

type ConnectCallback = (err: Error | null, stream: Duplex) => void;

/** Failure of the HTTP exchange itself (not of the handshake), remembering whether a pooled socket was reused. */
class PostFailure extends Error {
  constructor(
    readonly original: unknown,
    readonly reusedSocket: boolean,
  ) {
    super(original instanceof Error ? original.message : String(original));
    this.name = 'PostFailure';
  }
}

/** Maps a failed handshake to the client error. Exported for tests. */
export function handshakeError(result: Exclude<HandshakeResult, { kind: 'ok' }>): DaemonRpcError {
  switch (result.kind) {
    case 'mismatch':
      return transportError('foreign', CLIENT_MESSAGES.foreign, { mismatch: true, pid: result.health.pid });
    case 'unverified':
      return transportError('token_missing', CLIENT_MESSAGES.tokenMissing);
    case 'foreign':
      return transportError('foreign', CLIENT_MESSAGES.foreign, { detail: result.detail });
    case 'timeout':
      return transportError('timeout', CLIENT_MESSAGES.notResponding, { detail: result.detail });
    case 'closed':
      return transportError('connection_lost', CLIENT_MESSAGES.connectionLost, { detail: result.detail });
    case 'none':
      return transportError('unreachable', CLIENT_MESSAGES.unreachable, { code: result.code });
  }
}

function isRetryableMismatch(e: unknown): boolean {
  if (!(e instanceof DaemonRpcError)) return false;
  if (e.reason === 'token_missing') return true;
  const d = e.details as { mismatch?: unknown } | undefined;
  return e.reason === 'foreign' && d?.mismatch === true;
}

function errnoCode(e: unknown): string | undefined {
  return e && typeof e === 'object' && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : undefined;
}

/**
 * True when a request failed on a REUSED keep-alive socket in a way that shows the daemon never processed it: the
 * daemon closed the idle socket at the same moment (ECONNRESET / "socket hang up"), or the write already failed
 * because the server end was closed (EPIPE – how a Windows named pipe reports that race). Exported for tests.
 */
export function isStaleKeepAliveFailure(original: unknown, reusedSocket: boolean): boolean {
  if (!reusedSocket) return false;
  const code = errnoCode(original);
  return code === 'ECONNRESET' || code === 'EPIPE' || (original instanceof Error && original.message === 'socket hang up');
}

function toDaemonError(e: unknown): DaemonRpcError {
  if (e instanceof DaemonRpcError) return e;
  const original = e instanceof PostFailure ? e.original : e;
  if (original instanceof DaemonRpcError) return original;
  const code = errnoCode(original);
  const message = original instanceof Error ? original.message : String(original);
  if (code === 'ENOENT' || code === 'ECONNREFUSED') return transportError('unreachable', CLIENT_MESSAGES.unreachable, { code }, original);
  return transportError('connection_lost', CLIENT_MESSAGES.connectionLost, { code: code ?? null, detail: message }, original);
}

function timeoutError(method: string, timeoutMs: number): DaemonRpcError {
  return transportError('timeout', CLIENT_MESSAGES.timeout(Math.max(1, Math.round(timeoutMs / 1000))), { method, timeoutMs });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function isNovaEvent(v: unknown): v is AnyNovaEvent {
  return isPlainObject(v) && typeof v.type === 'string' && typeof v.seq === 'number' && typeof v.ts === 'number' && 'payload' in v;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

/** Keep-alive agent that verifies the daemon's proof on every new socket before the request (and token) is sent. */
class VerifyingAgent extends Agent {
  constructor(private readonly connectVerified: (token: string, cb: ConnectCallback) => void) {
    super({ keepAlive: true, maxSockets: 16, maxFreeSockets: 4 });
  }

  override getName(options?: ClientRequestArgs): string {
    const token = (options as NovaRequestArgs | undefined)?.novaToken;
    return `${super.getName(options)}|${token ? tokenTag(token) : '-'}`;
  }

  override createConnection(options: ClientRequestArgs, callback?: ConnectCallback): Duplex | null | undefined {
    const token = (options as NovaRequestArgs).novaToken;
    if (!callback) throw new Error('VerifyingAgent requires the asynchronous createConnection callback');
    if (!token) {
      process.nextTick(callback, transportError('token_missing', CLIENT_MESSAGES.tokenMissing), undefined as unknown as Duplex);
      return undefined;
    }
    this.connectVerified(token, callback);
    return undefined;
  }
}

interface SubscriptionContext {
  endpoint: string;
  backoffMinMs: number;
  backoffMaxMs: number;
  idleTimeoutMs: number;
  /** Re-reads the token file (if any) and returns the token to use, or null if none is available. */
  tokenForConnect(): string | null;
  connectVerified(token: string, cb: ConnectCallback): void;
}

/** One SSE subscription with its own reconnect loop. */
class EventSubscription {
  private closed = false;
  private attempt = 0;
  private req: ClientRequest | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly ctx: SubscriptionContext,
    private readonly types: NovaEventType[] | null,
    private readonly onEvent: (e: AnyNovaEvent) => void,
    private readonly onState: ((s: SubscriptionState, info?: string) => void) | undefined,
  ) {}

  start(): void {
    this.connect();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearIdle();
    const req = this.req;
    this.req = null;
    req?.destroy();
    this.emitState('closed');
  }

  private emitState(state: SubscriptionState, info?: string): void {
    try {
      this.onState?.(state, info);
    } catch {
      /* listener errors must not break the reconnect loop */
    }
  }

  private connect(): void {
    if (this.closed) return;
    const token = this.ctx.tokenForConnect();
    if (!token) {
      this.fail(null, CLIENT_MESSAGES.tokenMissing);
      return;
    }
    const query = this.types && this.types.length > 0 ? `?types=${encodeURIComponent(this.types.join(','))}` : '';
    const req = request({
      socketPath: this.ctx.endpoint,
      path: `/events${query}`,
      method: 'GET',
      headers: { Accept: 'text/event-stream', Authorization: `Bearer ${token}` },
      createConnection: (_opts: ClientRequestArgs, oncreate: ConnectCallback) => {
        this.ctx.connectVerified(token, oncreate);
        return undefined;
      },
    });
    this.req = req;
    req.on('response', (res) => this.onResponse(req, res));
    req.on('error', (err) => this.fail(req, toDaemonError(err).message));
    req.end();
  }

  private onResponse(req: ClientRequest, res: IncomingMessage): void {
    if (this.closed || this.req !== req) {
      res.destroy();
      return;
    }
    const status = res.statusCode ?? 0;
    if (status !== 200) {
      res.resume();
      const info =
        status === 401
          ? CLIENT_MESSAGES.unauthorized
          : status === 429
            ? 'Zu viele gleichzeitige Ereignisverbindungen zum Hintergrunddienst.'
            : status === 503
              ? 'Der Hintergrunddienst fährt gerade herunter.'
              : `${CLIENT_MESSAGES.badResponse} (HTTP ${status})`;
      this.fail(req, info);
      return;
    }
    this.attempt = 0;
    this.emitState('connected');
    const decoder = new StringDecoder('utf8');
    const parser = new SseParser((data) => this.dispatch(data));
    this.armIdle(req);
    res.on('data', (chunk: Buffer) => {
      if (this.req !== req) return;
      this.armIdle(req);
      try {
        parser.push(decoder.write(chunk));
      } catch {
        this.fail(req, CLIENT_MESSAGES.badResponse);
      }
    });
    const lost = () => this.fail(req, CLIENT_MESSAGES.connectionLost);
    res.on('end', lost);
    res.on('close', lost);
    res.on('error', lost);
  }

  private dispatch(data: string): void {
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      return;
    }
    if (!isNovaEvent(event)) return;
    try {
      this.onEvent(event);
    } catch {
      /* listener errors must not break the stream */
    }
  }

  private armIdle(req: ClientRequest): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => this.fail(req, CLIENT_MESSAGES.notResponding), this.ctx.idleTimeoutMs);
    this.idleTimer.unref?.();
  }

  private clearIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  /** Ends the current attempt (req = null for "no request was made") and schedules the next one. */
  private fail(req: ClientRequest | null, info: string): void {
    if (this.closed) return;
    if (req && this.req !== req) return; // stale callback of an earlier attempt
    this.req = null;
    this.clearIdle();
    req?.destroy();
    this.emitState('reconnecting', info);
    const wait = Math.min(this.ctx.backoffMaxMs, this.ctx.backoffMinMs * 2 ** Math.min(this.attempt, 20));
    this.attempt++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }
}

export class DaemonClient {
  readonly endpoint: string;
  private readonly tokenPath: string | null;
  private token: string | null;
  private readonly defaultTimeoutMs: number;
  private readonly handshakeTimeoutMs: number;
  private readonly backoffMinMs: number;
  private readonly backoffMaxMs: number;
  private readonly sseIdleTimeoutMs: number;
  private readonly agent: VerifyingAgent;
  private readonly subscriptions = new Set<EventSubscription>();
  private readonly inflight = new Set<ClientRequest>();
  private closed = false;

  constructor(opts: DaemonClientOptions) {
    if (!opts || typeof opts.endpoint !== 'string' || opts.endpoint.length === 0) {
      throw new DaemonRpcError('VALIDATION', 'Für die Verbindung zum Hintergrunddienst fehlt der Kommunikationskanal (endpoint).');
    }
    if (!opts.tokenPath && !opts.token) throw new DaemonRpcError('VALIDATION', CLIENT_MESSAGES.missingCredentials);
    this.endpoint = opts.endpoint;
    this.tokenPath = opts.tokenPath ?? null;
    this.token = opts.token ?? null;
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    this.handshakeTimeoutMs = opts.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.backoffMinMs = Math.max(1, opts.reconnect?.minMs ?? DEFAULT_BACKOFF_MIN_MS);
    this.backoffMaxMs = Math.max(this.backoffMinMs, opts.reconnect?.maxMs ?? DEFAULT_BACKOFF_MAX_MS);
    this.sseIdleTimeoutMs = opts.sseIdleTimeoutMs ?? DEFAULT_SSE_IDLE_TIMEOUT_MS;
    this.agent = new VerifyingAgent((token, cb) => this.connectVerified(token, cb));
  }

  /** Checks that the daemon answers and proves knowledge of the token. Returns pid, version and instance id. */
  async health(): Promise<DaemonHealth> {
    this.assertOpen();
    let token = this.peekToken();
    for (let attempt = 0; ; attempt++) {
      const result = await handshake({ endpoint: this.endpoint, token, timeoutMs: this.handshakeTimeoutMs, keepSocket: false });
      if (result.kind === 'ok') return result.health;
      if ((result.kind === 'mismatch' || result.kind === 'unverified') && this.tokenPath && attempt < MISMATCH_RETRIES) {
        await delay(MISMATCH_RETRY_DELAY_MS);
        this.assertOpen();
        this.reloadToken();
        token = this.peekToken();
        continue;
      }
      throw handshakeError(result);
    }
  }

  /** Typed RPC call. Throws DaemonRpcError (daemon error or transport problem). */
  async rpc<M extends RpcMethod>(method: M, params?: RpcParams<M>, opts: RpcCallOptions = {}): Promise<RpcResult<M>> {
    this.assertOpen();
    const timeoutMs = opts.timeoutMs ?? rpcTimeoutFor(method, this.defaultTimeoutMs);
    const id = `req_${randomBytes(8).toString('hex')}`;
    const envelope: Record<string, unknown> = { id, method };
    if (params !== undefined) envelope.params = params;
    let body: Buffer;
    try {
      body = Buffer.from(JSON.stringify(envelope), 'utf8');
    } catch (e) {
      throw new DaemonRpcError('VALIDATION', 'Die Anfrage enthält Werte, die nicht übertragen werden können.', { cause: e });
    }
    if (body.length > MAX_RPC_REQUEST_BYTES) throw transportError('too_large', CLIENT_MESSAGES.tooLarge, { bytes: body.length });

    const deadline = Date.now() + timeoutMs;
    let token = this.requireToken();
    let retried401 = false;
    let mismatchRetries = 0;
    let resetRetried = false;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timeoutError(method, timeoutMs);
      let answer: { status: number; body: Buffer };
      try {
        answer = await this.post(body, token, remaining, method, timeoutMs);
      } catch (e) {
        if (this.closed) throw transportError('closed', CLIENT_MESSAGES.closed);
        if (isRetryableMismatch(e) && this.tokenPath && mismatchRetries < MISMATCH_RETRIES) {
          mismatchRetries++;
          await delay(Math.min(MISMATCH_RETRY_DELAY_MS, deadline - Date.now()));
          this.assertOpen();
          this.reloadToken();
          token = this.requireToken();
          continue;
        }
        if (e instanceof PostFailure && !resetRetried && isStaleKeepAliveFailure(e.original, e.reusedSocket)) {
          resetRetried = true;
          continue;
        }
        throw toDaemonError(e);
      }
      if (answer.status === 401) {
        if (!retried401 && this.tokenPath) {
          retried401 = true;
          this.reloadToken();
          token = this.requireToken();
          continue;
        }
        throw transportError('unauthorized', CLIENT_MESSAGES.unauthorized, { status: 401 });
      }
      return this.decode(answer, id) as RpcResult<M>;
    }
  }

  /**
   * Subscribes to daemon events (SSE) with automatic reconnect. onState reports 'connected', 'reconnecting'
   * (with a German reason) and finally 'closed'. Returns the unsubscribe function.
   */
  subscribe(
    onEvent: (e: AnyNovaEvent) => void,
    onState?: (s: SubscriptionState, info?: string) => void,
    opts: SubscribeOptions = {},
  ): () => void {
    if (this.closed) {
      try {
        onState?.('closed', CLIENT_MESSAGES.closed);
      } catch {
        /* ignore */
      }
      return () => {};
    }
    const sub = new EventSubscription(
      {
        endpoint: this.endpoint,
        backoffMinMs: this.backoffMinMs,
        backoffMaxMs: this.backoffMaxMs,
        idleTimeoutMs: this.sseIdleTimeoutMs,
        tokenForConnect: () => {
          this.reloadToken();
          return this.peekToken();
        },
        connectVerified: (token, cb) => this.connectVerified(token, cb),
      },
      opts.types ?? null,
      onEvent,
      onState,
    );
    this.subscriptions.add(sub);
    sub.start();
    return () => {
      this.subscriptions.delete(sub);
      sub.close();
    };
  }

  /** Closes all subscriptions and connections. Later calls fail with reason 'closed'. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const sub of this.subscriptions) sub.close();
    this.subscriptions.clear();
    for (const req of this.inflight) req.destroy(transportError('closed', CLIENT_MESSAGES.closed));
    this.inflight.clear();
    this.agent.destroy();
  }

  // --- internals -------------------------------------------------------------------------------------------------

  private assertOpen(): void {
    if (this.closed) throw transportError('closed', CLIENT_MESSAGES.closed);
  }

  private readTokenFile(): string | null {
    if (!this.tokenPath) return null;
    try {
      const value = readFileSync(this.tokenPath, 'utf8').trim();
      return value.length > 0 && !/\s/.test(value) ? value : null;
    } catch {
      return null;
    }
  }

  /** Current token or null (reads the token file lazily). */
  private peekToken(): string | null {
    if (this.token === null && this.tokenPath) this.token = this.readTokenFile();
    return this.token;
  }

  private requireToken(): string {
    const token = this.peekToken();
    if (!token) throw transportError('token_missing', CLIENT_MESSAGES.tokenMissing, { tokenPath: this.tokenPath });
    return token;
  }

  /** Re-reads the token file (no-op without tokenPath). Returns true when the token changed. */
  private reloadToken(): boolean {
    if (!this.tokenPath) return false;
    const next = this.readTokenFile();
    const changed = next !== this.token;
    if (next !== null || this.token === null) this.token = next;
    return changed && next !== null;
  }

  /** Opens a socket, verifies the proof for `token` on it and hands it to node:http (or fails with DaemonRpcError). */
  private connectVerified(token: string, cb: ConnectCallback): void {
    handshake({ endpoint: this.endpoint, token, timeoutMs: this.handshakeTimeoutMs, keepSocket: true }).then(
      (result) => {
        if (result.kind === 'ok' && result.socket) {
          if (this.closed) {
            result.socket.destroy();
            cb(transportError('closed', CLIENT_MESSAGES.closed), undefined as unknown as Duplex);
            return;
          }
          cb(null, result.socket);
          return;
        }
        cb(result.kind === 'ok' ? transportError('connection_lost', CLIENT_MESSAGES.connectionLost) : handshakeError(result), undefined as unknown as Duplex);
      },
      (err: unknown) => cb(toDaemonError(err), undefined as unknown as Duplex),
    );
  }

  private post(body: Buffer, token: string, timeoutMs: number, method: string, totalTimeoutMs: number): Promise<{ status: number; body: Buffer }> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const options: NovaRequestArgs = {
        socketPath: this.endpoint,
        path: '/rpc',
        method: 'POST',
        agent: this.agent,
        novaToken: token,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Length': String(body.length),
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
      };
      const req = request(options);
      this.inflight.add(req);
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.inflight.delete(req);
        fn();
      };
      const timer = setTimeout(() => {
        const err = timeoutError(method, totalTimeoutMs);
        settle(() => reject(err));
        req.destroy(err);
      }, timeoutMs);
      req.on('response', (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_RPC_RESPONSE_BYTES) {
            const err = transportError('bad_response', CLIENT_MESSAGES.badResponse, { detail: 'Antwort zu groß' });
            settle(() => reject(err));
            req.destroy(err);
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => settle(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks, size) })));
        res.on('error', (err) => settle(() => reject(new PostFailure(err, req.reusedSocket))));
        res.on('close', () => {
          if (!res.complete) settle(() => reject(new PostFailure(new Error('socket hang up'), req.reusedSocket)));
        });
      });
      req.on('error', (err) => settle(() => reject(err instanceof DaemonRpcError ? err : new PostFailure(err, req.reusedSocket))));
      req.end(body);
    });
  }

  private decode(answer: { status: number; body: Buffer }, id: string): unknown {
    let parsed: unknown;
    try {
      parsed = JSON.parse(answer.body.toString('utf8'));
    } catch {
      throw this.badResponse(answer.status, 'Antwort ist kein JSON');
    }
    if (isPlainObject(parsed) && parsed.ok === true && answer.status === 200) {
      if (parsed.id !== id) throw this.badResponse(answer.status, 'Antwort gehört zu einer anderen Anfrage');
      return parsed.result;
    }
    if (isPlainObject(parsed) && parsed.ok === false && isPlainObject(parsed.error)) {
      const err = parsed.error;
      if (typeof err.code === 'string' && typeof err.message === 'string') {
        throw new DaemonRpcError(err.code, err.message, { details: err.details, status: answer.status, error: err.error });
      }
    }
    throw this.badResponse(answer.status, 'Unerwartetes Antwortformat');
  }

  private badResponse(status: number, detail: string): DaemonRpcError {
    const reason: DaemonErrorReason = 'bad_response';
    return new DaemonRpcError('DAEMON_UNAVAILABLE', CLIENT_MESSAGES.badResponse, { reason, status, details: { reason, status, detail } });
  }
}
