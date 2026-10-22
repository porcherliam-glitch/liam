// Tests for the built-in integration modules with recorded tool outputs and simulated Windows layouts
// (in-memory file system, path.win32), plus the version/winget helpers.
import { describe, expect, it } from 'vitest';
import { BUILTIN_INTEGRATIONS } from '@shared/schemas';
import { NovaError } from '../core/errors';
import { createBuiltinModules } from './builtins';
import { compareUnityVersions, compareVersions, firstVersion, sortInstallations, type ModuleDeps } from './helpers';
import {
  PLAYWRIGHT_PROJECT_MESSAGE,
  PS_VERSION_ARGS,
  dotnetModule,
  gitModule,
  npmModule,
  ollamaModule,
  playwrightModule,
  powershellModule,
  pythonModule,
  vscodeModule,
  windowsTerminalModule,
  wingetModule,
} from './modules-tools';
import { godotModule, godotVersionFromName, godotVersionFromOutput, steamLibraries, unityModule, unrealModule } from './modules-engines';
import { WINGET_EXIT, interpretWingetExit, wingetCommand, wingetCommandFor } from './winget';
import { detectCtx, memFs, scriptedRun } from './test-helpers';

const deps = (platform: NodeJS.Platform, files: Record<string, string> = {}, realpaths: Record<string, string> = {}): ModuleDeps & { fs: ReturnType<typeof memFs> } => ({
  platform,
  fs: memFs(platform, files, realpaths),
});

describe('helpers', () => {
  it('parses and compares versions', () => {
    expect(firstVersion('git version 2.43.0.windows.1', 3)).toBe('2.43.0');
    expect(firstVersion('dotnet 8.0.404.1 x', 3)).toBe('8.0.404.1');
    expect(firstVersion('PowerShell 7.4')).toBe('7.4');
    expect(firstVersion('kein Treffer')).toBeNull();
    expect(compareVersions('10.0.1', '9.9.9')).toBeGreaterThan(0);
    expect(compareVersions('4.3-stable', '4.2.2-stable')).toBeGreaterThan(0);
    expect(compareVersions('1.2', '1.2.0')).toBeLessThan(0);
    expect(compareUnityVersions('2023.1.0b5', '2023.1.0f1')).toBeLessThan(0);
    expect(compareUnityVersions('2023.1.0p1', '2023.1.0f1')).toBeGreaterThan(0);
    expect(compareUnityVersions('6000.0.1f1', '2022.3.50f1')).toBeGreaterThan(0);
    expect(compareUnityVersions('2022.3.10f2', '2022.3.10f1')).toBeGreaterThan(0);
    expect(sortInstallations([{ version: 'unbekannt', path: 'a' }, { version: '1.0', path: 'b' }, { version: '2.0', path: 'c' }]).map((i) => i.path)).toEqual(['c', 'b', 'a']);
  });

  it('builds the exact winget commands and judges exit codes numerically', () => {
    expect(wingetCommandFor('git')).toBe('winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity');
    expect(wingetCommandFor('python')).toBe(
      'winget install --id Python.Python.3.12 -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity --scope user',
    );
    expect(wingetCommandFor('vscode')).toContain('--id Microsoft.VisualStudioCode -e');
    expect(wingetCommandFor('unreal')).toBeNull();
    expect(wingetCommandFor('playwright')).toBeNull();
    expect(() => wingetCommand({ id: 'Bad Id & calc', userScope: false, requiresAdmin: false })).toThrow();
    expect(interpretWingetExit(0)).toMatchObject({ ok: true, rebootRequired: false });
    expect(interpretWingetExit(WINGET_EXIT.PACKAGE_ALREADY_INSTALLED | 0)).toMatchObject({ ok: true }); // signed int32 form
    expect(interpretWingetExit(WINGET_EXIT.PACKAGE_ALREADY_INSTALLED)).toMatchObject({ ok: true });
    expect(interpretWingetExit(WINGET_EXIT.REBOOT_REQUIRED_TO_FINISH)).toMatchObject({ ok: true, rebootRequired: true });
    expect(interpretWingetExit(1602).message).toContain('abgebrochen');
    expect(interpretWingetExit(WINGET_EXIT.NO_APPLICATIONS_FOUND)).toMatchObject({ ok: false, message: 'Das Paket wurde in der winget-Quelle nicht gefunden.' });
    expect(interpretWingetExit(0x8a15ffff).message).toBe('winget meldet einen Fehler (Code 0x8A15FFFF).');
    expect(interpretWingetExit(null, { timedOut: true }).message).toContain('zu lange');
    expect(interpretWingetExit(0, { cancelled: true }).ok).toBe(false);
  });

  it('registers one module per built-in id in order, each with a German install hint', () => {
    const mods = createBuiltinModules(deps('win32'));
    expect(mods.map((m) => m.id)).toEqual([...BUILTIN_INTEGRATIONS]);
    const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
    expect(byId.node.installHint('win32')).toEqual({
      command: 'winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --disable-interactivity',
      url: 'https://nodejs.org/',
      requiresAdmin: true,
    });
    expect(byId.node.installHint('linux')).toEqual({ command: null, url: 'https://nodejs.org/', requiresAdmin: false });
    expect(byId.unreal.installHint('win32')).toMatchObject({ command: null, url: expect.stringContaining('unrealengine.com') });
    for (const id of ['git', 'dotnet', 'powershell', 'windows_terminal', 'ollama', 'unity', 'godot', 'vscode']) {
      expect(byId[id].installHint('win32')?.command).toContain('winget install --id');
    }
    expect(mods.filter((m) => typeof m.open === 'function').map((m) => m.id).sort()).toEqual(['godot', 'unity', 'unreal', 'vscode', 'windows_terminal']);
  });
});

