// Unit tests of the anonymisation of shared entries: known project roots (POSIX + Windows, case, spaces, JSON
// escaping), generic absolute paths, project names, false-positive protection and the per-project variant used by
// removeProject.
import { describe, expect, it } from 'vitest';
import { NAME_PLACEHOLDER as N, PATH_PLACEHOLDER as P, anonymizeProjectReferences, anonymizeSharedText, namePattern, rootPattern } from './anonymize';

describe('anonymizeSharedText – known project root and name', () => {
  it('replaces a POSIX root, keeps the project-relative tail and replaces the name and folder name', () => {
    const src = { name: 'Sternenjäger', path: '/home/max/projekte/sternenjaeger' };
    expect(anonymizeSharedText('Sternenjäger lädt /home/max/projekte/sternenjaeger/assets/ship.png (Ordner sternenjaeger).', src, 'linux')).toBe(
      `${N} lädt ${P}/assets/ship.png (Ordner ${N}).`,
    );
  });

  it('treats POSIX roots case-sensitively but Windows roots case-insensitively', () => {
    expect(anonymizeSharedText('/HOME/MAX/P/x', { path: '/home/max/p' }, 'linux')).toBe('/HOME/MAX/P/x');
    expect(anonymizeSharedText('c:\\USERS\\max\\p\\x.txt', { path: 'C:\\Users\\Max\\p' }, 'win32')).toBe(`${P}\\x.txt`);
    // A Windows-style root is compared case-insensitively on every platform.
    expect(anonymizeSharedText('C:/users/MAX/p/x.txt', { path: 'C:\\Users\\Max\\p' }, 'linux')).toBe(`${P}/x.txt`);
  });

  it('handles spaces, mixed separators, JSON-escaped backslashes and a trailing separator in the root', () => {
    const src = { name: 'Mein Spiel', path: 'D:\\NOVA Projekte\\Mein Spiel\\' };
    expect(anonymizeSharedText('Pfad: "D:\\\\NOVA Projekte\\\\Mein Spiel\\\\src" und D:/NOVA Projekte/Mein Spiel/README.md', src, 'win32')).toBe(
      `Pfad: "${P}\\\\src" und ${P}/README.md`,
    );
  });

  it('does not replace a root that is only a prefix of another folder', () => {
    expect(anonymizeSharedText('Siehe /srv/app-alt/x', { path: '/srv/app' }, 'linux')).toBe(`Siehe ${P}`);
    expect(rootPattern('/srv/app', 'linux')!.test('/srv/app-alt/x')).toBe(false);
  });

  it('refuses roots that are too short to replace safely', () => {
    expect(rootPattern('C:\\', 'win32')).toBeNull();
    expect(rootPattern('/', 'linux')).toBeNull();
    expect(rootPattern('', 'linux')).toBeNull();
  });

  it('replaces names as whole words only and never short names', () => {
    expect(anonymizeSharedText('Kasse und Kassenbuch und kassenbuchApp', { name: 'Kassenbuch' }, 'linux')).toBe(`Kasse und ${N} und kassenbuchApp`);
    expect(anonymizeSharedText('Im Projekt Mein   Spiel 2 …', { name: 'Mein Spiel 2' }, 'linux')).toBe(`Im Projekt ${N} …`);
    expect(namePattern('AB')).toBeNull();
    expect(anonymizeSharedText('AB testet', { name: 'AB' }, 'linux')).toBe('AB testet');
  });

  it('never rewrites existing placeholders', () => {
    expect(anonymizeSharedText(`${N} und ${P}`, { name: 'Projekt' }, 'linux')).toBe(`${N} und ${P}`);
    expect(anonymizeSharedText(`${P}/tmp/log.txt`, null, 'linux')).toBe(`${P}/tmp/log.txt`);
  });
});

describe('anonymizeSharedText – generic absolute paths', () => {
  it.each([
    ['Datei C:\\Users\\Max Mustermann\\Desktop\\notiz.txt.', `Datei ${P}.`],
    ['Node: C:\\Program Files\\nodejs\\node.exe', `Node: ${P}`],
    ['Freigabe \\\\server\\share\\team\\plan.docx ansehen', `Freigabe ${P} ansehen`],
    ['Zwei Pfade: C:\\a\\b.txt und D:\\c\\d.txt', `Zwei Pfade: ${P} und ${P}`],
    ['C:\\a\\b und \\\\srv\\x\\y', `${P} und ${P}`],
    ['Log /var/log/app.log, Daten /home/erika/NOVA Projekte/Spiel/save.json und ~/notes/todo.md', `Log ${P}, Daten ${P} und ${P}`],
    ['macOS: /Users/erika/dev/app', `macOS: ${P}`],
    ['/tmp/x.txt und/oder /opt/tool/bin', `${P} und/oder ${P}`],
    ['/home/max/x.txt sowie ~/code/y', `${P} sowie ${P}`],
  ])('replaces paths in %j', (input, expected) => {
    expect(anonymizeSharedText(input, null, 'win32')).toBe(expected);
  });

  it.each([
    'REST-Route /api/users/42 liefert JSON.',
    'Siehe https://example.com/home/docs und http://localhost:5174/tmp.',
    'Relativer Pfad src/game.js und ./tests/a.test.mjs',
    'Brüche wie 3/4 und und/oder bleiben.',
    'Zeit 10:30 und Verhältnis 16:9.',
  ])('keeps %j', (input) => {
    expect(anonymizeSharedText(input, null, 'win32')).toBe(input);
  });
});

describe('anonymizeProjectReferences', () => {
  it('replaces only the given project root and name, not other paths', () => {
    const src = { name: 'Kassenbuch', path: '/home/max/projekte/kassenbuch' };
    expect(anonymizeProjectReferences('Kassenbuch: /home/max/projekte/kassenbuch/db.sqlite neben /home/max/anderes/x', src, 'linux')).toBe(
      `${N}: ${P}/db.sqlite neben /home/max/anderes/x`,
    );
    expect(anonymizeProjectReferences('', src, 'linux')).toBe('');
  });
});
