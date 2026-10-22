// Incremental Server-Sent-Events parser (text/event-stream) for the DaemonClient.
// Key decisions:
// - Follows the WHATWG parsing rules that matter here: lines end with LF, CR or CRLF (also split across chunks),
//   comment lines start with ':', `data:` lines are joined with '\n', an empty line dispatches the message.
//   `event`, `id` and `retry` fields are ignored (the daemon sends only data lines with a JSON NovaEvent).
// - A hard cap on the buffered message size protects Electron main against a misbehaving peer
//   (the daemon itself caps events at 64 KB).

export class SseParser {
  private buffer = '';
  private data: string[] = [];
  private dataChars = 0;
  private pendingCR = false;

  constructor(
    private readonly onMessage: (data: string) => void,
    private readonly maxMessageChars = 4 * 1024 * 1024,
  ) {}

  /** Feeds decoded text. Throws when a single message exceeds the size cap. */
  push(text: string): void {
    let chunk = text;
    if (this.pendingCR) {
      this.pendingCR = false;
      if (chunk.startsWith('\n')) chunk = chunk.slice(1);
    }
    this.buffer += chunk;
    let start = 0;
    const buf = this.buffer;
    for (let i = 0; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      const line = buf.slice(start, i);
      if (c === 13) {
        if (i + 1 < buf.length) {
          if (buf.charCodeAt(i + 1) === 10) i++;
        } else {
          this.pendingCR = true;
        }
      }
      start = i + 1;
      this.processLine(line);
    }
    this.buffer = buf.slice(start);
    if (this.buffer.length + this.dataChars > this.maxMessageChars) {
      this.reset();
      throw new Error('SSE message too large');
    }
  }

  reset(): void {
    this.buffer = '';
    this.data = [];
    this.dataChars = 0;
    this.pendingCR = false;
  }

  private processLine(line: string): void {
    if (line === '') {
      if (this.data.length > 0) {
        const message = this.data.join('\n');
        this.data = [];
        this.dataChars = 0;
        this.onMessage(message);
      }
      return;
    }
    if (line.charCodeAt(0) === 58 /* ':' */) return;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    if (field !== 'data') return;
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    this.data.push(value);
    this.dataChars += value.length + 1;
    if (this.dataChars > this.maxMessageChars) {
      this.reset();
      throw new Error('SSE message too large');
    }
  }
}
