// Prüfungen of a project: run tests/build/lint (and further configured checks), honest text when a command is
// missing, and the history of check runs with failures (jump to file:line in the studio), output, artifacts,
// cancel and "Reparatur-Aufgabe anlegen". checks.run returns immediately; progress arrives via check.updated.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronRight, CircleSlash, FlaskConical, FolderSearch, ListChecks, Package, Settings2, Square, Wrench } from 'lucide-react';
import type { CheckKind, CheckRun, ProjectSummary } from '@shared/schemas';
import { Button, Card, CodeBlock, EmptyState, ErrorState, IconButton, LoadingState, Select, StatusBadge } from '../../../components/ui';
import { CheckStatusBadge, LiveDuration, RelativeTime } from '../../../components/common';
import { joinProjectPath, upsertById, useLiveTasks } from '../../../components/project';
import { useMutation, useRpc } from '../../../hooks/useRpc';
import { useNovaEvent } from '../../../hooks/useEvents';
import { useStoredState } from '../../../hooks/useStoredState';
import { getBridge } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatBytes, formatDuration } from '../../../lib/format';
import { CHECK_KIND, CHECK_STATUS, metaOf, toneClasses } from '../../../lib/labels';
import { paths, type ProjectTab } from '../../../lib/paths';
import { useSupports } from '../../../stores/daemon';
import { toast } from '../../../stores/toasts';
import { CHECK_KIND_ORDER, commandFor, missingCommandText, PRIMARY_CHECK_KINDS, RUN_CHECK_LABEL } from './checkCommands';

export interface ChecksTabProps {
  project: ProjectSummary;
  onTab: (tab: ProjectTab) => void;
}

const byStartDesc = (a: CheckRun, b: CheckRun) => b.startedAt - a.startedAt;

