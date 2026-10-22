// Schema migrations: a fresh database is migrated to the latest version, a database of a NEWER NOVA version (older
// setup.exe installed over a newer one) is refused with a German SCHEMA_TOO_NEW error before anything is written.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Db } from './database';
import { LATEST_SCHEMA_VERSION, SCHEMA_TOO_NEW, getSchemaVersion, migrate } from './migrations';

let dir: string | null = null;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = null;
});

describe('migrate', () => {
  it('migrates a new database to the latest version and is idempotent', () => {
    const db = new Db(':memory:');
    expect(migrate(db)).toMatchObject({ from: 0, to: LATEST_SCHEMA_VERSION });
    expect(migrate(db)).toEqual({ from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION, applied: [] });
    db.close();
  });

  it('refuses a database written by a newer NOVA version without touching it', () => {
    dir = mkdtempSync(join(tmpdir(), 'nova-migrate-'));
    const file = join(dir, 'nova.db');
    const newer = new Db(file);
    migrate(newer);
    newer.run("UPDATE meta SET value = ? WHERE key = 'schema_version'", [String(LATEST_SCHEMA_VERSION + 1)]);
    newer.exec('CREATE TABLE future_feature (id INTEGER PRIMARY KEY)');
    newer.close();

    const db = new Db(file);
    let backups = 0;
    try {
      expect(() => migrate(db, () => backups++)).toThrow(expect.objectContaining({ code: SCHEMA_TOO_NEW, severity: 'critical' }));
      expect(() => migrate(db)).toThrow(/neueren NOVA-Version.*wieder installieren/);
      expect(backups).toBe(0);
      expect(getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION + 1);
      expect(db.get("SELECT name FROM sqlite_master WHERE name = 'future_feature'")).toBeTruthy();
    } finally {
      db.close();
    }
  });
});
