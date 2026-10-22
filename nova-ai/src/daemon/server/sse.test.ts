// Tests for GET /events: delivery, filter, output coalescing/order, 64 KB cap, ping, backpressure, 16-stream limit.
import { afterEach, describe, expect, it } from 'vitest';
import { request } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { AnyNovaEvent } from '@shared/events';
import type { ProcessInfo } from '@shared/schemas';
import { openRawSse, rawRequest, startTestServer, waitUntil, type RawSse, type TestServer } from './test-helpers';
import { serializeEvent, TRUNCATION_MARK } from './sse';

let ts: TestServer | null = null;
const streams: RawSse[] = [];
afterEach(async () => {
  for (const s of streams.splice(0)) s.close();
  await ts?.cleanup();
  ts = null;
});

async function sse(path = '/events'): Promise<RawSse> {
  const s = await openRawSse(ts!.endpoint, ts!.token, path);
  streams.push(s);
  return s;
}

const logEvent = (msg: string) => ({ level: 'warn' as const, scope: 't', msg, ts: 1 });

describe('SSE delivery', () => {
  it('delivers bus events as data lines and sends the connected comment', async () => {
    ts = await startTestServer();
    const s = await sse();
    expect(s.status).toBe(200);
    await waitUntil(() => ts!.server.stats().sseClients === 1);
    ts.bus.emit('log', logEvent('eins'));
    ts.bus.emit('project.removed', { id: 'p1' });
    await waitUntil(() => s.events.length === 2);
    expect(s.events[0]).toMatchObject({ type: 'log', payload: { msg: 'eins' }, seq: 1 });
    expect(s.events[1]).toMatchObject({ type: 'project.removed', payload: { id: 'p1' }, seq: 2 });
    expect(s.comments).toContain('connected');
  });

  it('filters by ?types= and rejects unknown types', async () => {
    ts = await startTestServer();
    const filtered = await sse('/events?types=project.removed,%20task.removed');
    const all = await sse();
    await waitUntil(() => ts!.server.stats().sseClients === 2);
    ts.bus.emit('log', logEvent('x'));
    ts.bus.emit('task.removed', { id: 't', projectId: 'p' });
    ts.bus.emit('project.removed', { id: 'p' });
    await waitUntil(() => all.events.length === 3 && filtered.events.length === 2);
    expect(filtered.events.map((e) => e.type)).toEqual(['task.removed', 'project.removed']);
    const bad = await rawRequest({ endpoint: ts.endpoint, path: '/events?types=log,nope', headers: { Authorization: `Bearer ${ts.token}` } });
    expect(bad.status).toBe(400);
    expect((bad.json() as { error: { message: string } }).error.message).toBe('Unbekannte Ereignistypen: nope.');
  });

  it('requires the token for /events', async () => {
    ts = await startTestServer();
    expect((await rawRequest({ endpoint: ts.endpoint, path: '/events' })).status).toBe(401);
  });

  it('coalesces process output per stream and flushes it before other events', async () => {
    ts = await startTestServer({ limits: { sseCoalesceMs: 200 } });
    const s = await sse();
    await waitUntil(() => ts!.server.stats().sseClients === 1);
    for (const part of ['a', 'b', 'c']) ts.bus.emit('process.output', { processId: 'p1', projectId: null, stream: 'stdout', data: part });
    ts.bus.emit('process.output', { processId: 'p1', projectId: null, stream: 'stderr', data: 'E' });
    ts.bus.emit('terminal.output', { sessionId: 's1', projectId: 'x', stream: 'system', data: 'T1' });
    ts.bus.emit('terminal.output', { sessionId: 's1', projectId: 'x', stream: 'system', data: 'T2' });
    ts.bus.emit('process.updated', { id: 'p1' } as unknown as ProcessInfo);
    await waitUntil(() => s.events.length === 4);
    expect(s.events.map((e) => e.type)).toEqual(['process.output', 'process.output', 'terminal.output', 'process.updated']);
    const [out, err, term] = s.events as Array<Extract<AnyNovaEvent, { type: 'process.output' | 'terminal.output' }>>;
    expect(out.payload).toMatchObject({ stream: 'stdout', data: 'abc' });
    expect(out.seq).toBe(3);
    expect(err.payload).toMatchObject({ stream: 'stderr', data: 'E' });
    expect(term.payload.data).toBe('T1T2');
  });

  it('flushes coalesced output after the interval', async () => {
    ts = await startTestServer({ limits: { sseCoalesceMs: 30 } });
    const s = await sse();
    await waitUntil(() => ts!.server.stats().sseClients === 1);
    ts.bus.emit('process.output', { processId: 'p1', projectId: null, stream: 'stdout', data: 'x' });
    ts.bus.emit('process.output', { processId: 'p1', projectId: null, stream: 'stdout', data: 'y' });
    await waitUntil(() => s.events.length === 1, 2000);
    expect((s.events[0] as Extract<AnyNovaEvent, { type: 'process.output' }>).payload.data).toBe('xy');
  });

  it('caps event data at 64 KB with the truncation mark', async () => {
    ts = await startTestServer();
    const s = await sse();
    await waitUntil(() => ts!.server.stats().sseClients === 1);
    ts.bus.emit('log', logEvent('L'.repeat(200_000)));
    ts.bus.emit('process.output', { processId: 'p', projectId: null, stream: 'stdout', data: 'A'.repeat(100_000) + 'ENDE' });
    ts.bus.emit('project.removed', { id: 'after' });
    await waitUntil(() => s.events.length === 3);
    const log = s.events[0] as Extract<AnyNovaEvent, { type: 'log' }>;
    expect(log.payload.msg.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(log))).toBeLessThanOrEqual(64 * 1024);
    const out = s.events[1] as Extract<AnyNovaEvent, { type: 'process.output' }>;
    expect(out.payload.data.startsWith(TRUNCATION_MARK)).toBe(true);
    expect(out.payload.data.endsWith('ENDE')).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(out))).toBeLessThanOrEqual(64 * 1024);
  });

  it('serializeEvent keeps escaped output within the cap and drops unserialisable events', () => {
    const ev = { type: 'terminal.output', payload: { sessionId: 's', projectId: 'p', stream: 'stdout', data: '\u001b[31m'.repeat(30_000) }, ts: 1, seq: 1 } as AnyNovaEvent;
    const json = serializeEvent(ev, 64 * 1024)!;
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(64 * 1024);
    expect(JSON.parse(json).payload.data.startsWith(TRUNCATION_MARK)).toBe(true);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(serializeEvent({ type: 'log', payload: cyclic, ts: 1, seq: 1 } as unknown as AnyNovaEvent, 1024)).toBeNull();
  });

  it('sends a ping comment periodically', async () => {
    ts = await startTestServer({ limits: { ssePingIntervalMs: 40 } });
    const s = await sse();
    await waitUntil(() => s.comments.includes('ping'), 2000);
  });
});

