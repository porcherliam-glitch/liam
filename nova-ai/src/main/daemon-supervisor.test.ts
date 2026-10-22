import { describe, expect, it } from 'vitest';
import type { SpawnOptions } from 'node:child_process';
import type { AnyNovaEvent } from '@shared/events';
import type { DaemonConnectionState } from '@shared/bridge';
import type { DaemonCrashReport } from '@shared/schemas';
import { DaemonRpcError } from '../daemon/client';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLOSE_INHERITED_FDS_SCRIPT,
  DaemonSupervisor,
  daemonSpawnCommand,
  killRecordedDaemonDefault,
  type DaemonChildLike,
  type DaemonClientLike,
  type ProbeOutcome,
  type SupervisorDeps,
} from './daemon-supervisor';
import { RestartBudget } from './restart-budget';
import { TEXTS } from './texts';

// --- fakes ----------------------------------------------------------------------------------------------------------

type SubState = 'connected' | 'reconnecting' | 'closed';

interface Subscriber {
  onEvent: (e: AnyNovaEvent) => void;
  onState?: (s: SubState, info?: string) => void;
}

interface FakeDaemon {
  pid: number;
  version: string;
  instanceId: string;
  subscribers: Set<Subscriber>;
  rpcs: Array<{ method: string; params: unknown }>;
  /** What daemon.shutdown does: exit (endpoint vanishes) or nothing (unresponsive). */
  onShutdown: 'exit' | 'ignore';
}

class FakeChild implements DaemonChildLike {
  pid: number;
  exitCode: number | null = null;
  unrefCalled = false;
  killed = false;
  private exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  constructor(pid: number) {
    this.pid = pid;
  }

  once(event: 'exit' | 'error', listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((err: Error) => void)): this {
    if (event === 'exit') this.exitListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void);
    else this.errorListeners.push(listener as (err: Error) => void);
    return this;
  }

  unref(): void {
    this.unrefCalled = true;
  }

  kill(): boolean {
    this.killed = true;
    this.exit(null, 'SIGTERM');
    return true;
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    if (this.exitCode !== null) return;
    this.exitCode = code ?? -1;
    for (const l of this.exitListeners.splice(0)) l(code, signal);
  }

  fail(err: Error): void {
    for (const l of this.errorListeners.splice(0)) l(err);
  }
}

const tick = () => new Promise<void>((r) => setImmediate(r));

class World {
  t = 1_000_000;
  daemon: FakeDaemon | null = null;
  foreign: false | 'transient' | 'hard' = false;
  /** The daemon holds the endpoint but answers nothing (handshake and RPCs time out). */
  hung = false;
  /** Calls of the killRecordedDaemon dependency (daemon.lock identity kill); `recordedKill` decides the outcome. */
  recordedKills = 0;
  recordedKill: (w: World) => boolean = () => false;
  spawns: Array<{ command: string; args: string[]; options: SpawnOptions; child: FakeChild }> = [];
  clients: FakeClient[] = [];
  crash: DaemonCrashReport | null = null;
  startLogTail = '';
  closedFds: number[] = [];
  entryExists = true;
  env: NodeJS.ProcessEnv = { PATH: '/usr/bin', OPENAI_API_KEY: 'sk-secret', NODE_OPTIONS: '--inspect', NOVA_DATA_DIR: '/data', ELECTRON_RUN_AS_NODE: '0' };
  private nextPid = 5000;
  private nextInstance = 1;
  /** Behaviour of a spawned child: default = becomes a running daemon of `spawnVersion`. */
  onSpawn: (child: FakeChild, world: World) => void = (child, w) => {
    w.startDaemon(w.spawnVersion, child.pid);
  };
  spawnVersion = '1.0.0';
  private timers: Array<{ at: number; fn: () => void }> = [];

  /** Runs `fn` once the fake clock has advanced by `ms` (sleep() of the supervisor advances it). */
  after(ms: number, fn: () => void): void {
    this.timers.push({ at: this.t + ms, fn });
  }

  private runDue(): void {
    const due = this.timers.filter((x) => x.at <= this.t);
    this.timers = this.timers.filter((x) => x.at > this.t);
    for (const x of due) x.fn();
  }

  startDaemon(version = '1.0.0', pid = this.nextPid++): FakeDaemon {
    this.daemon = { pid, version, instanceId: `inst-${this.nextInstance++}`, subscribers: new Set(), rpcs: [], onShutdown: 'exit' };
    return this.daemon;
  }

  /** The daemon process disappears (crash or end of a shutdown): event streams report reconnecting. */
  killDaemon(): void {
    const d = this.daemon;
    this.daemon = null;
    if (!d) return;
    for (const s of d.subscribers) s.onState?.('reconnecting', 'Verbindung verloren');
  }

