import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number | null | undefined;
  align?: 'left' | 'right' | 'center';
  /** CSS width, e.g. "120px" or "20%". */
  width?: string;
  className?: string;
  headerClassName?: string;
}

export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}

export interface TableProps<T> {
  columns: ReadonlyArray<Column<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T) => string;
  /** Shown instead of the body when rows is empty (use <EmptyState compact/>). */
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: SortState;
  /** Screen reader caption. */
  caption?: string;
  dense?: boolean;
  stickyHeader?: boolean;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const;

/**
 * Data table with optional sortable headers (click or Enter on the header).
 * @example <Table columns={cols} rows={rules} rowKey={(r) => r.id} empty={<EmptyState compact title="Keine Regeln" />} />
 */
export function Table<T>({ columns, rows, rowKey, empty, onRowClick, initialSort, caption, dense, stickyHeader, rowClassName, className }: TableProps<T>) {
  const [sort, setSort] = useState<SortState | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * factor;
      return String(va).localeCompare(String(vb), 'de', { numeric: true, sensitivity: 'base' }) * factor;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const cellPad = dense ? 'px-3 py-1.5' : 'px-3 py-2.5';

  return (
    <div className={cn('min-w-0 overflow-x-auto', className)}>
      <table className="w-full border-collapse text-[13px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-surface')}>
          <tr className="border-b border-border">
            {columns.map((col) => {
              const active = sort?.key === col.key;
              const SortIcon = active ? (sort?.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={col.width ? { width: col.width } : undefined}
                  aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : col.sortValue ? 'none' : undefined}
                  className={cn('px-3 py-2 text-xs font-medium whitespace-nowrap text-muted', ALIGN[col.align ?? 'left'], col.headerClassName)}
                >
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className={cn('-mx-1 inline-flex items-center gap-1 rounded px-1 hover:text-text', active && 'text-text', col.align === 'right' && 'flex-row-reverse')}
                    >
                      {col.header}
                      <SortIcon aria-hidden className={cn('h-3 w-3', !active && 'opacity-50')} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="p-0">
                {empty ?? <p className="px-3 py-6 text-center text-muted">Keine Einträge.</p>}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                tabIndex={onRowClick ? 0 : undefined}
                className={cn('border-b border-border/60 transition-colors duration-150 last:border-b-0', onRowClick && 'cursor-pointer hover:bg-surface-2', rowClassName?.(row))}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn(cellPad, 'align-middle', ALIGN[col.align ?? 'left'], col.className)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
