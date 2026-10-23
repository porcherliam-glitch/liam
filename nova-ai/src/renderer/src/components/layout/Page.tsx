import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useUiStore, type PageBackLink } from '../../stores/ui';

export interface PageProps {
  /** Shown in the top bar and the window title. */
  title: string;
  /** Short explanation below the top bar. */
  description?: ReactNode;
  /** Page-level buttons (right side of the description row). */
  actions?: ReactNode;
  /** Back link in the top bar (e.g. { to: paths.projects, label: 'Projekte' }). */
  back?: PageBackLink;
  /** No padding / max width, full height (studio). */
  fullBleed?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * Page frame: sets the top bar title (+ document title), renders the optional description/actions row
 * and gives consistent padding. Every page should render exactly one <Page>.
 * @example <Page title="Freigaben" description="…" actions={<Button>…</Button>}>…</Page>
 */
export function Page({ title, description, actions, back, fullBleed, className, children }: PageProps) {
  const setPage = useUiStore((s) => s.setPage);
  const backTo = back?.to;
  const backLabel = back?.label;

  useEffect(() => {
    setPage(title, backTo && backLabel ? { to: backTo, label: backLabel } : null);
    document.title = `${title} · NOVA AI`;
  }, [title, backTo, backLabel, setPage]);

  useEffect(() => () => setPage(null, null), [setPage]);

  if (fullBleed) return <div className={cn('flex h-full min-h-0 flex-col', className)}>{children}</div>;

  return (
    <div className={cn('mx-auto w-full max-w-[1600px] px-6 py-5', className)}>
      {(description || actions) && (
        <div className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          {description ? <div className="max-w-3xl text-[13px] text-muted">{description}</div> : <span />}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
