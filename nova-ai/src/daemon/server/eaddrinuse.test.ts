// Tests for binding conflicts (EADDRINUSE) and probeDaemon(): live NOVA daemon → CONFLICT, foreign server →
// DAEMON_UNAVAILABLE, stale socket file → removed and retried, foreign file → untouched, Windows branch.
import { afterEach, describe, expect, it } from 'vitest';
import { createServer as createHttpServer, type RequestListener, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventBus } from '../core/bus';
import { NovaError } from '../core/errors';
import { createRpcRouter } from './router';
import { startRpcServer, type RpcServerHandle } from './http-server';
import { generateToken, writeToken } from './token';
import { probeDaemon } from './probe';
import { captureLogger, shortSocketPath, startTestServer, type TestServer } from './test-helpers';

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nv-ea-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function start(endpoint: string, tokenPath?: string, extra: { platform?: NodeJS.Platform; probeTimeoutMs?: number } = {}): Promise<RpcServerHandle> {
  const { log } = captureLogger();
  const server = await startRpcServer({
    endpoint,
    token: generateToken(),
    tokenPath,
    router: createRpcRouter(log),
    bus: new EventBus(),
    log,
    version: '2.0.0',
    instanceId: 'inst_second',
    platform: extra.platform,
    limits: { probeTimeoutMs: extra.probeTimeoutMs ?? 500 },
  });
  cleanups.push(() => server.close());
  return server;
}

async function expectNovaError(p: Promise<unknown>, code: string): Promise<NovaError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(NovaError);
    expect((e as NovaError).code).toBe(code);
    return e as NovaError;
  }
  throw new Error(`expected NovaError ${code}`);
}

function listenHttp(endpoint: string, handler: RequestListener): Promise<HttpServer> {
  return new Promise((resolve) => {
    const s = createHttpServer(handler);
    s.listen(endpoint, () => resolve(s));
    cleanups.push(() => new Promise<void>((r) => s.close(() => r())));
  });
}

