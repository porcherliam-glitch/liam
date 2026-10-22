// GitService (SPEC §4.6, §6.6): status, diff, log, init, commits of NOVA's files, clone, clean-path detection and
// blob access for the change journal and the editor.
// Key decisions:
// - All paths handed in and out are relative to the `root` the caller passes, with '/'. The root may be a
//   subdirectory of a larger repository: porcelain paths (top-level relative) are re-based with
//   `rev-parse --show-prefix`, blob specs use `<ref>:./<path>` and diffs use `--relative`.
// - Read-only calls use GIT_OPTIONAL_LOCKS=0. Mutating calls (init, add/commit, safe.directory) are serialized per
//   canonical repository root. A stale lock file (no NOVA git process for that repo, older than 60 s) is removed
//   with a warning and the command is retried once; a fresh lock is retried every second, at most 5 times.
// - "dubious ownership": GIT_ERROR plus a security_config approval for
//   `git config --global --add safe.directory <path>`. NOVA never adds it on its own; only an approved request is
//   executed (immediately via approvals.onDecision, or on the next git call that finds the approval).
// - commitPaths stages exactly the given paths (existing or tracked, not ignored), commits them with
//   `commit --only` (the user's other staged changes stay untouched, hooks run) and restores the previous index
//   entries of those paths when nothing was committed or the commit failed. Without a configured identity the
//   commit uses `-c user.name="NOVA AI" -c user.email="nova@localhost"` for that commit only.
// - clone: only https://, ssh:// and git@host: URLs (no credentials in the URL), GIT_ALLOW_PROTOCOL=https:ssh, no
//   submodules, host checked against settings.network.allowedHosts (otherwise a 'network' approval), progress
//   parsed from --progress, abort kills the process tree and removes the partial clone. The daemon has no console,
//   so ssh runs with BatchMode=yes (unless the user configured an own ssh command) and a stalled HTTPS transfer is
//   aborted after 5 minutes without data; HTTPS sign-in goes through the user's credential helper (Git Credential
//   Manager), terminal prompts are disabled.
// - Never push, reset, clean, checkout or rewrite history.
// Honest limit: git hooks of a repository (pre-commit, commit-msg …) run with the user's rights when NOVA commits.
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, posix, win32 } from 'node:path';
import type { Approval, FileDiff, GitCommit, GitStatus } from '@shared/schemas';
import type { ApprovalRequest, GitService, Services } from '../contracts';
import type { ExecToolResult } from '../core/exec';
import { NovaError, errorMessage, isNovaError, validation } from '../core/errors';
import { unlinkWithRetry } from '../core/fs-atomic';
import { assertHostAllowed } from '../core/net';
import { redactString } from '../core/redact';
import { sleep } from '../core/time';
import {
  BIG_BUFFER,
  CLONE_TIMEOUT_MS,
  GIT_REF_RE,
  GitRunner,
  KeyedMutex,
  WRITE_TIMEOUT_MS,
  dubiousPath,
  isDubiousOwnership,
  isLockFailure,
  type GitCallOptions,
  type GitRawOptions,
  type GitRawResult,
} from './runner';
import { LOG_FORMAT, createProgressSplitter, lastErrorLine, parseLog, parseNameStatusZ, parseStatusZ, splitZ } from './porcelain';

export interface GitServiceOptions {
  platform?: NodeJS.Platform;
  /** Fixed git executable (tests); otherwise integrations.resolvePath('git') with fallback "git". */
  gitPath?: string;
  /** Extra environment for every git call (tests: GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM …). */
  extraEnv?: Record<string, string>;
  /** Age after which a lock file counts as stale (default 60 s). */
  staleLockMs?: number;
  /** Delay between lock retries (default 1 s). */
  lockRetryDelayMs?: number;
  /** Retries for a fresh lock (default 5). */
  lockRetries?: number;
}

/** Max files with full content in one diff() result (the rest is listed by the caller's own means). */
export const MAX_DIFF_FILES = 200;
/** Files larger than this are shown as "too large" instead of loading their content. */
export const MAX_DIFF_CONTENT_BYTES = 5 * 1024 * 1024;
/** Max status entries returned (the clean flag is computed from all). */
export const MAX_STATUS_FILES = 20_000;
const MAX_UNIFIED_CHARS = 2 * 1024 * 1024;
const ARGV_PATHS_LIMIT = 8000;
const NULL_SHA = '0000000000000000000000000000000000000000';
/** ssh for clones without a user-configured ssh command: never prompts, gives up on unreachable hosts after 30 s. */
export const SSH_BATCH_COMMAND = 'ssh -o BatchMode=yes -o ConnectTimeout=30';
/**
 * Clone-only config: no submodules; an HTTPS transfer that delivers less than 1 byte/s for 5 minutes counts as
 * stalled and is aborted (servers send keep-alives while they prepare large packs), instead of waiting for the 2 h
 * overall timeout.
 */
export const CLONE_CONFIG = ['-c', 'submodule.recurse=false', '-c', 'http.lowSpeedLimit=1', '-c', 'http.lowSpeedTime=300'];

interface RepoInfo {
  /** Top level as printed by git. */
  top: string;
  /** Root relative to the top level ("" or "sub/dir/"). */
  prefix: string;
  gitDir: string;
  /** Canonical top level (mutex key, case-folded on Windows). */
  key: string;
}

const EMPTY_STATUS: GitStatus = { isRepo: false, branch: null, head: null, ahead: 0, behind: 0, files: [], clean: true };

