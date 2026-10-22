// Unit tests of backup naming: slugs, local timestamps, database backup names (ours and app.ts-written ones),
// folder names for restored snapshots.
import { describe, expect, it } from 'vitest';
import { databaseBackupName, exportFileName, folderDate, parseDatabaseBackupName, parseStamp, safeFolderName, slugify, snapshotFolderName, stamp } from './names';

describe('names', () => {
  it('slugifies German reasons to ASCII', () => {
    expect(slugify('vor Wiederherstellung')).toBe('vor-wiederherstellung');
    expect(slugify('Täglich – Größe ÄÖÜ ß')).toBe('taeglich-groesse-aeoeue-ss');
    expect(slugify('Versionswechsel 0.1.0 → 0.2.0')).toBe('versionswechsel-0-1-0-0-2-0');
    expect(slugify('   ')).toBe('sicherung');
    expect(slugify('x'.repeat(100)).length).toBeLessThanOrEqual(40);
  });

  it('formats and parses local timestamps', () => {
    const ts = new Date(2026, 9, 22, 14, 5, 9).getTime();
    expect(stamp(ts)).toBe('20261022-140509');
    expect(parseStamp('20261022-140509')).toBe(ts);
    expect(parseStamp('nope')).toBeNull();
    expect(databaseBackupName(ts, 'täglich')).toBe('nova-20261022-140509-taeglich.db');
    expect(exportFileName(ts)).toBe('nova-export-20261022-140509.json');
    expect(snapshotFolderName(ts, 'Mein Spiel!')).toBe('20261022-140509-mein-spiel');
    expect(folderDate(ts)).toBe('2026-10-22 14-05');
  });

  it('parses backup names found on disk', () => {
    const ts = new Date(2026, 9, 22, 14, 5, 9).getTime();
    expect(parseDatabaseBackupName('nova-20261022-140509-vor-wiederherstellung.db')).toEqual({ createdAt: ts, reason: 'vor wiederherstellung' });
    expect(parseDatabaseBackupName('nova-vor-migration-v1-2026-10-22T12-00-00-000Z.db')).toEqual({ createdAt: Date.parse('2026-10-22T12:00:00.000Z'), reason: 'vor migration v1' });
    expect(parseDatabaseBackupName('nova-2026-10-22T12-00-00-000Z-vor-wiederherstellung.db')).toEqual({
      createdAt: Date.parse('2026-10-22T12:00:00.000Z'),
      reason: 'vor wiederherstellung',
    });
    expect(parseDatabaseBackupName('nova-20261022-140509.db')).toEqual({ createdAt: ts, reason: 'Sicherung' });
    expect(parseDatabaseBackupName('other.db')).toBeNull();
    expect(parseDatabaseBackupName('nova-x.db-wal')).toBeNull();
  });

  it('makes Windows-safe folder names', () => {
    expect(safeFolderName('Spiel: Teil 2 / Beta?')).toBe('Spiel- Teil 2 - Beta-');
    expect(safeFolderName('name. ')).toBe('name');
    expect(safeFolderName('CON')).toBe('Projekt');
    expect(safeFolderName('')).toBe('Projekt');
  });
});
