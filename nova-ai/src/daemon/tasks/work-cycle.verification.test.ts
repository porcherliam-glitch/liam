// Orchestrator tests – verification flows (coder/tester/reviewer/plan), retries, repeated failures, integration pass.
import { describe, it, expect, afterEach } from 'vitest';
import type { CheckRun, Task } from '@shared/schemas';
import { createWorkCycle } from './work-cycle';
import { createHarness, defaultConfig, outcomes, sleep, stepping, type Harness } from './test-support';

let h: Harness;
const extra: { shutdown(ms: number): Promise<void> }[] = [];
afterEach(async () => {
  for (const w of extra.splice(0)) await w.shutdown(100);
  await h.cleanup();
});

async function waitFor(cond: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error('waitFor: timeout');
    await sleep(2);
  }
}

function task(projectId: string, title: string, patch: Record<string, unknown> = {}): Task {
  return h.tasks.create({ projectId, title, ...patch } as never);
}

const status = (id: string) => h.tasks.require(id).status;

const failTest = (signature: string, message = 'expected 2 got 3'): Partial<CheckRun> => ({
  status: 'failed',
  passed: 2,
  failed: 1,
  failureSignature: signature,
  failures: [{ file: 'tests/a.test.js', line: 3, column: 1, message }],
  outputTail: `FAIL tests/a.test.js\n${message}`,
});

