import { useEffect, useState } from 'react';

/**
 * Returns `value` after it stopped changing for `delayMs` (search inputs).
 * @example const q = useDebouncedValue(query, 300); useRpc('memory.search', q ? { query: q } : null);
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
