// ProcessManager (table `processes`): the ONE place where agent commands, checks, previews, installs and terminal lines
// become child processes (SPEC §4.3, §6.3, contract ProcessManager).
// Key decisions:
// - Spawning: platform shell from shell.ts (Windows `cmd.exe /d /s /c "chcp 65001>nul & <line>"` verbatim, PowerShell
//   -EncodedCommand for terminal lines; POSIX `/bin/sh -c` detached = own process group). env = buildChildEnv(input.env)
//   (secret-free, CI=1, NO_COLOR, npm_config_yes=false …), windowsHide, never `shell: true`.
// - Governor: kinds command/test/build/install/terminal wait for governor.canStartProcess() (poll 1 s, honour abort) up
//   to the timeout, then RESOURCE_LIMIT. The final check, the row INSERT (started_at = wall clock immediately before
//   spawn, instance_id) and spawn() happen synchronously in one tick, so parallel callers cannot overshoot the limit.
// - Output: UTF-8 decoded per stream, tails capped (default 1 MB per stream), redacted when read; 'process.output'
//   events batched ≥ 100 ms and redacted; 'process.updated' on start, URL detection and end. The stored command is
//   redacted (SPEC §6.0.4); the wrapper is never shown.
// - Termination: timeout → timedOut, abort → cancelled, both kill the whole tree (process-tree.ts: Windows CIM walk +
//   taskkill leaves-first, POSIX kill(-pgid) SIGTERM → SIGKILL). When the root exits but leftover descendants keep the
//   output pipes open for more than 1 s, those leftovers are killed (a finished command must not leave untracked
//   processes behind) – the exit code of the root is kept. Exception: programs a user's terminal line started on
//   purpose (`start notepad`, `code .`) keep running; only the reading stops.
// - recoverOrphans(): rows 'running' of other instances → identity check (pid + creation time window) → tree killed
//   leaves-first → row 'orphaned'. Times are wall-clock (Date.now()) because they are compared with OS creation times.
// - Output of finished processes stays available in memory for processes.output (last 50 processes, 128 KB each);
//   after a daemon restart only the metadata remains (German note instead of output).
// Honest limits: commands run with the user's rights (no sandbox); a process that escapes its group/tree on purpose
// (setsid, `start` with a new job object) cannot be tracked.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { statSync } from 'node:fs';
import { ProcessKind as ProcessKindSchema, type ProcessInfo, type ProcessKind } from '@shared/schemas';
import type { CommandResult, ProcessHandle, ProcessManager, RunCommandInput, Services, StartProcessInput } from '../contracts';
import { buildChildEnv, refreshWindowsPath } from '../core/child-env';
import { NovaError, errorMessage, notFound, validation } from '../core/errors';
import { newId } from '../core/ids';
import { redactString } from '../core/redact';
import { sleep } from '../core/time';
import { OutputEmitter, OutputTail, StreamDecoders, lastLines, stripAnsi, utf8Tail, type OutputStream } from './output-tail';
import { buildSpawnSpec } from './shell';
import { createProcessTree, type ProcessTree, type ProcessTreeRunner } from './process-tree';

export type SpawnFn = (file: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface ProcessManagerOptions {
  /** Defaults to s.core.platform. */
  platform?: NodeJS.Platform;
  /** Injectable spawn (tests of the Windows branch). */
  spawn?: SpawnFn;
  /** Injectable tree killer; default createProcessTree({platform, runner: treeRunner, graceMs: killGraceMs}). */
  tree?: ProcessTree;
  treeRunner?: ProcessTreeRunner;
  /** Governor poll interval (default 1000 ms). */
  governorPollMs?: number;
  /** process.output batching (default 100 ms). */
  outputThrottleMs?: number;
  /** POSIX SIGTERM → SIGKILL grace (default 3000 ms). */
  killGraceMs?: number;
  /** How long to wait for the output pipes to close after the root exited (default 1000 ms). */
  closeGraceMs?: number;
  /** Output of this many finished processes stays readable (default 50). */
  exitedOutputCache?: number;
  /** POSIX terminal shell override for tests (null = no bash). */
  bashPath?: string | null;
}

/** Kinds that count against settings.resources.maxProcesses (dev servers and previews do not). */
export const COUNTED_PROCESS_KINDS: ReadonlySet<ProcessKind> = new Set<ProcessKind>(['command', 'test', 'build', 'install', 'terminal']);
export const DEFAULT_URL_PATTERN = 'https?://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?[^\\s"\'<>]*';
export const OUTPUT_UNAVAILABLE =
  'Die Ausgabe dieses Prozesses ist nicht mehr verfügbar. Ausgaben werden nur bis zum Neustart des Hintergrunddienstes aufbewahrt.';

const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
const EXITED_OUTPUT_BYTES = 128 * 1024;
const MAX_LIST_ROWS = 1000;
const URL_WINDOW_CHARS = 4096;
const URL_SETTLE_MS = 300;

interface ProcessRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  kind: string;
  command: string;
  cwd: string;
  pid: number | null;
  status: string;
  exit_code: number | null;
  url: string | null;
  instance_id: string;
  started_at: number;
  ended_at: number | null;
}