describe('coder verification', () => {
  it('verifies with real build and test results, patches verification before afterTask and completes', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'web', name: 'Webshop', config: defaultConfig({ commands: { build: 'npm run build', test: 'npm test' } }) });
    const t = task(p.id, 'Warenkorb in src/cart.js');
    h.core.errors.report({ code: 'X', severity: 'blocker', title: 'Alt', whatHappened: 'Alt', projectId: p.id, taskId: t.id });
    await h.drain();
    const done = h.tasks.require(t.id);
    expect(done).toMatchObject({ status: 'done', result: 'Änderung umgesetzt.', attempts: 1, startRequested: false });
    expect(done.verification).toMatchObject({ status: 'passed', checks: [{ name: 'Build', status: 'passed' }, { name: 'Tests', status: 'passed' }] });
    expect(h.checks.calls.map((c) => [c.kind, c.taskId, c.actor])).toEqual([
      ['build', t.id, 'system'],
      ['test', t.id, 'system'],
    ]);
    expect(h.checkpoints.afterTaskCalls).toHaveLength(1);
    expect(h.checkpoints.afterTaskCalls[0].verification.status).toBe('passed');
    expect(h.memory.added.map((m) => [m.input.kind, m.source])).toEqual([
      ['task_status', 'system'],
      ['test_result', 'system'],
    ]);
    expect(h.notifications.list_).toHaveLength(1);
    expect(h.notifications.list_[0]).toMatchObject({ category: 'task_done', title: 'Aufgabe erledigt', taskId: t.id });
    expect(h.notifications.list_[0].body).toBe('Eine Aufgabe im Projekt „Webshop“ ist fertig – alle Prüfungen bestanden.');
    expect(h.core.errors.countOpen()).toBe(0);
    expect(h.locks.released).toContain(t.id);
    expect(h.approvals.expiredForTask).toContain(t.id);
  });

  it('marks the verification unavailable when no check can run and lists skipped kinds with reasons', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'web', config: defaultConfig({ testAfterChange: true }) });
    const t = task(p.id, 'A');
    await h.drain();
    expect(h.tasks.require(t.id).verification).toEqual({
      status: 'unavailable',
      checks: [
        { name: 'Build', status: 'skipped', details: 'Kein Build-Befehl eingerichtet.', checkRunId: null, findings: [] },
        { name: 'Tests', status: 'skipped', details: 'Kein Testbefehl eingerichtet.', checkRunId: null, findings: [] },
      ],
    });
    expect(h.notifications.list_[0].body).toContain('keine automatische Prüfung möglich');
    expect(h.checks.calls).toHaveLength(0);
  });

  it('retries a failed verification with the failures as extra context', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test', lint: 'npm run lint' } }) });
    const t = task(p.id, 'A');
    h.checks.queue('test', failTest('sig-a'));
    await h.drain();
    const calls = h.agents.callsFor(t.id);
    expect(calls).toHaveLength(2);
    expect(calls[0].extraContext).toBeUndefined();
    expect(calls[1].resumeRunId).toBeNull();
    expect(calls[1].extraContext).toContain('attempt 2 of 3');
    expect(calls[1].extraContext).toContain('tests/a.test.js:3:1: expected 2 got 3');
    expect(calls[1].extraContext).not.toContain('different approach');
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', attempts: 2, verification: { status: 'passed' } });
    expect(h.tasks.require(t.id).verification.checks.map((c) => c.name)).toEqual(['Tests', 'Lint']);
    expect(h.checkpoints.created).toHaveLength(1);
  });

  it('asks for a different approach after repeated identical failures, then blocks with REPEATED_FAILURE', async () => {
    h = createHarness();
    h.core.settings.update({ agents: { maxIdenticalFailures: 2 } });
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'A', { maxAttempts: 5 });
    h.checks.queue('test', failTest('sig-a'), failTest('sig-a'), failTest('sig-a'));
    h.checkpoints.latest = h.checkpoints.cp(p.id, 'post_task', 'Nach Aufgabe: Startseite', null);
    await h.drain();
    const calls = h.agents.callsFor(t.id);
    expect(calls).toHaveLength(3);
    expect(calls[1].extraContext).not.toContain('take a different approach');
    expect(calls[2].extraContext).toContain('take a different approach');
    expect(calls[2].extraContext).toContain('Previous attempts:');
    const blocked = h.tasks.require(t.id);
    expect(blocked).toMatchObject({ status: 'blocked', blockerCode: 'REPEATED_FAILURE', attempts: 3 });
    const err = h.core.errors.list().find((e) => e.taskId === t.id)!;
    expect(err.code).toBe('REPEATED_FAILURE');
    expect(err.userAction).toContain('„Nach Aufgabe: Startseite“');
    expect(h.notifications.list_.some((n) => n.category === 'blocker' && n.taskId === t.id)).toBe(true);
    expect(h.locks.released).toContain(t.id);
    expect(h.checkpoints.afterTaskCalls).toHaveLength(0);
  });

  it('fails with an error report and notification when attempts are exhausted', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'A', { maxAttempts: 2 });
    h.checks.queue('test', failTest('sig-a', 'erster Fehler'), failTest('sig-b', 'zweiter Fehler'));
    await h.drain();
    const failed = h.tasks.require(t.id);
    expect(failed).toMatchObject({ status: 'failed', blockerCode: 'TESTS_FAILED', attempts: 2 });
    expect(failed.blocker).toContain('nach 2 Versuchen fehlgeschlagen');
    const err = h.core.errors.list().find((e) => e.taskId === t.id)!;
    expect(err.related).toMatchObject({ checkRunId: h.checks.all[1].id, file: 'tests/a.test.js', line: 3 });
    expect(h.notifications.list_.map((n) => n.title)).toEqual(['Aufgabe fehlgeschlagen']);
    expect(h.checkpoints.afterTaskCalls).toHaveLength(0);
    expect(h.memory.added.some((m) => m.input.kind === 'attempt')).toBe(true);
  });

  it('skips remaining checks after a failed build', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'desktop', config: defaultConfig({ commands: { build: 'dotnet build', test: 'dotnet test' }, reviewChanges: true }) });
    const t = task(p.id, 'A', { maxAttempts: 1 });
    h.checks.queue('build', { status: 'failed', failures: [{ file: 'App.cs', line: 1, column: 1, message: 'CS1002' }] });
    await h.drain();
    const v = h.tasks.require(t.id).verification;
    expect(v.checks.map((c) => [c.name, c.status])).toEqual([
      ['Build', 'failed'],
      ['Tests', 'skipped'],
      ['Review', 'skipped'],
    ]);
    expect(h.tasks.require(t.id).blockerCode).toBe('BUILD_FAILED');
    expect(h.checks.calls.map((c) => c.kind)).toEqual(['build']);
    expect(h.agents.calls.map((c) => c.roleUsed)).toEqual(['coder']);
  });

  it('blocks with AGENT_BLOCKED when the coder reports a blocker', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id }, outcomes.coderBlocked('Die API-Dokumentation fehlt.'));
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'blocked', blockerCode: 'AGENT_BLOCKED', blocker: 'Die API-Dokumentation fehlt.' });
    expect(h.checks.calls).toHaveLength(0);
    expect(h.locks.released).toContain(t.id);
    expect(h.core.errors.list()[0]).toMatchObject({ code: 'AGENT_BLOCKED', autoFixable: false });
  });

  it('keeps the task done when the post_task checkpoint fails (warning only)', async () => {
    h = createHarness();
    h.checkpoints.failAfterTask = true;
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    const t = task(p.id, 'A');
    await h.drain();
    expect(h.tasks.require(t.id).status).toBe('done');
    expect(h.core.errors.list({ includeResolved: true }).find((e) => e.title === 'Wiederherstellungspunkt fehlt')?.severity).toBe('warning');
  });
});

