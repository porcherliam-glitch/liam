// Small UI pieces shared by the UI-4 pages (settings, models, costs, knowledge, integrations).
import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Badge } from '../../../components/ui/Badge';
import { Input, type InputProps } from '../../../components/ui/Field';

export type NoticeTone = 'info' | 'warning' | 'danger' | 'success';

const NOTICE: Record<NoticeTone, { icon: LucideIcon; box: string; iconClass: string }> = {
  info: { icon: Info, box: 'border-info/30 bg-info/8', iconClass: 'text-info-fg' },
  warning: { icon: TriangleAlert, box: 'border-warning/35 bg-warning/10', iconClass: 'text-warning-fg' },
  danger: { icon: CircleAlert, box: 'border-danger/40 bg-danger/10', iconClass: 'text-danger-fg' },
  success: { icon: CircleCheck, box: 'border-success/35 bg-success/8', iconClass: 'text-success-fg' },
};

export interface NoticeProps {
  tone?: NoticeTone;
  title?: ReactNode;
  icon?: LucideIcon;
  /** Buttons/links on the right (wrap below on narrow screens). */
  actions?: ReactNode;
  /** role="alert" for problems that need attention right now. */
  alert?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Inline hint box (color + icon + text).
 * @example <Notice tone="warning" title="Schlüssel nicht sicher gespeichert">…</Notice>
 */
export function Notice({ tone = 'info', title, icon, actions, alert, className, children }: NoticeProps) {
  const t = NOTICE[tone];
  const Icon = icon ?? t.icon;
  return (
    <div role={alert ? 'alert' : undefined} className={cn('flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border px-3.5 py-2.5', t.box, className)}>
      <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', t.iconClass)} />
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-text">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? 'mt-0.5 text-muted' : 'text-text')}>{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** "Nicht gespeichert" marker for forms with pending changes. */
export function UnsavedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" variant="outline" className={className} title="Es gibt Änderungen, die noch nicht gespeichert sind.">
      Nicht gespeichert
    </Badge>
  );
}

export interface NumberInputProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (text: string) => void;
  /** Unit shown inside the field ("MB", "Sek.", "$"). */
  unit?: string;
  /** Allow decimals (default: whole numbers only → numeric keyboard). */
  decimal?: boolean;
}

/** Text field for numbers (accepts "2,5" and "2.5"). Parse with parseNumber() from forms.ts. */
export function NumberInput({ value, onChange, unit, decimal, className, ...rest }: NumberInputProps) {
  return (
    <Input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      autoComplete="off"
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      suffix={unit ? <span className="pr-1.5 text-muted">{unit}</span> : undefined}
      className={cn('tabular-nums', className)}
      {...rest}
    />
  );
}
