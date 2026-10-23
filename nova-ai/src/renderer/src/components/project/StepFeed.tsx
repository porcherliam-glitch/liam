// Step-by-step log of one agent run (agents.steps) with live `run.step` updates and expandable details.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgentStep } from '@shared/schemas';
import { useNovaEvent } from '../../hooks/useEvents';
import { api, errorMessage } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatTime } from '../../lib/format';
import { AGENT_STEP_KIND, metaOf, toneClasses } from '../../lib/labels';
import { Button } from '../ui/Button';
import { CodeBlock } from '../ui/CodeBlock';
import { Spinner } from '../ui/Spinner';

const PAGE = 300;
const MAX_PAGES = 10;
/** Number of steps kept in memory (newest). */
const KEEP = 500;

export interface StepFeedProps {
  runId: string;
  /** Follow new steps live (default true). */
  live?: boolean;
  /** Max height of the scroll area (default 360 px). */
  maxHeight?: number;
  className?: string;
}

/** Loads all steps of a run page by page (ascending ids) and keeps the newest KEEP. */
async function loadSteps(runId: string): Promise<{ steps: AgentStep[]; truncated: boolean }> {
  let all: AgentStep[] = [];
  let afterId: number | undefined;
  let truncated = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await api('agents.steps', { runId, limit: PAGE, ...(afterId !== undefined ? { afterId } : {}) });
    all = all.concat(batch);
    if (batch.length < PAGE) break;
    afterId = batch[batch.length - 1].id;
    if (page === MAX_PAGES - 1) truncated = true;
  }
  if (all.length > KEEP) {
    truncated = true;
    all = all.slice(-KEEP);
  }
  return { steps: all, truncated };
}

export function StepFeed({ runId, live = true, maxHeight = 360, className }: StepFeedProps) {
  const [steps, setSteps] = useState<AgentStep[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const reload = useCallback(() => {
    let cancelled = false;
    setError(null);
    loadSteps(runId)
      .then((r) => {
        if (cancelled) return;
        setSteps(r.steps);
        setTruncated(r.truncated);
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [runId]);

  useEffect(() => {
    setSteps(null);
    return reload();
  }, [reload]);

  useNovaEvent(
    'run.step',
    (step) => {
      if (step.runId !== runId) return;
      setSteps((prev) => {
        if (!prev) return prev;
        if (prev.some((s) => s.id === step.id)) return prev;
        const next = [...prev, step].sort((a, b) => a.id - b.id);
        return next.length > KEEP ? next.slice(-KEEP) : next;
      });
    },
    live,
  );

  // Keep the newest step in view while the user has not scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [steps]);

  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (error && !steps) {
    return (
      <div role="alert" className={cn('flex flex-wrap items-center gap-2 text-xs text-danger-fg', className)}>
        Die Schritte konnten nicht geladen werden: {error}
        <Button size="sm" onClick={() => reload()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }
  if (!steps) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-muted', className)}>
        <Spinner size="sm" label={null} /> Schritte werden geladen …
      </div>
    );
  }
  if (steps.length === 0) return <p className={cn('text-xs text-muted', className)}>Noch keine Schritte aufgezeichnet.</p>;

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
      }}
      style={{ maxHeight }}
      className={cn('overflow-y-auto rounded-lg border border-border bg-bg/60', className)}
    >
      {truncated && <p className="border-b border-border px-3 py-1.5 text-[11px] text-muted">Nur die neuesten {steps.length} Schritte werden angezeigt.</p>}
      <ol className="divide-y divide-border/50" aria-label="Schritte des Agenten" aria-live={live ? 'polite' : undefined} aria-relevant="additions">
        {steps.map((s) => {
          const meta = metaOf(AGENT_STEP_KIND, s.kind);
          const Icon = meta.icon;
          const hasData = s.data !== null && s.data !== undefined;
          const expanded = open.has(s.id);
          return (
            <li key={s.id} className="px-3 py-1.5">
              <div className="flex items-start gap-2">
                <time dateTime={new Date(s.ts).toISOString()} className="mt-px w-14 shrink-0 font-mono text-[11px] text-subtle tabular-nums">
                  {formatTime(s.ts, true)}
                </time>
                <span className={cn('mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center', toneClasses[meta.tone].text)} title={meta.label}>
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                  <span className="sr-only">{meta.label}:</span>
                </span>
                <span className={cn('min-w-0 flex-1 text-xs break-words', s.kind === 'error' ? 'text-danger-fg' : 'text-text')}>{s.summary}</span>
                {hasData && (
                  <button
                    type="button"
                    onClick={() => toggle(s.id)}
                    aria-expanded={expanded}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-[11px] text-muted hover:text-text"
                  >
                    <ChevronRight aria-hidden className={cn('h-3 w-3 transition-transform duration-150', expanded && 'rotate-90')} />
                    Details
                  </button>
                )}
              </div>
              {hasData && expanded && <CodeBlock code={formatData(s.data)} className="mt-1.5 ml-[4.5rem]" maxHeight={220} wrap />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function formatData(data: unknown): string {
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
