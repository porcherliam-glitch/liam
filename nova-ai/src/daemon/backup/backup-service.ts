// BackupService (SPEC §4.6, §6.6): database backups, project snapshots, retention, daily backup, restore and
// data export/import.
// Key decisions:
// - Database backups are consistent copies via Db.backupTo (VACUUM INTO) named nova-YYYYMMDD-HHMMSS-<reason>.db in
//   <dataDir>/backups. Restoring one validates it (SQLite header, opened read-only and immutable, quick_check,
//   meta.schema_version between 1 and LATEST_SCHEMA_VERSION, core tables present), backs up the current database
//   ("vor Wiederherstellung"), writes restore-pending.json ({ backupPath, … }) and asks the daemon to restart via the
//   handler app.ts installs with setRestartHandler(); app.ts swaps the files before it opens the database again.
//   Refused (CONFLICT) while agent runs are active.
// - The backups table is reconciled with the folders on every list(): files written by app.ts (before migration /
//   before restore) and backups made after the backup that was just restored (the restored database does not know
//   them) are adopted; rows whose files are gone are dropped. Project snapshots carry a JSON manifest next to their
//   folder for this purpose (the snapshot folder itself contains only project files).
// - Project snapshots: <dataDir>/backups/projects/<projectId>/<stamp>-<name>/ (links skipped, build/dependency
//   folders skipped, max 2 GB, progress + abort, partial copies removed). A snapshot is only ever restored into a NEW
//   folder (default "<projectsDir>/<name> (Wiederherstellung <Datum>)"), never over the original project.
// - Retention (applyRetention): per kind/project keep at most backup.retentionCount entries and delete entries older
//   than backup.retentionDays – the newest database backup and the newest snapshot of each project are always kept,
//   a backup selected for a pending restore is never deleted; exports are user data and not subject to retention.
//   Then journal.pruneSnapshots(now − snapshotRetentionDays). Returns deleted backups + pruned journal blobs.
// - delete() only removes files inside the backups/exports folders.
// - Every "inside/overlaps" check (restore target vs. data dir, snapshot and original project; delete only inside the
//   backup folders) compares CANONICAL paths (root-safety canonicalize: realpath of the deepest existing ancestor), so
//   8.3 short names (C:\PROGRA~1), junctions and symlinks cannot dodge them; a user-chosen target also passes
//   root-safety's raw path rules (device paths, drive-relative paths, reserved names …).
// - The daemon's maintenance uses maybeDailyBackupAsync (VACUUM INTO in a worker thread) and
//   applyRetention({ journal: false }) followed by the journal's asynchronous prune, so neither blocks the event loop.
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync, statfsSync, copyFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, parse as parsePath, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { BackupInfo, ExportSection } from '@shared/schemas';
import type { BackupService, Services } from '../contracts';
import { NovaError, conflict, errorMessage, isNovaError, notFound, validation } from '../core/errors';
import { atomicWriteFile, removeDirWithRetry, unlinkWithRetry } from '../core/fs-atomic';
import { newId } from '../core/ids';
import { redactString } from '../core/redact';
import { startOfDay } from '../core/time';
import { LATEST_SCHEMA_VERSION } from '../db/migrations';
import { exportData as runExport, importData as runImport, projectPathKey, type DataIoDeps, type IoOptions } from './export-import';
import { databaseBackupName, folderDate, parseDatabaseBackupName, safeFolderName, snapshotFolderName } from './names';
import { SNAPSHOT_MAX_BYTES, copyTree, scanTree } from './snapshot';
import { ROOT_REJECT_PREFIX, canonicalize, validateRawPath } from '../projects/root-safety';

interface BackupRow {
  id: string;
  kind: string;
  path: string;
  size_bytes: number;
  reason: string;
  project_id: string | null;
  created_at: number;
}