describe('reviewer pass', () => {
  it('runs the reviewer as a separate run; changes_requested retries the coder with the findings', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false, reviewChanges: true }) });
    const t = task(p.id, 'Login');
    h.agents.on({ taskId: t.id, role: 'reviewer' }, outcomes.review({ verdict: 'changes_requested', summary: 'Mängel', findings: [{ severity: 'major', file: 'src/login.js', line: 9, message: 'Passwort wird im Klartext geloggt' }] }));
    h.agents.on({ taskId: t.id, role: 'reviewer' }, outcomes.review({ verdict: 'approve', summary: 'Jetzt gut' }));
    await h.drain();
    const calls = h.agents.callsFor(t.id);
    expect(calls.map((c) => c.roleUsed)).toEqual(['coder', 'reviewer', 'coder', 'reviewer']);
    expect(calls[1].extraContext).toContain('## Review pass');
    expect(calls[1].resumeRunId).toBeNull();
    expect(calls[2].extraContext).toContain('[major] src/login.js:9 – Passwort wird im Klartext geloggt');
    const done = h.tasks.require(t.id);
    expect(done.status).toBe('done');
    // no executable check: the approving review alone is no proof
    expect(done.verification).toMatchObject({ status: 'unavailable', checks: [{ name: 'Review', status: 'passed' }] });
  });

  it('pauses during the reviewer pass and resumes the reviewer run (no new coder run)', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false, reviewChanges: true }) });
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id, role: 'reviewer' }, stepping(outcomes.review({ verdict: 'approve' })));
    await h.work.tick();
    await waitFor(() => h.agents.calls.some((c) => c.roleUsed === 'reviewer'));
    h.work.pauseTask(t.id);
    await h.work.idle();
    expect(h.tasks.require(t.id).status).toBe('paused');
    h.agents.on({ taskId: t.id, role: 'reviewer' }, outcomes.review({ verdict: 'approve' }));
    h.work.resumeTask(t.id);
    await h.drain();
    const calls = h.agents.callsFor(t.id);
    expect(calls.map((c) => c.roleUsed)).toEqual(['coder', 'reviewer', 'reviewer']);
    expect(calls[2].resumeRunId).toBe(calls[1].runId);
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', attempts: 1, verification: { status: 'unavailable', checks: [{ name: 'Review', status: 'passed' }] } });
  });

  it('completes a review task with changes_requested and creates a fix task with the findings', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', name: 'Shop', config: defaultConfig({ testAfterChange: false }) });
    const t = task(p.id, 'Code prüfen', { kind: 'review' });
    h.agents.on({ taskId: t.id }, outcomes.review({ verdict: 'changes_requested', summary: 'Sicherheitslücke', findings: [{ severity: 'critical', file: 'src/db.js', line: 2, message: 'SQL-Injection' }] }));
    await h.drain();
    const review = h.tasks.require(t.id);
    expect(review.status).toBe('done');
    expect(review.verification).toMatchObject({ status: 'failed', checks: [{ name: 'Review', status: 'failed', findings: [{ severity: 'critical', file: 'src/db.js' }] }] });
    const fix = h.tasks.list().find((x) => x.kind === 'fix')!;
    expect(fix).toMatchObject({ source: 'system', role: 'coder', title: 'Review-Befunde umsetzen: Code prüfen', plannedFiles: ['src/db.js'], status: 'done' });
    expect(h.notifications.list_.find((n) => n.taskId === t.id)?.title).toBe('Review abgeschlossen: Änderungen nötig');
  });
});

describe('tester verification', () => {
  it('uses only check runs of the run; a claimed success with a failed check fails and records an error step', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'Tests schreiben', { kind: 'test', maxAttempts: 1 });
    h.checks.add({ projectId: p.id, kind: 'test', taskId: t.id, status: 'passed', startedAt: Date.now() - 60_000 });
    h.agents.on({ taskId: t.id }, (i, run) => {
      h.checks.add({ projectId: p.id, kind: 'test', taskId: t.id, ...failTest('sig-t') });
      return outcomes.testerDone(true)(i, run);
    });
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'failed', verification: { status: 'failed' } });
    expect(h.checks.calls).toHaveLength(0);
    expect(h.runs.stepsList.some((s) => s.kind === 'error' && s.summary.includes('Erfolg gemeldet'))).toBe(true);
  });

  it('runs the test check itself when the tester ran none, and is unavailable without a test command', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'Tests', { kind: 'test' });
    h.agents.on({ taskId: t.id }, outcomes.testerDone(null));
    await h.drain();
    expect(h.checks.calls.map((c) => [c.kind, c.taskId])).toEqual([['test', t.id]]);
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', verification: { status: 'passed' } });
    const p2 = h.projects.add({ kind: 'generic', config: defaultConfig() });
    const t2 = task(p2.id, 'Tests', { kind: 'test' });
    h.agents.on({ taskId: t2.id }, outcomes.testerDone(true));
    await h.drain();
    expect(h.tasks.require(t2.id).verification).toMatchObject({ status: 'unavailable', checks: [{ name: 'Tests', status: 'skipped' }] });
  });
});

