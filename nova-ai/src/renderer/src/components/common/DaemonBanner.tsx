import { useEffect, useState } from 'react';
import { CircleAlert, DatabaseBackup, PowerOff, RotateCcw, Stethoscope, WifiOff } from 'lucide-react';
import type { LocalBackupFile } from '@shared/bridge';
import { cn } from '../../lib/cn';
import { getBridge } from '../../lib/api';
import { formatBytes, formatDateTime } from '../../lib/format';
import { useDaemonStore } from '../../stores/daemon';
import { toast } from '../../stores/toasts';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Spinner } from '../ui/Spinner';

/**
 * Full-width banner while the background service is not connected (UI-SPEC §2):
 * German message, reason and "Dienst neu starten" (window.nova.daemon.restart()). When the service cannot start,
 * main offers recovery without it (connection.recovery): "Diagnose erstellen" and – after a database failure –
 * "Datensicherung einspielen …".
 */
export function DaemonBanner({ className }: { className?: string }) {
  const connection = useDaemonStore((s) => s.connection);
  const [restarting, setRestarting] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  if (!connection || connection.state === 'connected') return restoreOpen ? <RestoreBackupDialog onClose={() => setRestoreOpen(false)} /> : null;

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

  const recovery = connection.state === 'error' ? (connection.recovery ?? []) : [];
  const createDiagnostics = async () => {
    const bridge = getBridge();
    if (!bridge?.daemon.createDiagnostics) return;
    setDiagnosing(true);
    try {
      const r = await bridge.daemon.createDiagnostics();
      if (r.ok) toast.success('Diagnose-Paket erstellt', r.message);
      else toast.error('Diagnose nicht möglich', r.message);
    } catch (e) {
      toast.fromError(e, 'Diagnose nicht möglich');
    } finally {
      setDiagnosing(false);
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
        <div className="flex flex-wrap items-center gap-2">
          {recovery.includes('restore_backup') && (
            <Button size="sm" variant="primary" icon={DatabaseBackup} onClick={() => setRestoreOpen(true)}>
              Datensicherung einspielen …
            </Button>
          )}
          {recovery.includes('create_diagnostics') && (
            <Button size="sm" icon={Stethoscope} loading={diagnosing} onClick={() => void createDiagnostics()}>
              Diagnose erstellen
            </Button>
          )}
          <Button
            size="sm"
            variant={connection.state === 'error' && !recovery.includes('restore_backup') ? 'primary' : 'secondary'}
            icon={RotateCcw}
            loading={restarting}
            onClick={() => void restart()}
          >
            Dienst neu starten
          </Button>
        </div>
      )}
      {restoreOpen && <RestoreBackupDialog onClose={() => setRestoreOpen(false)} />}
    </div>
  );
}

/**
 * Restoring one of NOVA's automatic database backups while the service cannot start (damaged database). Main checks
 * the backup (integrity, NOVA version) before it is used; the damaged database is kept in the backups folder.
 */
function RestoreBackupDialog({ onClose }: { onClose: () => void }) {
  const [backups, setBackups] = useState<LocalBackupFile[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const bridge = getBridge();
    if (!bridge?.daemon.listBackups) {
      setBackups([]);
      return;
    }
    bridge.daemon
      .listBackups()
      .then((list) => {
        if (cancelled) return;
        setBackups(list);
        setSelected(list[0]?.path ?? null);
      })
      .catch(() => !cancelled && setBackups([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const restore = async () => {
    const bridge = getBridge();
    if (!bridge || !selected) return;
    setBusy(true);
    setProblem(null);
    try {
      const r = await bridge.daemon.restoreBackup(selected);
      useDaemonStore.getState().setConnection(await bridge.daemon.state());
      if (r.ok) {
        toast.success('Datensicherung eingespielt', r.message);
        onClose();
      } else {
        setProblem(r.message);
      }
    } catch (e) {
      toast.fromError(e, 'Wiederherstellung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      icon={DatabaseBackup}
      tone="warning"
      title="Datensicherung einspielen"
      description="Die NOVA-Datenbank lässt sich nicht öffnen. Eine automatische Sicherung bringt Projekte, Aufgaben und Einstellungen auf deren Stand zurück."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} disabled={!selected} onClick={() => void restore()}>
            Prüfen, einspielen und neu starten
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        {backups === null ? (
          <p className="flex items-center gap-2 text-muted">
            <Spinner size="sm" label={null} /> Sicherungen werden gesucht …
          </p>
        ) : backups.length === 0 ? (
          <p className="text-muted">
            Es wurde keine automatische Sicherung gefunden. Bitte „Diagnose erstellen“ wählen und das Diagnose-Paket an den Support schicken.
          </p>
        ) : (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-semibold text-muted">Sicherung wählen (die neueste ist vorausgewählt)</legend>
            {backups.map((b) => (
              <label key={b.path} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 hover:bg-surface-2">
                <input type="radio" name="nova-backup" value={b.path} checked={selected === b.path} onChange={() => setSelected(b.path)} disabled={busy} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-text">{formatDateTime(b.createdAt)}</span>
                  <span className="block truncate font-mono text-[11px] text-subtle" title={b.name}>
                    {b.name}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums">{formatBytes(b.sizeBytes)}</span>
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-xs text-muted">NOVA prüft die Sicherung vor dem Einspielen. Die beschädigte Datenbank bleibt zur Sicherheit im Ordner „backups“ erhalten. Projektdateien werden nicht verändert.</p>
        {problem && (
          <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger-fg">
            {problem}
          </p>
        )}
      </div>
    </Dialog>
  );
}
