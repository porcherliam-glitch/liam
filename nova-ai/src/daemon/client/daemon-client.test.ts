// Tests for DaemonClient against the real RPC server (unix sockets) and small stub servers:
// typed RPC, error mapping, proof verification before the token is sent, 401 → token re-read, timeouts,
// SSE subscribe with reconnect after a daemon restart with a NEW token, idle watchdog, close().
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnyNovaEvent } from '@shared/events';
import type { RpcResult } from '@shared/rpc';
import { DaemonClient, DaemonRpcError, rpcTimeoutFor, DEFAULT_RPC_TIMEOUT_MS, LONG_RPC_TIMEOUT_MS, isLongRpcMethod } from './index';
import { CLIENT_MESSAGES } from './errors';
import { computeProof } from './proof';
import { NovaError } from '../core/errors';
import { generateToken, writeToken } from '../server/token';
import { shortSocketPath, startTestServer, waitUntil, type TestServer } from '../server/test-helpers';

const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c();
});

async function server(opts: Parameters<typeof startTestServer>[0] = {}): Promise<TestServer> {
  const ts = await startTestServer(opts);
  cleanups.push(() => ts.cleanup());
  return ts;
}

function client(opts: ConstructorParameters<typeof DaemonClient>[0]): DaemonClient {
  const c = new DaemonClient(opts);
  cleanups.push(() => c.close());
  return c;
}

async function rejection(p: Promise<unknown>): Promise<DaemonRpcError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(DaemonRpcError);
    return e as DaemonRpcError;
  }
  throw new Error('expected a DaemonRpcError');
}

interface SeenRequest {
  method: string;
  url: string;
  auth: string | undefined;
}

/** Stub daemon: /health answers with a proof computed by `proofToken()`, /rpc via `onRpc`. Records every request. */
async function stub(proofToken: () => string, onRpc: (auth: string | undefined, body: { id: string }) => { status: number; body: unknown }) {
  const endpoint = shortSocketPath();
  const seen: SeenRequest[] = [];
  const srv: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      seen.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization });
      let status = 200;
      let body: unknown;
      if (req.url === '/health') {
        body = { ok: true, pid: 4242, version: 'stub', instanceId: 'inst_stub', proof: computeProof(proofToken(), String(req.headers['x-nova-nonce'])) };
      } else {
        const out = onRpc(req.headers.authorization, JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        status = out.status;
        body = out.body;
      }
      const json = JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(json)) });
      res.end(json);
    });
  });
  await new Promise<void>((r) => srv.listen(endpoint, () => r()));
  cleanups.push(
    () =>
      new Promise<void>((r) => {
        srv.closeAllConnections();
        srv.close(() => r());
      }),
  );
  return { endpoint, seen };
}

function tempTokenFile(token?: string): { path: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'nv-cli-'));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'daemon.token');
  if (token) writeToken({ token: path }, token);
  return { path, dir };
}

