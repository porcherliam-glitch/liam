import { describe, expect, it } from 'vitest';
import type { CpuInfo } from 'node:os';
import { cpuPercentBetween, cpuTotals, parseMeminfoAvailable, parseNvidiaSmiCsv, parseWindowsGpuJson, vendorFromName, WINDOWS_GPU_SCRIPT } from './parsers';
import { diskUsage, nearestExisting, type DiskDeps } from './disk';

const MIB = 1024 * 1024;

describe('parseNvidiaSmiCsv', () => {
  it('parses recorded nvidia-smi output incl. [N/A] fields', () => {
    const out = 'NVIDIA GeForce RTX 4070, 12, 12282, 1536\r\nNVIDIA GeForce RTX 3060, [N/A], 12288, [Not Supported]\r\n\r\n';
    expect(parseNvidiaSmiCsv(out)).toEqual([
      { name: 'NVIDIA GeForce RTX 4070', vendor: 'nvidia', utilPercent: 12, vramTotalBytes: 12282 * MIB, vramUsedBytes: 1536 * MIB, source: 'nvidia-smi', estimated: false },
      { name: 'NVIDIA GeForce RTX 3060', vendor: 'nvidia', utilPercent: null, vramTotalBytes: 12288 * MIB, vramUsedBytes: null, source: 'nvidia-smi', estimated: false },
    ]);
  });

  it('handles names with commas and ignores junk', () => {
    expect(parseNvidiaSmiCsv('Tesla T4, PCIe, 0, 15360, 3\nNo devices were found\n')).toEqual([
      { name: 'Tesla T4, PCIe', vendor: 'nvidia', utilPercent: 0, vramTotalBytes: 15360 * MIB, vramUsedBytes: 3 * MIB, source: 'nvidia-smi', estimated: false },
    ]);
    expect(parseNvidiaSmiCsv('')).toEqual([]);
  });
});

describe('meminfo + cpu', () => {
  it('reads MemAvailable', () => {
    const text = 'MemTotal:       32768000 kB\nMemFree:         1024000 kB\nMemAvailable:   16384000 kB\nBuffers: 1 kB\n';
    expect(parseMeminfoAvailable(text)).toBe(16384000 * 1024);
    expect(parseMeminfoAvailable('MemTotal: 1 kB')).toBeNull();
  });

  it('computes CPU percent from deltas', () => {
    const cpu = (user: number, idle: number): CpuInfo => ({ model: 'x', speed: 1, times: { user, nice: 0, sys: 0, idle, irq: 0 } });
    const a = cpuTotals([cpu(100, 900), cpu(100, 900)]);
    const b = cpuTotals([cpu(150, 950), cpu(200, 900)]);
    expect(cpuPercentBetween(a, b)).toBe(75);
    expect(cpuPercentBetween(b, b)).toBeNull();
  });
});

describe('vendorFromName', () => {
  it('maps common adapter names', () => {
    expect(vendorFromName('NVIDIA GeForce RTX 4090')).toBe('nvidia');
    expect(vendorFromName('AMD Radeon RX 7800 XT')).toBe('amd');
    expect(vendorFromName('Intel(R) UHD Graphics 770')).toBe('intel');
    expect(vendorFromName('Intel(R) Arc(TM) A770 Graphics')).toBe('intel');
    expect(vendorFromName('Apple M2')).toBe('apple');
    expect(vendorFromName('Matrox G200eR')).toBe('unknown');
  });
});

