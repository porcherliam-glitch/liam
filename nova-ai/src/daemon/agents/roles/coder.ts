// Coder role module: implements a task with small, inspected and verified file changes.
// Key decisions:
// - Tools per SPEC §6.3 table; finish tool `finish` → CoderOutputSchema ({summary, status done|blocked, blocker, notes}).
// - The prompt drives the loop "inspect → small edit → run checks → fix → review diff → finish" and tells the model
//   how to use edit_file correctly (exact oldText without read_file line numbers), which is the most common failure
//   of small models.
// - parseOutput rejects an empty summary and status "blocked" without a blocker text. No honesty gate on checks: some
//   projects have no test/build command; verification comes from real CheckRuns in the work cycle anyway.
import { CoderOutputSchema, type AgentOutput } from '../../contracts';
import { buildRolePrompt, dropNullKeys, formatIssues, lowerCase, requireRecord, type NovaRoleModule } from './common';

export const CODER_TOOLS = [
  'list_files',
  'read_file',
  'search_files',
  'write_file',
  'edit_file',
  'delete_file',
  'run_command',
  'run_checks',
  'git_diff',
  'memory_search',
  'memory_note',
  'ask_user',
];
const FINISH = 'finish';

export function createCoderRole(): NovaRoleModule {
  return {
    info: {
      role: 'coder',
      name: 'Programmieragent',
      description: 'Erstellt und bearbeitet Dateien, setzt Funktionen um, beachtet die Projektkonventionen und prüft die Änderungen mit Tests oder Builds.',
      tools: [...CODER_TOOLS, FINISH],
      moduleId: 'nova.coder@1',
    },
    finishTool: {
      name: FINISH,
      description:
        'Finish the task. summary: German summary of what you changed and what the checks showed. status: "done" when the task is complete, "blocked" when you cannot complete it. blocker: German reason when blocked, otherwise null. notes: German notes for the user (assumptions, follow-up work) or null.',
      schema: CoderOutputSchema,
    },
    toolNames: CODER_TOOLS,
    systemPrompt(ctx) {
      return buildRolePrompt(ctx, {
        intro:
          'You are the coding agent of NOVA AI, an autonomous software studio on the user\'s PC. You implement exactly the task below in the project, with small verified changes, and then report honestly.',
        steps: [
          'Read the task and the acceptance criteria carefully.',
          'Inspect before you edit: use list_files and search_files to find the relevant files, then read them with read_file.',
          'Plan the smallest change that solves the task. Reuse existing code and follow the project conventions.',
          'Change existing files with edit_file: oldText must be copied exactly from the file (without the line numbers that read_file shows) and must be unique; include a few surrounding lines if needed. Use write_file for new files or to rewrite a small file completely.',
          'Verify your work: call run_checks with kind "test" (and "build" or "typecheck" when such a command exists). If no check is configured, use run_command with a suitable command or explain that nothing could be checked.',
          'If a check fails, read the output, find the cause, fix it and run the check again. Do not repeat a fix that already failed – try a different approach.',
          'Look at your changes with git_diff and remove mistakes or leftovers.',
          `Call ${FINISH} with a short German summary: what you changed and the real result of the checks.`,
        ],
        examples: [
          ['search_files', { query: 'function update' }],
          ['read_file', { path: 'src/game.js' }],
          ['edit_file', { path: 'src/game.js', oldText: 'const speed = 1;', newText: 'const speed = 2;' }],
          ['write_file', { path: 'src/score.js', content: 'export function addPoints(score, points) {\n  return score + points;\n}\n' }],
          ['run_checks', { kind: 'test' }],
          [FINISH, { summary: 'Die Geschwindigkeit wurde verdoppelt. Alle 12 Tests laufen erfolgreich.', status: 'done', blocker: null, notes: null }],
        ],
        rules: [
          'Run the checks before you call finish. Report their real result.',
          'Keep the project runnable after every change. Do not delete files unless the task requires it.',
          'Write complete, working code. No placeholders, no "TODO: implement", no fake data that pretends to work.',
          'Large files: write them in parts (create the file with write_file, then add the rest with edit_file) so your answer is not cut off.',
          'Use ask_user only for questions that only the user can answer. For small decisions choose a sensible default and mention it in "notes".',
        ],
        finishName: FINISH,
        canRunCommands: true,
        blockedHint: `If you cannot complete the task (missing information, missing tool, a denied command, a check that keeps failing), call ${FINISH} with status "blocked" and explain the reason in German in "blocker".`,
      });
    },
    parseOutput(data): AgentOutput {
      const raw = requireRecord(data, FINISH);
      dropNullKeys(raw, ['status']);
      lowerCase(raw, 'status');
      if (raw.status === 'complete' || raw.status === 'completed' || raw.status === 'success') raw.status = 'done';
      const parsed = CoderOutputSchema.safeParse(raw);
      if (!parsed.success) throw new Error(formatIssues(parsed.error));
      const result = parsed.data;
      if (!result.summary.trim()) throw new Error('summary must not be empty: describe in German what you changed and what the checks showed.');
      if (result.status === 'blocked' && !(result.blocker ?? '').trim()) {
        throw new Error('status is "blocked" but blocker is empty: explain in German why the task cannot be completed.');
      }
      return { role: 'coder', result };
    },
  };
}
