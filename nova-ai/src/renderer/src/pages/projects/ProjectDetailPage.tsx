// Project detail (UI-SPEC §4): header with path, progress and work control, plus the tabs
// Übersicht · Aufgaben · Agenten · Änderungen · Prüfungen · Gedächtnis · Fehler (?tab=…, ?task=… highlights a task).
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Bot, Brain, CircleAlert, Code, FileDiff, FlaskConical, FolderOpen, FolderSearch, FolderX, LayoutDashboard, ListTodo } from 'lucide-react';
import type { ProjectSummary } from '@shared/schemas';
import type { AnyNovaEvent } from '@shared/events';
import { Page } from '../../components/layout/Page';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, ProgressBar, StatusBadge, TabPanel, Tabs, type TabItem } from '../../components/ui';
import { ProjectWorkToggle } from '../../components/project';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { getBridge, isRpcError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { metaOf, PROJECT_KIND, PROJECT_STATUS, toneClasses } from '../../lib/labels';
import { paths, type ProjectTab } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { progressCounts } from './ProjectCard';
import { OverviewTab } from './tabs/OverviewTab';
import { TasksTab } from './tabs/TasksTab';
import { AgentsTab } from './tabs/AgentsTab';
import { ChangesTab } from './tabs/ChangesTab';
import { ChecksTab } from './tabs/ChecksTab';
import { MemoryTab } from './tabs/MemoryTab';
import { ErrorsTab } from './tabs/ErrorsTab';

const TABS: ProjectTab[] = ['overview', 'tasks', 'agents', 'changes', 'checks', 'memory', 'errors'];

function parseTab(value: string | null): ProjectTab {
  return TABS.includes(value as ProjectTab) ? (value as ProjectTab) : 'overview';
}

const PROJECT_EVENTS = ['project.updated', 'project.removed', 'task.updated', 'task.removed', 'check.updated', 'error.raised', 'error.resolved', 'approval.updated'] as const;

function relatesTo(projectId: string) {
  return (e: AnyNovaEvent): boolean => {
    switch (e.type) {
      case 'project.updated':
      case 'project.removed':
        return e.payload.id === projectId;
      case 'task.updated':
      case 'task.removed':
      case 'check.updated':
        return e.payload.projectId === projectId;
      case 'error.raised':
      case 'approval.updated':
        return e.payload.projectId === projectId;
      default:
        return true;
    }
  };
}

export default function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const highlightTask = params.get('task');
  const navigate = useNavigate();
  const project = useRpc('projects.get', projectId ? { id: projectId } : null, { refetchOn: PROJECT_EVENTS, eventFilter: relatesTo(projectId) });

  const setTab = (next: ProjectTab) => {
    const sp = new URLSearchParams();
    if (next !== 'overview') sp.set('tab', next);
    setParams(sp, { replace: true });
  };

  const back = { to: paths.projects, label: 'Projekte' };

  if (project.loading) {
    return (
      <Page title="Projekt" back={back}>
        <LoadingState label="Projekt wird geladen …" />
      </Page>
    );
  }
  if (!project.data) {
    const missing = isRpcError(project.error, 'NOT_FOUND');
    return (
      <Page title={missing ? 'Projekt nicht gefunden' : 'Projekt'} back={back}>
        {missing ? (
          <EmptyState
            icon={FolderX}
            title="Dieses Projekt gibt es nicht (mehr)"
            description="Es wurde vielleicht aus NOVA entfernt. Die Projektdateien selbst sind davon nicht betroffen."
            actions={<Button onClick={() => navigate(paths.projects)}>Zur Projektliste</Button>}
          />
        ) : (
          <ErrorState error={project.error} onRetry={() => void project.refetch()} />
        )}
      </Page>
    );
  }

  const p = project.data;
  const items: Array<TabItem<ProjectTab>> = [
    { id: 'overview', label: 'Übersicht', icon: LayoutDashboard },
    { id: 'tasks', label: 'Aufgaben', icon: ListTodo, count: p.openTasks },
    { id: 'agents', label: 'Agenten', icon: Bot, count: p.runningTasks || undefined },
    { id: 'changes', label: 'Änderungen', icon: FileDiff },
    { id: 'checks', label: 'Prüfungen', icon: FlaskConical },
    { id: 'memory', label: 'Gedächtnis', icon: Brain },
    { id: 'errors', label: 'Fehler', icon: CircleAlert, count: p.openErrors, countTone: 'danger' },
  ];

  return (
    <Page title={p.name} back={back}>
      <div className="space-y-4">
        <ProjectHeader project={p} onChanged={() => void project.refetch()} />
        <Tabs label="Projektbereiche" idBase="project" items={items} value={tab} onChange={setTab} />
        <TabPanel idBase="project" id={tab}>
          {tab === 'overview' && <OverviewTab project={p} onTab={setTab} />}
          {tab === 'tasks' && <TasksTab project={p} highlightTaskId={highlightTask} />}
          {tab === 'agents' && <AgentsTab project={p} />}
          {tab === 'changes' && <ChangesTab project={p} />}
          {tab === 'checks' && <ChecksTab project={p} onTab={setTab} />}
          {tab === 'memory' && <MemoryTab project={p} />}
          {tab === 'errors' && <ErrorsTab project={p} />}
        </TabPanel>
      </div>
    </Page>
  );
}

