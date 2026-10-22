// Tiny HTTP test-server helper shared by the fake provider servers (fake-ollama, fake-openai, fake-anthropic).
// Listens on 127.0.0.1 with a random port, records every request (method, path, query, parsed JSON body, headers)
// and tracks concurrent in-flight requests (for rate-limit tests). close() also terminates keep-alive sockets.
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  /** Path without query string, e.g. "/api/chat". */
  path: string;
  query: Record<string, string>;
  /** Parsed JSON body, the raw text for non-JSON bodies, null when empty. */
  body: unknown;
  headers: Record<string, string>;
}

export interface FakeHttpServer {
  url: string;
  port: number;
  requests: RecordedRequest[];
  /** Requests currently being handled. */
  inFlight(): number;
  /** Highest number of concurrently handled requests since start (or the last reset). */
  maxInFlight(): number;
  resetStats(): void;
  close(): Promise<void>;
}

export type FakeHandler = (req: RecordedRequest, res: ServerResponse, raw: IncomingMessage) => void | Promise<void>;

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  if (res.writableEnded) return;
  const text = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

export function sendText(res: ServerResponse, status: number, text: string, headers: Record<string, string> = {}): void {
  if (res.writableEnded) return;
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', 'content-length': Buffer.byteLength(text), ...headers });
  res.end(text);
}

export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function startFakeHttpServer(handler: FakeHandler): Promise<FakeHttpServer> {
  const requests: RecordedRequest[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const server = http.createServer((raw, res) => {
    const chunks: Buffer[] = [];
    raw.on('data', (c: Buffer) => chunks.push(c));
    raw.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown = null;
      if (text.length) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      const url = new URL(raw.url ?? '/', 'http://127.0.0.1');
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw.headers)) if (typeof v === 'string') headers[k] = v;
      const rec: RecordedRequest = { method: raw.method ?? 'GET', path: url.pathname, query: Object.fromEntries(url.searchParams), body, headers };
      requests.push(rec);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        inFlight--;
      };
      res.on('finish', finish);
      res.on('close', finish);
      Promise.resolve()
        .then(() => handler(rec, res, raw))
        .catch((e: unknown) => {
          if (!res.headersSent) sendJson(res, 500, { error: `fake server error: ${e instanceof Error ? e.message : String(e)}` });
          else res.destroy();
        });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    port,
    requests,
    inFlight: () => inFlight,
    maxInFlight: () => maxInFlight,
    resetStats: () => {
      maxInFlight = inFlight;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A 127.0.0.1 URL on which nothing listens (connection refused). */
export async function unusedLocalUrl(): Promise<string> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
