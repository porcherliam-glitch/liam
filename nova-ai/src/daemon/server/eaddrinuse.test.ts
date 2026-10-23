// Tests for binding conflicts (EADDRINUSE), the endpoint check and probeDaemon(): live NOVA daemon → CONFLICT, foreign
// server → DAEMON_UNAVAILABLE, crashed daemon → start (POSIX: stale socket file removed; Windows: pipe already gone),
// foreign file → untouched, Windows pipe rules. Real endpoints are named pipes on Windows and unix sockets elsewhere;
// the platform branches of bindEndpoint are additionally driven with fakes so both run deterministically on any host.
import { afterEach, describe, expect, it } from 'vitest';
import { createServer as createHttpServer, type RequestListener, type Server as HttpServer } from 'node:http';
import { createServer as createNetServer, type Server as NetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventBus } from '../core/bus';
import { NovaError } from '../core/errors';
import type { Logger } from '../core/logger';
import { createRpcRouter } from './router';
import { SERVER_MESSAGES, bindEndpoint, checkEndpoint, startRpcServer, type BindDeps, type RpcServerHandle } from './http-server';
import { generateToken, writeToken } from './token';
import { probeDaemon, probeEndpoint, type DetailedProbe } from './probe';
import { captureLogger, listenOn, rawRequest, startTestServer, uniqueEndpoint, type TestServer } from './test-helpers';

const isWindows = process.platform === 'win32';
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'nv-ea-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function start(endpoint: string, tokenPath?: string, extra: { platform?: NodeJS.Platform; probeTimeoutMs?: number; log?: Logger } = {}): Promise<RpcServerHandle> {
  const log = extra.log ?? captureLogger().log;
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

async function listenHttp(endpoint: string, handler: RequestListener): Promise<HttpServer> {
  const s = createHttpServer(handler);
  await listenOn(s, endpoint);
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        s.closeAllConnections();
        s.close(() => r());
      }),
  );
  return s;
}

