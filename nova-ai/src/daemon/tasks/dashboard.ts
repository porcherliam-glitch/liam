// Orchestrator – dashboard.summary (SPEC §4.5, §6.5): one aggregate for the main dashboard.
// Key decisions:
// - Uses ONLY cached/local data: never triggers network calls (ollama.lastStatus(), providers.lastHealth(),
//   resources.latest(), DB queries). The local model count comes from the providers' cached model profiles.
// - Never fails as a whole: every part is computed in its own try/catch; a failing source yields null / [] / 0 for
//   that part only. `daemon` and `work` are required by the schema, so they fall back to a minimal honest status
//   (state 'error' with the failure as lastError) instead of failing the call.
import type { DaemonStatus, WorkStatus } from '@shared/schemas';
import type { RpcResult } from '@shared/rpc';
import type { Services } from '../contracts';
import { errorMessage } from '../core/errors';
import { LATEST_SCHEMA_VERSION } from '../db/migrations';
import { OPEN_STATUSES, readMeta } from './task-store';

type DashboardSummary = RpcResult<'dashboard.summary'>;

function attempt<T>(s: Services, what: string, fn: () => T, fallback: T): T {
  try {
    const v = fn();
    return v === undefined ? fallback : v;
  } catch (e) {
    s.core.log.debug(`Dashboard: ${what} nicht verfügbar`, { error: errorMessage(e) });
    return fallback;
  }
}

function fallbackWork(s: Services, error: string): WorkStatus {
  const state = attempt(s, 'Arbeitszustand', () => readMeta<string>(s.core.db, 'work_state', 'running'), 'running');
  const configured = attempt(s, 'Einstellungen', () => s.core.settings.section('agents').maxParallelAgents, 0);
  const queued = attempt(s, 'Warteschlange', () => Number(s.core.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tasks WHERE status = 'queued'")?.n ?? 0), 0);
  return {
    state: state === 'paused' || state === 'stopped' ? state : 'running',
    allowedConcurrency: 0,
    configuredConcurrency: configured,
    activeRuns: 0,
    queuedTasks: queued,
    idleReason: `Arbeitsstatus nicht verfügbar: ${error}`,
    projects: [],
  };
}

function fallbackDaemon(s: Services, work: WorkStatus, error: string): DaemonStatus {
  const secretStore = attempt(s, 'Schlüsselspeicher', () => ({ scheme: String(s.secrets.scheme), secure: Boolean(s.secrets.secure) }), { scheme: 'unbekannt', secure: false });
  return {
    state: 'error',
    version: s.core.version,
    pid: process.pid,
    instanceId: s.core.instanceId,
    startedAt: 0,
    dataDir: s.core.paths.root,
    dbSchemaVersion: LATEST_SCHEMA_VERSION,
    work: work.state,
    activeRuns: work.activeRuns,
    lastError: `Status des Hintergrunddienstes nicht verfügbar: ${error}`,
    recovered: { tasks: 0, orphanProcesses: 0 },
    platform: s.core.platform,
    previousShutdown: null,
    secretStore,
    methods: [],
  };
}

export function buildDashboardSummary(s: Services): DashboardSummary {
  let work: WorkStatus;
  try {
    work = s.work.status();
  } catch (e) {
    work = fallbackWork(s, errorMessage(e));
  }
  let daemon: DaemonStatus;
  try {
    daemon = s.daemon.status();
  } catch (e) {
    daemon = fallbackDaemon(s, work, errorMessage(e));
  }

  const openTasks = attempt(
    s,
    'offene Aufgaben',
    () => Number(s.core.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE status IN (${OPEN_STATUSES.map(() => '?').join(',')})`, OPEN_STATUSES)?.n ?? 0),
    0,
  );

  const local = attempt(
    s,
    'lokales Modell',
    () => {
      const status = s.ollama.lastStatus();
      if (!status) return null;
      const modelCount = attempt(
        s,
        'lokale Modellanzahl',
        () => Number(s.core.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM model_profiles WHERE provider_id = 'ollama-local'")?.n ?? 0),
        0,
      );
      return { status, modelCount };
    },
    null,
  );

  const cloud = attempt(
    s,
    'Cloud-Anbieter',
    () => {
      const health = s.providers.lastHealth();
      const types = attempt(s, 'Anbieterliste', () => new Map(s.providers.list().map((p) => [p.id, p.type])), new Map<string, string>());
      return health.filter((h) => types.get(h.providerId) !== 'ollama' && h.providerId !== 'ollama-local');
    },
    [],
  );

  const defaultModel = attempt(
    s,
    'Standardmodell',
    () => {
      const ref = s.core.settings.section('models').defaultModel;
      return ref ? `${ref.providerId}/${ref.modelId}` : null;
    },
    null,
  );

  return {
    daemon,
    work,
    projects: attempt(s, 'Projekte', () => s.projects.list(), []),
    activeRuns: attempt(s, 'aktive Läufe', () => s.runs.list({ activeOnly: true, limit: 50 }), []),
    openTasks,
    recentBuilds: attempt(s, 'letzte Builds', () => s.checks.recent(['build', 'package'], 10, 'passed'), []),
    failedTests: attempt(s, 'fehlgeschlagene Tests', () => s.checks.currentFailures(10), []),
    errors: attempt(s, 'Fehler', () => s.core.errors.list({ limit: 20 }), []),
    pendingApprovals: attempt(s, 'Freigaben', () => s.approvals.pendingCount(), 0),
    unreadNotifications: attempt(s, 'Benachrichtigungen', () => s.notifications.unreadCount(), 0),
    activeOperations: attempt(s, 'Vorgänge', () => s.core.operations.list(true), []),
    budget: attempt(s, 'Budget', () => s.budget.status(), null),
    resources: attempt(s, 'Ressourcen', () => s.resources.latest(), null),
    models: { local, cloud, defaultModel },
  };
}