  emit(e: AnyNovaEvent): void {
    for (const s of this.daemon?.subscribers ?? []) s.onEvent(e);
  }

  deps(): Partial<SupervisorDeps> {
    return {
      probe: async (): Promise<ProbeOutcome> => {
        await tick();
        if (this.hung && this.daemon) return { status: 'foreign', health: null, unverifiedNova: false, handshake: 'timeout', detail: 'timeout' };
        if (this.foreign) {
          return { status: 'foreign', health: null, unverifiedNova: false, handshake: this.foreign === 'transient' ? 'mismatch' : 'foreign', detail: 'x' };
        }
        if (!this.daemon) return { status: 'none', health: null, unverifiedNova: false, handshake: 'none', detail: 'ENOENT' };
        const d = this.daemon;
        return { status: 'ours', health: { pid: d.pid, version: d.version, instanceId: d.instanceId }, unverifiedNova: false, handshake: 'ok', detail: 'ok' };
      },
      spawn: (command, args, options) => {
        const child = new FakeChild(this.nextPid++);
        this.spawns.push({ command, args, options, child });
        queueMicrotask(() => this.onSpawn(child, this));
        return child;
      },
      createClient: () => {
        const c = new FakeClient(this);
        this.clients.push(c);
        return c;
      },
      readCrashReport: () => this.crash,
      prepareStartLog: () => ({ fd: 42, offset: 10 }),
      readStartLogSince: () => this.startLogTail,
      closeFd: (fd) => this.closedFds.push(fd),
      fileExists: () => this.entryExists,
      now: () => this.t,
      sleep: async (ms) => {
        this.t += Math.max(1, ms);
        this.runDue();
        await tick();
      },
      env: () => this.env,
      killRecordedDaemon: async () => {
        this.recordedKills++;
        return this.recordedKill(this);
      },
    };
  }
}

class FakeClient implements DaemonClientLike {
  closed = false;
  private daemon: FakeDaemon | null;

  constructor(private readonly world: World) {
    this.daemon = world.daemon;
  }

  private target(): FakeDaemon {
    const d = this.world.daemon;
    if (this.closed) throw new DaemonRpcError('DAEMON_UNAVAILABLE', 'closed', { reason: 'closed' });
    if (!d) throw new DaemonRpcError('DAEMON_UNAVAILABLE', 'nicht erreichbar', { reason: 'unreachable' });
    if (this.world.hung) throw new DaemonRpcError('DAEMON_UNAVAILABLE', 'keine Antwort', { reason: 'timeout' });
    return d;
  }

  async rpc(method: string, params?: unknown): Promise<never> {
    await tick();
    const d = this.target();
    d.rpcs.push({ method, params });
    if (method === 'daemon.shutdown') {
      if (d.onShutdown === 'exit') {
        for (const s of d.subscribers) s.onEvent({ type: 'daemon.status', payload: { state: 'stopping' } as never, ts: 0, seq: 1 } as AnyNovaEvent);
        setImmediate(() => {
          if (this.world.daemon === d) this.world.killDaemon();
        });
      }
      return { ok: true } as never;
    }
    return { method, echo: params } as never;
  }

  async health() {
    await tick();
    const d = this.target();
    return { pid: d.pid, version: d.version, instanceId: d.instanceId };
  }

  subscribe(onEvent: (e: AnyNovaEvent) => void, onState?: (s: SubState, info?: string) => void): () => void {
    const sub: Subscriber = { onEvent, onState };
    const d = this.daemon;
    d?.subscribers.add(sub);
    queueMicrotask(() => onState?.('connected'));
    return () => d?.subscribers.delete(sub);
  }

  close(): void {
    this.closed = true;
  }
}

function makeSupervisor(world: World, extra: Partial<ConstructorParameters<typeof DaemonSupervisor>[0]> = {}) {
  const states: DaemonConnectionState[] = [];
  const sup = new DaemonSupervisor({
    dataDir: '/data',
    endpoint: '/data/daemon.sock',
    tokenPath: '/data/daemon.token',
    crashPath: '/data/crash.json',
    startLogPath: '/data/logs/daemon-start.log',
    daemonEntry: '/app/out/daemon/index.cjs',
    execPath: '/app/electron',
    appVersion: '1.0.0',
    restartBudget: new RestartBudget(3, 5 * 60_000),
    connectWaitMs: 200,
    posixShell: null,
    deps: world.deps(),
    ...extra,
  });
  sup.onState((s) => states.push(s));
  return { sup, states };
}

