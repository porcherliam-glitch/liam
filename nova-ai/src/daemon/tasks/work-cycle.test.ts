// Orchestrator tests – scheduling, work states, pause/resume/stop, approvals, questions, auto-unblock, recovery, status.
import { describe, it, expect, afterEach } from 'vitest';
import type { ProviderConfig, Task } from '@shared/schemas';
import { NovaError } from '../core/errors';
import { createWorkCycle } from './work-cycle';
import { createHarness, defaultConfig, gate, outcomes, sleep, stepping, type Harness } from './test-support';
import { readFailures, writeFailures } from './task-store';

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

/** Project without automatic checks (verification → unavailable) so scheduling tests stay small. */
function quiet(patch: Parameters<Harness['projects']['add']>[0] = {}) {
  return h.projects.add({ kind: 'generic', config: defaultConfig({ testAfterChange: false }), ...patch });
}

function task(projectId: string, title: string, patch: Record<string, unknown> = {}): Task {
  return h.tasks.create({ projectId, title, ...patch } as never);
}

const status = (id: string) => h.tasks.require(id).status;

describe('scheduling', () => {
  it('starts ready tasks by priority and creation order and respects dependencies', async () => {
    h = createHarness();
    h.governor.allowedN = 1;
    const p = quiet();
    const low = task(p.id, 'low', { priority: 0 });
    task(p.id, 'high', { priority: 3 });
    task(p.id, 'mid', { priority: 1 });
    task(p.id, 'dep', { priority: 3, dependsOn: [low.id] });
    await h.drain();
    expect(h.agents.calls.map((c) => c.task.title)).toEqual(['high', 'mid', 'low', 'dep']);
    expect(h.tasks.list().every((t) => t.status === 'done' && t.verification.status === 'unavailable')).toBe(true);
  });

  it('never exceeds governor.allowed() parallel runs', async () => {
    h = createHarness();
    h.governor.allowedN = 2;
    const p = quiet();
    const gates = [gate(), gate(), gate()];
    const ts = gates.map((g, i) => {
      const t = task(p.id, `T${i}`);
      h.agents.on({ taskId: t.id }, g.script);
      return t;
    });
    await h.work.tick();
    expect(h.work.activeRunCount()).toBe(2);
    expect(h.work.status().activeRuns).toBe(2);
    await h.work.tick();
    expect(h.agents.calls).toHaveLength(2);
    gates[0].release();
    await waitFor(() => h.work.activeRunCount() === 1);
    await h.work.tick();
    expect(h.work.activeRunCount()).toBe(2);
    expect(status(ts[2].id)).toBe('running');
    gates[1].release();
    gates[2].release();
    await h.work.idle();
    expect(ts.map((t) => status(t.id))).toEqual(['done', 'done', 'done']);
  });

  it('does not run tasks of one project with overlapping plannedFiles in parallel', async () => {
    h = createHarness();
    h.governor.allowedN = 4;
    const p1 = quiet();
    const p2 = quiet();
    const g = { a: gate(), b: gate(), c: gate(), d: gate() };
    const a = task(p1.id, 'A', { plannedFiles: ['src/game.js'] });
    const b = task(p1.id, 'B', { plannedFiles: ['src/'] });
    const c = task(p1.id, 'C', { plannedFiles: ['README.md'] });
    const d = task(p2.id, 'D', { plannedFiles: ['src/game.js'] });
    for (const [t, gg] of [[a, g.a], [b, g.b], [c, g.c], [d, g.d]] as const) h.agents.on({ taskId: t.id }, gg.script);
    await h.work.tick();
    expect([a, b, c, d].map((t) => status(t.id))).toEqual(['running', 'queued', 'running', 'running']);
    g.a.release();
    await waitFor(() => status(a.id) === 'done');
    await h.work.tick();
    expect(status(b.id)).toBe('running');
    g.b.release();
    g.c.release();
    g.d.release();
    await h.work.idle();
  });

  it('honours global and project work states, startRequested and archived projects', async () => {
    h = createHarness();
    const p = quiet({ workState: 'stopped' });
    const archived = quiet({ status: 'archived' });
    const t = task(p.id, 'Einzelaufgabe');
    task(archived.id, 'Archiviert');
    await h.work.tick();
    expect(h.agents.calls).toHaveLength(0);
    expect(h.work.status().projects.find((x) => x.projectId === p.id)?.idleReason).toBe('Autonome Arbeit ist für dieses Projekt ausgeschaltet');
    expect(h.work.startTask(t.id).startRequested).toBe(true);
    h.work.pause();
    await h.work.tick();
    expect(h.agents.calls).toHaveLength(0);
    expect(h.work.status()).toMatchObject({ state: 'paused', idleReason: 'Arbeit pausiert' });
    h.work.resume();
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'done', startRequested: false });
    expect(h.agents.calls.map((c) => c.task.title)).toEqual(['Einzelaufgabe']);
  });
});

