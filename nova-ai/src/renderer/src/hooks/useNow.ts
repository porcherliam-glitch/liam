import { useSyncExternalStore } from 'react';

// One shared interval per tick length, so hundreds of <RelativeTime/> share a single timer.
interface Ticker {
  now: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
}
const tickers = new Map<number, Ticker>();

function getTicker(intervalMs: number): Ticker {
  let t = tickers.get(intervalMs);
  if (!t) {
    t = { now: Date.now(), listeners: new Set(), timer: null };
    tickers.set(intervalMs, t);
  }
  return t;
}

/**
 * Current time in ms, re-rendering every `intervalMs` (default 1 s). Use for live runtimes and
 * relative timestamps.
 * @example const now = useNow(); <span>{formatClock(now - run.startedAt)}</span>
 */
export function useNow(intervalMs = 1000): number {
  const ticker = getTicker(intervalMs);
  return useSyncExternalStore(
    (onChange) => {
      ticker.listeners.add(onChange);
      if (!ticker.timer) {
        ticker.now = Date.now();
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
    () => ticker.now,
    () => ticker.now,
  );
}
