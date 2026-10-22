// Events pushed from the daemon to clients (Server-Sent Events on GET /events,
// forwarded by Electron main to the renderer). Clients must treat events as hints and
// re-fetch via RPC when in doubt (events can be missed during reconnects).
import type {
  Approval,
  AgentRun,
  AgentStep,
  CheckRun,
  DaemonStatus,
  MemoryEntry,
  Notification,
  OllamaPull,
  PreviewStatus,
  ProcessInfo,
  Project,
  ResourceSnapshot,
  Task,
  WorkStatus,
  BudgetStatus,
  IntegrationStatus,
  ProviderConfig,
} from './schemas';
import type { NovaErrorInfo } from './errors';
import type { Settings } from './settings';

export interface NovaEventMap {
  'daemon.status': DaemonStatus;
  'work.status': WorkStatus;
  'project.updated': Project;
  'project.removed': { id: string };
  'task.updated': Task;
  'task.removed': { id: string; projectId: string };
  'run.updated': AgentRun;
  'run.step': AgentStep;
  'approval.updated': Approval; // created or decided
  'resources.snapshot': ResourceSnapshot;
  'ollama.pull': OllamaPull;
  'ollama.models.changed': { providerId: string };
  'provider.updated': ProviderConfig;
  'budget.updated': BudgetStatus;
  'terminal.output': { sessionId: string; projectId: string; stream: 'stdout' | 'stderr' | 'system'; data: string };
  'terminal.exit': { sessionId: string; projectId: string; exitCode: number | null; cwd: string };
  'process.updated': ProcessInfo;
  'process.output': { processId: string; projectId: string | null; stream: 'stdout' | 'stderr'; data: string };
  'check.updated': CheckRun;
  'preview.updated': PreviewStatus;
  'files.changed': { projectId: string; paths: string[]; actor: 'nova' | 'user' | 'external' };
  'memory.updated': MemoryEntry | { id: string; deleted: true; projectId: string | null };
  'error.raised': NovaErrorInfo;
  'error.resolved': { id: string };
  'notification': Notification;
  'settings.updated': Settings;
  'integrations.updated': IntegrationStatus[];
  'log': { level: 'debug' | 'info' | 'warn' | 'error'; scope: string; msg: string; ts: number };
}

export type NovaEventType = keyof NovaEventMap;

export interface NovaEvent<T extends NovaEventType = NovaEventType> {
  type: T;
  payload: NovaEventMap[T];
  ts: number;
  /** Monotonic sequence number per daemon instance (gaps = missed events). */
  seq: number;
}

export type AnyNovaEvent = { [K in NovaEventType]: NovaEvent<K> }[NovaEventType];

export const NOVA_EVENT_TYPES: NovaEventType[] = [
  'daemon.status',
  'work.status',
  'project.updated',
  'project.removed',
  'task.updated',
  'task.removed',
  'run.updated',
  'run.step',
  'approval.updated',
  'resources.snapshot',
  'ollama.pull',
  'ollama.models.changed',
  'provider.updated',
  'budget.updated',
  'terminal.output',
  'terminal.exit',
  'process.updated',
  'process.output',
  'check.updated',
  'preview.updated',
  'files.changed',
  'memory.updated',
  'error.raised',
  'error.resolved',
  'notification',
  'settings.updated',
  'integrations.updated',
  'log',
];
