// ChangeJournal (table `changes`, blobs in <dataDir>/snapshots): the ONLY way NOVA and the editor change project
// files. Every change can be traced (who, which task, which run) and – when a "before" snapshot exists – undone.
// Key decisions:
// - Crash-safe order (SPEC §6.3 / contract): compute afterHash → write snapshot blobs (fsync + verify) → INSERT row
//   state 'pending' → temp file + fsync + rename (core/fs-atomic) → UPDATE state 'committed'. recoverPending() settles
//   rows left 'pending' by a crash by comparing the file's current hash with before/after.
// - writeFile/deleteFile run synchronously between their first and last step (no await), so two writers can never
//   interleave inside the daemon. Both the before AND the after content are stored as blobs: the after blob lets a
//   later command change to a NOVA-written (untracked) file be undone, and lets the UI open every version.
// - Command changes (scanState → command → recordCommandChanges): created files have a known "before" (absent);
//   modified or deleted files only when the pre-command content is provably known – either the file was clean in git
//   (blob from `git show HEAD:path`, CRLF-adjusted to the scanned size) or NOVA/the editor wrote it during this daemon
//   session (hashed and snapshotted at scan time). Everything else is recorded honestly as not revertible.
// - Command changes are of UNCERTAIN ORIGIN: the tree diff cannot tell the command's writes from files the user saved
//   in another program while the command ran. revert() therefore never resets them automatically – they are listed as
//   skipped ("bitte selbst prüfen") with the reason (MASTERPROMPT §12: only undo changes whose origin is traceable).
// - Restore to a cursor (afterId) works per file on the whole chain of committed rows after the cursor (NOVA, user,
//   restore and already reverted rows): walking back from the newest row, every NOVA row whose afterHash matches the
//   simulated state is undone until a user change, an unrecorded change (chain gap), an uncertain change or the cursor
//   is reached; the file is then written ONCE with the state reached. So restoring twice, or restoring an older
//   checkpoint after a newer one, lands exactly on the state at the cursor instead of replaying earlier restores.
//   revert({taskId}) undoes that task's rows newest first. Neither ever touches a file whose current hash differs
//   from the newest recorded state (someone changed it), and every restore is journaled with actor 'nova', source
//   'restore', task null (undoable via the pre_restore checkpoint).
// - Journal writes never fall back to a non-atomic in-place rewrite (a crash in the middle would leave a torn file
//   that a later restore blames on the user): a file held by another program fails with FILE_IN_USE instead.
// - Every scanState persists a small "command running" marker (run-state/commands); recordCommandChanges removes
//   it. recoverPending() reports leftover markers: a command was interrupted by a crash/logoff and its changes are
//   not journaled.
// - pruneSnapshots deletes committed rows older than the cutoff that no remaining checkpoint can restore across
//   (id ≤ the project's oldest checkpoint cursor), then every blob no remaining row references (older than cutoff).
// - Paths are compared with ResolvedPath.key semantics (lower-case on Windows); rows store rel (display) + path_key.
// Honest limits: changes inside ignored folders (node_modules, dist, build …) and beyond 50 000 files are not
// recorded; the "written during this session" knowledge is lost on a daemon restart; changes of a command that was
// interrupted by a crash, logoff or forced shutdown are not recorded (only reported).
import { existsSync, readFileSync, realpathSync, statSync, readdirSync, lstatSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import type { ChangeRecord, ChangedFile, ChangeOp } from '@shared/schemas';
import type { ChangeJournal, FileStateMap, Services } from '../contracts';
import { NovaError, errorMessage, validation } from '../core/errors';
import { atomicWriteFile, unlinkWithRetry } from '../core/fs-atomic';
import { createBlobStore, sha256, sha256File, sha256FileSyncOrNull, type BlobStore } from './blob-store';
import { walkProjectFiles, isNovaTempName } from './walk';

/** Implementation extras beyond the contract (used by the daemon's maintenance). */
export interface ChangeJournalImpl extends ChangeJournal {
  /** pruneSnapshots with the blob folder walked asynchronously (keeps the event loop responsive). */
  pruneSnapshotsAsync(olderThanMs: number): Promise<number>;
}

/** Shown for a change detected after an agent command (origin uncertain, never reset automatically). */
export function commandChangeReason(op: string): string {
  const what = op === 'create' ? 'angelegt' : op === 'delete' ? 'gelöscht' : 'geändert';
  return `Ein Befehl von NOVA hat diese Datei ${what}. Ob die Änderung wirklich vom Befehl stammt oder währenddessen von Hand bzw. mit einem anderen Programm gemacht wurde, lässt sich nicht sicher erkennen – sie wird deshalb nicht automatisch zurückgesetzt. Bitte selbst prüfen.`;
}

export const NOT_REVERTIBLE_REASON =
  'Änderung durch einen Befehl ohne Sicherung des vorherigen Stands – kann nicht automatisch rückgängig gemacht werden. Bitte manuell prüfen.';
const CHANGED_AFTER_REASON = 'Die Datei wurde nach der Änderung durch NOVA verändert und bleibt deshalb unverändert.';
const CHANGED_BETWEEN_REASON =
  'Die Datei wurde nach einer Änderung durch NOVA von Hand oder mit einem anderen Programm verändert. Diese früheren Änderungen von NOVA bleiben deshalb erhalten.';

export type JournalCrashStage = 'blobs-written' | 'pending-inserted' | 'file-written';

export interface ChangeJournalOptions {
  /** Defaults to s.core.platform (decides path_key case folding). */
  platform?: NodeJS.Platform;
  /**
   * Test hook: called at each crash-safe stage of writeFile/deleteFile. Throwing simulates a crash at that point:
   * the journal does NOT clean up, exactly like a killed process (recoverPending must settle the row).
   */
  crashHook?: (stage: JournalCrashStage, info: { path: string; changeId: number | null }) => void;
  /** Files up to this size get after-content blobs when recorded after a command (default 10 MB). */
  maxCommandBlobBytes?: number;
  /** Max change rows recorded per command (default 5000). */
  maxCommandRecords?: number;
  /** Max files per scan (default 50 000). */
  maxScanFiles?: number;
}

interface ChangeRow {
  id: number;
  project_id: string;
  task_id: string | null;
  run_id: string | null;
  path: string;
  op: string;
  before_hash: string | null;
  after_hash: string | null;
  actor: string;
  source: string;
  revertible: number;
  state: string;
  path_key: string;
  ts: number;
  reverted: number;
}

interface ScanMeta {
  root: string;
  /** keys of files that were tracked + clean in git at scan time */
  cleanKeys: Set<string>;
  /** key → sha256 of files NOVA/the editor wrote this session (content stored as blob at scan time) */
  hashes: Map<string, string>;
  truncated: boolean;
  /** clock time when the scan started (journal writes after this happened during the command) */
  startedAt: number;
  /** persisted "command running" marker, removed by recordCommandChanges */
  marker: string | null;
}

interface CommandMarker {
  root: string;
  startedAt: number;
}

interface WrittenStat {
  /** content hash after the last journal write, null after a journal delete */
  hash: string | null;
  ts: number;
}

const WRITTEN_INDEX_MAX = 20_000;
const RECENT_KEEP_MS = 60_000;

function toRecord(r: ChangeRow): ChangeRecord {
  return {
    id: Number(r.id),
    projectId: r.project_id,
    taskId: r.task_id,
    runId: r.run_id,
    path: r.path,
    op: r.op as ChangeOp,
    beforeHash: r.before_hash,
    afterHash: r.after_hash,
    actor: r.actor === 'user' ? 'user' : 'nova',
    source: r.source as ChangeRecord['source'],
    revertible: r.revertible === 1,
    ts: Number(r.ts),
    reverted: r.reverted === 1,
  };
}

function errCode(e: unknown): string {
  return (e as NodeJS.ErrnoException)?.code ?? '';
}

export function createChangeJournal(s: Services, opts: ChangeJournalOptions = {}): ChangeJournalImpl {
  const platform = opts.platform ?? s.core.platform;
  const maxCommandBlobBytes = opts.maxCommandBlobBytes ?? 10 * 1024 * 1024;
  const maxCommandRecords = opts.maxCommandRecords ?? 5000;
  const maxScanFiles = opts.maxScanFiles ?? 50_000;
  const log = s.core.log.child('journal');
  const db = s.core.db;
  const blobs: BlobStore = createBlobStore(s.core.paths.snapshots, (hash) => {
    log.warn('Beschädigte Sicherungskopie erkannt', { hash });
    s.core.errors.report({
      code: 'INTERNAL',
      severity: 'warning',
      title: 'Sicherungskopie beschädigt',
      whatHappened: 'Eine Sicherungskopie im NOVA-Datenordner ist beschädigt und wird nicht verwendet. Eine Wiederherstellung dieser Dateiversion ist nicht möglich.',
      projectSafe: true,
      autoFixable: false,
      userAction: 'Datenträger prüfen (z. B. chkdsk). Projektdateien sind nicht betroffen.',
      details: `Snapshot ${hash}`,
      dedupeKey: `snapshot-corrupt:${hash}`,
    });
  });
  const scanMeta = new WeakMap<FileStateMap, ScanMeta>();
  /** canonical abs key → result of the last journal write/delete this session (LRU by insertion order). */
  const written = new Map<string, WrittenStat>();
  /** projectId → rel → ts of the last journal write. */
  const recent = new Map<string, Map<string, number>>();

  const keyOf = (rel: string) => (platform === 'win32' ? rel.toLowerCase() : rel);
  const absKey = (abs: string) => (platform === 'win32' ? abs.toLowerCase() : abs);
  const now = () => s.core.clock.now();
  const hook = (stage: JournalCrashStage, path: string, changeId: number | null) => opts.crashHook?.(stage, { path, changeId });
  const markerDir = join(s.core.paths.runState, 'commands');

  /** Persists the "command running" marker of a scan (best effort: a failure only loses the crash report). */
  function writeMarker(root: string, startedAt: number): string | null {
    const file = join(markerDir, `cmd-${randomBytes(6).toString('hex')}.json`);
    try {
      atomicWriteFile(file, JSON.stringify({ root, startedAt } satisfies CommandMarker));
      return file;
    } catch (e) {
      log.warn('Befehls-Markierung konnte nicht gespeichert werden', { error: errorMessage(e) });
      return null;
    }
  }

  function removeMarker(file: string | null): void {
    if (!file) return;
    try {
      unlinkWithRetry(file);
    } catch (e) {
      log.debug('Befehls-Markierung konnte nicht entfernt werden', { error: errorMessage(e) });
    }
  }

  /** Reports commands that were still running when the previous daemon ended (their changes are not journaled). */
  function reportInterruptedCommands(): void {
    let names: string[];
    try {
      names = readdirSync(markerDir);
    } catch {
      return;
    }
    let projects: { id: string; path: string; name: string }[] = [];
    try {
      projects = s.projects.list();
    } catch (e) {
      log.debug('Projekte für unterbrochene Befehle nicht ermittelbar', { error: errorMessage(e) });
    }
    const canonical = (p: string) => {
      try {
        return absKey(realpathSync.native(p));
      } catch {
        return absKey(p);
      }
    };
    for (const name of names) {
      const file = join(markerDir, name);
      if (!/^cmd-[0-9a-f]+\.json$/.test(name)) {
        if (isNovaTempName(name)) removeMarker(file);
        continue;
      }
      let marker: CommandMarker | null = null;
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<CommandMarker>;
        if (typeof parsed.root === 'string' && typeof parsed.startedAt === 'number') marker = { root: parsed.root, startedAt: parsed.startedAt };
      } catch {
        marker = null;
      }
      removeMarker(file);
      if (!marker) continue;
      const rootKey = absKey(marker.root);
      const project = projects.find((p) => canonical(p.path) === rootKey) ?? null;
      log.warn('Befehl wurde unterbrochen – Dateiänderungen nicht protokolliert', { root: marker.root, startedAt: marker.startedAt, projectId: project?.id ?? null });
      s.core.errors.report({
        code: 'INTERRUPTED',
        severity: 'warning',
        title: 'Befehl unterbrochen – Änderungen nicht protokolliert',
        whatHappened: `Ein Befehl eines Agenten lief noch${project ? ` im Projekt „${project.name}“` : ''}, als NOVA beendet wurde (z. B. Absturz, Abmelden oder Herunterfahren). Welche Dateien er bis dahin geändert hat, ist nicht protokolliert: Diese Änderungen erscheinen nicht in der Liste der NOVA-Änderungen und werden bei einer Wiederherstellung nicht zurückgesetzt.`,
        projectId: project?.id ?? null,
        attempted: ['Unterbrochenen Befehl beim Start erkannt'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Bitte die Projektdateien prüfen, z. B. in der Git-Ansicht oder durch Vergleich mit einer Projektkopie.',
        details: `Befehl gestartet: ${new Date(marker.startedAt).toISOString()}`,
        dedupeKey: `command-interrupted:${project?.id ?? rootKey}`,
      });
    }
  }

  function rememberWritten(abs: string, hash: string | null): void {
    const k = absKey(abs);
    written.delete(k);
    written.set(k, { hash, ts: now() });
    if (written.size > WRITTEN_INDEX_MAX) {
      const oldest = written.keys().next().value;
      if (oldest !== undefined) written.delete(oldest);
    }
  }

  function markRecent(projectId: string, rels: string[]): void {
    let m = recent.get(projectId);
    if (!m) {
      m = new Map();
      recent.set(projectId, m);
    }
    const t = now();
    for (const rel of rels) {
      m.delete(rel);
      m.set(rel, t);
    }
    for (const [rel, ts] of m) {
      if (t - ts <= RECENT_KEEP_MS) break; // insertion order = time order
      m.delete(rel);
    }
  }

  /** statfs needs an existing path: the nearest existing directory of a (possibly new) file. */
  function existingAncestor(abs: string): string {
    let cur = abs;
    while (!existsSync(cur)) {
      const parent = dirname(cur);
      if (parent === cur) break;
      cur = parent;
    }
    return cur;
  }

  function ensureCanWrite(absPaths: string[], projectId: string): void {
    for (const p of absPaths) {
      let res: { ok: boolean; reason: string | null };
      try {
        res = s.governor.canWrite(p);
      } catch (e) {
        log.warn('Speicherplatzprüfung nicht möglich', { error: errorMessage(e) });
        continue;
      }
      if (res.ok) continue;
      const reason = res.reason ?? 'Zu wenig freier Speicherplatz auf dem Laufwerk.';
      const userAction = 'Bitte auf dem betroffenen Laufwerk Speicherplatz freigeben. Danach kann NOVA weiterarbeiten.';
      s.core.errors.report({
        code: 'DISK_FULL',
        severity: 'blocker',
        title: 'Speicherplatz fast voll',
        whatHappened: `NOVA hat das Schreiben einer Datei abgebrochen, weil der Speicherplatz nicht reicht. ${reason}`,
        projectId,
        attempted: ['Schreibvorgang vor dem Start geprüft und angehalten'],
        projectSafe: true,
        autoFixable: false,
        userAction,
        dedupeKey: `disk-full:${projectId}`,
      });
      throw new NovaError('DISK_FULL', `Zu wenig freier Speicherplatz – Datei wurde nicht geschrieben. ${reason}`, { severity: 'blocker', userAction, projectSafe: true });
    }
  }

  /** Current content of a canonical path: null when missing; VALIDATION for folders/special files. */
  function readCurrent(abs: string, rel: string): Buffer | null {
    let st;
    try {
      st = statSync(abs);
    } catch (e) {
      if (errCode(e) === 'ENOENT' || errCode(e) === 'ENOTDIR') return null;
      throw e;
    }
    if (st.isDirectory()) throw validation(`„${rel}“ ist ein Ordner, keine Datei.`);
    if (!st.isFile()) throw validation(`„${rel}“ ist keine normale Datei.`);
    return readFileSync(abs);
  }

  function insertRow(row: Omit<ChangeRow, 'id'>): number {
    const r = db.run(
      `INSERT INTO changes(project_id, task_id, run_id, path, op, before_hash, after_hash, actor, source, revertible, state, path_key, ts, reverted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row.project_id, row.task_id, row.run_id, row.path, row.op, row.before_hash, row.after_hash, row.actor, row.source, row.revertible, row.state, row.path_key, row.ts, row.reverted],
    );
    return r.lastInsertRowid;
  }

  function getRow(id: number): ChangeRow | undefined {
    return db.get<ChangeRow>('SELECT * FROM changes WHERE id = ?', [id]);
  }

  function commitRow(id: number): void {
    db.run("UPDATE changes SET state = 'committed' WHERE id = ?", [id]);
  }

  /** Settles a pending row by the file's current hash (crash recovery and failed writes share this rule). */
  function settle(row: Pick<ChangeRow, 'id' | 'before_hash' | 'after_hash'>, abs: string | null): 'committed' | 'deleted' {
    let current: string | null | undefined;
    if (abs !== null) {
      try {
        current = sha256FileSyncOrNull(abs);
      } catch {
        current = undefined; // unreadable: keep the record (a later revert reports a conflict)
      }
    }
    if (current !== undefined && current !== row.after_hash && current === row.before_hash) {
      db.run('DELETE FROM changes WHERE id = ?', [row.id]);
      return 'deleted';
    }
    commitRow(row.id);
    return 'committed';
  }

  function mapFsError(e: unknown, rel: string): unknown {
    if (e instanceof NovaError) return e;
    const code = errCode(e);
    if (code === 'ENOSPC') return new NovaError('DISK_FULL', `Zu wenig freier Speicherplatz – „${rel}“ wurde nicht geschrieben.`, { severity: 'blocker', cause: e });
    if (code === 'ENOTDIR' || code === 'EEXIST') {
      return new NovaError('VALIDATION', `„${rel}“ kann nicht angelegt werden: Ein Teil des Pfades ist eine Datei.`, { severity: 'warning', cause: e });
    }
    if (code === 'EPERM' || code === 'EACCES' || code === 'EBUSY') {
      return new NovaError('FILE_IN_USE', `„${rel}“ ist schreibgeschützt oder von einem anderen Programm geöffnet.`, { severity: 'warning', cause: e });
    }
    return e;
  }

  interface WriteInput {
    projectId: string;
    projectRoot: string;
    relPath: string;
    content: string | Buffer;
    taskId?: string | null;
    runId?: string | null;
    actor: 'nova' | 'user';
    source?: 'tool' | 'user' | 'restore';
  }

  function resolveForWrite(projectRoot: string, relPath: string, actor: 'nova' | 'user') {
    const r = s.pathGuard.resolve(projectRoot, relPath);
    if (!r.rel) throw validation('Bitte eine Datei angeben, nicht den Projektordner.');
    if (actor === 'nova' && s.pathGuard.isProtected(projectRoot, r.key)) {
      throw validation(`„${r.rel}“ ist ein geschützter Bereich und darf von NOVA nicht verändert werden.`);
    }
    return r;
  }

  function writeSync(input: WriteInput, emit: boolean): ChangeRecord | null {
    const r = resolveForWrite(input.projectRoot, input.relPath, input.actor);
    const data = typeof input.content === 'string' ? Buffer.from(input.content, 'utf8') : input.content;
    const current = readCurrent(r.abs, r.rel);
    const afterHash = sha256(data);
    const beforeHash = current ? sha256(current) : null;
    if (beforeHash === afterHash) return null;
    ensureCanWrite([existingAncestor(r.abs), s.core.paths.snapshots], input.projectId);
    if (current) blobs.put(current);
    blobs.put(data);
    hook('blobs-written', r.rel, null);
    const id = insertRow({
      project_id: input.projectId,
      task_id: input.taskId ?? null,
      run_id: input.runId ?? null,
      path: r.rel,
      op: current ? 'modify' : 'create',
      before_hash: beforeHash,
      after_hash: afterHash,
      actor: input.actor,
      source: input.source ?? (input.actor === 'user' ? 'user' : 'tool'),
      revertible: 1,
      state: 'pending',
      path_key: r.key,
      ts: now(),
      reverted: 0,
    });
    hook('pending-inserted', r.rel, id);
    try {
      // Never the non-atomic in-place fallback: a crash in the middle would leave a torn project file.
      atomicWriteFile(r.abs, data, { allowInPlace: false });
    } catch (e) {
      settle({ id, before_hash: beforeHash, after_hash: afterHash }, r.abs);
      throw mapFsError(e, r.rel);
    }
    hook('file-written', r.rel, id);
    commitRow(id);
    rememberWritten(r.abs, afterHash);
    markRecent(input.projectId, [r.rel]);
    if (emit) s.core.bus.emit('files.changed', { projectId: input.projectId, paths: [r.rel], actor: input.actor });
    return toRecord(getRow(id)!);
  }

  interface DeleteInput {
    projectId: string;
    projectRoot: string;
    relPath: string;
    taskId?: string | null;
    runId?: string | null;
    actor: 'nova' | 'user';
    source?: 'tool' | 'user' | 'restore';
  }

  function deleteSync(input: DeleteInput, emit: boolean): ChangeRecord {
    const r = resolveForWrite(input.projectRoot, input.relPath, input.actor);
    const current = readCurrent(r.abs, r.rel);
    if (!current) throw new NovaError('NOT_FOUND', `Die Datei „${r.rel}“ existiert nicht.`, { severity: 'warning' });
    ensureCanWrite([s.core.paths.snapshots], input.projectId);
    const beforeHash = blobs.put(current);
    hook('blobs-written', r.rel, null);
    const id = insertRow({
      project_id: input.projectId,
      task_id: input.taskId ?? null,
      run_id: input.runId ?? null,
      path: r.rel,
      op: 'delete',
      before_hash: beforeHash,
      after_hash: null,
      actor: input.actor,
      source: input.source ?? (input.actor === 'user' ? 'user' : 'tool'),
      revertible: 1,
      state: 'pending',
      path_key: r.key,
      ts: now(),
      reverted: 0,
    });
    hook('pending-inserted', r.rel, id);
    try {
      unlinkWithRetry(r.abs);
    } catch (e) {
      settle({ id, before_hash: beforeHash, after_hash: null }, r.abs);
      throw mapFsError(e, r.rel);
    }
    hook('file-written', r.rel, id);
    commitRow(id);
    rememberWritten(r.abs, null);
    markRecent(input.projectId, [r.rel]);
    if (emit) s.core.bus.emit('files.changed', { projectId: input.projectId, paths: [r.rel], actor: input.actor });
    return toRecord(getRow(id)!);
  }

  function joinRel(root: string, rel: string): string {
    return join(root, ...rel.split('/'));
  }

  function canonicalRoot(projectRoot: string): string {
    try {
      return realpathSync.native(projectRoot);
    } catch {
      throw new NovaError('NOT_FOUND', 'Der Projektordner wurde nicht gefunden. Wurde er verschoben oder gelöscht?', { severity: 'blocker' });
    }
  }

  /** Removes temp files of an interrupted atomic write next to `abs`. */
  function cleanupTempFiles(abs: string): void {
    const dir = dirname(abs);
    const prefix = `.${basename(abs)}.nova-`;
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (!name.startsWith(prefix) || !isNovaTempName(name)) continue;
      try {
        if (lstatSync(join(dir, name)).isFile()) unlinkWithRetry(join(dir, name));
      } catch {
        /* best effort */
      }
    }
  }

  /** Before content of a git-clean file: HEAD blob, adjusted to CRLF when the working tree size says so. */
  async function gitBeforeBlob(root: string, rel: string, size: number): Promise<Buffer | null> {
    let head: Buffer | null;
    try {
      head = await s.git.showFile(root, 'HEAD', rel);
    } catch (e) {
      log.debug('git show für Vorher-Stand fehlgeschlagen', { path: rel, error: errorMessage(e) });
      return null;
    }
    if (!head) return null;
    if (head.length === size) return head;
    // core.autocrlf=true: HEAD stores LF, the working tree had CRLF.
    if (!head.includes(0)) {
      const text = head.toString('latin1');
      if (!text.includes('\r')) {
        const crlf = Buffer.from(text.replace(/\n/g, '\r\n'), 'latin1');
        if (crlf.length === size) return crlf;
      }
    }
    return null;
  }

  async function hashAndMaybeStore(abs: string, size: number): Promise<string> {
    if (size <= maxCommandBlobBytes) {
      const buf = await readFile(abs);
      return blobs.put(buf);
    }
    return sha256File(abs);
  }

  type RecordInput = Parameters<ChangeJournal['recordCommandChanges']>[0];

  async function recordCommand(input: RecordInput, meta: ScanMeta | null): Promise<ChangeRecord[]> {
    const root = meta?.root ?? canonicalRoot(input.projectRoot);
    const after = await walkProjectFiles(root, { maxFiles: maxScanFiles });
    const truncated = after.truncated || (meta?.truncated ?? false);
    const beforeByKey = new Map<string, { rel: string; size: number; mtimeMs: number }>();
    for (const [rel, st] of input.before) beforeByKey.set(keyOf(rel), { rel, ...st });
    const afterByKey = new Map<string, { rel: string; abs: string; size: number; mtimeMs: number }>();
    for (const f of after.files) afterByKey.set(keyOf(f.rel), f);

    type Pending = { key: string; kind: ChangeOp; rel: string };
    const pending: Pending[] = [];
    for (const [key, a] of afterByKey) {
      const b = beforeByKey.get(key);
      if (!b) {
        if (!truncated) pending.push({ key, kind: 'create', rel: a.rel });
      } else if (b.size !== a.size || b.mtimeMs !== a.mtimeMs) {
        pending.push({ key, kind: 'modify', rel: a.rel });
      }
    }
    if (!truncated) {
      for (const [key, b] of beforeByKey) if (!afterByKey.has(key)) pending.push({ key, kind: 'delete', rel: b.rel });
    }
    pending.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
    if (pending.length > maxCommandRecords) {
      log.warn('Befehl hat sehr viele Dateien geändert – nicht alle werden protokolliert', { changed: pending.length, recorded: maxCommandRecords });
      pending.length = maxCommandRecords;
    }

    const startedAt = meta?.startedAt ?? Number.POSITIVE_INFINITY;
    const rows: Omit<ChangeRow, 'id'>[] = [];
    for (const p of pending) {
      try {
        const a = afterByKey.get(p.key);
        const b = beforeByKey.get(p.key);
        const abs = a?.abs ?? joinRel(root, b!.rel);
        const afterHash = a ? await hashAndMaybeStore(a.abs, a.size) : null;
        let op: ChangeOp = p.kind;
        let beforeHash: string | null = null;
        const w = written.get(absKey(abs));
        if (w && w.ts >= startedAt) {
          // The journal itself (an agent file tool of a parallel task, or the editor) changed this path while the
          // command ran. That change is already recorded – record only what the command did on top of it.
          if (w.hash === afterHash) continue;
          if (w.hash === null) {
            op = 'create'; // journal deleted it, the command (re)created it
          } else {
            beforeHash = blobs.has(w.hash) ? w.hash : null;
            if (op === 'create') op = 'modify';
          }
        } else if (b) {
          const known = meta?.hashes.get(p.key);
          if (known && blobs.has(known)) beforeHash = known;
          else if (meta?.cleanKeys.has(p.key)) {
            const blob = await gitBeforeBlob(root, b.rel, b.size);
            if (blob) beforeHash = blobs.put(blob);
          }
        }
        if (op === 'modify' && beforeHash !== null && beforeHash === afterHash) continue; // touched, content identical
        rows.push({
          project_id: input.projectId,
          task_id: input.taskId,
          run_id: input.runId,
          path: p.rel,
          op,
          before_hash: op === 'create' ? null : beforeHash,
          after_hash: afterHash,
          actor: 'nova',
          source: 'command',
          revertible: op === 'create' || beforeHash !== null ? 1 : 0,
          state: 'committed',
          path_key: p.key,
          ts: now(),
          reverted: 0,
        });
      } catch (e) {
        log.warn('Änderung eines Befehls konnte nicht protokolliert werden', { path: p.rel, error: errorMessage(e) });
      }
    }
    const ids = db.transaction(() => rows.map((r) => insertRow(r)));
    for (const r of rows) {
      const abs = joinRel(root, r.path);
      if (r.op === 'delete') rememberWritten(abs, null);
      else if (r.after_hash && blobs.has(r.after_hash)) rememberWritten(abs, r.after_hash);
      else written.delete(absKey(abs)); // large file without blob: no exact knowledge
    }
    const records = ids.map((id) => toRecord(getRow(id)!));
    if (records.length > 0) {
      const paths = records.map((r) => r.path);
      markRecent(input.projectId, paths);
      if (input.taskId) {
        try {
          s.tasks.addFiles(input.taskId, paths);
        } catch (e) {
          log.warn('Geänderte Dateien konnten der Aufgabe nicht zugeordnet werden', { error: errorMessage(e) });
        }
      }
      s.core.bus.emit('files.changed', { projectId: input.projectId, paths: paths.slice(0, 1000), actor: 'nova' });
    }
    return records;
  }

  // ------------------------------------------------------------------------------------------------ revert

  type RevertInput = Parameters<ChangeJournal['revert']>[0];
  type RevertResult = Awaited<ReturnType<ChangeJournal['revert']>>;

  /** Why a NOVA row must not be undone automatically, or null. */
  function uncertainReason(row: ChangeRow): string | null {
    if (row.revertible !== 1 || (row.op !== 'create' && row.before_hash === null)) return NOT_REVERTIBLE_REASON;
    if (row.source === 'command') return commandChangeReason(row.op);
    return null;
  }

  /** Content hash before the row (null = file absent); undefined when unknown. */
  function beforeOf(row: ChangeRow): string | null | undefined {
    if (row.op === 'create') return null;
    return row.before_hash ?? undefined;
  }

  /**
   * True when rows[0..end] (one path, ascending) contain a run of consecutive NOVA rows – not interrupted by a user row
   * or by an unrecorded change (a row whose before differs from the previous row's after) – with a net effect.
   */
  function hasNovaEffect(rows: ChangeRow[], end: number): boolean {
    let start = -1;
    for (let i = 0; i <= end + 1; i++) {
      const row = i <= end ? rows[i] : null;
      if (start >= 0 && (!row || row.actor === 'user' || beforeOf(row) !== rows[i - 1].after_hash)) {
        if (beforeOf(rows[start]) !== rows[i - 1].after_hash) return true;
        start = -1;
      }
      if (row && row.actor !== 'user' && start < 0) start = i;
    }
    return false;
  }

  function markReverted(ids: number[]): void {
    if (ids.length === 0) return;
    db.transaction(() => {
      for (const id of ids) db.run('UPDATE changes SET reverted = 1 WHERE id = ?', [id]);
    });
  }

  function hashAt(root: string, rel: string): string | null | undefined {
    try {
      return sha256FileSyncOrNull(joinRel(root, rel));
    } catch {
      return undefined;
    }
  }

  /** Writes `hash` (null = delete) as a journaled restore; throws on failure. */
  function writeRestore(projectId: string, root: string, rel: string, hash: string | null, content: Buffer | null): void {
    if (hash === null) deleteSync({ projectId, projectRoot: root, relPath: rel, actor: 'nova', source: 'restore', taskId: null, runId: null }, false);
    else writeSync({ projectId, projectRoot: root, relPath: rel, content: content!, actor: 'nova', source: 'restore', taskId: null, runId: null }, false);
  }

  /**
   * Restore to the state at a cursor, per file (see header). One write per file, so earlier restores in the range are
   * never replayed; all NOVA rows walked are marked reverted.
   */
  function revertToCursor(input: { projectId: string; projectRoot: string; afterId: number; dryRun?: boolean }): RevertResult {
    const rows = db.all<ChangeRow>("SELECT * FROM changes WHERE project_id = ? AND state = 'committed' AND id > ? ORDER BY id", [input.projectId, input.afterId]);
    const byKey = new Map<string, ChangeRow[]>();
    for (const r of rows) {
      let list = byKey.get(r.path_key);
      if (!list) {
        list = [];
        byKey.set(r.path_key, list);
      }
      list.push(r);
    }
    // Newest change first (same order as before: the most recent work is listed on top).
    const groups = [...byKey.values()].filter((list) => hasNovaEffect(list, list.length - 1)).sort((a, b) => b[b.length - 1].id - a[a.length - 1].id);
    const restored: string[] = [];
    const conflicts: { path: string; reason: string }[] = [];
    const skipped: { path: string; reason: string }[] = [];
    if (groups.length === 0) return { restored, conflicts, skipped };
    const root = canonicalRoot(input.projectRoot);
    const dry = input.dryRun === true;

    for (const list of groups) {
      const newest = list[list.length - 1];
      const path = newest.path;
      const current = hashAt(root, path);
      if (current === undefined) {
        conflicts.push({ path, reason: 'Die Datei kann gerade nicht gelesen werden und bleibt unverändert.' });
        continue;
      }
      if (current !== newest.after_hash) {
        conflicts.push({ path, reason: CHANGED_AFTER_REASON });
        continue;
      }
      let state: string | null = current;
      const walked: number[] = [];
      let stop: 'cursor' | 'other' | 'uncertain' = 'cursor';
      let i = list.length - 1;
      for (; i >= 0; i--) {
        const row = list[i];
        if (row.actor === 'user' || row.after_hash !== state) {
          stop = 'other'; // a user change or an unrecorded change: everything older stays
          break;
        }
        const why = uncertainReason(row);
        if (why) {
          skipped.push({ path, reason: why });
          stop = 'uncertain';
          break;
        }
        walked.push(row.id);
        state = beforeOf(row) as string | null;
      }
      let conflictReason: string | null = stop === 'other' && hasNovaEffect(list, i) ? CHANGED_BETWEEN_REASON : null;
      if (walked.length > 0 && state !== current) {
        let content: Buffer | null = null;
        if (state !== null) content = blobs.read(state);
        if (state !== null && !content) {
          conflictReason = 'Sicherung nicht mehr vorhanden';
        } else {
          let ok = true;
          if (!dry) {
            try {
              writeRestore(input.projectId, root, path, state, content);
              markReverted(walked);
            } catch (e) {
              ok = false;
              conflictReason = `Die Datei konnte nicht wiederhergestellt werden: ${errorMessage(e)}`;
            }
          }
          if (ok) restored.push(path);
        }
      }
      if (conflictReason) conflicts.push({ path, reason: conflictReason });
    }
    return { restored, conflicts, skipped };
  }

  /** Undo of one task's rows (newest first, each only when the file still has that row's afterHash). */
  function revertTaskRows(input: RevertInput): RevertResult {
    const where = ['project_id = ?', "state = 'committed'", "actor = 'nova'", 'reverted = 0', 'task_id = ?'];
    const params: (string | number)[] = [input.projectId, input.taskId!];
    if (input.afterId !== undefined) {
      where.push('id > ?');
      params.push(input.afterId);
    }
    const rows = db.all<ChangeRow>(`SELECT * FROM changes WHERE ${where.join(' AND ')} ORDER BY id DESC`, params);
    const restored = new Set<string>();
    const conflicts: { path: string; reason: string }[] = [];
    const skipped: { path: string; reason: string }[] = [];
    const blocked = new Set<string>();
    const simulated = new Map<string, string | null>();
    const dry = input.dryRun === true;
    const root = rows.length > 0 ? canonicalRoot(input.projectRoot) : input.projectRoot;
    const conflict = (row: ChangeRow, reason: string) => {
      conflicts.push({ path: row.path, reason });
      blocked.add(row.path_key);
    };

    for (const row of rows) {
      if (blocked.has(row.path_key)) continue;
      const why = uncertainReason(row);
      if (why) {
        skipped.push({ path: row.path, reason: why });
        blocked.add(row.path_key);
        continue;
      }
      const current = simulated.has(row.path_key) ? simulated.get(row.path_key) : hashAt(root, row.path);
      if (current === undefined) {
        conflict(row, 'Die Datei kann gerade nicht gelesen werden und bleibt unverändert.');
        continue;
      }
      if (current !== row.after_hash) {
        conflict(row, CHANGED_AFTER_REASON);
        continue;
      }
      const target = beforeOf(row) as string | null;
      let content: Buffer | null = null;
      if (target !== null) {
        content = blobs.read(target);
        if (!content) {
          conflict(row, 'Sicherung nicht mehr vorhanden');
          continue;
        }
      }
      if (!dry) {
        try {
          writeRestore(input.projectId, root, row.path, target, content);
          markReverted([row.id]);
        } catch (e) {
          conflict(row, `Die Datei konnte nicht wiederhergestellt werden: ${errorMessage(e)}`);
          continue;
        }
      }
      simulated.set(row.path_key, target);
      restored.add(row.path);
    }
    return { restored: [...restored], conflicts, skipped };
  }

  // ------------------------------------------------------------------------------------------------ prune

  function pruneCutoff(olderThanMs: number): number {
    // Convention of every prune(olderThanMs): an absolute cutoff timestamp. Values below 1e11 (before 1973) can only
    // be durations – they are interpreted as "older than now − value" so a caller mix-up never deletes young blobs.
    return olderThanMs > 1e11 ? olderThanMs : now() - olderThanMs;
  }

  /**
   * Deletes committed rows older than the cutoff that no remaining checkpoint needs: a restore to a checkpoint only
   * reads rows after its cursor, so rows up to the project's OLDEST checkpoint cursor (all rows of a project without
   * checkpoints) are history only.
   */
  function pruneRows(cutoff: number): number {
    try {
      const r = db.run(
        `DELETE FROM changes WHERE state = 'committed' AND ts < ?
           AND id <= COALESCE((SELECT MIN(c.change_cursor) FROM checkpoints c WHERE c.project_id = changes.project_id), 9007199254740991)`,
        [cutoff],
      );
      if (r.changes > 0) log.info('Alte Einträge des Änderungsjournals gelöscht', { deleted: r.changes });
      return r.changes;
    } catch (e) {
      log.warn('Alte Einträge des Änderungsjournals konnten nicht gelöscht werden', { error: errorMessage(e) });
      return 0;
    }
  }

  /** Every blob a remaining row refers to (reverted rows too: a restore across them may need their content). */
  function referencedHashes(): Set<string> {
    const referenced = new Set<string>();
    for (const r of db.all<{ before_hash: string | null; after_hash: string | null }>('SELECT before_hash, after_hash FROM changes')) {
      if (r.before_hash) referenced.add(r.before_hash);
      if (r.after_hash) referenced.add(r.after_hash);
    }
    return referenced;
  }

  const journal: ChangeJournalImpl = {
    async writeFile(input) {
      return writeSync(input, true);
    },

    async deleteFile(input) {
      return deleteSync(input, true);
    },

    recoverPending() {
      const rows = db.all<ChangeRow>("SELECT * FROM changes WHERE state = 'pending' ORDER BY id");
      let settled = 0;
      for (const row of rows) {
        let root: string | null = null;
        try {
          root = s.projects.get(row.project_id)?.path ?? null;
        } catch (e) {
          log.warn('Projekt für unterbrochene Dateiänderung nicht ermittelbar', { error: errorMessage(e) });
        }
        if (!root) {
          db.run('DELETE FROM changes WHERE id = ?', [row.id]);
          settled++;
          continue;
        }
        let abs: string | null = null;
        try {
          abs = joinRel(realpathSync.native(root), row.path);
        } catch {
          abs = null; // project folder missing: keep the record as committed
        }
        const outcome = settle(row, abs);
        if (abs) cleanupTempFiles(abs);
        log.info('Unterbrochene Dateiänderung abgeschlossen', { id: row.id, path: row.path, outcome });
        settled++;
      }
      reportInterruptedCommands();
      return settled;
    },

    async scanState(projectRoot) {
      const startedAt = now();
      const root = canonicalRoot(projectRoot);
      const walk = await walkProjectFiles(root, { maxFiles: maxScanFiles });
      const map: FileStateMap = new Map();
      const hashes = new Map<string, string>();
      for (const f of walk.files) {
        map.set(f.rel, { size: f.size, mtimeMs: f.mtimeMs });
        if (f.size <= maxCommandBlobBytes && written.has(absKey(f.abs))) {
          // NOVA or the editor wrote/deleted this path this session: snapshot the exact pre-command content.
          try {
            const buf = await readFile(f.abs);
            hashes.set(keyOf(f.rel), blobs.put(buf));
          } catch (e) {
            log.debug('Vorher-Stand einer NOVA-Datei nicht lesbar', { path: f.rel, error: errorMessage(e) });
          }
        }
      }
      const cleanKeys = new Set<string>();
      try {
        if (map.size > 0 && (await s.git.isRepo(root))) {
          const clean = await s.git.isClean(root, [...map.keys()]);
          for (const p of clean) cleanKeys.add(keyOf(p.replace(/\\/g, '/')));
        }
      } catch (e) {
        log.debug('Git-Status vor dem Befehl nicht verfügbar', { error: errorMessage(e) });
      }
      if (walk.truncated) log.warn('Projekt hat mehr Dateien als überwacht werden können', { max: maxScanFiles });
      scanMeta.set(map, { root, cleanKeys, hashes, truncated: walk.truncated, startedAt, marker: writeMarker(root, startedAt) });
      return map;
    },

    async recordCommandChanges(input) {
      const meta = scanMeta.get(input.before) ?? null;
      try {
        return await recordCommand(input, meta);
      } finally {
        if (meta) {
          removeMarker(meta.marker);
          meta.marker = null;
        }
      }
    },

    list(filter) {
      const where = ["project_id = ?", "state = 'committed'"];
      const params: (string | number)[] = [filter.projectId];
      if (filter.taskId) {
        where.push('task_id = ?');
        params.push(filter.taskId);
      }
      if (filter.path !== undefined && filter.path !== '') {
        where.push('path_key = ?');
        params.push(keyOf(filter.path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+|\/+$/g, '')));
      }
      if (filter.afterId !== undefined) {
        where.push('id > ?');
        params.push(filter.afterId);
      }
      if (!filter.includeReverted) where.push('reverted = 0');
      const limit = Math.max(1, Math.min(filter.limit ?? 200, 5000));
      params.push(limit);
      return db.all<ChangeRow>(`SELECT * FROM changes WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`, params).map(toRecord);
    },

    get(id) {
      const row = db.get<ChangeRow>("SELECT * FROM changes WHERE id = ? AND state = 'committed'", [id]);
      return row ? toRecord(row) : null;
    },

    maxId(projectId) {
      return Number(db.get<{ m: number | null }>('SELECT MAX(id) AS m FROM changes WHERE project_id = ?', [projectId])?.m ?? 0);
    },

    readSnapshot(hash) {
      return blobs.read(hash);
    },

    async changedFiles(projectId, projectRoot) {
      const rows = db.all<ChangeRow>(
        "SELECT * FROM changes WHERE project_id = ? AND state = 'committed' AND actor = 'nova' ORDER BY id DESC LIMIT 20000",
        [projectId],
      );
      const byKey = new Map<string, ChangeRow[]>();
      for (const r of rows) {
        let list = byKey.get(r.path_key);
        if (!list) {
          list = [];
          byKey.set(r.path_key, list);
        }
        list.push(r); // newest first
      }
      let root: string | null = null;
      try {
        root = realpathSync.native(projectRoot);
      } catch {
        root = null;
      }
      const out: ChangedFile[] = [];
      for (const list of byKey.values()) {
        const active = list.filter((r) => r.reverted === 0);
        if (active.length === 0) continue;
        const earliest = list[list.length - 1];
        const latest = active[0];
        const baseline = earliest.before_hash;
        const final = latest.after_hash;
        if (baseline === final) continue; // net effect of NOVA on this file is nothing (e.g. restored)
        let current: string | null | undefined;
        if (root) {
          try {
            const abs = joinRel(root, latest.path);
            const st = statSync(abs, { throwIfNoEntry: false });
            current = st && st.isFile() ? await sha256File(abs) : null;
          } catch {
            current = undefined;
          }
        }
        const op: ChangeOp = baseline === null ? 'create' : final === null ? 'delete' : 'modify';
        const taskIds = [...new Set(active.map((r) => r.task_id).filter((t): t is string => !!t))];
        out.push({
          path: latest.path,
          op,
          byNova: true,
          taskIds,
          gitStatus: null,
          modifiedSinceNova: current === undefined ? false : current !== final,
        });
      }
      out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
      return out;
    },

    async revert(input) {
      if (input.afterId === undefined && !input.taskId) throw validation('Bitte einen Wiederherstellungspunkt oder eine Aufgabe angeben.');
      const result = input.taskId ? revertTaskRows(input) : revertToCursor({ ...input, afterId: input.afterId! });
      if (input.dryRun !== true && result.restored.length > 0) {
        s.core.bus.emit('files.changed', { projectId: input.projectId, paths: result.restored.slice(0, 1000), actor: 'nova' });
      }
      return result;
    },

    pruneSnapshots(olderThanMs) {
      const cutoff = pruneCutoff(olderThanMs);
      pruneRows(cutoff);
      const deleted = blobs.prune(referencedHashes(), cutoff);
      if (deleted > 0) log.info('Alte Sicherungskopien gelöscht', { deleted });
      return deleted;
    },

    async pruneSnapshotsAsync(olderThanMs) {
      const cutoff = pruneCutoff(olderThanMs);
      pruneRows(cutoff);
      const deleted = await blobs.pruneAsync(referencedHashes(), cutoff);
      if (deleted > 0) log.info('Alte Sicherungskopien gelöscht', { deleted });
      return deleted;
    },

    recentlyWritten(projectId, withinMs) {
      const out = new Set<string>();
      const m = recent.get(projectId);
      if (!m) return out;
      const t = now();
      for (const [rel, ts] of m) if (t - ts <= withinMs) out.add(rel);
      return out;
    },
  };
  return journal;
}
