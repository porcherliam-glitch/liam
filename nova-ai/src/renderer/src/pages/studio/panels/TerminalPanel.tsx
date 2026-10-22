// Project terminal: xterm.js display with local line editing (cursor, history ↑/↓), commands run one line at a
// time in the daemon (terminal.run), output via terminal.output events, Ctrl+C → terminal.interrupt.
// There is no PTY, so interactive programs cannot receive input – the panel says so clearly.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Eraser, Info, RotateCw, Square, SquareTerminal } from 'lucide-react';
import type { TerminalSession } from '@shared/schemas';
import { Button, copyToClipboard, ErrorState, Spinner, StatusDot } from '../../../components/ui';
import { useNovaEvent } from '../../../hooks';
import { api, errorMessage, isRpcError } from '../../../lib/api';
import { basename } from '../../../lib/format';
import { toast } from '../../../stores/toasts';
import { EDITOR_FONT } from '../CodeEditor';
import { acquireTerminalSession, releaseTerminalSession, restartTerminalSession } from '../terminal-session';
import { colorize, LineEditor, parseTerminalInput, renderInputLine, toTerminalText, type LineRenderState, type TerminalKey } from '../terminal-line';

export interface TerminalPanelProps {
  projectId: string;
  /** Absolute project folder (to shorten the prompt). */
  projectRoot: string;
  /** Panel is visible (fit + focus when it becomes visible). */
  active: boolean;
}

export const TERMINAL_THEME: ITheme = {
  background: '#0b0d14',
  foreground: '#e6e8f0',
  cursor: '#c4b5fd',
  cursorAccent: '#0b0d14',
  selectionBackground: '#8b5cf655',
  black: '#171b26',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c4b5fd',
  cyan: '#7dd3fc',
  white: '#e6e8f0',
  brightBlack: '#6b7389',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#ddd6fe',
  brightCyan: '#bae6fd',
  brightWhite: '#ffffff',
};

const COLOR_PROMPT = '#c4b5fd';
const COLOR_STDERR = '#fca5a5';
const COLOR_SYSTEM = '#8b93a7';

const HISTORY_KEY = (projectId: string) => `nova.studio.terminalHistory.${projectId}`;

