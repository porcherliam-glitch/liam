// Read-only file agent tools (all roles): list_files, read_file, search_files.
// Key decisions:
// - Paths are project-relative and validated by PathGuard; outputs use full project-relative paths so the model can
//   reuse them directly, and are compact with German truncation notes.
// - list_files never follows links and does not descend into ignored folders (they are shown with a note).
// - read_file returns at most 400 numbered lines per call (lines > 2000 chars are cut) with a hint how to continue.
// - Sensitive files (.env, keys, credentials …) are returned through maskSecretFile() plus a German note, both by
//   read_file and search_files (SPEC §6.3). Legacy 8-bit files are decoded losslessly and flagged.
import { readdir, lstat, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { AgentTool, Services } from '../../contracts';
import { maskSecretFile, REDACTED } from '../../core/redact';
import { isIgnoredDirName, isNovaTempName } from '../../changes/walk';
import { buildPreview, searchProjectFiles } from './search';
import { decodeText, formatBytes, isBinaryContent } from './text';
import { toolError, truncateOutput } from './tool-common';

const MAX_LIST_ENTRIES = 400;
const MAX_READ_LINES = 400;
const MAX_LINE_CHARS = 2000;
const MAX_READ_FILE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_CHARS = 60_000;
const SEARCH_LIMIT = 100;

export const SENSITIVE_NOTE = `Hinweis: Diese Datei enthält vermutlich Zugangsdaten. Werte sind maskiert (${REDACTED}); Geheimnisse dürfen nicht in Code oder Ausgaben übernommen werden.`;

const ListFilesSchema = z.object({
  path: z.string().default('.').describe('Project-relative folder to list, "." = project root.'),
  depth: z.number().int().min(1).max(5).default(2).describe('How many folder levels to show (1-5).'),
});
type ListFilesParams = z.output<typeof ListFilesSchema>;

const ReadFileSchema = z.object({
  path: z.string().min(1).describe('Project-relative file path.'),
  startLine: z.number().int().min(1).optional().describe('First line to return (1-based).'),
  endLine: z.number().int().min(1).optional().describe('Last line to return (inclusive). At most 400 lines per call.'),
});
type ReadFileParams = z.output<typeof ReadFileSchema>;

const SearchFilesSchema = z.object({
  query: z.string().min(1).describe('Text (or regular expression when regex=true) to search for.'),
  path: z.string().optional().describe('Optional project-relative folder or file to limit the search.'),
  regex: z.boolean().default(false).describe('Interpret query as a JavaScript regular expression.'),
  caseSensitive: z.boolean().default(false).describe('Match upper/lower case exactly.'),
});
type SearchFilesParams = z.output<typeof SearchFilesSchema>;

function displayPath(rel: string): string {
  return rel || '.';
}

export function createListFilesTool(s: Services): AgentTool<ListFilesParams> {
  return {
    name: 'list_files',
    description:
      'List files and folders of the project (project-relative paths). Folders end with "/". Dependency/build folders (node_modules, .git, dist, build, bin, obj …) are shown but not expanded.',
    schema: ListFilesSchema,
    readOnly: true,
    describe: (p) => {
      const where = p.path.trim() === '' || p.path.trim() === '.' || p.path.trim() === './' ? 'im Projektordner' : `in ${p.path.trim()}`;
      return `Listet Dateien ${where} (Tiefe ${p.depth})`;
    },
    async execute(p, ctx) {
      try {
        const r = s.pathGuard.resolve(ctx.project.path, p.path);
        const st = await stat(r.abs).catch(() => null);
        if (!st) return { status: 'error', code: 'NOT_FOUND', content: `„${displayPath(r.rel)}“ wurde nicht gefunden.` };
        if (st.isFile()) return { status: 'ok', content: `${r.rel} (${formatBytes(st.size)}) – das ist eine Datei, kein Ordner.` };
        const lines: string[] = [];
        let total = 0;
        const walk = async (abs: string, rel: string, depthLeft: number): Promise<void> => {
          let entries;
          try {
            entries = await readdir(abs, { withFileTypes: true });
          } catch {
            return;
          }
          entries.sort((a, b) => {
            const ad = a.isDirectory() ? 0 : 1;
            const bd = b.isDirectory() ? 0 : 1;
            if (ad !== bd) return ad - bd;
            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
          });
          for (const e of entries) {
            if (isNovaTempName(e.name)) continue;
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            total++;
            const room = lines.length < MAX_LIST_ENTRIES;
            if (e.isSymbolicLink()) {
              if (room) lines.push(`${childRel}  (Verknüpfung – wird nicht verfolgt)`);
            } else if (e.isDirectory()) {
              const ignored = isIgnoredDirName(e.name);
              if (room) lines.push(`${childRel}/${ignored ? '  (Abhängigkeits-/Build-Ordner – nicht aufgeklappt)' : ''}`);
              if (!ignored && depthLeft > 1) await walk(join(abs, e.name), childRel, depthLeft - 1);
            } else if (e.isFile()) {
              if (room) {
                const size = await lstat(join(abs, e.name)).then((x) => x.size).catch(() => null);
                lines.push(size === null ? childRel : `${childRel}  (${formatBytes(size)})`);
              }
            }
          }
        };
        await walk(r.abs, r.rel, p.depth);
        const header = `Inhalt von ${r.rel ? r.rel + '/' : 'Projektordner'} (Tiefe ${p.depth}):`;
        if (total === 0) return { status: 'ok', content: `${header}\n(leer)`, data: { path: r.rel, entries: 0 } };
        const note = total > lines.length ? `\n… ${total - lines.length} weitere Einträge ausgelassen. Für Details einen Unterordner mit path angeben.` : '';
        return { status: 'ok', content: `${header}\n${lines.join('\n')}${note}`, data: { path: r.rel, entries: total } };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}

export function createReadFileTool(s: Services): AgentTool<ReadFileParams> {
  return {
    name: 'read_file',
    description:
      'Read a text file of the project with line numbers ("<line>: <text>"). Returns at most 400 lines per call; use startLine/endLine to read further. Secret files (.env, keys) are returned masked.',
    schema: ReadFileSchema,
    readOnly: true,
    describe: (p) => (p.startLine || p.endLine ? `Liest ${p.path} (Zeilen ${p.startLine ?? 1}–${p.endLine ?? '…'})` : `Liest ${p.path}`),
    async execute(p, ctx) {
      try {
        const r = s.pathGuard.resolve(ctx.project.path, p.path);
        if (!r.rel) return { status: 'error', code: 'VALIDATION', content: 'Der Projektordner ist keine Datei – bitte list_files verwenden.' };
        const st = await stat(r.abs).catch(() => null);
        if (!st) return { status: 'error', code: 'NOT_FOUND', content: `Die Datei „${r.rel}“ existiert nicht. Mit list_files oder search_files lässt sich der richtige Pfad finden.` };
        if (st.isDirectory()) return { status: 'error', code: 'VALIDATION', content: `„${r.rel}“ ist ein Ordner – bitte list_files verwenden.` };
        if (st.size > MAX_READ_FILE_BYTES) {
          return { status: 'error', code: 'VALIDATION', content: `„${r.rel}“ ist zu groß zum Lesen (${formatBytes(st.size)}). Mit search_files lassen sich gezielt Stellen finden.` };
        }
        const buf = await readFile(r.abs);
        if (isBinaryContent(buf)) {
          return { status: 'ok', content: `„${r.rel}“ ist eine Binärdatei (${formatBytes(buf.length)}) – der Inhalt wird nicht angezeigt.`, data: { path: r.rel, binary: true } };
        }
        const decoded = decodeText(buf);
        const sensitive = s.pathGuard.isSensitive(r.rel);
        const text = sensitive ? maskSecretFile(decoded.text) : decoded.text;
        const lines = text.split(/\r?\n/);
        if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
        const total = lines.length;
        if (total === 0) return { status: 'ok', content: `„${r.rel}“ ist leer.`, data: { path: r.rel, totalLines: 0 } };
        const start = p.startLine ?? 1;
        if (start > total) return { status: 'error', code: 'VALIDATION', content: `„${r.rel}“ hat nur ${total} Zeilen.` };
        const requestedEnd = p.endLine ?? start + MAX_READ_LINES - 1;
        if (requestedEnd < start) return { status: 'error', code: 'VALIDATION', content: 'endLine muss größer oder gleich startLine sein.' };
        const end = Math.min(total, requestedEnd, start + MAX_READ_LINES - 1);
        const out: string[] = [`${r.rel} – Zeilen ${start}–${end} von ${total}:`];
        let chars = 0;
        let last = start - 1;
        for (let i = start; i <= end; i++) {
          let line = lines[i - 1];
          if (line.length > MAX_LINE_CHARS) line = `${line.slice(0, MAX_LINE_CHARS)} … [Zeile gekürzt, ${line.length} Zeichen]`;
          const entry = `${i}: ${line}`;
          if (chars + entry.length > MAX_OUTPUT_CHARS) break;
          out.push(entry);
          chars += entry.length + 1;
          last = i;
        }
        if (last < total) out.push(`… ${total - last} weitere Zeilen. Weiterlesen mit startLine=${last + 1}.`);
        if (sensitive) out.push(SENSITIVE_NOTE);
        if (decoded.encoding === 'latin1') out.push('Hinweis: Die Datei ist nicht UTF-8-kodiert (vermutlich Windows-1252). Änderungen behalten die Kodierung bei.');
        return { status: 'ok', content: out.join('\n'), data: { path: r.rel, startLine: start, endLine: last, totalLines: total, sensitive } };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}

export function createSearchFilesTool(s: Services): AgentTool<SearchFilesParams> {
  return {
    name: 'search_files',
    description:
      'Search the project files for text (or a regular expression with regex=true). Returns "path:line:column: preview" lines, at most 100 matches. Dependency/build folders, binary files and files > 1 MB are skipped.',
    schema: SearchFilesSchema,
    readOnly: true,
    describe: (p) => `Sucht nach „${p.query.length > 60 ? p.query.slice(0, 60) + '…' : p.query}“${p.path ? ` in ${p.path}` : ''}`,
    async execute(p, ctx) {
      try {
        const root = s.pathGuard.resolve(ctx.project.path, '.').abs;
        const start = p.path ? s.pathGuard.resolve(ctx.project.path, p.path) : null;
        const res = await searchProjectFiles({
          root,
          startRel: start?.rel ?? '',
          query: p.query,
          regex: p.regex,
          caseSensitive: p.caseSensitive,
          limit: SEARCH_LIMIT,
          signal: ctx.signal,
        });
        if (res.matches.length === 0) {
          const where = start?.rel ? ` in ${start.rel}` : '';
          return {
            status: 'ok',
            content: `Keine Treffer für „${p.query}“${where} (${res.filesSearched} Dateien durchsucht).${res.timedOut ? ' Die Suche wurde wegen Zeitüberschreitung abgebrochen – bitte eingrenzen.' : ''}`,
            data: { matches: 0 },
          };
        }
        const byFile = new Map<string, string[]>();
        let sensitiveHit = false;
        for (const m of res.matches) {
          const sensitive = s.pathGuard.isSensitive(m.path);
          let preview: string;
          if (sensitive) {
            sensitiveHit = true;
            preview = m.windowStart === 0 ? buildPreview({ ...m, window: maskSecretFile(m.window) }) : `${REDACTED} (maskiert)`;
          } else {
            preview = buildPreview(m);
          }
          let list = byFile.get(m.path);
          if (!list) {
            list = [];
            byFile.set(m.path, list);
          }
          list.push(`  ${m.line}:${m.column}: ${preview}`);
        }
        const out: string[] = [`${res.matches.length} Treffer für „${p.query}“ in ${byFile.size} Dateien:`];
        for (const [file, list] of byFile) out.push(file, ...list);
        if (res.truncated) out.push(`… weitere Treffer ausgelassen (Grenze ${SEARCH_LIMIT}). Bitte die Suche eingrenzen (path oder genauerer Suchbegriff).`);
        if (res.timedOut) out.push('… die Suche wurde wegen Zeitüberschreitung abgebrochen – das Ergebnis ist unvollständig.');
        if (sensitiveHit) out.push(SENSITIVE_NOTE);
        return {
          status: 'ok',
          content: truncateOutput(out.join('\n'), MAX_OUTPUT_CHARS, 'zu viele Treffer, bitte eingrenzen'),
          data: { matches: res.matches.length, files: byFile.size, truncated: res.truncated },
        };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}
