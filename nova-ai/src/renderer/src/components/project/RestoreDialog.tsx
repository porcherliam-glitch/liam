// Preview and restore of a restore point or of one task's changes (checkpoints.preview / checkpoints.restore).
// Explains that only NOVA's own changes are undone and that the user's changes stay untouched (MASTERPROMPT §12).
import { useEffect, useState, type ReactNode } from 'react';
import { CircleCheck, FileWarning, History, RotateCcw, ShieldCheck } from 'lucide-react';
import type { RestoreResult } from '@shared/schemas';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Checkbox } from '../ui/Switch';
import { ErrorState, LoadingState } from '../ui/EmptyState';
import { CodeBlock } from '../ui/CodeBlock';

export type RestoreTarget = { checkpointId: string; taskId?: undefined } | { taskId: string; checkpointId?: undefined };

export interface RestoreDialogProps {
  open: boolean;
  onClose: () => void;
  target: RestoreTarget | null;
  /** What is restored, e.g. „Vor dem Umbau der Physik“ or the task title. */
  label: string;
  /** "preview" opens with the file lists first; "restore" goes straight to the confirmation. */
  mode?: 'preview' | 'restore';
  /** Offer "Als Git-Commit festhalten". */
  gitAvailable?: boolean;
  onRestored?: (result: RestoreResult) => void;
}

/** Exact explanation shown before every restore. */
export const RESTORE_EXPLANATION =
  'Es werden nur Änderungen rückgängig gemacht, die NOVA selbst vorgenommen hat. Eigene Änderungen bleiben erhalten: Dateien, die nach NOVA von Hand oder mit anderen Programmen geändert wurden, werden übersprungen und als Konflikt angezeigt.';

export function RestoreDialog({ open, onClose, target, label, mode = 'preview', gitAvailable = false, onRestored }: RestoreDialogProps) {
  const [step, setStep] = useState<'preview' | 'confirm'>(mode === 'restore' ? 'confirm' : 'preview');
  const [commit, setCommit] = useState(true);
  const [result, setResult] = useState<RestoreResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setStep(mode === 'restore' ? 'confirm' : 'preview');
    setCommit(true);
    setResult(null);
  }, [open, mode, target?.checkpointId, target?.taskId]);

  const previewParams = open && target ? (target.checkpointId ? { checkpointId: target.checkpointId } : { taskId: target.taskId! }) : null;
  const preview = useRpc('checkpoints.preview', previewParams);
  const restore = useMutation('checkpoints.restore', {
    onSuccess: (r) => {
      setResult(r);
      onRestored?.(r);
    },
  });

  const plan = preview.data;
  const nothing = !!plan && plan.restored.length === 0;
  const isTask = !!target?.taskId;

  const doRestore = () => {
    if (!target) return;
    void restore.run(target.checkpointId ? { checkpointId: target.checkpointId, commit: gitAvailable && commit } : { taskId: target.taskId!, commit: gitAvailable && commit });
  };

  let footer: ReactNode;
  if (result) {
    footer = (
      <Button variant="primary" onClick={onClose}>
        Fertig
      </Button>
    );
  } else if (step === 'preview') {
    footer = (
      <>
        <Button onClick={onClose}>Schließen</Button>
        <Button variant="primary" icon={RotateCcw} disabled={!plan || nothing} onClick={() => setStep('confirm')}>
          Weiter zur Wiederherstellung
        </Button>
      </>
    );
  } else {
    footer = (
      <>
        <Button onClick={onClose} disabled={restore.loading}>
          Abbrechen
        </Button>
        <Button variant="danger" icon={RotateCcw} loading={restore.loading} disabled={!plan || nothing} onClick={doRestore}>
          Jetzt wiederherstellen
        </Button>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={() => !restore.loading && onClose()}
      dismissible={!restore.loading}
      size="lg"
      icon={History}
      tone={step === 'confirm' && !result ? 'warning' : 'violet'}
      title={result ? 'Wiederherstellung abgeschlossen' : isTask ? 'Änderungen der Aufgabe rückgängig machen' : step === 'preview' ? 'Vorschau der Wiederherstellung' : 'Wiederherstellen?'}
      description={label}
      footer={footer}
    >
      {result ? (
        <ResultView result={result} />
      ) : preview.loading ? (
        <LoadingState compact label="Vorschau wird berechnet …" />
      ) : preview.error && !plan ? (
        <ErrorState compact error={preview.error} onRetry={() => void preview.refetch()} title="Die Vorschau konnte nicht berechnet werden" />
      ) : plan ? (
        <div className="space-y-4">
          {step === 'confirm' && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3 text-[13px] text-text">
              <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
              <div className="space-y-1.5">
                <p>{RESTORE_EXPLANATION}</p>
                <p className="text-muted">Vorher legt NOVA automatisch einen Wiederherstellungspunkt an – die Wiederherstellung lässt sich also selbst wieder rückgängig machen.</p>
              </div>
            </div>
          )}
          {step === 'preview' && <p className="text-[13px] text-muted">{RESTORE_EXPLANATION}</p>}
          {nothing ? (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-[13px] text-muted">
              Es gibt nichts wiederherzustellen – seit diesem Punkt hat NOVA keine Dateien geändert, die zurückgesetzt werden können.
            </p>
          ) : (
            <FileList title="Wird wiederhergestellt" tone="ok" items={plan.restored.map((p) => ({ path: p }))} />
          )}
          {plan.conflicts.length > 0 && <FileList title="Konflikte – bleiben unverändert" tone="warn" items={plan.conflicts.map((c) => ({ path: c.path, note: c.reason }))} />}
          {plan.skipped.length > 0 && <FileList title="Übersprungen" tone="muted" items={plan.skipped.map((p) => ({ path: p }))} />}
          {step === 'confirm' && gitAvailable && !nothing && (
            <Checkbox checked={commit} onChange={setCommit} label="Als Git-Commit festhalten" description="Nur die wiederhergestellten Dateien werden committet." />
          )}
        </div>
      ) : null}
    </Dialog>
  );
}