describe('DaemonClient.rpc', () => {
  it('performs typed calls and reuses verified keep-alive connections', async () => {
    const ts = await server();
    const c = client({ endpoint: ts.endpoint, tokenPath: ts.tokenPath });
    const logs: RpcResult<'daemon.logs'> = await c.rpc('daemon.logs', { limit: 2 });
    expect(logs[0].msg).toBe('limit=2');
    const defaults = await c.rpc('daemon.logs');
    expect(defaults[0].msg).toBe('limit=500');
    const parallel = await Promise.all(Array.from({ length: 20 }, (_, i) => c.rpc('daemon.logs', { limit: i + 1 })));
    expect(parallel.map((r) => r[0].msg)).toEqual(Array.from({ length: 20 }, (_, i) => `limit=${i + 1}`));
    // Compile-time contract checks (never executed).
    // @ts-expect-error limit must be a number
    void (() => c.rpc('daemon.logs', { limit: 'x' }));
    // @ts-expect-error unknown method
    void (() => c.rpc('does.not.exist'));
  });

  it('throws DaemonRpcError with the daemon code, message and details', async () => {
    const ts = await server({
      register: (r) =>
        r.register('tasks.delete', () => {
          throw new NovaError('CONFLICT', 'Andere Aufgaben hängen von dieser Aufgabe ab.', { details: { dependents: ['t2'] } });
        }),
    });
    const c = client({ endpoint: ts.endpoint, token: ts.token });
    const err = await rejection(c.rpc('tasks.delete', { id: 't1' }));
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Andere Aufgaben hängen von dieser Aufgabe ab.');
    expect(err.details).toEqual({ dependents: ['t2'] });
    expect(err.reason).toBeNull();
    expect(err.toJSON()).toEqual({ code: 'CONFLICT', message: 'Andere Aufgaben hängen von dieser Aufgabe ab.', details: { dependents: ['t2'] } });
    const validation = await rejection(c.rpc('tasks.delete', { id: 5 as unknown as string }));
    expect(validation.code).toBe('VALIDATION');
  });

  it('fails with DAEMON_UNAVAILABLE when nothing listens, and with token_missing without token file', async () => {
    const tf = tempTokenFile(generateToken());
    const c = client({ endpoint: shortSocketPath(), tokenPath: tf.path });
    const err = await rejection(c.rpc('daemon.logs'));
    expect(err.code).toBe('DAEMON_UNAVAILABLE');
    expect(err.reason).toBe('unreachable');
    expect(err.message).toBe('Der Hintergrunddienst ist nicht erreichbar.');
    const health = await rejection(client({ endpoint: shortSocketPath(), tokenPath: join(tf.dir, 'none') }).health());
    expect(health.reason).toBe('unreachable');
    const ts = await server();
    const noToken = client({ endpoint: ts.endpoint, tokenPath: join(tf.dir, 'none') });
    const missing = await rejection(noToken.rpc('daemon.logs'));
    expect(missing.reason).toBe('token_missing');
  });

  it('never sends the token to an endpoint that cannot prove it (DAEMON_UNAVAILABLE)', async () => {
    const realToken = generateToken();
    const s = await stub(() => generateToken(), () => ({ status: 200, body: {} }));
    const c = client({ endpoint: s.endpoint, token: realToken });
    const err = await rejection(c.rpc('daemon.logs'));
    expect(err.code).toBe('DAEMON_UNAVAILABLE');
    expect(err.reason).toBe('foreign');
    expect(err.message).toBe('Der Kommunikationskanal wird von einem fremden Programm belegt. Bitte den PC neu starten.');
    expect(s.seen.length).toBeGreaterThan(0);
    expect(s.seen.every((r) => r.url === '/health' && r.auth === undefined)).toBe(true);
    const health = await rejection(c.health());
    expect(health.reason).toBe('foreign');
  });

  it('re-reads the token file after a proof mismatch (daemon restarted with a new token)', async () => {
    const ts = await server();
    const tf = tempTokenFile(generateToken()); // stale token of an earlier daemon
    const c = client({ endpoint: ts.endpoint, tokenPath: tf.path });
    setTimeout(() => writeFileSync(tf.path, ts.token), 100);
    const logs = await c.rpc('daemon.logs', { limit: 1 });
    expect(logs).toHaveLength(1);
  });

  it('re-reads the token after a 401 and retries once', async () => {
    const tf = tempTokenFile();
    const t1 = generateToken();
    const t2 = generateToken();
    writeFileSync(tf.path, t1);
    const s = await stub(
      () => readFileSync(tf.path, 'utf8').trim(),
      (auth, body) => {
        if (auth === `Bearer ${t2}`) return { status: 200, body: { id: body.id, ok: true, result: [] } };
        writeFileSync(tf.path, t2); // the daemon rotated its token
        return { status: 401, body: { id: '', ok: false, error: { code: 'UNAUTHORIZED', message: 'nein' } } };
      },
    );
    const c = client({ endpoint: s.endpoint, tokenPath: tf.path });
    expect(await c.rpc('daemon.logs')).toEqual([]);
    expect(s.seen.filter((r) => r.url === '/rpc').map((r) => r.auth)).toEqual([`Bearer ${t1}`, `Bearer ${t2}`]);
  });

  it('gives up with UNAUTHORIZED when the token keeps being rejected', async () => {
    const token = generateToken();
    const s = await stub(
      () => token,
      () => ({ status: 401, body: { id: '', ok: false, error: { code: 'UNAUTHORIZED', message: 'nein' } } }),
    );
    const fixed = client({ endpoint: s.endpoint, token });
    const err = await rejection(fixed.rpc('daemon.logs'));
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe(CLIENT_MESSAGES.unauthorized);
    expect(s.seen.filter((r) => r.url === '/rpc')).toHaveLength(1);
    const tf = tempTokenFile(token);
    const withFile = client({ endpoint: s.endpoint, tokenPath: tf.path });
    expect((await rejection(withFile.rpc('daemon.logs'))).reason).toBe('unauthorized');
    expect(s.seen.filter((r) => r.url === '/rpc')).toHaveLength(3);
  });

  it('retries once when a reused keep-alive socket is reset before the answer', async () => {
    const token = generateToken();
    const endpoint = shortSocketPath();
    let resets = 0;
    let rpcCalls = 0;
    const perSocket = new WeakMap<object, number>();
    const srv: Server = createServer((req, res) => {
      const n = (perSocket.get(req.socket) ?? 0) + 1;
      perSocket.set(req.socket, n);
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        if (req.url === '/health') {
          const json = JSON.stringify({ ok: true, pid: 1, version: 'stub', instanceId: 'inst_stub', proof: computeProof(token, String(req.headers['x-nova-nonce'])) });
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(json)) });
          res.end(json);
          return;
        }
        // Third request on one connection (health, rpc, rpc): close it like an idle-timeout race would.
        if (n === 3 && resets === 0) {
          resets++;
          req.socket.destroy();
          return;
        }
        rpcCalls++;
        const { id } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id: string };
        const json = JSON.stringify({ id, ok: true, result: [] });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(json)) });
        res.end(json);
      });
    });
    await new Promise<void>((r) => srv.listen(endpoint, () => r()));
    cleanups.push(
      () =>
        new Promise<void>((r) => {
          srv.closeAllConnections();
          srv.close(() => r());
        }),
    );
    const c = client({ endpoint, token });
    expect(await c.rpc('daemon.logs')).toEqual([]);
    expect(await c.rpc('daemon.logs')).toEqual([]);
    expect(resets).toBe(1);
    expect(rpcCalls).toBe(2);
  });

  it('rejects answers that do not belong to the request', async () => {
    const token = generateToken();
    const s = await stub(
      () => token,
      () => ({ status: 200, body: { id: 'other', ok: true, result: [] } }),
    );
    const err = await rejection(client({ endpoint: s.endpoint, token }).rpc('daemon.logs'));
    expect(err.reason).toBe('bad_response');
  });

  it('times out with a German message and keeps working afterwards', async () => {
    const ts = await server({
      register: (r) =>
        r.register('tasks.list', async () => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          return [];
        }),
    });
    const c = client({ endpoint: ts.endpoint, tokenPath: ts.tokenPath });
    const err = await rejection(c.rpc('tasks.list', {}, { timeoutMs: 80 }));
    expect(err.code).toBe('DAEMON_UNAVAILABLE');
    expect(err.reason).toBe('timeout');
    expect(err.message).toBe('Der Hintergrunddienst hat nicht innerhalb von einer Sekunde geantwortet. Die Aktion läuft möglicherweise im Hintergrund weiter.');
    expect(await c.rpc('daemon.logs', { limit: 1 })).toHaveLength(1);
  });

  it('refuses requests above 25 MB locally', async () => {
    const c = client({ endpoint: shortSocketPath(), token: generateToken() });
    const err = await rejection(c.rpc('memory.add', { projectId: null, kind: 'insight', title: 't', content: 'x'.repeat(26 * 1024 * 1024) }));
    expect(err.code).toBe('VALIDATION');
    expect(err.reason).toBe('too_large');
  });

  it('uses 120 s by default and 30 min for long methods', () => {
    expect(DEFAULT_RPC_TIMEOUT_MS).toBe(120_000);
    expect(LONG_RPC_TIMEOUT_MS).toBe(1_800_000);
    for (const m of ['projects.create', 'backup.create', 'backup.restore', 'data.export', 'data.import', 'memory.export', 'memory.import', 'checkpoints.restore', 'integrations.install']) {
      expect(isLongRpcMethod(m)).toBe(true);
      expect(rpcTimeoutFor(m)).toBe(1_800_000);
    }
    expect(rpcTimeoutFor('tasks.list')).toBe(120_000);
    expect(rpcTimeoutFor('checkpoints.preview')).toBe(120_000);
    expect(rpcTimeoutFor('tasks.list', 5_000)).toBe(5_000);
    expect(rpcTimeoutFor('backup.list', 5_000)).toBe(1_800_000);
  });

  it('requires an endpoint and a token source', () => {
    expect(() => new DaemonClient({ endpoint: '/x.sock' })).toThrow(DaemonRpcError);
    expect(() => new DaemonClient({ endpoint: '', token: 'abc' })).toThrow(DaemonRpcError);
  });
});

