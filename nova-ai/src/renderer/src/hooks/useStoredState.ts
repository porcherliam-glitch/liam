import { useCallback, useState } from 'react';

/**
 * useState persisted in localStorage (per-user UI conveniences such as a remembered filter or tab).
 * Falls back to in-memory state when storage is unavailable. Never use it for real data.
 * @example const [level, setLevel] = useStoredState('logs.level', 'info');
 */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const storageKey = `nova.${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = globalThis.localStorage?.getItem(storageKey);
      return raw != null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        globalThis.localStorage?.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
    },
    [storageKey],
  );
  return [value, set];
}
