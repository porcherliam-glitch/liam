// Übersicht of a project: quick actions (Studio, Tests, Build, Ziel planen), work state with idle reason and
// suggestion, active agents, last test/build, last changes, open errors, project data, configuration, management.
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Archive, ArchiveRestore, ArrowRight, Bot, CircleCheck, CircleSlash, Code, FileDiff, FlaskConical, Hammer, Lightbulb, Target, Trash2, TriangleAlert, Zap } from 'lucide-react';
import type { CheckKind, CheckRun, ProjectSummary } from '@shared/schemas';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, LoadingState, StatusBadge, Tooltip } from '../../../components/ui';
import { CheckStatusBadge, ErrorCard, RelativeTime, RoleBadge, RunDuration, RunStatusBadge } from '../../../components/common';
import { useLiveRuns, useLiveTasks } from '../../../components/project';
import { useMutation, useRpc } from '../../../hooks/useRpc';
import { useDaemonStore } from '../../../stores/daemon';
import { toast } from '../../../stores/toasts';
import { formatDuration } from '../../../lib/format';
import { CHANGE_OP, CHECK_KIND, metaOf, WORK_STATE } from '../../../lib/labels';
import { paths, type ProjectTab } from '../../../lib/paths';
import { ProjectInfoCard } from './ProjectInfoCard';
import { ProjectConfigForm } from './ProjectConfigForm';
import { PlanGoalDialog } from './PlanGoalDialog';

export interface OverviewTabProps {
  project: ProjectSummary;
  onTab: (tab: ProjectTab) => void;
}

/** German sentence for a missing check command (UI-SPEC: honest text instead of a fake button). */
export function missingCommandText(kind: CheckKind): string {
  const what: Record<CheckKind, string> = {
    test: 'kein Testbefehl',
    build: 'kein Build-Befehl',
    lint: 'kein Lint-Befehl',
    typecheck: 'kein Befehl für die Typprüfung',
    e2e: 'kein Befehl für Oberflächentests',
    security: 'kein Befehl für die Sicherheitsprüfung',
    runtime: 'kein Start- oder Entwicklungsbefehl',
    package: 'kein Befehl zum Paketbau',
  };
  return `Für dieses Projekt ist ${what[kind]} eingerichtet – Prüfung nicht möglich`;
}

/** Command used for a check kind (runtime uses run, else dev). */
export function commandFor(project: Pick<ProjectSummary, 'config'>, kind: CheckKind): string | null {
  const c = project.config.commands;
  if (kind === 'runtime') return c.run ?? c.dev ?? null;
  return c[kind] ?? null;
}

export function OverviewTab({ project, onTab }: OverviewTabProps) {
  const tasks = useLiveTasks(project.id);
  return (
    <div className="@container space-y-4">
      <QuickActions project={project} onTab={onTab} />
      <div className="grid items-start gap-4 @4xl:grid-cols-3">
        <div className="space-y-4 @4xl:order-last">
          <ActiveAgentsCard projectId={project.id} taskTitles={tasks.byId} onTab={onTab} />
          <ChecksSummaryCard project={project} onTab={onTab} />
          <RecentChangesCard projectId={project.id} onTab={onTab} />
          <OpenErrorsCard projectId={project.id} onTab={onTab} />
        </div>
        <div className="space-y-4 @4xl:col-span-2">
          <ProjectInfoCard project={project} />
          <ProjectConfigForm project={project} />
          <ManageCard project={project} />
        </div>
      </div>
    </div>
  );
}