describe('planner and integration pass', () => {
  it('creates child tasks from the plan, runs the integration pass and creates a fix task on failure', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', name: 'Spiel', config: defaultConfig({ testAfterChange: false, commands: { build: 'npm run build', test: 'npm test' } }) });
    const plan = h.work.planGoal(p.id, 'Ein Snake-Spiel\nmit Highscore');
    expect(plan).toMatchObject({ kind: 'plan', role: 'planner', startRequested: true, title: 'Ziel planen: Ein Snake-Spiel', priority: 2 });
    h.agents.on(
      { taskId: plan.id },
      outcomes.plan({
        summary: 'Zwei Schritte.',
        tasks: [
          { key: 'a', title: 'Spielfeld', description: 'Canvas anlegen', role: 'coder', kind: 'code', dependsOn: [], priority: 1, acceptance: 'Feld sichtbar', files: ['src/board.js'] },
          { key: 'b', title: 'Tests', description: '', role: 'tester', kind: 'test', dependsOn: ['a', 'unbekannt', 'b'], priority: 1, acceptance: null, files: ['tests\\board.test.js'] },
        ],
        memory: [{ kind: 'decision', title: 'Canvas', content: 'Wir nutzen Canvas statt DOM.', tags: [] }],
      }),
    );
    // child b (tester) → orchestrator test passes; integration: build passes, test fails; fix → second integration passes.
    h.checks.queue('test', {}, failTest('sig-int', 'Snake stirbt sofort'));
    h.agents.on((i) => i.task.kind === 'test', outcomes.testerDone(null), false);
    await h.drain();

    const children = h.tasks.list({ parentId: plan.id } as never).filter((c) => c.source === 'planner');
    expect(children.map((c) => c.title)).toEqual(['Spielfeld', 'Tests']);
    const [a, b] = children;
    expect(a).toMatchObject({ parentId: plan.id, plannedFiles: ['src/board.js'], files: ['src/main.js'], acceptance: 'Feld sichtbar', status: 'done' });
    expect(a.description).toBe('Canvas anlegen\n\nVoraussichtlich betroffene Dateien: src/board.js');
    expect(b).toMatchObject({ dependsOn: [a.id], plannedFiles: ['tests/board.test.js'], role: 'tester', status: 'done' });
    expect(h.memory.added.find((m) => m.input.kind === 'decision')).toMatchObject({ source: 'system', input: { taskId: plan.id, content: 'Wir nutzen Canvas statt DOM.' } });
    const planDone = h.tasks.require(plan.id);
    expect(planDone.result).toContain('Angelegte Aufgaben (2):');
    expect(h.notifications.list_.find((n) => n.taskId === plan.id && n.category === 'task_done')?.body).toContain('2 neue Aufgaben');

    const fix = h.tasks.list().find((x) => x.kind === 'fix')!;
    expect(fix).toMatchObject({ parentId: plan.id, source: 'system', title: 'Fehler beheben: Tests fehlgeschlagen', status: 'done' });
    expect(fix.description).toContain('Snake stirbt sofort');
    expect(h.core.errors.list({ includeResolved: true }).find((e) => e.title === 'Integrationsprüfung fehlgeschlagen')).toMatchObject({ code: 'TESTS_FAILED', taskId: plan.id });
    expect(h.notifications.list_.some((n) => n.title === 'Integrationsprüfung fehlgeschlagen' && n.body.includes('Reparatur-Aufgabe'))).toBe(true);
    expect(h.checks.calls.filter((c) => c.taskId === plan.id).map((c) => c.kind)).toEqual(['build', 'test', 'build', 'test']);
    expect(h.tasks.require(plan.id).verification).toMatchObject({
      status: 'passed',
      checks: [
        { name: 'Integration: Build', status: 'passed' },
        { name: 'Integration: Tests', status: 'passed' },
      ],
    });
    expect(h.core.errors.countOpen()).toBe(0);
    expect(h.memory.added.filter((m) => m.input.title.startsWith('Integrationsprüfung'))).toHaveLength(2);
  });

  it('does not create tasks when autoCreatePlannedTasks is off and lists the suggestions instead', async () => {
    h = createHarness();
    h.core.settings.update({ agents: { autoCreatePlannedTasks: false } });
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    const plan = task(p.id, 'Plan', { kind: 'plan' });
    h.agents.on({ taskId: plan.id }, outcomes.plan({ tasks: [{ key: 'a', title: 'Spielfeld', description: 'x', role: 'coder', kind: 'code', dependsOn: [], priority: 1, acceptance: null, files: [] }] }));
    await h.drain();
    expect(h.tasks.list()).toHaveLength(1);
    expect(h.tasks.require(plan.id)).toMatchObject({ status: 'done', verification: { status: 'unavailable', checks: [] } });
    expect(h.tasks.require(plan.id).result).toContain('nicht automatisch angelegt');
  });
});

describe('integration pass control', () => {
  it('stopTask on the plan task aborts a running integration pass without creating a fix task', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false, commands: { build: 'npm run build', test: 'npm test' } }) });
    const plan = task(p.id, 'Plan', { kind: 'plan' });
    h.agents.on({ taskId: plan.id }, outcomes.plan({ tasks: [{ key: 'a', title: 'Teil', description: '', role: 'coder', kind: 'code', dependsOn: [], priority: 1, acceptance: null, files: [] }] }));
    h.checks.queue('build', (input) => new Promise((resolve) => input.signal?.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true })));
    await h.work.tick();
    await h.work.idle();
    await h.work.tick();
    await waitFor(() => h.checks.calls.some((c) => c.taskId === plan.id));
    expect(h.tasks.require(plan.id).verification.checks.map((c) => c.status)).toEqual(['running', 'running']);
    const res = await h.work.stopTask(plan.id);
    expect(res.status).toBe('done');
    await h.work.idle();
    expect(h.tasks.require(plan.id).verification.checks.map((c) => [c.name, c.status])).toEqual([
      ['Integration: Build', 'cancelled'],
      ['Integration: Tests', 'cancelled'],
    ]);
    expect(h.tasks.list().filter((t) => t.kind === 'fix')).toHaveLength(0);
  });
});

