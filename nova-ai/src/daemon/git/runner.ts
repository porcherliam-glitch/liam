// Low-level git execution for GitService: argv only (never a shell string), secret-free environment from
// buildChildEnv({LC_ALL:'C', LANG:'C'}), fixed safety config and per-repository serialization of mutating commands.
// Key decisions:
// - Text commands go through core/exec.ts execTool (SPEC §6.0). Two cases execTool cannot serve are handled by
//   spawnGitRaw with the same rules (argv, windowsHide, buildChildEnv, TOOL_MISSING on ENOENT, CANCELLED on abort):
//   binary-safe stdout (GitService.showFile returns a Buffer; execTool decodes UTF-8) and streamed stderr
//   (clone --progress). Abort/timeout of a raw call kills the whole tree (taskkill /T /F on Windows, process group on
//   POSIX) because clone spawns helpers (git-remote-https, index-pack) that would otherwise keep files locked.
// - Every call gets `-c core.longpaths=true -c core.quotepath=off` plus `-c core.fsmonitor=false` (a repository's
//   own config must not be able to run an fsmonitor hook when NOVA merely reads its status) and `color.ui=false`.
//   Mutating calls also disable auto-gc/maintenance so no detached background git keeps the index locked.
// - Variables that redirect git to another repository (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, injected config …)
//   are removed from the inherited environment. GIT_LITERAL_PATHSPECS=1 makes every path a literal (no glob magic);
//   check-ignore does not support it and opts out per call.
// - Read-only calls set GIT_OPTIONAL_LOCKS=0 so a status never takes index.lock away from the user's own tools.
import { spawn } from 'node:child_process';
import { buildChildEnv } from '../core/child-env';
import { execTool, type ExecToolResult } from '../core/exec';
import { NovaError, isNovaError } from '../core/errors';

export const GIT_REF_RE = /^(?!-)[A-Za-z0-9._/@{}~^-]+$/;

export const BASE_CONFIG = ['-c', 'core.longpaths=true', '-c', 'core.quotepath=off', '-c', 'core.fsmonitor=false', '-c', 'color.ui=false'];
export const WRITE_CONFIG = ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false'];

const REDIRECTING_ENV = /^(GIT_DIR|GIT_WORK_TREE|GIT_INDEX_FILE|GIT_PREFIX|GIT_COMMON_DIR|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES|GIT_NAMESPACE|GIT_CONFIG_PARAMETERS|GIT_CONFIG_COUNT|GIT_CONFIG_KEY_\d+|GIT_CONFIG_VALUE_\d+|GIT_EXEC_PATH|GIT_OPTIONAL_LOCKS|GIT_LITERAL_PATHSPECS|GIT_GLOB_PATHSPECS|GIT_NOGLOB_PATHSPECS|GIT_ICASE_PATHSPECS)$/i;

export const READ_TIMEOUT_MS = 60_000;
export const WRITE_TIMEOUT_MS = 5 * 60_000;
export const CLONE_TIMEOUT_MS = 2 * 60 * 60_000;
export const BIG_BUFFER = 64 * 1024 * 1024;

export interface GitEnvOptions {
  platform: NodeJS.Platform;
  write: boolean;
  literalPathspecs: boolean;
  extra?: Record<string, string>;
}

/** Child environment for one git call. */
export function gitEnv(opts: GitEnvOptions): Record<string, string> {
  const base = buildChildEnv({ LC_ALL: 'C', LANG: 'C', GIT_TERMINAL_PROMPT: '0', GIT_PAGER: 'cat', PAGER: 'cat' }, opts.platform);
  for (const k of Object.keys(base)) if (REDIRECTING_ENV.test(k)) delete base[k];
  if (opts.literalPathspecs) base.GIT_LITERAL_PATHSPECS = '1';
  if (!opts.write) base.GIT_OPTIONAL_LOCKS = '0';
  for (const [k, v] of Object.entries(opts.extra ?? {})) base[k] = v;
  return base;
}

export interface GitCallOptions {
  cwd: string;
  write?: boolean;
  timeoutMs?: number;
  input?: string;
  /** Default true. */
  literalPathspecs?: boolean;
  maxBuffer?: number;
  signal?: AbortSignal;
  /** Extra environment (after the defaults). */
  env?: Record<string, string>;
}

export interface GitRawResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
  timedOut: boolean;
}

export interface GitRawOptions extends GitCallOptions {
  onStderr?: (chunk: string) => void;
}

export const TOOL_MISSING_MESSAGE = 'Git wurde nicht gefunden. Bitte Git installieren (Einstellungen → Werkzeuge) oder den Pfad zu git.exe angeben.';

function toolMissing(cause: unknown): NovaError {
  return new NovaError('TOOL_MISSING', TOOL_MISSING_MESSAGE, {
    severity: 'warning',
    userAction: 'Git unter „Einstellungen → Werkzeuge“ installieren und danach erneut versuchen.',
    cause,
  });
}

/** The git executable plus helpers to run it. */
export class GitRunner {
  constructor(
    private readonly platform: NodeJS.Platform,
    private readonly resolveGit: () => Promise<string>,
    private readonly extraEnv: Record<string, string>,
    private readonly onMissing: () => void,
  ) {}

  private argv(args: string[], write: boolean): string[] {
    return [...BASE_CONFIG, ...(write ? WRITE_CONFIG : []), ...args];
  }

  private env(opts: GitCallOptions): Record<string, string> {
    return gitEnv({
      platform: this.platform,
      write: opts.write === true,
      literalPathspecs: opts.literalPathspecs !== false,
      extra: { ...this.extraEnv, ...(opts.env ?? {}) },
    });
  }

