// Project root safety rules (SPEC §6.8) – applied on create (all modes), import and update({path}).
// Key decisions:
// - Pure function over an injectable environment (platform, path API, realpath, env, known folders, data dir, other
//   projects) so the Windows rules are unit-tested on Linux with path.win32 and a fake realpath.
// - Canonicalization: realpath of the deepest EXISTING ancestor + the not-yet-existing rest (new folders), compared
//   case-folded on Windows (realpath also expands 8.3 short names such as %TEMP% = C:\Users\RUNNER~1\…, so short and
//   long spellings of one folder get the same key). Device/UNC-device forms (\\?\, \\.\), paths that are not fully
//   qualified on Windows ("C:foo", "\foo", "\\server") and NUL bytes are rejected up front.
// - %USERPROFILE% and its known folders are rejected only when EQUAL (projects inside Documents are fine; the default
//   projectsDir is %USERPROFILE%\NOVA Projekte). System/app-data folders are rejected when equal OR inside.
// - The data dir and other registered projects are rejected when equal, inside, or an ancestor.
// - Warnings (German): OneDrive (sync conflicts, locked files) and paths longer than 150 characters.
// - Windows known folders come from `[Environment]::GetFolderPath(...)` via runPowerShell (resolved once and cached)
//   PLUS the classic env-derived defaults (USERPROFILE\Desktop …, OneDrive redirections) so a failed PowerShell call
//   never weakens the check.
import { posix as posixPath, win32 as winPath } from 'node:path';
import { runPowerShell } from '../core/exec';
import { NovaError } from '../core/errors';

export type PathApi = typeof posixPath;

export interface RootSafetyEnv {
  platform: NodeJS.Platform;
  /** Returns the canonical path of an EXISTING path, or null when it does not exist. */
  realpath(p: string): string | null;
  env: Record<string, string | undefined>;
  homeDir: string;
  /** Known user folders (Desktop, Documents, Downloads, Pictures, Music, Videos …) – rejected when equal. */
  knownFolders: string[];
  /** NOVA data dir. */
  dataDir: string;
  /** Other registered projects (exclude the project being updated). */
  otherProjects: { id: string; name: string; path: string }[];
}

export interface RootCheckResult {
  /** Canonical absolute path (realpath of the deepest existing ancestor + rest). */
  canonical: string;
  /** Comparison key: canonical, lower-cased on Windows. */
  key: string;
  warnings: string[];
}

export const ROOT_REJECT_PREFIX = 'Dieser Ordner kann nicht als Projektordner verwendet werden: ';
const LONG_PATH_LIMIT = 150;

export function pathApiFor(platform: NodeJS.Platform): PathApi {
  return platform === 'win32' ? winPath : posixPath;
}

function reject(reason: string, details?: Record<string, unknown>): never {
  throw new NovaError('VALIDATION', ROOT_REJECT_PREFIX + reason, { severity: 'warning', details });
}

function stripTrailingSep(p: string, api: PathApi): string {
  const root = api.parse(p).root;
  let out = p;
  while (out.length > root.length && (out.endsWith('/') || out.endsWith('\\'))) out = out.slice(0, -1);
  return out;
}

/** Comparison key of an absolute path. */
export function pathKey(p: string, platform: NodeJS.Platform): string {
  const api = pathApiFor(platform);
  const n = stripTrailingSep(api.normalize(p), api);
  return platform === 'win32' ? n.toLowerCase() : n;
}

/** child equals parent or lies inside it (keys already canonical). */
export function keyInside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  if (child === parent) return true;
  const sep = platform === 'win32' ? '\\' : '/';
  const prefix = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(prefix);
}

/**
 * realpath of the deepest existing ancestor + the remaining segments. Works for paths that do not exist yet
 * (new project folders) and for symlinked/junctioned parents.
 */
export function canonicalize(p: string, platform: NodeJS.Platform, realpath: (p: string) => string | null): string {
  const api = pathApiFor(platform);
  const abs = stripTrailingSep(api.normalize(api.resolve(p)), api);
  const rest: string[] = [];
  let cur = abs;
  for (;;) {
    const real = realpath(cur);
    if (real !== null) {
      return stripTrailingSep(rest.length ? api.join(real, ...rest) : real, api);
    }
    const parent = api.dirname(cur);
    if (parent === cur) return abs;
    rest.unshift(api.basename(cur));
    cur = parent;
  }
}

function canonicalKey(p: string | undefined | null, env: RootSafetyEnv): string | null {
  if (!p || !p.trim()) return null;
  const api = pathApiFor(env.platform);
  if (!api.isAbsolute(p)) return null;
  return pathKey(canonicalize(p, env.platform, env.realpath), env.platform);
}