function rowToInfo(r: ProcessRow): ProcessInfo {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    kind: r.kind as ProcessKind,
    command: r.command,
    cwd: r.cwd,
    pid: r.pid === null ? null : Number(r.pid),
    status: r.status as ProcessInfo['status'],
    exitCode: r.exit_code === null ? null : Number(r.exit_code),
    url: r.url,
    startedAt: Number(r.started_at),
    endedAt: r.ended_at === null ? null : Number(r.ended_at),
  };
}

interface UrlState {
  re: RegExp;
  window: string;
  settleTimer: NodeJS.Timeout | null;
}

interface Entry {
  info: ProcessInfo;
  child: ChildProcess;
  tail: OutputTail;
  emitter: OutputEmitter;
  decoders: StreamDecoders;
  onOutput: RunCommandInput['onOutput'];
  killedByUs: boolean;
  timedOut: boolean;
  cancelled: boolean;
  killing: Promise<void> | null;
  exitSeen: boolean;
  done: boolean;
  exitCode: number | null;
  exitSignal: string | null;
  spawnError: Error | null;
  spawned: Promise<void>;
  exited: Promise<number | null>;
  resolveExited: (code: number | null) => void;
  finalized: Promise<void>;
  resolveFinalized: () => void;
  url: UrlState | null;
  urlWaiters: Set<(url: string | null) => void>;
  timers: NodeJS.Timeout[];
  cleanup: Array<() => void>;
}

interface Prepared {
  command: string;
  cwd: string;
}

