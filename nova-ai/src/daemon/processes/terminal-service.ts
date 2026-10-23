// TerminalService: per-project terminal sessions for the studio (SPEC §4.3, §6.3, contract TerminalService).
// Key decisions:
// - One line at a time: Windows runs it through PowerShell (-EncodedCommand, UTF-8 output), other systems through
//   `bash -lc` (fallback `sh -c`) – via ProcessManager with kind 'terminal' and shell 'powershell' (user action → no
//   CommandPolicy, no approvals). A second line while one runs is rejected with accepted=false.
// - `cd` / `chdir` / `Set-Location` / `sl` are handled internally (the child process cannot change our directory):
//   `cd` alone or `cd ~` → project root, `cd -` → previous folder, `cd /d X` (cmd) and `-Path`/`-LiteralPath` are
//   understood. The target must exist and stay inside the project folder (realpath, case-insensitive on Windows),
//   otherwise a German message is shown and the folder stays. Chained lines (`cd x && …`) go to the shell unchanged.
// - `cls` / `clear` / `Clear-Host` → system output "\u001bc" (the UI clears xterm).
// - Output → 'terminal.output' (redacted), end → 'terminal.exit' {exitCode, cwd}; busy is cleared before the exit event
//   so the UI can send the next line right away. Lines run at most 8 hours (configurable) and wait for a free process
//   slot like every counted process (a German hint is shown while waiting).
// - Sessions live in memory only (a daemon restart ends them); at most 8 per project.
// Honest limit: no PTY (no native modules) – interactive programs that need a real console are not supported.
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import type { TerminalSession } from '@shared/schemas';
import type { Services, TerminalService } from '../contracts';
import { NovaError, errorMessage, notFound, validation } from '../core/errors';
import { newId } from '../core/ids';
import { redactString } from '../core/redact';
import { findBash } from './shell';

export interface TerminalServiceOptions {
  /** Defaults to s.core.platform. */
  platform?: NodeJS.Platform;
  /** POSIX shell override for tests (null = sh). */
  bashPath?: string | null;
  maxSessionsPerProject?: number;
  /** Maximum run time of one line (default 8 h). */
  lineTimeoutMs?: number;
}

interface Session {
  id: string;
  projectId: string;
  root: string;
  cwd: string;
  prevCwd: string | null;
  shell: string;
  busy: boolean;
  createdAt: number;
  controller: AbortController | null;
  closed: boolean;
}

export const CLEAR_SCREEN = '\u001bc';
const NL = '\r\n';