describe('pause, resume, stop', () => {
  it('work.pause(project) pauses exactly the running tasks and work.resume resumes only those', async () => {
    h = createHarness();
    h.governor.allowedN = 3;
    const p = quiet();
    const a = task(p.id, 'A');
    const b = task(p.id, 'B');
    const c = task(p.id, 'C');
    h.agents.on({ taskId: a.id }, stepping(outcomes.coderDone()));
    h.agents.on({ taskId: b.id }, stepping(outcomes.coderDone()));
    h.work.pauseTask(c.id);
    expect(status(c.id)).toBe('paused');
    await h.work.tick();
    expect(h.work.activeRunCount()).toBe(2);
    h.work.pause(p.id);
    await h.work.idle();
    expect([a, b, c].map((t) => status(t.id))).toEqual(['paused', 'paused', 'paused']);
    expect(h.projects.get(p.id)?.workState).toBe('paused');
    h.agents.on({ taskId: a.id }, outcomes.coderDone());
    h.agents.on({ taskId: b.id }, outcomes.coderDone());
    h.work.resume(p.id);
    expect([a, b, c].map((t) => status(t.id))).toEqual(['queued', 'queued', 'paused']);
    await h.drain();
    expect([a, b, c].map((t) => status(t.id))).toEqual(['done', 'done', 'paused']);
    for (const t of [a, b]) {
      const calls = h.agents.callsFor(t.id);
      expect(calls).toHaveLength(2);
      expect(calls[1].resumeRunId).toBe(calls[0].runId);
    }
  });

  it('global pause/resume works across projects; a user pause is not resumed by work.resume', async () => {
    h = createHarness();
    h.governor.allowedN = 3;
    const p1 = quiet();
    const p2 = quiet();
    const a = task(p1.id, 'A');
    const b = task(p2.id, 'B');
    h.agents.on({ taskId: a.id }, stepping(outcomes.coderDone()));
    h.agents.on({ taskId: b.id }, stepping(outcomes.coderDone()));
    await h.work.tick();
    h.work.pauseTask(b.id);
    h.work.pause();
    await h.work.idle();
    expect([status(a.id), status(b.id)]).toEqual(['paused', 'paused']);
    h.work.resume();
    expect([status(a.id), status(b.id)]).toEqual(['queued', 'paused']);
    h.agents.on({ taskId: a.id }, outcomes.coderDone());
    await h.drain();
    expect(status(a.id)).toBe('done');
    h.agents.on({ taskId: b.id }, outcomes.coderDone());
    h.work.resumeTask(b.id);
    await h.drain();
    expect(h.tasks.require(b.id)).toMatchObject({ status: 'done', startRequested: false });
    expect(h.agents.callsFor(b.id)[1].resumeRunId).toBe(h.agents.callsFor(b.id)[0].runId);
  });

  it('stopTask cancels the run, kills processes, releases locks and expires approvals', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'A');
    const queuedTask = task(p.id, 'B', { dependsOn: [t.id] });
    const g = gate();
    h.agents.on({ taskId: t.id }, g.script);
    await h.work.tick();
    await g.started;
    const res = await h.work.stopTask(t.id);
    expect(res).toMatchObject({ status: 'cancelled', blocker: 'Vom Benutzer gestoppt.', startRequested: false });
    expect(res.finishedAt).not.toBeNull();
    expect(h.processes.killed).toContain(t.id);
    expect(h.locks.released).toContain(t.id);
    expect(h.approvals.expiredForTask).toContain(t.id);
    expect(h.work.activeRunCount()).toBe(0);
    expect((await h.work.stopTask(queuedTask.id)).status).toBe('cancelled');
    expect((await h.work.stopTask(t.id)).status).toBe('cancelled');
  });

  it('work.stop cancels running runs and re-queues their tasks; nothing starts until work.start', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'A');
    h.work.startTask(t.id);
    const g = gate();
    h.agents.on({ taskId: t.id }, g.script);
    await h.work.tick();
    await g.started;
    expect(h.tasks.require(t.id).attempts).toBe(1);
    const st = h.work.stop();
    expect(st.state).toBe('stopped');
    await h.work.idle();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'queued', startRequested: false, attempts: 0 });
    expect(h.processes.killed).toContain(t.id);
    await h.work.tick();
    expect(h.agents.calls).toHaveLength(1);
    expect(h.work.status().idleReason).toBe('Arbeit gestoppt');
    h.work.start();
    await h.drain();
    expect(status(t.id)).toBe('done');
    expect(h.agents.callsFor(t.id)[1].resumeRunId).toBeNull();
  });

  it('pauses a running task at the next step via tasks.pause and resumes it', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id }, stepping(outcomes.coderDone()));
    await h.work.tick();
    expect(h.work.pauseTask(t.id).status).toBe('running');
    await h.work.idle();
    expect(status(t.id)).toBe('paused');
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    expect(h.work.resumeTask(t.id)).toMatchObject({ status: 'queued', startRequested: true });
    await h.drain();
    expect(status(t.id)).toBe('done');
    expect(() => h.work.pauseTask(t.id)).toThrow(/bereits beendet/);
    expect(() => h.work.startTask(t.id)).toThrow(/bereits erledigt/);
  });
});

