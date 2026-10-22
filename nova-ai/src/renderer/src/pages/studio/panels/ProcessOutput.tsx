import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ScrollText } from 'lucide-react';
import type { ProcessInfo } from '@shared/schemas';
import { StatusBadge, EmptyState, ErrorState, LoadingState } from '../../../components/ui';
import { useNovaEvent, useRpc } from '../../../hooks';
import { cn } from '../../../lib/cn';
import { metaOf, PROCESS_STATUS } from '../../../lib/labels';
import { stripAnsi, tailText } from '../studio-utils';

export interface ProcessOutputProps {
  processId: string;
  /** Accessible name / caption, e.g. "Ausgabe des Entwicklungsservers". */
  label: string;
  className?: string;
}

/** Live output of a process (processes.output + process.output events), auto-scrolling while at the bottom. */
export function ProcessOutput({ processId, label, className }: ProcessOutputProps) {
  const initial = useRpc('processes.output', { id: processId, tailLines: 500 });
  const [extra, setExtra] = useState('');
  const [info, setInfo] = useState<ProcessInfo | null>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    setExtra('');
    setInfo(null);
    stick.current = true;
  }, [processId]);

  // A (re)loaded snapshot already contains everything that was streamed before.
  useEffect(() => {
    if (initial.data !== undefined) setExtra('');
  }, [initial.data]);

  useNovaEvent('process.output', (p) => {
    if (p.processId !== processId || initial.data === undefined) return;
    setExtra((prev) => tailText(prev + p.data));
  });
  useNovaEvent('process.updated', (p) => {
    if (p.id === processId) setInfo(p);
  });

  const text = stripAnsi(tailText(`${initial.data?.output ?? ''}${extra}`));

  useLayoutEffect(() => {
    const el = preRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [text]);

  if (initial.error && initial.data === undefined) return <ErrorState compact error={initial.error} title="Die Ausgabe konnte nicht geladen werden" onRetry={() => void initial.refetch()} />;
  if (initial.data === undefined) return <LoadingState compact label="Ausgabe wird geladen …" />;

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1 text-[11px] font-medium text-muted">
        <ScrollText aria-hidden className="h-3.5 w-3.5" />
        <span className="flex-1 truncate">{label}</span>
        {info && (
          <StatusBadge meta={metaOf(PROCESS_STATUS, info.status)}>
            {info.status === 'exited' && info.exitCode !== null ? `Beendet (Code ${info.exitCode})` : undefined}
          </StatusBadge>
        )}
      </div>
      {text.trim() ? (
        <pre
          ref={preRef}
          tabIndex={0}
          aria-label={label}
          aria-live="off"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="min-h-0 flex-1 overflow-auto bg-bg px-3 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap text-text/90"
        >
          {text}
        </pre>
      ) : (
        <EmptyState compact icon={ScrollText} title="Noch keine Ausgabe" description="Sobald das Programm etwas ausgibt, erscheint es hier." />
      )}
    </div>
  );
}
