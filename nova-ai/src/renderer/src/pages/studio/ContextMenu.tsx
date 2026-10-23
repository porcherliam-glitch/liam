import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ContextMenuEntry =
  | { type: 'item'; id: string; label: string; icon?: LucideIcon; shortcut?: string; danger?: boolean; disabled?: boolean; onSelect: () => void }
  | { type: 'separator'; id: string };

export interface ContextMenuProps {
  /** Viewport position (px). */
  x: number;
  y: number;
  label: string;
  entries: ContextMenuEntry[];
  onClose: () => void;
  /** Element that gets the focus back after closing with Esc. */
  returnFocus?: HTMLElement | null;
}

/**
 * Small context menu (role="menu") rendered in a portal: arrow keys / Home / End move, Enter selects,
 * Esc / Tab / outside click close. Stays inside the viewport.
 */
export function ContextMenu({ x, y, label, entries, onClose, returnFocus }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    setPos({ left: Math.max(4, Math.min(x, vw - rect.width - 4)), top: Math.max(4, Math.min(y, vh - rect.height - 4)) });
  }, [x, y]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    const onBlur = () => onCloseRef.current();
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, []);

  const items = () => [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
      returnFocus?.focus();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      onCloseRef.current();
      returnFocus?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[80] min-w-52 rounded-lg border border-border-strong bg-surface p-1 shadow-xl shadow-black/50 animate-pop-in"
    >
      {entries.map((entry) =>
        entry.type === 'separator' ? (
          <div key={entry.id} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={entry.id}
            type="button"
            role="menuitem"
            aria-disabled={entry.disabled || undefined}
            tabIndex={-1}
            onClick={() => {
              if (entry.disabled) return;
              onCloseRef.current();
              entry.onSelect();
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-150 focus-visible:outline-offset-0',
              entry.disabled ? 'cursor-not-allowed text-subtle' : entry.danger ? 'text-danger-fg hover:bg-danger/12 focus:bg-danger/12' : 'text-text hover:bg-surface-2 focus:bg-surface-2',
            )}
          >
            {entry.icon ? <entry.icon aria-hidden className="h-4 w-4 shrink-0 opacity-80" /> : <span className="w-4" aria-hidden />}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && <kbd className="font-sans text-[11px] text-subtle">{entry.shortcut}</kbd>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}
