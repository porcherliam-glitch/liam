// Orchestrator – pure helpers for verification (SPEC §6.5 "Verification from REAL results only"), failure signatures,
// the extra context handed to agents and the descriptions of fix tasks.
// Key decisions:
// - A verification is built ONLY from CheckRuns and reviewer verdicts. passed = at least one entry backed by a real
//   CheckRun passed (and the caller's proof rule accepts it) and none failed; failed = any check failed or could not
//   run (status error) – a reviewer's "changes_requested" also fails; unavailable = nothing executable (skipped checks
//   carry a German reason, the UI shows "nicht geprüft"). A reviewer verdict alone never yields passed: the same model
//   family judging its own work is not a check (MASTERPROMPT §13).
// - Failure signature = sha1 over the sorted per-check signatures: CheckRun.failureSignature when present, otherwise a
//   normalized hash of the first failure message; review failures hash their findings (severity|file|message, line
//   numbers excluded because they shift between attempts).
// - Context for agents is English (system prompts are English, SPEC §4.4); fix-task descriptions are German (users read
//   them; agents read them too). All embedded output is redacted again and bounded in size.
import { createHash } from 'node:crypto';
import type { CheckKind, CheckRun, CheckStatus, ReviewFinding, Task, Verification } from '@shared/schemas';
import type { NovaErrorInfo } from '@shared/errors';
import type { PlanOutput, ReviewOutput } from '../contracts';
import { redactString } from '../core/redact';
import type { FailureRecord } from './task-store';
import { CHANGES_CHECK, CHECK_LABELS, REVIEW_CHECK, shorten } from './texts';

export type VerificationCheck = Verification['checks'][number];

export function sha1(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

export function checkName(kind: CheckKind): string {
  return CHECK_LABELS[kind] ?? kind;
}

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  passed: 'bestanden',
  failed: 'fehlgeschlagen',
  error: 'konnte nicht ausgeführt werden',
  not_run: 'nicht ausgeführt',
  running: 'läuft',
  skipped: 'übersprungen',
  cancelled: 'abgebrochen',
};

function countsText(run: Pick<CheckRun, 'passed' | 'failed' | 'skipped'>): string {
  const parts: string[] = [];
  if (run.failed !== null && run.failed > 0) parts.push(`${run.failed} fehlgeschlagen`);
  if (run.passed !== null) parts.push(`${run.passed} bestanden`);
  if (run.skipped !== null && run.skipped > 0) parts.push(`${run.skipped} übersprungen`);
  return parts.join(', ');
}

