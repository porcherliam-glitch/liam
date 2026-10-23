import { cn } from '../../lib/cn';
import { toneClasses, type Tone } from '../../lib/labels';

export interface StatusDotProps {
  tone?: Tone;
  /** Animated halo for "live" states. */
  pulse?: boolean;
  /** Screen reader text; omit when a visible label is next to the dot. */
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Small colored dot. Always combine with visible text or a label. */
export function StatusDot({ tone = 'neutral', pulse, label, size = 'md', className }: StatusDotProps) {
  const dim = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  return (
    <span className={cn('relative inline-flex shrink-0', dim, className)} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pulse && <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', toneClasses[tone].dot)} />}
      <span className={cn('relative inline-flex rounded-full', dim, toneClasses[tone].dot)} />
    </span>
  );
}
