// Error type and German messages of the DaemonClient (pure Node, no daemon imports).
// Key decisions:
// - Errors the daemon returns keep the daemon's code/message/details unchanged (reason = null).
// - Transport problems use code DAEMON_UNAVAILABLE (UNAUTHORIZED for a rejected token, VALIDATION for oversized
//   requests) and carry a machine-readable `reason` (also in details.reason) so Electron main can tell a lost
//   connection from a slow call or a foreign program on the endpoint.

export type DaemonErrorReason =
  | 'unreachable' // nothing listens on the endpoint
  | 'connection_lost' // the connection broke during a call
  | 'timeout' // no (complete) answer in time
  | 'foreign' // the endpoint is held by a program that cannot prove the NOVA token
  | 'unauthorized' // the daemon rejected the token (also after re-reading it)
  | 'token_missing' // no token file / token configured
  | 'bad_response' // the answer is not a valid RPC response
  | 'too_large' // request body above the 25 MB limit
  | 'closed'; // DaemonClient.close() was called

export const CLIENT_MESSAGES = {
  foreign: 'Der Kommunikationskanal wird von einem fremden Programm belegt. Bitte den PC neu starten.',
  unreachable: 'Der Hintergrunddienst ist nicht erreichbar.',
  connectionLost: 'Die Verbindung zum Hintergrunddienst wurde unterbrochen.',
  notResponding: 'Der Hintergrunddienst antwortet nicht.',
  unauthorized: 'Der Hintergrunddienst hat das Zugangstoken abgelehnt. Bitte NOVA neu starten.',
  tokenMissing: 'Das Zugangstoken des Hintergrunddienstes wurde nicht gefunden. Bitte NOVA neu starten.',
  badResponse: 'Der Hintergrunddienst hat eine ungültige Antwort gesendet.',
  tooLarge: 'Die Anfrage ist zu groß (höchstens 25 MB).',
  closed: 'Die Verbindung zum Hintergrunddienst wurde beendet.',
  missingCredentials: 'Für die Verbindung zum Hintergrunddienst fehlt das Zugangstoken (tokenPath oder token angeben).',
  timeout: (seconds: number) =>
    `Der Hintergrunddienst hat nicht innerhalb von ${seconds === 1 ? 'einer Sekunde' : `${seconds} Sekunden`} geantwortet. Die Aktion läuft möglicherweise im Hintergrund weiter.`,
} as const;

export interface DaemonRpcErrorOptions {
  details?: unknown;
  /** HTTP status of the answer, if there was one. */
  status?: number | null;
  reason?: DaemonErrorReason | null;
  /** NovaErrorInfo attached by the daemon (RpcError.error), passed through unchanged. */
  error?: unknown;
  cause?: unknown;
}

export class DaemonRpcError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status: number | null;
  readonly reason: DaemonErrorReason | null;
  readonly error?: unknown;

  constructor(code: string, message: string, opts: DaemonRpcErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'DaemonRpcError';
    this.code = code;
    this.details = opts.details;
    this.status = opts.status ?? null;
    this.reason = opts.reason ?? null;
    if (opts.error !== undefined) this.error = opts.error;
  }

  /** Plain JSON form (for IPC to the renderer: class instances do not survive structured cloning). */
  toJSON(): { code: string; message: string; details?: unknown; error?: unknown } {
    const json: { code: string; message: string; details?: unknown; error?: unknown } = { code: this.code, message: this.message };
    if (this.details !== undefined) json.details = this.details;
    if (this.error !== undefined) json.error = this.error;
    return json;
  }
}

/** Builds a transport-level error with the reason mirrored into details. */
export function transportError(reason: DaemonErrorReason, message: string, extra: Record<string, unknown> = {}, cause?: unknown): DaemonRpcError {
  const code = reason === 'unauthorized' ? 'UNAUTHORIZED' : reason === 'too_large' ? 'VALIDATION' : 'DAEMON_UNAVAILABLE';
  return new DaemonRpcError(code, message, { reason, details: { reason, ...extra }, cause });
}

export function isDaemonRpcError(e: unknown): e is DaemonRpcError {
  return e instanceof DaemonRpcError;
}
