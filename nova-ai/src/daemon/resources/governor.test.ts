import { afterEach, describe, expect, it } from 'vitest';
import type { ProcessInfo, ProviderConfig, ResourceSnapshot } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { ProcessManager, ProviderRegistry, ResourceMonitor } from '../contracts';
import { createConcurrencyGovernor, normalizeOllamaName } from './governor';
import type { DiskDeps } from './disk';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

const GB = 1024 ** 3;
const MB = 1024 ** 2;

function snapshot(patch: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return {
    ts: 1_000_000,
    cpu: { percent: 20, cores: 8, model: 'cpu' },
    memory: { totalBytes: 32 * GB, usedBytes: 16 * GB, freeBytes: 16 * GB },
    disks: [],
    gpus: [],
    gpuNote: null,
    ollamaLoaded: [],
    daemon: { rssBytes: 1, cpuPercent: 0 },
    childProcesses: 0,
    ...patch,
  };
}

const proc = (kind: ProcessInfo['kind'], status: ProcessInfo['status'] = 'running'): ProcessInfo => ({
  id: `proc_${Math.random()}`,
  projectId: null,
  taskId: null,
  kind,
  command: 'x',
  cwd: '/',
  pid: 1,
  status,
  exitCode: null,
  url: null,
  startedAt: 0,
  endedAt: null,
});

function setup(o: { snap?: ResourceSnapshot | null; history?: ResourceSnapshot[]; freeBytes?: number; providers?: ProviderConfig[]; processes?: ProcessInfo[]; platform?: NodeJS.Platform } = {}) {
  t = createTestCore();
  let now = 1_000_000;
  t.core.clock = { now: () => now };
  let snap = o.snap === undefined ? snapshot() : o.snap;
  let free = o.freeBytes ?? 100 * GB;
  let statfsCalls = 0;
  const resources = {
    latest: () => snap,
    history: () => o.history ?? (snap ? [snap] : []),
  } as unknown as ResourceMonitor;
  const providers = {
    getConfig: (id: string) => (o.providers ?? []).find((p) => p.id === id) ?? null,
  } as unknown as ProviderRegistry;
  const processes = { list: () => o.processes ?? [], runningCount: () => (o.processes ?? []).length } as unknown as ProcessManager;
  const disk: Partial<DiskDeps> = {
    exists: (p) => !p.includes('missing'),
    statfs: () => {
      statfsCalls++;
      return { bsize: 1024, blocks: (200 * GB) / 1024, bavail: free / 1024 };
    },
    devOf: () => '1',
  };
  const s = makeServices(t.core, { resources, providers, processes });
  const governor = createConcurrencyGovernor(s, { platform: o.platform ?? 'linux', disk });
  return {
    governor,
    core: t.core,
    setSnap: (x: ResourceSnapshot | null) => {
      snap = x;
    },
    setFree: (b: number) => {
      free = b;
    },
    advance: (ms: number) => {
      now += ms;
    },
    statfsCalls: () => statfsCalls,
  };
}

const ollamaLocal: ProviderConfig = {
  id: 'ollama-local',
  type: 'ollama',
  name: 'Ollama',
  baseUrl: 'http://127.0.0.1:11434',
  enabled: true,
  paid: false,
  approved: true,
  options: {},
  hasApiKey: false,
  createdAt: 0,
  updatedAt: 0,
} as ProviderConfig;

describe('ConcurrencyGovernor.allowed', () => {
  it('returns the configured parallelism when resources are fine', () => {
    const { governor } = setup();
    expect(governor.allowed(0)).toEqual({ allowed: 2, configured: 2, reason: null });
  });

  it('high CPU (average of the last samples) → no new starts with a German reason', () => {
    const latest = snapshot({ ts: 1_000_000, cpu: { percent: 95, cores: 8, model: 'x' } });
    const { governor } = setup({ snap: latest, history: [snapshot({ ts: 995_000, cpu: { percent: 89, cores: 8, model: 'x' } }), latest] });
    expect(governor.allowed(1)).toEqual({ allowed: 1, configured: 2, reason: 'Ressourcenlimit: CPU 92 % (Grenze 85 %). Neue Agenten starten, sobald die Auslastung sinkt.' });
    expect(governor.allowed(5).allowed).toBe(2);
  });

  it('a single CPU spike within a calm window does not block', () => {
    const latest = snapshot({ ts: 1_000_000, cpu: { percent: 100, cores: 8, model: 'x' } });
    const calm = [1, 2, 3].map((i) => snapshot({ ts: 1_000_000 - i * 3000, cpu: { percent: 40, cores: 8, model: 'x' } }));
    const { governor } = setup({ snap: latest, history: [...calm, latest] });
    expect(governor.allowed(0).allowed).toBe(2);
  });

  it('low RAM → no new starts; critically low RAM → 0', () => {
    const { governor, setSnap } = setup();
    setSnap(snapshot({ memory: { totalBytes: 8 * GB, usedBytes: 0, freeBytes: 1500 * MB } }));
    const low = governor.allowed(1);
    expect(low.allowed).toBe(1);
    expect(low.reason).toContain('wenig freier Arbeitsspeicher');
    setSnap(snapshot({ memory: { totalBytes: 8 * GB, usedBytes: 0, freeBytes: 900 * MB } }));
    const critical = governor.allowed(1);
    expect(critical.allowed).toBe(0);
    expect(critical.reason).toContain('kritisch');
  });

  it('adaptive off ignores CPU/RAM; stale snapshots are ignored', () => {
    const { governor, core, setSnap, advance } = setup({ snap: snapshot({ cpu: { percent: 99, cores: 8, model: 'x' } }) });
    core.settings.update({ resources: { adaptive: false } });
    expect(governor.allowed(0).allowed).toBe(2);
    core.settings.update({ resources: { adaptive: true } });
    expect(governor.allowed(0).allowed).toBe(0);
    advance(61_000);
    expect(governor.allowed(0)).toEqual({ allowed: 2, configured: 2, reason: null });
    setSnap(null);
    expect(governor.allowed(0).allowed).toBe(2);
  });

  it('low space on the data drive stops new runs even without adaptive mode', () => {
    const { governor, core } = setup({ freeBytes: 500 * MB });
    core.settings.update({ resources: { adaptive: false } });
    const r = governor.allowed(1);
    expect(r.allowed).toBe(1);
    expect(r.reason).toContain('nur noch 500 MB frei');
  });
});

