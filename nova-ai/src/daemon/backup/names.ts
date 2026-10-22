// File and folder naming for backups, project snapshots and exports, plus parsing of names found on disk
// (files written by app.ts or by an older database state are adopted into the backup list).
// Key decisions:
// - Database backups: nova-YYYYMMDD-HHMMSS-<reason-slug>.db (local time, sortable). Reason slugs are ASCII
//   (German umlauts transliterated) so names stay valid on every file system.
// - Restored project snapshots go to "<name> (Wiederherstellung YYYY-MM-DD HH-MM)" – no ':' (invalid on Windows).

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local timestamp "YYYYMMDD-HHMMSS". */
export function stamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/** Parses "YYYYMMDD-HHMMSS" (local time) → epoch ms, or null. */
export function parseStamp(text: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

/** ASCII slug: lower-case, umlauts transliterated, other characters → '-', max 40 chars. */
export function slugify(text: string, fallback = 'sicherung'): string {
  const s = text
    .replace(/[äöüÄÖÜß]/g, (c) => UMLAUTS[c] ?? c)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || fallback;
}

/** Database backup file name. */
export function databaseBackupName(ts: number, reason: string): string {
  return `nova-${stamp(ts)}-${slugify(reason)}.db`;
}

/** Export file name. */
export function exportFileName(ts: number): string {
  return `nova-export-${stamp(ts)}.json`;
}

/** Project snapshot folder name. */
export function snapshotFolderName(ts: number, projectName: string): string {
  return `${stamp(ts)}-${slugify(projectName, 'projekt')}`;
}

export interface ParsedBackupName {
  createdAt: number | null;
  reason: string;
}

/**
 * Derives reason (and time when encoded) from a database backup file name found on disk:
 * "nova-20261022-140501-vor-update.db" → { reason: "vor update", createdAt }, also app.ts names like
 * "nova-vor-migration-v1-2026-10-22T12-00-00-000Z.db" or "nova-2026-10-22T12-00-00-000Z-vor-wiederherstellung.db".
 */
export function parseDatabaseBackupName(fileName: string): ParsedBackupName | null {
  const m = /^nova-(.+)\.db$/i.exec(fileName);
  if (!m) return null;
  let rest = m[1];
  let createdAt: number | null = null;
  const ours = /^(\d{8}-\d{6})(?:-(.*))?$/.exec(rest);
  if (ours) {
    createdAt = parseStamp(ours[1]);
    rest = ours[2] ?? '';
  } else {
    const iso = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(rest);
    if (iso) {
      const t = Date.parse(`${iso[1]}T${iso[2]}:${iso[3]}:${iso[4]}.${iso[5]}Z`);
      createdAt = Number.isNaN(t) ? null : t;
      rest = rest.replace(iso[0], '');
    }
  }
  const reason = rest.replace(/^-+|-+$/g, '').replace(/-+/g, ' ').trim() || 'Sicherung';
  return { createdAt, reason };
}

/** "YYYY-MM-DD HH-MM" (local) for folder names. */
export function folderDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

/** Replaces characters that are invalid in Windows file names and trims trailing dots/spaces. */
export function safeFolderName(name: string, fallback = 'Projekt'): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100);
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) return fallback;
  return cleaned;
}