describe('approvals and questions', () => {
  it('waits for an approval and resumes the same run after the decision', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'Deploy');
    const ap = h.approvals.add({ taskId: t.id, title: 'Befehl ausführen: npm run deploy' });
    h.agents.on({ taskId: t.id }, outcomes.waiting(ap.id));
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'waiting_approval', blocker: 'Wartet auf Freigabe: Befehl ausführen: npm run deploy' });
    expect(h.work.status().idleReason).toBe('1 Aufgabe wartet auf Freigabe');
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    h.approvals.decide(ap.id, 'deny');
    expect(status(t.id)).toBe('queued');
    await h.drain();
    expect(status(t.id)).toBe('done');
    const calls = h.agents.callsFor(t.id);
    expect(calls[1].resumeRunId).toBe(calls[0].runId);
  });

  it('re-queues immediately when the approval was decided before the outcome arrived', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'A');
    const ap = h.approvals.add({ taskId: t.id });
    h.agents.on({ taskId: t.id }, (i, run) => {
      h.approvals.decide(ap.id, 'approve');
      return outcomes.waiting(ap.id)(i, run);
    });
    await h.drain();
    expect(status(t.id)).toBe('done');
    expect(h.agents.callsFor(t.id)).toHaveLength(2);
  });

  it('re-queues a waiting task whose approval expired (task edited) on the periodic re-check', async () => {
    h = createHarness({ work: { tickIntervalMs: 3_600_000, recheckIntervalMs: 3_600_000, wakeDelayMs: 0, recheckDelayMs: 0 } });
    const p = quiet();
    const t = task(p.id, 'A');
    const ap = h.approvals.add({ taskId: t.id });
    h.agents.on({ taskId: t.id }, outcomes.waiting(ap.id));
    h.work.startLoop();
    await waitFor(() => status(t.id) === 'waiting_approval');
    await h.work.idle();
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    h.tasks.update({ id: t.id, description: 'Neue Anforderung' });
    await waitFor(() => status(t.id) === 'done');
    await h.work.idle();
    expect(h.agents.callsFor(t.id)[1].resumeRunId).toBe(h.agents.callsFor(t.id)[0].runId);
  });

  it('NEEDS_INPUT blocks without a duplicate notification and an answer re-queues the run', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'Farbe wählen');
    h.agents.on({ taskId: t.id }, (i, run) => {
      // what the ask_user tool does
      h.tasks.addNote({ taskId: t.id, author: 'agent', kind: 'question', text: 'Welche Farbe?', options: ['Rot', 'Blau'], assumption: 'Blau' });
      h.notifications.notify({ level: 'warning', category: 'blocker', title: 'Rückfrage', body: 'Frage', projectId: p.id, taskId: t.id });
      return outcomes.blocked('NEEDS_INPUT', 'Welche Farbe?')(i, run);
    });
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'blocked', blockerCode: 'NEEDS_INPUT' });
    expect(h.notifications.list_.filter((n) => n.taskId === t.id && n.category === 'blocker')).toHaveLength(1);
    expect(h.core.errors.countOpen()).toBe(0);
    expect(h.work.status().idleReason).toBe('1 Aufgabe wartet auf eine Antwort');
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    const note = h.work.addNote(t.id, 'Rot bitte');
    expect(note).toMatchObject({ kind: 'answer', author: 'user' });
    expect(status(t.id)).toBe('queued');
    await h.drain();
    expect(status(t.id)).toBe('done');
    expect(h.agents.callsFor(t.id)[1].resumeRunId).toBe(h.agents.callsFor(t.id)[0].runId);
    expect(h.work.addNote(t.id, 'Danke').kind).toBe('note');
  });

  it('auto-unblocks resumable blockers on provider.updated once the model resolves', async () => {
    h = createHarness({ work: { tickIntervalMs: 3_600_000, recheckIntervalMs: 3_600_000, wakeDelayMs: 0, recheckDelayMs: 0 } });
    const p = quiet();
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id }, outcomes.blocked('NO_MODEL', 'Es ist kein Modell eingerichtet.'));
    h.models.resolveError = new NovaError('NO_MODEL', 'Es ist kein Modell eingerichtet.');
    h.work.startLoop();
    await waitFor(() => status(t.id) === 'blocked');
    await h.work.idle();
    expect(h.core.errors.list()[0]).toMatchObject({ code: 'NO_MODEL', taskId: t.id, autoFixable: true });
    expect(h.notifications.list_.some((n) => n.category === 'blocker' && n.taskId === t.id && !n.body.includes('Es ist kein Modell eingerichtet.'))).toBe(true);
    expect(h.work.status().idleReason).toBe("Kein Modell verfügbar – bitte in 'Modelle' eines auswählen");
    const provider = { id: 'ollama-local', type: 'ollama', name: 'Ollama', baseUrl: 'http://127.0.0.1:11434', enabled: true, paid: false, approved: true, hasApiKey: false, options: {}, createdAt: 0, updatedAt: 0 } as ProviderConfig;
    const before = h.models.resolveCalls;
    h.core.bus.emit('provider.updated', provider);
    await h.work.idle();
    expect(h.models.resolveCalls).toBeGreaterThan(before);
    expect(status(t.id)).toBe('blocked');
    h.models.resolveError = null;
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    h.core.bus.emit('provider.updated', provider);
    await waitFor(() => status(t.id) === 'done');
    await h.work.idle();
    expect(h.agents.callsFor(t.id)[1].resumeRunId).toBe(h.agents.callsFor(t.id)[0].runId);
    expect(h.core.errors.countOpen()).toBe(0);
  });
});