describe('parseWindowsGpuJson', () => {
  it('uses only non-localized WMI classes and the registry', () => {
    expect(WINDOWS_GPU_SCRIPT).toContain('Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine');
    expect(WINDOWS_GPU_SCRIPT).toContain('Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory');
    expect(WINDOWS_GPU_SCRIPT).toContain('{4d36e968-e325-11ce-bfc1-08002be10318}\\0???');
    expect(WINDOWS_GPU_SCRIPT).toContain('HardwareInformation.qwMemorySize');
    expect(WINDOWS_GPU_SCRIPT).toContain('ConvertTo-Json');
    expect(WINDOWS_GPU_SCRIPT).not.toContain('Get-Counter');
  });

  it('pairs two adapters with LUID data by size (estimated) and drops virtual adapters', () => {
    const json = JSON.stringify({
      engines: [
        { n: 'pid_1234_luid_0x00000000_0x0000D1A5_phys_0_eng_0_engtype_3D', u: 30 },
        { n: 'pid_5678_luid_0x00000000_0x0000D1A5_phys_0_eng_0_engtype_3D', u: 25.5 },
        { n: 'pid_99_luid_0x00000000_0x0000C2B1_phys_0_eng_0_engtype_3D', u: 3 },
      ],
      memory: [
        { n: 'luid_0x00000000_0x0000D1A5_phys_0', d: 4294967296 },
        { n: 'luid_0x00000000_0x0000C2B1_phys_0', d: 134217728 },
        { n: 'luid_0x00000000_0x0000E0F0_phys_0', d: 0 },
      ],
      adapters: [
        { name: 'Intel(R) UHD Graphics 770', qw: 134217728, mem: null },
        { name: 'AMD Radeon RX 7800 XT', qw: 17163091968, mem: null },
        { name: 'Microsoft Basic Render Driver', qw: null, mem: null },
      ],
      countersAvailable: true,
    });
    const r = parseWindowsGpuJson(json)!;
    expect(r.gpus).toEqual([
      { name: 'AMD Radeon RX 7800 XT', vendor: 'amd', utilPercent: 55.5, vramTotalBytes: 17163091968, vramUsedBytes: 4294967296, source: 'windows-perf-counter+registry', estimated: true },
      { name: 'Intel(R) UHD Graphics 770', vendor: 'intel', utilPercent: 3, vramTotalBytes: 134217728, vramUsedBytes: 134217728, source: 'windows-perf-counter+registry', estimated: true },
    ]);
    expect(r.note).toBeNull();
  });

  it('accepts single objects instead of arrays (Windows PowerShell 5.1) – one adapter is exact', () => {
    const json =
      '{"engines":{"n":"pid_1_luid_0x00000000_0x00000001_phys_0_eng_0_engtype_3D","u":7},"memory":{"n":"luid_0x00000000_0x00000001_phys_0","d":1073741824},"adapters":{"name":"NVIDIA GeForce GTX 1660","qw":6442450944,"mem":null},"countersAvailable":true}';
    expect(parseWindowsGpuJson(json)!.gpus).toEqual([
      { name: 'NVIDIA GeForce GTX 1660', vendor: 'nvidia', utilPercent: 7, vramTotalBytes: 6442450944, vramUsedBytes: 1073741824, source: 'windows-perf-counter+registry', estimated: false },
    ]);
  });

  it('caps utilization at 100 % and reports 0 % for idle adapters when counters exist', () => {
    const json = JSON.stringify({
      engines: [
        { n: 'pid_1_luid_0x0_0xA_phys_0_eng_0_engtype_3D', u: 80 },
        { n: 'pid_2_luid_0x0_0xA_phys_0_eng_1_engtype_3D', u: 70 },
      ],
      memory: [{ n: 'luid_0x0_0xA_phys_0', d: 100 }],
      adapters: [{ name: 'Radeon', qw: 1000, mem: null }],
      countersAvailable: true,
    });
    expect(parseWindowsGpuJson(json)!.gpus[0].utilPercent).toBe(100);
    const idle = JSON.stringify({ engines: [], memory: [{ n: 'luid_0x0_0xB_phys_0', d: 10 }], adapters: [{ name: 'Radeon', qw: 1000 }], countersAvailable: true });
    expect(parseWindowsGpuJson(idle)!.gpus[0]).toMatchObject({ utilPercent: 0, vramUsedBytes: 10 });
  });

  it('old drivers: binary MemorySize, no counters → totals only with a note', () => {
    const json = JSON.stringify({ engines: [], memory: [], adapters: [{ name: 'NVIDIA GeForce GT 730', qw: null, mem: [0, 0, 0, 128] }], countersAvailable: false });
    const r = parseWindowsGpuJson(json)!;
    expect(r.gpus).toEqual([{ name: 'NVIDIA GeForce GT 730', vendor: 'nvidia', utilPercent: null, vramTotalBytes: 2147483648, vramUsedBytes: null, source: 'registry', estimated: false }]);
    expect(r.note).toContain('Windows-Leistungsindikatoren fehlen');
  });

  it('no adapters at all → note; garbage → null', () => {
    expect(parseWindowsGpuJson('{"engines":[],"memory":[],"adapters":[],"countersAvailable":false}')).toEqual({
      gpus: [],
      note: expect.stringContaining('Keine GPU-Messwerte'),
    });
    expect(parseWindowsGpuJson('Get-CimInstance : Zugriff verweigert')).toBeNull();
    expect(parseWindowsGpuJson('')).toBeNull();
  });
});

describe('disk helpers', () => {
  const fakeDisk = (platform: NodeJS.Platform, existing: string[]): DiskDeps => ({
    platform,
    exists: (p) => existing.includes(p),
    statfs: () => ({ bsize: 4096, blocks: 1000, bavail: 250 }),
    devOf: (p) => (p.startsWith('/mnt') ? '2' : '1'),
  });

  it('walks up to the nearest existing ancestor', () => {
    expect(nearestExisting('/data/a/b/c.txt', fakeDisk('linux', ['/data', '/']))).toBe('/data');
    expect(nearestExisting('C:\\Users\\x\\new\\file.txt', fakeDisk('win32', ['C:\\Users\\x', 'C:\\']))).toBe('C:\\Users\\x');
    expect(nearestExisting('Z:\\nope', fakeDisk('win32', []))).toBeNull();
  });

  it('reports drive roots on Windows and device keys on POSIX', () => {
    expect(diskUsage('C:\\Users\\x\\proj', fakeDisk('win32', ['C:\\Users\\x\\proj']))).toEqual({ path: 'C:\\', totalBytes: 4096000, freeBytes: 1024000, key: 'c:\\' });
    expect(diskUsage('/mnt/data/x', fakeDisk('linux', ['/mnt/data/x']))).toEqual({ path: '/mnt/data/x', totalBytes: 4096000, freeBytes: 1024000, key: 'dev:2' });
    const failing: DiskDeps = { ...fakeDisk('linux', ['/x']), statfs: () => { throw new Error('EIO'); } };
    expect(diskUsage('/x', failing)).toBeNull();
  });
});
