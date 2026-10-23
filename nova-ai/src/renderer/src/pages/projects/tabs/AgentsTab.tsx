// Agenten of a project: all agent runs (active first) with role, task, status, model, live runtime, steps, tokens,
// last action, blocker and files, an expandable step feed per run, and the live activity of the project.
import { useMemo } from 'react';
import { Activity, Bot, ListTodo } from 'lucide-react';
import type { ProjectSummary } from '@shared/schemas';
import { Button, Card, EmptyState, ErrorState, LoadingState, SegmentedControl } from '../../../components/ui';
import { ActivityFeed, matchesRunFilter, RunCard, useLiveRuns, useLiveTasks, type RunFilter } from '../../../components/project';
import { useStoredState } from '../../../hooks/useStoredState';
import type { ProjectTab } from '../../../lib/paths';

export interface AgentsTabProps {
  project: ProjectSummary;
  onTab: (tab: ProjectTab) => void;
}

const FILTERS: Array<{ value: RunFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'active', label: 'Arbeitet' },
  { value: 'waiting', label: 'Wartet' },
  { value: 'ended', label: 'Beendet' },
];

export function AgentsTab({ project, onTab }: AgentsTabProps) {
  const runs = useLiveRuns({ projectId: project.id, limit: 300 });
  const tasks = useLiveTasks(project.id);
  const [filter, setFilter] = useStoredState<RunFilter>('agents.project.filter', 'all');

  const list = runs.runs ?? [];
  const counts = useMemo(() => {
    const c: Record<RunFilter, number> = { all: list.length, active: 0, waiting: 0, ended: 0 };
    for (const r of list) for (const f of ['active', 'waiting', 'ended'] as const) if (matchesRunFilter(r.status, f)) c[f]++;
    return c;
  }, [list]);
  const visible = list.filter((r) => matchesRunFilter(r.status, filter));
  // The newest running agent shows its steps right away.
  const firstRunning = visible.find((r) => r.status === 'running')?.id;

  return (
    <div className="@container">
      <div className="grid items-start gap-4 @5xl:grid-cols-3">
        <section aria-label="Agenten-Läufe" className="min-w-0 space-y-3 @5xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl label="Läufe filtern" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
            <p className="text-xs text-muted">Steuerung wirkt auf die Aufgabe des Agenten.</p>
          </div>
          {runs.loading ? (
            <LoadingState label="Agenten werden geladen …" />
          ) : runs.error && !runs.data ? (
            <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={Bot}
              title="Noch kein Agent hat an diesem Projekt gearbeitet"
              description="Sobald eine Aufgabe startet, erscheint hier der zuständige Agent mit Modell, Laufzeit und jedem einzelnen Schritt."
              actions={
                <Button icon={ListTodo} onClick={() => onTab('tasks')}>
                  Zu den Aufgaben
                </Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState compact icon={Bot} title="Keine Läufe in dieser Ansicht" description="Einen anderen Filter wählen, um weitere Läufe zu sehen." />
          ) : (
            <ul className="space-y-3" aria-label="Läufe">
              {visible.map((r) => (
                <li key={r.id}>
                  <RunCard run={r} task={tasks.byId.get(r.taskId)} defaultExpanded={r.id === firstRunning} onTaskChanged={tasks.patch} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <Card title="Live-Aktivität" icon={Activity} description="Neue Schritte und Nachrichten der Agenten erscheinen hier sofort." padding="sm">
          <ActivityFeed runs={runs.runs} tasksById={tasks.byId} projectId={project.id} maxHeight={640} />
        </Card>
      </div>
    </div>
  );
}