describe('interrupted verification', () => {
  it('re-runs only the verification after a shutdown during checks', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'A');
    h.checks.queue('test', (input) => new Promise((resolve) => input.signal?.addEventListener('abort', () => resolve({ status: 'cancelled' }), { once: true })));
    await h.work.tick();
    await waitFor(() => h.checks.calls.length === 1);
    await h.work.shutdown(20);
    expect(h.tasks.require(t.id).status).toBe('interrupted');
    const work2 = createWorkCycle(h.s);
    extra.push(work2);
    h.s.work = work2;
    await work2.recover();
    for (let i = 0; i < 3; i++) {
      await work2.tick();
      await work2.idle();
    }
    expect(h.agents.calls).toHaveLength(1);
    expect(h.checks.calls).toHaveLength(2);
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', verification: { status: 'passed' }, attempts: 1 });
  });
});

describe('honest verification (no proof → never "Geprüft")', () => {
  it('a reviewer verdict alone never makes a task "passed" – coder task without commands and planned review task', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'web', name: 'Spiel', config: defaultConfig({ reviewChanges: true }) });
    const t = task(p.id, 'Highscore speichern');
    h.agents.on({ taskId: t.id, role: 'reviewer' }, outcomes.review({ verdict: 'approve', summary: 'Keine Änderungen gefunden.' }));
    await h.drain();
    const done = h.tasks.require(t.id);
    expect(done.status).toBe('done');
    expect(done.verification).toMatchObject({
      status: 'unavailable',
      checks: [
        { name: 'Build', status: 'skipped' },
        { name: 'Tests', status: 'skipped' },
        { name: 'Review', status: 'passed' },
      ],
    });
    expect(h.checks.calls).toHaveLength(0);
    // the post_task checkpoint is not marked verified (and therefore not auto-committed with commitOnlyWhenVerified)
    expect(h.checkpoints.afterTaskCalls[0].verification.status).toBe('unavailable');
    expect(h.notifications.list_[0].body).toBe('Eine Aufgabe im Projekt „Spiel“ ist fertig – nur vom Review-Agenten durchgesehen, nicht automatisch geprüft.');

    const review = task(p.id, 'Code prüfen', { kind: 'review', role: 'reviewer' });
    h.agents.on({ taskId: review.id }, outcomes.review({ verdict: 'approve', summary: 'Keine Probleme gefunden.' }));
    await h.drain();
    expect(h.tasks.require(review.id)).toMatchObject({ status: 'done', verification: { status: 'unavailable', checks: [{ name: 'Review', status: 'passed' }] } });

    // with a real passed check the approving review completes a passed verification
    const p2 = h.projects.add({ kind: 'generic', config: defaultConfig({ reviewChanges: true, commands: { test: 'npm test' } }) });
    const t2 = task(p2.id, 'Mit Tests');
    h.agents.on({ taskId: t2.id, role: 'reviewer' }, outcomes.review({ verdict: 'approve' }));
    await h.drain();
    expect(h.tasks.require(t2.id).verification).toMatchObject({ status: 'passed', checks: [{ name: 'Tests', status: 'passed' }, { name: 'Review', status: 'passed' }] });
  });

  it('a tester task needs a real test run: the agent\'s lint/runtime runs alone never pass it', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test', lint: 'npm run lint' } }) });
    const t = task(p.id, 'Tests schreiben', { kind: 'test', role: 'tester', maxAttempts: 1 });
    h.agents.on({ taskId: t.id }, async (i, run) => {
      await h.checks.run({ projectId: p.id, kind: 'lint', taskId: t.id, actor: 'agent' });
      return outcomes.testerDone(true, 'Alle Tests bestanden.')(i, run);
    });
    h.checks.queue('test', failTest('sig-t'));
    await h.drain();
    expect(h.checks.calls.map((c) => [c.kind, c.actor])).toEqual([
      ['lint', 'agent'],
      ['test', 'system'],
    ]);
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'failed', verification: { status: 'failed' } });
    expect(h.tasks.require(t.id).verification.checks.map((c) => [c.name, c.status])).toEqual([
      ['Lint', 'passed'],
      ['Tests', 'failed'],
    ]);

    // the same with passing tests → passed
    const t2 = task(p.id, 'Noch mehr Tests', { kind: 'test', role: 'tester' });
    h.agents.on({ taskId: t2.id }, async (i, run) => {
      await h.checks.run({ projectId: p.id, kind: 'runtime', taskId: t2.id, actor: 'agent' });
      return outcomes.testerDone(true)(i, run);
    });
    await h.drain();
    expect(h.tasks.require(t2.id).verification).toMatchObject({ status: 'passed', checks: [{ name: 'Laufzeitprüfung', status: 'passed' }, { name: 'Tests', status: 'passed' }] });

    // no test command: a passed lint run is no proof for a test task
    const p3 = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { lint: 'npm run lint' } }) });
    const t3 = task(p3.id, 'Tests', { kind: 'test', role: 'tester' });
    h.agents.on({ taskId: t3.id }, async (i, run) => {
      await h.checks.run({ projectId: p3.id, kind: 'lint', taskId: t3.id, actor: 'agent' });
      return outcomes.testerDone(true)(i, run);
    });
    await h.drain();
    expect(h.tasks.require(t3.id)).toMatchObject({ status: 'done', verification: { status: 'unavailable', checks: [{ name: 'Tests', status: 'skipped' }, { name: 'Lint', status: 'passed' }] } });
  });

  it('a coder task that changed no file is never "passed" and not reviewed; a build task proves itself by the build', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'web', name: 'Spiel', config: defaultConfig({ reviewChanges: true, commands: { build: 'npm run build', test: 'npm test' } }) });
    const t = task(p.id, 'Highscore speichern');
    h.agents.on({ taskId: t.id }, outcomes.coderDone('Die Funktion ist umgesetzt und alle Tests laufen.', []));
    await h.drain();
    const done = h.tasks.require(t.id);
    expect(done.status).toBe('done');
    expect(done.verification.status).toBe('unavailable');
    expect(done.verification.checks.map((c) => [c.name, c.status])).toEqual([
      ['Änderungen', 'skipped'],
      ['Build', 'passed'],
      ['Tests', 'passed'],
      ['Review', 'skipped'],
    ]);
    expect(done.verification.checks[0].details).toContain('keine Datei geändert');
    expect(h.agents.calls.map((c) => c.roleUsed)).toEqual(['coder']);
    expect(h.checkpoints.afterTaskCalls[0].verification.status).toBe('unavailable');
    expect(h.notifications.list_[0].body).toBe('Eine Aufgabe im Projekt „Spiel“ ist fertig – keine Datei geändert, nicht automatisch geprüft.');

    // a failed check without changes still retries, and the retry context names the missing change
    const p2 = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t2 = task(p2.id, 'Fehler beheben', { kind: 'fix' });
    h.agents.on({ taskId: t2.id }, outcomes.coderDone('Behoben.', []));
    h.checks.queue('test', failTest('sig-x'));
    await h.drain();
    expect(h.agents.callsFor(t2.id)[1].extraContext).toContain('did not change any file');
    expect(h.tasks.require(t2.id)).toMatchObject({ status: 'done', verification: { status: 'passed' } });

    const p3 = h.projects.add({ kind: 'web', config: defaultConfig({ commands: { build: 'npm run build' }, testAfterChange: false }) });
    const b = task(p3.id, 'Projekt bauen', { kind: 'build' });
    h.agents.on({ taskId: b.id }, outcomes.coderDone('Gebaut.', []));
    await h.drain();
    expect(h.tasks.require(b.id).verification).toMatchObject({ status: 'passed', checks: [{ name: 'Build', status: 'passed' }] });
  });
});

