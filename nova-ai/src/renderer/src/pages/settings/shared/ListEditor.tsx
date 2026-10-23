// Editable list of short text entries (allowed commands, allowed hosts) with per-entry problems and hints.
import { useId, useState, type KeyboardEvent } from 'react';
import { Plus, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../../lib/cn';
import { Button, IconButton, Input } from '../../../components/ui';

export interface ListEditorProps {
  label: string;
  hint?: string;
  /** Accessible name of one entry ("Befehl"). */
  itemLabel: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  mono?: boolean;
  /** Blocking problem of a new entry (shown under the input, entry is not added). */
  validateItem?: (value: string) => string | undefined;
  /** Non-blocking hint shown next to an entry. */
  warnItem?: (value: string) => string | undefined;
  /** Error for the whole list (e.g. from the daemon). */
  error?: string;
  disabled?: boolean;
}

export function ListEditor({ label, hint, itemLabel, value, onChange, placeholder, mono, validateItem, warnItem, error, disabled }: ListEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const problem = validateItem?.(v);
    if (problem) {
      setDraftError(problem);
      return;
    }
    if (value.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraftError('Dieser Eintrag ist schon in der Liste.');
      return;
    }
    onChange([...value, v]);
    setDraft('');
    setDraftError(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-1.5" role="group" aria-labelledby={`${id}-label`}>
      <p id={`${id}-label`} className="text-xs font-medium text-text">
        {label}
      </p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted">Die Liste ist leer.</p>
      ) : (
        <ul aria-label={label} className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border bg-surface-2/40">
          {value.map((item) => {
            const warning = warnItem?.(item);
            const problem = validateItem?.(item);
            return (
              <li key={item} className="flex items-start gap-2 px-2.5 py-1.5">
                <div className="min-w-0 flex-1">
                  <span className={cn('block break-all text-[13px] text-text', mono && 'font-mono text-xs')}>{item}</span>
                  {(problem || warning) && (
                    <span className={cn('mt-0.5 flex items-start gap-1 text-[11px]', problem ? 'text-danger-fg' : 'text-warning-fg')}>
                      <TriangleAlert aria-hidden className="mt-px h-3 w-3 shrink-0" />
                      {problem ?? warning}
                    </span>
                  )}
                </div>
                <IconButton icon={X} size="sm" label={`${itemLabel} „${item}“ entfernen`} disabled={disabled} onClick={() => onChange(value.filter((x) => x !== item))} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-start gap-2">
        <Input
          size="sm"
          aria-label={`${itemLabel} hinzufügen`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDraftError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          error={draftError}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          containerClassName="min-w-0 flex-1"
          className={mono ? 'font-mono' : undefined}
        />
        <Button size="sm" icon={Plus} onClick={add} disabled={disabled || !draft.trim()}>
          Hinzufügen
        </Button>
      </div>
      {error && (
        <p className="text-xs text-danger-fg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
