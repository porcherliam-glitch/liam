// Tests of PathGuard: POSIX behaviour on the real file system (escapes, symlinks, protection, sensitive files) and the
// Windows rules via platform + fake file system injection (case folding, UNC/device paths, ADS, reserved names …).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, symlinkSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCore, tempDir, type TestCore } from '../../../../tests/helpers/core';
import { makeServices } from '../../../../tests/helpers/services';
import { createPathGuard, validatePathInput, type PathGuardFs } from './path-guard';

let t: TestCore;
const cleanups: Array<() => void> = [];
afterEach(() => {
  t?.cleanup();
  while (cleanups.length) cleanups.pop()!();
});

function posixGuard() {
  t = createTestCore();
  const proj = tempDir();
  const outside = tempDir('nova-outside-');
  cleanups.push(proj.cleanup, outside.cleanup);
  const s = makeServices(t.core);
  return { guard: createPathGuard(s, { platform: 'linux' }), root: realpathSync.native(proj.dir), outside: realpathSync.native(outside.dir) };
}

/** Case-insensitive fake Windows file system: `existing` maps lower-case paths to on-disk case. */
function fakeWinFs(existing: string[], links: Record<string, string> = {}): PathGuardFs {
  const map = new Map(existing.map((p) => [p.toLowerCase(), p]));
  return {
    exists: (p) => map.has(p.toLowerCase().replace(/\\+$/, '')) || p.toLowerCase() in links,
    realpath: (p) => {
      const k = p.toLowerCase().replace(/\\+$/, '');
      for (const [from, to] of Object.entries(links)) {
        if (k === from || k.startsWith(from + '\\')) return to + p.slice(from.length);
      }
      const hit = map.get(k);
      if (!hit) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return hit;
    },
  };
}

function winGuard(existing: string[] = ['C:\\Projekte\\Spiel', 'C:\\Projekte\\Spiel\\Src', 'C:\\Projekte\\Spiel\\Src\\App.ts', 'C:\\Projekte', 'C:\\'], links: Record<string, string> = {}) {
  t = createTestCore();
  const s = makeServices(t.core);
  return createPathGuard(s, { platform: 'win32', fs: fakeWinFs(existing, links), dataDir: 'C:\\Users\\Ana\\AppData\\Local\\NOVA AI' });
}

