// app://nova/ protocol handler: serves the built renderer (out/renderer) to the window instead of file://.
// Key decisions:
// - Path traversal safe: the URL path is percent-decoded once, then rejected when it contains NUL, backslashes,
//   drive/stream colons or any ".." segment; the resolved file must stay inside the root (lexically AND after
//   realpath, so symlinks cannot escape). "/" maps to index.html; there is no directory listing and no SPA
//   fallback (the renderer uses a HashRouter, so every route is index.html#/…).
// - Only GET and HEAD for host "nova"; everything else is 404/405.
// - Correct MIME types (Monaco workers, fonts, wasm), `X-Content-Type-Options: nosniff`, `no-cache`, no referrer,
//   and the CSP header on every response (documents and workers).
// - Electron patches node:fs for asar archives, so the same code serves <resources>/app.asar/out/renderer.
//   realpath may not be available for asar paths; then the lexical check alone applies (no symlinks in asar).
import { promises as fsp } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { APP_HOST, APP_SCHEME } from './security';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
};

export function mimeTypeFor(file: string): string {
  return MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export type ResolveResult = { ok: true; file: string } | { ok: false; status: 400 | 403 | 404 };

function isInside(root: string, file: string): boolean {
  return file === root || file.startsWith(root.endsWith(sep) ? root : root + sep);
}

/** Maps an app:// request URL to a file below `root` (absolute, normalised). Pure, no file system access. */
export function resolveRendererPath(root: string, requestUrl: string): ResolveResult {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return { ok: false, status: 400 };
  }
  if (url.protocol !== `${APP_SCHEME}:` || url.host.toLowerCase() !== APP_HOST) return { ok: false, status: 404 };
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    return { ok: false, status: 400 };
  }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.includes(':')) return { ok: false, status: 400 };
  const segments = decoded.split('/').filter((s) => s.length > 0);
  if (segments.some((s) => s === '..' || s === '.')) return { ok: false, status: 403 };
  const rel = segments.length === 0 ? 'index.html' : segments.join('/');
  const rootAbs = resolve(root);
  const file = resolve(rootAbs, rel);
  if (!isInside(rootAbs, file) || file === rootAbs) return { ok: false, status: 403 };
  return { ok: true, file };
}

export interface AppProtocolOptions {
  /** Directory of the built renderer (out/renderer). */
  root: string;
  /** Content-Security-Policy header value. */
  csp: string;
  /** Injectable for tests. */
  fs?: Pick<typeof fsp, 'readFile' | 'stat' | 'realpath'>;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'Ungültige Anfrage',
  403: 'Zugriff verweigert',
  404: 'Nicht gefunden',
  405: 'Methode nicht erlaubt',
  500: 'Interner Fehler',
};

function errorCode(e: unknown): string | undefined {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

/** Creates the handler for `protocol.handle('app', handler)`. */
export function createAppProtocolHandler(opts: AppProtocolOptions): (request: Request) => Promise<Response> {
  const fs = opts.fs ?? fsp;
  const rootAbs = resolve(opts.root);
  let realRoot: string | null = null;

  const baseHeaders = (): Record<string, string> => ({
    'Content-Security-Policy': opts.csp,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-cache',
  });
  const fail = (status: number, extra: Record<string, string> = {}): Response =>
    new Response(STATUS_TEXT[status] ?? 'Fehler', {
      status,
      headers: { ...baseHeaders(), 'Content-Type': 'text/plain; charset=utf-8', ...extra },
    });

  return async (request: Request): Promise<Response> => {
    const method = request.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return fail(405, { Allow: 'GET, HEAD' });
    const resolved = resolveRendererPath(rootAbs, request.url);
    if (!resolved.ok) return fail(resolved.status);
    try {
      const st = await fs.stat(resolved.file);
      if (!st.isFile()) return fail(404);
      // Symlink escape check (skipped only when realpath is unsupported, e.g. inside an asar archive).
      try {
        if (realRoot === null) realRoot = await fs.realpath(rootAbs);
        const realFile = await fs.realpath(resolved.file);
        if (!isInside(realRoot, realFile)) return fail(403);
      } catch (e) {
        if (errorCode(e) === 'ENOENT') return fail(404);
      }
      const headers = { ...baseHeaders(), 'Content-Type': mimeTypeFor(resolved.file), 'Content-Length': String(st.size) };
      if (method === 'HEAD') return new Response(null, { status: 200, headers });
      const body = await fs.readFile(resolved.file);
      headers['Content-Length'] = String(body.length);
      return new Response(new Uint8Array(body.buffer, body.byteOffset, body.byteLength), { status: 200, headers });
    } catch (e) {
      const code = errorCode(e);
      if (code === 'ENOENT' || code === 'ENOTDIR') return fail(404);
      if (code === 'EACCES' || code === 'EPERM') return fail(403);
      return fail(500);
    }
  };
}
