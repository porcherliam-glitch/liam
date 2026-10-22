// PathGuard: turns a (model- or user-supplied) path into a canonical location inside a project, or refuses.
// Algorithm (contract doc of PathGuard.resolve, SPEC §4.3/§6.3):
//   1. Validate the INPUT: no NUL/C0 control characters; on Windows additionally no UNC/device forms (\\?\ \\.\ \??\
//      \\server\share), no drive-relative "C:foo", no ':' except the drive colon (alternate data streams), no
//      < > " | ? *, no segment ending in '.' or ' ', no reserved device names (CON PRN AUX NUL COM0-9 LPT0-9 COM¹²³
//      LPT¹²³ CONIN$ CONOUT$ CLOCK$, also with extensions).
//   2. Canonicalize: realpath of the project root and of the deepest EXISTING ancestor of the target (follows
//      symlinks/junctions), the not-yet-existing tail is appended unchanged.
//   3. Containment: the canonical target must be the root or below it (case-insensitive on Windows).
//   ResolvedPath.rel = project-relative with '/', on-disk case; key = rel lower-cased on Windows.
// Key decisions:
// - Platform and file system are injectable (createPathGuard(s, { platform:'win32', fs })) so the Windows rules run
//   in Linux tests with path.win32 string semantics and a fake realpath.
// - Leading/trailing whitespace of the input is trimmed (a frequent model artefact); everything else is strict.
// - Protection (isProtected) matches any `.git` segment, a top-level `.nova` folder and the NOVA data dir.
// Honest limit (SPEC §6.0.1e): a symlink swapped between check and use (TOCTOU) cannot be prevented; the guard
// prevents model mistakes, not a hostile local process.
import { existsSync, realpathSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import type { PathGuard, ResolvedPath, Services } from '../../contracts';
import { NovaError } from '../../core/errors';

export interface PathGuardFs {
  /** Canonical path of an EXISTING path (follows links). */
  realpath(p: string): string;
  exists(p: string): boolean;
}

export interface PathGuardOptions {
  platform?: NodeJS.Platform;
  fs?: PathGuardFs;
  /** Overrides s.core.paths.root (tests with fake Windows paths). */
  dataDir?: string;
}

const nodeFs: PathGuardFs = {
  realpath: (p) => realpathSync.native(p),
  exists: (p) => existsSync(p),
};

const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)$/i;

function invalid(message: string, input: string): NovaError {
  return new NovaError('VALIDATION', message, { severity: 'warning', details: { path: input } });
}

function outside(input: string): NovaError {
  return new NovaError('PATH_OUTSIDE_PROJECT', `Der Pfad „${input}“ liegt außerhalb des Projektordners. Bitte nur projektrelative Pfade wie „src/app.ts“ verwenden.`, {
    severity: 'warning',
    details: { path: input },
  });
}

