import type { ReactNode } from 'react';
import { CircleAlert, Inbox, RefreshCw, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { errorMessage } from '../../lib/api';
import { Button } from './Button';
import { Spinner } from './Spinner';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Buttons/links. */
  actions?: ReactNode;
  /** Smaller variant for use inside cards and tables. */
  compact?: boolean;
  className?: string;
}

/**
 * Friendly placeholder for empty lists and first-start states.
 * @example <EmptyState icon={FolderKanban} title="Noch kein Projekt" description="…" actions={<Button variant="primary">Projekt erstellen</Button>} />
 */
export function EmptyState({ icon: Icon = Inbox, title, description, actions, compact, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'gap-1.5 px-4 py-6' : 'gap-3 px-6 py-14', className)}>
      <span className={cn('inline-flex items-center justify-center rounded-xl bg-violet/10 text-violet-fg', compact ? 'h-8 w-8' : 'h-12 w-12')}>
        <Icon aria-hidden className={compact ? 'h-4 w-4' : 'h-6 w-6'} />
      </span>
      <div className="max-w-md">
        <p className={cn('font-semibold text-text', compact ? 'text-[13px]' : 'text-base')}>{title}</p>
        {description && <div className={cn('mt-1 text-muted', compact ? 'text-xs' : 'text-[13px]')}>{description}</div>}
      </div>
      {actions && <div className={cn('flex flex-wrap items-center justify-center gap-2', compact ? 'mt-1' : 'mt-2')}>{actions}</div>}
    </div>
  );
}

export interface LoadingStateProps {
  label?: string;
  compact?: boolean;
  className?: string;
}

/** Centered spinner with text, for the first load of a section. */
export function LoadingState({ label = 'Wird geladen …', compact, className }: LoadingStateProps) {
  return (
    <div role="status" className={cn('flex items-center justify-center gap-2 text-[13px] text-muted', compact ? 'py-6' : 'py-16', className)}>
      <Spinner size="md" label={null} />
      {label}
    </div>
  );
}

export interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

/** Load error with the German message and a retry button. */
export function ErrorState({ error, title = 'Die Daten konnten nicht geladen werden', onRetry, compact, className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex flex-col items-center justify-center gap-2 text-center', compact ? 'px-4 py-6' : 'px-6 py-12', className)}>
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-danger/12 text-danger-fg">
        <CircleAlert aria-hidden className="h-5 w-5" />
      </span>
      <p className="text-[13px] font-semibold text-text">{title}</p>
      <p className="max-w-md text-xs text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button size="sm" icon={RefreshCw} onClick={onRetry} className="mt-1">
          Erneut versuchen
        </Button>
      )}
    </div>
  );
}
