import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { TriangleAlert, X, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { toneClasses, type Tone } from '../../lib/labels';
import { Button, IconButton } from './Button';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** Color of the icon chip. */
  tone?: Tone;
  children?: ReactNode;
  /** Buttons, right-aligned. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Esc, backdrop click and the X button close the dialog (default true). */
  dismissible?: boolean;
  /** Element that receives focus on open (default: first focusable element). */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal dialog: rendered in a portal, focus trap, Esc closes, aria-modal, focus returns on close.
 * @example
 * <Dialog open={open} onClose={() => setOpen(false)} title="Aufgabe anlegen"
 *   footer={<><Button onClick={close}>Abbrechen</Button><Button variant="primary">Anlegen</Button></>}>…</Dialog>
 */
export function Dialog({ open, onClose, title, description, icon: Icon, tone = 'violet', children, footer, size = 'md', dismissible = true, initialFocus, className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>(`[data-autofocus],${FOCUSABLE}`) ?? panelRef.current;
      target?.focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open, initialFocus]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && dismissible) {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[aria-hidden="true"]'));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-fade-in"
      onMouseDown={(e) => {
        if (dismissible && e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn('flex max-h-[min(90vh,900px)] w-full flex-col rounded-xl border border-border-strong bg-surface shadow-2xl shadow-black/50 animate-pop-in', SIZES[size], className)}
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4">
          {Icon && (
            <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClasses[tone].soft)}>
              <Icon aria-hidden className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1 text-[13px] text-muted">
                {description}
              </p>
            )}
          </div>
          {dismissible && <IconButton icon={X} label="Schließen" size="sm" onClick={() => onCloseRef.current()} className="-mt-1 -mr-2" />}
        </header>
        {children !== undefined && children !== null && <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>}
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger = red confirm button and the cancel button gets the initial focus. */
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void | Promise<unknown>;
  onCancel: () => void;
  icon?: LucideIcon;
  /** Extra content below the message (e.g. a list of affected files). */
  children?: ReactNode;
}

/**
 * Yes/no confirmation. Keep `open` true while `loading` to show progress, close in onConfirm's success path.
 * @example <ConfirmDialog open={!!toDelete} tone="danger" title="Regel löschen?" message="…" onConfirm={del} onCancel={() => setToDelete(null)} />
 */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Bestätigen', cancelLabel = 'Abbrechen', tone = 'primary', loading, onConfirm, onCancel, icon, children }: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open={open}
      onClose={() => !loading && onCancel()}
      title={title}
      icon={icon ?? (tone === 'danger' ? TriangleAlert : undefined)}
      tone={tone === 'danger' ? 'danger' : 'violet'}
      size="sm"
      dismissible={!loading}
      initialFocus={tone === 'danger' ? cancelRef : confirmRef}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={tone === 'danger' ? 'danger' : 'primary'} loading={loading} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] text-text">
        <div>{message}</div>
        {children}
      </div>
    </Dialog>
  );
}
