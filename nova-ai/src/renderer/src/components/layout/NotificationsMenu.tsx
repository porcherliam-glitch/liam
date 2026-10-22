import { useNavigate } from 'react-router';
import { Bell, CheckCheck } from 'lucide-react';
import type { Notification } from '@shared/schemas';
import { cn } from '../../lib/cn';
import { metaOf, NOTIFICATION_LEVEL, toneClasses } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { useDaemonStore, useSupports } from '../../stores/daemon';
import { useUiStore } from '../../stores/ui';
import { Button } from '../ui/Button';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Popover } from '../ui/Popover';
import { RelativeTime } from '../common/RelativeTime';

function targetOf(n: Notification): string | null {
  if (n.category === 'approval') return paths.approvals;
  if (n.projectId && n.taskId) return paths.project(n.projectId, { tab: 'tasks', task: n.taskId });
  if (n.projectId) return paths.project(n.projectId);
  return null;
}

/**
 * Bell with the unread count; the menu lists what happened (also while the window was closed).
 * Hidden when the daemon does not support notifications.
 */
export function NotificationsMenu() {
  const supported = useSupports('notifications.list');
  const open = useUiStore((s) => s.notificationsOpen);
  const setOpen = useUiStore((s) => s.setNotificationsOpen);
  const unread = useDaemonStore((s) => s.unreadNotifications);
  const navigate = useNavigate();

  const list = useRpc('notifications.list', open ? { limit: 30 } : null, { refetchOn: ['notification'] });
  const markRead = useMutation('notifications.markRead', {
    errorToast: 'Meldungen konnten nicht als gelesen markiert werden',
    onSuccess: () => void useDaemonStore.getState().refreshNotifications().then(() => list.refetch()),
  });

  if (!supported) return null;
  const label = unread > 0 ? `Meldungen: ${unread} ungelesen` : 'Meldungen';

  const openItem = (n: Notification) => {
    if (n.readAt == null) void markRead.run({ ids: [n.id] });
    const to = targetOf(n);
    setOpen(false);
    if (to) navigate(to);
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label="Meldungen"
      width={380}
      trigger={(p) => (
        <button
          type="button"
          {...p}
          aria-label={label}
          title={label}
          className={cn(
            'relative inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150',
            open ? 'bg-surface-3 text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
          )}
        >
          <Bell aria-hidden className="h-4 w-4" />
          {unread > 0 && (
            <span aria-hidden className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-violet px-1 text-center text-[10px] leading-4 font-bold text-white tabular-nums">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p className="text-[13px] font-semibold">Meldungen</p>
        <Button size="sm" variant="ghost" icon={CheckCheck} disabled={unread === 0} loading={markRead.loading} onClick={() => void markRead.run({})}>
          Alle gelesen
        </Button>
      </div>
      <div className="max-h-[420px] overflow-y-auto">
        {list.loading ? (
          <LoadingState compact />
        ) : list.error && !list.data ? (
          <ErrorState compact error={list.error} onRetry={() => void list.refetch()} />
        ) : !list.data?.length ? (
          <EmptyState compact icon={Bell} title="Keine Meldungen" description="Hier erscheint, was NOVA erledigt hat oder wofür eine Entscheidung nötig ist." />
        ) : (
          <ul className="divide-y divide-border/70">
            {list.data.map((n) => {
              const meta = metaOf(NOTIFICATION_LEVEL, n.level);
              const Icon = meta.icon;
              const unreadItem = n.readAt == null;
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)} className={cn('flex w-full items-start gap-2.5 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-surface-2', unreadItem && 'bg-violet/5')}>
                    <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', toneClasses[meta.tone].text)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={cn('truncate text-[13px]', unreadItem ? 'font-semibold text-text' : 'text-text/90')}>{n.title}</span>
                        <RelativeTime ts={n.ts} className="shrink-0 text-[11px] text-muted" />
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-xs text-muted">{n.body}</span>
                    </span>
                    {unreadItem && <span aria-label="ungelesen" role="img" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Popover>
  );
}