async function until(cond: () => boolean, max = 2000): Promise<void> {
  for (let i = 0; i < max; i++) {
    if (cond()) return;
    await tick();
  }
  throw new Error('condition not reached');
}

// --- tests ------------------------------------------------------------------------------------------------------------

describe('DaemonSupervisor – connect or spawn', () => {
  it('attaches to a running daemon without spawning and forwards events', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 1234);
    const { sup, states } = makeSupervisor(world);
    const events: AnyNovaEvent[] = [];
    sup.onEvent((e) => events.push(e));
    const s = await sup.start();
    expect(s.state).toBe('connected');
    expect(s.daemonPid).toBe(1234);
    expect(s.daemonVersion).toBe('1.0.0');
    expect(s.message).toBe(TEXTS.connected);
    expect(world.spawns).toHaveLength(0);
    expect(states.map((x) => x.state)).toEqual(['connected']);
    world.emit({ type: 'project.removed', payload: { id: 'p1' }, ts: 1, seq: 1 });
    expect(events).toHaveLength(1);
    sup.dispose();
  });

  it('spawns the daemon detached with ELECTRON_RUN_AS_NODE, data dir args, start log and a filtered env', async () => {
    const world = new World();
    const { sup, states } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('connected');
    expect(states.map((x) => x.state)).toContain('starting');
    expect(world.spawns).toHaveLength(1);
    const sp = world.spawns[0];
    expect(sp.command).toBe('/app/electron');
    expect(sp.args).toEqual(['/app/out/daemon/index.cjs', '--data-dir', '/data']);
    expect(sp.options.detached).toBe(true);
    expect(sp.options.windowsHide).toBe(true);
    expect(sp.options.cwd).toBe('/data');
    expect(sp.options.stdio).toEqual(['ignore', 42, 42]);
    const env = sp.options.env as NodeJS.ProcessEnv;
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(env.NOVA_DATA_DIR).toBe('/data');
    expect(env.PATH).toBe('/usr/bin');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
    expect(sp.child.unrefCalled).toBe(true);
    expect(world.closedFds).toEqual([42]);
    sup.dispose();
  });

  it('linux/macOS: starts the daemon through bash, which closes inherited descriptors and execs it', async () => {
    const world = new World();
    world.env.BASH_ENV = '/home/x/.evil';
    const { sup } = makeSupervisor(world, { platform: 'linux', posixShell: '/bin/bash' });
    expect((await sup.start()).state).toBe('connected');
    const sp = world.spawns[0];
    expect(sp.command).toBe('/bin/bash');
    expect(sp.args).toEqual(['--norc', '--noprofile', '-c', CLOSE_INHERITED_FDS_SCRIPT, '/app/electron', '/app/out/daemon/index.cjs', '--data-dir', '/data']);
    const env = sp.options.env as NodeJS.ProcessEnv;
    expect(env.BASH_ENV).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBe('1');
    expect(sp.options.detached).toBe(true);
    sup.dispose();
  });

  it('windows: spawns the Electron binary directly, whatever shell is configured', async () => {
    const world = new World();
    const { sup } = makeSupervisor(world, { platform: 'win32', posixShell: '/bin/bash', execPath: 'C:\\NOVA\\NOVA AI.exe' });
    await sup.start();
    expect(world.spawns[0].command).toBe('C:\\NOVA\\NOVA AI.exe');
    expect(world.spawns[0].args).toEqual(['/app/out/daemon/index.cjs', '--data-dir', '/data']);
    expect(daemonSpawnCommand({ execPath: 'e', daemonEntry: 'd', dataDir: 'x', posixShell: null })).toEqual({ command: 'e', args: ['d', '--data-dir', 'x'] });
    sup.dispose();
  });

  it('reports a missing daemon bundle', async () => {
    const world = new World();
    world.entryExists = false;
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toBe(TEXTS.daemonEntryMissing('/app/out/daemon/index.cjs'));
    expect(world.spawns).toHaveLength(0);
  });

  it('early exit: German message with crash report, restore hint and start log tail', async () => {
    const world = new World();
    world.onSpawn = (child, w) => {
      w.crash = {
        ts: w.t,
        version: '1.0.0',
        phase: 'database_open',
        code: 'INTERNAL',
        message: 'Der NOVA-Hintergrunddienst konnte nicht starten.',
        details: null,
        logFile: null,
        suggestedActions: ['restore_backup'],
      };
      w.startLogTail = 'SqliteError: database disk image is malformed';
      child.exit(1);
    };
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toContain(TEXTS.earlyExit(1, null));
    expect(s.message).toContain('Der NOVA-Hintergrunddienst konnte nicht starten. (Fehlercode: INTERNAL)');
    expect(s.message).toContain(TEXTS.crashHintRestore);
    expect(s.message).toContain('Letzte Ausgabe: SqliteError');
    expect(s.message).toContain(TEXTS.startLogHint('/data/logs/daemon-start.log'));
  });

  it('ignores an old crash report from an earlier run', async () => {
    const world = new World();
    world.crash = { ts: 1, version: '0.9.0', phase: 'runtime', code: 'OLD', message: 'alt', details: null, logFile: null, suggestedActions: [] };
    world.onSpawn = (child) => child.exit(1);
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).not.toContain('alt');
  });

  it('spawn error (ENOENT of the executable) → error', async () => {
    const world = new World();
    world.onSpawn = (child) => child.fail(new Error('spawn ENOENT'));
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toBe(TEXTS.spawnFailed('spawn ENOENT'));
  });

  it('exit code 3 (already running) → connects to the running daemon', async () => {
    const world = new World();
    world.onSpawn = (child, w) => {
      child.exit(3);
      w.after(1_000, () => w.startDaemon('1.0.0', 777));
    };
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('connected');
    expect(s.daemonPid).toBe(777);
  });

  it('exit code 4 → endpoint held by a foreign program', async () => {
    const world = new World();
    world.onSpawn = (child) => child.exit(4);
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toBe(TEXTS.foreign);
  });

  it('no answer within the health timeout → kills its own child and reports the timeout', async () => {
    const world = new World();
    world.onSpawn = () => {
      /* never answers */
    };
    const { sup } = makeSupervisor(world, { healthTimeoutMs: 2_000, pollIntervalMs: 250 });
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toContain(TEXTS.startTimeout(2));
    expect(world.spawns[0].child.killed).toBe(true);
  });

  it('a hard foreign endpoint → error; a transient one (fresh daemon writing its token) → connects', async () => {
    const hard = new World();
    hard.foreign = 'hard';
    const a = makeSupervisor(hard);
    expect((await a.sup.start()).message).toBe(TEXTS.foreign);

    const transient = new World();
    transient.foreign = 'transient';
    transient.startDaemon('1.0.0', 99);
    transient.after(1_000, () => (transient.foreign = false));
    const b = makeSupervisor(transient, { foreignGraceMs: 1_000_000 });
    const s = await b.sup.start();
    expect(s.state).toBe('connected');
    b.sup.dispose();
  });
});

