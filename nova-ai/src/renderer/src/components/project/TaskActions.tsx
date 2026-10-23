// Task controls (Start, Pause, Fortsetzen, Stopp, Wiederholen, Bearbeiten, Löschen) with the enabled state per
// status (taskRules.taskCapabilities). Two looks: compact icon row (lists) and labeled buttons (details).
import { useState } from 'react';
import { Pause, Pencil, Play, RotateCcw, Square, Trash2 } from 'lucide-react';
import type { Task } from '@shared/schemas';
import { useMutation } from '../../hooks/useRpc';
import { cn } from '../../lib/cn';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { startDisabledReason, taskCapabilities } from './taskRules';

export type TaskAction = 'start' | 'pause' | 'stop' | 'retry' | 'edit' | 'delete';

export interface TaskActionsProps {
  task: Task;
  /** icons = compact row with all controls (disabled when not possible); buttons = labeled, only possible ones. */
  variant?: 'icons' | 'buttons';
  /** Restrict to a subset (e.g. agents view: start/pause/stop). Default: all. */
  actions?: readonly TaskAction[];
  /** Opens the edit dialog (the edit control is hidden without it). */
  onEdit?: (task: Task) => void;
  /** Called with the updated task after a successful control (apply it to local lists). */
  onChanged?: (task: Task) => void;
  onDeleted?: (taskId: string) => void;
  className?: string;
}

const ALL: readonly TaskAction[] = ['start', 'pause', 'stop', 'retry', 'edit', 'delete'];

