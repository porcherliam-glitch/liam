// Änderungen of a project: files changed by NOVA (with "nach NOVA geändert"), the change history, restore points
// (preview + restore that only undoes NOVA's own changes), undo per task, git status and recent commits, git init.
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  Bot,
  CircleCheck,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  History,
  Plus,
  RotateCcw,
  Save,
  Search,
  TriangleAlert,
  Undo2,
  UserRound,
} from 'lucide-react';
import type { AnyNovaEvent } from '@shared/events';
import type { ChangedFile, ChangeRecord, Checkpoint, ProjectSummary, Task } from '@shared/schemas';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, Input, LoadingState, StatusBadge, Switch, Table, type Column } from '../../../components/ui';
import { RelativeTime, TaskStatusBadge, VerificationBadge } from '../../../components/common';
import { RestoreDialog, useLiveTasks, type RestoreTarget } from '../../../components/project';
import { useMutation, useRpc } from '../../../hooks/useRpc';
import { cn } from '../../../lib/cn';
import { formatDateTime, plural } from '../../../lib/format';
import { CHANGE_OP, CHANGE_SOURCE, CHECKPOINT_KIND, metaOf } from '../../../lib/labels';
import { paths } from '../../../lib/paths';
import { DiffDialog, type DiffTarget } from './DiffDialog';
import { useAutoFocusTarget } from '../../../components/project/useAutoFocusTarget';

export interface ChangesTabProps {
  project: ProjectSummary;
}

/** Events of this project (payloads with projectId or, for project.updated, id). */
function ofProject(projectId: string) {
  return (e: AnyNovaEvent): boolean => {
    const p = e.payload as { projectId?: string | null; id?: string };
    if (e.type === 'project.updated') return p.id === projectId;
    return p.projectId === undefined || p.projectId === projectId;
  };
}