function ProjectHeader({ project, onChanged }: { project: ProjectSummary; onChanged: () => void }) {
  const navigate = useNavigate();
  const kind = metaOf(PROJECT_KIND, project.kind);
  const { done, total } = progressCounts(project);
  const relink = useMutation('projects.update', { successToast: 'Projektordner neu verknüpft', onSuccess: onChanged });

  const openFolder = async () => {
    const ok = await getBridge()?.app.openPath(project.path).catch(() => false);
    if (!ok) toast.error('Ordner konnte nicht geöffnet werden', 'Der Projektordner existiert nicht oder ist nicht erreichbar.');
  };
  const pickNewFolder = async () => {
    const picked = await getBridge()
      ?.app.selectDirectory({ title: `Neuen Ordner für „${project.name}“ auswählen`, defaultPath: project.path })
      .catch(() => null);
    if (picked) void relink.run({ id: project.id, path: picked });
  };

  return (
    <section aria-label="Projektkopf" className="rounded-xl border border-border bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        <span className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', toneClasses[kind.tone].soft)}>
          <kind.icon aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-lg font-semibold">{project.name}</h1>
            <StatusBadge meta={kind} />
            {project.status === 'archived' && <StatusBadge meta={PROJECT_STATUS.archived} />}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate font-mono text-xs text-muted" title={project.path}>
              {project.path}
            </span>
            <IconButton icon={FolderOpen} label="Projektordner im Explorer öffnen" size="sm" onClick={() => void openFolder()} disabled={project.pathMissing} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {project.status === 'active' && <ProjectWorkToggle project={project} showPause />}
          <Button icon={Code} onClick={() => navigate(paths.studio(project.id))}>
            Studio öffnen
          </Button>
        </div>
      </div>
      {project.pathMissing && (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger-fg">
          <FolderX aria-hidden className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1">Der Projektordner wurde nicht gefunden – vielleicht wurde er verschoben oder umbenannt. NOVA arbeitet an diesem Projekt erst weiter, wenn der Ordner wieder verknüpft ist.</span>
          <Button size="sm" icon={FolderSearch} loading={relink.loading} onClick={() => void pickNewFolder()}>
            Ordner neu verknüpfen
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        <ProgressBar value={project.progress} label="Fortschritt des Projekts" showValue className="min-w-48 flex-1" />
        <span className="text-xs text-muted tabular-nums">{total ? `${done} von ${total} Aufgaben erledigt` : 'Noch keine Aufgaben'}</span>
      </div>
    </section>
  );
}
