import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { useToastStore, type ToastTone } from '../../stores/toasts';

const TONE: Record<ToastTone, { icon: typeof Info; className: string; iconClass: string }> = {
  success: { icon: CircleCheck, className: 'border-success/35', iconClass: 'text-success-fg' },
  info: { icon: Info, className: 'border-info/35', iconClass: 'text-info-fg' },
  warning: { icon: TriangleAlert, className: 'border-warning/40', iconClass: 'text-warning-fg' },
  error: { icon: CircleAlert, className: 'border-danger/45', iconClass: 'text-danger-fg' },
};

/** Renders the global toasts (bottom right). Mounted once by the AppShell. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => {
        const tone = TONE[t.tone];
        const Icon = tone.icon;
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn('pointer-events-auto flex items-start gap-2.5 rounded-xl border bg-surface-2 px-3.5 py-3 shadow-xl shadow-black/40 animate-slide-in', tone.className)}
          >
            <Icon aria-hidden className={cn('mt-0.5 h-4 w-4 shrink-0', tone.iconClass)} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-text">{t.title}</p>
              {t.message && <p className="mt-0.5 text-xs break-words text-muted">{t.message}</p>}
              {t.action && (
                <button
                  type="button"
                  onClick={() => {
                    t.action?.onClick();
                    dismiss(t.id);
                  }}
                  className="mt-1.5 text-xs font-medium text-blue-fg hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button type="button" aria-label="Meldung schließen" title="Schließen" onClick={() => dismiss(t.id)} className="-mt-0.5 -mr-1 rounded p-0.5 text-muted hover:bg-surface-3 hover:text-text">
              <X aria-hidden className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
