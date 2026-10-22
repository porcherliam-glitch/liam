import { Link } from 'react-router';
import { ArrowRight, Ban, CircleAlert, CircleX, FolderX, ListTodo, LoaderCircle, ShieldQuestion, type LucideIcon } from 'lucide-react';
import type { ProjectSummary } from '@shared/schemas';
import { Badge, ProgressBar, StatusBadge } from '../../components/ui';
import { RelativeTime } from '../../components/common';
import { ProjectWorkToggle } from '../../components/project';
import { cn } from '../../lib/cn';
import { metaOf, PROJECT_KIND, PROJECT_STATUS, toneClasses, type Tone } from '../../lib/labels';
import { paths } from '../../lib/paths';

/** Done tasks and all tasks that count for the progress (everything except cancelled). */
export function progressCounts(p: Pick<ProjectSummary, 'taskCounts'>): { done: number; total: number } {
  const counts = p.taskCounts ?? {};
  const total = Object.entries(counts).reduce((n, [status, c]) => (status === 'cancelled' ? n : n + (c ?? 0)), 0);
  return { done: counts.done ?? 0, total };
}

function CountChip({ icon: Icon, label, value, tone, to }: { icon: LucideIcon; label: string; value: number; tone: Tone; to: string }) {
  const active = value > 0;
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value}`}
      title={label}
      className={cn(
        'flex min-w-0 flex-col rounded-lg border px-2.5 py-1.5 no-underline transition-colors duration-150 hover:no-underline',
        active ? cn(toneClasses[tone].border, 'bg-surface-2 hover:bg-surface-3') : 'border-border bg-surface-2/40 hover:bg-surface-2',
      )}
    >
      <span className={cn('flex items-center gap-1 text-[11px]', active ? toneClasses[tone].text : 'text-muted')}>
        <Icon aria-hidden className={cn('h-3 w-3 shrink-0', active && tone === 'blue' && 'animate-spin')} />
        <span className="truncate">{label}</span>
      </span>
      <span className={cn('text-base leading-6 font-semibold tabular-nums', active ? 'text-text' : 'text-subtle')}>{value}</span>
    </Link>
  );
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  const kind = metaOf(PROJECT_KIND, project.kind);
  const { done, total } = progressCounts(project);
  const archived = project.status === 'archived';
  const taskLink = (task?: string) => paths.project(project.id, { tab: 'tasks', task });
  return (
    <article aria-label={project.name} className={cn('flex w-full min-w-0 flex-col rounded-xl border border-border bg-surface', archived && 'opacity-75')}>
      <div className="flex items-start gap-3 px-4 pt-4">
        <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneClasses[kind.tone].soft)}>
          <kind.icon aria-hidden className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-[15px] font-semibold">
              <Link to={paths.project(project.id)} className="text-text hover:text-blue-fg">
                {project.name}
              </Link>
            </h2>
            {archived && <StatusBadge meta={PROJECT_STATUS.archived} />}
          </div>
          <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
            <span>{kind.label}</span>
            {project.technologies.slice(0, 4).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {project.technologies.length > 4 && <span className="text-subtle">+{project.technologies.length - 4}</span>}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-4 pt-3 pb-4">
        {project.description ? <p className="line-clamp-2 text-[13px] text-muted">{project.description}</p> : <p className="text-[13px] text-subtle italic">Keine Beschreibung.</p>}

        {project.pathMissing && (
          <p className="flex items-start gap-1.5 rounded-lg border border-danger/40 bg-danger/10 px-2.5 py-1.5 text-xs text-danger-fg">
            <FolderX aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Der Projektordner wurde nicht gefunden. In der Projektübersicht kann er neu verknüpft werden.
          </p>
        )}

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">Fortschritt</span>
            <span className="text-muted tabular-nums">{total ? `${done} von ${total} Aufgaben erledigt` : 'Noch keine Aufgaben'}</span>
          </div>
          <ProgressBar value={project.progress} label={`Fortschritt von ${project.name}`} showValue />
        </div>

        <div className="grid grid-cols-3 gap-1.5 @sm:grid-cols-5">
          <CountChip icon={ListTodo} label="Offen" value={project.openTasks} tone="violet" to={taskLink()} />
          <CountChip icon={LoaderCircle} label="Läuft" value={project.runningTasks} tone="blue" to={paths.project(project.id, { tab: 'agents' })} />
          <CountChip icon={CircleX} label="Fehlgeschl." value={project.failedTasks} tone="danger" to={taskLink()} />
          <CountChip icon={Ban} label="Blockiert" value={project.blockedTasks} tone="warning" to={taskLink()} />
          <CountChip icon={CircleAlert} label="Fehler" value={project.openErrors} tone="danger" to={paths.project(project.id, { tab: 'errors' })} />
        </div>
        {project.pendingApprovals > 0 && (
          <Link to={paths.approvals} className="inline-flex items-center gap-1.5 text-xs font-medium text-warning-fg">
            <ShieldQuestion aria-hidden className="h-3.5 w-3.5" />
            {project.pendingApprovals === 1 ? '1 Freigabe wartet auf eine Entscheidung' : `${project.pendingApprovals} Freigaben warten auf eine Entscheidung`}
          </Link>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-4 py-2.5">
        {archived ? <span className="text-xs text-muted">Archiviert – keine automatische Arbeit.</span> : <ProjectWorkToggle project={project} />}
        <span className="flex items-center gap-3 text-xs text-muted">
          <span>
            {project.lastActivityAt ? (
              <>
                Aktiv <RelativeTime ts={project.lastActivityAt} />
              </>
            ) : (
              'Noch keine Aktivität'
            )}
          </span>
          <Link to={paths.project(project.id)} className="inline-flex items-center gap-1 font-medium" aria-label={`${project.name} öffnen`}>
            Öffnen
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        </span>
      </footer>
    </article>
  );
}
