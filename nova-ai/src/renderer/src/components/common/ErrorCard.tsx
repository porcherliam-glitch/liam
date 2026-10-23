import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bot, ChevronDown, CircleCheck, ClipboardList, Code, FlaskConical, History, ListChecks, ShieldAlert, ShieldCheck, ShieldQuestion, UserRound, Workflow, Wrench, type LucideIcon } from 'lucide-react';
import type { ErrorSeverity, NovaErrorInfo } from '@shared/errors';
import { cn } from '../../lib/cn';
import { ERROR_SEVERITY, metaOf } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { Button } from '../ui/Button';
import { CodeBlock } from '../ui/CodeBlock';
import { SeverityBadge } from './StatusBadges';
import { RelativeTime } from './RelativeTime';
import { toast } from '../../stores/toasts';

export interface ErrorCardProps {
  error: NovaErrorInfo;
  /** Short version (title, what happened, what to do) with a "Details" toggle. */
  compact?: boolean;
  /** Name of the affected project (shown as link). */
  projectName?: string;
  /** Title of the affected task; loaded via tasks.get when omitted. */
  taskTitle?: string;
  /** Called after errors.resolve succeeded. */
  onResolved?: (id: string) => void;
  className?: string;
}

// Literal class names so Tailwind generates them.
const SEVERITY_BORDER: Record<ErrorSeverity, string> = {
  warning: 'border-l-warning',
  retryable: 'border-l-info',
  blocker: 'border-l-danger',
  critical: 'border-l-danger',
};

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h4 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {title}
      </h4>
      <div className="text-[13px] leading-relaxed text-text">{children}</div>
    </div>
  );
}

/**
 * User-facing error (MASTERPROMPT §19): what happened, affected task, what was tried, is the project safe,
 * can NOVA fix it, what to do – plus collapsible technical details and "Als erledigt markieren".
 * @example <ErrorCard error={err} compact projectName={names.get(err.projectId!)} />
 */
