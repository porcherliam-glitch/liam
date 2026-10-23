// Built-in integration modules for game engines: unity, unreal, godot (SPEC §4.9, §6.9).
// Key decisions:
// - ALL installations are reported, newest first, de-duplicated by canonical path:
//   Unity: Hub editor folder (%ProgramFiles%\Unity\Hub\Editor\<ver>\Editor\Unity.exe), the Hub's secondary install path
//   (%APPDATA%\UnityHub\secondaryInstallPath.json), editors-v2.json / editors.json (manually added editors) and a
//   legacy %ProgramFiles%\Unity\Editor install. Versions come from folder names / Hub JSON (Unity order a < b < rc < f < p).
//   Unreal: %ProgramData%\Epic\UnrealEngineLauncher\LauncherInstalled.dat + %ProgramFiles%\Epic Games\UE_*;
//   UnrealEditor.exe (UE5) or UE4Editor.exe (UE4); version from Engine\Build\Build.version.
//   Godot: PATH (godot, godot4), WinGet Links + Packages, Steam, %LOCALAPPDATA%\Programs; version from the official file
//   name (Godot_v4.2.1-stable_win64.exe) or `--version`; *_console.exe helpers are skipped.
// - open(): Unity uses exactly the editor of project.config.engineVersion (TOOL_MISSING otherwise – opening a project
//   with another editor version can upgrade it irreversibly); Unreal picks the engine of the .uproject's
//   EngineAssociation; Godot needs project.godot.
import type { IntegrationModule } from '../contracts';
import { NovaError } from '../core/errors';
import {
  compareUnityVersions,
  compareVersions,
  dedupeInstallations,
  firstVersion,
  homeDir,
  pathFor,
  readJson,
  sortInstallations,
  unityVersionIn,
  uniquePaths,
  winFolders,
  type DetectResult,
  type Installation,
  type ModuleDeps,
} from './helpers';
import { installHint } from './modules-tools';

const UNKNOWN = 'unbekannt';

function manualMissingNote(manualPath: string | null, deps: ModuleDeps): string {
  return manualPath && !deps.fs.exists(manualPath) ? `Der eingetragene Pfad wurde nicht gefunden (${manualPath}). ` : '';
}

function moreText(n: number): string {
  if (n <= 0) return '';
  return n === 1 ? ' (und 1 weitere Version)' : ` (und ${n} weitere Versionen)`;
}

// ---------------------------------------------------------------------------------------------------------- Unity

