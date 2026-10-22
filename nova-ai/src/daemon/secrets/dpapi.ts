// Windows DPAPI bridge for the SecretStore (SPEC §4.9, §6.9).
// Key decisions:
// - ONE `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -` process per batch. The
//   script AND the data travel on stdin as a single ASCII line; secrets never appear in argv (argv is visible to every
//   process of the machine via the process list). This is the deliberate exception to "every daemon PowerShell script
//   runs through runPowerShell (-EncodedCommand)": -EncodedCommand puts the payload into argv.
// - The request is a JSON document {items:[{op,id,data}]} encoded as base64 and embedded in a single-quoted
//   PowerShell literal (base64 has no quote characters). Plaintext values are base64 inside that document, so stdin is
//   pure ASCII and console code pages cannot corrupt it.
// - Entropy = UTF-8 bytes of "NOVA AI|" + id: a ciphertext copied to another id does not decrypt.
// - Scope CurrentUser. Honest limit (SPEC §6.0 d): DPAPI protects against other Windows users and offline disk access,
//   not against processes of the same user (including commands NOVA runs).
// - The answer is one line "NOVA-DPAPI:<json array>" with per-item results; errors carry only the .NET exception type
//   name (never data). A missing marker or non-zero exit code means the whole batch failed.
// - DPAPI cannot run on Linux; the store's Windows path is unit-tested with an injected fake runner.
import { z } from 'zod';
import { execTool } from '../core/exec';
import { buildChildEnv } from '../core/child-env';

export const DPAPI_POWERSHELL = 'powershell.exe';
export const DPAPI_POWERSHELL_ARGS: readonly string[] = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'];
export const DPAPI_RESULT_MARKER = 'NOVA-DPAPI:';
export const DPAPI_ERROR_MARKER = 'NOVA-DPAPI-ERROR:';
export const DPAPI_ENTROPY_PREFIX = 'NOVA AI|';
/** Cold PowerShell starts can take several seconds on slow PCs with antivirus scanning. */
export const DPAPI_TIMEOUT_MS = 30_000;

export interface DpapiItem {
  op: 'protect' | 'unprotect';
  id: string;
  /** protect: base64 of the UTF-8 plaintext; unprotect: base64 of the DPAPI blob. */
  data: string;
}

export interface DpapiItemResult {
  id: string;
  ok: boolean;
  /** protect: base64 DPAPI blob; unprotect: base64 of the UTF-8 plaintext. */
  data?: string;
  /** .NET exception type name when ok=false. */
  error?: string;
}

export interface PowerShellStdinResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

/** Runs `file args` with `stdin` written to the process (injected in tests; DPAPI only exists on Windows). */
export type PowerShellStdinRunner = (file: string, args: readonly string[], stdin: string, timeoutMs: number) => Promise<PowerShellStdinResult>;

export const defaultPowerShellStdinRunner: PowerShellStdinRunner = (file, args, stdin, timeoutMs) =>
  execTool(file, [...args], { input: stdin, timeoutMs, platform: 'win32', env: buildChildEnv({}, 'win32'), maxBuffer: 32 * 1024 * 1024 });

/**
 * Builds the single-line PowerShell script for a batch. Pure ASCII by construction (the payload is base64).
 * The trailing blank line makes Windows PowerShell 5.1 execute the line when stdin closes.
 */
export function buildDpapiStdin(items: DpapiItem[]): string {
  const payload = Buffer.from(JSON.stringify({ items }), 'utf8').toString('base64');
  const script =
    "$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';" +
    '[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);' +
    'try{Add-Type -AssemblyName System.Security;' +
    `$req=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))|ConvertFrom-Json;` +
    '$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser;$out=@();' +
    'foreach($it in @($req.items)){' +
    `try{$ent=[Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY_PREFIX}'+[string]$it.id);$b=[Convert]::FromBase64String([string]$it.data);` +
    "if($it.op -eq 'protect'){$r=[Security.Cryptography.ProtectedData]::Protect($b,$ent,$scope)}" +
    "elseif($it.op -eq 'unprotect'){$r=[Security.Cryptography.ProtectedData]::Unprotect($b,$ent,$scope)}" +
    "else{throw [ArgumentException]::new('op')};" +
    '$out+=[pscustomobject]@{id=[string]$it.id;ok=$true;data=[Convert]::ToBase64String($r)}' +
    '}catch{$out+=[pscustomobject]@{id=[string]$it.id;ok=$false;error=$_.Exception.GetType().Name}}' +
    '};' +
    `'${DPAPI_RESULT_MARKER}'+(ConvertTo-Json -InputObject @($out) -Compress -Depth 3)` +
    `}catch{'${DPAPI_ERROR_MARKER}'+$_.Exception.GetType().Name;exit 2}`;
  return `${script}\r\n\r\n`;
}

const ResultItemSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  data: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export type DpapiParseResult = { ok: true; items: DpapiItemResult[] } | { ok: false; reason: string };

/** Parses the runner output. Never includes stdout content in the failure reason (it could contain plaintext). */
export function parseDpapiOutput(result: PowerShellStdinResult): DpapiParseResult {
  if (result.timedOut) return { ok: false, reason: 'timeout' };
  const lines = result.stdout.split(/\r?\n/).map((l) => l.trim());
  const errLine = lines.find((l) => l.startsWith(DPAPI_ERROR_MARKER));
  if (errLine) return { ok: false, reason: `powershell:${errLine.slice(DPAPI_ERROR_MARKER.length).replace(/[^A-Za-z0-9_.]/g, '').slice(0, 80)}` };
  if (result.code !== 0) return { ok: false, reason: `exit:${result.code === null ? 'null' : result.code}` };
  const line = lines.find((l) => l.startsWith(DPAPI_RESULT_MARKER));
  if (!line) return { ok: false, reason: 'no-result' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(DPAPI_RESULT_MARKER.length));
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
  // Windows PowerShell may still unwrap a single-element array in edge cases – accept both shapes.
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const items: DpapiItemResult[] = [];
  for (const raw of arr) {
    const r = ResultItemSchema.safeParse(raw);
    if (!r.success) return { ok: false, reason: 'bad-shape' };
    items.push({ id: r.data.id, ok: r.data.ok, data: r.data.data ?? undefined, error: r.data.error ?? undefined });
  }
  return { ok: true, items };
}

/** Runs one batch. Returns per-id results or throws a plain Error with a data-free reason (caller maps to SECRET_STORE). */
export async function runDpapiBatch(runner: PowerShellStdinRunner, items: DpapiItem[]): Promise<Map<string, DpapiItemResult>> {
  const out = new Map<string, DpapiItemResult>();
  if (items.length === 0) return out;
  let result: PowerShellStdinResult;
  try {
    result = await runner(DPAPI_POWERSHELL, DPAPI_POWERSHELL_ARGS, buildDpapiStdin(items), DPAPI_TIMEOUT_MS);
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : 'spawn';
    throw new Error(`dpapi-runner:${code}`);
  }
  const parsed = parseDpapiOutput(result);
  if (!parsed.ok) throw new Error(`dpapi:${parsed.reason}`);
  for (const r of parsed.items) out.set(r.id, r);
  for (const it of items) if (!out.has(it.id)) out.set(it.id, { id: it.id, ok: false, error: 'Missing' });
  return out;
}