export function ChangesTab({ project }: ChangesTabProps) {
  const tasks = useLiveTasks(project.id);
  const [diff, setDiff] = useState<DiffTarget | null>(null);
  const [restore, setRestore] = useState<{ target: RestoreTarget; label: string; mode: 'preview' | 'restore' } | null>(null);

  return (
    <div className="@container space-y-4">
      <ChangedFilesCard projectId={project.id} tasksById={tasks.byId} onDiff={setDiff} />
      <div className="grid items-start gap-4 @5xl:grid-cols-2">
        <CheckpointsCard project={project} tasksById={tasks.byId} onRestore={setRestore} />
        <div className="space-y-4">
          <UndoTaskCard tasks={tasks.data ?? []} loading={tasks.loading} onUndo={(t) => setRestore({ target: { taskId: t.id }, label: t.title, mode: 'restore' })} />
          <GitCard project={project} />
        </div>
      </div>
      <HistoryCard projectId={project.id} tasksById={tasks.byId} onDiff={setDiff} />

      <DiffDialog projectId={project.id} target={diff} onClose={() => setDiff(null)} />
      <RestoreDialog
        open={restore !== null}
        onClose={() => setRestore(null)}
        target={restore?.target ?? null}
        label={restore?.label ?? ''}
        mode={restore?.mode}
        gitAvailable={project.gitAvailable}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Changed files
// ---------------------------------------------------------------------------

function TaskLinks({ projectId, ids, tasksById }: { projectId: string; ids: readonly string[]; tasksById: ReadonlyMap<string, Task> }) {
  if (!ids.length) return <span className="text-muted">–</span>;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {ids.slice(0, 3).map((id) => (
        <Link key={id} to={paths.project(projectId, { tab: 'tasks', task: id })} className="max-w-64 truncate text-xs" title={tasksById.get(id)?.title}>
          {tasksById.get(id)?.title ?? 'Aufgabe'}
        </Link>
      ))}
      {ids.length > 3 && <span className="text-[11px] text-muted">+{ids.length - 3} weitere</span>}
    </span>
  );
}

function ChangedFilesCard({ projectId, tasksById, onDiff }: { projectId: string; tasksById: ReadonlyMap<string, Task>; onDiff: (t: DiffTarget) => void }) {
  const changed = useRpc('files.changed', { projectId }, { refetchOn: ['files.changed', 'checkpoint.updated'], eventFilter: ofProject(projectId) });
  const [showAll, setShowAll] = useState(false);
  const all = changed.data ?? [];
  const byNova = all.filter((f) => f.byNova);
  const rows = showAll ? all : byNova;
  const touchedLater = byNova.filter((f) => f.modifiedSinceNova).length;

  const columns: Array<Column<ChangedFile>> = [
    { key: 'op', header: 'Art', cell: (f) => <StatusBadge meta={metaOf(CHANGE_OP, f.op)} />, sortValue: (f) => f.op, width: '110px' },
    {
      key: 'path',
      header: 'Datei',
      sortValue: (f) => f.path,
      cell: (f) => (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          {f.op === 'delete' ? (
            <span className="font-mono text-xs text-muted line-through">{f.path}</span>
          ) : (
            <Link to={paths.studio(projectId, { file: f.path })} className="min-w-0 truncate font-mono text-xs" title={`${f.path} im Studio öffnen`}>
              {f.path}
            </Link>
          )}
          {!f.byNova && (
            <Badge icon={UserRound} title="Diese Änderung stammt nicht von NOVA.">
              eigene Änderung
            </Badge>
          )}
          {f.modifiedSinceNova && (
            <Badge tone="warning" icon={TriangleAlert} title="Die Datei wurde nach NOVAs letzter Änderung von Hand oder von einem anderen Programm geändert. Beim Wiederherstellen bleibt sie unangetastet.">
              nach NOVA geändert
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'tasks', header: 'Aufgaben', cell: (f) => <TaskLinks projectId={projectId} ids={f.taskIds} tasksById={tasksById} /> },
    {
      key: 'git',
      header: 'Git',
      width: '64px',
      cell: (f) =>
        f.gitStatus?.trim() ? (
          <span className="font-mono text-xs text-muted" title="Git-Status (z. B. M = geändert, ?? = neu und noch nicht erfasst)">
            {f.gitStatus.trim()}
          </span>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Aktionen</span>,
      align: 'right',
      cell: (f) =>
        f.byNova ? (
          <Button size="sm" variant="ghost" icon={FileDiff} onClick={() => onDiff({ path: f.path, label: 'Alle Änderungen von NOVA an dieser Datei.' })} aria-label={`Unterschiede von ${f.path} anzeigen`}>
            Unterschiede
          </Button>
        ) : null,
    },
  ];

  return (
    <Card
      title="Von NOVA geänderte Dateien"
      icon={Bot}
      description="Jede Datei, die ein Agent angelegt, geändert oder gelöscht hat – mit den zugehörigen Aufgaben."
      actions={<Switch size="sm" checked={showAll} onChange={setShowAll} label="Eigene Änderungen zeigen" />}
      padding="none"
    >
      {changed.loading ? (
        <LoadingState compact />
      ) : changed.error && !changed.data ? (
        <ErrorState compact error={changed.error} onRetry={() => void changed.refetch()} />
      ) : (
        <>
          {touchedLater > 0 && (
            <p className="mx-4 mb-1 flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-fg">
              <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {touchedLater === 1 ? '1 Datei wurde' : `${touchedLater} Dateien wurden`} nach NOVA noch einmal geändert. Diese eigenen Änderungen werden beim Wiederherstellen nie überschrieben.
            </p>
          )}
          <Table
            caption="Geänderte Dateien"
            columns={columns}
            rows={rows}
            rowKey={(f) => f.path}
            initialSort={{ key: 'path', dir: 'asc' }}
            dense
            empty={<EmptyState compact icon={Bot} title="Noch keine Änderungen" description="NOVA hat in diesem Projekt noch keine Dateien geändert." />}
          />
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Restore points
// ---------------------------------------------------------------------------

function CheckpointsCard({
  project,
  tasksById,
  onRestore,
}: {
  project: ProjectSummary;
  tasksById: ReadonlyMap<string, Task>;
  onRestore: (r: { target: RestoreTarget; label: string; mode: 'preview' | 'restore' }) => void;
}) {
  const checkpoints = useRpc('checkpoints.list', { projectId: project.id }, { refetchOn: ['checkpoint.updated'], eventFilter: ofProject(project.id) });
  const [createOpen, setCreateOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const list = checkpoints.data ?? [];
  const visible = showAll ? list : list.slice(0, 8);

  return (
    <Card
      title="Wiederherstellungspunkte"
      icon={History}
      description="Gespeicherte Stände, zu denen NOVA zurückkehren kann. Zurückgesetzt werden nur NOVAs eigene Änderungen."
      actions={
        <Button size="sm" icon={Plus} onClick={() => setCreateOpen(true)}>
          Punkt anlegen
        </Button>
      }
      padding="sm"
    >
      {checkpoints.loading ? (
        <LoadingState compact />
      ) : checkpoints.error && !checkpoints.data ? (
        <ErrorState compact error={checkpoints.error} onRetry={() => void checkpoints.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={Save}
          title="Noch keine Wiederherstellungspunkte"
          description="NOVA legt vor jeder Aufgabe automatisch einen an. Vor eigenen größeren Umbauten lohnt sich ein manueller Punkt."
        />
      ) : (
        <>
          <ul className="space-y-2" aria-label="Wiederherstellungspunkte">
            {visible.map((c) => (
              <CheckpointItem key={c.id} checkpoint={c} projectId={project.id} task={c.taskId ? tasksById.get(c.taskId) : undefined} onRestore={onRestore} />
            ))}
          </ul>
          {list.length > visible.length && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setShowAll(true)}>
              Alle {list.length} anzeigen
            </Button>
          )}
        </>
      )}
      <CreateCheckpointDialog open={createOpen} onClose={() => setCreateOpen(false)} projectId={project.id} onCreated={() => void checkpoints.refetch()} />
    </Card>
  );
}

function CheckpointItem({
  checkpoint: c,
  projectId,
  task,
  onRestore,
}: {
  checkpoint: Checkpoint;
  projectId: string;
  task?: Task;
  onRestore: (r: { target: RestoreTarget; label: string; mode: 'preview' | 'restore' }) => void;
}) {
  const kind = metaOf(CHECKPOINT_KIND, c.kind);
  return (
    <li className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <p className="truncate text-[13px] font-medium text-text" title={c.label}>
            {c.label}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <StatusBadge meta={kind} />
            {c.verification === 'passed' && (
              <Badge tone="success" icon={CircleCheck} title="Zu diesem Zeitpunkt waren die Prüfungen erfolgreich.">
                funktionierender Stand
              </Badge>
            )}
            {c.verification && c.verification !== 'passed' && <VerificationBadge status={c.verification} />}
            <span title={formatDateTime(c.createdAt)}>
              <RelativeTime ts={c.createdAt} />
            </span>
            {c.gitCommit && <span className="font-mono">{c.gitCommit.slice(0, 7)}</span>}
          </p>
          {task && (
            <p className="mt-1 truncate text-xs">
              <Link to={paths.project(projectId, { tab: 'tasks', task: task.id })}>{task.title}</Link>
            </p>
          )}
          {c.restoredAt != null && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-info-fg">
              <RotateCcw aria-hidden className="h-3 w-3" /> Zuletzt wiederhergestellt <RelativeTime ts={c.restoredAt} />
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => onRestore({ target: { checkpointId: c.id }, label: c.label, mode: 'preview' })} aria-label={`Vorschau: ${c.label}`}>
            Vorschau
          </Button>
          <Button size="sm" icon={RotateCcw} onClick={() => onRestore({ target: { checkpointId: c.id }, label: c.label, mode: 'restore' })} aria-label={`Wiederherstellen: ${c.label}`}>
            Wiederherstellen
          </Button>
        </div>
      </div>
    </li>
  );
}

function CreateCheckpointDialog({ open, onClose, projectId, onCreated }: { open: boolean; onClose: () => void; projectId: string; onCreated: () => void }) {
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useMutation('checkpoints.create', { successToast: (c) => `Wiederherstellungspunkt „${c.label}“ angelegt`, onSuccess: onCreated });
  const focus = useAutoFocusTarget<HTMLFormElement>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      setError('Bitte kurz beschreiben, was dieser Stand ist.');
      return;
    }
    const res = await create.run({ projectId, label: label.trim() });
    if (res) {
      setLabel('');
      onClose();
    }
  };

  return (
    <Dialog
      initialFocus={focus.target}
      open={open}
      onClose={() => !create.loading && onClose()}
      dismissible={!create.loading}
      icon={Save}
      size="sm"
      title="Wiederherstellungspunkt anlegen"
      description="Merkt sich den jetzigen Stand. Später lassen sich alle Änderungen, die NOVA danach macht, wieder zurücknehmen."
      footer={
        <>
          <Button onClick={onClose} disabled={create.loading}>
            Abbrechen
          </Button>
          <Button variant="primary" type="submit" form="create-checkpoint-form" loading={create.loading}>
            Anlegen
          </Button>
        </>
      }
    >
      <form id="create-checkpoint-form" ref={focus.container} onSubmit={(e) => void submit(e)} noValidate>
        <Input
          label="Bezeichnung"
          required
          maxLength={200}
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setError(null);
          }}
          error={error ?? undefined}
          placeholder="z. B. Vor dem Umbau der Steuerung"
          data-autofocus
        />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Undo per task
// ---------------------------------------------------------------------------

function UndoTaskCard({ tasks, loading, onUndo }: { tasks: readonly Task[]; loading: boolean; onUndo: (t: Task) => void }) {
  const withFiles = useMemo(() => [...tasks].filter((t) => t.files.length > 0).sort((a, b) => (b.finishedAt ?? b.updatedAt) - (a.finishedAt ?? a.updatedAt)), [tasks]);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? withFiles : withFiles.slice(0, 5);
  return (
    <Card title="Änderungen einer Aufgabe zurücknehmen" icon={Undo2} description="Macht nur die Dateiänderungen dieser einen Aufgabe rückgängig." padding="sm">
      {loading ? (
        <LoadingState compact />
      ) : withFiles.length === 0 ? (
        <p className="px-1 py-2 text-xs text-muted">Keine Aufgabe hat bisher Dateien geändert.</p>
      ) : (
        <>
          <ul className="space-y-1.5" aria-label="Aufgaben mit Änderungen">
            {visible.map((t) => {
              const running = t.status === 'running';
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
                  <TaskStatusBadge status={t.status} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-text" title={t.title}>
                    {t.title}
                  </span>
                  <span className="text-xs text-muted">{plural(t.files.length, 'Datei', 'Dateien')}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Undo2}
                    disabled={running}
                    title={running ? 'Die Aufgabe läuft noch. Bitte zuerst pausieren oder stoppen.' : undefined}
                    onClick={() => onUndo(t)}
                    aria-label={`Änderungen von „${t.title}“ rückgängig machen`}
                  >
                    Rückgängig
                  </Button>
                </li>
              );
            })}
          </ul>
          {withFiles.length > visible.length && (
            <Button size="sm" variant="ghost" className="mt-1" onClick={() => setShowAll(true)}>
              Alle {withFiles.length} anzeigen
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

function GitCard({ project }: { project: ProjectSummary }) {
  const filter = ofProject(project.id);
  const status = useRpc('git.status', { projectId: project.id }, { refetchOn: ['files.changed', 'project.updated', 'checkpoint.updated'], eventFilter: filter });
  const isRepo = status.data?.isRepo ?? project.gitAvailable;
  const log = useRpc('git.log', isRepo ? { projectId: project.id, limit: 15 } : null, { refetchOn: ['checkpoint.updated', 'task.updated', 'project.updated'], eventFilter: filter });
  const [confirmInit, setConfirmInit] = useState(false);
  const init = useMutation('git.init', {
    successToast: 'Git ist eingerichtet',
    onSuccess: (s) => {
      status.setData(s);
      void log.refetch();
    },
  });
  const s = status.data;

  return (
    <Card title="Git" icon={GitBranch} description="Versionsverwaltung des Projekts. Commits von NOVA sind markiert." padding="sm">
      {status.loading ? (
        <LoadingState compact />
      ) : status.error && !s ? (
        <ErrorState compact error={status.error} onRetry={() => void status.refetch()} title="Der Git-Status konnte nicht gelesen werden" />
      ) : !s?.isRepo ? (
        <EmptyState
          compact
          icon={GitBranch}
          title="Git ist nicht eingerichtet"
          description="Mit Git lassen sich alle Änderungen nachvollziehen und einzelne Stände sicher zurückholen. NOVA legt dafür ein Repository im Projektordner an."
          actions={
            <Button variant="primary" icon={GitBranch} onClick={() => setConfirmInit(true)}>
              Git einrichten
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
            <span className="inline-flex items-center gap-1 font-medium text-text">
              <GitBranch aria-hidden className="h-3.5 w-3.5 text-muted" />
              {s.branch ?? 'kein Branch'}
            </span>
            {s.head && <span className="font-mono text-muted">{s.head.slice(0, 7)}</span>}
            {(s.ahead > 0 || s.behind > 0) && (
              <span className="text-muted">
                {s.ahead > 0 && `${s.ahead} voraus`}
                {s.ahead > 0 && s.behind > 0 && ' · '}
                {s.behind > 0 && `${s.behind} zurück`}
              </span>
            )}
            {s.clean ? (
              <span className="inline-flex items-center gap-1 text-success-fg">
                <CircleCheck aria-hidden className="h-3.5 w-3.5" /> Alles festgehalten
              </span>
            ) : (
              <span className="text-warning-fg">{plural(s.files.length, 'Datei noch nicht festgehalten', 'Dateien noch nicht festgehalten')}</span>
            )}
          </div>
          {!s.clean && s.files.length > 0 && (
            <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2" aria-label="Nicht festgehaltene Dateien">
              {s.files.slice(0, 50).map((f) => (
                <li key={f.path} className="flex min-w-0 items-center gap-2 text-xs">
                  <span className="w-6 shrink-0 font-mono text-muted">{`${f.index}${f.workTree}`.trim() || '·'}</span>
                  <span className="min-w-0 truncate font-mono text-text">{f.path}</span>
                </li>
              ))}
              {s.files.length > 50 && <li className="text-[11px] text-muted">+{s.files.length - 50} weitere</li>}
            </ul>
          )}
          <div>
            <h3 className="mb-1.5 px-1 text-xs font-semibold text-muted">Letzte Commits</h3>
            {log.loading ? (
              <LoadingState compact />
            ) : log.error && !log.data ? (
              <ErrorState compact error={log.error} onRetry={() => void log.refetch()} />
            ) : (log.data ?? []).length === 0 ? (
              <p className="px-1 text-xs text-muted">Noch keine Commits.</p>
            ) : (
              <ul className="space-y-1" aria-label="Letzte Commits">
                {(log.data ?? []).map((c) => (
                  <li key={c.hash} className="flex min-w-0 items-start gap-2 rounded-md px-1 py-1">
                    <GitCommitHorizontal aria-hidden className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', c.byNova ? 'text-violet-fg' : 'text-muted')} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] text-text" title={c.subject}>
                        {c.subject}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                        <span className="font-mono">{c.shortHash}</span>
                        <span>{c.author}</span>
                        <RelativeTime ts={c.date} />
                        {c.byNova && (
                          <Badge tone="violet" icon={Bot}>
                            von NOVA
                          </Badge>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmInit}
        title="Git einrichten?"
        message={
          <>
            <p>NOVA legt im Projektordner ein Git-Repository an und hält den jetzigen Stand als ersten Commit fest.</p>
            <p className="mt-2 text-muted">Vorhandene Dateien werden dabei nicht verändert. Es wird nichts hochgeladen.</p>
          </>
        }
        confirmLabel="Git einrichten"
        loading={init.loading}
        onConfirm={async () => {
          await init.run({ projectId: project.id });
          setConfirmInit(false);
        }}
        onCancel={() => setConfirmInit(false)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_PAGE = 25;

function HistoryCard({ projectId, tasksById, onDiff }: { projectId: string; tasksById: ReadonlyMap<string, Task>; onDiff: (t: DiffTarget) => void }) {
  const history = useRpc('files.history', { projectId, limit: 500 }, { refetchOn: ['files.changed', 'checkpoint.updated'], eventFilter: ofProject(projectId) });
  const [query, setQuery] = useState('');
  const [onlyNova, setOnlyNova] = useState(false);
  const [shown, setShown] = useState(HISTORY_PAGE);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (history.data ?? []).filter((c) => (!q || c.path.toLowerCase().includes(q)) && (!onlyNova || c.actor === 'nova'));
  }, [history.data, query, onlyNova]);

  const columns: Array<Column<ChangeRecord>> = [
    { key: 'ts', header: 'Zeit', width: '120px', cell: (c) => <RelativeTime ts={c.ts} className="text-xs text-muted" /> },
    {
      key: 'path',
      header: 'Datei',
      cell: (c) => (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className={cn('min-w-0 truncate font-mono text-xs', c.reverted && 'text-muted line-through')} title={c.path}>
            {c.path}
          </span>
          {c.reverted && <Badge icon={RotateCcw}>zurückgenommen</Badge>}
          {!c.revertible && !c.reverted && (
            <Badge tone="warning" title="Für diese Änderung gibt es keinen gespeicherten Vorher-Stand. Beim Wiederherstellen wird sie übersprungen und muss selbst geprüft werden.">
              nicht automatisch umkehrbar
            </Badge>
          )}
        </span>
      ),
    },
    { key: 'op', header: 'Art', width: '110px', cell: (c) => <StatusBadge meta={metaOf(CHANGE_OP, c.op)} /> },
    { key: 'source', header: 'Von', width: '170px', cell: (c) => <StatusBadge meta={metaOf(CHANGE_SOURCE, c.source)} /> },
    {
      key: 'task',
      header: 'Aufgabe',
      cell: (c) =>
        c.taskId ? (
          <Link to={paths.project(projectId, { tab: 'tasks', task: c.taskId })} className="block max-w-56 truncate text-xs" title={tasksById.get(c.taskId)?.title}>
            {tasksById.get(c.taskId)?.title ?? 'Aufgabe'}
          </Link>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Aktionen</span>,
      align: 'right',
      cell: (c) =>
        c.op === 'delete' && !c.beforeHash ? null : (
          <Button
            size="sm"
            variant="ghost"
            icon={FileDiff}
            onClick={() => onDiff({ path: c.path, changeId: c.id, label: `Änderung vom ${formatDateTime(c.ts)} im Vergleich zum aktuellen Stand.` })}
            aria-label={`Änderung an ${c.path} vergleichen`}
          >
            Vergleichen
          </Button>
        ),
    },
  ];

  return (
    <Card
      title="Verlauf"
      icon={History}
      description="Jede einzelne Dateiänderung – von NOVA, von Hand und durch Wiederherstellungen."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Switch size="sm" checked={onlyNova} onChange={setOnlyNova} label="Nur NOVA" />
          <Input
            type="search"
            size="sm"
            icon={Search}
            aria-label="Verlauf nach Datei durchsuchen"
            placeholder="Datei suchen …"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(HISTORY_PAGE);
            }}
            containerClassName="w-48"
          />
        </div>
      }
      padding="none"
    >
      {history.loading ? (
        <LoadingState compact />
      ) : history.error && !history.data ? (
        <ErrorState compact error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <>
          <Table
            caption="Verlauf der Dateiänderungen"
            columns={columns}
            rows={rows.slice(0, shown)}
            rowKey={(c) => String(c.id)}
            dense
            empty={
              <EmptyState
                compact
                icon={History}
                title={query || onlyNova ? 'Keine passenden Einträge' : 'Noch kein Verlauf'}
                description={query || onlyNova ? 'Für diese Suche gibt es keine Änderungen.' : 'Sobald Dateien geändert werden, erscheint hier jeder Schritt.'}
              />
            }
          />
          {rows.length > shown && (
            <div className="border-t border-border px-4 py-2">
              <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + HISTORY_PAGE * 2)}>
                Weitere anzeigen ({rows.length - shown})
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
