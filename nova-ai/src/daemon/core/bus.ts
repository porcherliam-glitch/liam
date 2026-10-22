// In-process typed event bus. The RPC server forwards every event to SSE subscribers.
import type { NovaEventMap, NovaEventType, AnyNovaEvent } from '@shared/events';

type Listener = (event: AnyNovaEvent) => void;

export class EventBus {
  private seq = 0;
  private listeners = new Set<Listener>();
  private typed = new Map<NovaEventType, Set<(payload: unknown) => void>>();

  emit<T extends NovaEventType>(type: T, payload: NovaEventMap[T]): void {
    const event = { type, payload, ts: Date.now(), seq: ++this.seq } as AnyNovaEvent;
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        /* listener errors must not break emitters */
      }
    }
    const set = this.typed.get(type);
    if (set) {
      for (const l of set) {
        try {
          l(payload);
        } catch {
          /* ignore */
        }
      }
    }
  }

  /** Subscribe to all events. Returns an unsubscribe function. */
  onAny(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  on<T extends NovaEventType>(type: T, listener: (payload: NovaEventMap[T]) => void): () => void {
    let set = this.typed.get(type);
    if (!set) {
      set = new Set();
      this.typed.set(type, set);
    }
    set.add(listener as (payload: unknown) => void);
    return () => set!.delete(listener as (payload: unknown) => void);
  }

  get lastSeq(): number {
    return this.seq;
  }
}
