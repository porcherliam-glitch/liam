/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { FakeTerminal } from '../test-mocks';
import { stripAnsi } from '../studio-utils';
import { resetTerminalSessions } from '../terminal-session';
import { shortCwd, TerminalPanel } from './TerminalPanel';

vi.mock('@monaco-editor/react', async () => (await import('../test-mocks')).monacoReactModule);
vi.mock('../monaco-setup', async () => (await import('../test-mocks')).monacoSetupModule);
vi.mock('@xterm/xterm', async () => (await import('../test-mocks')).xtermModule);
vi.mock('@xterm/addon-fit', async () => (await import('../test-mocks')).fitAddonModule);

setupRendererTest();

beforeEach(() => {
  resetTerminalSessions();
  FakeTerminal.instances = [];
});

const ROOT = 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Pixel-Abenteuer';

async function renderTerminal() {
  const view = renderWithRouter(<TerminalPanel projectId="prj_pixel" projectRoot={ROOT} active />);
  await screen.findByText('Bereit');
  const term = FakeTerminal.current();
  if (!term) throw new Error('no terminal');
  return { view, term, sessionId: getMockDb().terminals.at(-1)?.id as string };
}

/** The prompt with the current input: text of the last redraw (it starts with "\r ESC[J"; a trailing "\r" only moves the cursor). */
const lastLine = (term: FakeTerminal) => {
  const start = term.output.lastIndexOf('\r\x1b[J');
  const tail = start >= 0 ? term.output.slice(start + 4) : term.output;
  return stripAnsi(tail.split('\r')[0]);
};

describe('TerminalPanel', () => {
  it('opens one session for the project, runs typed commands and prints their output', async () => {
    const { term, sessionId } = await renderTerminal();
    expect(getMockCalls('terminal.create').map((c) => c.params)).toEqual([{ projectId: 'prj_pixel' }]);
    expect(term.text).toContain('Terminal im Projektordner (powershell)');
    expect(lastLine(term)).toBe('Pixel-Abenteuer> ');

    act(() => term.type('node --version'));
    expect(lastLine(term)).toBe('Pixel-Abenteuer> node --version');
    act(() => term.type('\r'));
    await waitFor(() => expect(getMockCalls('terminal.run').map((c) => c.params)).toEqual([{ sessionId, line: 'node --version' }]));
    await waitFor(() => expect(term.text).toContain('v22.14.0'));
    await waitFor(() => expect(lastLine(term)).toBe('Pixel-Abenteuer> '));
  });

  it('shows stderr and the exit code of failed commands and follows cd', async () => {
    const { term } = await renderTerminal();
    act(() => term.type('cd src\r'));
    await waitFor(() => expect(lastLine(term)).toBe('Pixel-Abenteuer\\src> '));
    act(() => term.type('cd gibtsnicht\r'));
    await waitFor(() => expect(term.text).toContain('cd: Der Ordner „gibtsnicht“ wurde nicht gefunden.'));
    expect(term.text).toContain('(Beendet mit Code 1)');
  });

  it('edits the line with the cursor and browses the history with the arrow keys', async () => {
    const { term, sessionId } = await renderTerminal();
    act(() => term.type('echo hallo\r'));
    await waitFor(() => expect(term.text).toContain('hallo'));
    act(() => term.type('\x1b[A'));
    expect(lastLine(term)).toBe('Pixel-Abenteuer> echo hallo');
    // Cursor five to the left (before "hallo"), insert text in the middle.
    act(() => term.type('\x1b[D\x1b[D\x1b[D\x1b[D\x1b[D'));
    act(() => term.type('du '));
    expect(lastLine(term)).toBe('Pixel-Abenteuer> echo du hallo');
    act(() => term.type('\r'));
    await waitFor(() => expect(getMockCalls('terminal.run').at(-1)?.params).toEqual({ sessionId, line: 'echo du hallo' }));
    expect(JSON.parse(localStorage.getItem('nova.studio.terminalHistory.prj_pixel') ?? '[]')).toEqual(['echo hallo', 'echo du hallo']);
  });

  it('interrupts a running command with Strg+C and explains that input does not reach programs', async () => {
    mockHandlers.set('terminal.run', () => ({ accepted: true }));
    const { term, sessionId } = await renderTerminal();
    act(() => term.type('npm run dev\r'));
    expect(await screen.findByText('Befehl läuft')).toBeTruthy();
    act(() => term.type('j'));
    expect(term.text).toContain('interaktive Programme werden nicht unterstützt');

    act(() => term.type('\x03'));
    await waitFor(() => expect(getMockCalls('terminal.interrupt').map((c) => c.params)).toEqual([{ sessionId }]));
    act(() => emitMockEvent({ type: 'terminal.exit', payload: { sessionId, projectId: 'prj_pixel', exitCode: null, cwd: ROOT } }));
    expect(await screen.findByText('Bereit')).toBeTruthy();
    expect(term.text).toContain('(Abgebrochen)');
  });

  it('interrupts with the toolbar button as well', async () => {
    mockHandlers.set('terminal.run', () => ({ accepted: true }));
    const { term, sessionId } = await renderTerminal();
    act(() => term.type('npm test\r'));
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(getMockCalls('terminal.interrupt')[0]?.params).toEqual({ sessionId }));
  });

  it('always shows the note about interactive programs', async () => {
    await renderTerminal();
    expect(screen.getByText(/Interaktive Programme werden nicht unterstützt/)).toBeTruthy();
  });

  it('shows an error when the session cannot be created and retries', async () => {
    mockHandlers.set('terminal.create', () => {
      throw new MockRpcError('TOOL_MISSING', 'PowerShell wurde nicht gefunden.');
    });
    renderWithRouter(<TerminalPanel projectId="prj_pixel" projectRoot={ROOT} active />);
    expect(await screen.findByText('Das Terminal konnte nicht gestartet werden')).toBeTruthy();
    expect(screen.getByText('PowerShell wurde nicht gefunden.')).toBeTruthy();
    mockHandlers.delete('terminal.create');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText('Bereit')).toBeTruthy();
  });

  it('restarts the session on request and closes the session when the panel goes away', async () => {
    const { view, sessionId } = await renderTerminal();
    await userEvent.click(screen.getByRole('button', { name: 'Neu starten' }));
    await waitFor(() => expect(getMockCalls('terminal.create')).toHaveLength(2));
    await waitFor(() => expect(getMockCalls('terminal.close').map((c) => c.params)).toEqual([{ sessionId }]));
    await screen.findByText('Bereit');
    const second = getMockDb().terminals.at(-1)?.id;
    view.unmount();
    await waitFor(() => expect(getMockCalls('terminal.close').map((c) => c.params)).toEqual([{ sessionId }, { sessionId: second }]));
  });

  it('starts a new session when the daemon lost the old one', async () => {
    const { term } = await renderTerminal();
    getMockDb().terminals = [];
    act(() => term.type('echo weg\r'));
    await waitFor(() => expect(term.text).toContain('Die Terminal-Sitzung war beendet.'));
    await waitFor(() => expect(getMockCalls('terminal.create')).toHaveLength(2));
  });

  it('shortens the prompt inside the project folder', () => {
    expect(shortCwd(`${ROOT}\\src`, ROOT)).toBe('Pixel-Abenteuer\\src');
    expect(shortCwd('D:\\Anderswo', ROOT)).toBe('D:\\Anderswo');
    expect(shortCwd('', ROOT)).toBe('Pixel-Abenteuer');
  });
});
