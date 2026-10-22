// Reviewer role module: reviews the task's changes for correctness, security, incomplete work and regressions.
// Key decisions:
// - Tools per SPEC §6.3 table (read-only + run_checks); finish tool `submit_review` → ReviewOutputSchema.
// - Findings carry file/line; the prompt asks for verified, concrete findings only (no invented problems).
// - parseOutput normalises findings (numeric line strings, empty file → null, severity aliases) and rejects the
//   contradiction "approve" with critical/major findings.
// - checkFinish requires that the reviewer actually looked at the changes (git_diff or read_file) before submitting.
import { ReviewOutputSchema, type AgentOutput } from '../../contracts';
import { buildRolePrompt, dropNullKeys, formatIssues, isRecord, lowerCase, requireRecord, toNumber, usedAny, type NovaRoleModule } from './common';

export const REVIEWER_TOOLS = ['list_files', 'read_file', 'search_files', 'git_diff', 'run_checks', 'memory_search', 'memory_note'];
const FINISH = 'submit_review';

const SEVERITY_ALIASES: Record<string, string> = { high: 'major', medium: 'minor', low: 'info', warning: 'minor', error: 'major', blocker: 'critical' };

function normalizeReview(data: unknown): Record<string, unknown> {
  const raw = requireRecord(data, FINISH);
  dropNullKeys(raw, ['findings']);
  lowerCase(raw, 'verdict');
  if (raw.verdict === 'approved') raw.verdict = 'approve';
  if (raw.verdict === 'changes-requested' || raw.verdict === 'request_changes' || raw.verdict === 'reject') raw.verdict = 'changes_requested';
  if (Array.isArray(raw.findings)) {
    raw.findings = raw.findings.map((f) => {
      if (typeof f === 'string') return { severity: 'minor', message: f };
      if (!isRecord(f)) return f;
      const out = { ...f };
      lowerCase(out, 'severity');
      if (typeof out.severity === 'string' && SEVERITY_ALIASES[out.severity]) out.severity = SEVERITY_ALIASES[out.severity];
      dropNullKeys(out, ['file', 'line']);
      if (out.file === '') delete out.file;
      toNumber(out, 'line');
      if (typeof out.line === 'number') out.line = Math.trunc(out.line);
      return out;
    });
  }
  return raw;
}

export function createReviewerRole(): NovaRoleModule {
  return {
    info: {
      role: 'reviewer',
      name: 'Code-Review-Agent',
      description: 'Prüft Änderungen auf Fehler, Sicherheitsprobleme, unvollständige Umsetzungen, geänderte Schnittstellen und Regressionen und bewertet die Qualität.',
      tools: [...REVIEWER_TOOLS, FINISH],
      moduleId: 'nova.reviewer@1',
    },
    finishTool: {
      name: FINISH,
      description:
        'Submit the review. verdict: "approve" when there are no critical or major problems, otherwise "changes_requested". summary: German summary of the review. findings: list of {severity: critical|major|minor|info, file: project-relative path or null, line: number or null, message: German description of the problem and how to fix it}.',
      schema: ReviewOutputSchema,
    },
    toolNames: REVIEWER_TOOLS,
    systemPrompt(ctx) {
      return buildRolePrompt(ctx, {
        intro:
          'You are the code review agent of NOVA AI, an autonomous software studio on the user\'s PC. You review the changes made for the task below and report verified problems. You do not change files.',
        steps: [
          'Call git_diff to see what changed. Read the changed files with read_file and, where needed, the code that uses them (search_files).',
          'Correctness: does the change do what the task and its acceptance criteria require? Look for logic errors, missing edge cases and wrong error handling.',
          'Security: secrets in code, injection (shell, SQL, HTML), path traversal, unsafe commands, disabled checks.',
          'Incomplete work: TODOs, stubs, placeholder code, fake results, missing files, acceptance criteria that are not met.',
          'Regressions and interfaces: changed function signatures or file formats, removed behaviour, callers that were not updated, broken tests.',
          'If a test or build command exists, run run_checks to confirm your findings.',
          `Call ${FINISH} with verdict, a German summary and the findings (severity, file, line, German message).`,
        ],
        examples: [
          ['git_diff', {}],
          ['read_file', { path: 'src/game.js', startLine: 40, endLine: 120 }],
          ['search_files', { query: 'addPoints(' }],
          [
            FINISH,
            {
              verdict: 'changes_requested',
              summary: 'Die Punktezählung funktioniert, aber negative Punkte werden nicht abgefangen.',
              findings: [{ severity: 'major', file: 'src/score.js', line: 12, message: 'Negative Punkte führen zu einem negativen Punktestand. Bitte Werte unter 0 abfangen.' }],
            },
          ],
        ],
        rules: [
          'Do not create, change or delete files. Only review.',
          'Report only real problems that you verified in the code. Do not invent findings. Give file and line whenever possible.',
          'Use "approve" only when there are no critical or major findings.',
        ],
        finishName: FINISH,
        canRunCommands: false,
        blockedHint: `If you cannot review (for example there are no changes), call ${FINISH} with verdict "approve" or "changes_requested" as appropriate and explain the situation in German in the summary.`,
      });
    },
    parseOutput(data): AgentOutput {
      const parsed = ReviewOutputSchema.safeParse(normalizeReview(data));
      if (!parsed.success) throw new Error(formatIssues(parsed.error));
      const review = parsed.data;
      if (!review.summary.trim()) throw new Error('summary must not be empty: summarise the review in German.');
      if (review.verdict === 'approve' && review.findings.some((f) => f.severity === 'critical' || f.severity === 'major')) {
        throw new Error('verdict "approve" contradicts critical or major findings. Use "changes_requested", or lower the severity if the problem is minor.');
      }
      return { role: 'reviewer', review };
    },
    checkFinish(_output, ctx) {
      if (!usedAny(ctx.toolsUsed, ['git_diff', 'read_file'])) {
        return 'You have not looked at the changes yet. Call git_diff and read the changed files, then call submit_review again.';
      }
      return null;
    },
  };
}
