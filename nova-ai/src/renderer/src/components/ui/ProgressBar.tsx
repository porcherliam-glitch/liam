import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatPercent } from '../../lib/format';
import { toneClasses, type Tone } from '../../lib/labels';

export interface ProgressBarProps {
  /** 0..100, or null for an indeterminate (unknown duration) bar. */
  value: number | null;
  /** Accessible name, e.g. "Fortschritt". */
  label: string;
  /** Default: violet→blue gradient. */
  tone?: Tone | 'gradient';
  size?: 'xs' | 'sm' | 'md';
  /** Shows the percent value right of the bar. */
  showValue?: boolean;
  className?: string;
}

const HEIGHT = { xs: 'h-1', sm: 'h-1.5', md: 'h-2' } as const;

/** Determinate or indeterminate progress bar. */
export function ProgressBar({ value, label, tone = 'gradient', size = 'sm', showValue, className }: ProgressBarProps) {
  const clamped = value == null ? null : Math.max(0, Math.min(100, value));
  const fill = tone === 'gradient' ? 'bg-nova-gradient' : toneClasses[tone].bar;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped ?? undefined}
        aria-valuetext={clamped == null ? 'läuft' : formatPercent(clamped)}
        className={cn('relative w-full overflow-hidden rounded-full bg-surface-3', HEIGHT[size])}
      >
        {clamped == null ? (
          <div className={cn('absolute inset-y-0 w-2/5 rounded-full animate-indeterminate', fill)} />
        ) : (
          <div className={cn('h-full rounded-full transition-[width] duration-300', fill)} style={{ width: `${clamped}%` }} />
        )}
      </div>
      {showValue && clamped != null && <span className="w-10 shrink-0 text-right text-xs text-muted tabular-nums">{formatPercent(clamped)}</span>}
    </div>
  );
}

export interface MeterProps {
  label: string;
  icon?: LucideIcon;
  /** Usage in percent (0..100). null = not available. */
  value: number | null;
  /** Detail text, e.g. "19,8 GB von 32 GB". */
  valueText?: ReactNode;
  /** Secondary line (source, model). */
  detail?: ReactNode;
  /** Marks the value as estimate ("geschätzt"). */
  estimated?: boolean;
  /** Text when value is null (default "nicht verfügbar"). */
  unavailableText?: ReactNode;
  /** [warning, danger] thresholds in percent (default [75, 90]). */
  thresholds?: [number, number];
  className?: string;
}

/**
 * Resource meter with label, percent, bar, details and an optional "geschätzt" marker.
 * @example <Meter label="RAM" icon={MemoryStick} value={62} valueText="19,8 GB von 32 GB" />
 */
export function Meter({ label, icon: Icon, value, valueText, detail, estimated, unavailableText = 'nicht verfügbar', thresholds = [75, 90], className }: MeterProps) {
  const available = value != null && Number.isFinite(value);
  const v = available ? Math.max(0, Math.min(100, value)) : 0;
  const tone: Tone | 'gradient' = !available ? 'neutral' : v >= thresholds[1] ? 'danger' : v >= thresholds[0] ? 'warning' : 'gradient';
  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
          {Icon && <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        <span className={cn('shrink-0 text-sm font-semibold tabular-nums', available ? 'text-text' : 'text-muted')}>
          {available ? formatPercent(v) : '–'}
          {available && estimated && <span className="ml-1 text-[11px] font-normal text-warning-fg">(geschätzt)</span>}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={available ? Math.round(v) : undefined}
        aria-valuetext={available ? `${formatPercent(v)}${estimated ? ' (geschätzt)' : ''}` : String(unavailableText)}
        className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-3"
      >
        {available && <div className={cn('h-full rounded-full transition-[width] duration-500', tone === 'gradient' ? 'bg-nova-gradient' : toneClasses[tone].bar)} style={{ width: `${v}%` }} />}
      </div>
      <div className="mt-1 min-h-4 truncate text-[11px] text-muted">{available ? valueText : unavailableText}</div>
      {detail && <div className="truncate text-[11px] text-subtle">{detail}</div>}
    </div>
  );
}