describe('checks that could not run because of the environment', () => {
  const loopOpts = { tickIntervalMs: 3_600_000, recheckIntervalMs: 3_600_000, wakeDelayMs: 0, recheckDelayMs: 0 };
  const envError = (signature: string, message: string): Partial<CheckRun> => ({ status: 'error', passed: null, failed: null, failureSignature: signature, message });

  it('install approval pending: the task waits, no coder retry; after the decision only the verification runs again', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', name: 'Shop', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'A');
    const approval = h.approvals.add({ id: 'apr_install', projectId: p.id, taskId: t.id, title: 'Abhängigkeiten installieren' });
    h.checks.queue('test', envError('env:approval:apr_install', 'Abhängigkeiten konnten nicht installiert werden: Die Installation wartet auf eine Freigabe (siehe „Freigaben“).'));
    await h.drain();
    const waiting = h.tasks.require(t.id);
    expect(waiting).toMatchObject({ status: 'waiting_approval', attempts: 1, verification: { status: 'not_run' } });
    expect(waiting.blocker).toContain('Abhängigkeiten installieren');
    expect(h.agents.calls).toHaveLength(1);
    expect(h.core.errors.list().filter((e) => e.taskId === t.id)).toHaveLength(0);
    expect(h.work.status().idleReason).toBe('1 Aufgabe wartet auf Freigabe');
    h.approvals.decide(approval.id, 'approve');
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', attempts: 1, verification: { status: 'passed', checks: [{ name: 'Tests', status: 'passed' }] } });
    expect(h.agents.calls).toHaveLength(1);
    expect(h.checks.calls.map((c) => c.kind)).toEqual(['test', 'test']);
  });

  it('missing program: blocked TOOL_MISSING (no coder retry), the verification re-runs after integrations.updated', async () => {
    h = createHarness({ work: loopOpts });
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'pytest -q' } }) });
    const t = task(p.id, 'A');
    h.checks.queue('test', envError('env:tool_missing:pytest', 'Der Befehl „pytest“ wurde nicht gefunden. Ist das benötigte Werkzeug installiert? (Einstellungen → Werkzeuge)'));
    h.work.startLoop();
    await waitFor(() => status(t.id) === 'blocked');
    await h.work.idle();
    expect(h.tasks.require(t.id)).toMatchObject({ blockerCode: 'TOOL_MISSING', attempts: 1 });
    expect(h.core.errors.list()[0]).toMatchObject({ code: 'TOOL_MISSING', autoFixable: true, userAction: expect.stringContaining('„pytest“') });
    h.core.bus.emit('integrations.updated', []);
    await waitFor(() => status(t.id) === 'done');
    await h.work.idle();
    expect(h.agents.calls).toHaveLength(1);
    expect(h.tasks.require(t.id)).toMatchObject({ attempts: 1, verification: { status: 'passed' } });
    expect(h.core.errors.countOpen()).toBe(0);
  });

  it('Unity open: blocked with a user action, never auto-resumed; "Starten" re-runs only the verification', async () => {
    h = createHarness({ work: loopOpts });
    const p = h.projects.add({ kind: 'unity', config: defaultConfig({ commands: { test: 'Unity.exe -batchmode -runTests' } }) });
    const t = task(p.id, 'A');
    h.checks.queue('test', envError('env:engine_open', 'Projekt ist in Unity geöffnet – bitte Unity schließen.'));
    h.work.startLoop();
    await waitFor(() => status(t.id) === 'blocked');
    await h.work.idle();
    expect(h.tasks.require(t.id)).toMatchObject({ blockerCode: 'FILE_IN_USE', attempts: 1 });
    expect(h.core.errors.list()[0]).toMatchObject({ code: 'FILE_IN_USE', title: 'Prüfung konnte nicht laufen', userAction: expect.stringContaining('Unity schließen') });
    h.core.bus.emit('integrations.updated', []);
    await h.work.idle();
    expect(status(t.id)).toBe('blocked');
    h.work.startTask(t.id);
    await waitFor(() => status(t.id) === 'done');
    await h.work.idle();
    expect(h.agents.calls).toHaveLength(1);
    expect(h.tasks.require(t.id)).toMatchObject({ attempts: 1, verification: { status: 'passed' } });
  });

  it('tester: a test run that could not start is repeated after the approval instead of counting as a result', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ commands: { test: 'npm test' } }) });
    const t = task(p.id, 'Tests', { kind: 'test', role: 'tester' });
    const approval = h.approvals.add({ id: 'apr_t', projectId: p.id, taskId: t.id });
    h.agents.on({ taskId: t.id }, async (i, run) => {
      await h.checks.run({ projectId: p.id, kind: 'test', taskId: t.id, actor: 'agent' });
      return outcomes.testerDone(null, 'Die Tests konnten nicht laufen.')(i, run);
    });
    h.checks.queue('test', envError('env:approval:apr_t', 'wartet auf eine Freigabe'), envError('env:approval:apr_t', 'wartet auf eine Freigabe'));
    await h.drain();
    expect(h.tasks.require(t.id).status).toBe('waiting_approval');
    h.approvals.decide(approval.id, 'approve');
    await h.drain();
    expect(h.agents.calls).toHaveLength(1);
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', verification: { status: 'passed', checks: [{ name: 'Tests', status: 'passed' }] } });
    expect(h.checks.calls.map((c) => c.actor)).toEqual(['agent', 'system', 'system']);
  });

  it('integration pass: no fix task, an error report, and a re-run once the approval is decided', async () => {
    h = createHarness({ work: loopOpts });
    const p = h.projects.add({ kind: 'generic', name: 'Spiel', config: defaultConfig({ testAfterChange: false, commands: { build: 'npm run build', test: 'npm test' } }) });
    const plan = task(p.id, 'Plan', { kind: 'plan', role: 'planner' });
    h.agents.on({ taskId: plan.id }, outcomes.plan({ tasks: [{ key: 'a', title: 'Teil', description: '', role: 'coder', kind: 'code', dependsOn: [], priority: 1, acceptance: null, files: [] }] }));
    // like CheckService: the install approval is requested while the integration build runs
    h.checks.queue('build', () => {
      h.approvals.add({ id: 'apr_int', projectId: p.id, taskId: plan.id });
      return envError('env:approval:apr_int', 'wartet auf eine Freigabe');
    });
    h.work.startLoop();
    await waitFor(() => h.core.errors.list().some((e) => e.title === 'Integrationsprüfung konnte nicht laufen'));
    await h.work.idle();
    expect(h.tasks.list().filter((x) => x.kind === 'fix')).toHaveLength(0);
    expect(h.tasks.require(plan.id).verification.status).toBe('not_run');
    expect(h.core.errors.list().find((e) => e.title === 'Integrationsprüfung konnte nicht laufen')).toMatchObject({ code: 'APPROVAL_REQUIRED', related: { approvalId: 'apr_int' } });
    // still pending: a re-check does not repeat it
    h.core.bus.emit('approval.updated', h.approvals.get('apr_int')!);
    await h.work.idle();
    expect(h.checks.calls.filter((c) => c.taskId === plan.id).map((c) => c.kind)).toEqual(['build']);
    h.approvals.decide('apr_int', 'approve');
    h.core.bus.emit('approval.updated', h.approvals.get('apr_int')!);
    await waitFor(() => h.tasks.require(plan.id).verification.status === 'passed');
    await h.work.idle();
    expect(h.checks.calls.filter((c) => c.taskId === plan.id).map((c) => c.kind)).toEqual(['build', 'build', 'test']);
    expect(h.core.errors.countOpen()).toBe(0);
  });
});

