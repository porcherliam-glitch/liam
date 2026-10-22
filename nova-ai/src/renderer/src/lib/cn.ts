type ClassValue = string | number | bigint | boolean | null | undefined;

/** Joins class names, skipping falsy values. `cn('a', cond && 'b', undefined)` -> "a b". */
export function cn(...parts: ClassValue[]): string {
  let out = '';
  for (const p of parts) {
    if (typeof p === 'string' && p) out = out ? `${out} ${p}` : p;
  }
  return out;
}