export function createProcessManager(s: Services, opts: ProcessManagerOptions = {}): ProcessManager {
  const core = s.core;
  const platform = opts.platform ?? core.platform;
  const log = core.log.child('processes');
  const spawnFn: SpawnFn = opts.spawn ?? (nodeSpawn as SpawnFn);
  const tree = opts.tree ?? createProcessTree({ platform, log, runner: opts.treeRunner, graceMs: opts.killGraceMs });
  const pollMs = Math.max(10, opts.governorPollMs ?? 1000);
  const throttleMs = Math.max(10, opts.outputThrottleMs ?? 100);
  const closeGraceMs = Math.max(10, opts.closeGraceMs ?? 1000);
  const killWaitMs = (opts.killGraceMs ?? 3000) + 5000;
  const exitedCacheSize = Math.max(1, opts.exitedOutputCache ?? 50);

  const live = new Map<string, Entry>();
  const exitedOutput = new Map<string, string>();
  let stopping = false;

  // ------------------------------------------------------------------------------------------------- persistence

  function insertRow(info: ProcessInfo): void {
    core.db.run(
      `INSERT INTO processes(id, project_id, task_id, kind, command, cwd, pid, status, exit_code, url, instance_id, started_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [info.id, info.projectId, info.taskId, info.kind, info.command, info.cwd, info.pid, info.status, info.exitCode, info.url, core.instanceId, info.startedAt, info.endedAt],
    );
  }

  function updateRow(info: ProcessInfo): void {
    try {
      core.db.run('UPDATE processes SET pid = ?, status = ?, exit_code = ?, url = ?, ended_at = ? WHERE id = ?', [info.pid, info.status, info.exitCode, info.url, info.endedAt, info.id]);
    } catch (e) {
      log.warn('Prozesszustand konnte nicht gespeichert werden', { id: info.id, error: errorMessage(e) });
    }
  }

  function getRow(id: string): ProcessRow | undefined {
    return core.db.get<ProcessRow>('SELECT * FROM processes WHERE id = ?', [id]);
  }

  function emitUpdated(info: ProcessInfo): void {
    core.bus.emit('process.updated', { ...info });
  }

  function rememberOutput(id: string, text: string): void {
    exitedOutput.delete(id);
    exitedOutput.set(id, utf8Tail(text, EXITED_OUTPUT_BYTES));
    while (exitedOutput.size > exitedCacheSize) {
      const oldest = exitedOutput.keys().next().value;
      if (oldest === undefined) break;
      exitedOutput.delete(oldest);
    }
  }

  // ------------------------------------------------------------------------------------------------- helpers

  const interruptedError = () =>
    new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet – es werden keine neuen Prozesse gestartet.', { severity: 'warning' });
  const cancelledError = () => new NovaError('CANCELLED', 'Abgebrochen – der Befehl wurde nicht gestartet.', { severity: 'warning' });

  function prepare(input: RunCommandInput): Prepared {
    if (stopping) throw interruptedError();
    const command = typeof input.command === 'string' ? input.command.trim() : '';
    if (!command) throw validation('Es wurde kein Befehl angegeben.');
    if (command.includes('\0')) throw validation('Der Befehl enthält ein unzulässiges Steuerzeichen.');
    if (!ProcessKindSchema.safeParse(input.kind).success) throw validation(`Unbekannte Prozessart: ${String(input.kind)}`);
    let isDir = false;
    try {
      isDir = statSync(input.cwd).isDirectory();
    } catch {
      throw new NovaError('NOT_FOUND', `Der Arbeitsordner wurde nicht gefunden: ${input.cwd}`, { severity: 'warning' });
    }
    if (!isDir) throw validation(`Der Arbeitsordner ist kein Ordner: ${input.cwd}`);
    return { command, cwd: input.cwd };
  }

  function defaultTimeoutMs(): number {
    try {
      return core.settings.get().resources.commandTimeoutSec * 1000;
    } catch {
      return 600_000;
    }
  }

  function resolveTimeout(t: number | undefined): number {
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? Math.floor(t) : defaultTimeoutMs();
  }

  function canStart(): { ok: boolean; reason: string | null } {
    try {
      return s.governor.canStartProcess();
    } catch (e) {
      log.debug('Ressourcenprüfung nicht verfügbar – Prozess wird gestartet', { error: errorMessage(e) });
      return { ok: true, reason: null };
    }
  }

  const rootAlive = (e: Entry): boolean => !e.exitSeen && e.child.exitCode === null && e.child.signalCode === null;

  // ------------------------------------------------------------------------------------------------- launch

  async function launchWhenAllowed(input: RunCommandInput, prepared: Prepared, waitLimitMs: number, urlPattern: string | null): Promise<Entry> {
    if (platform === 'win32') {
      // Fresh Machine+User PATH (cached 60 s) so tools installed while NOVA runs are found.
      await refreshWindowsPath().catch(() => null);
    }
    const counted = COUNTED_PROCESS_KINDS.has(input.kind);
    const deadline = Date.now() + waitLimitMs;
    let announced = false;
    for (;;) {
      if (stopping) throw interruptedError();
      if (input.signal?.aborted) throw cancelledError();
      const gate = counted ? canStart() : { ok: true, reason: null };
      if (gate.ok) return launch(input, prepared, urlPattern); // synchronous: check, INSERT and spawn in one tick
      if (!announced) {
        announced = true;
        log.info('Wartet auf einen freien Prozessplatz', { kind: input.kind, reason: gate.reason });
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new NovaError('RESOURCE_LIMIT', `Der Befehl wurde nicht gestartet: ${gate.reason ?? 'Es ist kein Prozessplatz frei geworden.'}`, {
          severity: 'warning',
          autoFixable: true,
          userAction: 'Laufende Prozesse beenden oder unter Einstellungen → Ressourcen mehr parallele Prozesse erlauben.',
        });
      }
      try {
        await sleep(Math.min(pollMs, remaining), input.signal);
      } catch {
        throw cancelledError();
      }
    }
  }

  function launch(input: RunCommandInput, prepared: Prepared, urlPattern: string | null): Entry {
    let urlRe: RegExp | null = null;
    if (urlPattern !== null) {
      try {
        urlRe = new RegExp(urlPattern, 'i');
      } catch {
        throw validation('Ungültiges Muster für die Adresserkennung.');
      }
    }
    const env = buildChildEnv(input.env ?? {}, platform);
    const spec = buildSpawnSpec(prepared.command, input.shell ?? 'default', { platform, env, bashPath: opts.bashPath });
    const info: ProcessInfo = {
      id: newId('proc'),
      projectId: input.projectId ?? null,
      taskId: input.taskId ?? null,
      kind: input.kind,
      command: redactString(prepared.command),
      cwd: prepared.cwd,
      pid: null,
      status: 'running',
      exitCode: null,
      url: null,
      startedAt: Date.now(), // wall clock immediately before spawn (identity check against OS creation time)
      endedAt: null,
    };
    insertRow(info);
    let child: ChildProcess;
    try {
      child = spawnFn(spec.file, spec.args, {
        cwd: prepared.cwd,
        env,
        windowsHide: true,
        windowsVerbatimArguments: spec.windowsVerbatimArguments,
        detached: spec.detached,
        stdio: [input.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      });
    } catch (e) {
      info.status = 'failed';
      info.endedAt = Date.now();
      updateRow(info);
      emitUpdated(info);
      throw new NovaError('COMMAND_FAILED', `Der Befehl konnte nicht gestartet werden: ${errorMessage(e)}`, { severity: 'warning', cause: e });
    }
    info.pid = typeof child.pid === 'number' ? child.pid : null;
    if (info.pid !== null) updateRow(info);

    let resolveExited!: (code: number | null) => void;
    let resolveFinalized!: () => void;
    const e: Entry = {
      info,
      child,
      tail: new OutputTail(input.maxOutputBytes && input.maxOutputBytes > 0 ? input.maxOutputBytes : DEFAULT_MAX_OUTPUT_BYTES),
      emitter: new OutputEmitter((stream, data) => core.bus.emit('process.output', { processId: info.id, projectId: info.projectId, stream, data }), throttleMs),
      decoders: new StreamDecoders(),
      onOutput: input.onOutput,
      killedByUs: false,
      timedOut: false,
      cancelled: false,
      killing: null,
      exitSeen: false,
      done: false,
      exitCode: null,
      exitSignal: null,
      spawnError: null,
      spawned: Promise.resolve(),
      exited: new Promise<number | null>((r) => (resolveExited = r)),
      resolveExited: (code) => resolveExited(code),
      finalized: new Promise<void>((r) => (resolveFinalized = r)),
      resolveFinalized: () => resolveFinalized(),
      url: urlRe ? { re: urlRe, window: '', settleTimer: null } : null,
      urlWaiters: new Set(),
      timers: [],
      cleanup: [],
    };
    live.set(info.id, e);
    wire(e, input);
    emitUpdated(info);
    return e;
  }

  function wire(e: Entry, input: RunCommandInput): void {
    const child = e.child;
    let spawnSettled = false;
    e.spawned = new Promise<void>((resolve, reject) => {
      child.once('spawn', () => {
        spawnSettled = true;
        resolve();
      });
      child.once('error', (err: Error) => {
        if (!spawnSettled) {
          spawnSettled = true;
          reject(err);
        }
      });
    });
    e.spawned.catch(() => undefined);

    const onData = (stream: OutputStream) => (chunk: Buffer | string) => handleText(e, stream, e.decoders.write(stream, chunk));
    child.stdout?.on('data', onData('stdout'));
    child.stderr?.on('data', onData('stderr'));
    child.stdout?.on('error', () => undefined);
    child.stderr?.on('error', () => undefined);
    child.stdout?.once('end', () => handleText(e, 'stdout', e.decoders.end('stdout')));
    child.stderr?.once('end', () => handleText(e, 'stderr', e.decoders.end('stderr')));

    child.on('error', (err: Error) => {
      if (e.info.pid === null || !spawnSettled) {
        e.spawnError = err;
        finalize(e);
      } else {
        log.debug('Fehler am Kindprozess', { id: e.info.id, error: errorMessage(err) });
      }
    });
    child.once('exit', (code, signal) => {
      e.exitSeen = true;
      e.exitCode = typeof code === 'number' ? code : null;
      e.exitSignal = signal ?? null;
      const t = setTimeout(() => onLingeringPipes(e), closeGraceMs);
      t.unref?.();
      e.timers.push(t);
    });
    child.once('close', (code, signal) => {
      if (!e.exitSeen) {
        e.exitCode = typeof code === 'number' ? code : null;
        e.exitSignal = signal ?? null;
      }
      finalize(e);
    });

    if (input.stdin !== undefined && child.stdin) {
      child.stdin.on('error', () => undefined); // EPIPE when the process does not read stdin
      child.stdin.end(input.stdin);
    }

    const signal = input.signal;
    if (signal) {
      const onAbort = () => {
        if (e.done) return;
        e.cancelled = true;
        void requestKill(e);
      };
      if (signal.aborted) onAbort();
      else {
        signal.addEventListener('abort', onAbort, { once: true });
        e.cleanup.push(() => signal.removeEventListener('abort', onAbort));
      }
    }
  }

  function armTimeout(e: Entry, timeoutMs: number): void {
    if (e.done) return;
    const t = setTimeout(() => {
      if (e.done) return;
      e.timedOut = true;
      log.info('Zeitlimit erreicht – Prozessbaum wird beendet', { id: e.info.id, timeoutMs });
      void requestKill(e);
    }, timeoutMs);
    t.unref?.();
    e.timers.push(t);
  }

  function onLingeringPipes(e: Entry): void {
    if (e.done) return;
    if (e.info.kind === 'terminal') {
      // A user's terminal line may start programs on purpose (`start notepad`, `code .`): stop reading, keep them.
      log.info('Programme aus einer Terminalzeile laufen nach deren Ende weiter', { id: e.info.id });
      e.child.stdout?.destroy();
      e.child.stderr?.destroy();
      finalize(e);
      return;
    }
    log.info('Nachlaufende Unterprozesse halten die Ausgabe offen – sie werden beendet', { id: e.info.id });
    const pid = e.info.pid;
    const finish = () => {
      if (e.done) return;
      const t = setTimeout(() => {
        if (e.done) return;
        e.child.stdout?.destroy();
        e.child.stderr?.destroy();
        finalize(e);
      }, 500);
      t.unref?.();
      e.timers.push(t);
    };
    if (pid === null) return finish();
    tree
      .killOwn([{ pid, startedAt: e.info.startedAt, alive: false }])
      .catch((err) => log.warn('Nachlaufende Unterprozesse konnten nicht beendet werden', { id: e.info.id, error: errorMessage(err) }))
      .finally(finish);
  }

  function handleText(e: Entry, stream: OutputStream, text: string): void {
    if (!text || e.done) return;
    e.tail.append(stream, text);
    e.emitter.push(stream, text);
    if (e.url && e.info.url === null) detectUrl(e, text, false);
    if (e.onOutput) {
      try {
        e.onOutput(stream, text);
      } catch (err) {
        log.debug('Ausgabe-Callback fehlgeschlagen', { id: e.info.id, error: errorMessage(err) });
      }
    }
  }

  function detectUrl(e: Entry, text: string, final: boolean): void {
    const u = e.url;
    if (!u || e.info.url !== null) return;
    if (text) u.window = (u.window + stripAnsi(text)).slice(-URL_WINDOW_CHARS);
    const m = u.re.exec(u.window);
    if (!m || !m[0]) return;
    const end = m.index + m[0].length;
    if (end >= u.window.length && !final) {
      // The URL touches the end of the output so far – it may continue in the next chunk. Accept it if nothing follows.
      if (u.settleTimer) clearTimeout(u.settleTimer);
      u.settleTimer = setTimeout(() => {
        u.settleTimer = null;
        if (!e.done) detectUrl(e, '', true);
      }, URL_SETTLE_MS);
      u.settleTimer.unref?.();
      return;
    }
    const url = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
    if (!url) return;
    e.info.url = url;
    updateRow(e.info);
    emitUpdated(e.info);
    for (const w of [...e.urlWaiters]) w(url);
  }

  function requestKill(e: Entry): Promise<void> {
    if (e.done) return Promise.resolve();
    e.killedByUs = true;
    if (!e.killing) {
      e.killing = (async () => {
        const pid = e.info.pid;
        if (pid !== null) {
          try {
            await tree.killOwn([{ pid, startedAt: e.info.startedAt, alive: rootAlive(e) }]);
          } catch (err) {
            log.warn('Prozessbaum konnte nicht beendet werden', { id: e.info.id, error: errorMessage(err) });
          }
        }
        if (!e.done && rootAlive(e)) {
          try {
            e.child.kill('SIGKILL');
          } catch {
            /* already gone */
          }
        }
      })();
    }
    return e.killing;
  }

  function finalize(e: Entry): void {
    if (e.done) return;
    // Remaining partial characters (when 'end' did not fire, e.g. after destroy()).
    handleText(e, 'stdout', e.decoders.end('stdout'));
    handleText(e, 'stderr', e.decoders.end('stderr'));
    e.done = true;
    for (const t of e.timers) clearTimeout(t);
    e.timers = [];
    if (e.url?.settleTimer) {
      clearTimeout(e.url.settleTimer);
      e.url.settleTimer = null;
    }
    for (const c of e.cleanup) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    e.emitter.close();
    const neverStarted = e.spawnError !== null && (e.info.pid === null || !e.exitSeen);
    e.info.status = neverStarted ? 'failed' : e.killedByUs ? 'killed' : 'exited';
    e.info.exitCode = e.exitCode;
    e.info.endedAt = Date.now();
    updateRow(e.info);
    emitUpdated(e.info);
    rememberOutput(e.info.id, e.tail.output());
    live.delete(e.info.id);
    for (const w of [...e.urlWaiters]) w(null);
    e.urlWaiters.clear();
    e.resolveExited(e.info.exitCode);
    e.resolveFinalized();
  }

  function resultOf(e: Entry): CommandResult {
    const tails = e.tail.result();
    return {
      processId: e.info.id,
      exitCode: e.info.exitCode,
      signal: e.exitSignal,
      stdout: tails.stdout,
      stderr: tails.stderr,
      output: tails.output,
      timedOut: e.timedOut,
      cancelled: e.cancelled,
      durationMs: Math.max(0, (e.info.endedAt ?? Date.now()) - e.info.startedAt),
    };
  }

  function handleOf(e: Entry): ProcessHandle {
    return {
      info: () => ({ ...e.info }),
      waitForUrl(timeoutMs: number) {
        return new Promise<string | null>((resolve) => {
          if (e.info.url) return resolve(e.info.url);
          if (e.done) return resolve(null);
          let timer: NodeJS.Timeout | null = null;
          const done = (url: string | null) => {
            if (timer) clearTimeout(timer);
            e.urlWaiters.delete(done);
            resolve(url);
          };
          e.urlWaiters.add(done);
          timer = setTimeout(() => done(null), Math.max(0, timeoutMs));
          timer.unref?.();
        });
      },
      exited: e.exited,
    };
  }

  async function killAndWait(e: Entry): Promise<void> {
    await requestKill(e);
    await Promise.race([e.finalized, sleep(killWaitMs)]);
    if (!e.done) log.warn('Prozess reagiert nicht auf das Beenden', { id: e.info.id, pid: e.info.pid });
  }

  function markRowEnded(row: ProcessRow, status: ProcessInfo['status']): ProcessInfo {
    const info = rowToInfo(row);
    info.status = status;
    info.endedAt = Date.now();
    updateRow(info);
    emitUpdated(info);
    return info;
  }

  // ------------------------------------------------------------------------------------------------- service

  const service: ProcessManager = {
    async run(input) {
      const prepared = prepare(input);
      const timeoutMs = resolveTimeout(input.timeoutMs);
      const e = await launchWhenAllowed(input, prepared, timeoutMs, null);
      armTimeout(e, timeoutMs);
      await e.finalized;
      if (e.info.status === 'failed') {
        throw new NovaError('COMMAND_FAILED', `Der Befehl konnte nicht gestartet werden: ${errorMessage(e.spawnError)}`, { severity: 'warning', cause: e.spawnError ?? undefined });
      }
      return resultOf(e);
    },

    async start(input: StartProcessInput) {
      const prepared = prepare(input);
      const e = await launchWhenAllowed(input, prepared, defaultTimeoutMs(), input.urlPattern ?? DEFAULT_URL_PATTERN);
      try {
        await e.spawned;
      } catch (err) {
        await e.finalized;
        throw new NovaError('COMMAND_FAILED', `Der Befehl konnte nicht gestartet werden: ${errorMessage(err)}`, { severity: 'warning', cause: err });
      }
      return handleOf(e);
    },

    async kill(id) {
      const e = live.get(id);
      if (e) {
        await killAndWait(e);
        return { ...e.info };
      }
      const row = getRow(id);
      if (!row) throw notFound('Der Prozess', id);
      if (row.status !== 'running') return rowToInfo(row);
      if (row.instance_id !== core.instanceId && row.pid !== null) {
        try {
          await tree.killRecorded([{ pid: Number(row.pid), startedAt: Number(row.started_at) }]);
        } catch (err) {
          log.warn('Prozessbaum einer früheren Sitzung konnte nicht beendet werden', { id, error: errorMessage(err) });
        }
      }
      return markRowEnded(row, 'killed');
    },

    async killTask(taskId) {
      await Promise.all([...live.values()].filter((e) => e.info.taskId === taskId).map(killAndWait));
    },

    async killProject(projectId) {
      await Promise.all([...live.values()].filter((e) => e.info.projectId === projectId).map(killAndWait));
    },

    get(id) {
      const e = live.get(id);
      if (e) return { ...e.info };
      const row = getRow(id);
      return row ? rowToInfo(row) : null;
    },

    list(filter = {}) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
      }
      if (!filter.includeExited) where.push("status = 'running'");
      params.push(MAX_LIST_ROWS);
      const rows = core.db.all<ProcessRow>(`SELECT * FROM processes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY started_at DESC, rowid DESC LIMIT ?`, params);
      return rows.map((r) => {
        const e = live.get(r.id);
        return e ? { ...e.info } : rowToInfo(r);
      });
    },

    output(id, tailLines) {
      const n = Math.max(0, Math.min(5000, Math.floor(Number.isFinite(tailLines) ? tailLines : 0)));
      const e = live.get(id);
      if (e) return e.tail.tailLines(n);
      const cached = exitedOutput.get(id);
      if (cached !== undefined) return lastLines(cached, n);
      if (!getRow(id)) throw notFound('Der Prozess', id);
      return OUTPUT_UNAVAILABLE;
    },

    async recoverOrphans() {
      const rows = core.db.all<ProcessRow>("SELECT * FROM processes WHERE status = 'running' AND instance_id != ?", [core.instanceId]);
      if (rows.length === 0) return 0;
      const withPid = rows.filter((r) => r.pid !== null);
      let found: boolean[] = [];
      try {
        found = await tree.killRecorded(withPid.map((r) => ({ pid: Number(r.pid), startedAt: Number(r.started_at) })));
      } catch (err) {
        log.warn('Verwaiste Prozesse konnten nicht geprüft werden', { error: errorMessage(err) });
      }
      for (const r of rows) markRowEnded(r, 'orphaned');
      const killed = found.filter(Boolean).length;
      log.info('Prozesse einer früheren Sitzung bereinigt', { rows: rows.length, killedTrees: killed });
      return rows.length;
    },

    runningCount() {
      return live.size;
    },

    prune(olderThanMs) {
      const ids = core.db.all<{ id: string }>("SELECT id FROM processes WHERE status != 'running' AND ended_at IS NOT NULL AND ended_at < ?", [olderThanMs]);
      if (ids.length === 0) return 0;
      const r = core.db.run("DELETE FROM processes WHERE status != 'running' AND ended_at IS NOT NULL AND ended_at < ?", [olderThanMs]);
      for (const { id } of ids) exitedOutput.delete(id);
      return r.changes;
    },

    async shutdown() {
      stopping = true;
      const entries = [...live.values()];
      if (entries.length > 0) {
        for (const e of entries) e.killedByUs = true;
        const targets = entries.filter((e) => e.info.pid !== null && !e.done).map((e) => ({ pid: e.info.pid as number, startedAt: e.info.startedAt, alive: rootAlive(e) }));
        try {
          await tree.killOwn(targets);
        } catch (err) {
          log.warn('Prozesse konnten beim Herunterfahren nicht beendet werden', { error: errorMessage(err) });
        }
        await Promise.race([Promise.all(entries.map((e) => e.finalized)), sleep(2000)]);
        for (const e of entries) {
          if (e.done) continue;
          try {
            e.child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
          e.child.stdout?.destroy();
          e.child.stderr?.destroy();
          finalize(e);
        }
      }
      const stale = core.db.all<ProcessRow>("SELECT * FROM processes WHERE status = 'running' AND instance_id = ?", [core.instanceId]);
      for (const r of stale) markRowEnded(r, 'killed');
    },
  };
  return service;
}