export function ChecksTab({ project, onTab }: ChecksTabProps) {
  const checks = useRpc('checks.list', { projectId: project.id, limit: 100 });
  const { setData } = checks;
  const tasks = useLiveTasks(project.id);
  const [kindFilter, setKindFilter] = useStoredState<CheckKind | ''>('checks.kind', '');
  const [startingKind, setStartingKind] = useState<CheckKind | null>(null);

  useNovaEvent('check.updated', (c) => {
    if (c.projectId !== project.id) return;
    setData((prev) => (prev ? upsertById(prev, c, 'start').sort(byStartDesc) : prev));
  });

  const run = useMutation('checks.run', {
    onSuccess: (c) => {
      setData((prev) => (prev ? upsertById(prev, c, 'start').sort(byStartDesc) : [c]));
      toast.info(`${metaOf(CHECK_KIND, c.kind).label} gestartet`, 'Das Ergebnis erscheint gleich in der Liste.');
    },
  });

  const start = async (kind: CheckKind) => {
    setStartingKind(kind);
    try {
      await run.run({ projectId: project.id, kind });
    } finally {
      setStartingKind(null);
    }
  };

  const all = checks.data ?? [];
  const latest = useMemo(() => {
    const m = new Map<CheckKind, CheckRun>();
    for (const c of all) if (!m.has(c.kind)) m.set(c.kind, c);
    return m;
  }, [all]);
  const kinds = CHECK_KIND_ORDER.filter((k) => PRIMARY_CHECK_KINDS.includes(k) || commandFor(project, k) !== null);
  const visible = kindFilter ? all.filter((c) => c.kind === kindFilter) : all;
  const kindsInHistory = CHECK_KIND_ORDER.filter((k) => all.some((c) => c.kind === k));

  return (
    <div className="space-y-4">
      <Card
        title="Prüfungen ausführen"
        icon={ListChecks}
        description="NOVA führt nur Prüfungen aus, für die ein Befehl eingerichtet ist – und zeigt ehrlich, was nicht geprüft werden kann."
        actions={
          <Button size="sm" variant="ghost" icon={Settings2} onClick={() => onTab('overview')}>
            Befehle einrichten
          </Button>
        }
      >
        <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3" aria-label="Verfügbare Prüfungen">
          {kinds.map((kind) => (
            <CheckKindTile
              key={kind}
              kind={kind}
              command={commandFor(project, kind)}
              last={latest.get(kind) ?? null}
              starting={startingKind === kind}
              disabled={project.pathMissing || (run.loading && startingKind !== kind)}
              onRun={() => void start(kind)}
            />
          ))}
        </ul>
      </Card>

      <Card
        title="Verlauf der Prüfungen"
        icon={FlaskConical}
        description="Von NOVA automatisch oder von Hand gestartete Prüfungen. Fehler führen direkt zur Stelle im Code."
        actions={
          kindsInHistory.length > 1 && (
            <Select
              size="sm"
              aria-label="Nach Art filtern"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as CheckKind | '')}
              options={kindsInHistory.map((k) => ({ value: k, label: CHECK_KIND[k].label }))}
              placeholder="Alle Arten"
              containerClassName="w-44"
            />
          )
        }
        padding="sm"
      >
        {checks.loading ? (
          <LoadingState compact label="Prüfungen werden geladen …" />
        ) : checks.error && !checks.data ? (
          <ErrorState compact error={checks.error} onRetry={() => void checks.refetch()} />
        ) : all.length === 0 ? (
          <EmptyState
            compact
            icon={FlaskConical}
            title="Noch keine Prüfungen gelaufen"
            description="Tests oder Build oben starten. Wenn „Nach jeder Code-Änderung testen“ eingeschaltet ist, prüft NOVA außerdem selbstständig."
          />
        ) : visible.length === 0 ? (
          <EmptyState compact icon={FlaskConical} title="Keine Prüfungen dieser Art" description="Einen anderen Filter wählen." />
        ) : (
          <ul className="space-y-2" aria-label="Prüfungsläufe">
            {visible.map((c, i) => (
              <CheckRunItem key={c.id} check={c} project={project} taskTitle={c.taskId ? tasks.byId.get(c.taskId)?.title : undefined} defaultExpanded={i === 0 && c.status === 'failed'} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CheckKindTile({
  kind,
  command,
  last,
  starting,
  disabled,
  onRun,
}: {
  kind: CheckKind;
  command: string | null;
  last: CheckRun | null;
  starting: boolean;
  disabled: boolean;
  onRun: () => void;
}) {
  const meta = CHECK_KIND[kind];
  const Icon = meta.icon;
  const running = last?.status === 'running';
  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md', toneClasses[meta.tone].soft)}>
            <Icon aria-hidden className="h-4 w-4" />
          </span>
          <span className="truncate text-[13px] font-semibold text-text">{meta.label}</span>
        </span>
        {last && (
          <span className="flex shrink-0 flex-col items-end gap-0.5">
            <CheckStatusBadge status={last.status} />
            <RelativeTime ts={last.finishedAt ?? last.startedAt} className="text-[11px] text-subtle" />
          </span>
        )}
      </div>
      {command ? (
        <p className="truncate font-mono text-[11px] text-muted" title={command}>
          {command}
        </p>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-warning-fg">
          <CircleSlash aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {missingCommandText(kind)}
        </p>
      )}
      {command && (
        <Button
          size="sm"
          variant={kind === 'test' ? 'primary' : 'secondary'}
          icon={kind === 'package' ? Package : meta.icon}
          loading={starting}
          disabled={disabled || running}
          title={running ? 'Diese Prüfung läuft gerade.' : undefined}
          onClick={onRun}
          className="mt-auto self-start"
        >
          {running ? 'Läuft …' : RUN_CHECK_LABEL[kind]}
        </Button>
      )}
    </li>
  );
}

const FAILURES_COLLAPSED = 5;

function CheckRunItem({ check: c, project, taskTitle, defaultExpanded }: { check: CheckRun; project: ProjectSummary; taskTitle?: string; defaultExpanded: boolean }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const kind = metaOf(CHECK_KIND, c.kind);
  const running = c.status === 'running';
  const problem = c.status === 'failed' || c.status === 'error';
  const cancel = useMutation('checks.cancel', { successToast: 'Prüfung wird abgebrochen' });
  const createFix = useMutation('tasks.createFix', {
    onSuccess: (t) =>
      toast.show({
        tone: 'success',
        title: 'Reparatur-Aufgabe angelegt',
        message: t.title,
        action: { label: 'Aufgabe öffnen', onClick: () => navigate(paths.project(t.projectId, { tab: 'tasks', task: t.id })) },
      }),
  });
  const failures = expanded ? c.failures : c.failures.slice(0, FAILURES_COLLAPSED);
  const canCancel = useSupports('checks.cancel');
  const canCreateFix = useSupports('tasks.createFix');
  const detailsId = `check-details-${c.id}`;

  const counts: string[] = [];
  if (c.passed != null) counts.push(`${c.passed} bestanden`);
  if (c.failed != null && (c.failed > 0 || c.passed != null)) counts.push(`${c.failed} fehlgeschlagen`);
  if (c.skipped) counts.push(`${c.skipped} übersprungen`);

  const showInFolder = async (relative: string) => {
    const ok = await getBridge()
      ?.app.showInFolder(joinProjectPath(project.path, relative))
      .catch(() => false);
    if (!ok) toast.error('Datei konnte nicht gezeigt werden', 'Die Datei existiert nicht mehr oder ist nicht erreichbar.');
  };

  return (
    <li
      aria-label={`${kind.label}: ${metaOf(CHECK_STATUS, c.status).label}`}
      className={cn('rounded-lg border bg-surface-2', problem ? 'border-danger/35' : running ? 'border-blue/35' : 'border-border')}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-2">
            <CheckStatusBadge status={c.status} />
            <StatusBadge meta={kind} variant="outline" />
            {counts.length > 0 && <span className="text-xs text-muted tabular-nums">{counts.join(' · ')}</span>}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-text" title={c.command}>
            {c.command}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
            <span>
              Gestartet <RelativeTime ts={c.startedAt} />
            </span>
            <span aria-hidden>·</span>
            <span>
              Dauer {running ? <LiveDuration from={c.startedAt} format="text" /> : formatDuration(c.durationMs)}
            </span>
            {c.taskId && (
              <>
                <span aria-hidden>·</span>
                <Link to={paths.project(c.projectId, { tab: 'tasks', task: c.taskId })} className="max-w-64 truncate">
                  {taskTitle ?? 'Zugehörige Aufgabe'}
                </Link>
              </>
            )}
            {!c.taskId && (
              <>
                <span aria-hidden>·</span>
                <span>von Hand gestartet</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {running && canCancel && (
            <Button size="sm" variant="ghost" icon={Square} loading={cancel.loading} onClick={() => void cancel.run({ id: c.id })}>
              Abbrechen
            </Button>
          )}
          {problem && canCreateFix && (
            <Button size="sm" variant="subtle" icon={Wrench} loading={createFix.loading} onClick={() => void createFix.run({ projectId: c.projectId, checkRunId: c.id })}>
              Reparatur-Aufgabe anlegen
            </Button>
          )}
        </div>
      </div>

      {c.message && (
        <p className={cn('mx-3 mb-2 rounded-md px-2.5 py-1.5 text-xs', c.status === 'error' ? 'bg-danger/10 text-danger-fg' : 'bg-surface-3 text-muted')}>{c.message}</p>
      )}

      {c.failures.length > 0 && (
        <ul className="mx-3 mb-2 space-y-1" aria-label="Gefundene Fehler">
          {failures.map((f, i) => (
            <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded-md bg-danger/5 px-2.5 py-1.5 text-xs">
              {f.file ? (
                <Link to={paths.studio(c.projectId, { file: f.file, line: f.line })} className="shrink-0 font-mono" title="An dieser Stelle im Studio öffnen">
                  {f.file}
                  {f.line != null ? `:${f.line}` : ''}
                  {f.line != null && f.column != null ? `:${f.column}` : ''}
                </Link>
              ) : (
                <span className="shrink-0 text-muted">Ohne Dateiangabe</span>
              )}
              <span className="min-w-0 basis-full break-words whitespace-pre-wrap text-text sm:basis-auto sm:flex-1">{f.message}</span>
            </li>
          ))}
          {!expanded && c.failures.length > FAILURES_COLLAPSED && <li className="px-2.5 text-[11px] text-muted">+{c.failures.length - FAILURES_COLLAPSED} weitere Fehler</li>}
        </ul>
      )}

      <div className="border-t border-border/60 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={detailsId}
          className="inline-flex items-center gap-1 rounded text-xs font-medium text-blue-fg hover:underline"
        >
          <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', expanded && 'rotate-90')} />
          {expanded ? 'Ausgabe ausblenden' : `Ausgabe anzeigen${c.artifacts.length ? ` · ${c.artifacts.length} Ergebnisdateien` : ''}`}
        </button>
        {expanded && (
          <div id={detailsId} className="mt-2 space-y-3 pb-1.5">
            {c.outputTail.trim() ? <CodeBlock label="Letzte Ausgabe" code={c.outputTail} maxHeight={280} /> : <p className="text-xs text-muted">Keine Ausgabe aufgezeichnet.</p>}
            {c.artifacts.length > 0 && (
              <div>
                <h4 className="mb-1 text-xs font-semibold text-muted">Ergebnisdateien</h4>
                <ul className="space-y-0.5" aria-label="Ergebnisdateien">
                  {c.artifacts.map((a) => (
                    <li key={a.path} className="flex min-w-0 items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate font-mono text-text" title={a.path}>
                        {a.path}
                      </span>
                      <span className="shrink-0 text-muted tabular-nums">{formatBytes(a.sizeBytes)}</span>
                      <IconButton icon={FolderSearch} size="sm" label={`${a.path} im Explorer zeigen`} onClick={() => void showInFolder(a.path)} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
