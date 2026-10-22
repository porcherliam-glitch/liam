// Connection handshake with the NOVA daemon: open a socket, send `GET /health` with a fresh X-Nova-Nonce on THAT
// socket and verify the HMAC proof before anything else (in particular the token) is sent over it.
// Key decisions:
// - Used by the DaemonClient for every new connection (keep-alive pool and SSE) and by the server's probeDaemon().
//   Verifying on the very socket that later carries the token is the only way to make sure the token never reaches
//   a foreign program, even if the endpoint changes hands between two connections.
// - A tiny, strict HTTP/1.1 response reader (status line, headers, Content-Length body; no chunked encoding) is
//   enough because the daemon's /health answer is fully under our control. Anything unexpected = not NOVA.
// - After a successful handshake the socket is handed over clean (no listeners, no timeout, no pending bytes) so
//   node:http can use it for the real request (keep-alive).
// - Works for Windows named pipes and unix sockets alike (net.connect({ path })).
import { connect, type Socket } from 'node:net';
import { NONCE_HEADER, newNonce, verifyProof, PROOF_RE } from './proof';

export interface DaemonHealth {
  ok: true;
  pid: number;
  version: string;
  instanceId: string;
}

export type HandshakeResult =
  /** Proof verified with the given token. `socket` is set when keepSocket was requested. */
  | { kind: 'ok'; health: DaemonHealth; socket: Socket | null }
  /** NOVA-shaped answer whose proof does not match the token (stale token file or a different daemon). */
  | { kind: 'mismatch'; health: DaemonHealth }
  /** NOVA-shaped answer but no token was available to verify it. */
  | { kind: 'unverified'; health: DaemonHealth }
  /** Something accepted the connection but did not answer like NOVA. */
  | { kind: 'foreign'; detail: string }
  /** No (complete) answer within the timeout. */
  | { kind: 'timeout'; detail: string; connected: boolean }
  /** The peer closed/reset the connection before answering (or answered 503 while shutting down). */
  | { kind: 'closed'; detail: string }
  /** Nothing listens on the endpoint (ENOENT, ECONNREFUSED, …). */
  | { kind: 'none'; detail: string; code: string | null };

export interface HandshakeOptions {
  endpoint: string;
  /** Token to verify the proof with; null = only check that the answer looks like NOVA. */
  token: string | null;
  timeoutMs: number;
  /** Hand the verified socket over instead of closing it. */
  keepSocket: boolean;
}

const MAX_HEADER_BYTES = 16 * 1024;
const MAX_BODY_BYTES = 64 * 1024;

interface ParsedHead {
  status: number;
  headers: Map<string, string>;
  bodyStart: number;
}

function parseHead(buf: Buffer): ParsedHead | 'incomplete' | 'invalid' {
  const end = buf.indexOf('\r\n\r\n');
  if (end === -1) return buf.length > MAX_HEADER_BYTES ? 'invalid' : 'incomplete';
  const lines = buf.subarray(0, end).toString('latin1').split('\r\n');
  const m = /^HTTP\/1\.[01] (\d{3})(?: .*)?$/.exec(lines[0] ?? '');
  if (!m) return 'invalid';
  const headers = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx <= 0) return 'invalid';
    headers.set(line.slice(0, idx).trim().toLowerCase(), line.slice(idx + 1).trim());
  }
  return { status: Number(m[1]), headers, bodyStart: end + 4 };
}

/** Validates the JSON body of a /health answer. Returns the health info and the proof, or null if not NOVA-shaped. */
export function parseHealthBody(value: unknown): { health: DaemonHealth; proof: string | null } | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.ok !== true || typeof v.pid !== 'number' || !Number.isInteger(v.pid) || typeof v.version !== 'string' || typeof v.instanceId !== 'string') {
    return null;
  }
  const proof = typeof v.proof === 'string' && PROOF_RE.test(v.proof) ? v.proof : null;
  return { health: { ok: true, pid: v.pid, version: v.version, instanceId: v.instanceId }, proof };
}

