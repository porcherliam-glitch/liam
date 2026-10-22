// Local line editing for the studio terminal (the daemon runs one command line at a time; there is no PTY).
// Pure logic, unit tested in terminal-line.test.ts.

/** A key or text chunk parsed from xterm's onData stream. */
export type TerminalKey =
  | { type: 'text'; text: string }
  | { type: 'enter' }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'wordLeft' }
  | { type: 'wordRight' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'interrupt' } // Ctrl+C
  | { type: 'clearScreen' } // Ctrl+L
  | { type: 'clearLine' } // Ctrl+U
  | { type: 'ignore' };

const ESCAPES: Record<string, TerminalKey['type']> = {
  '\x1b[A': 'up',
  '\x1bOA': 'up',
  '\x1b[B': 'down',
  '\x1bOB': 'down',
  '\x1b[C': 'right',
  '\x1bOC': 'right',
  '\x1b[D': 'left',
  '\x1bOD': 'left',
  '\x1b[H': 'home',
  '\x1bOH': 'home',
  '\x1b[1~': 'home',
  '\x1b[F': 'end',
  '\x1bOF': 'end',
  '\x1b[4~': 'end',
  '\x1b[3~': 'delete',
  '\x1b[1;5D': 'wordLeft',
  '\x1b[1;5C': 'wordRight',
  '\x1bb': 'wordLeft',
  '\x1bf': 'wordRight',
};

