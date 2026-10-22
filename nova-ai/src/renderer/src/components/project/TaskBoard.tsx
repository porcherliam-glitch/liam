// Task board used by the project "Aufgaben" tab and the global "Aufgaben" page: filters (project, status, role,
// text), sorting, status groups, expandable rows with controls, and the create/edit dialog.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronRight, GitFork, ListPlus, ListTodo, Search } from 'lucide-react';
import type { AgentRole, Task } from '@shared/schemas';
import { useMutation } from '../../hooks/useRpc';
import { useStoredState } from '../../hooks/useStoredState';
import { useProjects } from '../../hooks/useProjects';
import { cn } from '../../lib/cn';
import { AGENT_ROLE, metaOf, TASK_KIND } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Input, Select } from '../ui/Field';
import { SegmentedControl } from '../ui/SegmentedControl';
import { PrioritySelect } from '../common/PrioritySelect';
import { RelativeTime } from '../common/RelativeTime';
import { RoleBadge, TaskStatusBadge, VerificationBadge } from '../common/StatusBadges';
import { TaskActions } from './TaskActions';
import { TaskDetail } from './TaskDetail';
import { TaskFormDialog } from './TaskFormDialog';
import { useLiveTasks } from './useLiveData';
import {
  groupTasks,
  matchesStatusFilter,
  taskGroup,
  openDependencies,
  sortTasks,
  TASK_GROUP_LABEL,
  TASK_GROUP_ORDER,
  taskCapabilities,
  type TaskSort,
  type TaskStatusFilter,
} from './taskRules';

export interface TaskBoardProps {
  /** Limit to one project (project page). Omit for all projects with a project filter. */
  projectId?: string;
  /** Task to expand and scroll to (?task=…). */
  highlightTaskId?: string | null;
  /** Project has git (undo offers a commit). */
  gitAvailable?: boolean;
  /** Key prefix for remembered filters. */
  storageKey?: string;
}

const STATUS_FILTERS: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: 'open', label: 'Offen' },
  { value: 'attention', label: 'Aufmerksamkeit' },
  { value: 'active', label: 'In Arbeit' },
  { value: 'queued', label: 'Wartet' },
  { value: 'finished', label: 'Abgeschlossen' },
  { value: 'all', label: 'Alle' },
];

const SORTS: Array<{ value: TaskSort; label: string }> = [
  { value: 'priority', label: 'Nach Priorität' },
  { value: 'updated', label: 'Zuletzt geändert' },
  { value: 'created', label: 'Neueste zuerst' },
];

const ROLES: AgentRole[] = ['planner', 'coder', 'tester', 'reviewer'];