export function unityModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'unity',
    name: 'Unity',
    category: 'engine',
    async detect(ctx) {
      const fs = deps.fs;
      const p = pathFor(ctx.platform);
      const found: Installation[] = [];
      const add = (version: string | null, exe: string) => {
        if (fs.exists(exe)) found.push({ version: version ?? unityVersionIn(exe) ?? UNKNOWN, path: exe });
      };
      let hubDirs: string[];
      let configDir: string;
      let hubApp: string | null;
      let editorExe: (root: string) => string;
      if (ctx.platform === 'win32') {
        const w = winFolders(ctx.env);
        hubDirs = [p.join(w.programFiles, 'Unity', 'Hub', 'Editor')];
        configDir = p.join(w.appData, 'UnityHub');
        hubApp = p.join(w.programFiles, 'Unity Hub', 'Unity Hub.exe');
        editorExe = (root) => p.join(root, 'Editor', 'Unity.exe');
        add(UNKNOWN, p.join(w.programFiles, 'Unity', 'Editor', 'Unity.exe'));
      } else if (ctx.platform === 'darwin') {
        const home = homeDir(ctx.env);
        hubDirs = ['/Applications/Unity/Hub/Editor'];
        configDir = p.join(home, 'Library', 'Application Support', 'UnityHub');
        hubApp = '/Applications/Unity Hub.app';
        editorExe = (root) => p.join(root, 'Unity.app', 'Contents', 'MacOS', 'Unity');
      } else {
        const home = homeDir(ctx.env);
        hubDirs = [p.join(home, 'Unity', 'Hub', 'Editor')];
        configDir = p.join(home, '.config', 'UnityHub');
        hubApp = await ctx.findExecutable('unityhub');
        editorExe = (root) => p.join(root, 'Editor', 'Unity');
      }
      const secondary = readJson(fs, p.join(configDir, 'secondaryInstallPath.json'));
      if (typeof secondary === 'string' && secondary.trim()) hubDirs.push(secondary.trim());
      for (const dir of hubDirs) {
        for (const name of fs.listDir(dir)) add(unityVersionIn(name) ?? name, editorExe(p.join(dir, name)));
      }
      for (const file of ['editors-v2.json', 'editors.json']) {
        const data = readJson(fs, p.join(configDir, file));
        if (!data || typeof data !== 'object') continue;
        const list = Array.isArray((data as { data?: unknown }).data) ? ((data as { data: unknown[] }).data) : Object.values(data as Record<string, unknown>);
        for (const entry of list) {
          if (!entry || typeof entry !== 'object') continue;
          const e = entry as { version?: unknown; location?: unknown };
          const locations = Array.isArray(e.location) ? e.location : typeof e.location === 'string' ? [e.location] : [];
          for (const loc of locations) {
            if (typeof loc !== 'string' || !loc) continue;
            let exe = loc;
            if (/\.app$/i.test(loc)) exe = p.join(loc, 'Contents', 'MacOS', 'Unity');
            else if (fs.isDir(loc)) exe = editorExe(loc);
            add(typeof e.version === 'string' ? e.version : null, exe);
          }
        }
      }
      const manual = ctx.manualPath && fs.exists(ctx.manualPath) ? { version: unityVersionIn(ctx.manualPath) ?? UNKNOWN, path: ctx.manualPath } : null;
      if (manual) found.push(manual);
      const installations = sortInstallations(dedupeInstallations(found, ctx.platform, fs), compareUnityVersions);
      const note = manualMissingNote(ctx.manualPath, deps);
      if (installations.length === 0) {
        const hub = hubApp && fs.exists(hubApp);
        return {
          available: false,
          version: null,
          path: null,
          message: hub
            ? `${note}Der Unity Hub ist installiert, aber kein Unity-Editor. Bitte im Unity Hub einen Editor installieren.`
            : `${note}Unity wurde nicht gefunden. Unity-Editoren werden über den Unity Hub installiert.`,
          installations: [],
        };
      }
      const primary = manual ?? installations[0];
      return {
        available: true,
        version: primary.version === UNKNOWN ? null : primary.version,
        path: primary.path,
        message: `${note}Unity ist installiert: ${primary.version === UNKNOWN ? 'Version unbekannt' : primary.version}${moreText(installations.length - 1)}.`,
        installations,
      };
    },
    installHint: (platform) => installHint('unity', platform, 'https://unity.com/download'),
    open: ({ executable, projectRoot, engineVersion, installations }) => {
      let file = executable;
      if (engineVersion) {
        const match = installations.find((i) => i.version.toLowerCase() === engineVersion.toLowerCase());
        if (!match) {
          throw new NovaError('TOOL_MISSING', `Unity ${engineVersion} ist nicht installiert. Bitte diese Version im Unity Hub installieren – ein anderer Editor könnte das Projekt umwandeln.`, {
            severity: 'warning',
            userAction: `Im Unity Hub die Editor-Version ${engineVersion} installieren.`,
          });
        }
        file = match.path;
      }
      return { file, args: ['-projectPath', projectRoot] };
    },
  };
}

// --------------------------------------------------------------------------------------------------------- Unreal

function unrealVersion(deps: ModuleDeps, platform: NodeJS.Platform, root: string, hint: string | null): string {
  const p = pathFor(platform);
  const build = readJson(deps.fs, p.join(root, 'Engine', 'Build', 'Build.version'));
  if (build && typeof build === 'object') {
    const b = build as { MajorVersion?: unknown; MinorVersion?: unknown; PatchVersion?: unknown };
    if (typeof b.MajorVersion === 'number' && typeof b.MinorVersion === 'number') {
      return `${b.MajorVersion}.${b.MinorVersion}.${typeof b.PatchVersion === 'number' ? b.PatchVersion : 0}`;
    }
  }
  if (hint) {
    const v = /(\d+\.\d+(?:\.\d+)?)/.exec(hint);
    if (v) return v[1];
  }
  const dir = /UE_(\d+\.\d+(?:\.\d+)?)/i.exec(p.basename(root));
  return dir ? dir[1] : UNKNOWN;
}

