// Windows toasts for daemon 'notification' events (UI-SPEC §5) and the close-to-tray explanation.
// Key decisions:
// - The daemon already filters by settings.notifications and keeps bodies generic (no command lines, paths or file
//   content – toasts can appear on the lock screen); main only validates the payload and shows it.
// - A toast is only shown when the user is not looking at NOVA (window hidden, minimised or not focused): the
//   renderer has its own bell/toasts, double notifications would be noise.
// - Click → show the window and navigate to the most specific page (approvals, task, project errors, …) and mark
//   the notification as read.
// - Notification objects are kept referenced until they are clicked/closed (otherwise the garbage collector can drop
//   them and the click event is lost); ids are de-duplicated (a reconnecting event stream must not toast twice).
import { NotificationSchema, type Notification } from '@shared/schemas';
import { errorText, type MainLogger } from './log';

/** Renderer route (HashRouter path) for a notification click. */
export function notificationTarget(n: Pick<Notification, 'category' | 'projectId' | 'taskId'>): string {
  const project = n.projectId ? `/projects/${encodeURIComponent(n.projectId)}` : null;
  switch (n.category) {
    case 'approval':
      return '/approvals';
    case 'update':
      return '/settings';
    case 'task_done':
    case 'blocker':
      if (project && n.taskId) return `${project}?tab=tasks&task=${encodeURIComponent(n.taskId)}`;
      return project ?? '/tasks';
    case 'error':
      if (project && n.taskId) return `${project}?tab=tasks&task=${encodeURIComponent(n.taskId)}`;
      if (project) return `${project}?tab=errors`;
      return '/';
    case 'info':
    default:
      if (project && n.taskId) return `${project}?tab=tasks&task=${encodeURIComponent(n.taskId)}`;
      return project ?? '/';
  }
}

export interface NotificationLike {
  on(event: 'click' | 'close' | 'failed', listener: () => void): unknown;
  show(): void;
  close(): void;
}

export interface NotificationPresenterDeps {
  isSupported(): boolean;
  create(opts: { title: string; body: string; icon?: string; silent?: boolean }): NotificationLike;
  /** True when a toast should be shown (the user is not looking at the window). */
  shouldShow(): boolean;
  /** Show the window and navigate there. */
  openTarget(path: string): void;
  /** Best effort: notifications.markRead({ ids: [id] }). */
  markRead?(id: string): void;
  icon?: string;
  log: MainLogger;
  now?: () => number;
}

const MAX_SEEN = 500;
/** Drop references after this time even if Windows never reports close (toasts live in the Action Center). */
const RETAIN_MS = 15 * 60_000;

export class NotificationPresenter {
  private readonly seen = new Set<string>();
  private readonly active = new Map<NotificationLike, number>();

  constructor(private readonly deps: NotificationPresenterDeps) {}

  /** Handles a daemon 'notification' event payload. Returns true when a toast was shown. */
  showDaemonNotification(payload: unknown): boolean {
    const parsed = NotificationSchema.safeParse(payload);
    if (!parsed.success) {
      this.deps.log.warn('Ungültige Benachrichtigung vom Hintergrunddienst ignoriert');
      return false;
    }
    const n = parsed.data;
    if (this.seen.has(n.id)) return false;
    this.remember(n.id);
    if (n.readAt !== null || !this.deps.shouldShow()) return false;
    const target = notificationTarget(n);
    return this.present(n.title, n.body, () => {
      this.deps.openTarget(target);
      try {
        this.deps.markRead?.(n.id);
      } catch {
        /* best effort */
      }
    });
  }

  /** Informational toast from main itself (e.g. close-to-tray explanation). Shown regardless of focus. */
  showInfo(title: string, body: string, onClick?: () => void): boolean {
    return this.present(title, body, onClick ?? null);
  }

  /** Closes all toasts of this run (on quit). */
  dispose(): void {
    for (const n of this.active.keys()) {
      try {
        n.close();
      } catch {
        /* already gone */
      }
    }
    this.active.clear();
  }

  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > MAX_SEEN) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  private present(title: string, body: string, onClick: (() => void) | null): boolean {
    if (!this.deps.isSupported()) return false;
    this.prune();
    try {
      const n = this.deps.create({ title: title.slice(0, 200), body: body.slice(0, 1000), icon: this.deps.icon, silent: false });
      const release = () => this.active.delete(n);
      n.on('click', () => {
        release();
        if (onClick) {
          try {
            onClick();
          } catch (e) {
            this.deps.log.warn('Klick auf Benachrichtigung fehlgeschlagen', { error: errorText(e) });
          }
        }
      });
      n.on('close', release);
      n.on('failed', release);
      this.active.set(n, (this.deps.now ?? Date.now)());
      n.show();
      return true;
    } catch (e) {
      this.deps.log.warn('Benachrichtigung konnte nicht angezeigt werden', { error: errorText(e) });
      return false;
    }
  }

  private prune(): void {
    const now = (this.deps.now ?? Date.now)();
    for (const [n, at] of this.active) if (now - at > RETAIN_MS) this.active.delete(n);
  }
}
