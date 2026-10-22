// Logger of the Electron main process: JSON lines in <dataDir>/logs/ui-main.log (1 MB, one rotated file) plus the
// console in development. Key decisions: synchronous appends (tiny volume, survives crashes/quit), every message
// and data object passes through the shared redactor, logging never throws.
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { redact, redactString } from '../daemon/core/redact';

export type MainLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface MainLogger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export interface MainLoggerOptions {
  /** Log file path; null = console only. */
  file: string | null;
  echo?: boolean;
  maxBytes?: number;
}

export function createMainLogger(opts: MainLoggerOptions): MainLogger {
  const maxBytes = opts.maxBytes ?? 1024 * 1024;
  let dirReady = false;
  const write = (level: MainLogLevel, msg: string, data?: unknown) => {
    const entry = { ts: new Date().toISOString(), level, scope: 'ui-main', msg: redactString(msg), ...(data === undefined ? {} : { data: redact(data) }) };
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({ ts: entry.ts, level, scope: 'ui-main', msg: entry.msg });
    }
    if (opts.echo) {
      const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
      try {
        out.write(`[main] ${level}: ${entry.msg}${data === undefined ? '' : ` ${JSON.stringify(entry.data)}`}\n`);
      } catch {
        /* closed stream */
      }
    }
    if (!opts.file) return;
    try {
      if (!dirReady) {
        mkdirSync(dirname(opts.file), { recursive: true });
        dirReady = true;
      }
      try {
        if (statSync(opts.file).size > maxBytes) renameSync(opts.file, `${opts.file}.1`);
      } catch {
        /* missing file */
      }
      appendFileSync(opts.file, `${line}\n`);
    } catch {
      /* logging must never break the app */
    }
  };
  return {
    debug: (m, d) => write('debug', m, d),
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}

/** Error → short string for logs. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : String(e);
}
