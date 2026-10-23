// Daemon access token: generated per daemon start, kept in memory, written to <dataDir>/daemon.token.
// Key decisions:
// - 32 random bytes as 64 lower-case hex characters (SPEC §4.1).
// - SPEC §6.1 startup order: generate in memory → bind the endpoint → write the token file. generateToken() and
//   writeToken() are therefore separate; ensureToken() (generate + write) is kept for the original barrel contract.
// - Written with atomicWriteFile (temp file + fsync + rename with Windows retries) and mode 0o600. On Windows the
//   mode is ignored; the file inherits the per-user ACL of %LOCALAPPDATA% (local administrators can still read it –
//   honest limit 6.0 (g)).
// - readToken() returns null for missing or malformed files (never throws for "not there").
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { DataPaths } from '../core/paths';
import { atomicWriteFile } from '../core/fs-atomic';

const TOKEN_RE = /^[0-9a-f]{64}$/;

/** New random token (64 hex characters). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** Writes the token atomically with mode 0o600 (no trailing newline). */
export function writeToken(paths: Pick<DataPaths, 'token'>, token: string): void {
  if (!TOKEN_RE.test(token)) throw new TypeError('writeToken: token must be 64 lower-case hex characters');
  atomicWriteFile(paths.token, token, { mode: 0o600 });
}

/** Token from the token file, or null when it is missing or not a valid token. */
export function readToken(paths: Pick<DataPaths, 'token'>): string | null {
  try {
    const value = readFileSync(paths.token, 'utf8').trim();
    return TOKEN_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

/** Generates a new token and writes it immediately. Prefer generateToken() + writeToken() after binding (SPEC §6.1). */
export function ensureToken(paths: Pick<DataPaths, 'token'>): string {
  const token = generateToken();
  writeToken(paths, token);
  return token;
}
