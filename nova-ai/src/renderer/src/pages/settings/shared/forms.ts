// Form helpers shared by the settings, models, costs and knowledge pages (developer UI-4).
// - rpcIssues(): field messages of a VALIDATION error. The daemon sends `details: { issues: [{ path: "a.b", message }] }`
//   (path already joined) while some code paths send raw zod issues (`path: ["a", "b"]`) – both are accepted here.
// - Number inputs are plain text fields (German users type "0,5"); parseNumber() accepts comma and dot.
import { NovaRpcError } from '../../../lib/api';

type RawIssue = { path?: unknown; message?: unknown };

function issuePath(path: unknown): string {
  if (typeof path === 'string') return path.replace(/\[(\d+)\]/g, '.$1');
  if (Array.isArray(path)) return path.map((p) => String(p)).join('.');
  return '';
}

/** Zod's English default messages (fallback path of the daemon) – replaced by a neutral German text. */
const ENGLISH_DEFAULT = /^(Invalid|Too (big|small)|Expected|Required|Unrecognized|Number must|String must|Array must)/i;

/**
 * Field messages of a VALIDATION error as `{ "section.key": "Meldung" }` (empty for other errors).
 * Robust against both issue formats (string or array paths, `details.issues` or `details` as array).
 */
export function rpcIssues(e: unknown): Record<string, string> {
  if (!(e instanceof NovaRpcError) || e.code !== 'VALIDATION') return {};
  const details = e.details as { issues?: RawIssue[] } | RawIssue[] | undefined;
  const issues = Array.isArray(details) ? details : Array.isArray(details?.issues) ? details.issues : [];
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') continue;
    const key = issuePath(issue.path);
    const raw = typeof issue.message === 'string' && issue.message ? issue.message : '';
    const message = raw && !ENGLISH_DEFAULT.test(raw) ? raw : 'Dieser Wert ist nicht erlaubt.';
    if (!(key in out)) out[key] = message;
  }
  return out;
}

/** Finds the message for `key` or for any nested path below it ("permissions.commandAllowlist.2" → list field). */
export function issueFor(issues: Record<string, string>, key: string): string | undefined {
  if (issues[key]) return issues[key];
  const prefix = `${key}.`;
  for (const [k, v] of Object.entries(issues)) if (k.startsWith(prefix)) return v;
  return undefined;
}

/** Messages that did not match any of the known field keys (shown as a general form error). */
export function unmatchedIssues(issues: Record<string, string>, knownKeys: readonly string[]): string[] {
  return Object.entries(issues)
    .filter(([k]) => !knownKeys.some((known) => k === known || k.startsWith(`${known}.`)))
    .map(([k, v]) => (k ? `${v}` : v));
}

export interface NumberRule {
  min?: number;
  max?: number;
  /** Only whole numbers. */
  int?: boolean;
  /** Empty input is allowed and means null. */
  nullable?: boolean;
}

/** German number formatting for an input field (0.2 → "0,2"). */
export function numberToInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

function formatLimit(n: number): string {
  return new Intl.NumberFormat('de-DE', { maximumFractionDigits: 4 }).format(n);
}

/**
 * Parses a number typed by the user ("1.024" is NOT treated as a thousands separator – digits with one comma or dot).
 * Returns `{ value }` or `{ error }` (German).
 */
export function parseNumber(text: string, rule: NumberRule = {}): { value: number | null; error?: undefined } | { value?: undefined; error: string } {
  const trimmed = text.trim().replace(/\s+/g, '');
  if (trimmed === '') return rule.nullable ? { value: null } : { error: 'Bitte einen Wert eingeben.' };
  if (!/^-?\d+([.,]\d+)?$/.test(trimmed)) return { error: rule.int ? 'Bitte eine ganze Zahl eingeben.' : 'Bitte eine Zahl eingeben (z. B. 2,5).' };
  const value = Number(trimmed.replace(',', '.'));
  if (!Number.isFinite(value)) return { error: 'Bitte eine Zahl eingeben.' };
  if (rule.int && !Number.isInteger(value)) return { error: 'Bitte eine ganze Zahl eingeben.' };
  if (rule.min !== undefined && value < rule.min) return { error: `Muss mindestens ${formatLimit(rule.min)} sein.` };
  if (rule.max !== undefined && value > rule.max) return { error: `Darf höchstens ${formatLimit(rule.max)} sein.` };
  return { value };
}

/** True when the text is an http(s) URL. */
export function isHttpUrl(text: string): boolean {
  try {
    const u = new URL(text.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Loopback URL (127.x, localhost, ::1) – same rule as the daemon's isLocalEndpoint. */
export function isLocalUrl(text: string): boolean {
  try {
    let host = new URL(text.trim()).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (host === '::1') return true;
    host = host.trim();
    return /^127(?:\.\d{1,3}){3}$/.test(host);
  } catch {
    return false;
  }
}

/** Shallow structural equality for form values (numbers, strings, booleans, string arrays, null). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
