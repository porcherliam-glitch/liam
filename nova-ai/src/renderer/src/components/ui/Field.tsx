import { useId, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** id of the control (for the label). */
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error text. Input/Textarea/Select already include it via their props. */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-xs font-medium text-text">
          {label}
          {required && (
            <span className="ml-0.5 text-danger-fg" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs text-danger-fg" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const CONTROL_BASE =
  'w-full rounded-lg border bg-surface-2 text-[13px] text-text transition-colors duration-150 hover:border-border-strong focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/60 disabled:cursor-not-allowed disabled:opacity-50';

function describedBy(id: string, error: ReactNode, hint: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: LucideIcon;
  /** Content inside the right edge (unit, button). */
  suffix?: ReactNode;
  size?: 'sm' | 'md';
  containerClassName?: string;
}

/**
 * Text input with optional label, hint, error, leading icon and suffix.
 * @example <Input label="Projektname" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
 */
export function Input({ label, hint, error, icon: Icon, suffix, size = 'md', id, className, containerClassName, required, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <div className="relative">
        {Icon && <Icon aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-subtle" />}
        <input
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, hint)}
          className={cn(CONTROL_BASE, size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5', error ? 'border-danger/70' : 'border-border', Icon && 'pl-8', suffix && 'pr-16', className)}
          {...rest}
        />
        {suffix && <div className="absolute inset-y-0 right-1 flex items-center gap-1 text-xs text-muted">{suffix}</div>}
      </div>
    </Field>
  );
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
  /** Monospace font (commands, code). */
  mono?: boolean;
}

/** Multi-line text input. */
export function Textarea({ label, hint, error, id, className, containerClassName, required, rows = 4, mono, ...rest }: TextareaProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <textarea
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={cn(CONTROL_BASE, 'min-h-16 resize-y px-2.5 py-2 leading-relaxed', mono && 'font-mono text-xs', error ? 'border-danger/70' : 'border-border', className)}
        {...rest}
      />
    </Field>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<ComponentProps<'select'>, 'size' | 'children'> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options: ReadonlyArray<SelectOption>;
  /** Adds a first, empty option with this text. */
  placeholder?: string;
  size?: 'sm' | 'md';
  containerClassName?: string;
}

/**
 * Native select (keyboard friendly) styled for the dark theme.
 * @example <Select label="Rolle" value={role} onChange={(e) => setRole(e.target.value)} options={roleOptions} />
 */
export function Select({ label, hint, error, options, placeholder, size = 'md', id, className, containerClassName, required, ...rest }: SelectProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={containerClassName}>
      <div className="relative">
        <select
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(inputId, error, hint)}
          className={cn(CONTROL_BASE, 'appearance-none pr-8', size === 'sm' ? 'h-7 pl-2 text-xs' : 'h-8 pl-2.5', error ? 'border-danger/70' : 'border-border', className)}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </Field>
  );
}
