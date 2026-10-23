// NovaError: the one error type services throw for expected failures.
// The RPC layer turns it into { code, message } (German message), unexpected errors become INTERNAL.
import { ErrorCodes, type ErrorCode, type ErrorSeverity } from '@shared/errors';

export interface NovaErrorOptions {
  severity?: ErrorSeverity;
  details?: unknown;
  cause?: unknown;
  /** German hint what the user can do. */
  userAction?: string;
  autoFixable?: boolean;
  projectSafe?: boolean;
}

export class NovaError extends Error {
  readonly code: ErrorCode | string;
  readonly severity: ErrorSeverity;
  readonly details?: unknown;
  readonly userAction?: string;
  readonly autoFixable: boolean;
  readonly projectSafe: boolean;

  constructor(code: ErrorCode | string, message: string, opts: NovaErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'NovaError';
    this.code = code;
    this.severity = opts.severity ?? 'blocker';
    this.details = opts.details;
    this.userAction = opts.userAction;
    this.autoFixable = opts.autoFixable ?? false;
    this.projectSafe = opts.projectSafe ?? true;
  }
}

export function isNovaError(e: unknown): e is NovaError {
  return e instanceof NovaError;
}

export const notFound = (what: string, id: string) =>
  new NovaError(ErrorCodes.NOT_FOUND, `${what} wurde nicht gefunden (${id}).`, { severity: 'warning' });

export const validation = (message: string, details?: unknown) =>
  new NovaError(ErrorCodes.VALIDATION, message, { severity: 'warning', details });

export const conflict = (message: string, details?: unknown) =>
  new NovaError(ErrorCodes.CONFLICT, message, { severity: 'warning', details });

/** Message of any thrown value, for logs and agent tool results. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function isAbortError(e: unknown): boolean {
  return (
    (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) ||
    (e instanceof NovaError && e.code === ErrorCodes.CANCELLED)
  );
}
