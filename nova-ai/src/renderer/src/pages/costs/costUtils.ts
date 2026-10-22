// Helpers for the costs page: time ranges, limit modes, labels for breakdown keys, refresh events.
import type { AnyNovaEvent, NovaEventType } from '@shared/events';
import { formatDate, formatUsd } from '../../lib/format';

/**
 * Re-fetch triggers for usage numbers (tokens, runtime, calls): budget.updated comes only for paid calls and limit
 * changes, so every finished model call (run.step of kind model_call, also local Ollama calls) refreshes as well.
 */
export const USAGE_REFRESH = {
  refetchOn: ['budget.updated', 'run.step'] as readonly NovaEventType[],
  eventFilter: (e: AnyNovaEvent): boolean => e.type !== 'run.step' || e.payload.kind === 'model_call',
  debounceMs: 1000,
};

export type Period = 'today' | '7d' | 'month' | '30d';

export const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'today', label: 'Heute' },
  { value: '7d', label: 'Letzte 7 Tage' },
  { value: 'month', label: 'Dieser Monat' },
  { value: '30d', label: 'Letzte 30 Tage' },
];

const DAY_MS = 86_400_000;

/** Start timestamp of a period (local time). */
export function periodStart(period: Period, now: number = Date.now()): number {
  const d = new Date(now);
  switch (period) {
    case 'today':
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    case 'month':
      return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    case '7d':
      return now - 7 * DAY_MS;
    case '30d':
      return now - 30 * DAY_MS;
  }
}

/** A budget limit is either "no paid use" (0), a dollar amount or unlimited (null). */
export type LimitMode = 'none' | 'amount' | 'unlimited';

export function limitMode(value: number | null): LimitMode {
  if (value == null) return 'unlimited';
  return value === 0 ? 'none' : 'amount';
}

/** "2,00 $" / "keine kostenpflichtige Nutzung" / "ohne Grenze". */
export function limitText(value: number | null): string {
  if (value == null) return 'ohne Grenze';
  if (value === 0) return 'keine kostenpflichtige Nutzung';
  return formatUsd(value);
}

/** Share of a limit in percent (null when there is no positive limit). */
export function limitPercent(spent: number, limit: number | null): number | null {
  if (limit == null || limit <= 0) return null;
  return Math.min(100, (spent / limit) * 100);
}

/** "2026-10-22" → "22.10.2026" (keys of the "day" breakdown). */
export function dayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return formatDate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime());
}
