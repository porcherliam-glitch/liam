// RPC/SSE server of the NOVA daemon: node:http on a Windows named pipe or unix socket (SPEC §4.1, §6.1).
// Key decisions:
// - Routes (whitelist): POST /rpc (JSON RpcRequest → RpcResponse), GET /events (SSE), GET /health.
//   Unknown paths → 404, wrong method → 405 (only for authorized callers; unauthorized callers always get 401).
// - Browsers must never talk to the daemon: any request with an Origin (or Sec-Fetch-*) header → 403.
// - Auth: `Authorization: Bearer <token>`, compared as timingSafeEqual(sha256(a), sha256(b)) (no length leak/throw).
//   GET /health also works WITHOUT a token when it carries `X-Nova-Nonce: <32 hex>`; the answer then contains
//   proof = HMAC-SHA256(token, nonce), which clients verify BEFORE they send the token.
// - Body limit 25 MB enforced while streaming: buffering stops at the limit and 413 is answered at once; the rest of
//   the body is discarded (not buffered) so the client can read the 413, and the connection is destroyed if the client
//   keeps sending for more than 5 s or 64 MB. JSON only (415 otherwise).
// - Timeouts: headersTimeout 10 s, requestTimeout 60 s (time to RECEIVE a request – long-running RPC handlers and
//   the open-ended SSE stream are not affected), keepAliveTimeout 5 s.
// - EADDRINUSE: probe the endpoint with a nonce proof (token from tokenPath): a NOVA daemon that proves the token →
//   NovaError CONFLICT; something else → DAEMON_UNAVAILABLE ("fremdes Programm"). If nothing answers: a stale unix
//   socket FILE is removed and listen is retried once; on Windows (pipes cannot be stale) listen is retried once after
//   a short pause. Without tokenPath a NOVA-shaped but unverifiable answer counts as CONFLICT.
// - close(): stop accepting, end every SSE response, close idle sockets, give in-flight RPC calls up to 1 s, then
//   closeAllConnections() and resolve (bounded: never waits longer than ~3.5 s).
// - Every request handler and SSE writer is wrapped in try/catch (500 / stream closed), the daemon never crashes
//   because of a client.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex } from 'node:stream';
import { chmodSync, lstatSync } from 'node:fs';
import { NOVA_EVENT_TYPES, type NovaEventType } from '@shared/events';
import { ErrorCodes } from '@shared/errors';
import type { RpcRouter } from '../contracts';
import type { EventBus } from '../core/bus';
import type { Logger } from '../core/logger';
import { NovaError, errorMessage } from '../core/errors';
import { unlinkWithRetry } from '../core/fs-atomic';
import { redactString } from '../core/redact';
import { CLIENT_MESSAGES } from '../client/errors';
import { NONCE_HEADER, NONCE_RE, computeProof, tokensEqual } from '../client/proof';
import { probeEndpoint } from './probe';
import { SseConnection } from './sse';

export interface RpcServerLimits {
  /** Maximum request body (25 MB). */
  maxBodyBytes: number;
  /** Maximum simultaneous SSE streams (16). */
  maxSseConnections: number;
  /** SSE stream is closed when more than this is buffered for it (4 MB). */
  sseMaxBufferedBytes: number;
  /** Cap per serialised event (64 KB). */
  sseMaxEventBytes: number;
  ssePingIntervalMs: number;
  sseCoalesceMs: number;
  headersTimeoutMs: number;
  requestTimeoutMs: number;
  keepAliveTimeoutMs: number;
  /** How often node:http enforces headersTimeout/requestTimeout. */
  connectionsCheckingIntervalMs: number;
  /** Timeout of the EADDRINUSE probe. */
  probeTimeoutMs: number;
  /** Time in-flight RPC calls get during close(). */
  closeGraceMs: number;
  /** After a 413, discard the rest of the body for at most this long … */
  oversizeDrainMs: number;
  /** … or at most this many additional bytes, then destroy the connection. */
  oversizeDrainBytes: number;
}