describe('DaemonSupervisor – versions', () => {
  it('replaces a daemon of another version (daemon.shutdown, wait, spawn)', async () => {
    const world = new World();
    const old = world.startDaemon('0.9.0', 100);
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(old.rpcs).toContainEqual({ method: 'daemon.shutdown', params: { reason: 'version-mismatch' } });
    expect(world.spawns).toHaveLength(1);
    expect(s.state).toBe('connected');
    expect(s.daemonVersion).toBe('1.0.0');
    sup.dispose();
  });

  it('keeps a mismatching daemon (with a warning text) when the replacement is again a different version', async () => {
    const world = new World();
    world.startDaemon('0.9.0', 100);
    world.spawnVersion = '0.9.0'; // e.g. an old bundle on disk
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('connected');
    expect(s.message).toBe(TEXTS.versionMismatchKept('0.9.0', '1.0.0'));
    sup.dispose();
  });

  it('an old daemon that does not stop → error', async () => {
    const world = new World();
    world.startDaemon('0.9.0', 100).onShutdown = 'ignore';
    const { sup } = makeSupervisor(world, { vanishTimeoutMs: 1_000 });
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toBe(TEXTS.oldVersionWontStop);
  });
});

describe('DaemonSupervisor – connection loss and automatic restarts', () => {
  it('daemon crash → reconnecting → automatic restart → connected', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    const { sup, states } = makeSupervisor(world);
    await sup.start();
    world.killDaemon();
    await until(() => sup.state().state === 'connected' && sup.state().daemonPid !== 10);
    const names = states.map((s) => s.state);
    expect(names).toContain('reconnecting');
    expect(names).toContain('starting');
    expect(world.spawns).toHaveLength(1);
    expect(states.find((s) => s.state === 'starting')?.message).toBe(TEXTS.autoRestarting);
    expect(states.find((s) => s.state === 'starting')?.restartAttempts).toBe(1);
    expect(sup.state().restartAttempts).toBe(0);
    sup.dispose();
  });

  it('stops after 3 automatic restarts within 5 minutes', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    const { sup } = makeSupervisor(world);
    await sup.start();
    for (let i = 0; i < 3; i++) {
      world.killDaemon();
      await until(() => sup.state().state === 'connected' && world.spawns.length === i + 1);
    }
    world.killDaemon();
    await until(() => sup.state().state === 'error');
    expect(sup.state().message).toBe(TEXTS.tooManyRestarts);
    expect(world.spawns).toHaveLength(3);
  });

  it('a restart that keeps failing uses the budget and reports the last failure', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    world.onSpawn = (child) => child.exit(1);
    const { sup } = makeSupervisor(world);
    await sup.start();
    world.killDaemon();
    await until(() => sup.state().state === 'error' && sup.state().message.startsWith(TEXTS.tooManyRestarts));
    expect(world.spawns).toHaveLength(3);
    expect(sup.state().message).toContain(TEXTS.earlyExit(1, null));
  });

  it('event stream reconnects to the same daemon → connected again without restart', async () => {
    const world = new World();
    const d = world.startDaemon('1.0.0', 10);
    const { sup, states } = makeSupervisor(world);
    await sup.start();
    for (const s of d.subscribers) s.onState?.('reconnecting', 'kurz weg');
    expect(sup.state().state).toBe('reconnecting');
    for (const s of d.subscribers) s.onState?.('connected');
    await until(() => sup.state().state === 'connected');
    expect(world.spawns).toHaveLength(0);
    expect(states.map((s) => s.state)).toEqual(['connected', 'reconnecting', 'connected']);
    sup.dispose();
  });

  it('a stop announced by the daemon itself is not fought: no restart, then "stopped"', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    const { sup } = makeSupervisor(world, { selfRespawnGraceMs: 5_000 });
    await sup.start();
    world.emit({ type: 'daemon.status', payload: { state: 'stopping' } as never, ts: 1, seq: 2 });
    world.killDaemon();
    await until(() => sup.state().state === 'stopped');
    expect(sup.state().message).toBe(TEXTS.stoppedExternally);
    expect(world.spawns).toHaveLength(0);
  });

  it('a daemon that restarts itself (database restore) is picked up again', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    const { sup } = makeSupervisor(world, { selfRespawnGraceMs: 60_000 });
    await sup.start();
    world.emit({ type: 'daemon.status', payload: { state: 'stopping' } as never, ts: 1, seq: 2 });
    world.killDaemon();
    world.after(3_000, () => world.startDaemon('1.0.0', 11));
    await until(() => sup.state().state === 'connected' && sup.state().daemonPid === 11);
    expect(world.spawns).toHaveLength(0);
    sup.dispose();
  });
});

