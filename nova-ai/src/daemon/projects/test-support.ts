// Test-only helpers for the projects module (imported by *.test.ts only, never by the barrel).
// Small hand-written fakes for the services the module uses through the Services container, plus a POSIX
// ProcessManager fake that really spawns `/bin/sh -c` (used to run template tests and runtime checks end-to-end).
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import type {
  ApprovalCheck,
  ApprovalRequest,
  CommandDecision,
  CommandResult,
  GitService,
  PathGuard,
  ProcessHandle,
  ProcessManager,
  ResolvedPath,
  RunCommandInput,
  StartProcessInput,
} from '../contracts';
import type { IntegrationStatus, ProcessInfo, TaskStatus } from '@shared/schemas';
import { buildChildEnv } from '../core/child-env';
import { NovaError } from '../core/errors';

export interface Call {
  method: string;
  args: unknown[];
}

/** Records calls of an object of functions. */
export function recorder<T extends object>(impl: T, calls: Call[], name: string): T {
  return new Proxy(impl, {
    get(target, prop) {
      const v = (target as Record<string | symbol, unknown>)[prop];
      if (typeof v !== 'function') return v;
      return (...args: unknown[]) => {
        calls.push({ method: `${name}.${String(prop)}`, args });
        return (v as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

export function fakeGit(opts: { available?: boolean; onClone?: (url: string, dir: string, onProgress?: (p: number | null, m: string) => void) => Promise<void> } = {}): GitService & { repos: Set<string>; commits: { root: string; paths: string[]; message: string }[] } {
  const repos = new Set<string>();
  const commits: { root: string; paths: string[]; message: string }[] = [];
  return {
    repos,
    commits,
    async available() {
      return opts.available ?? true;
    },
    async isRepo(root) {
      return repos.has(root);
    },
    async init(root) {
      mkdirSync(`${root}/.git`, { recursive: true });
      repos.add(root);
    },
    async status() {
      return { isRepo: true, branch: 'main', head: null, ahead: 0, behind: 0, files: [], clean: true };
    },
    async head() {
      return null;
    },
    async diff() {
      return [];
    },
    async log() {
      return [];
    },
    async commitPaths(root, paths, message) {
      commits.push({ root, paths, message });
      return 'abc123';
    },
    async clone(url, dir, signal, onProgress) {
      if (signal?.aborted) throw new NovaError('CANCELLED', 'Abgebrochen.');
      if (opts.onClone) await opts.onClone(url, dir, onProgress);
      repos.add(dir);
    },
    async showFile() {
      return null;
    },
    async isClean() {
      return new Set<string>();
    },
  };
}

export function fakeIntegrations(available: Record<string, boolean> = { node: true, git: true }, unityPath: string | null = null) {
  const statuses = (): IntegrationStatus[] =>
    Object.entries(available).map(([id, ok]) => ({
      id,
      name: id === 'node' ? 'Node.js' : id === 'dotnet' ? '.NET SDK' : id === 'unity' ? 'Unity' : id,
      category: 'runtime',
      available: ok,
      version: ok ? '1.0.0' : null,
      path: ok ? `/usr/bin/${id}` : null,
      manualPath: null,
      installations: [],
      canOpen: false,
      message: '',
      installHint: null,
      checkedAt: 0,
    }));
  const resolveCalls: { id: string; version: string | null | undefined }[] = [];
  return {
    resolveCalls,
    register() {},
    async list() {
      return statuses();
    },
    async get(id: string) {
      const st = statuses().find((x) => x.id === id);
      if (!st) throw new NovaError('NOT_FOUND', 'nicht gefunden');
      return st;
    },
    async resolvePath(id: string, o?: { version?: string | null }) {
      resolveCalls.push({ id, version: o?.version });
      if (id === 'unity') return unityPath;
      return available[id] ? `/usr/bin/${id}` : null;
    },
    async setPath() {
      throw new Error('not used');
    },
    async requestInstall() {
      return { approvalId: null, message: '' };
    },
    async open() {},
  };
}

export function fakeTasks(counts: Partial<Record<TaskStatus, number>> = {}) {
  const all: TaskStatus[] = ['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'done', 'failed', 'cancelled', 'interrupted'];
  return {
    counts() {
      return Object.fromEntries(all.map((st) => [st, counts[st] ?? 0])) as Record<TaskStatus, number>;
    },
  };
}

/** Minimal PathGuard: containment via realpath of the deepest existing ancestor, dot-files sensitive (.env). */
export function fakePathGuard(): PathGuard {
  const canon = (p: string): string => {
    let cur = p;
    const rest: string[] = [];
    for (;;) {
      if (existsSync(cur)) return resolve(realpathSync.native(cur), ...rest);
      const parent = resolve(cur, '..');
      if (parent === cur) return p;
      rest.unshift(cur.slice(parent.length + (parent.endsWith(sep) ? 0 : 1)));
      cur = parent;
    }
  };
  return {
    resolve(projectRoot: string, p: string): ResolvedPath {
      if (p.includes('\0')) throw new NovaError('VALIDATION', 'NUL');
      const root = realpathSync.native(projectRoot);
      const abs = canon(isAbsolute(p) ? p : resolve(root, p));
      const rel = relative(root, abs);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new NovaError('PATH_OUTSIDE_PROJECT', 'Pfad außerhalb des Projekts.');
      const relFwd = rel.split(sep).join('/');
      return { abs, rel: relFwd, key: relFwd };
    },
    isInside(projectRoot, abs) {
      const rel = relative(realpathSync.native(projectRoot), abs);
      return !rel.startsWith('..') && !isAbsolute(rel);
    },
    isProtected(_root, key) {
      return key === '.git' || key.startsWith('.git/') || key.startsWith('.nova/');
    },
    isSensitive(rel) {
      const name = rel.split('/').pop() ?? '';
      return /^\.env(\..*)?$/.test(name) || /\.(pem|key)$/.test(name) || /^secrets\./.test(name);
    },
  };
}

export function fakeApprovals(state: ApprovalCheck['state'] = 'approved') {
  const requests: ApprovalRequest[] = [];
  const consumed: string[] = [];
  const acknowledged: string[] = [];
  const approval = (req: ApprovalRequest) => ({
    id: 'apr_1',
    projectId: req.projectId,
    taskId: req.taskId ?? null,
    runId: null,
    kind: req.kind,
    fingerprint: 'fp',
    title: req.title,
    action: req.action,
    consequences: req.consequences,
    details: {},
    status: state === 'approved' ? ('approved' as const) : state === 'denied' ? ('denied' as const) : ('pending' as const),
    scope: 'once' as const,
    createdAt: 0,
    decidedAt: null,
  });
  return {
    requests,
    consumed,
    acknowledged,
    check(req: ApprovalRequest): ApprovalCheck {
      requests.push(req);
      if (state === 'approved') return { state: 'approved', approval: approval(req), viaRule: false };
      if (state === 'denied') return { state: 'denied', approval: approval(req) };
      return { state: 'pending', approval: approval(req) };
    },
    consume(id: string) {
      consumed.push(id);
    },
    acknowledgeDenial(id: string) {
      acknowledged.push(id);
    },
    pendingCount() {
      return 2;
    },
    expireForProject() {},
  };
}

export function fakePolicy(decision: CommandDecision) {
  const seen: string[] = [];
  return {
    seen,
    evaluate(input: { command: string }): CommandDecision {
      seen.push(input.command);
      return decision;
    },
  };
}

// ---------------------------------------------------------------------------------------------- processes

export interface ScriptedResult {
  exitCode?: number | null;
  output?: string;
  timedOut?: boolean;
  cancelled?: boolean;
  /** Runs while the "process" is active (e.g. write result files). */
  effect?: (input: RunCommandInput) => void | Promise<void>;
  /** Wait for the abort signal instead of finishing (cancel tests). */
  hang?: boolean;
}

/** ProcessManager fake with scripted results per command (regex → result). */
export function scriptedProcesses(script: { match: RegExp; result: ScriptedResult }[]): ProcessManager & { runs: RunCommandInput[] } {
  const runs: RunCommandInput[] = [];
  let counter = 0;
  const pm = {
    runs,
    async run(input: RunCommandInput): Promise<CommandResult> {
      runs.push(input);
      const entry = script.find((e) => e.match.test(input.command));
      const r: ScriptedResult = entry?.result ?? { exitCode: 0, output: '' };
      if (r.effect) await r.effect(input);
      input.onOutput?.('stdout', r.output ?? '');
      if (r.hang) {
        await new Promise<void>((resolveHang) => {
          if (input.signal?.aborted) return resolveHang();
          input.signal?.addEventListener('abort', () => resolveHang(), { once: true });
        });
        return { processId: `proc_${++counter}`, exitCode: null, signal: 'SIGTERM', stdout: '', stderr: '', output: r.output ?? '', timedOut: false, cancelled: true, durationMs: 1 };
      }
      return {
        processId: `proc_${++counter}`,
        exitCode: r.exitCode === undefined ? 0 : r.exitCode,
        signal: null,
        stdout: r.output ?? '',
        stderr: '',
        output: r.output ?? '',
        timedOut: r.timedOut ?? false,
        cancelled: r.cancelled ?? false,
        durationMs: 5,
      };
    },
    async start(): Promise<ProcessHandle> {
      throw new Error('start not scripted');
    },
    async kill(id: string): Promise<ProcessInfo> {
      return info(id, 'killed');
    },
    async killTask() {},
    async killProject() {},
    get() {
      return null;
    },
    list() {
      return [];
    },
    output() {
      return '';
    },
    async recoverOrphans() {
      return 0;
    },
    runningCount() {
      return 0;
    },
    prune() {
      return 0;
    },
    async shutdown() {},
  };
  return pm;
}

function info(id: string, status: ProcessInfo['status'], extra: Partial<ProcessInfo> = {}): ProcessInfo {
  return { id, projectId: null, taskId: null, kind: 'command', command: '', cwd: '', pid: null, status, exitCode: null, url: null, startedAt: 0, endedAt: null, ...extra };
}

const DEFAULT_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\S*/;

/** Real POSIX ProcessManager fake: `/bin/sh -c` in its own process group, kill = SIGKILL to the group. */
export function shellProcesses(): ProcessManager & { killed: string[] } {
  const procs = new Map<string, { child: ChildProcess; info: ProcessInfo; output: string }>();
  const killed: string[] = [];
  let counter = 0;
  const spawnShell = (input: RunCommandInput | StartProcessInput) => {
    const id = `proc_${++counter}`;
    const child = spawn('/bin/sh', ['-c', input.command], { cwd: input.cwd, env: buildChildEnv(input.env ?? {}), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const entry = { child, info: info(id, 'running', { projectId: input.projectId ?? null, kind: input.kind, command: input.command, cwd: input.cwd, pid: child.pid ?? null, startedAt: Date.now() }), output: '' };
    procs.set(id, entry);
    const onData = (stream: 'stdout' | 'stderr') => (b: Buffer) => {
      const text = b.toString('utf8');
      entry.output += text;
      input.onOutput?.(stream, text);
    };
    child.stdout?.on('data', onData('stdout'));
    child.stderr?.on('data', onData('stderr'));
    const exited = new Promise<number | null>((resolveExit) => {
      child.once('close', (code) => {
        if (entry.info.status === 'running') entry.info.status = 'exited';
        entry.info.exitCode = code;
        entry.info.endedAt = Date.now();
        resolveExit(code);
      });
      child.once('error', () => {
        entry.info.status = 'failed';
        resolveExit(null);
      });
    });
    return { id, entry, exited };
  };
  const killGroup = (entry: { child: ChildProcess; info: ProcessInfo }) => {
    if (entry.child.pid && entry.info.status === 'running') {
      try {
        process.kill(-entry.child.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
      entry.info.status = 'killed';
    }
  };
  const pm = {
    killed,
    async run(input: RunCommandInput): Promise<CommandResult> {
      const started = Date.now();
      const { id, entry, exited } = spawnShell(input);
      let timedOut = false;
      let cancelled = false;
      const timer = input.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            killGroup(entry);
          }, input.timeoutMs)
        : null;
      const onAbort = () => {
        cancelled = true;
        killGroup(entry);
      };
      input.signal?.addEventListener('abort', onAbort, { once: true });
      const code = await exited;
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener('abort', onAbort);
      return { processId: id, exitCode: code, signal: null, stdout: entry.output, stderr: '', output: entry.output, timedOut, cancelled, durationMs: Date.now() - started };
    },
    async start(input: StartProcessInput): Promise<ProcessHandle> {
      const { id, entry, exited } = spawnShell(input);
      const re = input.urlPattern ? new RegExp(input.urlPattern) : DEFAULT_URL;
      input.signal?.addEventListener('abort', () => killGroup(entry), { once: true });
      return {
        info: () => ({ ...entry.info }),
        exited,
        waitForUrl(timeoutMs: number) {
          return new Promise<string | null>((resolveUrl) => {
            const check = () => {
              const m = re.exec(entry.output);
              if (m) {
                done(m[0]);
                return true;
              }
              return false;
            };
            const done = (v: string | null) => {
              clearInterval(iv);
              clearTimeout(to);
              resolveUrl(v);
            };
            const iv = setInterval(() => {
              if (!check() && entry.info.status !== 'running') done(null);
            }, 25);
            const to = setTimeout(() => done(null), timeoutMs);
            check();
          });
        },
      };
    },
    async kill(id: string): Promise<ProcessInfo> {
      const entry = procs.get(id);
      if (!entry) throw new NovaError('NOT_FOUND', 'Prozess unbekannt');
      killed.push(id);
      killGroup(entry);
      return { ...entry.info };
    },
    async killTask() {},
    async killProject() {
      for (const e of procs.values()) killGroup(e);
    },
    get(id: string) {
      const e = procs.get(id);
      return e ? { ...e.info } : null;
    },
    list() {
      return [...procs.values()].map((e) => ({ ...e.info }));
    },
    output(id: string, tailLines: number) {
      const e = procs.get(id);
      return e ? e.output.split('\n').slice(-tailLines).join('\n') : '';
    },
    async recoverOrphans() {
      return 0;
    },
    runningCount() {
      return [...procs.values()].filter((e) => e.info.status === 'running').length;
    },
    prune() {
      return 0;
    },
    async shutdown() {
      for (const e of procs.values()) killGroup(e);
    },
  };
  return pm;
}
