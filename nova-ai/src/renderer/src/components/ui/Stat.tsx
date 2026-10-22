import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toneClasses, type Tone } from '../../lib/labels';

export interface StatProps {
  label: string;
  value: ReactNode;
  /** Secondary line below the value. */
  sub?: ReactNode;
  icon?: LucideIcon;
  /** Accent of the icon chip (default violet). */
  tone?: Tone;
  /** Makes the whole tile a link. */
  to?: string;
  /** Adds the "(geschätzt)" marker next to the value. */
  estimated?: boolean;
  className?: string;
}

/**
 * Key figure tile (dashboard, costs).
 * @example <Stat label="Offene Aufgaben" value={12} sub="3 warten" icon={ListTodo} to={paths.tasks} />
 */
export function Stat({ label, value, sub, icon: Icon, tone = 'violet', to, estimated, className }: StatProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md', toneClasses[tone].soft)}>
            <Icon aria-hidden className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-2xl leading-none font-semibold text-text tabular-nums">{value}</span>
        {estimated && <span className="text-[11px] text-warning-fg">(geschätzt)</span>}
      </div>
      {sub && <div className="mt-1.5 truncate text-xs text-muted">{sub}</div>}
    </>
  );
  const cls = cn('block min-w-0 rounded-xl border border-border bg-surface px-4 py-3.5', className);
  if (to) {
    return (
      <Link to={to} className={cn(cls, 'text-text no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 hover:no-underline')}>
        {body}
      </Link>
    );
  }
  return <div className={cls}>{body}</div>;
}
