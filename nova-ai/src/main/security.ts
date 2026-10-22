// Pure security policy of the Electron main process: app origin, URL validation for navigation / external links /
// preview subframes, the Content-Security-Policy and local path validation for "Ordner öffnen"/"Im Explorer zeigen".
// Key decisions:
// - The production renderer lives on the privileged custom origin app://nova (never file://). Origins are compared
//   by protocol + host + port: Node's WHATWG URL reports origin "null" for non-special schemes such as app:.
// - Development (NOVA_RENDERER_URL, unpackaged only) must be a loopback http(s) URL; the packaged app ignores it so
//   an environment variable can never point the UI at a remote site.
// - Subframes may only show loopback http URLs (the studio preview of agent-built apps); everything else is denied.
// - External links: http/https only, no credentials, no control characters, ≤ 2048 characters.
// - openPath only opens existing directories; UNC (\\server\share) and device paths (\\?\, \\.\) are refused on
//   Windows (no SMB/NTLM traffic to arbitrary hosts, no device namespace tricks).
import { posix, win32 } from 'node:path';

export const APP_SCHEME = 'app';
export const APP_HOST = 'nova';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;
export const APP_ENTRY_URL = `${APP_ORIGIN}/index.html`;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_URL_LENGTH = 2048;

function parseUrl(raw: unknown): URL | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 8192) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

/** Effective origin key (protocol + host incl. port) that also works for custom schemes. */
export function originKey(raw: string): string | null {
  const u = parseUrl(raw);
  if (!u || !u.host) return null;
  return `${u.protocol}//${u.host}`.toLowerCase();
}

/** True when `url` belongs to the app origin (`app://nova` or the dev server origin). */
export function isAppUrl(url: string, appOrigin: string): boolean {
  const a = originKey(url);
  const b = originKey(appOrigin);
  return a !== null && b !== null && a === b;
}

/** http URL on 127.0.0.1 / localhost / [::1] (any port), without credentials. */
export function isLoopbackHttpUrl(raw: string): boolean {
  const u = parseUrl(raw);
  if (!u) return false;
  return u.protocol === 'http:' && LOOPBACK_HOSTS.has(u.hostname.toLowerCase()) && !u.username && !u.password;
}

/** Subframe navigation policy (preview iframe): loopback http URLs and about:blank only. */
export function isAllowedSubframeUrl(raw: string): boolean {
  if (raw === 'about:blank' || raw === 'about:srcdoc') return true;
  return isLoopbackHttpUrl(raw);
}

/**
 * Validates a URL for shell.openExternal. Returns the normalised URL or null when it must not be opened.
 * Only http/https with a host, no embedded credentials, no control characters, at most 2048 characters.
 */
export function validateExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL_LENGTH || CONTROL_CHARS.test(raw)) return null;
  const u = parseUrl(raw.trim());
  if (!u) return null;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname || u.username || u.password) return null;
  const normalised = u.toString();
  return normalised.length <= MAX_URL_LENGTH ? normalised : null;
}

/**
 * Development renderer URL from NOVA_RENDERER_URL: only loopback http(s) URLs are accepted. Returns the URL to load
 * or null (invalid → the production renderer is used).
 */
export function parseDevRendererUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const u = parseUrl(raw.trim());
  if (!u) return null;
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!LOOPBACK_HOSTS.has(u.hostname.toLowerCase()) || u.username || u.password) return null;
  return u.toString();
}

export interface CspOptions {
  /** Development mode (NOVA_DEV=1): allows the Vite dev server, HMR websocket, eval and the inline refresh preamble. */
  dev: boolean;
  /** Origin of the Vite dev server (e.g. http://127.0.0.1:5173) when dev is true. */
  devServerOrigin?: string | null;
}

/** Content-Security-Policy of the renderer (UI-SPEC §5). */
export function buildCsp(opts: CspOptions): string {
  const loopbackFrames = ['http://127.0.0.1:*', 'http://localhost:*', 'http://[::1]:*'];
  const d: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'worker-src': ["'self'", 'blob:'],
    'connect-src': ["'self'"],
    'frame-src': [...loopbackFrames],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
  };
  if (opts.dev) {
    const origin = opts.devServerOrigin ? originKey(opts.devServerOrigin) : null;
    // 'unsafe-eval' for Vite/React dev tooling, 'unsafe-inline' for the @vitejs/plugin-react refresh preamble
    // (an inline module script). Never present in production builds.
    d['script-src'].push("'unsafe-eval'", "'unsafe-inline'");
    if (origin) {
      const ws = origin.replace(/^http/, 'ws');
      for (const key of ['script-src', 'style-src', 'img-src', 'font-src', 'worker-src']) d[key].push(origin);
      d['connect-src'].push(origin, ws);
    }
  }
  return Object.entries(d)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

export interface LocalPathOptions {
  platform: NodeJS.Platform;
}

/**
 * Validates an absolute local path coming from the renderer. Returns the normalised path or null.
 * Rejects relative paths, NUL bytes, overly long input and (Windows) UNC / device namespace paths.
 */
export function validateLocalPath(raw: unknown, opts: LocalPathOptions): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 32767 || raw.includes('\0')) return null;
  if (opts.platform === 'win32') {
    const p = raw.replace(/\//g, '\\');
    if (p.startsWith('\\\\')) return null; // UNC share, \\?\ or \\.\ device namespace
    if (!/^[A-Za-z]:\\/.test(p)) return null; // drive-absolute only (no "C:foo", no "\foo")
    if (p.slice(2).includes(':')) return null; // alternate data streams
    return win32.normalize(p);
  }
  if (!posix.isAbsolute(raw)) return null;
  return posix.normalize(raw);
}
