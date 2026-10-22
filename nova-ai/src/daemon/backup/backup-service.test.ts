// BackupService on a real core: database backups (name, validity), reconciliation with files on disk, validation of
// backups, database restore (restore-pending.json, safety backup, restart handler, CONFLICT while agents run),
// delete, retention (count/age/newest kept/pending kept/per-project snapshots/journal prune), daily backup, project
// snapshots (skip rules, manifest, progress, abort, size cap) and restoring a snapshot into a NEW folder only.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LATEST_SCHEMA_VERSION } from '../db/migrations';
import { backupHarness, type BackupHarness } from './test-support';

let h: BackupHarness;
afterEach(() => h?.cleanup());

describe('database backups', () => {
  it('creates a consistent copy named nova-YYYYMMDD-HHMMSS-<reason>.db and lists it', () => {
    h = backupHarness();
    h.t.core.db.run("INSERT INTO meta(key, value) VALUES ('probe', 'drin')");
    const info = h.backups.createDatabaseBackup('vor Update');
    expect(info.kind).toBe('database');
    expect(info.reason).toBe('vor Update');
    expect(info.path.startsWith(h.t.core.paths.backups)).toBe(true);
    expect(info.path).toMatch(/nova-\d{8}-\d{6}-vor-update\.db$/);
    expect(info.sizeBytes).toBeGreaterThan(0);
    const copy = new DatabaseSync(info.path, { readOnly: true });
    expect(copy.prepare("SELECT value FROM meta WHERE key = 'probe'").get()).toMatchObject({ value: 'drin' });
    copy.close();
    const second = h.backups.createDatabaseBackup('vor Update');
    expect(second.path).not.toBe(info.path); // same second → unique suffix
    expect(h.backups.list().map((b) => b.id)).toEqual([second.id, info.id]);
    expect(h.backups.validateDatabaseFile(info.path)).toEqual({ schemaVersion: LATEST_SCHEMA_VERSION });
  });

  it('adopts backup files it has no row for and drops rows whose files are gone', () => {
    h = backupHarness();
    const own = h.backups.createDatabaseBackup('manuell');
    // A file written by app.ts before a migration and one recorded only in a newer database state.
    const appFile = join(h.t.core.paths.backups, 'nova-vor-migration-v1-2026-10-22T12-00-00-000Z.db');
    h.t.core.db.backupTo(appFile);
    const newerFile = join(h.t.core.paths.backups, 'nova-20261020-080000-taeglich.db');
    h.t.core.db.backupTo(newerFile);
    writeFileSync(join(h.t.core.paths.backups, 'unrelated.txt'), 'x');
    h.t.core.db.run('DELETE FROM backups WHERE id = ?', [own.id]);
    writeFileSync(join(h.t.core.paths.exports, 'nova-export-20261021-101010.json'), '{}');
    writeFileSync(join(h.t.core.paths.exports, 'memory-global-123.json'), '{}');
    const list = h.backups.list();
    expect(list.map((b) => b.reason).sort()).toEqual(['Export', 'manuell', 'taeglich', 'vor migration v1'].sort());
    expect(list.find((b) => b.reason === 'vor migration v1')?.createdAt).toBe(Date.parse('2026-10-22T12:00:00.000Z'));
    expect(list.find((b) => b.reason === 'Export')?.kind).toBe('export');
    // Row without file → dropped.
    const victim = list.find((b) => b.reason === 'taeglich')!;
    unlinkSync(victim.path);
    expect(h.backups.list().some((b) => b.id === victim.id)).toBe(false);
  });

  it('validates backups: garbage, foreign SQLite files and newer schema versions are refused', () => {
    h = backupHarness();
    const dir = h.scratch;
    writeFileSync(join(dir, 'garbage.db'), 'not a database at all, really not');
    expect(() => h.backups.validateDatabaseFile(join(dir, 'garbage.db'))).toThrow(/keine NOVA-Datenbank/);
    const foreign = new DatabaseSync(join(dir, 'foreign.db'));
    foreign.exec('CREATE TABLE x(a)');
    foreign.close();
    expect(() => h.backups.validateDatabaseFile(join(dir, 'foreign.db'))).toThrow(/keine NOVA-Datenbank/);
    const newer = h.backups.createDatabaseBackup('test');
    const w = new DatabaseSync(newer.path);
    w.exec(`UPDATE meta SET value = '${LATEST_SCHEMA_VERSION + 1}' WHERE key = 'schema_version'`);
    w.close();
    expect(() => h.backups.validateDatabaseFile(newer.path)).toThrow(/neueren NOVA-Version/);
    expect(() => h.backups.validateDatabaseFile(join(dir, 'missing.db'))).toThrow(/nicht gefunden/);
    // Validation never leaves -wal/-shm files next to a backup.
    expect(readdirSync(h.t.core.paths.backups).filter((n) => /-(wal|shm)$/.test(n))).toEqual([]);
  });

  it('schedules a database restore: safety backup, restore-pending.json and the restart handler', async () => {
    h = backupHarness();
    const target = h.backups.createDatabaseBackup('Stand A');
    let restarted = 0;
    h.backups.setRestartHandler(() => restarted++);
    const r = await h.backups.restore(target.id);
    expect(r.restartRequired).toBe(true);
    expect(r.path).toBe(target.path);
    expect(r.message).toContain('startet den Hintergrunddienst');
    const pending = JSON.parse(readFileSync(h.t.core.paths.restorePending, 'utf8'));
    expect(pending.backupPath).toBe(target.path);
    expect(existsSync(pending.safetyBackupPath)).toBe(true);
    expect(h.backups.list().some((b) => b.reason === 'vor Wiederherstellung')).toBe(true);
    await new Promise((res) => setTimeout(res, 80));
    expect(restarted).toBe(1);
    // The pending backup cannot be deleted.
    expect(() => h.backups.delete(target.id)).toThrow(/vorgemerkt/);
  });

  it('asks for a manual restart without handler and refuses while agents run or for broken backups', async () => {
    h = backupHarness();
    const target = h.backups.createDatabaseBackup('Stand A');
    h.activeRuns.n = 1;
    await expect(h.backups.restore(target.id)).rejects.toMatchObject({ code: 'CONFLICT' });
    h.activeRuns.n = 0;
    const r = await h.backups.restore(target.id);
    expect(r.message).toContain('Bitte NOVA jetzt neu starten');
    writeFileSync(target.path, 'kaputt');
    await expect(h.backups.restore(target.id)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.restore('bak_missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('deletes backups (file + row) and never deletes files outside the NOVA folders', () => {
    h = backupHarness();
    const b = h.backups.createDatabaseBackup('weg');
    h.backups.delete(b.id);
    expect(existsSync(b.path)).toBe(false);
    expect(h.backups.list()).toEqual([]);
    const foreign = join(h.scratch, 'user-file.db');
    writeFileSync(foreign, 'user data');
    h.t.core.db.run("INSERT INTO backups(id, kind, path, size_bytes, reason, project_id, created_at) VALUES ('bak_x', 'database', ?, 1, 'fremd', NULL, 1)", [foreign]);
    h.backups.delete('bak_x');
    expect(existsSync(foreign)).toBe(true);
    expect(() => h.backups.delete('bak_x')).toThrow(/nicht gefunden/);
  });
});

describe('retention and daily backup', () => {
  it('keeps retentionCount, deletes by age, always keeps the newest and the pending one, prunes journal blobs', () => {
    h = backupHarness();
    h.t.core.settings.update({ backup: { retentionCount: 3, retentionDays: 10, snapshotRetentionDays: 60 } });
    const day = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const made = [];
    for (let i = 0; i < 6; i++) {
      const b = h.backups.createDatabaseBackup(`b${i}`);
      h.t.core.db.run('UPDATE backups SET created_at = ? WHERE id = ?', [now - (6 - i) * day, b.id]); // b5 newest (1 day old)
      made.push(b);
    }
    const old = h.backups.createDatabaseBackup('alt');
    h.t.core.db.run('UPDATE backups SET created_at = ? WHERE id = ?', [now - 40 * day, old.id]);
    writeFileSync(h.t.core.paths.restorePending, JSON.stringify({ backupPath: made[0].path }));
    const deleted = h.backups.applyRetention();
    const left = h.backups.list().map((b) => b.reason).sort();
    expect(left).toEqual(['b0', 'b3', 'b4', 'b5'].sort()); // newest 3 + pending b0
    expect(existsSync(old.path)).toBe(false);
    expect(deleted).toBe(3 + 2); // 3 backups + 2 journal blobs (fake)
    expect(h.pruned).toHaveLength(1);
    expect(Math.abs(h.pruned[0] - (Date.now() - 60 * day))).toBeLessThan(5000);
  });

  it('never deletes the only (newest) backup even when it is older than the age limit', () => {
    h = backupHarness();
    h.t.core.settings.update({ backup: { retentionDays: 1, snapshotRetentionDays: 0 } });
    const b = h.backups.createDatabaseBackup('einzig');
    h.t.core.db.run('UPDATE backups SET created_at = 1 WHERE id = ?', [b.id]);
    expect(h.backups.applyRetention()).toBe(0);
    expect(h.pruned).toEqual([]);
    expect(existsSync(b.path)).toBe(true);
  });

  it('maintenance variants: the daily backup is made in a worker thread, retention can leave the journal prune to the caller', async () => {
    h = backupHarness();
    h.t.core.db.run("INSERT INTO meta(key, value) VALUES ('probe', 'aus dem Worker')");
    const first = await h.backups.maybeDailyBackupAsync();
    expect(first?.reason).toBe('täglich');
    const copy = new DatabaseSync(first!.path, { readOnly: true });
    expect(copy.prepare("SELECT value FROM meta WHERE key = 'probe'").get()).toMatchObject({ value: 'aus dem Worker' });
    copy.close();
    expect(h.backups.validateDatabaseFile(first!.path)).toEqual({ schemaVersion: LATEST_SCHEMA_VERSION });
    expect(await h.backups.maybeDailyBackupAsync()).toBeNull();
    h.t.core.settings.update({ backup: { snapshotRetentionDays: 60 } });
    h.backups.applyRetention({ journal: false });
    expect(h.pruned).toEqual([]);
    h.backups.applyRetention();
    expect(h.pruned).toHaveLength(1);
  });

  it('creates the daily backup once per day and not when disabled', () => {
    h = backupHarness();
    const first = h.backups.maybeDailyBackup();
    expect(first?.reason).toBe('täglich');
    expect(h.backups.maybeDailyBackup()).toBeNull();
    h.t.core.db.run('UPDATE backups SET created_at = 1');
    h.t.core.settings.update({ backup: { dailyDatabaseBackup: false } });
    expect(h.backups.maybeDailyBackup()).toBeNull();
    h.t.core.settings.update({ backup: { dailyDatabaseBackup: true } });
    expect(h.backups.maybeDailyBackup()?.reason).toBe('täglich');
  });
});

describe('project snapshots', () => {
  function project(): { root: string } {
    const root = join(h.scratch, 'Mein Projekt');
    mkdirSync(root, { recursive: true });
    h.write(root, 'src/index.js', 'console.log(1);');
    h.write(root, 'node_modules/big/index.js', 'x'.repeat(1000));
    h.write(root, 'dist/bundle.js', 'bundle');
    h.write(root, '.git/HEAD', 'ref: refs/heads/main');
    h.addProject({ id: 'prj_1', name: 'Mein Projekt', path: root });
    return { root };
  }

  it('copies the project without links/dependency/build folders, writes a manifest and reports progress', async () => {
    h = backupHarness();
    const { root } = project();
    const progress: (number | null)[] = [];
    const info = await h.backups.snapshotProject('prj_1', undefined, (p) => progress.push(p));
    expect(info).toMatchObject({ kind: 'project_snapshot', projectId: 'prj_1', reason: 'Projektkopie' });
    expect(info.path.startsWith(join(h.t.core.paths.backups, 'projects', 'prj_1'))).toBe(true);
    expect(readFileSync(join(info.path, 'src/index.js'), 'utf8')).toBe('console.log(1);');
    expect(existsSync(join(info.path, 'node_modules'))).toBe(false);
    expect(existsSync(join(info.path, 'dist'))).toBe(false);
    expect(existsSync(join(info.path, '.git'))).toBe(false);
    const manifest = JSON.parse(readFileSync(`${info.path}.json`, 'utf8'));
    expect(manifest).toMatchObject({ format: 'nova-snapshot', id: info.id, projectId: 'prj_1', sourcePath: root, fileCount: 1 });
    expect(progress[0]).toBeNull();
    expect(progress[progress.length - 1]).toBe(100);
    // The snapshot is adopted again from its manifest when the row is lost (e.g. after a database restore).
    h.t.core.db.run('DELETE FROM backups');
    const adopted = h.backups.list().find((b) => b.kind === 'project_snapshot');
    expect(adopted).toMatchObject({ id: info.id, projectId: 'prj_1', path: info.path });
  });

  it('refuses projects above the size cap without leaving anything behind and honours abort', async () => {
    h = backupHarness({ snapshotMaxBytes: 10 });
    project();
    await expect(h.backups.snapshotProject('prj_1')).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    const snapDir = join(h.t.core.paths.backups, 'projects', 'prj_1');
    expect(!existsSync(snapDir) || readdirSync(snapDir).length === 0).toBe(true);
    expect(h.backups.list()).toEqual([]);
    h.cleanup();
    h = backupHarness();
    project();
    const c = new AbortController();
    c.abort();
    await expect(h.backups.snapshotProject('prj_1', c.signal)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(h.backups.list()).toEqual([]);
    await expect(h.backups.snapshotProject('prj_missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('restores a snapshot into a new folder only', async () => {
    h = backupHarness();
    const { root } = project();
    const info = await h.backups.snapshotProject('prj_1');
    writeFileSync(join(root, 'src/index.js'), 'changed later');
    const r = await h.backups.restore(info.id);
    expect(r.restartRequired).toBe(false);
    expect(r.path).toMatch(/NOVA Projekte[\\/]Mein Projekt \(Wiederherstellung \d{4}-\d{2}-\d{2} \d{2}-\d{2}\)$/);
    expect(readFileSync(join(r.path!, 'src/index.js'), 'utf8')).toBe('console.log(1);');
    expect(readFileSync(join(root, 'src/index.js'), 'utf8')).toBe('changed later'); // original untouched
    expect(r.message).toContain('ursprüngliche Projekt bleibt unverändert');
    // Second restore with the default name gets a unique folder.
    const r2 = await h.backups.restore(info.id);
    expect(r2.path).not.toBe(r.path);
    // Explicit target: must be empty/new, never the original, inside it, the data dir or the snapshot.
    const empty = join(h.scratch, 'leer');
    mkdirSync(empty);
    expect((await h.backups.restore(info.id, { targetDir: empty })).path).toBe(empty);
    await expect(h.backups.restore(info.id, { targetDir: root })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.restore(info.id, { targetDir: join(root, 'sub') })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.restore(info.id, { targetDir: join(h.t.core.paths.root, 'x') })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.restore(info.id, { targetDir: join(info.path, 'x') })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.backups.restore(info.id, { targetDir: empty })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('nicht leer') });
    await expect(h.backups.restore(info.id, { targetDir: 'relativ' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('compares restore targets canonically: a link spelling of the project or the data dir is refused', async () => {
    h = backupHarness();
    const { root } = project();
    const info = await h.backups.snapshotProject('prj_1');
    // A junction on Windows (no privilege needed), a symlink elsewhere – like an 8.3 short name, another spelling.
    const viaProject = join(h.scratch, 'projekt-link');
    symlinkSync(root, viaProject, 'junction');
    const viaData = join(h.scratch, 'daten-link');
    symlinkSync(h.t.core.paths.root, viaData, 'junction');
    await expect(h.backups.restore(info.id, { targetDir: join(viaProject, 'neu') })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('ursprünglichen Projektordner') });
    await expect(h.backups.restore(info.id, { targetDir: join(viaData, 'neu') })).rejects.toMatchObject({ code: 'VALIDATION', message: expect.stringContaining('NOVA-Datenordner') });
    expect(existsSync(join(root, 'neu'))).toBe(false);
    expect(existsSync(join(h.t.core.paths.root, 'neu'))).toBe(false);
    // Delete never follows a link out of the backup folders.
    const outside = join(h.scratch, 'fremd');
    mkdirSync(join(outside, 'kopie'), { recursive: true });
    writeFileSync(join(outside, 'kopie', 'wichtig.txt'), 'x');
    const linkInBackups = join(h.t.core.paths.backups, 'projects', 'link');
    symlinkSync(outside, linkInBackups, 'junction');
    h.t.core.db.run("INSERT INTO backups(id, kind, path, size_bytes, reason, project_id, created_at) VALUES ('bak_link', 'project_snapshot', ?, 0, 'x', 'prj_1', 1)", [join(linkInBackups, 'kopie')]);
    h.backups.delete('bak_link');
    expect(readFileSync(join(outside, 'kopie', 'wichtig.txt'), 'utf8')).toBe('x');
    expect(h.backups.list().some((b) => b.id === 'bak_link')).toBe(false); // only the entry is removed
  });

  it('applies count retention per project for snapshots and deletes their manifests', async () => {
    h = backupHarness();
    h.t.core.settings.update({ backup: { retentionCount: 1, retentionDays: 0, snapshotRetentionDays: 0 } });
    project();
    const a = await h.backups.snapshotProject('prj_1');
    const b = await h.backups.snapshotProject('prj_1');
    h.t.core.db.run('UPDATE backups SET created_at = created_at - 1000 WHERE id = ?', [a.id]);
    const old = new Date(Date.now() - 5000);
    utimesSync(`${a.path}.json`, old, old);
    expect(h.backups.applyRetention()).toBe(1);
    expect(existsSync(a.path)).toBe(false);
    expect(existsSync(`${a.path}.json`)).toBe(false);
    expect(existsSync(b.path)).toBe(true);
  });
});