function FileList({ title, items, tone }: { title: string; items: Array<{ path: string; note?: string }>; tone: 'ok' | 'warn' | 'muted' }) {
  const Icon = tone === 'warn' ? FileWarning : CircleCheck;
  const color = tone === 'warn' ? 'text-warning-fg' : tone === 'ok' ? 'text-success-fg' : 'text-muted';
  return (
    <div>
      <h3 className={`mb-1.5 flex items-center gap-1.5 text-xs font-semibold ${color}`}>
        <Icon aria-hidden className="h-3.5 w-3.5" />
        {title} ({items.length})
      </h3>
      <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-border bg-surface-2 p-2" aria-label={title}>
        {items.map((it) => (
          <li key={it.path} className="text-xs">
            <span className="font-mono text-text">{it.path}</span>
            {it.note && <span className="ml-2 text-muted">– {it.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultView({ result }: { result: RestoreResult }) {
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-[13px] text-success-fg">
        <CircleCheck aria-hidden className="h-4 w-4" />
        {result.restored.length === 1 ? '1 Datei wurde wiederhergestellt.' : `${result.restored.length} Dateien wurden wiederhergestellt.`}
      </p>
      {result.restored.length > 0 && <FileList title="Wiederhergestellt" tone="ok" items={result.restored.map((p) => ({ path: p }))} />}
      {result.conflicts.length > 0 && <FileList title="Nicht angefasst (eigene Änderungen)" tone="warn" items={result.conflicts.map((c) => ({ path: c.path, note: c.reason }))} />}
      {result.skipped.length > 0 && <FileList title="Übersprungen" tone="muted" items={result.skipped.map((p) => ({ path: p }))} />}
      {result.commit && <CodeBlock label="Git-Commit" code={result.commit} />}
      {result.checkpointId && (
        <p className="text-xs text-muted">Ein Wiederherstellungspunkt „Vor der Wiederherstellung“ wurde angelegt. Darüber lässt sich dieser Schritt rückgängig machen.</p>
      )}
    </div>
  );
}