function QuickActions({ project, onTab }: OverviewTabProps) {
  const navigate = useNavigate();
  const [planOpen, setPlanOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const work = useDaemonStore((s) => s.work);
  const projectWork = work?.projects.find((p) => p.projectId === project.id);
  const runCheck = useMutation('checks.run', {
    onSuccess: (c) =>
      toast.show({
        tone: 'info',
        title: `${metaOf(CHECK_KIND, c.kind).label} gestartet`,
        message: 'Das Ergebnis erscheint im Reiter „Prüfungen“.',
        action: { label: 'Ansehen', onClick: () => onTab('checks') },
      }),
  });
  const state = work && work.state !== 'running' ? work.state : project.workState;
  const stateMeta = WORK_STATE[state];
  const idleReason = projectWork?.idleReason ?? null;
  const suggestion = projectWork?.suggestion ?? null;

  const checkButton = (kind: 'test' | 'build', label: string, icon: typeof FlaskConical) => {
    const cmd = commandFor(project, kind);
    const button = (
      <Button icon={icon} disabled={!cmd || runCheck.loading} loading={runCheck.loading && runCheck.error === null && false} onClick={() => void runCheck.run({ projectId: project.id, kind })}>
        {label}
      </Button>
    );
    return cmd ? (
      <Tooltip content={<span className="font-mono">{cmd}</span>}>{button}</Tooltip>
    ) : (
      <Tooltip content={missingCommandText(kind)}>
        <span tabIndex={0} className="inline-flex rounded-lg" aria-label={`${label}: ${missingCommandText(kind)}`}>
          {button}
        </span>
      </Tooltip>
    );
  };

  return (
    <section aria-label="Schnellzugriff" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={Code} onClick={() => navigate(paths.studio(project.id))}>
          Studio öffnen
        </Button>
        {checkButton('test', 'Tests ausführen', FlaskConical)}
        {checkButton('build', 'Build ausführen', Hammer)}
        <Button
          icon={Target}
          onClick={() => {
            setGoal('');
            setPlanOpen(true);
          }}
        >
          Ziel planen
        </Button>
      </div>
      <div className="flex min-w-0 flex-1 basis-64 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
        <StatusBadge meta={stateMeta} size="md" />
        {idleReason && <span className="min-w-0 text-muted">{idleReason}</span>}
        {suggestion && (
          <button
            type="button"
            onClick={() => {
              setGoal(suggestion === 'Neues Ziel planen' ? '' : suggestion);
              setPlanOpen(true);
            }}
            className="inline-flex min-w-0 items-center gap-1 rounded text-left font-medium text-violet-fg hover:underline"
            title="Vorschlag als Ziel übernehmen"
          >
            <Lightbulb aria-hidden className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Vorschlag: {suggestion}</span>
          </button>
        )}
      </div>
      <PlanGoalDialog open={planOpen} onClose={() => setPlanOpen(false)} projectId={project.id} projectName={project.name} initialGoal={goal} />
    </section>
  );
}

function CardLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-fg hover:underline">
      {children}
      <ArrowRight aria-hidden className="h-3.5 w-3.5" />
    </button>
  );
}

