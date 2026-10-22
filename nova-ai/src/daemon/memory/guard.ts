// Content guard of the memory module: redaction before anything is stored or exported, detection of entries that are
// mainly a credential (rejected with VALIDATION), and normalisation/limits of titles, contents and tags.
//
// Key decisions:
// - Layer 1 is core redactString() (registered secret values + well-known key formats + KEY=value patterns).
// - Layer 2 adds German credential phrases the core patterns do not know ("Das Passwort lautet hunter2",
//   "Kennwort: geheim123", "API-Schlüssel ist sk…"). Strong words (Passwort, Kennwort, PIN-Code …) followed by ':' or '='
//   always redact the value; after "ist"/"lautet" – and for weak words (Schlüssel, Token, Geheimnis …) – only values
//   that look like a credential (letters+digits or symbols, no file names, no URLs) are redacted, so sentences like
//   "Das Token ist abgelaufen" stay intact.
// - Layer 3 redacts random-looking tokens (≥ 32 chars of [A-Za-z0-9_-+=] with upper, lower and digits, Shannon entropy
//   ≥ 3.8 and less than half of the characters inside word-like runs). Measured: camelCase identifiers score ≥ 0.65
//   word share, random base64 tokens ≈ 0.2 (about 3 % of random 32-char tokens are missed – the core patterns cover
//   the known key formats). Hex hashes and UUIDs are never touched (no upper+lower mix).
// - "Mainly a secret": the redaction removed at least half of the non-whitespace characters, or fewer than two
//   meaningful words remain besides key names ("OPENAI_API_KEY=…", "Mein Passwort lautet …").
import { REDACTED, redactString } from '../core/redact';
import { validation } from '../core/errors';

export const TITLE_MAX = 300;
export const CONTENT_MAX = 20000;
export const TAGS_MAX = 20;
export const TAG_LENGTH_MAX = 60;

const VALUE_CHARS = String.raw`[^\s"'„“”‚‘’,;]`;
const SEPARATOR = String.raw`(\s*[:=]\s*|\s+(?:ist|lautet|heißt|heisst)\s*:?\s*)`;
const QUOTE = String.raw`(["'„“‚‘]?)`;
const STRONG_PHRASE = new RegExp(
  String.raw`((?:passwort|kennwort|passphrase|zugangscode|pin-?code|pin-?nummer|geheimzahl))${SEPARATOR}${QUOTE}(${VALUE_CHARS}{4,})`,
  'giu',
);
const WEAK_PHRASE = new RegExp(
  String.raw`((?:api-?schlüssel|api-?schluessel|zugangsschlüssel|zugangsschluessel|geheimschlüssel|geheimschluessel|schlüssel|schluessel|geheimnis|token|zugangsdaten))${SEPARATOR}${QUOTE}(${VALUE_CHARS}{6,})`,
  'giu',
);
const RANDOM_TOKEN = /(?<![A-Za-z0-9_\-+=])[A-Za-z0-9_\-+=]{32,}(?![A-Za-z0-9_\-+=])/g;
const FILE_LIKE = /[\\/]|\.(?:json|env|txt|ya?ml|toml|ini|cfg|conf|config|js|mjs|cjs|ts|tsx|cs|py|ps1|bat|cmd|sh|md|xml|lock)$/i;
const TRAILING_PUNCTUATION = /[.!?:)\]}]+$/;

/** Words that do not count as meaningful text next to a redacted value. */
const KEY_WORDS =
  /^(?:api|key|keys|token|tokens|secret|secrets|password|passwort|kennwort|passphrase|pass|pwd|passwd|bearer|basic|auth|authorization|access|private|credential|credentials|zugang|zugangsdaten|zugangscode|schlüssel|schluessel|geheim|geheimnis|code|pin|der|die|das|ist|lautet|heißt|heisst|mein|meine|unser|unsere|hier|neue|neuer|neues|the|is|my|our|for|für|fuer|von|und|and|value|wert)$/i;

/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  const n = Array.from(s).length;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Share of characters that sit in word-like runs (Abc…, abc…) – high for identifiers, low for random tokens. */
function wordShare(s: string): number {
  let n = 0;
  for (const m of s.matchAll(/[A-Z]?[a-z]{3,}/g)) n += m[0].length;
  return n / s.length;
}

/** True for long tokens that look randomly generated (API keys, session tokens) rather than identifiers. */
export function looksRandomToken(token: string): boolean {
  if (token.length < 32) return false;
  if (!/[A-Z]/.test(token) || !/[a-z]/.test(token) || !/[0-9]/.test(token)) return false;
  return shannonEntropy(token) >= 3.8 && wordShare(token) < 0.5;
}