export function handshake(opts: HandshakeOptions): Promise<HandshakeResult> {
  return new Promise<HandshakeResult>((resolve) => {
    const nonce = newNonce();
    let connected = false;
    let settled = false;
    let buf: Buffer = Buffer.alloc(0);
    let head: ParsedHead | null = null;
    let socket: Socket;

    const cleanup = () => {
      clearTimeout(timer);
      socket.removeListener('connect', onConnect);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      socket.removeListener('close', onClose);
    };
    const finish = (result: HandshakeResult, keep = false) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (!keep) {
        // Keep a no-op error handler: destroy() may still surface a late error event.
        socket.on('error', () => {});
        socket.destroy();
      }
      resolve(result);
    };

    const onConnect = () => {
      connected = true;
      socket.write(`GET /health HTTP/1.1\r\nHost: nova\r\nAccept: application/json\r\nX-Nova-Nonce: ${nonce}\r\nConnection: keep-alive\r\n\r\n`);
    };

    const onData = (chunk: Buffer) => {
      buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
      if (!head) {
        const parsed = parseHead(buf);
        if (parsed === 'incomplete') return;
        if (parsed === 'invalid') return finish({ kind: 'foreign', detail: 'Keine gültige HTTP-Antwort' });
        head = parsed;
        if (head.status === 503) return finish({ kind: 'closed', detail: 'Der Hintergrunddienst fährt gerade herunter' });
        if (head.status !== 200) return finish({ kind: 'foreign', detail: `HTTP ${head.status}` });
        if ((head.headers.get('transfer-encoding') ?? '').length > 0) return finish({ kind: 'foreign', detail: 'Unerwartete Übertragungskodierung' });
        const len = Number(head.headers.get('content-length'));
        if (!Number.isInteger(len) || len < 0 || len > MAX_BODY_BYTES) return finish({ kind: 'foreign', detail: 'Ungültige Inhaltslänge' });
      }
      const len = Number(head.headers.get('content-length'));
      const available = buf.length - head.bodyStart;
      if (available < len) return;
      if (available > len) return finish({ kind: 'foreign', detail: 'Unerwartete zusätzliche Daten' });
      let json: unknown;
      try {
        json = JSON.parse(buf.subarray(head.bodyStart).toString('utf8'));
      } catch {
        return finish({ kind: 'foreign', detail: 'Antwort ist kein JSON' });
      }
      const parsedBody = parseHealthBody(json);
      if (!parsedBody || !parsedBody.proof) return finish({ kind: 'foreign', detail: 'Antwort stammt nicht von NOVA' });
      if (opts.token === null) return finish({ kind: 'unverified', health: parsedBody.health });
      if (!verifyProof(opts.token, nonce, parsedBody.proof)) return finish({ kind: 'mismatch', health: parsedBody.health });
      if (!opts.keepSocket) return finish({ kind: 'ok', health: parsedBody.health, socket: null });
      if ((head.headers.get('connection') ?? '').toLowerCase() === 'close') {
        return finish({ kind: 'closed', detail: 'Der Hintergrunddienst hat die Verbindung geschlossen' });
      }
      socket.setTimeout(0);
      finish({ kind: 'ok', health: parsedBody.health, socket }, true);
    };

    const onError = (err: NodeJS.ErrnoException) => {
      if (!connected) return finish({ kind: 'none', detail: err.message, code: err.code ?? null });
      if (err.code === 'ECONNRESET' || err.code === 'EPIPE') return finish({ kind: 'closed', detail: err.message });
      finish({ kind: 'foreign', detail: err.message });
    };

    const onClose = () => {
      if (!connected) return finish({ kind: 'none', detail: 'Verbindung abgelehnt', code: null });
      finish({ kind: 'closed', detail: 'Verbindung vor der Antwort geschlossen' });
    };

    const timer = setTimeout(() => {
      finish({ kind: 'timeout', detail: connected ? 'Keine Antwort' : 'Verbindungsaufbau dauert zu lange', connected });
    }, Math.max(1, opts.timeoutMs));

    try {
      socket = connect({ path: opts.endpoint });
    } catch (e) {
      clearTimeout(timer);
      settled = true;
      resolve({ kind: 'none', detail: e instanceof Error ? e.message : String(e), code: (e as NodeJS.ErrnoException).code ?? null });
      return;
    }
    socket.once('connect', onConnect);
    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

/** The nonce header name for documentation/tests. */
export { NONCE_HEADER };