/** Splits a simple command line into words (quotes removed). Returns null when the line has shell operators. */
export function splitSimpleLine(line: string): string[] | null {
  const words: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of line) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
      continue;
    }
    if (/[&|;<>`$()]/.test(ch)) return null;
    if (/\s/.test(ch)) {
      if (has || cur) words.push(cur);
      cur = '';
      has = false;
      continue;
    }
    cur += ch;
    has = true;
  }
  if (quote) return null;
  if (has || cur) words.push(cur);
  return words;
}

const CD_COMMANDS = new Set(['cd', 'chdir', 'set-location', 'sl']);
const CLEAR_COMMANDS = new Set(['cls', 'clear', 'clear-host']);

/** Recognised internal command, or null. Exported for tests. */
export function parseBuiltin(line: string): { kind: 'clear' } | { kind: 'cd'; target: string | null } | null {
  const trimmed = line.trim();
  // `cd..` / `cd\` (cmd shorthand without a space)
  const compact = /^(cd|chdir)(\.\.|\\|\/)$/i.exec(trimmed);
  if (compact) return { kind: 'cd', target: compact[2] };
  const words = splitSimpleLine(trimmed);
  if (!words || words.length === 0) return null;
  const cmd = words[0].toLowerCase();
  if (CLEAR_COMMANDS.has(cmd) && words.length === 1) return { kind: 'clear' };
  if (!CD_COMMANDS.has(cmd)) return null;
  const args = words.slice(1).filter((w) => !/^\/d$/i.test(w) && !/^-(path|literalpath)$/i.test(w));
  if (args.length > 1) return null; // unusual form → let the shell report it
  return { kind: 'cd', target: args[0] ?? null };
}

export function createTerminalService(s: Services, opts: TerminalServiceOptions = {}): TerminalService {
  const core = s.core;
  const platform = opts.platform ?? core.platform;
  const log = core.log.child('terminal');
  const maxSessions = Math.max(1, opts.maxSessionsPerProject ?? 8);
  const lineTimeoutMs = Math.max(1000, opts.lineTimeoutMs ?? 8 * 60 * 60 * 1000);
  const sessions = new Map<string, Session>();

  const shellName = (): string => {
    if (platform === 'win32') return 'powershell';
    const bash = opts.bashPath === undefined ? findBash() : opts.bashPath;
    return bash ? 'bash' : 'sh';
  };

  const toPublic = (x: Session): TerminalSession => ({ id: x.id, projectId: x.projectId, cwd: x.cwd, shell: x.shell, busy: x.busy, createdAt: x.createdAt });

  function emitOutput(x: Session, stream: 'stdout' | 'stderr' | 'system', data: string): void {
    if (x.closed || !data) return;
    core.bus.emit('terminal.output', { sessionId: x.id, projectId: x.projectId, stream, data: stream === 'system' ? data : redactString(data) });
  }

  function emitExit(x: Session, exitCode: number | null): void {
    if (x.closed) return;
    core.bus.emit('terminal.exit', { sessionId: x.id, projectId: x.projectId, exitCode, cwd: x.cwd });
  }

  function require(sessionId: string): Session {
    const x = sessions.get(sessionId);
    if (!x) throw notFound('Das Terminal', sessionId);
    return x;
  }

  const sameOrInside = (root: string, p: string): boolean => {
    const a = platform === 'win32' ? root.toLowerCase() : root;
    const b = platform === 'win32' ? p.toLowerCase() : p;
    if (a === b) return true;
    const rel = relative(a, b);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  };

  function changeDirectory(x: Session, target: string | null): void {
    let wanted: string;
    if (target === null || target === '~' || target === '') wanted = x.root;
    else if (target === '-') wanted = x.prevCwd ?? x.cwd;
    else if (target.startsWith('~/') || target.startsWith('~\\')) wanted = resolve(x.root, target.slice(2));
    else wanted = resolve(x.cwd, target);
    let real: string;
    try {
      if (!statSync(wanted).isDirectory()) {
        emitOutput(x, 'system', `Das ist kein Ordner: ${target ?? wanted}${NL}`);
        return emitExit(x, 1);
      }
      real = realpathSync.native(wanted);
    } catch {
      emitOutput(x, 'system', `Ordner nicht gefunden: ${target ?? wanted}${NL}`);
      return emitExit(x, 1);
    }
    if (!sameOrInside(x.root, real)) {
      emitOutput(x, 'system', `Das Terminal bleibt im Projektordner – „${target}“ liegt außerhalb.${NL}`);
      return emitExit(x, 1);
    }
    if (real !== x.cwd) {
      x.prevCwd = x.cwd;
      x.cwd = real;
    }
    emitExit(x, 0);
  }

  function execute(x: Session, line: string): void {
    x.busy = true;
    const controller = new AbortController();
    x.controller = controller;
    try {
      const gate = s.governor.canStartProcess();
      if (!gate.ok) emitOutput(x, 'system', `Wartet auf einen freien Prozessplatz: ${gate.reason ?? 'Grenze erreicht.'}${NL}`);
    } catch {
      /* governor unavailable – ProcessManager decides */
    }
    void s.processes
      .run({
        command: line,
        cwd: x.cwd,
        projectId: x.projectId,
        taskId: null,
        kind: 'terminal',
        shell: 'powershell',
        signal: controller.signal,
        timeoutMs: lineTimeoutMs,
        onOutput: (stream, chunk) => emitOutput(x, stream, chunk),
      })
      .then(
        (res) => {
          if (res.timedOut) emitOutput(x, 'system', `${NL}Zeitlimit erreicht – der Befehl wurde beendet.${NL}`);
          else if (res.cancelled) emitOutput(x, 'system', `^C${NL}`);
          return res.exitCode;
        },
        (err: unknown) => {
          const message = err instanceof NovaError ? err.message : `Der Befehl konnte nicht ausgeführt werden: ${errorMessage(err)}`;
          emitOutput(x, 'system', `${message}${NL}`);
          if (!(err instanceof NovaError)) log.warn('Terminalzeile fehlgeschlagen', { sessionId: x.id, error: errorMessage(err) });
          return null;
        },
      )
      .then((exitCode) => {
        if (x.controller === controller) x.controller = null;
        x.busy = false;
        emitExit(x, exitCode);
      });
  }

  function closeSession(x: Session): void {
    if (x.closed) return;
    x.closed = true;
    sessions.delete(x.id);
    if (x.controller) {
      x.controller.abort();
      x.controller = null;
    }
  }

  return {
    create(projectId) {
      const project = s.projects.require(projectId);
      let root: string;
      try {
        root = realpathSync.native(project.path);
        if (!statSync(root).isDirectory()) throw new Error('not a directory');
      } catch {
        throw new NovaError('NOT_FOUND', 'Der Projektordner wurde nicht gefunden. Wurde er verschoben? In den Projekteinstellungen kann der neue Ort eingetragen werden.', {
          severity: 'warning',
        });
      }
      const open = [...sessions.values()].filter((x) => x.projectId === projectId).length;
      if (open >= maxSessions) throw validation(`Für dieses Projekt sind bereits ${maxSessions} Terminals geöffnet. Bitte zuerst eines schließen.`);
      const x: Session = { id: newId('term'), projectId, root, cwd: root, prevCwd: null, shell: shellName(), busy: false, createdAt: core.clock.now(), controller: null, closed: false };
      sessions.set(x.id, x);
      return toPublic(x);
    },

    list(projectId) {
      return [...sessions.values()].filter((x) => !projectId || x.projectId === projectId).sort((a, b) => a.createdAt - b.createdAt).map(toPublic);
    },

    run(sessionId, line) {
      const x = require(sessionId);
      if (x.busy) {
        emitOutput(x, 'system', `Es läuft noch ein Befehl. Bitte warten oder mit Strg+C abbrechen.${NL}`);
        return { accepted: false };
      }
      const text = typeof line === 'string' ? line.trim() : '';
      if (/[\r\n]/.test(text)) {
        emitOutput(x, 'system', `Bitte nur eine Zeile auf einmal eingeben.${NL}`);
        emitExit(x, 1);
        return { accepted: true };
      }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
        emitOutput(x, 'system', `Die Zeile enthält unzulässige Steuerzeichen.${NL}`);
        emitExit(x, 1);
        return { accepted: true };
      }
      if (!text) {
        emitExit(x, 0);
        return { accepted: true };
      }
      const builtin = parseBuiltin(text);
      if (builtin?.kind === 'clear') {
        emitOutput(x, 'system', CLEAR_SCREEN);
        emitExit(x, 0);
        return { accepted: true };
      }
      if (builtin?.kind === 'cd') {
        changeDirectory(x, builtin.target);
        return { accepted: true };
      }
      execute(x, text);
      return { accepted: true };
    },

    interrupt(sessionId) {
      const x = require(sessionId);
      if (x.controller && !x.controller.signal.aborted) x.controller.abort();
    },

    close(sessionId) {
      const x = sessions.get(sessionId);
      if (x) closeSession(x);
    },

    closeProject(projectId) {
      for (const x of [...sessions.values()]) if (x.projectId === projectId) closeSession(x);
    },

    closeAll() {
      for (const x of [...sessions.values()]) closeSession(x);
    },
  };
}
