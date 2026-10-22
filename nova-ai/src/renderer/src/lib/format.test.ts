import { describe, expect, it } from 'vitest';
import {
  basename,
  dirname,
  formatBytes,
  formatClock,
  formatDuration,
  formatPercent,
  formatRelativeTime,
  formatTokens,
  formatUsd,
  plural,
  splitModelRef,
  withEstimate,
} from './format';

// Intl output uses narrow no-break spaces in some places; normalize for readable assertions.
const n = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('format', () => {
  it('formats bytes with German decimals', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(n(formatBytes(1536))).toBe('1,5 KB');
    expect(n(formatBytes(16 * 1024 ** 3))).toBe('16 GB');
    expect(n(formatBytes(931.5 * 1024 ** 3))).toBe('932 GB');
    expect(formatBytes(null)).toBe('–');
  });

  it('formats durations in plain German', () => {
    expect(formatDuration(450)).toBe('450 ms');
    expect(formatDuration(45_000)).toBe('45 Sek.');
    expect(formatDuration(192_000)).toBe('3 Min. 12 Sek.');
    expect(formatDuration(3_900_000)).toBe('1 Std. 5 Min.');
    expect(formatDuration(2 * 86_400_000 + 3 * 3_600_000)).toBe('2 Tg. 3 Std.');
    expect(formatClock(75_000)).toBe('1:15');
    expect(formatClock(3_725_000)).toBe('1:02:05');
  });

  it('formats relative times', () => {
    const now = Date.UTC(2026, 9, 22, 12, 0, 0);
    expect(formatRelativeTime(now - 10_000, now)).toBe('gerade eben');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('vor 5 Min.');
    expect(formatRelativeTime(now - 2 * 3_600_000, now)).toBe('vor 2 Std.');
    expect(formatRelativeTime(now - 26 * 3_600_000, now)).toBe('gestern');
    expect(formatRelativeTime(now - 3 * 86_400_000, now)).toBe('vor 3 Tagen');
    expect(formatRelativeTime(now + 10 * 60_000, now)).toBe('in 10 Min.');
  });

  it('never calls a just-recorded past event "gleich" (R5-4)', () => {
    const now = Date.UTC(2026, 9, 22, 12, 0, 0);
    // Without the flag a timestamp a moment ahead is a future event ("wird gleich entladen").
    expect(formatRelativeTime(now + 500, now)).toBe('gleich');
    // Measured timestamps (resource snapshot, "Zuletzt geprüft") that are a few ms/s ahead of the render tick or of
    // a slightly different daemon clock are "gerade eben".
    expect(formatRelativeTime(now + 500, now, { pastEvent: true })).toBe('gerade eben');
    expect(formatRelativeTime(now + 59_000, now, { pastEvent: true })).toBe('gerade eben');
    expect(formatRelativeTime(now, now, { pastEvent: true })).toBe('gerade eben');
    expect(formatRelativeTime(now - 5 * 60_000, now, { pastEvent: true })).toBe('vor 5 Min.');
    // A timestamp far in the future is not skew: shown as such.
    expect(formatRelativeTime(now + 10 * 60_000, now, { pastEvent: true })).toBe('in 10 Min.');
  });

  it('formats money, percent and tokens', () => {
    expect(n(formatUsd(0.42))).toBe('0,42 $');
    expect(n(formatUsd(0.0031))).toBe('0,0031 $');
    expect(n(formatUsd(1.37, true))).toBe('1,37 $ (geschätzt)');
    expect(n(formatPercent(42.31))).toBe('42 %');
    expect(n(formatPercent(42.31, 1))).toBe('42,3 %');
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(12_345)).toBe('12,3 Tsd.');
    expect(formatTokens(4_200_000)).toBe('4,2 Mio.');
  });

  it('has small helpers for estimates, plurals, model refs and paths', () => {
    expect(withEstimate('3 GB', true)).toBe('3 GB (geschätzt)');
    expect(withEstimate('3 GB', false)).toBe('3 GB');
    expect(plural(1, 'Aufgabe', 'Aufgaben')).toBe('1 Aufgabe');
    expect(plural(3, 'Aufgabe', 'Aufgaben')).toBe('3 Aufgaben');
    expect(splitModelRef('openrouter/qwen/qwen3-coder')).toEqual({ providerId: 'openrouter', modelId: 'qwen/qwen3-coder' });
    expect(splitModelRef(null)).toBeNull();
    expect(dirname('C:\\Users\\Demo\\x.json')).toBe('C:\\Users\\Demo');
    expect(dirname('C:\\x.json')).toBe('C:\\');
    expect(basename('C:\\Users\\Demo\\x.json')).toBe('x.json');
  });
});
