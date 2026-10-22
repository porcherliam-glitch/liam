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

const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g, // Anthropic
  /sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{20,}/g, // OpenAI style
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /xox[abprs]-[A-Za-z0-9-]{10,}/g, // Slack
  /AIza[0-9A-Za-z_-]{35}/g, // Google API key
  /hf_[A-Za-z0-9]{30,}/g, // Hugging Face
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /(?<=\b(?:authorization|x-api-key|api[_-]?key|password|passwd|secret|token)["']?\s*[:=]\s*["']?(?:Bearer\s+)?)[^\s"',;]{6,}/gi,
];

export function redactString(input: string): string {
  let out = input;
  for (const secret of registered) {
    if (out.includes(secret)) out = out.split(secret).join(REDACTED);
  }
  for (const re of PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, REDACTED);
  }
  return out;
}

/** True when the text contains something that looks like a credential. */
export function containsSecret(input: string): boolean {
  return redactString(input) !== input;
}

const SECRET_KEYS = /^(api[_-]?key|apikey|authorization|password|passwd|secret|token|access[_-]?token|refresh[_-]?token|private[_-]?key)$/i;

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
