// Projekte (UI-SPEC §4 "Projects & agents"): all projects with progress, task counts, errors, last activity and
// the per-project work switch. "Neues Projekt" (or /projects?new=1) opens the CreateProjectDialog.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FolderKanban, FolderPlus, Search } from 'lucide-react';
import type { ProjectSummary } from '@shared/schemas';
import { Page } from '../../components/layout/Page';
import { Button, EmptyState, ErrorState, Input, LoadingState, Select, Switch } from '../../components/ui';
import { CreateProjectDialog } from '../../components/project';
import { useRpc } from '../../hooks/useRpc';
import { useStoredState } from '../../hooks/useStoredState';
import { ProjectCard } from './ProjectCard';

type ProjectSort = 'activity' | 'name' | 'progress' | 'attention';

const SORTS: Array<{ value: ProjectSort; label: string }> = [
  { value: 'activity', label: 'Zuletzt aktiv' },
  { value: 'attention', label: 'Braucht Aufmerksamkeit' },
  { value: 'progress', label: 'Fortschritt' },
  { value: 'name', label: 'Name' },
];

const PROJECT_EVENTS = ['project.updated', 'project.removed', 'task.updated', 'task.removed', 'error.raised', 'error.resolved', 'check.updated', 'approval.updated'] as const;

function attentionScore(p: ProjectSummary): number {
  return p.failedTasks * 3 + p.blockedTasks * 3 + p.openErrors * 2 + p.pendingApprovals * 2 + (p.pathMissing ? 5 : 0);
}

export function sortProjects(list: readonly ProjectSummary[], sort: ProjectSort): ProjectSummary[] {
  const copy = [...list];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
    case 'progress':
      return copy.sort((a, b) => b.progress - a.progress || a.name.localeCompare(b.name, 'de'));
    case 'attention':
      return copy.sort((a, b) => attentionScore(b) - attentionScore(a) || (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0));
    default:
      return copy.sort((a, b) => (b.lastActivityAt ?? b.updatedAt) - (a.lastActivityAt ?? a.updatedAt));
  }
}

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const createOpen = params.get('new') === '1';
  const [showArchived, setShowArchived] = useStoredState('projects.showArchived', false);
  const [sort, setSort] = useStoredState<ProjectSort>('projects.sort', 'activity');
  const [query, setQuery] = useState('');
  const projects = useRpc('projects.list', { includeArchived: showArchived }, { refetchOn: PROJECT_EVENTS, keepPreviousData: true });

  const setCreateOpen = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (projects.data ?? []).filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.technologies.some((t) => t.toLowerCase().includes(q)),
    );
    return sortProjects(list, sort);
  }, [projects.data, query, sort]);

  const total = projects.data?.length ?? 0;

  return (
    <Page
      title="Projekte"
      description="Alle Projekte mit Fortschritt, offenen Aufgaben und Fehlern. Die autonome Arbeit lässt sich für jedes Projekt einzeln ein- und ausschalten."
      actions={
        <Button variant="primary" icon={FolderPlus} onClick={() => setCreateOpen(true)}>
          Neues Projekt
        </Button>
      }
    >
      {projects.loading ? (
        <LoadingState label="Projekte werden geladen …" />
      ) : projects.error && !projects.data ? (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      ) : total === 0 && !showArchived ? (
        <EmptyState
          icon={FolderKanban}
          title="Noch kein Projekt"
          description="Ein Projekt beschreiben, mit einer Vorlage starten oder einen vorhandenen Ordner übernehmen – NOVA kümmert sich um Planung, Code und Tests."
          actions={
            <Button variant="primary" size="lg" icon={FolderPlus} onClick={() => setCreateOpen(true)}>
              Projekt erstellen
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Input
              type="search"
              icon={Search}
              size="sm"
              aria-label="Projekte durchsuchen"
              placeholder="Projekte durchsuchen …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              containerClassName="w-64"
            />
            <Select size="sm" aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as ProjectSort)} options={SORTS} containerClassName="w-52" />
            <Switch size="sm" checked={showArchived} onChange={setShowArchived} label="Archivierte anzeigen" className="ml-auto" />
          </div>
          {visible.length === 0 ? (
            <EmptyState
              compact
              icon={Search}
              title={query ? 'Kein Projekt gefunden' : 'Keine Projekte'}
              description={query ? `Kein Projekt passt zu „${query}“.` : 'Es gibt keine Projekte in dieser Ansicht.'}
            />
          ) : (
            <div className="@container">
              <ul className="grid grid-cols-1 gap-4 @2xl:grid-cols-2 @7xl:grid-cols-3" aria-label="Projekte">
                {visible.map((p) => (
                  <li key={p.id} className="@container flex min-w-0">
                    <ProjectCard project={p} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <CreateProjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Page>
  );
}
