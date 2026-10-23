import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** Small counter next to the label. */
  count?: number;
  /** Highlight the counter (e.g. errors). */
  countTone?: 'neutral' | 'danger' | 'warning';
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Accessible name of the tab list. */
  label: string;
  /** Prefix for element ids (tab + panel), default "tabs". Use with <TabPanel idBase>. */
  idBase?: string;
  className?: string;
}

export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const tabPanelId = (idBase: string, id: string) => `${idBase}-panel-${id}`;

/**
 * Accessible tab list (arrow keys, Home/End). Render the content with <TabPanel>.
 * @example
 * <Tabs label="Projektbereiche" idBase="project" items={items} value={tab} onChange={setTab} />
 * <TabPanel idBase="project" id={tab}>…</TabPanel>
 */
export function Tabs<T extends string>({ items, value, onChange, label, idBase = 'tabs', className }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.map((it, i) => (it.disabled ? -1 : i)).filter((i) => i >= 0);
    const current = items.findIndex((it) => it.id === value);
    const pos = enabled.indexOf(current);
    let next: number | undefined;
    if (e.key === 'ArrowRight') next = enabled[(pos + 1) % enabled.length];
    else if (e.key === 'ArrowLeft') next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === 'Home') next = enabled[0];
    else if (e.key === 'End') next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className={cn('flex items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-border', className)}>
      {items.map((it, i) => {
        const selected = it.id === value;
        const Icon = it.icon;
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
            tabIndex={selected ? 0 : -1}
            disabled={it.disabled}
            onClick={() => onChange(it.id)}
            className={cn(
              'relative -mb-px inline-flex h-9 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 px-3 text-[13px] font-medium transition-colors duration-150 disabled:opacity-40',
              selected ? 'border-violet text-text' : 'border-transparent text-muted hover:border-border-strong hover:text-text',
            )}
          >
            {Icon && <Icon aria-hidden className="h-4 w-4" />}
            {it.label}
            {it.count !== undefined && (
              <span
                className={cn(
                  'min-w-5 rounded-full px-1.5 text-center text-[11px] leading-4 tabular-nums',
                  it.countTone === 'danger' && it.count > 0 ? 'bg-danger/20 text-danger-fg' : it.countTone === 'warning' && it.count > 0 ? 'bg-warning/20 text-warning-fg' : 'bg-surface-3 text-muted',
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idBase?: string;
  id: string;
  className?: string;
  children?: ReactNode;
}

/** Content area belonging to the selected tab. */
export function TabPanel({ idBase = 'tabs', id, className, children }: TabPanelProps) {
  return (
    <div role="tabpanel" id={tabPanelId(idBase, id)} aria-labelledby={tabId(idBase, id)} tabIndex={0} className={cn('focus-visible:outline-offset-4', className)}>
      {children}
    </div>
  );
}