describe('PathGuard (POSIX, real file system)', () => {
  it('resolves relative paths inside the project with rel and key', () => {
    const { guard, root } = posixGuard();
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src', 'App.ts'), '');
    expect(guard.resolve(root, 'src/App.ts')).toEqual({ abs: join(root, 'src', 'App.ts'), rel: 'src/App.ts', key: 'src/App.ts' });
    expect(guard.resolve(root, './src//new/../x.ts')).toEqual({ abs: join(root, 'src', 'x.ts'), rel: 'src/x.ts', key: 'src/x.ts' });
    expect(guard.resolve(root, '.')).toEqual({ abs: root, rel: '', key: '' });
    expect(guard.resolve(root, '  src/App.ts\t'.replace('\t', ' ')).rel).toBe('src/App.ts');
    expect(guard.resolve(root, join(root, 'src/App.ts')).rel).toBe('src/App.ts');
  });

  it('rejects escapes, absolute paths outside, NUL/control characters', () => {
    const { guard, root, outside } = posixGuard();
    expect(() => guard.resolve(root, '../x')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, 'a/../../x')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, join(outside, 'x'))).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, '/etc/passwd')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, 'a\u0000b')).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() => guard.resolve(root, 'a\nb')).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() => guard.resolve(join(root, 'missing-root'), 'x')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('follows symlinks of the deepest existing ancestor: links out of the project are rejected, links inside are fine', () => {
    const { guard, root, outside } = posixGuard();
    symlinkSync(outside, join(root, 'evil'));
    expect(() => guard.resolve(root, 'evil/new-file.txt')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    writeFileSync(join(outside, 'secret.txt'), 's');
    symlinkSync(join(outside, 'secret.txt'), join(root, 'link.txt'));
    expect(() => guard.resolve(root, 'link.txt')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    mkdirSync(join(root, 'real'));
    symlinkSync(join(root, 'real'), join(root, 'alias'));
    expect(guard.resolve(root, 'alias/file.ts')).toMatchObject({ rel: 'real/file.ts' });
    expect(guard.isInside(root, join(root, 'alias', 'x'))).toBe(true);
    expect(guard.isInside(root, join(root, 'evil', 'x'))).toBe(false);
  });

  it('protects .git (any depth), top-level .nova and the data dir', () => {
    const { guard, root } = posixGuard();
    expect(guard.isProtected(root, '.git')).toBe(true);
    expect(guard.isProtected(root, '.git/config')).toBe(true);
    expect(guard.isProtected(root, 'vendor/lib/.git/HEAD')).toBe(true);
    expect(guard.isProtected(root, '.GIT/hooks/pre-commit')).toBe(true);
    expect(guard.isProtected(root, '.nova/state.json')).toBe(true);
    expect(guard.isProtected(root, 'src/.gitignore')).toBe(false);
    expect(guard.isProtected(root, '.github/workflows/ci.yml')).toBe(false);
    expect(guard.isProtected(root, 'src/app.ts')).toBe(false);
    // a project that contains the data dir
    const s2 = makeServices(t.core);
    const guard2 = createPathGuard(s2, { platform: 'linux', dataDir: join(root, 'data') });
    mkdirSync(join(root, 'data'));
    expect(guard2.isProtected(root, 'data/nova.db')).toBe(true);
    expect(guard2.isProtected(root, 'database.ts')).toBe(false);
  });

  it('classifies sensitive files', () => {
    const { guard } = posixGuard();
    const yes = ['.env', 'config/.env.local', '.env.production', 'certs/server.pem', 'tls.key', 'cert.pfx', 'a.p12', '.ssh/id_rsa', 'id_rsa.pub', 'id_ed25519', '.npmrc', '.pypirc', '.git-credentials', 'credentials.json', 'credentials-prod.json', 'secrets.yaml', 'SECRETS.json', 'Keys\\api.KEY'];
    const no = ['.env.example', '.env.sample', '.env.template', 'src/env.ts', 'keyboard.ts', 'credentials.ts', 'my-secrets.md', 'README.md', 'monkey.json'];
    for (const p of yes) expect([p, guard.isSensitive(p)]).toEqual([p, true]);
    for (const p of no) expect([p, guard.isSensitive(p)]).toEqual([p, false]);
  });
});

