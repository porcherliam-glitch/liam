import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, realpathSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from '../../../tests/helpers/core';
import { canonicalize, checkProjectRoot, fallbackKnownFolders, parseKnownFoldersJson, pathKey, ROOT_REJECT_PREFIX, type RootSafetyEnv } from './root-safety';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

/** Windows environment on a fake file system (only the listed paths "exist", case-insensitively). */
function winEnv(overrides: Partial<RootSafetyEnv> = {}): RootSafetyEnv {
  const existing = ['C:\\', 'C:\\Users', 'C:\\Users\\Ada', 'C:\\Users\\Ada\\Documents', 'C:\\Users\\Ada\\OneDrive', 'C:\\Users\\Ada\\OneDrive\\Desktop', 'C:\\Windows', 'C:\\Program Files', 'D:\\', 'D:\\Spiele', 'C:\\Users\\Ada\\AppData\\Local\\NOVA AI'];
  const env: Record<string, string> = {
    USERPROFILE: 'C:\\Users\\Ada',
    WINDIR: 'C:\\Windows',
    ProgramFiles: 'C:\\Program Files',
    'ProgramFiles(x86)': 'C:\\Program Files (x86)',
    ProgramData: 'C:\\ProgramData',
    APPDATA: 'C:\\Users\\Ada\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\Ada\\AppData\\Local',
    OneDrive: 'C:\\Users\\Ada\\OneDrive',
  };
  return {
    platform: 'win32',
    realpath: (p) => existing.find((e) => e.toLowerCase() === p.toLowerCase().replace(/\\$/, '') || e.toLowerCase() === p.toLowerCase()) ?? null,
    env,
    homeDir: 'C:\\Users\\Ada',
    knownFolders: ['C:\\Users\\Ada\\OneDrive\\Desktop', 'C:\\Users\\Ada\\Documents', 'C:\\Users\\Ada\\Downloads'],
    dataDir: 'C:\\Users\\Ada\\AppData\\Local\\NOVA AI',
    otherProjects: [{ id: 'prj_1', name: 'Altes Spiel', path: 'D:\\Spiele\\Altes Spiel' }],
    ...overrides,
  };
}

function expectReject(fn: () => unknown, reason: RegExp) {
  try {
    fn();
  } catch (e) {
    expect((e as Error).message.startsWith(ROOT_REJECT_PREFIX)).toBe(true);
    expect((e as Error).message).toMatch(reason);
    expect((e as { code?: string }).code).toBe('VALIDATION');
    return;
  }
  throw new Error('expected a rejection');
}

