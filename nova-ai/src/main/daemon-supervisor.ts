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
//   A daemon that still holds the endpoint but no longer answers (handshake timeouts, e.g. a blocked event loop) is
//   given 2 minutes; then the state becomes error ("reagiert nicht", diagnostics offered) while NOVA keeps checking
//   slowly and reconnects as soon as it answers again.
//
// Key decisions:
// - All lifecycle operations run strictly one after another (promise queue); restart()/stop()/dispose() bump a
//   generation counter so long waits of an older operation end early and never overwrite newer state.
// - Every collaborator (probe, spawn, client, crash report, start log, clock) is injectable for deterministic tests.
// - The supervisor kills a daemon process it spawned itself only as the last resort after a graceful
//   daemon.shutdown did not free the endpoint. A hung daemon from an earlier UI session ("Dienst neu starten") is
//   only killed after its identity is verified: pid AND OS creation time from daemon.lock (pids are reused).
// - Quit/stop while a self-spawned daemon is still starting (endpoint not bound yet): wait for it briefly and send
//   daemon.shutdown, otherwise end the child – it must not come up afterwards and run without the UI.
// - Failures carry `recovery` actions main can run without the daemon (diagnostics; restoring a backup when the
//   crash report says the database is damaged).
// - rpc() waits up to 15 s while the daemon is starting/connecting instead of failing immediately, so the first
//   renderer requests after app start succeed; a request is retried only when it provably never reached the daemon.
// - Windows: the daemon is spawned directly (Chromium's handles are not inheritable). Linux/macOS: Chromium leaves
//   many descriptors without close-on-exec (GPU cache files, sockets, Electron's stdio pipes), and libuv does not
//   close them in the child – the long-lived daemon would keep them open. There the daemon is started through
//   `/bin/bash -c <close fds ≥ 3; exec "$0" "$@">` (same PID, same argv for the daemon), falling back to a direct
//   spawn when bash is missing.
import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DaemonConnectionState, DaemonConnectionStateName, DaemonRecoveryAction } from '@shared/bridge';
import type { AnyNovaEvent } from '@shared/events';
import type { RpcMethod, RpcParams, RpcResult } from '@shared/rpc';
import type { DaemonCrashReport } from '@shared/schemas';
import { DaemonClient, DaemonRpcError, type SubscriptionState } from '../daemon/client';
import { probeEndpoint, type DetailedProbe } from '../daemon/server/probe';
import { readCrashReport } from '../daemon/core/crash';
import { isDroppedEnvVar } from '../daemon/core/child-env';
import { readLock } from '../daemon/server/lock';
import { createProcessTree } from '../daemon/processes/process-tree';
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
  /**
   * Ends a hung daemon that this UI did not spawn: pid + start time from daemon.lock, verified against the OS process
   * creation time. Resolves true when a matching process was found and killed.
   */
  killRecordedDaemon(): Promise<boolean>;
}

