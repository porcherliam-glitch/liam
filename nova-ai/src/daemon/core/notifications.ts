// Notification service: persists notifications (history for users who come back later) and emits
// 'notification' events filtered by settings.notifications. Electron main shows them as Windows toasts.
// Bodies must be generic German text (no command lines, paths or file content – toasts appear on the lock screen).
import type { Notification } from '@shared/schemas';
import type { Db } from '../db/database';
import type { EventBus } from './bus';
import type { SettingsService } from './settings';
import type { NotificationService } from '../contracts';
import { newId } from './ids';
import { redactString } from './redact';

interface NotificationRow {
  id: string;
  level: Notification['level'];
  category: Notification['category'];
  title: string;
  body: string;
  project_id: string | null;
  task_id: string | null;
  ts: number;
  read_at: number | null;
}

const toNotification = (r: NotificationRow): Notification => ({
  id: r.id,
  level: r.level,
  category: r.category,
  title: r.title,
  body: r.body,
  projectId: r.project_id,
  taskId: r.task_id,
  ts: r.ts,
  readAt: r.read_at,
});

export function createNotificationService(bus: EventBus, settings: SettingsService, db: Db): NotificationService {
  return {
    notify(input) {
      const s = settings.section('notifications');
      if (!s.enabled) return null;
      const enabled =
        input.category === 'task_done' ? s.onTaskDone :
        input.category === 'error' ? s.onError :
        input.category === 'approval' ? s.onApproval :
        input.category === 'blocker' ? s.onBlocker : true;
      if (!enabled) return null;
      const n: Notification = {
        ...input,
        title: redactString(input.title).slice(0, 200),
        body: redactString(input.body).slice(0, 1000),
        id: newId('ntf'),
        ts: Date.now(),
        readAt: null,
      };
      db.run('INSERT INTO notifications(id, level, category, title, body, project_id, task_id, ts, read_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)', [
        n.id,
        n.level,
        n.category,
        n.title,
        n.body,
        n.projectId,
        n.taskId,
        n.ts,
      ]);
      bus.emit('notification', n);
      return n;
    },
    list(opts = {}) {
      const rows = opts.unreadOnly
        ? db.all<NotificationRow>('SELECT * FROM notifications WHERE read_at IS NULL ORDER BY ts DESC LIMIT ?', [opts.limit ?? 100])
        : db.all<NotificationRow>('SELECT * FROM notifications ORDER BY ts DESC LIMIT ?', [opts.limit ?? 100]);
      return rows.map(toNotification);
    },
    markRead(ids) {
      const now = Date.now();
      if (!ids) {
        db.run('UPDATE notifications SET read_at = ? WHERE read_at IS NULL', [now]);
        return;
      }
      db.transaction(() => {
        for (const id of ids) db.run('UPDATE notifications SET read_at = ? WHERE id = ? AND read_at IS NULL', [now, id]);
      });
    },
    unreadCount() {
      return Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM notifications WHERE read_at IS NULL')?.n ?? 0);
    },
    prune(olderThanMs) {
      return db.run('DELETE FROM notifications WHERE ts < ?', [olderThanMs]).changes;
    },
  };
}
