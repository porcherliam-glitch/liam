// DaemonSupervisor: finds, starts, watches and restarts the NOVA background service for Electron main.
//
// Flow (UI-SPEC §5, SPEC §6.1/§6.10):
//   connecting → probe the endpoint (nonce/HMAC proof, the token is never sent to an unverified peer)
//     ours    → attach: DaemonClient + event subscription → connected
//     none    → spawn `process.execPath` (ELECTRON_RUN_AS_NODE=1) [daemonEntry, --data-dir, dataDir], detached,
//               cwd = dataDir, stdout/stderr → logs/daemon-start.log (trimmed to 256 KB), windowsHide → starting →
//               poll /health for 20 s. Exit 3 = another daemon holds the instance lock → connect to it. Exit 4 = the
//               endpoint is held by a foreign program. Any other early exit → crash.json (if fresh) + start log tail
//               → state error with a German message.
//     foreign → transient while a daemon is starting (endpoint bound, token not yet written) → re-probe for a few
//               seconds, otherwise state error ("fremdes Programm").
//   A daemon with a different version is shut down (daemon.shutdown) and the current version is spawned (once).
//   Connection loss (SSE) → reconnecting → after a short delay the endpoint is probed: daemon gone → automatic
//   restart, at most 3 per 5 minutes (RestartBudget), then state error; if the daemon announced a planned stop
//   (daemon.status 'stopping' that this UI did not request – CLI --stop-daemon, database restore, another client)
//   NOVA waits up to 30 s for a self-restart and otherwise shows "stopped" instead of fighting the stop.
//
// Key decisions:
// - All lifecycle operations run strictly one after another (promise queue); restart()/stop()/dispose() bump a
//   generation counter so long waits of an older operation end early and never overwrite newer state.
// - Every collaborator (probe, spawn, client, crash report, start log, clock) is injectable for deterministic tests.
// - The supervisor only kills a daemon process it spawned itself, and only as the last resort after a graceful
//   daemon.shutdown did not free the endpoint (never by pid from a file: pids are reused).
// - rpc() waits up to 15 s while the daemon is starting/connecting instead of failing immediately, so the first
//   renderer requests after app start succeed; a request is retried only when it provably never reached the daemon.
// - Windows: the daemon is spawned directly (Chromium's handles are not inheritable). Linux/macOS: Chromium leaves
//   many descriptors without close-on-exec (GPU cache files, sockets, Electron's stdio pipes), and libuv does not
//   close them in the child – the long-lived daemon would keep them open. There the daemon is started through
//   `/bin/bash -c <close fds ≥ 3; exec "$0" "$@">` (same PID, same argv for the daemon), falling back to a direct
//   spawn when bash is missing.
import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { DaemonConnectionState, DaemonConnectionStateName } from '@shared/bridge';
import type { AnyNovaEvent } from '@shared/events';
import type { RpcMethod, RpcParams, RpcResult } from '@shared/rpc';
import type { DaemonCrashReport } from '@shared/schemas';
import { DaemonClient, DaemonRpcError, type SubscriptionState } from '../daemon/client';
import { probeEndpoint, type DetailedProbe } from '../daemon/server/probe';
import { readCrashReport } from '../daemon/core/crash';
import { isDroppedEnvVar } from '../daemon/core/child-env';
import { RestartBudget } from './restart-budget';
import { closeQuietly, prepareStartLog, readStartLogSince, type PreparedStartLog } from './start-log';
import { createMainLogger, errorText, type MainLogger } from './log';
import { TEXTS } from './texts';

export interface DaemonHealthInfo {
  pid: number;
  version: string;
  instanceId: string;
}

export type ProbeOutcome = Pick<DetailedProbe, 'status' | 'unverifiedNova' | 'handshake' | 'detail'> & { health: DaemonHealthInfo | null };

/** The subset of DaemonClient the supervisor uses (fakes in tests). */
export interface DaemonClientLike {
  rpc<M extends RpcMethod>(method: M, params?: RpcParams<M>, opts?: { timeoutMs?: number }): Promise<RpcResult<M>>;
  health(): Promise<DaemonHealthInfo>;
  subscribe(onEvent: (e: AnyNovaEvent) => void, onState?: (s: SubscriptionState, info?: string) => void): () => void;
  close(): void;
}

