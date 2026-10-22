// ProjectDetector – derives kind, technologies and commands from the files of a project folder (SPEC §4.8, §6.8).
// Key decisions:
// - Read-only: never writes, never runs project code. Only small manifest files are read (package.json, *.csproj,
//   pyproject.toml, ProjectVersion.txt …); directory scans are shallow, bounded and never follow links.
// - Commands are null when unknown (nothing is invented). Package-manager aware for Node (npm/pnpm/yarn/bun),
//   solution aware for .NET (one .sln → build/test the solution), venv based for Python (Windows .venv\Scripts).
// - Primary detector order: Unity > Unreal > Godot > .NET with a root solution > Node (package.json) > nested .NET >
//   Python > static web > generic. Technologies of secondary findings are merged.
// - Unity editor commands only when an editor matching ProjectVersion.txt is installed (integrations.resolvePath).
import { existsSync, readFileSync, readdirSync, statSync, type Dirent } from 'node:fs';
import { basename, join } from 'node:path';
import type { ProjectCommands, ProjectConfig, ProjectKind, PreviewKind } from '@shared/schemas';
import type { ProjectDetector, Services } from '../contracts';
import { NovaError, errorMessage } from '../core/errors';
import { defaultArtifactGlobs, defaultConfig, emptyCommands } from './config';
import { NOVA_BUILD_SCRIPT, readUnityVersion, unityPackageCommand, unityTestCommand } from './unity';

export interface DetectorOptions {
  platform?: NodeJS.Platform;
}

export interface DetectionResult {
  kind: ProjectKind;
  technologies: string[];
  config: ProjectConfig;
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'Library', 'Temp', 'obj', 'bin', '.venv', 'venv', '__pycache__', '.idea', '.vs', 'Builds', 'Logs']);
const MAX_SCAN_ENTRIES = 4000;