describe('DaemonSupervisor – quitting while the daemon is still starting (R6-6)', () => {
  it('requestShutdown() waits for its own starting daemon and sends daemon.shutdown', async () => {
    const world = new World();
    // Cold Windows start: the spawned daemon binds its endpoint only after 3 s.
    let started: FakeDaemon | null = null;
    world.onSpawn = (child, w) => w.after(3_000, () => (started = w.startDaemon('1.0.0', child.pid)));
    const { sup } = makeSupervisor(world);
    void sup.start();
    await until(() => sup.state().state === 'starting' && world.spawns.length === 1);
    expect(await sup.requestShutdown('ui-closed', 5_000)).toBe(true);
    expect(started).not.toBeNull();
    expect(started!.rpcs).toContainEqual({ method: 'daemon.shutdown', params: { reason: 'ui-closed' } });
    await until(() => world.daemon === null);
    expect(world.spawns[0].child.killed).toBe(false);
    sup.dispose();
    // Nothing restarts it afterwards.
    for (let i = 0; i < 50; i++) await tick();
    expect(world.spawns).toHaveLength(1);
    expect(world.daemon).toBeNull();
  });

  it('requestShutdown() ends its own child when it does not listen within the time limit', async () => {
    const world = new World();
    world.onSpawn = (child, w) => w.after(60_000, () => w.startDaemon('1.0.0', child.pid));
    const { sup } = makeSupervisor(world);
    void sup.start();
    await until(() => sup.state().state === 'starting' && world.spawns.length === 1);
    await sup.requestShutdown('ui-closed', 5_000);
    expect(world.spawns[0].child.killed).toBe(true);
    sup.dispose();
  });

  it('requestShutdown() leaves a daemon alone that this UI did not start', async () => {
    const world = new World();
    const { sup } = makeSupervisor(world);
    expect(await sup.requestShutdown('ui-closed', 1_000)).toBe(false);
    expect(world.spawns).toHaveLength(0);
  });

  it('stop() while starting does not report "stopped" for a daemon that comes up afterwards', async () => {
    const world = new World();
    world.onSpawn = (child, w) => {
      w.after(2_000, () => w.startDaemon('1.0.0', child.pid));
      const origKill = child.kill.bind(child);
      child.kill = () => {
        w.killDaemon();
        return origKill();
      };
    };
    const { sup } = makeSupervisor(world);
    void sup.start();
    await until(() => sup.state().state === 'starting' && world.spawns.length === 1);
    const s = await sup.stop('os-shutdown');
    expect(s.state).toBe('stopped');
    // Time goes on: the spawned process must not come up afterwards and run without the UI.
    await world.deps().sleep!(10_000);
    for (let i = 0; i < 50; i++) await tick();
    expect(world.daemon).toBeNull();
  });
});