export const DEFAULT_SERVER_LIMITS: RpcServerLimits = {
  maxBodyBytes: 25 * 1024 * 1024,
  maxSseConnections: 16,
  sseMaxBufferedBytes: 4 * 1024 * 1024,
  sseMaxEventBytes: 64 * 1024,
  ssePingIntervalMs: 15_000,
  sseCoalesceMs: 100,
  headersTimeoutMs: 10_000,
  requestTimeoutMs: 60_000,
  keepAliveTimeoutMs: 5_000,
  connectionsCheckingIntervalMs: 2_000,
  probeTimeoutMs: 2_000,
  closeGraceMs: 1_000,
  oversizeDrainMs: 5_000,
  oversizeDrainBytes: 64 * 1024 * 1024,
};

export interface StartRpcServerOptions {
  /** Named pipe (`\\.\pipe\…`, Windows) or unix socket path. */
  endpoint: string;
  /** Token of THIS daemon (in memory; written to the token file by the caller after binding). */
  token: string;
  /** Token file, used to verify an existing daemon on EADDRINUSE (it still holds the running daemon's token). */
  tokenPath?: string;
  router: RpcRouter;
  bus: EventBus;
  log: Logger;
  version: string;
  instanceId: string;
  /** Defaults to process.platform (inject 'win32' in tests to exercise the pipe branch). */
  platform?: NodeJS.Platform;
  limits?: Partial<RpcServerLimits>;
}

export interface RpcServerStats {
  sseClients: number;
  activeRequests: number;
  openSockets: number;
}

export interface RpcServerHandle {
  endpoint: string;
  close(): Promise<void>;
  stats(): RpcServerStats;
}

export const SERVER_MESSAGES = {
  alreadyRunning: 'NOVA läuft bereits. Der Hintergrunddienst ist schon gestartet.',
  foreign: CLIENT_MESSAGES.foreign,
  cannotListen: 'Der Kommunikationskanal des Hintergrunddienstes konnte nicht geöffnet werden.',
  pathTooLong: 'Der Pfad des Kommunikationskanals ist zu lang. Bitte einen kürzeren Datenordner verwenden.',
  notASocket: 'Am Ort des Kommunikationskanals liegt eine andere Datei. Bitte diese Datei entfernen oder einen anderen Datenordner verwenden.',
  unauthorized: 'Zugriff verweigert: Das Zugangstoken fehlt oder ist ungültig.',
  browser: 'Zugriffe aus einem Browser auf den Hintergrunddienst sind nicht erlaubt.',
  notFound: 'Diese Adresse gibt es beim Hintergrunddienst nicht.',
  methodNotAllowed: 'Diese Anfrageart ist hier nicht erlaubt.',
  jsonOnly: 'Der Hintergrunddienst akzeptiert nur JSON-Anfragen.',
  invalidJson: 'Die Anfrage ist kein gültiges JSON.',
  invalidEnvelope: 'Die Anfrage hat nicht das erwartete Format ({ id, method, params }).',
  tooLarge: 'Die Anfrage ist zu groß (höchstens 25 MB).',
  tooManyStreams: 'Zu viele gleichzeitige Ereignisverbindungen zum Hintergrunddienst.',
  badNonce: 'Ungültige Prüfanfrage (X-Nova-Nonce muss aus 32 Hex-Zeichen bestehen).',
  badUrl: 'Ungültige Anfrage-Adresse.',
  unknownEventTypes: (types: string[]) => `Unbekannte Ereignistypen: ${types.join(', ')}.`,
  shuttingDown: 'Der Hintergrunddienst fährt gerade herunter.',
  internal: 'Interner Fehler im Hintergrunddienst.',
} as const;

