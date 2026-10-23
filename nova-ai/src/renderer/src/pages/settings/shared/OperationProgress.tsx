// Inline progress of a long daemon operation (backup, export, import …) while its RPC is pending.
// The daemon registers an Operation for these calls and reports it via 'operation.updated'; the global
// "Laufende Vorgänge" menu shows it too – this component shows it right where the user clicked.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Operation, OperationKind } from '@shared/schemas';
import { useNovaEvent } from '../../../hooks/useEvents';
import { useMutation } from '../../../hooks/useRpc';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { Button } from '../../../components/ui/Button';
import { ProgressBar } from '../../../components/ui/ProgressBar';

/** Clock tolerance between UI and daemon when matching an operation to the click that started it. */
const START_TOLERANCE_MS = 5000;

/**
 * Tracks the newest operation of the given kinds that started while `active` is true.
 * @example const op = useTrackedOperation(['backup'], create.loading);
 */
export function useTrackedOperation(kinds: readonly OperationKind[], active: boolean, projectId?: string | null): Operation | null {
  const [op, setOp] = useState<Operation | null>(null);
  const since = useRef(0);
  const kindsKey = kinds.join('|');

  useEffect(() => {
    if (!active) {
      setOp(null);
      return;
    }
    since.current = Date.now() - START_TOLERANCE_MS;
    let cancelled = false;
    // An operation may have started before the event subscription saw it.
    const timer = setTimeout(() => {
      api('operations.list', { activeOnly: true })
        .then((ops) => {
          if (cancelled) return;
          const match = ops
            .filter((o) => kindsKey.split('|').includes(o.kind) && o.startedAt >= since.current && (projectId === undefined || o.projectId === projectId))
            .sort((a, b) => b.startedAt - a.startedAt)[0];
          if (match) setOp((prev) => prev ?? match);
        })
        .catch(() => {});
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, kindsKey, projectId]);

  useNovaEvent(
    'operation.updated',
    (o) => {
      if (!kindsKey.split('|').includes(o.kind) || o.startedAt < since.current) return;
      if (projectId !== undefined && o.projectId !== projectId) return;
      setOp((prev) => (prev && prev.id !== o.id && prev.startedAt > o.startedAt ? prev : o));
    },
    active,
  );

  return active ? op : null;
}

export interface OperationProgressProps {
  operation: Operation | null;
  /** Shown while no operation has been reported yet (indeterminate bar). */
  pendingLabel?: string;
  /** Render even before the operation is known (when the action is running). */
  active?: boolean;
  className?: string;
}

/** Progress bar + message + "Abbrechen" for a tracked operation. Renders nothing when idle. */
export function OperationProgress({ operation, pendingLabel = 'Wird ausgeführt …', active = false, className }: OperationProgressProps) {
  const cancel = useMutation('operations.cancel', { successToast: 'Vorgang wird abgebrochen' });
  if (!operation && !active) return null;
  const running = !operation || operation.status === 'running';
  if (!running) return null;
  const label = operation?.title ?? pendingLabel;
  return (
    <div className={cn('rounded-lg border border-border bg-surface-2/60 px-3 py-2', className)} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-medium text-text">{label}</p>
        {operation?.cancellable && (
          <Button size="sm" variant="ghost" icon={X} loading={cancel.loading} onClick={() => void cancel.run({ id: operation.id })}>
            Abbrechen
          </Button>
        )}
      </div>
      <ProgressBar className="mt-1.5" value={operation?.progress ?? null} label={label} showValue={operation?.progress != null} />
      {operation?.message && <p className="mt-1 truncate text-[11px] text-muted">{operation.message}</p>}
    </div>
  );
}
