// Safe execution of external TOOLS with argv (git, ollama, winget, nvidia-smi, powershell scripts ...).
// Not for agent/user command lines (those go through ProcessManager). Never uses a shell with concatenated strings;
// Windows .cmd/.bat shims (npm, npx, code) are run through cmd.exe only with strictly validated arguments
// (Node refuses to spawn them directly since CVE-2024-27980).
import { execFile, spawn } from 'node:child_process';
import { lstatSync, statSync } from 'node:fs';
import { win32 as winPath } from 'node:path';
import { buildChildEnv } from './child-env';
import { NovaError } from './errors';

export interface ExecToolOptions {
  cwd?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  /** Written to stdin, then stdin is closed. */
  input?: string;
  signal?: AbortSignal;
  platform?: NodeJS.Platform;
  /** Max bytes of stdout/stderr kept. Default 10 MB. */
  maxBuffer?: number;
}

export interface ExecToolResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const SAFE_SHIM_ARG = /^[A-Za-z0-9_.,:/\\=@+ -]*$/;

function isShim(file: string): boolean {
  return /\.(cmd|bat)$/i.test(file);
}

/**
 * Runs `file args...`. Resolves with the exit code (never rejects for non-zero exit); rejects with TOOL_MISSING when
 * the executable does not exist, CANCELLED on abort.
 */
export function execTool(file: string, args: string[], opts: ExecToolOptions = {}): Promise<ExecToolResult> {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? buildChildEnv({}, platform);
  let cmd = file;
  let argv = args;
  let verbatim = false;
  if (platform === 'win32' && isShim(file)) {
    for (const a of [file, ...args]) {
      if (!SAFE_SHIM_ARG.test(a)) {
        return Promise.reject(new NovaError('VALIDATION', `Unzulässiges Zeichen im Argument für ${file}.`, { details: { arg: a } }));
      }
    }
    cmd = process.env.ComSpec ?? 'cmd.exe';
    argv = ['/d', '/s', '/c', `"${[file, ...args].map((a) => `"${a}"`).join(' ')}"`];
    verbatim = true;
  }
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, {
      cwd: opts.cwd,
      env,
      windowsHide: true,
      windowsVerbatimArguments: verbatim,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const max = opts.maxBuffer ?? 10 * 1024 * 1024;
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outLen = 0;
    let errLen = 0;
    let timedOut = false;
    let settled = false;
    child.stdout.on('data', (b: Buffer) => {
      if (outLen < max) {
        out.push(b);
        outLen += b.length;
      }
    });
    child.stderr.on('data', (b: Buffer) => {
      if (errLen < max) {
        err.push(b);
        errLen += b.length;
      }
    });
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, opts.timeoutMs)
      : null;
    const onAbort = () => child.kill();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', (e: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (e.code === 'ENOENT') reject(new NovaError('TOOL_MISSING', `Programm nicht gefunden: ${file}`, { severity: 'warning', details: { file } }));
      else reject(e);
    });
    child.once('close', (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      if (opts.signal?.aborted) return reject(new NovaError('CANCELLED', 'Abgebrochen.', { severity: 'warning' }));
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), timedOut });
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

export interface FindExecutableOptions {
  /** Environment whose PATH/PATHEXT is searched (default: buildChildEnv – the refreshed Windows PATH). */
  env?: Record<string, string | undefined>;
  /** Existence check of a candidate (tests). */
  isFile?: (path: string) => boolean;
}

const EXECUTABLE_NAME = /^[A-Za-z0-9_.+-]+$/;

function existingFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    // App execution aliases (%LOCALAPPDATA%\Microsoft\WindowsApps\pwsh.exe …) are reparse points that cannot
    // always be opened by stat; they still run.
    try {
      const st = lstatSync(p);
      return st.isFile() || st.isSymbolicLink();
    } catch {
      return false;
    }
  }
}

