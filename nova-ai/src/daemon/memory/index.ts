// Barrel of the memory module (per-project memory + cross-project knowledge base). Used by src/daemon/app.ts.
// Wiring: s.memory = createMemoryService(s) – the factory calls no other service (it only subscribes to
// 'project.updated' on core.bus to remember project names/paths for anonymisation; s.projects.list is called lazily
// once on the first service call). No timers, nothing to start or stop. registerMemoryRpc registers memory.list/
// search/add/update/delete/clear/export/import (export/import run inside core.operations.run). Runtime dependencies
// used through the container: s.projects (get/list) only.
export { createMemoryService } from './memory-service';
export type { MemoryServiceImpl, MemoryServiceOptions, MemoryIoOptions } from './memory-service';
export { registerMemoryRpc } from './rpc';
export { buildFtsQuery, buildFtsQueryFromTerms, extractTerms, germanVariants, quoteFtsTerm, escapeLike, plainSnippet } from './text';
export { anonymizeSharedText, anonymizeProjectReferences, PATH_PLACEHOLDER, NAME_PLACEHOLDER } from './anonymize';
export type { AnonymizeSource } from './anonymize';
export { redactMemoryText, sanitizeText, isMostlySecret, normalizeTags, TITLE_MAX, CONTENT_MAX } from './guard';
export { MEMORY_EXPORT_FORMAT, MEMORY_EXPORT_VERSION, MemoryExportEnvelopeSchema, MemoryImportEntrySchema } from './export-format';
