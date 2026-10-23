// Pure parsers of the resource monitor (unit-tested with recorded outputs).
// Key decisions:
// - Only machine-readable sources: nvidia-smi CSV (noheader,nounits), /proc/meminfo, PowerShell ConvertTo-Json of
//   NON-localized WMI classes and registry values (SPEC §6.0.2: never parse localized OS text).
// - Windows GPU numbers: utilization = sum of UtilizationPercentage over the engtype_3D engine instances per adapter
//   LUID (capped at 100), VRAM used = GPUAdapterMemory.DedicatedUsage, VRAM total = registry
//   HardwareInformation.qwMemorySize (fallback HardwareInformation.MemorySize). LUIDs cannot be mapped to registry
//   adapters without native code, so they are paired by size (largest VRAM ↔ largest dedicated usage). With more than
//   one adapter this pairing is a heuristic → estimated=true.
// - Values that are not reported ([N/A], [Not Supported], missing counters) are null – never invented.
import type { CpuInfo } from 'node:os';
import type { GpuInfo } from '@shared/schemas';

const MIB = 1024 * 1024;

export function vendorFromName(name: string): GpuInfo['vendor'] {
  const n = name.toLowerCase();
  if (/nvidia|geforce|quadro|tesla|\brtx\b|\bgtx\b/.test(n)) return 'nvidia';
  if (/\bamd\b|radeon|\bati\b|firepro/.test(n)) return 'amd';
  if (/intel|iris|\buhd\b|\barc\b/.test(n)) return 'intel';
  if (/apple/.test(n)) return 'apple';
  return 'unknown';
}

