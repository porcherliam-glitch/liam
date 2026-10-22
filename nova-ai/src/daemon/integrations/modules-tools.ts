// Built-in integration modules for tools: git, node, npm, python, dotnet, powershell, windows_terminal, ollama, vscode,
// playwright, winget (SPEC §4.9, §6.9).
// Key decisions:
// - Detection = PATH lookup (where.exe / command -v) + well-known Windows install folders, then a version command with
//   a 10–15 s timeout judged by exit code 0. The .NET SDK is detected through `dotnet --list-sdks` (native host) with
//   the sdk folder as fallback, never through `dotnet --version` (see dotnetModule). Windows .cmd shims (npm.cmd, code.cmd, playwright.cmd) run through
//   execTool's validated cmd.exe handling; when that refuses a path (e.g. umlauts in the user name) the version is read
//   from the package.json next to the shim instead.
// - Python on Windows skips the Microsoft Store placeholder (python.exe in WindowsApps that only opens the Store) by
//   exit code, then tries the py launcher (`py -3`) and asks it for sys.executable.
// - PowerShell reports Windows PowerShell (used by NOVA's terminal, primary) and PowerShell 7 (pwsh) as installations.
// - Windows Terminal has no version CLI (wt -v opens a dialog) → presence of the app execution alias only.
// - Playwright is project dependent: only a global install is detected (no npx – it could download packages).
import type { IntegrationDetectContext, IntegrationModule } from '../contracts';
import type { IntegrationStatus } from '@shared/schemas';
import {
  compareVersions,
  detectVersionTool,
  existingOnly,
  findAllOnPath,
  firstVersion,
  packageJsonVersion,
  pathFor,
  sortInstallations,
  uniquePaths,
  winFolders,
  type DetectResult,
  type FsLike,
  type Installation,
  type ModuleDeps,
} from './helpers';
import { WINGET_PACKAGES, wingetCommand } from './winget';

export function installHint(id: string, platform: NodeJS.Platform, url: string | null): IntegrationStatus['installHint'] {
  if (platform === 'win32') {
    const pkg = WINGET_PACKAGES[id];
    return { command: pkg ? wingetCommand(pkg) : null, url, requiresAdmin: pkg?.requiresAdmin ?? false };
  }
  return { command: null, url, requiresAdmin: false };
}

const notAvailable = (message: string): DetectResult => ({ available: false, version: null, path: null, message, installations: [] });

function manualIfExists(ctx: IntegrationDetectContext, deps: ModuleDeps): string | null {
  return ctx.manualPath && deps.fs.exists(ctx.manualPath) ? ctx.manualPath : null;
}

function manualMissingNote(ctx: IntegrationDetectContext, deps: ModuleDeps): string {
  return ctx.manualPath && !deps.fs.exists(ctx.manualPath) ? `Der eingetragene Pfad wurde nicht gefunden (${ctx.manualPath}). ` : '';
}

// ---------------------------------------------------------------------------------------------------------- git

export function gitModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'git',
    name: 'Git',
    category: 'vcs',
    detect: (ctx) =>
      detectVersionTool(ctx, deps, {
        name: 'Git',
        purpose: 'Git wird für Versionsverwaltung, Wiederherstellungspunkte und den Import von Projekten benötigt.',
        candidates: async (c) => {
          const p = pathFor(c.platform);
          const w = winFolders(c.env);
          return [
            await c.findExecutable('git'),
            ...(c.platform === 'win32' ? existingOnly(deps.fs, [p.join(w.programFiles, 'Git', 'cmd', 'git.exe'), p.join(w.localAppData, 'Programs', 'Git', 'cmd', 'git.exe')]) : []),
          ];
        },
        versionArgs: ['--version'],
        parseVersion: (out) => /git version (\d+\.\d+\.\d+)/i.exec(out)?.[1] ?? null,
      }),
    installHint: (platform) => installHint('git', platform, 'https://git-scm.com/downloads'),
  };
}

// ---------------------------------------------------------------------------------------------------- node / npm

