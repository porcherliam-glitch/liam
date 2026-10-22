// Built-in static file server for 'browser-static' previews (SPEC §4.8, §6.8).
// Key decisions:
// - Listens on 127.0.0.1 with a random port; answers 421 unless the Host header is exactly 127.0.0.1:<port>,
//   localhost:<port> or [::1]:<port> (DNS-rebinding protection).
// - Serves only below a random /p/<32hex>/ prefix (part of PreviewStatus.url), GET and HEAD only.
// - Never serves dot-segments or hidden files (".", "..", ".env", ".git" …), encoded slashes/backslashes or NUL; the
//   caller's resolve() (PathGuard: symlinks resolved, containment, protected/sensitive files) decides the rest, and
//   the real path is checked against the real root again before streaming.
// - No directory listings: a directory serves its index.html or 404. Headers: nosniff, no-store, no-referrer.
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Logger } from '../core/logger';
import { errorMessage } from '../core/errors';
import { mimeType } from './mime';

export interface StaticServerOptions {
  root: string;
  /** Validates a project-relative path (forward slashes, "" = root) and returns its absolute path, or null. */
  resolve(rel: string): string | null;
  platform: NodeJS.Platform;
  log: Logger;
}

export interface StaticServer {
  port: number;
  /** "/p/<32hex>/" */
  prefix: string;
  /** Full loopback URL of a project-relative entry file. */
  url(entry: string | null): string;
  close(): Promise<void>;
}

const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

function sendText(res: ServerResponse, status: number, text: string, extra: Record<string, string> = {}): void {
  res.writeHead(status, { ...BASE_HEADERS, 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': Buffer.byteLength(text), ...extra });
  res.end(text);
}

function insideRoot(real: string, rootReal: string, platform: NodeJS.Platform): boolean {
  const a = platform === 'win32' ? real.toLowerCase() : real;
  const b = platform === 'win32' ? rootReal.toLowerCase() : rootReal;
  if (a === b) return true;
  const sep = platform === 'win32' ? '\\' : '/';
  return a.startsWith(b.endsWith(sep) ? b : b + sep);
}

export function encodePath(rel: string): string {
  return rel
    .split('/')
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

/** Decodes and validates the path below the prefix. Returns segments or null (reject). */
export function parsePreviewPath(rest: string): string[] | null {
  if (/%(2f|5c|00)/i.test(rest) || rest.includes('\\')) return null;
  const raw = rest.split('/');
  const segs: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    if (r === '') {
      if (i === raw.length - 1) continue; // trailing slash
      return null; // "a//b"
    }
    let seg: string;
    try {
      seg = decodeURIComponent(r);
    } catch {
      return null;
    }
    if (seg === '.' || seg === '..' || seg.startsWith('.') || /[\\/:\u0000-\u001f]/.test(seg)) return null;
    segs.push(seg);
  }
  return segs;
}

export function startStaticServer(opts: StaticServerOptions): Promise<StaticServer> {
  const token = randomBytes(16).toString('hex');
  const prefix = `/p/${token}/`;
  let rootReal: string;
  try {
    rootReal = realpathSync.native(opts.root);
  } catch {
    rootReal = opts.root;
  }
  let port = 0;

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    try {
      const host = String(req.headers.host ?? '').toLowerCase();
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}` && host !== `[::1]:${port}`) {
        sendText(res, 421, 'Falscher Host-Header.');
        return;
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'Nur GET und HEAD sind erlaubt.', { Allow: 'GET, HEAD' });
        return;
      }
      const rawUrl = req.url ?? '/';
      const pathname = rawUrl.split('?')[0].split('#')[0];
      if (pathname === prefix.slice(0, -1)) {
        res.writeHead(301, { ...BASE_HEADERS, Location: prefix });
        res.end();
        return;
      }
      if (!pathname.startsWith(prefix)) {
        sendText(res, 404, 'Nicht gefunden.');
        return;
      }
      const rest = pathname.slice(prefix.length);
      const segs = parsePreviewPath(rest);
      if (!segs) {
        sendText(res, 404, 'Nicht gefunden.');
        return;
      }
      const rel = segs.join('/');
      const trailingSlash = rest === '' || rest.endsWith('/');
      let abs = rel === '' ? rootReal : opts.resolve(rel);
      if (!abs) {
        sendText(res, 404, 'Nicht gefunden.');
        return;
      }
      let st = statSync(abs, { throwIfNoEntry: false });
      if (!st) {
        sendText(res, 404, 'Nicht gefunden.');
        return;
      }
      if (st.isDirectory()) {
        if (!trailingSlash) {
          res.writeHead(301, { ...BASE_HEADERS, Location: `${pathname}/` });
          res.end();
          return;
        }
        abs = opts.resolve(rel ? `${rel}/index.html` : 'index.html');
        st = abs ? statSync(abs, { throwIfNoEntry: false }) : undefined;
        if (!abs || !st || !st.isFile()) {
          sendText(res, 404, 'Nicht gefunden (keine index.html in diesem Ordner).');
          return;
        }
      }
      if (!st.isFile()) {
        sendText(res, 404, 'Nicht gefunden.');
        return;
      }
      const real = realpathSync.native(abs);
      if (!insideRoot(real, rootReal, opts.platform)) {
        sendText(res, 404, 'Nicht gefunden.');
        return;
      }
      res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': mimeType(real), 'Content-Length': st.size });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      createReadStream(real)
        .on('error', () => res.destroy())
        .pipe(res);
    } catch (e) {
      opts.log.warn('Vorschau-Server: Anfrage fehlgeschlagen', { error: errorMessage(e) });
      if (!res.headersSent) sendText(res, 500, 'Interner Fehler.');
      else res.destroy();
    }
  };

  const server = createServer(handler);
  server.headersTimeout = 10_000;
  server.requestTimeout = 60_000;
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      const addr = server.address();
      port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        prefix,
        url(entry) {
          return `http://127.0.0.1:${port}${prefix}${entry ? encodePath(entry) : ''}`;
        },
        close() {
          return new Promise<void>((done) => {
            server.close(() => done());
            server.closeAllConnections();
          });
        },
      });
    });
  });
}
