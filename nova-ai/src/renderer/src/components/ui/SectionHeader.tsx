import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** Counter next to the title. */
  count?: number;
  level?: 2 | 3;
  className?: string;
}

/**
 * Heading row for a page section.
 * @example <SectionHeader title="Offene Freigaben" count={2} actions={<Button size="sm">…</Button>} />
 */
export function SectionHeader({ title, description, icon: Icon, actions, count, level = 2, className }: SectionHeaderProps) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <H className={cn('flex items-center gap-2 font-semibold', level === 2 ? 'text-[15px]' : 'text-sm')}>
          {Icon && <Icon aria-hidden className="h-4 w-4 text-violet-fg" />}
          {title}
          {count !== undefined && <span className="rounded-full bg-surface-3 px-2 text-xs leading-5 font-medium text-muted tabular-nums">{count}</span>}
        </H>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