export function TaskActions({ task, variant = 'icons', actions = ALL, onEdit, onChanged, onDeleted, className }: TaskActionsProps) {
  const [confirm, setConfirm] = useState<null | 'stop' | 'delete' | 'retry'>(null);
  const caps = taskCapabilities(task);
  const opts = { onSuccess: (t: Task) => onChanged?.(t) };
  const start = useMutation('tasks.start', { ...opts, successToast: 'Aufgabe eingeplant' });
  const pause = useMutation('tasks.pause', { ...opts, successToast: 'Aufgabe wird pausiert' });
  const resume = useMutation('tasks.resume', { ...opts, successToast: 'Aufgabe wird fortgesetzt' });
  const stop = useMutation('tasks.stop', { ...opts, successToast: 'Aufgabe gestoppt' });
  const retry = useMutation('tasks.retry', { ...opts, successToast: 'Aufgabe wird wiederholt' });
  const del = useMutation('tasks.delete', { successToast: 'Aufgabe gelöscht', onSuccess: () => onDeleted?.(task.id) });
  const busy = start.loading || pause.loading || resume.loading || stop.loading || retry.loading || del.loading;
  const has = (a: TaskAction) => actions.includes(a);

  const playIsResume = task.status === 'paused';
  const playEnabled = playIsResume ? caps.resume : caps.start;
  const playLabel = playIsResume ? 'Fortsetzen' : task.status === 'queued' ? 'Jetzt starten' : 'Starten';
  const playReason = playEnabled ? null : startDisabledReason(task);
  const onPlay = () => (playIsResume ? resume.run({ id: task.id }) : start.run({ id: task.id }));
  const onRetry = () => (task.status === 'done' ? setConfirm('retry') : void retry.run({ id: task.id }));

  const controls: Array<{
    key: TaskAction;
    label: string;
    icon: typeof Play;
    enabled: boolean;
    loading: boolean;
    title?: string;
    onClick: () => void;
    tone?: 'primary' | 'danger';
  }> = [];
  if (has('start')) controls.push({ key: 'start', label: playLabel, icon: Play, enabled: playEnabled, loading: start.loading || resume.loading, title: playReason ?? undefined, onClick: () => void onPlay(), tone: 'primary' });
  if (has('pause')) controls.push({ key: 'pause', label: 'Pausieren', icon: Pause, enabled: caps.pause, loading: pause.loading, onClick: () => void pause.run({ id: task.id }) });
  if (has('stop')) controls.push({ key: 'stop', label: 'Stoppen', icon: Square, enabled: caps.stop, loading: stop.loading, onClick: () => setConfirm('stop') });
  if (has('retry')) controls.push({ key: 'retry', label: 'Wiederholen', icon: RotateCcw, enabled: caps.retry, loading: retry.loading, onClick: onRetry });
  if (has('edit') && onEdit)
    controls.push({ key: 'edit', label: 'Bearbeiten', icon: Pencil, enabled: caps.edit, loading: false, title: caps.edit ? undefined : 'Während die Aufgabe läuft, kann sie nicht bearbeitet werden. Bitte zuerst pausieren.', onClick: () => onEdit(task) });
  if (has('delete'))
    controls.push({ key: 'delete', label: 'Löschen', icon: Trash2, enabled: caps.remove, loading: del.loading, title: caps.remove ? undefined : 'Laufende oder wartende Aufgaben können nicht gelöscht werden. Bitte zuerst stoppen.', onClick: () => setConfirm('delete'), tone: 'danger' });

  return (
    <>
      {variant === 'icons' ? (
        <div className={cn('flex items-center gap-0.5', className)} role="group" aria-label={`Steuerung für „${task.title}“`}>
          {controls.map((c) => (
            <IconButton
              key={c.key}
              icon={c.icon}
              label={c.label}
              size="sm"
              loading={c.loading}
              disabled={!c.enabled || (busy && !c.loading)}
              title={c.title ?? c.label}
              onClick={c.onClick}
              className={cn(c.tone === 'danger' && c.enabled && 'hover:text-danger-fg', c.tone === 'primary' && c.enabled && 'text-violet-fg')}
            />
          ))}
        </div>
      ) : (
        <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="group" aria-label={`Steuerung für „${task.title}“`}>
          {controls
            .filter((c) => c.enabled)
            .map((c) => (
              <Button
                key={c.key}
                size="sm"
                icon={c.icon}
                variant={c.tone === 'primary' ? 'primary' : c.tone === 'danger' ? 'danger' : 'secondary'}
                loading={c.loading}
                disabled={busy && !c.loading}
                title={c.title}
                onClick={c.onClick}
              >
                {c.label}
              </Button>
            ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm === 'stop'}
        tone="danger"
        title="Aufgabe stoppen?"
        message={
          <>
            <p>
              „{task.title}“ wird abgebrochen: laufende Modellaufrufe und Befehle werden beendet, die Aufgabe gilt danach als abgebrochen.
            </p>
            <p className="mt-2 text-muted">Bereits geänderte Dateien bleiben so, wie sie sind. Mit „Wiederholen“ kann die Aufgabe später neu gestartet werden.</p>
          </>
        }
        confirmLabel="Stoppen"
        loading={stop.loading}
        onConfirm={async () => {
          await stop.run({ id: task.id });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        tone="danger"
        title="Aufgabe löschen?"
        message={
          <>
            <p>„{task.title}“ wird aus der Aufgabenliste entfernt.</p>
            <p className="mt-2 text-muted">Dateien im Projekt werden dabei nicht verändert. Aufgaben, die noch von dieser Aufgabe abhängen, verhindern das Löschen.</p>
          </>
        }
        confirmLabel="Löschen"
        loading={del.loading}
        onConfirm={async () => {
          await del.run({ id: task.id });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'retry'}
        title="Erledigte Aufgabe wiederholen?"
        message={
          <>
            <p>„{task.title}“ wird noch einmal von vorn bearbeitet. Versuche und Prüfergebnisse werden zurückgesetzt.</p>
            <p className="mt-2 text-muted">Die bisherigen Änderungen bleiben erhalten – der Agent baut darauf auf.</p>
          </>
        }
        confirmLabel="Wiederholen"
        loading={retry.loading}
        onConfirm={async () => {
          await retry.run({ id: task.id });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}