describe('DaemonClient.health', () => {
  it('returns pid, version and instance id after verifying the proof', async () => {
    const ts = await server({ instanceId: 'inst_health' });
    const health = await client({ endpoint: ts.endpoint, tokenPath: ts.tokenPath }).health();
    expect(health).toEqual({ ok: true, pid: process.pid, version: '9.9.9-test', instanceId: 'inst_health' });
  });
});

describe('DaemonClient.subscribe', () => {
  it('delivers events, applies the type filter and reports state changes', async () => {
    const ts = await server();
    const c = client({ endpoint: ts.endpoint, tokenPath: ts.tokenPath });
    const all: AnyNovaEvent[] = [];
    const filtered: AnyNovaEvent[] = [];
    const states: string[] = [];
    const unsub = c.subscribe((e) => all.push(e), (s) => states.push(s));
    c.subscribe((e) => filtered.push(e), undefined, { types: ['task.removed'] });
    await waitUntil(() => ts.server.stats().sseClients === 2);
    ts.bus.emit('project.removed', { id: 'p1' });
    ts.bus.emit('task.removed', { id: 't1', projectId: 'p1' });
    await waitUntil(() => all.length === 2 && filtered.length === 1);
    expect(all.map((e) => e.type)).toEqual(['project.removed', 'task.removed']);
    expect(filtered[0]).toMatchObject({ type: 'task.removed', payload: { id: 't1' } });
    expect(states).toEqual(['connected']);
    unsub();
    expect(states).toEqual(['connected', 'closed']);
    await waitUntil(() => ts.server.stats().sseClients === 1);
  });

  it('reconnects after a daemon restart with a NEW token and keeps RPC working', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nv-rs-'));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const endpoint = shortSocketPath();
    const first = await startTestServer({ endpoint, dir, instanceId: 'inst_first' });
    const c = client({ endpoint, tokenPath: first.tokenPath });
    const events: AnyNovaEvent[] = [];
    const states: Array<[string, string | undefined]> = [];
    c.subscribe((e) => events.push(e), (s, info) => states.push([s, info]));
    await waitUntil(() => first.server.stats().sseClients === 1);
    expect((await c.health()).instanceId).toBe('inst_first');
    first.bus.emit('project.removed', { id: 'from-first' });
    await waitUntil(() => events.length === 1);

    await first.server.close();
    await waitUntil(() => states.some(([s]) => s === 'reconnecting'));
    const second = await startTestServer({ endpoint, dir, instanceId: 'inst_second' });
    cleanups.push(() => second.cleanup());
    expect(second.token).not.toBe(first.token);
    await waitUntil(() => second.server.stats().sseClients === 1, 4000);
    expect(states.filter(([s]) => s === 'connected')).toHaveLength(2);
    second.bus.emit('project.removed', { id: 'from-second' });
    await waitUntil(() => events.length === 2);
    expect(events[1]).toMatchObject({ payload: { id: 'from-second' } });
    expect(await c.rpc('daemon.logs', { limit: 1 })).toHaveLength(1);
    expect((await c.health()).instanceId).toBe('inst_second');
  });

  it('reports a foreign endpoint while reconnecting and never subscribes there', async () => {
    const realToken = generateToken();
    const s = await stub(() => generateToken(), () => ({ status: 200, body: {} }));
    const c = client({ endpoint: s.endpoint, token: realToken, reconnect: { minMs: 20, maxMs: 40 } });
    const states: Array<[string, string | undefined]> = [];
    c.subscribe(() => {}, (st, info) => states.push([st, info]));
    await waitUntil(() => states.filter(([st]) => st === 'reconnecting').length >= 2);
    expect(states[0]).toEqual(['reconnecting', CLIENT_MESSAGES.foreign]);
    expect(s.seen.some((r) => r.url.startsWith('/events'))).toBe(false);
  });

  it('treats a silent stream as lost (idle watchdog) and reconnects', async () => {
    const ts = await server();
    const c = client({ endpoint: ts.endpoint, tokenPath: ts.tokenPath, sseIdleTimeoutMs: 150, reconnect: { minMs: 20, maxMs: 40 } });
    const states: Array<[string, string | undefined]> = [];
    c.subscribe(() => {}, (s, info) => states.push([s, info]));
    await waitUntil(() => states.filter(([s]) => s === 'connected').length >= 2, 3000);
    expect(states).toContainEqual(['reconnecting', CLIENT_MESSAGES.notResponding]);
  });

  it('close() ends subscriptions and rejects later calls', async () => {
    const ts = await server();
    const c = new DaemonClient({ endpoint: ts.endpoint, tokenPath: ts.tokenPath });
    const states: string[] = [];
    c.subscribe(() => {}, (s) => states.push(s));
    await waitUntil(() => states.includes('connected'));
    c.close();
    expect(states).toEqual(['connected', 'closed']);
    expect((await rejection(c.rpc('daemon.logs'))).reason).toBe('closed');
    await expect(c.health()).rejects.toMatchObject({ reason: 'closed' });
    const late: string[] = [];
    c.subscribe(() => {}, (s) => late.push(s));
    expect(late).toEqual(['closed']);
    await waitUntil(() => ts.server.stats().sseClients === 0);
  });
});
