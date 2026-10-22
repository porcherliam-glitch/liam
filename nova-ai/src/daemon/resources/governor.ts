// ConcurrencyGovernor (contract: src/daemon/contracts.ts; SPEC §4.9, §6.9): keeps the PC usable.
// Key decisions:
// - allowed(activeRuns): the data drive below minFreeDiskMb always stops NEW runs (allowed = activeRuns). With
//   resources.adaptive: free RAM < minFreeRamMb/2 → allowed 0 ("kritisch"); CPU (average of the last ~10 s of samples)
//   > maxCpuPercent or free RAM < minFreeRamMb → no new starts (allowed = activeRuns). Otherwise maxParallelAgents.
//   Snapshots older than 60 s (monitor stopped) are ignored – no decisions on stale numbers.
// - allowedFor(model): only local Ollama providers matter. A model that is already loaded is always ok; otherwise the
//   VRAM usage of the largest GPU must be ≤ maxVramPercent. Unknown GPU data → ok (fit checks live in OllamaService).
// - canStartProcess(): counts running processes of kind command/test/build/install/terminal (dev servers and previews
//   do not count) against resources.maxProcesses.
// - canWrite(absPath): statfs of the nearest existing ancestor, cached 5 s per path (bounded); unknown → ok.
// - All reasons are German and contain no secrets.
import type { ModelRef, ResourceSnapshot } from '@shared/schemas';
import type { ConcurrencyGovernor, Services } from '../contracts';
import { isLocalEndpoint } from '../core/net';
import { defaultDiskDeps, diskUsage, formatMb, type DiskDeps, type DiskStat } from './disk';

const MB = 1024 * 1024;
const STALE_SNAPSHOT_MS = 60_000;
const CPU_WINDOW_MS = 10_000;
const DISK_CACHE_MS = 5_000;
const DISK_CACHE_MAX = 256;
const COUNTED_KINDS = new Set(['command', 'test', 'build', 'install', 'terminal']);

export interface ConcurrencyGovernorOptions {
  platform?: NodeJS.Platform;
  disk?: Partial<DiskDeps>;
}

export function normalizeOllamaName(name: string): string {
  const n = name.trim().toLowerCase();
  const slash = n.lastIndexOf('/');
  const tagSep = n.indexOf(':', slash + 1);
  return tagSep === -1 ? `${n}:latest` : n;
}

