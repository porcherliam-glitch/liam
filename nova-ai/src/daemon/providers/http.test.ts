// Tests for the shared HTTP layer: Retry-After parsing, error-text extraction/redaction, timeout, dropped
// connections, invalid JSON and NDJSON streaming, and the default transport providerFetch (no 300 s undici limit,
// gzip, redirects, abort) – local 127.0.0.1 test servers only.
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NovaError } from '../core/errors';
import { startFakeHttpServer, sendJson, type FakeHttpServer } from '../../../tests/fakes/fake-http';
import { extractProviderMessage, parseRetryAfter, providerErrorDetails, providerFetch, requestJson, requestNdjson, requestText, type HttpContext } from './http';

let server: FakeHttpServer | null = null;
let server2: FakeHttpServer | null = null;
afterEach(async () => {
  vi.useRealTimers();
  await server?.close();
  await server2?.close();
  server = null;
  server2 = null;
});

// The production default transport (providers use it unless a test injects another fetch).
const ctx: HttpContext = { fetch: providerFetch, label: 'Test', family: 'cloud', providerId: 'p' };

/** Fake timers for everything the client side schedules (incl. undici's internal timers); I/O stays real. */
const useFakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });

/** A server that receives the request and answers only when the test calls release(). */
async function heldServer(answer: unknown) {
  let release: () => void = () => undefined;
  let received: () => void = () => undefined;
  const receivedP = new Promise<void>((r) => (received = r));
  const srv = await startFakeHttpServer(async (_req, res) => {
    received();
    await new Promise<void>((r) => (release = r));
    sendJson(res, 200, answer);
  });
  return { srv, received: receivedP, release: () => release() };
}

describe('http helpers', () => {
  it('parses Retry-After variants', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': '2' }))).toBe(2000);
    expect(parseRetryAfter(new Headers({ 'retry-after-ms': '150', 'retry-after': '9' }))).toBe(150);
    const now = Date.parse('2026-10-22T10:00:00Z');
    expect(parseRetryAfter(new Headers({ 'retry-after': 'Thu, 22 Oct 2026 10:00:05 GMT' }), now)).toBe(5000);
    expect(parseRetryAfter(new Headers({ 'retry-after': 'soon' }))).toBeUndefined();
    expect(parseRetryAfter(new Headers())).toBeUndefined();
  });

  it('extracts and redacts provider error messages', () => {
    expect(extractProviderMessage('{"error":{"message":"bad key sk-abcdefghijklmnopqrstuvwxyz123"}}')).toBe('bad key [GEHEIM]');
    expect(extractProviderMessage('{"error":"model not found"}')).toBe('model not found');
    expect(extractProviderMessage('<html>502</html>')).toBeUndefined();
    expect(extractProviderMessage('')).toBeUndefined();
  });

  it('times out with a retryable billable PROVIDER_ERROR', async () => {
    server = await startFakeHttpServer(async (_req, res) => {
      await new Promise((r) => setTimeout(r, 500));
      sendJson(res, 200, {});
    });
    const e = (await requestJson(ctx, { method: 'GET', url: server.url, timeoutMs: 50 }).catch((x: unknown) => x)) as NovaError;
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(e.message).toContain('Zeitüberschreitung');
    expect(providerErrorDetails(e)).toMatchObject({ timedOut: true, retryable: true, billable: true, requestSent: true });
  });

  it('a dropped connection counts as sent and retryable', async () => {
    server = await startFakeHttpServer((_req, res) => {
      res.socket?.destroy();
    });
    const e = (await requestJson(ctx, { method: 'POST', url: server.url, body: { a: 1 }, timeoutMs: 2000 }).catch((x: unknown) => x)) as NovaError;
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(providerErrorDetails(e)).toMatchObject({ requestSent: true, retryable: true, billable: true });
  });

  it('invalid JSON is a non-retryable provider error', async () => {
    server = await startFakeHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{not json');
    });
    const e = (await requestJson(ctx, { method: 'GET', url: server.url, timeoutMs: 2000 }).catch((x: unknown) => x)) as NovaError;
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(providerErrorDetails(e)?.retryable).toBe(false);
  });

  it('streams NDJSON lines split across chunks and propagates callback errors', async () => {
    server = await startFakeHttpServer(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write('{"a":1}\n{"a"');
      await new Promise((r) => setTimeout(r, 10));
      res.write(':2}\n');
      res.end('{"a":3}');
    });
    const seen: unknown[] = [];
    await requestNdjson(ctx, { method: 'POST', url: server.url, timeoutMs: 1000 }, (v) => seen.push(v));
    expect(seen).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
    const boom = new Error('stop');
    await expect(
      requestNdjson(ctx, { method: 'POST', url: server.url, timeoutMs: 1000 }, () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });
});

