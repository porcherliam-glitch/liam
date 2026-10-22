// Gedächtnis of a project: entries grouped by kind, search (memory.search), add/edit/delete, export and clear.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Brain, ChevronRight, Download, Pencil, Plus, Search, Share2, Trash2 } from 'lucide-react';
import type { MemoryEntry, MemoryKind, MemorySearchResult, ProjectSummary } from '@shared/schemas';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, LoadingState, Select, StatusBadge } from '../../../components/ui';
import { RelativeTime } from '../../../components/common';
import { useMutation, useRpc } from '../../../hooks/useRpc';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { getBridge } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { plural } from '../../../lib/format';
import { MEMORY_KIND, MEMORY_SOURCE, metaOf } from '../../../lib/labels';
import { paths } from '../../../lib/paths';
import { toast } from '../../../stores/toasts';
import { MEMORY_KIND_ORDER, MemoryEntryDialog } from './MemoryEntryDialog';

export interface MemoryTabProps {
  project: ProjectSummary;
}

/** File name for the export ("Gedächtnis Pixel-Abenteuer.json"), without characters Windows forbids. */
export function exportFileName(projectName: string): string {
  return `Gedächtnis ${projectName.replace(/[<>:"/\\|?*]+/g, ' ').trim()}.json`;
}

