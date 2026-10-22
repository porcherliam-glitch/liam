// Expanded task view: blocker with the matching action, conversation, description/acceptance/result,
// dependencies, verification checks with reviewer findings, changed files, metadata and labeled controls.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Ban, Code, FileCode, Files, GitFork, History, ListChecks, ShieldQuestion, Target, Undo2, Workflow } from 'lucide-react';
import type { Task } from '@shared/schemas';
import { cn } from '../../lib/cn';
import { blockerAction, CHECK_STATUS, metaOf, REVIEW_FINDING_SEVERITY, TASK_KIND, TASK_SOURCE } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { KeyValue } from '../ui/KeyValue';
import { ModelBadge, RoleBadge, TaskStatusBadge, VerificationBadge } from '../common/StatusBadges';
import { RelativeTime } from '../common/RelativeTime';
import { TaskActions } from './TaskActions';
import { TaskNotes } from './TaskNotes';
import { RestoreDialog } from './RestoreDialog';

export interface TaskDetailProps {
  task: Task;
  /** Tasks by id (for dependency titles); may miss tasks of other projects. */
  byId: ReadonlyMap<string, Task>;
  onEdit?: (task: Task) => void;
  onChanged?: (task: Task) => void;
  onDeleted?: (id: string) => void;
  /** Called when a dependency link is clicked (highlight it in the list). */
  onSelectTask?: (id: string) => void;
  /** Project has git (offer "commit" on undo). */
  gitAvailable?: boolean;
}

function Block({ icon: Icon, title, children, className }: { icon: typeof Target; title: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {title}
      </h4>
      <div className="text-[13px] leading-relaxed text-text">{children}</div>
    </div>
  );
}