function lastLine(text: string): string {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

/** German details for a CheckRun. */
export function checkRunDetails(run: CheckRun): string | null {
  const counts = countsText(run);
  switch (run.status) {
    case 'passed':
      return counts ? `Bestanden (${counts}).` : 'Bestanden.';
    case 'failed': {
      const first = run.failures[0];
      const where = first?.file ? `${first.file}${first.line !== null ? `:${first.line}` : ''}: ` : '';
      const msg = first ? `${where}${first.message}` : lastLine(run.outputTail);
      return shorten(`Fehlgeschlagen${counts ? ` (${counts})` : ''}${msg ? `: ${msg}` : '.'}`, 400);
    }
    case 'error':
      return shorten(run.message ?? 'Die Prüfung konnte nicht ausgeführt werden.', 400);
    case 'not_run':
    case 'skipped':
      return run.message ?? 'Nicht ausgeführt.';
    case 'cancelled':
      return 'Abgebrochen.';
    default:
      return null;
  }
}

export function entryFromCheckRun(name: string, run: CheckRun): VerificationCheck {
  const status: CheckStatus = run.status === 'not_run' ? 'skipped' : run.status;
  return { name, status, details: checkRunDetails(run), checkRunId: run.id, findings: [] };
}

export function skippedEntry(name: string, reason: string): VerificationCheck {
  return { name, status: 'skipped', details: reason, checkRunId: null, findings: [] };
}

export function errorEntry(name: string, reason: string, checkRunId: string | null = null): VerificationCheck {
  return { name, status: 'error', details: shorten(reason, 600), checkRunId, findings: [] };
}

export function runningEntry(name: string): VerificationCheck {
  return { name, status: 'running', details: 'Läuft …', checkRunId: null, findings: [] };
}

export function reviewEntry(review: ReviewOutput): VerificationCheck {
  const findings: ReviewFinding[] = (Array.isArray(review.findings) ? review.findings : []).map((f) => ({
    severity: f.severity,
    file: f.file ?? null,
    line: f.line ?? null,
    message: redactString(f.message),
  }));
  const approved = review.verdict === 'approve';
  const head = approved ? 'Freigegeben' : `Änderungen nötig (${findings.length} ${findings.length === 1 ? 'Befund' : 'Befunde'})`;
  return {
    name: REVIEW_CHECK,
    status: approved ? 'passed' : 'failed',
    details: shorten(`${head}: ${redactString(review.summary)}`, 600),
    checkRunId: null,
    findings,
  };
}

export function isFailedEntry(e: VerificationCheck): boolean {
  return e.status === 'failed' || e.status === 'error';
}

/** A passed entry backed by a real CheckRun (reviewer verdicts and skipped checks have no CheckRun). */
export function isExecutedPass(e: VerificationCheck): boolean {
  return e.status === 'passed' && e.checkRunId !== null;
}

/**
 * Status from REAL results only (see header). `proves` narrows which executed passes count as evidence for the task
 * (e.g. only test runs for a tester task, none for a coder task that changed no file).
 */
export function computeVerificationStatus(checks: VerificationCheck[], proves: (e: VerificationCheck) => boolean = () => true): Verification['status'] {
  if (checks.some(isFailedEntry)) return 'failed';
  if (checks.some((c) => isExecutedPass(c) && proves(c))) return 'passed';
  return 'unavailable';
}

function normalizeMessage(msg: string): string {
  return String(msg ?? '')
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s?(ms|s|sec|seconds)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findingsHash(findings: ReviewFinding[], fallback: string | null): string {
  if (!findings.length) return sha1(normalizeMessage(fallback ?? 'review'));
  const items = findings.map((f) => `${f.severity}|${(f.file ?? '').toLowerCase()}|${normalizeMessage(f.message)}`).sort();
  return sha1(items.join('\n'));
}

/** Stable signature of a failed verification (see header). */
export function failureSignature(entries: VerificationCheck[], runs: Map<string, CheckRun>): string {
  const parts: string[] = [];
  for (const e of entries.filter(isFailedEntry)) {
    if (e.name === REVIEW_CHECK) {
      parts.push(`review:${findingsHash(e.findings, e.details)}`);
      continue;
    }
    const run = e.checkRunId ? runs.get(e.checkRunId) : undefined;
    const sig = run?.failureSignature ?? sha1(normalizeMessage(run?.failures[0]?.message ?? e.details ?? e.status));
    parts.push(`${e.name}:${sig}`);
  }
  parts.sort();
  return sha1(parts.join('\n'));
}

/** Number of identical signatures at the end of the history. */
export function trailingIdentical(records: FailureRecord[]): number {
  if (!records.length) return 0;
  const last = records[records.length - 1].signature;
  let n = 0;
  for (let i = records.length - 1; i >= 0 && records[i].signature === last; i--) n++;
  return n;
}

/** Short German summary of the failed checks. */
export function failureSummary(entries: VerificationCheck[]): string {
  const failed = entries.filter(isFailedEntry);
  if (!failed.length) return 'Keine fehlgeschlagene Prüfung.';
  return shorten(failed.map((e) => `${e.name}: ${e.details ?? CHECK_STATUS_LABELS[e.status]}`).join('; '), 500);
}

function tailLines(text: string, maxLines: number, maxChars: number): string {
  const lines = redactString(String(text ?? '')).split(/\r?\n/);
  let out = lines.slice(-maxLines).join('\n');
  if (out.length > maxChars) out = out.slice(out.length - maxChars);
  return out.trimEnd();
}

function failureLines(run: CheckRun, max: number): string[] {
  return run.failures.slice(0, max).map((f) => {
    const where = f.file ? `${f.file}${f.line !== null ? `:${f.line}` : ''}${f.column !== null && f.line !== null ? `:${f.column}` : ''}` : '';
    return `${where ? `${where}: ` : ''}${shorten(redactString(f.message), 300)}`;
  });
}

const MAX_CONTEXT = 14000;

function capContext(text: string): string {
  return text.length > MAX_CONTEXT ? `${text.slice(0, MAX_CONTEXT)}\n[… truncated]` : text;
}

/** English context for the next attempt after a failed verification. */
export function buildRetryContext(input: {
  attemptNumber: number;
  maxAttempts: number;
  verification: Verification;
  runs: Map<string, CheckRun>;
  history: FailureRecord[];
  differentApproach: boolean;
  identicalCount: number;
}): string {
  const out: string[] = [];
  out.push('## Previous attempt failed verification');
  out.push(
    `This is attempt ${input.attemptNumber} of ${input.maxAttempts} for this task. NOVA verified the previous attempt with real checks and it FAILED:`,
  );
  for (const e of input.verification.checks.filter(isFailedEntry)) {
    out.push(`- ${e.name}: ${e.status}${e.details ? ` – ${e.details}` : ''}`);
    const run = e.checkRunId ? input.runs.get(e.checkRunId) : undefined;
    if (run) {
      if (run.command) out.push(`  Command: ${redactString(run.command)}`);
      const fl = failureLines(run, 20);
      if (fl.length) {
        out.push('  Failures:');
        for (const l of fl) out.push(`  - ${l}`);
      }
      const tail = tailLines(run.outputTail, 60, 4000);
      if (tail) out.push('  Output (last lines):', '  ```', ...tail.split('\n').map((l) => `  ${l}`), '  ```');
    }
    if (e.findings.length) {
      out.push('  Reviewer findings:');
      for (const f of e.findings.slice(0, 30)) {
        out.push(`  - [${f.severity}] ${f.file ? `${f.file}${f.line !== null ? `:${f.line}` : ''} – ` : ''}${shorten(f.message, 400)}`);
      }
    }
  }
  if (input.verification.checks.some((c) => c.name === CHANGES_CHECK)) {
    out.push('- Note: the previous attempt did not change any file. Implement the task with write_file/edit_file before you finish.');
  }
  out.push('Fix the cause of these failures. Inspect the failing output and the relevant files before changing code, and run the checks yourself before you finish.');
  if (input.differentApproach) {
    out.push('');
    out.push('## IMPORTANT: take a different approach');
    out.push(
      `The same failure occurred ${input.identicalCount} times in a row. Do NOT repeat the previous solution. Analyse the root cause again, choose a different approach, and state in your (German) summary what you did differently.`,
    );
    const attempts = input.history.filter((h) => h.summary);
    if (attempts.length) {
      out.push('Previous attempts:');
      for (const h of attempts.slice(-6)) out.push(`- Attempt ${h.attempt}: ${shorten(h.summary, 400)}`);
    }
  }
  return capContext(out.join('\n'));
}

/** English context for the reviewer pass on a coder task. */
export function buildReviewerContext(input: { coderSummary: string; files: string[]; checks: VerificationCheck[] }): string {
  const out: string[] = [];
  out.push('## Review pass');
  out.push('You review the changes the coder agent just made for this task. Do not modify files.');
  if (input.coderSummary) out.push(`Coder summary: ${shorten(redactString(input.coderSummary), 2000)}`);
  if (input.files.length) out.push(`Files changed for this task: ${input.files.slice(0, 100).join(', ')}`);
  if (input.checks.length) {
    out.push('Automatic checks run by NOVA:');
    for (const c of input.checks) out.push(`- ${c.name}: ${c.status}${c.details ? ` – ${c.details}` : ''}`);
  } else {
    out.push('No automatic checks were available for this project.');
  }
  out.push(
    'Inspect the changes (git_diff, read_file). Review correctness, security, incomplete work and regressions. Use verdict "changes_requested" only for real problems and list each problem as a finding with file and line.',
  );
  return capContext(out.join('\n'));
}

export interface FixTaskDraft {
  title: string;
  description: string;
  acceptance: string;
  plannedFiles: string[];
}

function checkPart(run: CheckRun): string[] {
  const label = checkName(run.kind);
  const lines: string[] = [];
  const counts = countsText(run);
  lines.push(`Die Prüfung „${label}“ ist ${CHECK_STATUS_LABELS[run.status]}${counts ? ` (${counts})` : ''}.`);
  if (run.command) lines.push(`Befehl: ${redactString(run.command)}`);
  const fl = failureLines(run, 30);
  if (fl.length) {
    lines.push('', 'Fehlerstellen:');
    for (const l of fl) lines.push(`- ${l}`);
  }
  const tail = tailLines(run.outputTail, fl.length ? 30 : 60, 6000);
  if (tail) lines.push('', 'Letzte Ausgabe:', '```', tail, '```');
  if (run.message) lines.push('', `Hinweis: ${redactString(run.message)}`);
  return lines;
}

function uniqueFiles(files: (string | null | undefined)[]): string[] {
  return [...new Set(files.filter((f): f is string => typeof f === 'string' && f.trim() !== ''))].slice(0, 50);
}

export function fixFromCheck(run: CheckRun, note?: string | null): FixTaskDraft {
  const label = checkName(run.kind);
  const lines = checkPart(run);
  if (note && note.trim()) lines.push('', `Hinweis des Benutzers: ${note.trim()}`);
  return {
    title: shorten(`Fehler beheben: ${label} fehlgeschlagen`, 300),
    description: redactString(lines.join('\n')).slice(0, 50000),
    acceptance: `Die Prüfung „${label}“ läuft ohne Fehler durch.`,
    plannedFiles: uniqueFiles(run.failures.map((f) => f.file)),
  };
}

export function fixFromError(err: NovaErrorInfo, run: CheckRun | null, note?: string | null): FixTaskDraft {
  const lines: string[] = [];
  lines.push(`Fehler: ${err.title}`, '', `Was ist passiert? ${err.whatHappened}`);
  if (err.attempted.length) {
    lines.push('', 'Bereits versucht:');
    for (const a of err.attempted) lines.push(`- ${a}`);
  }
  if (err.userAction) lines.push('', `Empfohlene Maßnahme: ${err.userAction}`);
  if (err.related?.file) lines.push('', `Betroffene Datei: ${err.related.file}${err.related.line !== null ? `:${err.related.line}` : ''}`);
  if (err.details) lines.push('', 'Technische Details:', '```', tailLines(err.details, 80, 6000), '```');
  if (run) lines.push('', ...checkPart(run));
  if (note && note.trim()) lines.push('', `Hinweis des Benutzers: ${note.trim()}`);
  return {
    title: shorten(`Fehler beheben: ${err.title}`, 300),
    description: redactString(lines.join('\n')).slice(0, 50000),
    acceptance: 'Der beschriebene Fehler tritt nicht mehr auf und die relevanten Prüfungen laufen ohne Fehler durch.',
    plannedFiles: uniqueFiles([err.related?.file, ...(run?.failures.map((f) => f.file) ?? [])]),
  };
}

export function fixFromNote(note: string): FixTaskDraft {
  return {
    title: shorten(`Fehler beheben: ${note.split(/\r?\n/)[0]}`, 300),
    description: redactString(note.trim()).slice(0, 50000),
    acceptance: 'Der beschriebene Fehler tritt nicht mehr auf und die relevanten Prüfungen laufen ohne Fehler durch.',
    plannedFiles: [],
  };
}

export function fixFromFindings(task: Task, review: ReviewOutput): FixTaskDraft {
  const lines: string[] = [];
  const list = Array.isArray(review.findings) ? review.findings : [];
  lines.push(`Die Überprüfung „${task.title}“ hat Änderungen verlangt.`, '', `Zusammenfassung des Reviews: ${redactString(review.summary)}`);
  if (list.length) {
    lines.push('', 'Befunde:');
    for (const f of list.slice(0, 50)) {
      lines.push(`- [${f.severity}] ${f.file ? `${f.file}${f.line !== null && f.line !== undefined ? `:${f.line}` : ''}: ` : ''}${redactString(f.message)}`);
    }
  }
  return {
    title: shorten(`Review-Befunde umsetzen: ${task.title}`, 300),
    description: lines.join('\n').slice(0, 50000),
    acceptance: 'Alle Befunde des Reviews sind behoben und die relevanten Prüfungen laufen ohne Fehler durch.',
    plannedFiles: uniqueFiles(list.map((f) => f.file)),
  };
}

/** German result text of a plan task. */
export function formatPlanResult(plan: PlanOutput, created: Task[] | null): string {
  const lines: string[] = [];
  lines.push(redactString(plan.summary.trim() || 'Plan erstellt.'));
  if (!plan.tasks.length) {
    lines.push('', 'Der Plan enthält keine neuen Aufgaben.');
  } else if (created) {
    lines.push('', `Angelegte Aufgaben (${created.length}):`);
    created.forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
  } else {
    lines.push('', `Vorgeschlagene Aufgaben (${plan.tasks.length}) – nicht automatisch angelegt, weil die Einstellung „Geplante Aufgaben automatisch anlegen“ ausgeschaltet ist:`);
    plan.tasks.forEach((t, i) => lines.push(`${i + 1}. ${t.title}${t.description ? ` – ${shorten(t.description, 300)}` : ''}`));
  }
  return lines.join('\n');
}
