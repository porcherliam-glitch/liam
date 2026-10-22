// "Aufgabe anlegen" / "Aufgabe bearbeiten" dialog: title, description, kind/role, priority, dependencies
// (multi-select without cycles) and acceptance criteria. tasks.create / tasks.update.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ClipboardList, Info, Pencil, Search } from 'lucide-react';
import type { AgentRole, Task, TaskKind } from '@shared/schemas';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { useProjects } from '../../hooks/useProjects';
import { validationIssues } from '../../lib/api';
import { cn } from '../../lib/cn';
import { AGENT_ROLE, TASK_KIND } from '../../lib/labels';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { PrioritySelect } from '../common/PrioritySelect';
import { TaskStatusBadge } from '../common/StatusBadges';
import { dependentsClosure } from './taskRules';

export interface TaskFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fixed project (project page). Without it the dialog shows a project selector (global task page). */
  projectId?: string;
  /** Preselected project for the selector (e.g. the current filter). */
  defaultProjectId?: string;
  /** Task to edit; omit to create a new one. */
  task?: Task | null;
  /** Called with the created/updated task. */
  onSaved?: (task: Task) => void;
}

const KIND_ORDER: TaskKind[] = ['code', 'fix', 'test', 'review', 'build', 'plan', 'custom'];
const ROLE_ORDER: AgentRole[] = ['coder', 'tester', 'reviewer', 'planner'];

interface FormState {
  projectId: string;
  title: string;
  description: string;
  kind: TaskKind;
  role: AgentRole | '';
  priority: 0 | 1 | 2 | 3;
  dependsOn: string[];
  acceptance: string;
  maxAttempts: string;
}

function initialState(task: Task | null | undefined, projectId: string | undefined): FormState {
  return {
    projectId: task?.projectId ?? projectId ?? '',
    title: task?.title ?? '',
    description: task?.description ?? '',
    kind: task?.kind ?? 'code',
    role: task?.role ?? '',
    priority: (task?.priority ?? 1) as 0 | 1 | 2 | 3,
    dependsOn: task?.dependsOn ?? [],
    acceptance: task?.acceptance ?? '',
    maxAttempts: task ? String(task.maxAttempts) : '',
  };
}

export function TaskFormDialog({ open, onClose, projectId, defaultProjectId, task, onSaved }: TaskFormDialogProps) {
  const editing = !!task;
  const [form, setForm] = useState<FormState>(() => initialState(task, projectId ?? defaultProjectId));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Reset whenever the dialog opens (or switches to another task).
  useEffect(() => {
    if (!open) return;
    setForm(initialState(task, projectId ?? defaultProjectId));
    setErrors({});
    setFormError(null);
  }, [open, task, projectId, defaultProjectId]);

  const projects = useProjects();
  const effectiveProject = form.projectId;
  const tasks = useRpc('tasks.list', open && effectiveProject ? { projectId: effectiveProject, limit: 2000 } : null);

  const create = useMutation('tasks.create', { errorToast: false, successToast: (t) => `Aufgabe angelegt: ${t.title}` });
  const update = useMutation('tasks.update', { errorToast: false, successToast: 'Aufgabe gespeichert' });
  const saving = create.loading || update.loading;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.projectId) nextErrors.projectId = 'Bitte ein Projekt auswählen.';
    if (!form.title.trim()) nextErrors.title = 'Bitte einen Titel eingeben.';
    const attempts = form.maxAttempts.trim() ? Number(form.maxAttempts) : undefined;
    if (attempts !== undefined && (!Number.isInteger(attempts) || attempts < 1 || attempts > 10)) nextErrors.maxAttempts = 'Bitte eine ganze Zahl von 1 bis 10 eingeben.';
    setErrors(nextErrors);
    setFormError(null);
    if (Object.keys(nextErrors).length) return;

    try {
      let saved: Task;
      if (task) {
        const patch: Parameters<typeof update.runAsync>[0] = { id: task.id };
        if (form.title.trim() !== task.title) patch.title = form.title.trim();
        if (form.description !== task.description) patch.description = form.description;
        if (form.priority !== task.priority) patch.priority = form.priority;
        if (form.role && form.role !== task.role) patch.role = form.role;
        if ((form.acceptance.trim() || null) !== (task.acceptance ?? null)) patch.acceptance = form.acceptance.trim() || null;
        if (JSON.stringify([...form.dependsOn].sort()) !== JSON.stringify([...task.dependsOn].sort())) patch.dependsOn = form.dependsOn;
        if (attempts !== undefined && attempts !== task.maxAttempts) patch.maxAttempts = attempts;
        if (Object.keys(patch).length === 1) {
          onClose();
          return;
        }
        saved = await update.runAsync(patch);
      } else {
        saved = await create.runAsync({
          projectId: form.projectId,
          title: form.title.trim(),
          description: form.description,
          kind: form.kind,
          ...(form.role ? { role: form.role } : {}),
          priority: form.priority,
          dependsOn: form.dependsOn,
          acceptance: form.acceptance.trim() || null,
          ...(attempts !== undefined ? { maxAttempts: attempts } : {}),
        });
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const issues = validationIssues(err);
      if (Object.keys(issues).length) setErrors(issues);
      setFormError(err instanceof Error ? err.message : 'Speichern ist fehlgeschlagen.');
    }
  };

  const projectOptions = (projects.data ?? []).filter((p) => p.status === 'active').map((p) => ({ value: p.id, label: p.name }));

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      dismissible={!saving}
      size="lg"
      icon={editing ? Pencil : ClipboardList}
      title={editing ? 'Aufgabe bearbeiten' : 'Aufgabe anlegen'}
      description={editing ? undefined : 'Eine Aufgabe beschreibt ein überschaubares Arbeitspaket für einen Agenten.'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button variant="primary" type="submit" form="task-form" loading={saving}>
            {editing ? 'Speichern' : 'Aufgabe anlegen'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={(e) => void submit(e)} className="space-y-4" noValidate>
        {task?.status === 'paused' && (
          <p className="flex items-start gap-2 rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-info-fg">
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Die Aufgabe ist pausiert. Der Agent bekommt die Änderungen, sobald sie fortgesetzt wird.
          </p>
        )}
        {task?.status === 'waiting_approval' && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-fg">
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Beim Speichern verfallen offene Freigaben dieser Aufgabe – der Agent fragt bei Bedarf neu.
          </p>
        )}
        {!projectId && !editing && (
          <Select
            label="Projekt"
            required
            value={form.projectId}
            onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, dependsOn: [] }))}
            options={projectOptions}
            placeholder={projects.loading ? 'Projekte werden geladen …' : 'Projekt auswählen'}
            error={errors.projectId}
          />
        )}
        <Input label="Titel" required maxLength={300} value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="z. B. Highscore-Liste im Menü anzeigen" data-autofocus />
        <Textarea
          label="Beschreibung"
          rows={4}
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          error={errors.description}
          placeholder="Was soll gemacht werden? Je genauer, desto besser."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Art"
            value={form.kind}
            disabled={editing}
            hint={editing ? 'Kann nach dem Anlegen nicht mehr geändert werden.' : undefined}
            onChange={(e) => set('kind', e.target.value as TaskKind)}
            options={KIND_ORDER.map((k) => ({ value: k, label: TASK_KIND[k].label }))}
          />
          <Select
            label="Rolle"
            value={form.role}
            onChange={(e) => set('role', e.target.value as AgentRole | '')}
            options={ROLE_ORDER.map((r) => ({ value: r, label: AGENT_ROLE[r].label }))}
            placeholder={editing ? undefined : 'Automatisch (passend zur Art)'}
            hint={form.role ? AGENT_ROLE[form.role].description : 'NOVA wählt die passende Rolle.'}
          />
          <PrioritySelect label="Priorität" value={form.priority} onChange={(p) => set('priority', p)} />
        </div>
        <DependencyPicker
          tasks={tasks.data ?? []}
          loading={tasks.loading}
          selfId={task?.id ?? null}
          value={form.dependsOn}
          onChange={(ids) => set('dependsOn', ids)}
          disabled={!effectiveProject}
          error={errors.dependsOn}
        />
        <Textarea
          label="Abnahmekriterien"
          rows={3}
          value={form.acceptance}
          onChange={(e) => set('acceptance', e.target.value)}
          error={errors.acceptance}
          hint="Woran ist zu erkennen, dass die Aufgabe fertig ist? NOVA prüft das nach der Arbeit."
          placeholder="z. B. Die zehn besten Ergebnisse erscheinen im Menü und bleiben nach einem Neustart erhalten."
        />
        <Input
          label="Maximale Versuche"
          type="number"
          min={1}
          max={10}
          inputMode="numeric"
          value={form.maxAttempts}
          onChange={(e) => set('maxAttempts', e.target.value)}
          error={errors.maxAttempts}
          hint="Leer lassen für den Standardwert aus den Einstellungen."
          containerClassName="max-w-56"
        />
        {formError && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger-fg">
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}

