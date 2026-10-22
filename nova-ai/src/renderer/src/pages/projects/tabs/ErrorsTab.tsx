// Fehler of a project: open errors (or all, including resolved ones) as ErrorCards (MASTERPROMPT §19).
import { useMemo } from 'react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ErrorSeverity } from '@shared/errors';
import type { ProjectSummary } from '@shared/schemas';
import { EmptyState, ErrorState, LoadingState, SegmentedControl } from '../../../components/ui';
import { ErrorCard } from '../../../components/common';
import { useRpc } from '../../../hooks/useRpc';
import { useStoredState } from '../../../hooks/useStoredState';
import { ERROR_SEVERITY } from '../../../lib/labels';

export interface ErrorsTabProps {
  project: ProjectSummary;
}

type ErrorFilter = 'open' | 'all';

const SEVERITY_RANK: Record<ErrorSeverity, number> = { critical: 0, blocker: 1, retryable: 2, warning: 3 };

export function ErrorsTab({ project }: ErrorsTabProps) {
  const [filter, setFilter] = useStoredState<ErrorFilter>('errors.project.filter', 'open');
  const errors = useRpc(
    'errors.list',
    { projectId: project.id, includeResolved: filter === 'all', limit: 300 },
    { refetchOn: ['error.raised', 'error.resolved'], eventFilter: (e) => e.type !== 'error.raised' || e.payload.projectId === project.id, keepPreviousData: true },
  );

  const list = useMemo(
    () =>
      [...(errors.data ?? [])].sort(
        (a, b) => Number(a.resolvedAt != null) - Number(b.resolvedAt != null) || SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt - a.createdAt,
      ),
    [errors.data],
  );
  const open = list.filter((e) => e.resolvedAt == null);
  const bySeverity = (Object.keys(SEVERITY_RANK) as ErrorSeverity[]).map((s) => ({ s, n: open.filter((e) => e.severity === s).length })).filter((x) => x.n > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Fehler filtern"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'open', label: 'Offen' },
            { value: 'all', label: 'Alle, auch erledigte' },
          ]}
        />
        {bySeverity.length > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Offene Fehler nach Schwere">
            {bySeverity.map(({ s, n }) => {
              const meta = ERROR_SEVERITY[s];
              return (
                <span key={s} className="inline-flex items-center gap-1">
                  <meta.icon aria-hidden className="h-3.5 w-3.5" />
                  {n} × {meta.label}
                </span>
              );
            })}
          </p>
        )}
      </div>

      {errors.loading ? (
        <LoadingState label="Fehler werden geladen …" />
      ) : errors.error && !errors.data ? (
        <ErrorState error={errors.error} onRetry={() => void errors.refetch()} />
      ) : list.length === 0 ? (
        filter === 'open' ? (
          <EmptyState icon={CircleCheck} title="Keine offenen Fehler" description="Gerade gibt es in diesem Projekt nichts zu tun. Erledigte Fehler sind unter „Alle, auch erledigte“ zu sehen." />
        ) : (
          <EmptyState icon={TriangleAlert} title="Noch keine Fehler" description="In diesem Projekt ist bisher kein Fehler aufgetreten." />
        )
      ) : (
        <ul className="space-y-3" aria-label="Fehler">
          {list.map((e) => (
            <li key={e.id}>
              <ErrorCard error={e} compact={e.resolvedAt != null} onResolved={() => void errors.refetch()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