export function nodeModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'node',
    name: 'Node.js',
    category: 'runtime',
    detect: (ctx) =>
      detectVersionTool(ctx, deps, {
        name: 'Node.js',
        purpose: 'Node.js wird für Web-Projekte, Browserspiele und JavaScript-Tests benötigt.',
        candidates: async (c) => {
          const p = pathFor(c.platform);
          const w = winFolders(c.env);
          return [await c.findExecutable('node'), ...(c.platform === 'win32' ? existingOnly(deps.fs, [p.join(w.programFiles, 'nodejs', 'node.exe')]) : [])];
        },
        versionArgs: ['--version'],
        parseVersion: (out) => /\bv?(\d+\.\d+\.\d+)\b/.exec(out)?.[1] ?? null,
      }),
    installHint: (platform) => installHint('node', platform, 'https://nodejs.org/'),
  };
}

export function npmModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'npm',
    name: 'npm',
    category: 'package_manager',
    detect: (ctx) =>
      detectVersionTool(ctx, deps, {
        name: 'npm',
        purpose: 'npm gehört zu Node.js und installiert die Abhängigkeiten von JavaScript-Projekten.',
        candidates: async (c) => {
          if (c.platform !== 'win32') return [await c.findExecutable('npm')];
          const p = pathFor('win32');
          const w = winFolders(c.env);
          // `where npm` lists the extension-less bash script first; Windows needs the .cmd shim.
          return [await c.findExecutable('npm.cmd'), ...existingOnly(deps.fs, [p.join(w.programFiles, 'nodejs', 'npm.cmd')])];
        },
        versionArgs: ['--version'],
        parseVersion: (out) => firstVersion(out, 3),
        fallbackVersion: (exe, c) =>
          c.platform === 'win32' ? packageJsonVersion(deps.fs, pathFor('win32').join(pathFor('win32').dirname(exe), 'node_modules', 'npm', 'package.json')) : null,
      }),
    installHint: (platform) => installHint('npm', platform, 'https://nodejs.org/'),
  };
}

// --------------------------------------------------------------------------------------------------------- python

const PYTHON_VERSION = /Python (\d+\.\d+\.\d+)/;

export function pythonModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'python',
    name: 'Python',
    category: 'runtime',
    async detect(ctx) {
      const p = pathFor(ctx.platform);
      const note = manualMissingNote(ctx, deps);
      const tryVersion = async (exe: string, pre: string[]): Promise<string | null> => {
        const r = await ctx.run(exe, [...pre, '--version'], 10_000);
        if (r.code !== 0) return null;
        const v = PYTHON_VERSION.exec(`${r.stdout}\n${r.stderr}`)?.[1] ?? null;
        return v && Number(v.split('.')[0]) >= 3 ? v : null;
      };
      const ok = (version: string, exe: string): DetectResult => ({
        available: true,
        version,
        path: exe,
        message: `${note}Python ${version} ist installiert.`,
        installations: [{ version, path: exe }],
      });
      const manual = manualIfExists(ctx, deps);
      if (manual) {
        const v = await tryVersion(manual, []);
        if (v) return ok(v, manual);
      }
      if (ctx.platform !== 'win32') {
        for (const name of ['python3', 'python']) {
          const exe = await ctx.findExecutable(name);
          if (!exe) continue;
          const v = await tryVersion(exe, []);
          if (v) return ok(v, exe);
        }
        return notAvailable(`${note}Python 3 wurde nicht gefunden. Python wird für Python-Projekte und deren Tests benötigt.`);
      }
      let storeStub = false;
      for (const exe of await findAllOnPath(ctx, 'python')) {
        const v = await tryVersion(exe, []);
        if (v) return ok(v, exe);
        if (/\\Microsoft\\WindowsApps\\/i.test(exe)) storeStub = true;
      }
      const py = await ctx.findExecutable('py');
      if (py) {
        const v = await tryVersion(py, ['-3']);
        if (v) {
          const r = await ctx.run(py, ['-3', '-c', 'import sys; print(sys.executable)'], 10_000);
          const real = r.code === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null : null;
          return ok(v, real && deps.fs.exists(real) ? real : py);
        }
      }
      const w = winFolders(ctx.env);
      const programs = p.join(w.localAppData, 'Programs', 'Python');
      const dirs = deps.fs
        .listDir(programs)
        .filter((d) => /^Python3\d*$/i.test(d))
        .sort((a, b) => Number(b.replace(/\D/g, '')) - Number(a.replace(/\D/g, '')));
      for (const d of dirs) {
        const exe = p.join(programs, d, 'python.exe');
        if (!deps.fs.exists(exe)) continue;
        const v = await tryVersion(exe, []);
        if (v) return ok(v, exe);
      }
      return notAvailable(
        storeStub
          ? `${note}Python wurde nicht gefunden. Es ist nur der Platzhalter aus dem Microsoft Store vorhanden, der kein echtes Python startet.`
          : `${note}Python 3 wurde nicht gefunden. Python wird für Python-Projekte und deren Tests benötigt.`,
      );
    },
    installHint: (platform) => installHint('python', platform, 'https://www.python.org/downloads/'),
  };
}