describe('root safety on Windows (fake file system)', () => {
  it('accepts a normal project folder below the profile and a non-existing new folder', () => {
    const r = checkProjectRoot('C:\\Users\\Ada\\NOVA Projekte\\Mein Spiel', winEnv());
    expect(r.canonical).toBe('C:\\Users\\Ada\\NOVA Projekte\\Mein Spiel');
    expect(r.key).toBe('c:\\users\\ada\\nova projekte\\mein spiel');
    expect(r.warnings).toEqual([]);
    expect(checkProjectRoot('c:\\users\\ada\\documents\\Projekt', winEnv()).canonical).toBe('C:\\Users\\Ada\\Documents\\Projekt');
  });

  it.each([
    ['C:\\', /ganzes Laufwerk/],
    ['D:\\', /ganzes Laufwerk/],
    ['\\\\server\\share', /Netzwerkfreigabe/],
    ['C:\\Users\\Ada', /Benutzerordner ist zu groß/],
    ['c:\\USERS\\ada\\documents', /Windows-Benutzerordner/],
    ['C:\\Users\\Ada\\Downloads', /Windows-Benutzerordner/],
    ['C:\\Users\\Ada\\OneDrive\\Desktop\\', /Windows-Benutzerordner/],
    ['C:\\Windows\\Temp\\x', /Windows-Systemordner/],
    ['C:\\Program Files\\Tool', /Programme-Ordner/],
    ['C:\\Program Files (x86)', /Programme-Ordner/],
    ['C:\\ProgramData\\x', /ProgramData/],
    ['C:\\Users\\Ada\\AppData\\Roaming\\x', /AppData-Ordner \(Roaming\)/],
    ['C:\\Users\\Ada\\AppData\\Local\\Programs\\x', /AppData-Ordner \(Local\)/],
    ['D:\\Spiele\\Altes Spiel', /bereits als Projekt „Altes Spiel“/],
    ['D:\\Spiele\\Altes Spiel\\Assets', /im Ordner des Projekts/],
    ['D:\\Spiele', /enthält den Ordner des Projekts/],
  ])('rejects %s', (input, reason) => {
    expectReject(() => checkProjectRoot(input, winEnv()), reason);
  });

  it('rejects the data dir, its parents and its children', () => {
    const env = winEnv({ env: { USERPROFILE: 'C:\\Users\\Ada' }, dataDir: 'D:\\NOVA Daten' });
    expectReject(() => checkProjectRoot('D:\\NOVA Daten\\projekte\\x', env), /Datenordner von NOVA/);
    expectReject(() => checkProjectRoot('D:\\NOVA Daten', env), /Datenordner von NOVA/);
  });

  it.each([
    ['C:relative\\path', /vollständigen Pfad/],
    ['projekte\\x', /vollständigen Ordnerpfad/],
    ['\\\\?\\C:\\x', /Geräte- und Sonderpfade/],
    ['\\\\.\\pipe\\x', /Geräte- und Sonderpfade/],
    ['C:\\Projekte\\a|b', /nicht erlaubt/],
    ['C:\\Projekte\\file.txt:stream', /nicht erlaubt/],
    ['C:\\Projekte\\CON', /reservierter Windows-Name/],
    ['C:\\Projekte\\lpt1.txt', /reservierter Windows-Name/],
    ['C:\\Projekte\\name.', /Punkt oder Leerzeichen/],
    ['C:\\Projekte\\a\u0001b', /Steuerzeichen/],
    ['', /kein Ordner/],
  ])('rejects invalid input %j', (input, reason) => {
    expectReject(() => checkProjectRoot(input, winEnv()), reason);
  });

  it('warns about OneDrive and long paths', () => {
    const od = checkProjectRoot('C:\\Users\\Ada\\OneDrive\\Projekte\\Spiel', winEnv());
    expect(od.warnings.join(' ')).toMatch(/OneDrive/);
    const corporate = checkProjectRoot('C:\\Users\\Ada\\OneDrive - Firma\\Spiel', winEnv({ env: { USERPROFILE: 'C:\\Users\\Ada' } }));
    expect(corporate.warnings.join(' ')).toMatch(/OneDrive/);
    const long = checkProjectRoot(`D:\\${'sehr-langer-ordner\\'.repeat(9)}x`, winEnv());
    expect(long.warnings.join(' ')).toMatch(/sehr lang/);
  });

  it('derives env fallbacks for known folders incl. OneDrive redirection', () => {
    const list = fallbackKnownFolders('win32', 'C:\\Users\\Ada', { USERPROFILE: 'C:\\Users\\Ada', OneDrive: 'C:\\Users\\Ada\\OneDrive' });
    expect(list).toContain('C:\\Users\\Ada\\Downloads');
    expect(list).toContain('C:\\Users\\Ada\\OneDrive\\Documents');
    expect(list).toContain('C:\\Users\\Ada\\OneDrive\\Dokumente');
  });

  it('parses the PowerShell known-folder JSON', () => {
    const json = '{"MyMusic":"C:\\\\Users\\\\Ada\\\\Music","UserProfile":"C:\\\\Users\\\\Ada","Desktop":"C:\\\\Users\\\\Ada\\\\OneDrive\\\\Desktop","Downloads":"D:\\\\Downloads","MyVideos":""}';
    expect(parseKnownFoldersJson(json).sort()).toEqual(['C:\\Users\\Ada\\Music', 'C:\\Users\\Ada\\OneDrive\\Desktop', 'D:\\Downloads']);
    expect(parseKnownFoldersJson('')).toEqual([]);
  });

  it('builds case-folded keys on Windows only', () => {
    expect(pathKey('C:\\Foo\\Bar\\', 'win32')).toBe('c:\\foo\\bar');
    expect(pathKey('/Foo/Bar/', 'linux')).toBe('/Foo/Bar');
  });
});

describe('root safety on the real file system (POSIX)', () => {
  function posixEnv(home: string, data: string, others: RootSafetyEnv['otherProjects'] = []): RootSafetyEnv {
    return {
      platform: process.platform,
      realpath: (p) => {
        try {
          return realpathSync.native(p);
        } catch {
          return null;
        }
      },
      env: {},
      homeDir: home,
      knownFolders: fallbackKnownFolders(process.platform, home, {}),
      dataDir: data,
      otherProjects: others,
    };
  }

  it('canonicalizes through symlinks and detects overlaps via links', () => {
    const t = tempDir();
    cleanups.push(t.cleanup);
    const real = join(t.dir, 'real');
    mkdirSync(join(real, 'proj'), { recursive: true });
    symlinkSync(real, join(t.dir, 'link'));
    const canonical = canonicalize(join(t.dir, 'link', 'proj', 'neu'), process.platform, (p) => {
      try {
        return realpathSync.native(p);
      } catch {
        return null;
      }
    });
    expect(canonical).toBe(join(realpathSync.native(real), 'proj', 'neu'));
    const env = posixEnv(join(t.dir, 'home'), join(t.dir, 'data'), [{ id: 'p', name: 'Echt', path: join(real, 'proj') }]);
    expect(() => checkProjectRoot(join(t.dir, 'link', 'proj', 'unter'), env)).toThrow(/im Ordner des Projekts „Echt“/);
  });

  it('rejects the home folder, its Desktop, the data dir and system folders; accepts a subfolder', () => {
    const t = tempDir();
    cleanups.push(t.cleanup);
    const home = join(t.dir, 'home');
    mkdirSync(join(home, 'Desktop'), { recursive: true });
    const env = posixEnv(home, join(t.dir, 'data'));
    expect(() => checkProjectRoot(home, env)).toThrow(/Benutzerordner/);
    expect(() => checkProjectRoot(join(home, 'Desktop'), env)).toThrow(/Benutzerordner/);
    expect(() => checkProjectRoot(join(t.dir, 'data', 'x'), env)).toThrow(/Datenordner/);
    expect(() => checkProjectRoot('/usr/local/x', env)).toThrow(/Systemordner/);
    expect(() => checkProjectRoot('/', env)).toThrow(/Wurzelverzeichnis/);
    expect(checkProjectRoot(join(home, 'Desktop', 'Spiel'), env).canonical).toBe(join(realpathSync.native(home), 'Desktop', 'Spiel'));
  });
});