describe('recover after a database restore', () => {
  it('pauses tasks that were in flight at backup time instead of resuming their stale conversations', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    const running = task(p.id, 'Lief gerade');
    const waiting = task(p.id, 'Wartete auf Freigabe');
    const fresh = task(p.id, 'Noch nicht begonnen');
    h.tasks.patch(running.id, { status: 'running', attempts: 1 });
    h.tasks.patch(waiting.id, { status: 'waiting_approval', attempts: 1 });
    const r1 = h.runs.create({ taskId: running.id, projectId: p.id, role: 'coder' });
    const r2 = h.runs.create({ taskId: waiting.id, projectId: p.id, role: 'coder' });
    const apr = h.approvals.add({ projectId: p.id, taskId: waiting.id });
    h.runs.update(r2.id, { status: 'waiting_approval', pendingApprovalId: apr.id });
    const work2 = createWorkCycle(h.s);
    extra.push(work2);
    h.s.work = work2;
    const res = await work2.recover({ restoredFrom: 'C:\\Users\\Lena\\AppData\\Roaming\\NOVA\\backups\\nova-2026-10-20.db' });
    expect(res).toEqual({ tasks: 2 });
    for (const t of [running, waiting]) {
      expect(h.tasks.require(t.id)).toMatchObject({ status: 'paused', blockerCode: 'INTERRUPTED', blocker: expect.stringContaining('Datenbank-Wiederherstellung') });
    }
    expect(status(fresh.id)).toBe('queued');
    expect([h.runs.get(r1.id)?.status, h.runs.get(r2.id)?.status]).toEqual(['cancelled', 'cancelled']);
    expect(h.approvals.get(apr.id)?.status).toBe('expired');
    const warning = h.core.errors.list().find((e) => e.title === 'Datenbank wiederhergestellt')!;
    expect(warning).toMatchObject({ severity: 'warning', projectId: null });
    expect(warning.whatHappened).toContain('„nova-2026-10-20.db“');
    expect(warning.whatHappened).not.toContain('Lena');
    expect(warning.whatHappened).toContain('nicht mehr im Änderungsprotokoll');
    for (let i = 0; i < 3; i++) {
      await work2.tick();
      await work2.idle();
    }
    expect(h.agents.callsFor(running.id)).toHaveLength(0);
    expect(h.agents.callsFor(waiting.id)).toHaveLength(0);
    expect(status(fresh.id)).toBe('done');
    // the user resumes it explicitly → a fresh run, not the stale conversation
    work2.resumeTask(running.id);
    for (let i = 0; i < 3; i++) {
      await work2.tick();
      await work2.idle();
    }
    expect(status(running.id)).toBe('done');
    expect(h.agents.callsFor(running.id)[0].resumeRunId).toBeNull();
  });
});