export function TaskBoard({ projectId, highlightTaskId, gitAvailable, storageKey = projectId ? 'tasks.project' : 'tasks.global' }: TaskBoardProps) {
  const tasks = useLiveTasks(projectId);
  const projects = useProjects();
  const projectNames = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.name])), [projects.data]);
  const gitByProject = useMemo(() => new Map((projects.data ?? []).map((p) => [p.id, p.gitAvailable])), [projects.data]);

  const [status, setStatus] = useStoredState<TaskStatusFilter>(`${storageKey}.status`, 'open');
  const [sort, setSort] = useStoredState<TaskSort>(`${storageKey}.sort`, 'priority');
  const [role, setRole] = useStoredState<AgentRole | ''>(`${storageKey}.role`, '');
  const [projectFilter, setProjectFilter] = useStoredState<string>(`${storageKey}.project`, '');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(highlightTaskId ? [highlightTaskId] : []));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(['finished']));
  const [dialog, setDialog] = useState<{ task: Task | null } | null>(null);
  const setPriority = useMutation('tasks.setPriority', { onSuccess: (t) => tasks.patch(t) });

  // Highlight from the URL (?task=…): expand it, keep it visible and scroll to it.
  const [focusId, setFocusId] = useState<string | null>(highlightTaskId ?? null);

  const all = tasks.data ?? [];
  const effectiveProject = projectId ?? projectFilter;
  const scoped = useMemo(() => all.filter((t) => !effectiveProject || t.projectId === effectiveProject), [all, effectiveProject]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortTasks(
      scoped.filter((t) => (!role || t.role === role) && (!q || t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)) && (matchesStatusFilter(t.status, status) || t.id === focusId)),
      sort,
    );
  }, [scoped, role, query, status, sort, focusId]);
  const counts = useMemo(() => {
    const c: Record<TaskStatusFilter, number> = { all: scoped.length, open: 0, attention: 0, active: 0, queued: 0, finished: 0 };
    for (const t of scoped) for (const f of ['open', 'attention', 'active', 'queued', 'finished'] as const) if (matchesStatusFilter(t.status, f)) c[f]++;
    return c;
  }, [scoped]);

  // Make the focused task visible once: open its group, then scroll to it.
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const openedGroupFor = useRef<string | null>(null);
  const scrolledTo = useRef<string | null>(null);
  const focusTask = focusId ? tasks.byId.get(focusId) : undefined;
  useEffect(() => {
    if (!highlightTaskId) return;
    setExpanded((s) => new Set(s).add(highlightTaskId));
    openedGroupFor.current = null;
    scrolledTo.current = null;
    setFocusId(highlightTaskId);
  }, [highlightTaskId]);
  useEffect(() => {
    if (!focusTask || openedGroupFor.current === focusTask.id) return;
    openedGroupFor.current = focusTask.id;
    const group = taskGroup(focusTask.status);
    setCollapsedGroups((s) => {
      if (!s.has(group)) return s;
      const next = new Set(s);
      next.delete(group);
      return next;
    });
  }, [focusTask]);
  useEffect(() => {
    if (!focusId || scrolledTo.current === focusId) return;
    const el = rowRefs.current.get(focusId);
    if (!el) return;
    scrolledTo.current = focusId;
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectTask = (id: string) => {
    setExpanded((s) => new Set(s).add(id));
    openedGroupFor.current = null;
    scrolledTo.current = null;
    setFocusId(id);
  };

  const grouped = status === 'all' || status === 'open';
  const groups = groupTasks(filtered);
  const hasFilters = !!(role || query.trim() || (!projectId && projectFilter));

  const renderRow = (t: Task) => (
    <TaskRow
      key={t.id}
      task={t}
      byId={tasks.byId}
      expanded={expanded.has(t.id)}
      highlighted={t.id === focusId}
      onToggle={() => toggle(t.id)}
      projectName={projectId ? undefined : projectNames.get(t.projectId)}
      onPriority={(p) => void setPriority.run({ id: t.id, priority: p })}
      onEdit={(task) => setDialog({ task })}
      onChanged={tasks.patch}
      onDeleted={tasks.remove}
      onSelectTask={selectTask}
      gitAvailable={gitAvailable ?? gitByProject.get(t.projectId) ?? false}
      rowRef={(el) => {
        if (el) rowRefs.current.set(t.id, el);
        else rowRefs.current.delete(t.id);
      }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <SegmentedControl
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label, count: counts[f.value] }))}
        />
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <Button variant="primary" icon={ListPlus} onClick={() => setDialog({ task: null })}>
            Aufgabe anlegen
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input
          type="search"
          icon={Search}
          size="sm"
          aria-label="Aufgaben durchsuchen"
          placeholder="Aufgaben durchsuchen …"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          containerClassName="w-60"
        />
        {!projectId && (
          <Select
            size="sm"
            aria-label="Projekt"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Alle Projekte"
            containerClassName="w-48"
          />
        )}
        <Select
          size="sm"
          aria-label="Rolle"
          value={role}
          onChange={(e) => setRole(e.target.value as AgentRole | '')}
          options={ROLES.map((r) => ({ value: r, label: AGENT_ROLE[r].label }))}
          placeholder="Alle Rollen"
          containerClassName="w-40"
        />
        <Select size="sm" aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as TaskSort)} options={SORTS} containerClassName="w-44" />
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRole('');
              setQuery('');
              if (!projectId) setProjectFilter('');
            }}
          >
            Filter zurücksetzen
          </Button>
        )}
      </div>

      {tasks.loading ? (
        <LoadingState label="Aufgaben werden geladen …" />
      ) : tasks.error && !tasks.data ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : scoped.length === 0 ? (
        <EmptyState
          icon={ListTodo}
          title="Noch keine Aufgaben"
          description={projectId ? 'Eine Aufgabe anlegen oder NOVA ein Ziel in Aufgaben zerlegen lassen („Ziel planen“ in der Übersicht).' : 'Sobald Projekte Aufgaben haben, erscheinen sie hier.'}
          actions={
            <Button variant="primary" icon={ListPlus} onClick={() => setDialog({ task: null })}>
              Aufgabe anlegen
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState compact icon={Search} title="Keine passenden Aufgaben" description="Für diese Filter gibt es keine Aufgaben. Andere Filter wählen oder zurücksetzen." />
      ) : grouped ? (
        <div className="space-y-5">
          {TASK_GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => {
            const collapsed = collapsedGroups.has(g);
            const label = TASK_GROUP_LABEL[g];
            return (
              <section key={g} aria-label={label.title}>
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  onClick={() =>
                    setCollapsedGroups((s) => {
                      const next = new Set(s);
                      if (next.has(g)) next.delete(g);
                      else next.add(g);
                      return next;
                    })
                  }
                  className="mb-2 flex w-full items-center gap-2 rounded-md text-left"
                >
                  {collapsed ? <ChevronRight aria-hidden className="h-4 w-4 text-muted" /> : <ChevronDown aria-hidden className="h-4 w-4 text-muted" />}
                  <h3 className="text-sm font-semibold">{label.title}</h3>
                  <span className="rounded-full bg-surface-3 px-2 text-xs leading-5 text-muted tabular-nums">{groups[g].length}</span>
                  <span className="hidden truncate text-xs text-muted md:inline">{label.description}</span>
                </button>
                {!collapsed && (
                  <ul className="space-y-2" aria-label={`${label.title}: Aufgaben`}>
                    {groups[g].map(renderRow)}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Aufgaben">
          {filtered.map(renderRow)}
        </ul>
      )}

      <TaskFormDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        projectId={projectId}
        defaultProjectId={projectFilter || undefined}
        task={dialog?.task ?? null}
        onSaved={(t) => {
          tasks.patch(t);
          selectTask(t.id);
        }}
      />
    </div>
  );
}

interface TaskRowProps {
  task: Task;
  byId: ReadonlyMap<string, Task>;
  expanded: boolean;
  highlighted: boolean;
  onToggle: () => void;
  projectName?: string;
  onPriority: (p: 0 | 1 | 2 | 3) => void;
  onEdit: (task: Task) => void;
  onChanged: (task: Task) => void;
  onDeleted: (id: string) => void;
  onSelectTask: (id: string) => void;
  gitAvailable: boolean;
  rowRef: (el: HTMLLIElement | null) => void;
}

function TaskRow({ task, byId, expanded, highlighted, onToggle, projectName, onPriority, onEdit, onChanged, onDeleted, onSelectTask, gitAvailable, rowRef }: TaskRowProps) {
  const caps = taskCapabilities(task);
  const openDeps = openDependencies(task, byId);
  const detailId = `task-detail-${task.id}`;
  return (
    <li
      ref={rowRef}
      data-task-id={task.id}
      className={cn(
        'rounded-xl border bg-surface transition-colors duration-150',
        highlighted ? 'border-violet/60 ring-1 ring-violet/30' : 'border-border',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          className="flex min-w-0 flex-1 basis-80 items-start gap-2.5 rounded-md text-left"
        >
          <ChevronRight aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform duration-150', expanded && 'rotate-90')} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              <span className="min-w-0 truncate text-[13px] font-medium text-text">{task.title}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <RoleBadge role={task.role} />
              <span>{metaOf(TASK_KIND, task.kind).label}</span>
              {task.status !== 'queued' && task.status !== 'running' && <VerificationBadge verification={task.verification} />}
              {task.dependsOn.length > 0 && (
                <span className="inline-flex items-center gap-1" title={openDeps.length ? 'Wartet auf andere Aufgaben' : 'Alle Abhängigkeiten erledigt'}>
                  <GitFork aria-hidden className="h-3 w-3" />
                  {openDeps.length ? `wartet auf ${openDeps.length} von ${task.dependsOn.length}` : `${task.dependsOn.length} erledigt`}
                </span>
              )}
              {task.startRequested && task.status === 'queued' && (
                <Badge tone="blue" title="Wurde von Hand gestartet und läuft, sobald ein Platz frei ist">
                  von Hand gestartet
                </Badge>
              )}
              {projectName && <span className="truncate text-subtle">· {projectName}</span>}
              <RelativeTime ts={task.updatedAt} className="text-subtle" />
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <PrioritySelect size="sm" value={task.priority} disabled={!caps.priority} onChange={onPriority} />
          <TaskActions task={task} onEdit={onEdit} onChanged={onChanged} onDeleted={onDeleted} />
        </div>
      </div>
      {task.blocker && !expanded && ['blocked', 'failed', 'waiting_approval', 'interrupted'].includes(task.status) && (
        <p className="truncate border-t border-border/60 px-3 py-1.5 pl-9 text-xs text-muted" title={task.blocker}>
          {task.blocker}
        </p>
      )}
      {expanded && (
        <div id={detailId} className="border-t border-border px-4 py-3.5">
          <TaskDetail task={task} byId={byId} onEdit={onEdit} onChanged={onChanged} onDeleted={onDeleted} onSelectTask={onSelectTask} gitAvailable={gitAvailable} />
          {projectName && (
            <p className="mt-3 text-xs text-muted">
              Projekt: <Link to={paths.project(task.projectId, { tab: 'tasks', task: task.id })}>{projectName}</Link>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
