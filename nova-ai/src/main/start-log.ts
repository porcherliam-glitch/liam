// <dataDir>/logs/daemon-start.log: stdout/stderr of the detached daemon process (catches failures before the
// daemon's own logger exists, e.g. a broken bundle or a missing Node feature).
// Key decisions:
// - Trimmed to at most 256 KB before each spawn (the tail is kept, cut at a line boundary) so it never grows
//   without bound; a header line marks every start.
// - The file descriptor is opened in append mode and handed to the child as stdout/stderr; the parent closes its
//   copy right after spawn.
// - Reading the tail for UI messages only looks at the bytes written since this spawn and redacts secrets.
import { closeSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync, writeSync, readSync, fstatSync } from 'node:fs';
import { dirname } from 'node:path';
import { redactString } from '../daemon/core/redact';

export const START_LOG_MAX_BYTES = 256 * 1024;

/** Shrinks the file to its last `maxBytes` (cut at the next newline). No-op when smaller or missing. */
export function trimStartLog(path: string, maxBytes = START_LOG_MAX_BYTES): void {
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  if (size <= maxBytes) return;
  const data = readFileSync(path);
  let tail = data.subarray(data.length - maxBytes);
  const nl = tail.indexOf(0x0a);
  if (nl >= 0 && nl < tail.length - 1) tail = tail.subarray(nl + 1);
  writeFileSync(path, tail);
}

export interface PreparedStartLog {
  /** File descriptor opened for appending (pass to spawn, then close). */
  fd: number;
  /** Size of the file after the header line: bytes from here on belong to this spawn. */
  offset: number;
}

/**
 * Trims the start log to leave room (keeps ≤ 3/4 of the limit), appends a header line and opens it for appending.
 * Returns null when the file cannot be opened (the daemon then starts with stdio ignored).
 */
export function prepareStartLog(path: string, header: string, maxBytes = START_LOG_MAX_BYTES): PreparedStartLog | null {
  try {
    mkdirSync(dirname(path), { recursive: true });
    trimStartLog(path, Math.floor((maxBytes * 3) / 4));
    const fd = openSync(path, 'a');
    writeSync(fd, `\n--- ${header} ---\n`);
    const offset = fstatSync(fd).size;
    return { fd, offset };
  } catch {
    return null;
  }
}

/** Closes a descriptor, ignoring errors. */
export function closeQuietly(fd: number | null | undefined): void {
  if (fd === null || fd === undefined) return;
  try {
    closeSync(fd);
  } catch {
    /* already closed */
  }
}

/**
 * Returns the redacted output written since `offset` (last `maxChars` characters, whitespace collapsed to single
 * lines joined with " | "), or "" when nothing was written.
 */
export function readStartLogSince(path: string, offset: number, maxChars = 600): string {
  let fd: number | null = null;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    if (size <= offset) return '';
    const len = Math.min(size - offset, 64 * 1024);
    const start = size - len;
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, Math.max(offset, start));
    const text = redactString(buf.toString('utf8'))
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .join(' | ');
    return text.length > maxChars ? `… ${text.slice(text.length - maxChars)}` : text;
  } catch {
    return '';
  } finally {
    closeQuietly(fd);
  }
}
