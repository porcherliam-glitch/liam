// Orchestrator tests – pure helpers: verification status, failure signatures, agent context, fix drafts, idle reasons.
import { describe, it, expect } from 'vitest';
import type { CheckRun, Task } from '@shared/schemas';
import {
  buildRetryContext,
  buildReviewerContext,
  computeVerificationStatus,
  entryFromCheckRun,
  failureSignature,
  fixFromCheck,
  fixFromError,
  fixFromFindings,
  formatPlanResult,
  reviewEntry,
  skippedEntry,
  trailingIdentical,
} from './verification';
import { idleReason, type IdleInput } from './work-status';
import { dedupePaths, keysOverlap, normalizeRelPath, pathKey } from './task-store';

function run(patch: Partial<CheckRun>): CheckRun {
  return {
    id: patch.id ?? 'crun_1',
    projectId: 'prj_1',
    taskId: null,
    kind: 'test',
    command: 'npm test',
    status: 'failed',
    passed: 3,
    failed: 1,
    skipped: 0,
    durationMs: 10,
    outputTail: 'line 1\nAssertionError: expected 1 to be 2',
    failures: [{ file: 'tests/a.test.js', line: 12, column: 3, message: 'expected 1 to be 2' }],
    failureSignature: null,
    message: null,
    processId: null,
    artifacts: [],
    startedAt: 1,
    finishedAt: 2,
    ...patch,
  };
}

describe('verification status', () => {
  it('is built from real results only', () => {
    const passed = entryFromCheckRun('Build', run({ status: 'passed', failures: [], failed: 0 }));
    const failed = entryFromCheckRun('Tests', run({}));
    const notRun = entryFromCheckRun('Lint', run({ status: 'not_run', message: 'Kein Lint-Befehl eingerichtet' }));
    expect(notRun).toMatchObject({ status: 'skipped', details: 'Kein Lint-Befehl eingerichtet' });
    expect(failed.details).toContain('tests/a.test.js:12: expected 1 to be 2');
    expect(computeVerificationStatus([passed, notRun])).toBe('passed');
    expect(computeVerificationStatus([passed, failed])).toBe('failed');
    expect(computeVerificationStatus([notRun, skippedEntry('Tests', 'Kein Testbefehl')])).toBe('unavailable');
    expect(computeVerificationStatus([])).toBe('unavailable');
    expect(computeVerificationStatus([{ ...passed, status: 'error' }])).toBe('failed');
  });

  it('maps reviewer verdicts to a Review check with findings', () => {
    const e = reviewEntry({ verdict: 'changes_requested', summary: 'Fehlerbehandlung fehlt', findings: [{ severity: 'major', file: 'src/a.ts', line: 4, message: 'Kein try/catch' }] });
    expect(e).toMatchObject({ name: 'Review', status: 'failed', findings: [{ severity: 'major', file: 'src/a.ts', line: 4 }] });
    expect(reviewEntry({ verdict: 'approve', summary: 'ok', findings: [] }).status).toBe('passed');
  });

  it('never reports passed from a reviewer verdict alone; the proof rule narrows which passes count', () => {
    const approve = reviewEntry({ verdict: 'approve', summary: 'Sieht gut aus.', findings: [] });
    const skipped = skippedEntry('Tests', 'Kein Testbefehl eingerichtet.');
    expect(computeVerificationStatus([skipped, approve])).toBe('unavailable');
    expect(computeVerificationStatus([approve])).toBe('unavailable');
    expect(computeVerificationStatus([reviewEntry({ verdict: 'changes_requested', summary: 'x', findings: [] })])).toBe('failed');
    const lint = entryFromCheckRun('Lint', run({ id: 'l', kind: 'lint', status: 'passed', failures: [], failed: 0 }));
    const tests = entryFromCheckRun('Tests', run({ id: 't', status: 'passed', failures: [], failed: 0 }));
    expect(computeVerificationStatus([lint, approve])).toBe('passed');
    const onlyTests = (e: { name: string }) => e.name === 'Tests';
    expect(computeVerificationStatus([lint], onlyTests)).toBe('unavailable');
    expect(computeVerificationStatus([lint, tests], onlyTests)).toBe('passed');
    expect(computeVerificationStatus([lint, tests], () => false)).toBe('unavailable');
    expect(computeVerificationStatus([lint, entryFromCheckRun('Tests', run({}))], () => false)).toBe('failed');
  });
});