function numOrNull(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const v = raw.trim();
  if (!/^\d+(?:\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** `nvidia-smi --query-gpu=name,utilization.gpu,memory.total,memory.used --format=csv,noheader,nounits` (MiB). */
export function parseNvidiaSmiCsv(stdout: string): GpuInfo[] {
  const gpus: GpuInfo[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 4) continue;
    // Parse from the end: a GPU name could contain a comma.
    const used = numOrNull(parts[parts.length - 1]);
    const total = numOrNull(parts[parts.length - 2]);
    const util = numOrNull(parts[parts.length - 3]);
    const name = parts.slice(0, parts.length - 3).join(',').trim();
    if (!name) continue;
    gpus.push({
      name,
      vendor: 'nvidia',
      utilPercent: util === null ? null : Math.min(100, util),
      vramTotalBytes: total === null ? null : Math.round(total * MIB),
      vramUsedBytes: used === null ? null : Math.round(used * MIB),
      source: 'nvidia-smi',
      estimated: false,
    });
  }
  return gpus;
}

/** MemAvailable from /proc/meminfo in bytes (null if missing). */
export function parseMeminfoAvailable(text: string): number | null {
  const m = /^MemAvailable:\s+(\d+)\s*kB/m.exec(text);
  return m ? Number(m[1]) * 1024 : null;
}

export interface CpuTotals {
  idle: number;
  total: number;
}

export function cpuTotals(cpus: CpuInfo[]): CpuTotals {
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/** Busy share between two readings in percent (one decimal); null when no time passed. */
export function cpuPercentBetween(prev: CpuTotals, cur: CpuTotals): number | null {
  const dTotal = cur.total - prev.total;
  const dIdle = cur.idle - prev.idle;
  if (dTotal <= 0) return null;
  const pct = (1 - dIdle / dTotal) * 100;
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

// ------------------------------------------------------------------------------------------------ Windows GPU (WMI)

/** PowerShell script (run through core/exec runPowerShell) that collects non-localized GPU data as JSON. */
export const WINDOWS_GPU_SCRIPT =
  "$ErrorActionPreference='SilentlyContinue';" +
  "$eng=@(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object { $_.Name -like '*engtype_3D*' } | ForEach-Object { [pscustomobject]@{ n=[string]$_.Name; u=[double]$_.UtilizationPercentage } });" +
  '$mem=@(Get-CimInstance -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory | ForEach-Object { [pscustomobject]@{ n=[string]$_.Name; d=[double]$_.DedicatedUsage } });' +
  "$ad=@(Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0???' | ForEach-Object {" +
  " $q=$_.'HardwareInformation.qwMemorySize'; $m=$_.'HardwareInformation.MemorySize';" +
  ' if($m -is [byte[]]){ if($m.Length -ge 4){ $m=[BitConverter]::ToUInt32($m,0) } else { $m=$null } };' +
  ' [pscustomobject]@{ name=[string]$_.DriverDesc; qw=$(if($q -ne $null){[double]$q}else{$null}); mem=$(if($m -ne $null){[double]$m}else{$null}) } });' +
  '[pscustomobject]@{ engines=$eng; memory=$mem; adapters=$ad; countersAvailable=[bool](Get-CimClass -ClassName Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine) } | ConvertTo-Json -Depth 4 -Compress';

const VIRTUAL_ADAPTER =
  /microsoft basic (display|render)|microsoft remote display|hyper-v|virtual display|parsec virtual|citrix|mirage driver|iddsampledriver|meta virtual|splashtop|virtual desktop monitor|spacedesk|duet display/i;

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return [v];
  return [];
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim())) return Number(v);
  if (Array.isArray(v) && v.length >= 4 && v.every((b) => typeof b === 'number' && b >= 0 && b <= 255)) {
    // REG_BINARY little-endian (older drivers store MemorySize as bytes)
    let n = 0;
    for (let i = Math.min(v.length, 8) - 1; i >= 0; i--) n = n * 256 + (v[i] as number);
    return n;
  }
  return null;
}

function luidKey(name: string): string | null {
  const m = /luid_(0x[0-9a-f]+)_(0x[0-9a-f]+)(?:_phys_(\d+))?/i.exec(name);
  if (!m) return null;
  return `${m[1]}_${m[2]}_${m[3] ?? '0'}`.toLowerCase();
}

export interface WindowsGpuResult {
  gpus: GpuInfo[];
  note: string | null;
}

export function parseWindowsGpuJson(stdout: string): WindowsGpuResult | null {
  const text = stdout.trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(text.indexOf('{')));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as { engines?: unknown; memory?: unknown; adapters?: unknown; countersAvailable?: unknown };

  const engines = asArray(data.engines);
  const memory = asArray(data.memory);
  const countersAvailable = data.countersAvailable === true || engines.length > 0 || memory.length > 0;

  const util = new Map<string, number>();
  for (const e of engines) {
    const name = (e as { n?: unknown }).n;
    const u = asNumber((e as { u?: unknown }).u);
    if (typeof name !== 'string' || u === null) continue;
    const key = luidKey(name);
    if (!key) continue;
    util.set(key, (util.get(key) ?? 0) + u);
  }
  const used = new Map<string, number>();
  for (const m of memory) {
    const name = (m as { n?: unknown }).n;
    const d = asNumber((m as { d?: unknown }).d);
    if (typeof name !== 'string' || d === null) continue;
    const key = luidKey(name);
    if (!key) continue;
    used.set(key, (used.get(key) ?? 0) + d);
  }
  const luids = [...new Set([...util.keys(), ...used.keys()])].map((key) => ({
    key,
    util: util.has(key) ? Math.round(Math.min(100, util.get(key)!) * 10) / 10 : countersAvailable ? 0 : null,
    used: used.has(key) ? Math.round(used.get(key)!) : null,
  }));
  // Most active / most memory first (pairs with the largest adapter).
  luids.sort((a, b) => (b.used ?? -1) - (a.used ?? -1) || (b.util ?? -1) - (a.util ?? -1));
  const activeLuids = luids.filter((l) => (l.used ?? 0) > 0 || (l.util ?? 0) > 0);
  const pairLuids = activeLuids.length > 0 ? activeLuids : luids;

  const adapters = asArray(data.adapters)
    .map((a) => {
      const o = a as { name?: unknown; qw?: unknown; mem?: unknown };
      const name = typeof o.name === 'string' ? o.name.trim() : '';
      const qw = asNumber(o.qw);
      const mem = asNumber(o.mem);
      const total = qw && qw > 0 ? qw : mem && mem > 0 ? mem : null;
      return { name, total };
    })
    .filter((a) => a.name && !VIRTUAL_ADAPTER.test(a.name));
  adapters.sort((a, b) => (b.total ?? -1) - (a.total ?? -1));

  const ambiguous = adapters.length > 1 && pairLuids.length > 1;
  const gpus: GpuInfo[] = [];
  if (adapters.length > 0) {
    adapters.forEach((a, i) => {
      const l = pairLuids[i];
      const hasCounters = !!l && (l.util !== null || l.used !== null);
      gpus.push({
        name: a.name,
        vendor: vendorFromName(a.name),
        utilPercent: l ? l.util : null,
        vramTotalBytes: a.total,
        vramUsedBytes: l ? l.used : null,
        source: hasCounters ? (a.total !== null ? 'windows-perf-counter+registry' : 'windows-perf-counter') : 'registry',
        estimated: ambiguous,
      });
    });
  } else {
    pairLuids.forEach((l, i) => {
      gpus.push({
        name: pairLuids.length > 1 ? `Grafikadapter ${i + 1}` : 'Grafikadapter',
        vendor: 'unknown',
        utilPercent: l.util,
        vramTotalBytes: null,
        vramUsedBytes: l.used,
        source: 'windows-perf-counter',
        estimated: false,
      });
    });
  }

  let note: string | null = null;
  if (gpus.length === 0) note = 'Keine GPU-Messwerte verfügbar (keine Grafikkarte über die Windows-Leistungsindikatoren oder die Registry gefunden).';
  else if (gpus.every((g) => g.utilPercent === null && g.vramUsedBytes === null))
    note = 'GPU-Auslastung und belegter Grafikspeicher sind nicht verfügbar (Windows-Leistungsindikatoren fehlen, z. B. bei älteren Treibern).';
  else if (gpus.some((g) => g.vramTotalBytes === null)) note = 'Die Größe des Grafikspeichers ist nicht für jede Grafikkarte bekannt.';
  return { gpus, note };
}
