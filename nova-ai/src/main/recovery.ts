// Recovery while the background service cannot start (MASTERPROMPT §12/§14/§18, SPEC §6.10), e.g. after a power
// loss damaged nova.db: list NOVA's own database backups, check one and queue it with the daemon's `--restore-db`
// mode, then restart the daemon; create a diagnostics bundle with `--diagnostics-only` (works without the database).
// Key decisions:
// - Only files in <dataDir>/backups named nova-*.db (NOVA's own backups) are offered and accepted – never an
//   arbitrary path from the renderer.
// - A backup is checked BEFORE it is queued, in a separate process (the Electron binary as Node, exactly like the
//   daemon, so node:sqlite is available and the main process stays responsive): SQLite header, PRAGMA quick_check,
//   the NOVA tables and a schema version this app knows. A damaged backup is never copied over nova.db.
// - Restoring is refused while the daemon is connected: then the settings page restores through the daemon.
// - Nothing is lost: when applying the restore the daemon first copies the current (damaged) database to
//   backups/nova-…-vor-wiederherstellung.db.
// - One recovery action at a time.
import { spawn as nodeSpawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { posix, win32 } from 'node:path';
import type { DaemonConnectionState, LocalBackupFile, RecoveryResult } from '@shared/bridge';
import { isDroppedEnvVar } from '../daemon/core/child-env';
import { errorText, type MainLogger } from './log';
import { TEXTS } from './texts';

export interface NodeRunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface RecoveryOptions {
  dataDir: string;
  backupsDir: string;
  diagnosticsDir: string;
  /** out/daemon/index.cjs of this installation. */
  daemonEntry: string;
  /** Highest database schema version this app can open (backups from newer versions are refused). */
  latestSchemaVersion: number;
  platform: NodeJS.Platform;
  log: MainLogger;
  /** Runs the Electron binary as Node (ELECTRON_RUN_AS_NODE=1) with `args`. */
  runNode(args: string[], timeoutMs: number): Promise<NodeRunResult>;
  connection(): DaemonConnectionState;
  restartDaemon(): Promise<DaemonConnectionState>;
  showItemInFolder(path: string): void;
  fs?: {
    readdir(dir: string): Promise<string[]>;
    stat(path: string): Promise<{ isFile(): boolean; size: number; mtimeMs: number } | null>;
  };
}

/** Name pattern of NOVA's own database backups (BackupService); the ".pruefung-*" temp copies never match. */
const BACKUP_NAME = /^nova-[^\\/]+\.db$/i;
const MAX_LISTED = 50;

/**
 * Check script run with `ELECTRON_RUN_AS_NODE=1 <exe> -e <script> <file> <latestVersion>`; prints one JSON line.
 * Mirrors BackupService.validateDatabaseFile (header, quick_check, required tables, schema version).
 */
export const VALIDATE_BACKUP_SCRIPT = [
  "const fs=require('node:fs');const {pathToFileURL}=require('node:url');const {resolve}=require('node:path');",
  'const [file,latestRaw]=process.argv.slice(1);const latest=Number(latestRaw);',
  'const out=(o)=>{process.stdout.write(JSON.stringify(o));process.exit(0);};',
  "try{const fd=fs.openSync(file,'r');const h=Buffer.alloc(16);fs.readSync(fd,h,0,16,0);fs.closeSync(fd);",
  "if(h.toString('latin1')!=='SQLite format 3\\u0000')out({ok:false,why:'not_nova'});}catch(e){out({ok:false,why:'unreadable',detail:String(e&&e.message||e)});}",
  "let db;try{const {DatabaseSync}=require('node:sqlite');",
  "try{db=new DatabaseSync(pathToFileURL(resolve(file)).href+'?immutable=1',{readOnly:true});}catch{db=new DatabaseSync(file,{readOnly:true});}",
  "const qc=db.prepare('PRAGMA quick_check').get();if(!qc||qc.quick_check!=='ok')out({ok:false,why:'corrupt'});",
  "const t=new Set(db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map((r)=>r.name));",
  "for(const n of ['projects','tasks','settings','meta'])if(!t.has(n))out({ok:false,why:'not_nova'});",
  "const row=db.prepare(\"SELECT value FROM meta WHERE key='schema_version'\").get();const v=Number(row&&row.value);",
  "if(!Number.isInteger(v)||v<1)out({ok:false,why:'no_version'});if(v>latest)out({ok:false,why:'newer',version:v});",
  "out({ok:true,version:v});}catch(e){out({ok:false,why:'open_failed',detail:String(e&&e.message||e)});}finally{try{db&&db.close();}catch{}}",
].join('');

type CheckResult = { ok: true; version: number } | { ok: false; why: string; version?: number; detail?: string };

function checkMessage(r: Exclude<CheckResult, { ok: true }>): string {
  switch (r.why) {
    case 'corrupt':
      return TEXTS.backupCorrupt;
    case 'no_version':
      return TEXTS.backupNoVersion;
    case 'newer':
      return TEXTS.backupNewer(r.version ?? 0);
    case 'unreadable':
    case 'open_failed':
      return TEXTS.backupUnreadable(r.detail ?? '');
    default:
      return TEXTS.backupNotNova;
  }
}

/** Environment for the Electron-as-Node helper processes: no secrets, no NODE_OPTIONS (like the daemon's). */
export function nodeHelperEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) continue;
    if (!/^NOVA_/i.test(k) && isDroppedEnvVar(k)) continue;
    out[k] = v;
  }
  out.ELECTRON_RUN_AS_NODE = '1';
  return out;
}

