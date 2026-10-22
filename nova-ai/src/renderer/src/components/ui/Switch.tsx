import { useId, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** Accessible name when no visible label is given. */
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * On/off toggle (role="switch").
 * @example <Switch checked={enabled} onChange={setEnabled} label="Arbeit für dieses Projekt" />
 */
export function Switch({ checked, onChange, label, description, disabled, ariaLabel, size = 'md', className }: SwitchProps) {
  const id = useId();
  const track = size === 'sm' ? 'h-4 w-7' : 'h-5 w-9';
  const knob = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
  const shift = size === 'sm' ? 'translate-x-3' : 'translate-x-4';
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-50',
          track,
          checked ? 'border-transparent bg-nova-gradient' : 'border-border-strong bg-surface-3',
        )}
      >
        <span aria-hidden className={cn('ml-0.5 inline-block rounded-full bg-white shadow transition-transform duration-150', knob, checked ? shift : 'translate-x-0')} />
      </button>
      {(label || description) && (
        <div className="min-w-0">
          {label && (
            <label htmlFor={id} className={cn('block text-[13px] font-medium text-text', !disabled && 'cursor-pointer')}>
              {label}
            </label>
          )}
          {description && (
            <p id={`${id}-desc`} className="text-xs text-muted">
              {description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** Checkbox with label and optional description. */
export function Checkbox({ checked, onChange, label, description, disabled, className }: CheckboxProps) {
  const id = useId();
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={description ? `${id}-desc` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-border-strong accent-violet disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <label htmlFor={id} className={cn('block text-[13px] text-text', !disabled && 'cursor-pointer')}>
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="text-xs text-muted">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