function readText(path: string, maxBytes = 512 * 1024): string | null {
  try {
    const st = statSync(path);
    if (!st.isFile() || st.size > maxBytes) return null;
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function readJson(path: string): Record<string, unknown> | null {
  const text = readText(path);
  if (text === null) return null;
  try {
    const v = JSON.parse(text.replace(/^﻿/, '')) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listDir(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Files (relative, forward slashes) whose name matches `re`, up to `maxDepth` levels; never follows links. */
function findFiles(root: string, re: RegExp, maxDepth: number): string[] {
  const out: string[] = [];
  let visited = 0;
  const walk = (dir: string, rel: string, depth: number) => {
    for (const e of listDir(dir)) {
      if (++visited > MAX_SCAN_ENTRIES) return;
      if (e.isSymbolicLink()) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) walk(join(dir, e.name), childRel, depth + 1);
      } else if (e.isFile() && re.test(e.name)) {
        out.push(childRel);
      }
    }
  };
  walk(root, '', 0);
  return out.sort();
}

function quoteArg(p: string): string {
  return /[\s&()^%!;,]/.test(p) ? `"${p}"` : p;
}

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of list) {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

interface Detected {
  kind: ProjectKind;
  technologies: string[];
  commands: ProjectCommands;
  preview: ProjectConfig['preview'];
  artifactGlobs?: string[];
  engineVersion?: string | null;
}

function preview(kind: PreviewKind, entry: string | null = null): ProjectConfig['preview'] {
  return { kind, entry, url: null };
}

// ------------------------------------------------------------------------------------------------ Node.js

const NODE_TECH: [string, string][] = [
  ['react', 'React'],
  ['vue', 'Vue'],
  ['svelte', 'Svelte'],
  ['@sveltejs/kit', 'SvelteKit'],
  ['vite', 'Vite'],
  ['next', 'Next.js'],
  ['nuxt', 'Nuxt'],
  ['@angular/core', 'Angular'],
  ['astro', 'Astro'],
  ['solid-js', 'Solid'],
  ['preact', 'Preact'],
  ['electron', 'Electron'],
  ['express', 'Express'],
  ['fastify', 'Fastify'],
  ['koa', 'Koa'],
  ['hono', 'Hono'],
  ['@nestjs/core', 'NestJS'],
  ['phaser', 'Phaser'],
  ['three', 'Three.js'],
  ['pixi.js', 'PixiJS'],
  ['typescript', 'TypeScript'],
  ['tailwindcss', 'Tailwind CSS'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['mocha', 'Mocha'],
  ['@playwright/test', 'Playwright'],
  ['prisma', 'Prisma'],
  ['better-sqlite3', 'SQLite'],
  ['sqlite3', 'SQLite'],
  ['pg', 'PostgreSQL'],
  ['mysql2', 'MySQL'],
  ['mongoose', 'MongoDB'],
];
const WEB_DEPS = ['react', 'vue', 'svelte', '@sveltejs/kit', 'vite', 'next', 'nuxt', '@angular/core', 'astro', 'solid-js', 'preact', 'lit', 'phaser', 'three', 'pixi.js', 'parcel', 'webpack'];
const BACKEND_DEPS = ['express', 'fastify', 'koa', 'hono', '@nestjs/core', '@hapi/hapi', 'restify'];
const NPM_DEFAULT_TEST = /no test specified/i;

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

function detectPackageManager(root: string, pkg: Record<string, unknown>): PackageManager {
  const declared = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : '';
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm') return declared;
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function scriptCommand(pm: PackageManager, script: string): string {
  if (pm === 'npm') return script === 'test' ? 'npm test' : script === 'start' ? 'npm start' : `npm run ${script}`;
  if (pm === 'bun') return `bun run ${script}`;
  return `${pm} ${script}`;
}

function detectNode(root: string, pkg: Record<string, unknown>): Detected {
  const scripts = (pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {}) as Record<string, unknown>;
  const has = (name: string) => typeof scripts[name] === 'string' && (scripts[name] as string).trim() !== '';
  const deps: Record<string, unknown> = {
    ...((pkg.dependencies as Record<string, unknown>) ?? {}),
    ...((pkg.devDependencies as Record<string, unknown>) ?? {}),
  };
  const depNames = Object.keys(deps);
  const hasDep = (d: string) => depNames.includes(d);
  const pm = detectPackageManager(root, pkg);
  const lock = pm === 'npm' ? existsSync(join(root, 'package-lock.json')) : pm === 'pnpm' ? existsSync(join(root, 'pnpm-lock.yaml')) : pm === 'yarn' ? existsSync(join(root, 'yarn.lock')) : true;
  const tsconfig = existsSync(join(root, 'tsconfig.json'));
  const playwrightConfig = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs'].some((f) => existsSync(join(root, f)));
  const indexHtml = ['index.html', 'public/index.html', 'src/index.html'].find((f) => existsSync(join(root, f))) ?? null;

  const technologies = ['Node.js', ...NODE_TECH.filter(([d]) => hasDep(d)).map(([, t]) => t)];
  if (tsconfig) technologies.push('TypeScript');
  if (indexHtml && !depNames.some((d) => WEB_DEPS.includes(d))) technologies.push('HTML', 'CSS', 'JavaScript');

  const commands = emptyCommands();
  if (depNames.length > 0) {
    commands.install =
      pm === 'npm' ? (lock ? 'npm ci' : 'npm install') : pm === 'pnpm' ? (lock ? 'pnpm install --frozen-lockfile' : 'pnpm install') : pm === 'yarn' ? (lock ? 'yarn install --frozen-lockfile' : 'yarn install') : 'bun install';
    commands.security = pm === 'npm' ? 'npm audit --omit=dev --audit-level=high' : pm === 'pnpm' ? 'pnpm audit --prod --audit-level high' : null;
  }
  if (has('test') && !NPM_DEFAULT_TEST.test(String(scripts.test))) commands.test = scriptCommand(pm, 'test');
  if (has('build')) commands.build = scriptCommand(pm, 'build');
  if (has('lint')) commands.lint = scriptCommand(pm, 'lint');
  if (has('typecheck')) commands.typecheck = scriptCommand(pm, 'typecheck');
  else if (has('type-check')) commands.typecheck = scriptCommand(pm, 'type-check');
  else if (tsconfig) commands.typecheck = 'npx tsc --noEmit';
  if (has('e2e')) commands.e2e = scriptCommand(pm, 'e2e');
  else if (has('test:e2e')) commands.e2e = scriptCommand(pm, 'test:e2e');
  else if (playwrightConfig) commands.e2e = 'npx playwright test';
  if (has('dist')) commands.package = scriptCommand(pm, 'dist');
  else if (has('package')) commands.package = scriptCommand(pm, 'package');
  else if (has('make')) commands.package = scriptCommand(pm, 'make');
  if (has('dev')) commands.dev = scriptCommand(pm, 'dev');
  else if (has('start')) commands.dev = scriptCommand(pm, 'start');
  else if (has('serve')) commands.dev = scriptCommand(pm, 'serve');
  commands.run = has('start') ? scriptCommand(pm, 'start') : commands.dev;

  let kind: ProjectKind;
  let pv: ProjectConfig['preview'];
  let artifactGlobs: string[];
  if (hasDep('electron')) {
    kind = 'desktop';
    pv = preview(commands.run ? 'desktop-run' : 'none');
    artifactGlobs = ['dist/**', 'out/**', 'release/**'];
  } else if (depNames.some((d) => WEB_DEPS.includes(d)) || indexHtml) {
    kind = 'web';
    pv = commands.dev ? preview('browser-dev-server', indexHtml) : indexHtml ? preview('browser-static', indexHtml) : preview('none');
    artifactGlobs = hasDep('next') ? ['.next/**', 'out/**'] : ['dist/**', 'build/**'];
  } else if (depNames.some((d) => BACKEND_DEPS.includes(d)) || commands.dev) {
    kind = 'backend';
    pv = preview(commands.dev ? 'browser-dev-server' : 'none');
    artifactGlobs = defaultArtifactGlobs('backend');
  } else {
    kind = 'generic';
    pv = preview('none');
    artifactGlobs = [];
  }
  return { kind, technologies, commands, preview: pv, artifactGlobs };
}

// ------------------------------------------------------------------------------------------------ .NET

interface DotnetProject {
  rel: string;
  text: string;
  wpf: boolean;
  winforms: boolean;
  maui: boolean;
  web: boolean;
  blazorWasm: boolean;
  exe: boolean;
  test: boolean;
  frameworks: string[];
  language: 'C#' | 'F#' | 'Visual Basic';
}

function parseDotnetProject(root: string, rel: string): DotnetProject | null {
  const text = readText(join(root, ...rel.split('/')));
  if (text === null) return null;
  const tag = (name: string) => new RegExp(`<${name}>\\s*true\\s*</${name}>`, 'i').test(text);
  const tfm = /<TargetFrameworks?>\s*([^<]+)</i.exec(text)?.[1] ?? '';
  const outputType = /<OutputType>\s*([^<]+)</i.exec(text)?.[1]?.trim().toLowerCase() ?? '';
  const sdk = /<Project\s+Sdk="([^"]+)"/i.exec(text)?.[1] ?? '';
  const test = tag('IsTestProject') || /Include="(xunit|nunit|MSTest\.TestFramework|MSTest|Microsoft\.NET\.Test\.Sdk)"/i.test(text);
  return {
    rel,
    text,
    wpf: tag('UseWPF'),
    winforms: tag('UseWindowsForms'),
    maui: tag('UseMaui'),
    web: /Microsoft\.NET\.Sdk\.Web/i.test(sdk),
    blazorWasm: /BlazorWebAssembly/i.test(sdk),
    exe: outputType === 'exe' || outputType === 'winexe',
    test,
    frameworks: tfm.split(';').map((s) => s.trim()).filter(Boolean),
    language: rel.endsWith('.fsproj') ? 'F#' : rel.endsWith('.vbproj') ? 'Visual Basic' : 'C#',
  };
}

function frameworkLabel(tfm: string): string | null {
  const m = /^net(\d+)\.(\d+)/i.exec(tfm);
  if (m) return `.NET ${m[1]}`;
  if (/^netcoreapp/i.test(tfm)) return '.NET Core';
  if (/^net4/i.test(tfm)) return '.NET Framework';
  return null;
}

function detectDotnet(root: string, solutions: string[], projectFiles: string[]): Detected | null {
  const projects = projectFiles.map((p) => parseDotnetProject(root, p)).filter((p): p is DotnetProject => p !== null);
  if (projects.length === 0 && solutions.length === 0) return null;
  const technologies: string[] = [];
  for (const p of projects) {
    technologies.push(p.language);
    for (const f of p.frameworks) {
      const label = frameworkLabel(f);
      if (label) technologies.push(label);
    }
    if (p.wpf) technologies.push('WPF');
    if (p.winforms) technologies.push('WinForms');
    if (p.maui) technologies.push('.NET MAUI');
    if (p.web) technologies.push('ASP.NET Core');
    if (p.blazorWasm) technologies.push('Blazor');
    if (/Include="xunit"/i.test(p.text)) technologies.push('xUnit');
    if (/Include="nunit"/i.test(p.text)) technologies.push('NUnit');
    if (/Include="MSTest/i.test(p.text)) technologies.push('MSTest');
  }
  if (technologies.length === 0) technologies.push('C#', '.NET');

  const nonTest = projects.filter((p) => !p.test);
  const tests = projects.filter((p) => p.test);
  const app = nonTest.find((p) => p.wpf || p.winforms || p.maui) ?? nonTest.find((p) => p.web || p.blazorWasm) ?? nonTest.find((p) => p.exe) ?? null;
  const target = solutions.length === 1 ? solutions[0] : projects.length === 1 ? projects[0].rel : null;

  const commands = emptyCommands();
  if (target) {
    commands.install = `dotnet restore ${quoteArg(target)}`;
    commands.build = `dotnet build ${quoteArg(target)}`;
    if (tests.length > 0) commands.test = `dotnet test ${quoteArg(target)}`;
  } else {
    if (app) {
      commands.install = `dotnet restore ${quoteArg(app.rel)}`;
      commands.build = `dotnet build ${quoteArg(app.rel)}`;
    }
    if (tests.length > 0) commands.test = tests.map((t) => `dotnet test ${quoteArg(t.rel)}`).join(' && ');
  }
  if (app) {
    commands.run = `dotnet run --project ${quoteArg(app.rel)}`;
    commands.dev = commands.run;
    commands.package = `dotnet publish ${quoteArg(app.rel)} -c Release -o dist`;
  }

  let kind: ProjectKind = 'generic';
  let pv = preview('none');
  if (app && (app.wpf || app.winforms || app.maui)) {
    kind = 'desktop';
    pv = preview('desktop-run');
  } else if (app && app.web) {
    kind = 'backend';
    pv = preview('browser-dev-server');
  } else if (app && app.blazorWasm) {
    kind = 'web';
    pv = preview('browser-dev-server');
  } else if (app && app.exe && /OutputType>\s*WinExe/i.test(app.text)) {
    kind = 'desktop';
    pv = preview('desktop-run');
  }
  return { kind, technologies, commands, preview: pv, artifactGlobs: ['dist/**', '**/bin/Release/**'] };
}

// ------------------------------------------------------------------------------------------------ Python

function detectPython(root: string, platform: NodeJS.Platform): Detected | null {
  const pyproject = readText(join(root, 'pyproject.toml'));
  const requirements = readText(join(root, 'requirements.txt'));
  const devRequirements = readText(join(root, 'requirements-dev.txt'));
  const setupPy = existsSync(join(root, 'setup.py'));
  const pipfile = readText(join(root, 'Pipfile'));
  const setupCfg = readText(join(root, 'setup.cfg'));
  const hasPyFiles = listDir(root).some((e) => e.isFile() && e.name.endsWith('.py'));
  if (pyproject === null && requirements === null && !setupPy && pipfile === null && !hasPyFiles) return null;

  const allText = [pyproject, requirements, devRequirements, pipfile, setupCfg].filter(Boolean).join('\n').toLowerCase();
  const mentions = (name: string) => new RegExp(`(^|[^a-z0-9_-])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9_-]|$)`, 'm').test(allText);
  const testFiles = isDir(join(root, 'tests')) ? findFiles(join(root, 'tests'), /^test_.*\.py$|_test\.py$/, 2) : [];
  const pytest = mentions('pytest') || ['pytest.ini', 'conftest.py', 'tox.ini'].some((f) => existsSync(join(root, f)));

  const basePy = platform === 'win32' ? 'py -3' : 'python3';
  const venvPy = platform === 'win32' ? '.venv\\Scripts\\python.exe' : '.venv/bin/python';
  const commands = emptyCommands();
  if (requirements !== null) {
    commands.install = `${basePy} -m venv .venv && ${venvPy} -m pip install -r requirements.txt${devRequirements !== null ? ' -r requirements-dev.txt' : ''}`;
  } else if (pyproject !== null && /^\[(project|tool\.poetry)\]/m.test(pyproject)) {
    commands.install = `${basePy} -m venv .venv && ${venvPy} -m pip install -e .`;
  }
  const py = commands.install || existsSync(join(root, '.venv')) ? venvPy : basePy;
  if (pytest) commands.test = `${py} -m pytest`;
  else if (testFiles.length > 0) commands.test = `${py} -m unittest discover -s tests`;
  if (mentions('ruff')) commands.lint = `${py} -m ruff check .`;
  else if (mentions('flake8')) commands.lint = `${py} -m flake8`;
  if (mentions('mypy')) commands.typecheck = `${py} -m mypy .`;

  const technologies = ['Python'];
  let kind: ProjectKind = 'generic';
  let pv = preview('none');
  const has = (f: string) => existsSync(join(root, f));
  if (mentions('django') || has('manage.py')) {
    technologies.push('Django');
    kind = 'backend';
    if (has('manage.py')) commands.run = `${py} manage.py runserver 127.0.0.1:8000`;
  } else if (mentions('fastapi')) {
    technologies.push('FastAPI');
    kind = 'backend';
    const entry = ['main.py', 'app.py'].find(has);
    if (entry && mentions('uvicorn')) commands.run = `${py} -m uvicorn ${entry.replace(/\.py$/, '')}:app --host 127.0.0.1 --port 8000`;
  } else if (mentions('flask')) {
    technologies.push('Flask');
    kind = 'backend';
    const entry = ['app.py', 'main.py'].find(has);
    if (entry) commands.run = `${py} -m flask --app ${entry.replace(/\.py$/, '')} run --host 127.0.0.1`;
  } else {
    const entry = ['main.py', 'app.py'].find(has);
    if (entry) commands.run = `${py} ${entry}`;
    if (mentions('pygame')) technologies.push('Pygame');
    if (mentions('pyside6') || mentions('pyqt5') || mentions('pyqt6')) technologies.push('Qt');
  }
  if (pytest) technologies.push('pytest');
  commands.dev = commands.run;
  if (kind === 'backend' && commands.run) pv = preview('browser-dev-server');
  else if (commands.run && technologies.some((t) => t === 'Pygame' || t === 'Qt')) pv = preview('desktop-run');
  return { kind, technologies, commands, preview: pv, artifactGlobs: ['dist/**'] };
}

// ------------------------------------------------------------------------------------------------ engines

function godotVersion(text: string): string | null {
  const features = /config\/features\s*=\s*PackedStringArray\(([^)]*)\)/.exec(text)?.[1];
  const v = features ? /"(\d+\.\d+)"/.exec(features)?.[1] : null;
  if (v) return v;
  const cfg = /^config_version\s*=\s*(\d+)/m.exec(text)?.[1];
  if (cfg === '5') return '4';
  if (cfg === '4') return '3';
  return null;
}

// ------------------------------------------------------------------------------------------------ factory

export function createProjectDetector(s: Services, opts: DetectorOptions = {}): ProjectDetector {
  const platform = opts.platform ?? s.core.platform;
  const log = s.core.log.child('detector');

  async function resolveUnity(version: string | null): Promise<string | null> {
    try {
      return await s.integrations.resolvePath('unity', { version });
    } catch (e) {
      log.warn('Unity-Editor konnte nicht ermittelt werden', { error: errorMessage(e) });
      return null;
    }
  }

  return {
    async detect(dir) {
      if (!isDir(dir)) {
        throw new NovaError('VALIDATION', `Der Projektordner wurde nicht gefunden: ${dir}`, { severity: 'warning' });
      }
      const autoCommit = s.core.settings.section('agents').autoCommit;
      const rootEntries = listDir(dir);
      const rootFiles = rootEntries.filter((e) => e.isFile()).map((e) => e.name);
      const extraTech: string[] = [];
      let primary: Detected | null = null;

      // Unity
      if (isDir(join(dir, 'Assets')) && isDir(join(dir, 'ProjectSettings'))) {
        const version = readUnityVersion(dir);
        const exe = await resolveUnity(version);
        const commands = emptyCommands();
        if (exe) {
          commands.test = unityTestCommand(exe);
          commands.package = unityPackageCommand(exe, { novaBuildScript: existsSync(join(dir, ...NOVA_BUILD_SCRIPT.split('/'))), productName: basename(dir) });
        }
        primary = { kind: 'unity', technologies: ['Unity', 'C#'], commands, preview: preview('engine-external'), engineVersion: version, artifactGlobs: ['Builds/**'] };
      }

      // Unreal
      const uproject = rootFiles.find((f) => f.toLowerCase().endsWith('.uproject'));
      if (!primary && uproject) {
        const json = readJson(join(dir, uproject));
        const assoc = typeof json?.EngineAssociation === 'string' ? json.EngineAssociation : null;
        const technologies = ['Unreal Engine', isDir(join(dir, 'Source')) ? 'C++' : 'Blueprints'];
        primary = { kind: 'unreal', technologies, commands: emptyCommands(), preview: preview('engine-external'), engineVersion: assoc && /^\d/.test(assoc) ? assoc : null };
      }

      // Godot
      if (!primary && rootFiles.includes('project.godot')) {
        const text = readText(join(dir, 'project.godot')) ?? '';
        const technologies = ['Godot', 'GDScript'];
        if (rootFiles.some((f) => f.endsWith('.csproj'))) technologies.push('C#');
        primary = { kind: 'godot', technologies, commands: emptyCommands(), preview: preview('engine-external'), engineVersion: godotVersion(text) };
      }

      const solutions = rootFiles.filter((f) => /\.slnx?$/i.test(f));
      const projectFiles = findFiles(dir, /\.(csproj|fsproj|vbproj)$/i, 3);
      const pkg = rootFiles.includes('package.json') ? readJson(join(dir, 'package.json')) : null;

      if (!primary && (solutions.length > 0 || rootFiles.some((f) => /\.(csproj|fsproj|vbproj)$/i.test(f)))) {
        primary = detectDotnet(dir, solutions, projectFiles);
      }
      if (pkg) {
        const node = detectNode(dir, pkg);
        if (!primary) primary = node;
        else extraTech.push('Node.js');
      }
      if (!primary && projectFiles.length > 0) primary = detectDotnet(dir, solutions, projectFiles);
      const python = detectPython(dir, platform);
      if (python) {
        if (!primary) primary = python;
        else extraTech.push('Python');
      }
      if (!primary && rootFiles.includes('index.html')) {
        primary = { kind: 'web', technologies: ['HTML', 'CSS', 'JavaScript'], commands: emptyCommands(), preview: preview('browser-static', 'index.html'), artifactGlobs: [] };
      }
      if (!primary) {
        primary = { kind: 'generic', technologies: [], commands: emptyCommands(), preview: preview('none'), artifactGlobs: [] };
      }

      const base = defaultConfig(primary.kind, autoCommit);
      const config: ProjectConfig = {
        ...base,
        commands: primary.commands,
        preview: primary.preview,
        artifactGlobs: primary.artifactGlobs ?? base.artifactGlobs,
        engineVersion: primary.engineVersion ?? null,
      };
      return { kind: primary.kind, technologies: uniq([...primary.technologies, ...extraTech]), config };
    },
  };
}
