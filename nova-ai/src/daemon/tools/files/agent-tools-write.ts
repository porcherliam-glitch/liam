// Writing file agent tools: write_file (coder, tester), edit_file (coder, tester), delete_file (coder).
// Order for every write (SPEC §4.3/§6.3): PathGuard → protected check → FileLockService.acquire (FILE_LOCKED names
// the holding task) → approvals (security_config for sensitive files, delete when permissions.approveDeletes) →
// ChangeJournal (actor 'nova', taskId, runId) → tasks.addFiles.
// Key decisions:
// - write_file on an existing file keeps its dominant EOL, its BOM and its 8-bit/UTF-16 encoding; NOVA never adds a
//   BOM (a leading U+FEFF from the model is dropped); new files use CRLF for .bat/.cmd/.sln/.csproj/.cs/.ps1, else LF.
// - edit_file matches on a CRLF→LF normalized view and writes the new text in the file's dominant EOL while every
//   untouched byte stays as it was (edit-match.ts). Not found / ambiguous → German hints for the model.
// - A write whose content looks like a credential (containsSecret) succeeds but carries a warning (+ activity step).
// - Outputs are compact; edit_file echoes the edited region (numbered, masked for sensitive files) for verification.
import { lstat, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { AgentTool, Services, ToolContext, ToolResult } from '../../contracts';
import { containsSecret, maskSecretFile } from '../../core/redact';
import { applyEdit, normalizeNewlines } from './edit-match';
import { convertEol, countLines, decodeText, defaultEolFor, dominantEol, encodeText, formatBytes, isBinaryContent, stripBom, type Eol } from './text';
import { abortedResult, acquireLock, addTaskFiles, requireApproval, toolError } from './tool-common';

const MAX_WRITE_CHARS = 5_000_000;

export const SECRET_WARNING =
  'Warnung: Der Inhalt sieht nach einem Zugangsschlüssel oder Passwort aus. Geheimnisse gehören nicht in den Quellcode – bitte Umgebungsvariablen (z. B. eine nicht eingecheckte .env-Datei) verwenden.';

const WriteFileSchema = z.object({
  path: z.string().min(1).describe('Project-relative file path. Missing folders are created.'),
  content: z.string().describe('The complete new file content.'),
});
type WriteFileParams = z.output<typeof WriteFileSchema>;

const EditFileSchema = z.object({
  path: z.string().min(1).describe('Project-relative path of an existing file.'),
  oldText: z.string().describe('Exact text to replace (copy it from read_file without the line-number prefixes). Must be unique unless replaceAll=true.'),
  newText: z.string().describe('Replacement text.'),
  replaceAll: z.boolean().default(false).describe('Replace every occurrence instead of exactly one.'),
});
type EditFileParams = z.output<typeof EditFileSchema>;

const DeleteFileSchema = z.object({
  path: z.string().min(1).describe('Project-relative path of the file to delete.'),
});
type DeleteFileParams = z.output<typeof DeleteFileSchema>;

const eolName = (eol: Eol) => (eol === '\r\n' ? 'CRLF' : 'LF');

/** Guard + protection + lock; returns the resolved path or a ToolResult to return. */
function prepareWrite(s: Services, ctx: ToolContext, path: string): { rel: string; key: string; abs: string } | ToolResult {
  const r = s.pathGuard.resolve(ctx.project.path, path);
  if (!r.rel) return { status: 'error', code: 'VALIDATION', content: 'Bitte eine Datei angeben, nicht den Projektordner.' };
  if (s.pathGuard.isProtected(ctx.project.path, r.key)) {
    return { status: 'error', code: 'VALIDATION', content: `„${r.rel}“ liegt in einem geschützten Bereich (.git, .nova oder NOVA-Datenordner) und darf nicht verändert werden.` };
  }
  const locked = acquireLock(s, ctx, r.key, r.rel);
  if (locked) return locked;
  return r;
}

function isToolResult(x: unknown): x is ToolResult {
  return typeof x === 'object' && x !== null && 'status' in x;
}

function secretNotes(s: Services, ctx: ToolContext, rel: string, text: string, sensitive: boolean): string[] {
  if (sensitive || !containsSecret(text)) return [];
  ctx.step('status', `Warnung: ${rel} enthält möglicherweise einen Zugangsschlüssel.`);
  return [SECRET_WARNING];
}

export function createWriteFileTool(s: Services): AgentTool<WriteFileParams> {
  return {
    name: 'write_file',
    description:
      'Create a file or replace its complete content. Prefer edit_file for small changes to existing files. Line endings and encoding of existing files are kept automatically.',
    schema: WriteFileSchema,
    readOnly: false,
    describe: (p) => `Schreibt ${p.path}`,
    async execute(p, ctx) {
      try {
        const aborted = abortedResult(ctx);
        if (aborted) return aborted;
        if (p.content.length > MAX_WRITE_CHARS) return { status: 'error', code: 'VALIDATION', content: 'Der Inhalt ist zu groß (über 5 Millionen Zeichen).' };
        const prep = prepareWrite(s, ctx, p.path);
        if (isToolResult(prep)) return prep;
        const st = await stat(prep.abs).catch(() => null);
        if (st?.isDirectory()) return { status: 'error', code: 'VALIDATION', content: `„${prep.rel}“ ist ein Ordner.` };
        const sensitive = s.pathGuard.isSensitive(prep.rel);
        if (sensitive) {
          const gate = requireApproval(s, ctx, {
            kind: 'security_config',
            subject: prep.rel,
            title: `Sensible Datei ${st ? 'ändern' : 'anlegen'}: ${prep.rel}`,
            action: `Ein Agent möchte die Datei „${prep.rel}“ im Projekt „${ctx.project.name}“ ${st ? 'überschreiben' : 'anlegen'}. Solche Dateien enthalten oft Zugangsdaten, Schlüssel oder Paket-Anmeldedaten.`,
            consequences: 'Zugangsdaten oder Sicherheitseinstellungen des Projekts können sich ändern. NOVA sichert den bisherigen Inhalt; die Änderung lässt sich über einen Wiederherstellungspunkt rückgängig machen.',
            details: { path: prep.rel, tool: 'write_file' },
          });
          if (gate) return gate;
        }
        const existing = st ? await readFile(prep.abs) : null;
        const body = stripBom(p.content);
        let eol: Eol = defaultEolFor(prep.rel);
        let bom = false;
        let encoding: Parameters<typeof encodeText>[1]['encoding'] = 'utf8';
        if (existing && !isBinaryContent(existing)) {
          const d = decodeText(existing);
          eol = dominantEol(d.text) ?? eol;
          bom = d.bom;
          encoding = d.encoding;
        }
        const text = convertEol(body, eol);
        const enc = encodeText(text, { bom, encoding });
        const rec = await s.journal.writeFile({
          projectId: ctx.project.id,
          projectRoot: ctx.project.path,
          relPath: prep.rel,
          content: enc.data,
          taskId: ctx.task.id,
          runId: ctx.runId,
          actor: 'nova',
          source: 'tool',
        });
        if (rec) addTaskFiles(s, ctx, [prep.rel]);
        const notes = secretNotes(s, ctx, prep.rel, p.content, sensitive);
        if (enc.switchedToUtf8) notes.push('Hinweis: Der neue Inhalt enthält Zeichen, die in der bisherigen Kodierung nicht darstellbar sind – die Datei ist jetzt UTF-8-kodiert.');
        const verb = !rec ? 'unverändert (der Inhalt war bereits identisch)' : rec.op === 'create' ? 'angelegt' : 'überschrieben';
        const summary = `${prep.rel} ${verb}: ${countLines(text)} Zeilen, ${formatBytes(enc.data.length)}, Zeilenenden ${eolName(eol)}${bom ? ', BOM beibehalten' : ''}.`;
        return {
          status: 'ok',
          content: [summary, ...notes].join('\n'),
          filesChanged: rec ? [prep.rel] : [],
          data: { path: prep.rel, op: rec?.op ?? 'unchanged', changeId: rec?.id ?? null, bytes: enc.data.length },
        };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}

export function createEditFileTool(s: Services): AgentTool<EditFileParams> {
  return {
    name: 'edit_file',
    description:
      'Replace an exact text passage in an existing file (oldText → newText). oldText must match exactly once (whitespace and indentation included) unless replaceAll=true. Line endings are handled automatically.',
    schema: EditFileSchema,
    readOnly: false,
    describe: (p) => `Bearbeitet ${p.path}`,
    async execute(p, ctx) {
      try {
        const aborted = abortedResult(ctx);
        if (aborted) return aborted;
        const prep = prepareWrite(s, ctx, p.path);
        if (isToolResult(prep)) return prep;
        const st = await stat(prep.abs).catch(() => null);
        if (!st) return { status: 'error', code: 'NOT_FOUND', content: `Die Datei „${prep.rel}“ existiert nicht. Zum Anlegen bitte write_file verwenden.` };
        if (st.isDirectory()) return { status: 'error', code: 'VALIDATION', content: `„${prep.rel}“ ist ein Ordner.` };
        const buf = await readFile(prep.abs);
        if (isBinaryContent(buf)) return { status: 'error', code: 'VALIDATION', content: `„${prep.rel}“ ist eine Binärdatei und kann nicht als Text bearbeitet werden.` };
        const sensitive = s.pathGuard.isSensitive(prep.rel);
        const d = decodeText(buf);
        const eol: Eol = dominantEol(d.text) ?? defaultEolFor(prep.rel);
        const outcome = applyEdit(d.text, p.oldText, p.newText, p.replaceAll, eol);
        if (outcome.kind === 'empty_old') {
          return { status: 'error', code: 'VALIDATION', content: 'oldText darf nicht leer sein. Zum Anlegen oder vollständigen Ersetzen einer Datei bitte write_file verwenden.' };
        }
        if (outcome.kind === 'not_found') {
          const hint = outcome.hint ? `\n${sensitive ? maskSecretFile(outcome.hint) : outcome.hint}` : '';
          return {
            status: 'error',
            code: 'VALIDATION',
            content: `oldText wurde in ${prep.rel} nicht gefunden. Bitte den aktuellen Inhalt mit read_file prüfen und oldText exakt übernehmen (ohne die Zeilennummern).${hint}`,
          };
        }
        if (outcome.kind === 'ambiguous') {
          const shown = outcome.lines.slice(0, 10).join(', ');
          return {
            status: 'error',
            code: 'VALIDATION',
            content: `oldText kommt in ${prep.rel} ${outcome.lines.length}-mal vor (Zeilen ${shown}${outcome.lines.length > 10 ? ', …' : ''}). Bitte mehr umgebenden Text angeben, damit die Stelle eindeutig ist, oder replaceAll=true setzen.`,
          };
        }
        if (sensitive) {
          const gate = requireApproval(s, ctx, {
            kind: 'security_config',
            subject: prep.rel,
            title: `Sensible Datei ändern: ${prep.rel}`,
            action: `Ein Agent möchte die Datei „${prep.rel}“ im Projekt „${ctx.project.name}“ bearbeiten. Solche Dateien enthalten oft Zugangsdaten, Schlüssel oder Paket-Anmeldedaten.`,
            consequences: 'Zugangsdaten oder Sicherheitseinstellungen des Projekts können sich ändern. NOVA sichert den bisherigen Inhalt; die Änderung lässt sich über einen Wiederherstellungspunkt rückgängig machen.',
            details: { path: prep.rel, tool: 'edit_file' },
          });
          if (gate) return gate;
        }
        const enc = encodeText(outcome.text, { bom: d.bom, encoding: d.encoding });
        const rec = await s.journal.writeFile({
          projectId: ctx.project.id,
          projectRoot: ctx.project.path,
          relPath: prep.rel,
          content: enc.data,
          taskId: ctx.task.id,
          runId: ctx.runId,
          actor: 'nova',
          source: 'tool',
        });
        if (rec) addTaskFiles(s, ctx, [prep.rel]);
        const newLines = normalizeNewlines(outcome.text).norm.split('\n');
        const first = outcome.lines[0];
        const from = Math.max(1, first - 2);
        const to = Math.min(newLines.length, first + Math.max(outcome.insertedLines, 1) - 1 + 2, from + 14);
        let snippet = newLines
          .slice(from - 1, to)
          .map((l, i) => `${from + i}: ${l.length > 300 ? `${l.slice(0, 300)} …` : l}`)
          .join('\n');
        if (sensitive) snippet = maskSecretFile(snippet);
        const where = outcome.count === 1 ? `Zeile ${first}` : `Zeilen ${outcome.lines.slice(0, 10).join(', ')}${outcome.count > 10 ? ', …' : ''}`;
        const summary = rec
          ? `${prep.rel} bearbeitet: ${outcome.count} ${outcome.count === 1 ? 'Stelle' : 'Stellen'} ersetzt (${where}).`
          : `${prep.rel} unverändert: newText ist identisch mit oldText.`;
        const notes = secretNotes(s, ctx, prep.rel, p.newText, sensitive);
        if (enc.switchedToUtf8) notes.push('Hinweis: Der neue Text enthält Zeichen, die in der bisherigen Kodierung nicht darstellbar sind – die Datei ist jetzt UTF-8-kodiert.');
        return {
          status: 'ok',
          content: [summary, `Neuer Stand (Ausschnitt):\n${snippet}`, ...notes].join('\n'),
          filesChanged: rec ? [prep.rel] : [],
          data: { path: prep.rel, replacements: outcome.count, lines: outcome.lines, changeId: rec?.id ?? null },
        };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}

export function createDeleteFileTool(s: Services): AgentTool<DeleteFileParams> {
  return {
    name: 'delete_file',
    description: 'Delete a single file of the project. The content is backed up first, so the deletion can be undone by a restore. May require user approval.',
    schema: DeleteFileSchema,
    readOnly: false,
    describe: (p) => `Löscht ${p.path}`,
    async execute(p, ctx) {
      try {
        const aborted = abortedResult(ctx);
        if (aborted) return aborted;
        const raw = p.path.trim();
        const lexical = isAbsolute(raw) ? raw : join(ctx.project.path, raw);
        const isLink = await lstat(lexical).then((x) => x.isSymbolicLink()).catch(() => false);
        if (isLink) return { status: 'error', code: 'VALIDATION', content: `„${raw}“ ist eine Verknüpfung. Verknüpfungen werden von NOVA nicht gelöscht.` };
        const prep = prepareWrite(s, ctx, p.path);
        if (isToolResult(prep)) return prep;
        const st = await stat(prep.abs).catch(() => null);
        if (!st) return { status: 'error', code: 'NOT_FOUND', content: `Die Datei „${prep.rel}“ existiert nicht.` };
        if (!st.isFile()) return { status: 'error', code: 'VALIDATION', content: `„${prep.rel}“ ist keine einzelne Datei. Es können nur einzelne Dateien gelöscht werden.` };
        const sensitive = s.pathGuard.isSensitive(prep.rel);
        const gate = sensitive
          ? requireApproval(s, ctx, {
              kind: 'security_config',
              subject: prep.rel,
              title: `Sensible Datei löschen: ${prep.rel}`,
              action: `Ein Agent möchte die Datei „${prep.rel}“ aus dem Projekt „${ctx.project.name}“ löschen. Solche Dateien enthalten oft Zugangsdaten oder Schlüssel.`,
              consequences: 'Das Projekt verliert diese Einstellungen oder Zugangsdaten. NOVA sichert den Inhalt vorher; die Löschung lässt sich über einen Wiederherstellungspunkt rückgängig machen.',
              details: { path: prep.rel, tool: 'delete_file' },
            })
          : s.core.settings.section('permissions').approveDeletes
            ? requireApproval(s, ctx, {
                kind: 'delete',
                subject: prep.rel,
                title: `Datei löschen: ${prep.rel}`,
                action: `Ein Agent möchte die Datei „${prep.rel}“ aus dem Projekt „${ctx.project.name}“ löschen.`,
                consequences: 'Die Datei wird aus dem Projektordner entfernt. NOVA sichert den Inhalt vorher; die Löschung lässt sich über einen Wiederherstellungspunkt rückgängig machen.',
                details: { path: prep.rel, tool: 'delete_file' },
              })
            : null;
        if (gate) return gate;
        const rec = await s.journal.deleteFile({
          projectId: ctx.project.id,
          projectRoot: ctx.project.path,
          relPath: prep.rel,
          taskId: ctx.task.id,
          runId: ctx.runId,
          actor: 'nova',
          source: 'tool',
        });
        addTaskFiles(s, ctx, [prep.rel]);
        return {
          status: 'ok',
          content: `${prep.rel} gelöscht. Der Inhalt ist gesichert; die Löschung kann über einen Wiederherstellungspunkt rückgängig gemacht werden.`,
          filesChanged: [prep.rel],
          data: { path: prep.rel, changeId: rec.id },
        };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}