describe('failure signatures', () => {
  it('prefers CheckRun.failureSignature, ignores shifting line numbers of review findings', () => {
    const r1 = run({ id: 'a', failureSignature: 'sig-1' });
    const r2 = run({ id: 'b', failureSignature: 'sig-1', outputTail: 'other output' });
    const s1 = failureSignature([entryFromCheckRun('Tests', r1)], new Map([[r1.id, r1]]));
    const s2 = failureSignature([entryFromCheckRun('Tests', r2)], new Map([[r2.id, r2]]));
    expect(s1).toBe(s2);
    const r3 = run({ id: 'c', failureSignature: 'sig-2' });
    expect(failureSignature([entryFromCheckRun('Tests', r3)], new Map([[r3.id, r3]]))).not.toBe(s1);
    const rev = (line: number) => reviewEntry({ verdict: 'changes_requested', summary: 'x', findings: [{ severity: 'major', file: 'src/a.ts', line, message: 'Kein   try/catch' }] });
    expect(failureSignature([rev(4)], new Map())).toBe(failureSignature([rev(40)], new Map()));
  });

  it('counts trailing identical signatures', () => {
    const r = (signature: string) => ({ signature, attempt: 1, summary: '', ts: 0 });
    expect(trailingIdentical([])).toBe(0);
    expect(trailingIdentical([r('a'), r('b'), r('b')])).toBe(2);
    expect(trailingIdentical([r('b'), r('a')])).toBe(1);
  });
});

describe('agent context and fix task drafts', () => {
  it('builds retry context with failures, findings and the different-approach instruction', () => {
    const r1 = run({ id: 'x' });
    const ctx = buildRetryContext({
      attemptNumber: 3,
      maxAttempts: 4,
      verification: {
        status: 'failed',
        checks: [entryFromCheckRun('Tests', r1), reviewEntry({ verdict: 'changes_requested', summary: 'S', findings: [{ severity: 'minor', file: 'b.ts', line: null, message: 'Name unklar' }] })],
      },
      runs: new Map([[r1.id, r1]]),
      history: [
        { signature: 'a', attempt: 1, summary: 'Erster Versuch', ts: 0 },
        { signature: 'a', attempt: 2, summary: 'Zweiter Versuch', ts: 0 },
      ],
      differentApproach: true,
      identicalCount: 2,
    });
    expect(ctx).toContain('attempt 3 of 4');
    expect(ctx).toContain('tests/a.test.js:12:3: expected 1 to be 2');
    expect(ctx).toContain('[minor] b.ts – Name unklar');
    expect(ctx).toContain('take a different approach');
    expect(ctx).toContain('Attempt 2: Zweiter Versuch');
    expect(buildReviewerContext({ coderSummary: 'Login gebaut', files: ['src/login.ts'], checks: [] })).toContain('src/login.ts');
  });

  it('describes fix tasks in German from checks, errors and review findings', () => {
    const d = fixFromCheck(run({ outputTail: 'boom\nOPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz1234' }), 'Bitte nur die Logik ändern');
    expect(d.title).toBe('Fehler beheben: Tests fehlgeschlagen');
    expect(d.description).toContain('Die Prüfung „Tests“ ist fehlgeschlagen (1 fehlgeschlagen, 3 bestanden).');
    expect(d.description).toContain('Befehl: npm test');
    expect(d.description).toContain('Hinweis des Benutzers: Bitte nur die Logik ändern');
    expect(d.description).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234');
    expect(d.plannedFiles).toEqual(['tests/a.test.js']);
    const e = fixFromError(
      {
        id: 'err_1',
        code: 'BUILD_FAILED',
        severity: 'blocker',
        title: 'Build kaputt',
        whatHappened: 'Der Build bricht ab.',
        projectId: 'prj_1',
        taskId: null,
        attempted: ['Build ausgeführt'],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Bitte prüfen',
        details: 'stack',
        related: { checkRunId: null, runId: null, approvalId: null, file: 'src/x.ts', line: 3 },
        createdAt: 0,
        resolvedAt: null,
      },
      null,
    );
    expect(e.title).toBe('Fehler beheben: Build kaputt');
    expect(e.description).toContain('Was ist passiert? Der Build bricht ab.');
    expect(e.plannedFiles).toEqual(['src/x.ts']);
    const f = fixFromFindings({ title: 'Login prüfen' } as Task, { verdict: 'changes_requested', summary: 'Mängel', findings: [{ severity: 'critical', file: 'src/l.ts', line: 1, message: 'SQL-Injection' }] });
    expect(f.description).toContain('[critical] src/l.ts:1: SQL-Injection');
  });

  it('formats plan results', () => {
    const plan = { summary: 'Ein Spiel', tasks: [{ key: 'a', title: 'Spielfeld', description: 'Canvas', role: 'coder' as const, kind: 'code' as const, dependsOn: [], priority: 1, acceptance: null, files: [] }], memory: [] };
    expect(formatPlanResult(plan, [{ title: 'Spielfeld' } as Task])).toContain('Angelegte Aufgaben (1):\n1. Spielfeld');
    expect(formatPlanResult(plan, null)).toContain('nicht automatisch angelegt');
  });
});

