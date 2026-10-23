// Übersicht (UI-SPEC §4 Foundation): projects, live agent activity, resources, errors, checks, models, costs.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Activity,
  ArrowRight,
  Bot,
  CircleAlert,
  Coins,
  Cpu,
  FlaskConical,
  FolderKanban,
  FolderPlus,
  Gauge,
  HardDrive,
  Hammer,
  ListTodo,
  MemoryStick,
  MonitorCog,
  ShieldQuestion,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { AgentRun, CheckRun, ProjectSummary, ResourceSnapshot, Task, WorkStatus } from '@shared/schemas';
import type { RpcResult } from '@shared/rpc';
import { Page } from '../components/layout/Page';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, Meter, ProgressBar, Stat, StatusBadge, StatusDot } from '../components/ui';
import { ErrorCard, ModelBadge, RelativeTime, RoleBadge, RunDuration, RunStatusBadge } from '../components/common';
import { useMutation, useRpc } from '../hooks/useRpc';
import { useNovaEvent } from '../hooks/useEvents';
import { cn } from '../lib/cn';
import { formatBytes, formatDuration, formatNumber, formatTime, formatTokens, formatUsd, plural } from '../lib/format';
import { AGENT_STEP_KIND, metaOf, PROJECT_KIND, PROVIDER_HEALTH, toneClasses } from '../lib/labels';
import { paths } from '../lib/paths';

type Summary = RpcResult<'dashboard.summary'>;

/** Contract: an active run has status 'running'. */
const ACTIVE = new Set<AgentRun['status']>(['running']);

const SUMMARY_EVENTS = [
  'task.updated',
  'task.removed',
  'check.updated',
  'error.raised',
  'error.resolved',
  'approval.updated',
  'budget.updated',
  'project.updated',
  'project.removed',
  'work.status',
  'ollama.models.changed',
  'provider.updated',
] as const;

