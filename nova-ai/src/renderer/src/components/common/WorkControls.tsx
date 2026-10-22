import { useState } from 'react';
import { Pause, Play, Square } from 'lucide-react';
import { cn } from '../../lib/cn';
import { WORK_STATE } from '../../lib/labels';
import { useMutation } from '../../hooks/useRpc';
import { selectOnline, useDaemonStore } from '../../stores/daemon';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { StatusBadge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';

export interface WorkControlsProps {
  /** Limit the controls to one project (work.* with projectId). Default: global work cycle. */
  projectId?: string;
  /** Hide the idle reason text (top bar). */
  compact?: boolean;
  /** When set, "Starten" first asks for confirmation with this text (e.g. TRUST_PROJECT_TEXT for opened/imported projects). */
  confirmStart?: string;
  className?: string;
}

/**
 * Start / Pause / Fortsetzen / Stopp of the autonomous work cycle with the current state and idle reason.
 * Reads `work.status` from the daemon store (kept fresh by events).
 */
export function WorkControls({ projectId, compact, confirmStart, className }: WorkControlsProps) {
  const work = useDaemonStore((s) => s.work);
  const setWork = useDaemonStore((s) => s.setWork);
  const online = useDaemonStore(selectOnline);
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const opts = { onSuccess: setWork };
  const start = useMutation('work.start', { ...opts, successToast: 'Arbeit gestartet' });
  const pause = useMutation('work.pause', { ...opts, successToast: 'Arbeit wird pausiert' });
  const resume = useMutation('work.resume', { ...opts, successToast: 'Arbeit wird fortgesetzt' });
  const stop = useMutation('work.stop', { ...opts, successToast: 'Arbeit gestoppt' });
  const busy = start.loading || pause.loading || resume.loading || stop.loading || !online;
  const params = projectId ? { projectId } : {};

  if (!work) {
    return <div className={cn('h-8 w-40 animate-pulse rounded-lg bg-surface-2', className)} aria-hidden />;
  }

  const projectState = projectId ? work.projects.find((p) => p.projectId === projectId) : undefined;
  // Per project: the global state wins while it is not running.
  const state = projectId ? (work.state !== 'running' ? work.state : (projectState?.state ?? 'stopped')) : work.state;
  const idleReason = projectId ? (projectState?.idleReason ?? work.idleReason) : work.idleReason;
  const meta = WORK_STATE[state];
  const globalBlocked = projectId !== undefined && work.state !== 'running';

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <Tooltip content={idleReason ?? meta.description ?? meta.label} side="bottom">
        <span tabIndex={0} className="inline-flex rounded-md" aria-label={`Arbeitszyklus: ${meta.label}${idleReason ? ` – ${idleReason}` : ''}`}>
          <StatusBadge meta={meta} size="md" title={undefined} />
        </span>
      </Tooltip>
      {!compact && idleReason && <span className="hidden max-w-72 truncate text-xs text-muted xl:inline">{idleReason}</span>}
      <div className="flex items-center gap-1">
        {state === 'stopped' && (
          <Button
            size="sm"
            variant="primary"
            icon={Play}
            loading={start.loading}
            disabled={busy || globalBlocked}
            title={globalBlocked ? 'Zuerst die Arbeit oben rechts starten' : undefined}
            onClick={() => (confirmStart ? setConfirmStartOpen(true) : void start.run(params))}
          >
            Starten
          </Button>
        )}
        {state === 'running' && (
          <Button size="sm" icon={Pause} loading={pause.loading} disabled={busy} onClick={() => pause.run(params)}>
            Pausieren
          </Button>
        )}
        {state === 'paused' && (
          <Button
            size="sm"
            variant="primary"
            icon={Play}
            loading={resume.loading}
            disabled={busy || globalBlocked}
            title={globalBlocked ? 'Zuerst die Arbeit oben rechts fortsetzen' : undefined}
            onClick={() => resume.run(params)}
          >
            Fortsetzen
          </Button>
        )}
        {state !== 'stopped' && (
          <Button size="sm" variant="ghost" icon={Square} disabled={busy} onClick={() => setConfirmStop(true)} aria-label="Arbeit stoppen">
            Stopp
          </Button>
        )}
      </div>
      {confirmStart && (
        <ConfirmDialog
          open={confirmStartOpen}
          title="Autonome Arbeit einschalten?"
          message={confirmStart}
          confirmLabel="Arbeit starten"
          loading={start.loading}
          onConfirm={async () => {
            await start.run(params);
            setConfirmStartOpen(false);
          }}
          onCancel={() => setConfirmStartOpen(false)}
        />
      )}
      <ConfirmDialog
        open={confirmStop}
        tone="danger"
        title={projectId ? 'Arbeit an diesem Projekt stoppen?' : 'Autonome Arbeit stoppen?'}
        message={
          <>
            <p>Laufende Aufgaben werden an einem sicheren Punkt beendet und wieder in die Warteschlange gestellt. Es werden keine neuen Aufgaben gestartet.</p>
            <p className="mt-2 text-muted">Dateien bleiben so, wie sie sind. Mit „Starten“ geht es später weiter.</p>
          </>
        }
        confirmLabel="Stoppen"
        loading={stop.loading}
        onConfirm={async () => {
          await stop.run(params);
          setConfirmStop(false);
        }}
        onCancel={() => setConfirmStop(false)}
      />
    </div>
  );
}
