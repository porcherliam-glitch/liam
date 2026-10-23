import { useEffect, useRef } from 'react';
import type { NovaEvent, NovaEventMap, NovaEventType } from '@shared/events';
import { subscribeNovaEvent } from '../stores/events';

/**
 * Calls `handler` for every daemon event of the given type(s). The handler may change between renders
 * without re-subscribing. Pass `enabled = false` to pause.
 * @example useNovaEvent('resources.snapshot', (snap) => setSnapshot(snap));
 * @example useNovaEvent(['task.updated', 'task.removed'], () => refetch());
 */
export function useNovaEvent<T extends NovaEventType>(
  type: T | readonly T[],
  handler: (payload: NovaEventMap[T], event: NovaEvent<T>) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const types = (Array.isArray(type) ? type : [type]) as readonly T[];
  const typesKey = types.join('|');

  useEffect(() => {
    if (!enabled) return;
    const offs = (typesKey.split('|') as T[]).map((t) =>
      subscribeNovaEvent(t, ((payload: NovaEventMap[T], event: NovaEvent<T>) => handlerRef.current(payload, event)) as never),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [typesKey, enabled]);
}
