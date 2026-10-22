// `nova:rpc` handling: renderer request → validation in main → DaemonSupervisor.rpc → BridgeRpcResult.
// Key decisions (rpc.ts header, UI-SPEC §5):
// - The method must be a known RPC method (isRpcMethod), otherwise NOT_FOUND.
// - Params are validated with `RpcContract[method].params.safeParse` (German issue texts, same format as the daemon
//   router: details.issues = [{ path, message }]) but the ORIGINAL params object is forwarded, so defaults are applied
//   exactly once – in the daemon. `null` params are treated like missing params (same as the router).
// - Never throws: daemon errors keep code/message/details (+ the NovaErrorInfo in `error` when the daemon sent one);
//   anything unexpected becomes INTERNAL with a German message. Class instances never cross the IPC boundary.
import { RpcContract, isRpcMethod, type RpcMethod } from '@shared/rpc';
import type { BridgeRpcResult } from '@shared/bridge';
import { germanErrorMap, summarizeIssues, toGermanIssues } from '../daemon/server/validation-de';
import { TEXTS } from './texts';

export interface RpcForwarder {
  rpc(method: RpcMethod, params: unknown): Promise<unknown>;
}

type BridgeError = Extract<BridgeRpcResult, { ok: false }>['error'] & { error?: unknown };

function plainDetails(details: unknown): unknown {
  if (details === undefined) return undefined;
  try {
    // Structured clone (IPC) rejects functions/class instances; a JSON round trip makes the value safe.
    return JSON.parse(JSON.stringify(details)) as unknown;
  } catch {
    return String(details);
  }
}

/** Converts any thrown value into the failure branch of BridgeRpcResult. */
export function toBridgeError(e: unknown): BridgeRpcResult {
  if (e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' && typeof (e as { message?: unknown }).message === 'string') {
    const err = e as { code: string; message: string; details?: unknown; error?: unknown };
    const out: BridgeError = { code: err.code, message: err.message };
    const details = plainDetails(err.details);
    if (details !== undefined) out.details = details;
    const info = plainDetails(err.error);
    if (info !== undefined) out.error = info;
    return { ok: false, error: out };
  }
  return { ok: false, error: { code: 'INTERNAL', message: TEXTS.internalBridgeError, details: e instanceof Error ? e.message : String(e) } };
}

/** Validates method + params (without calling anything). Returns the error result or null when valid. */
export function validateRpcRequest(method: unknown, params: unknown): BridgeRpcResult | null {
  if (typeof method !== 'string' || method.length === 0 || method.length > 100) {
    return { ok: false, error: { code: 'VALIDATION', message: TEXTS.invalidMethod } };
  }
  if (!isRpcMethod(method)) return { ok: false, error: { code: 'NOT_FOUND', message: TEXTS.unknownMethod(method) } };
  const schema = RpcContract[method].params;
  const parsed = schema.safeParse(params === null ? undefined : params, { error: germanErrorMap });
  if (parsed.success) return null;
  const issues = toGermanIssues(parsed.error.issues).slice(0, 20);
  return { ok: false, error: { code: 'VALIDATION', message: summarizeIssues(issues, TEXTS.invalidParamsPrefix), details: { issues } } };
}

/** Full `nova:rpc` handler. */
export async function handleBridgeRpc(method: unknown, params: unknown, forwarder: RpcForwarder): Promise<BridgeRpcResult> {
  const invalid = validateRpcRequest(method, params);
  if (invalid) return invalid;
  try {
    const result = await forwarder.rpc(method as RpcMethod, params === null ? undefined : params);
    return { ok: true, result };
  } catch (e) {
    return toBridgeError(e);
  }
}
