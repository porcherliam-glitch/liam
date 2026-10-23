// "Prüfungen": failures of the latest test/build/lint runs (click → editor at file:line), latest result per kind,
// run/cancel checks and "Reparatur-Aufgabe anlegen".
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, CircleCheck, CircleX, FileWarning, FolderOpen, ListChecks, Package, Play, Square, Wrench } from 'lucide-react';
import type { CheckKind, CheckRun, ProjectCommands } from '@shared/schemas';
import { CheckStatusBadge, RelativeTime } from '../../../components/common';
import { Button, CodeBlock, EmptyState, ErrorState, IconButton, LoadingState } from '../../../components/ui';
import { useMutation, type UseRpcResult } from '../../../hooks';
import { getBridge } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatBytes, formatDuration } from '../../../lib/format';
import { CHECK_KIND, metaOf } from '../../../lib/labels';
import { paths } from '../../../lib/paths';
import { toast } from '../../../stores/toasts';
import { absolutePath, latestFailures, latestRunsByKind } from '../studio-utils';

export interface ChecksPanelProps {
  projectId: string;
  /** Absolute project folder (artifacts: "Im Explorer zeigen"). */
  projectRoot: string;
  commands: ProjectCommands | null;
  runs: UseRpcResult<'checks.list'>;
  onOpen: (path: string, line: number, column: number) => void;
}

interface RunAction {
  kind: CheckKind;
  label: string;
  missing: string;
}

const RUN_ACTIONS: RunAction[] = [
  { kind: 'test', label: 'Tests ausführen', missing: 'Für dieses Projekt ist kein Testbefehl eingerichtet – Prüfung nicht möglich.' },
  { kind: 'build', label: 'Build ausführen', missing: 'Für dieses Projekt ist kein Build-Befehl eingerichtet – Prüfung nicht möglich.' },
  { kind: 'lint', label: 'Code-Stil prüfen', missing: 'Für dieses Projekt ist kein Befehl für die Code-Stil-Prüfung eingerichtet – Prüfung nicht möglich.' },
  { kind: 'typecheck', label: 'Typen prüfen', missing: 'Für dieses Projekt ist keine Typprüfung eingerichtet – Prüfung nicht möglich.' },
];

const KIND_ORDER: CheckKind[] = ['test', 'build', 'lint', 'typecheck', 'e2e', 'security', 'runtime', 'package'];

function commandFor(commands: ProjectCommands | null, kind: CheckKind): string | null {
  if (!commands) return null;
  switch (kind) {
    case 'test':
      return commands.test;
    case 'build':
      return commands.build;
    case 'lint':
      return commands.lint;
    case 'typecheck':
      return commands.typecheck;
    case 'e2e':
      return commands.e2e;
    case 'security':
      return commands.security;
    case 'package':
      return commands.package;
    case 'runtime':
      return commands.run ?? commands.dev;
    default:
      return null;
  }
}

function countsText(run: CheckRun): string {
  const parts: string[] = [];
  if (run.passed != null) parts.push(`${run.passed} bestanden`);
  if (run.failed != null && run.failed > 0) parts.push(`${run.failed} fehlgeschlagen`);
  if (run.skipped != null && run.skipped > 0) parts.push(`${run.skipped} übersprungen`);
  if (run.durationMs != null) parts.push(formatDuration(run.durationMs));
  return parts.join(' · ');
}

/** Artifacts shown per run before "+ N weitere". */
const ARTIFACTS_SHOWN = 5;