/** Splits xterm input data (single keys or pasted text) into keys. */
export function parseTerminalInput(data: string): TerminalKey[] {
  const keys: TerminalKey[] = [];
  let text = '';
  const flush = () => {
    if (text) keys.push({ type: 'text', text });
    text = '';
  };
  // Bracketed paste markers are removed; the pasted text is handled like typed text.
  const input = data.replace(/\x1b\[200~|\x1b\[201~/g, '');
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === '\x1b') {
      flush();
      // Longest known escape sequence first.
      let matched = false;
      for (const len of [6, 4, 3, 2]) {
        const seq = input.slice(i, i + len);
        const type = ESCAPES[seq];
        if (type) {
          keys.push({ type } as TerminalKey);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Unknown CSI/SS3 sequence: skip it completely.
        const m = /^\x1b(?:\[[0-?]*[ -/]*[@-~]|O.|.)?/.exec(input.slice(i));
        keys.push({ type: 'ignore' });
        i += m ? Math.max(1, m[0].length) : 1;
      }
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      flush();
      keys.push({ type: 'enter' });
      // Treat \r\n as one line break.
      if (ch === '\r' && input[i + 1] === '\n') i++;
      i++;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code === 0x7f || code === 0x08) {
      flush();
      keys.push({ type: 'backspace' });
    } else if (code === 0x03) {
      flush();
      keys.push({ type: 'interrupt' });
    } else if (code === 0x0c) {
      flush();
      keys.push({ type: 'clearScreen' });
    } else if (code === 0x15) {
      flush();
      keys.push({ type: 'clearLine' });
    } else if (code === 0x01) {
      flush();
      keys.push({ type: 'home' });
    } else if (code === 0x05) {
      flush();
      keys.push({ type: 'end' });
    } else if (code === 0x09) {
      // Tab completion is not available – insert nothing.
      flush();
      keys.push({ type: 'ignore' });
    } else if (code < 0x20) {
      flush();
      keys.push({ type: 'ignore' });
    } else {
      text += ch;
    }
    i++;
  }
  flush();
  return keys;
}

export const HISTORY_LIMIT = 100;

/** Editable input line with cursor and command history. */
export class LineEditor {
  buffer = '';
  cursor = 0;
  private history: string[];
  /** Position while browsing the history (history.length = the new line). */
  private historyPos: number;
  private draft = '';

  constructor(history: readonly string[] = []) {
    this.history = history.slice(-HISTORY_LIMIT);
    this.historyPos = this.history.length;
  }

  getHistory(): string[] {
    return [...this.history];
  }

  insert(text: string): void {
    this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
    this.cursor += text.length;
  }

  backspace(): boolean {
    if (this.cursor === 0) return false;
    this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
    this.cursor--;
    return true;
  }

  deleteForward(): boolean {
    if (this.cursor >= this.buffer.length) return false;
    this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
    return true;
  }

  left(): boolean {
    if (this.cursor === 0) return false;
    this.cursor--;
    return true;
  }

  right(): boolean {
    if (this.cursor >= this.buffer.length) return false;
    this.cursor++;
    return true;
  }

  wordLeft(): boolean {
    if (this.cursor === 0) return false;
    let i = this.cursor;
    while (i > 0 && this.buffer[i - 1] === ' ') i--;
    while (i > 0 && this.buffer[i - 1] !== ' ') i--;
    this.cursor = i;
    return true;
  }

  wordRight(): boolean {
    if (this.cursor >= this.buffer.length) return false;
    let i = this.cursor;
    while (i < this.buffer.length && this.buffer[i] === ' ') i++;
    while (i < this.buffer.length && this.buffer[i] !== ' ') i++;
    this.cursor = i;
    return true;
  }

  home(): boolean {
    if (this.cursor === 0) return false;
    this.cursor = 0;
    return true;
  }

  end(): boolean {
    if (this.cursor === this.buffer.length) return false;
    this.cursor = this.buffer.length;
    return true;
  }

  clear(): void {
    this.buffer = '';
    this.cursor = 0;
    this.historyPos = this.history.length;
    this.draft = '';
  }

  /** Older history entry (↑). Returns false when there is none. */
  historyUp(): boolean {
    if (this.historyPos === 0 || this.history.length === 0) return false;
    if (this.historyPos === this.history.length) this.draft = this.buffer;
    this.historyPos--;
    this.set(this.history[this.historyPos]);
    return true;
  }

  /** Newer history entry (↓); after the newest one the unsent draft comes back. */
  historyDown(): boolean {
    if (this.historyPos >= this.history.length) return false;
    this.historyPos++;
    this.set(this.historyPos === this.history.length ? this.draft : this.history[this.historyPos]);
    return true;
  }

  /** Takes the current line, stores it in the history (no duplicates in a row) and clears the input. */
  submit(): string {
    const line = this.buffer;
    if (line.trim() && this.history[this.history.length - 1] !== line) {
      this.history.push(line);
      if (this.history.length > HISTORY_LIMIT) this.history.splice(0, this.history.length - HISTORY_LIMIT);
    }
    this.clear();
    return line;
  }

  private set(text: string): void {
    this.buffer = text;
    this.cursor = text.length;
  }
}

/** Visible length of a string without ANSI escape sequences. */
export function visibleLength(text: string): number {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').length;
}

/** Row/column of an offset in a wrapped line (handles the "pending wrap" state at the right margin). */
function position(offset: number, cols: number, isEnd: boolean): { row: number; col: number } {
  if (isEnd && offset > 0 && offset % cols === 0) return { row: offset / cols - 1, col: cols - 1 };
  return { row: Math.floor(offset / cols), col: offset % cols };
}

export interface LineRenderState {
  /** Row of the cursor relative to the first row of the input line after the last render. */
  cursorRow: number;
}

/**
 * Escape sequence that redraws prompt + input (also when it wraps over several rows) and places the cursor.
 * `state` is updated with the new cursor row.
 */
export function renderInputLine(prompt: string, editor: Pick<LineEditor, 'buffer' | 'cursor'>, cols: number, state: LineRenderState): string {
  const width = Math.max(1, cols);
  const promptLen = visibleLength(prompt);
  const total = promptLen + editor.buffer.length;
  let out = '';
  if (state.cursorRow > 0) out += `\x1b[${state.cursorRow}A`;
  out += '\r\x1b[J';
  out += prompt + editor.buffer;
  const end = position(total, width, true);
  const atEnd = editor.cursor >= editor.buffer.length;
  const target = atEnd ? end : position(promptLen + editor.cursor, width, false);
  if (end.row > target.row) out += `\x1b[${end.row - target.row}A`;
  if (!atEnd || end.col !== target.col) {
    out += '\r';
    if (target.col > 0) out += `\x1b[${target.col}C`;
  }
  state.cursorRow = target.row;
  return out;
}

/** Wraps text in a 24-bit foreground color. */
export function colorize(text: string, hex: string): string {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m${text}\x1b[0m`;
}

/** Normalizes line breaks for xterm (\n -> \r\n, without doubling existing \r\n). */
export function toTerminalText(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}
