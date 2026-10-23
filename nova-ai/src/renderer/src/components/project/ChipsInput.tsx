import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { CONTROL_BASE, Field } from '../ui/Field';

export interface ChipsInputProps {
  label?: ReactNode;
  hint?: ReactNode;
  value: readonly string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /** Accessible name of the text field when no visible label is given. */
  ariaLabel?: string;
  /** Monospace chips (commands, globs). */
  mono?: boolean;
  /** Split pasted/typed text at commas (default true; off for commands that may contain commas). */
  splitOnComma?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Editable list of short values shown as chips (technologies, allowed commands, tags).
 * Enter (or a comma) adds the typed value, Backspace in the empty field removes the last chip.
 */
export function ChipsInput({ label, hint, value, onChange, placeholder = 'Eintrag hinzufügen …', ariaLabel, mono, splitOnComma = true, disabled, className }: ChipsInputProps) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const add = (raw: string) => {
    const parts = (splitOnComma ? raw.split(',') : [raw]).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    onChange(next);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || (splitOnComma && e.key === ',')) {
      e.preventDefault();
      add(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <Field label={label} hint={hint} htmlFor={id} className={className}>
      <div className={cn(CONTROL_BASE, 'flex min-h-8 flex-wrap items-center gap-1 border-border px-1.5 py-1 focus-within:border-violet focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-violet/60', disabled && 'opacity-50')}>
        <ul className="contents" aria-label={typeof label === 'string' ? label : ariaLabel}>
          {value.map((v) => (
            <li key={v} className={cn('inline-flex max-w-full items-center gap-1 rounded-md bg-surface-3 py-0.5 pr-0.5 pl-2 text-xs text-text', mono && 'font-mono')}>
              <span className="truncate">{v}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`„${v}“ entfernen`}
                title="Entfernen"
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-text"
              >
                <X aria-hidden className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
          placeholder={value.length ? '' : placeholder}
          aria-label={typeof label === 'string' ? undefined : ariaLabel}
          className={cn('h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] text-text outline-none placeholder:text-subtle focus-visible:outline-none', mono && 'font-mono text-xs')}
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={() => add(draft)}
            aria-label="Hinzufügen"
            title="Hinzufügen"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-violet-fg hover:bg-surface-3"
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </Field>
  );
}