// --------------------------------------------------------------------------------------------------------- dotnet

const DOTNET_SDK_LINE = /^(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s+\[.+\]$/;
const DOTNET_SDK_DIR = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const DOTNET_LIST_TIMEOUT_MS = 15_000;

function comparePrerelease(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d;
    } else if (nx !== ny) {
      return nx ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** Semantic order of .NET SDK versions (>0 if a is newer): numbers first, a release above its previews. */
export function compareDotnetVersions(a: string, b: string): number {
  const split = (v: string): [string, string] => {
    const i = v.indexOf('-');
    return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
  };
  const [coreA, preA] = split(a);
  const [coreB, preB] = split(b);
  const d = compareVersions(coreA, coreB);
  if (d !== 0) return d;
  if (!preA !== !preB) return preA ? -1 : 1;
  return comparePrerelease(preA, preB);
}

/** SDK versions from `dotnet --list-sdks` lines like "8.0.404 [C:\Program Files\dotnet\sdk]". */
export function parseDotnetSdkList(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const m = DOTNET_SDK_LINE.exec(line.trim());
    if (m) out.push(m[1]);
  }
  return out;
}

/** SDK versions from the sdk folder next to the (symlink-resolved) dotnet executable: sdk/<version>/dotnet.dll. */
export function dotnetSdkFolderVersions(fs: FsLike, exe: string, platform: NodeJS.Platform): string[] {
  const p = pathFor(platform);
  const sdkDir = p.join(p.dirname(fs.realpath(exe)), 'sdk');
  return fs.listDir(sdkDir).filter((d) => DOTNET_SDK_DIR.test(d) && fs.exists(p.join(sdkDir, d, 'dotnet.dll')));
}

// `dotnet --list-sdks` is answered by the native host (hostfxr): no managed SDK start and no global.json lookup.
// `dotnet --version` is not used for detection: it starts the managed CLI, which can exceed the detection timeout on a
// cold machine (a fresh Windows image with 11 SDKs reported "not installed"), and it fails when a global.json in the
// daemon's working folder pins an SDK that is not installed. When the host does not answer, the sdk folder decides.
export function dotnetModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'dotnet',
    name: '.NET SDK',
    category: 'runtime',
    async detect(ctx) {
      const p = pathFor(ctx.platform);
      const w = winFolders(ctx.env);
      const note = manualMissingNote(ctx, deps);
      const candidates = uniquePaths(
        [manualIfExists(ctx, deps), await ctx.findExecutable('dotnet'), ...(ctx.platform === 'win32' ? existingOnly(deps.fs, [p.join(w.programFiles, 'dotnet', 'dotnet.exe')]) : [])],
        ctx.platform,
      );
      let runtimeOnly: string | null = null;
      let silent: string | null = null;
      for (const exe of candidates) {
        const r = await ctx.run(exe, ['--list-sdks'], DOTNET_LIST_TIMEOUT_MS);
        let versions = r.code === 0 ? parseDotnetSdkList(r.stdout) : [];
        if (versions.length === 0) versions = dotnetSdkFolderVersions(deps.fs, exe, ctx.platform);
        if (versions.length > 0) {
          const sorted = [...new Set(versions)].sort((a, b) => compareDotnetVersions(b, a));
          return {
            available: true,
            version: sorted[0],
            path: exe,
            message: `${note}.NET SDK ${sorted[0]} ist installiert.`,
            installations: sorted.map((version) => ({ version, path: exe })),
          };
        }
        if (r.code === 0) runtimeOnly ??= exe;
        else silent ??= exe;
      }
      if (runtimeOnly) return notAvailable(`${note}.NET ist vorhanden, aber es ist kein .NET SDK installiert. Für Builds und Tests wird das .NET SDK benötigt.`);
      if (silent) return notAvailable(`${note}.NET wurde gefunden (${silent}), antwortet aber nicht auf die Abfrage der installierten SDKs. Eventuell ist die Installation beschädigt.`);
      return notAvailable(`${note}.NET SDK wurde nicht gefunden. Das .NET SDK wird für Windows-Desktop-Anwendungen (WPF) und C#-Projekte benötigt.`);
    },
    installHint: (platform) => installHint('dotnet', platform, 'https://dotnet.microsoft.com/download'),
  };
}

