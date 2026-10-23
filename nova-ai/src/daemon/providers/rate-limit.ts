// Per-provider rate limiting for model calls (SPEC §6.2): a semaphore for `options.maxConcurrent` and a token bucket
// for `options.maxRequestsPerMinute` (capacity = the per-minute limit, continuous refill). Both waits honour the
// caller's AbortSignal (CANCELLED with requestSent=false, so the budget releases the reservation).
// Clock and sleep are injectable so the token bucket can be tested without real waiting.
import { sleep as realSleep } from '../core/time';
import { providerError } from './http';

export interface LimiterClock {
  now(): number;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realLimiterClock: LimiterClock = { now: () => Date.now(), sleep: realSleep };

function cancelled(label: string, reason: unknown) {
  return providerError('CANCELLED', `Die Anfrage an ${label} wurde abgebrochen, bevor sie gesendet wurde.`, { requestSent: false, billable: false, retryable: false }, reason);
}

interface Waiter {
  resolve(): void;
  reject(e: unknown): void;
  cleanup(): void;
}

export class ProviderRateLimiter {
  private active = 0;
  private readonly queue: Waiter[] = [];
  private tokens: number;
  private lastRefill: number;

  constructor(
    readonly maxConcurrent: number | null,
    readonly perMinute: number | null,
    private readonly label: string,
    private readonly clock: LimiterClock = realLimiterClock,
  ) {
    this.tokens = perMinute ?? 0;
    this.lastRefill = clock.now();
  }

  /** Number of calls currently holding a slot. */
  get inUse(): number {
    return this.active;
  }

  /** Waits for a request token and a concurrency slot. Returns the release function (idempotent). */
  async acquire(signal?: AbortSignal): Promise<() => void> {
    if (signal?.aborted) throw cancelled(this.label, signal.reason);
    await this.takeToken(signal);
    await this.takeSlot(signal);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.dispatch();
    };
  }

  private refill(): void {
    if (!this.perMinute) return;
    const now = this.clock.now();
    const elapsed = Math.max(0, now - this.lastRefill);
    this.tokens = Math.min(this.perMinute, this.tokens + (elapsed * this.perMinute) / 60_000);
    this.lastRefill = now;
  }

  private async takeToken(signal?: AbortSignal): Promise<void> {
    if (!this.perMinute) return;
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) * 60_000) / this.perMinute);
      try {
        await this.clock.sleep(Math.max(10, waitMs), signal);
      } catch (e) {
        throw cancelled(this.label, signal?.reason ?? e);
      }
    }
  }

  private takeSlot(signal?: AbortSignal): Promise<void> {
    // The signal may have been aborted while we waited for a token (an 'abort' listener added later never fires).
    if (signal?.aborted) return Promise.reject(cancelled(this.label, signal.reason));
    if (!this.maxConcurrent || this.active < this.maxConcurrent) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const i = this.queue.indexOf(waiter);
        if (i !== -1) this.queue.splice(i, 1);
        reject(cancelled(this.label, signal?.reason));
      };
      const waiter: Waiter = {
        resolve,
        reject,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(waiter);
    });
  }

  private dispatch(): void {
    while (this.queue.length && (!this.maxConcurrent || this.active < this.maxConcurrent)) {
      const w = this.queue.shift()!;
      w.cleanup();
      this.active++;
      w.resolve();
    }
  }
}

/** Parses the provider options into limiter settings (invalid values = no limit). */
export function limiterSettings(options: Record<string, string>): { maxConcurrent: number | null; perMinute: number | null } {
  const parse = (v: string | undefined, max: number) => {
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
  };
  return { maxConcurrent: parse(options.maxConcurrent, 64), perMinute: parse(options.maxRequestsPerMinute, 100_000) };
}