function ActiveAgentsCard({ projectId, taskTitles, onTab }: { projectId: string; taskTitles: ReadonlyMap<string, { title: string }>; onTab: (t: ProjectTab) => void }) {
  const runs = useLiveRuns({ projectId, limit: 50 });
  const active = (runs.runs ?? []).filter((r) => r.status === 'running' || r.status === 'paused' || r.status === 'waiting_approval');
  return (
    <Card title="Aktive Agenten" icon={Bot} actions={<CardLink onClick={() => onTab('agents')}>Alle</CardLink>} padding="sm">
      {runs.loading ? (
        <LoadingState compact />
      ) : runs.error && !runs.data ? (
        <ErrorState compact error={runs.error} onRetry={() => void runs.refetch()} />
      ) : active.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">Gerade arbeitet kein Agent an diesem Projekt.</p>
      ) : (
        <ul className="space-y-2" aria-label="Aktive Agenten">
          {active.map((r) => (
            <li key={r.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <RoleBadge role={r.role} />
                <RunStatusBadge status={r.status} />
                <span className="ml-auto text-xs text-muted">
                  <RunDuration run={r} />
                </span>
              </div>
              <Link to={paths.project(projectId, { tab: 'tasks', task: r.taskId })} className="mt-1 block truncate text-[13px] font-medium text-text hover:text-blue-fg">
                {taskTitles.get(r.taskId)?.title ?? 'Aufgabe'}
              </Link>
              {r.lastAction && <p className="truncate text-xs text-muted">{r.lastAction}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function CheckLine({ label, run, onOpen }: { label: string; run: CheckRun | null; onOpen: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <span className="text-[13px] font-medium text-text">{label}</span>
      {run ? (
        <>
          <CheckStatusBadge status={run.status} />
          {run.kind === 'test' && run.passed != null && (
            <span className="text-xs text-muted tabular-nums">
              {run.passed} bestanden{run.failed ? `, ${run.failed} fehlgeschlagen` : ''}
            </span>
          )}
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            {run.durationMs != null && <span>{formatDuration(run.durationMs)}</span>}
            <RelativeTime ts={run.finishedAt ?? run.startedAt} />
            <button type="button" onClick={onOpen} className="rounded font-medium text-blue-fg hover:underline">
              Details
            </button>
          </span>
        </>
      ) : (
        <span className="text-xs text-muted">Noch nicht ausgeführt</span>
      )}
    </li>
  );
}

function ChecksSummaryCard({ project, onTab }: { project: ProjectSummary; onTab: (t: ProjectTab) => void }) {
  const lastBuildFailed = project.lastBuild && project.lastBuild.status !== 'passed' && project.lastBuild.status !== 'running';
  return (
    <Card title="Tests und Builds" icon={FlaskConical} actions={<CardLink onClick={() => onTab('checks')}>Prüfungen</CardLink>} padding="sm">
      <ul className="space-y-2">
        <CheckLine label="Letzter Test" run={project.lastTest} onOpen={() => onTab('checks')} />
        <CheckLine label="Letzter Build" run={project.lastBuild} onOpen={() => onTab('checks')} />
        {lastBuildFailed && project.lastSuccessfulBuild && (
          <li className="px-1 text-xs text-muted">
            Letzter erfolgreicher Build: <RelativeTime ts={project.lastSuccessfulBuild.finishedAt ?? project.lastSuccessfulBuild.startedAt} />
          </li>
        )}
      </ul>
      {!project.config.commands.test && <p className="mt-2 px-1 text-xs text-warning-fg">{missingCommandText('test')}.</p>}
    </Card>
  );
}

function RecentChangesCard({ projectId, onTab }: { projectId: string; onTab: (t: ProjectTab) => void }) {
  const changed = useRpc('files.changed', { projectId }, { refetchOn: ['files.changed', 'checkpoint.updated'], eventFilter: (e) => !('projectId' in e.payload) || e.payload.projectId === projectId });
  const list = useMemo(() => (changed.data ?? []).filter((f) => f.byNova).slice(0, 6), [changed.data]);
  return (
    <Card title="Letzte Änderungen" icon={FileDiff} actions={<CardLink onClick={() => onTab('changes')}>Alle</CardLink>} padding="sm">
      {changed.loading ? (
        <LoadingState compact />
      ) : changed.error && !changed.data ? (
        <ErrorState compact error={changed.error} onRetry={() => void changed.refetch()} />
      ) : list.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">NOVA hat noch keine Dateien geändert.</p>
      ) : (
        <ul className="space-y-1" aria-label="Von NOVA geänderte Dateien">
          {list.map((f) => (
            <li key={f.path} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
              <StatusBadge meta={metaOf(CHANGE_OP, f.op)} />
              <Link to={paths.studio(projectId, { file: f.path })} className="min-w-0 flex-1 truncate font-mono text-xs" title={`${f.path} im Studio öffnen`}>
                {f.path}
              </Link>
              {f.modifiedSinceNova && (
                <Badge tone="warning" icon={TriangleAlert} title="Die Datei wurde nach NOVAs letzter Änderung von Hand oder von einem anderen Programm geändert.">
                  nach NOVA geändert
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OpenErrorsCard({ projectId, onTab }: { projectId: string; onTab: (t: ProjectTab) => void }) {
  const errors = useRpc('errors.list', { projectId, limit: 20 }, { refetchOn: ['error.raised', 'error.resolved'] });
  const list = errors.data ?? [];
  return (
    <Card title="Offene Fehler" icon={TriangleAlert} actions={list.length > 0 && <CardLink onClick={() => onTab('errors')}>Alle ({list.length})</CardLink>} padding="sm">
      {errors.loading ? (
        <LoadingState compact />
      ) : errors.error && !errors.data ? (
        <ErrorState compact error={errors.error} onRetry={() => void errors.refetch()} />
      ) : list.length === 0 ? (
        <p className="flex items-center gap-1.5 px-1 py-2 text-xs text-success-fg">
          <CircleCheck aria-hidden className="h-3.5 w-3.5" />
          Keine offenen Fehler.
        </p>
      ) : (
        <div className="space-y-2">
          {list.slice(0, 2).map((e) => (
            <ErrorCard key={e.id} error={e} compact onResolved={() => void errors.refetch()} />
          ))}
        </div>
      )}
    </Card>
  );
}

function ManageCard({ project }: { project: ProjectSummary }) {
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState<null | 'archive' | 'remove'>(null);
  const archived = project.status === 'archived';
  const setStatus = useMutation('projects.update', { successToast: (p) => (p.status === 'archived' ? 'Projekt archiviert' : 'Projekt wieder aktiv') });
  const remove = useMutation('projects.remove', {
    successToast: `„${project.name}“ wurde aus NOVA entfernt`,
    onSuccess: () => navigate(paths.projects),
  });
  return (
    <Card title="Verwaltung" icon={Zap} description="Archivieren, wieder aktivieren oder aus NOVA entfernen. Projektdateien werden dabei nie gelöscht.">
      <div className="flex flex-wrap gap-2">
        {archived ? (
          <Button icon={ArchiveRestore} loading={setStatus.loading} onClick={() => void setStatus.run({ id: project.id, status: 'active' })}>
            Wieder aktivieren
          </Button>
        ) : (
          <Button icon={Archive} onClick={() => setConfirm('archive')}>
            Archivieren
          </Button>
        )}
        <Button variant="danger" icon={Trash2} onClick={() => setConfirm('remove')} disabled={project.runningTasks > 0} title={project.runningTasks > 0 ? 'Während Aufgaben laufen, kann das Projekt nicht entfernt werden.' : undefined}>
          Aus NOVA entfernen
        </Button>
      </div>
      {project.runningTasks > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <CircleSlash aria-hidden className="h-3.5 w-3.5" />
          Zum Entfernen zuerst die laufenden Aufgaben stoppen.
        </p>
      )}
      <ConfirmDialog
        open={confirm === 'archive'}
        title="Projekt archivieren?"
        message="Archivierte Projekte erscheinen nicht mehr in der Projektliste, und NOVA arbeitet nicht mehr daran. Aufgaben, Gedächtnis und Dateien bleiben erhalten; das Projekt lässt sich jederzeit wieder aktivieren."
        confirmLabel="Archivieren"
        loading={setStatus.loading}
        onConfirm={async () => {
          await setStatus.run({ id: project.id, status: 'archived' });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'remove'}
        tone="danger"
        title={`„${project.name}“ aus NOVA entfernen?`}
        message={
          <>
            <p>Das Projekt verschwindet aus NOVA – mit Aufgaben, Agentenverlauf und Gedächtnis.</p>
            <p className="mt-2 font-medium">Der Projektordner und alle Dateien darin bleiben unverändert auf dem PC.</p>
            <p className="mt-1 font-mono text-xs text-muted">{project.path}</p>
          </>
        }
        confirmLabel="Entfernen"
        loading={remove.loading}
        onConfirm={async () => {
          await remove.run({ id: project.id });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </Card>
  );
}

export { EmptyState };