describe('git / node / npm / dotnet / ollama', () => {
  it('git: PATH + version, Windows default folder, broken install, missing, missing manual path', async () => {
    const lin = scriptedRun({ '/usr/bin/git --version': { code: 0, stdout: 'git version 2.43.0\n' } });
    expect(await gitModule(deps('linux')).detect(detectCtx('linux', { run: lin.run, which: { git: '/usr/bin/git' } }))).toEqual({
      available: true,
      version: '2.43.0',
      path: '/usr/bin/git',
      message: 'Git 2.43.0 ist installiert.',
      installations: [{ version: '2.43.0', path: '/usr/bin/git' }],
    });
    const winExe = 'C:\\Program Files\\Git\\cmd\\git.exe';
    const win = scriptedRun({ [`${winExe} --version`]: { code: 0, stdout: 'git version 2.47.1.windows.1\r\n' } });
    const r = await gitModule(deps('win32', { [winExe]: '' })).detect(detectCtx('win32', { run: win.run }));
    expect(r).toMatchObject({ available: true, version: '2.47.1', path: winExe });

    const broken = scriptedRun({ '/usr/bin/git --version': { code: 1, stderr: 'fatal' } });
    const b = await gitModule(deps('linux')).detect(detectCtx('linux', { run: broken.run, which: { git: '/usr/bin/git' } }));
    expect(b.available).toBe(false);
    expect(b.message).toContain('antwortet aber nicht');

    const missing = await gitModule(deps('linux')).detect(detectCtx('linux', { manualPath: '/opt/git/bin/git' }));
    expect(missing.available).toBe(false);
    expect(missing.message).toBe(
      'Der eingetragene Pfad wurde nicht gefunden (/opt/git/bin/git). Git wurde nicht gefunden. Git wird für Versionsverwaltung, Wiederherstellungspunkte und den Import von Projekten benötigt.',
    );
  });

  it('git: a working manual path wins over PATH', async () => {
    const run = scriptedRun({
      '/opt/git/bin/git --version': { code: 0, stdout: 'git version 2.40.1' },
      '/usr/bin/git --version': { code: 0, stdout: 'git version 2.43.0' },
    });
    const r = await gitModule(deps('linux', { '/opt/git/bin/git': '' })).detect(detectCtx('linux', { run: run.run, which: { git: '/usr/bin/git' }, manualPath: '/opt/git/bin/git' }));
    expect(r).toMatchObject({ version: '2.40.1', path: '/opt/git/bin/git' });
  });

  it('npm on Windows uses npm.cmd and falls back to the package.json next to the shim', async () => {
    const shim = 'C:\\Program Files\\nodejs\\npm.cmd';
    const d = deps('win32', { [shim]: '', 'C:\\Program Files\\nodejs\\node_modules\\npm\\package.json': '{"name":"npm","version":"10.9.2"}' });
    const r = await npmModule(d).detect(detectCtx('win32', { which: { 'npm.cmd': shim } }));
    expect(r).toMatchObject({ available: true, version: '10.9.2', path: shim });
    const ok = scriptedRun({ [`${shim} --version`]: { code: 0, stdout: '10.8.1\r\n' } });
    expect((await npmModule(d).detect(detectCtx('win32', { run: ok.run, which: { 'npm.cmd': shim } }))).version).toBe('10.8.1');
    expect(ok.calls[0]).toEqual({ file: shim, args: ['--version'] });
  });

  it('dotnet lists all SDKs newest first and explains a runtime-only install', async () => {
    const run = scriptedRun({
      '/usr/bin/dotnet --version': { code: 0, stdout: '8.0.404\n' },
      '/usr/bin/dotnet --list-sdks': { code: 0, stdout: '6.0.428 [/usr/share/dotnet/sdk]\n8.0.404 [/usr/share/dotnet/sdk]\n' },
    });
    const r = await dotnetModule(deps('linux')).detect(detectCtx('linux', { run: run.run, which: { dotnet: '/usr/bin/dotnet' } }));
    expect(r).toMatchObject({ available: true, version: '8.0.404', message: '.NET SDK 8.0.404 ist installiert.' });
    expect(r.installations.map((i) => i.version)).toEqual(['8.0.404', '6.0.428']);
    const runtimeOnly = scriptedRun({ '/usr/bin/dotnet --version': { code: 145, stderr: 'No .NET SDKs were found.' } });
    const r2 = await dotnetModule(deps('linux')).detect(detectCtx('linux', { run: runtimeOnly.run, which: { dotnet: '/usr/bin/dotnet' } }));
    expect(r2.available).toBe(false);
    expect(r2.message).toContain('kein .NET SDK installiert');
  });

  it('ollama parses the version also when the server is not running', async () => {
    const exe = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Ollama\\ollama.exe';
    const run = scriptedRun({ [`${exe} --version`]: { code: 0, stdout: 'Warning: could not connect to a running Ollama instance\r\nWarning: client version is 0.5.7\r\n' } });
    const r = await ollamaModule(deps('win32', { [exe]: '' })).detect(detectCtx('win32', { run: run.run }));
    expect(r).toMatchObject({ available: true, version: '0.5.7', path: exe });
    expect(r.message).toContain('Ollama 0.5.7 ist installiert');
  });
});

