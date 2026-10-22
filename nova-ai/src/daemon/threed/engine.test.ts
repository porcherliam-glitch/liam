// Tests for the ComfyUI layout detection (Comfy Desktop, Legacy Desktop, portable, manual; Windows on path.win32 with an
// in-memory file system, Linux), endpoint candidates, URL normalization, /system_stats parsing and status texts.
import { describe, expect, it } from 'vitest';
import { memFs, WIN_ENV } from '../integrations/test-helpers';
import { DESKTOP_DEFAULT_URL, PORTABLE_DEFAULT_URL, detectComfyLayouts, endpointCandidates, findComfyDir, installFromManualPath, isModelsFolder, normalizeEngineUrl, parseSystemStats, statusMessage, type StatusFacts } from './engine';

const W = 'C:\\Users\\Ana';

describe('detectComfyLayouts – Windows', () => {
  it('finds Comfy Desktop: shared models folder from settings.json, installs, running ports and the program', () => {
    const fs = memFs('win32', {
      [`${W}\\AppData\\Roaming\\Comfy Desktop\\settings.json`]: JSON.stringify({ modelsDirs: ['D:\\KI\\Modelle', `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models`] }),
      [`${W}\\AppData\\Roaming\\Comfy Desktop\\installations.json`]: JSON.stringify([
        { id: 'a', name: 'Standalone', installPath: `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone`, sourceId: 'standalone' },
        { id: 'b', name: 'Cloud', installPath: '', sourceId: 'cloud' },
      ]),
      [`${W}\\AppData\\Roaming\\Comfy Desktop\\port-locks\\port-8188.json`]: '{"pid":1}',
      [`${W}\\AppData\\Roaming\\Comfy Desktop\\port-locks\\port-8189.json`]: '{"pid":2}',
      [`${W}\\AppData\\Roaming\\Comfy Desktop\\port-locks\\readme.txt`]: '',
      [`${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\main.py`]: '',
      [`${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\comfyui_version.py`]: '__version__ = "0.42.0"\n',
      [`${W}\\AppData\\Local\\Programs\\Comfy Desktop\\Comfy Desktop.exe`]: '',
    });
    fs.addDir('D:\\KI\\Modelle\\checkpoints');
    fs.addDir('D:\\KI\\Modelle\\vae');
    fs.addDir(`${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models\\diffusion_models`);
    const l = detectComfyLayouts(fs, WIN_ENV, 'win32');
    expect(l.modelsDirs).toEqual(['D:\\KI\\Modelle', `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Shared\\models`]);
    expect(l.ports).toEqual([8188, 8189]);
    expect(l.installs).toEqual([
      { kind: 'desktop', path: `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI\\main.py`, comfyDir: `${W}\\AppData\\Local\\Comfy-Desktop\\ComfyUI-Installs\\Standalone\\ComfyUI`, modelsDir: null, version: '0.42.0' },
      { kind: 'desktop', path: `${W}\\AppData\\Local\\Programs\\Comfy Desktop\\Comfy Desktop.exe`, comfyDir: null, modelsDir: null, version: null },
    ]);
  });

  it('finds the Legacy ComfyUI Desktop through %APPDATA%\\ComfyUI\\config.json basePath (+ bundled core version)', () => {
    const fs = memFs('win32', {
      [`${W}\\AppData\\Roaming\\ComfyUI\\config.json`]: JSON.stringify({ installState: 'installed', basePath: `${W}\\Documents\\ComfyUI` }),
      [`${W}\\AppData\\Local\\Programs\\@comfyorgcomfyui-electron\\ComfyUI.exe`]: '',
      [`${W}\\AppData\\Local\\Programs\\@comfyorgcomfyui-electron\\resources\\ComfyUI\\main.py`]: '',
      [`${W}\\AppData\\Local\\Programs\\@comfyorgcomfyui-electron\\resources\\ComfyUI\\comfyui_version.py`]: "__version__ = '0.3.60'",
    });
    fs.addDir(`${W}\\Documents\\ComfyUI\\models\\checkpoints`);
    const l = detectComfyLayouts(fs, WIN_ENV, 'win32');
    expect(l.modelsDirs).toEqual([`${W}\\Documents\\ComfyUI\\models`]);
    expect(l.installs).toEqual([
      {
        kind: 'legacy_desktop',
        path: `${W}\\AppData\\Local\\Programs\\@comfyorgcomfyui-electron\\ComfyUI.exe`,
        comfyDir: `${W}\\AppData\\Local\\Programs\\@comfyorgcomfyui-electron\\resources\\ComfyUI`,
        modelsDir: `${W}\\Documents\\ComfyUI\\models`,
        version: '0.3.60',
      },
    ]);
    expect(l.ports).toEqual([]);
  });

  it('finds portable installs (Desktop, Downloads, drive roots) with their models folder and launcher', () => {
    const fs = memFs('win32', {
      [`${W}\\Desktop\\ComfyUI_windows_portable\\ComfyUI\\main.py`]: '',
      [`${W}\\Desktop\\ComfyUI_windows_portable\\run_nvidia_gpu.bat`]: '',
      [`${W}\\Desktop\\ComfyUI_windows_portable\\ComfyUI\\comfyui_version.py`]: '__version__ = "0.42.0"',
      ['D:\\ComfyUI_windows_portable_nvidia\\ComfyUI\\main.py']: '',
      ['D:\\Spiele\\x.txt']: '',
    });
    fs.addDir(`${W}\\Desktop\\ComfyUI_windows_portable\\python_embeded`);
    fs.addDir(`${W}\\Desktop\\ComfyUI_windows_portable\\ComfyUI\\models\\vae`);
    const l = detectComfyLayouts(fs, WIN_ENV, 'win32');
    expect(l.installs.map((i) => [i.kind, i.path, i.modelsDir, i.version])).toEqual([
      ['portable', `${W}\\Desktop\\ComfyUI_windows_portable\\run_nvidia_gpu.bat`, `${W}\\Desktop\\ComfyUI_windows_portable\\ComfyUI\\models`, '0.42.0'],
      ['portable', 'D:\\ComfyUI_windows_portable_nvidia\\ComfyUI\\main.py', null, null],
    ]);
    expect(l.modelsDirs).toEqual([`${W}\\Desktop\\ComfyUI_windows_portable\\ComfyUI\\models`]);
  });

  it('uses a manual path (main.py, launcher .bat) and finds nothing on an empty PC', () => {
    const fs = memFs('win32', {
      ['E:\\Tools\\Comfy\\ComfyUI\\main.py']: '',
      ['E:\\Tools\\Comfy\\start.bat']: '',
    });
    fs.addDir('E:\\Tools\\Comfy\\python_embeded');
    fs.addDir('E:\\Tools\\Comfy\\ComfyUI\\models\\checkpoints');
    expect(installFromManualPath(fs, 'E:\\Tools\\Comfy\\start.bat', 'win32')).toMatchObject({ kind: 'portable', comfyDir: 'E:\\Tools\\Comfy\\ComfyUI', modelsDir: 'E:\\Tools\\Comfy\\ComfyUI\\models' });
    expect(installFromManualPath(fs, 'E:\\Tools\\Comfy\\ComfyUI\\main.py', 'win32')).toMatchObject({ kind: 'manual', comfyDir: 'E:\\Tools\\Comfy\\ComfyUI' });
    expect(installFromManualPath(fs, 'E:\\fehlt.bat', 'win32')).toBeNull();
    const l = detectComfyLayouts(fs, WIN_ENV, 'win32', 'E:\\Tools\\Comfy\\start.bat');
    expect(l.installs).toHaveLength(1);
    expect(l.modelsDirs).toEqual(['E:\\Tools\\Comfy\\ComfyUI\\models']);
    expect(detectComfyLayouts(memFs('win32'), WIN_ENV, 'win32')).toEqual({ installs: [], modelsDirs: [], ports: [] });
    expect(findComfyDir(fs, 'E:\\Tools\\Comfy', 'win32')).toBe('E:\\Tools\\Comfy\\ComfyUI');
  });
});