function unrealEditorIn(deps: ModuleDeps, platform: NodeJS.Platform, root: string): string | null {
  const p = pathFor(platform);
  const candidates =
    platform === 'win32'
      ? [p.join(root, 'Engine', 'Binaries', 'Win64', 'UnrealEditor.exe'), p.join(root, 'Engine', 'Binaries', 'Win64', 'UE4Editor.exe')]
      : platform === 'darwin'
        ? [
            p.join(root, 'Engine', 'Binaries', 'Mac', 'UnrealEditor.app', 'Contents', 'MacOS', 'UnrealEditor'),
            p.join(root, 'Engine', 'Binaries', 'Mac', 'UE4Editor.app', 'Contents', 'MacOS', 'UE4Editor'),
          ]
        : [p.join(root, 'Engine', 'Binaries', 'Linux', 'UnrealEditor'), p.join(root, 'Engine', 'Binaries', 'Linux', 'UE4Editor')];
  return candidates.find((c) => deps.fs.exists(c)) ?? null;
}

export function unrealModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'unreal',
    name: 'Unreal Engine',
    category: 'engine',
    async detect(ctx) {
      const fs = deps.fs;
      const p = pathFor(ctx.platform);
      const roots: Array<{ root: string; hint: string | null }> = [];
      if (ctx.platform === 'win32') {
        const w = winFolders(ctx.env);
        const launcher = readJson(fs, p.join(w.programData, 'Epic', 'UnrealEngineLauncher', 'LauncherInstalled.dat'));
        const list = launcher && typeof launcher === 'object' ? (launcher as { InstallationList?: unknown }).InstallationList : null;
        if (Array.isArray(list)) {
          for (const item of list) {
            const it = item as { InstallLocation?: unknown; AppName?: unknown; AppVersion?: unknown };
            if (typeof it.InstallLocation !== 'string' || typeof it.AppName !== 'string' || !/^UE_/i.test(it.AppName)) continue;
            roots.push({ root: it.InstallLocation, hint: typeof it.AppVersion === 'string' ? it.AppVersion : it.AppName });
          }
        }
        const epic = p.join(w.programFiles, 'Epic Games');
        for (const name of fs.listDir(epic)) if (/^UE_\d/i.test(name)) roots.push({ root: p.join(epic, name), hint: name });
      } else if (ctx.platform === 'darwin') {
        const shared = '/Users/Shared/Epic Games';
        for (const name of fs.listDir(shared)) if (/^UE_\d/i.test(name)) roots.push({ root: p.join(shared, name), hint: name });
      }
      const found: Installation[] = [];
      for (const { root, hint } of roots) {
        const exe = unrealEditorIn(deps, ctx.platform, root);
        if (exe) found.push({ version: unrealVersion(deps, ctx.platform, root, hint), path: exe });
      }
      if (ctx.platform === 'linux') {
        const onPath = await ctx.findExecutable('UnrealEditor');
        if (onPath) found.push({ version: unrealVersion(deps, 'linux', p.resolve(p.dirname(onPath), '..', '..', '..'), null), path: onPath });
      }
      let manual: Installation | null = null;
      if (ctx.manualPath && fs.exists(ctx.manualPath)) {
        // <root>\Engine\Binaries\Win64\UnrealEditor.exe → <root>
        const root = p.dirname(p.dirname(p.dirname(p.dirname(ctx.manualPath))));
        manual = { version: unrealVersion(deps, ctx.platform, root, ctx.manualPath), path: ctx.manualPath };
        found.push(manual);
      }
      const installations = sortInstallations(dedupeInstallations(found, ctx.platform, fs));
      const note = manualMissingNote(ctx.manualPath, deps);
      if (installations.length === 0) {
        return {
          available: false,
          version: null,
          path: null,
          message: `${note}Unreal Engine wurde nicht gefunden. Unreal wird über den Epic Games Launcher installiert.`,
          installations: [],
        };
      }
      const primary = manual ?? installations[0];
      return {
        available: true,
        version: primary.version === UNKNOWN ? null : primary.version,
        path: primary.path,
        message: `${note}Unreal Engine ist installiert: ${primary.version === UNKNOWN ? 'Version unbekannt' : primary.version}${moreText(installations.length - 1)}.`,
        installations,
      };
    },
    installHint: () => ({ command: null, url: 'https://www.unrealengine.com/download', requiresAdmin: false }),
    open: ({ executable, projectRoot, file, engineVersion, installations }) => {
      const p = pathFor(deps.platform);
      let uproject = file && /\.uproject$/i.test(file) ? file : null;
      if (!uproject) {
        const name = deps.fs.listDir(projectRoot).find((n) => /\.uproject$/i.test(n));
        if (name) uproject = p.join(projectRoot, name);
      }
      if (!uproject) throw new NovaError('VALIDATION', 'Im Projektordner wurde keine .uproject-Datei gefunden.', { severity: 'warning' });
      const data = readJson(deps.fs, uproject);
      const assoc = data && typeof data === 'object' && typeof (data as { EngineAssociation?: unknown }).EngineAssociation === 'string' ? (data as { EngineAssociation: string }).EngineAssociation : null;
      const wanted = engineVersion ?? (assoc && /^\d+\.\d+/.test(assoc) ? assoc : null);
      let exe = executable;
      if (wanted) {
        const match = installations.find((i) => i.version === wanted || i.version.startsWith(`${wanted}.`));
        if (!match) {
          throw new NovaError('TOOL_MISSING', `Unreal Engine ${wanted} ist nicht installiert. Bitte diese Version im Epic Games Launcher installieren.`, {
            severity: 'warning',
            userAction: `Unreal Engine ${wanted} im Epic Games Launcher installieren.`,
          });
        }
        exe = match.path;
      }
      return { file: exe, args: [uproject] };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------- Godot

const GODOT_STATUS = '(stable|beta\\d*|rc\\d*|dev\\d*|alpha\\d*)';

/** "Godot_v4.2.1-stable_win64.exe" → "4.2.1-stable". */
export function godotVersionFromName(name: string): string | null {
  const m = new RegExp(`godot[_-]?v(\\d+\\.\\d+(?:\\.\\d+)?)(?:[-_.]${GODOT_STATUS})?`, 'i').exec(name);
  if (!m) return null;
  return m[2] ? `${m[1]}-${m[2].toLowerCase()}` : m[1];
}

/** `godot --version` → "4.2.1.stable.official.b09f793f5" → "4.2.1-stable". */
export function godotVersionFromOutput(out: string): string | null {
  const line = out.split(/\r?\n/).map((l) => l.trim()).find((l) => /^\d+\.\d+/.test(l));
  if (!line) return null;
  const m = new RegExp(`^(\\d+\\.\\d+(?:\\.\\d+)?)\\.${GODOT_STATUS}`, 'i').exec(line);
  if (m) return `${m[1]}-${m[2].toLowerCase()}`;
  return firstVersion(line);
}

/** Steam root plus every library listed in steamapps/libraryfolders.vdf (Valve KeyValues, not localized). */
export function steamLibraries(fs: ModuleDeps['fs'], steamRoot: string, platform: NodeJS.Platform): string[] {
  const p = pathFor(platform);
  const libs = [steamRoot];
  const vdf = fs.readText(p.join(steamRoot, 'steamapps', 'libraryfolders.vdf'), 1024 * 1024);
  if (vdf) {
    const re = /"path"\s+"((?:[^"\\]|\\.)+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(vdf))) libs.push(m[1].replace(/\\\\/g, '\\'));
  }
  return uniquePaths(libs, platform);
}