// ----------------------------------------------------------------------------------------------------- powershell

export const PS_VERSION_ARGS = ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'];

export function powershellModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'powershell',
    name: 'PowerShell',
    category: 'shell',
    async detect(ctx) {
      const p = pathFor(ctx.platform);
      const w = winFolders(ctx.env);
      const note = manualMissingNote(ctx, deps);
      const version = async (exe: string): Promise<string | null> => {
        const r = await ctx.run(exe, PS_VERSION_ARGS, 15_000);
        return r.code === 0 ? firstVersion(r.stdout) : null;
      };
      const firstWorking = async (cands: string[]): Promise<Installation | null> => {
        for (const exe of cands) {
          const v = await version(exe);
          if (v) return { version: v, path: exe };
        }
        return null;
      };
      const manual = manualIfExists(ctx, deps);
      const manualInst = manual ? await firstWorking([manual]) : null;
      const winPs =
        ctx.platform === 'win32'
          ? await firstWorking(
              uniquePaths([...existingOnly(deps.fs, [p.join(w.systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')]), await ctx.findExecutable('powershell')], 'win32'),
            )
          : null;
      const pwsh = await firstWorking(
        uniquePaths([await ctx.findExecutable('pwsh'), ...(ctx.platform === 'win32' ? existingOnly(deps.fs, [p.join(w.programFiles, 'PowerShell', '7', 'pwsh.exe')]) : [])], ctx.platform),
      );
      const all = sortInstallations([manualInst, winPs, pwsh].filter((x): x is Installation => !!x));
      const unique = all.filter((x, i) => all.findIndex((y) => y.path.toLowerCase() === x.path.toLowerCase()) === i);
      const primary = manualInst ?? winPs ?? pwsh;
      if (!primary) {
        return notAvailable(
          ctx.platform === 'win32'
            ? `${note}Windows PowerShell wurde nicht gefunden. Das Terminal in NOVA benötigt PowerShell.`
            : `${note}PowerShell (pwsh) wurde nicht gefunden. Unter Linux und macOS ist PowerShell optional.`,
        );
      }
      let message: string;
      if (winPs && pwsh) message = `Windows PowerShell ${winPs.version} und PowerShell ${pwsh.version} sind installiert.`;
      else if (winPs) message = `Windows PowerShell ${winPs.version} ist installiert. PowerShell 7 ist optional.`;
      else if (pwsh) message = `PowerShell ${pwsh.version} ist installiert.`;
      else message = `PowerShell ${primary.version} ist installiert.`;
      return { available: true, version: primary.version, path: primary.path, message: note + message, installations: unique };
    },
    installHint: (platform) => installHint('powershell', platform, 'https://aka.ms/powershell'),
  };
}

// ----------------------------------------------------------------------------------------------- windows terminal

export function windowsTerminalModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'windows_terminal',
    name: 'Windows Terminal',
    category: 'shell',
    async detect(ctx) {
      if (ctx.platform !== 'win32') return notAvailable('Windows Terminal gibt es nur unter Windows.');
      const p = pathFor('win32');
      const w = winFolders(ctx.env);
      const note = manualMissingNote(ctx, deps);
      const exe = uniquePaths(
        [manualIfExists(ctx, deps), ...existingOnly(deps.fs, [p.join(w.localAppData, 'Microsoft', 'WindowsApps', 'wt.exe')]), await ctx.findExecutable('wt')],
        'win32',
      )[0];
      if (!exe) return notAvailable(`${note}Windows Terminal wurde nicht gefunden. Es ist optional und dient zum Öffnen eines Terminals im Projektordner.`);
      // wt.exe has no version switch that prints to stdout (wt -v opens a dialog) – presence only.
      return { available: true, version: null, path: exe, message: `${note}Windows Terminal ist installiert.`, installations: [] };
    },
    installHint: (platform) => installHint('windows_terminal', platform, 'https://aka.ms/terminal'),
    open: ({ executable, projectRoot }) => ({ file: executable, args: ['-d', projectRoot.replace(/;/g, '\\;')] }),
  };
}

// --------------------------------------------------------------------------------------------------------- ollama

export function ollamaModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'ollama',
    name: 'Ollama',
    category: 'ai',
    detect: (ctx) =>
      detectVersionTool(ctx, deps, {
        name: 'Ollama',
        purpose: 'Ollama führt lokale KI-Modelle auf diesem PC aus (kostenlos, ohne Cloud).',
        candidates: async (c) => {
          const p = pathFor(c.platform);
          const w = winFolders(c.env);
          return [await c.findExecutable('ollama'), ...(c.platform === 'win32' ? existingOnly(deps.fs, [p.join(w.localAppData, 'Programs', 'Ollama', 'ollama.exe')]) : [])];
        },
        versionArgs: ['--version'],
        parseVersion: (out) => firstVersion(out, 3),
        availableMessage: (v) => `Ollama ${v} ist installiert. Ob der Ollama-Dienst läuft, zeigt die Seite „Modelle“.`,
      }),
    installHint: (platform) => installHint('ollama', platform, 'https://ollama.com/download'),
  };
}