function readHistory(projectId: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(HISTORY_KEY(projectId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeHistory(projectId: string, history: string[]): void {
  try {
    globalThis.localStorage?.setItem(HISTORY_KEY(projectId), JSON.stringify(history));
  } catch {
    /* storage unavailable */
  }
}

/** "C:\\Projekte\\Spiel\\src" -> "Spiel\\src" (shorter prompt inside the project folder). */
export function shortCwd(cwd: string, projectRoot: string): string {
  if (!cwd) return basename(projectRoot) || projectRoot;
  const root = projectRoot.replace(/[\\/]+$/, '');
  if (root && cwd.toLowerCase().startsWith(root.toLowerCase())) return `${basename(root)}${cwd.slice(root.length)}`;
  return cwd;
}

type Status = 'connecting' | 'ready' | 'error';

export function TerminalPanel({ projectId, projectRoot, active }: TerminalPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const editorRef = useRef(new LineEditor(readHistory(projectId)));
  const renderState = useRef<LineRenderState>({ cursorRow: 0 });
  const sessionRef = useRef<TerminalSession | null>(null);
  const busyRef = useRef(false);
  const statusRef = useRef<Status>('connecting');
  const cwdRef = useRef('');
  const endsWithNewline = useRef(true);
  const hinted = useRef(false);
  const queue = useRef<string[]>([]);
  const pendingText = useRef('');
  const interruptCheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatusState] = useState<Status>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusyState] = useState(false);
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [cwd, setCwdState] = useState('');

  const setStatus = (s: Status) => {
    statusRef.current = s;
    setStatusState(s);
  };
  const setBusy = (b: boolean) => {
    busyRef.current = b;
    setBusyState(b);
  };
  const setCwd = (c: string) => {
    cwdRef.current = c;
    setCwdState(c);
  };

  const write = (data: string) => termRef.current?.write(data);

  const promptText = () => `${colorize(`${shortCwd(cwdRef.current, projectRoot)}>`, COLOR_PROMPT)} `;

  const drawInput = () => {
    const term = termRef.current;
    if (!term) return;
    term.write(renderInputLine(promptText(), editorRef.current, term.cols || 80, renderState.current));
  };

  /** Starts a fresh prompt on a new line. */
  const prompt = () => {
    renderState.current.cursorRow = 0;
    drawInput();
  };

  const writeSystem = (text: string) => {
    if (!endsWithNewline.current) write('\r\n');
    write(`${colorize(toTerminalText(text), COLOR_SYSTEM)}\r\n`);
    endsWithNewline.current = true;
  };

  /** Removes the input line (before writing output while no command runs). */
  const eraseInput = () => {
    const rows = renderState.current.cursorRow;
    write(`${rows > 0 ? `\x1b[${rows}A` : ''}\r\x1b[J`);
    renderState.current.cursorRow = 0;
  };

  const persistHistory = () => writeHistory(projectId, editorRef.current.getHistory());

  const runNextQueued = () => {
    const next = queue.current.shift();
    if (next === undefined) {
      if (pendingText.current) {
        editorRef.current.insert(pendingText.current);
        pendingText.current = '';
        drawInput();
      }
      return;
    }
    editorRef.current.clear();
    editorRef.current.insert(next);
    drawInput();
    submit();
  };

  const runLine = async (line: string) => {
    const s = sessionRef.current;
    if (!s) return;
    setBusy(true);
    hinted.current = false;
    endsWithNewline.current = true;
    try {
      const res = await api('terminal.run', { sessionId: s.id, line });
      if (!res.accepted && busyRef.current && sessionRef.current?.id === s.id) {
        setBusy(false);
        writeSystem('Es läuft bereits ein Befehl. Bitte warten oder mit Strg+C abbrechen.');
        prompt();
      }
    } catch (e) {
      if (sessionRef.current?.id !== s.id) return;
      setBusy(false);
      if (isRpcError(e, 'NOT_FOUND')) {
        writeSystem('Die Terminal-Sitzung war beendet. Eine neue Sitzung wird gestartet – bitte den Befehl erneut eingeben.');
        await restart(false);
        return;
      }
      writeSystem(`Der Befehl konnte nicht gestartet werden: ${errorMessage(e)}`);
      prompt();
    }
  };

  const submit = () => {
    const line = editorRef.current.submit();
    persistHistory();
    write('\r\n');
    renderState.current.cursorRow = 0;
    if (!line.trim()) {
      prompt();
      runNextQueued();
      return;
    }
    if (/^\s*(cls|clear)\s*$/i.test(line)) {
      termRef.current?.clear();
      write('\x1b[2K\r');
      prompt();
      runNextQueued();
      return;
    }
    void runLine(line);
  };

  const interrupt = () => {
    const s = sessionRef.current;
    if (!s || statusRef.current !== 'ready') return;
    if (!busyRef.current) {
      queue.current = [];
      pendingText.current = '';
      write('^C\r\n');
      editorRef.current.clear();
      prompt();
      return;
    }
    queue.current = [];
    pendingText.current = '';
    api('terminal.interrupt', { sessionId: s.id }).catch((e) => toast.error('Abbrechen nicht möglich', errorMessage(e)));
    // If the exit event got lost (e.g. reconnect), ask the daemon whether the session is still busy.
    if (interruptCheck.current) clearTimeout(interruptCheck.current);
    interruptCheck.current = setTimeout(() => {
      if (!busyRef.current || sessionRef.current?.id !== s.id) return;
      api('terminal.list', { projectId })
        .then((list) => {
          const current = list.find((t) => t.id === s.id);
          if (busyRef.current && current && !current.busy) {
            setBusy(false);
            setCwd(current.cwd);
            writeSystem('(Abgebrochen)');
            prompt();
          }
        })
        .catch(() => {});
    }, 2500);
  };

  /** Pasted text after the current command: every line runs when the previous one has finished. */
  const queueLines = (rest: TerminalKey[]) => {
    let line = '';
    for (const k of rest) {
      if (k.type === 'text') line += k.text;
      else if (k.type === 'enter') {
        queue.current.push(line);
        line = '';
      }
    }
    // Text after the last line break stays in the input line (it is not run automatically).
    pendingText.current += line;
  };

  const handleData = (data: string) => {
    const pasted = data.length > 1 && !data.startsWith('\x1b');
    const keys = parseTerminalInput(data);
    const editor = editorRef.current;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (key.type === 'interrupt') {
        interrupt();
        continue;
      }
      if (statusRef.current !== 'ready') continue;
      if (busyRef.current) {
        if (pasted) {
          // Keep pasted lines and run them one after another.
          queueLines(keys.slice(i));
          break;
        }
        if (key.type !== 'ignore' && !hinted.current) {
          hinted.current = true;
          writeSystem('Während ein Befehl läuft, kommen Eingaben nicht beim Programm an (interaktive Programme werden nicht unterstützt). Strg+C bricht den Befehl ab.');
        }
        continue;
      }
      let redraw = false;
      switch (key.type) {
        case 'text':
          editor.insert(key.text);
          redraw = true;
          break;
        case 'enter':
          submit();
          if (busyRef.current && pasted) {
            // The remaining pasted text waits for the command to finish.
            queueLines(keys.slice(i + 1));
            return;
          }
          break;
        case 'backspace':
          redraw = editor.backspace();
          break;
        case 'delete':
          redraw = editor.deleteForward();
          break;
        case 'left':
          redraw = editor.left();
          break;
        case 'right':
          redraw = editor.right();
          break;
        case 'wordLeft':
          redraw = editor.wordLeft();
          break;
        case 'wordRight':
          redraw = editor.wordRight();
          break;
        case 'home':
          redraw = editor.home();
          break;
        case 'end':
          redraw = editor.end();
          break;
        case 'up':
          redraw = editor.historyUp();
          break;
        case 'down':
          redraw = editor.historyDown();
          break;
        case 'clearLine':
          editor.clear();
          redraw = true;
          break;
        case 'clearScreen':
          termRef.current?.clear();
          renderState.current.cursorRow = 0;
          redraw = true;
          break;
        default:
          break;
      }
      if (redraw) drawInput();
    }
  };

  const handleOutput = (stream: 'stdout' | 'stderr' | 'system', data: string) => {
    if (!data) return;
    const idle = !busyRef.current;
    if (idle) eraseInput();
    const text = toTerminalText(data);
    write(stream === 'stderr' ? colorize(text, COLOR_STDERR) : stream === 'system' ? colorize(text, COLOR_SYSTEM) : text);
    endsWithNewline.current = /\n$/.test(data);
    if (idle) {
      if (!endsWithNewline.current) write('\r\n');
      endsWithNewline.current = true;
      prompt();
    }
  };

  const handleExit = (exitCode: number | null, newCwd: string) => {
    if (newCwd) setCwd(newCwd);
    if (!busyRef.current) return;
    if (interruptCheck.current) clearTimeout(interruptCheck.current);
    setBusy(false);
    if (!endsWithNewline.current) write('\r\n');
    endsWithNewline.current = true;
    if (exitCode === null) write(`${colorize('(Abgebrochen)', COLOR_SYSTEM)}\r\n`);
    else if (exitCode !== 0) write(`${colorize(`(Beendet mit Code ${exitCode})`, COLOR_SYSTEM)}\r\n`);
    prompt();
    runNextQueued();
  };

  // Keep the latest handlers for the long-lived xterm/event subscriptions.
  const handlers = useRef({ handleData, handleOutput, handleExit });
  handlers.current = { handleData, handleOutput, handleExit };

  const welcome = (s: TerminalSession) => {
    writeSystem(`Terminal im Projektordner (${s.shell}). Befehle laufen nacheinander, Strg+C bricht ab, ↑/↓ blättert durch frühere Befehle.`);
  };

  const attach = (s: TerminalSession) => {
    sessionRef.current = s;
    setSession(s);
    setCwd(s.cwd);
    setError(null);
    setStatus('ready');
    setBusy(false);
    queue.current = [];
    pendingText.current = '';
    welcome(s);
    prompt();
  };

  const restart = useCallback(
    async (clearScreen: boolean) => {
      setStatus('connecting');
      setBusy(false);
      sessionRef.current = null;
      if (clearScreen) termRef.current?.reset();
      try {
        const s = await restartTerminalSession(projectId);
        attach(s);
      } catch (e) {
        setStatus('error');
        setError(errorMessage(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId],
  );

  const fit = useCallback(() => {
    const term = termRef.current;
    const fitAddon = fitRef.current;
    const el = containerRef.current;
    if (!term || !fitAddon || !el || el.clientWidth === 0 || el.clientHeight === 0) return;
    try {
      const dims = fitAddon.proposeDimensions();
      if (dims && dims.cols > 0 && dims.rows > 0 && (dims.cols !== term.cols || dims.rows !== term.rows)) fitAddon.fit();
    } catch {
      /* not measurable yet */
    }
  }, []);

  // xterm instance (one per mounted panel).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    editorRef.current = new LineEditor(readHistory(projectId));
    const term = new Terminal({
      fontFamily: EDITOR_FONT,
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      theme: TERMINAL_THEME,
      allowProposedApi: false,
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    termRef.current = term;
    fitRef.current = fitAddon;
    term.attachCustomKeyEventHandler((e) => {
      // Copy the selection with Ctrl+C instead of interrupting.
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'c' && term.hasSelection()) {
        void copyToClipboard(term.getSelection());
        term.clearSelection();
        return false;
      }
      return true;
    });
    const dataSub = term.onData((data) => handlers.current.handleData(data));
    const raf = requestAnimationFrame(fit);
    let observer: ResizeObserver | null = null;
    let resizeRaf = 0;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(fit);
      });
      observer.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeRaf);
      observer?.disconnect();
      dataSub.dispose();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [projectId, fit]);

  // Session of the project (kept while the studio is open).
  useEffect(() => {
    let cancelled = false;
    setStatus('connecting');
    acquireTerminalSession(projectId)
      .then((s) => {
        if (!cancelled) attach(s);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(errorMessage(e));
      });
    return () => {
      cancelled = true;
      if (interruptCheck.current) clearTimeout(interruptCheck.current);
      sessionRef.current = null;
      releaseTerminalSession(projectId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useNovaEvent('terminal.output', (p) => {
    if (p.sessionId === sessionRef.current?.id) handlers.current.handleOutput(p.stream, p.data);
  });
  useNovaEvent('terminal.exit', (p) => {
    if (p.sessionId === sessionRef.current?.id) handlers.current.handleExit(p.exitCode, p.cwd);
  });

  // Fit and focus when the panel becomes visible.
  useEffect(() => {
    if (!active) return;
    const raf = requestAnimationFrame(() => {
      fit();
      termRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [active, fit]);

  const clearScreen = () => {
    termRef.current?.clear();
    if (!busyRef.current && statusRef.current === 'ready') {
      write('\x1b[2K\r');
      prompt();
    }
    termRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <SquareTerminal aria-hidden className="h-4 w-4 shrink-0" />
          {session ? <span className="shrink-0">{session.shell}</span> : null}
          {cwd && (
            <span className="min-w-0 truncate font-mono text-[11px] text-subtle" title={cwd}>
              {cwd}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1.5 text-xs" role="status">
          {status === 'connecting' ? (
            <>
              <Spinner size="xs" label={null} /> <span className="text-muted">Verbindet …</span>
            </>
          ) : status === 'error' ? (
            <>
              <StatusDot tone="danger" /> <span className="text-danger-fg">Nicht verbunden</span>
            </>
          ) : busy ? (
            <>
              <Spinner size="xs" label={null} className="text-blue-fg" /> <span className="text-blue-fg">Befehl läuft</span>
            </>
          ) : (
            <>
              <StatusDot tone="success" /> <span className="text-muted">Bereit</span>
            </>
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" icon={Square} disabled={!busy} onClick={interrupt} title="Laufenden Befehl abbrechen (Strg+C)">
            Abbrechen
          </Button>
          <Button size="sm" variant="ghost" icon={Eraser} onClick={clearScreen} title="Bildschirm leeren (Strg+L)">
            Leeren
          </Button>
          <Button size="sm" variant="ghost" icon={RotateCw} disabled={status === 'connecting'} onClick={() => void restart(true)} title="Neue Terminal-Sitzung starten">
            Neu starten
          </Button>
        </div>
      </div>
      <p className="flex shrink-0 items-start gap-1.5 border-b border-border bg-info/5 px-3 py-1 text-[11px] text-info-fg">
        <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
        Interaktive Programme werden nicht unterstützt: Eingaben während eines laufenden Befehls kommen nicht beim Programm an. Befehle, die auf eine Eingabe warten, mit Strg+C abbrechen.
      </p>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} role="region" aria-label="Terminal" className="nova-terminal absolute inset-0" onClick={() => termRef.current?.focus()} />
        {status === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg/90">
            <ErrorState compact error={error ?? 'Unbekannter Fehler'} title="Das Terminal konnte nicht gestartet werden" onRetry={() => void restart(true)} />
          </div>
        )}
      </div>
    </div>
  );
}
