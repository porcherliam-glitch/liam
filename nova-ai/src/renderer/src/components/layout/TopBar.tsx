import { Link, useLocation } from 'react-router';
import { ArrowLeft, ShieldQuestion } from 'lucide-react';
import { cn } from '../../lib/cn';
import { daemonPillMeta, toneClasses } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { useDaemonStore } from '../../stores/daemon';
import { useUiStore } from '../../stores/ui';
import { StatusDot } from '../ui/StatusDot';
import { WorkControls } from '../common/WorkControls';
import { navLabelFor } from './nav';
import { NotificationsMenu } from './NotificationsMenu';
import { OperationsMenu } from './OperationsMenu';

/** Background service status pill (Läuft / Pausiert / Startet / Getrennt / Fehler); links to the logs. */
export function DaemonStatusPill() {
  const connection = useDaemonStore((s) => s.connection);
  const status = useDaemonStore((s) => s.status);
  const meta = daemonPillMeta(connection, status);
  const details = [
    `Hintergrunddienst: ${meta.label}`,
    connection?.message,
    status ? `Version ${status.version} · PID ${status.pid}` : null,
    status?.lastError ? `Letzter Fehler: ${status.lastError}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <Link
      to={paths.logs}
      title={details}
      aria-label={`Hintergrunddienst: ${meta.label}. Protokolle öffnen`}
      className={cn('inline-flex h-8 items-center gap-2 rounded-full border bg-surface-2 px-3 text-xs font-medium no-underline transition-colors duration-150 hover:bg-surface-3 hover:no-underline', toneClasses[meta.tone].border, toneClasses[meta.tone].text)}
    >
      <StatusDot tone={meta.tone} pulse={meta.tone === 'success' || meta.spin} />
      <span>
        <span className="hidden xl:inline">Dienst: </span>
        {meta.label}
      </span>
    </Link>
  );
}

/** Shield icon with the number of pending approvals; links to /approvals. */
export function ApprovalsButton() {
  const pending = useDaemonStore((s) => s.pendingApprovals);
  const label = pending > 0 ? `Freigaben: ${pending} offen` : 'Freigaben: keine offen';
  return (
    <Link
      to={paths.approvals}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex h-8 w-8 items-center justify-center rounded-lg no-underline transition-colors duration-150 hover:no-underline',
        pending > 0 ? 'text-warning-fg hover:bg-warning/10' : 'text-muted hover:bg-surface-2 hover:text-text',
      )}
    >
      <ShieldQuestion aria-hidden className="h-4 w-4" />
      {pending > 0 && (
        <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] leading-4 font-bold text-black tabular-nums">
          {pending > 99 ? '99+' : pending}
        </span>
      )}
    </Link>
  );
}

/** Top bar: back link + page title (set by <Page/>), work controls, operations, daemon pill, approvals, notifications. */
export function TopBar() {
  const { pathname } = useLocation();
  const title = useUiStore((s) => s.pageTitle) ?? navLabelFor(pathname) ?? 'NOVA AI';
  const back = useUiStore((s) => s.pageBack);
  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface/60 px-5 backdrop-blur">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {back && (
          <Link
            to={back.to}
            aria-label={`Zurück zu ${back.label}`}
            title={`Zurück zu ${back.label}`}
            className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-muted no-underline hover:bg-surface-2 hover:text-text hover:no-underline"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            <span className="hidden lg:inline">{back.label}</span>
          </Link>
        )}
        <h1 className="truncate text-base font-semibold">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <WorkControls compact />
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <OperationsMenu />
        <DaemonStatusPill />
        <ApprovalsButton />
        <NotificationsMenu />
      </div>
    </header>
  );
}
