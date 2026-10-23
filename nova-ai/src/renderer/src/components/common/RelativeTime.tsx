import { useNow } from '../../hooks/useNow';
import { cn } from '../../lib/cn';
import { formatClock, formatDuration, formatFullDate, formatRelativeTime } from '../../lib/format';

export interface RelativeTimeProps {
  ts: number | null | undefined;
  /** Text before the time, e.g. "Erstellt". */
  prefix?: string;
  className?: string;
}

/**
 * "vor 5 Min." – updates itself every 30 s; full date as tooltip.
 * @example <RelativeTime ts={task.updatedAt} />
 */
export function RelativeTime({ ts, prefix, className }: RelativeTimeProps) {
  const now = useNow(30_000);
  if (ts == null) return <span className={cn('text-muted', className)}>–</span>;
  return (
    <time dateTime={new Date(ts).toISOString()} title={formatFullDate(ts)} className={cn('whitespace-nowrap', className)}>
      {prefix ? `${prefix} ` : ''}
      {formatRelativeTime(ts, Math.max(now, Date.now() - 1000))}
    </time>
  );
}

export interface LiveDurationProps {
  /** Start time. */
  from: number;
  /** End time; when null/undefined the duration ticks live. */
  to?: number | null;
  /** "clock" = 3:05, "text" = 3 Min. 5 Sek. (default clock). */
  format?: 'clock' | 'text';
  className?: string;
}

/**
 * Runtime of an agent run / process, ticking every second while running.
 * @example <LiveDuration from={run.startedAt} to={run.endedAt} />
 */
export function LiveDuration({ from, to, format = 'clock', className }: LiveDurationProps) {
  const now = useNow(1000);
  const end = to ?? Math.max(now, Date.now() - 1000);
  const ms = Math.max(0, end - from);
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)} title={formatDuration(ms)}>
      {format === 'clock' ? formatClock(ms) : formatDuration(ms)}
    </span>
  );
}

export interface RunDurationProps {
  /** Agent run (activeMs excludes paused/waiting time). */
  run: { status: string; activeMs: number; updatedAt: number };
  format?: 'clock' | 'text';
  className?: string;
}

/**
 * Active runtime of an agent run (without pauses/waiting), ticking while the run is running.
 * @example <RunDuration run={run} />
 */
export function RunDuration({ run, format = 'clock', className }: RunDurationProps) {
  const now = useNow(1000);
  const ms = run.status === 'running' ? run.activeMs + Math.max(0, Math.max(now, Date.now() - 1000) - run.updatedAt) : run.activeMs;
  return (
    <span className={cn('tabular-nums whitespace-nowrap', className)} title={`Aktive Laufzeit: ${formatDuration(ms)}`}>
      {format === 'clock' ? formatClock(ms) : formatDuration(ms)}
    </span>
  );
}
