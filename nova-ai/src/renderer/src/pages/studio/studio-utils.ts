// Pure helpers of the studio (no React, no data access) – unit tested in studio-utils.test.ts.
import type { CheckFailure, CheckKind, CheckRun, FileNode, ReviewFinding, SearchMatch, Task } from '@shared/schemas';
import type { Tone } from '../../lib/labels';

/** Files above this size are opened read-only (UI-SPEC: large files > 2 MB). */
export const MAX_EDITABLE_BYTES = 2 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Git status
// ---------------------------------------------------------------------------

export interface GitStatusInfo {
  /** One letter shown next to the file name. */
  letter: string;
  /** German explanation (tooltip / screen reader). */
  label: string;
  tone: Tone;
}

/**
 * Maps a porcelain XY code (" M", "??", "A ", "R ", "UU" …) to a letter, a German label and a tone.
 * Returns null for clean or ignored files.
 */
export function gitStatusInfo(code: string | null | undefined): GitStatusInfo | null {
  if (!code) return null;
  const xy = code.padEnd(2, ' ').slice(0, 2);
  if (xy === '!!' || xy.trim() === '') return null;
  if (xy === '??') return { letter: 'U', label: 'Neu, noch nicht in Git erfasst', tone: 'success' };
  const [x, y] = [xy[0], xy[1]];
  if (x === 'U' || y === 'U' || xy === 'AA' || xy === 'DD') return { letter: '!', label: 'Git-Konflikt – bitte zusammenführen', tone: 'danger' };
  if (x === 'D' || y === 'D') return { letter: 'D', label: 'Gelöscht (Git)', tone: 'danger' };
  if (x === 'R' || y === 'R') return { letter: 'R', label: 'Umbenannt (Git)', tone: 'info' };
  if (x === 'C' || y === 'C') return { letter: 'C', label: 'Kopiert (Git)', tone: 'info' };
  if (x === 'A') return { letter: 'A', label: 'Neu hinzugefügt (Git)', tone: 'success' };
  if (x === 'M' || y === 'M' || x === 'T' || y === 'T') return { letter: 'M', label: 'Geändert (Git)', tone: 'warning' };
  return { letter: xy.trim()[0] ?? '?', label: `Git-Status ${xy.trim()}`, tone: 'neutral' };
}

/** Builds the porcelain code from a git.status file entry. */
export function porcelainCode(entry: { index: string; workTree: string }): string {
  return `${entry.index || ' '}${entry.workTree || ' '}`.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Preview URLs
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * True only for plain http URLs on a loopback host (127.0.0.1, localhost, [::1]) without credentials.
 * Only these may be embedded in the preview iframe (the main process blocks every other frame URL).
 */
export function isLoopbackHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:') return false;
  if (parsed.username || parsed.password) return false;
  return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
}

/** True for http(s) URLs (allowed for "Im Browser öffnen"). */
export function isHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const p = new URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/** Monaco model URI of a project file. Keeps the file extension so the language services pick the right mode. */
export function modelUri(projectId: string, path: string): string {
  return `file:///${[projectId, ...path.split('/')].map((s) => encodeURIComponent(s)).join('/')}`;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  cs: 'csharp',
  py: 'python',
  java: 'java',
  go: 'go',
  rs: 'rust',
  cpp: 'cpp',
  cc: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  c: 'c',
  php: 'php',
  rb: 'ruby',
  sh: 'shell',
  ps1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  sql: 'sql',
  xml: 'xml',
  csproj: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  lua: 'lua',
  swift: 'swift',
  kt: 'kotlin',
  dart: 'dart',
  txt: 'plaintext',
};

/** Monaco language id for a path (used where the daemon does not send one, e.g. diffs). */
export function languageForPath(path: string): string {
  const name = fileName(path).toLowerCase();
  if (name === 'dockerfile') return 'dockerfile';
  const dot = name.lastIndexOf('.');
  return (dot >= 0 && LANGUAGE_BY_EXT[name.slice(dot + 1)]) || 'plaintext';
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  csharp: 'C#',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  cpp: 'C++',
  c: 'C',
  php: 'PHP',
  ruby: 'Ruby',
  shell: 'Shell',
  powershell: 'PowerShell',
  bat: 'Batch',
  sql: 'SQL',
  xml: 'XML',
  yaml: 'YAML',
  ini: 'INI',
  lua: 'Lua',
  swift: 'Swift',
  kotlin: 'Kotlin',
  dart: 'Dart',
  dockerfile: 'Dockerfile',
  plaintext: 'Nur Text',
};