describe('more auto-unblock and platform rules', () => {
  const loopOpts = { tickIntervalMs: 3_600_000, recheckIntervalMs: 3_600_000, wakeDelayMs: 0, recheckDelayMs: 0 };

  it('TOOL_MISSING: checks the named integration, otherwise waits for integrations.updated', async () => {
    h = createHarness({ work: loopOpts });
    const p = quiet();
    const named = task(p.id, 'Mit Git');
    const unnamed = task(p.id, 'Unbekannt');
    h.agents.on({ taskId: named.id }, outcomes.blocked('TOOL_MISSING', 'Git ist nicht installiert.'));
    h.agents.on({ taskId: unnamed.id }, outcomes.blocked('TOOL_MISSING', 'Ein Werkzeug fehlt.'));
    h.work.startLoop();
    await waitFor(() => status(named.id) === 'blocked' && status(unnamed.id) === 'blocked');
    await h.work.idle();
    h.core.bus.emit('provider.updated', { id: 'x' } as ProviderConfig);
    await h.work.idle();
    expect([status(named.id), status(unnamed.id)]).toEqual(['blocked', 'blocked']);
    h.integrations.available.set('git', true);
    h.core.bus.emit('provider.updated', { id: 'x' } as ProviderConfig);
    await waitFor(() => status(named.id) === 'done');
    expect(status(unnamed.id)).toBe('blocked');
    h.core.bus.emit('integrations.updated', []);
    await waitFor(() => status(unnamed.id) === 'done');
    await h.work.idle();
  });

  it('RESOURCE_LIMIT resumes when the governor allows new runs again (settings change)', async () => {
    h = createHarness({ work: loopOpts });
    const p = quiet();
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id }, outcomes.blocked('RESOURCE_LIMIT', 'Zu wenig Arbeitsspeicher.'));
    h.work.startLoop();
    await waitFor(() => status(t.id) === 'blocked');
    await h.work.idle();
    h.governor.allowedN = 0;
    h.core.settings.update({ resources: { maxCpuPercent: 90 } });
    await h.work.idle();
    expect(status(t.id)).toBe('blocked');
    h.governor.allowedN = 2;
    h.core.settings.update({ resources: { maxCpuPercent: 95 } });
    await waitFor(() => status(t.id) === 'done');
    await h.work.idle();
  });

  it('compares plannedFiles case-insensitively on Windows', async () => {
    h = createHarness();
    (h.core as { platform: NodeJS.Platform }).platform = 'win32';
    const p = quiet();
    const g1 = gate();
    const g2 = gate();
    const a = task(p.id, 'A', { plannedFiles: ['SRC\\Game.js'] });
    const b = task(p.id, 'B', { plannedFiles: ['src/game.js'] });
    h.agents.on({ taskId: a.id }, g1.script);
    h.agents.on({ taskId: b.id }, g2.script);
    await h.work.tick();
    expect([status(a.id), status(b.id)]).toEqual(['running', 'queued']);
    g1.release();
    g2.release();
    await h.drain();
    expect([status(a.id), status(b.id)]).toEqual(['done', 'done']);
  });
});

