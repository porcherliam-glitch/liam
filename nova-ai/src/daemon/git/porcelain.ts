// Pure parsers for git's machine-readable output (no process spawning here, fully unit-testable).
// Key decisions:
// - Only NUL-separated formats are parsed (`status --porcelain=v1 -b -z`, `diff --name-status -z`, `ls-files -z`),
//   so file names with spaces, quotes or non-ASCII characters never need unquoting (core.quotepath=off as well).
// - Porcelain v1 paths are relative to the repository top level. GitService passes the root's prefix
//   (`rev-parse --show-prefix`) so every path handed out is relative to the root the caller passed in.
// - Clone progress is parsed from the English `--progress` lines (LC_ALL=C) and mapped to one overall percentage
//   with German phase texts for the operation view.

export interface StatusEntry {
  /** Index (staging area) status letter, e.g. 'M', 'A', '?', ' '. */
  index: string;
  /** Work tree status letter. */
  workTree: string;
  /** Path relative to the top level (or to the prefix when one was given). */
  path: string;
  /** Source path of a rename/copy. */
  origPath: string | null;
}

export interface BranchInfo {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** "No commits yet" – HEAD does not point to a commit. */
  unborn: boolean;
  detached: boolean;
}

export interface ParsedStatus {
  branch: BranchInfo;
  entries: StatusEntry[];
  /** Entries outside the prefix (never returned to callers; counted for diagnostics). */
  outside: number;
}

const EMPTY_BRANCH: BranchInfo = { branch: null, upstream: null, ahead: 0, behind: 0, unborn: false, detached: false };

/** Parses the `## ...` header of `git status -b`. */
export function parseBranchHeader(line: string): BranchInfo {
  let rest = line.startsWith('## ') ? line.slice(3) : line;
  const info: BranchInfo = { ...EMPTY_BRANCH };
  const unborn = /^(?:No commits yet on|Initial commit on) (.+)$/.exec(rest);
  if (unborn) {
    info.branch = unborn[1].trim();
    info.unborn = true;
    return info;
  }
  if (/^HEAD \(no branch\)/.test(rest)) {
    info.detached = true;
    return info;
  }
  const bracket = /\s\[([^\]]*)\]$/.exec(rest);
  if (bracket) {
    rest = rest.slice(0, bracket.index);
    const ahead = /ahead (\d+)/.exec(bracket[1]);
    const behind = /behind (\d+)/.exec(bracket[1]);
    if (ahead) info.ahead = Number(ahead[1]);
    if (behind) info.behind = Number(behind[1]);
  }
  // Ref names cannot contain "..", so "..." always separates branch and upstream.
  const sep = rest.indexOf('...');
  if (sep >= 0) {
    info.branch = rest.slice(0, sep) || null;
    info.upstream = rest.slice(sep + 3) || null;
  } else {
    info.branch = rest.trim() || null;
  }
  return info;
}

/** Strips `prefix` (e.g. "sub/dir/") from a top-level relative path; null when the path lies outside. */
export function stripPrefix(path: string, prefix: string, caseInsensitive: boolean): string | null {
  if (!prefix) return path;
  const p = caseInsensitive ? path.toLowerCase() : path;
  const pre = caseInsensitive ? prefix.toLowerCase() : prefix;
  if (!p.startsWith(pre)) return null;
  const rest = path.slice(prefix.length);
  return rest === '' ? null : rest;
}

/**
 * Parses `git status --porcelain=v1 -b -z` output. Entries are `XY path\0`; renames/copies (R or C in either column)
 * are followed by the original path as an extra NUL-terminated field.
 */
export function parseStatusZ(stdout: string, prefix = '', caseInsensitive = false): ParsedStatus {
  const fields = stdout.split('\0');
  let branch: BranchInfo = { ...EMPTY_BRANCH };
  const entries: StatusEntry[] = [];
  let outside = 0;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f === '') continue;
    if (f.startsWith('## ')) {
      branch = parseBranchHeader(f);
      continue;
    }
    if (f.length < 4 || f[2] !== ' ') continue; // not an entry (defensive)
    const index = f[0];
    const workTree = f[1];
    const rawPath = f.slice(3);
    let origRaw: string | null = null;
    if (index === 'R' || index === 'C' || workTree === 'R' || workTree === 'C') {
      origRaw = fields[i + 1] ?? null;
      i++;
    }
    const path = stripPrefix(rawPath, prefix, caseInsensitive);
    if (path === null) {
      outside++;
      continue;
    }
    const origPath = origRaw === null ? null : (stripPrefix(origRaw, prefix, caseInsensitive) ?? origRaw);
    entries.push({ index, workTree, path, origPath });
  }
  return { branch, entries, outside };
}

export interface NameStatusEntry {
  status: string; // A, M, D, T, U, X (renames are disabled with --no-renames)
  path: string;
}

