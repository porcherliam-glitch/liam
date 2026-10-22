import { Select } from '../ui/Field';
import { PRIORITY, PRIORITY_VALUES } from '../../lib/labels';

export interface PrioritySelectProps {
  value: number;
  onChange: (priority: 0 | 1 | 2 | 3) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  /** Visible label; without it the select gets the accessible name "Priorität". */
  label?: string;
  className?: string;
}

/**
 * Priority selector (Kritisch / Hoch / Normal / Niedrig). Controlled – call tasks.setPriority in onChange.
 * @example <PrioritySelect size="sm" value={task.priority} onChange={(p) => setPriority.run({ id: task.id, priority: p })} />
 */
export function PrioritySelect({ value, onChange, disabled, size = 'md', label, className }: PrioritySelectProps) {
  return (
    <Select
      label={label}
      aria-label={label ? undefined : 'Priorität'}
      size={size}
      value={String(value)}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value) as 0 | 1 | 2 | 3)}
      options={PRIORITY_VALUES.map((p) => ({ value: String(p), label: PRIORITY[p].label }))}
      containerClassName={className}
      className={size === 'sm' ? 'w-28' : undefined}
    />
  );
}
