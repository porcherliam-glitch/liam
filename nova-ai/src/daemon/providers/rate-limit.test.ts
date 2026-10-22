// Tests for the per-provider rate limiter: token bucket with a fake clock, FIFO semaphore and abort handling.
import { describe, expect, it } from 'vitest';
import { NovaError } from '../core/errors';
import { ProviderRateLimiter, limiterSettings, type LimiterClock } from './rate-limit';
import { providerErrorDetails } from './http';

function fakeClock(): LimiterClock & { sleeps: number[]; time: number } {
  const c = {
    time: 1_000_000,
    sleeps: [] as number[],
    now: () => c.time,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw signal.reason;
      c.sleeps.push(ms);
      c.time += ms;
    },
  };
  return c;
}

describe('provider rate limiter', () => {
  it('token bucket: maxRequestsPerMinute allows a burst, then waits for the refill', async () => {
    const clock = fakeClock();
    const l = new ProviderRateLimiter(null, 2, 'Test', clock);
    (await l.acquire())();
    (await l.acquire())();
    expect(clock.sleeps).toEqual([]);
    (await l.acquire())();
    expect(clock.sleeps).toEqual([30_000]);
    clock.time += 60_000; // a full minute refills the bucket completely (capped at 2)
    (await l.acquire())();
    (await l.acquire())();
    expect(clock.sleeps).toEqual([30_000]);
  });

  it('semaphore: maxConcurrent queues callers until a slot is released (FIFO)', async () => {
    const l = new ProviderRateLimiter(1, null, 'Test');
    const r1 = await l.acquire();
    const order: number[] = [];
    const p2 = l.acquire().then((r) => {
      order.push(2);
      return r;
    });
    const p3 = l.acquire().then((r) => {
      order.push(3);
      return r;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toEqual([]);
    expect(l.inUse).toBe(1);
    r1();
    r1(); // idempotent
    const r2 = await p2;
    expect(order).toEqual([2]);
    r2();
    (await p3)();
    expect(order).toEqual([2, 3]);
    expect(l.inUse).toBe(0);
  });

  it('aborting while waiting rejects with CANCELLED (not sent)', async () => {
    const l = new ProviderRateLimiter(1, null, 'Test');
    const r1 = await l.acquire();
    const c = new AbortController();
    const waiting = l.acquire(c.signal);
    c.abort();
    const e = (await waiting.catch((x: unknown) => x)) as NovaError;
    expect(e.code).toBe('CANCELLED');
    expect(providerErrorDetails(e)).toMatchObject({ requestSent: false, billable: false });
    r1();
    expect(l.inUse).toBe(0);
    const pre = new AbortController();
    pre.abort();
    await expect(l.acquire(pre.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('parses provider options', () => {
    expect(limiterSettings({ maxConcurrent: '3', maxRequestsPerMinute: '120' })).toEqual({ maxConcurrent: 3, perMinute: 120 });
    expect(limiterSettings({ maxConcurrent: 'x', maxRequestsPerMinute: '0' })).toEqual({ maxConcurrent: null, perMinute: null });
    expect(limiterSettings({})).toEqual({ maxConcurrent: null, perMinute: null });
  });
});
