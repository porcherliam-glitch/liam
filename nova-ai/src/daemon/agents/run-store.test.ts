import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { RunStore } from '../contracts';
import { createRunStore, boundStepData, preTruncate, STEP_DATA_MAX_BYTES, MAX_STEPS_PER_RUN } from './run-store';
import { insertProjectAndTask } from './test-fixtures';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

function setup(opts: { inlineStateMaxBytes?: number } = {}): { runs: RunStore; projectId: string; taskId: string } {
  t = createTestCore();
  const { project, task } = insertProjectAndTask(t.core);
  const s = makeServices(t.core);
  const runs = createRunStore(s, opts);
  return { runs, projectId: project.id, taskId: task.id };
}

describe('RunStore', () => {
  it('creates, updates and lists runs and emits run.updated', () => {
    const { runs, projectId, taskId } = setup();
    const events: string[] = [];
    t!.core.bus.on('run.updated', (r) => events.push(`${r.id}:${r.status}`));
    const run = runs.create({ taskId, projectId, role: 'coder' });
    expect(run).toMatchObject({ taskId, projectId, role: 'coder', status: 'running', stepCount: 0, files: [], endedAt: null });
    const updated = runs.update(run.id, { status: 'waiting_approval', pendingApprovalId: 'apr_1', files: ['a.ts', 'a.ts', 'b.ts'], activeMs: 1234.6, lastAction: 'Schreibt src/a.ts' });
    expect(updated).toMatchObject({ status: 'waiting_approval', pendingApprovalId: 'apr_1', files: ['a.ts', 'b.ts'], activeMs: 1235 });
    expect(events).toEqual([`${run.id}:running`, `${run.id}:waiting_approval`]);

    const other = runs.create({ taskId, projectId, role: 'reviewer' });
    expect(runs.list({ taskId }).map((r) => r.id)).toEqual([other.id, run.id]);
    expect(runs.list({ activeOnly: true }).map((r) => r.id)).toEqual([other.id]);
    expect(runs.list({ pendingApprovalId: 'apr_1' }).map((r) => r.id)).toEqual([run.id]);
    expect(runs.list({ status: ['waiting_approval'] }).map((r) => r.id)).toEqual([run.id]);
    expect(runs.list({ projectId, limit: 1 })).toHaveLength(1);
    expect(runs.latestForTask(taskId)!.id).toBe(other.id);
    expect(runs.latestForTask(taskId, 'coder')!.id).toBe(run.id);
    expect(runs.latestForTask('task_missing')).toBeNull();
    expect(() => runs.update('run_missing', { status: 'done' })).toThrow(/nicht gefunden/);
    expect(() => runs.update(run.id, { status: 'nonsense' as never })).toThrow(/Ungültiger Laufstatus/);
    expect(() => runs.create({ taskId: 'task_missing', projectId, role: 'coder' })).toThrow(/nicht gefunden/);
  });

  it('redacts and bounds step data, emits run.step and pages steps', () => {
    const { runs, projectId, taskId } = setup();
    const run = runs.create({ taskId, projectId, role: 'coder' });
    const emitted: number[] = [];
    t!.core.bus.on('run.step', (st) => emitted.push(st.id));
    const secret = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';
    const step = runs.addStep(run.id, 'tool_call', `Führt aus: curl -H "Authorization: Bearer ${secret}"`, {
      args: { command: `OPENAI_API_KEY=${secret} npm test`, content: 'y'.repeat(50_000) },
      apiKey: 'plain-value-123',
    });
    expect(step.summary).not.toContain(secret);
    const json = JSON.stringify(step.data);
    expect(json).not.toContain(secret);
    expect(json).not.toContain('plain-value-123');
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(STEP_DATA_MAX_BYTES);
    expect(emitted).toEqual([step.id]);

    for (let i = 0; i < 5; i++) runs.addStep(run.id, 'status', `Schritt ${i}`);
    const all = runs.steps(run.id);
    expect(all).toHaveLength(6);
    expect(all[0].taskId).toBe(taskId);
    expect(runs.steps(run.id, undefined, 2).map((s) => s.summary)).toEqual(['Schritt 3', 'Schritt 4']);
    expect(runs.steps(run.id, all[2].id, 2).map((s) => s.summary)).toEqual(['Schritt 2', 'Schritt 3']);
    expect(() => runs.addStep('run_missing', 'status', 'x')).toThrow(/nicht gefunden/);
  });

  it('bounds pathological step data to valid JSON', () => {
    const bounded = boundStepData({ list: Array.from({ length: 5000 }, (_, i) => ({ i, text: 'z'.repeat(200) })) });
    expect(Buffer.byteLength(JSON.stringify(bounded))).toBeLessThanOrEqual(STEP_DATA_MAX_BYTES);
    expect(boundStepData(undefined)).toBeNull();
    expect(boundStepData({ n: 10n })).toEqual({ n: '10' });
  });

  it('cuts long strings before redaction without leaving partial secrets', () => {
    const secret = 'sk-proj-' + 'A'.repeat(40);
    // The cut would fall inside the secret: the whole token must disappear instead of a short unredactable prefix.
    const text = 'word '.repeat(799) + secret + ' tail';
    const cut = preTruncate(text, 4010);
    expect(cut).not.toContain('sk-proj');
    expect(cut.endsWith('… [gekürzt]')).toBe(true);
    expect(preTruncate('x'.repeat(10_000))).toBe('[langer Block ausgelassen] … [gekürzt]');
    expect(preTruncate(`a ${'b'.repeat(600)} c`)).toBe('a [langer Block ausgelassen] c');
    const pem = 'key: -----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nabc';
    expect(preTruncate(pem)).toBe('key: [privater Schlüssel ausgelassen]');
    const started = Date.now();
    boundStepData({ content: 'q'.repeat(2_000_000) });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('stores small states inline and large states in a run-state file', () => {
    const { runs, projectId, taskId } = setup({ inlineStateMaxBytes: 1000 });
    const run = runs.create({ taskId, projectId, role: 'coder' });
    expect(runs.loadState(run.id)).toBeNull();
    runs.saveState(run.id, { a: 1 });
    expect(runs.loadState(run.id)).toEqual({ a: 1 });
    const file = join(t!.core.paths.runState, `${run.id}.json`);
    expect(existsSync(file)).toBe(false);

    const big = { messages: ['m'.repeat(5000)] };
    runs.saveState(run.id, big);
    expect(existsSync(file)).toBe(true);
    expect(runs.loadState(run.id)).toEqual(big);
    const column = t!.core.db.get<{ state: string }>('SELECT state FROM agent_runs WHERE id = ?', [run.id])!.state;
    expect(column.length).toBeLessThan(200);

    runs.saveState(run.id, { small: true });
    expect(existsSync(file)).toBe(false);
    expect(runs.loadState(run.id)).toEqual({ small: true });

    // Corrupt inline state → null (no throw).
    t!.core.db.run('UPDATE agent_runs SET state = ? WHERE id = ?', ['{not json', run.id]);
    expect(runs.loadState(run.id)).toBeNull();
    expect(() => runs.saveState('run_missing', {})).toThrow(/nicht gefunden/);
  });

  it('marks running runs as interrupted at startup', () => {
    const { runs, projectId, taskId } = setup();
    const a = runs.create({ taskId, projectId, role: 'coder' });
    const b = runs.create({ taskId, projectId, role: 'tester' });
    runs.update(b.id, { status: 'paused' });
    const result = runs.markInterrupted();
    expect(result.map((r) => r.id)).toEqual([a.id]);
    expect(runs.get(a.id)!.status).toBe('interrupted');
    expect(runs.get(a.id)!.endedAt).toBeNull();
    expect(runs.get(b.id)!.status).toBe('paused');
    expect(runs.steps(a.id).some((s) => s.kind === 'status')).toBe(true);
  });

  it('prunes steps and state of finished or superseded runs, keeps resumable ones and orphan files', () => {
    const { runs, projectId, taskId } = setup({ inlineStateMaxBytes: 100 });
    const done = runs.create({ taskId, projectId, role: 'coder' });
    runs.addStep(done.id, 'status', 'a');
    runs.saveState(done.id, { big: 'x'.repeat(500) });
    runs.update(done.id, { status: 'done', endedAt: 1000 });

    const pausedOld = runs.create({ taskId, projectId, role: 'tester' });
    runs.addStep(pausedOld.id, 'status', 'b');
    runs.saveState(pausedOld.id, { keep: true });
    runs.update(pausedOld.id, { status: 'paused', updatedAt: 1000 });

    const blockedSuperseded = runs.create({ taskId, projectId, role: 'reviewer' });
    runs.addStep(blockedSuperseded.id, 'status', 'c');
    runs.update(blockedSuperseded.id, { status: 'blocked', updatedAt: 1000 });
    const newer = runs.create({ taskId, projectId, role: 'reviewer' });
    runs.addStep(newer.id, 'status', 'd');

    const orphan = join(t!.core.paths.runState, 'run_orphan.json');
    writeFileSync(orphan, '{}');

    const deleted = runs.prune(t!.core.clock.now() + 10_000);
    expect(deleted).toBe(2); // one step each of the done run and the superseded run
    expect(runs.steps(done.id)).toHaveLength(0);
    expect(runs.loadState(done.id)).toBeNull();
    expect(existsSync(join(t!.core.paths.runState, `${done.id}.json`))).toBe(false);
    expect(runs.steps(blockedSuperseded.id)).toHaveLength(0);
    expect(runs.steps(pausedOld.id)).toHaveLength(1);
    expect(runs.loadState(pausedOld.id)).toEqual({ keep: true });
    expect(runs.steps(newer.id)).toHaveLength(1); // still running
    expect(runs.get(done.id)).not.toBeNull(); // run rows are kept
    expect(existsSync(orphan)).toBe(false);
    expect(readdirSync(t!.core.paths.runState).filter((f) => f.endsWith('.json'))).toEqual([]);
  });

  it('caps steps per run', () => {
    const { runs, projectId, taskId } = setup();
    const run = runs.create({ taskId, projectId, role: 'coder' });
    t!.core.db.transaction(() => {
      for (let i = 0; i < MAX_STEPS_PER_RUN + 25; i++) {
        t!.core.db.run("INSERT INTO agent_steps(run_id, task_id, project_id, ts, kind, summary, data) VALUES (?, ?, ?, ?, 'status', ?, NULL)", [run.id, taskId, projectId, i, `s${i}`]);
      }
    });
    const deleted = runs.prune(0);
    expect(deleted).toBe(25);
    const remaining = t!.core.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM agent_steps WHERE run_id = ?', [run.id])!.n;
    expect(remaining).toBe(MAX_STEPS_PER_RUN);
    expect(runs.steps(run.id, undefined, 1)[0].summary).toBe(`s${MAX_STEPS_PER_RUN + 24}`);
  });
});