export function TaskDetail({ task, byId, onEdit, onChanged, onDeleted, onSelectTask, gitAvailable }: TaskDetailProps) {
  const [undoOpen, setUndoOpen] = useState(false);
  const action = blockerAction(task.blockerCode);
  const showBlocker = !!task.blocker && ['blocked', 'failed', 'waiting_approval', 'interrupted', 'paused'].includes(task.status);
  const needsInput = task.status === 'blocked' && task.blockerCode === 'NEEDS_INPUT';
  const blockerTone = task.status === 'waiting_approval' || task.status === 'interrupted' || task.status === 'paused' ? 'warning' : 'danger';

  return (
    <div className="space-y-4">
      {showBlocker && (
        <div
          role="note"
          className={cn(
            'flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border p-3',
            blockerTone === 'warning' ? 'border-warning/40 bg-warning/10' : 'border-danger/40 bg-danger/10',
          )}
        >
          {task.status === 'waiting_approval' ? (
            <ShieldQuestion aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
          ) : (
            <Ban aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', blockerTone === 'warning' ? 'text-warning-fg' : 'text-danger-fg')} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text">{task.status === 'waiting_approval' ? 'Wartet auf eine Entscheidung' : 'Warum geht es nicht weiter?'}</p>
            <p className="mt-0.5 text-[13px] text-text">{task.blocker}</p>
          </div>
          {action?.path && (
            <Link to={action.path} className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-text no-underline hover:bg-surface-3 hover:no-underline">
              {action.label}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}

      {needsInput && <TaskNotes task={task} />}

      <div className="grid gap-x-6 gap-y-4 md:grid-cols-2">
        <Block icon={FileCode} title="Beschreibung">
          {task.description ? <p className="whitespace-pre-wrap">{task.description}</p> : <span className="text-muted">Keine Beschreibung.</span>}
        </Block>
        <Block icon={Target} title="Abnahmekriterien">
          {task.acceptance ? <p className="whitespace-pre-wrap">{task.acceptance}</p> : <span className="text-muted">Keine festgelegt.</span>}
        </Block>
        {task.result && (
          <Block icon={ListChecks} title="Ergebnis" className="md:col-span-2">
            <p className="whitespace-pre-wrap">{task.result}</p>
          </Block>
        )}
        <Block icon={GitFork} title="Abhängigkeiten">
          {task.dependsOn.length === 0 ? (
            <span className="text-muted">Keine – kann sofort starten.</span>
          ) : (
            <ul className="space-y-1">
              {task.dependsOn.map((id) => {
                const dep = byId.get(id);
                return (
                  <li key={id} className="flex min-w-0 items-center gap-2">
                    {dep ? <TaskStatusBadge status={dep.status} /> : null}
                    {dep && onSelectTask ? (
                      <button type="button" onClick={() => onSelectTask(id)} className="min-w-0 truncate rounded text-left text-blue-fg hover:underline">
                        {dep.title}
                      </button>
                    ) : (
                      <span className="min-w-0 truncate">{dep?.title ?? 'Unbekannte Aufgabe'}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Block>
        <Block icon={ListChecks} title="Prüfung">
          <div className="space-y-2">
            <VerificationBadge verification={task.verification} size="md" />
            {task.verification.checks.length > 0 && (
              <ul className="space-y-2">
                {task.verification.checks.map((c, i) => (
                  <li key={`${c.name}-${i}`} className="rounded-lg border border-border bg-surface-2 px-2.5 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium">{c.name}</span>
                      <StatusBadge meta={metaOf(CHECK_STATUS, c.status)} />
                      {c.checkRunId && (
                        <Link to={paths.project(task.projectId, { tab: 'checks' })} className="text-xs">
                          Prüfung ansehen
                        </Link>
                      )}
                    </div>
                    {c.details && <p className="mt-0.5 text-xs text-muted">{c.details}</p>}
                    {c.findings.length > 0 && (
                      <ul className="mt-1.5 space-y-1" aria-label={`Hinweise aus „${c.name}“`}>
                        {c.findings.map((f, j) => (
                          <li key={j} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-xs">
                            <StatusBadge meta={metaOf(REVIEW_FINDING_SEVERITY, f.severity)} />
                            {f.file && (
                              <Link to={paths.studio(task.projectId, { file: f.file, line: f.line })} className="font-mono">
                                {f.file}
                                {f.line != null ? `:${f.line}` : ''}
                              </Link>
                            )}
                            <span className="min-w-0 basis-full text-text sm:basis-auto">{f.message}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Block>
        <Block icon={Files} title="Geänderte Dateien">
          {task.files.length === 0 ? (
            <span className="text-muted">Noch keine.</span>
          ) : (
            <ul className="space-y-0.5">
              {task.files.map((f) => (
                <li key={f} className="min-w-0 truncate">
                  <Link to={paths.studio(task.projectId, { file: f })} className="font-mono text-xs" title="Im Studio öffnen">
                    {f}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {task.plannedFiles.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              Voraussichtlich betroffen: <span className="font-mono">{task.plannedFiles.join(', ')}</span>
            </p>
          )}
        </Block>
        <Block icon={Workflow} title="Details">
          <KeyValue
            columns={2}
            items={[
              { label: 'Art', value: metaOf(TASK_KIND, task.kind).label },
              { label: 'Rolle', value: <RoleBadge role={task.role} /> },
              { label: 'Herkunft', value: metaOf(TASK_SOURCE, task.source).label },
              { label: 'Versuche', value: `${task.attempts} von ${task.maxAttempts}` },
              { label: 'Modell', value: task.model ? <ModelBadge model={task.model} /> : <span className="text-muted">Noch keins</span> },
              { label: 'Erstellt', value: <RelativeTime ts={task.createdAt} /> },
              task.startedAt != null && { label: 'Gestartet', value: <RelativeTime ts={task.startedAt} /> },
              task.finishedAt != null && { label: 'Beendet', value: <RelativeTime ts={task.finishedAt} /> },
            ]}
          />
        </Block>
      </div>

      {!needsInput && <TaskNotes task={task} />}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <TaskActions task={task} variant="buttons" onEdit={onEdit} onChanged={onChanged} onDeleted={onDeleted} />
        <div className="flex flex-wrap items-center gap-1.5">
          {task.files.length > 0 && task.status !== 'running' && (
            <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setUndoOpen(true)}>
              Änderungen rückgängig machen
            </Button>
          )}
          <Link to={paths.project(task.projectId, { tab: 'agents' })} className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted no-underline hover:bg-surface-2 hover:text-text hover:no-underline">
            <History aria-hidden className="h-3.5 w-3.5" />
            Agentenverlauf
          </Link>
          {task.files[0] && (
            <Link to={paths.studio(task.projectId, { file: task.files[0] })} className="inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium text-muted no-underline hover:bg-surface-2 hover:text-text hover:no-underline">
              <Code aria-hidden className="h-3.5 w-3.5" />
              Im Studio öffnen
            </Link>
          )}
        </div>
      </div>

      <RestoreDialog open={undoOpen} onClose={() => setUndoOpen(false)} target={{ taskId: task.id }} label={task.title} mode="restore" gitAvailable={gitAvailable} />
    </div>
  );
}