/** Default runNode: spawns `execPath` as Node, collects stdout/stderr (capped) and kills it after `timeoutMs`. */
export function createNodeRunner(o: { execPath: string; cwd: string; env?: NodeJS.ProcessEnv }): RecoveryOptions['runNode'] {
  return (args, timeoutMs) =>
    new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      const finish = (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      };
      let child: ReturnType<typeof nodeSpawn>;
      try {
        child = nodeSpawn(o.execPath, args, { cwd: o.cwd, env: nodeHelperEnv(o.env ?? process.env), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        resolve({ code: null, stdout: '', stderr: errorText(e), timedOut: false });
        return;
      }
      const cap = (prev: string, chunk: Buffer) => (prev.length > 65_536 ? prev : prev + chunk.toString('utf8'));
      child.stdout?.on('data', (c: Buffer) => (stdout = cap(stdout, c)));
      child.stderr?.on('data', (c: Buffer) => (stderr = cap(stderr, c)));
      child.once('error', (e) => {
        stderr += errorText(e);
        finish(null);
      });
      child.once('close', (code) => finish(code));
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill();
        } catch {
          /* gone */
        }
        finish(null);
      }, timeoutMs);
      timer.unref?.();
    });
}

export class DaemonRecovery {
  private busy = false;
  private readonly path: typeof posix;
  private readonly fs: NonNullable<RecoveryOptions['fs']>;

  constructor(private readonly o: RecoveryOptions) {
    this.path = o.platform === 'win32' ? win32 : posix;
    this.fs = o.fs ?? {
      readdir: (dir) => fsp.readdir(dir),
      stat: (p) => fsp.stat(p).catch(() => null),
    };
  }

  /** NOVA's database backups, newest first (at most 50). */
  async listBackups(): Promise<LocalBackupFile[]> {
    let names: string[];
    try {
      names = await this.fs.readdir(this.o.backupsDir);
    } catch {
      return [];
    }
    const files: LocalBackupFile[] = [];
    for (const name of names) {
      if (!BACKUP_NAME.test(name)) continue;
      const path = this.path.join(this.o.backupsDir, name);
      const st = await this.fs.stat(path);
      if (!st || !st.isFile() || st.size <= 0) continue;
      files.push({ path, name, sizeBytes: st.size, createdAt: st.mtimeMs });
    }
    return files.sort((a, b) => b.createdAt - a.createdAt).slice(0, MAX_LISTED);
  }

