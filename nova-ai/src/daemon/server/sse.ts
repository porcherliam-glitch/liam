// One Server-Sent-Events stream (GET /events) of the RPC server.
// Key decisions (SPEC §4.1, §6.1):
// - Format: `data: <json NovaEvent>\n\n` per event, `: ping\n\n` every 15 s, `: connected\n\n` right after headers.
// - Backpressure: when res.writableLength exceeds 4 MB the stream is destroyed (the client reconnects and re-fetches
//   state) instead of buffering without bound for a stalled client.
// - process.output / terminal.output are coalesced per (type, process/session, stream) every 100 ms; before any
//   other event is written, pending output is flushed first so the order "output … then exit" is preserved.
//   A merged event carries the ts/seq of its LAST part (seq gaps can therefore appear for output events).
// - Event data is capped at 64 KB: output keeps its newest part behind "[… gekürzt]", other events get long strings
//   shortened ("…[… gekürzt]"). An event that still does not fit (or cannot be serialised) is dropped with a warning
//   – events are hints, clients re-fetch via RPC.
// - Every write is wrapped: a failing stream is closed, never the daemon.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AnyNovaEvent, NovaEventType } from '@shared/events';
import type { Logger } from '../core/logger';

export const TRUNCATION_MARK = '[… gekürzt]';
/** Coalesced output is flushed early once a buffer holds this many characters. */
const OUTPUT_FLUSH_CHARS = 32 * 1024;

export interface SseLimits {
  maxBufferedBytes: number;
  maxEventBytes: number;
  pingIntervalMs: number;
  coalesceMs: number;
}

type OutputEvent = Extract<AnyNovaEvent, { type: 'process.output' | 'terminal.output' }>;

function isOutputEvent(e: AnyNovaEvent): e is OutputEvent {
  return e.type === 'process.output' || e.type === 'terminal.output';
}

function outputKey(e: OutputEvent): string {
  return e.type === 'process.output' ? `p|${e.payload.processId}|${e.payload.stream}` : `t|${e.payload.sessionId}|${e.payload.stream}`;
}