// --------------------------------------------------------------------------------------------------------- vscode

export function vscodeModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'vscode',
    name: 'Visual Studio Code',
    category: 'editor',
    async detect(ctx) {
      const p = pathFor(ctx.platform);
      const note = manualMissingNote(ctx, deps);
      const missing = notAvailable(`${note}Visual Studio Code wurde nicht gefunden. Es ist optional und dient zum Öffnen von Dateien in einem externen Editor.`);
      const cliVersion = async (exe: string): Promise<string | null> => {
        const r = await ctx.run(exe, ['--version'], 15_000);
        if (r.code !== 0) return null;
        const firstLine = r.stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
        return firstVersion(firstLine, 3);
      };
      if (ctx.platform === 'win32') {
        const w = winFolders(ctx.env);
        const cands = uniquePaths(
          [
            manualIfExists(ctx, deps),
            await ctx.findExecutable('code.cmd'),
            ...existingOnly(deps.fs, [
              p.join(w.localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd'),
              p.join(w.programFiles, 'Microsoft VS Code', 'bin', 'code.cmd'),
            ]),
          ],
          'win32',
        );
        for (const cand of cands) {
          const isExe = /code\.exe$/i.test(cand);
          const root = isExe ? p.dirname(cand) : p.dirname(p.dirname(cand));
          const exe = p.join(root, 'Code.exe');
          let version = packageJsonVersion(deps.fs, p.join(root, 'resources', 'app', 'package.json'));
          if (!version) version = await cliVersion(cand);
          if (!version) continue;
          // Code.exe directly (no cmd.exe): arguments with spaces/umlauts are passed safely.
          const path = deps.fs.exists(exe) ? exe : cand;
          return { available: true, version, path, message: `${note}Visual Studio Code ${version} ist installiert.`, installations: [{ version, path }] };
        }
        return missing;
      }
      for (const cand of uniquePaths([manualIfExists(ctx, deps), await ctx.findExecutable('code')], ctx.platform)) {
        const version = await cliVersion(cand);
        if (version) return { available: true, version, path: cand, message: `${note}Visual Studio Code ${version} ist installiert.`, installations: [{ version, path: cand }] };
      }
      return missing;
    },
    installHint: (platform) => installHint('vscode', platform, 'https://code.visualstudio.com/download'),
    open: ({ executable, projectRoot, file, line }) => {
      const args = [projectRoot];
      if (file) args.push('-g', line && line > 0 ? `${file}:${line}` : file);
      return { file: executable, args };
    },
  };
}

