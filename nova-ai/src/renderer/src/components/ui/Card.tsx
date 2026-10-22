import type { ComponentProps, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface CardProps extends Omit<ComponentProps<'section'>, 'title' | 'ref'> {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Right side of the header (buttons, links, badges). */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Body padding (default md). */
  padding?: 'none' | 'sm' | 'md';
  /** Heading level of the title (default 2). */
  level?: 2 | 3;
  as?: 'section' | 'div' | 'article';
}

const PADDING = { none: '', sm: 'p-3', md: 'p-4' } as const;

/**
 * Surface container with optional header (title, description, icon, actions) and footer.
 * @example <Card title="Ressourcen" icon={Gauge} actions={<Button size="sm">…</Button>}>…</Card>
 */
export function Card({ title, description, icon: Icon, actions, footer, padding = 'md', level = 2, as: Tag = 'section', className, children, ...rest }: CardProps) {
  const H = level === 2 ? 'h2' : 'h3';
  const hasHeader = title || actions;
  return (
    <Tag className={cn('flex min-w-0 flex-col rounded-xl border border-border bg-surface', className)} {...rest}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-3 px-4 pt-3.5">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && (
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-violet/12 text-violet-fg">
                <Icon aria-hidden className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0">
              {title && <H className="truncate text-sm font-semibold text-text">{title}</H>}
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-w-0 flex-1', PADDING[padding], hasHeader && padding !== 'none' && 'pt-3')}>{children}</div>
      {footer && <footer className="border-t border-border px-4 py-2.5">{footer}</footer>}
    </Tag>
  );
}