/** Display name of a Monaco language id ("typescript" -> "TypeScript"). */
export function languageLabel(id: string | null | undefined): string {
  if (!id) return LANGUAGE_LABELS.plaintext;
  return LANGUAGE_LABELS[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** Last segment of a project-relative path. */
export function fileName(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Parent folder of a project-relative path ("" for top-level entries). */
export function parentPath(path: string): string {
  const i = path.lastIndexOf('/');
  return i > 0 ? path.slice(0, i) : '';
}

/** All ancestor folders of a path, outermost first: "a/b/c.ts" -> ["a", "a/b"]. */
export function ancestorPaths(path: string): string[] {
  const parts = path.split('/').filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join('/'));
  return out;
}

/** Joins a folder and a name to a project-relative path. */
export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

/** Absolute path of a project file for the OS (Explorer). */
export function absolutePath(projectRoot: string, relPath: string): string {
  const windows = /^[a-zA-Z]:[\\/]/.test(projectRoot) || projectRoot.startsWith('\\\\');
  const sep = windows ? '\\' : '/';
  const root = projectRoot.replace(/[\\/]+$/, '');
  return relPath ? `${root}${sep}${relPath.split('/').join(sep)}` : root;
}

/**
 * Validates a new file/folder name typed by the user. Returns a German error or null.
 * Allows sub folders ("src/utils.ts") but no absolute paths, ".." or Windows-forbidden characters.
 */
export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Bitte einen Namen eingeben.';
  if (/^[a-zA-Z]:|^[\\/]/.test(trimmed)) return 'Bitte einen Namen innerhalb des Projekts angeben, keinen vollständigen Pfad.';
  const parts = trimmed.replace(/\\/g, '/').split('/');
  for (const part of parts) {
    if (!part) return 'Der Name enthält einen leeren Ordnerteil („//“).';
    if (part === '.' || part === '..') return '„.“ und „..“ sind als Name nicht erlaubt.';
    if (/[<>:"|?*\u0000-\u001f]/.test(part)) return 'Diese Zeichen sind in Namen nicht erlaubt: < > : " | ? *';
    if (/[. ]$/.test(part)) return 'Ein Name darf nicht mit einem Punkt oder Leerzeichen enden.';
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(part)) return `„${part}“ ist unter Windows ein reservierter Name.`;
  }
  return null;
}

/** Normalizes a validated entry name ("a\\b" -> "a/b"). */
export function normalizeEntryName(name: string): string {
  return name.trim().replace(/\\/g, '/');
}

// ---------------------------------------------------------------------------
// File tree
// ---------------------------------------------------------------------------

/** Children of `dirPath` from the loaded tree, using lazily loaded folders where available. */
export function childrenOf(root: FileNode | null, loaded: ReadonlyMap<string, FileNode[]>, dirPath: string): FileNode[] | null {
  const lazy = loaded.get(dirPath);
  if (lazy) return lazy;
  if (!root) return null;
  if (dirPath === '') return root.children;
  const node = findNode(root, dirPath, loaded);
  return node ? node.children : null;
}

/** Finds a node by path in the tree (also inside lazily loaded folders). */
export function findNode(root: FileNode | null, path: string, loaded: ReadonlyMap<string, FileNode[]> = new Map()): FileNode | null {
  if (!root) return null;
  if (path === root.path) return root;
  const segments = path.split('/');
  let currentPath = '';
  let children: FileNode[] | null = loaded.get('') ?? root.children;
  let node: FileNode | null = null;
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    node = children?.find((c) => c.path === currentPath) ?? null;
    if (!node) return null;
    children = loaded.get(node.path) ?? node.children;
  }
  return node;
}

export interface VisibleTreeRow {
  node: FileNode;
  level: number;
  /** null = children not loaded yet. */
  childCount: number | null;
  expanded: boolean;
  parent: string | null;
}

/** Flattens the expanded part of the tree into rows (keyboard navigation + rendering). */
export function visibleRows(root: FileNode | null, loaded: ReadonlyMap<string, FileNode[]>, expanded: ReadonlySet<string>): VisibleTreeRow[] {
  const rows: VisibleTreeRow[] = [];
  const walk = (nodes: FileNode[] | null, level: number, parent: string | null) => {
    if (!nodes) return;
    for (const node of nodes) {
      const kids = node.type === 'dir' ? (loaded.get(node.path) ?? node.children) : null;
      const isOpen = node.type === 'dir' && expanded.has(node.path);
      rows.push({ node, level, childCount: kids ? kids.length : null, expanded: isOpen, parent });
      if (isOpen) walk(kids, level + 1, node.path);
    }
  };
  walk(root ? (loaded.get('') ?? root.children) : null, 1, null);
  return rows;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchGroup {
  path: string;
  matches: SearchMatch[];
}

/** Groups search matches by file, keeping the order of the first appearance. */
export function groupSearchMatches(matches: readonly SearchMatch[]): SearchGroup[] {
  const map = new Map<string, SearchMatch[]>();
  for (const m of matches) {
    const list = map.get(m.path);
    if (list) list.push(m);
    else map.set(m.path, [m]);
  }
  return [...map.entries()].map(([path, list]) => ({ path, matches: list }));
}

export interface TextSegment {
  text: string;
  match: boolean;
}

/**
 * Splits a preview line into plain and highlighted parts (rendered as text, never as HTML).
 * Falls back to a single plain segment for invalid expressions.
 */
export function highlightSegments(text: string, query: string, options: { regex: boolean; caseSensitive: boolean }): TextSegment[] {
  if (!query) return [{ text, match: false }];
  let re: RegExp;
  try {
    re = new RegExp(options.regex ? query : escapeRegExp(query), options.caseSensitive ? 'g' : 'gi');
  } catch {
    return [{ text, match: false }];
  }
  const out: TextSegment[] = [];
  let last = 0;
  let guard = 0;
  for (let m = re.exec(text); m && guard < 200; m = re.exec(text), guard++) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    if (m.index > last) out.push({ text: text.slice(last, m.index), match: false });
    out.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), match: false });
  return out.length ? out : [{ text, match: false }];
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Checks a regular expression typed by the user. Returns a German error or null. */
export function regexError(query: string): string | null {
  try {
    new RegExp(query);
    return null;
  } catch {
    return 'Der reguläre Ausdruck ist ungültig.';
  }
}

