import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Operation } from '@shared/schemas';
import { cn } from '../../lib/cn';
import { metaOf, OPERATION_KIND, OPERATION_STATUS } from '../../lib/labels';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { useNovaEvent } from '../../hooks/useEvents';
import { useSupports } from '../../stores/daemon';
import { Button } from '../ui/Button';
import { Popover } from '../ui/Popover';
import { ProgressBar } from '../ui/ProgressBar';
import { Spinner } from '../ui/Spinner';
import { StatusBadge } from '../ui/Badge';
import { LiveDuration } from '../common/RelativeTime';

/** Finished operations stay visible this long so the user sees the result. */
const KEEP_FINISHED_MS = 6000;

function OperationRow({ op }: { op: Operation }) {
  const kind = metaOf(OPERATION_KIND, op.kind);
  const cancel = useMutation('operations.cancel', { successToast: 'Vorgang wird abgebrochen' });
  const running = op.status === 'running';
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text">{op.title}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <kind.icon aria-hidden className="h-3 w-3" />
            {kind.label}
            <span aria-hidden>·</span>
            <LiveDuration from={op.startedAt} to={op.endedAt} />
          </p>
        </div>
        {running ? (
          op.cancellable && (
            <Button size="sm" variant="ghost" icon={X} loading={cancel.loading} onClick={() => void cancel.run({ id: op.id })}>
              Abbrechen
            </Button>
          )
        ) : (
          <StatusBadge meta={metaOf(OPERATION_STATUS, op.status)} />
        )}
      </div>
      {running && <ProgressBar className="mt-2" value={op.progress} label={op.title} showValue={op.progress != null} />}
      {(op.error ?? op.message) && <p className={cn('mt-1 text-xs', op.error ? 'text-danger-fg' : 'text-muted')}>{op.error ?? op.message}</p>}
    </li>
  );
}

/**
 * "Laufende Vorgänge": long daemon operations (backups, imports, restores …) with progress and cancel.
 * Only visible while something runs (or just finished).
 */
export function OperationsMenu() {
  const supported = useSupports('operations.list');
  const [open, setOpen] = useState(false);
  const [finished, setFinished] = useState<Operation[]>([]);
  const ops = useRpc('operations.list', supported ? { activeOnly: true } : null);

  useNovaEvent('operation.updated', (op) => {
    ops.setData((prev) => {
      const list = prev ?? [];
      if (op.status === 'running') return list.some((o) => o.id === op.id) ? list.map((o) => (o.id === op.id ? op : o)) : [op, ...list];
      return list.filter((o) => o.id !== op.id);
    });
    if (op.status !== 'running') setFinished((prev) => [op, ...prev.filter((o) => o.id !== op.id)].slice(0, 5));
  });

  // Drop finished entries after a short while.
  useEffect(() => {
    if (finished.length === 0) return;
    const id = setTimeout(() => setFinished((prev) => prev.filter((o) => (o.endedAt ?? 0) > Date.now() - KEEP_FINISHED_MS)), KEEP_FINISHED_MS);
    return () => clearTimeout(id);
  }, [finished]);

  const running = ops.data ?? [];
  const visible = [...running, ...finished.filter((f) => !running.some((r) => r.id === f.id))];
  if (!supported || visible.length === 0) return null;

  const label = running.length === 1 ? '1 Vorgang läuft' : running.length > 1 ? `${running.length} Vorgänge laufen` : 'Vorgänge abgeschlossen';
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Laufende Vorgänge"
      trigger={(p) => (
        <button
          type="button"
          {...p}
          title={label}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors duration-150',
            running.length ? 'border-blue/40 bg-blue/10 text-blue-fg hover:bg-blue/15' : 'border-success/40 bg-success/10 text-success-fg',
          )}
        >
          {running.length ? <Spinner size="sm" label={null} /> : null}
          <span className="hidden lg:inline">{label}</span>
          <span className="lg:hidden">{running.length || '✓'}</span>
        </button>
      )}
    >
      <div className="border-b border-border px-4 py-2.5">
        <p className="text-[13px] font-semibold">Laufende Vorgänge</p>
        <p className="text-[11px] text-muted">Lange Arbeiten des Hintergrunddienstes. Sie laufen weiter, auch wenn das Fenster geschlossen wird.</p>
      </div>
      <ul className="max-h-[420px] divide-y divide-border/70 overflow-y-auto">
        {visible.map((op) => (
          <OperationRow key={op.id} op={op} />
        ))}
      </ul>
    </Popover>
  );
}