export function ChecksPanel({ projectId, projectRoot, commands, runs, onOpen }: ChecksPanelProps) {
  const navigate = useNavigate();
  const [openOutput, setOpenOutput] = useState<Set<string>>(() => new Set());
  const [starting, setStarting] = useState<CheckKind | null>(null);
  const run = useMutation('checks.run', {
    successToast: (r) => `${metaOf(CHECK_KIND, r.kind).label} gestartet`,
    onSuccess: (r) => runs.setData((prev) => [r, ...(prev ?? []).filter((x) => x.id !== r.id)]),
  });
  const cancel = useMutation('checks.cancel', { successToast: 'Prüfung abgebrochen', onSuccess: (r) => runs.setData((prev) => prev?.map((x) => (x.id === r.id ? r : x))) });
  const createFix = useMutation('tasks.createFix', {
    onSuccess: (task) =>
      toast.show({
        tone: 'success',
        title: 'Reparatur-Aufgabe angelegt',
        message: task.title,
        action: { label: 'Aufgabe ansehen', onClick: () => navigate(paths.project(projectId, { tab: 'tasks', task: task.id })) },
      }),
  });

  const all = runs.data ?? [];
  const latest = latestRunsByKind(all).sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  const failures = latestFailures(all);
  const runningKinds = new Set(all.filter((r) => r.status === 'running').map((r) => r.kind));
  const actions = RUN_ACTIONS.filter((a) => a.kind !== 'typecheck' || commandFor(commands, 'typecheck'));

  const showInExplorer = async (path: string) => {
    const ok = await getBridge()
      ?.app.showInFolder(absolutePath(projectRoot, path))
      .catch(() => false);
    if (!ok) toast.error('Konnte den Explorer nicht öffnen', 'Die Datei wurde nicht gefunden – vielleicht wurde sie inzwischen gelöscht.');
  };

  const toggleOutput = (id: string) =>
    setOpenOutput((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
      {actions.map((a) => {
        const command = commandFor(commands, a.kind);
        const running = runningKinds.has(a.kind);
        return (
          <Button
            key={a.kind}
            size="sm"
            icon={metaOf(CHECK_KIND, a.kind).icon}
            disabled={!command || running}
            loading={starting === a.kind}
            title={command ? `${a.label}: ${command}` : a.missing}
            onClick={async () => {
              setStarting(a.kind);
              await run.run({ projectId, kind: a.kind });
              setStarting(null);
            }}
          >
            {running ? `${metaOf(CHECK_KIND, a.kind).label} läuft …` : a.label}
          </Button>
        );
      })}
    </div>
  );

  let body;
  if (runs.error && !runs.data) {
    body = <ErrorState compact error={runs.error} title="Die Prüfungen konnten nicht geladen werden" onRetry={() => void runs.refetch()} />;
  } else if (!runs.data) {
    body = <LoadingState compact />;
  } else if (latest.length === 0) {
    body = (
      <EmptyState
        compact
        icon={ListChecks}
        title="Noch keine Prüfungen"
        description="Tests und Builds laufen automatisch nach Änderungen von NOVA oder hier über die Schaltflächen oben."
      />
    );
  } else {
    body = (
      <div className="space-y-3 p-2">
        <section aria-labelledby="studio-failures-title">
          <h3 id="studio-failures-title" className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-muted">
            <FileWarning aria-hidden className="h-3.5 w-3.5" />
            Fehlerstellen
            {failures.length > 0 && <span className="rounded-full bg-danger/20 px-1.5 text-[11px] leading-4 text-danger-fg tabular-nums">{failures.length}</span>}
          </h3>
          {failures.length === 0 ? (
            <p className="flex items-center gap-1.5 px-1 text-[13px] text-success-fg">
              <CircleCheck aria-hidden className="h-4 w-4" />
              Keine Fehler – die letzten Prüfungen sind bestanden.
            </p>
          ) : (
            <ul aria-label="Fehlerstellen der letzten Prüfungen" className="overflow-hidden rounded-lg border border-border">
              {failures.map(({ run: r, failure }, i) => {
                const where = failure.file ? `${failure.file}${failure.line != null ? `:${failure.line}` : ''}${failure.column != null ? `:${failure.column}` : ''}` : null;
                const content = (
                  <>
                    <CircleX aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-danger-fg" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] break-words text-text">{failure.message}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{metaOf(CHECK_KIND, r.kind).label}</span>
                        {where ? <span className="font-mono text-blue-fg">{where}</span> : <span>ohne Dateiangabe</span>}
                      </span>
                    </span>
                  </>
                );
                return (
                  <li key={`${r.id}-${i}`} className="border-b border-border last:border-b-0">
                    {failure.file ? (
                      <button
                        type="button"
                        onClick={() => onOpen(failure.file as string, failure.line ?? 1, failure.column ?? 1)}
                        aria-label={`${failure.message} – in ${where} öffnen`}
                        className="flex w-full items-start gap-2 bg-danger/5 px-2.5 py-1.5 text-left hover:bg-danger/10 focus-visible:outline-offset-[-2px]"
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="flex items-start gap-2 bg-danger/5 px-2.5 py-1.5">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="studio-latest-title">
          <h3 id="studio-latest-title" className="mb-1 px-1 text-xs font-semibold text-muted">
            Letzte Ergebnisse
          </h3>
          <ul className="space-y-1.5">
            {latest.map((r) => {
              const kind = metaOf(CHECK_KIND, r.kind);
              const outputOpen = openOutput.has(r.id);
              return (
                <li key={r.id} className="rounded-lg border border-border bg-surface">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5">
                    <kind.icon aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-[13px] font-medium">{kind.label}</span>
                    <CheckStatusBadge status={r.status} />
                    {countsText(r) && <span className="text-xs text-muted">{countsText(r)}</span>}
                    <RelativeTime ts={r.finishedAt ?? r.startedAt} className="text-xs text-subtle" />
                    <div className="ml-auto flex items-center gap-1">
                      {r.status === 'running' && (
                        <Button size="sm" variant="ghost" icon={Square} loading={cancel.loading} onClick={() => void cancel.run({ id: r.id })}>
                          Abbrechen
                        </Button>
                      )}
                      {(r.status === 'failed' || r.status === 'error') && (
                        <Button size="sm" variant="subtle" icon={Wrench} loading={createFix.loading} onClick={() => void createFix.run({ projectId, checkRunId: r.id })}>
                          Reparatur-Aufgabe anlegen
                        </Button>
                      )}
                      {r.outputTail && (
                        <Button size="sm" variant="ghost" icon={ChevronRight} aria-expanded={outputOpen} onClick={() => toggleOutput(r.id)} className={cn('[&>svg]:transition-transform', outputOpen && '[&>svg]:rotate-90')}>
                          Ausgabe
                        </Button>
                      )}
                    </div>
                  </div>
                  {r.message && <p className="px-2.5 pb-1.5 text-xs text-muted">{r.message}</p>}
                  {r.artifacts.length > 0 && (
                    <div className="px-2.5 pb-1.5">
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <Package aria-hidden className="h-3.5 w-3.5" />
                        {r.artifacts.length === 1 ? 'Erzeugte Datei' : `Erzeugte Dateien (${r.artifacts.length})`}
                      </p>
                      <ul aria-label={`Erzeugte Dateien: ${kind.label}`} className="mt-0.5">
                        {r.artifacts.slice(0, ARTIFACTS_SHOWN).map((a) => (
                          <li key={a.path} className="flex items-center gap-2 text-xs">
                            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-text/90" title={a.path}>
                              {a.path}
                            </span>
                            <span className="shrink-0 text-subtle tabular-nums">{formatBytes(a.sizeBytes)}</span>
                            <IconButton icon={FolderOpen} label={`${a.path} im Explorer zeigen`} size="sm" onClick={() => void showInExplorer(a.path)} />
                          </li>
                        ))}
                      </ul>
                      {r.artifacts.length > ARTIFACTS_SHOWN && <p className="text-[11px] text-subtle">+ {r.artifacts.length - ARTIFACTS_SHOWN} weitere</p>}
                    </div>
                  )}
                  {r.command && !outputOpen && <p className="truncate px-2.5 pb-1.5 font-mono text-[11px] text-subtle" title={r.command}>{r.command}</p>}
                  {outputOpen && (
                    <div className="px-2.5 pb-2">
                      <CodeBlock code={r.outputTail} label={r.command} maxHeight={220} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        {!commandFor(commands, 'test') && (
          <p className="flex items-center gap-1.5 px-1 text-xs text-muted">
            <Play aria-hidden className="h-3.5 w-3.5" />
            {RUN_ACTIONS[0].missing} Der Befehl lässt sich in der Projektübersicht eintragen.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="min-h-0 flex-1 overflow-auto">{body}</div>
    </div>
  );
}
