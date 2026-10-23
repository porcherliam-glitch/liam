// Wissen (UI-SPEC §4 UI-4, MASTERPROMPT §10): the cross-project knowledge base (memory.list projectId null),
// search across all projects (memory.search includeGlobal), add/edit/delete, "teilbar" toggle with explanation,
// export/import via the file dialogs and clearing the global knowledge base.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, ChevronDown, Download, Eraser, FolderKanban, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { MemoryEntry, MemoryKind, MemorySearchResult } from '@shared/schemas';
import { Page } from '../../components/layout/Page';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, LoadingState, SegmentedControl, Select, StatusBadge, Switch } from '../../components/ui';
import { RelativeTime } from '../../components/common';
import { useDebouncedValue, useMutation, useProjectNames, useRpc } from '../../hooks';
import { cn } from '../../lib/cn';
import { plural } from '../../lib/format';
import { MEMORY_KIND, MEMORY_SOURCE, metaOf } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { chooseFile, chooseSaveFile, dialogUnavailable, JSON_FILTER, revealInExplorer, todayStamp } from '../settings/shared/files';
import { OperationProgress, useTrackedOperation } from '../settings/shared/OperationProgress';
import { Notice } from '../settings/shared/ui';
import { KNOWLEDGE_KIND_ORDER, KnowledgeEntryDialog, SHAREABLE_EXPLANATION } from './KnowledgeEntryDialog';

type Scope = 'global' | 'all';
const SCOPE_OPTIONS: Array<{ value: Scope; label: string }> = [
  { value: 'global', label: 'Wissensdatenbank' },
  { value: 'all', label: 'Alle Projekte' },
];

type Entry = MemoryEntry & { snippet?: string };

