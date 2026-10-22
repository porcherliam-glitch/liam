// Daemon composition root: builds the Services container, recovers state, starts the RPC server and
// handles graceful shutdown. Used by src/daemon/index.ts (process entry) and by integration tests (in-process).
import { join } from 'node:path';
import type { DaemonStatus } from '@shared/schemas';
import type { Services } from './contracts';
import { createCore } from './core/context';
import { createNotificationService } from './core/notifications';
import { defaultEndpoint } from './core/paths';
import { errorMessage } from './core/errors';
import { registerCoreRpc } from './rpc-core';
import { createRpcRouter, startRpcServer, ensureToken, writeLock, removeLock } from './server';
import { createProviderRegistry, createModelClient, createBudgetService, createOllamaService, registerProvidersRpc } from './providers';
import {
  createPathGuard,
  createChangeJournal,
  createFileLockService,
  createCommandPolicy,
  createProcessManager,
  createTerminalService,
  createFileService,
  createToolRegistry,
  registerToolsRpc,
} from './tools';
import { createRunStore, createAgentRunner, registerAgentsRpc } from './agents';
import { createTaskService, createWorkCycle, registerTasksRpc } from './tasks';
import { createGitService, createCheckpointService, createBackupService, registerGitRpc } from './git';
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
  /** IPC endpoint; defaults to the per-user pipe/socket. */
  endpoint?: string;
  echoLogs?: boolean;
  /** Skip the scheduler loop (tests drive work.tick()). */
  manualLoop?: boolean;
  /** Override Ollama URL (tests with the fake Ollama server). */
  ollamaBaseUrl?: string;
  /** Called when shutdown finished (process entry exits here). */
  onExit?: (code: number) => void;
}

export interface DaemonApp {
  services: Services;
  endpoint: string;
  token: string;
  status(): DaemonStatus;
  stop(reason: string): Promise<void>;
}

export async function startDaemon(opts: StartDaemonOptions): Promise<DaemonApp> {
  const startedAt = Date.now();
  const { core, migration } = createCore({
    dataDir: opts.dataDir,
    echoLogs: opts.echoLogs,
    beforeMigrate: (db, from) => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      db.backupTo(join(core_paths_backups(opts.dataDir), `nova-vor-migration-v${from}-${stamp}.db`));
    },
  });
  const log = core.log;
  log.info('NOVA-Hintergrunddienst startet', { version: core.version, pid: process.pid, dataDir: opts.dataDir, migration });

  const s = { core } as Services;
  s.notifications = createNotificationService(core.bus, core.settings);
  s.secrets = createSecretStore(s);
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

  // Version change → data backup before anything else touches the data ("Vor Updates muss NOVA interne Daten sichern").
  const prevVersion = core.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'app_version'")?.value ?? null;
  if (prevVersion && prevVersion !== core.version) {
    try {
      s.backups.createDatabaseBackup(`Versionswechsel ${prevVersion} → ${core.version}`);
    } catch (e) {
      log.error('Sicherung beim Versionswechsel fehlgeschlagen', { error: errorMessage(e) });
    }
  }
  core.db.run("INSERT INTO meta(key, value) VALUES ('app_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [core.version]);

  if (opts.ollamaBaseUrl) {
    const m = core.settings.section('models');
    if (m.ollamaBaseUrl !== opts.ollamaBaseUrl) core.settings.update({ models: { ollamaBaseUrl: opts.ollamaBaseUrl } });
  }

  let lastError: string | null = null;
  let state: DaemonStatus['state'] = 'starting';
  const recovered = { tasks: 0, orphanProcesses: 0 };

  s.providers.ensureDefaults();
  try {
    recovered.orphanProcesses = await s.processes.recoverOrphans();
  } catch (e) {
    log.warn('Verwaiste Prozesse konnten nicht geprüft werden', { error: errorMessage(e) });
  }
  try {
    recovered.tasks = (await s.work.recover()).tasks;
  } catch (e) {
    lastError = errorMessage(e);
    log.error('Wiederherstellung der Aufgaben fehlgeschlagen', { error: lastError });
  }
  try {
    s.backups.maybeDailyBackup();
    s.backups.applyRetention();
  } catch (e) {
    log.warn('Tägliche Sicherung fehlgeschlagen', { error: errorMessage(e) });
  }
  s.resources.start();

  const status = (): DaemonStatus => {
    const work = s.work.status();
    return {
      state: state === 'running' && work.state !== 'running' ? 'paused' : state,
      version: core.version,
      pid: process.pid,
      instanceId: core.instanceId,
      startedAt,
      dataDir: opts.dataDir,
      dbSchemaVersion: migration.to,
      work: work.state,
      activeRuns: work.activeRuns,
      lastError,
      recovered,
      platform: process.platform,
    };
  };

  const router = createRpcRouter(log.child('rpc'));
  let stopping: Promise<void> | null = null;
  const app: DaemonApp = {
    services: s,
    endpoint: opts.endpoint ?? defaultEndpoint(opts.dataDir),
    token: '',
    status,
    stop: (reason) => {
      if (!stopping) stopping = shutdown(reason);
      return stopping;
    },
  };

  registerCoreRpc(router, s, {
    status,
    requestShutdown: (reason) => {
      setTimeout(() => void app.stop(reason), 50);
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

  app.token = ensureToken(core.paths);
  const server = await startRpcServer({
    endpoint: app.endpoint,
    token: app.token,
    tokenPath: core.paths.token,
    router,
    bus: core.bus,
    log: log.child('server'),
    version: core.version,
    instanceId: core.instanceId,
  });
  writeLock(core.paths, { pid: process.pid, instanceId: core.instanceId, endpoint: app.endpoint, startedAt, version: core.version });

  state = 'running';
  if (!opts.manualLoop) s.work.startLoop();
  core.bus.emit('daemon.status', status());
  log.info('NOVA-Hintergrunddienst bereit', { endpoint: app.endpoint, recovered });

  async function shutdown(reason: string): Promise<void> {
    log.info('NOVA-Hintergrunddienst fährt herunter', { reason });
    state = 'stopping';
    core.bus.emit('daemon.status', status());
    const step = async (name: string, fn: () => unknown) => {
      try {
        await fn();
      } catch (e) {
        log.warn(`Beim Herunterfahren fehlgeschlagen: ${name}`, { error: errorMessage(e) });
      }
    };
    await step('work', () => s.work.shutdown(10_000));
    await step('preview', () => s.preview.stopAll());
    await step('terminals', () => s.terminals.closeAll());
    await step('processes', () => s.processes.shutdown());
    await step('resources', () => s.resources.stop());
    await step('server', () => server.close());
    await step('lock', () => removeLock(core.paths, core.instanceId));
    await step('db', () => core.db.close());
    opts.onExit?.(0);
  }

  return app;
}

function core_paths_backups(dataDir: string): string {
  return join(dataDir, 'backups');
}