describe('EADDRINUSE handling', () => {
  it('throws CONFLICT when a live NOVA daemon proves the token from the token file', async () => {
    const first: TestServer = await startTestServer();
    cleanups.push(() => first.cleanup());
    const err = await expectNovaError(start(first.endpoint, first.tokenPath), 'CONFLICT');
    expect(err.message).toBe('NOVA läuft bereits. Der Hintergrunddienst ist schon gestartet.');
    expect(err.details).toMatchObject({ pid: process.pid, version: '9.9.9-test' });
    // the first daemon keeps working
    expect(first.server.stats().openSockets).toBeGreaterThanOrEqual(0);
    expect((await probeDaemon(first.endpoint, first.tokenPath, 500)).status).toBe('ours');
  });

  it('treats a NOVA daemon whose proof does not match the token file as foreign (DAEMON_UNAVAILABLE)', async () => {
    const first = await startTestServer();
    cleanups.push(() => first.cleanup());
    const dir = tmp();
    const otherTokenPath = join(dir, 'daemon.token');
    writeToken({ token: otherTokenPath }, generateToken());
    const err = await expectNovaError(start(first.endpoint, otherTokenPath), 'DAEMON_UNAVAILABLE');
    expect(err.message).toBe('Der Kommunikationskanal wird von einem fremden Programm belegt. Bitte den PC neu starten.');
  });

  it('counts a NOVA-shaped answer as CONFLICT when no tokenPath is given', async () => {
    const first = await startTestServer();
    cleanups.push(() => first.cleanup());
    const err = await expectNovaError(start(first.endpoint), 'CONFLICT');
    expect(err.details).toMatchObject({ pid: process.pid, version: '9.9.9-test' });
  });

  it('throws DAEMON_UNAVAILABLE when a foreign HTTP server holds the endpoint', async () => {
    const endpoint = shortSocketPath();
    await listenHttp(endpoint, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello');
    });
    const dir = tmp();
    const tokenPath = join(dir, 'daemon.token');
    writeToken({ token: tokenPath }, generateToken());
    const err = await expectNovaError(start(endpoint, tokenPath), 'DAEMON_UNAVAILABLE');
    expect(err.message).toContain('fremden Programm');
    expect(existsSync(endpoint)).toBe(true);
  });

  it('throws DAEMON_UNAVAILABLE when a silent program holds the endpoint (probe timeout)', async () => {
    const endpoint = shortSocketPath();
    const sockets: Array<{ destroy(): void }> = [];
    const silent: NetServer = await new Promise((resolve) => {
      const s = createNetServer((socket) => {
        sockets.push(socket);
        socket.on('error', () => {});
      });
      s.listen(endpoint, () => resolve(s));
    });
    cleanups.push(
      () =>
        new Promise<void>((r) => {
          for (const s of sockets) s.destroy();
          silent.close(() => r());
        }),
    );
    const started = Date.now();
    await expectNovaError(start(endpoint, undefined, { probeTimeoutMs: 200 }), 'DAEMON_UNAVAILABLE');
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('removes a stale socket file of a crashed daemon and starts', async () => {
    const endpoint = shortSocketPath();
    const child = spawn(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(endpoint)}, () => console.log('ready'))`], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise<void>((resolve, reject) => {
      child.stdout!.once('data', () => resolve());
      child.once('error', reject);
    });
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    expect(existsSync(endpoint)).toBe(true);
    const server = await start(endpoint);
    expect(server.endpoint).toBe(endpoint);
    expect((await probeDaemon(endpoint, join(tmp(), 'missing.token'), 300)).status).toBe('foreign');
  });

  it('never deletes a regular file at the endpoint path', async () => {
    const dir = tmp();
    const endpoint = join(dir, 'd.sock');
    writeFileSync(endpoint, 'user data');
    await expectNovaError(start(endpoint), 'DAEMON_UNAVAILABLE');
    expect(readFileSync(endpoint, 'utf8')).toBe('user data');
  });

  it('on Windows (pipes) never unlinks: retries once and reports DAEMON_UNAVAILABLE', async () => {
    const endpoint = shortSocketPath();
    const child = spawn(process.execPath, ['-e', `require('net').createServer().listen(${JSON.stringify(endpoint)}, () => console.log('ready'))`], { stdio: ['ignore', 'pipe', 'ignore'] });
    await new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
    child.kill('SIGKILL');
    await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    cleanups.push(() => rmSync(endpoint, { force: true }));
    await expectNovaError(start(endpoint, undefined, { platform: 'win32' }), 'DAEMON_UNAVAILABLE');
    expect(existsSync(endpoint)).toBe(true);
  });

  it('rejects unix socket paths that are too long', async () => {
    await expectNovaError(start(join(tmpdir(), 'x'.repeat(120) + '.sock')), 'DAEMON_UNAVAILABLE');
  });
});

describe('probeDaemon', () => {
  it("reports 'none' when nothing listens", async () => {
    const r = await probeDaemon(shortSocketPath(), join(tmp(), 'daemon.token'), 300);
    expect(r).toEqual({ status: 'none', health: null });
  });

  it("reports 'ours' with health data for a daemon that proves the token", async () => {
    const ts = await startTestServer();
    cleanups.push(() => ts.cleanup());
    const r = await probeDaemon(ts.endpoint, ts.tokenPath);
    expect(r.status).toBe('ours');
    expect(r.health).toEqual({ pid: process.pid, version: '9.9.9-test', instanceId: expect.stringMatching(/^inst_/) });
  });

  it("reports 'foreign' for a stale token file and for a non-NOVA server", async () => {
    const ts = await startTestServer();
    cleanups.push(() => ts.cleanup());
    writeToken({ token: ts.tokenPath }, generateToken());
    expect((await probeDaemon(ts.endpoint, ts.tokenPath, 500)).status).toBe('foreign');
    const endpoint = shortSocketPath();
    await listenHttp(endpoint, (_req, res) => {
      res.writeHead(401);
      res.end();
    });
    expect((await probeDaemon(endpoint, ts.tokenPath, 500)).status).toBe('foreign');
  });
});
