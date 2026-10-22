// Structured JSON-lines logger with size-based rotation and redaction.
// Never logs secrets: every message and data object passes through redact().
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEntry, LogLevel } from '@shared/schemas';
import { redact, redactString } from './redact';

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  dir: string | null; // null = memory only (tests)
  level: LogLevel;
  maxFileBytes: number;
  maxFiles: number;
  echo?: boolean; // also print to stderr (dev)
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
  child(scope: string): Logger;
}

type Sink = (entry: LogEntry) => void;

export class LogStore {
  private ring: LogEntry[] = [];
  private sinks = new Set<Sink>();
  constructor(private opts: LoggerOptions) {
    if (opts.dir && !existsSync(opts.dir)) mkdirSync(opts.dir, { recursive: true });
  }

  setLevel(level: LogLevel): void {
    this.opts.level = level;
  }

  configure(patch: Partial<Pick<LoggerOptions, 'level' | 'maxFileBytes' | 'maxFiles'>>): void {
    Object.assign(this.opts, patch);
  }

  onEntry(sink: Sink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  write(level: LogLevel, scope: string, msg: string, data?: unknown): void {
    if (LEVELS[level] < LEVELS[this.opts.level]) return;
    const entry: LogEntry = { ts: Date.now(), level, scope, msg: redactString(msg) };
    if (data !== undefined) entry.data = redact(data);
    this.ring.push(entry);
    if (this.ring.length > 5000) this.ring.splice(0, this.ring.length - 5000);
    if (this.opts.echo) process.stderr.write(`[${level}] ${scope}: ${entry.msg}${data !== undefined ? ' ' + safeJson(entry.data) : ''}\n`);
    if (this.opts.dir) this.append(entry);
    for (const s of this.sinks) {
      try {
        s(entry);
      } catch {
        /* sinks must not break logging */
      }
    }
  }

  tail(limit: number, level?: LogLevel, scope?: string): LogEntry[] {
    let entries = this.ring;
    if (level) entries = entries.filter((e) => LEVELS[e.level] >= LEVELS[level]);
    if (scope) entries = entries.filter((e) => e.scope.startsWith(scope));
    return entries.slice(-limit);
  }

  /** Read persisted log lines (for diagnostics), newest file last. */
  readFiles(maxBytes = 2_000_000): string {
    if (!this.opts.dir) return '';
    const parts: string[] = [];
    for (let i = this.opts.maxFiles - 1; i >= 0; i--) {
      const f = this.fileName(i);
      if (existsSync(f)) parts.push(readFileSync(f, 'utf8'));
    }
    const all = parts.join('');
    return all.length > maxBytes ? all.slice(all.length - maxBytes) : all;
  }

  private fileName(index: number): string {
    return join(this.opts.dir!, index === 0 ? 'daemon.log' : `daemon.${index}.log`);
  }

  private append(entry: LogEntry): void {
    const file = this.fileName(0);
    try {
      if (existsSync(file) && statSync(file).size > this.opts.maxFileBytes) this.rotate();
      appendFileSync(file, safeJson(entry) + '\n');
    } catch {
      /* disk full or locked: keep in-memory ring only */
    }
  }

  private rotate(): void {
    const last = this.fileName(this.opts.maxFiles - 1);
    if (existsSync(last)) unlinkSync(last);
    for (let i = this.opts.maxFiles - 2; i >= 0; i--) {
      const f = this.fileName(i);
      if (existsSync(f)) renameSync(f, this.fileName(i + 1));
    }
  }
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '"[unserializable]"';
  }
}

export function createLogger(store: LogStore, scope: string): Logger {
  return {
    debug: (msg, data) => store.write('debug', scope, msg, data),
    info: (msg, data) => store.write('info', scope, msg, data),
    warn: (msg, data) => store.write('warn', scope, msg, data),
    error: (msg, data) => store.write('error', scope, msg, data),
    child: (sub) => createLogger(store, `${scope}.${sub}`),
  };
}

/** Logger that discards everything (tests). */
export const nullLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return nullLogger;
  },
};
