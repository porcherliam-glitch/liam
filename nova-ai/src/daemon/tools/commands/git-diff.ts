// Agent tool git_diff (reviewer, coder, tester): shows what changed (SPEC §4.3).
// Key decisions:
// - Task files first: the CURRENT task row (s.tasks.get, because ctx.task is the snapshot from the run start) lists
//   the files NOVA changed for this task; each gets s.files.diff(projectId, path, {taskId}) (before = snapshot before
//   the task's first change, after = current content). Without task files the project's git diff (s.git.diff) is shown;
//   without git a path falls back to the journal-based s.files.diff.
// - `path` limits the output to one file (validated by PathGuard).
// - Sensitive files (.env, keys …) are listed without content; binary/too-large files are named only. The output is
//   capped at 40 000 characters with a German hint to ask for single files.
import { z } from 'zod';
import type { FileDiff, Task } from '@shared/schemas';
import type { AgentTool, Services } from '../../contracts';
import { errorMessage } from '../../core/errors';
import { headChars, toolError } from './common';

const GitDiffSchema = z.object({
  path: z.string().min(1).optional().describe('Optional project-relative file path to show only that file.'),
});
export type GitDiffParams = z.output<typeof GitDiffSchema>;

const MAX_FILES = 40;
const MAX_CHARS = 40_000;

export function createGitDiffTool(s: Services): AgentTool<GitDiffParams> {
  const keyOf = (p: string) => (s.core.platform === 'win32' ? p.replace(/\\/g, '/').toLowerCase() : p.replace(/\\/g, '/'));

  function formatDiff(d: FileDiff): string {
    let sensitive = false;
    try {
      sensitive = s.pathGuard.isSensitive(d.path);
    } catch {
      sensitive = false;
    }
    if (sensitive) return `=== ${d.path} (sensible Datei – Inhalt wird nicht angezeigt)`;
    if (d.binary) return `=== ${d.path}: ${d.unified.trim() || 'Binärdatei geändert.'}`;
    if (!d.unified.trim()) return `=== ${d.path}: keine Unterschiede`;
    return `=== ${d.path}\n${d.unified.trimEnd()}`;
  }

  return {
    name: 'git_diff',
    description:
      'Show the changes made in this task as unified diffs (all files the task changed, or one file with "path"). Without task changes it shows the uncommitted git changes of the project.',
    schema: GitDiffSchema,
    readOnly: true,
    describe: (p) => (p.path ? `Zeigt Änderungen an ${p.path}` : 'Zeigt die Änderungen der Aufgabe'),
    async execute(p, ctx) {
      try {
        const project = ctx.project;
        let rel: string | null = null;
        if (p.path !== undefined) {
          const r = s.pathGuard.resolve(project.path, p.path);
          rel = r.rel || null;
        }
        let task: Task = ctx.task;
        try {
          task = s.tasks.get(ctx.task.id) ?? ctx.task;
        } catch {
          task = ctx.task;
        }
        const taskFiles = [...new Map(task.files.map((f) => [keyOf(f), f.replace(/\\/g, '/')])).values()];
        const files = rel ? taskFiles.filter((f) => keyOf(f) === keyOf(rel as string)) : taskFiles;

        if (files.length > 0) {
          const parts: string[] = [];
          let unchanged = 0;
          for (const f of files.slice(0, MAX_FILES)) {
            try {
              const d = await s.files.diff(project.id, f, { taskId: ctx.task.id });
              if (!d.binary && !d.unified.trim()) {
                unchanged++;
                continue;
              }
              parts.push(formatDiff(d));
            } catch (e) {
              parts.push(`=== ${f}: Vergleich nicht möglich (${errorMessage(e)})`);
            }
          }
          const header = rel ? `Änderungen dieser Aufgabe an ${rel}:` : `Änderungen dieser Aufgabe (${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'}):`;
          const extra: string[] = [];
          if (unchanged > 0) extra.push(`${unchanged} ${unchanged === 1 ? 'Datei ist' : 'Dateien sind'} inzwischen wieder unverändert.`);
          if (files.length > MAX_FILES) extra.push(`… und ${files.length - MAX_FILES} weitere Dateien (mit "path" einzeln abrufen).`);
          const text = [header, ...parts, ...extra].join('\n');
          return { status: 'ok', content: headChars(text, MAX_CHARS, 'weitere Unterschiede ausgelassen – git_diff mit "path" für einzelne Dateien aufrufen'), data: { source: 'task', files } };
        }

        let repo = project.gitAvailable;
        if (!repo) {
          try {
            repo = await s.git.isRepo(project.path);
          } catch {
            repo = false;
          }
        }
        if (repo) {
          const diffs = await s.git.diff(project.path, rel ? { path: rel } : {});
          const changed = diffs.filter((d) => d.binary || d.unified.trim());
          if (changed.length === 0) {
            return { status: 'ok', content: rel ? `Keine Git-Änderungen an ${rel}.` : 'Keine Änderungen: Diese Aufgabe hat noch keine Dateien geändert, und Git meldet keine offenen Änderungen.' };
          }
          const shown = changed.slice(0, MAX_FILES).map(formatDiff);
          const header = rel
            ? `Diese Aufgabe hat ${rel} nicht geändert. Offene Git-Änderungen an ${rel}:`
            : `Diese Aufgabe hat noch keine Dateien geändert. Offene Git-Änderungen im Projekt (${changed.length} ${changed.length === 1 ? 'Datei' : 'Dateien'}):`;
          const more = changed.length > MAX_FILES ? [`… und ${changed.length - MAX_FILES} weitere Dateien (mit "path" einzeln abrufen).`] : [];
          const text = [header, ...shown, ...more].join('\n');
          return { status: 'ok', content: headChars(text, MAX_CHARS, 'weitere Unterschiede ausgelassen – git_diff mit "path" für einzelne Dateien aufrufen'), data: { source: 'git', files: changed.map((d) => d.path) } };
        }

        if (rel) {
          const d = await s.files.diff(project.id, rel);
          if (!d.binary && !d.unified.trim()) return { status: 'ok', content: `Keine von NOVA protokollierten Änderungen an ${rel}.` };
          return { status: 'ok', content: headChars(`Von NOVA protokollierte Änderungen an ${rel}:\n${formatDiff(d)}`, MAX_CHARS, 'Datei zu lang'), data: { source: 'journal', files: [rel] } };
        }
        return {
          status: 'ok',
          content: 'Keine Änderungen: Diese Aufgabe hat noch keine Dateien geändert, und der Projektordner ist kein Git-Repository.',
          data: { source: 'none', files: [] },
        };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}