/** Child process that listens on `endpoint` (like a daemon) and is then killed hard. */
async function crashListener(endpoint: string): Promise<void> {
  const child = spawn(process.execPath, ['-e', "require('net').createServer().listen(process.argv[1], () => console.log('ready'))", endpoint], {
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  await new Promise<void>((resolve, reject) => {
    child.stdout!.once('data', () => resolve());
    child.once('error', reject);
    child.once('exit', (code) => reject(new Error(`listener exited early (code ${code})`)));
  });
  child.kill('SIGKILL');
  await exited;
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
    const endpoint = uniqueEndpoint();
    await listenHttp(endpoint, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('hello');
    });
    const dir = tmp();
    const tokenPath = join(dir, 'daemon.token');
    writeToken({ token: tokenPath }, generateToken());
    const err = await expectNovaError(start(endpoint, tokenPath), 'DAEMON_UNAVAILABLE');
    expect(err.message).toContain('fremden Programm');
    // the foreign program keeps its endpoint (socket file / pipe) and still answers
    if (!isWindows) expect(existsSync(endpoint)).toBe(true);
    expect((await rawRequest({ endpoint })).body).toBe('hello');
  });

  it('throws DAEMON_UNAVAILABLE when a silent program holds the endpoint (probe timeout)', async () => {
    const endpoint = uniqueEndpoint();
    const sockets: Array<{ destroy(): void }> = [];
    const silent: NetServer = createNetServer((socket) => {
      sockets.push(socket);
      socket.on('error', () => {});
    });
    await listenOn(silent, endpoint);
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

  it('starts after a crashed daemon (POSIX: removes its stale socket file; Windows: the pipe is already released)', async () => {
    const endpoint = uniqueEndpoint();
    await crashListener(endpoint);
    // A killed process leaves its unix socket FILE behind; Windows removes a pipe together with its last handle.
    if (!isWindows) expect(existsSync(endpoint)).toBe(true);
    const { log, entries } = captureLogger();
    const server = await start(endpoint, undefined, { log });
    expect(server.endpoint).toBe(endpoint);
    expect(entries.some((e) => e.msg.startsWith('Verwaisten Kommunikationskanal'))).toBe(!isWindows);
    expect((await probeDaemon(endpoint, join(tmp(), 'missing.token'), 300)).status).toBe('foreign');
  });

  it('never deletes a regular file at the endpoint path', async () => {
    const dir = tmp();
    const endpoint = join(dir, 'd.sock');
    writeFileSync(endpoint, 'user data');
    const err = await expectNovaError(start(endpoint), 'DAEMON_UNAVAILABLE');
    // POSIX: a file that is no socket is reported, not removed. Windows: a file path is never an endpoint at all.
    expect(err.message).toBe(isWindows ? SERVER_MESSAGES.notAPipe : SERVER_MESSAGES.notASocket);
    expect(readFileSync(endpoint, 'utf8')).toBe('user data');
  });

  it.runIf(isWindows)('on a real pipe held by a program that drops every connection: retries once, never unlinks, reports DAEMON_UNAVAILABLE', async () => {
    const endpoint = uniqueEndpoint();
    const holder = createNetServer();
    holder.maxConnections = 0; // accepts and closes at once: the probe sees "nothing answers"
    let drops = 0;
    holder.on('drop', () => drops++);
    await listenOn(holder, endpoint);
    cleanups.push(() => new Promise<void>((r) => holder.close(() => r())));
    const { log, entries } = captureLogger();
    const err = await expectNovaError(start(endpoint, undefined, { log }), 'DAEMON_UNAVAILABLE');
    expect(err.message).toBe(SERVER_MESSAGES.foreign);
    expect(err.details).toMatchObject({ code: 'EADDRINUSE' });
    expect(drops).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.msg.startsWith('Verwaisten Kommunikationskanal'))).toBe(false);
    expect(holder.listening).toBe(true);
  });

  it('rejects unix socket paths that are too long', async () => {
    // The check runs before any I/O, so the injected platform makes this deterministic on every host.
    const err = await expectNovaError(start(join(tmpdir(), 'x'.repeat(120) + '.sock'), undefined, { platform: 'linux' }), 'DAEMON_UNAVAILABLE');
    expect(err.message).toBe(SERVER_MESSAGES.pathTooLong);
  });

  it('on Windows accepts only named pipes of at most 256 characters (checked before any I/O)', async () => {
    const tooLong = `\\\\.\\pipe\\${'p'.repeat(248)}`;
    expect(tooLong).toHaveLength(257);
    expect((await expectNovaError(start(tooLong, undefined, { platform: 'win32' }), 'DAEMON_UNAVAILABLE')).message).toBe(SERVER_MESSAGES.pipeNameTooLong);
    for (const bad of [join(tmpdir(), 'nv-x.sock'), 'C:\\Users\\a\\daemon.sock', '\\\\server\\pipe\\nova', '\\\\.\\pipe\\', '\\\\.\\pipes\\nova', 'nova-ai-daemon']) {
      expect((await expectNovaError(start(bad, undefined, { platform: 'win32' }), 'DAEMON_UNAVAILABLE')).message).toBe(SERVER_MESSAGES.notAPipe);
    }
    for (const ok of [`\\\\.\\pipe\\${'p'.repeat(247)}`, '\\\\.\\pipe\\nova-ai-daemon-0123456789abcdef01234567', '\\\\?\\pipe\\nova', '\\\\.\\PIPE\\Nova']) {
      expect(() => checkEndpoint(ok, 'win32')).not.toThrow();
    }
    expect(() => checkEndpoint('/run/user/1000/nova/daemon.sock', 'linux')).not.toThrow();
  });
});

/** Fake side effects for bindEndpoint: listen results in order, a fixed probe answer, recorded calls. */
function fakeBind(o: { listen: Array<string | null>; probe?: Partial<DetailedProbe>; lstat?: 'socket' | 'file' | 'missing' }) {
  const calls: string[] = [];
  const listenResults = [...o.listen];
  const deps: BindDeps = {
    listen: async (endpoint) => {
      calls.push(`listen ${endpoint}`);
      const code = listenResults.shift();
      if (code === undefined) throw new Error('unexpected listen');
      if (code !== null) throw Object.assign(new Error(`listen ${code}: ${endpoint}`), { code });
    },
    probe: async (endpoint, tokenPath, timeoutMs) => {
      calls.push(`probe ${endpoint} ${tokenPath} ${timeoutMs}`);
      return { status: 'none', health: null, unverifiedNova: false, detail: 'Verbindung abgelehnt', handshake: 'none', ...o.probe };
    },
    lstat: (path) => {
      calls.push(`lstat ${path}`);
      if (o.lstat === 'missing') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      return { isSocket: () => o.lstat !== 'file' };
    },
    unlink: (path) => {
      calls.push(`unlink ${path}`);
    },
    sleep: async (ms) => {
      calls.push(`sleep ${ms}`);
    },
  };
  return { deps, calls };
}

const health = { pid: 4711, version: '1.2.3', instanceId: 'inst_live' };
const PIPE = '\\\\.\\pipe\\nova-ai-daemon-0123456789abcdef01234567';
const SOCK = '/home/u/.local/share/nova-ai/daemon.sock';

