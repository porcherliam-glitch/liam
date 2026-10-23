// Typed access to the daemon RPC API through the preload bridge (window.nova).
// This is the ONLY way pages talk to the backend. Use `useRpc` / `useMutation` in components.
import type { RpcMethod, RpcParams, RpcResult } from '@shared/rpc';
import type { NovaErrorInfo } from '@shared/errors';
import type { NovaBridge } from '@shared/bridge';

/** Error thrown by `api()` when the daemon answers `ok: false` or the bridge is unavailable. */
export class NovaRpcError extends Error {
  /** Stable machine code (see ErrorCodes in @shared/errors), e.g. "CONFLICT", "VALIDATION". */
  readonly code: string;
  readonly details: unknown;
  /** Structured user-facing error when the daemon sent one. */
  readonly info: NovaErrorInfo | null;
  readonly method: string;

  constructor(code: string, message: string, options: { details?: unknown; info?: NovaErrorInfo | null; method?: string } = {}) {
    super(message);
    this.name = 'NovaRpcError';
    this.code = code;
    this.details = options.details;
    this.info = options.info ?? null;
    this.method = options.method ?? '';
  }
}

/** Params tuple: optional when the method's params are optional (e.g. `api('work.status')`). */
export type RpcArgs<M extends RpcMethod> = undefined extends RpcParams<M> ? [params?: RpcParams<M>] : [params: RpcParams<M>];

const DAEMON_UNAVAILABLE_TEXT = 'Der Hintergrunddienst ist gerade nicht erreichbar. Bitte einen Moment warten oder den Dienst neu starten.';

/**
 * Returns the bridge (`window.nova`, or the installed mock bridge) or null when neither is available.
 * Always use this (or `api()`) instead of touching `window.nova` directly.
 */
export function getBridge(): NovaBridge | null {
  const g = globalThis as { nova?: NovaBridge; __NOVA_MOCK_BRIDGE__?: NovaBridge };
  if (g.nova && typeof g.nova.invoke === 'function') return g.nova;
  if (g.__NOVA_MOCK_BRIDGE__ && typeof g.__NOVA_MOCK_BRIDGE__.invoke === 'function') return g.__NOVA_MOCK_BRIDGE__;
  return null;
}

/**
 * Calls a daemon RPC method. Resolves with the typed result, rejects with `NovaRpcError`.
 * @example const tasks = await api('tasks.list', { projectId });
 */
export async function api<M extends RpcMethod>(method: M, ...args: RpcArgs<M>): Promise<RpcResult<M>> {
  const bridge = getBridge();
  if (!bridge) throw new NovaRpcError('DAEMON_UNAVAILABLE', DAEMON_UNAVAILABLE_TEXT, { method });
  let res;
  try {
    res = await bridge.invoke(method, args[0] as RpcParams<M>);
  } catch (e) {
    throw new NovaRpcError('DAEMON_UNAVAILABLE', DAEMON_UNAVAILABLE_TEXT, { method, details: e instanceof Error ? e.message : String(e) });
  }
  if (!res || typeof res !== 'object') throw new NovaRpcError('INTERNAL', 'Unerwartete Antwort vom Hintergrunddienst.', { method });
  if (res.ok) return res.result as RpcResult<M>;
  const err = res.error ?? { code: 'INTERNAL', message: 'Unbekannter Fehler.' };
  const info = (err as { error?: NovaErrorInfo }).error ?? null;
  throw new NovaRpcError(err.code || 'INTERNAL', err.message || 'Unbekannter Fehler.', { details: err.details, info, method });
}

/** True when `e` is a NovaRpcError with the given code. */
export function isRpcError(e: unknown, code?: string): e is NovaRpcError {
  return e instanceof NovaRpcError && (code === undefined || e.code === code);
}

/** German, user-presentable message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof NovaRpcError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return 'Ein unbekannter Fehler ist aufgetreten.';
}

/** Extracts field validation messages (VALIDATION errors with zod-like issues in details) as {path: message}. */
export function validationIssues(e: unknown): Record<string, string> {
  if (!(e instanceof NovaRpcError) || e.code !== 'VALIDATION') return {};
  const details = e.details as { issues?: Array<{ path?: Array<string | number>; message?: string }> } | Array<{ path?: Array<string | number>; message?: string }> | undefined;
  const issues = Array.isArray(details) ? details : details?.issues;
  const out: Record<string, string> = {};
  if (!Array.isArray(issues)) return out;
  for (const issue of issues) {
    const key = (issue.path ?? []).join('.');
    if (!(key in out)) out[key] = issue.message ?? 'Ungültiger Wert';
  }
  return out;
}
