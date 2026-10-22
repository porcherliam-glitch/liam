// Text handling for project files: binary detection, lossless decoding/encoding, BOM and line endings.
// Key decisions:
// - Binary = NUL byte in the first 8 KB, unless the file starts with a UTF-16 BOM (Windows PowerShell 5 writes
//   UTF-16LE by default; those files are text).
// - Decoding is lossless so an edit never damages bytes it did not touch: valid UTF-8 → utf8; invalid UTF-8 (legacy
//   Windows-1252/Latin-1 files) → latin1, which maps every byte 1:1 to a char and back. Re-encoding uses the same
//   encoding; if new text needs chars beyond U+00FF the file is written as UTF-8 (callers report that).
// - BOM: kept when the original had one; NOVA never adds one to files that had none (SPEC §6.3).
// - Line endings: "dominant EOL" = the more frequent of CRLF / LF; new files use CRLF for .bat/.cmd/.sln/.csproj/
//   .cs/.ps1 and LF otherwise.

export type TextEncodingKind = 'utf8' | 'latin1' | 'utf16le' | 'utf16be';

export interface DecodedText {
  text: string;
  bom: boolean;
  encoding: TextEncodingKind;
}

export const BINARY_SNIFF_BYTES = 8192;

function hasUtf16Bom(buf: Buffer): 'le' | 'be' | null {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'le';
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'be';
  return null;
}

/** True for binary content (NUL byte in the first 8 KB, UTF-16 files with BOM excepted). */
export function isBinaryContent(buf: Buffer): boolean {
  if (hasUtf16Bom(buf)) return false;
  const n = Math.min(buf.length, BINARY_SNIFF_BYTES);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function swapBytes(buf: Buffer): Buffer {
  const out = Buffer.alloc(buf.length - (buf.length % 2));
  for (let i = 0; i + 1 < buf.length; i += 2) {
    out[i] = buf[i + 1];
    out[i + 1] = buf[i];
  }
  return out;
}

export function decodeText(buf: Buffer): DecodedText {
  const utf16 = hasUtf16Bom(buf);
  if (utf16 === 'le') return { text: buf.subarray(2).toString('utf16le'), bom: true, encoding: 'utf16le' };
  if (utf16 === 'be') return { text: swapBytes(buf.subarray(2)).toString('utf16le'), bom: true, encoding: 'utf16be' };
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const body = bom ? buf.subarray(3) : buf;
  try {
    return { text: fatalUtf8.decode(body), bom, encoding: 'utf8' };
  } catch {
    return { text: body.toString('latin1'), bom: false, encoding: 'latin1' };
  }
}

export interface EncodeResult {
  data: Buffer;
  /** The requested encoding could not represent the text and UTF-8 was used instead. */
  switchedToUtf8: boolean;
}

export function encodeText(text: string, opts: { bom: boolean; encoding: TextEncodingKind }): EncodeResult {
  const body = stripBom(text);
  switch (opts.encoding) {
    case 'utf16le':
      return { data: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]), switchedToUtf8: false };
    case 'utf16be':
      return { data: Buffer.concat([Buffer.from([0xfe, 0xff]), swapBytes(Buffer.from(body, 'utf16le'))]), switchedToUtf8: false };
    case 'latin1':
      // eslint-disable-next-line no-control-regex
      if (/^[\u0000-ÿ]*$/.test(body)) return { data: Buffer.from(body, 'latin1'), switchedToUtf8: false };
      return { data: Buffer.from(body, 'utf8'), switchedToUtf8: true };
    default: {
      const data = Buffer.from(body, 'utf8');
      return { data: opts.bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), data]) : data, switchedToUtf8: false };
    }
  }
}

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export type Eol = '\r\n' | '\n';

/** The more frequent line ending, or null when the text has no line break. Ties go to CRLF. */
export function dominantEol(text: string): Eol | null {
  let crlf = 0;
  let lf = 0;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) {
    if (i > 0 && text.charCodeAt(i - 1) === 13) crlf++;
    else lf++;
  }
  if (crlf === 0 && lf === 0) return null;
  return crlf >= lf ? '\r\n' : '\n';
}

/** Converts every CRLF / LF to `eol` (lone CR is left alone). */
export function convertEol(text: string, eol: Eol): string {
  return text.replace(/\r?\n/g, eol);
}

const CRLF_EXTENSIONS = new Set(['.bat', '.cmd', '.sln', '.csproj', '.cs', '.ps1']);

export function defaultEolFor(path: string): Eol {
  const name = path.replace(/\\/g, '/').split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot).toLowerCase() : '';
  return CRLF_EXTENSIONS.has(ext) ? '\r\n' : '\n';
}

/** Cuts a buffer to at most `max` bytes without splitting a UTF-8 sequence. */
export function utf8SafeSlice(buf: Buffer, max: number): Buffer {
  if (buf.length <= max) return buf;
  let end = max;
  // step back over continuation bytes (10xxxxxx) to the start of the cut sequence, then drop it entirely
  let back = 0;
  while (end > 0 && back < 4 && (buf[end] & 0xc0) === 0x80) {
    end--;
    back++;
  }
  return buf.subarray(0, end);
}

/** Number of lines (a trailing newline does not start a new line). */
export function countLines(text: string): number {
  if (text === '') return 0;
  let n = 1;
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) n++;
  return text.endsWith('\n') ? n - 1 : n;
}

/** German byte size: "512 B", "1,2 KB", "3,4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(1).replace('.', ',')} ${units[u]}`;
}
