// German formatting helpers (Intl de-DE). All functions accept null/undefined and return "–" then,
// so callers never have to guard optional values.

const LOCALE = 'de-DE';
const DASH = '–';

/** Suffix used everywhere an estimated value is shown (UI-SPEC §3). */
export const ESTIMATED_SUFFIX = ' (geschätzt)';

type Maybe<T> = T | null | undefined;

const nf0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const nf1fixed = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const usdSmall = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const usd = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const timeSecFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const fullFmt = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Appends " (geschätzt)" when `estimated` is true. */
export function withEstimate(text: string, estimated: Maybe<boolean>): string {
  return estimated ? `${text}${ESTIMATED_SUFFIX}` : text;
}

/** Plain number with German separators: 12345.6 -> "12.345,6". */
export function formatNumber(value: Maybe<number>, maxFractionDigits = 1): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  return maxFractionDigits === 0 ? nf0.format(value) : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxFractionDigits }).format(value);
}

/** Bytes as B / KB / MB / GB / TB (base 1024): 1536 -> "1,5 KB". */
export function formatBytes(bytes: Maybe<number>): string {
  if (bytes == null || !Number.isFinite(bytes)) return DASH;
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${nf0.format(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes / 1024;
  let i = 0;
  while (Math.abs(v) >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)} ${units[i]}`;
}

/** Duration in ms as "3 Min. 12 Sek.", "1 Std. 5 Min.", "2 Tg. 3 Std.", "450 ms". */
export function formatDuration(ms: Maybe<number>): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${nf0.format(Math.round(ms))} ms`;
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return hours > 0 ? `${days} Tg. ${hours} Std.` : `${days} Tg.`;
  if (hours > 0) return minutes > 0 ? `${hours} Std. ${minutes} Min.` : `${hours} Std.`;
  if (minutes > 0) return seconds > 0 ? `${minutes} Min. ${seconds} Sek.` : `${minutes} Min.`;
  return `${seconds} Sek.`;
}

/** Compact clock-style runtime for live counters: 75_000 -> "1:15", 3_725_000 -> "1:02:05". */
export function formatClock(ms: Maybe<number>): string {
  if (ms == null || !Number.isFinite(ms)) return DASH;
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Relative time: "gerade eben", "vor 5 Min.", "vor 2 Std.", "gestern", "vor 3 Tagen", later a date. */
export function formatRelativeTime(ts: Maybe<number>, now: number = Date.now()): string {
  if (ts == null || !Number.isFinite(ts)) return DASH;
  const diff = now - ts;
  const future = diff < 0;
  const sec = Math.abs(diff) / 1000;
  if (sec < 45) return future ? 'gleich' : 'gerade eben';
  const min = Math.round(sec / 60);
  if (min < 60) return future ? `in ${min} Min.` : `vor ${min} Min.`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return future ? `in ${hrs} Std.` : `vor ${hrs} Std.`;
  const days = Math.round(hrs / 24);
  if (days === 1) return future ? 'morgen' : 'gestern';
  if (days < 7) return future ? `in ${days} Tagen` : `vor ${days} Tagen`;
  return formatDate(ts);
}

/** "22.10.2026" */
export function formatDate(ts: Maybe<number>): string {
  if (ts == null || !Number.isFinite(ts)) return DASH;
  return dateFmt.format(ts);
}

/** "22.10.2026, 14:05" */
export function formatDateTime(ts: Maybe<number>): string {
  if (ts == null || !Number.isFinite(ts)) return DASH;
  return dateTimeFmt.format(ts);
}

/** "14:05" or with seconds "14:05:09". */
export function formatTime(ts: Maybe<number>, withSeconds = false): string {
  if (ts == null || !Number.isFinite(ts)) return DASH;
  return (withSeconds ? timeSecFmt : timeFmt).format(ts);
}

/** Long form for tooltips: "Donnerstag, 22. Oktober 2026 um 14:05:09". */
export function formatFullDate(ts: Maybe<number>): string {
  if (ts == null || !Number.isFinite(ts)) return DASH;
  return fullFmt.format(ts);
}

/** USD with German formatting: 0.42 -> "0,42 $"; small amounts keep up to 4 decimals ("0,0031 $"). */
export function formatUsd(value: Maybe<number>, estimated?: boolean): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const text = value !== 0 && Math.abs(value) < 0.01 ? usdSmall.format(value) : usd.format(value);
  return withEstimate(text, estimated);
}

/** Percent of 0..100: 42.31 -> "42 %"; with digits=1 -> "42,3 %". */
export function formatPercent(value: Maybe<number>, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const f = digits === 0 ? nf0 : digits === 1 ? nf1fixed : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits });
  return `${f.format(value)} %`;
}

/** Token counts: 950 -> "950", 12_345 -> "12,3 Tsd.", 4_200_000 -> "4,2 Mio.". */
export function formatTokens(value: Maybe<number>): string {
  if (value == null || !Number.isFinite(value)) return DASH;
  const abs = Math.abs(value);
  if (abs < 1000) return nf0.format(value);
  if (abs < 1_000_000) return `${nf1.format(value / 1000)} Tsd.`;
  if (abs < 1_000_000_000) return `${nf1.format(value / 1_000_000)} Mio.`;
  return `${nf1.format(value / 1_000_000_000)} Mrd.`;
}

/** German plural helper: plural(1, 'Aufgabe', 'Aufgaben') -> "1 Aufgabe". */
export function plural(count: number, one: string, many: string): string {
  return `${nf0.format(count)} ${count === 1 ? one : many}`;
}

/** Splits "providerId/modelId" (model ids may contain further slashes). */
export function splitModelRef(ref: Maybe<string>): { providerId: string; modelId: string } | null {
  if (!ref) return null;
  const i = ref.indexOf('/');
  if (i <= 0) return { providerId: '', modelId: ref };
  return { providerId: ref.slice(0, i), modelId: ref.slice(i + 1) };
}

/** Parent folder of a Windows or POSIX path ("C:\\a\\b.txt" -> "C:\\a"). */
export function dirname(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (i <= 0) return path;
  // Keep the root of drive paths ("C:\\").
  if (i === 2 && path[1] === ':') return path.slice(0, 3);
  return path.slice(0, i);
}

/** Last path segment of a Windows or POSIX path. */
export function basename(path: string): string {
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  return i >= 0 ? path.slice(i + 1) : path;
}

/** Shortens long text with an ellipsis. */
export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…` : text;
}
