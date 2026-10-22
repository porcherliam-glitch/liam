import { afterEach, describe, expect, it } from 'vitest';
import type { CpuInfo } from 'node:os';
import type { OllamaRunningModel, ResourceSnapshot } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { OllamaService, ProcessManager } from '../contracts';
import { createResourceMonitor, HISTORY_MS, type ResourceMonitorOptions, type ResourceMonitorImpl } from './resource-monitor';
import { NVIDIA_SMI_ARGS, type ProbeRunResult } from './gpu';
import { WINDOWS_GPU_SCRIPT } from './parsers';

let t: TestCore | null = null;
let monitors: ResourceMonitorImpl[] = [];
afterEach(() => {
  for (const m of monitors) m.stop();
  monitors = [];
  t?.cleanup();
  t = null;
});

const GB = 1024 ** 3;
const cpu = (user: number, idle: number): CpuInfo => ({ model: ' Test CPU 3000 ', speed: 3000, times: { user, nice: 0, sys: 0, idle, irq: 0 } });

interface Harness {
  monitor: ResourceMonitorImpl;
  events: ResourceSnapshot[];
  setNow(ms: number): void;
  advance(ms: number): void;
  calls: { tool: Array<{ file: string; args: string[] }>; ps: string[]; ollama: number };
  setCpus(list: CpuInfo[]): void;
  setOllama(fn: () => Promise<OllamaRunningModel[]>): void;
  setTool(fn: (file: string, args: string[]) => Promise<ProbeRunResult>): void;
  setPs(fn: () => Promise<ProbeRunResult>): void;
}

function setup(o: Partial<ResourceMonitorOptions> & { platform?: NodeJS.Platform; nvidia?: string | null } = {}): Harness {
  t = createTestCore();
  let now = 1_000_000_000;
  t.core.clock = { now: () => now };
  let cpus = [cpu(100, 900), cpu(100, 900)];
  let ollamaFn: () => Promise<OllamaRunningModel[]> = async () => [];
  let toolFn: (file: string, args: string[]) => Promise<ProbeRunResult> = async () => ({ code: 0, stdout: 'NVIDIA GeForce RTX 4070, 40, 12282, 6141\n', stderr: '' });
  let psFn: () => Promise<ProbeRunResult> = async () => ({ code: 1, stdout: '', stderr: '' });
  const calls = { tool: [] as Array<{ file: string; args: string[] }>, ps: [] as string[], ollama: 0 };
  const ollama = {
    running: () => {
      calls.ollama++;
      return ollamaFn();
    },
  } as unknown as OllamaService;
  const processes = { runningCount: () => 3 } as unknown as ProcessManager;
  const s = makeServices(t.core, { ollama, processes });
  const monitor = createResourceMonitor(s, {
    platform: o.platform ?? 'linux',
    cpus: () => cpus,
    totalmem: () => 16 * GB,
    freemem: () => 2 * GB,
    readMeminfo: () => `MemTotal: 16777216 kB\nMemAvailable: ${8 * 1024 * 1024} kB\n`,
    disk: {
      exists: () => true,
      statfs: () => ({ bsize: 4096, blocks: 1_000_000, bavail: 500_000 }),
      devOf: (p) => (p.startsWith('/mnt/other') ? '9' : '1'),
    },
    gpu: {
      env: {},
      exists: () => false,
      findExecutable: async (name) => (name === 'nvidia-smi' ? (o.nvidia === undefined ? '/usr/bin/nvidia-smi' : o.nvidia) : null),
      runTool: (file, args) => {
        calls.tool.push({ file, args });
        return toolFn(file, args);
      },
      runPowerShell: (script) => {
        calls.ps.push(script);
        return psFn();
      },
    },
    processRss: () => 123_456_789,
    processCpuUsage: () => ({ user: 0, system: 0 }),
    firstGpuWaitMs: 1000,
    firstOllamaWaitMs: 1000,
    ...o,
  });
  monitors.push(monitor);
  const events: ResourceSnapshot[] = [];
  t.core.bus.on('resources.snapshot', (snap) => events.push(snap));
  return {
    monitor,
    events,
    calls,
    setNow: (ms) => {
      now = ms;
    },
    advance: (ms) => {
      now += ms;
    },
    setCpus: (list) => {
      cpus = list;
    },
    setOllama: (fn) => {
      ollamaFn = fn;
    },
    setTool: (fn) => {
      toolFn = fn;
    },
    setPs: (fn) => {
      psFn = fn;
    },
  };
}

