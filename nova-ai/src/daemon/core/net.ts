// Network helpers: what counts as "local" (no data approval needed) and which hosts NOVA may contact.
// Honest limit: this only governs connections NOVA itself makes and known agent command lines; programs started by
// agents can open any connection (no per-process firewall without admin rights).
import { NovaError } from './errors';

/** Loopback endpoints only: localhost, 127.0.0.0/8, ::1. LAN addresses count as remote. */
export function isLocalEndpoint(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  host = host.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  return /^127(?:\.\d{1,3}){3}$/.test(host);
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return null;
  }
}

/** Exact host or "*.suffix" pattern (matches subdomains and the suffix itself). */
export function hostMatches(host: string, patterns: string[]): boolean {
  const h = host.toLowerCase();
  return patterns.some((raw) => {
    const p = raw.trim().toLowerCase();
    if (!p) return false;
    if (p.startsWith('*.')) {
      const suffix = p.slice(2);
      return h === suffix || h.endsWith(`.${suffix}`);
    }
    return h === p;
  });
}

export interface HostPolicyContext {
  allowedHosts: string[];
  /** Base URLs that are implicitly allowed (enabled providers, update feed). */
  extraUrls: string[];
}

export function isHostAllowed(url: string, ctx: HostPolicyContext): boolean {
  if (isLocalEndpoint(url)) return true;
  const host = hostOf(url);
  if (!host) return false;
  if (hostMatches(host, ctx.allowedHosts)) return true;
  return ctx.extraUrls.some((u) => hostOf(u) === host);
}

/** Throws NETWORK_BLOCKED (German) for hosts that are not allowed. */
export function assertHostAllowed(url: string, purpose: string, ctx: HostPolicyContext): void {
  if (isHostAllowed(url, ctx)) return;
  const host = hostOf(url) ?? url;
  throw new NovaError('NETWORK_BLOCKED', `Verbindung zu „${host}“ ist nicht freigegeben (${purpose}).`, {
    severity: 'warning',
    userAction: `„${host}“ unter Einstellungen → Netzwerk zu den erlaubten Zielen hinzufügen.`,
    details: { host, purpose },
  });
}
