// Daemon composition root (in-process, real services): the pending database restore is crash-safe, never blocks the
// start and is never silent (error + notification on failure, notification on success); maintenance starts after a
// delay, yields to the event loop between its steps and reports failures as resolvable warnings instead of putting
// the whole daemon into the error state.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyRestorePending, startDaemon, type DaemonApp } from './app';
import { dataPaths } from './core/paths';
import { testEndpoint } from '../../tests/helpers/endpoint';

let dataDir: string | null = null;
let app: DaemonApp | null = null;

afterEach(async () => {
  if (app) await app.stop('test', { fast: true });
  app = null;
  if (dataDir) rmSync(dataDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  dataDir = null;
});

async function start(extra: { maintenanceDelayMs?: number } = {}): Promise<DaemonApp> {
  app = await startDaemon({ dataDir: dataDir!, endpoint: testEndpoint(dataDir!), secretScheme: 'memory', manualLoop: true, maintenanceDelayMs: 3_600_000, ...extra });
  return app;
}

async function restart(extra: { maintenanceDelayMs?: number } = {}): Promise<DaemonApp> {
  await app!.stop('test');
  app = null;
  return start(extra);
}

const probe = (a: DaemonApp) => a.services.core.db.get<{ value: string }>("SELECT value FROM meta WHERE key = 'probe'")?.value ?? null;
const setProbe = (a: DaemonApp, v: string) => a.services.core.db.run("INSERT INTO meta(key, value) VALUES ('probe', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", [v]);

describe('pending database restore', () => {
  it('a failed restore does not block the start, keeps the data and is reported (error + notification)', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'nova-app-'));
    setProbe(await start(), 'aktuell');
    writeFileSync(dataPaths(dataDir).restorePending, JSON.stringify({ backupPath: join(dataDir, 'backups', 'nova-20261020-080000-taeglich.db') }));
    const a = await restart();
    expect(probe(a)).toBe('aktuell');
    expect(existsSync(dataPaths(dataDir).restorePending)).toBe(false);
    const errors = a.services.core.errors.list().filter((e) => e.title === 'Datensicherung nicht eingespielt');
    expect(errors).toHaveLength(1);
    expect(errors[0].whatHappened).toMatch(/vom 20\.10\.2026.*nicht gefunden.*bisherigen, unveränderten Stand/);
    expect(a.services.notifications.list().map((n) => n.title)).toContain('Datensicherung nicht eingespielt');
    expect(a.status()).toMatchObject({ state: 'running', lastError: null });
  });

  it('swaps the backup in atomically, keeps a safety copy and confirms it with a notification', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'nova-app-'));
    const first = await start();
    setProbe(first, 'Stand A');
    const backup = first.services.backups.createDatabaseBackup('Stand A');
    setProbe(first, 'Stand B');
    writeFileSync(dataPaths(dataDir).restorePending, JSON.stringify({ backupPath: backup.path }));
    const a = await restart();
    expect(probe(a)).toBe('Stand A');
    expect(a.services.notifications.list().map((n) => n.title)).toContain('Datensicherung eingespielt');
    const files = readdirSync(dataPaths(dataDir).backups);
    expect(files.some((f) => /vor-wiederherstellung\.db$/.test(f))).toBe(true);
    expect(readdirSync(dataDir).filter((f) => f.includes('restore-tmp'))).toEqual([]);
    expect(existsSync(dataPaths(dataDir).restorePending)).toBe(false);
  });

  it('refuses a file that is no database and leaves the current database untouched', () => {
    dataDir = mkdtempSync(join(tmpdir(), 'nova-app-'));
    const paths = dataPaths(dataDir);
    writeFileSync(paths.db, 'SQLite format 3\u0000 – current database stand-in');
    writeFileSync(join(dataDir, 'kaputt.db'), 'not a database at all');
    writeFileSync(paths.restorePending, JSON.stringify({ backupPath: join(dataDir, 'kaputt.db') }));
    const r = applyRestorePending(paths);
    expect(r).toMatchObject({ restoredFrom: null, failure: 'Die Sicherungsdatei ist keine NOVA-Datenbank.' });
    expect(readdirSync(dataDir).sort()).toEqual(['kaputt.db', 'nova.db']);
  });
});

describe('maintenance', () => {
  it('starts after the delay and yields to the event loop between its steps', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'nova-app-'));
    const a = await start({ maintenanceDelayMs: 3_600_000 });
    const events: string[] = [];
    const busy = (name: string) => () => {
      const until = Date.now() + 60;
      while (Date.now() < until) {
        /* synchronous work like a large prune */
      }
      events.push(name);
      return 0;
    };
    const backups = a.services.backups as unknown as Record<string, unknown>;
    backups.maybeDailyBackupAsync = async () => {
      events.push('backup');
      setTimeout(() => events.push('timer'), 0); // stands for an RPC request arriving meanwhile
      return null;
    };
    (a.services.checkpoints as unknown as Record<string, unknown>).prune = busy('checkpoints');
    backups.applyRetention = busy('retention');
    (a.services.journal as unknown as Record<string, unknown>).pruneSnapshotsAsync = async () => busy('snapshots')();
    (a.services.runs as unknown as Record<string, unknown>).prune = busy('runs');
    await a.runMaintenance();
    expect(events.slice(0, 2)).toEqual(['backup', 'checkpoints']);
    expect(events.indexOf('timer')).toBeGreaterThan(0);
    expect(events.indexOf('timer')).toBeLessThan(events.indexOf('runs')); // not only after the whole chain
    expect(a.services.backups.list().some((b) => b.reason === 'täglich')).toBe(false); // nothing ran at start
  });

  it('a failing step is a resolvable warning, not the daemon error state', async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'nova-app-'));
    const a = await start();
    const backups = a.services.backups as unknown as Record<string, unknown>;
    const real = backups.maybeDailyBackupAsync as () => Promise<unknown>;
    backups.maybeDailyBackupAsync = async () => {
      throw new Error('Die Datei ist von einem anderen Programm geöffnet.');
    };
    await a.runMaintenance();
    expect(a.status()).toMatchObject({ state: 'running', lastError: null });
    const open = a.services.core.errors.list().filter((e) => e.title === 'Wartung fehlgeschlagen: Tägliche Sicherung');
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ severity: 'warning', resolvedAt: null });
    backups.maybeDailyBackupAsync = real;
    await a.runMaintenance();
    expect(a.services.core.errors.list().filter((e) => e.title === 'Wartung fehlgeschlagen: Tägliche Sicherung')).toEqual([]);
    expect(a.services.backups.list().some((b) => b.reason === 'täglich')).toBe(true);
  });
});
