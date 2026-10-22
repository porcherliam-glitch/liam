// ComfyUI engine detection for the 3D workshop (docs/SPEC-3D.md §2): installations (Comfy Desktop, Legacy Desktop,
// portable, manual git clone), the models folder NOVA downloads into, endpoint candidates and the German status text.
// Key decisions:
// - Pure functions over an injected FsLike/env/platform, so the Windows layouts are unit-tested on Linux.
// - Windows layouts (verified against the official docs and sources, 2026-10-22):
//   * Comfy Desktop (current, multi-install): settings %APPDATA%\Comfy Desktop\settings.json (modelsDirs[0] = shared
//     models folder, default %LOCALAPPDATA%\Comfy-Desktop\ComfyUI-Shared\models or %USERPROFILE%\ComfyUI-Shared\models),
//     installs in installations.json (installPath), running instances in port-locks\port-<N>.json,
//     program %LOCALAPPDATA%\Programs\Comfy Desktop\Comfy Desktop.exe.
//   * Legacy ComfyUI Desktop: %APPDATA%\ComfyUI\config.json → basePath, models = <basePath>\models, port 8000,
//     program %LOCALAPPDATA%\Programs\ComfyUI\ComfyUI.exe (older builds: ...\Programs\@comfyorgcomfyui-electron\).
//   * Portable: <root>\ComfyUI_windows_portable*\ComfyUI\main.py (+ python_embeded, run_nvidia_gpu.bat), port 8188;
//     searched in the user folder, Desktop, Downloads, Documents and the roots of C: and D:.
// - Endpoints: settings.threeD.engineUrl when set (local addresses only), else the ports of running Comfy Desktop
//   instances, then 127.0.0.1:8000 (Desktop default) and 127.0.0.1:8188 (portable/manual default). Never remote.
// - A folder counts as a ComfyUI models folder when it contains checkpoints, vae or diffusion_models.
// Honest limit: the program folder of the current Comfy Desktop is the electron-builder default for its product name;
// a custom install folder is still found through its data files (settings/installations), not through the program.
import { posix, win32 } from 'node:path';
import type { ThreeDEngineStatus } from '@shared/schemas';
import { NovaError } from '../core/errors';
import { isLocalEndpoint } from '../core/net';
import type { FsLike } from '../integrations/helpers';

export const DESKTOP_DEFAULT_URL = 'http://127.0.0.1:8000';
export const PORTABLE_DEFAULT_URL = 'http://127.0.0.1:8188';
export const MODELS_MARKER_FOLDERS = ['checkpoints', 'vae', 'diffusion_models'];

export type ComfyInstallKind = 'desktop' | 'legacy_desktop' | 'portable' | 'manual';

export interface ComfyInstall {
  kind: ComfyInstallKind;
  /** Program file shown to the user: Desktop .exe, run_nvidia_gpu.bat / run_cpu.bat or main.py. */
  path: string;
  /** ComfyUI source folder (contains main.py) when known. */
  comfyDir: string | null;
  /** Models folder of this installation when known. */
  modelsDir: string | null;
  /** ComfyUI core version from comfyui_version.py when readable. */
  version: string | null;
}

export interface ComfyLayouts {
  installs: ComfyInstall[];
  /** Existing models folders in priority order (Comfy Desktop shared folder first). */
  modelsDirs: string[];
  /** Ports of running Comfy Desktop instances (port-lock files). */
  ports: number[];
}

type Env = Record<string, string | undefined>;

function envGet(env: Env, name: string): string | undefined {
  const direct = env[name];
  if (direct) return direct;
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(env)) if (k.toLowerCase() === lower && v) return v;
  return undefined;
}

function pathApi(platform: NodeJS.Platform): typeof posix {
  return platform === 'win32' ? win32 : posix;
}

