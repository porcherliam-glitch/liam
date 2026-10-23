// Daemon composition root: single-instance lock, pending DB restore, Services container, recovery, RPC server,
// maintenance timer and graceful shutdown with hard deadlines.
// Used by src/daemon/index.ts (process entry) and by integration tests (in-process).
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DaemonStatus } from '@shared/schemas';
import type { Services } from './contracts';
import { createCore } from './core/context';
import { createNotificationService } from './core/notifications';
import { canonicalDataDir, dataPaths, defaultEndpoint, type DataPaths } from './core/paths';
import { NovaError, errorMessage } from './core/errors';
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
import { createThreeDService, createGenerate3dModelTool, registerThreeDRpc } from './threed';
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
}

export interface DaemonApp {
  services: Services;
  endpoint: string;
  token: string;
  dataDir: string;
  status(): DaemonStatus;
  stop(reason: string, opts?: { restart?: boolean; fast?: boolean }): Promise<void>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function stampNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Applies a database restore requested by BackupService.restore (before the DB is opened). */
function applyRestorePending(paths: DataPaths): string | null {
  if (!existsSync(paths.restorePending)) return null;
  try {
    const { backupPath } = JSON.parse(readFileSync(paths.restorePending, 'utf8')) as { backupPath?: string };
    if (!backupPath || !existsSync(backupPath)) throw new Error('Sicherungsdatei nicht gefunden');
    if (existsSync(paths.db)) copyFileSync(paths.db, join(paths.backups, `nova-${stampNow()}-vor-wiederherstellung.db`));
    for (const suffix of ['-wal', '-shm']) if (existsSync(paths.db + suffix)) unlinkSync(paths.db + suffix);
    copyFileSync(backupPath, paths.db);
    return backupPath;
  } finally {
    try {
      unlinkSync(paths.restorePending);
    } catch {
      /* ignore */
    }
  }
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
    const restoredFrom = applyRestorePending(paths);

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
    s.threed = createThreeDService(s);
    s.pathGuard = createPathGuard(s);
    s.journal = createChangeJournal(s);
    s.locks = createFileLockService(s);
    s.policy = createCommandPolicy(s);
    s.processes = createProcessManager(s);
    s.terminals = createTerminalService(s);
    s.watcher = createFileWatcher(s);
    s.files = createFileService(s);
    s.tools = createToolRegistry(s);
    s.tools.register(createGenerate3dModelTool(s));
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
    await step('3D-Werkstatt', () => s.threed.recover());
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

    // 7. Maintenance (start + every 24 h).
    const maintenance = async () => {
      const settings = core.settings.get();
      const retentionDays = settings.diagnostics.historyRetentionDays;
      await step('Tägliche Sicherung', () => s.backups.maybeDailyBackup());
      await step('Aufbewahrung', () => s.backups.applyRetention());
      if (settings.backup.snapshotRetentionDays > 0) {
        // keeps the newest checkpoints of every project and its latest verified one regardless of age
        const cutoff = core.clock.now() - settings.backup.snapshotRetentionDays * DAY_MS;
        await step('Prüfpunkte bereinigen', () => (s.checkpoints as CheckpointServiceImpl).prune(cutoff));
      }
      if (retentionDays > 0) {
        const cutoff = core.clock.now() - retentionDays * DAY_MS;
        await step('Verlauf bereinigen', () => {
          s.runs.prune(cutoff);
          s.processes.prune(cutoff);
          s.checks.prune(cutoff);
          s.approvals.prune(cutoff);
          core.errors.prune(cutoff);
          s.notifications.prune(cutoff);
          s.threed.prune(cutoff);
        });
      }
      await step('Datenbank optimieren', () => {
        core.db.exec('PRAGMA optimize;');
        const pages = Number(core.db.get<{ page_count: number }>('PRAGMA page_count')?.page_count ?? 0);
        const free = Number(core.db.get<{ freelist_count: number }>('PRAGMA freelist_count')?.freelist_count ?? 0);
        if (pages > 0 && free / pages > 0.2) core.db.exec('VACUUM;');
      });
    };
    // First run only after the RPC server is up (below): the daily backup and VACUUM must not delay the start.
    const maintenanceTimer = setInterval(() => void maintenance(), DAY_MS);
    maintenanceTimer.unref();

    // 8. RPC.
    let stopping: Promise<void> | null = null;
    let restartAfterStop = false;
    const app: DaemonApp = {
      services: s,
      endpoint,
      token: '',
      dataDir,
      status,
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
    registerThreeDRpc(router, s);
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
    void maintenance();

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
      core.operations.cancelAll();
      await timed('Arbeitszyklus', fast ? 1500 : 12_000, () => s.work.shutdown(fast ? 1000 : 10_000));
      await timed('3D-Werkstatt', fast ? 1500 : 8000, () => s.threed.shutdown());
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
