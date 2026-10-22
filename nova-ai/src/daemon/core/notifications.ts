// Notification service: emits 'notification' events filtered by settings.notifications.
// Electron main turns them into native Windows notifications.
import type { Notification } from '@shared/schemas';
import type { EventBus } from './bus';
import type { SettingsService } from './settings';
import type { NotificationService } from '../contracts';
import { newId } from './ids';

export function createNotificationService(bus: EventBus, settings: SettingsService): NotificationService {
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
      const n: Notification = { ...input, id: newId('ntf'), ts: Date.now() };
      bus.emit('notification', n);
      return n;
    },
  };
}