// ---------------------------------------------------------------------------
// Checks and findings
// ---------------------------------------------------------------------------

/** Latest run per check kind (newest first by start time). */
export function latestRunsByKind(runs: readonly CheckRun[]): CheckRun[] {
  const map = new Map<CheckKind, CheckRun>();
  for (const run of [...runs].sort((a, b) => b.startedAt - a.startedAt)) {
    if (!map.has(run.kind)) map.set(run.kind, run);
  }
  return [...map.values()];
}

export interface FailureEntry {
  run: CheckRun;
  failure: CheckFailure;
}

/** Failures of the latest run of every kind that did not pass. */
export function latestFailures(runs: readonly CheckRun[]): FailureEntry[] {
  const out: FailureEntry[] = [];
  for (const run of latestRunsByKind(runs)) {
    if (run.status !== 'failed' && run.status !== 'error') continue;
    for (const failure of run.failures) out.push({ run, failure });
  }
  return out;
}

export interface EditorMarker {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  source: string;
}

const FINDING_SEVERITY: Record<ReviewFinding['severity'], EditorMarker['severity']> = {
  critical: 'error',
  major: 'warning',
  minor: 'info',
  info: 'hint',
};

/**
 * Editor markers for one file: failures of the latest failed checks and reviewer findings of the project's tasks.
 * Only entries with a line number are returned.
 */
export function markersForFile(path: string, runs: readonly CheckRun[], tasks: readonly Task[]): EditorMarker[] {
  const out: EditorMarker[] = [];
  for (const { run, failure } of latestFailures(runs)) {
    if (failure.file !== path || failure.line == null) continue;
    out.push({ line: failure.line, column: failure.column ?? 1, message: failure.message, severity: 'error', source: `NOVA · ${checkSourceLabel(run.kind)}` });
  }
  for (const task of tasks) {
    if (task.status === 'cancelled') continue;
    for (const check of task.verification.checks) {
      for (const finding of check.findings ?? []) {
        if (finding.file !== path || finding.line == null) continue;
        out.push({ line: finding.line, column: 1, message: finding.message, severity: FINDING_SEVERITY[finding.severity] ?? 'info', source: `NOVA · Review: ${task.title}` });
      }
    }
  }
  return out;
}

function checkSourceLabel(kind: CheckKind): string {
  switch (kind) {
    case 'test':
      return 'Tests';
    case 'build':
      return 'Build';
    case 'lint':
      return 'Code-Stil';
    case 'typecheck':
      return 'Typprüfung';
    default:
      return 'Prüfung';
  }
}

// ---------------------------------------------------------------------------
// Process output
// ---------------------------------------------------------------------------

/** Removes ANSI escape sequences (colors, cursor movement) from process output for plain-text display. */
export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g, '').replace(/\r\n?/g, '\n');
}

/** Keeps at most `maxChars` characters at the end of a text, cutting at a line start. */
export function tailText(text: string, maxChars = 200_000): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(text.length - maxChars);
  const nl = cut.indexOf('\n');
  return nl >= 0 ? cut.slice(nl + 1) : cut;
}