export function createConcurrencyGovernor(s: Services, opts: ConcurrencyGovernorOptions = {}): ConcurrencyGovernor {
  const core = s.core;
  const platform = opts.platform ?? core.platform;
  const diskDeps: DiskDeps = { ...defaultDiskDeps(platform), ...opts.disk, platform };
  const diskCache = new Map<string, { at: number; stat: DiskStat | null }>();

  const settings = () => core.settings.get();

  const freshSnapshot = (): ResourceSnapshot | null => {
    let snap: ResourceSnapshot | null = null;
    try {
      snap = s.resources.latest();
    } catch {
      return null;
    }
    if (!snap) return null;
    return core.clock.now() - snap.ts <= STALE_SNAPSHOT_MS ? snap : null;
  };

  const averageCpu = (latest: ResourceSnapshot): number => {
    let samples: ResourceSnapshot[] = [];
    try {
      samples = s.resources.history(1).filter((h) => h.ts >= latest.ts - CPU_WINDOW_MS);
    } catch {
      samples = [];
    }
    if (!samples.some((h) => h.ts === latest.ts)) samples.push(latest);
    return samples.reduce((sum, h) => sum + h.cpu.percent, 0) / samples.length;
  };

  const diskStat = (absPath: string): DiskStat | null => {
    const now = core.clock.now();
    const key = platform === 'win32' ? absPath.toLowerCase() : absPath;
    const hit = diskCache.get(key);
    if (hit && now - hit.at < DISK_CACHE_MS) return hit.stat;
    const stat = diskUsage(absPath, diskDeps);
    if (diskCache.size >= DISK_CACHE_MAX) diskCache.clear();
    diskCache.set(key, { at: now, stat });
    return stat;
  };

  const governor: ConcurrencyGovernor = {
    allowed(activeRuns) {
      const st = settings();
      const configured = st.agents.maxParallelAgents;
      const active = Math.max(0, Math.trunc(Number.isFinite(activeRuns) ? activeRuns : 0));
      const noNewStarts = Math.min(configured, active);

      const data = governor.canWrite(core.paths.root);
      if (!data.ok) return { allowed: noNewStarts, configured, reason: data.reason };

      const res = st.resources;
      if (!res.adaptive) return { allowed: configured, configured, reason: null };
      const snap = freshSnapshot();
      if (!snap) return { allowed: configured, configured, reason: null };

      const freeMb = snap.memory.freeBytes / MB;
      if (freeMb < res.minFreeRamMb / 2) {
        return {
          allowed: 0,
          configured,
          reason: `Ressourcenlimit: Arbeitsspeicher kritisch knapp (${Math.round(freeMb).toLocaleString('de-DE')} MB frei, mindestens ${res.minFreeRamMb.toLocaleString('de-DE')} MB nötig). Neue Agenten starten erst, wenn wieder mehr Arbeitsspeicher frei ist.`,
        };
      }
      const cpu = averageCpu(snap);
      if (cpu > res.maxCpuPercent) {
        return {
          allowed: noNewStarts,
          configured,
          reason: `Ressourcenlimit: CPU ${Math.round(cpu)} % (Grenze ${Math.round(res.maxCpuPercent)} %). Neue Agenten starten, sobald die Auslastung sinkt.`,
        };
      }
      if (freeMb < res.minFreeRamMb) {
        return {
          allowed: noNewStarts,
          configured,
          reason: `Ressourcenlimit: wenig freier Arbeitsspeicher (${Math.round(freeMb).toLocaleString('de-DE')} MB frei, mindestens ${res.minFreeRamMb.toLocaleString('de-DE')} MB). Neue Agenten starten, sobald wieder genug frei ist.`,
        };
      }
      return { allowed: configured, configured, reason: null };
    },

    allowedFor(model: ModelRef) {
      let cfg: ReturnType<Services['providers']['getConfig']> = null;
      try {
        cfg = s.providers.getConfig(model.providerId);
      } catch {
        cfg = null;
      }
      if (!cfg || cfg.type !== 'ollama' || !isLocalEndpoint(cfg.baseUrl)) return { ok: true, reason: null };
      const snap = freshSnapshot();
      if (!snap) return { ok: true, reason: null };
      const wanted = normalizeOllamaName(model.modelId);
      if (snap.ollamaLoaded.some((m) => normalizeOllamaName(m.model) === wanted)) return { ok: true, reason: null };
      const gpus = snap.gpus.filter((g) => g.vramTotalBytes !== null && g.vramTotalBytes > 0 && g.vramUsedBytes !== null);
      if (gpus.length === 0) return { ok: true, reason: null };
      const main = gpus.reduce((a, b) => ((b.vramTotalBytes ?? 0) > (a.vramTotalBytes ?? 0) ? b : a));
      const pct = ((main.vramUsedBytes ?? 0) / (main.vramTotalBytes ?? 1)) * 100;
      const limit = settings().resources.maxVramPercent;
      if (pct > limit) {
        return {
          ok: false,
          reason: `Der Grafikspeicher ist zu ${Math.round(pct)} % belegt (Grenze ${Math.round(limit)} %${main.estimated ? ', Werte geschätzt' : ''}). Das Modell „${model.modelId}“ wird erst geladen, wenn wieder Grafikspeicher frei ist.`,
        };
      }
      return { ok: true, reason: null };
    },

    canStartProcess() {
      const max = settings().resources.maxProcesses;
      let count: number;
      try {
        count = s.processes.list({ includeExited: false }).filter((p) => p.status === 'running' && COUNTED_KINDS.has(p.kind)).length;
      } catch {
        try {
          count = s.processes.runningCount();
        } catch {
          count = 0;
        }
      }
      if (count >= max) {
        return { ok: false, reason: `Es laufen bereits ${count} Prozesse (Grenze ${max}). Der nächste startet, sobald einer fertig ist.` };
      }
      return { ok: true, reason: null };
    },

    canWrite(absPath) {
      const minMb = settings().resources.minFreeDiskMb;
      const stat = diskStat(absPath);
      if (!stat) return { ok: true, reason: null };
      if (stat.freeBytes < minMb * MB) {
        const where = platform === 'win32' ? `Auf dem Laufwerk ${stat.path}` : `Auf dem Datenträger von ${stat.path}`;
        return { ok: false, reason: `${where} sind nur noch ${formatMb(stat.freeBytes)} frei (mindestens ${minMb.toLocaleString('de-DE')} MB nötig).` };
      }
      return { ok: true, reason: null };
    },
  };
  return governor;
}
