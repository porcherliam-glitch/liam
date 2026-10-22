// Agenten (UI-SPEC §4): every agent run across all projects (active first) with role, task, project, status, model,
// live runtime, last action, blocker and files; task controls (pause/resume/stop/priority); the agent roles
// (agents.roles) and a live activity feed.
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { Activity, Bot, Cpu, FolderKanban, Hourglass, ListTodo, Puzzle } from 'lucide-react';
import type { AgentRole } from '@shared/schemas';
import { Page } from '../../components/layout/Page';
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState, SegmentedControl, Select, Stat } from '../../components/ui';
import { ActivityFeed, matchesRunFilter, RunCard, useLiveRuns, useLiveTasks, type RunFilter } from '../../components/project';
import { useRpc } from '../../hooks/useRpc';
import { useProjectNames, useProjects } from '../../hooks/useProjects';
import { useStoredState } from '../../hooks/useStoredState';
import { cn } from '../../lib/cn';
import { AGENT_ROLE, metaOf, toneClasses } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { useDaemonStore } from '../../stores/daemon';

const FILTERS: Array<{ value: RunFilter; label: string }> = [
  { value: 'all', label: 'Alle' },
  { value: 'active', label: 'Arbeitet' },
  { value: 'waiting', label: 'Wartet' },
  { value: 'ended', label: 'Beendet' },
];

const ROLE_ORDER: AgentRole[] = ['planner', 'coder', 'tester', 'reviewer'];

export default function AgentsPage() {
  const navigate = useNavigate();
  const runs = useLiveRuns({ limit: 500 });
  const tasks = useLiveTasks();
  const names = useProjectNames();
  const projects = useProjects();
  const work = useDaemonStore((s) => s.work);
  const [filter, setFilter] = useStoredState<RunFilter>('agents.filter', 'all');
  const [projectFilter, setProjectFilter] = useStoredState<string>('agents.project', '');

  const all = runs.runs ?? [];
  const scoped = useMemo(() => all.filter((r) => !projectFilter || r.projectId === projectFilter), [all, projectFilter]);
  const counts = useMemo(() => {
    const c: Record<RunFilter, number> = { all: scoped.length, active: 0, waiting: 0, ended: 0 };
    for (const r of scoped) for (const f of ['active', 'waiting', 'ended'] as const) if (matchesRunFilter(r.status, f)) c[f]++;
    return c;
  }, [scoped]);
  const visible = scoped.filter((r) => matchesRunFilter(r.status, filter));
  const waitingApproval = all.filter((r) => r.status === 'waiting_approval').length;
  const activeCount = all.filter((r) => r.status === 'running').length;

  return (
    <Page
      title="Agenten"
      description="Was die Agenten gerade tun – über alle Projekte. Pausieren, Fortsetzen und Stoppen wirken auf die jeweilige Aufgabe."
    >
      <div className="@container space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat
            label="Arbeiten gerade"
            icon={Bot}
            tone="blue"
            value={activeCount}
            sub={
              work
                ? work.allowedConcurrency < work.configuredConcurrency
                  ? `Erlaubt: ${work.allowedConcurrency} von ${work.configuredConcurrency} (wegen Auslastung)`
                  : `Erlaubt: ${work.allowedConcurrency} gleichzeitig`
                : undefined
            }
          />
          <Stat label="Warten auf Freigabe" icon={Hourglass} tone="warning" value={waitingApproval} sub={waitingApproval ? 'Unter „Freigaben“ entscheiden' : 'Nichts offen'} to={waitingApproval ? paths.approvals : undefined} />
          <Stat label="Aufgaben in der Warteschlange" icon={ListTodo} tone="violet" value={work?.queuedTasks ?? '–'} sub={work?.idleReason ?? (activeCount ? 'Die Agenten arbeiten.' : undefined)} to={paths.tasks} />
        </div>

        <div className="grid items-start gap-4 @6xl:grid-cols-3">
          <section aria-label="Agenten-Läufe" className="min-w-0 space-y-3 @6xl:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl label="Läufe filtern" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ ...f, count: counts[f.value] }))} />
              <Select
                size="sm"
                aria-label="Projekt"
                value={projectFilter}
                onChange={(e) => setProjectFilter(e.target.value)}
                options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Alle Projekte"
                containerClassName="w-52"
              />
            </div>
            {runs.loading ? (
              <LoadingState label="Agenten werden geladen …" />
            ) : runs.error && !runs.data ? (
              <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />
            ) : all.length === 0 ? (
              <EmptyState
                icon={Bot}
                title="Noch keine Agenten-Läufe"
                description="Sobald NOVA an einer Aufgabe arbeitet, erscheint hier der zuständige Agent – mit Modell, Laufzeit und jedem Schritt."
                actions={
                  <Button variant="primary" icon={FolderKanban} onClick={() => navigate(paths.projects)}>
                    Zu den Projekten
                  </Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyState compact icon={Bot} title="Keine Läufe in dieser Ansicht" description="Einen anderen Filter wählen, um weitere Läufe zu sehen." />
            ) : (
              <ul className="space-y-3" aria-label="Läufe">
                {visible.map((r) => (
                  <li key={r.id}>
                    <RunCard run={r} task={tasks.byId.get(r.taskId)} projectName={names.get(r.projectId) ?? 'Unbekanntes Projekt'} onTaskChanged={tasks.patch} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="min-w-0 space-y-4">
            <Card title="Live-Aktivität" icon={Activity} description="Schritte, Fragen und Hinweise aller Agenten – neueste oben." padding="sm">
              <ActivityFeed runs={runs.runs} tasksById={tasks.byId} projectNames={names} maxHeight={480} />
            </Card>
            <RolesCard />
          </div>
        </div>
      </div>
    </Page>
  );
}

function RolesCard() {
  const roles = useRpc('agents.roles');
  const list = useMemo(() => [...(roles.data ?? [])].sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)), [roles.data]);
  return (
    <Card title="Rollen der Agenten" icon={Puzzle} description="Jede Rolle ist ein austauschbares Modul mit festen Werkzeugen." padding="sm">
      {roles.loading ? (
        <LoadingState compact />
      ) : roles.error && !roles.data ? (
        <ErrorState compact error={roles.error} onRetry={() => void roles.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact icon={Puzzle} title="Keine Rollen gefunden" description="Der Hintergrunddienst meldet keine Agentenrollen." />
      ) : (
        <ul className="space-y-2.5" aria-label="Rollen">
          {list.map((r) => {
            const meta = metaOf(AGENT_ROLE, r.role);
            return (
              <li key={r.role} className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md', toneClasses[meta.tone].soft)}>
                    <meta.icon aria-hidden className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-[13px] font-semibold text-text">{r.name}</h3>
                  <span className="ml-auto inline-flex items-center gap-1 font-mono text-[11px] text-subtle" title="Modul, das diese Rolle umsetzt">
                    <Cpu aria-hidden className="h-3 w-3" />
                    {r.moduleId}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted">{r.description}</p>
                {r.tools.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1" aria-label={`Werkzeuge: ${r.name}`}>
                    {r.tools.map((t) => (
                      <li key={t}>
                        <Badge className="font-mono">{t}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
