// Usage of the selected period (UI-SPEC §4 / §7): budget.breakdown grouped by provider/model/project/day with simple
// bars, and the call-level table from budget.usage. Estimated costs are always marked.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { BarChart3, ListOrdered } from 'lucide-react';
import type { BudgetBreakdownRow, UsageRecord } from '@shared/schemas';
import { Badge, Card, type Column, EmptyState, ErrorState, LoadingState, SegmentedControl, Select, Table } from '../../components/ui';
import { useRpc, useSupports } from '../../hooks';
import { formatDateTime, formatDuration, formatTokens, formatUsd, splitModelRef } from '../../lib/format';
import { paths } from '../../lib/paths';
import { dayLabel, PERIOD_OPTIONS, periodStart, type Period } from './costUtils';

type GroupBy = 'provider' | 'model' | 'project' | 'day';
const GROUP_OPTIONS: Array<{ value: GroupBy; label: string }> = [
  { value: 'provider', label: 'Anbieter' },
  { value: 'model', label: 'Modell' },
  { value: 'project', label: 'Projekt' },
  { value: 'day', label: 'Tag' },
];

export interface UsageSectionProps {
  projectNames: Map<string, string>;
  providerNames: Map<string, string>;
}

function CostCell({ cost, estimated, paid }: { cost: number; estimated: boolean; paid?: boolean }) {
  if (paid === false && cost === 0) return <span className="text-muted">kostenlos</span>;
  return (
    <span className="whitespace-nowrap tabular-nums">
      {formatUsd(cost)}
      {estimated && (
        <Badge tone="warning" variant="outline" className="ml-1" title="Dieser Wert ist eine Schätzung.">
          geschätzt
        </Badge>
      )}
    </span>
  );
}