  /** Text call through execTool. Never rejects for a non-zero exit code. */
  async run(args: string[], opts: GitCallOptions): Promise<ExecToolResult> {
    const file = await this.resolveGit();
    try {
      return await execTool(file, this.argv(args, opts.write === true), {
        cwd: opts.cwd,
        env: this.env(opts),
        timeoutMs: opts.timeoutMs ?? (opts.write ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS),
        input: opts.input,
        signal: opts.signal,
        platform: this.platform,
        maxBuffer: opts.maxBuffer,
      });
    } catch (e) {
      if (isNovaError(e) && e.code === 'TOOL_MISSING') {
        this.onMissing();
        throw toolMissing(e);
      }
      throw e;
    }
  }

  /** Binary-safe / streaming call (showFile, clone). Same rules as execTool; kills the process tree on abort/timeout. */
  async raw(args: string[], opts: GitRawOptions): Promise<GitRawResult> {
    const file = await this.resolveGit();
    const argv = this.argv(args, opts.write === true);
    let cmd = file;
    let cmdArgs = argv;
    let verbatim = false;
    if (this.platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
      // A shim cannot be spawned directly (CVE-2024-27980); same strict argument rule as execTool.
      for (const a of [file, ...argv]) {
        if (!/^[A-Za-z0-9_.,:/\\=@+ -]*$/.test(a)) throw new NovaError('VALIDATION', `Unzulässiges Zeichen im Argument für ${file}.`, { details: { arg: a } });
      }
      cmd = process.env.ComSpec ?? 'cmd.exe';
      cmdArgs = ['/d', '/s', '/c', `"${[file, ...argv].map((a) => `"${a}"`).join(' ')}"`];
      verbatim = true;
    }
    const maxBuffer = opts.maxBuffer ?? BIG_BUFFER;
    const timeoutMs = opts.timeoutMs ?? (opts.write ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS);
    const platform = this.platform;
    return new Promise<GitRawResult>((resolve, reject) => {
      if (opts.signal?.aborted) return reject(new NovaError('CANCELLED', 'Abgebrochen.', { severity: 'warning' }));
      const child = spawn(cmd, cmdArgs, {
        cwd: opts.cwd,
        env: this.env(opts),
        windowsHide: true,
        windowsVerbatimArguments: verbatim,
        detached: platform !== 'win32', // own process group on POSIX → kill(-pid) reaches helpers
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const out: Buffer[] = [];
      let outLen = 0;
      let errText = '';
      let timedOut = false;
      let settled = false;
      let killTimer: NodeJS.Timeout | null = null;
      child.stdout.on('data', (b: Buffer) => {
        if (outLen < maxBuffer) {
          out.push(b);
          outLen += b.length;
        }
      });
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => {
        if (errText.length < 1024 * 1024) errText += chunk;
        else errText = errText.slice(-512 * 1024) + chunk;
        try {
          opts.onStderr?.(chunk);
        } catch {
          /* progress callbacks must not break the call */
        }
      });
      const killTree = () => {
        const pid = child.pid;
        if (!pid) return;
        if (platform === 'win32') {
          void execTool('taskkill', ['/pid', String(pid), '/T', '/F'], { timeoutMs: 10_000, platform }).catch(() => child.kill());
        } else {
          try {
            process.kill(-pid, 'SIGTERM');
          } catch {
            child.kill('SIGTERM');
          }
          killTimer = setTimeout(() => {
            try {
              process.kill(-pid, 'SIGKILL');
            } catch {
              /* already gone */
            }
          }, 3000);
          killTimer.unref();
        }
      };
      const timer = setTimeout(() => {
        timedOut = true;
        killTree();
      }, timeoutMs);
      const onAbort = () => killTree();
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      const done = () => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      };
      child.once('error', (e: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        done();
        if (e.code === 'ENOENT') {
          this.onMissing();
          reject(toolMissing(e));
        } else reject(e);
      });
      child.once('close', (code) => {
        if (settled) return;
        settled = true;
        done();
        if (killTimer && code !== null) clearTimeout(killTimer);
        if (opts.signal?.aborted) return reject(new NovaError('CANCELLED', 'Abgebrochen.', { severity: 'warning' }));
        resolve({ code, stdout: Buffer.concat(out), stderr: errText, timedOut });
      });
      if (opts.input !== undefined) child.stdin.end(opts.input);
      else child.stdin.end();
    });
  }
}

/** Promise-chain mutex keyed by canonical repository root. */
export class KeyedMutex {
  private tails = new Map<string, Promise<void>>();
  private active = new Map<string, number>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const tail = previous.then(() => mine);
    this.tails.set(key, tail);
    await previous;
    this.active.set(key, (this.active.get(key) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      const n = (this.active.get(key) ?? 1) - 1;
      if (n <= 0) this.active.delete(key);
      else this.active.set(key, n);
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }

  /** Number of holders currently inside run() for this key (0 or 1). */
  holders(key: string): number {
    return this.active.get(key) ?? 0;
  }
}

/** True when stderr reports git's "detected dubious ownership" safety check. */
export function isDubiousOwnership(stderr: string): boolean {
  return /detected dubious ownership in repository/i.test(stderr);
}

/** The repository path git names in the dubious-ownership message (forward slashes on Windows), if present. */
export function dubiousPath(stderr: string): string | null {
  const m = /detected dubious ownership in repository at '([^'\r\n]+)'/i.exec(stderr);
  return m ? m[1] : null;
}

/** True when a mutating command failed because index.lock (or another *.lock) exists. */
export function isLockFailure(stderr: string): boolean {
  return /Unable to create '[^']*\.lock': File exists/i.test(stderr) || /index\.lock/i.test(stderr);
}
