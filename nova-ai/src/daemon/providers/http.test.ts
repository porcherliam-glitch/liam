// Tests for the shared HTTP layer: Retry-After parsing, error-text extraction/redaction, timeout, dropped
// connections, invalid JSON and NDJSON streaming (local 127.0.0.1 test servers only).
import { afterEach, describe, expect, it } from 'vitest';
import { NovaError } from '../core/errors';
import { startFakeHttpServer, sendJson, type FakeHttpServer } from '../../../tests/fakes/fake-http';
import { extractProviderMessage, parseRetryAfter, providerErrorDetails, requestJson, requestNdjson, type HttpContext } from './http';

let server: FakeHttpServer | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});

const ctx: HttpContext = { fetch, label: 'Test', family: 'cloud', providerId: 'p' };

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
