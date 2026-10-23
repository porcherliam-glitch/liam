// File format of memory exports/imports (memory.export / memory.import) and default export file names.
//
// Key decisions:
// - Envelope { format: "nova-memory-export", version: 1, exportedAt, scope, projects, entries }. `projects` lists
//   id/name/path of every project referenced by the entries, so an import into another installation can map entries
//   to the matching project (same folder, else a unique project with the same name).
// - The envelope is validated strictly; entries are validated one by one (an invalid entry is skipped and counted,
//   it does not abort the whole import). A newer format version is rejected with a German message.
// - Default path: <dataDir>/exports/memory-<project|global|gesamt>-<YYYYMMDD-HHMMSS>.json (local time); <project> is
//   an ASCII slug of the project name (umlauts transliterated), falling back to the project id.
import { z } from 'zod';
import { MemoryKind } from '@shared/schemas';
import { CONTENT_MAX, TITLE_MAX } from './guard';

export const MEMORY_EXPORT_FORMAT = 'nova-memory-export';
export const MEMORY_EXPORT_VERSION = 1;
/** Imports larger than this are refused (memory entries are small; 100 MB ≈ 5 000 maximal entries). */
export const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export const MemoryExportScopeSchema = z.object({
  type: z.enum(['all', 'global', 'project']),
  projectId: z.string().nullable(),
});
export type MemoryExportScope = z.infer<typeof MemoryExportScopeSchema>;

export const MemoryExportProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  path: z.string(),
});
export type MemoryExportProject = z.infer<typeof MemoryExportProjectSchema>;

export const MemoryExportEnvelopeSchema = z.object({
  format: z.literal(MEMORY_EXPORT_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.number(),
  scope: MemoryExportScopeSchema.optional(),
  projects: z.array(MemoryExportProjectSchema).default([]),
  entries: z.array(z.unknown()),
});
export type MemoryExportEnvelope = z.infer<typeof MemoryExportEnvelopeSchema>;

/** One entry in an import file (defaults for fields older/handwritten files may lack). */
export const MemoryImportEntrySchema = z.object({
  id: z.string().min(1).max(200),
  projectId: z.string().min(1).nullable(),
  kind: MemoryKind,
  title: z.string().min(1).max(TITLE_MAX),
  content: z.string().max(CONTENT_MAX).default(''),
  tags: z.array(z.string()).default([]),
  source: z.enum(['user', 'agent', 'system']).default('user'),
  shareable: z.boolean().default(false),
  taskId: z.string().nullable().default(null),
  createdAt: z.number().int().nonnegative().optional(),
  updatedAt: z.number().int().nonnegative().optional(),
});
export type MemoryImportEntry = z.infer<typeof MemoryImportEntrySchema>;

/** Local timestamp "YYYYMMDD-HHMMSS". */
export function fileTimestamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** ASCII file-name slug ("Mein Spiel – Größe 2" → "mein-spiel-groesse-2"); empty when nothing usable remains. */
export function fileSlug(name: string, maxLength = 40): string {
  const transliterated = name
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  return transliterated
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

/** File name part for a scope: project slug (or id), "global" or "gesamt". */
export function scopeFileLabel(projectId: string | null | undefined, projectName: string | null): string {
  if (projectId === undefined) return 'gesamt';
  if (projectId === null) return 'global';
  return fileSlug(projectName ?? '') || fileSlug(projectId) || 'projekt';
}

export function defaultExportFileName(label: string, ts: number): string {
  return `memory-${label}-${fileTimestamp(ts)}.json`;
}