interface SnapshotManifest {
  format: 'nova-snapshot';
  version: 1;
  id: string;
  projectId: string;
  projectName: string;
  sourcePath: string;
  folder: string;
  reason: string;
  createdAt: number;
  sizeBytes: number;
  fileCount: number;
  skipped: { path: string; reason: string }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_TABLES = ['projects', 'tasks', 'settings', 'meta'];

const toInfo = (r: BackupRow): BackupInfo => ({
  id: r.id,
  kind: (r.kind === 'project_snapshot' || r.kind === 'export' ? r.kind : 'database') as BackupInfo['kind'],
  path: r.path,
  sizeBytes: Number(r.size_bytes),
  reason: r.reason,
  projectId: r.project_id,
  createdAt: Number(r.created_at),
});

export interface BackupServiceOptions {
  platform?: NodeJS.Platform;
  /** Size cap of a project snapshot (default 2 GB). */
  snapshotMaxBytes?: number;
  /** Home folder for the default projects folder (tests). */
  homeDir?: string;
  /** realpath for the canonical path checks (tests); default realpathSync.native, null when missing. */
  realpath?: (p: string) => string | null;
}

function realpathOrNull(p: string): string | null {
  try {
    return realpathSync.native(p);
  } catch {
    return null;
  }
}

export interface BackupServiceImpl extends BackupService {
  /** app.ts installs the daemon restart used after a database restore was scheduled. */
  setRestartHandler(fn: (() => void) | null): void;
  snapshotProject(projectId: string, signal?: AbortSignal, onProgress?: (p: number | null, m: string) => void): Promise<BackupInfo>;
  restore(id: string, opts?: { targetDir?: string; signal?: AbortSignal; onProgress?: (p: number | null, m: string) => void }): Promise<{ message: string; restartRequired: boolean; path: string | null }>;
  exportData(sections: ExportSection[], path?: string, opts?: IoOptions): Promise<{ path: string; counts: Record<string, number> }>;
  importData(path: string, opts?: IoOptions): Promise<{ counts: Record<string, number>; warnings: string[] }>;
  /** Validates a database backup file (throws VALIDATION with a German reason). */
  validateDatabaseFile(path: string): { schemaVersion: number };
  /** maybeDailyBackup with the copy made in a worker thread (daemon maintenance). */
  maybeDailyBackupAsync(): Promise<BackupInfo | null>;
  /** journal: false leaves the journal prune to the caller (the daemon runs it asynchronously). */
  applyRetention(opts?: { journal?: boolean }): number;
}

function dateText(ts: number): string {
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function createBackupService(s: Services, options: BackupServiceOptions = {}): BackupServiceImpl {
  const db = s.core.db;
  const paths = s.core.paths;
  const log = s.core.log.child('backup');
  const platform = options.platform ?? s.core.platform;
  const snapshotMax = options.snapshotMaxBytes ?? SNAPSHOT_MAX_BYTES;
  const snapshotsRoot = join(paths.backups, 'projects');
  const key = (p: string) => projectPathKey(resolve(p), platform);
  const realpath = options.realpath ?? realpathOrNull;
  /** Canonical comparison key: 8.3 names, junctions and symlinks resolved (deepest existing ancestor). */
  const canonicalKey = (p: string) => projectPathKey(canonicalize(p, platform, realpath), platform);
  let restartHandler: (() => void) | null = null;

  const tooLargeMessage = `Das Projekt ist zu groß für eine Sicherungskopie (mehr als ${Math.round(snapshotMax / 1024 ** 3)} GB ohne Abhängigkeiten und Build-Ordner).`;

  function inside(child: string, parent: string): boolean {
    const c = canonicalKey(child);
    const p = canonicalKey(parent);
    const sep = platform === 'win32' ? '\\' : '/';
    return c === p || c.startsWith(p.endsWith(sep) ? p : p + sep);
  }

  function getRow(id: string): BackupRow | undefined {
    return db.get<BackupRow>('SELECT * FROM backups WHERE id = ?', [id]);
  }

  function insertRow(row: BackupRow): BackupInfo {
    db.run('INSERT INTO backups(id, kind, path, size_bytes, reason, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      row.id,
      row.kind,
      row.path,
      row.size_bytes,
      row.reason,
      row.project_id,
      row.created_at,
    ]);
    return toInfo(row);
  }

  function checkDisk(path: string, neededBytes = 0): void {
    try {
      const r = s.governor.canWrite(path);
      if (!r.ok) throw new NovaError('DISK_FULL', r.reason ?? 'Zu wenig freier Speicherplatz für die Sicherung.', { severity: 'blocker' });
    } catch (e) {
      if (isNovaError(e) && e.code === 'DISK_FULL') throw e;
      log.debug('Speicherplatzprüfung über den Ressourcenwächter nicht möglich', { error: errorMessage(e) });
    }
    if (neededBytes > 0) {
      try {
        const st = statfsSync(existsSync(path) ? path : dirname(path));
        const free = Number(st.bavail) * Number(st.bsize);
        if (free < neededBytes + 100 * 1024 * 1024) {
          throw new NovaError('DISK_FULL', `Nicht genug freier Speicherplatz für die Sicherungskopie (benötigt etwa ${Math.ceil(neededBytes / 1024 ** 2)} MB).`, { severity: 'blocker' });
        }
      } catch (e) {
        if (isNovaError(e)) throw e;
      }
    }
  }

  function pendingRestorePath(): string | null {
    try {
      if (!existsSync(paths.restorePending)) return null;
      const parsed = JSON.parse(readFileSync(paths.restorePending, 'utf8')) as { backupPath?: unknown };
      return typeof parsed.backupPath === 'string' ? parsed.backupPath : null;
    } catch {
      return null;
    }
  }

  function sizeOf(p: string): number {
    try {
      return statSync(p).size;
    } catch {
      return 0;
    }
  }

  function manifestPathFor(folder: string): string {
    return `${folder}.json`;
  }

  // ------------------------------------------------------------------------------------------------ reconcile

  function reconcile(): void {
    const rows = db.all<BackupRow>('SELECT * FROM backups');
    const known = new Set<string>();
    const knownIds = new Set(rows.map((r) => r.id));
    for (const r of rows) {
      if (!existsSync(r.path)) {
        db.run('DELETE FROM backups WHERE id = ?', [r.id]);
        log.info('Sicherungseintrag ohne Datei entfernt', { id: r.id });
        continue;
      }
      known.add(key(r.path));
    }
    // Database backups (also files written by app.ts or recorded only in a newer database state).
    for (const name of safeReaddir(paths.backups)) {
      const abs = join(paths.backups, name);
      if (known.has(key(abs))) continue;
      const parsed = parseDatabaseBackupName(name);
      if (!parsed) continue;
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      insertRow({ id: newId('bak'), kind: 'database', path: abs, size_bytes: st.size, reason: parsed.reason, project_id: null, created_at: parsed.createdAt ?? Math.round(st.mtimeMs) });
      known.add(key(abs));
    }
    // Project snapshots (manifest next to the folder).
    for (const projectDir of safeReaddir(snapshotsRoot)) {
      const dir = join(snapshotsRoot, projectDir);
      for (const name of safeReaddir(dir)) {
        if (!name.endsWith('.json')) continue;
        const folder = join(dir, name.slice(0, -5));
        if (known.has(key(folder))) continue;
        let m: SnapshotManifest;
        try {
          m = JSON.parse(readFileSync(join(dir, name), 'utf8')) as SnapshotManifest;
        } catch {
          continue;
        }
        if (m?.format !== 'nova-snapshot' || typeof m.projectId !== 'string' || !existsSync(folder)) continue;
        const id = typeof m.id === 'string' && !knownIds.has(m.id) ? m.id : newId('bak');
        knownIds.add(id);
        insertRow({ id, kind: 'project_snapshot', path: folder, size_bytes: Number(m.sizeBytes) || 0, reason: typeof m.reason === 'string' ? m.reason : 'Projektkopie', project_id: m.projectId, created_at: Number(m.createdAt) || Date.now() });
        known.add(key(folder));
      }
    }
    // Exports written by NOVA into the exports folder.
    for (const name of safeReaddir(paths.exports)) {
      if (!/^nova-export-\d{8}-\d{6}(-\d+)?\.json$/.test(name)) continue;
      const abs = join(paths.exports, name);
      if (known.has(key(abs))) continue;
      let st;
      try {
        st = lstatSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      insertRow({ id: newId('bak'), kind: 'export', path: abs, size_bytes: st.size, reason: 'Export', project_id: null, created_at: Math.round(st.mtimeMs) });
      known.add(key(abs));
    }
  }

  function safeReaddir(dir: string): string[] {
    try {
      return readdirSync(dir);
    } catch {
      return [];
    }
  }

  // ------------------------------------------------------------------------------------------------ database

  function validateDatabaseFile(file: string): { schemaVersion: number } {
    const invalid = (why: string) => validation(`Die Sicherung kann nicht verwendet werden: ${why}`);
    const st = statSync(file, { throwIfNoEntry: false });
    if (!st || !st.isFile()) throw invalid('Die Datei wurde nicht gefunden.');
    const header = Buffer.alloc(16);
    const fd = openSync(file, 'r');
    try {
      readSync(fd, header, 0, 16, 0);
    } finally {
      closeSync(fd);
    }
    if (header.toString('latin1') !== 'SQLite format 3\u0000') throw invalid('Die Datei ist keine NOVA-Datenbank.');
    let conn: DatabaseSync | null = null;
    let tempCopy: string | null = null;
    try {
      try {
        // immutable=1: read without creating -wal/-shm files next to the backup.
        conn = new DatabaseSync(`${pathToFileURL(resolve(file)).href}?immutable=1`, { readOnly: true });
      } catch (e) {
        log.debug('Unveränderlicher Lesezugriff nicht möglich – prüfe eine Kopie', { error: errorMessage(e) });
        tempCopy = join(paths.backups, `.pruefung-${newId('bak')}.db`);
        copyFileSync(file, tempCopy);
        conn = new DatabaseSync(tempCopy, { readOnly: true });
      }
      const check = conn.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
      if (!check || check.quick_check !== 'ok') throw invalid('Die Datenbank ist beschädigt.');
      const tables = new Set((conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name));
      for (const t of REQUIRED_TABLES) if (!tables.has(t)) throw invalid('Die Datei ist keine NOVA-Datenbank.');
      const row = conn.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value?: string } | undefined;
      const version = Number(row?.value);
      if (!Number.isInteger(version) || version < 1) throw invalid('Die Versionsangabe der Datenbank fehlt.');
      if (version > LATEST_SCHEMA_VERSION) throw invalid(`Sie stammt von einer neueren NOVA-Version (Datenbankversion ${version}). Bitte NOVA zuerst aktualisieren.`);
      return { schemaVersion: version };
    } catch (e) {
      if (isNovaError(e)) throw e;
      throw invalid(`Die Datenbank kann nicht geöffnet werden (${errorMessage(e)}).`);
    } finally {
      try {
        conn?.close();
      } catch {
        /* ignore */
      }
      if (tempCopy) for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(tempCopy + suffix, { force: true });
    }
  }

  function prepareDatabaseBackup(reason: string): { target: string; cleanReason: string; ts: number } {
    const cleanReason = redactString(String(reason ?? '').replace(/\s+/g, ' ').trim()).slice(0, 200) || 'manuell';
    mkdirSync(paths.backups, { recursive: true });
    checkDisk(paths.backups);
    const ts = s.core.clock.now();
    let target = join(paths.backups, databaseBackupName(ts, cleanReason));
    for (let i = 2; existsSync(target); i++) target = join(paths.backups, databaseBackupName(ts, cleanReason).replace(/\.db$/, `-${i}.db`));
    return { target, cleanReason, ts };
  }

  function backupFailed(target: string, e: unknown): NovaError {
    rmSync(target, { force: true });
    const msg = errorMessage(e);
    if (/full|ENOSPC|disk/i.test(msg)) return new NovaError('DISK_FULL', 'Nicht genug freier Speicherplatz für die Datenbanksicherung.', { severity: 'blocker', cause: e });
    return new NovaError('INTERNAL', `Die Datenbanksicherung ist fehlgeschlagen: ${msg}`, { severity: 'blocker', cause: e });
  }

  function recordDatabaseBackup(p: { target: string; cleanReason: string; ts: number }): BackupInfo {
    const info = insertRow({ id: newId('bak'), kind: 'database', path: p.target, size_bytes: sizeOf(p.target), reason: p.cleanReason, project_id: null, created_at: p.ts });
    log.info('Datenbanksicherung erstellt', { path: p.target, reason: p.cleanReason, sizeBytes: info.sizeBytes });
    return info;
  }

  function createDatabaseBackup(reason: string): BackupInfo {
    const p = prepareDatabaseBackup(reason);
    try {
      db.backupTo(p.target);
    } catch (e) {
      throw backupFailed(p.target, e);
    }
    return recordDatabaseBackup(p);
  }

  async function createDatabaseBackupAsync(reason: string): Promise<BackupInfo> {
    const p = prepareDatabaseBackup(reason);
    try {
      await db.backupToAsync(p.target);
    } catch (e) {
      throw backupFailed(p.target, e);
    }
    return recordDatabaseBackup(p);
  }

  /** "Is a daily backup due?" (reconciles first so backups made by an earlier database state count). */
  function dailyBackupDue(): boolean {
    if (!s.core.settings.section('backup').dailyDatabaseBackup) return false;
    try {
      reconcile();
    } catch (e) {
      log.warn('Abgleich der Sicherungsordner fehlgeschlagen', { error: errorMessage(e) });
    }
    const since = startOfDay(s.core.clock.now());
    return !db.get("SELECT 1 FROM backups WHERE kind = 'database' AND created_at >= ? LIMIT 1", [since]);
  }

  function scheduleRestart(): boolean {
    if (!restartHandler) return false;
    const handler = restartHandler;
    setTimeout(() => {
      try {
        handler();
      } catch (e) {
        log.error('Neustart nach Wiederherstellung fehlgeschlagen', { error: errorMessage(e) });
      }
    }, 50);
    return true;
  }

  async function restoreDatabase(row: BackupRow): Promise<{ message: string; restartRequired: boolean; path: string | null }> {
    let active = 0;
    try {
      active = s.work.activeRunCount();
    } catch (e) {
      log.debug('Arbeitszyklus nicht verfügbar', { error: errorMessage(e) });
    }
    if (active > 0) throw conflict('Während Agenten arbeiten, kann die Datenbank nicht wiederhergestellt werden. Bitte die Arbeit zuerst anhalten.');
    validateDatabaseFile(row.path);
    const safety = createDatabaseBackup('vor Wiederherstellung');
    atomicWriteFile(
      paths.restorePending,
      JSON.stringify({ backupPath: row.path, backupId: row.id, safetyBackupPath: safety.path, requestedAt: s.core.clock.now() }, null, 2),
      { mode: 0o600 },
    );
    try {
      s.notifications.notify({
        level: 'info',
        category: 'info',
        title: 'Datenbank wird wiederhergestellt',
        body: 'NOVA spielt eine Datensicherung ein und startet den Hintergrunddienst dafür neu.',
        projectId: null,
        taskId: null,
      });
    } catch (e) {
      log.debug('Benachrichtigung nicht möglich', { error: errorMessage(e) });
    }
    const when = dateText(Number(row.created_at));
    const restarting = scheduleRestart();
    log.info('Datenbank-Wiederherstellung vorgemerkt', { backup: row.path, restarting });
    return {
      message: restarting
        ? `Die Sicherung vom ${when} wird eingespielt. NOVA startet den Hintergrunddienst dafür neu. Der bisherige Stand wurde vorher gesichert.`
        : `Die Sicherung vom ${when} wird beim nächsten Start eingespielt. Bitte NOVA jetzt neu starten. Der bisherige Stand wurde vorher gesichert.`,
      restartRequired: true,
      path: row.path,
    };
  }

  // ------------------------------------------------------------------------------------------------ snapshots

  function projectsDir(): string {
    const configured = s.core.settings.section('general').projectsDir.trim();
    if (configured && isAbsolute(configured)) return configured;
    return join(options.homeDir ?? homedir(), 'NOVA Projekte');
  }

  function readManifest(folder: string): SnapshotManifest | null {
    try {
      return JSON.parse(readFileSync(manifestPathFor(folder), 'utf8')) as SnapshotManifest;
    } catch {
      return null;
    }
  }

  function removeCopy(target: string, existedBefore: boolean): void {
    try {
      if (!existsSync(target)) return;
      if (existedBefore) for (const n of readdirSync(target)) rmSync(join(target, n), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      else removeDirWithRetry(target);
    } catch (e) {
      log.warn('Unvollständige Kopie konnte nicht entfernt werden', { target, error: errorMessage(e) });
    }
  }

  async function snapshotProject(projectId: string, signal?: AbortSignal, onProgress?: (p: number | null, m: string) => void): Promise<BackupInfo> {
    const project = s.projects.require(projectId);
    const st = statSync(project.path, { throwIfNoEntry: false });
    if (!st || !st.isDirectory()) throw new NovaError('NOT_FOUND', `Der Projektordner wurde nicht gefunden: ${project.path}`, { severity: 'warning' });
    onProgress?.(null, 'Projektdateien werden gezählt …');
    const scan = await scanTree(project.path, { platform, applySkipRules: true, maxBytes: snapshotMax, signal, tooLargeMessage });
    const dir = join(snapshotsRoot, project.id.replace(/[^A-Za-z0-9_-]/g, '_'));
    mkdirSync(dir, { recursive: true });
    checkDisk(dir, scan.totalBytes);
    const ts = s.core.clock.now();
    let folderName = snapshotFolderName(ts, project.name);
    for (let i = 2; existsSync(join(dir, folderName)) || existsSync(manifestPathFor(join(dir, folderName))); i++) folderName = `${snapshotFolderName(ts, project.name)}-${i}`;
    const target = join(dir, folderName);
    let result;
    try {
      result = await copyTree(project.path, target, scan, { maxBytes: snapshotMax, signal, onProgress, tooLargeMessage });
    } catch (e) {
      removeCopy(target, false);
      throw e;
    }
    const id = newId('bak');
    const manifest: SnapshotManifest = {
      format: 'nova-snapshot',
      version: 1,
      id,
      projectId: project.id,
      projectName: project.name,
      sourcePath: project.path,
      folder: folderName,
      reason: 'Projektkopie',
      createdAt: ts,
      sizeBytes: result.bytes,
      fileCount: result.fileCount,
      skipped: result.skipped.slice(0, 100),
    };
    atomicWriteFile(manifestPathFor(target), JSON.stringify(manifest, null, 2));
    const info = insertRow({ id, kind: 'project_snapshot', path: target, size_bytes: result.bytes, reason: 'Projektkopie', project_id: project.id, created_at: ts });
    if (result.skipped.length > 0) {
      const shown = result.skipped.slice(0, 5).map((x) => x.path).join(', ');
      log.warn('Projektkopie unvollständig – einige Dateien waren gesperrt', { projectId, skipped: result.skipped.length });
      s.core.errors.report({
        code: 'FILE_IN_USE',
        severity: 'warning',
        title: 'Projektkopie unvollständig',
        whatHappened: `${result.skipped.length === 1 ? 'Eine Datei konnte' : `${result.skipped.length} Dateien konnten`} nicht in die Sicherungskopie übernommen werden (gesperrt oder während der Sicherung geändert): ${shown}.`,
        projectId: project.id,
        attempted: ['Projektkopie erstellen'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Programme schließen, die Projektdateien geöffnet haben, und die Kopie bei Bedarf erneut erstellen.',
        dedupeKey: `snapshot-skipped:${project.id}`,
      });
    }
    onProgress?.(100, 'Projektkopie erstellt.');
    log.info('Projektkopie erstellt', { projectId, path: target, files: result.fileCount, bytes: result.bytes, skippedDirs: scan.skippedDirs.length, skippedLinks: scan.skippedLinks });
    return info;
  }

  async function restoreSnapshot(row: BackupRow, opts: { targetDir?: string; signal?: AbortSignal; onProgress?: (p: number | null, m: string) => void }) {
    const src = row.path;
    const sst = statSync(src, { throwIfNoEntry: false });
    if (!sst || !sst.isDirectory()) throw new NovaError('NOT_FOUND', 'Die Projektkopie ist nicht mehr vorhanden.', { severity: 'warning' });
    let project = null;
    try {
      project = row.project_id ? s.projects.get(row.project_id) : null;
    } catch (e) {
      log.debug('Projekt zur Kopie nicht lesbar', { error: errorMessage(e) });
    }
    const name = project?.name ?? readManifest(src)?.projectName ?? 'Projekt';
    let target: string;
    if (opts.targetDir !== undefined && opts.targetDir.trim() !== '') {
      if (!isAbsolute(opts.targetDir)) throw validation('Bitte einen vollständigen Zielordner angeben.');
      try {
        validateRawPath(opts.targetDir, platform);
      } catch (e) {
        throw validation(`Dieser Zielordner kann nicht verwendet werden: ${errorMessage(e).replace(ROOT_REJECT_PREFIX, '')}`);
      }
      target = resolve(opts.targetDir);
    } else {
      const base = join(projectsDir(), `${safeFolderName(name)} (Wiederherstellung ${folderDate(s.core.clock.now())})`);
      target = base;
      for (let i = 2; existsSync(target); i++) target = `${base} ${i}`;
    }
    if (parsePath(target).root === target || dirname(target) === target) throw validation('Ein Laufwerks-Stammordner kann nicht als Ziel verwendet werden.');
    if (inside(target, paths.root) || inside(paths.root, target)) throw validation('Der Zielordner darf nicht im NOVA-Datenordner liegen.');
    if (inside(target, src) || inside(src, target)) throw validation('Der Zielordner darf nicht in der Sicherungskopie liegen.');
    const originals = [project?.path, readManifest(src)?.sourcePath].filter((p): p is string => typeof p === 'string' && p !== '');
    for (const o of originals) {
      if (inside(target, o) || inside(o, target)) throw validation('Eine Projektkopie wird nie in den ursprünglichen Projektordner zurückgeschrieben. Bitte einen neuen Ordner wählen.');
    }
    let existedBefore = false;
    const tst = statSync(target, { throwIfNoEntry: false });
    if (tst) {
      if (!tst.isDirectory() || readdirSync(target).length > 0) throw validation(`Der Zielordner ist nicht leer: ${target}`);
      existedBefore = true;
    }
    opts.onProgress?.(null, 'Dateien der Projektkopie werden gezählt …');
    const scan = await scanTree(src, { platform, applySkipRules: false, maxBytes: Number.MAX_SAFE_INTEGER, signal: opts.signal });
    mkdirSync(dirname(target), { recursive: true });
    checkDisk(dirname(target), scan.totalBytes);
    let result;
    try {
      result = await copyTree(src, target, scan, { maxBytes: Number.MAX_SAFE_INTEGER, signal: opts.signal, onProgress: opts.onProgress });
    } catch (e) {
      removeCopy(target, existedBefore);
      throw e;
    }
    opts.onProgress?.(100, 'Projektkopie wiederhergestellt.');
    log.info('Projektkopie wiederhergestellt', { backup: row.id, target, files: result.fileCount });
    const skippedNote = result.skipped.length > 0 ? ` ${result.skipped.length} Dateien konnten nicht kopiert werden.` : '';
    return {
      message: `Die Projektkopie vom ${dateText(Number(row.created_at))} wurde nach „${target}“ kopiert. Das ursprüngliche Projekt bleibt unverändert.${skippedNote}`,
      restartRequired: false,
      path: target,
    };
  }

  function deleteFiles(row: BackupRow): void {
    const allowed = inside(row.path, paths.backups) || inside(row.path, paths.exports);
    if (!allowed) {
      log.warn('Sicherungseintrag außerhalb der NOVA-Ordner – nur der Eintrag wird entfernt', { path: row.path });
      return;
    }
    if (row.kind === 'project_snapshot') {
      if (existsSync(row.path)) removeDirWithRetry(row.path);
      unlinkWithRetry(manifestPathFor(row.path));
    } else {
      unlinkWithRetry(row.path);
      if (row.kind === 'database') unlinkWithRetry(`${row.path}-wal`); // raw safety copy of an unmerged WAL (app.ts)
    }
  }

  const ioDeps: DataIoDeps = {
    s,
    log,
    platform,
    registerExport(path, createdAt, sizeBytes) {
      insertRow({ id: newId('bak'), kind: 'export', path, size_bytes: sizeBytes, reason: 'Export', project_id: null, created_at: createdAt });
    },
  };

  const service: BackupServiceImpl = {
    setRestartHandler(fn) {
      restartHandler = fn;
    },

    list() {
      try {
        reconcile();
      } catch (e) {
        log.warn('Abgleich der Sicherungsordner fehlgeschlagen', { error: errorMessage(e) });
      }
      return db.all<BackupRow>('SELECT * FROM backups ORDER BY created_at DESC, rowid DESC').map(toInfo);
    },

    createDatabaseBackup,

    snapshotProject,

    async restore(id, opts = {}) {
      let row = getRow(id);
      if (!row) {
        reconcile();
        row = getRow(id);
      }
      if (!row) throw notFound('Sicherung', id);
      if (row.kind === 'database') return restoreDatabase(row);
      if (row.kind === 'project_snapshot') return restoreSnapshot(row, opts);
      const r = await runImport(ioDeps, row.path, { signal: opts.signal, onProgress: opts.onProgress });
      const total = (r.counts.projects ?? 0) + (r.counts.tasks ?? 0) + (r.counts.memory ?? 0) + (r.counts.providers ?? 0);
      return {
        message: `Export eingespielt: ${total} Einträge übernommen, ${r.counts.skipped ?? 0} übersprungen.${r.warnings.length > 0 ? ` Hinweise: ${r.warnings.slice(0, 3).join(' ')}` : ''}`,
        restartRequired: false,
        path: null,
      };
    },

    delete(id) {
      const row = getRow(id);
      if (!row) throw notFound('Sicherung', id);
      const pending = pendingRestorePath();
      if (pending && key(pending) === key(row.path)) throw conflict('Diese Sicherung ist für eine Wiederherstellung vorgemerkt und kann erst danach gelöscht werden.');
      deleteFiles(row);
      db.run('DELETE FROM backups WHERE id = ?', [id]);
      log.info('Sicherung gelöscht', { id, kind: row.kind });
    },

    applyRetention(opts = {}) {
      try {
        reconcile();
      } catch (e) {
        log.warn('Abgleich der Sicherungsordner fehlgeschlagen', { error: errorMessage(e) });
      }
      const settings = s.core.settings.section('backup');
      const now = s.core.clock.now();
      const ageCut = settings.retentionDays > 0 ? now - settings.retentionDays * DAY_MS : null;
      const pending = pendingRestorePath();
      const pendingKey = pending ? key(pending) : null;
      const groups = new Map<string, BackupRow[]>();
      for (const r of db.all<BackupRow>("SELECT * FROM backups WHERE kind IN ('database', 'project_snapshot') ORDER BY created_at DESC, rowid DESC")) {
        const g = r.kind === 'database' ? 'database' : `snapshot:${r.project_id ?? ''}`;
        const list = groups.get(g) ?? [];
        list.push(r);
        groups.set(g, list);
      }
      let deleted = 0;
      for (const list of groups.values()) {
        list.forEach((r, i) => {
          if (i === 0) return; // always keep the newest of each group
          if (pendingKey && key(r.path) === pendingKey) return;
          const tooMany = i >= settings.retentionCount;
          const tooOld = ageCut !== null && Number(r.created_at) < ageCut;
          if (!tooMany && !tooOld) return;
          try {
            deleteFiles(r);
            db.run('DELETE FROM backups WHERE id = ?', [r.id]);
            deleted++;
          } catch (e) {
            log.warn('Alte Sicherung konnte nicht gelöscht werden', { id: r.id, error: errorMessage(e) });
          }
        });
      }
      if (deleted > 0) log.info('Alte Sicherungen gelöscht', { deleted });
      let blobs = 0;
      if (settings.snapshotRetentionDays > 0 && opts.journal !== false) {
        try {
          blobs = s.journal.pruneSnapshots(now - settings.snapshotRetentionDays * DAY_MS);
        } catch (e) {
          log.warn('Alte Sicherungskopien des Änderungsjournals konnten nicht bereinigt werden', { error: errorMessage(e) });
        }
      }
      return deleted + blobs;
    },

    maybeDailyBackup() {
      return dailyBackupDue() ? createDatabaseBackup('täglich') : null;
    },

    async maybeDailyBackupAsync() {
      return dailyBackupDue() ? createDatabaseBackupAsync('täglich') : null;
    },

    async exportData(sections, path, opts) {
      return runExport(ioDeps, sections, path, opts);
    },

    async importData(path, opts) {
      return runImport(ioDeps, path, opts);
    },

    validateDatabaseFile,
  };
  return service;
}