  /** Checks the backup, queues it (`--restore-db`) and restarts the daemon, which applies it before opening the DB. */
  async restoreBackup(raw: unknown): Promise<RecoveryResult> {
    if (this.busy) return { ok: false, message: TEXTS.recoveryBusy };
    if (this.o.connection().state === 'connected') return { ok: false, message: TEXTS.restoreWhileConnected };
    const file = this.acceptedBackupPath(raw);
    if (!file) return { ok: false, message: TEXTS.backupNotAllowed };
    this.busy = true;
    try {
      const st = await this.fs.stat(file);
      if (!st || !st.isFile()) return { ok: false, message: TEXTS.backupMissing };
      const check = await this.check(file);
      if (!check.ok) {
        this.o.log.warn('Sicherung für die Wiederherstellung abgelehnt', { file, why: check.why });
        return { ok: false, message: checkMessage(check) };
      }
      const queued = await this.o.runNode([this.o.daemonEntry, '--data-dir', this.o.dataDir, '--restore-db', file], 30_000);
      if (queued.code !== 0) {
        this.o.log.error('Wiederherstellung konnte nicht vorgemerkt werden', { code: queued.code, stderr: queued.stderr.slice(-2000) });
        return { ok: false, message: TEXTS.restoreQueueFailed(lastLine(queued.stderr) || (queued.timedOut ? TEXTS.helperTimeout : '')) };
      }
      this.o.log.info('Wiederherstellung vorgemerkt – Hintergrunddienst wird neu gestartet', { file, schemaVersion: check.version });
      const state = await this.o.restartDaemon();
      if (state.state === 'connected') return { ok: true, message: TEXTS.restoreDone };
      return { ok: false, message: TEXTS.restoreStartFailed(state.message) };
    } catch (e) {
      this.o.log.error('Wiederherstellung fehlgeschlagen', { error: errorText(e) });
      return { ok: false, message: TEXTS.restoreStartFailed(errorText(e)) };
    } finally {
      this.busy = false;
    }
  }

  /** Diagnostics bundle without the daemon (`--diagnostics-only`), shown in Explorer. */
  async createDiagnostics(): Promise<RecoveryResult> {
    if (this.busy) return { ok: false, message: TEXTS.recoveryBusy };
    this.busy = true;
    try {
      const r = await this.o.runNode([this.o.daemonEntry, '--data-dir', this.o.dataDir, '--diagnostics-only'], 60_000);
      const file = lastLine(r.stdout);
      if (r.code !== 0 || !file || !this.isDirectChild(this.o.diagnosticsDir, file)) {
        this.o.log.error('Diagnose ohne Hintergrunddienst fehlgeschlagen', { code: r.code, stderr: r.stderr.slice(-2000) });
        return { ok: false, message: TEXTS.diagnosticsFailed(lastLine(r.stderr) || (r.timedOut ? TEXTS.helperTimeout : '')) };
      }
      try {
        this.o.showItemInFolder(file);
      } catch (e) {
        this.o.log.warn('Explorer konnte nicht geöffnet werden', { error: errorText(e) });
      }
      return { ok: true, message: TEXTS.diagnosticsCreated, path: file };
    } finally {
      this.busy = false;
    }
  }

  // --- internals -------------------------------------------------------------------------------------------------

  private acceptedBackupPath(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096 || raw.includes('\0')) return null;
    if (!this.path.isAbsolute(raw)) return null;
    const file = this.path.resolve(raw);
    if (!this.isDirectChild(this.o.backupsDir, file)) return null;
    return BACKUP_NAME.test(this.path.basename(file)) ? file : null;
  }

  private isDirectChild(dir: string, file: string): boolean {
    const norm = (p: string) => (this.o.platform === 'win32' ? this.path.resolve(p).toLowerCase() : this.path.resolve(p));
    return norm(this.path.dirname(file)) === norm(dir);
  }

  private async check(file: string): Promise<CheckResult> {
    const r = await this.o.runNode(['-e', VALIDATE_BACKUP_SCRIPT, file, String(this.o.latestSchemaVersion)], 120_000);
    try {
      const parsed = JSON.parse(lastLine(r.stdout)) as CheckResult;
      if (parsed && typeof parsed.ok === 'boolean') return parsed;
    } catch {
      /* no JSON: fall through */
    }
    return { ok: false, why: 'open_failed', detail: lastLine(r.stderr) || (r.timedOut ? TEXTS.helperTimeout : `Exit ${r.code ?? '?'}`) };
  }
}

function lastLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.at(-1) ?? '';
}