// ----------------------------------------------------------------------------------------------------- playwright

export const PLAYWRIGHT_PROJECT_MESSAGE =
  'Playwright ist projektabhängig: Es wird pro Projekt installiert (npm install -D @playwright/test) und dort mit „npx playwright test“ ausgeführt. Eine globale Installation wurde nicht gefunden.';

export function playwrightModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'playwright',
    name: 'Playwright',
    category: 'testing',
    async detect(ctx) {
      const p = pathFor(ctx.platform);
      const note = manualMissingNote(ctx, deps);
      const cands = uniquePaths([manualIfExists(ctx, deps), await ctx.findExecutable(ctx.platform === 'win32' ? 'playwright.cmd' : 'playwright')], ctx.platform);
      for (const exe of cands) {
        let version: string | null = null;
        if (ctx.platform === 'win32') {
          const modules = p.join(p.dirname(exe), 'node_modules');
          version =
            packageJsonVersion(deps.fs, p.join(modules, 'playwright', 'package.json')) ??
            packageJsonVersion(deps.fs, p.join(modules, '@playwright', 'test', 'package.json')) ??
            packageJsonVersion(deps.fs, p.join(modules, 'playwright-core', 'package.json'));
        }
        if (!version) {
          const r = await ctx.run(exe, ['--version'], 10_000);
          if (r.code === 0) version = /Version (\d+\.\d+\.\d+)/i.exec(r.stdout)?.[1] ?? firstVersion(r.stdout, 3);
        }
        if (version) {
          return {
            available: true,
            version,
            path: exe,
            message: `${note}Playwright ${version} ist global installiert. Projekte verwenden normalerweise ihre eigene Version (projektabhängig).`,
            installations: [{ version, path: exe }],
          };
        }
      }
      return notAvailable(note + PLAYWRIGHT_PROJECT_MESSAGE);
    },
    installHint: () => ({ command: 'npm install -D @playwright/test', url: 'https://playwright.dev/docs/intro', requiresAdmin: false }),
  };
}

// --------------------------------------------------------------------------------------------------------- winget

export function wingetModule(deps: ModuleDeps): IntegrationModule {
  return {
    id: 'winget',
    name: 'winget (App-Installer)',
    category: 'package_manager',
    async detect(ctx) {
      if (ctx.platform !== 'win32') return notAvailable('winget gibt es nur unter Windows.');
      return detectVersionTool(ctx, deps, {
        name: 'winget',
        purpose:
          'winget wird für die automatische Installation von Werkzeugen benötigt. Es ist in Windows 10/11 normalerweise vorinstalliert und lässt sich über den Microsoft Store („App-Installer“) nachinstallieren.',
        candidates: async (c) => {
          const w = winFolders(c.env);
          return [await c.findExecutable('winget'), ...existingOnly(deps.fs, [pathFor('win32').join(w.localAppData, 'Microsoft', 'WindowsApps', 'winget.exe')])];
        },
        versionArgs: ['--version'],
        parseVersion: (out) => /v?(\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null,
      });
    },
    installHint: (platform) => (platform === 'win32' ? { command: null, url: 'https://apps.microsoft.com/detail/9NBLGGH4NNS1', requiresAdmin: false } : null),
  };
}
