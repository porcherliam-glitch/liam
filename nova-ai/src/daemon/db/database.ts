// Thin wrapper around node:sqlite (built into Node >= 22.13 and Electron >= 35; no native build needed).
// WAL mode + synchronous=FULL: no committed transaction is lost on crash or power loss (write volume is low).
// backupToAsync runs VACUUM INTO on a second, read-only connection in a worker thread (a consistent WAL snapshot), so
// the daily backup of a large database does not freeze the daemon's event loop; where the worker cannot run it falls
// back to the synchronous backupTo.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { Worker } from 'node:worker_threads';

/** Worker source (eval'd, CommonJS): VACUUM INTO on its own read-only connection. */
const BACKUP_WORKER = `(() => {
  const { parentPort, workerData } = require('node:worker_threads');
  let db;
  try {
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(workerData.file, { readOnly: true });
    db.exec('PRAGMA busy_timeout = 5000;');
  } catch (e) {
    parentPort.postMessage({ ok: false, unavailable: true, message: String((e && e.message) || e) });
    return;
  }
  try {
    db.prepare('VACUUM INTO ?').run(workerData.target);
    parentPort.postMessage({ ok: true });
  } catch (e) {
    parentPort.postMessage({ ok: false, unavailable: false, message: String((e && e.message) || e) });
  } finally {
    try { db.close(); } catch {}
  }
})();`;

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export class Db {
  readonly raw: DatabaseSync;
  private cache = new Map<string, StatementSync>();
  private txDepth = 0;

  constructor(readonly file: string) {
    if (file !== ':memory:') {
      const dir = dirname(file);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL;');
    this.raw.exec('PRAGMA synchronous = FULL;');
    this.raw.exec('PRAGMA foreign_keys = ON;');
    this.raw.exec('PRAGMA busy_timeout = 5000;');
  }

  private stmt(sql: string): StatementSync {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  run(sql: string, params: SqlParams = []): { changes: number; lastInsertRowid: number } {
    const s = this.stmt(sql);
    const r = Array.isArray(params) ? s.run(...params) : s.run(params);
    return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlParams = []): T | undefined {
    const s = this.stmt(sql);
    return (Array.isArray(params) ? s.get(...params) : s.get(params)) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlParams = []): T[] {
    const s = this.stmt(sql);
    return (Array.isArray(params) ? s.all(...params) : s.all(params)) as T[];
  }

  /** Synchronous transaction. Nested calls use savepoints. */
  transaction<T>(fn: () => T): T {
    const name = `sp${this.txDepth}`;
    if (this.txDepth === 0) this.raw.exec('BEGIN IMMEDIATE');
    else this.raw.exec(`SAVEPOINT ${name}`);
    this.txDepth++;
    try {
      const result = fn();
      this.txDepth--;
      if (this.txDepth === 0) this.raw.exec('COMMIT');
      else this.raw.exec(`RELEASE ${name}`);
      return result;
    } catch (e) {
      this.txDepth--;
      if (this.txDepth === 0) this.raw.exec('ROLLBACK');
      else this.raw.exec(`ROLLBACK TO ${name}; RELEASE ${name}`);
      throw e;
    }
  }

  /** Consistent copy of the database (works while the DB is in use). */
  backupTo(target: string): void {
    const dir = dirname(target);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.raw.prepare('VACUUM INTO ?').run(target);
  }

  /**
   * backupTo without blocking the event loop (worker thread, separate read-only connection). Rejects with the SQLite
   * error (disk full …); runs backupTo synchronously when no worker can be used (in-memory database, no worker
   * support, node:sqlite unavailable in workers).
   */
  backupToAsync(target: string): Promise<void> {
    if (this.file === ':memory:') {
      this.backupTo(target);
      return Promise.resolve();
    }
    const dir = dirname(target);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const fallback = () => {
        if (settled) return;
        settled = true;
        try {
          rmSync(target, { force: true }); // a worker that died midway may have left a partial file
          this.backupTo(target);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      let worker: Worker;
      try {
        worker = new Worker(BACKUP_WORKER, { eval: true, workerData: { file: this.file, target } });
      } catch {
        fallback();
        return;
      }
      worker.once('message', (m: { ok: boolean; unavailable?: boolean; message?: string }) => {
        if (m.ok) {
          settled = true;
          resolve();
        } else if (m.unavailable) {
          fallback();
        } else {
          settled = true;
          reject(new Error(m.message ?? 'VACUUM INTO fehlgeschlagen'));
        }
      });
      worker.once('error', () => fallback());
      worker.once('exit', () => fallback());
    });
  }

  close(): void {
    this.cache.clear();
    try {
      this.raw.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    } catch {
      /* ignore */
    }
    this.raw.close();
  }
}

/** JSON column helpers. */
export function toJson(v: unknown): string {
  return JSON.stringify(v ?? null);
}

export function fromJson<T>(v: unknown, fallback: T): T {
  if (typeof v !== 'string' || v === '') return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}

export const bool = (v: unknown): boolean => v === 1 || v === true || v === 1n;
export const int = (b: boolean): number => (b ? 1 : 0);
