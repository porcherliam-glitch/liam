// Tests for the RPC HTTP server: health/proof, auth (401/403), routing, JSON handling, body limit, close().
import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { connect } from 'node:net';
import { existsSync, statSync } from 'node:fs';
import { computeProof, newNonce } from '../client/proof';
import { NovaError } from '../core/errors';
import { rawRequest, rpcBody, startTestServer, waitUntil, openRawSse, type TestServer } from './test-helpers';

let ts: TestServer | null = null;
afterEach(async () => {
  await ts?.cleanup();
  ts = null;
});

const json = { 'Content-Type': 'application/json' };

describe('GET /health', () => {
  it('answers a nonce without token and includes the HMAC proof', async () => {
    ts = await startTestServer();
    const nonce = newNonce();
    const res = await rawRequest({ endpoint: ts.endpoint, path: '/health', headers: { 'X-Nova-Nonce': nonce } });
    expect(res.status).toBe(200);
    expect(res.json()).toEqual({ ok: true, pid: process.pid, version: '9.9.9-test', instanceId: expect.any(String), proof: computeProof(ts.token, nonce) });
  });

  it('requires a token without nonce, accepts the token without proof, rejects malformed nonces', async () => {
    ts = await startTestServer();
    expect((await rawRequest({ endpoint: ts.endpoint, path: '/health' })).status).toBe(401);
    const authed = await rawRequest({ endpoint: ts.endpoint, path: '/health', headers: { Authorization: `Bearer ${ts.token}` } });
    expect(authed.status).toBe(200);
    expect(authed.json()).not.toHaveProperty('proof');
    expect((await rawRequest({ endpoint: ts.endpoint, path: '/health', headers: { 'X-Nova-Nonce': 'xyz' } })).status).toBe(400);
    expect((await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/health', headers: { 'X-Nova-Nonce': newNonce() } })).status).toBe(405);
  });

  it('sets the unix socket to mode 0600', async () => {
    ts = await startTestServer();
    expect(statSync(ts.endpoint).mode & 0o777).toBe(0o600);
  });
});

describe('auth', () => {
  it('returns 401 without or with a wrong token (also of different length) and keeps serving', async () => {
    ts = await startTestServer();
    const body = rpcBody('daemon.logs');
    const none = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: json, body });
    expect(none.status).toBe(401);
    expect(none.headers['www-authenticate']).toBe('Bearer');
    expect((none.json() as { error: { code: string } }).error.code).toBe('UNAUTHORIZED');
    const wrongSameLength = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: `Bearer ${'0'.repeat(64)}` }, body });
    expect(wrongSameLength.status).toBe(401);
    const wrongShort = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: 'Bearer abc' }, body });
    expect(wrongShort.status).toBe(401);
    const wrongLong = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: `Bearer ${ts.token}${ts.token}` }, body });
    expect(wrongLong.status).toBe(401);
    const basic = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: `Basic ${ts.token}` }, body });
    expect(basic.status).toBe(401);
    const ok = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: `Bearer ${ts.token}` }, body });
    expect(ok.status).toBe(200);
  });

  it('rejects any request with an Origin header with 403, even with a valid token', async () => {
    ts = await startTestServer();
    const res = await rawRequest({
      endpoint: ts.endpoint,
      method: 'POST',
      path: '/rpc',
      headers: { ...json, Authorization: `Bearer ${ts.token}`, Origin: 'http://evil.example' },
      body: rpcBody('daemon.logs'),
    });
    expect(res.status).toBe(403);
    expect((res.json() as { error: { message: string } }).error.message).toBe('Zugriffe aus einem Browser auf den Hintergrunddienst sind nicht erlaubt.');
    const health = await rawRequest({ endpoint: ts.endpoint, path: '/health', headers: { Origin: 'null', 'X-Nova-Nonce': newNonce() } });
    expect(health.status).toBe(403);
    const fetchMeta = await rawRequest({ endpoint: ts.endpoint, path: '/events', headers: { Authorization: `Bearer ${ts.token}`, 'Sec-Fetch-Site': 'cross-site' } });
    expect(fetchMeta.status).toBe(403);
  });
});