export function ErrorCard({ error, compact = false, projectName, taskTitle, onResolved, className }: ErrorCardProps) {
  const [expanded, setExpanded] = useState(!compact);
  const [showDetails, setShowDetails] = useState(false);
  const severity = metaOf(ERROR_SEVERITY, error.severity);
  const resolved = error.resolvedAt != null;

  const task = useRpc('tasks.get', expanded && error.taskId && !taskTitle ? { id: error.taskId } : null);
  const resolve = useMutation('errors.resolve', {
    successToast: 'Als erledigt markiert',
    onSuccess: () => onResolved?.(error.id),
  });

  const taskName = taskTitle ?? task.data?.title;
  const taskLink = error.taskId && error.projectId ? paths.project(error.projectId, { tab: 'tasks', task: error.taskId }) : null;
  const navigate = useNavigate();
  const createFix = useMutation('tasks.createFix', {
    onSuccess: (task) =>
      toast.show({
        tone: 'success',
        title: 'Reparatur-Aufgabe angelegt',
        message: task.title,
        action: { label: 'Aufgabe öffnen', onClick: () => navigate(paths.project(task.projectId, { tab: 'tasks', task: task.id })) },
      }),
  });
  const related = error.related;
  const jumps: Array<{ to: string; label: string; icon: LucideIcon }> = [];
  if (error.projectId && related?.file) jumps.push({ to: paths.studio(error.projectId, { file: related.file, line: related.line }), label: `${related.file}${related.line != null ? `:${related.line}` : ''} im Studio öffnen`, icon: Code });
  if (error.projectId && related?.checkRunId) jumps.push({ to: paths.project(error.projectId, { tab: 'checks' }), label: 'Prüfung ansehen', icon: FlaskConical });
  if (related?.approvalId) jumps.push({ to: paths.approvals, label: 'Zur Freigabe', icon: ShieldQuestion });
  if (error.projectId && related?.runId) jumps.push({ to: paths.project(error.projectId, { tab: 'agents' }), label: 'Agentenverlauf', icon: Workflow });

  return (
    <article
      aria-label={`${severity.label}: ${error.title}`}
      className={cn('min-w-0 rounded-xl border border-l-[3px] border-border bg-surface', SEVERITY_BORDER[error.severity] ?? 'border-l-border', resolved && 'opacity-70', className)}
    >
      <header className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={error.severity} />
            {resolved && (
              <span className="inline-flex items-center gap-1 text-[11px] text-success-fg">
                <CircleCheck aria-hidden className="h-3 w-3" /> Erledigt <RelativeTime ts={error.resolvedAt} />
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-sm font-semibold text-text">{error.title}</h3>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-[11px] text-muted">
          <RelativeTime ts={error.createdAt} />
          {projectName && error.projectId && (
            <Link to={paths.project(error.projectId, { tab: 'errors' })} className="max-w-48 truncate">
              {projectName}
            </Link>
          )}
        </div>
      </header>

      {!expanded ? (
        <div className="px-4 pt-1.5 pb-3">
          <p className="line-clamp-2 text-[13px] text-muted">{error.whatHappened}</p>
          {error.userAction && (
            <p className="mt-1.5 line-clamp-2 text-[13px] text-text">
              <span className="font-medium text-warning-fg">Zu tun: </span>
              {error.userAction}
            </p>
          )}
          <button type="button" onClick={() => setExpanded(true)} className="mt-2 inline-flex items-center gap-1 rounded text-xs font-medium text-blue-fg hover:underline" aria-expanded={false}>
            Mehr anzeigen <ChevronDown aria-hidden className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-3.5 px-4 pt-2.5 pb-3.5">
          <div className="grid gap-x-6 gap-y-3.5 md:grid-cols-2">
            <Section icon={ClipboardList} title="Was ist passiert?">
              {error.whatHappened}
            </Section>
            <Section icon={ListChecks} title="Betroffene Aufgabe">
              {error.taskId ? (
                taskLink ? (
                  <Link to={taskLink}>{taskName ?? (task.error ? 'Aufgabe nicht mehr vorhanden' : task.loading ? 'Wird geladen …' : 'Aufgabe öffnen')}</Link>
                ) : (
                  (taskName ?? 'Aufgabe')
                )
              ) : (
                <span className="text-muted">Keine bestimmte Aufgabe – betrifft {error.projectId ? 'das ganze Projekt' : 'NOVA allgemein'}.</span>
              )}
            </Section>
            <Section icon={History} title="Bereits versucht">
              {error.attempted.length ? (
                <ul className="list-disc space-y-0.5 pl-4 marker:text-subtle">
                  {error.attempted.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">Noch nichts – NOVA hat das Problem gerade erst bemerkt.</span>
              )}
            </Section>
            <Section icon={error.projectSafe ? ShieldCheck : ShieldAlert} title="Ist das Projekt sicher?">
              {error.projectSafe ? (
                <span className="text-success-fg">Ja – die Projektdateien sind in einem stimmigen Zustand.</span>
              ) : (
                <span className="text-danger-fg">Möglicherweise nicht – bitte keine weiteren Änderungen starten, bis das Problem gelöst ist.</span>
              )}
            </Section>
            <Section icon={Bot} title="Kann NOVA es selbst beheben?">
              {error.autoFixable ? (
                <span>Ja – NOVA kümmert sich selbstständig darum.</span>
              ) : (
                <span>Nein – hier wird eine Entscheidung oder Hilfe gebraucht.</span>
              )}
            </Section>
            <Section icon={UserRound} title="Was ist zu tun?">
              {error.userAction ? <span className="font-medium">{error.userAction}</span> : <span className="text-muted">Nichts – es ist keine Aktion nötig.</span>}
            </Section>
          </div>

          {error.details && (
            <div>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-expanded={showDetails}
                className="inline-flex items-center gap-1 rounded text-xs font-medium text-muted hover:text-text"
              >
                <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', !showDetails && '-rotate-90')} />
                Technische Details
                <span className="font-mono text-subtle">({error.code})</span>
              </button>
              {showDetails && <CodeBlock code={error.details} className="mt-2" maxHeight={220} />}
            </div>
          )}

          {jumps.length > 0 && (
            <nav aria-label="Zur Fehlerstelle springen" className="flex flex-wrap gap-x-4 gap-y-1">
              {jumps.map((j) => (
                <Link key={j.to + j.label} to={j.to} className="inline-flex items-center gap-1 text-xs font-medium">
                  <j.icon aria-hidden className="h-3.5 w-3.5" />
                  {j.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
            {compact ? (
              <button type="button" onClick={() => setExpanded(false)} className="rounded text-xs font-medium text-blue-fg hover:underline" aria-expanded>
                Weniger anzeigen
              </button>
            ) : (
              <span />
            )}
            {!resolved && (
              <div className="flex flex-wrap items-center gap-2">
                {error.projectId && !error.autoFixable && (
                  <Button size="sm" variant="subtle" icon={Wrench} loading={createFix.loading} onClick={() => createFix.run({ projectId: error.projectId!, errorId: error.id })}>
                    Reparatur-Aufgabe anlegen
                  </Button>
                )}
                <Button size="sm" icon={CircleCheck} loading={resolve.loading} onClick={() => resolve.run({ id: error.id })}>
                  Als erledigt markieren
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