describe('ConcurrencyGovernor.allowedFor', () => {
  it('only checks local Ollama models; loaded models are always ok', () => {
    const vramFull = snapshot({
      gpus: [{ name: 'RTX', vendor: 'nvidia', utilPercent: 1, vramTotalBytes: 12 * GB, vramUsedBytes: 11.5 * GB, source: 'nvidia-smi', estimated: false }],
      ollamaLoaded: [{ model: 'llama3:latest', sizeBytes: 1, vramBytes: 1, expiresAt: null, contextLength: null }],
    });
    const { governor } = setup({ snap: vramFull, providers: [ollamaLocal, { ...ollamaLocal, id: 'openai', type: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' }] });
    expect(governor.allowedFor({ providerId: 'openai', modelId: 'gpt-4o' })).toEqual({ ok: true, reason: null });
    expect(governor.allowedFor({ providerId: 'ollama-local', modelId: 'llama3' })).toEqual({ ok: true, reason: null });
    const blocked = governor.allowedFor({ providerId: 'ollama-local', modelId: 'qwen2.5-coder:14b' });
    expect(blocked.ok).toBe(false);
    expect(blocked.reason).toContain('zu 96 % belegt');
    expect(blocked.reason).toContain('qwen2.5-coder:14b');
  });

  it('unknown GPU data or free VRAM → ok', () => {
    const { governor, setSnap } = setup({ providers: [ollamaLocal] });
    expect(governor.allowedFor({ providerId: 'ollama-local', modelId: 'x' }).ok).toBe(true);
    setSnap(snapshot({ gpus: [{ name: 'RTX', vendor: 'nvidia', utilPercent: 1, vramTotalBytes: 12 * GB, vramUsedBytes: 2 * GB, source: 'nvidia-smi', estimated: false }] }));
    expect(governor.allowedFor({ providerId: 'ollama-local', modelId: 'x' }).ok).toBe(true);
  });

  it('normalizes Ollama names', () => {
    expect(normalizeOllamaName('Llama3')).toBe('llama3:latest');
    expect(normalizeOllamaName('qwen2.5:7b')).toBe('qwen2.5:7b');
    expect(normalizeOllamaName('registry.local:5000/team/model')).toBe('registry.local:5000/team/model:latest');
  });
});

describe('ConcurrencyGovernor.canStartProcess / canWrite', () => {
  it('counts only command/test/build/install/terminal processes', () => {
    const { governor, core } = setup({ processes: [proc('command'), proc('test'), proc('dev_server'), proc('preview'), proc('build', 'exited')] });
    core.settings.update({ resources: { maxProcesses: 2 } });
    const r = governor.canStartProcess();
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Es laufen bereits 2 Prozesse (Grenze 2). Der nächste startet, sobald einer fertig ist.');
    core.settings.update({ resources: { maxProcesses: 3 } });
    expect(governor.canStartProcess().ok).toBe(true);
  });

  it('stale running rows of another instance never exceed the live process count', () => {
    const { core } = setup();
    core.settings.update({ resources: { maxProcesses: 2 } });
    const rows = [proc('command'), proc('command'), proc('test')];
    const blocked = createConcurrencyGovernor(makeServices(core, { processes: { list: () => rows, runningCount: () => 3 } as unknown as ProcessManager }), { platform: 'linux' });
    expect(blocked.canStartProcess().ok).toBe(false);
    const stale = createConcurrencyGovernor(makeServices(core, { processes: { list: () => rows, runningCount: () => 1 } as unknown as ProcessManager }), { platform: 'linux' });
    expect(stale.canStartProcess()).toEqual({ ok: true, reason: null });
  });

  it('checks free space of the nearest existing ancestor and caches for 5 s', () => {
    const { governor, setFree, advance, statfsCalls } = setup();
    expect(governor.canWrite('/data/projects/missing/file.txt')).toEqual({ ok: true, reason: null });
    setFree(10 * MB);
    expect(governor.canWrite('/data/projects/missing/file.txt').ok).toBe(true); // cached
    expect(statfsCalls()).toBe(1);
    advance(5001);
    const r = governor.canWrite('/data/projects/missing/file.txt');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Auf dem Datenträger von /data/projects/missing/file.txt sind nur noch 10 MB frei (mindestens 1.024 MB nötig).');
  });

  it('names the drive on Windows', () => {
    const { governor } = setup({ platform: 'win32', freeBytes: 100 * MB });
    expect(governor.canWrite('D:\\Projekte\\Spiel\\a.txt').reason).toContain('Auf dem Laufwerk D:\\ sind nur noch 100 MB frei');
  });
});