function truncateStrings(value: unknown, limit: number, depth = 0): unknown {
  if (typeof value === 'string') return value.length > limit ? value.slice(0, limit) + TRUNCATION_MARK : value;
  if (depth > 20 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => truncateStrings(v, limit, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = truncateStrings(v, limit, depth + 1);
  return out;
}

function stringify(value: unknown): string | null {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json : null;
  } catch {
    return null;
  }
}

/** Serialises an event and enforces the size cap. Returns null when the event cannot be sent. */
export function serializeEvent(event: AnyNovaEvent, maxBytes: number): string | null {
  const json = stringify(event);
  if (json === null) return null;
  if (Buffer.byteLength(json, 'utf8') <= maxBytes) return json;

  if (isOutputEvent(event) && typeof event.payload.data === 'string') {
    const data = event.payload.data;
    const withMarkOnly = stringify({ ...event, payload: { ...event.payload, data: TRUNCATION_MARK } });
    if (withMarkOnly !== null) {
      const base = Buffer.byteLength(withMarkOnly, 'utf8');
      let keep = Math.min(data.length, Math.max(0, maxBytes - base));
      for (let i = 0; i < 40 && keep > 0; i++) {
        const candidate = stringify({ ...event, payload: { ...event.payload, data: TRUNCATION_MARK + data.slice(data.length - keep) } });
        if (candidate === null) break;
        const size = Buffer.byteLength(candidate, 'utf8');
        if (size <= maxBytes) return candidate;
        const ratio = (maxBytes - base) / Math.max(1, size - base);
        keep = Math.min(keep - 1, Math.floor(keep * Math.min(0.95, ratio * 0.98)));
      }
    }
  }

  for (const limit of [16_384, 4_096, 1_024, 256, 64]) {
    const candidate = stringify({ ...event, payload: truncateStrings(event.payload, limit) });
    if (candidate !== null && Buffer.byteLength(candidate, 'utf8') <= maxBytes) return candidate;
  }
  return null;
}

/** Serialisation cache: the bus hands the same event object to every stream. */
const jsonCache = new WeakMap<object, string | null>();

function cachedSerialize(event: AnyNovaEvent, maxBytes: number): string | null {
  if (jsonCache.has(event)) return jsonCache.get(event) ?? null;
  const json = serializeEvent(event, maxBytes);
  jsonCache.set(event, json);
  return json;
}

interface PendingOutput {
  first: OutputEvent;
  last: OutputEvent;
  parts: string[];
  chars: number;
}

export class SseConnection {
  private closed = false;
  private pingTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private pending = new Map<string, PendingOutput>();
  private onCloseCallbacks: Array<() => void> = [];

  constructor(
    private readonly req: IncomingMessage,
    private readonly res: ServerResponse,
    private readonly filter: Set<NovaEventType> | null,
    private readonly limits: SseLimits,
    private readonly log: Logger,
  ) {}

  get isClosed(): boolean {
    return this.closed;
  }

  onClose(cb: () => void): void {
    this.onCloseCallbacks.push(cb);
  }

  start(): void {
    this.req.socket.setTimeout(0);
    this.req.socket.setNoDelay?.(true);
    this.res.on('close', () => this.cleanup());
    this.res.on('error', () => this.cleanup());
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    });
    this.writeRaw(': connected\n\n');
    this.pingTimer = setInterval(() => this.writeRaw(': ping\n\n'), this.limits.pingIntervalMs);
    this.pingTimer.unref?.();
  }

  /** Bus listener entry point. Never throws. */
  push(event: AnyNovaEvent): void {
    if (this.closed) return;
    try {
      if (this.filter && !this.filter.has(event.type)) return;
      if (isOutputEvent(event)) {
        this.bufferOutput(event);
        return;
      }
      this.flushOutput();
      const json = cachedSerialize(event, this.limits.maxEventBytes);
      if (json === null) {
        this.log.warn('Ereignis konnte nicht gesendet werden (zu groß oder nicht serialisierbar)', { type: event.type, seq: event.seq });
        return;
      }
      this.writeRaw(`data: ${json}\n\n`);
    } catch (e) {
      this.log.warn('Ereignisverbindung fehlerhaft – wird getrennt', { error: e instanceof Error ? e.message : String(e) });
      this.destroy();
    }
  }

  /** Graceful end (server shutdown). */
  end(): void {
    if (this.closed) return;
    try {
      this.flushOutput();
    } catch {
      /* ignore */
    }
    this.cleanup();
    try {
      this.res.end();
    } catch {
      /* ignore */
    }
  }

  destroy(): void {
    if (this.closed && this.res.destroyed) return;
    this.cleanup();
    try {
      this.res.destroy();
    } catch {
      /* ignore */
    }
  }

  private cleanup(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.pingTimer = null;
    this.flushTimer = null;
    this.pending.clear();
    for (const cb of this.onCloseCallbacks.splice(0)) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  private bufferOutput(event: OutputEvent): void {
    const key = outputKey(event);
    const data = typeof event.payload.data === 'string' ? event.payload.data : String(event.payload.data ?? '');
    const entry = this.pending.get(key);
    if (entry) {
      entry.parts.push(data);
      entry.chars += data.length;
      entry.last = event;
    } else {
      this.pending.set(key, { first: event, last: event, parts: [data], chars: data.length });
    }
    const current = this.pending.get(key)!;
    if (current.chars >= OUTPUT_FLUSH_CHARS) {
      this.flushOutput();
      return;
    }
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        try {
          this.flushOutput();
        } catch (e) {
          this.log.warn('Ereignisverbindung fehlerhaft – wird getrennt', { error: e instanceof Error ? e.message : String(e) });
          this.destroy();
        }
      }, this.limits.coalesceMs);
      this.flushTimer.unref?.();
    }
  }

  private flushOutput(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.pending.size === 0) return;
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      if (this.closed) return;
      const merged =
        entry.parts.length === 1
          ? entry.last
          : ({ ...entry.last, payload: { ...entry.first.payload, data: entry.parts.join('') } } as OutputEvent);
      const json = entry.parts.length === 1 ? cachedSerialize(merged, this.limits.maxEventBytes) : serializeEvent(merged, this.limits.maxEventBytes);
      if (json === null) {
        this.log.warn('Ausgabe-Ereignis konnte nicht gesendet werden', { type: merged.type });
        continue;
      }
      this.writeRaw(`data: ${json}\n\n`);
    }
  }

  private writeRaw(chunk: string): void {
    if (this.closed || this.res.writableEnded || this.res.destroyed) return;
    try {
      this.res.write(chunk);
    } catch (e) {
      this.log.warn('Schreiben auf Ereignisverbindung fehlgeschlagen', { error: e instanceof Error ? e.message : String(e) });
      this.destroy();
      return;
    }
    if (this.res.writableLength > this.limits.maxBufferedBytes) {
      this.log.warn('Ereignisverbindung liest zu langsam – Verbindung wird getrennt', { bufferedBytes: this.res.writableLength });
      this.destroy();
    }
  }
}
