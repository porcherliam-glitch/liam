// RPC router: method registry, param validation, result checks and error mapping (SPEC §4.1).
// Key decisions:
// - Unknown AND unregistered methods answer NOT_FOUND "Diese Funktion ist in dieser Version nicht verfügbar." (a UI
//   newer than the daemon must get a clear German message, not a crash).
// - Params are parsed with RpcContract[method].params using a per-parse German error map; the handler receives the
//   parsed value (defaults applied exactly once, here). `null` params are treated like missing params.
// - Results are validated against the result schema outside production (NODE_ENV !== 'production'); mismatches are
//   logged as warnings with a compact issue list and never fail the call. The handler's original result is returned.
// - NovaError → { code, message, details } (details deep-redacted). ZodErrors thrown by handlers → VALIDATION with a
//   German issue list. Abort errors → CANCELLED. Everything else → INTERNAL "Interner Fehler im Hintergrunddienst."
//   with the redacted error message as details (stack only in the log, which redacts too).
import type { z } from 'zod';
import { RpcContract, isRpcMethod, type RpcMethod, type RpcRequest, type RpcResponse } from '@shared/rpc';
import { ErrorCodes } from '@shared/errors';
import type { RpcHandler, RpcRouter } from '../contracts';
import type { Logger } from '../core/logger';
import { NovaError, errorMessage, isNovaError } from '../core/errors';
import { redact, redactString } from '../core/redact';
import { germanErrorMap, summarizeIssues, toGermanIssues } from './validation-de';

export const ROUTER_MESSAGES = {
  notFound: 'Diese Funktion ist in dieser Version nicht verfügbar.',
  internal: 'Interner Fehler im Hintergrunddienst.',
  cancelled: 'Der Vorgang wurde abgebrochen.',
  timedOut: 'Der Vorgang wurde wegen Zeitüberschreitung abgebrochen.',
} as const;

export interface RpcRouterOptions {
  /** Validate handler results against the contract (default: NODE_ENV !== 'production'). */
  validateResults?: boolean;
  /** Calls slower than this are logged as warnings (default 30 s). */
  slowCallMs?: number;
}

type AnyHandler = (params: unknown, ctx: { requestId: string }) => unknown;
type RpcErrorBody = Extract<RpcResponse, { ok: false }>['error'];

function isZodError(e: unknown): e is { issues: unknown[] } {
  return (
    !!e &&
    typeof e === 'object' &&
    (e as { name?: unknown }).name !== undefined &&
    ['ZodError', '$ZodError'].includes(String((e as { name?: unknown }).name)) &&
    Array.isArray((e as { issues?: unknown }).issues)
  );
}

function compactIssues(issues: readonly unknown[]): Array<{ path: string; message: string }> {
  return toGermanIssues(issues).slice(0, 20);
}

export function createRpcRouter(log: Logger, options: RpcRouterOptions = {}): RpcRouter {
  const handlers = new Map<RpcMethod, AnyHandler>();
  const validateResults = options.validateResults ?? process.env.NODE_ENV !== 'production';
  const slowCallMs = options.slowCallMs ?? 30_000;

  function mapError(e: unknown, method: string): RpcErrorBody {
    if (isNovaError(e)) {
      if (e.severity === 'critical') log.warn('RPC-Methode meldet kritischen Fehler', { method, code: e.code, message: e.message });
      else log.debug('RPC-Methode meldet Fehler', { method, code: e.code });
      return e.details === undefined ? { code: e.code, message: e.message } : { code: e.code, message: e.message, details: redact(e.details) };
    }
    if (isZodError(e)) {
      const issues = toGermanIssues(e.issues);
      log.warn('RPC-Methode hat ungültige Daten erhalten', { method, issues: issues.slice(0, 20) });
      return { code: ErrorCodes.VALIDATION, message: summarizeIssues(issues, 'Die Daten sind ungültig'), details: { issues } };
    }
    if (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) {
      return { code: ErrorCodes.CANCELLED, message: e.name === 'TimeoutError' ? ROUTER_MESSAGES.timedOut : ROUTER_MESSAGES.cancelled };
    }
    const message = redactString(errorMessage(e));
    log.error('Unerwarteter Fehler in RPC-Methode', { method, error: message, stack: e instanceof Error ? e.stack : undefined });
    return { code: ErrorCodes.INTERNAL, message: ROUTER_MESSAGES.internal, details: message };
  }

  return {
    register<M extends RpcMethod>(method: M, handler: RpcHandler<M>): void {
      if (typeof method !== 'string' || !isRpcMethod(method)) {
        throw new NovaError(ErrorCodes.INTERNAL, `Unbekannte RPC-Methode kann nicht registriert werden: ${String(method)}`);
      }
      if (handlers.has(method)) {
        throw new NovaError(ErrorCodes.CONFLICT, `RPC-Methode ist bereits registriert: ${method}`);
      }
      if (typeof handler !== 'function') {
        throw new NovaError(ErrorCodes.INTERNAL, `Für die RPC-Methode fehlt die Funktion: ${method}`);
      }
      handlers.set(method, handler as unknown as AnyHandler);
    },

    async handle(req: RpcRequest): Promise<RpcResponse> {
      const id = typeof req?.id === 'string' ? req.id : req?.id === undefined || req?.id === null ? '' : String(req.id);
      const method = req?.method;
      if (typeof method !== 'string' || !isRpcMethod(method) || !handlers.has(method)) {
        return { id, ok: false, error: { code: ErrorCodes.NOT_FOUND, message: ROUTER_MESSAGES.notFound, details: { method: typeof method === 'string' ? method.slice(0, 200) : null } } };
      }
      const contract = RpcContract[method] as { params: z.ZodType; result: z.ZodType };
      const parsed = contract.params.safeParse(req.params === null ? undefined : req.params, { error: germanErrorMap });
      if (!parsed.success) {
        const issues = compactIssues(parsed.error.issues);
        return { id, ok: false, error: { code: ErrorCodes.VALIDATION, message: summarizeIssues(issues), details: { issues } } };
      }
      const handler = handlers.get(method)!;
      const started = Date.now();
      try {
        const result = await handler(parsed.data, { requestId: id });
        const ms = Date.now() - started;
        if (ms > slowCallMs) log.warn('Langsame RPC-Methode', { method, ms });
        if (validateResults) {
          const check = contract.result.safeParse(result);
          if (!check.success) {
            log.warn('RPC-Ergebnis entspricht nicht dem Vertrag', { method, issues: compactIssues(check.error.issues) });
          }
        }
        return { id, ok: true, result };
      } catch (e) {
        return { id, ok: false, error: mapError(e, method) };
      }
    },

    registered(): string[] {
      return [...handlers.keys()].sort();
    },
  };
}