export interface DaemonSupervisorOptions {
  /** Canonical data dir (passed to the daemon as --data-dir and used as its cwd). */
  dataDir: string;
  endpoint: string;
  tokenPath: string;
  crashPath: string;
  startLogPath: string;
  /** <dataDir>/daemon.lock (pid + start time of the running daemon; default: next to the token file). */
  lockPath?: string;
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
  /** How long a daemon may hold the endpoint without answering before the state becomes error (default 2 min). */
  hungTimeoutMs?: number;
  /** Re-check interval while a hung daemon is reported (default 10 s). */
  hungRecheckMs?: number;
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

const defaultDeps: Omit<SupervisorDeps, 'killRecordedDaemon'> = {
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

/** Default killRecordedDaemon: daemon.lock → identity check (pid + creation time) → kill the process tree. */
export function killRecordedDaemonDefault(o: { lockPath: string; endpoint: string; platform: NodeJS.Platform; log: MainLogger }): Promise<boolean> {
  const lock = readLock({ lock: o.lockPath });
  if (!lock || lock.endpoint !== o.endpoint || lock.pid === process.pid) return Promise.resolve(false);
  const log = { ...o.log, child: () => log };
  const tree = createProcessTree({ platform: o.platform, log });
  return tree
    .killRecorded([{ pid: lock.pid, startedAt: lock.startedAt }])
    .then((found) => found[0] === true)
    .catch((e: unknown) => {
      o.log.warn('Hängender Hintergrunddienst konnte nicht beendet werden', { error: errorText(e) });
      return false;
    });
}

export class DaemonSupervisor {
  private readonly o: Required<Omit<DaemonSupervisorOptions, 'deps' | 'log' | 'restartBudget' | 'platform' | 'posixShell' | 'lockPath'>>;
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
  /** Since when the endpoint is held by a daemon that does not answer (handshake timeouts); null = answering. */
  private unresponsiveSince: number | null = null;
  /** State error because the daemon hangs: keep re-checking and reconnect when it answers again. */
  private hung = false;

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
      hungTimeoutMs: opts.hungTimeoutMs ?? 120_000,
      hungRecheckMs: opts.hungRecheckMs ?? 10_000,
      connectWaitMs: opts.connectWaitMs ?? 15_000,
      shutdownRpcTimeoutMs: opts.shutdownRpcTimeoutMs ?? 10_000,
    };
    this.platform = opts.platform ?? process.platform;
    const lockPath = opts.lockPath ?? join(dirname(opts.tokenPath), 'daemon.lock');
    this.deps = {
      ...defaultDeps,
      killRecordedDaemon: () => killRecordedDaemonDefault({ lockPath, endpoint: this.o.endpoint, platform: this.platform, log: this.log }),
      ...opts.deps,
    };
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
      this.hung = false;
      this.unresponsiveSince = null;
      this.setState('starting', TEXTS.restarting, { daemonPid: null, daemonVersion: null });
      const probe = await this.probeOnce();
      if (!this.alive(g)) return this.state();
      if (probe.status === 'ours' || this.client || this.isHungProbe(probe) || this.spawnedChildRunning()) {
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
      this.hung = false;
      this.unresponsiveSince = null;
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
   * is reachable) without waiting for the process to exit, and suppresses automatic restarts from now on. A daemon
   * this UI spawned that is still starting is waited for within `timeoutMs` and ended when it does not listen by then.
   * Resolves true when the daemon acknowledged the request (or the still-starting own process was ended).
   */
  async requestShutdown(reason: string, timeoutMs = 5_000): Promise<boolean> {
    this.intentionalStop = true;
    const deadline = this.deps.now() + timeoutMs;
    let client = this.client;
    let temp = false;
    if (!client) {
      let probe = await this.probeOnce();
      // A daemon this UI spawned a moment ago may not listen yet (cold start): wait for it within the time limit.
      while (probe.status !== 'ours' && !this.client && this.spawnedChildRunning() && this.deps.now() < deadline) {
        await this.deps.sleep(this.o.pollIntervalMs);
        probe = await this.probeOnce();
      }
      client = this.client;
      if (!client) {
        if (probe.status !== 'ours') {
          // Still not answering: end our own starting child, otherwise it comes up after the UI is gone.
          return this.killSpawnedChild('Hintergrunddienst startet noch – selbst gestarteter Prozess wird beim Beenden gestoppt');
        }
        client = this.deps.createClient({ endpoint: this.o.endpoint, tokenPath: this.o.tokenPath });
        temp = true;
      }
    }
    try {
      await client.rpc('daemon.shutdown', { reason }, { timeoutMs: Math.max(1_000, deadline - this.deps.now()) });
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

  private setState(
    state: DaemonConnectionStateName,
    message: string,
    extra: Partial<Pick<DaemonConnectionState, 'daemonPid' | 'daemonVersion' | 'recovery'>> = {},
  ): void {
    if (this.disposed) return;
    const next: DaemonConnectionState = {
      state,
      message,
      since: state === this.st.state ? this.st.since : this.deps.now(),
      daemonPid: extra.daemonPid !== undefined ? extra.daemonPid : this.st.daemonPid,
      daemonVersion: extra.daemonVersion !== undefined ? extra.daemonVersion : this.st.daemonVersion,
      endpoint: this.o.endpoint,
      restartAttempts: this.restartAttempts,
      // Recovery actions belong to one failure only: never carried over to the next state.
      ...(extra.recovery && extra.recovery.length > 0 ? { recovery: [...extra.recovery] } : {}),
    };
    const prev = this.st;
    this.st = next;
    if (
      prev.state === next.state &&
      prev.message === next.message &&
      prev.daemonPid === next.daemonPid &&
      prev.daemonVersion === next.daemonVersion &&
      prev.restartAttempts === next.restartAttempts &&
      (prev.recovery ?? []).join() === (next.recovery ?? []).join()
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

  /**
   * Sets state error (no daemon) and returns false for `return this.fail(...)` chains. Diagnostics without the daemon
   * are always offered; `recovery` adds further actions (restoring a backup after a database failure).
   */
  private fail(g: number, message: string, recovery: DaemonRecoveryAction[] = []): false {
    if (this.alive(g)) {
      this.log.error('Hintergrunddienst nicht verfügbar', { message });
      const actions: DaemonRecoveryAction[] = [...new Set<DaemonRecoveryAction>([...recovery, 'create_diagnostics'])];
      this.setState('error', message, { daemonPid: null, daemonVersion: null, recovery: actions });
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

  /** The endpoint answers the connection but not the handshake in time: a NOVA daemon that hangs (or is very busy). */
  private isHungProbe(p: ProbeOutcome): boolean {
    return p.status === 'foreign' && p.handshake === 'timeout';
  }

  /** A daemon this UI spawned that has not exited (it may still be starting and not listen yet). */
  private spawnedChildRunning(): boolean {
    const c = this.spawned;
    return !!c && !this.spawnedExited && c.exitCode === null;
  }

  /** Ends the self-spawned daemon process (handle-based: no pid reuse risk). True when one was running. */
  private killSpawnedChild(why: string): boolean {
    const child = this.spawned;
    if (!child || !this.spawnedChildRunning()) return false;
    this.log.warn(why, { pid: child.pid ?? null });
    try {
      child.kill();
    } catch {
      /* gone */
    }
    return true;
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
    this.hung = false;
    this.unresponsiveSince = null;
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
        const details = this.describeStartDetails(spawnedAt, startLog?.offset ?? null);
        return this.fail(g, [TEXTS.earlyExit(ended.code, ended.signal), ...details.parts].join(' '), details.recovery);
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
    const details = this.describeStartDetails(spawnedAt, startLog?.offset ?? null);
    return this.fail(g, [TEXTS.startTimeout(Math.round(this.o.healthTimeoutMs / 1000)), ...details.parts].join(' '), details.recovery);
  }

  private describeStartDetails(spawnedAt: number, offset: number | null): { parts: string[]; recovery: DaemonRecoveryAction[] } {
    const parts: string[] = [];
    const recovery: DaemonRecoveryAction[] = [];
    const crash = this.deps.readCrashReport(this.o.crashPath);
    if (crash && crash.ts >= spawnedAt - 5_000) {
      parts.push(TEXTS.crashReport(crash.message, crash.code));
      if (crash.suggestedActions.includes('restore_backup')) {
        parts.push(TEXTS.crashHintRestore);
        recovery.push('restore_backup');
      }
    }
    const tail = offset !== null ? this.deps.readStartLogSince(this.o.startLogPath, offset) : '';
    if (tail) parts.push(TEXTS.lastOutput(tail));
    parts.push(TEXTS.startLogHint(this.o.startLogPath));
    return { parts, recovery };
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

  /**
   * daemon.shutdown + wait until the endpoint is free. Last resorts when the daemon does not go: kill the self-spawned
   * process, or – for a hung daemon of an earlier UI session – the process recorded in daemon.lock (identity verified).
   */
  private async shutdownAndWait(g: number, reason: string): Promise<boolean> {
    let client = this.client;
    let temp = false;
    if (!client) {
      let probe = await this.probeOnce();
      if (probe.status === 'none' && this.spawnedChildRunning()) {
        // Our daemon is still starting: wait until it listens (then stop it properly) or end it.
        const deadline = this.deps.now() + this.o.vanishTimeoutMs;
        while (probe.status === 'none' && this.spawnedChildRunning() && this.deps.now() < deadline) {
          await this.deps.sleep(this.o.pollIntervalMs);
          if (!this.alive(g)) return false;
          probe = await this.probeOnce();
        }
        if (!this.alive(g)) return false;
        if (probe.status === 'none' && this.killSpawnedChild('Hintergrunddienst startet nicht fertig – selbst gestarteter Prozess wird beendet')) {
          return this.waitForVanish(g, 5_000);
        }
      }
      if (probe.status === 'none') return true;
      if (probe.status === 'ours') {
        client = this.deps.createClient({ endpoint: this.o.endpoint, tokenPath: this.o.tokenPath });
        temp = true;
      } else if (!this.isHungProbe(probe)) {
        return false; // a foreign program: never touched
      }
    }
    if (client) {
      try {
        await client.rpc('daemon.shutdown', { reason }, { timeoutMs: this.o.shutdownRpcTimeoutMs });
      } catch (e) {
        if (!isUnreachable(e)) this.log.warn('daemon.shutdown fehlgeschlagen', { reason, error: errorText(e) });
      } finally {
        if (temp) client.close();
      }
    }
    if (await this.waitForVanish(g)) return true;
    if (!this.alive(g)) return false;
    if (this.killSpawnedChild('Hintergrunddienst reagiert nicht – selbst gestarteter Prozess wird beendet')) return this.waitForVanish(g, 5_000);
    const last = await this.probeOnce();
    if (!this.alive(g)) return false;
    if (last.status === 'none') return true;
    if (last.status === 'ours' || this.isHungProbe(last)) {
      this.log.warn('Hintergrunddienst reagiert nicht – Prozess aus daemon.lock wird nach Prüfung beendet');
      const killed = await this.deps.killRecordedDaemon().catch(() => false);
      if (!this.alive(g)) return false;
      if (killed) return this.waitForVanish(g, 5_000);
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
      if (this.st.state === 'reconnecting' || this.hung) {
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
    if (!this.alive(g) || (this.st.state !== 'reconnecting' && !this.hung) || !client) return false;
    try {
      const h = await client.health();
      if (!this.alive(g)) return false;
      if (h.instanceId !== this.connectedInstanceId || h.version !== this.o.appVersion) return this.attach(g, h);
      this.restartAttempts = 0;
      this.hung = false;
      this.unresponsiveSince = null;
      this.setState('connected', TEXTS.connected, { daemonPid: h.pid, daemonVersion: h.version });
      return true;
    } catch {
      this.scheduleLossCheck(this.o.lossCheckDelayMs);
      return false;
    }
  }

  private async lossCheck(g: number): Promise<boolean> {
    const watching = () => this.alive(g) && !this.intentionalStop && (this.st.state === 'reconnecting' || (this.hung && this.st.state === 'error'));
    if (!watching()) return false;
    const probe = await this.probeOnce();
    if (!watching()) return false;
    if (probe.status === 'ours' && probe.health) {
      this.unresponsiveSince = null;
      // A different instance answers (self-restart, restore), or it answers again after hanging → fresh client.
      // Same instance → the event stream reconnects on its own (DaemonClient backoff); check again later.
      if (probe.health.instanceId !== this.connectedInstanceId || this.hung) return this.attach(g, probe.health);
      this.scheduleLossCheck(this.o.lossCheckDelayMs * 5);
      return false;
    }
    if (probe.status === 'foreign') {
      if (this.isTransientForeign(probe)) {
        // Endpoint held, but no (valid) answer: usually a daemon that is busy or restarting. Not forever, though.
        const now = this.deps.now();
        this.unresponsiveSince ??= now;
        if (!this.hung && now - this.unresponsiveSince >= this.o.hungTimeoutMs) {
          this.hung = true;
          this.log.error('Hintergrunddienst reagiert nicht mehr', { seconds: Math.round((now - this.unresponsiveSince) / 1000), handshake: probe.handshake });
          this.setState('error', TEXTS.daemonHung, { daemonPid: null, recovery: ['create_diagnostics'] });
        }
        this.scheduleLossCheck(this.hung ? this.o.hungRecheckMs : this.o.lossCheckDelayMs);
        return false;
      }
      this.hung = false;
      this.unresponsiveSince = null;
      this.detach();
      return this.fail(g, TEXTS.foreign);
    }
    // Nothing listens any more: the daemon process is gone.
    this.hung = false;
    this.unresponsiveSince = null;
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
