// Shows what changed in one file (files.diff): either everything NOVA changed since its first change, the changes
// of one task, or one journal entry (changeId, older versions from the history). Plain-text unified diff.
import { Link } from 'react-router';
import { Code, FileDiff } from 'lucide-react';
import { Dialog, ErrorState, LoadingState, Button } from '../../../components/ui';
import { useRpc } from '../../../hooks/useRpc';
import { cn } from '../../../lib/cn';
import { paths } from '../../../lib/paths';

export interface DiffTarget {
  path: string;
  taskId?: string;
  changeId?: number;
  /** Subtitle, e.g. "Änderung von vor 5 Min." */
  label?: string;
}

export interface DiffDialogProps {
  projectId: string;
  target: DiffTarget | null;
  onClose: () => void;
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-muted';
  if (line.startsWith('@@')) return 'text-info-fg bg-info/5';
  if (line.startsWith('+')) return 'text-success-fg bg-success/10';
  if (line.startsWith('-')) return 'text-danger-fg bg-danger/10';
  return 'text-text';
}

/** Unified diff with colored added/removed lines (no HTML rendering of file content). */
export function UnifiedDiff({ text, maxHeight = 480 }: { text: string; maxHeight?: number }) {
  const lines = text.replace(/\n$/, '').split('\n');
  return (
    <pre tabIndex={0} aria-label="Unterschiede" className="overflow-auto rounded-lg border border-border bg-bg py-2 font-mono text-xs leading-relaxed" style={{ maxHeight }}>
      {lines.map((l, i) => (
        <div key={i} className={cn('px-3 whitespace-pre', lineClass(l))}>
          {l || ' '}
        </div>
      ))}
    </pre>
  );
}

export function DiffDialog({ projectId, target, onClose }: DiffDialogProps) {
  const diff = useRpc(
    'files.diff',
    target ? { projectId, path: target.path, ...(target.taskId ? { taskId: target.taskId } : {}), ...(target.changeId !== undefined ? { changeId: target.changeId } : {}) } : null,
  );
  const d = diff.data;
  const unchanged = !!d && !d.binary && !d.unified.trim() && d.original === d.modified;

  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      size="xl"
      icon={FileDiff}
      title={<span className="font-mono text-sm">{target?.path}</span>}
      description={`${target?.label ?? 'Vergleich des Stands vor NOVAs Änderung mit dem aktuellen Stand.'} Rot: entfernt, grün: hinzugefügt.`}
      footer={
        <>
          {target && (
            <Link
              to={paths.studio(projectId, { file: target.path })}
              className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-blue-fg no-underline hover:bg-surface-2 hover:no-underline"
            >
              <Code aria-hidden className="h-4 w-4" />
              Im Studio öffnen
            </Link>
          )}
          <Button onClick={onClose}>Schließen</Button>
        </>
      }
    >
      {diff.loading ? (
        <LoadingState compact label="Unterschiede werden geladen …" />
      ) : diff.error && !d ? (
        <ErrorState compact error={diff.error} onRetry={() => void diff.refetch()} title="Die Unterschiede konnten nicht geladen werden" />
      ) : d ? (
        d.binary ? (
          <p className="text-[13px] text-muted">Das ist eine Binärdatei (z. B. Bild oder Audio). Unterschiede lassen sich nicht als Text anzeigen.</p>
        ) : unchanged ? (
          <p className="text-[13px] text-muted">Keine Unterschiede – die Datei entspricht wieder dem früheren Stand.</p>
        ) : d.unified.trim() ? (
          <UnifiedDiff text={d.unified} />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Vorher</p>
              <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs whitespace-pre">{d.original || '(leer – neue Datei)'}</pre>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted">Jetzt</p>
              <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-bg p-3 font-mono text-xs whitespace-pre">{d.modified || '(leer – gelöscht)'}</pre>
            </div>
          </div>
        )
      ) : null}
    </Dialog>
  );
}