describe('detectComfyLayouts – Linux', () => {
  it('finds Comfy Desktop (XDG folders), legacy config and a manual clone', () => {
    const fs = memFs('linux', {
      '/home/ana/.config/comfyui-desktop-2/settings.json': JSON.stringify({ modelsDirs: ['/home/ana/ComfyUI-Shared/models'] }),
      '/home/ana/.local/state/comfyui-desktop-2/port-locks/port-8000.json': '{}',
      '/home/ana/.config/ComfyUI/config.json': JSON.stringify({ basePath: '/data/comfy' }),
      '/home/ana/ComfyUI/main.py': '',
      '/home/ana/ComfyUI/comfyui_version.py': '__version__ = "0.42.0"',
    });
    fs.addDir('/home/ana/ComfyUI-Shared/models/checkpoints');
    fs.addDir('/data/comfy/models/vae');
    fs.addDir('/home/ana/ComfyUI/models/diffusion_models');
    const l = detectComfyLayouts(fs, { HOME: '/home/ana' }, 'linux');
    expect(l.modelsDirs).toEqual(['/home/ana/ComfyUI-Shared/models', '/data/comfy/models', '/home/ana/ComfyUI/models']);
    expect(l.ports).toEqual([8000]);
    expect(l.installs).toEqual([{ kind: 'manual', path: '/home/ana/ComfyUI/main.py', comfyDir: '/home/ana/ComfyUI', modelsDir: '/home/ana/ComfyUI/models', version: '0.42.0' }]);
    expect(isModelsFolder(fs, '/home/ana', 'linux')).toBe(false);
  });
});