function gitError(what: string, r: { code: number | null; stderr: string; timedOut?: boolean }): NovaError {
  const line = redactString(lastErrorLine(r.stderr));
  const message = r.timedOut ? `${what}: Zeitüberschreitung.` : line ? `${what}: ${line}` : `${what} (Exit-Code ${r.code ?? '–'}).`;
  return new NovaError('GIT_ERROR', message, { severity: 'warning', details: { exitCode: r.code, stderr: redactString(r.stderr).slice(-4000) } });
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function isBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** Unified diff text for a file that does not exist on the old side (untracked/new). */
export function unifiedForNewFile(path: string, content: string, binary: boolean): string {
  const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n`;
  if (binary) return `${header}Binary files /dev/null and b/${path} differ\n`;
  if (content === '') return header;
  const lines = content.split('\n');
  const endsWithNewline = lines[lines.length - 1] === '';
  if (endsWithNewline) lines.pop();
  let text = `${header}--- /dev/null\n+++ b/${path}\n@@ -0,0 +1${lines.length === 1 ? '' : `,${lines.length}`} @@\n`;
  text += lines.map((l) => `+${l}`).join('\n') + '\n';
  if (!endsWithNewline) text += '\\ No newline at end of file\n';
  return text;
}

export function createGitService(s: Services, options: GitServiceOptions = {}): GitService {
  const platform = options.platform ?? s.core.platform;
  const ci = platform === 'win32';
  const pathApi = ci ? win32 : posix;
  const log = s.core.log.child('git');
  const staleLockMs = options.staleLockMs ?? 60_000;
  const lockRetryDelayMs = options.lockRetryDelayMs ?? 1000;
  const lockRetries = options.lockRetries ?? 5;
  const mutex = new KeyedMutex();
  const repoCache = new Map<string, { info: RepoInfo | null; at: number }>();
  let gitPathCache: { value: string; at: number } | null = null;
  let availableCache: { value: boolean; at: number } | null = null;
  let decisionUnsub: (() => void) | null = null;

  const now = () => Date.now();
  const norm = (p: string) => (ci ? p.toLowerCase() : p);

  async function resolveGit(): Promise<string> {
    if (options.gitPath) return options.gitPath;
    if (gitPathCache && now() - gitPathCache.at < 60_000) return gitPathCache.value;
    let resolved: string | null = null;
    try {
      resolved = await s.integrations.resolvePath('git');
    } catch (e) {
      log.debug('Git-Pfad über Integrationen nicht ermittelbar – nutze "git"', { error: errorMessage(e) });
    }
    const value = resolved && existsSync(resolved) ? resolved : 'git';
    gitPathCache = { value, at: now() };
    return value;
  }

  const runner = new GitRunner(platform, resolveGit, options.extraEnv ?? {}, () => {
    gitPathCache = null;
    availableCache = { value: false, at: now() };
  });

  // ------------------------------------------------------------------------------------------------ helpers

  function ensureRoot(root: string): void {
    if (typeof root !== 'string' || !pathApi.isAbsolute(root)) throw validation(`Der Projektordner muss ein absoluter Pfad sein: ${String(root)}`);
    let st;
    try {
      st = statSync(root, { throwIfNoEntry: false });
    } catch {
      st = undefined;
    }
    if (!st || !st.isDirectory()) {
      throw new NovaError('NOT_FOUND', `Der Projektordner wurde nicht gefunden: ${root}`, { severity: 'warning' });
    }
  }

  function canonical(p: string): string {
    let real = p;
    try {
      real = realpathSync.native(p);
    } catch {
      real = pathApi.resolve(p);
    }
    return norm(real.replace(/[\\/]+$/, '') || real);
  }

  /** Validates a root-relative path and returns it with '/' separators. */
  function normalizeRel(p: string): string {
    if (typeof p !== 'string' || p.trim() === '') throw validation('Leerer Dateipfad.');
    if (/[\0\r\n]/.test(p)) throw validation('Ungültiges Zeichen im Dateipfad.');
    let v = ci ? p.replace(/\\/g, '/') : p;
    while (v.startsWith('./')) v = v.slice(2);
    if (v.startsWith('/') || /^[A-Za-z]:/.test(v)) throw validation(`Der Pfad muss relativ zum Projektordner sein: ${p}`);
    const parts = v.split('/').filter((x) => x !== '' && x !== '.');
    if (parts.some((x) => x === '..')) throw validation(`Der Pfad liegt außerhalb des Projektordners: ${p}`);
    if (parts.length === 0) throw validation('Leerer Dateipfad.');
    return parts.join('/');
  }

  function tryRel(p: string): string | null {
    try {
      return normalizeRel(p);
    } catch {
      return null;
    }
  }

  function findProjectId(root: string): string | null {
    try {
      const key = canonical(root);
      for (const p of s.projects.list({ includeArchived: true })) {
        const pk = canonical(p.path);
        if (key === pk || key.startsWith(pk + (ci ? '\\' : '/'))) return p.id;
      }
    } catch (e) {
      log.debug('Projekt zum Git-Ordner nicht ermittelbar', { error: errorMessage(e) });
    }
    return null;
  }

  // ------------------------------------------------------------------------------------------------ dubious ownership

  async function addSafeDirectory(repoPath: string, approval: Approval | null): Promise<void> {
    if (approval) {
      try {
        s.approvals.consume(approval.id);
      } catch (e) {
        log.debug('Freigabe bereits verbraucht', { error: errorMessage(e) });
      }
    }
    const cwd = existsSync(s.core.paths.root) ? s.core.paths.root : homedir();
    const existing = await runner.run(['config', '--global', '--get-all', 'safe.directory'], { cwd });
    const entries = existing.code === 0 ? existing.stdout.split(/\r?\n/).map((l) => l.trim()) : [];
    if (entries.some((e) => (ci ? e.toLowerCase() === repoPath.toLowerCase() : e === repoPath))) return;
    const r = await runner.run(['config', '--global', '--add', 'safe.directory', repoPath], { cwd, write: true });
    if (r.code !== 0) throw gitError('Der Ordner konnte nicht als vertrauenswürdig eingetragen werden', r);
    repoCache.clear();
    log.info('Ordner nach Freigabe als vertrauenswürdig für Git eingetragen', { path: repoPath });
  }

  function ensureDecisionListener(): void {
    if (decisionUnsub) return;
    try {
      decisionUnsub = s.approvals.onDecision((a) => {
        if (a.status !== 'approved' || a.kind !== 'security_config' || a.details?.action !== 'git-safe-directory') return;
        const p = typeof a.details.path === 'string' ? a.details.path : null;
        if (!p) return;
        void addSafeDirectory(p, a)
          .then(async () => {
            if (a.projectId) await s.projects.refreshGit(a.projectId).catch(() => undefined);
          })
          .catch((e) => log.warn('safe.directory nach Freigabe fehlgeschlagen', { error: errorMessage(e) }));
      });
    } catch (e) {
      log.debug('Freigabe-Ereignisse nicht verfügbar', { error: errorMessage(e) });
    }
  }

  /** Returns true when the directory was just marked safe (caller retries once); otherwise throws GIT_ERROR. */
  async function handleDubious(root: string, stderr: string): Promise<boolean> {
    const repoPath = dubiousPath(stderr) ?? (ci ? root.replace(/\\/g, '/') : root);
    const subject = `git config --global --add safe.directory ${repoPath}`;
    const req: ApprovalRequest = {
      projectId: findProjectId(root),
      taskId: null,
      runId: null,
      kind: 'security_config',
      title: 'Git-Ordner als vertrauenswürdig eintragen',
      action: `Git verweigert den Zugriff auf „${repoPath}“, weil der Ordner einem anderen Benutzerkonto gehört. Bei Zustimmung führt NOVA aus: ${subject}`,
      consequences:
        'Git vertraut diesem Ordner danach dauerhaft – für alle Git-Programme dieses Windows-Kontos. Nur zustimmen, wenn der Ordner aus einer vertrauenswürdigen Quelle stammt.',
      subject,
      details: { action: 'git-safe-directory', path: repoPath },
    };
    const baseMessage = `Git verweigert den Zugriff auf „${repoPath}“, weil der Ordner einem anderen Benutzerkonto gehört („dubious ownership“).`;
    let check;
    try {
      check = s.approvals.check(req);
    } catch (e) {
      log.warn('Freigabe für safe.directory konnte nicht angelegt werden', { error: errorMessage(e) });
      throw new NovaError('GIT_ERROR', baseMessage, { severity: 'warning', userAction: `Im Terminal ausführen: ${subject}` });
    }
    ensureDecisionListener();
    if (check.state === 'approved') {
      await addSafeDirectory(repoPath, check.approval && !check.viaRule ? check.approval : null);
      return true;
    }
    if (check.state === 'denied') {
      throw new NovaError('GIT_ERROR', `${baseMessage} Die Freigabe wurde abgelehnt.`, {
        severity: 'warning',
        details: { approvalId: check.approval.id, path: repoPath },
        userAction: `Falls der Ordner vertrauenswürdig ist, im Terminal ausführen: ${subject}`,
      });
    }
    throw new NovaError('GIT_ERROR', `${baseMessage} Bitte unter „Freigaben“ entscheiden, ob NOVA den Ordner als vertrauenswürdig eintragen soll.`, {
      severity: 'warning',
      details: { approvalId: check.approval.id, path: repoPath },
      userAction: 'Unter „Freigaben“ zustimmen oder ablehnen.',
    });
  }

  /** Text git call in `root` with dubious-ownership handling (one retry after an approved safe.directory). */
  async function call(root: string, args: string[], o: Omit<GitCallOptions, 'cwd'> = {}, retried = false): Promise<ExecToolResult> {
    const r = await runner.run(args, { ...o, cwd: root });
    if (r.code !== 0 && isDubiousOwnership(r.stderr)) {
      const fixed = await handleDubious(root, r.stderr);
      if (fixed && !retried) return call(root, args, o, true);
    }
    return r;
  }

  async function callRaw(root: string, args: string[], o: Omit<GitRawOptions, 'cwd'> = {}, retried = false): Promise<GitRawResult> {
    const r = await runner.raw(args, { ...o, cwd: root });
    if (r.code !== 0 && isDubiousOwnership(r.stderr)) {
      const fixed = await handleDubious(root, r.stderr);
      if (fixed && !retried) return callRaw(root, args, o, true);
    }
    return r;
  }

  /** Mutating call (caller holds the repo mutex) with lock-file handling. */
  async function write(root: string, info: RepoInfo | null, args: string[], o: Omit<GitCallOptions, 'cwd' | 'write'> = {}): Promise<ExecToolResult> {
    let removedStale = false;
    for (let attempt = 0; ; attempt++) {
      const r = await call(root, args, { ...o, write: true });
      if (r.code === 0 || !isLockFailure(r.stderr) || !info) return r;
      const named = /Unable to create '([^']+\.lock)'/i.exec(r.stderr)?.[1] ?? null;
      const lockPath = named && isAbsolute(named) ? named : join(info.gitDir, named ? named : 'index.lock');
      const insideGitDir = canonical(lockPath).startsWith(canonical(info.gitDir));
      let st;
      try {
        st = statSync(lockPath, { throwIfNoEntry: false });
      } catch {
        st = undefined;
      }
      if (st && insideGitDir && !removedStale && now() - st.mtimeMs > staleLockMs && mutex.holders(info.key) <= 1) {
        try {
          unlinkWithRetry(lockPath);
          removedStale = true;
          log.warn('Veraltete Git-Sperrdatei entfernt (kein Git-Vorgang von NOVA aktiv, älter als 60 Sekunden)', { lock: lockPath });
          continue;
        } catch (e) {
          log.warn('Veraltete Git-Sperrdatei konnte nicht entfernt werden', { lock: lockPath, error: errorMessage(e) });
        }
      }
      if (attempt >= lockRetries) {
        throw new NovaError('GIT_ERROR', 'Das Git-Repository ist gerade von einem anderen Programm gesperrt (Sperrdatei vorhanden). Bitte andere Git-Programme schließen und es erneut versuchen.', {
          severity: 'warning',
          details: { lock: lockPath, stderr: redactString(r.stderr).slice(-2000) },
          userAction: 'Andere Git-Programme (Editor, Git-Oberfläche) schließen und den Vorgang wiederholen.',
        });
      }
      await sleep(lockRetryDelayMs);
    }
  }

  async function repoInfo(root: string, fresh = false): Promise<RepoInfo | null> {
    const cacheKey = canonical(root);
    const cached = repoCache.get(cacheKey);
    // Repositories rarely disappear (30 s), but a folder may become one at any time (git init in the terminal): 5 s.
    if (!fresh && cached && now() - cached.at < (cached.info ? 30_000 : 5_000)) return cached.info;
    const r = await call(root, ['rev-parse', '--show-toplevel', '--show-prefix', '--absolute-git-dir']);
    let info: RepoInfo | null = null;
    if (r.code === 0) {
      const lines = r.stdout.split(/\r?\n/);
      const top = (lines[0] ?? '').trim();
      const prefix = lines[1] ?? '';
      const gitDir = (lines[2] ?? '').trim();
      if (top && gitDir) info = { top, prefix: prefix.trim() ? prefix.replace(/\r$/, '') : '', gitDir, key: canonical(top) };
    }
    repoCache.set(cacheKey, { info, at: now() });
    if (repoCache.size > 500) repoCache.delete(repoCache.keys().next().value as string);
    return info;
  }

  function pathspecArgs(paths: string[]): { args: string[]; input?: string } {
    const total = paths.reduce((n, p) => n + p.length + 1, 0);
    if (total <= ARGV_PATHS_LIMIT) return { args: ['--', ...paths] };
    return { args: ['--pathspec-from-file=-', '--pathspec-file-nul'], input: paths.join('\0') + '\0' };
  }

  async function headOf(root: string): Promise<string | null> {
    const r = await call(root, ['rev-parse', '--verify', '--quiet', '--end-of-options', 'HEAD^{commit}']);
    if (r.code !== 0) return null;
    const h = r.stdout.trim();
    return /^[0-9a-f]{7,64}$/.test(h) ? h : null;
  }

  async function emptyTree(root: string): Promise<string> {
    const r = await call(root, ['hash-object', '-t', 'tree', '--stdin'], { input: '' });
    const h = r.stdout.trim();
    if (r.code !== 0 || !/^[0-9a-f]{40,64}$/.test(h)) throw gitError('Leerer Git-Baum konnte nicht ermittelt werden', r);
    return h;
  }

  async function lsTracked(root: string): Promise<string[]> {
    const r = await call(root, ['ls-files', '-z', '--cached', '--', '.'], { maxBuffer: BIG_BUFFER });
    if (r.code !== 0) throw gitError('Git-Dateiliste konnte nicht gelesen werden', r);
    return splitZ(r.stdout);
  }

  function existsOnDisk(abs: string): boolean {
    try {
      lstatSync(abs);
      return true;
    } catch {
      return false;
    }
  }

  /** Configured identity parts (config or environment); missing ones get the NOVA fallback for this commit only. */
  async function identityArgs(root: string): Promise<string[]> {
    const env = process.env;
    const [name, email] = await Promise.all([call(root, ['config', '--get', 'user.name']), call(root, ['config', '--get', 'user.email'])]);
    const hasName = (name.code === 0 && name.stdout.trim() !== '') || (!!env.GIT_AUTHOR_NAME && !!env.GIT_COMMITTER_NAME);
    const hasEmail = (email.code === 0 && email.stdout.trim() !== '') || (!!env.GIT_AUTHOR_EMAIL && !!env.GIT_COMMITTER_EMAIL);
    const args: string[] = [];
    if (!hasName) args.push('-c', 'user.name=NOVA AI');
    if (!hasEmail) args.push('-c', 'user.email=nova@localhost');
    return args;
  }

  function sanitizeMessage(message: string): string {
    const cleaned = String(message ?? '')
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 5000);
    return cleaned || 'NOVA: Änderungen';
  }

  interface IndexEntry {
    line: string; // "mode sha stage\tpath" (top-level relative path)
  }

  /** Index entries (top-level relative) of the given root-relative paths, for an exact restore after a failed commit. */
  async function snapshotIndex(root: string, info: RepoInfo, rels: string[]): Promise<Map<string, IndexEntry[]>> {
    const r = await call(root, ['ls-files', '--stage', '-z', '--full-name', '--', '.'], { maxBuffer: BIG_BUFFER });
    if (r.code !== 0) throw gitError('Git-Index konnte nicht gelesen werden', r);
    const wanted = new Set(rels.map((p) => norm(info.prefix + p)));
    const map = new Map<string, IndexEntry[]>();
    for (const rec of splitZ(r.stdout)) {
      const tab = rec.indexOf('\t');
      if (tab < 0) continue;
      const full = rec.slice(tab + 1);
      if (!wanted.has(norm(full))) continue;
      const list = map.get(norm(full)) ?? [];
      list.push({ line: rec });
      map.set(norm(full), list);
    }
    return map;
  }

  async function restoreIndex(info: RepoInfo, rels: string[], snapshot: Map<string, IndexEntry[]>): Promise<void> {
    const records: string[] = [];
    for (const rel of rels) {
      const full = info.prefix + rel;
      // mode 0 removes the path; previous entries (all stages) are then put back.
      records.push(`0 ${NULL_SHA}\t${full}`);
      for (const e of snapshot.get(norm(full)) ?? []) records.push(e.line);
    }
    if (records.length === 0) return;
    const r = await call(info.top, ['update-index', '-z', '--index-info'], { write: true, input: records.join('\0') + '\0' });
    if (r.code !== 0) log.warn('Git-Index konnte nach dem Commit-Versuch nicht wiederhergestellt werden', { error: lastErrorLine(r.stderr) });
  }

  function readWorktree(root: string, rel: string): { buf: Buffer | null; tooLarge: boolean } {
    const abs = join(root, ...rel.split('/'));
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      return { buf: null, tooLarge: false };
    }
    if (st.isSymbolicLink()) {
      try {
        return { buf: Buffer.from(readlinkSync(abs), 'utf8'), tooLarge: false };
      } catch {
        return { buf: null, tooLarge: false };
      }
    }
    if (!st.isFile()) return { buf: null, tooLarge: false };
    if (st.size > MAX_DIFF_CONTENT_BYTES) return { buf: null, tooLarge: true };
    try {
      return { buf: readFileSync(abs), tooLarge: false };
    } catch {
      return { buf: null, tooLarge: false };
    }
  }

  async function blob(root: string, spec: string): Promise<{ buf: Buffer | null; tooLarge: boolean }> {
    const r = await callRaw(root, ['cat-file', 'blob', '--end-of-options', spec], { maxBuffer: MAX_DIFF_CONTENT_BYTES + 1 });
    if (r.code !== 0) return { buf: null, tooLarge: false };
    if (r.stdout.length > MAX_DIFF_CONTENT_BYTES) return { buf: null, tooLarge: true };
    return { buf: r.stdout, tooLarge: false };
  }

  function cleanupClone(dir: string, existedBefore: boolean): void {
    try {
      if (!existsSync(dir)) return;
      if (existedBefore) {
        for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      } else {
        rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
      }
    } catch (e) {
      log.warn('Unvollständiger Klon konnte nicht vollständig entfernt werden', { dir, error: errorMessage(e) });
    }
  }

  function parseCloneUrl(url: string): { host: string } {
    const bad = () => validation('Nur https://-, ssh://- oder git@-Adressen sind erlaubt.');
    if (typeof url !== 'string' || url !== url.trim() || url.length > 2048 || /[\s\u0000-\u001f\u007f]/.test(url) || url.startsWith('-')) throw bad();
    if (/^(https|ssh):\/\//i.test(url)) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw bad();
      }
      if (parsed.password) {
        throw validation('Zugangsdaten in der Git-Adresse sind nicht erlaubt. Bitte die Anmeldung über den Git Credential Manager oder einen SSH-Schlüssel einrichten.');
      }
      const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
      if (!host || host.startsWith('-')) throw bad();
      return { host };
    }
    const m = /^git@([A-Za-z0-9][A-Za-z0-9.-]*):(.+)$/.exec(url);
    if (!m || m[2].startsWith('-') || m[2].startsWith('//')) throw bad();
    return { host: m[1].toLowerCase() };
  }

  async function ensureHostAllowed(url: string, host: string): Promise<void> {
    const net = s.core.settings.section('network');
    const checkUrl = host.includes(':') ? `https://[${host}]/` : `https://${host}/`;
    try {
      assertHostAllowed(checkUrl, 'Projekt-Import', { allowedHosts: net.allowedHosts, extraUrls: [] });
      return;
    } catch (e) {
      if (!isNovaError(e) || e.code !== 'NETWORK_BLOCKED') throw e;
    }
    const check = s.approvals.check({
      projectId: null,
      taskId: null,
      runId: null,
      kind: 'network',
      title: 'Projekt-Import von einem nicht freigegebenen Server',
      action: `NOVA möchte ein Git-Repository von „${host}“ herunterladen: ${redactString(url)}`,
      consequences: 'NOVA verbindet sich mit diesem Server und lädt den Projektinhalt herunter. Programme oder Skripte aus dem Repository werden dabei nicht ausgeführt.',
      subject: host,
      details: { purpose: 'clone', host },
    });
    if (check.state === 'approved') {
      if (check.approval && !check.viaRule) {
        try {
          s.approvals.consume(check.approval.id);
        } catch (e) {
          log.debug('Freigabe bereits verbraucht', { error: errorMessage(e) });
        }
      }
      return;
    }
    if (check.state === 'denied') {
      try {
        s.approvals.acknowledgeDenial(check.approval.id);
      } catch {
        /* best effort */
      }
      throw new NovaError('NETWORK_BLOCKED', `Der Import von „${host}“ wurde abgelehnt.`, {
        severity: 'warning',
        userAction: `„${host}“ unter Einstellungen → Netzwerk erlauben oder den Import erneut starten und zustimmen.`,
      });
    }
    throw new NovaError('APPROVAL_REQUIRED', `Für den Import von „${host}“ ist eine Freigabe nötig. Bitte unter „Freigaben“ zustimmen und den Import danach erneut starten.`, {
      severity: 'warning',
      details: { approvalId: check.approval.id, host },
      userAction: 'Unter „Freigaben“ zustimmen und den Import erneut starten.',
    });
  }

  /**
   * Extra environment for a clone. SSH URLs get a non-interactive ssh (BatchMode: no password/passphrase/host-key
   * prompt can block the daemon, which has no console) unless the user configured an own ssh command
   * (GIT_SSH_COMMAND / GIT_SSH in the environment or core.sshCommand in the git config) – that one is respected.
   */
  async function cloneEnv(url: string, cwd: string): Promise<Record<string, string>> {
    const env: Record<string, string> = { GIT_ALLOW_PROTOCOL: 'https:ssh' };
    if (/^https:\/\//i.test(url)) return env;
    const inherited: Record<string, string | undefined> = { ...process.env, ...(options.extraEnv ?? {}) };
    if (inherited.GIT_SSH_COMMAND?.trim() || inherited.GIT_SSH?.trim()) return env;
    try {
      const cfg = await runner.run(['config', '--get', 'core.sshCommand'], { cwd, timeoutMs: 15_000 });
      if (cfg.code === 0 && cfg.stdout.trim() !== '') return env;
    } catch (e) {
      log.debug('core.sshCommand nicht lesbar – nutze nicht-interaktives ssh', { error: errorMessage(e) });
    }
    env.GIT_SSH_COMMAND = SSH_BATCH_COMMAND;
    return env;
  }

  function cloneErrorMessage(r: GitRawResult): string {
    const err = r.stderr;
    if (r.timedOut) return 'Zeitüberschreitung beim Klonen des Repositorys.';
    if (/Host key verification failed|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(err)) {
      return 'Der SSH-Schlüssel des Git-Servers ist noch nicht bekannt oder hat sich geändert. Bitte die Verbindung einmal im Terminal prüfen (z. B. „ssh -T git@<Server>“) und den Server bestätigen.';
    }
    if (/Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey|could not read Password/i.test(err)) {
      return 'Die Anmeldung beim Git-Server ist fehlgeschlagen. Bitte die Zugangsdaten (Git Credential Manager) oder den SSH-Schlüssel prüfen.';
    }
    if (/Operation too slow|Connection timed out during banner exchange/i.test(err)) {
      return 'Der Git-Server antwortet nicht mehr (Zeitüberschreitung). Bitte später erneut versuchen.';
    }
    if (/Repository not found|does not appear to be a git repository|not found/i.test(err)) return 'Das Repository wurde nicht gefunden. Bitte die Adresse prüfen.';
    if (/Could not resolve host|Failed to connect|Connection timed out|Connection refused|unable to access|Network is unreachable/i.test(err)) {
      return 'Der Git-Server ist nicht erreichbar. Bitte Internetverbindung und Adresse prüfen.';
    }
    if (/transport '[^']*' not allowed/i.test(err)) return 'Dieses Übertragungsprotokoll ist nicht erlaubt (nur https und ssh).';
    const line = redactString(lastErrorLine(err));
    return line ? `Das Repository konnte nicht geklont werden: ${line}` : 'Das Repository konnte nicht geklont werden.';
  }

  // ------------------------------------------------------------------------------------------------ service

  const service: GitService = {
    async available() {
      const c = availableCache;
      if (c && now() - c.at < (c.value ? 60_000 : 10_000)) return c.value;
      let value = false;
      try {
        const cwd = existsSync(s.core.paths.root) ? s.core.paths.root : homedir();
        const r = await runner.run(['--version'], { cwd, timeoutMs: 15_000 });
        value = r.code === 0 && /git version/i.test(r.stdout);
      } catch (e) {
        log.debug('Git nicht verfügbar', { error: errorMessage(e) });
        value = false;
      }
      availableCache = { value, at: now() };
      return value;
    },

    async isRepo(root) {
      try {
        ensureRoot(root);
      } catch {
        return false;
      }
      return (await repoInfo(root)) !== null;
    },

    async init(root) {
      ensureRoot(root);
      await mutex.run(canonical(root), async () => {
        const info = await repoInfo(root, true);
        if (info && canonical(info.top) === canonical(root)) return; // already its own repository
        const cfg = await call(root, ['config', '--get', 'init.defaultBranch']);
        const branchArgs = cfg.code === 0 && cfg.stdout.trim() ? [] : ['--initial-branch=main'];
        const r = await call(root, ['init', ...branchArgs], { write: true });
        if (r.code !== 0) throw gitError('Das Git-Repository konnte nicht angelegt werden', r);
      });
      repoCache.delete(canonical(root));
      log.info('Git-Repository angelegt', { root });
    },

    async status(root) {
      ensureRoot(root);
      const info = await repoInfo(root);
      if (!info) return { ...EMPTY_STATUS };
      const [st, head] = await Promise.all([
        call(root, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all', '--', '.'], { maxBuffer: BIG_BUFFER }),
        headOf(root),
      ]);
      if (st.code !== 0) {
        if (!(await repoInfo(root, true))) return { ...EMPTY_STATUS }; // .git was removed meanwhile
        throw gitError('Der Git-Status konnte nicht gelesen werden', st);
      }
      const parsed = parseStatusZ(st.stdout, info.prefix, ci);
      if (parsed.entries.length > MAX_STATUS_FILES) log.info('Git-Status gekürzt', { total: parsed.entries.length, shown: MAX_STATUS_FILES });
      return {
        isRepo: true,
        branch: parsed.branch.branch,
        head: parsed.branch.unborn ? null : head,
        ahead: parsed.branch.ahead,
        behind: parsed.branch.behind,
        files: parsed.entries.slice(0, MAX_STATUS_FILES).map((e) => ({ path: e.path, index: e.index, workTree: e.workTree })),
        clean: parsed.entries.length === 0,
      };
    },

    async head(root) {
      try {
        ensureRoot(root);
      } catch {
        return null;
      }
      return headOf(root);
    },

    async diff(root, opts) {
      ensureRoot(root);
      if (opts.ref !== undefined && !GIT_REF_RE.test(opts.ref)) throw validation('Ungültige Git-Referenz.');
      const rel = opts.path !== undefined && opts.path !== '' ? normalizeRel(opts.path) : null;
      const info = await repoInfo(root);
      if (!info) return [];
      let base = opts.ref ?? 'HEAD';
      if (opts.ref === undefined && !(await headOf(root))) base = await emptyTree(root);
      const spec = rel ?? '.';
      const staged = opts.staged === true;
      const listArgs = ['diff', ...(staged ? ['--cached'] : []), '--name-status', '-z', '--no-renames', '--relative', '--no-ext-diff', '--end-of-options', base, '--', spec];
      const list = await call(root, listArgs, { maxBuffer: BIG_BUFFER });
      if (list.code !== 0) {
        if (opts.ref !== undefined) throw new NovaError('GIT_ERROR', `Unbekannte Git-Referenz: ${opts.ref}`, { severity: 'warning', details: { stderr: redactString(list.stderr).slice(-2000) } });
        throw gitError('Der Git-Diff konnte nicht erstellt werden', list);
      }
      const entries: { status: string; path: string; untracked: boolean }[] = parseNameStatusZ(list.stdout).map((e) => ({ ...e, untracked: false }));
      if (!staged) {
        const others = await call(root, ['ls-files', '-z', '--others', '--exclude-standard', '--', spec], { maxBuffer: BIG_BUFFER });
        if (others.code === 0) for (const p of splitZ(others.stdout)) entries.push({ status: 'A', path: p, untracked: true });
      }
      entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      if (entries.length > MAX_DIFF_FILES) log.info('Git-Diff gekürzt', { total: entries.length, shown: MAX_DIFF_FILES });
      const shown = entries.slice(0, MAX_DIFF_FILES);
      return mapLimit(shown, 4, async (e): Promise<FileDiff> => {
        const p = e.path;
        const original = e.status === 'A' ? { buf: Buffer.alloc(0), tooLarge: false } : await blob(root, `${base}:./${p}`);
        let modified: { buf: Buffer | null; tooLarge: boolean };
        if (e.status === 'D') modified = { buf: Buffer.alloc(0), tooLarge: false };
        else if (staged) modified = await blob(root, `:./${p}`);
        else modified = readWorktree(root, p);
        const origBuf = original.buf ?? Buffer.alloc(0);
        const modBuf = modified.buf ?? Buffer.alloc(0);
        const tooLarge = original.tooLarge || modified.tooLarge;
        const binary = tooLarge || isBinary(origBuf) || isBinary(modBuf);
        let unified: string;
        if (tooLarge) {
          unified = `Datei zu groß für die Anzeige (mehr als ${Math.round(MAX_DIFF_CONTENT_BYTES / (1024 * 1024))} MB): ${p}\n`;
        } else if (e.untracked) {
          unified = unifiedForNewFile(p, binary ? '' : modBuf.toString('utf8'), binary);
        } else {
          const d = await call(root, ['diff', ...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--no-renames', '--relative', '--end-of-options', base, '--', p], {
            maxBuffer: BIG_BUFFER,
          });
          unified = d.code === 0 ? d.stdout : '';
        }
        if (unified.length > MAX_UNIFIED_CHARS) unified = unified.slice(0, MAX_UNIFIED_CHARS) + '\n[… gekürzt]\n';
        return {
          path: p,
          original: binary ? '' : origBuf.toString('utf8'),
          modified: binary ? '' : modBuf.toString('utf8'),
          unified,
          binary,
        };
      });
    },

    async log(root, limit) {
      ensureRoot(root);
      const info = await repoInfo(root);
      if (!info) return [];
      if (!(await headOf(root))) return [];
      const n = Math.max(1, Math.min(500, Math.floor(limit) || 50));
      const args = ['log', '-n', String(n), '--no-color', `--format=${LOG_FORMAT}`, '--end-of-options', 'HEAD'];
      if (info.prefix) args.push('--', '.');
      const r = await call(root, args, { maxBuffer: BIG_BUFFER });
      if (r.code !== 0) throw gitError('Der Git-Verlauf konnte nicht gelesen werden', r);
      return parseLog(r.stdout).map((c): GitCommit => ({ ...c }));
    },

    async commitPaths(root, paths, message) {
      ensureRoot(root);
      const rels: string[] = [];
      const seen = new Set<string>();
      for (const p of paths) {
        const rel = normalizeRel(p);
        if (norm(rel) === '.git' || norm(rel).startsWith('.git/')) throw validation('Dateien im Ordner .git werden nie committet.');
        if (seen.has(norm(rel))) continue;
        seen.add(norm(rel));
        rels.push(rel);
      }
      if (rels.length === 0) return null;
      const info = await repoInfo(root);
      if (!info) throw new NovaError('GIT_ERROR', 'Der Projektordner ist kein Git-Repository.', { severity: 'warning' });
      const msg = sanitizeMessage(message);
      return mutex.run(info.key, async () => {
        const tracked = new Set((await lsTracked(root)).map(norm));
        let candidates = rels.filter((r) => tracked.has(norm(r)) || existsOnDisk(join(root, ...r.split('/'))));
        const untracked = candidates.filter((r) => !tracked.has(norm(r)));
        if (untracked.length > 0) {
          const ign = await call(root, ['check-ignore', '-z', '--stdin'], { input: untracked.join('\0') + '\0', literalPathspecs: false });
          if (ign.code === 0) {
            const ignored = new Set(splitZ(ign.stdout).map(norm));
            if (ignored.size > 0) log.info('Ignorierte Dateien werden nicht committet', { count: ignored.size });
            candidates = candidates.filter((r) => !ignored.has(norm(r)));
          }
        }
        if (candidates.length === 0) return null;
        const snapshot = await snapshotIndex(root, info, candidates);
        let committed = false;
        try {
          const add = pathspecArgs(candidates);
          const added = await write(root, info, ['add', ...add.args], { input: add.input });
          if (added.code !== 0) throw gitError('Die Dateien konnten nicht für den Commit vorgemerkt werden', added);
          const stagedList = await call(root, ['diff', '--cached', '--name-only', '-z', '--relative', '--no-renames', '--', '.'], { maxBuffer: BIG_BUFFER });
          if (stagedList.code !== 0) throw gitError('Vorgemerkte Änderungen konnten nicht gelesen werden', stagedList);
          const stagedSet = new Set(splitZ(stagedList.stdout).map(norm));
          const toCommit = candidates.filter((r) => stagedSet.has(norm(r)));
          if (toCommit.length === 0) return null;
          const ident = await identityArgs(root);
          const spec = pathspecArgs(toCommit);
          const r = await write(root, info, [...ident, 'commit', '--only', '-m', msg, ...spec.args], { input: spec.input, timeoutMs: WRITE_TIMEOUT_MS });
          if (r.code !== 0) throw gitError('Der Commit ist fehlgeschlagen', r);
          committed = true;
          const hash = await headOf(root);
          if (!hash) throw new NovaError('GIT_ERROR', 'Der Commit wurde erstellt, aber HEAD ist nicht lesbar.', { severity: 'warning' });
          log.info('Commit erstellt', { root, files: toCommit.length, commit: hash });
          return hash;
        } finally {
          if (!committed) await restoreIndex(info, candidates, snapshot).catch((e) => log.warn('Index-Wiederherstellung fehlgeschlagen', { error: errorMessage(e) }));
        }
      });
    },

    async clone(url, dir, signal, onProgress) {
      const { host } = parseCloneUrl(url);
      if (typeof dir !== 'string' || !pathApi.isAbsolute(dir)) throw validation('Der Zielordner muss ein absoluter Pfad sein.');
      let existedBefore = false;
      const st = statSync(dir, { throwIfNoEntry: false });
      if (st) {
        if (!st.isDirectory() || readdirSync(dir).length > 0) throw validation(`Der Zielordner für den Import ist nicht leer: ${dir}`);
        existedBefore = true;
      }
      await ensureHostAllowed(url, host);
      const parent = dirname(dir);
      mkdirSync(parent, { recursive: true });
      const split = createProgressSplitter();
      let lastEmit = 0;
      let lastMessage = '';
      onProgress?.(0, 'Verbindung wird aufgebaut …');
      const env = await cloneEnv(url, parent);
      let r: GitRawResult;
      try {
        r = await runner.raw([...CLONE_CONFIG, 'clone', '--progress', '--no-recurse-submodules', '--end-of-options', url, dir], {
          cwd: parent,
          write: true,
          timeoutMs: CLONE_TIMEOUT_MS,
          signal,
          env,
          onStderr: (chunk) => {
            if (!onProgress) return;
            for (const p of split(chunk)) {
              const t = now();
              if (p.message.split(' …')[0] !== lastMessage.split(' …')[0] || t - lastEmit >= 250) {
                lastEmit = t;
                lastMessage = p.message;
                onProgress(p.percent, p.message);
              }
            }
          },
        });
      } catch (e) {
        cleanupClone(dir, existedBefore);
        throw e;
      }
      if (r.code !== 0) {
        cleanupClone(dir, existedBefore);
        throw new NovaError('GIT_ERROR', cloneErrorMessage(r), { severity: 'warning', details: { exitCode: r.code, stderr: redactString(r.stderr).slice(-4000) } });
      }
      onProgress?.(100, 'Repository wurde geklont.');
      log.info('Repository geklont', { host, dir });
    },

    async showFile(root, ref, path) {
      if (!GIT_REF_RE.test(ref)) throw validation('Ungültige Git-Referenz.');
      const rel = normalizeRel(path);
      ensureRoot(root);
      const r = await callRaw(root, ['cat-file', 'blob', '--end-of-options', `${ref}:./${rel}`], { maxBuffer: BIG_BUFFER + 1 });
      if (r.code !== 0) return null;
      if (r.stdout.length > BIG_BUFFER) {
        log.debug('Datei im Git-Stand zu groß zum Lesen', { path: rel });
        return null;
      }
      return r.stdout;
    },

    async isClean(root, paths) {
      const out = new Set<string>();
      if (paths.length === 0) return out;
      ensureRoot(root);
      const info = await repoInfo(root);
      if (!info) return out;
      const [ls, st] = await Promise.all([
        call(root, ['ls-files', '-z', '--cached', '--', '.'], { maxBuffer: BIG_BUFFER }),
        call(root, ['status', '--porcelain=v1', '-z', '--untracked-files=no', '--', '.'], { maxBuffer: BIG_BUFFER }),
      ]);
      if (ls.code !== 0 || st.code !== 0) {
        if (!(await repoInfo(root, true))) return out; // .git was removed meanwhile
        throw gitError('Der Git-Status konnte nicht gelesen werden', ls.code !== 0 ? ls : st);
      }
      const trackedSet = new Set(splitZ(ls.stdout).map(norm));
      const dirty = new Set<string>();
      for (const e of parseStatusZ(st.stdout, info.prefix, ci).entries) {
        dirty.add(norm(e.path));
        if (e.origPath) dirty.add(norm(e.origPath));
      }
      for (const p of paths) {
        const rel = tryRel(p);
        if (!rel) continue;
        const k = norm(rel);
        if (trackedSet.has(k) && !dirty.has(k)) out.add(p);
      }
      return out;
    },
  };
  return service;
}
