// Freigaben (UI-SPEC §4 Foundation): pending approvals first, history below, permanent rules.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { History, Repeat, ShieldCheck, ShieldQuestion, Trash2 } from 'lucide-react';
import type { Approval, ApprovalRule } from '@shared/schemas';
import { Page } from '../components/layout/Page';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, ErrorState, LoadingState, SectionHeader, SegmentedControl, StatusBadge, Table, type Column } from '../components/ui';
import { ApprovalCard, ApprovalStatusBadge, RelativeTime } from '../components/common';
import { useMutation, useRpc } from '../hooks/useRpc';
import { useProjectNames } from '../hooks/useProjects';
import { APPROVAL_KIND, APPROVAL_SCOPE, metaOf } from '../lib/labels';
import { paths } from '../lib/paths';

type HistoryFilter = 'all' | 'approved' | 'denied' | 'expired';
const HISTORY_PAGE = 25;

export default function ApprovalsPage() {
  const names = useProjectNames();
  const pending = useRpc('approvals.list', { status: 'pending' }, { refetchOn: ['approval.updated'] });
  const all = useRpc('approvals.list', {}, { refetchOn: ['approval.updated'] });
  const rules = useRpc('approvals.rules', undefined, { refetchOn: ['approval.updated'] });

  const onDecided = () => {
    void pending.refetch();
    void all.refetch();
    void rules.refetch();
  };

  const pendingList = useMemo(() => [...(pending.data ?? [])].sort((a, b) => a.createdAt - b.createdAt), [pending.data]);

  return (
    <Page
      title="Freigaben"
      description="Vor kritischen Aktionen – zum Beispiel Löschen, Installieren, Administratorrechte oder kostenpflichtige Modelle – fragt NOVA nach. Hier wird entschieden, was erlaubt ist."
    >
      <div className="@container space-y-8">
        <section aria-labelledby="approvals-pending" className="space-y-3">
          <SectionHeader
            title={<span id="approvals-pending">Offene Freigaben</span>}
            icon={ShieldQuestion}
            count={pending.data?.length}
            description="Die betroffenen Aufgaben warten, bis eine Entscheidung getroffen ist."
          />
          {pending.loading ? (
            <LoadingState compact />
          ) : pending.error && !pending.data ? (
            <ErrorState compact error={pending.error} onRetry={() => void pending.refetch()} />
          ) : pendingList.length === 0 ? (
            <Card>
              <EmptyState compact icon={ShieldCheck} title="Keine offenen Freigaben" description="NOVA arbeitet selbstständig weiter. Kritische Aktionen erscheinen hier zur Entscheidung." />
            </Card>
          ) : (
            <div className="grid gap-3 @5xl:grid-cols-2">
              {pendingList.map((a) => (
                <ApprovalCard key={a.id} approval={a} projectName={a.projectId ? names.get(a.projectId) : undefined} onDecided={onDecided} />
              ))}
            </div>
          )}
        </section>

        <HistorySection approvals={all.data} loading={all.loading} error={all.error} onRetry={() => void all.refetch()} names={names} />

        <RulesSection rules={rules.data} loading={rules.loading} error={rules.error} onRetry={() => void rules.refetch()} names={names} onDeleted={() => void rules.refetch()} />
      </div>
    </Page>
  );
}

// --- history --------------------------------------------------------------------