/** Validates the raw input string before any filesystem access. */
export function validateRawPath(input: string, platform: NodeJS.Platform): void {
  if (!input || !input.trim()) reject('Es wurde kein Ordner angegeben.');
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(input)) reject('Der Pfad enthält Steuerzeichen.');
  const api = pathApiFor(platform);
  if (platform === 'win32') {
    if (/^[\\/]{2}[?.][\\/]/.test(input) || /^\\\?\?\\/.test(input)) reject('Geräte- und Sonderpfade (\\\\?\\, \\\\.\\) sind nicht erlaubt.');
    // Not fully qualified: "C:foo" (drive-relative), "\foo" (root of the daemon's CURRENT drive) and "\\server" without
    // a share – path.win32 calls the latter two absolute, but where they point depends on the daemon's working dir.
    if (/^[A-Za-z]:(?![\\/])/.test(input) || /^[\\/](?![\\/])/.test(input) || /^[\\/]{2}[^\\/]+[\\/]*$/.test(input)) {
      reject('Bitte einen vollständigen Pfad angeben (z. B. C:\\Projekte\\Spiel).');
    }
    const withoutDrive = input.replace(/^[A-Za-z]:/, '');
    if (/[<>"|?*]/.test(withoutDrive) || withoutDrive.includes(':')) reject('Der Pfad enthält Zeichen, die Windows nicht erlaubt (< > : " | ? *).');
    for (const seg of withoutDrive.split(/[\\/]+/).filter(Boolean)) {
      if (/[. ]$/.test(seg) && seg !== '.' && seg !== '..') reject(`Ordnernamen dürfen nicht mit Punkt oder Leerzeichen enden („${seg}“).`);
      if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)(\..*)?$/i.test(seg)) reject(`„${seg}“ ist ein reservierter Windows-Name.`);
    }
  }
  if (!api.isAbsolute(input)) reject('Bitte einen vollständigen Ordnerpfad angeben.');
}

function isDriveOrShareRoot(canonical: string, platform: NodeJS.Platform): boolean {
  const api = pathApiFor(platform);
  const root = stripTrailingSep(api.parse(canonical).root, api);
  return pathKey(canonical, platform) === pathKey(root || canonical, platform);
}

/** System folders that must never contain a project (equal or inside). */
function systemFolders(env: RootSafetyEnv): { path: string; label: string }[] {
  const e = env.env;
  if (env.platform === 'win32') {
    const list: { path: string | undefined; label: string }[] = [
      { path: e.WINDIR ?? e.SystemRoot, label: 'Windows-Systemordner' },
      { path: e.ProgramFiles, label: 'Programme-Ordner' },
      { path: e['ProgramFiles(x86)'], label: 'Programme-Ordner (x86)' },
      { path: e.ProgramW6432, label: 'Programme-Ordner' },
      { path: e.ProgramData, label: 'ProgramData-Ordner' },
      { path: e.APPDATA, label: 'AppData-Ordner (Roaming)' },
      { path: e.LOCALAPPDATA, label: 'AppData-Ordner (Local)' },
    ];
    return list.filter((x): x is { path: string; label: string } => !!x.path);
  }
  const posix = ['/bin', '/boot', '/dev', '/etc', '/lib', '/lib32', '/lib64', '/proc', '/sbin', '/sys', '/usr', '/System', '/Library', '/Applications'];
  return posix.map((p) => ({ path: p, label: 'Systemordner' }));
}