describe('failures, retries, dependencies', () => {
  it('maps failed outcomes, blocks dependents, and re-queues them when the dependency is finally done', async () => {
    h = createHarness();
    const p = quiet();
    const a = task(p.id, 'A in src/geheim.ts');
    const b = task(p.id, 'B', { dependsOn: [a.id] });
    h.agents.on({ taskId: a.id }, outcomes.failed('AGENT_BAD_OUTPUT', 'Das Modell antwortet unbrauchbar.'));
    await h.drain();
    expect(h.tasks.require(a.id)).toMatchObject({ status: 'failed', blockerCode: 'AGENT_BAD_OUTPUT', startRequested: false });
    expect(h.tasks.require(b.id)).toMatchObject({ status: 'blocked', blockerCode: 'DEPENDENCY_FAILED' });
    expect(h.tasks.require(b.id).blocker).toContain('„A in src/geheim.ts“ ist fehlgeschlagen');
    expect(h.core.errors.list().map((e) => e.taskId)).toEqual([a.id]);
    expect(h.notifications.list_.map((n) => n.title)).toEqual(['Aufgabe fehlgeschlagen']);
    expect(h.notifications.list_[0].body).not.toContain('src/geheim.ts');
    expect(h.locks.released).toContain(a.id);
    writeFailures(h.core.db, a.id, [{ signature: 'x', attempt: 1, summary: 's', ts: 1 }]);
    const retried = h.work.retryTask(a.id);
    expect(retried).toMatchObject({ status: 'queued', attempts: 0, blocker: null, startRequested: true, verification: { status: 'not_run', checks: [] } });
    expect(readFailures(h.core.db, a.id)).toEqual([]);
    expect(h.core.errors.countOpen()).toBe(0);
    await h.drain();
    expect([status(a.id), status(b.id)]).toEqual(['done', 'done']);
    expect(h.agents.callsFor(a.id)[1].resumeRunId).toBeNull();
  });

  it('creates the pre_task checkpoint only before the first fresh run and never for planners', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id }, outcomes.paused());
    await h.drain();
    expect(status(t.id)).toBe('paused');
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    h.work.resumeTask(t.id);
    await h.drain();
    expect(h.checkpoints.created.map((c) => [c.kind, c.taskId])).toEqual([['pre_task', t.id]]);
    const plan = task(p.id, 'Plan', { kind: 'plan' });
    h.agents.on({ taskId: plan.id }, outcomes.plan({ tasks: [] }));
    await h.drain();
    expect(h.checkpoints.created).toHaveLength(1);
    h.core.settings.update({ backup: { checkpointBeforeTasks: false } });
    task(p.id, 'B');
    await h.drain();
    expect(h.checkpoints.created).toHaveLength(1);
  });

  it('reports non-resumable blockers once per task and releases locks', async () => {
    h = createHarness();
    const p = quiet();
    const t = task(p.id, 'A');
    h.agents.on({ taskId: t.id }, outcomes.blocked('AGENT_STEP_LIMIT', 'Zu viele Schritte.'));
    await h.drain();
    expect(h.tasks.require(t.id)).toMatchObject({ status: 'blocked', blockerCode: 'AGENT_STEP_LIMIT' });
    expect(h.locks.released).toContain(t.id);
    h.agents.on({ taskId: t.id }, outcomes.blocked('AGENT_STEP_LIMIT', 'Wieder zu viele Schritte.'));
    h.work.startTask(t.id);
    await h.drain();
    expect(h.core.errors.list({ includeResolved: true }).filter((e) => e.taskId === t.id && !e.resolvedAt)).toHaveLength(1);
    expect(h.agents.callsFor(t.id)[1].resumeRunId).toBeNull();
  });
});