describe('DaemonSupervisor – hung daemon (R6-5)', () => {
  it('a daemon that holds the endpoint but never answers ends in state error with diagnostics, not endless reconnecting', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    const { sup, states } = makeSupervisor(world, { hungTimeoutMs: 120_000, hungRecheckMs: 10_000 });
    await sup.start();
    world.hung = true;
    for (const sub of world.daemon!.subscribers) sub.onState?.('reconnecting', 'idle timeout');
    await until(() => sup.state().state === 'error', 20_000);
    const s = sup.state();
    expect(s.message).toBe(TEXTS.daemonHung);
    expect(s.recovery).toEqual(['create_diagnostics']);
    expect(states.map((x) => x.state)).toContain('reconnecting');
    expect(world.t - states.find((x) => x.state === 'reconnecting')!.since).toBeGreaterThanOrEqual(120_000);
    expect(world.spawns).toHaveLength(0);
    await expect(sup.rpc('daemon.status', undefined, { waitForConnectionMs: 0 })).rejects.toMatchObject({ message: TEXTS.daemonHung });
    // It answers again: NOVA reconnects on its own.
    world.hung = false;
    await until(() => sup.state().state === 'connected', 20_000);
    expect(sup.state().recovery).toBeUndefined();
    sup.dispose();
  });

  it('"Dienst neu starten" ends a hung daemon of an earlier session after the identity check and starts a new one', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    world.hung = true;
    world.recordedKill = (w) => {
      w.killDaemon();
      w.hung = false;
      return true;
    };
    const { sup } = makeSupervisor(world, { vanishTimeoutMs: 1_000 });
    const s = await sup.restart();
    expect(world.recordedKills).toBe(1);
    expect(s.state).toBe('connected');
    expect(s.daemonPid).not.toBe(10);
    expect(world.spawns).toHaveLength(1);
    sup.dispose();
  });

  it('when the identity check fails nothing is killed and the error stays honest', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    world.hung = true;
    const { sup } = makeSupervisor(world, { vanishTimeoutMs: 1_000 });
    const s = await sup.restart();
    expect(world.recordedKills).toBe(1);
    expect(s.state).toBe('error');
    expect(s.message).toBe(TEXTS.stopFailed);
    expect(world.daemon).not.toBeNull();
    expect(world.spawns).toHaveLength(0);
  });

  it('a hard foreign endpoint is never killed', async () => {
    const world = new World();
    world.foreign = 'hard';
    const { sup } = makeSupervisor(world, { vanishTimeoutMs: 1_000 });
    await sup.restart();
    expect(world.recordedKills).toBe(0);
    expect(sup.state().message).toBe(TEXTS.foreign);
  });
});