/** The subset of ChildProcess the supervisor uses. */
export interface DaemonChildLike {
  readonly pid?: number | undefined;
  readonly exitCode: number | null;
  once(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  once(event: 'error', listener: (err: Error) => void): unknown;
  unref(): void;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface SupervisorDeps {
  probe(endpoint: string, tokenPath: string, timeoutMs: number): Promise<ProbeOutcome>;
  spawn(command: string, args: string[], options: SpawnOptions): DaemonChildLike;
  createClient(opts: { endpoint: string; tokenPath: string }): DaemonClientLike;
  readCrashReport(path: string): DaemonCrashReport | null;
  prepareStartLog(path: string, header: string): PreparedStartLog | null;
  readStartLogSince(path: string, offset: number): string;
  closeFd(fd: number): void;
  fileExists(path: string): boolean;
  now(): number;
  sleep(ms: number): Promise<void>;
  env(): NodeJS.ProcessEnv;
}

export interface DaemonSupervisorOptions {
  /** Canonical data dir (passed to the daemon as --data-dir and used as its cwd). */
  dataDir: string;
  endpoint: string;
  tokenPath: string;
  crashPath: string;
  startLogPath: string;
  /** out/daemon/index.cjs (dev) or <resources>/app.asar.unpacked/out/daemon/index.cjs (packaged). */
  daemonEntry: string;
  /** process.execPath (the Electron binary; runs the daemon with ELECTRON_RUN_AS_NODE=1). */
  execPath: string;
  appVersion: string;
  log?: MainLogger;
  /** Defaults to process.platform (inject 'win32' in tests). */
  platform?: NodeJS.Platform;
  /** POSIX shell used to close inherited descriptors before exec (default /bin/bash if present; null = spawn directly). */
  posixShell?: string | null;
  /** How long a starting daemon may take to answer (cold Windows start: Defender scan, first PowerShell queries). */
  healthTimeoutMs?: number;
  pollIntervalMs?: number;
  probeTimeoutMs?: number;
  vanishTimeoutMs?: number;
  foreignGraceMs?: number;
  lossCheckDelayMs?: number;
  selfRespawnGraceMs?: number;
  autoRestartBackoffMs?: number;
  connectWaitMs?: number;
  shutdownRpcTimeoutMs?: number;
  restartBudget?: RestartBudget;
  deps?: Partial<SupervisorDeps>;
}

export interface SupervisorRpcOptions {
  timeoutMs?: number;
  /** How long to wait for a connection while the daemon is connecting/starting/reconnecting (default 15 s). */
  waitForConnectionMs?: number;
}

const defaultDeps: SupervisorDeps = {
  probe: async (endpoint, tokenPath, timeoutMs) => probeEndpoint(endpoint, tokenPath, timeoutMs),
  spawn: (command, args, options) => nodeSpawn(command, args, options),
  createClient: (opts) => new DaemonClient(opts),
  readCrashReport: (path) => readCrashReport(path),
  prepareStartLog: (path, header) => prepareStartLog(path, header),
  readStartLogSince: (path, offset) => readStartLogSince(path, offset),
  closeFd: (fd) => closeQuietly(fd),
  fileExists: (path) => existsSync(path),
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))),
  env: () => process.env,
};

type ExitInfo = { code: number | null; signal: NodeJS.Signals | null } | { error: Error };

/**
 * bash script: close every inherited descriptor ≥ 3, then exec the daemon ($0 = Electron binary, "$@" = its args).
 * Uses /proc/$$/fd (Linux) or /dev/fd (macOS). Closing a descriptor that is already gone (the directory handle of
 * the glob) is silently ignored by bash. stdin/stdout/stderr (the start log) stay untouched.
 */
export const CLOSE_INHERITED_FDS_SCRIPT =
  'd=/proc/$$/fd; [ -d "$d" ] || d=/dev/fd; ' +
  'for p in "$d"/*; do n=${p##*/}; case "$n" in ""|*[!0-9]*) continue;; esac; ' +
  'if [ "$n" -gt 2 ]; then eval "exec $n>&-"; fi; done; ' +
  'exec "$0" "$@"';

/** Command line that starts the daemon (direct on Windows, through the descriptor-closing shell elsewhere). */
export function daemonSpawnCommand(o: { execPath: string; daemonEntry: string; dataDir: string; posixShell: string | null }): { command: string; args: string[] } {
  const daemonArgs = [o.daemonEntry, '--data-dir', o.dataDir];
  if (!o.posixShell) return { command: o.execPath, args: daemonArgs };
  return { command: o.posixShell, args: ['--norc', '--noprofile', '-c', CLOSE_INHERITED_FDS_SCRIPT, o.execPath, ...daemonArgs] };
}

function isUnreachable(e: unknown): boolean {
  return e instanceof DaemonRpcError && (e.reason === 'unreachable' || e.reason === 'token_missing');
}

