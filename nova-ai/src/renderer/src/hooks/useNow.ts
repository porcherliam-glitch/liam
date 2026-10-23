import { useSyncExternalStore } from 'react';

// One shared interval per tick length, so hundreds of <RelativeTime/> share a single timer.
// subscribe/getSnapshot are stable per ticker and subscribe never changes the snapshot – otherwise
// useSyncExternalStore re-subscribes on every render and can loop.
interface Ticker {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => number;
}
const tickers = new Map<number, Ticker>();

function getTicker(intervalMs: number): Ticker {
  const existing = tickers.get(intervalMs);
  if (existing) return existing;
  const ticker: Ticker = {
    now: Date.now(),
    listeners: new Set(),
    timer: null,
    subscribe: (onChange) => {
      ticker.listeners.add(onChange);
      if (!ticker.timer) {
        ticker.timer = setInterval(() => {
          ticker.now = Date.now();
          for (const fn of [...ticker.listeners]) fn();
        }, intervalMs);
      }
      return () => {
        ticker.listeners.delete(onChange);
        if (ticker.listeners.size === 0 && ticker.timer) {
          clearInterval(ticker.timer);
          ticker.timer = null;
        }
      };
    },
    getSnapshot: () => ticker.now,
  };
  tickers.set(intervalMs, ticker);
  return ticker;
}

/**
 * Current time in ms, re-rendering every `intervalMs` (default 1 s). Use for live runtimes and
 * relative timestamps. The value can lag up to one interval after a long idle period, so combine it
 * with `Date.now()` where exactness matters: `Math.max(useNow(), Date.now() - 1000)`.
 * @example const now = useNow(); <span>{formatClock(now - run.startedAt)}</span>
 */
export function useNow(intervalMs = 1000): number {
  const ticker = getTicker(intervalMs);
  return useSyncExternalStore(ticker.subscribe, ticker.getSnapshot, ticker.getSnapshot);
}
