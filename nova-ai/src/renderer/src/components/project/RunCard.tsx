// One agent run: role, task, project, status, model, live runtime, steps, tokens, last action, blocker, files,
// controls on the task (pause/resume/stop/priority) and the expandable step feed.
import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Ban, ChevronRight, CircleAlert, Coins, Footprints, ShieldQuestion } from 'lucide-react';
import type { AgentRun, Task } from '@shared/schemas';
import { useMutation } from '../../hooks/useRpc';
import { cn } from '../../lib/cn';
import { formatTokens } from '../../lib/format';
import { AGENT_ROLE, blockerAction, metaOf } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { ModelBadge, RoleBadge, RunStatusBadge } from '../common/StatusBadges';
import { PrioritySelect } from '../common/PrioritySelect';
import { RelativeTime, RunDuration } from '../common/RelativeTime';
import { TaskActions } from './TaskActions';
import { StepFeed } from './StepFeed';
import { taskCapabilities } from './taskRules';

export interface RunCardProps {
  run: AgentRun;
  /** The run's task (for title and controls); controls are hidden without it. */
  task?: Task;
  /** Project name (shown as link when given). */
  projectName?: string;
  defaultExpanded?: boolean;
  onTaskChanged?: (task: Task) => void;
  className?: string;
}

const LIVE = new Set<AgentRun['status']>(['running', 'paused', 'waiting_approval']);

export function RunCard({ run, task, projectName, defaultExpanded = false, onTaskChanged, className }: RunCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const setPriority = useMutation('tasks.setPriority', { onSuccess: (t) => onTaskChanged?.(t) });
  const problem = run.blocker ?? run.error;
  const action = blockerAction(run.errorCode ?? task?.blockerCode);
  const feedId = `run-steps-${run.id}`;
  const taskTitle = task?.title ?? 'Aufgabe';
  const isLive = LIVE.has(run.status);
  // Controls only make sense while the task can still change.
  const showControls = !!task && (taskCapabilities(task).pause || taskCapabilities(task).resume || taskCapabilities(task).stop);

  return (
    <article
      aria-label={`${metaOf(AGENT_ROLE, run.role).label}: ${taskTitle}`}
      className={cn('rounded-xl border bg-surface', run.status === 'running' ? 'border-blue/40' : 'border-border', className)}
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2">
            <RoleBadge role={run.role} size="md" />
            <RunStatusBadge status={run.status} />
            {run.pendingApprovalId && (
              <Link to={paths.approvals} className="inline-flex items-center gap-1 text-xs font-medium text-warning-fg">
                <ShieldQuestion aria-hidden className="h-3.5 w-3.5" />
                Zur Freigabe
              </Link>
            )}
          </div>
          <h3 className="mt-1.5 min-w-0 text-[13px] font-semibold">
            <Link to={paths.project(run.projectId, { tab: 'tasks', task: run.taskId })} className="text-text hover:text-blue-fg">
              {taskTitle}
            </Link>
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {projectName && (
              <>
                <Link to={paths.project(run.projectId, { tab: 'agents' })} className="text-muted hover:text-text">
                  {projectName}
                </Link>
                <span aria-hidden>·</span>
              </>
            )}
            <span>
              Gestartet <RelativeTime ts={run.startedAt} />
            </span>
            {run.endedAt != null && (
              <>
                <span aria-hidden>·</span>
                <span>
                  beendet <RelativeTime ts={run.endedAt} />
                </span>
              </>
            )}
          </p>
        </div>
        <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs sm:grid-cols-[auto_auto_auto_auto]">
          <dt className="text-muted">Modell</dt>
          <dd>
            <ModelBadge model={run.providerId && run.modelId ? { providerId: run.providerId, modelId: run.modelId } : null} />
          </dd>
          <dt className="text-muted">Laufzeit</dt>
          <dd className={cn('font-medium', run.status === 'running' ? 'text-blue-fg' : 'text-text')}>
            <RunDuration run={run} />
          </dd>
          <dt className="inline-flex items-center gap-1 text-muted">
            <Footprints aria-hidden className="h-3 w-3" />
            Schritte
          </dt>
          <dd className="text-text tabular-nums">{run.stepCount}</dd>
          <dt className="inline-flex items-center gap-1 text-muted">
            <Coins aria-hidden className="h-3 w-3" />
            Tokens
          </dt>
          <dd className="text-text tabular-nums" title={`Eingabe ${run.inputTokens} · Ausgabe ${run.outputTokens}`}>
            {formatTokens(run.inputTokens)} / {formatTokens(run.outputTokens)}
          </dd>
        </dl>
      </div>

      <div className="space-y-2 px-4 pb-3">
        {run.lastAction && (
          <p className="text-xs text-text">
            <span className="text-muted">Letzte Aktion: </span>
            {run.lastAction}
          </p>
        )}
        {problem && (
          <div className={cn('flex flex-wrap items-start gap-2 rounded-lg border px-3 py-2 text-xs', run.status === 'failed' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10')}>
            {run.status === 'failed' ? <CircleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-fg" /> : <Ban aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-fg" />}
            <span className="min-w-0 flex-1 text-text">{problem}</span>
            {action && (
              <Link to={action.path ?? paths.project(run.projectId, { tab: 'tasks', task: run.taskId })} className="inline-flex items-center gap-1 font-medium">
                {action.label}
                <ArrowRight aria-hidden className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}
        {run.files.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Dateien dieses Agenten">
            {run.files.slice(0, 8).map((f) => (
              <li key={f}>
                <Link
                  to={paths.studio(run.projectId, { file: f })}
                  className="inline-flex max-w-72 items-center rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-muted no-underline hover:bg-surface-3 hover:text-text hover:no-underline"
                  title={`${f} im Studio öffnen`}
                >
                  <span className="truncate">{f}</span>
                </Link>
              </li>
            ))}
            {run.files.length > 8 && <li className="text-[11px] text-muted">+{run.files.length - 8} weitere</li>}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={feedId}
            className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-fg hover:underline"
          >
            <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', expanded && 'rotate-90')} />
            {expanded ? 'Schritte ausblenden' : `Schritte anzeigen (${run.stepCount})`}
          </button>
          {showControls && task && (
            <div className="flex items-center gap-2">
              <PrioritySelect size="sm" value={task.priority} disabled={!taskCapabilities(task).priority} onChange={(p) => void setPriority.run({ id: task.id, priority: p })} />
              <TaskActions task={task} actions={['start', 'pause', 'stop']} onChanged={onTaskChanged} />
            </div>
          )}
        </div>
        {expanded && (
          <div id={feedId}>
            <StepFeed runId={run.id} live={isLive} />
          </div>
        )}
      </div>
    </article>
  );
}
