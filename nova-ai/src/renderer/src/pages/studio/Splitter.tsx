import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

export interface SplitterProps {
  /**
   * "vertical" = a vertical bar between two columns (changes a width),
   * "horizontal" = a horizontal bar between two rows (changes a height).
   */
  orientation: 'vertical' | 'horizontal';
  /** Current size of the controlled pane in px. */
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  /**
   * Which side the controlled pane is on. "start" = left/top (dragging right/down grows it),
   * "end" = right/bottom (dragging left/up grows it).
   */
  side: 'start' | 'end';
  /** Size restored on double click / Enter. */
  defaultValue: number;
  /** Accessible name, e.g. "Breite des Dateibaums". */
  label: string;
  className?: string;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));

/**
 * Draggable, keyboard accessible separator (role="separator"): arrow keys move 16 px (Shift: 64 px),
 * Home/End jump to min/max, Enter or double click restores the default size.
 * While dragging a transparent overlay keeps iframes (preview) from swallowing pointer events.
 */
export function Splitter({ orientation, value, min, max, onChange, side, defaultValue, label, className }: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ pos: number; value: number } | null>(null);
  const vertical = orientation === 'vertical';
  const effectiveMax = Math.max(min, max);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    start.current = { pos: vertical ? e.clientX : e.clientY, value };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture unsupported */
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const delta = (vertical ? e.clientX : e.clientY) - start.current.pos;
    onChange(clamp(start.current.value + (side === 'start' ? delta : -delta), min, effectiveMax));
  };

  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    start.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const grow = side === 'start' ? 1 : -1;
    let next: number | null = null;
    if (vertical && e.key === 'ArrowLeft') next = value - step * grow;
    else if (vertical && e.key === 'ArrowRight') next = value + step * grow;
    else if (!vertical && e.key === 'ArrowUp') next = value - step * grow;
    else if (!vertical && e.key === 'ArrowDown') next = value + step * grow;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = effectiveMax;
    else if (e.key === 'Enter') next = defaultValue;
    if (next === null) return;
    e.preventDefault();
    onChange(clamp(next, min, effectiveMax));
  };

  return (
    <>
      <div
        role="separator"
        aria-orientation={vertical ? 'vertical' : 'horizontal'}
        aria-label={label}
        aria-valuenow={Math.round(value)}
        aria-valuemin={min}
        aria-valuemax={effectiveMax}
        tabIndex={0}
        title={`${label} – ziehen oder Pfeiltasten verwenden, Doppelklick setzt zurück`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        onDoubleClick={() => onChange(clamp(defaultValue, min, effectiveMax))}
        onKeyDown={onKeyDown}
        className={cn(
          'group relative z-10 shrink-0 touch-none select-none focus-visible:outline-none',
          vertical ? '-mx-[3px] w-[7px] cursor-col-resize' : '-my-[3px] h-[7px] cursor-row-resize',
          className,
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute bg-border transition-colors duration-150 group-hover:bg-violet/70 group-focus-visible:bg-violet',
            vertical ? 'inset-y-0 left-[3px] w-px' : 'inset-x-0 top-[3px] h-px',
            dragging && 'bg-violet',
          )}
        />
      </div>
      {dragging && typeof document !== 'undefined' &&
        createPortal(<div aria-hidden className={cn('fixed inset-0 z-[60]', vertical ? 'cursor-col-resize' : 'cursor-row-resize')} />, document.body)}
    </>
  );
}
