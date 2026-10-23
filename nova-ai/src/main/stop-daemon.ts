// CLI `NOVA AI.exe --stop-daemon` (used by the NSIS installer's customInit and the uninstaller's customUnInit):
// connect to the daemon of the data dir, send daemon.shutdown and wait up to 20 s until the endpoint is gone.
// No window, no tray, no single-instance UI (index.ts runs this before anything else).
// Exit codes: 0 = stopped or not running, 1 = still running after the timeout, 2 = endpoint held by a foreign program.
// Key decisions:
// - The endpoint is probed with the nonce/HMAC proof first (the token is never sent to a foreign program).
// - A "foreign" answer right after a daemon start (endpoint bound, token not yet written) is retried for 3 s.
// - Shutdown errors (e.g. the daemon closed the connection while acknowledging) are not fatal: only the endpoint
//   vanishing counts.
import type { ProbeOutcome, DaemonClientLike } from './daemon-supervisor';
import { errorText, type MainLogger } from './log';
import { TEXTS } from './texts';

export interface StopDaemonOptions {
  endpoint: string;
  tokenPath: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  probeTimeoutMs?: number;
  foreignGraceMs?: number;
  reason?: string;
}

export interface StopDaemonDeps {
  probe(endpoint: string, tokenPath: string, timeoutMs: number): Promise<ProbeOutcome>;
  createClient(opts: { endpoint: string; tokenPath: string }): Pick<DaemonClientLike, 'rpc' | 'close'>;
  sleep(ms: number): Promise<void>;
  now(): number;
  out(line: string): void;
  log?: MainLogger;
}

export const STOP_EXIT = { stopped: 0, timeout: 1, foreign: 2 } as const;

function isTransientForeign(p: ProbeOutcome): boolean {
  return p.unverifiedNova || p.handshake === 'mismatch' || p.handshake === 'timeout';
}

export async function stopDaemonCli(opts: StopDaemonOptions, deps: StopDaemonDeps): Promise<number> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const pollMs = opts.pollIntervalMs ?? 250;
  const probeTimeoutMs = opts.probeTimeoutMs ?? 2_000;
  const foreignGraceMs = opts.foreignGraceMs ?? 3_000;
  const probe = async (): Promise<ProbeOutcome> => {
    try {
      return await deps.probe(opts.endpoint, opts.tokenPath, probeTimeoutMs);
    } catch (e) {
      return { status: 'none', health: null, unverifiedNova: false, handshake: 'none', detail: errorText(e) };
    }
  };

  let p = await probe();
  const graceEnd = deps.now() + foreignGraceMs;
  while (p.status === 'foreign' && isTransientForeign(p) && deps.now() < graceEnd) {
    await deps.sleep(pollMs);
    p = await probe();
  }
  if (p.status === 'none') {
    deps.out(TEXTS.cliNotRunning);
    return STOP_EXIT.stopped;
  }
  if (p.status === 'foreign') {
    deps.out(TEXTS.cliForeign);
    deps.log?.warn('--stop-daemon: Kommunikationskanal von fremdem Programm belegt', { detail: p.detail });
    return STOP_EXIT.foreign;
  }

  deps.out(TEXTS.cliStopping);
  const client = deps.createClient({ endpoint: opts.endpoint, tokenPath: opts.tokenPath });
  try {
    await client.rpc('daemon.shutdown', { reason: opts.reason ?? 'installer' }, { timeoutMs: Math.min(10_000, timeoutMs) });
  } catch (e) {
    deps.log?.warn('--stop-daemon: daemon.shutdown nicht bestätigt', { error: errorText(e) });
  } finally {
    client.close();
  }

  const deadline = deps.now() + timeoutMs;
  for (;;) {
    const q = await probe();
    if (q.status === 'none') {
      deps.out(TEXTS.cliStopped);
      deps.log?.info('--stop-daemon: Hintergrunddienst beendet');
      return STOP_EXIT.stopped;
    }
    if (deps.now() >= deadline) break;
    await deps.sleep(pollMs);
  }
  deps.out(TEXTS.cliStopTimeout(Math.round(timeoutMs / 1000)));
  deps.log?.warn('--stop-daemon: Hintergrunddienst läuft nach Ablauf der Wartezeit noch');
  return STOP_EXIT.timeout;
}