export function UsageSection({ projectNames, providerNames }: UsageSectionProps) {
  const [period, setPeriod] = useState<Period>('month');
  const [groupBy, setGroupBy] = useState<GroupBy>('provider');
  const [projectId, setProjectId] = useState('');
  const from = useMemo(() => periodStart(period), [period]);
  const supportsBreakdown = useSupports('budget.breakdown');

  const breakdown = useRpc('budget.breakdown', supportsBreakdown ? { from, groupBy } : null, { refetchOn: ['budget.updated'], keepPreviousData: true });
  const usage = useRpc('budget.usage', { from, projectId: projectId || undefined, limit: 500 }, { refetchOn: ['budget.updated'], keepPreviousData: true });

  const providerLabel = (id: string) => providerNames.get(id) ?? id;
  const projectLabel = (id: string | null) => (id ? (projectNames.get(id) ?? 'Entferntes Projekt') : 'Ohne Projekt');
  const keyLabel = (row: BudgetBreakdownRow) => {
    if (groupBy === 'provider') return providerLabel(row.key);
    if (groupBy === 'project') return projectNames.get(row.key) ?? (row.key === 'ohne Projekt' || !row.key ? 'Ohne Projekt' : 'Entferntes Projekt');
    if (groupBy === 'day') return dayLabel(row.key);
    const ref = splitModelRef(row.key);
    return ref ? `${ref.modelId} (${providerLabel(ref.providerId)})` : row.key;
  };

  const rows = breakdown.data ?? [];
  const maxCost = Math.max(0, ...rows.map((r) => r.costUsd));
  const maxCalls = Math.max(0, ...rows.map((r) => r.calls));
  const breakdownColumns: Column<BudgetBreakdownRow>[] = [
    {
      key: 'key',
      header: GROUP_OPTIONS.find((g) => g.value === groupBy)?.label ?? 'Gruppe',
      sortValue: (r) => (groupBy === 'day' ? r.key : keyLabel(r)),
      cell: (r) => {
        const share = maxCost > 0 ? r.costUsd / maxCost : maxCalls > 0 ? r.calls / maxCalls : 0;
        return (
          <div className="min-w-40">
            <div className="truncate" title={r.key}>
              {groupBy === 'project' && projectNames.has(r.key) ? <Link to={paths.project(r.key)}>{keyLabel(r)}</Link> : keyLabel(r)}
            </div>
            <div className="mt-1 h-1 rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full bg-nova-gradient" style={{ width: `${Math.max(2, share * 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    { key: 'calls', header: 'Aufrufe', align: 'right', sortValue: (r) => r.calls, cell: (r) => <span className="tabular-nums">{r.calls}</span> },
    { key: 'in', header: 'Tokens ein', align: 'right', sortValue: (r) => r.inputTokens, cell: (r) => <span className="tabular-nums">{formatTokens(r.inputTokens)}</span> },
    { key: 'out', header: 'Tokens aus', align: 'right', sortValue: (r) => r.outputTokens, cell: (r) => <span className="tabular-nums">{formatTokens(r.outputTokens)}</span> },
    { key: 'dur', header: 'Laufzeit', align: 'right', sortValue: (r) => r.durationMs, cell: (r) => <span className="whitespace-nowrap">{formatDuration(r.durationMs)}</span> },
    { key: 'cost', header: 'Kosten', align: 'right', sortValue: (r) => r.costUsd, cell: (r) => <CostCell cost={r.costUsd} estimated={r.costEstimated} /> },
  ];

  const usageColumns: Column<UsageRecord>[] = [
    { key: 'ts', header: 'Zeit', sortValue: (u) => u.ts, cell: (u) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(u.ts)}</span> },
    { key: 'provider', header: 'Anbieter', sortValue: (u) => providerLabel(u.providerId), cell: (u) => providerLabel(u.providerId) },
    {
      key: 'model',
      header: 'Modell',
      sortValue: (u) => u.modelId,
      cell: (u) => (
        <span className="block max-w-56 truncate font-mono text-xs" title={u.modelId}>
          {u.modelId}
        </span>
      ),
    },
    {
      key: 'project',
      header: 'Projekt',
      sortValue: (u) => projectLabel(u.projectId),
      cell: (u) => (u.projectId && projectNames.has(u.projectId) ? <Link to={paths.project(u.projectId, { tab: 'tasks', task: u.taskId ?? undefined })}>{projectLabel(u.projectId)}</Link> : projectLabel(u.projectId)),
    },
    { key: 'in', header: 'Tokens ein', align: 'right', sortValue: (u) => u.inputTokens, cell: (u) => <span className="tabular-nums">{formatTokens(u.inputTokens)}</span> },
    { key: 'out', header: 'Tokens aus', align: 'right', sortValue: (u) => u.outputTokens, cell: (u) => <span className="tabular-nums">{formatTokens(u.outputTokens)}</span> },
    { key: 'dur', header: 'Dauer', align: 'right', sortValue: (u) => u.durationMs, cell: (u) => <span className="whitespace-nowrap">{formatDuration(u.durationMs)}</span> },
    { key: 'cost', header: 'Kosten', align: 'right', sortValue: (u) => u.costUsd, cell: (u) => <CostCell cost={u.costUsd} estimated={u.costEstimated} paid={u.paid} /> },
  ];

  const projectOptions = [...projectNames.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de')).map(([value, label]) => ({ value, label }));
  const usageRows = usage.data ?? [];

  return (
    <section className="space-y-3" aria-labelledby="usage-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="usage-heading" className="text-[15px] font-semibold">
            Verbrauch
          </h2>
          <p className="mt-0.5 text-xs text-muted">Alle Modellaufrufe – lokale Aufrufe sind kostenlos, werden aber mit Tokens und Laufzeit gezählt.</p>
        </div>
        <SegmentedControl<Period> label="Zeitraum" options={PERIOD_OPTIONS} value={period} onChange={setPeriod} />
      </div>

      {supportsBreakdown && (
        <Card title="Aufteilung" icon={BarChart3} padding="none" actions={<SegmentedControl<GroupBy> size="sm" label="Aufteilen nach" options={GROUP_OPTIONS} value={groupBy} onChange={setGroupBy} />}>
          <div className="px-1 pb-1">
            {breakdown.loading ? (
              <LoadingState compact />
            ) : breakdown.error && !breakdown.data ? (
              <ErrorState compact error={breakdown.error} onRetry={() => void breakdown.refetch()} />
            ) : (
              <Table
                columns={breakdownColumns}
                rows={rows}
                rowKey={(r) => r.key}
                caption="Aufteilung der Kosten"
                dense
                empty={<EmptyState compact icon={BarChart3} title="Keine Aufrufe in diesem Zeitraum" />}
              />
            )}
          </div>
        </Card>
      )}

      <Card
        title="Einzelne Aufrufe"
        icon={ListOrdered}
        padding="none"
        actions={<Select size="sm" aria-label="Projekt filtern" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Alle Projekte" options={projectOptions} containerClassName="w-48" />}
      >
        <div className="px-1 pb-1">
          {usage.loading ? (
            <LoadingState compact />
          ) : usage.error && !usage.data ? (
            <ErrorState compact error={usage.error} onRetry={() => void usage.refetch()} />
          ) : (
            <Table
              columns={usageColumns}
              rows={usageRows}
              rowKey={(u) => u.id}
              caption="Einzelne Modellaufrufe"
              dense
              stickyHeader
              initialSort={{ key: 'ts', dir: 'desc' }}
              className="max-h-[480px] overflow-y-auto"
              empty={<EmptyState compact icon={ListOrdered} title="Keine Aufrufe in diesem Zeitraum" description="Sobald Agenten Modelle verwenden, erscheinen die Aufrufe hier." />}
            />
          )}
          {usageRows.length >= 500 && <p className="px-3 py-2 text-[11px] text-muted">Es werden die neuesten 500 Aufrufe angezeigt.</p>}
        </div>
      </Card>
    </section>
  );
}