function readJson(fs: FsLike, p: string): unknown {
  const text = fs.readText(p, 4 * 1024 * 1024);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** True when `dir` looks like a ComfyUI "models" folder. */
export function isModelsFolder(fs: FsLike, dir: string, platform: NodeJS.Platform): boolean {
  if (!dir || !fs.isDir(dir)) return false;
  const p = pathApi(platform);
  return MODELS_MARKER_FOLDERS.some((name) => fs.isDir(p.join(dir, name)));
}

/** `__version__ = "0.3.66"` from <comfyDir>/comfyui_version.py. */
export function readComfyVersion(fs: FsLike, comfyDir: string, platform: NodeJS.Platform): string | null {
  const text = fs.readText(pathApi(platform).join(comfyDir, 'comfyui_version.py'), 64 * 1024);
  if (!text) return null;
  const m = /__version__\s*=\s*["']([0-9][0-9A-Za-z.+-]*)["']/.exec(text);
  return m ? m[1] : null;
}

/** The ComfyUI folder inside an installation folder (same rules as Comfy Desktop's findComfyUIDir). */
export function findComfyDir(fs: FsLike, installPath: string, platform: NodeJS.Platform): string | null {
  const p = pathApi(platform);
  if (fs.exists(p.join(installPath, 'ComfyUI', 'main.py'))) return p.join(installPath, 'ComfyUI');
  if (fs.exists(p.join(installPath, 'main.py'))) return installPath;
  for (const name of fs.listDir(installPath)) {
    const sub = p.join(installPath, name);
    if (fs.isDir(p.join(sub, 'python_embeded')) && fs.exists(p.join(sub, 'ComfyUI', 'main.py'))) return p.join(sub, 'ComfyUI');
  }
  return null;
}

interface Folders {
  home: string;
  appData: string;
  localAppData: string;
  programFiles: string;
  /** Comfy Desktop data dirs (settings, installations, port-locks), newest naming first. */
  desktopDataDirs: string[];
  desktopStateDirs: string[];
  desktopExes: string[];
  legacyConfig: string[];
  legacyExes: string[];
  sharedModels: string[];
  portableRoots: string[];
  manualDirs: string[];
}

function folders(env: Env, platform: NodeJS.Platform): Folders {
  const p = pathApi(platform);
  if (platform === 'win32') {
    const home = envGet(env, 'USERPROFILE') ?? 'C:\\Users\\Default';
    const appData = envGet(env, 'APPDATA') ?? p.join(home, 'AppData', 'Roaming');
    const localAppData = envGet(env, 'LOCALAPPDATA') ?? p.join(home, 'AppData', 'Local');
    const programFiles = envGet(env, 'ProgramFiles') ?? 'C:\\Program Files';
    const desktopDataDirs = [p.join(appData, 'Comfy Desktop'), p.join(appData, 'comfyui-desktop-2')];
    return {
      home,
      appData,
      localAppData,
      programFiles,
      desktopDataDirs,
      desktopStateDirs: desktopDataDirs,
      desktopExes: [
        p.join(localAppData, 'Programs', 'Comfy Desktop', 'Comfy Desktop.exe'),
        p.join(localAppData, 'Programs', 'comfyui-desktop-2', 'Comfy Desktop.exe'),
        p.join(programFiles, 'Comfy Desktop', 'Comfy Desktop.exe'),
      ],
      legacyConfig: [p.join(appData, 'ComfyUI', 'config.json')],
      legacyExes: [p.join(localAppData, 'Programs', 'ComfyUI', 'ComfyUI.exe'), p.join(localAppData, 'Programs', '@comfyorgcomfyui-electron', 'ComfyUI.exe')],
      sharedModels: [p.join(localAppData, 'Comfy-Desktop', 'ComfyUI-Shared', 'models'), p.join(home, 'ComfyUI-Shared', 'models')],
      // Only C: and D: (local disks in practice): listing a disconnected network drive could block the daemon.
      portableRoots: [home, p.join(home, 'Desktop'), p.join(home, 'Downloads'), p.join(home, 'Documents'), 'C:\\', 'D:\\'],
      manualDirs: [p.join(home, 'ComfyUI'), p.join(home, 'Documents', 'ComfyUI'), p.join(home, 'Desktop', 'ComfyUI')],
    };
  }
  const home = envGet(env, 'HOME') ?? '/';
  if (platform === 'darwin') {
    const support = p.join(home, 'Library', 'Application Support');
    const desktopDataDirs = [p.join(support, 'Comfy Desktop'), p.join(support, 'comfyui-desktop-2')];
    return {
      home,
      appData: support,
      localAppData: support,
      programFiles: '/Applications',
      desktopDataDirs,
      desktopStateDirs: desktopDataDirs,
      desktopExes: ['/Applications/Comfy Desktop.app'],
      legacyConfig: [p.join(support, 'ComfyUI', 'config.json')],
      legacyExes: ['/Applications/ComfyUI.app'],
      sharedModels: [p.join(home, 'ComfyUI-Shared', 'models')],
      portableRoots: [],
      manualDirs: [p.join(home, 'ComfyUI'), p.join(home, 'Documents', 'ComfyUI')],
    };
  }
  const config = envGet(env, 'XDG_CONFIG_HOME') ?? p.join(home, '.config');
  const data = envGet(env, 'XDG_DATA_HOME') ?? p.join(home, '.local', 'share');
  const state = envGet(env, 'XDG_STATE_HOME') ?? p.join(home, '.local', 'state');
  return {
    home,
    appData: config,
    localAppData: data,
    programFiles: '/opt',
    desktopDataDirs: [p.join(config, 'comfyui-desktop-2'), p.join(data, 'comfyui-desktop-2')],
    desktopStateDirs: [p.join(state, 'comfyui-desktop-2')],
    desktopExes: ['/opt/Comfy Desktop/comfyui-desktop-2', '/usr/bin/comfyui-desktop-2'],
    legacyConfig: [p.join(config, 'ComfyUI', 'config.json')],
    legacyExes: [],
    sharedModels: [p.join(home, 'ComfyUI-Shared', 'models')],
    portableRoots: [],
    manualDirs: [p.join(home, 'ComfyUI')],
  };
}

function dedupe(list: string[], platform: NodeJS.Platform): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = platform === 'win32' ? item.toLowerCase().replace(/[\\/]+$/, '') : item.replace(/\/+$/, '');
    if (!item || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Installation described by a manually entered program path (integrations.setPath). */
export function installFromManualPath(fs: FsLike, manualPath: string, platform: NodeJS.Platform): ComfyInstall | null {
  if (!fs.exists(manualPath)) return null;
  const p = pathApi(platform);
  const base = p.basename(manualPath).toLowerCase();
  const dir = p.dirname(manualPath);
  let comfyDir: string | null = null;
  let kind: ComfyInstallKind = 'manual';
  if (base === 'main.py') comfyDir = dir;
  else if (base.endsWith('.bat') || base.endsWith('.cmd') || base.endsWith('.ps1')) {
    comfyDir = findComfyDir(fs, dir, platform);
    if (comfyDir && fs.isDir(p.join(dir, 'python_embeded'))) kind = 'portable';
  } else if (base.endsWith('.exe') || base.endsWith('.app')) {
    kind = /comfy desktop/i.test(base) ? 'desktop' : 'legacy_desktop';
    const bundled = p.join(dir, 'resources', 'ComfyUI');
    comfyDir = fs.exists(p.join(bundled, 'main.py')) ? bundled : null;
  }
  const modelsDir = comfyDir && isModelsFolder(fs, p.join(comfyDir, 'models'), platform) ? p.join(comfyDir, 'models') : null;
  return { kind, path: manualPath, comfyDir, modelsDir, version: comfyDir ? readComfyVersion(fs, comfyDir, platform) : null };
}

/** Finds ComfyUI installations, models folders and running Comfy Desktop ports on this PC. */
export function detectComfyLayouts(fs: FsLike, env: Env, platform: NodeJS.Platform, manualPath: string | null = null): ComfyLayouts {
  const p = pathApi(platform);
  const f = folders(env, platform);
  const installs: ComfyInstall[] = [];
  const modelsDirs: string[] = [];
  const ports: number[] = [];

  if (manualPath) {
    const manual = installFromManualPath(fs, manualPath, platform);
    if (manual) installs.push(manual);
  }

  // --- Comfy Desktop (current) -------------------------------------------------------------------------------
  let desktopFound = false;
  for (const dataDir of f.desktopDataDirs) {
    const settings = readJson(fs, p.join(dataDir, 'settings.json'));
    if (settings && typeof settings === 'object') {
      desktopFound = true;
      const dirs = (settings as { modelsDirs?: unknown }).modelsDirs;
      if (Array.isArray(dirs)) for (const d of dirs) if (typeof d === 'string' && d.trim()) modelsDirs.push(d.trim());
    }
    const records = readJson(fs, p.join(dataDir, 'installations.json'));
    if (Array.isArray(records)) {
      desktopFound = true;
      for (const rec of records) {
        const installPath = rec && typeof rec === 'object' ? (rec as { installPath?: unknown }).installPath : null;
        if (typeof installPath !== 'string' || !installPath.trim()) continue;
        const comfyDir = findComfyDir(fs, installPath, platform);
        if (!comfyDir) continue;
        const ownModels = p.join(comfyDir, 'models');
        installs.push({
          kind: 'desktop',
          path: p.join(comfyDir, 'main.py'),
          comfyDir,
          modelsDir: isModelsFolder(fs, ownModels, platform) ? ownModels : null,
          version: readComfyVersion(fs, comfyDir, platform),
        });
      }
    }
  }
  for (const stateDir of f.desktopStateDirs) {
    const lockDir = p.join(stateDir, 'port-locks');
    for (const name of fs.listDir(lockDir)) {
      const m = /^port-(\d{2,5})\.json$/i.exec(name);
      if (!m) continue;
      const port = Number(m[1]);
      if (port > 0 && port < 65536 && !ports.includes(port)) ports.push(port);
    }
  }
  for (const exe of f.desktopExes) {
    if (!fs.exists(exe)) continue;
    desktopFound = true;
    installs.push({ kind: 'desktop', path: exe, comfyDir: null, modelsDir: null, version: null });
    break;
  }
  if (desktopFound) modelsDirs.push(...f.sharedModels);

  // --- Legacy ComfyUI Desktop ---------------------------------------------------------------------------------
  let legacyModels: string | null = null;
  for (const cfgPath of f.legacyConfig) {
    const cfg = readJson(fs, cfgPath);
    const basePath = cfg && typeof cfg === 'object' ? (cfg as { basePath?: unknown }).basePath : null;
    if (typeof basePath === 'string' && basePath.trim()) {
      legacyModels = p.join(basePath.trim(), 'models');
      modelsDirs.push(legacyModels);
    }
  }
  for (const exe of f.legacyExes) {
    if (!fs.exists(exe)) continue;
    const bundled = platform === 'darwin' ? p.join(exe, 'Contents', 'Resources', 'ComfyUI') : p.join(p.dirname(exe), 'resources', 'ComfyUI');
    installs.push({
      kind: 'legacy_desktop',
      path: exe,
      comfyDir: fs.exists(p.join(bundled, 'main.py')) ? bundled : null,
      modelsDir: legacyModels && isModelsFolder(fs, legacyModels, platform) ? legacyModels : null,
      version: readComfyVersion(fs, bundled, platform),
    });
    break;
  }

  // --- Portable (Windows) -------------------------------------------------------------------------------------
  for (const root of f.portableRoots) {
    for (const name of fs.listDir(root)) {
      if (!/^ComfyUI[_ ]windows[_ ]portable/i.test(name)) continue;
      const dir = p.join(root, name);
      const comfyDir = p.join(dir, 'ComfyUI');
      if (!fs.exists(p.join(comfyDir, 'main.py'))) continue;
      const launcher = ['run_nvidia_gpu.bat', 'run_nvidia_gpu_fast_fp16_accumulation.bat', 'run_amd_gpu.bat', 'run_cpu.bat'].map((b) => p.join(dir, b)).find((b) => fs.exists(b));
      const models = p.join(comfyDir, 'models');
      installs.push({
        kind: 'portable',
        path: launcher ?? p.join(comfyDir, 'main.py'),
        comfyDir,
        modelsDir: isModelsFolder(fs, models, platform) ? models : null,
        version: readComfyVersion(fs, comfyDir, platform),
      });
    }
  }

  // --- Manual git clone ---------------------------------------------------------------------------------------
  for (const dir of f.manualDirs) {
    if (!fs.exists(p.join(dir, 'main.py'))) continue;
    const models = p.join(dir, 'models');
    installs.push({ kind: 'manual', path: p.join(dir, 'main.py'), comfyDir: dir, modelsDir: isModelsFolder(fs, models, platform) ? models : null, version: readComfyVersion(fs, dir, platform) });
  }

  for (const inst of installs) if (inst.modelsDir) modelsDirs.push(inst.modelsDir);
  const seen = new Set<string>();
  const uniqueInstalls = installs.filter((i) => {
    const key = platform === 'win32' ? i.path.toLowerCase() : i.path;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    installs: uniqueInstalls,
    modelsDirs: dedupe(modelsDirs, platform).filter((d) => isModelsFolder(fs, d, platform)),
    ports,
  };
}

/** Normalizes a user-entered engine address; only local addresses (localhost, 127.x, ::1) are accepted. */
export function normalizeEngineUrl(raw: string): string {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    throw new NovaError('VALIDATION', 'Die ComfyUI-Adresse ist ungültig. Beispiel: http://127.0.0.1:8188', { severity: 'warning' });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new NovaError('VALIDATION', 'Die ComfyUI-Adresse muss mit http:// beginnen.', { severity: 'warning' });
  }
  if (url.username || url.password) throw new NovaError('VALIDATION', 'Die ComfyUI-Adresse darf keine Zugangsdaten enthalten.', { severity: 'warning' });
  if (!isLocalEndpoint(url.toString())) {
    throw new NovaError('VALIDATION', 'Nur lokale Adressen sind erlaubt (localhost oder 127.0.0.1). NOVA schickt Bilder und Beschreibungen nie an fremde Rechner.', {
      severity: 'warning',
    });
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

/** Addresses to probe, in order. */
export function endpointCandidates(configured: string, ports: number[]): string[] {
  if (configured.trim()) return [normalizeEngineUrl(configured)];
  const list = [...ports.map((port) => `http://127.0.0.1:${port}`), DESKTOP_DEFAULT_URL, PORTABLE_DEFAULT_URL];
  return [...new Set(list)];
}

export interface EngineProbe {
  version: string | null;
  gpu: ThreeDEngineStatus['gpu'];
  supports3d: boolean;
}

/** Reads version and GPU from a /system_stats answer (tolerant: unknown fields are ignored). */
export function parseSystemStats(raw: unknown): { version: string | null; gpu: ThreeDEngineStatus['gpu'] } {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const system = obj.system && typeof obj.system === 'object' ? (obj.system as Record<string, unknown>) : {};
  const version = typeof system.comfyui_version === 'string' && system.comfyui_version.trim() ? system.comfyui_version.trim() : null;
  const devices = Array.isArray(obj.devices) ? (obj.devices as Array<Record<string, unknown>>) : [];
  const device = devices.find((d) => d && typeof d === 'object' && d.type !== 'cpu') ?? devices[0];
  let gpu: ThreeDEngineStatus['gpu'] = null;
  if (device && typeof device === 'object') {
    const rawName = typeof device.name === 'string' ? device.name : String(device.type ?? 'unbekannt');
    const name = rawName.replace(/^[a-z]+:\d+\s+/i, '').replace(/\s+:\s+\S+$/, '').trim() || rawName;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
    gpu = device.type === 'cpu' ? { name: 'Prozessor (keine Grafikkarte)', vramTotalBytes: null, vramFreeBytes: null } : { name, vramTotalBytes: num(device.vram_total), vramFreeBytes: num(device.vram_free) };
  }
  return { version, gpu };
}

export interface StatusFacts {
  platform: NodeJS.Platform;
  installed: boolean;
  running: boolean;
  baseUrl: string;
  configuredUrl: boolean;
  version: string | null;
  supports3d: boolean;
  modelsDir: string | null;
  /** settings.threeD.modelsDir is set but not usable. */
  modelsDirInvalid: boolean;
  /** At least one image → 3D model is completely installed. */
  generatorInstalled: boolean;
  gpu: ThreeDEngineStatus['gpu'];
}

/** German status line with the next step for the user. */
export function statusMessage(f: StatusFacts): string {
  if (!f.running) {
    const where = f.configuredUrl ? ` unter ${f.baseUrl}` : ' (geprüft: 127.0.0.1:8000 und 127.0.0.1:8188)';
    if (!f.installed) {
      return f.platform === 'win32'
        ? `ComfyUI wurde nicht gefunden und ist nicht erreichbar${where}. Die 3D-Werkstatt braucht das kostenlose Programm ComfyUI: unter „Werkzeuge“ installieren (winget install -e --id Comfy.ComfyUI-Desktop) oder von https://www.comfy.org/download laden. Danach ComfyUI starten.`
        : `ComfyUI wurde nicht gefunden und ist nicht erreichbar${where}. Bitte ComfyUI von https://www.comfy.org/download installieren und starten.`;
    }
    return `ComfyUI ist installiert, aber nicht erreichbar${where}. Bitte ComfyUI starten und warten, bis die Oberfläche geladen ist.${
      f.configuredUrl ? ' Falls ComfyUI unter einer anderen Adresse läuft, die Adresse in den Einstellungen der 3D-Werkstatt anpassen.' : ''
    }`;
  }
  const head = `ComfyUI ${f.version ?? '(Version unbekannt)'} läuft unter ${f.baseUrl}.`;
  if (!f.supports3d) {
    return `${head} Diese Version kennt die 3D-Bausteine (TRELLIS.2, Pixal3D) noch nicht. Bitte ComfyUI aktualisieren (Comfy Desktop: Einstellungen → Updates; portable Version: update\\update_comfyui.bat) und neu starten.`;
  }
  if (f.modelsDirInvalid) return `${head} Der eingestellte Modellordner ist kein ComfyUI-Modellordner. Bitte in den Einstellungen der 3D-Werkstatt den Ordner „models“ von ComfyUI wählen.`;
  if (!f.modelsDir) return `${head} Der Modellordner von ComfyUI wurde nicht gefunden. Bitte in den Einstellungen der 3D-Werkstatt den Ordner „models“ von ComfyUI wählen.`;
  if (!f.generatorInstalled) return `${head} Es ist noch kein 3D-Modell installiert. Bitte unter „Modelle“ → „3D-Modelle“ TRELLIS.2 herunterladen (etwa 9 GB).`;
  const cpu = f.gpu && f.gpu.vramTotalBytes === null ? ' Achtung: ComfyUI rechnet ohne Grafikkarte – das ist sehr langsam oder wird nicht unterstützt.' : '';
  return `${head} Die 3D-Werkstatt ist bereit.${cpu}`;
}