/** Unix socket paths are limited by sockaddr_un (104 bytes on macOS incl. NUL, 108 on Linux). */
const MAX_UNIX_SOCKET_PATH_BYTES = 103;
const ROUTES: Record<string, 'GET' | 'POST'> = { '/rpc': 'POST', '/events': 'GET', '/health': 'GET' };
const EVENT_TYPES = new Set<string>(NOVA_EVENT_TYPES);

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.headersSent || res.destroyed || res.writableEnded) return;
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(Buffer.byteLength(json, 'utf8')),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(json);
}

function sendError(res: ServerResponse, status: number, code: string, message: string, headers: Record<string, string> = {}, id: string | null = null, details?: unknown): void {
  const error: Record<string, unknown> = { code, message };
  if (details !== undefined) error.details = details;
  sendJson(res, status, { id: id ?? '', ok: false, error }, headers);
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.join(', ') : v;
}

function listenOnce(server: Server, endpoint: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    try {
      server.listen(endpoint);
    } catch (e) {
      server.removeListener('error', onError);
      server.removeListener('listening', onListening);
      reject(e);
    }
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function startRpcServer(opts: StartRpcServerOptions): Promise<RpcServerHandle> {
  const limits: RpcServerLimits = { ...DEFAULT_SERVER_LIMITS, ...(opts.limits ?? {}) };
  const platform = opts.platform ?? process.platform;
  const isPipe = platform === 'win32';
  const { endpoint, token, router, bus, log, version, instanceId } = opts;

  if (typeof token !== 'string' || token.length < 16) {
    throw new NovaError(ErrorCodes.VALIDATION, 'Ungültiges Zugangstoken für den Hintergrunddienst.', { severity: 'critical' });
  }
  if (typeof endpoint !== 'string' || endpoint.length === 0) {
    throw new NovaError(ErrorCodes.VALIDATION, 'Für den Hintergrunddienst fehlt der Kommunikationskanal.', { severity: 'critical' });
  }
  if (!isPipe && Buffer.byteLength(endpoint, 'utf8') > MAX_UNIX_SOCKET_PATH_BYTES) {
    throw new NovaError(ErrorCodes.DAEMON_UNAVAILABLE, SERVER_MESSAGES.pathTooLong, { severity: 'critical', details: { endpoint } });
  }

  let closing = false;
  let activeRequests = 0;
  const sockets = new Set<Socket>();
  const sseClients = new Set<SseConnection>();

  const isAuthorized = (req: IncomingMessage): boolean => {
    const header = headerValue(req, 'authorization');
    if (!header) return false;
    const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header);
    return m ? tokensEqual(m[1], token) : false;
  };

  const handleHealth = (req: IncomingMessage, res: ServerResponse): void => {
    const rawNonce = headerValue(req, NONCE_HEADER);
    const nonce = rawNonce?.trim();
    if (nonce !== undefined && !NONCE_RE.test(nonce)) {
      sendError(res, 400, ErrorCodes.VALIDATION, SERVER_MESSAGES.badNonce);
      return;
    }
    if (nonce === undefined && !isAuthorized(req)) {
      sendError(res, 401, ErrorCodes.UNAUTHORIZED, SERVER_MESSAGES.unauthorized, { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    const body: Record<string, unknown> = { ok: true, pid: process.pid, version, instanceId };
    if (nonce !== undefined) body.proof = computeProof(token, nonce);
    sendJson(res, 200, body);
  };

  /** Reads the body with the streaming limit. Resolves null when the request was rejected or aborted. */
  const readBody = (req: IncomingMessage, res: ServerResponse): Promise<Buffer | null> =>
    new Promise<Buffer | null>((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let rejected = false;
      let drainTimer: NodeJS.Timeout | null = null;
      const reject413 = () => {
        rejected = true;
        chunks.length = 0;
        log.warn('RPC-Anfrage zu groß – abgelehnt', { limitBytes: limits.maxBodyBytes });
        sendError(res, 413, ErrorCodes.VALIDATION, SERVER_MESSAGES.tooLarge);
        drainTimer = setTimeout(() => req.socket.destroy(), limits.oversizeDrainMs);
        drainTimer.unref?.();
        resolve(null);
      };
      const declared = Number(headerValue(req, 'content-length'));
      if (Number.isFinite(declared) && declared > limits.maxBodyBytes) reject413();
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (rejected) {
          if (size > limits.maxBodyBytes + limits.oversizeDrainBytes) req.socket.destroy();
          return;
        }
        if (size > limits.maxBodyBytes) {
          reject413();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (drainTimer) clearTimeout(drainTimer);
        if (!rejected) resolve(Buffer.concat(chunks, size));
      });
      req.on('error', () => resolve(null));
      req.on('close', () => {
        if (drainTimer) clearTimeout(drainTimer);
        resolve(null);
      });
    });

  const handleRpc = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const contentType = headerValue(req, 'content-type') ?? '';
    if (!/^application\/json\s*(;|$)/i.test(contentType.trim())) {
      sendError(res, 415, ErrorCodes.VALIDATION, SERVER_MESSAGES.jsonOnly);
      return;
    }
    const body = await readBody(req, res);
    if (!body) return;
    let envelope: unknown;
    try {
      envelope = JSON.parse(body.toString('utf8'));
    } catch {
      sendError(res, 400, ErrorCodes.VALIDATION, SERVER_MESSAGES.invalidJson);
      return;
    }
    if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
      sendError(res, 400, ErrorCodes.VALIDATION, SERVER_MESSAGES.invalidEnvelope);
      return;
    }
    const e = envelope as Record<string, unknown>;
    const idOk = e.id === undefined || (typeof e.id === 'string' && e.id.length <= 200) || (typeof e.id === 'number' && Number.isFinite(e.id));
    if (!idOk || typeof e.method !== 'string' || e.method.length === 0 || e.method.length > 200) {
      sendError(res, 400, ErrorCodes.VALIDATION, SERVER_MESSAGES.invalidEnvelope, {}, typeof e.id === 'string' ? e.id.slice(0, 200) : null);
      return;
    }
    const id = e.id === undefined ? '' : String(e.id);
    activeRequests++;
    try {
      const response = await router.handle({ id, method: e.method, params: e.params });
      if (res.destroyed || res.writableEnded) return;
      let json: string;
      try {
        json = JSON.stringify(response);
      } catch (err) {
        log.error('RPC-Antwort kann nicht serialisiert werden', { method: e.method, error: errorMessage(err) });
        sendError(res, 500, ErrorCodes.INTERNAL, SERVER_MESSAGES.internal, {}, id, redactString(errorMessage(err)));
        return;
      }
      if (res.headersSent) return;
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': String(Buffer.byteLength(json, 'utf8')),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(json);
    } finally {
      activeRequests--;
    }
  };

  const handleEvents = (req: IncomingMessage, res: ServerResponse, url: URL): void => {
    if (sseClients.size >= limits.maxSseConnections) {
      log.warn('Zu viele Ereignisverbindungen – neue Verbindung abgelehnt', { limit: limits.maxSseConnections });
      sendError(res, 429, ErrorCodes.RESOURCE_LIMIT, SERVER_MESSAGES.tooManyStreams, { 'Retry-After': '1' });
      return;
    }
    let filter: Set<NovaEventType> | null = null;
    const typesParam = url.searchParams.get('types');
    if (typesParam !== null) {
      const requested = typesParam
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      const unknown = requested.filter((t) => !EVENT_TYPES.has(t));
      if (unknown.length > 0) {
        sendError(res, 400, ErrorCodes.VALIDATION, SERVER_MESSAGES.unknownEventTypes(unknown.slice(0, 10).map((t) => t.slice(0, 60))));
        return;
      }
      if (requested.length > 0) filter = new Set(requested as NovaEventType[]);
    }
    const conn = new SseConnection(
      req,
      res,
      filter,
      { maxBufferedBytes: limits.sseMaxBufferedBytes, maxEventBytes: limits.sseMaxEventBytes, pingIntervalMs: limits.ssePingIntervalMs, coalesceMs: limits.sseCoalesceMs },
      log,
    );
    sseClients.add(conn);
    conn.onClose(() => sseClients.delete(conn));
    conn.start();
  };

  const handleRequest = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (closing) {
      sendError(res, 503, ErrorCodes.DAEMON_UNAVAILABLE, SERVER_MESSAGES.shuttingDown, { Connection: 'close' });
      return;
    }
    if (req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined || req.headers['sec-fetch-mode'] !== undefined) {
      log.warn('Browser-Zugriff auf den Hintergrunddienst abgewiesen', { method: req.method });
      sendError(res, 403, ErrorCodes.UNAUTHORIZED, SERVER_MESSAGES.browser);
      return;
    }
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://nova.invalid');
    } catch {
      sendError(res, 400, ErrorCodes.VALIDATION, SERVER_MESSAGES.badUrl);
      return;
    }
    const route = Object.prototype.hasOwnProperty.call(ROUTES, url.pathname) ? ROUTES[url.pathname] : undefined;
    if (url.pathname === '/health') {
      if (req.method !== 'GET') {
        sendError(res, 405, ErrorCodes.VALIDATION, SERVER_MESSAGES.methodNotAllowed, { Allow: 'GET' });
        return;
      }
      handleHealth(req, res);
      return;
    }
    if (!isAuthorized(req)) {
      sendError(res, 401, ErrorCodes.UNAUTHORIZED, SERVER_MESSAGES.unauthorized, { 'WWW-Authenticate': 'Bearer' });
      return;
    }
    if (!route) {
      sendError(res, 404, ErrorCodes.NOT_FOUND, SERVER_MESSAGES.notFound);
      return;
    }
    if (req.method !== route) {
      sendError(res, 405, ErrorCodes.VALIDATION, SERVER_MESSAGES.methodNotAllowed, { Allow: route });
      return;
    }
    if (url.pathname === '/rpc') {
      await handleRpc(req, res);
      return;
    }
    handleEvents(req, res, url);
  };

  const server = createServer(
    {
      headersTimeout: limits.headersTimeoutMs,
      requestTimeout: limits.requestTimeoutMs,
      keepAliveTimeout: limits.keepAliveTimeoutMs,
      connectionsCheckingInterval: limits.connectionsCheckingIntervalMs,
    },
    (req, res) => {
      handleRequest(req, res).catch((e: unknown) => {
        log.error('Fehler bei der Verarbeitung einer Anfrage', { url: req.url, error: redactString(errorMessage(e)), stack: e instanceof Error ? e.stack : undefined });
        try {
          if (!res.headersSent) sendError(res, 500, ErrorCodes.INTERNAL, SERVER_MESSAGES.internal);
          else res.destroy();
        } catch {
          res.destroy();
        }
      });
    },
  );

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('clientError', (error: Error, socket: Duplex) => {
    const err = error as NodeJS.ErrnoException;
    log.debug('Fehlerhafte Anfrage an den Hintergrunddienst', { code: err.code, error: err.message });
    if (!socket.writable || err.code === 'ECONNRESET') {
      socket.destroy();
      return;
    }
    const status =
      err.code === 'ERR_HTTP_REQUEST_TIMEOUT' ? '408 Request Timeout' : err.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large' : '400 Bad Request';
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });

  const unsubscribeBus = bus.onAny((event) => {
    for (const conn of sseClients) conn.push(event);
  });

  function fail(e: unknown): never {
    unsubscribeBus();
    throw e;
  }

  // --- bind ---------------------------------------------------------------------------------------------------------
  try {
    await listenOnce(server, endpoint);
  } catch (first) {
    const code = (first as NodeJS.ErrnoException).code;
    if (code !== 'EADDRINUSE') {
      fail(new NovaError(ErrorCodes.DAEMON_UNAVAILABLE, SERVER_MESSAGES.cannotListen, { severity: 'critical', details: { endpoint, code: code ?? null, error: errorMessage(first) }, cause: first }));
    }
    const probe = await probeEndpoint(endpoint, opts.tokenPath ?? null, limits.probeTimeoutMs);
    if (probe.status === 'ours' || (probe.unverifiedNova && !opts.tokenPath)) {
      log.info('Ein NOVA-Hintergrunddienst läuft bereits an diesem Kommunikationskanal', { endpoint, health: probe.health });
      fail(
        new NovaError(ErrorCodes.CONFLICT, SERVER_MESSAGES.alreadyRunning, {
          severity: 'warning',
          details: { endpoint, pid: probe.health?.pid ?? null, instanceId: probe.health?.instanceId ?? null, version: probe.health?.version ?? null },
        }),
      );
    }
    if (probe.status === 'foreign') {
      log.error('Kommunikationskanal ist von einem fremden Programm belegt', { endpoint, detail: probe.detail });
      fail(new NovaError(ErrorCodes.DAEMON_UNAVAILABLE, SERVER_MESSAGES.foreign, { severity: 'critical', details: { endpoint, detail: probe.detail } }));
    }
    // Nothing answers: a leftover of a crashed daemon.
    if (!isPipe) {
      let isSocketFile = true;
      try {
        isSocketFile = lstatSync(endpoint).isSocket();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== 'ENOENT') isSocketFile = false;
      }
      if (!isSocketFile) {
        fail(new NovaError(ErrorCodes.DAEMON_UNAVAILABLE, SERVER_MESSAGES.notASocket, { severity: 'critical', details: { endpoint } }));
      }
      try {
        unlinkWithRetry(endpoint);
        log.warn('Verwaisten Kommunikationskanal eines früheren Starts entfernt', { endpoint });
      } catch (e) {
        fail(new NovaError(ErrorCodes.DAEMON_UNAVAILABLE, SERVER_MESSAGES.cannotListen, { severity: 'critical', details: { endpoint, error: errorMessage(e) }, cause: e }));
      }
    } else {
      await sleep(300);
    }
    try {
      await listenOnce(server, endpoint);
    } catch (second) {
      const code2 = (second as NodeJS.ErrnoException).code;
      fail(
        new NovaError(ErrorCodes.DAEMON_UNAVAILABLE, code2 === 'EADDRINUSE' ? SERVER_MESSAGES.foreign : SERVER_MESSAGES.cannotListen, {
          severity: 'critical',
          details: { endpoint, code: code2 ?? null, error: errorMessage(second) },
          cause: second,
        }),
      );
    }
  }

  if (!isPipe) {
    try {
      chmodSync(endpoint, 0o600);
    } catch (e) {
      log.warn('Zugriffsrechte des Kommunikationskanals konnten nicht gesetzt werden', { endpoint, error: errorMessage(e) });
    }
  }
  server.on('error', (e) => log.error('Fehler im RPC-Server', { error: errorMessage(e) }));
  log.info('RPC-Server hört auf dem Kommunikationskanal', { endpoint });

  // --- close --------------------------------------------------------------------------------------------------------
  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => {
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      unsubscribeBus();
      for (const conn of [...sseClients]) conn.end();
      sseClients.clear();
      server.closeIdleConnections();
      const graceUntil = Date.now() + limits.closeGraceMs;
      while (activeRequests > 0 && Date.now() < graceUntil) await sleep(20);
      server.closeAllConnections();
      for (const socket of sockets) socket.destroy();
      await Promise.race([closed, sleep(2_000)]);
      log.info('RPC-Server geschlossen', { endpoint });
    })();
    return closePromise;
  };

  return {
    endpoint,
    close,
    stats: () => ({ sseClients: sseClients.size, activeRequests, openSockets: sockets.size }),
  };
}
