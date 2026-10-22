// Safe execution of external TOOLS with argv (git, where, ollama, winget, nvidia-smi, powershell scripts ...).
// Not for agent/user command lines (those go through ProcessManager). Never uses a shell with concatenated strings;
// Windows .cmd/.bat shims (npm, npx, code) are run through cmd.exe only with strictly validated arguments
// (Node refuses to spawn them directly since CVE-2024-27980).
import { execFile, spawn } from 'node:child_process';
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

/** Locates an executable on PATH (where.exe on Windows, `command -v` elsewhere). Returns the first match or null. */
export async function findExecutable(name: string, platform: NodeJS.Platform = process.platform): Promise<string | null> {
  if (!/^[A-Za-z0-9_.+-]+$/.test(name)) return null;
  try {
    if (platform === 'win32') {
      const r = await execTool('where.exe', [name], { timeoutMs: 5000, platform });
      if (r.code !== 0) return null;
      return r.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
    }
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