export default function DashboardPage() {
  const summary = useRpc('dashboard.summary', undefined, { refetchOn: SUMMARY_EVENTS });
  const { setData, refetch } = summary;

  // Agent runs change often: patch them in place instead of re-fetching the whole summary.
  const dataRef = useRef(summary.data);
  dataRef.current = summary.data;
  useNovaEvent('run.updated', (run) => {
    const prev = dataRef.current;
    if (!prev) return;
    const known = prev.activeRuns.some((r) => r.id === run.id);
    const active = ACTIVE.has(run.status);
    if (!known) {
      if (active) void refetch();
      return;
    }
    setData((p) => (p ? { ...p, activeRuns: active ? p.activeRuns.map((r) => (r.id === run.id ? run : r)) : p.activeRuns.filter((r) => r.id !== run.id) } : p));
    if (!active) void refetch();
  });

  return (
    <Page title="Übersicht">
      {summary.loading ? (
        <LoadingState label="Übersicht wird geladen …" />
      ) : summary.error && !summary.data ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : summary.data ? (
        summary.data.projects.length === 0 ? (
          <FirstStart data={summary.data} />
        ) : (
          <DashboardContent data={summary.data} />
        )
      ) : null}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// First start
// ---------------------------------------------------------------------------

function FirstStart({ data }: { data: Summary }) {
  const navigate = useNavigate();
  return (
    <div className="@container space-y-4">
      <Card padding="none" className="overflow-hidden">
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-linear-to-b from-violet/10 to-transparent" />
          <EmptyState
            icon={Sparkles}
            title="Noch kein Projekt"
            description={
              <>
                NOVA plant, programmiert und testet Projekte selbstständig – auch im Hintergrund.
                <br />
                Zum Start ein Projekt anlegen oder zuerst ein lokales Modell einrichten.
              </>
            }
            actions={
              <>
                <Button variant="primary" size="lg" icon={FolderPlus} onClick={() => navigate(paths.newProject)}>
                  Projekt erstellen
                </Button>
                <Button size="lg" icon={Cpu} onClick={() => navigate(paths.models)}>
                  Modell einrichten
                </Button>
              </>
            }
          />
        </div>
      </Card>
      <div className="grid gap-4 @3xl:grid-cols-2">
        <ModelsCard data={data} />
        <ResourcesCard initial={data.resources} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function DashboardContent({ data }: { data: Summary }) {
  const projectNames = useMemo(() => new Map(data.projects.map((p) => [p.id, p.name])), [data.projects]);
  const running = data.activeRuns.filter((r) => r.status === 'running').length;
  const blockers = data.errors.filter((e) => e.severity === 'blocker' || e.severity === 'critical').length;
  const b = data.budget;
  const waitingApproval = data.projects.reduce((n, p) => n + p.waitingApprovalTasks, 0);

  return (
    <div className="@container space-y-4">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @4xl:grid-cols-5">
        <Stat
          label="Aktive Agenten"
          value={running}
          icon={Bot}
          tone="blue"
          to={paths.agents}
          sub={
            data.work.allowedConcurrency < data.work.configuredConcurrency
              ? `max. ${data.work.allowedConcurrency} statt ${data.work.configuredConcurrency} (Ressourcen)`
              : `max. ${data.work.allowedConcurrency} gleichzeitig`
          }
        />
        <Stat label="Offene Aufgaben" value={data.openTasks} icon={ListTodo} to={paths.tasks} sub={`${data.work.queuedTasks} warten auf einen Platz`} />
        <Stat
          label="Offene Freigaben"
          value={data.pendingApprovals}
          icon={ShieldQuestion}
          tone={data.pendingApprovals > 0 ? 'warning' : 'neutral'}
          to={paths.approvals}
          sub={data.pendingApprovals > 0 ? 'Entscheidung nötig' : 'Nichts zu entscheiden'}
        />
        <Stat label="Aktuelle Fehler" value={data.errors.length} icon={CircleAlert} tone={blockers > 0 ? 'danger' : data.errors.length ? 'warning' : 'success'} sub={blockers ? plural(blockers, 'Blocker', 'Blocker') : 'keine Blocker'} />
        <Stat
          label="Cloud-Kosten heute"
          value={b ? formatUsd(b.spentTodayUsd) : '–'}
          estimated={!!b && b.containsEstimates && b.spentTodayUsd > 0}
          icon={Coins}
          tone="info"
          to={paths.costs}
          sub={b ? `Monat: ${formatUsd(b.spentMonthUsd, b.containsEstimates && b.spentMonthUsd > 0)}` : 'gerade nicht verfügbar'}
        />
      </div>

      <div className="grid gap-4 @3xl:grid-cols-3">
        <AgentActivityCard runs={data.activeRuns} work={data.work} waitingApproval={waitingApproval} projectNames={projectNames} className="@3xl:col-span-2" />
        <ResourcesCard initial={data.resources} />
      </div>

      {data.errors.length > 0 && <ErrorsSection errors={data.errors} projectNames={projectNames} />}

      <div className="grid gap-4 @3xl:grid-cols-3">
        <ProjectsCard projects={data.projects} work={data.work} className="@3xl:col-span-2" />
        <ModelsCard data={data} />
      </div>

      <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        <CostsCard budget={data.budget} />
        <BuildsCard builds={data.recentBuilds} projectNames={projectNames} />
        <FailedTestsCard tests={data.failedTests} projectNames={projectNames} />
      </div>
    </div>
  );
}

function CardLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 rounded text-xs font-medium whitespace-nowrap">
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  );
}

// --- agent activity -------------------------------------------------------------

function AgentActivityCard({
  runs,
  work,
  waitingApproval,
  projectNames,
  className,
}: {
  runs: AgentRun[];
  work: WorkStatus;
  waitingApproval: number;
  projectNames: Map<string, string>;
  className?: string;
}) {
  const tasks = useRpc('tasks.list', { status: ['running', 'paused', 'waiting_approval', 'blocked'], limit: 500 }, { refetchOn: ['task.updated', 'task.removed'] });
  const taskById = useMemo(() => new Map((tasks.data ?? []).map((t: Task) => [t.id, t])), [tasks.data]);
  const sorted = useMemo(() => {
    const order: Record<string, number> = { running: 0, waiting_approval: 1, paused: 2 };
    return [...runs].sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || b.updatedAt - a.updatedAt);
  }, [runs]);

  return (
    <Card
      title="Agenten-Aktivität"
      description={work.idleReason ?? 'Live – was die Agenten gerade tun'}
      icon={Activity}
      className={className}
      actions={<CardLink to={paths.agents}>Alle Agenten</CardLink>}
      padding="none"
    >
      {sorted.length === 0 ? (
        <EmptyState
          compact
          icon={Bot}
          title="Gerade arbeitet kein Agent"
          description={work.idleReason ?? 'Sobald Aufgaben anstehen, starten die Agenten automatisch.'}
          actions={
            waitingApproval > 0 ? (
              <Link to={paths.approvals} className="inline-flex items-center gap-1 text-xs font-medium text-warning-fg">
                <ShieldQuestion aria-hidden className="h-3.5 w-3.5" />
                {waitingApproval === 1 ? '1 Aufgabe wartet auf eine Freigabe' : `${waitingApproval} Aufgaben warten auf eine Freigabe`}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="divide-y divide-border/70" aria-label="Aktive Agenten">
          {sorted.map((run) => {
            const task = taskById.get(run.taskId);
            return (
              <li key={run.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <RoleBadge role={run.role} />
                  <Link to={paths.project(run.projectId, { tab: 'tasks', task: run.taskId })} className="min-w-0 flex-1 truncate text-[13px] font-medium text-text">
                    {task?.title ?? (tasks.loading ? 'Aufgabe wird geladen …' : 'Aufgabe')}
                  </Link>
                  <RunStatusBadge status={run.status} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                  <Link to={paths.project(run.projectId)} className="text-muted hover:text-text">
                    {projectNames.get(run.projectId) ?? 'Projekt'}
                  </Link>
                  <ModelBadge model={run.providerId && run.modelId ? { providerId: run.providerId, modelId: run.modelId } : null} />
                  <span className="inline-flex items-center gap-1" title="Laufzeit">
                    <Gauge aria-hidden className="h-3.5 w-3.5" />
                    <RunDuration run={run} />
                  </span>
                  <span>{plural(run.stepCount, 'Schritt', 'Schritte')}</span>
                  <span title={`${formatNumber(run.inputTokens, 0)} Tokens gelesen, ${formatNumber(run.outputTokens, 0)} geschrieben`}>{formatTokens(run.inputTokens + run.outputTokens)} Tokens</span>
                </div>
                <RunStepsTail run={run} />
                {run.status === 'waiting_approval' && (
                  <Link to={paths.approvals} className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-warning-fg">
                    <ShieldQuestion aria-hidden className="h-3.5 w-3.5" /> Zur Freigabe
                  </Link>
                )}
                {run.blocker && <p className="mt-1.5 text-xs text-warning-fg">{run.blocker}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {sorted.length > 0 && waitingApproval > 0 && (
        <div className="border-t border-border px-4 py-2.5">
          <Link to={paths.approvals} className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-fg">
            <ShieldQuestion aria-hidden className="h-3.5 w-3.5" />
            {waitingApproval === 1 ? 'Außerdem wartet 1 Aufgabe auf eine Freigabe' : `Außerdem warten ${waitingApproval} Aufgaben auf eine Freigabe`}
          </Link>
        </div>
      )}
    </Card>
  );
}

/** Last steps of a running agent (live via run.step), falling back to lastAction. */
function RunStepsTail({ run }: { run: AgentRun }) {
  const steps = useRpc('agents.steps', { runId: run.id, limit: 2000 });
  const { setData } = steps;
  useNovaEvent('run.step', (step) => {
    if (step.runId !== run.id) return;
    setData((prev) => (prev ? [...prev.filter((s) => s.id !== step.id), step].slice(-50) : [step]));
  });
  const tail = (steps.data ?? []).slice(-3);
  if (tail.length === 0) {
    return run.lastAction ? (
      <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-text/90">
        <ArrowRight aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-fg" />
        <span className="min-w-0">{run.lastAction}</span>
      </p>
    ) : null;
  }
  return (
    <ol className="mt-2 space-y-1 border-l border-border pl-3" aria-label="Letzte Schritte">
      {tail.map((s, i) => {
        const meta = metaOf(AGENT_STEP_KIND, s.kind);
        const latest = i === tail.length - 1;
        return (
          <li key={s.id} className={cn('flex items-start gap-2 text-xs', latest ? 'text-text' : 'text-muted')}>
            <span className="w-11 shrink-0 font-mono text-[11px] text-subtle tabular-nums">{formatTime(s.ts)}</span>
            <meta.icon aria-hidden className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', latest ? toneClasses[meta.tone].text : 'text-subtle')} />
            <span className="min-w-0 break-words">{s.summary}</span>
          </li>
        );
      })}
    </ol>
  );
}

// --- resources ----------------------------------------------------------------

function percent(used: number | null | undefined, total: number | null | undefined): number | null {
  if (used == null || total == null || total <= 0) return null;
  return (used / total) * 100;
}

function ResourcesCard({ initial }: { initial: ResourceSnapshot | null }) {
  const [live, setLive] = useState<ResourceSnapshot | null>(null);
  useNovaEvent('resources.snapshot', setLive);
  const snap = live && (!initial || live.ts >= initial.ts) ? live : initial;

  if (!snap) {
    return (
      <Card title="Ressourcen" icon={MonitorCog}>
        <EmptyState compact icon={Gauge} title="Noch keine Messwerte" description="Die Auslastung erscheint, sobald der Hintergrunddienst die ersten Werte gemessen hat." />
      </Card>
    );
  }

  const gpu = snap.gpus[0];
  const disk = snap.disks.find((d) => /^c:/i.test(d.path)) ?? snap.disks[0];
  const gpuMissing = snap.gpuNote ?? 'Keine GPU-Messwerte verfügbar';

  return (
    <Card
      title="Ressourcen"
      icon={MonitorCog}
      actions={
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted">
          <StatusDot tone="success" pulse={!!live} size="sm" />
          <RelativeTime ts={snap.ts} />
        </span>
      }
    >
      <div className="space-y-3">
        <Meter label="Prozessor (CPU)" icon={Cpu} value={snap.cpu.percent} valueText={`${formatNumber(snap.cpu.cores, 0)} logische Kerne`} detail={snap.cpu.model} />
        <Meter
          label="Arbeitsspeicher (RAM)"
          icon={MemoryStick}
          value={percent(snap.memory.usedBytes, snap.memory.totalBytes)}
          valueText={`${formatBytes(snap.memory.usedBytes)} von ${formatBytes(snap.memory.totalBytes)} belegt`}
        />
        <Meter
          label="Grafikkarte (GPU)"
          icon={Gauge}
          value={gpu?.utilPercent ?? null}
          estimated={gpu?.estimated}
          valueText={gpu ? `${gpu.name}` : undefined}
          detail={gpu ? `Quelle: ${gpu.source}${snap.gpus.length > 1 ? ` · ${plural(snap.gpus.length - 1, 'weitere GPU', 'weitere GPUs')}` : ''}` : undefined}
          unavailableText={gpu ? 'nicht verfügbar' : gpuMissing}
        />
        <Meter
          label="Grafikspeicher (VRAM)"
          icon={MemoryStick}
          value={percent(gpu?.vramUsedBytes, gpu?.vramTotalBytes)}
          estimated={gpu?.estimated}
          valueText={gpu ? `${formatBytes(gpu.vramUsedBytes)} von ${formatBytes(gpu.vramTotalBytes)} belegt` : undefined}
          unavailableText={gpu ? 'nicht verfügbar' : gpuMissing}
        />
        {disk ? (
          <Meter
            label={`Datenträger ${disk.path}`}
            icon={HardDrive}
            value={percent(disk.totalBytes - disk.freeBytes, disk.totalBytes)}
            valueText={`${formatBytes(disk.freeBytes)} frei von ${formatBytes(disk.totalBytes)}`}
            thresholds={[85, 95]}
          />
        ) : (
          <Meter label="Datenträger" icon={HardDrive} value={null} />
        )}
        {snap.ollamaLoaded.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted">Geladene Modelle</p>
            <ul className="space-y-1">
              {snap.ollamaLoaded.map((m) => (
                <li key={m.model} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono text-text">{m.model}</span>
                  <span className="shrink-0 text-muted tabular-nums" title={m.vramBytes < m.sizeBytes ? 'Teilweise im Arbeitsspeicher – dadurch langsamer' : 'Vollständig im Grafikspeicher'}>
                    {formatBytes(m.vramBytes)} VRAM{m.vramBytes < m.sizeBytes ? ' · teilweise RAM' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

// --- errors -------------------------------------------------------------------

function ErrorsSection({ errors, projectNames }: { errors: Summary['errors']; projectNames: Map<string, string> }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? errors : errors.slice(0, 4);
  return (
    <section aria-labelledby="dash-errors" className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="dash-errors" className="flex items-center gap-2 text-[15px] font-semibold">
          <TriangleAlert aria-hidden className="h-4 w-4 text-warning-fg" />
          Aktuelle Fehler
          <span className="rounded-full bg-surface-3 px-2 text-xs leading-5 font-medium text-muted tabular-nums">{errors.length}</span>
        </h2>
        {errors.length > 4 && (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Weniger anzeigen' : `Alle ${errors.length} anzeigen`}
          </Button>
        )}
      </div>
      <div className="grid items-start gap-3 @4xl:grid-cols-2">
        {visible.map((e) => (
          <ErrorCard key={e.id} error={e} compact projectName={e.projectId ? projectNames.get(e.projectId) : undefined} />
        ))}
      </div>
    </section>
  );
}

// --- projects -----------------------------------------------------------------

function ProjectRow({ project, reason }: { project: ProjectSummary; reason?: string | null }) {
  const kind = metaOf(PROJECT_KIND, project.kind);
  const KindIcon = kind.icon;
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-48 flex-1 items-center gap-2.5">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted" title={kind.label}>
          <KindIcon aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <Link to={paths.project(project.id)} className="block truncate text-[13px] font-semibold text-text">
            {project.name}
          </Link>
          <p className="truncate text-xs text-muted">{reason ?? kind.label}</p>
        </div>
      </div>
      <div className="w-40 shrink-0">
        <ProgressBar value={project.progress} label={`Fortschritt ${project.name}`} showValue />
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {project.runningTasks > 0 && <Badge tone="blue">{project.runningTasks} läuft</Badge>}
        <Badge tone="neutral">{project.openTasks} offen</Badge>
        {project.failedTasks > 0 && <Badge tone="danger">{project.failedTasks} fehlgeschlagen</Badge>}
        {project.blockedTasks > 0 && <Badge tone="danger">{project.blockedTasks} blockiert</Badge>}
        {project.openErrors > 0 && (
          <Badge tone="warning" icon={TriangleAlert}>
            {plural(project.openErrors, 'Fehler', 'Fehler')}
          </Badge>
        )}
      </div>
      <RelativeTime ts={project.lastActivityAt} className="w-24 shrink-0 text-right text-xs text-muted" />
    </li>
  );
}

function ProjectsCard({ projects, work, className }: { projects: ProjectSummary[]; work: WorkStatus; className?: string }) {
  const workById = new Map(work.projects.map((p) => [p.projectId, p]));
  const isRunning = (p: ProjectSummary) => p.status === 'active' && p.workState === 'running' && work.state === 'running' && (p.runningTasks > 0 || (workById.get(p.id)?.activeRuns ?? 0) > 0);
  const running = projects.filter(isRunning);
  const waiting = projects.filter((p) => !isRunning(p) && p.status !== 'archived');
  const reasonFor = (p: ProjectSummary) => {
    if (work.state !== 'running') return work.idleReason;
    const w = workById.get(p.id);
    if (w?.idleReason) return w.suggestion ? `${w.idleReason} Vorschlag: ${w.suggestion}` : w.idleReason;
    return p.workState === 'paused' ? 'Pausiert' : p.workState === 'stopped' ? 'Autonome Arbeit aus' : null;
  };

  return (
    <Card title="Projekte" icon={FolderKanban} className={className} padding="none" actions={<CardLink to={paths.projects}>Alle Projekte</CardLink>}>
      <div className="pb-1">
        <h3 className="flex items-center gap-2 px-4 pt-1 pb-1 text-xs font-semibold text-muted">
          <StatusDot tone="success" pulse={running.length > 0} size="sm" /> Laufend ({running.length})
        </h3>
        {running.length === 0 ? (
          <p className="px-4 pb-3 text-[13px] text-muted">Gerade läuft in keinem Projekt eine Aufgabe.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {running.map((p) => (
              <ProjectRow key={p.id} project={p} />
            ))}
          </ul>
        )}
        <h3 className="mt-1 flex items-center gap-2 border-t border-border px-4 pt-3 pb-1 text-xs font-semibold text-muted">
          <StatusDot tone="warning" size="sm" /> Pausiert und wartend ({waiting.length})
        </h3>
        {waiting.length === 0 ? (
          <p className="px-4 pb-3 text-[13px] text-muted">Keine pausierten oder wartenden Projekte.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {waiting.map((p) => (
              <ProjectRow key={p.id} project={p} reason={reasonFor(p)} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

// --- models -------------------------------------------------------------------

function ModelsCard({ data }: { data: Summary }) {
  const providers = useRpc('providers.list', undefined, { refetchOn: ['provider.updated'] });
  const byId = useMemo(() => new Map((providers.data ?? []).map((p) => [p.id, p])), [providers.data]);
  const local = data.models.local;
  const ollamaTone = !local ? 'neutral' : local.status.running ? 'success' : local.status.installed ? 'warning' : 'danger';
  const ollamaText = !local ? 'Unbekannt' : local.status.running ? 'Läuft' : local.status.installed ? 'Installiert, aber nicht gestartet' : 'Nicht installiert';
  const recheck = useMutation('providers.test', { successToast: (h) => `Geprüft: ${metaOf(PROVIDER_HEALTH, h.status).label}` });

  return (
    <Card title="Modelle" icon={Cpu} actions={<CardLink to={paths.models}>Modelle verwalten</CardLink>}>
      <div className="space-y-3.5">
        <div className="rounded-lg bg-surface-2 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <StatusDot tone={ollamaTone} pulse={!!local?.status.running} />
              Ollama (lokal)
            </span>
            <Badge tone={ollamaTone}>{ollamaText}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted">
            {!local
              ? 'Der Status von Ollama konnte gerade nicht gelesen werden.'
              : local.status.running
                ? `Version ${local.status.version ?? 'unbekannt'} · ${plural(local.modelCount, 'Modell', 'Modelle')} installiert`
                : local.status.message}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-muted">Standardmodell</p>
          {data.models.defaultModel ? (
            <ModelBadge model={data.models.defaultModel} size="md" />
          ) : (
            <Link to={paths.models} className="text-[13px]">
              Noch kein Standardmodell gewählt – jetzt auswählen
            </Link>
          )}
        </div>
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Cloud-Anbieter</p>
          {data.models.cloud.length === 0 ? (
            <p className="text-[13px] text-muted">Kein Cloud-Anbieter eingerichtet (optional).</p>
          ) : (
            <ul className="space-y-2">
              {data.models.cloud.map((h) => {
                const p = byId.get(h.providerId);
                return (
                  <li key={h.providerId} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                        {p?.name ?? h.providerId}
                        {p?.paid && !p.approved && (
                          <Badge tone="warning" variant="outline" title="Kostenpflichtige Nutzung ist noch nicht freigegeben">
                            nicht freigegeben
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted">{h.message}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <StatusBadge meta={metaOf(PROVIDER_HEALTH, h.status)} />
                      <Button size="sm" variant="ghost" loading={recheck.loading} onClick={() => void recheck.run({ providerId: h.providerId })} aria-label={`${p?.name ?? 'Anbieter'} erneut prüfen`}>
                        Prüfen
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

// --- costs --------------------------------------------------------------------

function limitText(limit: number | null): string {
  if (limit == null) return 'ohne Grenze';
  if (limit === 0) return 'Grenze 0 $ – keine kostenpflichtige Nutzung';
  return `von ${formatUsd(limit)}`;
}

function CostsCard({ budget: b }: { budget: Summary['budget'] }) {
  if (!b) {
    return (
      <Card title="Kosten und Verbrauch" icon={Coins} actions={<CardLink to={paths.costs}>Details</CardLink>}>
        <EmptyState compact icon={Coins} title="Kosten gerade nicht verfügbar" description="Die Kostenübersicht konnte nicht geladen werden. Sie erscheint wieder, sobald der Dienst sie liefert." />
      </Card>
    );
  }
  const monthPct = b.monthlyLimitUsd && b.monthlyLimitUsd > 0 ? (b.spentMonthUsd / b.monthlyLimitUsd) * 100 : null;
  return (
    <Card title="Kosten und Verbrauch" icon={Coins} actions={<CardLink to={paths.costs}>Details</CardLink>}>
      <div className="space-y-3">
        {b.paidPaused && (
          <div role="alert" className="flex gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-fg">
            <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{b.pausedReason ?? 'Kostenpflichtige Arbeit ist pausiert, weil ein Budget erreicht wurde.'}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted">Heute</p>
            <p className="text-lg font-semibold tabular-nums">{formatUsd(b.spentTodayUsd, b.containsEstimates && b.spentTodayUsd > 0)}</p>
            <p className="text-[11px] text-muted">{limitText(b.dailyLimitUsd)}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Dieser Monat</p>
            <p className="text-lg font-semibold tabular-nums">{formatUsd(b.spentMonthUsd)}</p>
            <p className="text-[11px] text-muted">
              {limitText(b.monthlyLimitUsd)}
              {b.containsEstimates && b.spentMonthUsd > 0 && <span className="text-warning-fg"> · geschätzt</span>}
            </p>
          </div>
        </div>
        {monthPct != null && <ProgressBar value={monthPct} label="Monatsbudget verbraucht" tone={monthPct >= 90 ? 'danger' : monthPct >= 75 ? 'warning' : 'gradient'} showValue />}
        <dl className="space-y-1.5 border-t border-border pt-3 text-xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Verbleibend</dt>
            <dd className="text-right tabular-nums">
              heute {b.remainingTodayUsd == null ? 'unbegrenzt' : formatUsd(b.remainingTodayUsd)} · Monat {b.remainingMonthUsd == null ? 'unbegrenzt' : formatUsd(b.remainingMonthUsd)}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Tokens heute</dt>
            <dd className="text-right tabular-nums">
              {formatTokens(b.tokensToday.input)} gelesen · {formatTokens(b.tokensToday.output)} geschrieben
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Tokens im Monat</dt>
            <dd className="text-right tabular-nums">{formatTokens(b.tokensMonth.input + b.tokensMonth.output)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted">Laufzeit heute</dt>
            <dd className="text-right tabular-nums">
              lokal {formatDuration(b.localRuntimeMsToday)} · Cloud {formatDuration(b.cloudRuntimeMsToday)}
            </dd>
          </div>
        </dl>
        <p className="text-[11px] text-subtle">Tokens und Laufzeit, soweit die Anbieter sie melden. Lokale Modelle kosten nichts.</p>
      </div>
    </Card>
  );
}

// --- checks -------------------------------------------------------------------

function BuildsCard({ builds, projectNames }: { builds: CheckRun[]; projectNames: Map<string, string> }) {
  return (
    <Card title="Letzte erfolgreiche Builds" icon={Hammer} padding="none">
      {builds.length === 0 ? (
        <EmptyState compact icon={Hammer} title="Noch kein erfolgreicher Build" description="Builds erscheinen hier, sobald NOVA oder ein Klick auf „Build ausführen“ einen erstellt hat." />
      ) : (
        <ul className="divide-y divide-border/70">
          {builds.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <Link to={paths.project(c.projectId, { tab: 'checks' })} className="block truncate text-[13px] font-medium text-text">
                  {projectNames.get(c.projectId) ?? 'Projekt'}
                </Link>
                <p className="truncate font-mono text-[11px] text-muted" title={c.command}>
                  {c.command}
                </p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted">
                <RelativeTime ts={c.finishedAt ?? c.startedAt} />
                {c.durationMs != null && <p className="tabular-nums">{formatDuration(c.durationMs)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FailedTestsCard({ tests, projectNames }: { tests: CheckRun[]; projectNames: Map<string, string> }) {
  return (
    <Card title="Fehlgeschlagene Tests" icon={FlaskConical} padding="none">
      {tests.length === 0 ? (
        <EmptyState compact icon={FlaskConical} title="Keine fehlgeschlagenen Tests" description="Die letzten Testläufe aller Projekte waren erfolgreich." />
      ) : (
        <ul className="divide-y divide-border/70">
          {tests.map((c) => {
            const total = (c.passed ?? 0) + (c.failed ?? 0) + (c.skipped ?? 0);
            return (
              <li key={c.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link to={paths.project(c.projectId, { tab: 'checks' })} className="truncate text-[13px] font-medium text-text">
                    {projectNames.get(c.projectId) ?? 'Projekt'}
                  </Link>
                  <RelativeTime ts={c.finishedAt ?? c.startedAt} className="shrink-0 text-xs text-muted" />
                </div>
                <p className="mt-0.5 text-xs text-danger-fg">
                  {c.failed ?? '?'} von {total || '?'} Tests fehlgeschlagen
                </p>
                <ul className="mt-1.5 space-y-1">
                  {c.failures.slice(0, 2).map((f, i) => (
                    <li key={i} className="text-xs">
                      {f.file ? (
                        <Link to={paths.studio(c.projectId, { file: f.file, line: f.line })} className={cn('font-mono')} title="Im Studio an dieser Stelle öffnen">
                          {f.file}
                          {f.line != null ? `:${f.line}` : ''}
                        </Link>
                      ) : null}
                      <p className="line-clamp-2 text-muted">{f.message}</p>
                    </li>
                  ))}
                  {c.failures.length > 2 && <li className="text-[11px] text-subtle">+ {c.failures.length - 2} weitere</li>}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
