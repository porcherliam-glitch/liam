import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { useDaemonStore } from '../../stores/daemon';
import { UNCLEAN_SHUTDOWN_TEXT } from '../../lib/texts';
import { formatDateTime } from '../../lib/format';

function storageKey(at: number): string {
  return `nova.shutdownNotice.${at}`;
}

function isDismissed(at: number): boolean {
  try {
    return globalThis.localStorage?.getItem(storageKey(at)) === '1';
  } catch {
    return false;
  }
}

/**
 * Info banner when the daemon was not shut down cleanly last time (DaemonStatus.previousShutdown.clean=false).
 * Dismissed per shutdown event.
 */
export function ShutdownNotice() {
  const shutdown = useDaemonStore((s) => s.status?.previousShutdown ?? null);
  const connected = useDaemonStore((s) => s.connection?.state === 'connected');
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  if (!connected || !shutdown || shutdown.clean || dismissedAt === shutdown.at || isDismissed(shutdown.at)) return null;

  const dismiss = () => {
    try {
      globalThis.localStorage?.setItem(storageKey(shutdown.at), '1');
    } catch {
      /* storage unavailable – hide for this session only */
    }
    setDismissedAt(shutdown.at);
  };

  return (
    <div role="status" className="flex items-start gap-2.5 border-b border-info/30 bg-info/8 px-5 py-2">
      <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-info-fg" />
      <p className="min-w-0 flex-1 text-xs text-text">
        {UNCLEAN_SHUTDOWN_TEXT}
        <span className="text-muted">
          {' '}
          ({formatDateTime(shutdown.at)}
          {shutdown.reason ? ` – ${shutdown.reason}` : ''})
        </span>
      </p>
      <button type="button" onClick={dismiss} aria-label="Hinweis schließen" title="Hinweis schließen" className="rounded p-0.5 text-muted hover:bg-surface-2 hover:text-text">
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