describe('endpoints and status', () => {
  it('accepts only local engine addresses and builds the probe order', () => {
    expect(normalizeEngineUrl('127.0.0.1:8188/')).toBe('http://127.0.0.1:8188');
    expect(normalizeEngineUrl('http://localhost:8000')).toBe('http://localhost:8000');
    expect(normalizeEngineUrl('http://[::1]:8188')).toBe('http://[::1]:8188');
    expect(() => normalizeEngineUrl('http://192.168.1.20:8188')).toThrow(/Nur lokale Adressen/);
    expect(() => normalizeEngineUrl('https://comfy.example.com')).toThrow(/Nur lokale Adressen/);
    expect(() => normalizeEngineUrl('ftp://127.0.0.1')).toThrow(/http/);
    expect(() => normalizeEngineUrl('http://user:pw@127.0.0.1:8188')).toThrow(/Zugangsdaten/);
    expect(endpointCandidates('', [])).toEqual([DESKTOP_DEFAULT_URL, PORTABLE_DEFAULT_URL]);
    expect(endpointCandidates('', [8189, 8000])).toEqual(['http://127.0.0.1:8189', DESKTOP_DEFAULT_URL, PORTABLE_DEFAULT_URL]);
    expect(endpointCandidates('http://127.0.0.1:9000', [8189])).toEqual(['http://127.0.0.1:9000']);
  });

  it('parses /system_stats (GPU name cleanup, CPU mode)', () => {
    expect(parseSystemStats({ system: { comfyui_version: '0.42.0' }, devices: [{ name: 'cuda:0 NVIDIA GeForce RTX 4080 : cudaMallocAsync', type: 'cuda', vram_total: 17e9, vram_free: 15e9 }] })).toEqual({
      version: '0.42.0',
      gpu: { name: 'NVIDIA GeForce RTX 4080', vramTotalBytes: 17e9, vramFreeBytes: 15e9 },
    });
    expect(parseSystemStats({ system: {}, devices: [{ name: 'cpu', type: 'cpu', vram_total: 1 }] })).toEqual({ version: null, gpu: { name: 'Prozessor (keine Grafikkarte)', vramTotalBytes: null, vramFreeBytes: null } });
    expect(parseSystemStats(null)).toEqual({ version: null, gpu: null });
  });

  it('gives the next step in German', () => {
    const base: StatusFacts = {
      platform: 'win32',
      installed: true,
      running: true,
      baseUrl: 'http://127.0.0.1:8000',
      configuredUrl: false,
      version: '0.42.0',
      supports3d: true,
      modelsDir: 'C:\\m',
      modelsDirInvalid: false,
      generatorInstalled: true,
      gpu: { name: 'RTX', vramTotalBytes: 16e9, vramFreeBytes: 15e9 },
    };
    expect(statusMessage({ ...base, installed: false, running: false })).toContain('winget install -e --id Comfy.ComfyUI-Desktop');
    expect(statusMessage({ ...base, installed: false, running: false, platform: 'linux' })).toContain('https://www.comfy.org/download');
    expect(statusMessage({ ...base, running: false })).toContain('ComfyUI starten');
    expect(statusMessage({ ...base, running: false, configuredUrl: true })).toContain('Adresse in den Einstellungen');
    expect(statusMessage({ ...base, supports3d: false })).toContain('aktualisieren');
    expect(statusMessage({ ...base, modelsDir: null })).toContain('Ordner „models“');
    expect(statusMessage({ ...base, modelsDirInvalid: true })).toContain('kein ComfyUI-Modellordner');
    expect(statusMessage({ ...base, generatorInstalled: false })).toContain('herunterladen');
    expect(statusMessage(base)).toBe('ComfyUI 0.42.0 läuft unter http://127.0.0.1:8000. Die 3D-Werkstatt ist bereit.');
    expect(statusMessage({ ...base, gpu: { name: 'Prozessor (keine Grafikkarte)', vramTotalBytes: null, vramFreeBytes: null } })).toContain('sehr langsam');
  });
});