describe('recovery and shutdown', () => {
  it('shutdown marks running tasks interrupted (not cancelled) and recover() resumes them', async () => {
    h = createHarness();
    const p = quiet();
    const a = task(p.id, 'A');
    const b = task(p.id, 'B');
    h.agents.on({ taskId: a.id }, stepping(outcomes.coderDone()));
    const g = gate(); // ignores pause flags → aborted with INTERRUPTED after the timeout
    h.agents.on({ taskId: b.id }, g.script);
    await h.work.tick();
    await g.started;
    await h.work.shutdown(50);
    expect([status(a.id), status(b.id)]).toEqual(['interrupted', 'interrupted']);
    const work2 = createWorkCycle(h.s);
    extra.push(work2);
    h.s.work = work2;
    expect(await work2.recover()).toEqual({ tasks: 2 });
    expect([status(a.id), status(b.id)]).toEqual(['queued', 'queued']);
    h.agents.fallback = outcomes.coderDone();
    for (let i = 0; i < 5; i++) {
      await work2.tick();
      await work2.idle();
    }
    for (const t of [a, b]) {
      expect(status(t.id)).toBe('done');
      const calls = h.agents.callsFor(t.id);
      expect(calls[1].resumeRunId).toBe(calls[0].runId);
    }
  });

  it('recover() pauses tasks whose risky in-flight action was interrupted and resumes safe ones', async () => {
    h = createHarness();
    const p = quiet();
    const risky = task(p.id, 'Veröffentlichen');
    const safeTask = task(p.id, 'Lesen');
    const plain = task(p.id, 'Ohne Zustand');
    for (const t of [risky, safeTask, plain]) h.tasks.patch(t.id, { status: 'running' });
    const r1 = h.runs.create({ taskId: risky.id, projectId: p.id, role: 'coder' });
    const r2 = h.runs.create({ taskId: safeTask.id, projectId: p.id, role: 'coder' });
    h.runs.create({ taskId: plain.id, projectId: p.id, role: 'coder' });
    h.runs.saveState(r1.id, { inFlight: { toolCallId: 'c1', name: 'run_command', args: { command: 'git push' }, readOnly: false, startedAt: 1 } });
    h.runs.saveState(r2.id, { inFlight: { toolCallId: 'c2', name: 'read_file', args: { path: 'a' }, readOnly: true, startedAt: 1 } });
    h.policy.decision = { action: 'approve', kind: 'publish', reason: 'Veröffentlichung', consequences: '', subject: 'git push' };
    expect(await h.work.recover()).toEqual({ tasks: 3 });
    expect(h.tasks.require(risky.id)).toMatchObject({ status: 'paused', blocker: 'Nach Neustart unterbrochen – bitte prüfen' });
    expect(h.locks.released).toEqual([risky.id]);
    expect([status(safeTask.id), status(plain.id)]).toEqual(['queued', 'queued']);
    await h.drain();
    expect(h.agents.callsFor(safeTask.id)[0].resumeRunId).toBe(r2.id);
    expect(status(risky.id)).toBe('paused');
  });

  it('recover() leaves interrupted tasks alone when resumeAfterRestart is off', async () => {
    h = createHarness();
    h.core.settings.update({ background: { resumeAfterRestart: false } });
    const p = quiet();
    const t = task(p.id, 'A');
    h.tasks.patch(t.id, { status: 'running' });
    h.runs.create({ taskId: t.id, projectId: p.id, role: 'coder' });
    await h.work.recover();
    expect(status(t.id)).toBe('interrupted');
    expect(h.locks.released).toEqual([t.id]);
    expect(h.work.status().idleReason).toBe('1 Aufgabe wurde unterbrochen – bitte fortsetzen');
    h.agents.on({ taskId: t.id }, outcomes.coderDone());
    h.work.resumeTask(t.id);
    await h.drain();
    expect(status(t.id)).toBe('done');
    expect(h.agents.callsFor(t.id)[0].resumeRunId).not.toBeNull();
  });
});