describe('killRecordedDaemonDefault (daemon.lock identity kill)', () => {
  const log = { debug() {}, info() {}, warn() {}, error() {} };

  it('does nothing without a matching lock file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-lock-'));
    try {
      const lockPath = join(dir, 'daemon.lock');
      expect(await killRecordedDaemonDefault({ lockPath, endpoint: '/x/daemon.sock', platform: process.platform, log })).toBe(false);
      writeFileSync(lockPath, JSON.stringify({ pid: 999_999, instanceId: 'i', endpoint: '/other.sock', startedAt: Date.now(), version: '1' }));
      expect(await killRecordedDaemonDefault({ lockPath, endpoint: '/x/daemon.sock', platform: process.platform, log })).toBe(false);
      writeFileSync(lockPath, JSON.stringify({ pid: process.pid, instanceId: 'i', endpoint: '/x/daemon.sock', startedAt: Date.now(), version: '1' }));
      expect(await killRecordedDaemonDefault({ lockPath, endpoint: '/x/daemon.sock', platform: process.platform, log })).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform === 'win32')('kills the recorded process only when its creation time matches (pids are reused)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-lock-'));
    const startedAt = Date.now();
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { detached: true, stdio: 'ignore' });
    const exited = new Promise<void>((r) => child.once('exit', () => r()));
    try {
      const lockPath = join(dir, 'daemon.lock');
      const endpoint = join(dir, 'daemon.sock');
      // Same pid, but recorded an hour later: another process that reused the pid → untouched.
      writeFileSync(lockPath, JSON.stringify({ pid: child.pid, instanceId: 'i', endpoint, startedAt: startedAt + 3_600_000, version: '1' }));
      expect(await killRecordedDaemonDefault({ lockPath, endpoint, platform: process.platform, log })).toBe(false);
      expect(child.exitCode).toBeNull();
      writeFileSync(lockPath, JSON.stringify({ pid: child.pid, instanceId: 'i', endpoint, startedAt, version: '1' }));
      expect(await killRecordedDaemonDefault({ lockPath, endpoint, platform: process.platform, log })).toBe(true);
      await exited;
    } finally {
      try {
        child.kill('SIGKILL');
      } catch {
        /* gone */
      }
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DaemonSupervisor – recovery actions (R3-6)', () => {
  it('a database failure at start offers restoring a backup and diagnostics; other failures only diagnostics', async () => {
    const world = new World();
    world.onSpawn = (child, w) => {
      w.crash = {
        ts: w.t,
        version: '1.0.0',
        phase: 'database_open',
        code: 'INTERNAL',
        message: 'Der NOVA-Hintergrunddienst konnte nicht starten.',
        details: 'database disk image is malformed',
        logFile: '/data/logs/daemon.log',
        suggestedActions: ['restore_backup', 'create_diagnostics', 'open_logs'],
      };
      child.exit(1);
    };
    const { sup } = makeSupervisor(world);
    const s = await sup.start();
    expect(s.state).toBe('error');
    expect(s.message).toContain(TEXTS.crashHintRestore);
    expect(s.recovery).toEqual(['restore_backup', 'create_diagnostics']);

    const other = new World();
    other.onSpawn = (child) => child.exit(1);
    const o = makeSupervisor(other).sup;
    expect((await o.start()).recovery).toEqual(['create_diagnostics']);
    // The next state (e.g. after a successful restart) carries no recovery actions any more.
    other.onSpawn = (child, w) => {
      w.startDaemon('1.0.0', child.pid);
    };
    expect((await o.restart()).recovery).toBeUndefined();
    o.dispose();
  });
});

