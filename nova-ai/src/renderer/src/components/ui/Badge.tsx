import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toneClasses, type EnumMeta, type Tone } from '../../lib/labels';

export interface BadgeProps {
  tone?: Tone;
  icon?: LucideIcon;
  /** Spin the icon (in-progress states). */
  spin?: boolean;
  size?: 'sm' | 'md';
  variant?: 'soft' | 'outline' | 'solid';
  title?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Small colored label. Status = color + icon + text (never color alone).
 * @example <Badge tone="success" icon={CircleCheck}>Bestanden</Badge>
 */
export function Badge({ tone = 'neutral', icon: Icon, spin, size = 'sm', variant = 'soft', title, className, children }: BadgeProps) {
  const t = toneClasses[tone];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-md font-medium whitespace-nowrap',
        size === 'sm' ? 'px-1.5 py-px text-[11px] leading-4' : 'px-2 py-0.5 text-xs leading-4',
        variant === 'soft' && t.soft,
        variant === 'outline' && cn('border bg-transparent', t.border, t.text),
        variant === 'solid' && t.solid,
        className,
      )}
    >
      {Icon && <Icon aria-hidden className={cn('shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5', spin && 'animate-spin')} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export interface StatusBadgeProps extends Omit<BadgeProps, 'tone' | 'icon' | 'spin' | 'children'> {
  meta: EnumMeta;
  /** Override the label text. */
  children?: ReactNode;
}

/** Badge from a labels.ts entry, e.g. `<StatusBadge meta={metaOf(TASK_STATUS, task.status)} />`. */
export function StatusBadge({ meta, title, children, ...rest }: StatusBadgeProps) {
  return (
    <Badge tone={meta.tone} icon={meta.icon} spin={meta.spin} title={title ?? meta.description} {...rest}>
      {children ?? meta.label}
    </Badge>
  );
}
