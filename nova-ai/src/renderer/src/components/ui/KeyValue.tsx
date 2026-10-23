import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Monospace value (paths, ids, commands). */
  mono?: boolean;
}

export interface KeyValueProps {
  items: ReadonlyArray<KeyValueItem | null | false | undefined>;
  /** Number of columns on wide screens (default 1). */
  columns?: 1 | 2 | 3;
  className?: string;
}

const COLS = { 1: 'grid-cols-1', 2: 'grid-cols-1 sm:grid-cols-2', 3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' } as const;

/**
 * Definition list for properties. Falsy items are skipped.
 * @example <KeyValue items={[{ label: 'Pfad', value: project.path, mono: true }]} />
 */
export function KeyValue({ items, columns = 1, className }: KeyValueProps) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-2.5', COLS[columns], className)}>
      {items.filter((x): x is KeyValueItem => !!x).map((item, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs text-muted">{item.label}</dt>
          <dd className={cn('mt-0.5 break-words text-[13px] text-text', item.mono && 'font-mono text-xs')}>{item.value}</dd>
          {item.hint && <dd className="text-[11px] text-subtle">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