describe('DaemonSupervisor – manual control and rpc', () => {
  it('stop(): daemon.shutdown, waits until the endpoint is gone, state stopped; rpc fails afterwards', async () => {
    const world = new World();
    const d = world.startDaemon('1.0.0', 10);
    const { sup } = makeSupervisor(world);
    await sup.start();
    const s = await sup.stop();
    expect(d.rpcs).toContainEqual({ method: 'daemon.shutdown', params: { reason: 'ui' } });
    expect(s.state).toBe('stopped');
    expect(s.message).toBe(TEXTS.stopped);
    expect(world.spawns).toHaveLength(0);
    await expect(sup.rpc('daemon.status')).rejects.toMatchObject({ code: 'DAEMON_UNAVAILABLE', message: TEXTS.stopped });
  });

  it('stop() kills its own unresponsive child as the last resort', async () => {
    const world = new World();
    world.onSpawn = (child, w) => {
      const daemon = w.startDaemon('1.0.0', child.pid);
      daemon.onShutdown = 'ignore';
      const origKill = child.kill.bind(child);
      child.kill = () => {
        w.killDaemon();
        return origKill();
      };
    };
    const { sup } = makeSupervisor(world, { vanishTimeoutMs: 1_000 });
    await sup.start();
    const s = await sup.stop();
    expect(world.spawns[0].child.killed).toBe(true);
    expect(s.state).toBe('stopped');
  });

  it('restart(): stops the running daemon, starts a new one and resets the budget', async () => {
    const world = new World();
    world.startDaemon('1.0.0', 10);
    const budget = new RestartBudget(3, 5 * 60_000);
    budget.tryConsume(world.t);
    budget.tryConsume(world.t);
    budget.tryConsume(world.t);
    const { sup, states } = makeSupervisor(world, { restartBudget: budget });
    await sup.start();
    const s = await sup.restart();
    expect(s.state).toBe('connected');
    expect(s.daemonPid).not.toBe(10);
    expect(states.some((x) => x.message === TEXTS.restarting)).toBe(true);
    expect(budget.remaining(world.t)).toBe(3);
    sup.dispose();
  });

  it('restart() after an error starts the daemon again', async () => {
    const world = new World();
    world.onSpawn = (child) => child.exit(1);
    const { sup } = makeSupervisor(world);
    expect((await sup.start()).state).toBe('error');
    world.onSpawn = (child, w) => {
      w.startDaemon('1.0.0', child.pid);
    };
    expect((await sup.restart()).state).toBe('connected');
    sup.dispose();
  });

  it('rpc() waits while the daemon is starting and forwards params unchanged', async () => {
    const world = new World();
    const { sup } = makeSupervisor(world, { connectWaitMs: 5_000 });
    void sup.start();
    const res = (await sup.rpc('projects.list', { includeArchived: true } as never)) as unknown as { method: string; echo: unknown };
    expect(res).toEqual({ method: 'projects.list', echo: { includeArchived: true } });
    sup.dispose();
  });

  it('rpc() passes daemon errors through', async () => {
    const world = new World();
    world.startDaemon();
    const { sup } = makeSupervisor(world);
    await sup.start();
    world.daemon = null; // gone without the stream noticing yet
    await expect(sup.rpc('daemon.status', undefined, { waitForConnectionMs: 0 })).rejects.toBeInstanceOf(DaemonRpcError);
    sup.dispose();
  });

  it('requestShutdown(): uses a temporary client when not connected; false when nothing runs', async () => {
    const world = new World();
    const { sup } = makeSupervisor(world);
    expect(await sup.requestShutdown('ui-closed')).toBe(false);
    const d = world.startDaemon();
    expect(await sup.requestShutdown('ui-closed')).toBe(true);
    expect(d.rpcs).toContainEqual({ method: 'daemon.shutdown', params: { reason: 'ui-closed' } });
    expect(world.clients.every((c) => c.closed)).toBe(true);
  });

  it('requestShutdown() while connected suppresses the automatic restart', async () => {
    const world = new World();
    world.startDaemon();
    const { sup } = makeSupervisor(world);
    await sup.start();
    expect(await sup.requestShutdown('os-shutdown')).toBe(true);
    await until(() => world.daemon === null);
    for (let i = 0; i < 50; i++) await tick();
    expect(world.spawns).toHaveLength(0);
    sup.dispose();
  });

  it('start() is idempotent and dispose() ends supervision without touching the daemon', async () => {
    const world = new World();
    const d = world.startDaemon();
    const { sup, states } = makeSupervisor(world);
    await Promise.all([sup.start(), sup.start()]);
    expect(world.clients).toHaveLength(1);
    sup.dispose();
    const count = states.length;
    world.killDaemon();
    for (let i = 0; i < 50; i++) await tick();
    expect(states.length).toBe(count);
    expect(d.rpcs).toHaveLength(0);
    await expect(sup.rpc('daemon.status')).rejects.toMatchObject({ code: 'DAEMON_UNAVAILABLE' });
  });
});

describe.runIf(process.platform !== 'win32' && existsSync('/bin/bash'))('CLOSE_INHERITED_FDS_SCRIPT (real bash)', () => {
  it('closes every inherited descriptor ≥ 3 but keeps stdout/stderr, argv and the exit code', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nova-fds-'));
    const fds: number[] = [];
    try {
      const secret = join(dir, 'inherited.txt');
      writeFileSync(secret, 'x');
      for (let i = 0; i < 12; i++) fds.push(openSync(secret, 'r'));
      const out = openSync(join(dir, 'out.log'), 'w');
      fds.push(out);
      const probe =
        "const fs=require('fs');const l=[];for(const f of fs.readdirSync('/dev/fd')){try{l.push(fs.readlinkSync('/dev/fd/'+f))}catch{}}" +
        "console.log(JSON.stringify({argv:process.argv.slice(1),fds:l}));console.error('stderr-ok');process.exit(7)";
      const cmd = daemonSpawnCommand({ execPath: process.execPath, daemonEntry: '-e', dataDir: '/data dir', posixShell: '/bin/bash' });
      // daemonEntry '-e' + the probe as "entry": node -e <probe> -- --data-dir "/data dir"
      const args = [...cmd.args];
      args.splice(args.indexOf('-e') + 1, 0, probe, '--');
      const code = await new Promise<number | null>((resolve) => {
        const child = spawn(cmd.command, args, { stdio: ['ignore', out, out, ...fds.slice(0, 12)] });
        child.once('exit', (c) => resolve(c));
      });
      expect(code).toBe(7);
      const text = readFileSync(join(dir, 'out.log'), 'utf8');
      const result = JSON.parse(text.split('\n')[0]) as { argv: string[]; fds: string[] };
      expect(result.argv).toEqual(['--data-dir', '/data dir']);
      expect(result.fds.filter((f) => f.endsWith('inherited.txt'))).toEqual([]);
      expect(text).toContain('stderr-ok');
    } finally {
      for (const fd of fds) closeSync(fd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
