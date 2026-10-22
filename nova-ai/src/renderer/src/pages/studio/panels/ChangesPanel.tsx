// "Änderungen": files changed by NOVA (files.changed) or open git changes, with a Monaco diff per file
// (files.diff / git.diff), a per-task filter and the change history of the selected file. A single entry of the
// history can be compared up to now (files.diff with changeId) or on its own (before/after via files.snapshot).
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bot, Columns2, Code, FileDiff, GitBranch, GitCompareArrows, Hand, Rows2 } from 'lucide-react';
import type { ChangedFile, ChangeRecord, Task } from '@shared/schemas';
import type { AnyNovaEvent } from '@shared/events';
import { Badge, Button, EmptyState, ErrorState, IconButton, LoadingState, SegmentedControl, Select, StatusBadge } from '../../../components/ui';
import { useMutation, useRpc, useSupports, type UseRpcResult } from '../../../hooks';
import { cn } from '../../../lib/cn';
import { formatRelativeTime, truncate } from '../../../lib/format';
import { CHANGE_OP, metaOf, toneClasses } from '../../../lib/labels';
import { paths } from '../../../lib/paths';
import { DiffView } from '../DiffView';
import { FileIcon } from '../FileIcon';
import { fileName, gitStatusInfo, languageForPath, parentPath, porcelainCode } from '../studio-utils';

export type ChangesSource = 'nova' | 'git';

export interface ChangesFocusRequest {
  path: string;
  token: number;
}

export interface ChangesPanelProps {
  projectId: string;
  changed: UseRpcResult<'files.changed'>;
  tasks: readonly Task[];
  onOpenFile: (path: string) => void;
  /** "Änderungen ansehen" from the editor: select this file. */
  focusRequest?: ChangesFocusRequest | null;
  /** Narrow panel (right side): list above the diff. */
  stacked?: boolean;
}

const ALL = '__all__';

/** Compare a chosen history entry with the current state ("since") or show only that one change ("only"). */
type CompareMode = 'since' | 'only';

