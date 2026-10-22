// GPU probing for the ResourceMonitor (SPEC §4.9, §6.9).
// Key decisions:
// - Order: (1) nvidia-smi (argv, CSV, nounits) when present – Windows also checks %SystemRoot%\System32\nvidia-smi.exe
//   and %ProgramFiles%\NVIDIA Corporation\NVSMI\nvidia-smi.exe; (2) Windows, any vendor: ONE runPowerShell call with
//   the non-localized WMI perf classes + registry VRAM totals (parsers.ts), at most every 10 s; (3) otherwise a German
//   gpuNote explains why there are no values. Values are never invented.
// - Stale-while-revalidate: sample() never waits for a slow probe once a result exists; refreshes are single-flight and
//   abortable (stop()).
// - nvidia-smi location is cached for 10 minutes; while nothing works the probe is retried every 60 s.
import type { GpuInfo } from '@shared/schemas';
import { parseNvidiaSmiCsv, parseWindowsGpuJson, WINDOWS_GPU_SCRIPT } from './parsers';
import { pathModule } from './disk';

export interface ProbeRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface GpuProbeDeps {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  now: () => number;
  exists: (p: string) => boolean;
  findExecutable: (name: string) => Promise<string | null>;
  runTool: (file: string, args: string[], opts: { timeoutMs: number; signal?: AbortSignal }) => Promise<ProbeRunResult>;
  runPowerShell: (script: string, opts: { timeoutMs: number; signal?: AbortSignal }) => Promise<ProbeRunResult>;
}

export interface GpuState {
  gpus: GpuInfo[];
  note: string | null;
  /** When the state was produced (deps.now()). */
  at: number;
  mode: 'nvidia' | 'windows' | 'none';
}

export const NVIDIA_SMI_ARGS = ['--query-gpu=name,utilization.gpu,memory.total,memory.used', '--format=csv,noheader,nounits'];
export const NVIDIA_INTERVAL_MS = 3_000;
export const WINDOWS_GPU_INTERVAL_MS = 10_000;
export const NONE_RETRY_MS = 60_000;
const NVIDIA_PATH_TTL_MS = 10 * 60_000;

function envGet(env: Record<string, string | undefined>, name: string): string | undefined {
  if (env[name] !== undefined) return env[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(env)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

export class GpuProber {
  private state: GpuState | null = null;
  private refreshing: Promise<void> | null = null;
  private nvidiaPath: { value: string | null; at: number } | null = null;
  private controller = new AbortController();

  constructor(private deps: GpuProbeDeps) {}

  current(): GpuState | null {
    return this.state;
  }

  /** Aborts running probes (monitor stop). A later refresh starts with a fresh controller. */
  abort(): void {
    this.controller.abort();
    this.controller = new AbortController();
  }

  isStale(): boolean {
    if (!this.state) return true;
    const age = this.deps.now() - this.state.at;
    const interval = this.state.mode === 'nvidia' ? NVIDIA_INTERVAL_MS : this.state.mode === 'windows' ? WINDOWS_GPU_INTERVAL_MS : NONE_RETRY_MS;
    return age >= interval;
  }

  /** Single-flight refresh. */
  refresh(): Promise<void> {
    if (!this.refreshing) {
      const signal = this.controller.signal;
      this.refreshing = this.probe(signal)
        .then((st) => {
          if (!signal.aborted) this.state = st;
        })
        .catch(() => undefined)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  private async locateNvidiaSmi(): Promise<string | null> {
    const now = this.deps.now();
    if (this.nvidiaPath && now - this.nvidiaPath.at < NVIDIA_PATH_TTL_MS) return this.nvidiaPath.value;
    let found = await this.deps.findExecutable('nvidia-smi');
    if (!found && this.deps.platform === 'win32') {
      const path = pathModule('win32');
      const systemRoot = envGet(this.deps.env, 'SystemRoot') ?? 'C:\\Windows';
      const programFiles = envGet(this.deps.env, 'ProgramFiles') ?? 'C:\\Program Files';
      for (const candidate of [path.join(systemRoot, 'System32', 'nvidia-smi.exe'), path.join(programFiles, 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe')]) {
        if (this.deps.exists(candidate)) {
          found = candidate;
          break;
        }
      }
    }
    this.nvidiaPath = { value: found, at: now };
    return found;
  }

  private async probe(signal: AbortSignal): Promise<GpuState> {
    const nvidia = await this.locateNvidiaSmi();
    let nvidiaFailed = false;
    if (nvidia) {
      try {
        const r = await this.deps.runTool(nvidia, NVIDIA_SMI_ARGS, { timeoutMs: 5_000, signal });
        if (r.code === 0) {
          const gpus = parseNvidiaSmiCsv(r.stdout);
          if (gpus.length > 0) return { gpus, note: null, at: this.deps.now(), mode: 'nvidia' };
        }
        nvidiaFailed = true;
      } catch {
        nvidiaFailed = true;
      }
      // A broken driver install can leave nvidia-smi behind: search again next time.
      this.nvidiaPath = null;
    }
    if (this.deps.platform === 'win32') {
      const prev = this.state;
      if (prev?.mode === 'windows' && this.deps.now() - prev.at < WINDOWS_GPU_INTERVAL_MS) return prev;
      try {
        const r = await this.deps.runPowerShell(WINDOWS_GPU_SCRIPT, { timeoutMs: 15_000, signal });
        if (r.code === 0) {
          const parsed = parseWindowsGpuJson(r.stdout);
          if (parsed && parsed.gpus.length > 0) return { gpus: parsed.gpus, note: parsed.note, at: this.deps.now(), mode: 'windows' };
          if (parsed) return { gpus: [], note: parsed.note, at: this.deps.now(), mode: 'none' };
        }
      } catch {
        /* fall through to the note */
      }
      return {
        gpus: [],
        note: nvidiaFailed
          ? 'Keine GPU-Messwerte verfügbar (nvidia-smi antwortet nicht und die Windows-Leistungsindikatoren sind nicht lesbar).'
          : 'Keine GPU-Messwerte verfügbar (Windows-Leistungsindikatoren für Grafikkarten sind nicht lesbar).',
        at: this.deps.now(),
        mode: 'none',
      };
    }
    if (this.deps.platform === 'darwin') {
      return { gpus: [], note: 'GPU-Messwerte werden unter macOS nicht erfasst.', at: this.deps.now(), mode: 'none' };
    }
    return {
      gpus: [],
      note: nvidiaFailed ? 'Keine GPU-Messwerte verfügbar (nvidia-smi antwortet nicht).' : 'Keine GPU-Messwerte verfügbar (nvidia-smi nicht gefunden).',
      at: this.deps.now(),
      mode: 'none',
    };
  }
}
