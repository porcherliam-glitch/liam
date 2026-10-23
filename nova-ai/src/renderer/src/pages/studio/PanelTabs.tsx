// Tab strip of the studio's tool panel. Same look and keyboard behaviour as the shared <Tabs>, but it adapts to
// narrow panels (e.g. on the right side): icons + labels, labels only, or icons only (name as tooltip and
// accessible name), so all five tools stay reachable without horizontal scrolling.
import { useRef, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { tabId, tabPanelId } from '../../components/ui';
import { cn } from '../../lib/cn';

export type PanelTabsMode = 'full' | 'labels' | 'icons';

export interface PanelTabItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  /** Small counter (hidden when undefined). */
  count?: number;
  countTone?: 'neutral' | 'danger';
}

export interface PanelTabsProps<T extends string> {
  items: ReadonlyArray<PanelTabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for the tab/panel element ids (same scheme as the shared Tabs). */
  idBase: string;
  mode: PanelTabsMode;
  className?: string;
}

/** Width (px) the tool panel needs for each mode – the tab strip plus the two buttons next to it. */
export const PANEL_TABS_MIN_WIDTH: Record<Exclude<PanelTabsMode, 'icons'>, number> = { full: 680, labels: 560 };

/** Picks the richest mode that fits into `width` px (0 = unknown → full). */
export function panelTabsMode(width: number): PanelTabsMode {
  if (width <= 0 || width >= PANEL_TABS_MIN_WIDTH.full) return 'full';
  return width >= PANEL_TABS_MIN_WIDTH.labels ? 'labels' : 'icons';
}

export function PanelTabs<T extends string>({ items, value, onChange, label, idBase, mode, className }: PanelTabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((it) => it.id === value);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = (current + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === undefined) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      // The strip itself overlaps the border below by 1 px (-mb-px) so the underline of the selected tab covers it;
      // the buttons stay inside the strip, so no vertical scrollbar appears.
      className={cn('-mb-px flex items-end gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none]', className)}
    >
      {items.map((it, i) => {
        const selected = it.id === value;
        const Icon = it.icon;
        const iconsOnly = mode === 'icons';
        const hasCount = it.count !== undefined && it.count > 0;
        const danger = it.countTone === 'danger';
        const name = hasCount ? `${it.label} (${it.count})` : it.label;
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={tabId(idBase, it.id)}
            aria-selected={selected}
            aria-controls={tabPanelId(idBase, it.id)}
            aria-label={iconsOnly ? name : undefined}
            title={iconsOnly ? name : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(it.id)}
            className={cn(
              'relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 text-[13px] font-medium transition-colors duration-150 focus-visible:outline-offset-[-2px]',
              iconsOnly ? 'px-2.5' : 'px-3',
              selected ? 'border-violet text-text' : 'border-transparent text-muted hover:border-border-strong hover:text-text',
            )}
          >
            {mode !== 'labels' && <Icon aria-hidden className="h-4 w-4 shrink-0" />}
            {!iconsOnly && it.label}
            {hasCount &&
              (iconsOnly ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-1 right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-3.5 font-semibold tabular-nums',
                    danger ? 'bg-danger text-white' : 'bg-surface-3 text-text',
                  )}
                >
                  {it.count}
                </span>
              ) : (
                <span
                  className={cn(
                    'min-w-5 rounded-full px-1.5 text-center text-[11px] leading-4 tabular-nums',
                    danger ? 'bg-danger/20 text-danger-fg' : 'bg-surface-3 text-muted',
                  )}
                >
                  {it.count}
                </span>
              ))}
          </button>
        );
      })}
    </div>
  );
}
