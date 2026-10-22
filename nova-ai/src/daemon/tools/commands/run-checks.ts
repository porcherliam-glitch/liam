// Agent tool run_checks (coder, tester, reviewer): runs a configured project check through CheckService
// (SPEC §4.3, §6.3: every CheckKind, taskId = ctx.task.id, actor 'agent').
// Key decisions:
// - The check is awaited (CheckService.run) with the task's abort signal; the result reports status, counts, failures
//   (≤ 20), the German message and the end of the output (≤ 6000 characters, ANSI removed).
// - passed / not_run / skipped → status ok (the content explains it); failed → error TESTS_FAILED (test/e2e) or
//   BUILD_FAILED (build/package) or COMMAND_FAILED; error → COMMAND_FAILED; cancelled → CANCELLED. Verification of a
//   task always comes from the real CheckRun, never from the agent's words.
// - readOnly: checks are idempotent and safe to repeat after a crash (they may write build outputs, never sources).
import { z } from 'zod';
import { CheckKind, type CheckRun, type CheckStatus } from '@shared/schemas';
import type { AgentTool, Services } from '../../contracts';
import { stripAnsi } from '../../processes/output-tail';
import { abortedResult, formatDuration, oneLine, tailChars, toolError } from './common';

const RunChecksSchema = z.object({
  kind: CheckKind.describe(
    'Which configured check to run: test, build, lint, typecheck, e2e, security, runtime (start the app briefly) or package.',
  ),
});
export type RunChecksParams = z.output<typeof RunChecksSchema>;

export const CHECK_LABELS: Record<CheckRun['kind'], string> = {
  test: 'Tests',
  build: 'Build',
  lint: 'Lint',
  typecheck: 'Typprüfung',
  e2e: 'End-to-End-Tests',
  security: 'Sicherheitsprüfung',
  runtime: 'Startprüfung',
  package: 'Paket erstellen',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  passed: 'bestanden',
  failed: 'fehlgeschlagen',
  error: 'Fehler – die Prüfung konnte nicht ausgeführt werden',
  not_run: 'nicht ausgeführt',
  running: 'läuft noch',
  skipped: 'übersprungen',
  cancelled: 'abgebrochen',
};

const MAX_FAILURES = 20;
const MAX_TAIL_CHARS = 6000;

export function formatCheckRun(run: CheckRun): string {
  const lines = [`Prüfung „${CHECK_LABELS[run.kind]}“: ${CHECK_STATUS_LABELS[run.status]}`];
  if (run.command) lines.push(`Befehl: ${run.command}`);
  const counts: string[] = [];
  if (run.passed !== null) counts.push(`${run.passed} bestanden`);
  if (run.failed !== null) counts.push(`${run.failed} fehlgeschlagen`);
  if (run.skipped !== null) counts.push(`${run.skipped} übersprungen`);
  const duration = run.durationMs !== null ? `Dauer ${formatDuration(run.durationMs)}` : null;
  if (counts.length > 0 || duration) lines.push(`Ergebnis: ${[counts.join(', '), duration].filter(Boolean).join(' · ')}`);
  if (run.message) lines.push(`Meldung: ${run.message}`);
  if (run.failures.length > 0) {
    lines.push(`Fehler (${run.failures.length}):`);
    for (const f of run.failures.slice(0, MAX_FAILURES)) {
      const where = f.file ? `${f.file}${f.line !== null ? `:${f.line}${f.column !== null ? `:${f.column}` : ''}` : ''} – ` : '';
      lines.push(`- ${where}${oneLine(f.message, 300)}`);
    }
    if (run.failures.length > MAX_FAILURES) lines.push(`- … und ${run.failures.length - MAX_FAILURES} weitere`);
  }
  const tail = stripAnsi(run.outputTail ?? '').replace(/\r\n/g, '\n').trimEnd();
  if (tail) lines.push(`Ausgabe (Ende):\n${tailChars(tail, MAX_TAIL_CHARS)}`);
  return lines.join('\n');
}

function failureCode(kind: CheckRun['kind']): string {
  if (kind === 'test' || kind === 'e2e') return 'TESTS_FAILED';
  if (kind === 'build' || kind === 'package') return 'BUILD_FAILED';
  return 'COMMAND_FAILED';
}

export function createRunChecksTool(s: Services): AgentTool<RunChecksParams> {
  return {
    name: 'run_checks',
    description:
      'Run a check that is configured for the project (test, build, lint, typecheck, e2e, security, runtime, package) and get the real result: status, passed/failed counts, failures with file and line, and the end of the output. If no command is configured for that kind, the result says so.',
    schema: RunChecksSchema,
    readOnly: true,
    describe: (p) => `Führt Prüfung aus: ${CHECK_LABELS[p.kind] ?? p.kind}`,
    async execute(p, ctx) {
      const aborted = abortedResult(ctx);
      if (aborted) return aborted;
      let run: CheckRun;
      try {
        run = await s.checks.run({ projectId: ctx.project.id, kind: p.kind, taskId: ctx.task.id, signal: ctx.signal, actor: 'agent' });
      } catch (e) {
        return toolError(e);
      }
      const content = formatCheckRun(run);
      const data = {
        checkRunId: run.id,
        kind: run.kind,
        status: run.status,
        passed: run.passed,
        failed: run.failed,
        skipped: run.skipped,
        failures: run.failures.slice(0, MAX_FAILURES),
        message: run.message,
      };
      switch (run.status) {
        case 'failed':
          return { status: 'error', code: failureCode(run.kind), content };
        case 'error':
          return { status: 'error', code: 'COMMAND_FAILED', content };
        case 'cancelled':
          return { status: 'error', code: 'CANCELLED', content };
        default:
          return { status: 'ok', content, data };
      }
    },
  };
}
