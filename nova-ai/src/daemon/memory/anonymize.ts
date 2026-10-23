// Anonymisation of shared memory entries before they enter ANOTHER project's agent context (SPEC §6.7): absolute paths
// become "<Projektpfad>", the source project's name (and its folder name) becomes "<Projekt>".
//
// Key decisions:
// - The known root of the source project is replaced first, literally (spaces in "NOVA Projekte\Mein Spiel" are
//   handled exactly), separator-agnostic (\ or /, also JSON-doubled \\) and case-insensitive for Windows paths. The
//   project-relative tail is kept ("<Projektpfad>\src\game.js") because it is useful and not personal.
// - Then generic absolute paths: Windows drive paths (C:\…, C:/…), UNC paths (\\server\share\…), POSIX paths below
//   user/system roots (/home, /Users, /root, /mnt, /media, /Volumes, /tmp, /var, /opt, /srv, /private) and "~/…".
//   Windows directory names may contain single spaces when exactly one separator follows ("C:\Users\Max
//   Mustermann\x.txt"); POSIX directory names only when the continuation starts with an upper-case letter or digit
//   ("/home/max/NOVA Projekte/x"), so German prose ("und/oder", "sowie ~/…") is not swallowed. The last segment ends
//   at whitespace. Trailing sentence punctuation stays outside the placeholder.
//   POSIX roots are an allow-list on purpose: REST routes like "/api/users" and URLs ("https://host/home/x") are
//   technical knowledge and stay untouched.
// - A path directly after a placeholder ("<Projektpfad>/tmp/x", JSON-escaped "<Projektpfad>\\cfg") is the
//   project-relative tail of an already replaced root and is never replaced again ('>' is excluded in every
//   look-behind).
// - Names are replaced as whole words (Unicode-aware boundaries, case-insensitive, flexible inner whitespace); names
//   shorter than 3 characters are not replaced (too many false hits). Existing placeholders are never rewritten.
// - The functions are pure; the caller passes the platform (Windows branches are unit-tested on Linux).

export const PATH_PLACEHOLDER = '<Projektpfad>';
export const NAME_PLACEHOLDER = '<Projekt>';

export interface AnonymizeSource {
  /** Display name of the project the entry comes from. */
  name?: string | null;
  /** Absolute root folder of that project. */
  path?: string | null;
}

const SEP = String.raw`[\\/]+`;
/** One Windows path segment without spaces (characters not allowed in Windows file names are excluded). */
const WIN_SEG = String.raw`[^\\/:*?"<>|\s]+`;
/**
 * A Windows directory: one segment plus separator(s), or several space-joined segments ("Max Mustermann") followed by
 * exactly ONE separator that does not start a UNC path ("C:\a\b und \\server\x" is two paths, not one).
 */
const WIN_DIR = String.raw`(?:${WIN_SEG}${SEP}|${WIN_SEG}(?: ${WIN_SEG})+[\\/](?![\\/]))`;
const WIN_DRIVE_PATH = new RegExp(String.raw`(?<![\p{L}\p{N}_>])[A-Za-z]:${SEP}(?:${WIN_DIR})*(?:${WIN_SEG})?`, 'gu');
const UNC_PATH = new RegExp(String.raw`(?<![\p{L}\p{N}_\\/>])\\\\[^\\/\s]+(?:${SEP}(?:${WIN_DIR})*(?:${WIN_SEG})?)?`, 'gu');
/** One POSIX path segment (conservative: stops at quotes, brackets, separators of prose). */
const POSIX_SEG = String.raw`[^/\s"'<>|*?;,()\[\]{}]+`;
/**
 * Continuation of a POSIX directory name after a space: must start with an upper-case letter or digit
 * ("NOVA Projekte/"), so prose like "a.txt und/oder" or "x.txt sowie ~/y" is not swallowed.
 */
const POSIX_CONT = String.raw`[\p{Lu}\p{N}][^/\s"'<>|*?;,()\[\]{}]*`;
const POSIX_DIR = String.raw`${POSIX_SEG}(?: ${POSIX_CONT})*/+`;
const POSIX_ROOTS = '(?:home|Users|root|mnt|media|Volumes|tmp|var|opt|srv|private)';
const POSIX_PATH = new RegExp(
  String.raw`(?<![\p{L}\p{N}_.:/~\\>-])/${POSIX_ROOTS}(?![\p{L}\p{N}_-])(?:/+(?:${POSIX_DIR})*(?:${POSIX_SEG})?)?`,
  'gu',
);
const HOME_PATH = new RegExp(String.raw`(?<![\p{L}\p{N}_.:/~\\>-])~/+(?:${POSIX_DIR})*(?:${POSIX_SEG})?`, 'gu');
const TRAILING = /[.,;:!?)\]}'"»“”]+$/u;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True for drive-letter or UNC paths (compared case-insensitively). */
export function isWindowsStylePath(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]{2}[^\\/]/.test(p);
}