/** Input validation (step 1). Exported for direct tests of the Windows rules. */
export function validatePathInput(input: string, platform: NodeJS.Platform): void {
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(input)) throw invalid('Der Pfad enthält unzulässige Steuerzeichen.', input.replace(/[\u0000-\u001f]/g, '?'));
  if (platform !== 'win32') return;
  if (/^[\\/]{2}/.test(input) || /^[\\/]\?\?[\\/]/.test(input)) {
    throw invalid('Netzwerk- und Gerätepfade (\\\\server\\…, \\\\?\\…, \\\\.\\…) sind nicht erlaubt.', input);
  }
  if (/^[A-Za-z]:(?![\\/])/.test(input)) throw invalid(`Laufwerksrelative Pfade wie „${input}“ sind nicht erlaubt. Bitte projektrelative Pfade verwenden.`, input);
  const withoutDrive = input.replace(/^[A-Za-z]:(?=[\\/])/, '');
  if (withoutDrive.includes(':')) throw invalid(`Der Pfad „${input}“ enthält einen Doppelpunkt (alternative Datenströme sind nicht erlaubt).`, input);
  if (/[<>"|?*]/.test(input)) throw invalid(`Der Pfad „${input}“ enthält unzulässige Zeichen (< > " | ? *).`, input);
  for (const seg of withoutDrive.split(/[\\/]+/)) {
    if (seg === '' || seg === '.' || seg === '..') continue;
    if (/[. ]$/.test(seg)) throw invalid(`Pfadteile dürfen nicht mit einem Punkt oder Leerzeichen enden („${seg}“).`, input);
    const base = seg.split('.')[0].replace(/ +$/, '');
    if (RESERVED.test(base)) throw invalid(`„${seg}“ ist ein reservierter Gerätename unter Windows und kann nicht als Datei verwendet werden.`, input);
  }
}

export function createPathGuard(s: Services, opts: PathGuardOptions = {}): PathGuard {
  const platform = opts.platform ?? s.core.platform;
  const fs = opts.fs ?? nodeFs;
  const P = platform === 'win32' ? win32 : posix;
  const fold = (p: string) => (platform === 'win32' ? p.toLowerCase() : p);

  function realRoot(projectRoot: string): string {
    try {
      return fs.realpath(projectRoot);
    } catch {
      throw new NovaError('NOT_FOUND', 'Der Projektordner wurde nicht gefunden. Wurde er verschoben oder gelöscht?', {
        severity: 'blocker',
        details: { root: projectRoot },
        userAction: 'Den Projektordner wiederherstellen oder das Projekt in den Projekteinstellungen mit dem neuen Ort verknüpfen.',
      });
    }
  }

  /** Realpath of the deepest existing ancestor + the remaining tail. */
  function canonicalize(abs: string): string {
    let cur = P.normalize(abs);
    const tail: string[] = [];
    for (;;) {
      if (fs.exists(cur)) {
        let real: string;
        try {
          real = fs.realpath(cur);
        } catch {
          real = cur;
        }
        return tail.length ? P.join(real, ...tail) : real;
      }
      const parent = P.dirname(cur);
      if (parent === cur) return P.normalize(abs);
      tail.unshift(P.basename(cur));
      cur = parent;
    }
  }

  function contains(root: string, target: string): boolean {
    const r = fold(stripTrailingSep(root));
    const t = fold(stripTrailingSep(target));
    if (t === r) return true;
    const prefix = r.endsWith(P.sep) ? r : r + P.sep;
    return t.startsWith(prefix);
  }

  function stripTrailingSep(p: string): string {
    const root = P.parse(p).root;
    let out = p;
    while (out.length > root.length && (out.endsWith('/') || out.endsWith(P.sep))) out = out.slice(0, -1);
    return out;
  }

  function relOf(root: string, target: string): string {
    const r = stripTrailingSep(root);
    const t = stripTrailingSep(target);
    if (fold(t) === fold(r)) return '';
    const prefixLen = r.endsWith(P.sep) ? r.length : r.length + 1;
    return t.slice(prefixLen).split(P.sep).filter(Boolean).join('/');
  }

  let dataDirCache: { raw: string; real: string } | null = null;
  function dataDir(): string | null {
    const raw = opts.dataDir ?? s.core.paths?.root;
    if (!raw) return null;
    if (dataDirCache?.raw === raw) return dataDirCache.real;
    let real = raw;
    try {
      real = fs.realpath(raw);
    } catch {
      /* keep raw */
    }
    dataDirCache = { raw, real };
    return real;
  }

  const guard: PathGuard = {
    resolve(projectRoot: string, p: string): ResolvedPath {
      if (typeof p !== 'string') throw invalid('Bitte einen Pfad angeben.', String(p));
      const input = p.trim() === '' ? '.' : p.trim();
      validatePathInput(input, platform);
      const root = realRoot(projectRoot);
      let candidate: string;
      if (P.isAbsolute(input)) {
        if (platform === 'win32' && !/^[A-Za-z]:/.test(input)) {
          // "\foo" means "foo on the current drive" – never what a project-relative caller wants.
          throw outside(input);
        }
        candidate = P.normalize(input);
      } else {
        candidate = P.join(root, input);
        if (!contains(root, candidate)) throw outside(input); // lexical "../" escape
      }
      const canonical = canonicalize(candidate);
      if (!contains(root, canonical)) throw outside(input);
      const rel = relOf(root, canonical);
      return { abs: rel ? P.join(root, ...rel.split('/')) : root, rel, key: fold(rel) };
    },

    isInside(projectRoot: string, abs: string): boolean {
      try {
        const root = realRoot(projectRoot);
        return contains(root, canonicalize(P.isAbsolute(abs) ? abs : P.join(root, abs)));
      } catch {
        return false;
      }
    },

    isProtected(projectRoot: string, key: string): boolean {
      const segments = key.replace(/\\/g, '/').replace(/^\.\/+/, '').split('/').filter(Boolean);
      const lower = segments.map((x) => x.toLowerCase());
      // .git anywhere (nested repositories, submodules, worktree files) and the reserved top-level .nova folder.
      if (lower.includes('.git')) return true;
      if (lower[0] === '.nova') return true;
      const dd = dataDir();
      if (!dd) return false;
      let root: string;
      try {
        root = realRoot(projectRoot);
      } catch {
        return false;
      }
      const abs = segments.length ? P.join(root, ...segments) : root;
      return contains(dd, abs);
    },

    isSensitive(rel: string): boolean {
      const name = (rel.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? '').toLowerCase();
      if (!name) return false;
      if (name === '.env') return true;
      if (name.startsWith('.env.')) return !['.env.example', '.env.sample', '.env.template'].includes(name);
      if (/\.(pem|key|pfx|p12)$/.test(name)) return true;
      if (name.startsWith('id_rsa') || name.startsWith('id_ed25519')) return true;
      if (name === '.npmrc' || name === '.pypirc' || name === '.git-credentials') return true;
      if (/^credentials.*\.json$/.test(name)) return true;
      if (name.startsWith('secrets.')) return true;
      return false;
    },
  };
  return guard;
}
