// Nonce/proof and token-comparison helpers shared by the daemon RPC server and the DaemonClient.
// Key decisions:
// - Pure Node (node:crypto only): this file is bundled into Electron main as well as into the daemon.
// - Proof = lower-case hex HMAC-SHA256 keyed with the daemon token over the lower-case 32-hex nonce (SPEC §6.1).
//   A client verifies the proof BEFORE it sends the token, so a foreign program squatting the endpoint never sees it.
// - Token comparison hashes both sides with SHA-256 first and compares the digests with timingSafeEqual, so tokens
//   of different lengths never throw and the comparison time does not depend on the content.
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Request header carrying the client nonce for GET /health (lower-case, as Node exposes header names). */
export const NONCE_HEADER = 'x-nova-nonce';
export const NONCE_RE = /^[0-9a-f]{32}$/i;
export const PROOF_RE = /^[0-9a-f]{64}$/i;

/** 16 random bytes as 32 lower-case hex characters. */
export function newNonce(): string {
  return randomBytes(16).toString('hex');
}

/** HMAC-SHA256(token, nonce) as lower-case hex. */
export function computeProof(token: string, nonce: string): string {
  return createHmac('sha256', token).update(nonce.toLowerCase(), 'utf8').digest('hex');
}

/** True when `proof` is the HMAC of `nonce` with `token` (constant-time comparison). */
export function verifyProof(token: string, nonce: string, proof: unknown): boolean {
  if (typeof proof !== 'string' || !PROOF_RE.test(proof)) return false;
  const expected = Buffer.from(computeProof(token, nonce), 'hex');
  const actual = Buffer.from(proof.toLowerCase(), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time token comparison that never throws for different lengths. */
export function tokensEqual(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

/** Short, non-reversible tag of a token (used to separate keep-alive socket pools per token). */
export function tokenTag(token: string): string {
  return sha256(token).toString('hex').slice(0, 16);
}