function isGodotBinary(name: string, platform: NodeJS.Platform): boolean {
  if (/console/i.test(name)) return false;
  if (platform === 'win32') return /^godot.*\.exe$/i.test(name);
  return /^godot/i.test(name) && !/\.(zip|txt|pck|so|dylib)$/i.test(name);
}

export function godotModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'godot',
    name: 'Godot',
    category: 'engine',
    async detect(ctx) {
      const fs = deps.fs;
      const p = pathFor(ctx.platform);
      const cands: Array<string | null> = [await ctx.findExecutable('godot'), await ctx.findExecutable('godot4')];
      const binariesIn = (dir: string) =>
        fs
          .listDir(dir)
          .filter((n) => isGodotBinary(n, ctx.platform))
          .map((n) => p.join(dir, n))
          .filter((f) => !fs.isDir(f));
      if (ctx.platform === 'win32') {
        const w = winFolders(ctx.env);
        const links = p.join(w.localAppData, 'Microsoft', 'WinGet', 'Links');
        for (const n of ['godot.exe', 'godot4.exe']) if (fs.exists(p.join(links, n))) cands.push(p.join(links, n));
        const pkgs = p.join(w.localAppData, 'Microsoft', 'WinGet', 'Packages');
        for (const d of fs.listDir(pkgs)) if (/^GodotEngine\.GodotEngine/i.test(d)) cands.push(...binariesIn(p.join(pkgs, d)));
        for (const lib of steamLibraries(fs, p.join(w.programFilesX86, 'Steam'), 'win32')) cands.push(...binariesIn(p.join(lib, 'steamapps', 'common', 'Godot Engine')));
        const programs = p.join(w.localAppData, 'Programs');
        for (const d of fs.listDir(programs)) {
          if (!/^godot/i.test(d)) continue;
          const full = p.join(programs, d);
          if (fs.isDir(full)) cands.push(...binariesIn(full));
          else if (isGodotBinary(d, 'win32')) cands.push(full);
        }
      } else {
        const home = homeDir(ctx.env);
        for (const lib of steamLibraries(fs, p.join(home, '.local', 'share', 'Steam'), ctx.platform)) cands.push(...binariesIn(p.join(lib, 'steamapps', 'common', 'Godot Engine')));
        if (ctx.platform === 'darwin' && fs.exists('/Applications/Godot.app/Contents/MacOS/Godot')) cands.push('/Applications/Godot.app/Contents/MacOS/Godot');
      }
      const manualPath = ctx.manualPath && fs.exists(ctx.manualPath) ? ctx.manualPath : null;
      const found: Installation[] = [];
      for (const exe of uniquePaths([manualPath, ...cands], ctx.platform)) {
        let version = godotVersionFromName(p.basename(exe)) ?? godotVersionFromName(p.basename(fs.realpath(exe)));
        if (!version) {
          const r = await ctx.run(exe, ['--version'], 10_000);
          if (r.code === 0) version = godotVersionFromOutput(r.stdout);
        }
        found.push({ version: version ?? UNKNOWN, path: exe });
      }
      const deduped = dedupeInstallations(found, ctx.platform, fs);
      const installations = sortInstallations(deduped, compareVersions);
      const note = manualMissingNote(ctx.manualPath, deps);
      if (installations.length === 0) {
        return { available: false, version: null, path: null, message: `${note}Godot wurde nicht gefunden. Godot wird für Godot-Spieleprojekte benötigt.`, installations: [] };
      }
      const primary = (manualPath && installations.find((i) => i.path === manualPath)) || installations[0];
      return {
        available: true,
        version: primary.version === UNKNOWN ? null : primary.version,
        path: primary.path,
        message: `${note}Godot ist installiert: ${primary.version === UNKNOWN ? 'Version unbekannt' : primary.version}${moreText(installations.length - 1)}.`,
        installations,
      } satisfies DetectResult;
    },
    installHint: (platform) => installHint('godot', platform, 'https://godotengine.org/download'),
    open: ({ executable, projectRoot }) => {
      const p = pathFor(deps.platform);
      if (!deps.fs.exists(p.join(projectRoot, 'project.godot'))) {
        throw new NovaError('VALIDATION', 'Im Projektordner wurde keine Datei „project.godot“ gefunden.', { severity: 'warning' });
      }
      return { file: executable, args: ['--editor', '--path', projectRoot] };
    },
  };
}