describe('providerFetch (default transport)', () => {
  it('R4-4: an answer slower than 300 s succeeds – only the configured timeout limits the call', async () => {
    const held = await heldServer({ ok: true });
    server = held.srv;
    useFakeClock();
    let state = 'pending';
    const call = requestJson(ctx, { method: 'POST', url: server.url, body: { a: 1 }, timeoutMs: 600_000 });
    call.then(
      () => (state = 'resolved'),
      (e: unknown) => (state = `rejected: ${(e as Error).message}`),
    );
    await held.received;
    // Node's global fetch (undici) gives up here with UND_ERR_HEADERS_TIMEOUT after 300 s.
    await vi.advanceTimersByTimeAsync(320_000);
    expect(state).toBe('pending');
    held.release();
    await expect(call).resolves.toMatchObject({ data: { ok: true }, status: 200 });
  });

  it('R4-4: the configured timeout still ends a call that never answers (and nothing earlier does)', async () => {
    const held = await heldServer({ ok: true });
    server = held.srv;
    useFakeClock();
    let settled = false;
    const call = requestJson(ctx, { method: 'POST', url: server.url, body: {}, timeoutMs: 400_000 }).catch((e: unknown) => e);
    void call.then(() => (settled = true));
    await held.received;
    await vi.advanceTimersByTimeAsync(399_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    const e = (await call) as NovaError;
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(e.message).toContain('Zeitüberschreitung nach 400 s');
    expect(providerErrorDetails(e)).toMatchObject({ timedOut: true, requestSent: true });
    held.release();
  });

  it('sends JSON bodies and headers and decodes gzip answers', async () => {
    server = await startFakeHttpServer((req, res) => {
      const body = gzipSync(JSON.stringify({ echo: req.body, auth: req.headers.authorization, enc: req.headers['accept-encoding'] }));
      res.writeHead(201, { 'content-type': 'application/json', 'content-encoding': 'gzip', 'x-extra': 'ja' });
      res.end(body);
    });
    const res = await providerFetch(`${server.url}/x`, { method: 'POST', headers: { authorization: 'Bearer k', 'content-type': 'application/json' }, body: JSON.stringify({ a: 'ä' }) });
    expect(res.status).toBe(201);
    expect(res.ok).toBe(true);
    expect(res.headers.get('x-extra')).toBe('ja');
    expect(await res.json()).toEqual({ echo: { a: 'ä' }, auth: 'Bearer k', enc: 'gzip, br' });
  });

  it('follows redirects and forwards credentials only within the origin', async () => {
    server2 = await startFakeHttpServer((req, res) => sendJson(res, 200, { where: 'other', method: req.method, auth: req.headers.authorization ?? null, key: req.headers['x-api-key'] ?? null }));
    server = await startFakeHttpServer((req, res) => {
      if (req.path === '/same') return void res.writeHead(307, { location: '/target' }).end();
      if (req.path === '/target') return sendJson(res, 200, { where: 'same', method: req.method, auth: req.headers.authorization ?? null, body: req.body });
      if (req.path === '/see-other') return void res.writeHead(303, { location: '/target' }).end();
      res.writeHead(302, { location: `${server2!.url}/elsewhere` }).end();
    });
    const headers = { authorization: 'Bearer geheim', 'x-api-key': 'geheim', 'content-type': 'application/json' };
    const same = await providerFetch(`${server.url}/same`, { method: 'POST', headers, body: '{"a":1}' });
    expect(await same.json()).toEqual({ where: 'same', method: 'POST', auth: 'Bearer geheim', body: { a: 1 } });
    const seeOther = await providerFetch(`${server.url}/see-other`, { method: 'POST', headers, body: '{"a":1}' });
    expect(await seeOther.json()).toMatchObject({ where: 'same', method: 'GET', body: null });
    const other = await providerFetch(`${server.url}/away`, { method: 'GET', headers });
    expect(await other.json()).toEqual({ where: 'other', method: 'GET', auth: null, key: null });
  });

  it('aborts while waiting for the answer and while streaming the body', async () => {
    const held = await heldServer({});
    server = held.srv;
    const ac = new AbortController();
    const pending = requestText(ctx, { method: 'GET', url: server.url, signal: ac.signal, timeoutMs: 60_000 }).catch((e: unknown) => e);
    await held.received;
    ac.abort();
    expect(((await pending) as NovaError).code).toBe('CANCELLED');
    held.release();

    let finish: () => void = () => undefined;
    server2 = await startFakeHttpServer(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write('{"n":1}\n');
      await new Promise<void>((r) => (finish = r));
      res.end();
    });
    const ac2 = new AbortController();
    const seen: unknown[] = [];
    const streaming = requestNdjson(ctx, { method: 'POST', url: server2.url, signal: ac2.signal, timeoutMs: 60_000 }, (v) => {
      seen.push(v);
      ac2.abort();
    }).catch((e: unknown) => e);
    expect(((await streaming) as NovaError).code).toBe('CANCELLED');
    expect(seen).toEqual([{ n: 1 }]);
    finish();
  });

  it('a connection that breaks in the middle of the body is a retryable, sent failure', async () => {
    server = await startFakeHttpServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' });
      res.write('{"partial":');
      setTimeout(() => res.socket?.destroy(), 20);
    });
    const e = (await requestJson(ctx, { method: 'GET', url: server.url, timeoutMs: 5000 }).catch((x: unknown) => x)) as NovaError;
    expect(e.code).toBe('PROVIDER_ERROR');
    expect(providerErrorDetails(e)).toMatchObject({ requestSent: true, retryable: true, billable: true });
  });
});