describe('status', () => {
  it('emits work.status on changes, sets the task model and suggests a next step when idle', async () => {
    h = createHarness();
    const statuses: unknown[] = [];
    h.core.bus.on('work.status', (st) => statuses.push(st));
    const p = quiet();
    h.memory.next = { id: 'mem_1', projectId: p.id, kind: 'next_step', title: 'Highscore einbauen', content: '', tags: [], source: 'agent', shareable: false, taskId: null, createdAt: 0, updatedAt: 0 };
    const t = task(p.id, 'A');
    await h.drain();
    expect(statuses.length).toBeGreaterThan(1);
    expect(h.tasks.require(t.id).model).toBe('ollama-local/qwen2.5-coder:7b');
    const st = h.work.status();
    expect(st).toMatchObject({ state: 'running', activeRuns: 0, queuedTasks: 0, idleReason: 'Keine offenen Aufgaben', allowedConcurrency: 2, configuredConcurrency: 2 });
    expect(st.projects[0]).toMatchObject({ projectId: p.id, suggestion: 'Nächster Schritt: Highscore einbauen' });
    h.memory.next = null;
    expect(h.work.status().projects[0].suggestion).toBe('Neues Ziel planen');
    await h.work.tick(); // suggestion changed → one new event
    const count = statuses.length;
    await h.work.tick(); // nothing changed → no event
    expect(statuses.length).toBe(count);
  });

  it('reports resource limits as idle reason', async () => {
    h = createHarness();
    h.governor.allowedN = 0;
    h.governor.reason = 'CPU 92 %';
    const p = quiet();
    task(p.id, 'A');
    await h.work.tick();
    expect(h.agents.calls).toHaveLength(0);
    expect(h.work.status().idleReason).toBe('Ressourcenlimit: CPU 92 %');
  });
});
