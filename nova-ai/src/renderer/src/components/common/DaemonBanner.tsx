import { useState } from 'react';
import { CircleAlert, PowerOff, RotateCcw, WifiOff } from 'lucide-react';
import { cn } from '../../lib/cn';
import { getBridge } from '../../lib/api';
import { useDaemonStore } from '../../stores/daemon';
import { toast } from '../../stores/toasts';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

/**
 * Full-width banner while the background service is not connected (UI-SPEC §2):
 * German message, reason and "Dienst neu starten" (window.nova.daemon.restart()).
 */
export function DaemonBanner({ className }: { className?: string }) {
  const connection = useDaemonStore((s) => s.connection);
  const [restarting, setRestarting] = useState(false);
  if (!connection || connection.state === 'connected') return null;

  const starting = connection.state === 'connecting' || connection.state === 'starting';
  const restart = async () => {
    const bridge = getBridge();
    if (!bridge) return;
    setRestarting(true);
    try {
      const next = await bridge.daemon.restart();
      useDaemonStore.getState().setConnection(next);
      if (next.state === 'connected') toast.success('Hintergrunddienst läuft wieder');
    } catch (e) {
      toast.fromError(e, 'Neustart fehlgeschlagen');
    } finally {
      setRestarting(false);
    }
  };

  const Icon = connection.state === 'error' ? CircleAlert : connection.state === 'stopped' ? PowerOff : WifiOff;
  const title = starting
    ? 'NOVA verbindet sich mit dem Hintergrunddienst …'
    : connection.state === 'reconnecting'
      ? 'Verbindung zum Hintergrunddienst unterbrochen'
      : connection.state === 'stopped'
        ? 'Der Hintergrunddienst ist beendet'
        : 'Der Hintergrunddienst ist nicht erreichbar';

  return (
    <div
      role={starting ? 'status' : 'alert'}
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2.5',
        starting ? 'border-info/30 bg-info/8' : connection.state === 'error' ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {starting || connection.state === 'reconnecting' ? (
          <Spinner size="md" label={null} className={cn('mt-0.5', starting ? 'text-info-fg' : 'text-warning-fg')} />
        ) : (
          <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', connection.state === 'error' ? 'text-danger-fg' : 'text-warning-fg')} />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text">{title}</p>
          <p className="text-xs text-muted">
            {connection.message}
            {!starting && ' Angezeigte Daten können veraltet sein, Aktionen sind gesperrt.'}
            {connection.restartAttempts > 0 && ` (Automatische Neustarts: ${connection.restartAttempts})`}
          </p>
        </div>
      </div>
      {!starting && (
        <Button size="sm" variant={connection.state === 'error' ? 'primary' : 'secondary'} icon={RotateCcw} loading={restarting} onClick={() => void restart()}>
          Dienst neu starten
        </Button>
      )}
    </div>
  );
}