const flush = () => new Promise((r) => setTimeout(r, 10));

describe('ResourceMonitor', () => {
  it('samples CPU deltas, MemAvailable, disks, nvidia-smi, Ollama, daemon and child processes', async () => {
    const h = setup();
    h.setOllama(async () => [{ model: 'qwen2.5-coder:7b', sizeBytes: 5 * GB, vramBytes: 5 * GB, expiresAt: null, contextLength: 16384 }]);
    h.monitor.trackPath('/srv/project-a'); // same device as the data dir → de-duplicated
    h.monitor.trackPath('/mnt/other/project-b');
    h.setCpus([cpu(150, 950), cpu(200, 900)]);
    const snap = await h.monitor.sample();
    expect(snap.cpu).toEqual({ percent: 75, cores: 2, model: 'Test CPU 3000' });
    expect(snap.memory).toEqual({ totalBytes: 16 * GB, usedBytes: 8 * GB, freeBytes: 8 * GB });
    expect(snap.disks).toHaveLength(2);
    expect(snap.disks[1]).toEqual({ path: '/mnt/other/project-b', totalBytes: 4096 * 1_000_000, freeBytes: 4096 * 500_000 });
    expect(snap.gpus).toEqual([
      { name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia', utilPercent: 40, vramTotalBytes: 12282 * 1024 * 1024, vramUsedBytes: 6141 * 1024 * 1024, source: 'nvidia-smi', estimated: false },
    ]);
    expect(snap.gpuNote).toBeNull();
    expect(h.calls.tool[0]).toEqual({ file: '/usr/bin/nvidia-smi', args: NVIDIA_SMI_ARGS });
    expect(snap.ollamaLoaded.map((m) => m.model)).toEqual(['qwen2.5-coder:7b']);
    expect(snap.daemon.rssBytes).toBe(123_456_789);
    expect(snap.childProcesses).toBe(3);
    expect(h.events).toEqual([snap]);
    expect(h.monitor.latest()).toBe(snap);
  });

  it('falls back to os.freemem without meminfo and keeps the last CPU value when no time passed', async () => {
    const h = setup({ readMeminfo: () => null });
    h.setCpus([cpu(150, 950), cpu(150, 950)]);
    const a = await h.monitor.sample();
    expect(a.memory.freeBytes).toBe(2 * GB);
    expect(a.cpu.percent).toBe(50);
    const b = await h.monitor.sample(); // same counters → no delta
    expect(b.cpu.percent).toBe(50);
  });

  it('reports a German gpuNote when nvidia-smi is missing on Linux', async () => {
    const h = setup({ nvidia: null });
    const snap = await h.monitor.sample();
    expect(snap.gpus).toEqual([]);
    expect(snap.gpuNote).toBe('Keine GPU-Messwerte verfügbar (nvidia-smi nicht gefunden).');
    expect(h.calls.tool).toHaveLength(0);
  });

  it('Windows without nvidia-smi: one WMI PowerShell call at most every 10 s', async () => {
    const h = setup({ platform: 'win32', nvidia: null });
    let used = 1 * GB;
    h.setPs(async () => ({
      code: 0,
      stdout: JSON.stringify({
        engines: [{ n: 'pid_1_luid_0x0_0x1_phys_0_eng_0_engtype_3D', u: 12 }],
        memory: [{ n: 'luid_0x0_0x1_phys_0', d: used }],
        adapters: [{ name: 'AMD Radeon RX 6700 XT', qw: 12 * GB, mem: null }],
        countersAvailable: true,
      }),
      stderr: '',
    }));
    const first = await h.monitor.sample();
    expect(h.calls.ps).toEqual([WINDOWS_GPU_SCRIPT]);
    expect(first.gpus[0]).toMatchObject({ name: 'AMD Radeon RX 6700 XT', vendor: 'amd', utilPercent: 12, vramUsedBytes: 1 * GB, vramTotalBytes: 12 * GB });
    h.advance(3000);
    await h.monitor.sample();
    expect(h.calls.ps).toHaveLength(1);
    used = 2 * GB;
    h.advance(7000);
    const stale = await h.monitor.sample(); // refresh starts in the background, the cached value is served
    expect(h.calls.ps).toHaveLength(2);
    expect(stale.gpus[0].vramUsedBytes).toBe(1 * GB);
    await flush();
    h.advance(1000);
    expect((await h.monitor.sample()).gpus[0].vramUsedBytes).toBe(2 * GB);
  });

  it('Windows: nvidia-smi from the default path is preferred over WMI', async () => {
    const h = setup({
      platform: 'win32',
      nvidia: null,
      gpu: {
        env: { SystemRoot: 'C:\\Windows' },
        exists: (p) => p === 'C:\\Windows\\System32\\nvidia-smi.exe',
        findExecutable: async () => null,
        runTool: async (file) => ({ code: 0, stdout: `NVIDIA GeForce RTX 3080, 5, 10240, 512\n`, stderr: file }),
        runPowerShell: async () => {
          throw new Error('must not be called');
        },
      },
    });
    const snap = await h.monitor.sample();
    expect(snap.gpus[0]).toMatchObject({ name: 'NVIDIA GeForce RTX 3080', source: 'nvidia-smi' });
  });

  it('Windows: unreadable counters → note, never fake values', async () => {
    const h = setup({ platform: 'win32', nvidia: null });
    h.setPs(async () => ({ code: 1, stdout: '', stderr: 'denied' }));
    const snap = await h.monitor.sample();
    expect(snap.gpus).toEqual([]);
    expect(snap.gpuNote).toContain('Windows-Leistungsindikatoren');
  });

  it('refreshes Ollama every 10 s and ignores errors', async () => {
    const h = setup();
    h.setOllama(async () => {
      throw new Error('ECONNREFUSED');
    });
    expect((await h.monitor.sample()).ollamaLoaded).toEqual([]);
    expect(h.calls.ollama).toBe(1);
    h.advance(5000);
    await h.monitor.sample();
    expect(h.calls.ollama).toBe(1);
    h.setOllama(async () => [{ model: 'llama3:8b', sizeBytes: 1, vramBytes: 1, expiresAt: null, contextLength: null }]);
    h.advance(5000);
    await h.monitor.sample();
    expect(h.calls.ollama).toBe(2);
    await flush();
    h.advance(1000);
    expect((await h.monitor.sample()).ollamaLoaded.map((m) => m.model)).toEqual(['llama3:8b']);
  });

  it('keeps a 2 h ring buffer and filters history by minutes', async () => {
    const h = setup();
    const start = 2_000_000_000;
    h.setNow(start);
    await h.monitor.sample();
    h.setNow(start + 60 * 60_000);
    await h.monitor.sample();
    h.setNow(start + HISTORY_MS + 60_000);
    await h.monitor.sample();
    const all = h.monitor.history(120);
    expect(all.map((x) => x.ts)).toEqual([start + 60 * 60_000, start + HISTORY_MS + 60_000]);
    expect(h.monitor.history(10).map((x) => x.ts)).toEqual([start + HISTORY_MS + 60_000]);
  });

  it('sample() is single-flight', async () => {
    const h = setup();
    const [a, b] = await Promise.all([h.monitor.sample(), h.monitor.sample()]);
    expect(a).toBe(b);
    expect(h.events).toHaveLength(1);
  });

  it('start() samples immediately and stop() ends the loop', async () => {
    const h = setup();
    t!.core.settings.update({ resources: { sampleIntervalSec: 1 } });
    h.monitor.start();
    h.monitor.start(); // idempotent
    await flush();
    expect(h.events.length).toBe(1);
    expect(h.monitor.isRunning()).toBe(true);
    h.monitor.stop();
    expect(h.monitor.isRunning()).toBe(false);
  });

  it('trackPath de-duplicates (case-insensitive on Windows) and reports drive roots', async () => {
    const h = setup({ platform: 'win32', nvidia: null });
    h.monitor.trackPath('C:\\Projekte\\Spiel');
    h.monitor.trackPath('c:\\projekte\\spiel');
    h.monitor.trackPath('D:\\Daten\\App');
    expect(h.monitor.trackedPaths()).toHaveLength(3);
    const snap = await h.monitor.sample();
    expect(snap.disks.map((d) => d.path)).toEqual(expect.arrayContaining(['C:\\', 'D:\\']));
  });
});
