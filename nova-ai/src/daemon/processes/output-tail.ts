// Bounded output buffers for child processes (ProcessManager) and the throttled process.output emitter.
// Key decisions:
// - Text is decoded per stream with a StringDecoder BEFORE it is buffered, so multi-byte UTF-8 characters split across
//   chunks are never broken and stdout/stderr can be interleaved safely.
// - Every ring is capped by UTF-8 bytes (default 1 MB per stream, SPEC §4.3); old text is dropped from the front and the
//   tail is marked with a German truncation note. Redaction happens when the text is read (tails, events), because a
//   secret can be split across chunks – reading the joined tail redacts it reliably.
// - process.output events are batched (≥ 100 ms per process), merge consecutive chunks of the same stream, are
//   redacted and capped at 64 KB per event (the SSE layer caps again).
import { StringDecoder } from 'node:string_decoder';
import { redactString } from '../core/redact';

export const TRUNCATION_NOTE = '[… ältere Ausgabe gekürzt]\n';
export const EVENT_TRUNCATION_NOTE = '[… gekürzt]\n';

/** Removes `n` UTF-8 bytes from the start of `text` (never leaves a broken character at the new start). */
export function dropUtf8Prefix(text: string, n: number): string {
  if (n <= 0) return text;
  const buf = Buffer.from(text, 'utf8');
  if (n >= buf.length) return '';
  let start = n;
  // Skip UTF-8 continuation bytes so the remainder starts at a character boundary.
  while (start < buf.length && (buf[start] & 0xc0) === 0x80) start++;
  return buf.subarray(start).toString('utf8');
}

/** Last `maxBytes` UTF-8 bytes of `text` (character-aligned). */
export function utf8Tail(text: string, maxBytes: number): string {
  const len = Buffer.byteLength(text, 'utf8');
  return len <= maxBytes ? text : dropUtf8Prefix(text, len - maxBytes);
}

/** A string ring capped by UTF-8 bytes. */
export class TextRing {
  private parts: string[] = [];
  private bytes = 0;
  private dropped = false;

  constructor(readonly maxBytes: number) {}

  get truncated(): boolean {
    return this.dropped;
  }

  get size(): number {
    return this.bytes;
  }

  push(text: string): void {
    if (!text) return;
    const b = Buffer.byteLength(text, 'utf8');
    if (b >= this.maxBytes) {
      // This chunk alone fills the ring: everything older is dropped.
      const kept = utf8Tail(text, this.maxBytes);
      if (this.bytes > 0 || kept.length < text.length) this.dropped = true;
      this.parts = [kept];
      this.bytes = Buffer.byteLength(kept, 'utf8');
      return;
    }
    this.parts.push(text);
    this.bytes += b;
    while (this.bytes > this.maxBytes && this.parts.length > 0) {
      const first = this.parts[0];
      const fb = Buffer.byteLength(first, 'utf8');
      const excess = this.bytes - this.maxBytes;
      this.dropped = true;
      if (fb <= excess) {
        this.parts.shift();
        this.bytes -= fb;
      } else {
        const rest = dropUtf8Prefix(first, excess);
        this.parts[0] = rest;
        this.bytes -= fb - Buffer.byteLength(rest, 'utf8');
      }
    }
    if (this.parts.length > 512) this.parts = [this.parts.join('')];
  }

  /** Raw (unredacted) text. */
  text(): string {
    return this.parts.join('');
  }
}

export type OutputStream = 'stdout' | 'stderr';

/** Interleaved + per-stream tails of one process. */
export class OutputTail {
  readonly stdout: TextRing;
  readonly stderr: TextRing;
  readonly combined: TextRing;

  constructor(maxBytesPerStream: number) {
    const max = Math.max(1024, Math.floor(maxBytesPerStream));
    this.stdout = new TextRing(max);
    this.stderr = new TextRing(max);
    this.combined = new TextRing(max);
  }

  append(stream: OutputStream, text: string): void {
    if (!text) return;
    (stream === 'stdout' ? this.stdout : this.stderr).push(text);
    this.combined.push(text);
  }

  private static read(ring: TextRing): string {
    const text = redactString(ring.text());
    return ring.truncated ? TRUNCATION_NOTE + text : text;
  }

  /** Redacted tails for a CommandResult. */
  result(): { stdout: string; stderr: string; output: string } {
    return { stdout: OutputTail.read(this.stdout), stderr: OutputTail.read(this.stderr), output: OutputTail.read(this.combined) };
  }

  /** Redacted interleaved output (with truncation note). */
  output(): string {
    return OutputTail.read(this.combined);
  }

  /** Last `n` lines of the interleaved output, redacted. */
  tailLines(n: number): string {
    return lastLines(this.output(), n);
  }
}

/** Last `n` lines of a text (n ≤ 0 → ""). A trailing newline does not count as an extra empty line. */
export function lastLines(text: string, n: number): string {
  if (n <= 0 || !text) return '';
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = trimmed.split('\n');
  if (lines.length <= n) return text;
  return lines.slice(lines.length - n).join('\n') + (text.endsWith('\n') ? '\n' : '');
}

/** Per-stream UTF-8 decoders (one per child stream). */
export class StreamDecoders {
  private decoders: Record<OutputStream, StringDecoder> = { stdout: new StringDecoder('utf8'), stderr: new StringDecoder('utf8') };

  write(stream: OutputStream, chunk: Buffer | string): string {
    return typeof chunk === 'string' ? chunk : this.decoders[stream].write(chunk);
  }

  end(stream: OutputStream): string {
    return this.decoders[stream].end();
  }
}

const MAX_EVENT_CHARS = 64 * 1024;
const MAX_PENDING_CHARS = 512 * 1024;

/**
 * Batches output for 'process.output' events: at most one flush per `throttleMs`, consecutive chunks of the same stream
 * are merged, every emitted payload is redacted and capped at 64 KB.
 */
export class OutputEmitter {
  private segs: { stream: OutputStream; text: string }[] = [];
  private pending = 0;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;

  constructor(
    private readonly emit: (stream: OutputStream, data: string) => void,
    private readonly throttleMs: number,
  ) {}

  push(stream: OutputStream, text: string): void {
    if (this.closed || !text) return;
    const last = this.segs[this.segs.length - 1];
    if (last && last.stream === stream) last.text += text;
    else this.segs.push({ stream, text });
    this.pending += text.length;
    // Bound memory when a process floods output faster than events are flushed: keep the newest text.
    while (this.pending > MAX_PENDING_CHARS && this.segs.length > 0) {
      const first = this.segs[0];
      const excess = this.pending - MAX_PENDING_CHARS;
      if (first.text.length <= excess) {
        this.segs.shift();
        this.pending -= first.text.length;
      } else {
        first.text = EVENT_TRUNCATION_NOTE + first.text.slice(excess);
        this.pending -= excess;
        break;
      }
    }
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.throttleMs);
      this.timer.unref?.();
    }
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const segs = this.segs;
    this.segs = [];
    this.pending = 0;
    for (const seg of segs) {
      let data = seg.text;
      if (data.length > MAX_EVENT_CHARS) data = EVENT_TRUNCATION_NOTE + data.slice(data.length - MAX_EVENT_CHARS);
      try {
        this.emit(seg.stream, redactString(data));
      } catch {
        /* event delivery must never break output handling */
      }
    }
  }

  /** Flushes the remaining output and stops accepting more. */
  close(): void {
    this.flush();
    this.closed = true;
  }
}

const ANSI_RE = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;

/** Removes ANSI escape sequences (colors, cursor movement, OSC titles). */
export function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, '');
}