describe('routing and RPC', () => {
  const auth = () => ({ ...json, Authorization: `Bearer ${ts!.token}` });

  it('executes RPC calls through the router', async () => {
    ts = await startTestServer({
      register: (r) =>
        r.register('tasks.get', () => {
          throw new NovaError('NOT_FOUND', 'Aufgabe wurde nicht gefunden (t9).');
        }),
    });
    const ok = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: rpcBody('daemon.logs', { limit: 3 }, 'x1') });
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(ok.json()).toEqual({ id: 'x1', ok: true, result: [{ ts: 1, level: 'info', scope: 'test', msg: 'limit=3' }] });
    const err = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: rpcBody('tasks.get', { id: 't9' }, 'x2') });
    expect(err.status).toBe(200);
    expect(err.json()).toEqual({ id: 'x2', ok: false, error: { code: 'NOT_FOUND', message: 'Aufgabe wurde nicht gefunden (t9).' } });
    const missing = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: rpcBody('projects.list', undefined, 'x3') });
    expect((missing.json() as { error: { message: string } }).error.message).toBe('Diese Funktion ist in dieser Version nicht verfügbar.');
  });

  it('enforces the path/method whitelist, JSON content type and a valid envelope', async () => {
    ts = await startTestServer();
    expect((await rawRequest({ endpoint: ts.endpoint, path: '/other', headers: auth() })).status).toBe(404);
    expect((await rawRequest({ endpoint: ts.endpoint, path: '/other' })).status).toBe(401);
    expect((await rawRequest({ endpoint: ts.endpoint, path: '/rpc', headers: auth() })).status).toBe(405);
    expect((await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/events', headers: auth() })).status).toBe(405);
    const text = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { Authorization: `Bearer ${ts.token}`, 'Content-Type': 'text/plain' }, body: rpcBody('daemon.logs') });
    expect(text.status).toBe(415);
    const bad = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: '{ nope' });
    expect(bad.status).toBe(400);
    expect((bad.json() as { error: { message: string } }).error.message).toBe('Die Anfrage ist kein gültiges JSON.');
    const envelope = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: JSON.stringify([1, 2]) });
    expect(envelope.status).toBe(400);
    const noMethod = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: JSON.stringify({ id: 'a' }) });
    expect(noMethod.status).toBe(400);
    const charset = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...auth(), 'Content-Type': 'application/json; charset=utf-8' }, body: rpcBody('daemon.logs') });
    expect(charset.status).toBe(200);
  });

  it('answers 500 (not a crash) when a result cannot be serialised', async () => {
    ts = await startTestServer({ register: (r) => r.register('tasks.list', () => [{ big: BigInt(1) }] as never) });
    const res = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: rpcBody('tasks.list', undefined, 'b1') });
    expect(res.status).toBe(500);
    expect((res.json() as { id: string; error: { code: string } }).error.code).toBe('INTERNAL');
    expect((await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: rpcBody('daemon.logs') })).status).toBe(200);
  });
});

