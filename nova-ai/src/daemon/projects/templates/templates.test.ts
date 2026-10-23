import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../../../tests/helpers/core';
import { buildChildEnv } from '../../core/child-env';
import { createWebGameTemplate } from './web-game';
import { createWebAppTemplate } from './web-app';
import { createBackendApiTemplate } from './backend-api';
import { createUnityTemplate, unityIdentifier } from './unity';
import { createDesktopDotnetTemplate, dotnetIdentifier } from './desktop-dotnet';
import { createEmptyTemplate } from './empty';
import { builtinTemplates } from './index';
import { csharpIdentifier, packageSlug, writeScaffold } from './common';
import { parseNodeTest } from '../../checks/parsers';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function dir(): string {
  const t = tempDir('nova-tpl-');
  cleanups.push(t.cleanup);
  return t.dir;
}

function runNode(args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, args, { cwd, env: buildChildEnv({ PORT: '' }), timeout: 30_000 }, (err, stdout, stderr) => {
      const code = err ? ((err as NodeJS.ErrnoException & { code?: number }).code as unknown as number) ?? 1 : 0;
      resolve({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

describe('node-based templates run their own test suites', () => {
  const cases = [
    { make: createWebGameTemplate, name: 'Sternensammler', minTests: 10 },
    { make: createWebAppTemplate, name: 'Meine Aufgaben', minTests: 9 },
    { make: createBackendApiTemplate, name: 'Notiz API', minTests: 6 },
  ];
  it.each(cases)('$name: node --test passes and the build script works', async ({ make, name, minTests }) => {
    const root = dir();
    const tpl = make();
    const res = await tpl.scaffold(root, { name, description: 'Ein Testprojekt.' });
    expect(res.files).toContain('package.json');
    expect(res.files).toContain('README.md');
    expect(res.files).toContain('.gitignore');
    expect(res.config.commands?.test).toBe('node --test');
    const test = await runNode(['--test'], root);
    const parsed = parseNodeTest(test.stdout, { root, platform: process.platform });
    expect(test.code, test.stdout + test.stderr).toBe(0);
    expect(parsed?.failed).toBe(0);
    expect(parsed?.passed ?? 0).toBeGreaterThanOrEqual(minTests);
    const build = await runNode(['scripts/build.mjs'], root);
    expect(build.code, build.stderr).toBe(0);
    expect(build.stdout).toMatch(/Build erfolgreich/);
  }, 30_000);

  it('the build script reports syntax errors with a non-zero exit code', async () => {
    const root = dir();
    await createWebGameTemplate().scaffold(root, { name: 'Kaputt', description: '' });
    writeFileSync(join(root, 'src', 'broken.js'), 'export const x = ;\n');
    const build = await runNode(['scripts/build.mjs'], root);
    expect(build.code).not.toBe(0);
    expect(build.stderr).toMatch(/SyntaxError/);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  }, 20_000);

  it('web templates copy the site into dist/', async () => {
    const root = dir();
    await createWebAppTemplate().scaffold(root, { name: 'Web', description: '' });
    const build = await runNode(['scripts/build.mjs'], root);
    expect(build.code).toBe(0);
    expect(existsSync(join(root, 'dist', 'index.html'))).toBe(true);
    expect(existsSync(join(root, 'dist', 'src', 'todos.js'))).toBe(true);
  }, 20_000);
});

describe('template contents', () => {
  it('web-game: German README with honest limits, dev server prints its URL and checks the Host header', async () => {
    const root = dir();
    const res = await createWebGameTemplate().scaffold(root, { name: 'Spiel <Test>', description: 'Sterne sammeln.' });
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toMatch(/Grenzen \(ehrlich\)/);
    expect(readme).toMatch(/Rechten des Windows-Kontos/);
    const html = readFileSync(join(root, 'index.html'), 'utf8');
    expect(html).toContain('Spiel &lt;Test&gt;');
    const server = readFileSync(join(root, 'server.mjs'), 'utf8');
    expect(server).toMatch(/421/);
    expect(server).toMatch(/127\.0\.0\.1/);
    expect(res.config.preview?.kind).toBe('browser-dev-server');
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name).toBe('spiel-test');
  });

  it('backend-api uses only node built-ins', async () => {
    const root = dir();
    await createBackendApiTemplate().scaffold(root, { name: 'API', description: '' });
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    expect(pkg.dependencies).toBeUndefined();
    expect(readFileSync(join(root, 'src', 'store.mjs'), 'utf8')).toMatch(/node:sqlite/);
    expect(readFileSync(join(root, '.gitignore'), 'utf8')).toMatch(/data\//);
  });

  it('unity: runtime + EditMode test assemblies, build script, no ProjectVersion.txt, commands only with an editor', async () => {
    const withoutUnity = dir();
    const res = await createUnityTemplate(async () => null).scaffold(withoutUnity, { name: 'Mein Spiel', description: '' });
    expect(res.config.commands?.test).toBeNull();
    expect(res.config.commands?.package).toBeNull();
    expect(res.notes[0]).toMatch(/kein Unity-Editor/);
    expect(existsSync(join(withoutUnity, 'ProjectSettings', 'ProjectVersion.txt'))).toBe(false);
    const id = unityIdentifier('Mein Spiel');
    expect(id).toBe('MeinSpiel');
    const tests = JSON.parse(readFileSync(join(withoutUnity, 'Assets', 'Tests', 'EditMode', `${id}.Tests.EditMode.asmdef`), 'utf8'));
    expect(tests.references).toContain(`${id}.Runtime`);
    expect(tests.defineConstraints).toContain('UNITY_INCLUDE_TESTS');
    const manifest = JSON.parse(readFileSync(join(withoutUnity, 'Packages', 'manifest.json'), 'utf8'));
    expect(manifest.dependencies['com.unity.test-framework']).toBeTruthy();
    const game = readFileSync(join(withoutUnity, 'Assets', 'Scripts', `${id}Game.cs`), 'utf8');
    expect(game).toContain(`public sealed class ${id}Game : MonoBehaviour`);
    expect(game).toContain('\r\n');
    expect(readFileSync(join(withoutUnity, '.gitignore'), 'utf8')).toMatch(/\[Ll\]ibrary/);

    const withUnity = dir();
    const exe = 'C:\\Program Files\\Unity\\Hub\\Editor\\2022.3.10f1\\Editor\\Unity.exe';
    const res2 = await createUnityTemplate(async () => exe).scaffold(withUnity, { name: 'Mein Spiel', description: '' });
    expect(res2.config.commands?.test).toBe(`"${exe}" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults TestResults/editmode.xml -logFile -`);
    expect(res2.config.commands?.package).toContain('-executeMethod NovaBuild.BuildWindows');
    expect(res2.config.preview?.kind).toBe('engine-external');
  });

  it('desktop-dotnet: solution with WPF app, core library and xUnit tests (CRLF)', async () => {
    const root = dir();
    const res = await createDesktopDotnetTemplate().scaffold(root, { name: 'Notiz Programm', description: '' });
    const id = dotnetIdentifier('Notiz Programm');
    expect(id).toBe('NotizProgramm');
    const sln = readFileSync(join(root, `${id}.sln`), 'utf8');
    expect(sln).toContain(`src\\${id}\\${id}.csproj`);
    expect(sln).toContain(`tests\\${id}.Core.Tests\\${id}.Core.Tests.csproj`);
    expect(sln).toContain('\r\n');
    const app = readFileSync(join(root, 'src', id, `${id}.csproj`), 'utf8');
    expect(app).toMatch(/<UseWPF>true<\/UseWPF>/);
    expect(app).toMatch(/net8\.0-windows/);
    const tests = readFileSync(join(root, 'tests', `${id}.Core.Tests`, `${id}.Core.Tests.csproj`), 'utf8');
    expect(tests).toMatch(/xunit/);
    expect(res.config.commands).toMatchObject({ build: `dotnet build ${id}.sln`, test: `dotnet test ${id}.sln`, install: `dotnet restore ${id}.sln` });
    expect(res.config.preview?.kind).toBe('desktop-run');
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toMatch(/nur unter Windows/);
  });

  it('empty template only writes README and .gitignore', async () => {
    const root = dir();
    const res = await createEmptyTemplate().scaffold(root, { name: 'Leer', description: '' });
    expect(res.files.sort()).toEqual(['.gitignore', 'README.md']);
  });

  it('all built-in templates have unique ids and German names', () => {
    const list = builtinTemplates({ resolveUnity: async () => null });
    expect(list.map((t) => t.info.id)).toEqual(['web-game', 'web-app', 'unity', 'desktop-dotnet', 'backend-api', 'empty']);
    for (const t of list) expect(t.info.name.length).toBeGreaterThan(3);
  });
});

describe('scaffold helpers', () => {
  it('never overwrites existing files and cleans up after a failure', () => {
    const root = dir();
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'b.txt'), 'user file');
    expect(() => writeScaffold(root, { 'a/one.txt': '1', 'src/b.txt': '2' })).toThrow();
    expect(existsSync(join(root, 'a'))).toBe(false);
    expect(readFileSync(join(root, 'src', 'b.txt'), 'utf8')).toBe('user file');
    expect(() => writeScaffold(root, { '../escape.txt': 'x' })).toThrow(/Ungültiger Vorlagenpfad/);
  });

  it('derives identifiers and slugs', () => {
    expect(csharpIdentifier('3D Würfel-Spiel!')).toBe('NovaApp3dWuerfelSpiel');
    expect(packageSlug('Über   Cool!')).toBe('ueber-cool');
    expect(packageSlug('!!!')).toBe('nova-projekt');
    expect(unityIdentifier('Score Board')).toBe('ScoreBoardProjekt');
  });
});