describe('SSE limits', () => {
  it('closes a stream whose client does not read (backpressure > 4 MB)', async () => {
    ts = await startTestServer();
    const socket: Socket = connect({ path: ts.endpoint });
    socket.on('error', () => {});
    let closed = false;
    socket.on('close', () => (closed = true));
    await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
    socket.write(`GET /events HTTP/1.1\r\nHost: nova\r\nAuthorization: Bearer ${ts.token}\r\n\r\n`);
    await waitUntil(() => ts!.server.stats().sseClients === 1);
    socket.pause();
    const big = 'x'.repeat(60_000);
    for (let i = 0; i < 150 && ts.server.stats().sseClients > 0; i++) ts.bus.emit('log', logEvent(big + i));
    await waitUntil(() => ts!.server.stats().sseClients === 0, 3000);
    expect(ts.logs.some((e) => e.level === 'warn' && e.msg.includes('liest zu langsam'))).toBe(true);
    socket.resume();
    await waitUntil(() => closed, 3000);
  });

  it('allows at most 16 simultaneous streams (429 for the 17th)', async () => {
    ts = await startTestServer();
    for (let i = 0; i < 16; i++) {
      const s = await sse();
      expect(s.status).toBe(200);
    }
    await waitUntil(() => ts!.server.stats().sseClients === 16);
    const rejected = await rawRequest({ endpoint: ts.endpoint, path: '/events', headers: { Authorization: `Bearer ${ts.token}` } });
    expect(rejected.status).toBe(429);
    expect((rejected.json() as { error: { code: string } }).error.code).toBe('RESOURCE_LIMIT');
    streams.pop()!.close();
    await waitUntil(() => ts!.server.stats().sseClients === 15);
    const again = await sse();
    expect(again.status).toBe(200);
  });

  it('survives a client that disconnects in the middle of an event burst', async () => {
    ts = await startTestServer();
    const done = new Promise<void>((resolve) => {
      const req = request({ socketPath: ts!.endpoint, path: '/events', headers: { Authorization: `Bearer ${ts!.token}` }, agent: false }, (res) => {
        res.once('data', () => {
          req.destroy();
          resolve();
        });
      });
      req.on('error', () => {});
      req.end();
    });
    await done;
    for (let i = 0; i < 200; i++) ts.bus.emit('log', logEvent(`n${i}`));
    await waitUntil(() => ts!.server.stats().sseClients === 0);
    const after = await rawRequest({ endpoint: ts.endpoint, path: '/health', headers: { Authorization: `Bearer ${ts.token}` } });
    expect(after.status).toBe(200);
  });
});