function envValue(env: Record<string, string | undefined>, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

/**
 * Windows PATH lookup in JavaScript, like cmd.exe: every absolute PATH entry in order (quotes removed, %VAR%
 * expanded), in each the name with every PATHEXT extension (or the name itself when it already has one). Replaces
 * parsing where.exe, whose redirected output comes in the console's OEM code page (C:\Users\Jürgen → mojibake).
 * Relative PATH entries (current folder) are ignored on purpose.
 */
export function findAllExecutables(name: string, platform: NodeJS.Platform = process.platform, opts: FindExecutableOptions = {}): string[] {
  if (!EXECUTABLE_NAME.test(name) || platform !== 'win32') return [];
  const env = opts.env ?? buildChildEnv({}, platform);
  const isFile = opts.isFile ?? existingFile;
  const expand = (v: string) => v.replace(/%([^%;]+)%/g, (m, k: string) => envValue(env, k) ?? m);
  const exts = (envValue(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((e) => e.trim())
    .filter((e) => /^\.[A-Za-z0-9]+$/.test(e));
  const ext = winPath.extname(name).toLowerCase();
  const names = ext && exts.some((e) => e.toLowerCase() === ext) ? [name] : exts.map((e) => name + e.toLowerCase());
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (envValue(env, 'PATH') ?? '').split(';')) {
    const dir = expand(raw.trim().replace(/^"(.*)"$/, '$1')).trim();
    if (!dir || /%[^%]+%/.test(dir) || !/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/])/.test(dir)) continue;
    for (const n of names) {
      const candidate = winPath.join(dir, n);
      const key = candidate.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (isFile(candidate)) out.push(candidate);
    }
  }
  return out;
}

/** Locates an executable on PATH (JavaScript lookup on Windows, `command -v` elsewhere). First match or null. */
export async function findExecutable(name: string, platform: NodeJS.Platform = process.platform, opts: FindExecutableOptions = {}): Promise<string | null> {
  if (!EXECUTABLE_NAME.test(name)) return null;
  try {
    if (platform === 'win32') return findAllExecutables(name, platform, opts)[0] ?? null;
    const r = await execTool('/bin/sh', ['-c', `command -v ${name}`], { timeoutMs: 5000, platform });
    if (r.code !== 0) return null;
    return r.stdout.trim().split('\n')[0] || null;
  } catch {
    return null;
  }
}

/** Runs a PowerShell script (Windows) with UTF-8 output; the script is passed via -EncodedCommand (no quoting issues). */
export function runPowerShell(script: string, opts: Omit<ExecToolOptions, 'platform'> = {}): Promise<ExecToolResult> {
  const prefix =
    "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Console]::OutputEncoding;";
  const encoded = Buffer.from(prefix + script, 'utf16le').toString('base64');
  return execTool('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
    ...opts,
    platform: 'win32',
  });
}

/** execFile wrapper kept for simple version checks with a short timeout (argv only). */
export function quickVersion(file: string, args: string[], timeoutMs = 5000): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: timeoutMs, encoding: 'utf8', env: buildChildEnv() }, (err, stdout, stderr) => {
      if (err) return resolve(null);
      resolve(`${stdout}${stderr}`.trim() || null);
    });
  });
}

/** cmd.exe's own "unknown command" messages (English, older and current German) with the program name. */
const WINDOWS_NOT_FOUND =
  /'([^'\r\n]+)' is not recognized as an internal or external command|'([^'\r\n]+)' wird nicht als interner oder externer Befehl|"([^"\r\n]+)" ist entweder falsch geschrieben oder\s+konnte nicht gefunden werden/i;

/**
 * Did a command line fail because a program does not exist? POSIX shells exit with 127. cmd.exe exits with 9009 –
 * but not inside compound lines ("chcp 65001>nul & …", npm scripts, && chains), where it returns 1; there its own
 * error message is the reliable signal. `program` is the missing name when the message names it.
 */
export function commandNotFound(exitCode: number | null, output: string, platform: NodeJS.Platform): { program: string | null } | null {
  if (exitCode === null || exitCode === 0) return null;
  if (platform !== 'win32') return exitCode === 127 ? { program: null } : null;
  const m = WINDOWS_NOT_FOUND.exec(output);
  if (m) return { program: m[1] ?? m[2] ?? m[3] ?? null };
  return exitCode === 9009 ? { program: null } : null;
}