describe('bindEndpoint (injected platform: both branches run on every host)', () => {
  const request = (platform: NodeJS.Platform, tokenPath: string | null = '/data/daemon.token') => {
    const { log, entries } = captureLogger();
    return { req: { endpoint: platform === 'win32' ? PIPE : SOCK, tokenPath, platform, probeTimeoutMs: 700, log }, entries };
  };

  it('binds at once when the endpoint is free (no probe)', async () => {
    for (const platform of ['win32', 'linux'] as const) {
      const { req } = request(platform);
      const f = fakeBind({ listen: [null] });
      await bindEndpoint(req, f.deps);
      expect(f.calls).toEqual([`listen ${req.endpoint}`]);
    }
  });

  it('reports other listen errors (e.g. EACCES for a pipe name Windows rejects) without probing', async () => {
    for (const platform of ['win32', 'linux'] as const) {
      const { req } = request(platform);
      const f = fakeBind({ listen: ['EACCES'] });
      const err = await expectNovaError(bindEndpoint(req, f.deps), 'DAEMON_UNAVAILABLE');
      expect(err.message).toBe(SERVER_MESSAGES.cannotListen);
      expect(err.details).toMatchObject({ endpoint: req.endpoint, code: 'EACCES' });
      expect(f.calls).toEqual([`listen ${req.endpoint}`]);
    }
  });

  it('throws CONFLICT for a NOVA daemon that proves the token (both platforms, nothing removed)', async () => {
    for (const platform of ['win32', 'linux'] as const) {
      const { req } = request(platform);
      const f = fakeBind({ listen: ['EADDRINUSE'], probe: { status: 'ours', health, handshake: 'ok' } });
      const err = await expectNovaError(bindEndpoint(req, f.deps), 'CONFLICT');
      expect(err.message).toBe(SERVER_MESSAGES.alreadyRunning);
      expect(err.details).toEqual({ endpoint: req.endpoint, pid: 4711, instanceId: 'inst_live', version: '1.2.3' });
      expect(f.calls).toEqual([`listen ${req.endpoint}`, `probe ${req.endpoint} /data/daemon.token 700`]);
    }
  });

  it('counts an unverifiable NOVA answer as CONFLICT only without tokenPath', async () => {
    const without = request('win32', null);
    const f1 = fakeBind({ listen: ['EADDRINUSE'], probe: { status: 'foreign', health, unverifiedNova: true, handshake: 'unverified' } });
    expect((await expectNovaError(bindEndpoint(without.req, f1.deps), 'CONFLICT')).details).toMatchObject({ pid: 4711 });
    const withToken = request('win32');
    const f2 = fakeBind({ listen: ['EADDRINUSE'], probe: { status: 'foreign', health, unverifiedNova: true, handshake: 'unverified' } });
    expect((await expectNovaError(bindEndpoint(withToken.req, f2.deps), 'DAEMON_UNAVAILABLE')).message).toBe(SERVER_MESSAGES.foreign);
  });

  it('reports a foreign program without touching the endpoint', async () => {
    for (const platform of ['win32', 'linux'] as const) {
      const { req } = request(platform);
      const f = fakeBind({ listen: ['EADDRINUSE'], probe: { status: 'foreign', detail: 'HTTP 401', handshake: 'foreign' } });
      const err = await expectNovaError(bindEndpoint(req, f.deps), 'DAEMON_UNAVAILABLE');
      expect(err.message).toBe(SERVER_MESSAGES.foreign);
      expect(err.details).toEqual({ endpoint: req.endpoint, detail: 'HTTP 401' });
      expect(f.calls).toHaveLength(2);
    }
  });

  it('on Windows (pipes) never unlinks: retries once after a pause and reports DAEMON_UNAVAILABLE', async () => {
    const { req, entries } = request('win32');
    const f = fakeBind({ listen: ['EADDRINUSE', 'EADDRINUSE'], lstat: 'socket' });
    const err = await expectNovaError(bindEndpoint(req, f.deps), 'DAEMON_UNAVAILABLE');
    expect(err.message).toBe(SERVER_MESSAGES.foreign);
    expect(err.details).toMatchObject({ endpoint: PIPE, code: 'EADDRINUSE' });
    expect(f.calls).toEqual([`listen ${PIPE}`, `probe ${PIPE} /data/daemon.token 700`, 'sleep 300', `listen ${PIPE}`]);
    expect(entries.some((e) => e.msg.startsWith('Verwaisten Kommunikationskanal'))).toBe(false);
  });

  it('on Windows binds on the retry when the pipe of an exiting daemon has disappeared meanwhile', async () => {
    const { req } = request('win32');
    const f = fakeBind({ listen: ['EADDRINUSE', null], probe: { status: 'none', detail: 'Verbindung vor der Antwort geschlossen', handshake: 'closed' } });
    await bindEndpoint(req, f.deps);
    expect(f.calls).toEqual([`listen ${PIPE}`, `probe ${PIPE} /data/daemon.token 700`, 'sleep 300', `listen ${PIPE}`]);
  });

  it('on Windows reports other errors of the retry as "cannot listen"', async () => {
    const { req } = request('win32');
    const f = fakeBind({ listen: ['EADDRINUSE', 'EPERM'] });
    const err = await expectNovaError(bindEndpoint(req, f.deps), 'DAEMON_UNAVAILABLE');
    expect(err.message).toBe(SERVER_MESSAGES.cannotListen);
    expect(err.details).toMatchObject({ code: 'EPERM' });
  });

  it('under the Windows rules a real endpoint held by a program that drops every connection is never unlinked', async () => {
    // Real I/O on the host's own endpoint kind (pipe on Windows, unix socket elsewhere); only the rules are Windows'.
    const endpoint = uniqueEndpoint();
    const holder = createNetServer();
    holder.maxConnections = 0; // accepts and closes at once: the probe sees "nothing answers"
    let drops = 0;
    holder.on('drop', () => drops++);
    await listenOn(holder, endpoint);
    cleanups.push(() => new Promise<void>((r) => holder.close(() => r())));
    const contender = createNetServer();
    const unlinked: string[] = [];
    const slept: number[] = [];
    const { log } = captureLogger();
    const err = await expectNovaError(
      bindEndpoint(
        { endpoint, tokenPath: null, platform: 'win32', probeTimeoutMs: 500, log },
        {
          listen: (ep) => listenOn(contender, ep),
          probe: probeEndpoint,
          lstat: lstatSync,
          unlink: (path) => unlinked.push(path),
          sleep: (ms) => {
            slept.push(ms);
            return new Promise<void>((r) => setTimeout(r, ms));
          },
        },
      ),
      'DAEMON_UNAVAILABLE',
    );
    expect(err.message).toBe(SERVER_MESSAGES.foreign);
    expect(err.details).toMatchObject({ code: 'EADDRINUSE' });
    expect(drops).toBeGreaterThanOrEqual(1);
    expect(slept).toEqual([300]);
    expect(unlinked).toEqual([]);
    expect(contender.listening).toBe(false);
    expect(holder.listening).toBe(true);
    if (!isWindows) expect(existsSync(endpoint)).toBe(true);
  });

  it('on POSIX removes a stale socket file once and binds again (no pause)', async () => {
    const { req, entries } = request('linux');
    const f = fakeBind({ listen: ['EADDRINUSE', null], lstat: 'socket' });
    await bindEndpoint(req, f.deps);
    expect(f.calls).toEqual([`listen ${SOCK}`, `probe ${SOCK} /data/daemon.token 700`, `lstat ${SOCK}`, `unlink ${SOCK}`, `listen ${SOCK}`]);
    expect(entries.some((e) => e.level === 'warn' && e.msg.startsWith('Verwaisten Kommunikationskanal'))).toBe(true);
  });

  it('on POSIX never removes a file that is not a socket', async () => {
    const { req } = request('linux');
    const f = fakeBind({ listen: ['EADDRINUSE'], lstat: 'file' });
    expect((await expectNovaError(bindEndpoint(req, f.deps), 'DAEMON_UNAVAILABLE')).message).toBe(SERVER_MESSAGES.notASocket);
    expect(f.calls.some((c) => c.startsWith('unlink'))).toBe(false);
  });

  it('on POSIX reports a socket that is still busy after the cleanup as foreign', async () => {
    const { req } = request('linux');
    const f = fakeBind({ listen: ['EADDRINUSE', 'EADDRINUSE'], lstat: 'missing' });
    expect((await expectNovaError(bindEndpoint(req, f.deps), 'DAEMON_UNAVAILABLE')).message).toBe(SERVER_MESSAGES.foreign);
  });
});

describe('probeDaemon', () => {
  it("reports 'none' when nothing listens", async () => {
    const r = await probeDaemon(uniqueEndpoint(), join(tmp(), 'daemon.token'), 300);
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
    const endpoint = uniqueEndpoint();
    await listenHttp(endpoint, (_req, res) => {
      res.writeHead(401);
      res.end();
    });
    expect((await probeDaemon(endpoint, ts.tokenPath, 500)).status).toBe('foreign');
  });
});
