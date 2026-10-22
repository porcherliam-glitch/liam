// ResourceMonitor (contract: src/daemon/contracts.ts; SPEC §4.9, §6.9): real measurements of CPU, RAM, disks, GPU/VRAM,
// loaded Ollama models, the daemon itself and NOVA's child processes. Emits 'resources.snapshot' on every sample.
// Key decisions:
// - CPU % from os.cpus() deltas between samples (baseline taken at construction, so the first sample is a real
//   short-term value, not the average since boot). Memory: Linux prefers MemAvailable (/proc/meminfo), elsewhere
//   os.freemem(). Disks: statfs of the data dir plus every trackPath() (de-duplicated per volume).
// - GPU (gpu.ts) and Ollama (s.ollama.running(), every 10 s, errors ignored → []) are stale-while-revalidate caches:
//   only the very first sample waits for them (bounded), later samples never block on slow probes.
// - Interval = settings.resources.sampleIntervalSec (re-read every tick); the next tick is scheduled after the sample
//   finished (no overlap); timers are unref'd; stop() aborts running probes. sample() is single-flight.
// - Ring buffer of 2 h (time based, hard cap 7200 entries).
import { cpus as osCpus, freemem as osFreemem, totalmem as osTotalmem, type CpuInfo } from 'node:os';
import { readFileSync } from 'node:fs';
import type { OllamaRunningModel, ResourceSnapshot } from '@shared/schemas';
import type { ResourceMonitor, Services } from '../contracts';
import { execTool, findExecutable as coreFindExecutable, runPowerShell as coreRunPowerShell } from '../core/exec';
import { buildChildEnv } from '../core/child-env';
import { errorMessage } from '../core/errors';
import { cpuPercentBetween, cpuTotals, parseMeminfoAvailable, type CpuTotals } from './parsers';
import { defaultDiskDeps, diskUsage, pathModule, type DiskDeps } from './disk';
import { GpuProber, type GpuProbeDeps } from './gpu';

export const HISTORY_MS = 2 * 60 * 60 * 1000;
const HISTORY_CAP = 7200;
const OLLAMA_INTERVAL_MS = 10_000;
const MAX_TRACKED = 64;

export interface ResourceMonitorOptions {
  platform?: NodeJS.Platform;
  cpus?: () => CpuInfo[];
  totalmem?: () => number;
  freemem?: () => number;
  /** /proc/meminfo content (Linux) or null. */
  readMeminfo?: () => string | null;
  disk?: Partial<DiskDeps>;
  gpu?: Partial<Omit<GpuProbeDeps, 'platform' | 'now'>>;
  processRss?: () => number;
  processCpuUsage?: () => { user: number; system: number };
  /** Max wait of the FIRST sample for GPU / Ollama data (later samples never wait). */
  firstGpuWaitMs?: number;
  firstOllamaWaitMs?: number;
}

export interface ResourceMonitorImpl extends ResourceMonitor {
  /** Paths whose volumes are reported (data dir first). */
  trackedPaths(): string[];
  isRunning(): boolean;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    t.unref?.();
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(undefined);
      },
    );
  });
}

