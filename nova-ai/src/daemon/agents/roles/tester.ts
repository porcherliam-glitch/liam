// Tester role module: runs the real checks, analyses failures, fixes them and reports honestly.
// Key decisions:
// - Tools per SPEC §6.3 table; finish tool `finish` → TesterOutputSchema ({summary, passed, failures, fixed}).
// - Honesty gate (checkFinish): reporting passed=true/false without having executed run_checks or run_command in
//   this run is rejected with a correction message ("must actually run the checks; must not fake results",
//   SPEC §4.4). passed=null (nothing could be run) is always allowed. The work cycle still verifies with real
//   CheckRuns only – `passed` is informational.
import { TesterOutputSchema, type AgentOutput } from '../../contracts';
import { buildRolePrompt, dropNullKeys, formatIssues, requireRecord, toStringArray, usedAny, type NovaRoleModule } from './common';

export const TESTER_TOOLS = [
  'list_files',
  'read_file',
  'search_files',
  'write_file',
  'edit_file',
  'run_command',
  'run_checks',
  'git_diff',
  'memory_search',
  'memory_note',
  'ask_user',
];
const FINISH = 'finish';

export function createTesterRole(): NovaRoleModule {
  return {
    info: {
      role: 'tester',
      name: 'Test- und Fehlerbehebungsagent',
      description: 'Führt die vorhandenen Tests aus, analysiert Fehlerausgaben, behebt die Ursachen und startet die Tests erneut. Meldet nur echte Ergebnisse.',
      tools: [...TESTER_TOOLS, FINISH],
      moduleId: 'nova.tester@1',
    },
    finishTool: {
      name: FINISH,
      description:
        'Finish the test task. summary: German summary of what was run and the result (numbers of passed/failed tests). passed: true only if the last real test run in this task passed, false if it failed, null if no tests could be run. failures: short descriptions of the remaining failures. fixed: true if you changed code or tests to fix failures.',
      schema: TesterOutputSchema,
    },
    toolNames: TESTER_TOOLS,
    systemPrompt(ctx) {
      return buildRolePrompt(ctx, {
        intro:
          'You are the test and repair agent of NOVA AI, an autonomous software studio on the user\'s PC. You run the real tests of the project, find the causes of failures, fix them and report the real results.',
        steps: [
          'Run the tests first: call run_checks with {"kind": "test"}. If no test command is configured, look for tests with list_files and search_files and run them with run_command when a suitable command exists.',
          'Read the failures carefully. Open the failing test and the code it tests with read_file.',
          'Decide whether the code or the test is wrong. Fix the real cause with small edits (edit_file). Add missing tests when the task or its acceptance criteria require them.',
          'Run the tests again after every fix.',
          `Call ${FINISH}: summary (German, with the numbers of passed and failed tests), passed (true/false from the LAST real run, null if nothing could run), failures (remaining failing tests), fixed (true if you changed code or tests).`,
        ],
        examples: [
          ['run_checks', { kind: 'test' }],
          ['read_file', { path: 'tests/game.test.mjs', startLine: 1, endLine: 80 }],
          ['edit_file', { path: 'src/game.js', oldText: 'return a - b;', newText: 'return a + b;' }],
          [FINISH, { summary: 'Ein Rechenfehler in addPoints wurde behoben. 14 von 14 Tests laufen erfolgreich.', passed: true, failures: [], fixed: true }],
        ],
        rules: [
          'Never report passed: true without a successful test run in this task. Never fake, skip or invent test results.',
          'Do not weaken or delete a test just to make it pass. Change a test only when the test itself is wrong, and say so in the summary.',
          'If tests cannot be run (no test command, missing tool), set passed to null and explain why in the summary.',
        ],
        finishName: FINISH,
        canRunCommands: true,
        blockedHint: `If you are blocked (missing tool, failures you cannot fix), call ${FINISH} with passed false or null and explain the reason in German in the summary.`,
      });
    },
    parseOutput(data): AgentOutput {
      const raw = requireRecord(data, FINISH);
      dropNullKeys(raw, ['failures', 'fixed']);
      if (raw.passed === undefined) raw.passed = null;
      if (raw.passed === 'true') raw.passed = true;
      if (raw.passed === 'false') raw.passed = false;
      toStringArray(raw, 'failures');
      const parsed = TesterOutputSchema.safeParse(raw);
      if (!parsed.success) throw new Error(formatIssues(parsed.error));
      const result = parsed.data;
      if (!result.summary.trim()) throw new Error('summary must not be empty: describe in German which tests ran and what the result was.');
      return { role: 'tester', result };
    },
    checkFinish(output, ctx) {
      if (output.role !== 'tester') return null;
      if (output.result.passed !== null && !usedAny(ctx.toolsUsed, ['run_checks', 'run_command'])) {
        return 'You reported a test result, but you have not run any tests in this task. Run run_checks {"kind": "test"} (or run_command) first and report the real result. If tests cannot be run, set "passed" to null and explain why.';
      }
      return null;
    },
  };
}