describe('python / powershell / windows terminal / vscode / playwright / winget', () => {
  it('python on Windows skips the Microsoft Store placeholder and resolves the py launcher to the real python.exe', async () => {
    const stub = 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe';
    const real = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Python\\Python312\\python.exe';
    const run = scriptedRun({
      'where.exe python': { code: 0, stdout: `${stub}\r\n` },
      [`${stub} --version`]: { code: 9009, stdout: '' },
      'C:\\Windows\\py.exe -3 --version': { code: 0, stdout: 'Python 3.12.4\r\n' },
      'C:\\Windows\\py.exe -3 -c import sys; print(sys.executable)': { code: 0, stdout: `${real}\r\n` },
    });
    const r = await pythonModule(deps('win32', { [real]: '' })).detect(detectCtx('win32', { run: run.run, which: { py: 'C:\\Windows\\py.exe' } }));
    expect(r).toMatchObject({ available: true, version: '3.12.4', path: real });

    const onlyStub = scriptedRun({ 'where.exe python': { code: 0, stdout: `${stub}\r\n` }, [`${stub} --version`]: { code: 9009 } });
    const r2 = await pythonModule(deps('win32')).detect(detectCtx('win32', { run: onlyStub.run }));
    expect(r2.available).toBe(false);
    expect(r2.message).toContain('Microsoft Store');

    const programs = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Python\\Python311\\python.exe';
    const viaFolder = scriptedRun({ [`${programs} --version`]: { code: 0, stdout: 'Python 3.11.9' } });
    expect((await pythonModule(deps('win32', { [programs]: '' })).detect(detectCtx('win32', { run: viaFolder.run }))).path).toBe(programs);
  });

  it('python on Linux prefers python3 and ignores Python 2', async () => {
    const run = scriptedRun({ '/usr/bin/python --version': { code: 0, stderr: 'Python 2.7.18' }, '/usr/bin/python3 --version': { code: 0, stdout: 'Python 3.11.2' } });
    const r = await pythonModule(deps('linux')).detect(detectCtx('linux', { run: run.run, which: { python3: '/usr/bin/python3', python: '/usr/bin/python' } }));
    expect(r).toMatchObject({ version: '3.11.2', path: '/usr/bin/python3' });
    const py2 = await pythonModule(deps('linux')).detect(detectCtx('linux', { run: run.run, which: { python: '/usr/bin/python' } }));
    expect(py2.available).toBe(false);
  });

  it('powershell reports Windows PowerShell (primary) and PowerShell 7 as installations', async () => {
    const winPs = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
    const pwsh = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
    const run = scriptedRun({
      [`${winPs} ${PS_VERSION_ARGS.join(' ')}`]: { code: 0, stdout: '5.1.22621.4391\r\n' },
      [`${pwsh} ${PS_VERSION_ARGS.join(' ')}`]: { code: 0, stdout: '7.4.6\r\n' },
    });
    const r = await powershellModule(deps('win32', { [winPs]: '', [pwsh]: '' })).detect(
      detectCtx('win32', { run: run.run, which: { powershell: 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' } }),
    );
    expect(r).toMatchObject({ available: true, version: '5.1.22621.4391', path: winPs, message: 'Windows PowerShell 5.1.22621.4391 und PowerShell 7.4.6 sind installiert.' });
    expect(r.installations).toEqual([
      { version: '7.4.6', path: pwsh },
      { version: '5.1.22621.4391', path: winPs },
    ]);
    const lin = await powershellModule(deps('linux')).detect(detectCtx('linux'));
    expect(lin.available).toBe(false);
    expect(lin.message).toContain('optional');
  });

  it('windows terminal: presence of the app execution alias; open passes the project folder', async () => {
    const wt = 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WindowsApps\\wt.exe';
    const mod = windowsTerminalModule(deps('win32', { [wt]: '' }));
    expect(await mod.detect(detectCtx('win32'))).toEqual({ available: true, version: null, path: wt, message: 'Windows Terminal ist installiert.', installations: [] });
    expect(mod.open!({ executable: wt, projectRoot: 'C:\\Projekte\\Spiel', installations: [] })).toEqual({ file: wt, args: ['-d', 'C:\\Projekte\\Spiel'] });
    expect((await windowsTerminalModule(deps('win32')).detect(detectCtx('win32'))).available).toBe(false);
    expect((await mod.detect(detectCtx('linux'))).message).toBe('Windows Terminal gibt es nur unter Windows.');
  });

  it('vscode on Windows reads the version from the install and starts Code.exe directly; open uses -g file:line', async () => {
    const root = 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Microsoft VS Code';
    const d = deps('win32', { [`${root}\\bin\\code.cmd`]: '', [`${root}\\Code.exe`]: '', [`${root}\\resources\\app\\package.json`]: '{"version":"1.95.3"}' });
    const mod = vscodeModule(d);
    const r = await mod.detect(detectCtx('win32', { which: { 'code.cmd': `${root}\\bin\\code.cmd` } }));
    expect(r).toMatchObject({ available: true, version: '1.95.3', path: `${root}\\Code.exe` });
    expect(mod.open!({ executable: r.path!, projectRoot: 'C:\\p', file: 'C:\\p\\src\\a.ts', line: 12, installations: [] })).toEqual({
      file: `${root}\\Code.exe`,
      args: ['C:\\p', '-g', 'C:\\p\\src\\a.ts:12'],
    });
    expect(mod.open!({ executable: 'code', projectRoot: '/p', installations: [] }).args).toEqual(['/p']);
    const lin = scriptedRun({ '/usr/bin/code --version': { code: 0, stdout: '1.95.3\nf1a4fb101478ce6ec82fe9627c43efbf9e98c813\nx64\n' } });
    expect((await vscodeModule(deps('linux')).detect(detectCtx('linux', { run: lin.run, which: { code: '/usr/bin/code' } }))).version).toBe('1.95.3');
  });

  it('playwright is project dependent: only a global install is detected, never npx', async () => {
    const none = scriptedRun({});
    const r = await playwrightModule(deps('linux')).detect(detectCtx('linux', { run: none.run }));
    expect(r).toEqual({ available: false, version: null, path: null, message: PLAYWRIGHT_PROJECT_MESSAGE, installations: [] });
    expect(none.calls).toHaveLength(0);
    const global = scriptedRun({ '/usr/local/bin/playwright --version': { code: 0, stdout: 'Version 1.48.2\n' } });
    const g = await playwrightModule(deps('linux')).detect(detectCtx('linux', { run: global.run, which: { playwright: '/usr/local/bin/playwright' } }));
    expect(g).toMatchObject({ available: true, version: '1.48.2' });
    expect(g.message).toContain('projektabhängig');
    expect(playwrightModule(deps('win32')).installHint('win32')).toMatchObject({ command: 'npm install -D @playwright/test' });
  });

  it('winget: Windows only, version from --version', async () => {
    const exe = 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WindowsApps\\winget.exe';
    const run = scriptedRun({ [`${exe} --version`]: { code: 0, stdout: 'v1.9.25200\r\n' } });
    expect(await wingetModule(deps('win32', { [exe]: '' })).detect(detectCtx('win32', { run: run.run }))).toMatchObject({ available: true, version: '1.9.25200', path: exe });
    expect((await wingetModule(deps('linux')).detect(detectCtx('linux'))).message).toBe('winget gibt es nur unter Windows.');
    expect(wingetModule(deps('linux')).installHint('linux')).toBeNull();
  });
});

describe('engines', () => {
  const hub = 'C:\\Program Files\\Unity\\Hub\\Editor';
  const unityFiles = {
    [`${hub}\\2022.3.10f1\\Editor\\Unity.exe`]: '',
    [`${hub}\\6000.0.23f1\\Editor\\Unity.exe`]: '',
    [`${hub}\\2023.1.0b5\\Editor\\Data\\readme.txt`]: '', // incomplete install without Unity.exe
    'C:\\Users\\Ana\\AppData\\Roaming\\UnityHub\\secondaryInstallPath.json': '"D:\\\\Unity"',
    'D:\\Unity\\2021.3.5f1\\Editor\\Unity.exe': '',
    'C:\\Users\\Ana\\AppData\\Roaming\\UnityHub\\editors-v2.json': JSON.stringify({ schema_version: 'v2', data: [{ version: '2020.3.48f1', location: ['E:\\Custom\\2020.3.48f1\\Editor\\Unity.exe'] }] }),
    'E:\\Custom\\2020.3.48f1\\Editor\\Unity.exe': '',
  };

  it('unity: all editors (Hub folder, secondary install path, editors-v2.json) newest first', async () => {
    const mod = unityModule(deps('win32', unityFiles));
    const r = await mod.detect(detectCtx('win32'));
    expect(r.installations).toEqual([
      { version: '6000.0.23f1', path: `${hub}\\6000.0.23f1\\Editor\\Unity.exe` },
      { version: '2022.3.10f1', path: `${hub}\\2022.3.10f1\\Editor\\Unity.exe` },
      { version: '2021.3.5f1', path: 'D:\\Unity\\2021.3.5f1\\Editor\\Unity.exe' },
      { version: '2020.3.48f1', path: 'E:\\Custom\\2020.3.48f1\\Editor\\Unity.exe' },
    ]);
    expect(r).toMatchObject({ available: true, version: '6000.0.23f1', message: 'Unity ist installiert: 6000.0.23f1 (und 3 weitere Versionen).' });
  });

  it('unity: open uses exactly the project editor version, never another one', async () => {
    const mod = unityModule(deps('win32', unityFiles));
    const r = await mod.detect(detectCtx('win32'));
    expect(mod.open!({ executable: r.path!, projectRoot: 'C:\\Spiele\\Kart', engineVersion: '2022.3.10f1', installations: r.installations })).toEqual({
      file: `${hub}\\2022.3.10f1\\Editor\\Unity.exe`,
      args: ['-projectPath', 'C:\\Spiele\\Kart'],
    });
    expect(() => mod.open!({ executable: r.path!, projectRoot: 'C:\\Spiele\\Kart', engineVersion: '2019.4.1f1', installations: r.installations })).toThrow(NovaError);
    try {
      mod.open!({ executable: r.path!, projectRoot: 'C:\\x', engineVersion: '2019.4.1f1', installations: r.installations });
    } catch (e) {
      expect((e as NovaError).code).toBe('TOOL_MISSING');
      expect((e as NovaError).message).toContain('Unity 2019.4.1f1 ist nicht installiert');
    }
    expect(mod.open!({ executable: r.path!, projectRoot: 'C:\\x', engineVersion: null, installations: r.installations }).file).toBe(r.path);
  });

  it('unity: Hub without editors explains what to do', async () => {
    const r = await unityModule(deps('win32', { 'C:\\Program Files\\Unity Hub\\Unity Hub.exe': '' })).detect(detectCtx('win32'));
    expect(r.available).toBe(false);
    expect(r.message).toBe('Der Unity Hub ist installiert, aber kein Unity-Editor. Bitte im Unity Hub einen Editor installieren.');
  });

  const unrealFiles = {
    'C:\\ProgramData\\Epic\\UnrealEngineLauncher\\LauncherInstalled.dat': JSON.stringify({
      InstallationList: [
        { InstallLocation: 'D:\\Epic\\UE_5.3', AppName: 'UE_5.3', AppVersion: '5.3.2-29314046+++UE5+Release-5.3' },
        { InstallLocation: 'C:\\Games\\Fortnite', AppName: 'Fortnite', AppVersion: '1.0' },
      ],
    }),
    'D:\\Epic\\UE_5.3\\Engine\\Binaries\\Win64\\UnrealEditor.exe': '',
    'D:\\Epic\\UE_5.3\\Engine\\Build\\Build.version': '{"MajorVersion":5,"MinorVersion":3,"PatchVersion":2}',
    'C:\\Program Files\\Epic Games\\UE_4.27\\Engine\\Binaries\\Win64\\UE4Editor.exe': '',
    'C:\\Spiele\\Shooter\\Shooter.uproject': '{"FileVersion":3,"EngineAssociation":"4.27"}',
    'C:\\Spiele\\Neu\\Neu.uproject': '{"EngineAssociation":"5.4"}',
    'C:\\Spiele\\Quelle\\Quelle.uproject': '{"EngineAssociation":"{8A1B2C3D-0000-1111-2222-333344445555}"}',
  };

  it('unreal: LauncherInstalled.dat + UE_* folders, UE5 and UE4 editors, versions from Build.version', async () => {
    const r = await unrealModule(deps('win32', unrealFiles)).detect(detectCtx('win32'));
    expect(r.installations).toEqual([
      { version: '5.3.2', path: 'D:\\Epic\\UE_5.3\\Engine\\Binaries\\Win64\\UnrealEditor.exe' },
      { version: '4.27', path: 'C:\\Program Files\\Epic Games\\UE_4.27\\Engine\\Binaries\\Win64\\UE4Editor.exe' },
    ]);
    expect(r).toMatchObject({ available: true, version: '5.3.2' });
    const none = await unrealModule(deps('win32')).detect(detectCtx('win32'));
    expect(none.message).toContain('Epic Games Launcher');
  });

  it('unreal: open picks the engine of the .uproject EngineAssociation', async () => {
    const mod = unrealModule(deps('win32', unrealFiles));
    const r = await mod.detect(detectCtx('win32'));
    expect(mod.open!({ executable: r.path!, projectRoot: 'C:\\Spiele\\Shooter', installations: r.installations, engineVersion: null })).toEqual({
      file: 'C:\\Program Files\\Epic Games\\UE_4.27\\Engine\\Binaries\\Win64\\UE4Editor.exe',
      args: ['C:\\Spiele\\Shooter\\Shooter.uproject'],
    });
    expect(() => mod.open!({ executable: r.path!, projectRoot: 'C:\\Spiele\\Neu', installations: r.installations, engineVersion: null })).toThrow(/Unreal Engine 5.4 ist nicht installiert/);
    expect(mod.open!({ executable: r.path!, projectRoot: 'C:\\Spiele\\Quelle', installations: r.installations, engineVersion: null }).file).toBe(r.path);
    expect(() => mod.open!({ executable: r.path!, projectRoot: 'C:\\Leer', installations: r.installations, engineVersion: null })).toThrow(/keine .uproject-Datei/);
  });

  it('godot: WinGet Links/Packages, Steam libraries and %LOCALAPPDATA%\\Programs; console helpers skipped; newest first', async () => {
    const pkg = 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WinGet\\Packages\\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe';
    const link = 'C:\\Users\\Ana\\AppData\\Local\\Microsoft\\WinGet\\Links\\godot.exe';
    const steamExe = 'D:\\SteamLibrary\\steamapps\\common\\Godot Engine\\godot.windows.opt.tools.64.exe';
    const files = {
      [link]: '',
      [`${pkg}\\Godot_v4.3-stable_win64.exe`]: '',
      [`${pkg}\\Godot_v4.3-stable_win64_console.exe`]: '',
      'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf': '"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"C:\\\\Program Files (x86)\\\\Steam"\n\t}\n\t"1"\n\t{\n\t\t"path"\t\t"D:\\\\SteamLibrary"\n\t}\n}\n',
      [steamExe]: '',
      'C:\\Users\\Ana\\AppData\\Local\\Programs\\Godot_v4.1.4-stable_win64.exe': '',
    };
    const d = deps('win32', files, { [link]: `${pkg}\\Godot_v4.3-stable_win64.exe` });
    const run = scriptedRun({ [`${steamExe} --version`]: { code: 0, stdout: '4.2.2.stable.official.15073afe3\r\n' } });
    const mod = godotModule(d);
    const r = await mod.detect(detectCtx('win32', { run: run.run }));
    expect(r.installations).toEqual([
      { version: '4.3-stable', path: link },
      { version: '4.2.2-stable', path: steamExe },
      { version: '4.1.4-stable', path: 'C:\\Users\\Ana\\AppData\\Local\\Programs\\Godot_v4.1.4-stable_win64.exe' },
    ]);
    expect(r).toMatchObject({ available: true, version: '4.3-stable', path: link });
    expect(run.calls.map((c) => c.file)).toEqual([steamExe]); // versions from file names need no process
    d.fs.add('C:\\Spiele\\Platformer\\project.godot', '');
    expect(mod.open!({ executable: link, projectRoot: 'C:\\Spiele\\Platformer', installations: r.installations })).toEqual({ file: link, args: ['--editor', '--path', 'C:\\Spiele\\Platformer'] });
    expect(() => mod.open!({ executable: link, projectRoot: 'C:\\Leer', installations: [] })).toThrow(/project.godot/);
  });

  it('godot version helpers and Steam library parsing', () => {
    expect(godotVersionFromName('Godot_v4.2.1-stable_win64.exe')).toBe('4.2.1-stable');
    expect(godotVersionFromName('Godot_v4.4-beta2_mono_win64.exe')).toBe('4.4-beta2');
    expect(godotVersionFromName('godot.exe')).toBeNull();
    expect(godotVersionFromOutput('4.2.1.stable.official.b09f793f5\n')).toBe('4.2.1-stable');
    expect(godotVersionFromOutput('Godot Engine v4\n3.5.3.stable.mono.official\n')).toBe('3.5.3-stable');
    const fs = memFs('win32', { 'C:\\Steam\\steamapps\\libraryfolders.vdf': '"libraryfolders" { "1" { "path" "E:\\\\Games\\\\Steam" } }' });
    expect(steamLibraries(fs, 'C:\\Steam', 'win32')).toEqual(['C:\\Steam', 'E:\\Games\\Steam']);
  });
});