export function ChangesPanel({ projectId, changed, tasks, onOpenFile, focusRequest, stacked }: ChangesPanelProps) {
  const [source, setSource] = useState<ChangesSource>('nova');
  const [taskFilter, setTaskFilter] = useState<string>(ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [changeId, setChangeId] = useState<string>(ALL);
  const [sideBySide, setSideBySide] = useState(true);
  const [compareMode, setCompareMode] = useState<CompareMode>('since');
  const canSnapshot = useSupports('files.snapshot');

  const git = useRpc('git.status', source === 'git' ? { projectId } : null, {
    refetchOn: ['files.changed'],
    eventFilter: (e) => e.type === 'files.changed' && e.payload.projectId === projectId,
    keepPreviousData: true,
  });
  const initGit = useMutation('git.init', { successToast: 'Git wurde für das Projekt eingerichtet', onSuccess: () => void git.refetch() });

  const taskTitles = useMemo(() => new Map(tasks.map((t) => [t.id, t.title])), [tasks]);
  const novaFiles = changed.data ?? [];
  const taskOptions = useMemo(() => {
    const ids = new Set(novaFiles.flatMap((f) => f.taskIds));
    return [...ids].map((id) => ({ value: id, label: truncate(taskTitles.get(id) ?? `Aufgabe ${id}`, 60) }));
  }, [novaFiles, taskTitles]);
  const filteredNova = taskFilter === ALL ? novaFiles : novaFiles.filter((f) => f.taskIds.includes(taskFilter));
  const gitFiles = git.data?.files ?? [];

  // Selection follows requests from the editor ("Änderungen ansehen").
  useEffect(() => {
    if (!focusRequest) return;
    const onlyInGit = !!changed.data && !changed.data.some((f) => f.path === focusRequest.path);
    setSource(onlyInGit ? 'git' : 'nova');
    setTaskFilter(ALL);
    setSelected(focusRequest.path);
    setChangeId(ALL);
    // Only react to new requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.token]);

  // Keep a valid selection.
  const listPaths = source === 'nova' ? filteredNova.map((f) => f.path) : gitFiles.map((f) => f.path);
  const effectiveSelected = selected && (listPaths.includes(selected) || focusRequest?.path === selected) ? selected : (listPaths[0] ?? null);

  useEffect(() => setChangeId(ALL), [effectiveSelected, source]);

  const selectedNova = novaFiles.find((f) => f.path === effectiveSelected) ?? null;
  const selectedGit = gitFiles.find((f) => f.path === effectiveSelected) ?? null;

  const history = useRpc('files.history', source === 'nova' && effectiveSelected ? { projectId, path: effectiveSelected, limit: 50 } : null, {
    refetchOn: ['files.changed'],
    eventFilter: (e) => e.type === 'files.changed' && e.payload.projectId === projectId,
  });
  const novaHistory = (history.data ?? []).filter((r) => r.actor === 'nova' && !r.reverted && (taskFilter === ALL || r.taskId === taskFilter));
  const selectedRecord = source === 'nova' && changeId !== ALL ? (novaHistory.find((r) => String(r.id) === changeId) ?? null) : null;
  // "Nur diese Änderung": the stored versions before and after that one change (null hash = file did not exist).
  const single = canSnapshot && compareMode === 'only' && selectedRecord !== null;
  const beforeHash = single ? (selectedRecord?.beforeHash ?? null) : null;
  const afterHash = single ? (selectedRecord?.afterHash ?? null) : null;
  const beforeSnap = useRpc('files.snapshot', beforeHash ? { projectId, hash: beforeHash } : null);
  const afterSnap = useRpc('files.snapshot', afterHash ? { projectId, hash: afterHash } : null);

  const fileEvent = (e: AnyNovaEvent) =>
    e.type === 'files.changed' && e.payload.projectId === projectId && !!effectiveSelected && e.payload.paths.includes(effectiveSelected);
  const novaDiff = useRpc(
    'files.diff',
    source === 'nova' && effectiveSelected && !single
      ? { projectId, path: effectiveSelected, ...(taskFilter !== ALL ? { taskId: taskFilter } : {}), ...(changeId !== ALL ? { changeId: Number(changeId) } : {}) }
      : null,
    { refetchOn: ['files.changed'], eventFilter: fileEvent },
  );
  const gitDiff = useRpc('git.diff', source === 'git' && effectiveSelected ? { projectId, path: effectiveSelected } : null, { refetchOn: ['files.changed'], eventFilter: fileEvent });

  // One view model for the three sources (NOVA diff, git diff, single change from snapshots).
  let diff: { original: string; modified: string; binary: boolean } | undefined;
  let diffError: unknown = null;
  let diffLoading = false;
  let retryDiff: () => void;
  if (single) {
    const beforeMissing = beforeHash !== null && beforeSnap.data === undefined;
    const afterMissing = afterHash !== null && afterSnap.data === undefined;
    diffError = (beforeMissing && beforeSnap.error) || (afterMissing && afterSnap.error) || null;
    diffLoading = beforeMissing || afterMissing;
    diff = diffLoading
      ? undefined
      : {
          original: beforeHash ? (beforeSnap.data?.content ?? '') : '',
          modified: afterHash ? (afterSnap.data?.content ?? '') : '',
          binary: Boolean((beforeHash && beforeSnap.data?.binary) || (afterHash && afterSnap.data?.binary)),
        };
    retryDiff = () => {
      if (beforeSnap.error) void beforeSnap.refetch();
      if (afterSnap.error) void afterSnap.refetch();
    };
  } else {
    const state = source === 'nova' ? novaDiff : gitDiff;
    diff = source === 'nova' ? novaDiff.data : gitDiff.data?.[0];
    diffError = state.error;
    diffLoading = state.loading;
    retryDiff = () => void state.refetch();
  }

  const list =
    source === 'nova' ? (
      changed.error && !changed.data ? (
        <ErrorState compact error={changed.error} title="Änderungen konnten nicht geladen werden" onRetry={() => void changed.refetch()} />
      ) : !changed.data ? (
        <LoadingState compact />
      ) : filteredNova.length === 0 ? (
        <EmptyState
          compact
          icon={Bot}
          title={taskFilter === ALL ? 'NOVA hat noch keine Dateien geändert' : 'Diese Aufgabe hat keine Dateien geändert'}
          description="Sobald ein Agent Dateien anlegt oder ändert, erscheinen sie hier mit einem Vergleich."
        />
      ) : (
        <FileList
          label="Von NOVA geänderte Dateien"
          items={filteredNova.map((f) => ({ path: f.path, file: f, gitCode: f.gitStatus }))}
          selected={effectiveSelected}
          onSelect={setSelected}
        />
      )
    ) : git.error && !git.data ? (
      <ErrorState compact error={git.error} title="Der Git-Status konnte nicht geladen werden" onRetry={() => void git.refetch()} />
    ) : !git.data ? (
      <LoadingState compact />
    ) : !git.data.isRepo ? (
      <EmptyState
        compact
        icon={GitBranch}
        title="Kein Git-Repository"
        description="Mit Git lassen sich Änderungen genau nachverfolgen und zurücksetzen."
        actions={
          <Button size="sm" icon={GitBranch} loading={initGit.loading} onClick={() => void initGit.run({ projectId })}>
            Git einrichten
          </Button>
        }
      />
    ) : gitFiles.length === 0 ? (
      <EmptyState compact icon={GitCompareArrows} title="Keine offenen Git-Änderungen" description={git.data.branch ? `Alles ist im Zweig „${git.data.branch}“ gespeichert.` : 'Der Arbeitsstand entspricht dem letzten Commit.'} />
    ) : (
      <FileList
        label="Offene Git-Änderungen"
        items={gitFiles.map((f) => ({ path: f.path, file: novaFiles.find((n) => n.path === f.path) ?? null, gitCode: porcelainCode(f) }))}
        selected={effectiveSelected}
        onSelect={setSelected}
      />
    );

  let diffBody;
  if (!effectiveSelected) {
    diffBody = <EmptyState compact icon={FileDiff} title="Datei auswählen" description="Links eine Datei auswählen, um die Unterschiede zu sehen." />;
  } else if (diffError && !diff) {
    diffBody = <ErrorState compact error={diffError} title="Der Vergleich konnte nicht geladen werden" onRetry={retryDiff} />;
  } else if (!diff) {
    diffBody = diffLoading ? <LoadingState compact label="Vergleich wird geladen …" /> : <EmptyState compact icon={FileDiff} title="Keine Unterschiede gefunden" />;
  } else if (diff.binary) {
    diffBody = <EmptyState compact icon={FileDiff} title="Keine Textdatei" description="Für Bilder und andere Binärdateien ist kein Textvergleich möglich." />;
  } else if (diff.original === diff.modified) {
    diffBody = <EmptyState compact icon={FileDiff} title="Keine Unterschiede" description="Der aktuelle Stand entspricht dem Vergleichsstand." />;
  } else {
    let originalLabel = source === 'git' ? 'Letzter Commit' : changeId !== ALL ? 'Vor dieser Änderung' : taskFilter !== ALL ? 'Vor der Aufgabe' : 'Vor den Änderungen von NOVA';
    let modifiedLabel = selectedNova?.op === 'delete' ? 'Gelöscht' : 'Aktueller Stand';
    if (diff.original === '' && selectedNova?.op === 'create' && !single) originalLabel = 'Neu angelegt (vorher leer)';
    if (single) {
      originalLabel = beforeHash ? 'Vor dieser Änderung' : 'Neu angelegt (vorher leer)';
      modifiedLabel = afterHash ? 'Nach dieser Änderung' : 'Gelöscht';
    }
    diffBody = (
      <DiffView
        key={`${source}|${effectiveSelected}`}
        original={diff.original}
        modified={diff.modified}
        language={languageForPath(effectiveSelected)}
        originalLabel={originalLabel}
        modifiedLabel={modifiedLabel}
        sideBySide={sideBySide}
        label={`Vergleich von ${effectiveSelected}`}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
        <SegmentedControl
          size="sm"
          label="Quelle der Änderungen"
          value={source}
          onChange={setSource}
          options={[
            { value: 'nova', label: 'Von NOVA', icon: Bot, count: novaFiles.length },
            { value: 'git', label: 'Git', icon: GitBranch },
          ]}
        />
        {source === 'nova' && taskOptions.length > 0 && (
          <Select
            size="sm"
            aria-label="Nach Aufgabe filtern"
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
            options={[{ value: ALL, label: 'Alle Aufgaben' }, ...taskOptions]}
            containerClassName="w-56 max-w-full"
          />
        )}
      </div>
      <div className={cn('flex min-h-0 flex-1', stacked ? 'flex-col' : 'flex-row')}>
        <div className={cn('min-h-0 overflow-auto border-border', stacked ? 'max-h-[40%] shrink-0 border-b' : 'w-72 max-w-[40%] shrink-0 border-r')}>{list}</div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {effectiveSelected && (
            <DiffHeader
              projectId={projectId}
              path={effectiveSelected}
              file={source === 'nova' ? selectedNova : (novaFiles.find((n) => n.path === effectiveSelected) ?? null)}
              gitCode={source === 'git' ? (selectedGit ? porcelainCode(selectedGit) : null) : (selectedNova?.gitStatus ?? null)}
              taskTitles={taskTitles}
              history={source === 'nova' ? novaHistory : []}
              changeId={changeId}
              onChangeId={setChangeId}
              compareMode={canSnapshot && selectedRecord ? compareMode : null}
              onCompareMode={setCompareMode}
              sideBySide={sideBySide}
              onToggleSideBySide={() => setSideBySide((v) => !v)}
              onOpenFile={onOpenFile}
            />
          )}
          <div className="min-h-0 flex-1">{diffBody}</div>
        </div>
      </div>
    </div>
  );
}

interface ListItem {
  path: string;
  file: ChangedFile | null;
  gitCode: string | null;
}

function FileList({ label, items, selected, onSelect }: { label: string; items: ListItem[]; selected: string | null; onSelect: (path: string) => void }) {
  return (
    <ul aria-label={label} className="py-1">
      {items.map(({ path, file, gitCode }) => {
        const git = gitStatusInfo(gitCode);
        const op = file ? metaOf(CHANGE_OP, file.op) : null;
        const isSelected = path === selected;
        const dir = parentPath(path);
        return (
          <li key={path}>
            <button
              type="button"
              aria-current={isSelected || undefined}
              onClick={() => onSelect(path)}
              title={path}
              className={cn(
                'flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px] focus-visible:outline-offset-[-2px]',
                isSelected ? 'bg-violet/14' : 'hover:bg-surface-2',
              )}
            >
              <FileIcon name={path} />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className={cn('truncate', file?.op === 'delete' && 'line-through decoration-danger/70')}>{fileName(path)}</span>
                {dir && <span className="truncate text-[11px] text-subtle">{dir}</span>}
              </span>
              {file?.modifiedSinceNova && <Hand aria-label="Danach von Hand geändert" className="h-3.5 w-3.5 shrink-0 text-warning-fg" />}
              {file?.byNova && <span aria-label="Von NOVA geändert" title="Von NOVA geändert" className="h-2 w-2 shrink-0 rounded-full bg-violet" role="img" />}
              {op && (
                <span title={op.label} aria-label={op.label} role="img" className={cn('inline-flex shrink-0', toneClasses[op.tone].text)}>
                  <op.icon aria-hidden className="h-3.5 w-3.5" />
                </span>
              )}
              {git && (
                <span title={git.label} className={cn('w-3 shrink-0 text-center font-mono text-[11px] font-semibold', toneClasses[git.tone].text)}>
                  <span aria-hidden>{git.letter}</span>
                  <span className="sr-only">{git.label}</span>
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface DiffHeaderProps {
  projectId: string;
  path: string;
  file: ChangedFile | null;
  gitCode: string | null;
  taskTitles: ReadonlyMap<string, string>;
  history: ChangeRecord[];
  changeId: string;
  onChangeId: (id: string) => void;
  /** null = no single history entry selected (or the daemon cannot read older versions). */
  compareMode: CompareMode | null;
  onCompareMode: (mode: CompareMode) => void;
  sideBySide: boolean;
  onToggleSideBySide: () => void;
  onOpenFile: (path: string) => void;
}

function DiffHeader({ projectId, path, file, gitCode, taskTitles, history, changeId, onChangeId, compareMode, onCompareMode, sideBySide, onToggleSideBySide, onOpenFile }: DiffHeaderProps) {
  const git = gitStatusInfo(gitCode);
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-1.5">
      <span className="min-w-0 truncate font-mono text-xs text-text" title={path}>
        {path}
      </span>
      {file && <StatusBadge meta={metaOf(CHANGE_OP, file.op)} />}
      {file?.byNova && (
        <Badge tone="violet" icon={Bot}>
          Von NOVA geändert
        </Badge>
      )}
      {file?.modifiedSinceNova && (
        <Badge tone="warning" icon={Hand} title="Nach der letzten Änderung von NOVA wurde die Datei noch von Hand oder von einem anderen Programm geändert.">
          Danach von Hand geändert
        </Badge>
      )}
      {git && <Badge tone={git.tone}>{git.label}</Badge>}
      {file && file.taskIds.length > 0 && (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
          {file.taskIds.length === 1 ? 'Aufgabe:' : 'Aufgaben:'}
          {file.taskIds.slice(0, 3).map((id, i) => (
            <span key={id} className="min-w-0 truncate">
              <Link to={paths.project(projectId, { tab: 'tasks', task: id })}>{truncate(taskTitles.get(id) ?? id, 40)}</Link>
              {i < Math.min(file.taskIds.length, 3) - 1 ? ',' : ''}
            </span>
          ))}
          {file.taskIds.length > 3 && <span>+{file.taskIds.length - 3}</span>}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {history.length > 1 && (
          <Select
            size="sm"
            aria-label="Vergleichsstand"
            value={changeId}
            onChange={(e) => onChangeId(e.target.value)}
            options={[
              { value: ALL, label: 'Alle Änderungen von NOVA' },
              ...history.map((r) => ({
                value: String(r.id),
                label: `Seit ${formatRelativeTime(r.ts)}${r.taskId ? ` · ${truncate(taskTitles.get(r.taskId) ?? r.taskId, 32)}` : ''}`,
              })),
            ]}
            containerClassName="w-60"
          />
        )}
        {compareMode && (
          <SegmentedControl
            size="sm"
            label="Art des Vergleichs"
            value={compareMode}
            onChange={onCompareMode}
            options={[
              { value: 'since', label: 'Bis heute' },
              { value: 'only', label: 'Nur diese Änderung' },
            ]}
          />
        )}
        <IconButton icon={sideBySide ? Rows2 : Columns2} label={sideBySide ? 'Untereinander vergleichen' : 'Nebeneinander vergleichen'} size="sm" onClick={onToggleSideBySide} />
        <Button size="sm" variant="ghost" icon={Code} onClick={() => onOpenFile(path)} disabled={file?.op === 'delete'}>
          Im Editor öffnen
        </Button>
      </div>
    </div>
  );
}
