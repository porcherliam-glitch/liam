// Daemon composition root: single-instance lock, pending DB restore, Services container, recovery, RPC server,
// maintenance timer and graceful shutdown with hard deadlines.
// Key decisions:
// - Pending DB restore (restore-pending.json, before the DB is opened): the backup is copied next to nova.db, fsynced
//   and checked, the current DB's WAL is merged (or kept raw next to the safety copy), a raw safety copy is made and
//   the copy is renamed over nova.db (atomic, with retries for Windows locks) – a crash at any point leaves either the
//   old or the restored database, never a mix. A failed restore does not block the start: NOVA runs on with the
//   unchanged data and reports the failure (error + notification); a successful one is confirmed by a notification.
// - Maintenance (daily backup, retention, checkpoint/history/snapshot pruning, PRAGMA optimize, VACUUM) starts 60 s
//   after the daemon is ready and yields to the event loop between steps; the backup copy and the snapshot blob walk
//   run asynchronously and VACUUM only while no agent runs, so RPC, SSE and agents keep responding. A failing
//   maintenance step is a warning error (resolved by the next successful run), not the daemon's lastError – that is
//   reserved for startup steps that leave the daemon degraded.
// Used by src/daemon/index.ts (process entry) and by integration tests (in-process).
import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, readSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DaemonStatus } from '@shared/schemas';
import type { Services } from './contracts';
import { createCore } from './core/context';
import { createNotificationService } from './core/notifications';
import { canonicalDataDir, dataPaths, defaultEndpoint, type DataPaths } from './core/paths';
import { NovaError, errorMessage, isNovaError } from './core/errors';
import { renameWithRetry, unlinkWithRetry, withFsRetry } from './core/fs-atomic';
import { parseDatabaseBackupName } from './backup/names';
import type { BackupServiceImpl } from './backup/backup-service';
import type { ChangeJournalImpl } from './changes/journal';
import { acquireInstanceLock, type InstanceLock } from './core/instance-lock';
import { refreshWindowsPath } from './core/child-env';
import { clearCrashReport } from './core/crash';
import { registerCoreRpc } from './rpc-core';
import { createRpcRouter, startRpcServer, generateToken, writeToken, writeLock, readLock, removeLock, probeDaemon } from './server';
import { createProviderRegistry, createModelClient, createBudgetService, createOllamaService, registerProvidersRpc } from './providers';
import {
  createPathGuard,
  createChangeJournal,
  createFileLockService,
  createCommandPolicy,
  createProcessManager,
  createTerminalService,
  createFileWatcher,
  createFileService,
  createToolRegistry,
  registerToolsRpc,
} from './tools';
import { createRunStore, createAgentRunner, registerAgentsRpc } from './agents';
import { createTaskService, createWorkCycle, registerTasksRpc } from './tasks';
import { createGitService, createCheckpointService, createBackupService, registerGitRpc, type CheckpointServiceImpl } from './git';
import { createMemoryService, registerMemoryRpc } from './memory';
import { createProjectService, createTemplateRegistry, createProjectDetector, createCheckService, createPreviewService, registerProjectsRpc } from './projects';
import {
  createSecretStore,
  createApprovalService,
  createResourceMonitor,
  createConcurrencyGovernor,
  createIntegrationService,
  createUpdateService,
  registerEnvRpc,
} from './env';

export interface StartDaemonOptions {
  dataDir: string;
  /** IPC endpoint; defaults to the per-user pipe/socket of the canonical data dir. */
  endpoint?: string;
  /** Print log lines to stderr: always (true), only until the daemon is ready ('startup': the supervisor's start log
   *  then explains a failed start), or never. */
  echoLogs?: boolean | 'startup';
  /** Skip the scheduler loop (tests drive work.tick()). */
  manualLoop?: boolean;
  /** Override the Ollama URL (tests with the fake Ollama server) – written to provider row "ollama-local". */
  ollamaBaseUrl?: string;
  /** Secret store scheme override (tests use 'memory'). */
  secretScheme?: 'memory' | 'aes-local';
  /** Called when shutdown finished (process entry exits here). `restart` = the daemon should be started again. */
  onExit?: (code: number, restart: boolean) => void;
  /** Delay of the first maintenance run after the daemon is ready (default 60 s; tests use small values). */
  maintenanceDelayMs?: number;
}

