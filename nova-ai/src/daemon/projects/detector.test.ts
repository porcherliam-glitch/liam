import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { IntegrationService } from '../contracts';
import { createProjectDetector } from './detector';
import { createWebGameTemplate } from './templates/web-game';
import { createBackendApiTemplate } from './templates/backend-api';
import { createDesktopDotnetTemplate } from './templates/desktop-dotnet';
import { fakeIntegrations } from './test-support';

let t: TestCore;
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  t?.cleanup();
});

function project(files: Record<string, string>): string {
  const d = tempDir('nova-detect-');
  cleanups.push(d.cleanup);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(d.dir, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    if (!rel.endsWith('/')) writeFileSync(abs, content);
  }
  return d.dir;
}

function detector(platform: NodeJS.Platform = 'linux', unity: string | null = null) {
  t = createTestCore();
  const integrations = fakeIntegrations({ node: true }, unity);
  const s = makeServices(t.core, { integrations: integrations as unknown as IntegrationService });
  return { d: createProjectDetector(s, { platform }), integrations };
}

describe('ProjectDetector', () => {
  it('Vite + React with npm lockfile, tsconfig and playwright', async () => {
    const dir = project({
      'package.json': JSON.stringify({ scripts: { dev: 'vite', build: 'vite build', test: 'vitest run', lint: 'eslint .' }, dependencies: { react: '^19' }, devDependencies: { vite: '^7', vitest: '^3', typescript: '^5' } }),
      'package-lock.json': '{}',
      'tsconfig.json': '{}',
      'playwright.config.ts': '',
      'index.html': '<html></html>',
    });
    const { d } = detector();
    const r = await d.detect(dir);
    expect(r.kind).toBe('web');
    expect(r.technologies).toEqual(expect.arrayContaining(['Node.js', 'React', 'Vite', 'Vitest', 'TypeScript']));
    expect(r.config.commands).toMatchObject({
      install: 'npm ci',
      dev: 'npm run dev',
      build: 'npm run build',
      test: 'npm test',
      lint: 'npm run lint',
      typecheck: 'npx tsc --noEmit',
      e2e: 'npx playwright test',
      security: 'npm audit --omit=dev --audit-level=high',
    });
    expect(r.config.preview).toEqual({ kind: 'browser-dev-server', entry: 'index.html', url: null });
    expect(r.config.artifactGlobs).toEqual(['dist/**', 'build/**']);
  });

  it('pnpm express backend; npm default test script is ignored', async () => {
    const dir = project({
      'package.json': JSON.stringify({ scripts: { start: 'node index.js', test: 'echo "Error: no test specified" && exit 1', typecheck: 'tsc -p .' }, dependencies: { express: '^5' } }),
      'pnpm-lock.yaml': '',
    });
    const { d } = detector();
    const r = await d.detect(dir);
    expect(r.kind).toBe('backend');
    expect(r.config.commands).toMatchObject({ install: 'pnpm install --frozen-lockfile', test: null, dev: 'pnpm start', run: 'pnpm start', typecheck: 'pnpm typecheck', security: 'pnpm audit --prod --audit-level high' });
    expect(r.config.preview.kind).toBe('browser-dev-server');
  });

  it('Electron app → desktop with package command', async () => {
    const dir = project({ 'package.json': JSON.stringify({ scripts: { start: 'electron .', dist: 'electron-builder' }, devDependencies: { electron: '^45' } }) });
    const { d } = detector();
    const r = await d.detect(dir);
    expect(r.kind).toBe('desktop');
    expect(r.config.commands.package).toBe('npm run dist');
    expect(r.config.preview.kind).toBe('desktop-run');
  });

  it('recognizes the zero-dependency templates', async () => {
    const game = tempDir();
    cleanups.push(game.cleanup);
    await createWebGameTemplate().scaffold(game.dir, { name: 'Spiel', description: '' });
    const api = tempDir();
    cleanups.push(api.cleanup);
    await createBackendApiTemplate().scaffold(api.dir, { name: 'API', description: '' });
    const { d } = detector();
    const g = await d.detect(game.dir);
    expect(g.kind).toBe('web');
    expect(g.config.commands).toMatchObject({ install: null, test: 'npm test', dev: 'npm run dev', build: 'npm run build', security: null });
    expect(g.technologies).toEqual(expect.arrayContaining(['HTML', 'CSS', 'JavaScript']));
    const a = await d.detect(api.dir);
    expect(a.kind).toBe('backend');
    expect(a.config.preview.kind).toBe('browser-dev-server');
  });

  it('Unity project: engine version, matching editor, package command with the NOVA build script', async () => {
    const dir = project({ 'Assets/Editor/NovaBuild.cs': '// build', 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 2022.3.10f1\nm_EditorVersionWithRevision: 2022.3.10f1 (abc)\n' });
    const exe = 'C:\\Program Files\\Unity\\Hub\\Editor\\2022.3.10f1\\Editor\\Unity.exe';
    const { d, integrations } = detector('win32', exe);
    const r = await d.detect(dir);
    expect(r.kind).toBe('unity');
    expect(r.config.engineVersion).toBe('2022.3.10f1');
    expect(integrations.resolveCalls).toContainEqual({ id: 'unity', version: '2022.3.10f1' });
    expect(r.config.commands.test).toContain('-runTests -testPlatform EditMode');
    expect(r.config.commands.package).toContain('NovaBuild.BuildWindows');
    expect(r.config.preview.kind).toBe('engine-external');
  });

  it('Unity project without a matching editor has no commands', async () => {
    const dir = project({ 'Assets/x.txt': '', 'ProjectSettings/ProjectVersion.txt': 'm_EditorVersion: 6000.0.1f1\n' });
    const { d } = detector('win32', null);
    const r = await d.detect(dir);
    expect(r.config.commands.test).toBeNull();
    expect(r.config.engineVersion).toBe('6000.0.1f1');
  });

  it('Godot and Unreal', async () => {
    const { d } = detector();
    const godot = await d.detect(project({ 'project.godot': 'config_version=5\n[application]\nconfig/features=PackedStringArray("4.2", "Forward Plus")\n' }));
    expect(godot).toMatchObject({ kind: 'godot', config: { engineVersion: '4.2', preview: { kind: 'engine-external' } } });
    const unreal = await d.detect(project({ 'Shooter.uproject': JSON.stringify({ EngineAssociation: '5.3' }), 'Source/x.cpp': '' }));
    expect(unreal.kind).toBe('unreal');
    expect(unreal.config.engineVersion).toBe('5.3');
    expect(unreal.technologies).toContain('C++');
  });

  it('.NET solution with WPF app and xUnit tests (template)', async () => {
    const dir = tempDir();
    cleanups.push(dir.cleanup);
    await createDesktopDotnetTemplate().scaffold(dir.dir, { name: 'Rechner', description: '' });
    const { d } = detector();
    const r = await d.detect(dir.dir);
    expect(r.kind).toBe('desktop');
    expect(r.technologies).toEqual(expect.arrayContaining(['C#', '.NET 8', 'WPF', 'xUnit']));
    expect(r.config.commands).toMatchObject({
      build: 'dotnet build Rechner.sln',
      test: 'dotnet test Rechner.sln',
      install: 'dotnet restore Rechner.sln',
      run: 'dotnet run --project src/Rechner/Rechner.csproj',
      package: 'dotnet publish src/Rechner/Rechner.csproj -c Release -o dist',
    });
    expect(r.config.preview.kind).toBe('desktop-run');
  });

  it('ASP.NET Core project without solution → backend', async () => {
    const dir = project({ 'Api.csproj': '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>' });
    const { d } = detector();
    const r = await d.detect(dir);
    expect(r.kind).toBe('backend');
    expect(r.technologies).toEqual(expect.arrayContaining(['ASP.NET Core', '.NET 8']));
    expect(r.config.commands.build).toBe('dotnet build Api.csproj');
  });

  it('Python with requirements and pytest – venv commands per platform', async () => {
    const files = { 'requirements.txt': 'flask==3.0\npytest==8.0\n', 'app.py': 'print(1)', 'tests/test_app.py': '' };
    const linux = await detector('linux').d.detect(project(files));
    expect(linux.kind).toBe('backend');
    expect(linux.technologies).toEqual(expect.arrayContaining(['Python', 'Flask', 'pytest']));
    expect(linux.config.commands.install).toBe('python3 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt');
    expect(linux.config.commands.test).toBe('.venv/bin/python -m pytest');
    t.cleanup();
    const win = await detector('win32').d.detect(project(files));
    expect(win.config.commands.install).toBe('py -3 -m venv .venv && .venv\\Scripts\\python.exe -m pip install -r requirements.txt');
    expect(win.config.commands.run).toBe('.venv\\Scripts\\python.exe -m flask --app app run --host 127.0.0.1');
  });

  it('static HTML and empty folders', async () => {
    const { d } = detector();
    const web = await d.detect(project({ 'index.html': '<html></html>' }));
    expect(web).toMatchObject({ kind: 'web', config: { preview: { kind: 'browser-static', entry: 'index.html' } } });
    const empty = await d.detect(project({ 'notes/': '' }));
    expect(empty.kind).toBe('generic');
    expect(Object.values(empty.config.commands).every((c) => c === null)).toBe(true);
    expect(empty.config.preview.kind).toBe('none');
  });

  it('fails with VALIDATION for a missing folder', async () => {
    const { d } = detector();
    await expect(d.detect('/definitely/not/here')).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
