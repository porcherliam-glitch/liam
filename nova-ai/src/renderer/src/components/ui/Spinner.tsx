import { LoaderCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Screen reader text (default "Wird geladen"). Pass null when a visible label exists nearby. */
  label?: string | null;
  className?: string;
}

const SIZES = { xs: 'h-3 w-3', sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-6 w-6' } as const;

/** Rotating loader icon. */
export function Spinner({ size = 'md', label = 'Wird geladen', className }: SpinnerProps) {
  return (
    <span role={label ? 'status' : undefined} className={cn('inline-flex shrink-0', className)}>
      <LoaderCircle aria-hidden className={cn('animate-spin text-current', SIZES[size])} />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}