export function createResourceMonitor(s: Services, opts: ResourceMonitorOptions = {}): ResourceMonitorImpl {
  const core = s.core;
  const log = core.log.child('resources');
  const platform = opts.platform ?? core.platform;
  const getCpus = opts.cpus ?? osCpus;
  const getTotal = opts.totalmem ?? osTotalmem;
  const getFree = opts.freemem ?? osFreemem;
  const readMeminfo =
    opts.readMeminfo ??
    (() => {
      if (platform !== 'linux') return null;
      try {
        return readFileSync('/proc/meminfo', 'utf8');
      } catch {
        return null;
      }
    });
  const diskDeps: DiskDeps = { ...defaultDiskDeps(platform), ...opts.disk, platform };
  const processRss = opts.processRss ?? (() => process.memoryUsage.rss());
  const processCpu = opts.processCpuUsage ?? (() => process.cpuUsage());
  const firstGpuWaitMs = opts.firstGpuWaitMs ?? 5_000;
  const firstOllamaWaitMs = opts.firstOllamaWaitMs ?? 2_000;

  const gpu = new GpuProber({
    platform,
    now: () => core.clock.now(),
    env: opts.gpu?.env ?? (process.env as Record<string, string | undefined>),
    exists: opts.gpu?.exists ?? diskDeps.exists,
    findExecutable: opts.gpu?.findExecutable ?? ((name) => coreFindExecutable(name, platform)),
    runTool:
      opts.gpu?.runTool ??
      ((file, args, o) => execTool(file, args, { timeoutMs: o.timeoutMs, signal: o.signal, platform, env: buildChildEnv({ LC_ALL: 'C', LANG: 'C' }, platform) })),
    runPowerShell: opts.gpu?.runPowerShell ?? ((script, o) => coreRunPowerShell(script, { timeoutMs: o.timeoutMs, signal: o.signal })),
  });

  const tracked: string[] = [];
  const history: ResourceSnapshot[] = [];
  let lastCpu: CpuTotals = cpuTotals(getCpus());
  let lastCpuPercent: number | null = null;
  let lastProc = { usage: processCpu(), at: core.clock.now() };
  let ollama: { models: OllamaRunningModel[]; at: number } | null = null;
  let ollamaRefreshing: Promise<void> | null = null;
  let firstSampleDone = false;
  let inFlight: Promise<ResourceSnapshot> | null = null;
  let running = false;
  let timer: NodeJS.Timeout | null = null;

  const refreshOllama = (): Promise<void> => {
    if (!ollamaRefreshing) {
      ollamaRefreshing = (async () => {
        try {
          const models = await s.ollama.running();
          ollama = { models: Array.isArray(models) ? models : [], at: core.clock.now() };
        } catch {
          // Ollama not running / not reachable: nothing is loaded (errors are expected and ignored).
          ollama = { models: [], at: core.clock.now() };
        }
      })().finally(() => {
        ollamaRefreshing = null;
      });
    }
    return ollamaRefreshing;
  };

  const childCount = (): number => {
    try {
      const n = s.processes.runningCount();
      return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
    } catch {
      return 0;
    }
  };

  const disks = (): ResourceSnapshot['disks'] => {
    const out: ResourceSnapshot['disks'] = [];
    const seen = new Set<string>();
    for (const p of [core.paths.root, ...tracked]) {
      const d = diskUsage(p, diskDeps);
      if (!d || seen.has(d.key)) continue;
      seen.add(d.key);
      out.push({ path: d.path, totalBytes: d.totalBytes, freeBytes: d.freeBytes });
    }
    return out;
  };

  const memory = (): ResourceSnapshot['memory'] => {
    const total = getTotal();
    let free = getFree();
    const info = readMeminfo();
    if (info) {
      const avail = parseMeminfoAvailable(info);
      if (avail !== null) free = avail;
    }
    free = Math.max(0, Math.min(total, free));
    return { totalBytes: total, usedBytes: total - free, freeBytes: free };
  };

  const takeSample = async (): Promise<ResourceSnapshot> => {
    const first = !firstSampleDone;
    // GPU + Ollama: stale-while-revalidate, bounded wait only for the first sample.
    if (gpu.isStale()) {
      const p = gpu.refresh();
      if (!gpu.current()) await withTimeout(p, first ? firstGpuWaitMs : 0);
    }
    if (!ollama || core.clock.now() - ollama.at >= OLLAMA_INTERVAL_MS) {
      const p = refreshOllama();
      if (!ollama) await withTimeout(p, first ? firstOllamaWaitMs : 0);
    }

    const cpuList = getCpus();
    const totals = cpuTotals(cpuList);
    let percent = cpuPercentBetween(lastCpu, totals);
    if (percent === null) percent = lastCpuPercent ?? cpuPercentBetween({ idle: 0, total: 0 }, totals) ?? 0;
    lastCpu = totals;
    lastCpuPercent = percent;

    const now = core.clock.now();
    const usage = processCpu();
    const elapsedMicros = Math.max(1, (now - lastProc.at) * 1000);
    const cores = Math.max(1, cpuList.length);
    const procMicros = Math.max(0, usage.user - lastProc.usage.user + (usage.system - lastProc.usage.system));
    const daemonCpu = Math.round(Math.min(100, (procMicros / (elapsedMicros * cores)) * 100) * 10) / 10;
    lastProc = { usage, at: now };

    const g = gpu.current();
    const snapshot: ResourceSnapshot = {
      ts: now,
      cpu: { percent, cores: cpuList.length, model: cpuList[0]?.model?.trim() || 'unbekannt' },
      memory: memory(),
      disks: disks(),
      gpus: g ? g.gpus.map((x) => ({ ...x })) : [],
      gpuNote: g ? g.note : 'GPU-Messwerte werden noch ermittelt …',
      ollamaLoaded: ollama ? ollama.models.map((m) => ({ ...m })) : [],
      daemon: { rssBytes: processRss(), cpuPercent: Number.isFinite(daemonCpu) ? daemonCpu : 0 },
      childProcesses: childCount(),
    };
    firstSampleDone = true;

    history.push(snapshot);
    const cutoff = now - HISTORY_MS;
    let drop = 0;
    while (drop < history.length && history[drop].ts < cutoff) drop++;
    if (history.length - drop > HISTORY_CAP) drop = history.length - HISTORY_CAP;
    if (drop > 0) history.splice(0, drop);

    core.bus.emit('resources.snapshot', snapshot);
    return snapshot;
  };

  const intervalMs = (): number => {
    try {
      return Math.max(1, core.settings.section('resources').sampleIntervalSec) * 1000;
    } catch {
      return 3000;
    }
  };

  const schedule = (): void => {
    if (!running) return;
    timer = setTimeout(tick, intervalMs());
    timer.unref?.();
  };

  function tick(): void {
    timer = null;
    if (!running) return;
    monitor
      .sample()
      .catch((e) => log.warn('Messung der Systemressourcen fehlgeschlagen', { error: errorMessage(e) }))
      .finally(schedule);
  }

  const monitor: ResourceMonitorImpl = {
    start() {
      if (running) return;
      running = true;
      tick();
    },

    stop() {
      running = false;
      if (timer) clearTimeout(timer);
      timer = null;
      gpu.abort();
    },

    latest() {
      return history.length ? history[history.length - 1] : null;
    },

    history(minutes) {
      const m = Math.max(1, Math.min(120, Number.isFinite(minutes) ? minutes : 10));
      const from = core.clock.now() - m * 60_000;
      return history.filter((h) => h.ts >= from);
    },

    sample() {
      if (!inFlight) {
        inFlight = takeSample().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },

    trackPath(p) {
      if (typeof p !== 'string' || !p.trim()) return;
      const path = pathModule(platform);
      const abs = path.isAbsolute(p) ? path.normalize(p) : path.resolve(p);
      const key = platform === 'win32' ? abs.toLowerCase() : abs;
      if (tracked.some((t) => (platform === 'win32' ? t.toLowerCase() : t) === key)) return;
      if (tracked.length >= MAX_TRACKED) tracked.shift();
      tracked.push(abs);
    },

    trackedPaths() {
      return [core.paths.root, ...tracked];
    },

    isRunning() {
      return running;
    },
  };
  return monitor;
}