describe('createFix', () => {
  it('creates fix tasks from failed checks and errors and validates the input', async () => {
    h = createHarness();
    const p = h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }) });
    const other = h.projects.add();
    const run = h.checks.add({ projectId: p.id, kind: 'build', ...failTest('x', 'TS2304: Cannot find name') });
    const fix = h.work.createFix({ projectId: p.id, checkRunId: run.id, note: 'Bitte vorsichtig' });
    expect(fix).toMatchObject({ kind: 'fix', role: 'coder', source: 'user', priority: 2, startRequested: true, title: 'Fehler beheben: Build fehlgeschlagen', plannedFiles: ['tests/a.test.js'] });
    expect(fix.description).toContain('Hinweis des Benutzers: Bitte vorsichtig');
    const err = h.core.errors.report({ code: 'BUILD_FAILED', severity: 'blocker', title: 'Build bricht ab', whatHappened: 'Kaputt', projectId: p.id, related: { checkRunId: run.id, runId: null, approvalId: null, file: 'src/a.ts', line: 1 } });
    const fix2 = h.work.createFix({ projectId: p.id, errorId: err.id });
    expect(fix2.title).toBe('Fehler beheben: Build bricht ab');
    expect(fix2.description).toContain('TS2304');
    expect(() => h.work.createFix({ projectId: p.id })).toThrow(/Bitte eine fehlgeschlagene Prüfung/);
    expect(() => h.work.createFix({ projectId: other.id, checkRunId: run.id })).toThrow(/anderen Projekt/);
    expect(() => h.work.createFix({ projectId: p.id, checkRunId: 'crun_missing' })).toThrow(/nicht gefunden/);
    expect(h.work.createFix({ projectId: p.id, note: 'Button reagiert nicht' }).title).toBe('Fehler beheben: Button reagiert nicht');
  });
});
