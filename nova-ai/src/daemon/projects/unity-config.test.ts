import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../../tests/helpers/core';
import { defaultConfig, emptyCommands, mergeConfig, parseStoredConfig } from './config';
import { createKnownFolderProvider } from './root-safety';
import { safeFolderName } from './project-service';
import { isUnityBatchCommand, isUnityProjectOpen, readUnityVersion, replaceUnityExecutable, unityPackageCommand, unityResultsPath, unityTestCommand } from './unity';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe('unity helpers', () => {
  const exe = 'C:\\Program Files\\Unity\\Hub\\Editor\\2022.3.10f1\\Editor\\Unity.exe';

  it('builds, recognizes and rewrites Unity batch commands', () => {
    const cmd = unityTestCommand(exe);
    expect(isUnityBatchCommand(cmd)).toBe(true);
    expect(isUnityBatchCommand('npm test')).toBe(false);
    expect(unityResultsPath(cmd)).toBe('TestResults/editmode.xml');
    expect(unityResultsPath('"x" -testResults "Test Results/a.xml"')).toBe('Test Results/a.xml');
    const replaced = replaceUnityExecutable(cmd, 'D:\\Unity\\6000.0.1f1\\Editor\\Unity.exe');
    expect(replaced).toBe('"D:\\Unity\\6000.0.1f1\\Editor\\Unity.exe" -batchmode -nographics -projectPath . -runTests -testPlatform EditMode -testResults TestResults/editmode.xml -logFile -');
    expect(replaceUnityExecutable('/opt/Unity -batchmode -projectPath .', '/new/Unity')).toBe('"/new/Unity" -batchmode -projectPath .');
    expect(unityPackageCommand(exe, { novaBuildScript: false, productName: 'Mein Spiel!' })).toContain('-buildWindows64Player Builds/Windows/MeinSpiel.exe');
  });

  it('reads ProjectVersion.txt and detects an open project (POSIX: lockfile exists; Windows: lock held)', () => {
    const t = tempDir();
    cleanups.push(t.cleanup);
    expect(readUnityVersion(t.dir)).toBeNull();
    mkdirSync(join(t.dir, 'ProjectSettings'));
    writeFileSync(join(t.dir, 'ProjectSettings', 'ProjectVersion.txt'), 'm_EditorVersion: 2022.3.10f1\r\nm_EditorVersionWithRevision: 2022.3.10f1 (x)\r\n');
    expect(readUnityVersion(t.dir)).toBe('2022.3.10f1');
    expect(isUnityProjectOpen(t.dir, 'linux')).toBe(false);
    mkdirSync(join(t.dir, 'Temp'));
    writeFileSync(join(t.dir, 'Temp', 'UnityLockfile'), '');
    expect(isUnityProjectOpen(t.dir, 'linux')).toBe(true);
    // Windows branch: the file can be opened (no editor holds it) → not open.
    expect(isUnityProjectOpen(t.dir, 'win32')).toBe(false);
  });
});

describe('config helpers', () => {
  it('default configs per kind', () => {
    expect(defaultConfig('web', true)).toMatchObject({ preview: { kind: 'browser-static', entry: 'index.html' }, autoCommit: true, artifactGlobs: ['dist/**', 'build/**'] });
    expect(defaultConfig('unity', false)).toMatchObject({ preview: { kind: 'engine-external' }, autoCommit: false });
    expect(defaultConfig('desktop', true).preview.kind).toBe('desktop-run');
    expect(defaultConfig('generic', true).preview.kind).toBe('none');
    expect(Object.values(emptyCommands()).every((v) => v === null)).toBe(true);
  });

  it('merges commands and preview deeply, replaces everything else, ignores undefined', () => {
    const base = mergeConfig(defaultConfig('web', true), { commands: emptyCommands({ test: 'a', build: 'b' }), allowedCommands: ['x'] });
    const merged = mergeConfig(base, { commands: { test: 'c' }, preview: { url: 'http://127.0.0.1:1/' }, allowedCommands: ['y'], conventions: undefined });
    expect(merged.commands).toMatchObject({ test: 'c', build: 'b' });
    expect(merged.preview).toEqual({ kind: 'browser-static', entry: 'index.html', url: 'http://127.0.0.1:1/' });
    expect(merged.allowedCommands).toEqual(['y']);
    expect(merged.conventions).toBe('');
  });

  it('parses stored configs robustly', () => {
    expect(parseStoredConfig(null, 'backend', true).preview.kind).toBe('browser-dev-server');
    expect(parseStoredConfig({ commands: { test: 5 }, reviewChanges: false }, 'web', true)).toMatchObject({ reviewChanges: false, commands: { test: null } });
  });

  it('safe folder names', () => {
    expect(safeFolderName('Mein: Spiel?')).toBe('Mein Spiel');
    expect(safeFolderName('con')).toBe('con Projekt');
    expect(safeFolderName('...')).toBe('Projekt');
    expect(safeFolderName('x'.repeat(80)).length).toBe(60);
  });

  it('known-folder provider is a no-op outside Windows', async () => {
    expect(await createKnownFolderProvider('linux', () => undefined)()).toEqual([]);
  });
});
