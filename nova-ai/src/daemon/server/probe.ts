// Probing an endpoint for a running NOVA daemon (single-instance checks, EADDRINUSE handling, diagnostics).
// Key decisions:
// - Uses the same nonce/proof handshake as the DaemonClient (GET /health with X-Nova-Nonce, no Authorization), with
//   the token from the daemon's token file: the token itself is never sent.
// - 'ours'    = the answer carries a valid proof for the token in the token file.
//   'foreign' = something holds the endpoint but cannot prove the token (other program, other NOVA data dir with a
//               colliding endpoint override, missing/stale token file) or does not answer within the timeout.
//   'none'    = nothing listens (ENOENT/ECONNREFUSED) or the listener closed the connection without answering.
import { readFileSync } from 'node:fs';
import { handshake, type DaemonHealth, type HandshakeResult } from '../client/handshake';

export type ProbeStatus = 'ours' | 'foreign' | 'none';

export interface ProbeResult {
  status: ProbeStatus;
  health: { pid: number; version: string; instanceId: string } | null;
}

/** Internal, more detailed probe (keeps the "NOVA-shaped but unverifiable" case). */
export interface DetailedProbe extends ProbeResult {
  /** True when the answer looked like NOVA but no token was available to verify it. */
  unverifiedNova: boolean;
  detail: string;
  handshake: HandshakeResult['kind'];
}

function readTokenFile(tokenPath: string | null): string | null {
  if (!tokenPath) return null;
  try {
    const value = readFileSync(tokenPath, 'utf8').trim();
    return value.length > 0 && !/\s/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function strip(health: DaemonHealth): ProbeResult['health'] {
  return { pid: health.pid, version: health.version, instanceId: health.instanceId };
}

export async function probeEndpoint(endpoint: string, tokenPath: string | null, timeoutMs: number): Promise<DetailedProbe> {
  const token = readTokenFile(tokenPath);
  const result = await handshake({ endpoint, token, timeoutMs, keepSocket: false });
  switch (result.kind) {
    case 'ok':
      return { status: 'ours', health: strip(result.health), unverifiedNova: false, detail: 'Nachweis gültig', handshake: result.kind };
    case 'unverified':
      // health is kept for diagnostics/CONFLICT details; probeDaemon() only exposes it for 'ours'.
      return { status: 'foreign', health: strip(result.health), unverifiedNova: true, detail: 'Zugangstoken fehlt – Antwort nicht prüfbar', handshake: result.kind };
    case 'mismatch':
      return { status: 'foreign', health: null, unverifiedNova: false, detail: 'Nachweis passt nicht zum Zugangstoken', handshake: result.kind };
    case 'foreign':
    case 'timeout':
      return { status: 'foreign', health: null, unverifiedNova: false, detail: result.detail, handshake: result.kind };
    case 'closed':
    case 'none':
      return { status: 'none', health: null, unverifiedNova: false, detail: result.detail, handshake: result.kind };
  }
}

/**
 * GET /health with a nonce and HMAC proof check against the token in `tokenPath`.
 * Never throws; never sends the token.
 */
export async function probeDaemon(endpoint: string, tokenPath: string, timeoutMs = 2000): Promise<ProbeResult> {
  const r = await probeEndpoint(endpoint, tokenPath, timeoutMs);
  return { status: r.status, health: r.status === 'ours' ? r.health : null };
}