export class DaemonSupervisor {
  private readonly o: Required<Omit<DaemonSupervisorOptions, 'deps' | 'log' | 'restartBudget' | 'platform' | 'posixShell'>>;
  private readonly platform: NodeJS.Platform;
  private readonly posixShell: string | null;
  private readonly deps: SupervisorDeps;
  private readonly log: MainLogger;
  private readonly budget: RestartBudget;
  private st: DaemonConnectionState;
  private readonly stateListeners = new Set<(s: DaemonConnectionState) => void>();
  private readonly eventListeners = new Set<(e: AnyNovaEvent) => void>();
  private chain: Promise<unknown> = Promise.resolve();
  private gen = 0;
  private disposed = false;
  private started = false;
  private client: DaemonClientLike | null = null;
  private unsubscribe: (() => void) | null = null;
  private subSeq = 0;
  private connectedInstanceId: string | null = null;
  private spawned: DaemonChildLike | null = null;
  private spawnedExited = false;
  private intentionalStop = false;
  private externalStopSeen = false;
  private versionRespawnTried = false;
  private lossCheckPending = false;
  private restartAttempts = 0;

  constructor(opts: DaemonSupervisorOptions) {
    this.o = {
      dataDir: opts.dataDir,
      endpoint: opts.endpoint,
      tokenPath: opts.tokenPath,
      crashPath: opts.crashPath,
      startLogPath: opts.startLogPath,
      daemonEntry: opts.daemonEntry,
      execPath: opts.execPath,
      appVersion: opts.appVersion,
      healthTimeoutMs: opts.healthTimeoutMs ?? 60_000,
      pollIntervalMs: opts.pollIntervalMs ?? 250,
      probeTimeoutMs: opts.probeTimeoutMs ?? 2_000,
      vanishTimeoutMs: opts.vanishTimeoutMs ?? 20_000,
      foreignGraceMs: opts.foreignGraceMs ?? 5_000,
      lossCheckDelayMs: opts.lossCheckDelayMs ?? 1_000,
      selfRespawnGraceMs: opts.selfRespawnGraceMs ?? 30_000,
      autoRestartBackoffMs: opts.autoRestartBackoffMs ?? 2_000,
      connectWaitMs: opts.connectWaitMs ?? 15_000,
      shutdownRpcTimeoutMs: opts.shutdownRpcTimeoutMs ?? 10_000,
    };
    this.deps = { ...defaultDeps, ...opts.deps };
    this.platform = opts.platform ?? process.platform;
    this.posixShell =
      this.platform === 'win32' ? null : opts.posixShell !== undefined ? opts.posixShell : this.deps.fileExists('/bin/bash') ? '/bin/bash' : null;
    this.log = opts.log ?? createMainLogger({ file: null });
    this.budget = opts.restartBudget ?? new RestartBudget(3, 5 * 60_000);
    this.st = {
      state: 'connecting',
      message: TEXTS.connecting,
      since: this.deps.now(),
      daemonPid: null,
      daemonVersion: null,
      endpoint: this.o.endpoint,
      restartAttempts: 0,
    };
  }

  // --- public API ------------------------------------------------------------------------------------------------

  state(): DaemonConnectionState {
    return { ...this.st };
  }