/** True when a value after "ist/lautet" or a weak keyword looks like a credential. */
export function looksLikeCredential(value: string): boolean {
  const v = value.replace(TRAILING_PUNCTUATION, '');
  if (v.length < 6 || v.includes(REDACTED)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) || FILE_LIKE.test(v)) return false;
  const hasDigit = /\p{N}/u.test(v);
  const hasLetter = /\p{L}/u.test(v);
  const hasSymbol = /[^\p{L}\p{N}]/u.test(v);
  const innerUpper = /\p{Lu}/u.test(v.slice(1)) && /\p{Ll}/u.test(v);
  return (hasDigit && hasLetter) || (hasSymbol && (hasLetter || hasDigit)) || (v.length >= 12 && innerUpper);
}

function replacePhrase(match: string, keyword: string, separator: string, quote: string, rawValue: string, always: boolean): string {
  const trailing = TRAILING_PUNCTUATION.exec(rawValue)?.[0] ?? '';
  const value = trailing ? rawValue.slice(0, rawValue.length - trailing.length) : rawValue;
  if (value.includes(REDACTED)) return match;
  const isAssignment = /[:=]/.test(separator) && !/ist|lautet|heißt|heisst/i.test(separator);
  const redact = always && isAssignment ? value.length >= 4 : looksLikeCredential(value);
  return redact ? `${keyword}${separator}${quote}${REDACTED}${trailing}` : match;
}

/** Redacts credentials in free text (core patterns + German phrases + random-looking tokens). */
export function redactMemoryText(input: string): string {
  if (!input) return input;
  let out = redactString(input);
  out = out.replace(STRONG_PHRASE, (m, k: string, sep: string, q: string, v: string) => replacePhrase(m, k, sep, q, v, true));
  out = out.replace(WEAK_PHRASE, (m, k: string, sep: string, q: string, v: string) => replacePhrase(m, k, sep, q, v, false));
  out = out.replace(RANDOM_TOKEN, (token) => (looksRandomToken(token) ? REDACTED : token));
  return out;
}

/** Share (0..1) of non-whitespace characters that the redaction removed. */
export function secretShare(original: string, redacted: string): number {
  const before = original.replace(/\s+/g, '').length;
  if (before === 0) return 0;
  const after = redacted.split(REDACTED).join('').replace(/\s+/g, '').length;
  return Math.max(0, Math.min(1, (before - after) / before));
}

/** True when a text consists mainly of credentials (the redaction changed it and little else remains). */
export function isMostlySecret(original: string, redacted: string): boolean {
  if (redacted === original) return false;
  if (secretShare(original, redacted) >= 0.5) return true;
  const rest = redacted.split(REDACTED).join(' ');
  const words = rest.match(/\p{L}{3,}/gu) ?? [];
  return words.filter((w) => !KEY_WORDS.test(w)).length < 2;
}

export interface SanitizedText {
  text: string;
  redacted: boolean;
  mostlySecret: boolean;
}

/** Redacts a text and classifies it. */
export function sanitizeText(input: string): SanitizedText {
  const text = redactMemoryText(input);
  return { text, redacted: text !== input, mostlySecret: isMostlySecret(input, text) };
}

/** German VALIDATION error for entries that are mainly credentials. */
export function mostlySecretError() {
  return validation(
    'Der Eintrag besteht überwiegend aus Zugangsdaten oder Schlüsseln und wird deshalb nicht gespeichert. ' +
      'API-Schlüssel gehören in die Anbieter-Einstellungen, nicht ins Gedächtnis.',
  );
}

/** Validates and sanitises a title: trimmed, 1..300 characters, redacted, never mainly a secret. */
export function sanitizeTitle(raw: unknown): string {
  if (typeof raw !== 'string') throw validation('Bitte einen Titel angeben.');
  const title = raw.replace(/\s+/g, ' ').trim();
  if (!title) throw validation('Bitte einen Titel angeben.');
  if (title.length > TITLE_MAX) throw validation(`Der Titel ist zu lang (höchstens ${TITLE_MAX} Zeichen).`);
  const s = sanitizeText(title);
  if (s.mostlySecret) throw mostlySecretError();
  return s.text.slice(0, TITLE_MAX);
}

/** Validates and sanitises a content text: at most 20 000 characters, redacted, never mainly a secret. */
export function sanitizeContent(raw: unknown): string {
  if (typeof raw !== 'string') throw validation('Der Inhalt muss ein Text sein.');
  const content = raw.replace(/\r\n?/g, '\n').trim();
  if (content.length > CONTENT_MAX) throw validation('Der Inhalt ist zu lang (höchstens 20.000 Zeichen).');
  const s = sanitizeText(content);
  if (s.mostlySecret) throw mostlySecretError();
  return s.text.slice(0, CONTENT_MAX);
}

/**
 * Normalises tags: trimmed, whitespace collapsed, at most 60 characters each, duplicates (case-insensitive) and empty
 * tags removed, at most 20 tags. Tags that contain a credential are dropped.
 */
export function normalizeTags(tags: readonly unknown[] | undefined | null): string[] {
  if (!tags) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const tag = raw.replace(/\s+/g, ' ').trim().slice(0, TAG_LENGTH_MAX).trim();
    if (!tag) continue;
    if (redactMemoryText(tag) !== tag) continue;
    const key = tag.toLocaleLowerCase('de-DE');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
}
