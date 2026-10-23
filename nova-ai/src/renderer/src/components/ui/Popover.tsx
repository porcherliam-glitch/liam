import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The toggle button. Receives the props it must spread (aria-expanded, aria-controls, onClick).
   * @example trigger={(p) => <IconButton icon={Bell} label="Meldungen" {...p} />}
   */
  trigger: (props: { 'aria-expanded': boolean; 'aria-controls': string; 'aria-haspopup': 'dialog'; onClick: () => void }) => ReactNode;
  /** Accessible name of the panel. */
  label: string;
  align?: 'start' | 'end';
  /** Panel width in px (default 360). */
  width?: number;
  className?: string;
  children: ReactNode;
}

/**
 * Anchored panel (menus in the top bar). Closes on Esc and outside click; focus moves into the panel
 * on open and back to the trigger on Esc.
 */
export function Popover({ open, onOpenChange, trigger, label, align = 'end', width = 360, className, children }: PopoverProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onOpenChangeRef.current(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onOpenChangeRef.current(false);
      rootRef.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('button:not([disabled]),a[href],[tabindex="0"]');
      (first ?? panelRef.current)?.focus();
    });
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ 'aria-expanded': open, 'aria-controls': id, 'aria-haspopup': 'dialog', onClick: () => onOpenChange(!open) })}
      {open && (
        <div
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          style={{ width: `min(${width}px, calc(100vw - 2rem))` }}
          className={cn(
            'absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-border-strong bg-surface shadow-2xl shadow-black/50 animate-pop-in',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