describe('PathGuard (Windows rules, injected platform)', () => {
  const root = 'C:\\Projekte\\Spiel';

  it('compares case-insensitively and lower-cases the key, keeping on-disk case in rel', () => {
    const guard = winGuard();
    expect(guard.resolve(root, 'src/app.ts')).toEqual({ abs: 'C:\\Projekte\\Spiel\\Src\\App.ts', rel: 'Src/App.ts', key: 'src/app.ts' });
    expect(guard.resolve('c:\\projekte\\spiel', 'SRC\\neu\\Datei.cs')).toEqual({ abs: 'C:\\Projekte\\Spiel\\Src\\neu\\Datei.cs', rel: 'Src/neu/Datei.cs', key: 'src/neu/datei.cs' });
    expect(guard.resolve(root, 'C:\\PROJEKTE\\spiel\\Src\\App.ts').rel).toBe('Src/App.ts');
    expect(guard.resolve(root, 'C:/Projekte/Spiel/readme.md').rel).toBe('readme.md');
  });

  it('rejects paths outside the project, other drives and current-drive-rooted paths', () => {
    const guard = winGuard();
    expect(() => guard.resolve(root, '..\\Anderes\\x.txt')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, 'D:\\daten\\x.txt')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, '\\Windows\\System32\\x.dll')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
    expect(() => guard.resolve(root, 'C:\\Projekte\\SpielZwei\\x')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
  });

  it('rejects junctions that point outside the project', () => {
    const guard = winGuard(['C:\\Projekte\\Spiel', 'C:\\Projekte\\Spiel\\Link', 'C:\\Windows'], { 'c:\\projekte\\spiel\\link': 'C:\\Windows' });
    expect(() => guard.resolve(root, 'Link\\system.ini')).toThrow(expect.objectContaining({ code: 'PATH_OUTSIDE_PROJECT' }));
  });

  it.each([
    ['\\\\server\\share\\x.txt', 'UNC'],
    ['//server/share/x.txt', 'UNC (slashes)'],
    ['\\\\?\\C:\\Projekte\\Spiel\\x', 'device \\\\?\\'],
    ['\\\\.\\pipe\\nova', 'device \\\\.\\'],
    ['\\??\\C:\\x', 'NT object path'],
    ['C:datei.txt', 'drive-relative'],
    ['C:', 'bare drive'],
    ['src\\file.txt:stream', 'alternate data stream'],
    ['file.txt::$DATA', 'ADS $DATA'],
    ['src\\a<b.ts', '<'],
    ['src\\a>b.ts', '>'],
    ['src\\a"b.ts', 'quote'],
    ['src\\a|b.ts', 'pipe'],
    ['src\\a?.ts', '?'],
    ['src\\*.ts', '*'],
    ['src\\name.', 'trailing dot'],
    ['src\\name \\x.ts', 'trailing space in folder'],
    ['...', 'only dots'],
    ['CON', 'CON'],
    ['src\\con.txt', 'con with extension'],
    ['Prn.log', 'PRN'],
    ['aux', 'AUX'],
    ['NUL.json', 'NUL'],
    ['COM1', 'COM1'],
    ['com9.txt', 'COM9'],
    ['COM0', 'COM0'],
    ['LPT1', 'LPT1'],
    ['lpt9.md', 'LPT9'],
    ['COM¹', 'COM superscript 1'],
    ['LPT³.txt', 'LPT superscript 3'],
    ['CONIN$', 'CONIN$'],
    ['conout$.txt', 'CONOUT$'],
    ['CLOCK$', 'CLOCK$'],
    ['con .txt', 'reserved name with trailing space before extension'],
    ['a\u0001b', 'control character'],
  ])('rejects %s (%s) with VALIDATION', (input) => {
    const guard = winGuard();
    expect(() => guard.resolve(root, input)).toThrow(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() => validatePathInput(input, 'win32')).toThrow();
  });

  it.each(['console.log', 'Configuration\\conf.ts', 'com10.txt', 'lpt.txt', 'my.aux.file', 'src\\.env.local', 'a..b.ts', '.gitignore'])('accepts %s', (input) => {
    const guard = winGuard();
    expect(() => guard.resolve(root, input)).not.toThrow();
  });

  it('the same inputs are fine on POSIX where those characters are legal', () => {
    expect(() => validatePathInput('file.txt:stream', 'linux')).not.toThrow();
    expect(() => validatePathInput('CON', 'linux')).not.toThrow();
    expect(() => validatePathInput('a\u0000', 'linux')).toThrow();
  });

  it('protects the data dir and .git case-insensitively', () => {
    const guard = winGuard(['C:\\Users\\Ana\\AppData\\Local\\NOVA AI', 'C:\\Users\\Ana\\AppData\\Local', 'C:\\Users\\Ana', 'C:\\Users']);
    expect(guard.isProtected('C:\\Users\\Ana', 'appdata/local/nova ai/nova.db')).toBe(true);
    expect(guard.isProtected('C:\\Users\\Ana', 'appdata/local/nova ai')).toBe(true);
    expect(guard.isProtected('C:\\Users\\Ana', 'appdata/local/nova ai2/x')).toBe(false);
    expect(guard.isProtected('C:\\Users\\Ana', '.Git/config')).toBe(true);
  });
});
