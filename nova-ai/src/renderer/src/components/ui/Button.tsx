import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, sets aria-busy and disables the button. */
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  fullWidth?: boolean;
  children?: ReactNode;
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow,filter] duration-150 disabled:opacity-50 disabled:pointer-events-none';

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-nova-gradient text-white shadow-sm shadow-violet/25 hover:brightness-110 hover:shadow-md hover:shadow-violet/30',
  secondary: 'border border-border bg-surface-2 text-text hover:border-border-strong hover:bg-surface-3',
  ghost: 'text-muted hover:bg-surface-2 hover:text-text',
  danger: 'border border-danger/40 bg-danger/12 text-danger-fg hover:bg-danger/22 hover:border-danger/60',
  subtle: 'bg-violet/14 text-violet-fg hover:bg-violet/24',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs',
  md: 'h-8 px-3 text-[13px]',
  lg: 'h-10 px-4 text-sm',
};

const ICON_SIZES: Record<ButtonSize, string> = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-4 w-4' };

/**
 * Button with variants primary (violet→blue gradient) / secondary / ghost / danger / subtle.
 * @example <Button icon={Play} loading={start.loading} onClick={...}>Starten</Button>
 */
export function Button({ variant = 'secondary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, fullWidth, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, BUTTON_VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 'xs' : 'sm'} label={null} /> : Icon ? <Icon aria-hidden className={cn('shrink-0', ICON_SIZES[size])} /> : null}
      {children}
      {IconRight && !loading && <IconRight aria-hidden className={cn('shrink-0', ICON_SIZES[size])} />}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  icon: LucideIcon;
  /** Accessible name, also used as tooltip (title). Required. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Small numeric badge (e.g. pending approvals). */
  badge?: number;
}

const ICON_BUTTON_SIZES: Record<ButtonSize, string> = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10' };

/** Square icon-only button with mandatory accessible label. */
export function IconButton({ icon: Icon, label, variant = 'ghost', size = 'md', loading, badge, className, disabled, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, BUTTON_VARIANTS[variant], ICON_BUTTON_SIZES[size], 'relative px-0', className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" label={null} /> : <Icon aria-hidden className={ICON_SIZES[size]} />}
      {badge !== undefined && badge > 0 && (
        <span aria-hidden className="absolute -top-1 -right-1 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] leading-4 font-semibold text-black">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
