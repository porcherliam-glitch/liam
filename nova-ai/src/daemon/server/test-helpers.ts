// Test-only helpers of the server module (imported by *.test.ts only; never by the barrel).
// Unique endpoints (named pipe on Windows, short unix socket path in os.tmpdir() elsewhere – see
// tests/helpers/endpoint.ts), temp token files, raw HTTP and SSE clients.
import { request } from 'node:http';
import type { Server as NetServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AnyNovaEvent } from '@shared/events';
import { EventBus } from '../core/bus';
import type { Logger } from '../core/logger';
import type { RpcRouter } from '../contracts';
import { createRpcRouter } from './router';
import { startRpcServer, type RpcServerHandle, type RpcServerLimits } from './http-server';
import { generateToken, writeToken } from './token';
import { testEndpoint } from '../../../tests/helpers/endpoint';

export interface LogEntryCapture {
  level: 'debug' | 'info' | 'warn' | 'error';
  msg: string;
  data?: unknown;
}

export function captureLogger(): { log: Logger; entries: LogEntryCapture[] } {
  const entries: LogEntryCapture[] = [];
  const make = (): Logger => ({
    debug: (msg, data) => entries.push({ level: 'debug', msg, data }),
    info: (msg, data) => entries.push({ level: 'info', msg, data }),
    warn: (msg, data) => entries.push({ level: 'warn', msg, data }),
    error: (msg, data) => entries.push({ level: 'error', msg, data }),
    child: () => make(),
  });
  return { log: make(), entries };
}

/** A fresh endpoint nobody listens on: `\\.\pipe\nova-test-…` on Windows, `<tmpdir>/nv-<random>.sock` elsewhere. */
export function uniqueEndpoint(): string {
  return testEndpoint(tmpdir());
}

/** Lets a plain net/http server listen on `endpoint`; rejects (instead of hanging) when listen fails. */
export function listenOn(server: NetServer, endpoint: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(endpoint);
  });
}

export async function waitUntil(pred: () => boolean, timeoutMs = 3000, stepMs = 10): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (!pred()) {
    if (Date.now() > until) throw new Error('waitUntil: condition not met in time');
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

export interface TestServer {
  server: RpcServerHandle;
  bus: EventBus;
  router: RpcRouter;
  token: string;
  tokenPath: string;
  endpoint: string;
  dir: string;
  logs: LogEntryCapture[];
  cleanup(): Promise<void>;
}

export async function startTestServer(
  opts: {
    endpoint?: string;
    dir?: string;
    limits?: Partial<RpcServerLimits>;
    register?: (router: RpcRouter) => void;
    platform?: NodeJS.Platform;
    writeTokenFile?: boolean;
    instanceId?: string;
  } = {},
): Promise<TestServer> {
  const dir = opts.dir ?? mkdtempSync(join(tmpdir(), 'nv-srv-'));
  const tokenPath = join(dir, 'daemon.token');
  const endpoint = opts.endpoint ?? uniqueEndpoint();
  const { log, entries } = captureLogger();
  const router = createRpcRouter(log, { validateResults: true });
  router.register('daemon.logs', (p) => [{ ts: 1, level: 'info', scope: 'test', msg: `limit=${p.limit}` }]);
  opts.register?.(router);
  const bus = new EventBus();
  const token = generateToken();
  const server = await startRpcServer({
    endpoint,
    token,
    tokenPath,
    router,
    bus,
    log,
    version: '9.9.9-test',
    instanceId: opts.instanceId ?? `inst_${randomBytes(4).toString('hex')}`,
    platform: opts.platform,
    limits: opts.limits,
  });
  if (opts.writeTokenFile !== false) writeToken({ token: tokenPath }, token);
  return {
    server,
    bus,
    router,
    token,
    tokenPath,
    endpoint,
    dir,
    logs: entries,
    async cleanup() {
      await server.close();
      if (!opts.dir) rmSync(dir, { recursive: true, force: true });
    },
  };
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json(): unknown;
}

export function rawRequest(o: { endpoint: string; method?: string; path?: string; headers?: Record<string, string>; body?: string | Buffer }): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: o.endpoint, method: o.method ?? 'GET', path: o.path ?? '/', headers: o.headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: () => JSON.parse(body) });
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(o.body);
  });
}

export function rpcBody(method: string, params?: unknown, id = 'r1'): string {
  return JSON.stringify(params === undefined ? { id, method } : { id, method, params });
}

export interface RawSse {
  status: number;
  events: AnyNovaEvent[];
  comments: string[];
  ended: boolean;
  close(): void;
}

/** Opens GET /events with a raw request (no proof check) and collects events/comments. */
export function openRawSse(endpoint: string, token: string, path = '/events'): Promise<RawSse> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: endpoint, path, method: 'GET', headers: { Authorization: `Bearer ${token}` }, agent: false }, (res) => {
      const state: RawSse = {
        status: res.statusCode ?? 0,
        events: [],
        comments: [],
        ended: false,
        close: () => req.destroy(),
      };
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of block.split('\n')) {
            if (line.startsWith('data: ')) state.events.push(JSON.parse(line.slice(6)) as AnyNovaEvent);
            else if (line.startsWith(':')) state.comments.push(line.slice(1).trim());
          }
        }
      });
      res.on('end', () => (state.ended = true));
      res.on('close', () => (state.ended = true));
      res.on('error', () => (state.ended = true));
      resolve(state);
    });
    req.on('error', reject);
    req.end();
  });
}