/** Env-derived OneDrive roots (personal + business). */
export function oneDriveRoots(env: Record<string, string | undefined>): string[] {
  return [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter((x): x is string => !!x && x.trim() !== '');
}

/** Env-derived default known folders (union with the PowerShell result; covers OneDrive known-folder redirection). */
export function fallbackKnownFolders(platform: NodeJS.Platform, homeDir: string, env: Record<string, string | undefined>): string[] {
  const api = pathApiFor(platform);
  const names = ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'];
  const out = names.map((n) => api.join(homeDir, n));
  if (platform === 'win32') {
    const profile = env.USERPROFILE ?? homeDir;
    out.push(...names.map((n) => api.join(profile, n)), api.join(profile, 'OneDrive'));
    for (const od of oneDriveRoots(env)) out.push(od, ...['Desktop', 'Documents', 'Pictures', 'Dokumente', 'Bilder'].map((n) => api.join(od, n)));
  }
  return out;
}

/**
 * Applies all root rules. Throws NovaError VALIDATION with "Dieser Ordner kann nicht als Projektordner verwendet
 * werden: <Grund>". Returns the canonical path, its key and German warnings.
 */
export function checkProjectRoot(input: string, env: RootSafetyEnv): RootCheckResult {
  validateRawPath(input, env.platform);
  const platform = env.platform;
  const canonical = canonicalize(input, platform, env.realpath);
  const key = pathKey(canonical, platform);

  if (isDriveOrShareRoot(canonical, platform)) {
    reject(platform === 'win32' ? 'Ein ganzes Laufwerk oder eine Netzwerkfreigabe ist zu groß. Bitte einen Unterordner wählen.' : 'Das Wurzelverzeichnis ist nicht erlaubt.');
  }

  const profile = platform === 'win32' ? env.env.USERPROFILE ?? env.homeDir : env.homeDir;
  const profileKey = canonicalKey(profile, env);
  if (profileKey && key === profileKey) reject('Der eigene Benutzerordner ist zu groß. Bitte einen Unterordner wählen, z. B. „NOVA Projekte“.');

  for (const folder of env.knownFolders) {
    const k = canonicalKey(folder, env);
    if (k && key === k) {
      const api = pathApiFor(platform);
      reject(`„${api.basename(canonical)}“ ist ein Windows-Benutzerordner (Desktop, Dokumente, Downloads, Bilder, Musik, Videos). Bitte einen eigenen Unterordner anlegen.`);
    }
  }

  for (const sys of systemFolders(env)) {
    const k = canonicalKey(sys.path, env);
    if (k && keyInside(key, k, platform)) reject(`Er liegt im ${sys.label}. Dort dürfen keine Projekte liegen.`);
  }

  const dataKey = canonicalKey(env.dataDir, env);
  if (dataKey && (keyInside(key, dataKey, platform) || keyInside(dataKey, key, platform))) {
    reject('Er überschneidet sich mit dem Datenordner von NOVA.');
  }

  for (const other of env.otherProjects) {
    const k = canonicalKey(other.path, env);
    if (!k) continue;
    if (key === k) reject(`Er ist bereits als Projekt „${other.name}“ eingetragen.`);
    if (keyInside(key, k, platform)) reject(`Er liegt im Ordner des Projekts „${other.name}“.`);
    if (keyInside(k, key, platform)) reject(`Er enthält den Ordner des Projekts „${other.name}“.`);
  }

  const warnings: string[] = [];
  const oneDriveKeys = oneDriveRoots(env.env).map((p) => canonicalKey(p, env)).filter((x): x is string => !!x);
  const underOneDrive = oneDriveKeys.some((k) => keyInside(key, k, platform)) || (platform === 'win32' && /[\\/]onedrive( - [^\\/]+)?([\\/]|$)/i.test(canonical));
  if (underOneDrive) {
    warnings.push(
      'Der Projektordner liegt in OneDrive. Die Synchronisierung kann Dateien sperren und Konflikte erzeugen (z. B. bei Git, node_modules oder Unity). Ein Ordner außerhalb von OneDrive ist zuverlässiger.',
    );
  }
  if (canonical.length > LONG_PATH_LIMIT) {
    warnings.push(
      `Der Pfad ist sehr lang (${canonical.length} Zeichen). Manche Werkzeuge unter Windows scheitern an langen Pfaden. Ein kürzerer Ordner wie „C:\\Projekte\\Name“ ist sicherer.`,
    );
  }
  return { canonical, key, warnings };
}

// ---------------------------------------------------------------------------------------------------------------
// Windows known folders via PowerShell (cached once per daemon).
// ---------------------------------------------------------------------------------------------------------------

export type KnownFolderProvider = () => Promise<string[]>;

const KNOWN_FOLDERS_SCRIPT =
  "$f=@{};foreach($n in 'UserProfile','Desktop','DesktopDirectory','MyDocuments','MyPictures','MyMusic','MyVideos'){$f[$n]=[Environment]::GetFolderPath($n)};" +
  "$d=$null;try{$d=(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders' -ErrorAction Stop).'{374DE290-123F-4565-9164-39C4925E467B}'}catch{};" +
  "if(-not $d){$d=Join-Path $env:USERPROFILE 'Downloads'};$f['Downloads']=$d;$f | ConvertTo-Json -Compress";

/** Parses the JSON printed by KNOWN_FOLDERS_SCRIPT into a list of folder paths. */
export function parseKnownFoldersJson(stdout: string): string[] {
  const text = stdout.trim();
  if (!text) return [];
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return Object.entries(parsed)
    .filter(([k]) => k !== 'UserProfile')
    .map(([, v]) => v)
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

/** Default provider: PowerShell on Windows (resolved once and cached by the caller), [] elsewhere. */
export function createKnownFolderProvider(platform: NodeJS.Platform, onError: (e: unknown) => void): KnownFolderProvider {
  let cached: Promise<string[]> | null = null;
  return () => {
    if (platform !== 'win32') return Promise.resolve([]);
    if (!cached) {
      cached = runPowerShell(KNOWN_FOLDERS_SCRIPT, { timeoutMs: 20_000 })
        .then((r) => {
          if (r.code !== 0) throw new Error(`PowerShell exit ${r.code}: ${r.stderr.slice(0, 300)}`);
          return parseKnownFoldersJson(r.stdout);
        })
        .catch((e) => {
          onError(e);
          cached = null; // try again next time; the env fallback covers this call
          return [];
        });
    }
    return cached;
  };
}
