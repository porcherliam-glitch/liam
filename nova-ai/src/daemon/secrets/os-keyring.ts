// OS keyring adapters of the SecretStore for Linux (libsecret via `secret-tool`) and macOS (Keychain via `security`).
// Key decisions:
// - Items are addressed by attributes service="NOVA AI" + account=<secret id>; the database row only records that the
//   secret exists (ciphertext column = marker) so has() stays synchronous.
// - secret-tool reads the value from STDIN (never argv). Availability is decided by a real round trip (store, lookup,
//   clear of a probe item) and exit codes only – no parsing of (possibly localized) error text.
// - macOS limitation (documented in SPEC §4.9): `security add-generic-password` accepts the password only as an
//   argument (-w <value>), so the value is briefly visible in the process list. macOS is a development platform only.
import { randomBytes } from 'node:crypto';
import { execTool } from '../core/exec';
import { buildChildEnv } from '../core/child-env';

export const KEYRING_SERVICE = 'NOVA AI';
export const KEYRING_TIMEOUT_MS = 15_000;

export interface ToolRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** argv execution (injected in tests). Rejects only when the executable cannot be started. */
export type ToolRunner = (file: string, args: string[], opts: { input?: string; timeoutMs: number }) => Promise<ToolRunResult>;

export const defaultToolRunner: ToolRunner = (file, args, opts) =>
  execTool(file, args, { input: opts.input, timeoutMs: opts.timeoutMs, env: buildChildEnv({ LC_ALL: 'C', LANG: 'C' }) });

async function run(runner: ToolRunner, file: string, args: string[], input?: string): Promise<ToolRunResult | null> {
  try {
    return await runner(file, args, { input, timeoutMs: KEYRING_TIMEOUT_MS });
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------------------------- libsecret (Linux)

export const SECRET_TOOL = 'secret-tool';

export async function libsecretStore(runner: ToolRunner, id: string, value: string): Promise<boolean> {
  const r = await run(runner, SECRET_TOOL, ['store', '--label', `${KEYRING_SERVICE}: ${id}`, 'service', KEYRING_SERVICE, 'account', id], value);
  return r?.code === 0;
}

/** Value, null when not found, undefined when secret-tool failed to run. */
export async function libsecretLookup(runner: ToolRunner, id: string): Promise<string | null | undefined> {
  const r = await run(runner, SECRET_TOOL, ['lookup', 'service', KEYRING_SERVICE, 'account', id]);
  if (!r) return undefined;
  if (r.code === 0) return r.stdout.length > 0 ? r.stdout : null; // no trailing newline when stdout is a pipe
  if (r.code === 1) return null;
  return undefined;
}

export async function libsecretClear(runner: ToolRunner, id: string): Promise<boolean> {
  const r = await run(runner, SECRET_TOOL, ['clear', 'service', KEYRING_SERVICE, 'account', id]);
  return r?.code === 0;
}

/** Real round trip; false when no secret service (D-Bus, keyring daemon) is usable. */
export async function libsecretProbe(runner: ToolRunner): Promise<boolean> {
  const id = '__nova_probe__';
  const value = randomBytes(12).toString('hex');
  if (!(await libsecretStore(runner, id, value))) return false;
  const back = await libsecretLookup(runner, id);
  await libsecretClear(runner, id);
  return back === value;
}

// ------------------------------------------------------------------------------------------------ Keychain (macOS)

export const SECURITY_TOOL = '/usr/bin/security';

export async function keychainStore(runner: ToolRunner, id: string, value: string): Promise<boolean> {
  // Limitation: -w takes the value as an argument (visible in the process list while the call runs).
  const r = await run(runner, SECURITY_TOOL, ['add-generic-password', '-U', '-s', KEYRING_SERVICE, '-a', id, '-w', value]);
  return r?.code === 0;
}

/** Value, null when not found (exit 44), undefined when the call failed. */
export async function keychainLookup(runner: ToolRunner, id: string): Promise<string | null | undefined> {
  const r = await run(runner, SECURITY_TOOL, ['find-generic-password', '-s', KEYRING_SERVICE, '-a', id, '-w']);
  if (!r) return undefined;
  if (r.code === 0) return r.stdout.replace(/\r?\n$/, '') || null;
  if (r.code === 44) return null;
  return undefined;
}

export async function keychainDelete(runner: ToolRunner, id: string): Promise<boolean> {
  const r = await run(runner, SECURITY_TOOL, ['delete-generic-password', '-s', KEYRING_SERVICE, '-a', id]);
  return r?.code === 0 || r?.code === 44;
}