export function MemoryTab({ project }: MemoryTabProps) {
  const memory = useRpc(
    'memory.list',
    { projectId: project.id, limit: 2000 },
    { refetchOn: ['memory.updated'], eventFilter: (e) => e.type === 'memory.updated' && e.payload.projectId === project.id },
  );
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 300);
  const search = useRpc('memory.search', debounced ? { query: debounced, projectId: project.id, includeGlobal: false, limit: 50 } : null, { keepPreviousData: true });
  const [kind, setKind] = useState<MemoryKind | ''>('');
  const [dialog, setDialog] = useState<{ entry: MemoryEntry | null } | null>(null);
  const [toDelete, setToDelete] = useState<MemoryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const del = useMutation('memory.delete', {
    successToast: 'Eintrag gelöscht',
    onSuccess: (_r, params) => memory.setData((prev) => prev?.filter((m) => m.id !== params?.id)),
  });
  const clear = useMutation('memory.clear', {
    successToast: (r) => (r.deleted === 1 ? '1 Eintrag gelöscht' : `${r.deleted} Einträge gelöscht`),
    onSuccess: () => memory.setData([]),
  });
  const exportMemory = useMutation('memory.export', {
    onSuccess: (r) =>
      toast.show({
        tone: 'success',
        title: r.count === 1 ? '1 Eintrag exportiert' : `${r.count} Einträge exportiert`,
        message: r.path,
        action: { label: 'Im Explorer zeigen', onClick: () => void getBridge()?.app.showInFolder(r.path).catch(() => false) },
      }),
  });

  const onExport = async () => {
    const bridge = getBridge();
    let path: string | null | undefined;
    if (bridge?.app?.saveFile) {
      try {
        path = await bridge.app.saveFile({ title: 'Gedächtnis exportieren', defaultPath: exportFileName(project.name), filters: [{ name: 'JSON-Datei', extensions: ['json'] }] });
      } catch {
        path = undefined;
      }
      if (path === null) return; // cancelled
    }
    await exportMemory.run({ projectId: project.id, ...(path ? { path } : {}) });
  };

  const all = memory.data ?? [];
  const counts = useMemo(() => {
    const c = new Map<MemoryKind, number>();
    for (const m of all) c.set(m.kind, (c.get(m.kind) ?? 0) + 1);
    return c;
  }, [all]);
  const searching = debounced.length > 0;
  const groups = useMemo(() => {
    const filtered = all.filter((m) => !kind || m.kind === kind);
    return MEMORY_KIND_ORDER.map((k) => ({ kind: k, entries: filtered.filter((m) => m.kind === k).sort((a, b) => b.updatedAt - a.updatedAt) })).filter((g) => g.entries.length > 0);
  }, [all, kind]);
  const results = (search.data ?? []).filter((m) => !kind || m.kind === kind);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="search"
            icon={Search}
            size="sm"
            aria-label="Gedächtnis durchsuchen"
            placeholder="Gedächtnis durchsuchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            containerClassName="w-72"
          />
          <Select
            size="sm"
            aria-label="Nach Art filtern"
            value={kind}
            onChange={(e) => setKind(e.target.value as MemoryKind | '')}
            options={MEMORY_KIND_ORDER.map((k) => ({ value: k, label: `${MEMORY_KIND[k].label} (${counts.get(k) ?? 0})` }))}
            placeholder={`Alle Arten (${all.length})`}
            containerClassName="w-52"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={Download} loading={exportMemory.loading} disabled={all.length === 0} onClick={() => void onExport()}>
            Exportieren
          </Button>
          <Button variant="danger" icon={Trash2} disabled={all.length === 0} onClick={() => setConfirmClear(true)}>
            Alles löschen
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setDialog({ entry: null })}>
            Eintrag hinzufügen
          </Button>
        </div>
      </div>

      {memory.loading ? (
        <LoadingState label="Gedächtnis wird geladen …" />
      ) : memory.error && !memory.data ? (
        <ErrorState error={memory.error} onRetry={() => void memory.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="Das Gedächtnis ist noch leer"
          description="Hier sammelt NOVA Ziele, Entscheidungen, Konventionen, bekannte Fehler und nächste Schritte. Eigene Einträge helfen den Agenten, das Projekt besser zu verstehen."
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setDialog({ entry: null })}>
              Eintrag hinzufügen
            </Button>
          }
        />
      ) : searching ? (
        <Card title={`Suchergebnisse für „${debounced}“`} icon={Search} padding="sm">
          {search.loading ? (
            <LoadingState compact label="Wird gesucht …" />
          ) : search.error && !search.data ? (
            <ErrorState compact error={search.error} onRetry={() => void search.refetch()} />
          ) : results.length === 0 ? (
            <EmptyState compact icon={Search} title="Nichts gefunden" description="Andere Suchbegriffe ausprobieren oder den Filter zurücksetzen." />
          ) : (
            <ul className="space-y-2" aria-label="Suchergebnisse">
              {results.map((m) => (
                <MemoryItem key={m.id} entry={m} projectId={project.id} showKind onEdit={() => setDialog({ entry: m })} onDelete={() => setToDelete(m)} />
              ))}
            </ul>
          )}
        </Card>
      ) : groups.length === 0 ? (
        <EmptyState compact icon={Brain} title="Keine Einträge dieser Art" description="Einen anderen Filter wählen." />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => {
            const meta = MEMORY_KIND[g.kind];
            return (
              <section key={g.kind} aria-label={meta.label}>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <meta.icon aria-hidden className="h-4 w-4 text-muted" />
                  {meta.label}
                  <span className="rounded-full bg-surface-3 px-2 text-xs leading-5 font-medium text-muted tabular-nums">{g.entries.length}</span>
                </h3>
                <ul className="grid gap-2 lg:grid-cols-2" aria-label={`${meta.label}: Einträge`}>
                  {g.entries.map((m) => (
                    <MemoryItem key={m.id} entry={m} projectId={project.id} onEdit={() => setDialog({ entry: m })} onDelete={() => setToDelete(m)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <MemoryEntryDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        projectId={project.id}
        entry={dialog?.entry ?? null}
        onSaved={(saved) => memory.setData((prev) => (prev ? (prev.some((m) => m.id === saved.id) ? prev.map((m) => (m.id === saved.id ? saved : m)) : [saved, ...prev]) : [saved]))}
      />
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Eintrag löschen?"
        message={<p>„{toDelete?.title}“ wird endgültig aus dem Gedächtnis entfernt.</p>}
        confirmLabel="Löschen"
        loading={del.loading}
        onConfirm={async () => {
          if (toDelete) await del.run({ id: toDelete.id });
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />
      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title={`Gesamtes Gedächtnis von „${project.name}“ löschen?`}
        message={
          <>
            <p>Alle {plural(all.length, 'Eintrag', 'Einträge')} – Ziele, Entscheidungen, bekannte Fehler und nächste Schritte – werden endgültig gelöscht. Die Agenten verlieren damit ihr Wissen über das Projekt.</p>
            <p className="mt-2 text-muted">Tipp: Vorher exportieren, um eine Sicherung zu behalten. Projektdateien und die allgemeine Wissensdatenbank bleiben unverändert.</p>
          </>
        }
        confirmLabel="Alles löschen"
        loading={clear.loading}
        onConfirm={async () => {
          await clear.run({ projectId: project.id });
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function MemoryItem({ entry: m, projectId, showKind = false, onEdit, onDelete }: { entry: MemoryEntry | MemorySearchResult; projectId: string; showKind?: boolean; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const snippet = 'snippet' in m ? m.snippet : null;
  const long = m.content.length > 220 || m.content.split('\n').length > 3;
  return (
    <li className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {showKind && <StatusBadge meta={metaOf(MEMORY_KIND, m.kind)} />}
            <h4 className="min-w-0 text-[13px] font-semibold break-words text-text">{m.title}</h4>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <IconButton icon={Pencil} size="sm" label={`„${m.title}“ bearbeiten`} onClick={onEdit} />
          <IconButton icon={Trash2} size="sm" label={`„${m.title}“ löschen`} onClick={onDelete} className="hover:text-danger-fg" />
        </div>
      </div>
      {snippet && !open ? (
        <p className="text-[13px] text-muted">{snippet}</p>
      ) : m.content ? (
        <p className={cn('text-[13px] break-words whitespace-pre-wrap text-text', !open && long && 'line-clamp-3')}>{m.content}</p>
      ) : (
        <p className="text-[13px] text-muted">Kein Inhalt.</p>
      )}
      {(long || snippet) && (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-1 self-start rounded text-xs font-medium text-blue-fg hover:underline">
          <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', open && 'rotate-90')} />
          {open ? 'Weniger' : 'Ganzen Eintrag anzeigen'}
        </button>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
        <StatusBadge meta={metaOf(MEMORY_SOURCE, m.source)} />
        {m.shareable && (
          <Badge tone="success" icon={Share2} title="Darf auch in anderen Projekten genutzt werden.">
            projektübergreifend
          </Badge>
        )}
        {m.tags.map((t) => (
          <Badge key={t}>#{t}</Badge>
        ))}
        {m.taskId && (
          <Link to={paths.project(projectId, { tab: 'tasks', task: m.taskId })} className="text-[11px]">
            Zur Aufgabe
          </Link>
        )}
        <RelativeTime ts={m.updatedAt} className="ml-auto text-subtle" />
      </div>
    </li>
  );
}