/** Replaces a match by the placeholder but keeps trailing sentence punctuation outside of it. */
function placeholderKeepingPunctuation(match: string): string {
  const trailing = TRAILING.exec(match)?.[0] ?? '';
  return PATH_PLACEHOLDER + trailing;
}

/** Regex for a known project root (null for roots that are too short to be replaced safely, e.g. "C:\" or "/"). */
export function rootPattern(root: string, platform: NodeJS.Platform): RegExp | null {
  const trimmed = root.trim().replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]+/);
  const named = parts.filter((p) => p !== '');
  if (named.length === 0 || (named.length === 1 && /^[A-Za-z]:$/.test(named[0]))) return null;
  const unc = /^[\\/]{2}[^\\/]/.test(trimmed);
  let body = parts.map(escapeRegex).join(SEP);
  if (unc) body = String.raw`[\\/]{2}` + named.map(escapeRegex).join(SEP);
  const caseInsensitive = platform === 'win32' || isWindowsStylePath(trimmed);
  return new RegExp(String.raw`(?<![\p{L}\p{N}_.-])${body}(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])`, caseInsensitive ? 'giu' : 'gu');
}

/** Regex for a whole-word name (null when the name is shorter than 3 characters). */
export function namePattern(name: string): RegExp | null {
  const trimmed = name.trim();
  if (Array.from(trimmed).length < 3) return null;
  const body = trimmed.split(/\s+/).map(escapeRegex).join(String.raw`\s+`);
  return new RegExp(String.raw`(?<![\p{L}\p{N}_])${body}(?![\p{L}\p{N}_])`, 'giu');
}

function lastSegment(p: string): string {
  const parts = p.trim().split(/[\\/]+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return /^[A-Za-z]:$/.test(last) ? '' : last;
}

/** Replaces every absolute path (and the known root of the source project) with "<Projektpfad>". */
export function replacePaths(text: string, source: AnonymizeSource | null, platform: NodeJS.Platform): string {
  let out = text;
  const root = source?.path ? rootPattern(source.path, platform) : null;
  if (root) out = out.replace(root, PATH_PLACEHOLDER);
  out = out.replace(UNC_PATH, placeholderKeepingPunctuation);
  out = out.replace(WIN_DRIVE_PATH, placeholderKeepingPunctuation);
  out = out.replace(POSIX_PATH, placeholderKeepingPunctuation);
  out = out.replace(HOME_PATH, placeholderKeepingPunctuation);
  return out;
}

/** Replaces the source project's name and folder name with "<Projekt>" (whole words only). */
export function replaceNames(text: string, source: AnonymizeSource | null): string {
  if (!source) return text;
  const names: string[] = [];
  if (source.name) names.push(source.name.trim());
  const folder = source.path ? lastSegment(source.path) : '';
  if (folder && !names.some((n) => n.toLocaleLowerCase('de-DE') === folder.toLocaleLowerCase('de-DE'))) names.push(folder);
  // Longer names first so "Mein Spiel 2" wins over "Mein Spiel".
  names.sort((a, b) => b.length - a.length);
  let out = text;
  for (const name of names) {
    const re = namePattern(name);
    if (!re) continue;
    out = out.replace(re, (match: string, offset: number, whole: string) =>
      whole[offset - 1] === '<' && whole[offset + match.length] === '>' ? match : NAME_PLACEHOLDER,
    );
  }
  return out;
}

/**
 * Replaces only the references to ONE known project (its root folder and its name), leaving other paths alone. Used
 * when a project is removed: its shareable entries stay in the knowledge base, but the project's name/path could no
 * longer be resolved later, so they are anonymised while the information is still available.
 */
export function anonymizeProjectReferences(text: string, source: AnonymizeSource, platform: NodeJS.Platform): string {
  if (!text) return text;
  const root = source.path ? rootPattern(source.path, platform) : null;
  return replaceNames(root ? text.replace(root, PATH_PLACEHOLDER) : text, source);
}

/** Full anonymisation of one text of a shared entry. */
export function anonymizeSharedText(text: string, source: AnonymizeSource | null, platform: NodeJS.Platform): string {
  if (!text) return text;
  return replaceNames(replacePaths(text, source, platform), source);
}