describe('body limit', () => {
  const auth = () => ({ ...json, Authorization: `Bearer ${ts!.token}` });

  it('answers 413 for a body above 25 MB with Content-Length', async () => {
    ts = await startTestServer();
    const big = Buffer.alloc(25 * 1024 * 1024 + 10, 0x20);
    const res = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: big });
    expect(res.status).toBe(413);
    expect((res.json() as { error: { message: string } }).error.message).toBe('Die Anfrage ist zu groß (höchstens 25 MB).');
  });

  it('answers 413 while streaming a chunked body above 25 MB and stays usable', async () => {
    ts = await startTestServer();
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ socketPath: ts!.endpoint, method: 'POST', path: '/rpc', headers: { ...auth(), 'Transfer-Encoding': 'chunked' }, agent: false }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      });
      req.on('error', reject);
      const chunk = Buffer.alloc(1024 * 1024, 0x20);
      let sent = 0;
      const pump = () => {
        while (sent < 27) {
          sent++;
          if (!req.write(chunk)) {
            req.once('drain', pump);
            return;
          }
        }
        req.end();
      };
      pump();
    });
    expect(status).toBe(413);
    expect((await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: auth(), body: rpcBody('daemon.logs') })).status).toBe(200);
  });

  it('destroys the connection when a rejected client keeps sending (drain cap and drain timeout)', async () => {
    ts = await startTestServer({ limits: { maxBodyBytes: 1024, oversizeDrainBytes: 8 * 1024, oversizeDrainMs: 150 } });
    const run = (endless: boolean) =>
      new Promise<{ status: number | null; destroyed: boolean }>((resolve) => {
        let status: number | null = null;
        const socket = connect({ path: ts!.endpoint });
        socket.on('error', () => {});
        socket.on('data', (d: Buffer) => {
          const m = /^HTTP\/1\.1 (\d{3})/.exec(d.toString('latin1'));
          if (m) status = Number(m[1]);
        });
        socket.on('close', () => {
          clearInterval(timer);
          resolve({ status, destroyed: true });
        });
        socket.write(`POST /rpc HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ${ts!.token}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`);
        const chunk = Buffer.alloc(2048, 0x20);
        // endless = keeps sending fast (hits the byte cap); otherwise trickles slowly (hits the time cap)
        const timer = setInterval(() => {
          if (socket.destroyed) return;
          const data = endless ? Buffer.concat([chunk, chunk, chunk, chunk]) : chunk.subarray(0, 600);
          socket.write(`${data.length.toString(16)}\r\n`);
          socket.write(data);
          socket.write('\r\n');
        }, endless ? 2 : 40);
      });
    const fast = await run(true);
    expect(fast).toEqual({ status: 413, destroyed: true });
    const slow = await run(false);
    expect(slow).toEqual({ status: 413, destroyed: true });
  });

  it('accepts a body just below the limit', async () => {
    ts = await startTestServer({ register: (r) => r.register('memory.add', (p) => ({ ...p, id: 'm' }) as never) });
    const content = 'x'.repeat(19_000);
    const res = await rawRequest({
      endpoint: ts.endpoint,
      method: 'POST',
      path: '/rpc',
      headers: auth(),
      body: rpcBody('memory.add', { projectId: null, kind: 'insight', title: 't', content }),
    });
    expect(res.status).toBe(200);
  });
});

describe('timeouts and close()', () => {
  it('keeps long RPC handlers and SSE streams alive beyond requestTimeout', async () => {
    ts = await startTestServer({
      limits: { requestTimeoutMs: 150, headersTimeoutMs: 100, connectionsCheckingIntervalMs: 25 },
      register: (r) =>
        r.register('tasks.list', async () => {
          await new Promise((resolve) => setTimeout(resolve, 400));
          return [];
        }),
    });
    const sse = await openRawSse(ts.endpoint, ts.token);
    const res = await rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: `Bearer ${ts.token}` }, body: rpcBody('tasks.list') });
    expect(res.status).toBe(200);
    expect(sse.ended).toBe(false);
    sse.close();
  });

  it('drops a connection that never finishes its headers (headersTimeout)', async () => {
    ts = await startTestServer({ limits: { requestTimeoutMs: 300, headersTimeoutMs: 100, connectionsCheckingIntervalMs: 25 } });
    const socket = connect({ path: ts.endpoint });
    let closed = false;
    socket.on('close', () => (closed = true));
    socket.on('error', () => {});
    socket.on('data', () => {});
    socket.write('POST /rpc HTTP/1.1\r\nHost: x\r\n');
    await waitUntil(() => closed, 3000);
  });

  it('close() ends an open SSE stream and finishes quickly; the socket file is removed', async () => {
    ts = await startTestServer();
    const sse = await openRawSse(ts.endpoint, ts.token);
    await waitUntil(() => ts!.server.stats().sseClients === 1);
    const started = Date.now();
    await ts.server.close();
    expect(Date.now() - started).toBeLessThan(6000);
    await waitUntil(() => sse.ended);
    expect(existsSync(ts.endpoint)).toBe(false);
    // second close is a no-op
    await ts.server.close();
  });

  it('close() waits briefly for in-flight RPC calls', async () => {
    ts = await startTestServer({
      register: (r) =>
        r.register('tasks.list', async () => {
          await new Promise((resolve) => setTimeout(resolve, 150));
          return [];
        }),
    });
    const pending = rawRequest({ endpoint: ts.endpoint, method: 'POST', path: '/rpc', headers: { ...json, Authorization: `Bearer ${ts.token}` }, body: rpcBody('tasks.list') });
    await waitUntil(() => ts!.server.stats().activeRequests === 1);
    await ts.server.close();
    expect((await pending).status).toBe(200);
  });
});