/** Parses `git diff --name-status -z --no-renames`: alternating status and path fields. */
export function parseNameStatusZ(stdout: string): NameStatusEntry[] {
  const fields = stdout.split('\0');
  const out: NameStatusEntry[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const status = fields[i];
    const path = fields[i + 1];
    if (!status || !path) continue;
    const letter = status[0];
    if (letter === 'R' || letter === 'C') {
      // Defensive: with renames enabled the record has two paths (old, new) – report the new one as added.
      const newPath = fields[i + 2];
      if (newPath) out.push({ status: 'A', path: newPath });
      i++;
      continue;
    }
    out.push({ status: letter, path });
  }
  return out;
}

/** Splits NUL-separated output (ls-files -z, check-ignore -z) into non-empty entries. */
export function splitZ(stdout: string): string[] {
  return stdout.split('\0').filter((s) => s !== '');
}

export const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%at%x1f%s%x1e';

export interface ParsedCommit {
  hash: string;
  shortHash: string;
  author: string;
  date: number;
  subject: string;
  byNova: boolean;
}

/** Parses `git log --format=LOG_FORMAT` (fields 0x1f, records 0x1e). NOVA commits have subjects starting with "NOVA:". */
export function parseLog(stdout: string): ParsedCommit[] {
  const out: ParsedCommit[] = [];
  for (const raw of stdout.split('\x1e')) {
    const rec = raw.replace(/^\s+/, '');
    if (!rec) continue;
    const [hash, shortHash, author, at, ...subjectParts] = rec.split('\x1f');
    if (!hash || !/^[0-9a-f]{7,64}$/.test(hash)) continue;
    const subject = subjectParts.join('\x1f').replace(/\s+$/, '');
    out.push({
      hash,
      shortHash: shortHash ?? hash.slice(0, 7),
      author: author ?? '',
      date: Number(at) * 1000 || 0,
      subject,
      byNova: subject.startsWith('NOVA:'),
    });
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ clone progress

const PHASES: { re: RegExp; from: number; to: number; text: string }[] = [
  { re: /Enumerating objects/, from: 0, to: 2, text: 'Objekte werden aufgelistet' },
  { re: /Counting objects/, from: 2, to: 5, text: 'Objekte werden gezählt' },
  { re: /Compressing objects/, from: 5, to: 10, text: 'Objekte werden komprimiert' },
  { re: /Receiving objects/, from: 10, to: 80, text: 'Objekte werden empfangen' },
  { re: /Resolving deltas/, from: 80, to: 95, text: 'Änderungen werden aufgelöst' },
  { re: /(?:Updating files|Checking out files|Filtering content)/, from: 95, to: 100, text: 'Dateien werden ausgecheckt' },
];

export interface CloneProgress {
  percent: number | null;
  message: string;
}

/** Parses one progress line of `git clone --progress` into an overall percentage + German message (null = no progress line). */
export function parseCloneProgressLine(line: string): CloneProgress | null {
  const text = line.trim().replace(/^remote:\s*/, '');
  if (!text) return null;
  for (const phase of PHASES) {
    if (!phase.re.test(text)) continue;
    const pct = /:\s+(\d{1,3})%/.exec(text);
    const counts = /\((\d+)\/(\d+)\)/.exec(text);
    const size = /,\s*([\d.]+\s*[KMG]iB)/.exec(text);
    let message = phase.text;
    if (pct) message += ` … ${pct[1]} %`;
    if (counts) message += ` (${counts[1]} von ${counts[2]})`;
    if (size) message += `, ${size[1]}`;
    if (!pct) return { percent: phase.from, message };
    const p = Math.max(0, Math.min(100, Number(pct[1])));
    return { percent: Math.round(phase.from + ((phase.to - phase.from) * p) / 100), message };
  }
  if (/^Cloning into /.test(text)) return { percent: 0, message: 'Verbindung wird aufgebaut …' };
  return null;
}

/**
 * Stateful splitter for the progress stream: git rewrites progress lines with '\r'. Returns the parsed progress
 * updates contained in a chunk (the last partial line is kept for the next chunk).
 */
export function createProgressSplitter(): (chunk: string) => CloneProgress[] {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split(/[\r\n]/);
    buffer = parts.pop() ?? '';
    if (buffer.length > 4096) buffer = buffer.slice(-4096);
    const out: CloneProgress[] = [];
    for (const p of parts) {
      const parsed = parseCloneProgressLine(p);
      if (parsed) out.push(parsed);
    }
    return out;
  };
}

/** Last meaningful stderr line (hints and progress lines removed), for German error messages. */
export function lastErrorLine(stderr: string): string {
  const lines = stderr
    .split(/[\r\n]+/)
    .map((l) => l.trim())
    .filter((l) => l && !/^hint:/i.test(l) && !parseCloneProgressLine(l));
  const fatal = [...lines].reverse().find((l) => /^(fatal|error):/i.test(l));
  return (fatal ?? lines[lines.length - 1] ?? '').slice(0, 500);
}
