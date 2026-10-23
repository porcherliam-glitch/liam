// Decides whether a file NOVA is about to commit contains something that looks like a credential (SPEC §6.6:
// containsSecret → SECRET_IN_CODE warning, file not committed).
// Key decisions:
// - Built on core/redact.ts containsSecret/redactString (the one definition of "looks like a secret").
// - Private-key blocks are checked on the whole text (they span lines); everything else line by line.
// - Refinement for source code only: the generic "password = …" / "token: …" pattern also matches ordinary code such
//   as `const password = form.password.value` or `token: string`. In a code file a match is ignored when the matched
//   value is NOT a quoted literal, looks like an identifier/member access/call, and does not itself match a
//   credential format (ghp_…, sk-…, AKIA…, registered API keys). Quoted literals, known token formats and every match
//   in non-code files (.env, JSON, YAML, INI …) always count. Honest limit: this is a best-effort scan.
import { containsSecret, redactString } from '../core/redact';

// Shell/batch scripts are NOT code here: an unquoted `PASSWORD=abc` is a literal assignment there.
const CODE_EXT = /\.(c|cc|cpp|cxx|h|hpp|cs|go|java|kt|kts|js|jsx|mjs|cjs|ts|tsx|mts|cts|php|py|rb|rs|swift|vb|lua|gd|dart|scala|html|htm|vue|svelte|astro)$/i;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
/** Identifier, member access, call or generic type – possibly cut off at a comma/quote by the redaction pattern. */
const REFERENCE = /^[A-Za-z_$][\w$]*(?:(?:\?\.|!?\.)[A-Za-z_$][\w$]*|\[[^\]]*\]?|\([^)]*\)?|<[\w$.,]*>)*[)\]}]*$/;
const MAX_LINE = 20_000;

/** True when a line matched only because of ordinary code (identifier/member access/call/type), not a literal. */
function isCodeReference(line: string): boolean {
  const red = redactString(line);
  let p = 0;
  while (p < line.length && p < red.length && line[p] === red[p]) p++;
  let sfx = 0;
  while (sfx < line.length - p && sfx < red.length - p && line[line.length - 1 - sfx] === red[red.length - 1 - sfx]) sfx++;
  const value = line.slice(p, line.length - sfx);
  if (!value) return false;
  const quoted = p > 0 && /["'`]/.test(line[p - 1]);
  if (quoted) return false;
  if (containsSecret(value)) return false;
  return REFERENCE.test(value);
}

/** Number of lines that look like they contain a credential (0 = safe to commit). */
export function countSecretLines(relPath: string, text: string): number {
  if (!containsSecret(text)) return 0;
  if (PRIVATE_KEY.test(text)) return 1;
  const code = CODE_EXT.test(relPath);
  let count = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;
    if (!containsSecret(line)) continue;
    if (code && isCodeReference(line)) continue;
    count++;
  }
  return count;
}

/** True when the buffer looks binary (NUL byte in the first 8 KB). */
export function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}