  onState(listener: (s: DaemonConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onEvent(listener: (e: AnyNovaEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Connects to a running daemon or starts one. Resolves with the resulting state. Idempotent. */
  start(): Promise<DaemonConnectionState> {
    if (this.started) return this.enqueue(async () => this.state());
    this.started = true;
    const g = this.gen;
    return this.enqueue(async () => {
      await this.establish(g, 'initial');
      return this.state();
    });
  }

  /** "Dienst neu starten": graceful stop (if running), then start. Not limited by the restart budget. */
  restart(): Promise<DaemonConnectionState> {
    this.started = true;
    const g = ++this.gen;
    this.intentionalStop = true;
    return this.enqueue(async () => {
      if (!this.alive(g)) return this.state();
      this.budget.reset();
      this.versionRespawnTried = false;
      this.restartAttempts = 0;
      this.setState('starting', TEXTS.restarting, { daemonPid: null, daemonVersion: null });
      const probe = await this.probeOnce();
      if (!this.alive(g)) return this.state();
      if (probe.status === 'ours' || this.client) {
        const gone = await this.shutdownAndWait(g, 'restart');
        if (!this.alive(g)) return this.state();
        if (!gone) {
          this.detach();
          this.fail(g, TEXTS.stopFailed);
          return this.state();
        }
      }
      this.detach();
      this.intentionalStop = false;
      this.externalStopSeen = false;
      await this.establish(g, 'restart');
      return this.state();
    });
  }

  /** Graceful daemon shutdown (all background work stops) and wait until the endpoint is free. */
  stop(reason = 'ui'): Promise<DaemonConnectionState> {
    this.started = true;
    const g = ++this.gen;
    this.intentionalStop = true;
    return this.enqueue(async () => {
      if (!this.alive(g)) return this.state();
      this.setState(this.st.state, TEXTS.stopping);
      const gone = await this.shutdownAndWait(g, reason);
      if (!this.alive(g)) return this.state();
      this.detach();
      if (gone) this.setState('stopped', TEXTS.stopped, { daemonPid: null, daemonVersion: null });
      else this.fail(g, TEXTS.stopFailed);
      return this.state();
    });
  }

  /**
   * Fire-and-forget style shutdown request for app quit / Windows session end: sends daemon.shutdown (if a daemon
   * is reachable) without waiting for the process to exit, and suppresses automatic restarts from now on.
   * Resolves true when the daemon acknowledged the request.
   */
  async requestShutdown(reason: string, timeoutMs = 5_000): Promise<boolean> {
    this.intentionalStop = true;
    let client = this.client;
    let temp = false;
    if (!client) {
      const probe = await this.probeOnce();
      if (probe.status !== 'ours') return false;
      client = this.deps.createClient({ endpoint: this.o.endpoint, tokenPath: this.o.tokenPath });
      temp = true;
    }
    try {
      await client.rpc('daemon.shutdown', { reason }, { timeoutMs });
      this.log.info('Hintergrunddienst zum Beenden aufgefordert', { reason });
      return true;
    } catch (e) {
      this.log.warn('Aufforderung zum Beenden fehlgeschlagen', { reason, error: errorText(e) });
      return false;
    } finally {
      if (temp) client.close();
    }
  }

  /** Typed RPC through the current connection (waits briefly while connecting). Throws DaemonRpcError. */
  async rpc<M extends RpcMethod>(method: M, params?: RpcParams<M>, opts: SupervisorRpcOptions = {}): Promise<RpcResult<M>> {
    if (this.disposed) throw this.unavailable();
    const waitMs = opts.waitForConnectionMs ?? this.o.connectWaitMs;
    if (this.st.state === 'connecting' || this.st.state === 'starting') await this.waitForConnected(waitMs);
    if (this.st.state === 'reconnecting' && this.client) {
      // Often only the event stream broke; the RPC channel may still work.
      try {
        return await this.client.rpc(method, params, { timeoutMs: opts.timeoutMs });
      } catch (e) {
        if (!isUnreachable(e)) throw e;
        await this.waitForConnected(waitMs);
      }
    }
    const client = this.client;
    if (this.st.state !== 'connected' || !client) throw this.unavailable();
    return client.rpc(method, params, { timeoutMs: opts.timeoutMs });
  }

  /** Closes the connection and stops all supervision. The daemon keeps running. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.gen++;
    this.detach();
    this.stateListeners.clear();
    this.eventListeners.clear();
  }

  // --- lifecycle internals ---------------------------------------------------------------------------------------

  private alive(g: number): boolean {
    return !this.disposed && g === this.gen;
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private setState(state: DaemonConnectionStateName, message: string, extra: Partial<Pick<DaemonConnectionState, 'daemonPid' | 'daemonVersion'>> = {}): void {
    if (this.disposed) return;
    const next: DaemonConnectionState = {
      state,
      message,
      since: state === this.st.state ? this.st.since : this.deps.now(),
      daemonPid: extra.daemonPid !== undefined ? extra.daemonPid : this.st.daemonPid,
      daemonVersion: extra.daemonVersion !== undefined ? extra.daemonVersion : this.st.daemonVersion,
      endpoint: this.o.endpoint,
      restartAttempts: this.restartAttempts,
    };
    const prev = this.st;
    this.st = next;
    if (
      prev.state === next.state &&
      prev.message === next.message &&
      prev.daemonPid === next.daemonPid &&
      prev.daemonVersion === next.daemonVersion &&
      prev.restartAttempts === next.restartAttempts
    ) {
      return;
    }
    if (prev.state !== next.state) this.log.info('Verbindungszustand', { state: next.state, message: next.message });
    for (const l of [...this.stateListeners]) {
      try {
        l({ ...next });
      } catch (e) {
        this.log.warn('Zustands-Listener fehlgeschlagen', { error: errorText(e) });
      }
    }
  }

  /** Sets state error (no daemon) and returns false for `return this.fail(...)` chains. */
  private fail(g: number, message: string): false {
    if (this.alive(g)) {
      this.log.error('Hintergrunddienst nicht verfügbar', { message });
      this.setState('error', message, { daemonPid: null, daemonVersion: null });
    }
    return false;
  }

  private unavailable(): DaemonRpcError {
    const message = this.st.state === 'connected' ? TEXTS.notConnected : this.st.message || TEXTS.notConnected;
    return new DaemonRpcError('DAEMON_UNAVAILABLE', message, { reason: 'unreachable', details: { reason: 'unreachable', state: this.st.state } });
  }

  private async probeOnce(): Promise<ProbeOutcome> {
    try {
      return await this.deps.probe(this.o.endpoint, this.o.tokenPath, this.o.probeTimeoutMs);
    } catch (e) {
      return { status: 'none', health: null, unverifiedNova: false, handshake: 'none', detail: errorText(e) };
    }
  }

  private isTransientForeign(p: ProbeOutcome): boolean {
    return p.unverifiedNova || p.handshake === 'mismatch' || p.handshake === 'timeout';
  }

  /** Probe → attach / spawn / foreign handling. Returns true when connected. */
  private async establish(g: number, mode: 'initial' | 'restart'): Promise<boolean> {
    if (!this.alive(g)) return false;
    if (mode === 'initial') this.setState('connecting', TEXTS.connecting);
    let probe = await this.probeOnce();
    if (!this.alive(g)) return false;
    if (probe.status === 'foreign' && this.isTransientForeign(probe)) {
      const deadline = this.deps.now() + this.o.foreignGraceMs;
      while (this.alive(g) && probe.status === 'foreign' && this.isTransientForeign(probe) && this.deps.now() < deadline) {
        await this.deps.sleep(this.o.pollIntervalMs);
        if (!this.alive(g)) return false;
        probe = await this.probeOnce();
      }
      if (!this.alive(g)) return false;
    }
    if (probe.status === 'ours' && probe.health) return this.attach(g, probe.health);
    if (probe.status === 'none') return this.spawnAndWait(g, mode === 'initial' ? 'initial' : 'restart');
    return this.fail(g, TEXTS.foreign);
  }

  private async attach(g: number, health: DaemonHealthInfo): Promise<boolean> {
    if (!this.alive(g)) return false;
    let message: string = TEXTS.connected;
    if (health.version !== this.o.appVersion) {
      if (!this.versionRespawnTried) {
        this.versionRespawnTried = true;
        return this.replaceOldVersion(g, health);
      }
      this.log.warn('Versionsunterschied zwischen Oberfläche und Hintergrunddienst bleibt bestehen', { daemon: health.version, ui: this.o.appVersion });
      message = TEXTS.versionMismatchKept(health.version, this.o.appVersion);
    } else {
      this.versionRespawnTried = false;
    }
    this.detach();
    const client = this.deps.createClient({ endpoint: this.o.endpoint, tokenPath: this.o.tokenPath });
    this.client = client;
    this.connectedInstanceId = health.instanceId;
    const subId = ++this.subSeq;
    this.unsubscribe = client.subscribe(
      (e) => this.handleEvent(subId, e),
      (s, info) => this.handleSubscriptionState(subId, s, info),
    );
    this.intentionalStop = false;
    this.externalStopSeen = false;
    this.restartAttempts = 0;
    this.setState('connected', message, { daemonPid: health.pid, daemonVersion: health.version });
    return true;
  }

  private async replaceOldVersion(g: number, health: DaemonHealthInfo): Promise<boolean> {
    this.log.info('Hintergrunddienst mit anderer Version wird ersetzt', { daemon: health.version, ui: this.o.appVersion });
    this.setState('starting', TEXTS.versionMismatch(health.version, this.o.appVersion), { daemonPid: health.pid, daemonVersion: health.version });
    const temp = this.deps.createClient({ endpoint: this.o.endpoint, tokenPath: this.o.tokenPath });
    try {
      await temp.rpc('daemon.shutdown', { reason: 'version-mismatch' }, { timeoutMs: this.o.shutdownRpcTimeoutMs });
    } catch (e) {
      this.log.warn('Älterer Hintergrunddienst hat das Beenden nicht bestätigt', { error: errorText(e) });
    } finally {
      temp.close();
    }
    const gone = await this.waitForVanish(g);
    if (!this.alive(g)) return false;
    if (!gone) return this.fail(g, TEXTS.oldVersionWontStop);
    return this.spawnAndWait(g, 'restart');
  }

  private daemonEnv(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const [k, v] of Object.entries(this.deps.env())) {
      if (v === undefined) continue;
      // NOVA_* (data dir / endpoint overrides) must reach the daemon; secrets, NODE_OPTIONS and Electron internals not.
      if (!/^NOVA_/i.test(k) && isDroppedEnvVar(k)) continue;
      env[k] = v;
    }
    // A non-interactive bash would source $BASH_ENV / $ENV before exec – never run foreign startup files.
    if (this.posixShell) {
      delete env.BASH_ENV;
      delete env.ENV;
    }
    env.ELECTRON_RUN_AS_NODE = '1';
    return env;
  }

  private async spawnAndWait(g: number, mode: 'initial' | 'restart' | 'auto-restart'): Promise<boolean> {
    if (!this.alive(g)) return false;
    if (!this.deps.fileExists(this.o.daemonEntry)) return this.fail(g, TEXTS.daemonEntryMissing(this.o.daemonEntry));
    const message = mode === 'auto-restart' ? TEXTS.autoRestarting : mode === 'restart' ? TEXTS.restarting : TEXTS.starting;
    this.setState('starting', message, { daemonPid: null, daemonVersion: null });
    const spawnedAt = this.deps.now();
    const startLog = this.deps.prepareStartLog(
      this.o.startLogPath,
      `NOVA-Hintergrunddienst gestartet ${new Date(spawnedAt).toISOString()} (Oberfläche ${this.o.appVersion})`,
    );
    let child: DaemonChildLike;
    try {
      const cmd = daemonSpawnCommand({ execPath: this.o.execPath, daemonEntry: this.o.daemonEntry, dataDir: this.o.dataDir, posixShell: this.posixShell });
      child = this.deps.spawn(cmd.command, cmd.args, {
        cwd: this.o.dataDir,
        detached: true,
        windowsHide: true,
        stdio: startLog ? ['ignore', startLog.fd, startLog.fd] : 'ignore',
        env: this.daemonEnv(),
      });
    } catch (e) {
      return this.fail(g, TEXTS.spawnFailed(errorText(e)));
    } finally {
      if (startLog) this.deps.closeFd(startLog.fd);
    }
    let exit: ExitInfo | null = null;
    child.once('exit', (code, signal) => {
      exit ??= { code, signal };
      if (this.spawned === child) this.spawnedExited = true;
    });
    child.once('error', (err) => {
      exit ??= { error: err };
      if (this.spawned === child) this.spawnedExited = true;
    });
    try {
      child.unref();
    } catch {
      /* already exited */
    }
    this.spawned = child;
    this.spawnedExited = false;
    this.log.info('Hintergrunddienst gestartet', { pid: child.pid ?? null, entry: this.o.daemonEntry, dataDir: this.o.dataDir });
    if (child.pid) this.setState('starting', message, { daemonPid: child.pid });

    const deadline = spawnedAt + this.o.healthTimeoutMs;
    for (;;) {
      if (!this.alive(g)) return false;
      const probe = await this.probeOnce();
      if (!this.alive(g)) return false;
      if (probe.status === 'ours' && probe.health) return this.attach(g, probe.health);
      const ended = exit as ExitInfo | null;
      if (ended) {
        if ('error' in ended) return this.fail(g, TEXTS.spawnFailed(errorText(ended.error)));
        if (ended.code === 3) {
          this.log.info('Hintergrunddienst läuft bereits (Exit 3) – Verbindung wird hergestellt');
          return this.connectToRunning(g);
        }
        if (ended.code === 4) return this.fail(g, TEXTS.foreign);
        return this.fail(g, this.describeEarlyExit(ended.code, ended.signal, spawnedAt, startLog?.offset ?? null));
      }
      if (this.deps.now() >= deadline) break;
      await this.deps.sleep(this.o.pollIntervalMs);
    }
    if (!this.alive(g)) return false;
    if (!exit) {
      try {
        child.kill();
      } catch {
        /* gone */
      }
    }
    const extra = this.describeStartDetails(spawnedAt, startLog?.offset ?? null);
    return this.fail(g, [TEXTS.startTimeout(Math.round(this.o.healthTimeoutMs / 1000)), ...extra].join(' '));
  }

  private describeStartDetails(spawnedAt: number, offset: number | null): string[] {
    const parts: string[] = [];
    const crash = this.deps.readCrashReport(this.o.crashPath);
    if (crash && crash.ts >= spawnedAt - 5_000) {
      parts.push(TEXTS.crashReport(crash.message, crash.code));
      if (crash.suggestedActions.includes('restore_backup')) parts.push(TEXTS.crashHintRestore);
    }
    const tail = offset !== null ? this.deps.readStartLogSince(this.o.startLogPath, offset) : '';
    if (tail) parts.push(TEXTS.lastOutput(tail));
    parts.push(TEXTS.startLogHint(this.o.startLogPath));
    return parts;
  }

  private describeEarlyExit(code: number | null, signal: string | null, spawnedAt: number, offset: number | null): string {
    return [TEXTS.earlyExit(code, signal), ...this.describeStartDetails(spawnedAt, offset)].join(' ');
  }

  /** After exit code 3: another daemon owns the data dir – wait until it answers. */
  private async connectToRunning(g: number): Promise<boolean> {
    this.setState('connecting', TEXTS.connecting, { daemonPid: null });
    const deadline = this.deps.now() + this.o.healthTimeoutMs;
    for (;;) {
      if (!this.alive(g)) return false;
      const probe = await this.probeOnce();
      if (!this.alive(g)) return false;
      if (probe.status === 'ours' && probe.health) return this.attach(g, probe.health);
      if (probe.status === 'foreign' && !this.isTransientForeign(probe)) return this.fail(g, TEXTS.foreign);
      if (this.deps.now() >= deadline) break;
      await this.deps.sleep(this.o.pollIntervalMs);
    }
    return this.fail(g, TEXTS.alreadyRunningNoAnswer);
  }

  /** Polls until nothing listens on the endpoint any more. */
  private async waitForVanish(g: number, timeoutMs = this.o.vanishTimeoutMs): Promise<boolean> {
    const deadline = this.deps.now() + timeoutMs;
    for (;;) {
      if (!this.alive(g)) return false;
      const probe = await this.probeOnce();
      if (probe.status === 'none') return true;
      if (this.deps.now() >= deadline) return false;
      await this.deps.sleep(this.o.pollIntervalMs);
    }
  }

  /** daemon.shutdown + wait until the endpoint is free; kills a self-spawned, unresponsive daemon as last resort. */
  private async shutdownAndWait(g: number, reason: string): Promise<boolean> {
    let client = this.client;
    let temp = false;
    if (!client) {
      const probe = await this.probeOnce();
      if (probe.status === 'none') return true;
      if (probe.status !== 'ours') return false;
      client = this.deps.createClient({ endpoint: this.o.endpoint, tokenPath: this.o.tokenPath });
      temp = true;
    }
    try {
      await client.rpc('daemon.shutdown', { reason }, { timeoutMs: this.o.shutdownRpcTimeoutMs });
    } catch (e) {
      if (!isUnreachable(e)) this.log.warn('daemon.shutdown fehlgeschlagen', { reason, error: errorText(e) });
    } finally {
      if (temp) client.close();
    }
    if (await this.waitForVanish(g)) return true;
    if (!this.alive(g)) return false;
    const child = this.spawned;
    if (child && !this.spawnedExited && child.exitCode === null) {
      this.log.warn('Hintergrunddienst reagiert nicht – selbst gestarteter Prozess wird beendet', { pid: child.pid ?? null });
      try {
        child.kill();
      } catch {
        /* gone */
      }
      return this.waitForVanish(g, 5_000);
    }
    return false;
  }

  private detach(): void {
    const unsub = this.unsubscribe;
    const client = this.client;
    this.unsubscribe = null;
    this.client = null;
    this.subSeq++;
    try {
      unsub?.();
    } catch {
      /* ignore */
    }
    try {
      client?.close();
    } catch {
      /* ignore */
    }
  }

  // --- connection loss -------------------------------------------------------------------------------------------

  private handleEvent(subId: number, e: AnyNovaEvent): void {
    if (subId !== this.subSeq || this.disposed) return;
    if (e.type === 'daemon.status' && e.payload.state === 'stopping' && !this.intentionalStop) {
      this.externalStopSeen = true;
      this.log.info('Hintergrunddienst kündigt Beenden an (nicht von dieser Oberfläche angefordert)');
    }
    for (const l of [...this.eventListeners]) {
      try {
        l(e);
      } catch (err) {
        this.log.warn('Ereignis-Listener fehlgeschlagen', { type: e.type, error: errorText(err) });
      }
    }
  }

  private handleSubscriptionState(subId: number, s: SubscriptionState, info?: string): void {
    if (subId !== this.subSeq || this.disposed) return;
    if (s === 'connected') {
      if (this.st.state === 'reconnecting') {
        const g = this.gen;
        void this.enqueue(() => this.verifyAfterReconnect(g));
      }
      return;
    }
    if (s !== 'reconnecting' || this.intentionalStop) return;
    if (this.st.state === 'connected') {
      this.log.warn('Ereignisverbindung unterbrochen', { info: info ?? null });
      this.setState('reconnecting', TEXTS.reconnecting);
    }
    this.scheduleLossCheck(this.o.lossCheckDelayMs);
  }

  private scheduleLossCheck(delayMs: number): void {
    if (this.lossCheckPending || this.disposed) return;
    this.lossCheckPending = true;
    const g = this.gen;
    void this.deps.sleep(delayMs).then(() => {
      this.lossCheckPending = false;
      if (!this.alive(g)) return;
      void this.enqueue(() => this.lossCheck(g));
    });
  }

  private async verifyAfterReconnect(g: number): Promise<boolean> {
    const client = this.client;
    if (!this.alive(g) || this.st.state !== 'reconnecting' || !client) return false;
    try {
      const h = await client.health();
      if (!this.alive(g)) return false;
      if (h.instanceId !== this.connectedInstanceId || h.version !== this.o.appVersion) return this.attach(g, h);
      this.restartAttempts = 0;
      this.setState('connected', TEXTS.connected, { daemonPid: h.pid, daemonVersion: h.version });
      return true;
    } catch {
      this.scheduleLossCheck(this.o.lossCheckDelayMs);
      return false;
    }
  }

  private async lossCheck(g: number): Promise<boolean> {
    if (!this.alive(g) || this.st.state !== 'reconnecting' || this.intentionalStop) return false;
    const probe = await this.probeOnce();
    if (!this.alive(g) || this.st.state !== 'reconnecting' || this.intentionalStop) return false;
    if (probe.status === 'ours' && probe.health) {
      // A different instance answers (self-restart, restore) → fresh client. Same instance → the event stream
      // reconnects on its own (DaemonClient backoff); check again later.
      if (probe.health.instanceId !== this.connectedInstanceId) return this.attach(g, probe.health);
      this.scheduleLossCheck(this.o.lossCheckDelayMs * 5);
      return false;
    }
    if (probe.status === 'foreign') {
      if (this.isTransientForeign(probe)) {
        this.scheduleLossCheck(this.o.lossCheckDelayMs);
        return false;
      }
      this.detach();
      return this.fail(g, TEXTS.foreign);
    }
    // Nothing listens any more: the daemon process is gone.
    this.detach();
    if (this.externalStopSeen) return this.awaitSelfRespawn(g);
    return this.autoRestart(g);
  }

  private async awaitSelfRespawn(g: number): Promise<boolean> {
    const deadline = this.deps.now() + this.o.selfRespawnGraceMs;
    for (;;) {
      if (!this.alive(g)) return false;
      const probe = await this.probeOnce();
      if (!this.alive(g)) return false;
      if (probe.status === 'ours' && probe.health) return this.attach(g, probe.health);
      if (this.deps.now() >= deadline) break;
      await this.deps.sleep(Math.max(this.o.pollIntervalMs, Math.min(1_000, this.o.selfRespawnGraceMs / 10)));
    }
    this.externalStopSeen = false;
    this.setState('stopped', TEXTS.stoppedExternally, { daemonPid: null, daemonVersion: null });
    return false;
  }

  private async autoRestart(g: number): Promise<boolean> {
    let lastFailure: string | null = null;
    for (;;) {
      if (!this.alive(g)) return false;
      if (!this.budget.tryConsume(this.deps.now())) {
        return this.fail(g, lastFailure ? `${TEXTS.tooManyRestarts} ${lastFailure}` : TEXTS.tooManyRestarts);
      }
      this.restartAttempts++;
      this.log.warn('Hintergrunddienst nicht mehr erreichbar – automatischer Neustart', { attempt: this.restartAttempts });
      const ok = await this.spawnAndWait(g, 'auto-restart');
      if (ok || !this.alive(g)) return ok;
      lastFailure = this.st.message;
      await this.deps.sleep(this.o.autoRestartBackoffMs);
    }
  }

  /** Resolves when connected, stopped or error – or after `ms`. */
  private waitForConnected(ms: number): Promise<void> {
    if (this.st.state === 'connected' || this.st.state === 'stopped' || this.st.state === 'error' || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        off();
        resolve();
      };
      const off = this.onState((s) => {
        if (s.state === 'connected' || s.state === 'stopped' || s.state === 'error') finish();
      });
      const timer = setTimeout(finish, ms);
      timer.unref?.();
    });
  }
}

export function createDaemonSupervisor(opts: DaemonSupervisorOptions): DaemonSupervisor {
  return new DaemonSupervisor(opts);
}
