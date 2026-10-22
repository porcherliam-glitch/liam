import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, openSync, rmSync, utimesSync, writeFileSync, writeSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DaemonConnectionState } from '@shared/bridge';
import { createNodeRunner, DaemonRecovery, nodeHelperEnv, type NodeRunResult, type RecoveryOptions } from './recovery';
import { createMainLogger } from './log';
import { TEXTS } from './texts';

const log = createMainLogger({ file: null });

function state(s: DaemonConnectionState['state'], message = ''): DaemonConnectionState {
  return { state: s, message, since: 0, daemonPid: null, daemonVersion: null, endpoint: 'x', restartAttempts: 0 };
}

function novaDb(file: string, schemaVersion: number | null): void {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE projects(id TEXT); CREATE TABLE tasks(id TEXT); CREATE TABLE settings(k TEXT); CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);');
  if (schemaVersion !== null) db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)").run(String(schemaVersion));
  db.close();
}

describe('DaemonRecovery (R3-6: database damaged, daemon does not start)', () => {
  let dir: string;
  let backups: string;
  let diagnostics: string;
  const realRunner = createNodeRunner({ execPath: process.execPath, cwd: tmpdir() });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nova-recovery-'));
    backups = join(dir, 'backups');
    diagnostics = join(dir, 'diagnostics');
    mkdirSync(backups);
    mkdirSync(diagnostics);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  function make(over: Partial<RecoveryOptions> = {}) {
    const calls: string[][] = [];
    let connection = state('error', 'Der NOVA-Hintergrunddienst konnte nicht starten.');
    const restartDaemon = vi.fn(async () => (connection = state('connected', 'läuft')));
    const showItemInFolder = vi.fn();
    const runNode = vi.fn(async (args: string[], timeoutMs: number): Promise<NodeRunResult> => {
      calls.push(args);
      if (args[0] === '-e') return realRunner(args, timeoutMs); // the real backup check
      if (args.includes('--restore-db')) return { code: 0, stdout: 'Wiederherstellung vorgemerkt\n', stderr: '', timedOut: false };
      if (args.includes('--diagnostics-only')) return { code: 0, stdout: `${join(diagnostics, 'diagnose-ohne-start-1.json')}\n`, stderr: '', timedOut: false };
      return { code: 1, stdout: '', stderr: 'unbekannt', timedOut: false };
    });
    const recovery = new DaemonRecovery({
      dataDir: dir,
      backupsDir: backups,
      diagnosticsDir: diagnostics,
      daemonEntry: '/app/out/daemon/index.cjs',
      latestSchemaVersion: 5,
      platform: process.platform,
      log,
      runNode,
      connection: () => connection,
      restartDaemon,
      showItemInFolder,
      ...over,
    });
    return { recovery, calls, restartDaemon, showItemInFolder, setConnection: (c: DaemonConnectionState) => (connection = c) };
  }

  it('lists only NOVA database backups, newest first', async () => {
    novaDb(join(backups, 'nova-2026-10-01-taeglich.db'), 5);
    novaDb(join(backups, 'nova-2026-10-03-taeglich.db'), 5);
    writeFileSync(join(backups, '.pruefung-bak_1.db'), 'x');
    writeFileSync(join(backups, 'export.json'), '{}');
    writeFileSync(join(backups, 'nova-leer.db'), '');
    utimesSync(join(backups, 'nova-2026-10-01-taeglich.db'), new Date('2026-10-01'), new Date('2026-10-01'));
    utimesSync(join(backups, 'nova-2026-10-03-taeglich.db'), new Date('2026-10-03'), new Date('2026-10-03'));
    const list = await make().recovery.listBackups();
    expect(list.map((b) => b.name)).toEqual(['nova-2026-10-03-taeglich.db', 'nova-2026-10-01-taeglich.db']);
    expect(list[0].path).toBe(join(backups, 'nova-2026-10-03-taeglich.db'));
    expect(list[0].sizeBytes).toBeGreaterThan(0);
  });

  it('checks a valid backup, queues it with --restore-db and restarts the daemon', async () => {
    const file = join(backups, 'nova-2026-10-03-taeglich.db');
    novaDb(file, 4);
    const m = make();
    const r = await m.recovery.restoreBackup(file);
    expect(r).toEqual({ ok: true, message: TEXTS.restoreDone });
    expect(m.calls.map((c) => c[0])).toEqual(['-e', '/app/out/daemon/index.cjs']);
    expect(m.calls[1]).toEqual(['/app/out/daemon/index.cjs', '--data-dir', dir, '--restore-db', file]);
    expect(m.restartDaemon).toHaveBeenCalledTimes(1);
  });

  it('never queues a damaged, foreign or newer backup', async () => {
    const corrupt = join(backups, 'nova-kaputt.db');
    novaDb(corrupt, 5);
    // Overwrite the table pages after page 1: the file still starts with "SQLite format 3".
    const fd = openSync(corrupt, 'r+');
    writeSync(fd, Buffer.alloc(8192, 0xab), 0, 8192, 4096);
    closeSync(fd);
    const text = join(backups, 'nova-text.db');
    writeFileSync(text, 'kein sqlite');
    const newer = join(backups, 'nova-neu.db');
    novaDb(newer, 9);
    const noVersion = join(backups, 'nova-ohne-version.db');
    novaDb(noVersion, null);
    const m = make();
    const rc = await m.recovery.restoreBackup(corrupt);
    expect(rc.ok).toBe(false);
    expect(([TEXTS.backupCorrupt, TEXTS.backupNotNova] as string[]).includes(rc.message) || rc.message.startsWith('Die Sicherung lässt sich nicht lesen')).toBe(true);
    expect(await m.recovery.restoreBackup(text)).toEqual({ ok: false, message: TEXTS.backupNotNova });
    expect(await m.recovery.restoreBackup(newer)).toEqual({ ok: false, message: TEXTS.backupNewer(9) });
    expect(await m.recovery.restoreBackup(noVersion)).toEqual({ ok: false, message: TEXTS.backupNoVersion });
    expect(m.calls.some((c) => c.includes('--restore-db'))).toBe(false);
    expect(m.restartDaemon).not.toHaveBeenCalled();
  });

  it('only accepts NOVA backups from the backups folder, and not while the daemon runs', async () => {
    const outside = join(dir, 'nova-fremd.db');
    novaDb(outside, 5);
    const sub = join(backups, 'sub');
    mkdirSync(sub);
    novaDb(join(sub, 'nova-x.db'), 5);
    novaDb(join(backups, 'anderes.db'), 5);
    const m = make();
    for (const bad of [outside, join(sub, 'nova-x.db'), join(backups, 'anderes.db'), 'nova-1.db', join(backups, '..', 'nova-fremd.db'), 42, '']) {
      expect(await m.recovery.restoreBackup(bad)).toEqual({ ok: false, message: TEXTS.backupNotAllowed });
    }
    expect(await m.recovery.restoreBackup(join(backups, 'nova-fehlt.db'))).toEqual({ ok: false, message: TEXTS.backupMissing });
    const ok = join(backups, 'nova-ok.db');
    novaDb(ok, 5);
    m.setConnection(state('connected'));
    expect(await m.recovery.restoreBackup(ok)).toEqual({ ok: false, message: TEXTS.restoreWhileConnected });
    expect(m.calls).toHaveLength(0);
  });

  it('windows paths: the backups folder is compared case-insensitively, other folders are refused', async () => {
    const files = new Map([['C:\\Users\\Ana\\AppData\\Local\\NOVA AI\\backups\\nova-1.db', 10]]);
    const m = make({
      platform: 'win32',
      dataDir: 'C:\\Users\\Ana\\AppData\\Local\\NOVA AI',
      backupsDir: 'C:\\Users\\Ana\\AppData\\Local\\NOVA AI\\backups',
      fs: {
        readdir: async () => ['nova-1.db'],
        stat: async (p) => {
          const hit = [...files.keys()].find((k) => k.toLowerCase() === p.toLowerCase());
          return hit ? { isFile: () => true, size: 10, mtimeMs: 1 } : null;
        },
      },
      runNode: async (args) => (args[0] === '-e' ? { code: 0, stdout: '{"ok":true,"version":3}', stderr: '', timedOut: false } : { code: 0, stdout: '', stderr: '', timedOut: false }),
    });
    expect((await m.recovery.restoreBackup('c:\\users\\ana\\appdata\\local\\nova ai\\BACKUPS\\nova-1.db')).ok).toBe(true);
    m.setConnection(state('error'));
    expect(await m.recovery.restoreBackup('D:\\Fremd\\backups\\nova-1.db')).toEqual({ ok: false, message: TEXTS.backupNotAllowed });
    expect(await m.recovery.restoreBackup('\\\\server\\share\\nova-1.db')).toEqual({ ok: false, message: TEXTS.backupNotAllowed });
  });

  it('reports a failed restart honestly', async () => {
    const file = join(backups, 'nova-1.db');
    novaDb(file, 5);
    const m = make({ restartDaemon: async () => state('error', 'Startet nicht.') });
    expect(await m.recovery.restoreBackup(file)).toEqual({ ok: false, message: TEXTS.restoreStartFailed('Startet nicht.') });
  });

  it('creates a diagnostics bundle without the daemon and shows it in Explorer', async () => {
    const m = make();
    const r = await m.recovery.createDiagnostics();
    expect(r).toEqual({ ok: true, message: TEXTS.diagnosticsCreated, path: join(diagnostics, 'diagnose-ohne-start-1.json') });
    expect(m.calls[0]).toEqual(['/app/out/daemon/index.cjs', '--data-dir', dir, '--diagnostics-only']);
    expect(m.showItemInFolder).toHaveBeenCalledWith(join(diagnostics, 'diagnose-ohne-start-1.json'));
    const bad = make({ runNode: async () => ({ code: 0, stdout: '/etc/passwd\n', stderr: '', timedOut: false }) });
    expect((await bad.recovery.createDiagnostics()).ok).toBe(false);
    expect(bad.showItemInFolder).not.toHaveBeenCalled();
    const failed = make({ runNode: async () => ({ code: 1, stdout: '', stderr: 'Datenordner fehlt\n', timedOut: false }) });
    expect(await failed.recovery.createDiagnostics()).toEqual({ ok: false, message: TEXTS.diagnosticsFailed('Datenordner fehlt') });
  });

  it('helper processes get no secrets and run as Node', () => {
    const env = nodeHelperEnv({ PATH: '/bin', OPENAI_API_KEY: 'sk-x', NODE_OPTIONS: '--inspect', NOVA_DATA_DIR: '/d' });
    expect(env).toMatchObject({ PATH: '/bin', NOVA_DATA_DIR: '/d', ELECTRON_RUN_AS_NODE: '1' });
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.NODE_OPTIONS).toBeUndefined();
  });
});
