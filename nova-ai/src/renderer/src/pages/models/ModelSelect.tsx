// Native <select> for model references, grouped by provider (optgroups), with disabled paid models and a
// visible entry for a selected model that is no longer available.
import { useId, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ModelInfo, ModelRef, ProviderConfig } from '@shared/schemas';
import { cn } from '../../lib/cn';
import { CONTROL_BASE, Field } from '../../components/ui/Field';
import { isChatModel, modelUsability, parseRefKey, refKey } from './modelUtils';

export interface ModelSelectProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Accessible name when there is no visible label. */
  ariaLabel?: string;
  value: ModelRef | null;
  onChange: (value: ModelRef | null) => void;
  models: ModelInfo[];
  providers: ProviderConfig[];
  /** Text of the empty option (null value). Omit to hide the empty option. */
  emptyLabel?: string;
  /** Refs that are not offered (e.g. already in the fallback list). */
  exclude?: ModelRef[];
  size?: 'sm' | 'md';
  className?: string;
  disabled?: boolean;
}

export function ModelSelect({ label, hint, error, ariaLabel, value, onChange, models, providers, emptyLabel, exclude = [], size = 'md', className, disabled }: ModelSelectProps) {
  const id = useId();
  const current = refKey(value);
  const excluded = new Set(exclude.map(refKey));
  const providerById = new Map(providers.map((p) => [p.id, p]));
  const chat = models.filter(isChatModel);
  const groups = providers
    .map((p) => ({ provider: p, models: chat.filter((m) => m.providerId === p.id && (!excluded.has(refKey({ providerId: m.providerId, modelId: m.id })) || refKey({ providerId: m.providerId, modelId: m.id }) === current)) }))
    .filter((g) => g.models.length > 0);
  const known = chat.some((m) => refKey({ providerId: m.providerId, modelId: m.id }) === current);
  const missing = value && !known;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} className={className}>
      <div className="relative">
        <select
          id={id}
          value={current}
          disabled={disabled}
          aria-label={label ? undefined : ariaLabel}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value ? parseRefKey(e.target.value) : null)}
          className={cn(CONTROL_BASE, 'appearance-none pr-8', size === 'sm' ? 'h-7 pl-2 text-xs' : 'h-8 pl-2.5', error ? 'border-danger/70' : 'border-border')}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {missing && <option value={current}>{`${value.modelId} – nicht mehr verfügbar`}</option>}
          {groups.map((g) => (
            <optgroup key={g.provider.id} label={`${g.provider.name}${g.provider.enabled ? '' : ' (ausgeschaltet)'}`}>
              {g.models.map((m) => {
                const key = refKey({ providerId: m.providerId, modelId: m.id });
                const use = modelUsability(m, providerById.get(m.providerId));
                const tags = [m.local ? 'lokal' : m.paid ? 'kostenpflichtig' : 'Cloud', !m.capabilities.includes('tools') ? 'ohne Werkzeuge' : null, use.reason && !use.reason.startsWith('kostenpflichtig') ? use.reason : null]
                  .filter(Boolean)
                  .join(', ');
                const reason = use.reason?.startsWith('kostenpflichtig') ? ` – ${use.reason.replace('kostenpflichtig – ', '')}` : '';
                return (
                  <option key={key} value={key} disabled={!use.usable && key !== current}>
                    {`${m.displayName && m.displayName !== m.id ? `${m.displayName} (${m.id})` : m.id} · ${tags}${reason}`}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </Field>
  );
}