describe('paths', () => {
  it('normalizes keys and detects overlap including folders', () => {
    expect(normalizeRelPath('.\\src\\\\a.ts')).toBe('src/a.ts');
    expect(pathKey('Src/A.ts', 'win32')).toBe('src/a.ts');
    expect(pathKey('Src/A.ts', 'linux')).toBe('Src/A.ts');
    expect(dedupePaths(['a', './a', 'A'], 'win32')).toEqual(['a']);
    expect(keysOverlap('src', 'src/a.ts')).toBe(true);
    expect(keysOverlap('src/a.ts', 'src/ab.ts')).toBe(false);
  });
});

describe('idle reasons', () => {
  const base: IdleInput = {
    globalState: 'running',
    projectState: 'running',
    activeRuns: 0,
    open: 0,
    eligibleReady: 0,
    ineligibleReady: 0,
    notReadyQueued: 0,
    waiting: 0,
    blockedByCode: {},
    paused: 0,
    interrupted: 0,
    noFreeSlot: false,
    resourceReason: null,
  };
  it('follows the documented precedence', () => {
    expect(idleReason({ ...base, activeRuns: 1 })).toBeNull();
    expect(idleReason({ ...base, globalState: 'paused', open: 3 })).toBe('Arbeit pausiert');
    expect(idleReason(base)).toBe('Keine offenen Aufgaben');
    expect(idleReason({ ...base, open: 2, ineligibleReady: 2, projectState: 'stopped' })).toBe('Autonome Arbeit ist für dieses Projekt ausgeschaltet');
    expect(idleReason({ ...base, open: 2, eligibleReady: 2, noFreeSlot: true, resourceReason: 'CPU 92 %' })).toBe('Ressourcenlimit: CPU 92 %');
    expect(idleReason({ ...base, open: 3, waiting: 3 })).toBe('3 Aufgaben warten auf Freigabe');
    expect(idleReason({ ...base, open: 1, waiting: 1 })).toBe('1 Aufgabe wartet auf Freigabe');
    expect(idleReason({ ...base, open: 1, blockedByCode: { NO_MODEL: 1 } })).toBe("Kein Modell verfügbar – bitte in 'Modelle' eines auswählen");
    expect(idleReason({ ...base, open: 1, blockedByCode: { NEEDS_INPUT: 1, NO_MODEL: 1 } })).toBe('1 Aufgabe wartet auf eine Antwort');
    expect(idleReason({ ...base, open: 2, notReadyQueued: 2 })).toBe('2 Aufgaben warten auf Vorgängeraufgaben');
    expect(idleReason({ ...base, open: 1, paused: 1 })).toBe('1 Aufgabe ist pausiert');
  });
});
