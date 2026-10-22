// Secret redaction for logs, error details, agent step data, memory entries and exports.
// Two layers: (1) exact values registered at runtime (API keys loaded from the secret store),
// (2) patterns for well-known credential formats.

const registered = new Set<string>();

/** Register a secret value so it is replaced everywhere it appears. Values shorter than 6 chars are ignored. */
export function registerSecret(value: string | null | undefined): void {
  if (value && value.length >= 6) registered.add(value);
}

export function unregisterSecret(value: string | null | undefined): void {
  if (value) registered.delete(value);
}

export const REDACTED = '[GEHEIM]';

const PATTERNS: Array<{ re: RegExp; replace: string }> = [
  { re: /sk-ant-[A-Za-z0-9_-]{10,}/g, replace: REDACTED }, // Anthropic
  { re: /sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g, replace: REDACTED }, // OpenAI style
  { re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, replace: REDACTED }, // Stripe
  { re: /gh[pousr]_[A-Za-z0-9]{20,}/g, replace: REDACTED }, // GitHub tokens
  { re: /github_pat_[A-Za-z0-9_]{20,}/g, replace: REDACTED },
  { re: /glpat-[A-Za-z0-9_-]{20,}/g, replace: REDACTED }, // GitLab
  { re: /\bnpm_[A-Za-z0-9]{36}\b/g, replace: REDACTED }, // npm
  { re: /\bgsk_[A-Za-z0-9]{20,}/g, replace: REDACTED }, // Groq
  { re: /\bxai-[A-Za-z0-9]{20,}/g, replace: REDACTED }, // xAI
  { re: /AKIA[0-9A-Z]{16}/g, replace: REDACTED }, // AWS access key id
  { re: /xox[abprs]-[A-Za-z0-9-]{10,}/g, replace: REDACTED }, // Slack
  { re: /AIza[0-9A-Za-z_-]{35}/g, replace: REDACTED }, // Google API key
  { re: /hf_[A-Za-z0-9]{30,}/g, replace: REDACTED }, // Hugging Face
  { re: /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g, replace: REDACTED }, // JWT
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replace: REDACTED },
  { re: /(:\/\/[^/\s:@]+:)[^@\s/]+(?=@)/g, replace: `$1${REDACTED}` }, // URL userinfo password
  // KEY=value / "key": "value" / Authorization: Bearer x – also DB_PASSWORD=, DB_PASS=, STRIPE_SECRET=, MY_API_KEY=,
  // AUTH_TOKEN=, PRIVATE_KEY= ("pass" only as a whole name part, so "bypass=" stays readable)
  {
    re: /((?:[A-Za-z0-9]{1,40}[_-]){0,6}(?:api[_-]?key|apikey|access[_-]?key|private[_-]?key|signing[_-]?key|secret(?:[_-]?key)?|token|password|passwd|(?<![A-Za-z0-9])pass(?:phrase|wd)?|pwd|credentials?|auth(?:orization)?)(?:[_-][A-Za-z0-9]{1,40}){0,6}["']?\s*[:=]\s*["']?)(?:(?:Bearer|Basic)\s+)?[^\s"',;]{6,}/gi,
    replace: `$1${REDACTED}`,
  },
];

export function redactString(input: string): string {
  let out = input;
  for (const secret of registered) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const { re, replace } of PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, replace);
  }
  return out;
}

/** Masks values in .env-style / key=value text line by line (used for sensitive files shown to models). */
export function maskSecretFile(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const m = /^(\s*(?:export\s+)?[A-Za-z0-9_.-]+\s*[=:]\s*)(.*)$/.exec(line);
      if (m && m[2].trim() !== '') return `${m[1]}${REDACTED}`;
      return redactString(line);
    })
    .join('\n');
}

/** True when the text contains something that looks like a credential. */
export function containsSecret(input: string): boolean {
  return redactString(input) !== input;
}

const SECRET_KEYS = /(api[_-]?key|apikey|authorization|passw(or)?d|secret|private[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|cookie|token$)/i;

/** Deep redaction of arbitrary JSON-like data. Keys that look like secrets are blanked completely. */
export function redact<T>(value: T, depth = 0): T {
  if (depth > 12) return value;
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object') {
    if (value instanceof Error) {
      return { name: value.name, message: redactString(value.message), stack: value.stack ? redactString(value.stack) : undefined } as unknown as T;
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) && typeof v === 'string' ? REDACTED : redact(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Test helper. */
export function _clearRegisteredSecrets(): void {
  registered.clear();
}