export interface DaemonApp {
  services: Services;
  endpoint: string;
  token: string;
  dataDir: string;
  status(): DaemonStatus;
  stop(reason: string, opts?: { restart?: boolean; fast?: boolean }): Promise<void>;
  /** Runs one maintenance pass now (also used by tests); resolves at once when one is already running. */
  runMaintenance(): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAINTENANCE_DELAY_MS = 60_000;

function stampNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Lets pending I/O (RPC requests, SSE, timers) run before the next chunk of synchronous work. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export interface RestoreOutcome {
  /** Backup that was swapped in, or null. */
  restoredFrom: string | null;
  /** German reason when a requested restore was NOT applied (the old database stays in place). */
  failure: string | null;
  /** Backup the request named (for messages), when readable. */
  requested: string | null;
}

function isSqliteFile(file: string): boolean {
  const header = Buffer.alloc(16);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, header, 0, 16, 0);
  } finally {
    closeSync(fd);
  }
  return header.toString('latin1') === 'SQLite format 3\u0000';
}

function fsyncFile(file: string): void {
  const fd = openSync(file, 'r+');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Merges the WAL of the (closed) database into the main file. False when that is impossible (locked, damaged). */
function mergeWal(dbFile: string): boolean {
  if (!existsSync(`${dbFile}-wal`)) return true;
  try {
    const conn = new DatabaseSync(dbFile);
    try {
      const r = conn.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get() as { busy?: number } | undefined;
      return Number(r?.busy ?? 0) === 0;
    } finally {
      conn.close();
    }
  } catch {
    return false;
  }
}

/**
 * Applies a database restore requested by BackupService.restore (or `--restore-db`) before the DB is opened.
 * Crash-safe (see header); never throws – a failure is returned and leaves the current database untouched.
 */
export function applyRestorePending(paths: DataPaths): RestoreOutcome {
  if (!existsSync(paths.restorePending)) return { restoredFrom: null, failure: null, requested: null };
  let requested: string | null = null;
  try {
    const parsed = JSON.parse(readFileSync(paths.restorePending, 'utf8')) as { backupPath?: unknown };
    requested = typeof parsed.backupPath === 'string' && parsed.backupPath.trim() !== '' ? parsed.backupPath : null;
  } catch {
    requested = null;
  }
  const tmp = `${paths.db}.restore-tmp`;
  let failure: string | null = null;
  try {
    if (!requested) throw new Error('Die Angaben zur Wiederherstellung sind unvollständig.');
    const backupPath = requested;
    if (!existsSync(backupPath) || !statSync(backupPath).isFile()) throw new Error('Die Sicherungsdatei wurde nicht gefunden.');
    // 1. Copy next to the database and make it durable – until the rename below the current database stays as it is.
    rmSync(tmp, { force: true });
    withFsRetry(() => copyFileSync(backupPath, tmp));
    fsyncFile(tmp);
    if (!isSqliteFile(tmp)) throw new Error('Die Sicherungsdatei ist keine NOVA-Datenbank.');
    if (existsSync(paths.db)) {
      // 2. Raw safety copy of the current state (in addition to BackupService's copy made when the restore was asked
      //    for). A WAL that cannot be merged (damaged database) is kept next to it instead of being lost.
      const merged = mergeWal(paths.db);
      const safety = join(paths.backups, `nova-${stampNow()}-vor-wiederherstellung.db`);
      withFsRetry(() => copyFileSync(paths.db, safety));
      if (!merged && existsSync(`${paths.db}-wal`)) withFsRetry(() => copyFileSync(`${paths.db}-wal`, `${safety}-wal`));
    }
    // 3. The old WAL/SHM must go BEFORE the swap (SQLite would replay an old WAL onto the restored file), then the
    //    atomic rename replaces nova.db.
    for (const suffix of ['-wal', '-shm']) unlinkWithRetry(paths.db + suffix);
    renameWithRetry(tmp, paths.db);
  } catch (e) {
    failure = errorMessage(e);
    rmSync(tmp, { force: true });
  }
  try {
    unlinkWithRetry(paths.restorePending); // never retried at every start: the outcome is reported instead
  } catch {
    /* ignore */
  }
  return failure === null ? { restoredFrom: requested, failure: null, requested } : { restoredFrom: null, failure, requested };
}

/** "vom 22.10.2026, 08:00" for a backup file name, or an empty string. */
function backupDateText(file: string | null): string {
  if (!file) return '';
  const ts = parseDatabaseBackupName(basename(file))?.createdAt ?? null;
  if (ts === null) return '';
  return ` vom ${new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
}

const TIMED_OUT: unique symbol = Symbol('timed out');

function withTimeout<T>(p: Promise<T> | T, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((r) => {
    timer = setTimeout(() => r(TIMED_OUT), ms);
    timer.unref();
  });
  return Promise.race([Promise.resolve(p), timeout]).finally(() => clearTimeout(timer));
}

export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonApp> {
  const startedAt = Date.now();
  const dataDir = canonicalDataDir(opts.dataDir);
  const paths = dataPaths(dataDir);
  const endpoint = opts.endpoint ?? defaultEndpoint(dataDir);

  // 1. Single instance BEFORE touching anything (DB, token, processes).
  const instanceLock: InstanceLock | null = await acquireInstanceLock(dataDir, paths.instanceLock);
  if (!instanceLock) {
    const probe = await probeDaemon(endpoint, paths.token, 3000).catch(() => ({ status: 'none' as const, health: null }));
    if (probe.status === 'foreign') {
      throw new NovaError('DAEMON_UNAVAILABLE', 'Der Kommunikationskanal wird von einem fremden Programm belegt. Bitte den PC neu starten.', { severity: 'critical' });
    }
    throw new NovaError('CONFLICT', 'NOVA läuft bereits für diesen Datenordner.', { severity: 'warning', details: probe.health });
  }

  try {
    // 2. Previous run left its lock file behind → it did not shut down cleanly.
    const leftover = readLock(paths);
    const restore = applyRestorePending(paths);
    const restoredFrom = restore.restoredFrom;

    // 3. Database + core (backup before migrating an existing DB).
    const { core, migration } = createCore({
      dataDir,
      echoLogs: opts.echoLogs === true || opts.echoLogs === 'startup',
      beforeMigrate: (db, from) => db.backupTo(join(paths.backups, `nova-vor-migration-v${from}-${stampNow()}.db`)),
    });
    const log = core.log;
    log.info('NOVA-Hintergrunddienst startet', { version: core.version, pid: process.pid, dataDir, migration, restoredFrom });

    const lastShutdownRaw = core.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'last_shutdown'")?.value ?? null;
    let previousShutdown: DaemonStatus['previousShutdown'] = null;
    if (leftover) previousShutdown = { at: leftover.startedAt, clean: false, reason: 'Unerwartet beendet (Absturz, Stromausfall oder Windows-Neustart)' };
    else if (lastShutdownRaw) {
      try {
        previousShutdown = JSON.parse(lastShutdownRaw) as NonNullable<DaemonStatus['previousShutdown']>;
      } catch {
        previousShutdown = null;
      }
    }

    // 4. Services container.
    const s = { core } as Services;
    let lastError: string | null = null;
    let state: DaemonStatus['state'] = 'starting';
    const recovered = { tasks: 0, orphanProcesses: 0 };
    const router = createRpcRouter(log.child('rpc'));
    const status = (): DaemonStatus => {
      let work: ReturnType<Services['work']['status']> | null = null;
      try {
        work = s.work.status();
      } catch {
        work = null;
      }
      const hasCritical = core.errors.hasOpenCritical();
      const base: DaemonStatus['state'] =
        state === 'running' && (lastError || hasCritical) ? 'error' : state === 'running' && work && work.state !== 'running' ? 'paused' : state;
      return {
        state: base,
        version: core.version,
        pid: process.pid,
        instanceId: core.instanceId,
        startedAt,
        dataDir,
        dbSchemaVersion: migration.to,
        work: work?.state ?? 'stopped',
        activeRuns: work?.activeRuns ?? 0,
        lastError,
        recovered,
        platform: process.platform,
        previousShutdown,
        secretStore: { scheme: s.secrets?.scheme ?? 'memory', secure: s.secrets?.secure ?? false },
        methods: router.registered(),
      };
    };
    s.daemon = { status };
    s.notifications = createNotificationService(core.bus, core.settings, core.db);
    s.secrets = createSecretStore(s, opts.secretScheme ? { scheme: opts.secretScheme } : undefined);
    s.approvals = createApprovalService(s);
    s.budget = createBudgetService(s);
    s.providers = createProviderRegistry(s);
    s.models = createModelClient(s);
    s.ollama = createOllamaService(s);
    s.pathGuard = createPathGuard(s);
    s.journal = createChangeJournal(s);
    s.locks = createFileLockService(s);
    s.policy = createCommandPolicy(s);
    s.processes = createProcessManager(s);
    s.terminals = createTerminalService(s);
    s.watcher = createFileWatcher(s);
    s.files = createFileService(s);
    s.tools = createToolRegistry(s);
    s.memory = createMemoryService(s);
    s.git = createGitService(s);
    s.checkpoints = createCheckpointService(s);
    s.backups = createBackupService(s);
    s.templates = createTemplateRegistry(s);
    s.detector = createProjectDetector(s);
    s.projects = createProjectService(s);
    s.checks = createCheckService(s);
    s.preview = createPreviewService(s);
    s.resources = createResourceMonitor(s);
    s.governor = createConcurrencyGovernor(s);
    s.integrations = createIntegrationService(s);
    s.updates = createUpdateService(s);
    s.runs = createRunStore(s);
    s.agents = createAgentRunner(s);
    s.tasks = createTaskService(s);
    s.work = createWorkCycle(s);

    // Outcome of a requested database restore: never silent.
    if (restore.failure !== null) {
      log.error('Datenbank-Wiederherstellung fehlgeschlagen', { backup: restore.requested, error: restore.failure });
      const when = backupDateText(restore.requested);
      core.errors.report({
        code: 'INTERNAL',
        severity: 'warning',
        title: 'Datensicherung nicht eingespielt',
        whatHappened: `Die angeforderte Wiederherstellung der Datensicherung${when} wurde nicht durchgeführt: ${restore.failure} NOVA arbeitet mit dem bisherigen, unveränderten Stand weiter.`,
        attempted: ['Datensicherung beim Start eingespielt'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Die Wiederherstellung unter „Einstellungen → Sicherungen“ erneut starten. Hält ein anderes Programm (z. B. ein Virenscanner) die Datei fest, kurz warten und es dann erneut versuchen.',
        details: restore.requested ? `Sicherung: ${restore.requested}` : null,
        dedupeKey: 'database-restore-failed',
      });
      s.notifications.notify({ level: 'error', category: 'error', title: 'Datensicherung nicht eingespielt', body: 'Die Wiederherstellung wurde nicht durchgeführt. NOVA arbeitet mit dem bisherigen Stand weiter. Details stehen bei den Fehlern.', projectId: null, taskId: null });
    } else if (restoredFrom) {
      core.errors.resolveWhere({ dedupeKey: 'database-restore-failed' });
      s.notifications.notify({
        level: 'success',
        category: 'info',
        title: 'Datensicherung eingespielt',
        body: `Die Datensicherung${backupDateText(restoredFrom)} wurde eingespielt. Der vorherige Stand wurde vorher gesichert.`,
        projectId: null,
        taskId: null,
      });
    }

    // 5. Version change → data backup before anything else changes data ("Vor Updates muss NOVA interne Daten sichern").
    const prevVersion = core.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'app_version'")?.value ?? null;
    if (prevVersion && prevVersion !== core.version) {
      try {
        s.backups.createDatabaseBackup(`Versionswechsel ${prevVersion} → ${core.version}`);
      } catch (e) {
        log.error('Sicherung beim Versionswechsel fehlgeschlagen', { error: errorMessage(e) });
      }
    }
    core.db.run("INSERT INTO meta(key, value) VALUES ('app_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [core.version]);

    // 6. Recovery.
    const step = async (name: string, fn: () => unknown) => {
      try {
        await fn();
      } catch (e) {
        log.error(`Startschritt fehlgeschlagen: ${name}`, { error: errorMessage(e) });
        lastError = `${name}: ${errorMessage(e)}`;
      }
    };
    void refreshWindowsPath();
    await step('Schlüsselspeicher', async () => {
      await s.secrets.loadAll();
      if (!s.secrets.secure) {
        core.errors.report({
          code: 'SECRET_STORE',
          severity: 'warning',
          title: 'Schlüsselspeicher eingeschränkt sicher',
          whatHappened: 'Auf diesem System steht kein Betriebssystem-Schlüsselspeicher zur Verfügung. API-Schlüssel werden mit einem lokalen Schlüssel verschlüsselt.',
          userAction: 'Für mehr Sicherheit den Systemschlüsselspeicher einrichten oder keine Cloud-Schlüssel hinterlegen.',
          dedupeKey: 'secret-store-insecure',
        });
      }
    });
    s.providers.ensureDefaults();
    if (opts.ollamaBaseUrl) s.providers.upsert({ id: 'ollama-local', type: 'ollama', name: 'Ollama (lokal)', baseUrl: opts.ollamaBaseUrl });
    await step('Änderungsjournal', () => s.journal.recoverPending());
    await step('Verwaiste Prozesse', async () => {
      recovered.orphanProcesses = await s.processes.recoverOrphans();
    });
    await step('Aufgaben', async () => {
      recovered.tasks = (await s.work.recover()).tasks;
    });
    // Optional lifecycle hooks of modules (timers, lazy subscriptions) beyond the contracts.
    const lifecycle = (svc: unknown) => svc as { start?: () => void; stop?: () => void | Promise<void> };
    for (const svc of [s.budget, s.providers, s.ollama]) lifecycle(svc).start?.();
    s.resources.start();
    s.updates.start();
    for (const p of s.projects.list()) {
      try {
        s.watcher.watch(p.id, p.path);
        s.resources.trackPath(p.path);
      } catch {
        /* missing folder etc. */
      }
    }

    // 7. Maintenance (60 s after the start + every 24 h). Failures are warnings (resolved by the next good run).
    let maintenanceBusy = false;
    const maintenanceStep = async (name: string, fn: () => unknown) => {
      if (state !== 'running') return; // shutting down: the database is about to close
      const dedupeKey = `maintenance:${name}`;
      try {
        await fn();
        core.errors.resolveWhere({ dedupeKey });
      } catch (e) {
        log.error(`Wartungsschritt fehlgeschlagen: ${name}`, { error: errorMessage(e) });
        const diskFull = isNovaError(e) && e.code === 'DISK_FULL';
        core.errors.report({
          code: diskFull ? 'DISK_FULL' : 'INTERNAL',
          severity: 'warning',
          title: `Wartung fehlgeschlagen: ${name}`,
          whatHappened: `Ein Wartungsschritt des Hintergrunddienstes ist fehlgeschlagen (${name}): ${errorMessage(e)} NOVA arbeitet normal weiter und versucht es beim nächsten Wartungslauf erneut.`,
          attempted: [`Wartung: ${name}`],
          projectSafe: true,
          autoFixable: true,
          userAction: diskFull ? 'Bitte auf dem Laufwerk des NOVA-Datenordners Speicherplatz freigeben.' : null,
          details: errorMessage(e),
          dedupeKey,
        });
      }
      await yieldToEventLoop();
    };
    const maintenance = async () => {
      if (maintenanceBusy || state !== 'running') return;
      maintenanceBusy = true;
      try {
        const settings = core.settings.get();
        const retentionDays = settings.diagnostics.historyRetentionDays;
        const backups = s.backups as BackupServiceImpl;
        await maintenanceStep('Tägliche Sicherung', () => backups.maybeDailyBackupAsync());
        if (settings.backup.snapshotRetentionDays > 0) {
          // Before the journal prune, which keeps exactly what the remaining checkpoints need. Keeps the newest
          // checkpoints of every project and its latest verified one regardless of age.
          const cutoff = core.clock.now() - settings.backup.snapshotRetentionDays * DAY_MS;
          await maintenanceStep('Prüfpunkte bereinigen', () => (s.checkpoints as CheckpointServiceImpl).prune(cutoff));
        }
        await maintenanceStep('Aufbewahrung', () => backups.applyRetention({ journal: false }));
        if (settings.backup.snapshotRetentionDays > 0) {
          const cutoff = core.clock.now() - settings.backup.snapshotRetentionDays * DAY_MS;
          await maintenanceStep('Dateistände bereinigen', () => (s.journal as ChangeJournalImpl).pruneSnapshotsAsync(cutoff));
        }
        if (retentionDays > 0) {
          const cutoff = core.clock.now() - retentionDays * DAY_MS;
          await maintenanceStep('Verlauf bereinigen', async () => {
            for (const prune of [
              () => s.runs.prune(cutoff),
              () => s.processes.prune(cutoff),
              () => s.checks.prune(cutoff),
              () => s.approvals.prune(cutoff),
              () => core.errors.prune(cutoff),
              () => s.notifications.prune(cutoff),
            ]) {
              prune();
              await yieldToEventLoop();
            }
          });
        }
        await maintenanceStep('Datenbank optimieren', () => {
          core.db.exec('PRAGMA optimize;');
          const pages = Number(core.db.get<{ page_count: number }>('PRAGMA page_count')?.page_count ?? 0);
          const free = Number(core.db.get<{ freelist_count: number }>('PRAGMA freelist_count')?.freelist_count ?? 0);
          // VACUUM rewrites the whole database synchronously: only while no agent works (otherwise next run).
          if (pages > 0 && free / pages > 0.2 && s.work.activeRunCount() === 0) core.db.exec('VACUUM;');
        });
      } catch (e) {
        log.error('Wartung abgebrochen', { error: errorMessage(e) });
      } finally {
        maintenanceBusy = false;
      }
    };
    const maintenanceTimer = setInterval(() => void maintenance(), DAY_MS);
    maintenanceTimer.unref();
    let firstMaintenance: NodeJS.Timeout | null = null;

    // 8. RPC.
    let stopping: Promise<void> | null = null;
    let restartAfterStop = false;
    const app: DaemonApp = {
      services: s,
      endpoint,
      token: '',
      dataDir,
      status,
      runMaintenance: () => maintenance(),
      stop: (reason, o) => {
        if (o?.restart) restartAfterStop = true;
        if (!stopping) stopping = shutdown(reason, o?.fast ?? false);
        return stopping;
      },
    };
    registerCoreRpc(router, s, {
      status,
      requestShutdown: (reason) => {
        setTimeout(() => void app.stop(reason, { fast: reason === 'os-shutdown' }), 50);
      },
    });
    registerProvidersRpc(router, s);
    registerToolsRpc(router, s);
    registerAgentsRpc(router, s);
    registerTasksRpc(router, s);
    registerGitRpc(router, s);
    registerMemoryRpc(router, s);
    registerProjectsRpc(router, s);
    registerEnvRpc(router, s);
    const backupsWithRestart = s.backups as Services['backups'] & { setRestartHandler?: (fn: () => void) => void };
    backupsWithRestart.setRestartHandler?.(() => setTimeout(() => void app.stop('Datenbank-Wiederherstellung', { restart: true }), 200));

    app.token = generateToken();
    const server = await startRpcServer({ endpoint, token: app.token, tokenPath: paths.token, router, bus: core.bus, log: log.child('server'), version: core.version, instanceId: core.instanceId });
    writeToken(paths, app.token);
    writeLock(paths, { pid: process.pid, instanceId: core.instanceId, endpoint, startedAt, version: core.version });
    clearCrashReport(paths.crash);

    state = 'running';
    core.bus.on('work.status', () => core.bus.emit('daemon.status', status()));
    if (!opts.manualLoop) s.work.startLoop();
    core.bus.emit('daemon.status', status());
    log.info('NOVA-Hintergrunddienst bereit', { endpoint, recovered });
    if (opts.echoLogs === 'startup') core.logs.configure({ echo: false });
    // Not right away: the first minutes after a start (UI connecting, tasks resuming) must not wait for the daily
    // backup, the pruning or VACUUM.
    firstMaintenance = setTimeout(() => void maintenance(), opts.maintenanceDelayMs ?? MAINTENANCE_DELAY_MS);
    firstMaintenance.unref();

    async function shutdown(reason: string, fast: boolean): Promise<void> {
      log.info('NOVA-Hintergrunddienst fährt herunter', { reason });
      state = 'stopping';
      core.bus.emit('daemon.status', status());
      const deadline = setTimeout(() => {
        log.error('Herunterfahren dauert zu lange – erzwungenes Ende');
        finish();
      }, fast ? 4000 : 25_000);
      deadline.unref();
      const timed = async (name: string, ms: number, fn: () => unknown) => {
        try {
          const r = await withTimeout(Promise.resolve().then(fn), ms);
          if (r === TIMED_OUT) log.warn(`Herunterfahren: Zeitlimit für ${name}`);
        } catch (e) {
          log.warn(`Beim Herunterfahren fehlgeschlagen: ${name}`, { error: errorMessage(e) });
        }
      };
      clearInterval(maintenanceTimer);
      if (firstMaintenance) clearTimeout(firstMaintenance);
      core.operations.cancelAll();
      await timed('Arbeitszyklus', fast ? 1500 : 12_000, () => s.work.shutdown(fast ? 1000 : 10_000));
      await timed('Vorschau', 5000, () => s.preview.stopAll());
      await timed('Terminals', 5000, () => s.terminals.closeAll());
      await timed('Dateiüberwachung', 2000, () => s.watcher.unwatchAll());
      await timed('Prozesse', fast ? 2000 : 5000, () => s.processes.shutdown());
      await timed('Ressourcen', 2000, () => s.resources.stop());
      for (const svc of [s.ollama, s.providers, s.budget]) await timed('Modelle', 2000, () => lifecycle(svc).stop?.());
      await timed('Updates', 1000, () => s.updates.stop());
      await timed('Server', 5000, () => server.close());
      clearTimeout(deadline);
      finish();
    }

    let finished = false;
    function finish(): void {
      if (finished) return;
      finished = true;
      try {
        core.db.run(
          "INSERT INTO meta(key, value) VALUES ('last_shutdown', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
          [JSON.stringify({ at: Date.now(), clean: true, reason: 'Sauber beendet' })],
        );
      } catch {
        /* db may already be closed */
      }
      try {
        core.db.close();
      } catch {
        /* ignore */
      }
      try {
        removeLock(paths, core.instanceId);
      } catch {
        /* ignore */
      }
      void instanceLock!.release().finally(() => opts.onExit?.(0, restartAfterStop));
    }

    return app;
  } catch (e) {
    await instanceLock.release();
    throw e;
  }
}
