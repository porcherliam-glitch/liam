// One global subscription to `window.nova.onEvent`, fanned out to any number of listeners.
// Components use `useNovaEvent` (hooks/useEvents.ts); non-React code may call `subscribeNovaEvent`.
// Events are hints: when a sequence gap is detected (missed events, daemon restart) all
// `subscribeResync` listeners are notified so data can be re-fetched (useRpc does this automatically).
import type { AnyNovaEvent, NovaEvent, NovaEventMap, NovaEventType } from '@shared/events';
import type { NovaBridge } from '@shared/bridge';
import { getBridge } from '../lib/api';

type AnyHandler = (event: AnyNovaEvent) => void;

const listeners = new Map<NovaEventType | '*', Set<AnyHandler>>();
const resyncListeners = new Set<() => void>();
let boundBridge: NovaBridge | null = null;
let unbind: (() => void) | null = null;
let lastSeq: number | null = null;
let received = 0;

/** Binds to the current bridge (idempotent; re-binds when window.nova was replaced, e.g. in tests). */
export function ensureEventBus(): void {
  const bridge = getBridge();
  if (bridge === boundBridge) return;
  unbind?.();
  unbind = null;
  boundBridge = bridge;
  lastSeq = null;
  if (bridge) {
    try {
      unbind = bridge.onEvent((event) => dispatchNovaEvent(event));
    } catch {
      unbind = null;
    }
  }
}

/** Delivers an event to all listeners. Exported for tests and for the mock bridge. */
export function dispatchNovaEvent(event: AnyNovaEvent): void {
  received++;
  if (typeof event.seq === 'number') {
    const gap = lastSeq !== null && (event.seq > lastSeq + 1 || event.seq < lastSeq);
    lastSeq = event.seq;
    if (gap) notifyResync();
  }
  const typed = listeners.get(event.type);
  const all = listeners.get('*');
  for (const set of [typed, all]) {
    if (!set) continue;
    for (const fn of [...set]) {
      try {
        fn(event);
      } catch (e) {
        console.error('[nova] event listener failed', event.type, e);
      }
    }
  }
}

/**
 * Subscribes to one event type ('*' = all). Returns the unsubscribe function.
 * @example const off = subscribeNovaEvent('task.updated', (task) => ...);
 */
export function subscribeNovaEvent<T extends NovaEventType>(type: T, handler: (payload: NovaEventMap[T], event: NovaEvent<T>) => void): () => void;
export function subscribeNovaEvent(type: '*', handler: (payload: unknown, event: AnyNovaEvent) => void): () => void;
export function subscribeNovaEvent(type: NovaEventType | '*', handler: (payload: never, event: never) => void): () => void {
  ensureEventBus();
  const wrapped: AnyHandler = (event) => (handler as (p: unknown, e: AnyNovaEvent) => void)(event.payload, event);
  let set = listeners.get(type);
  if (!set) {
    set = new Set();
    listeners.set(type, set);
  }
  set.add(wrapped);
  return () => {
    set?.delete(wrapped);
  };
}

/** Called when events may have been missed (sequence gap). Returns the unsubscribe function. */
export function subscribeResync(handler: () => void): () => void {
  ensureEventBus();
  resyncListeners.add(handler);
  return () => {
    resyncListeners.delete(handler);
  };
}

/** Asks every data consumer to re-fetch (e.g. after a reconnect). */
export function notifyResync(): void {
  for (const fn of [...resyncListeners]) {
    try {
      fn();
    } catch (e) {
      console.error('[nova] resync listener failed', e);
    }
  }
}

/** Debug information (number of received events, last sequence number). */
export function getEventBusStats(): { received: number; lastSeq: number | null; bound: boolean } {
  return { received, lastSeq, bound: boundBridge !== null };
}

/** Drops all listeners and the bridge binding (tests). */
export function resetEventBus(): void {
  unbind?.();
  unbind = null;
  boundBridge = null;
  lastSeq = null;
  received = 0;
  listeners.clear();
  resyncListeners.clear();
}
