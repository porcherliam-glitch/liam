import { describe, expect, it } from 'vitest';
import { colorize, HISTORY_LIMIT, LineEditor, parseTerminalInput, renderInputLine, toTerminalText, visibleLength } from './terminal-line';

describe('parseTerminalInput', () => {
  it('splits typed keys and escape sequences', () => {
    expect(parseTerminalInput('ls')).toEqual([{ type: 'text', text: 'ls' }]);
    expect(parseTerminalInput('\r')).toEqual([{ type: 'enter' }]);
    expect(parseTerminalInput('\x7f')).toEqual([{ type: 'backspace' }]);
    expect(parseTerminalInput('\x1b[A\x1b[B\x1b[C\x1b[D')).toEqual([{ type: 'up' }, { type: 'down' }, { type: 'right' }, { type: 'left' }]);
    expect(parseTerminalInput('\x1b[1;5D\x1b[3~\x1b[H\x1b[F')).toEqual([{ type: 'wordLeft' }, { type: 'delete' }, { type: 'home' }, { type: 'end' }]);
    expect(parseTerminalInput('\x03')).toEqual([{ type: 'interrupt' }]);
    expect(parseTerminalInput('\x0c\x15')).toEqual([{ type: 'clearScreen' }, { type: 'clearLine' }]);
  });

  it('handles pasted multi-line text and bracketed paste markers', () => {
    expect(parseTerminalInput('\x1b[200~npm test\r\nnpm run build\x1b[201~')).toEqual([
      { type: 'text', text: 'npm test' },
      { type: 'enter' },
      { type: 'text', text: 'npm run build' },
    ]);
  });

  it('skips unknown sequences and tab', () => {
    expect(parseTerminalInput('a\x1b[15~b\tc')).toEqual([{ type: 'text', text: 'a' }, { type: 'ignore' }, { type: 'text', text: 'b' }, { type: 'ignore' }, { type: 'text', text: 'c' }]);
  });
});

describe('LineEditor', () => {
  it('edits with a cursor', () => {
    const ed = new LineEditor();
    ed.insert('npm tst');
    ed.left();
    ed.left();
    ed.insert('e');
    expect(ed.buffer).toBe('npm test');
    expect(ed.cursor).toBe(6);
    ed.home();
    ed.deleteForward();
    expect(ed.buffer).toBe('pm test');
    ed.end();
    ed.backspace();
    expect(ed.buffer).toBe('pm tes');
    ed.wordLeft();
    expect(ed.cursor).toBe(3);
    ed.wordRight();
    expect(ed.cursor).toBe(6);
    expect(ed.left()).toBe(true);
    ed.home();
    expect(ed.left()).toBe(false);
  });

  it('browses the history and restores the unsent draft', () => {
    const ed = new LineEditor(['npm test']);
    ed.insert('git status');
    expect(ed.submit()).toBe('git status');
    ed.insert('entwurf');
    expect(ed.historyUp()).toBe(true);
    expect(ed.buffer).toBe('git status');
    ed.historyUp();
    expect(ed.buffer).toBe('npm test');
    expect(ed.historyUp()).toBe(false);
    ed.historyDown();
    ed.historyDown();
    expect(ed.buffer).toBe('entwurf');
    expect(ed.historyDown()).toBe(false);
  });

  it('does not store empty lines or direct repeats and caps the history', () => {
    const ed = new LineEditor();
    ed.submit();
    ed.insert('ls');
    ed.submit();
    ed.insert('ls');
    ed.submit();
    expect(ed.getHistory()).toEqual(['ls']);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) {
      ed.insert(`echo ${i}`);
      ed.submit();
    }
    expect(ed.getHistory()).toHaveLength(HISTORY_LIMIT);
    expect(ed.getHistory().at(-1)).toBe(`echo ${HISTORY_LIMIT + 9}`);
  });
});

describe('rendering', () => {
  it('measures visible length without colors', () => {
    expect(visibleLength(colorize('Spiel>', '#c4b5fd'))).toBe(6);
  });

  it('redraws the input line and positions the cursor', () => {
    const state = { cursorRow: 0 };
    const ed = new LineEditor();
    ed.insert('abc');
    ed.left();
    const out = renderInputLine('> ', ed, 80, state);
    expect(out.startsWith('\r\x1b[J> abc')).toBe(true);
    // Cursor moves back to column 4 (prompt 2 + 2 characters).
    expect(out.endsWith('\r\x1b[4C')).toBe(true);
    expect(state.cursorRow).toBe(0);
  });

  it('tracks wrapped input over several rows', () => {
    const state = { cursorRow: 0 };
    const ed = new LineEditor();
    ed.insert('x'.repeat(25));
    renderInputLine('> ', ed, 10, state);
    expect(state.cursorRow).toBe(2);
    const again = renderInputLine('> ', ed, 10, state);
    expect(again.startsWith('\x1b[2A\r\x1b[J')).toBe(true);
  });

  it('normalizes line breaks for xterm', () => {
    expect(toTerminalText('a\nb\r\nc')).toBe('a\r\nb\r\nc');
  });
});