interface DependencyPickerProps {
  tasks: readonly Task[];
  loading: boolean;
  selfId: string | null;
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  error?: string;
}

/** Searchable checkbox list of the project's tasks (without the task itself and tasks that depend on it). */
function DependencyPicker({ tasks, loading, selfId, value, onChange, disabled, error }: DependencyPickerProps) {
  const [query, setQuery] = useState('');
  const excluded = useMemo(() => (selfId ? dependentsClosure(tasks, selfId) : new Set<string>()), [tasks, selfId]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => t.id !== selfId && !excluded.has(t.id) && (t.status !== 'cancelled' || value.includes(t.id)))
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .sort((a, b) => Number(value.includes(b.id)) - Number(value.includes(a.id)) || a.createdAt - b.createdAt);
  }, [tasks, selfId, excluded, query, value]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <Field
      label={`Abhängigkeiten${value.length ? ` (${value.length} ausgewählt)` : ''}`}
      hint="Die Aufgabe startet erst, wenn alle ausgewählten Aufgaben erledigt sind."
      error={error}
    >
      <div className={cn('rounded-lg border border-border bg-surface-2', disabled && 'opacity-50')}>
        <div className="relative border-b border-border">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-subtle" />
          <input
            type="search"
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Aufgaben durchsuchen …"
            aria-label="Abhängigkeiten durchsuchen"
            className="h-8 w-full rounded-t-lg bg-transparent pr-2 pl-8 text-[13px] text-text outline-none placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-violet/60"
          />
        </div>
        <ul className="max-h-44 overflow-y-auto py-1" aria-label="Mögliche Abhängigkeiten">
          {loading ? (
            <li className="px-3 py-2 text-xs text-muted">Aufgaben werden geladen …</li>
          ) : candidates.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">{query ? 'Keine passende Aufgabe gefunden.' : 'Es gibt keine weiteren Aufgaben in diesem Projekt.'}</li>
          ) : (
            candidates.map((t) => {
              const checked = value.includes(t.id);
              return (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 hover:bg-surface-3">
                    <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(t.id)} className="h-4 w-4 shrink-0 accent-violet" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">{t.title}</span>
                    <TaskStatusBadge status={t.status} />
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </Field>
  );
}
