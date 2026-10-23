import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TooltipProps {
  content: ReactNode;
  /** A single focusable element (button, link) or any node. */
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const SIDE = {
  top: 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-1.5 -translate-x-1/2',
  left: 'right-full top-1/2 mr-1.5 -translate-y-1/2',
  right: 'left-full top-1/2 ml-1.5 -translate-y-1/2',
} as const;

/**
 * Hover/focus tooltip (CSS only, no portal). Adds aria-describedby to the child element.
 * @example <Tooltip content="Gleiche Aktion künftig ohne Rückfrage erlauben"><Button>Immer erlauben</Button></Tooltip>
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, { 'aria-describedby': id }) : children;
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {child}
      <span
        role="tooltip"
        id={id}
        className={cn(
          'pointer-events-none absolute z-40 w-max max-w-72 rounded-md border border-border-strong bg-surface-3 px-2 py-1 text-xs leading-snug font-normal text-text opacity-0 shadow-lg shadow-black/40 transition-opacity duration-150 group-focus-within/tt:opacity-100 group-hover/tt:opacity-100',
          SIDE[side],
        )}
      >
        {content}
      </span>
    </span>
  );
}