export default function KnowledgePage() {
  const [scope, setScope] = useState<Scope>('global');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<MemoryKind | ''>('');
  const q = useDebouncedValue(query.trim(), 300);
  const names = useProjectNames();
  const settings = useRpc('settings.get', undefined, { refetchOn: ['settings.updated'] });

  const list = useRpc('memory.list', scope === 'global' ? { projectId: null, limit: 2000 } : { limit: 2000 }, { refetchOn: ['memory.updated'], keepPreviousData: true });
  const search = useRpc('memory.search', q ? (scope === 'global' ? { query: q, projectId: null, includeGlobal: true, limit: 100 } : { query: q, includeGlobal: true, limit: 100 }) : null, {
    refetchOn: ['memory.updated'],
    keepPreviousData: true,
  });

  const [dialog, setDialog] = useState<{ entry: MemoryEntry | null } | null>(null);
  const [toDelete, setToDelete] = useState<MemoryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const patchEntry = (entry: MemoryEntry) => {
    list.setData((prev) => (prev ? (prev.some((m) => m.id === entry.id) ? prev.map((m) => (m.id === entry.id ? entry : m)) : [entry, ...prev]) : prev));
    search.setData((prev) => prev?.map((m) => (m.id === entry.id ? { ...m, ...entry } : m)));
  };
  const dropEntry = (id: string) => {
    list.setData((prev) => prev?.filter((m) => m.id !== id));
    search.setData((prev) => prev?.filter((m) => m.id !== id));
  };

  const share = useMutation('memory.update', {
    successToast: (r) => (r.shareable ? 'Eintrag ist jetzt teilbar' : 'Eintrag ist jetzt privat'),
    onSuccess: patchEntry,
  });
  const del = useMutation('memory.delete', {
    successToast: 'Eintrag gelöscht',
    onSuccess: (_r, p) => {
      if (p) dropEntry(p.id);
      setToDelete(null);
    },
  });
  const clear = useMutation('memory.clear', {
    successToast: (r) => (r.deleted === 1 ? '1 Eintrag gelöscht' : `${r.deleted} Einträge gelöscht`),
    onSuccess: () => {
      list.setData((prev) => prev?.filter((m) => m.projectId !== null));
      search.setData((prev) => prev?.filter((m) => m.projectId !== null));
      setConfirmClear(false);
    },
  });
  const exportMemory = useMutation('memory.export', {
    errorToast: 'Export fehlgeschlagen',
    onSuccess: (r) =>
      toast.show({
        tone: 'success',
        title: r.count === 1 ? '1 Eintrag exportiert' : `${r.count} Einträge exportiert`,
        message: r.path,
        action: { label: 'Im Explorer zeigen', onClick: () => void revealInExplorer(r.path) },
      }),
  });
  const importMemory = useMutation('memory.import', {
    errorToast: 'Import fehlgeschlagen',
    successToast: (r) => `${plural(r.imported, 'Eintrag', 'Einträge')} importiert${r.skipped > 0 ? `, ${r.skipped} übersprungen (schon vorhanden oder ungültig)` : ''}`,
    onSuccess: () => void list.refetch(),
  });
  const exportOp = useTrackedOperation(['memory_export'], exportMemory.loading);
  const importOp = useTrackedOperation(['memory_import'], importMemory.loading);

  const onExport = async () => {
    const path = await chooseSaveFile({
      title: scope === 'global' ? 'Wissensdatenbank exportieren' : 'Gesamtes Gedächtnis exportieren',
      defaultPath: scope === 'global' ? `NOVA Wissen ${todayStamp()}.json` : `NOVA Gedächtnis ${todayStamp()}.json`,
      filters: JSON_FILTER,
    });
    if (path === null) return; // cancelled
    await exportMemory.run({ ...(scope === 'global' ? { projectId: null } : {}), ...(path ? { path } : {}) });
  };
  const onImport = async () => {
    const path = await chooseFile({ title: 'Wissen importieren', filters: JSON_FILTER });
    if (path === undefined) return dialogUnavailable();
    if (path === null) return;
    await importMemory.run({ path });
  };

  const searching = q.length > 0;
  const source: Entry[] | undefined = searching ? (search.data as MemorySearchResult[] | undefined) : list.data;
  const visible = useMemo(() => (source ?? []).filter((m) => !kind || m.kind === kind), [source, kind]);
  const globalCount = (list.data ?? []).filter((m) => m.projectId === null).length;
  const loading = searching ? search.loading : list.loading;
  const error = searching ? search.error : list.error;
  const memorySettings = settings.data?.memory;

  return (
    <Page
      title="Wissen"
      description="Die projektübergreifende Wissensdatenbank: allgemeine Erkenntnisse, die NOVA in allen Projekten nutzen kann. Das Gedächtnis eines einzelnen Projekts steht im jeweiligen Projekt."
      actions={
        <>
          <Button icon={Upload} loading={importMemory.loading} onClick={() => void onImport()}>
            Importieren
          </Button>
          <Button icon={Download} loading={exportMemory.loading} onClick={() => void onExport()}>
            Exportieren
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setDialog({ entry: null })}>
            Eintrag anlegen
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {memorySettings && (!memorySettings.enabled || !memorySettings.useGlobalKnowledge) && (
          <Notice
            tone="warning"
            title={!memorySettings.enabled ? 'Das Gedächtnis ist ausgeschaltet' : 'Die Wissensdatenbank wird gerade nicht verwendet'}
            actions={
              <Link to={`${paths.settings}?section=memory`} className="text-xs font-medium">
                Zu den Einstellungen
              </Link>
            }
          >
            Einträge bleiben gespeichert, werden den Agenten aber nicht mitgegeben, bis das unter Einstellungen › Gedächtnis wieder eingeschaltet ist.
          </Notice>
        )}
        <OperationProgress operation={exportOp} active={exportMemory.loading} pendingLabel="Wissen wird exportiert …" />
        <OperationProgress operation={importOp} active={importMemory.loading} pendingLabel="Wissen wird importiert …" />

        <Card padding="none">
          <div className="flex flex-wrap items-end gap-3 border-b border-border px-4 py-3">
            <Input
              label="Suchen"
              icon={Search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={scope === 'global' ? 'In der Wissensdatenbank suchen' : 'In allen Projekten und der Wissensdatenbank suchen'}
              containerClassName="min-w-56 flex-1"
              suffix={query ? <IconButton icon={X} label="Suche leeren" size="sm" onClick={() => setQuery('')} /> : undefined}
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text">Bereich</span>
              <SegmentedControl<Scope> label="Bereich" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
            </div>
            <Select
              label="Art"
              value={kind}
              onChange={(e) => setKind(e.target.value as MemoryKind | '')}
              placeholder="Alle Arten"
              options={KNOWLEDGE_KIND_ORDER.map((k) => ({ value: k, label: MEMORY_KIND[k].label }))}
              containerClassName="w-44"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-surface-2/50 px-4 py-1.5 text-[11px] text-muted">
            <span>{searching ? `${plural(visible.length, 'Treffer', 'Treffer')} für „${q}“` : plural(visible.length, 'Eintrag', 'Einträge')}</span>
            <span className="max-w-xl">{SHAREABLE_EXPLANATION}</span>
          </div>
          {loading ? (
            <LoadingState compact />
          ) : error && !source ? (
            <ErrorState compact error={error} onRetry={() => void (searching ? search.refetch() : list.refetch())} />
          ) : visible.length === 0 ? (
            searching || kind ? (
              <EmptyState compact icon={Search} title="Nichts gefunden" description={scope === 'global' ? 'Anderen Suchbegriff versuchen oder „Alle Projekte“ wählen.' : 'Anderen Suchbegriff oder eine andere Art versuchen.'} />
            ) : (
              <EmptyState
                icon={BookOpen}
                title={scope === 'global' ? 'Die Wissensdatenbank ist noch leer' : 'Noch keine Einträge'}
                description="Hier landen allgemeine Erkenntnisse, die in mehreren Projekten helfen – von Agenten gesammelt oder selbst eingetragen."
                actions={
                  <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ entry: null })}>
                    Eintrag anlegen
                  </Button>
                }
              />
            )
          ) : (
            <ul className="divide-y divide-border">
              {visible.map((m) => (
                <EntryRow
                  key={m.id}
                  entry={m}
                  projectName={m.projectId ? (names.get(m.projectId) ?? 'Unbekanntes Projekt') : null}
                  sharing={share.loading}
                  onShare={(shareable) => void share.run({ id: m.id, shareable })}
                  onEdit={() => setDialog({ entry: m })}
                  onDelete={() => setToDelete(m)}
                />
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5">
            <p className="text-[11px] text-muted">{plural(globalCount, 'Eintrag', 'Einträge')} in der Wissensdatenbank. Projektgedächtnisse werden hier nicht gelöscht.</p>
            <Button size="sm" variant="danger" icon={Eraser} disabled={globalCount === 0} onClick={() => setConfirmClear(true)}>
              Wissensdatenbank leeren
            </Button>
          </div>
        </Card>
      </div>

      <KnowledgeEntryDialog
        open={dialog !== null}
        entry={dialog?.entry ?? null}
        projectName={dialog?.entry?.projectId ? names.get(dialog.entry.projectId) : null}
        onClose={() => setDialog(null)}
        onSaved={patchEntry}
      />
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Eintrag löschen?"
        confirmLabel="Löschen"
        loading={del.loading}
        onCancel={() => setToDelete(null)}
        onConfirm={() => (toDelete ? del.run({ id: toDelete.id }) : undefined)}
        message={
          <p>
            „{toDelete?.title}“ wird endgültig gelöscht. Agenten können dieses Wissen danach nicht mehr verwenden.
          </p>
        }
      />
      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title="Wissensdatenbank leeren?"
        confirmLabel="Alles löschen"
        loading={clear.loading}
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => clear.run({ projectId: null })}
        message={
          <>
            <p>Alle Einträge der projektübergreifenden Wissensdatenbank werden endgültig gelöscht. Das Gedächtnis der einzelnen Projekte bleibt erhalten.</p>
            <p className="text-muted">Tipp: Vorher „Exportieren“ – dann lässt sich alles wieder importieren.</p>
          </>
        }
      />
    </Page>
  );
}

interface EntryRowProps {
  entry: Entry;
  projectName: string | null;
  sharing: boolean;
  onShare: (shareable: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function EntryRow({ entry: m, projectName, sharing, onShare, onEdit, onDelete }: EntryRowProps) {
  const [expanded, setExpanded] = useState(false);
  const text = m.snippet ?? m.content;
  const long = m.content.length > 280 || m.content.split('\n').length > 4;
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[13px] font-semibold text-text">{m.title}</h3>
            <StatusBadge meta={metaOf(MEMORY_KIND, m.kind)} />
            <StatusBadge meta={metaOf(MEMORY_SOURCE, m.source)} variant="outline" />
            {projectName ? (
              <Link to={paths.project(m.projectId as string, { tab: 'memory' })} className="inline-flex">
                <Badge tone="blue" icon={FolderKanban}>
                  {projectName}
                </Badge>
              </Link>
            ) : (
              <Badge tone="violet" icon={BookOpen}>
                Wissensdatenbank
              </Badge>
            )}
          </div>
          {text && (
            <p className={cn('mt-1 text-[13px] leading-relaxed whitespace-pre-wrap text-muted', !expanded && !m.snippet && 'line-clamp-3')}>{expanded ? m.content : text}</p>
          )}
          {(long || m.snippet) && (
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)} className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-fg hover:underline">
              {expanded ? 'Weniger anzeigen' : 'Ganzen Text anzeigen'}
              <ChevronDown aria-hidden className={cn('h-3 w-3 transition-transform duration-150', expanded && 'rotate-180')} />
            </button>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-subtle">
            {m.tags.map((t) => (
              <span key={t} className="rounded bg-surface-3 px-1.5 py-px text-muted">
                #{t}
              </span>
            ))}
            <RelativeTime ts={m.updatedAt} prefix="Geändert" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5" title={SHAREABLE_EXPLANATION}>
            <Switch size="sm" checked={m.shareable} disabled={sharing} onChange={onShare} ariaLabel={`„${m.title}“ teilbar`} />
            <span aria-hidden className={cn('text-xs', m.shareable ? 'text-text' : 'text-muted')}>
              Teilbar
            </span>
          </span>
          <IconButton icon={Pencil} size="sm" label={`„${m.title}“ bearbeiten`} onClick={onEdit} />
          <IconButton icon={Trash2} size="sm" label={`„${m.title}“ löschen`} onClick={onDelete} />
        </div>
      </div>
    </li>
  );
}