function HistorySection({
  approvals,
  loading,
  error,
  onRetry,
  names,
}: {
  approvals: Approval[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  names: Map<string, string>;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const [selected, setSelected] = useState<Approval | null>(null);

  const decided = useMemo(() => (approvals ?? []).filter((a) => a.status !== 'pending').sort((a, b) => (b.decidedAt ?? b.createdAt) - (a.decidedAt ?? a.createdAt)), [approvals]);
  const counts = useMemo(
    () => ({
      all: decided.length,
      approved: decided.filter((a) => a.status === 'approved').length,
      denied: decided.filter((a) => a.status === 'denied').length,
      expired: decided.filter((a) => a.status === 'expired').length,
    }),
    [decided],
  );
  const filtered = filter === 'all' ? decided : decided.filter((a) => a.status === filter);
  const visible = filtered.slice(0, limit);

  const columns: Column<Approval>[] = [
    {
      key: 'status',
      header: 'Entscheidung',
      width: '170px',
      sortValue: (a) => a.status,
      cell: (a) => (
        <div className="flex flex-wrap items-center gap-1">
          <ApprovalStatusBadge status={a.status} />
          {a.status === 'approved' && a.scope && <StatusBadge meta={metaOf(APPROVAL_SCOPE, a.scope)} />}
        </div>
      ),
    },
    {
      key: 'title',
      header: 'Aktion',
      sortValue: (a) => a.title,
      cell: (a) => {
        const kind = metaOf(APPROVAL_KIND, a.kind);
        return (
          <div className="min-w-0">
            <p className="truncate font-medium text-text">{a.title}</p>
            <p className="flex items-center gap-1 text-xs text-muted">
              <kind.icon aria-hidden className="h-3 w-3" />
              {kind.label}
            </p>
          </div>
        );
      },
    },
    {
      key: 'project',
      header: 'Projekt',
      sortValue: (a) => (a.projectId ? (names.get(a.projectId) ?? '') : ''),
      cell: (a) =>
        a.projectId ? (
          <Link to={paths.project(a.projectId)} onClick={(e) => e.stopPropagation()}>
            {names.get(a.projectId) ?? 'Projekt'}
          </Link>
        ) : (
          <span className="text-muted">Alle Projekte</span>
        ),
    },
    { key: 'created', header: 'Angefragt', width: '120px', sortValue: (a) => a.createdAt, cell: (a) => <RelativeTime ts={a.createdAt} className="text-muted" /> },
    { key: 'decided', header: 'Entschieden', width: '120px', sortValue: (a) => a.decidedAt ?? 0, cell: (a) => <RelativeTime ts={a.decidedAt} className="text-muted" /> },
  ];

  return (
    <section aria-labelledby="approvals-history" className="space-y-3">
      <SectionHeader
        title={<span id="approvals-history">Verlauf</span>}
        icon={History}
        count={decided.length}
        description="Bereits entschiedene und abgelaufene Anfragen. Ein Klick zeigt die Details."
        actions={
          <SegmentedControl<HistoryFilter>
            label="Verlauf filtern"
            size="sm"
            value={filter}
            onChange={(v) => {
              setFilter(v);
              setLimit(HISTORY_PAGE);
            }}
            options={[
              { value: 'all', label: 'Alle', count: counts.all },
              { value: 'approved', label: 'Erlaubt', count: counts.approved },
              { value: 'denied', label: 'Abgelehnt', count: counts.denied },
              { value: 'expired', label: 'Abgelaufen', count: counts.expired },
            ]}
          />
        }
      />
      <Card padding="none">
        {loading ? (
          <LoadingState compact />
        ) : error && !approvals ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : (
          <>
            <Table
              caption="Verlauf der Freigaben"
              columns={columns}
              rows={visible}
              rowKey={(a) => a.id}
              onRowClick={setSelected}
              empty={<EmptyState compact icon={History} title={filter === 'all' ? 'Noch keine Entscheidungen' : 'Keine Einträge für diesen Filter'} />}
            />
            {filtered.length > limit && (
              <div className="border-t border-border px-4 py-2.5 text-center">
                <Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + HISTORY_PAGE)}>
                  Weitere {Math.min(HISTORY_PAGE, filtered.length - limit)} anzeigen
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
      <Dialog open={!!selected} onClose={() => setSelected(null)} title="Freigabe im Detail" size="lg">
        {selected && <ApprovalCard approval={selected} projectName={selected.projectId ? names.get(selected.projectId) : undefined} className="border-0 bg-transparent" />}
      </Dialog>
    </section>
  );
}

// --- rules ----------------------------------------------------------------------

function RulesSection({
  rules,
  loading,
  error,
  onRetry,
  names,
  onDeleted,
}: {
  rules: ApprovalRule[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  names: Map<string, string>;
  onDeleted: () => void;
}) {
  const [toDelete, setToDelete] = useState<ApprovalRule | null>(null);
  const del = useMutation('approvals.deleteRule', {
    successToast: 'Regel entfernt – NOVA fragt wieder nach',
    onSuccess: () => {
      setToDelete(null);
      onDeleted();
    },
  });

  const columns: Column<ApprovalRule>[] = [
    {
      key: 'description',
      header: 'Erlaubte Aktion',
      sortValue: (r) => r.description,
      cell: (r) => <span className="font-medium text-text">{r.description}</span>,
    },
    {
      key: 'kind',
      header: 'Art',
      width: '220px',
      sortValue: (r) => metaOf(APPROVAL_KIND, r.kind).label,
      cell: (r) => {
        const kind = metaOf(APPROVAL_KIND, r.kind);
        return (
          <Badge tone={kind.tone} icon={kind.icon}>
            {kind.label}
          </Badge>
        );
      },
    },
    {
      key: 'scope',
      header: 'Gilt für',
      width: '180px',
      sortValue: (r) => (r.projectId ? (names.get(r.projectId) ?? '') : ''),
      cell: (r) => (r.projectId ? <Link to={paths.project(r.projectId)}>{names.get(r.projectId) ?? 'Projekt'}</Link> : <span className="text-muted">Alle Projekte</span>),
    },
    { key: 'created', header: 'Angelegt', width: '120px', sortValue: (r) => r.createdAt, cell: (r) => <RelativeTime ts={r.createdAt} className="text-muted" /> },
    {
      key: 'actions',
      header: <span className="sr-only">Aktionen</span>,
      width: '120px',
      align: 'right',
      cell: (r) => (
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setToDelete(r)} aria-label={`Regel entfernen: ${r.description}`}>
          Entfernen
        </Button>
      ),
    },
  ];

  return (
    <section aria-labelledby="approvals-rules" className="space-y-3">
      <SectionHeader
        title={<span id="approvals-rules">Dauerhafte Freigaben (Regeln)</span>}
        icon={Repeat}
        count={rules?.length}
        description="Entstehen durch „Immer erlauben“. Für diese Aktionen fragt NOVA nicht mehr nach – bis die Regel entfernt wird."
      />
      <Card padding="none">
        {loading ? (
          <LoadingState compact />
        ) : error && !rules ? (
          <ErrorState compact error={error} onRetry={onRetry} />
        ) : (
          <Table
            caption="Dauerhafte Freigaben"
            columns={columns}
            rows={rules ?? []}
            rowKey={(r) => r.id}
            initialSort={{ key: 'created', dir: 'desc' }}
            empty={<EmptyState compact icon={Repeat} title="Keine Regeln" description="Jede kritische Aktion wird einzeln abgefragt." />}
          />
        )}
      </Card>
      <ConfirmDialog
        open={!!toDelete}
        tone="danger"
        title="Regel entfernen?"
        message={
          <>
            <p>
              Für „{toDelete?.description}“ fragt NOVA künftig wieder nach, bevor die Aktion ausgeführt wird.
            </p>
            <p className="mt-2 text-muted">Laufende Aufgaben werden nicht abgebrochen.</p>
          </>
        }
        confirmLabel="Regel entfernen"
        loading={del.loading}
        onConfirm={() => toDelete && del.run({ id: toDelete.id })}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}
