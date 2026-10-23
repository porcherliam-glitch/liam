// Global toast notifications. Render <Toaster/> once (AppShell does); trigger with `toast.*`.
import { create } from 'zustand';
import { errorMessage } from '../lib/api';

export type ToastTone = 'success' | 'info' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  /** Auto-hide after ms (0 = stays until closed). */
  duration: number;
  action?: ToastAction;
  createdAt: number;
}

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  message?: string;
  duration?: number;
  action?: ToastAction;
}

interface ToastStore {
  toasts: Toast[];
  push: (input: ToastInput) => number;
  dismiss: (id: number) => void;
  clear: () => void;
}

const MAX_TOASTS = 5;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let nextId = 1;

/** Default display time: 5 s, errors 10 s (UI-SPEC §3). */
export function defaultToastDuration(tone: ToastTone): number {
  return tone === 'error' ? 10_000 : 5_000;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (input) => {
    const tone = input.tone ?? 'info';
    const now = Date.now();
    // Collapse identical toasts fired in quick succession (e.g. the same error from several hooks).
    const dup = get().toasts.find((t) => t.title === input.title && t.message === input.message && t.tone === tone && now - t.createdAt < 2000);
    if (dup) return dup.id;
    const toast: Toast = {
      id: nextId++,
      tone,
      title: input.title,
      message: input.message,
      duration: input.duration ?? defaultToastDuration(tone),
      action: input.action,
      createdAt: now,
    };
    set((s) => {
      const next = [...s.toasts, toast];
      while (next.length > MAX_TOASTS) {
        const removed = next.shift();
        if (removed) clearTimer(removed.id);
      }
      return { toasts: next };
    });
    if (toast.duration > 0) {
      timers.set(
        toast.id,
        setTimeout(() => get().dismiss(toast.id), toast.duration),
      );
    }
    return toast.id;
  },
  dismiss: (id) => {
    clearTimer(id);
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
  clear: () => {
    for (const id of timers.keys()) clearTimer(id);
    set({ toasts: [] });
  },
}));

function clearTimer(id: number): void {
  const t = timers.get(id);
  if (t) clearTimeout(t);
  timers.delete(id);
}

/**
 * Shortcut API.
 * @example toast.success('Gespeichert'); toast.fromError(err, 'Speichern fehlgeschlagen');
 */
export const toast = {
  show: (input: ToastInput) => useToastStore.getState().push(input),
  success: (title: string, message?: string) => useToastStore.getState().push({ tone: 'success', title, message }),
  info: (title: string, message?: string) => useToastStore.getState().push({ tone: 'info', title, message }),
  warning: (title: string, message?: string) => useToastStore.getState().push({ tone: 'warning', title, message }),
  error: (title: string, message?: string) => useToastStore.getState().push({ tone: 'error', title, message }),
  /** Error toast with the German message of any thrown value. */
  fromError: (error: unknown, title = 'Das hat nicht geklappt') => useToastStore.getState().push({ tone: 'error', title, message: errorMessage(error) }),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};
