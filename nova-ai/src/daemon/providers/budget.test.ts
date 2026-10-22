// Tests for the BudgetService with a fake clock: reservations (incl. concurrency), recording, day/month boundaries,
// project limits, warnings, budget stop + resume approval, crash recovery of reservations, usage/breakdown queries.
import { afterEach, describe, expect, it } from 'vitest';
import type { UsageRecord } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { NovaError } from '../core/errors';
import { createBudgetService, META_RESERVATION_PREFIX, BUDGET_RESUME_SUBJECT } from './budget';
import { createProviderRegistry } from './registry';
import { fakeApprovals, fakeNotifications, fakeProjects, fakeSecrets } from './test-fakes';

let t: TestCore | null = null;
let fakeNow = 0;
afterEach(() => {
  t?.cleanup();
  t = null;
});

const PRICE = { inputPerMTokUsd: 1000, outputPerMTokUsd: 1000, estimated: false }; // $0.001 per token

function setup(opts: { daily?: number | null; monthly?: number | null; projects?: Record<string, number | null>; now?: number } = {}) {
  t = createTestCore();
  fakeNow = opts.now ?? new Date(2026, 9, 15, 12, 0, 0).getTime();
  t.core.clock = { now: () => fakeNow };
  const approvals = fakeApprovals();
  const notifications = fakeNotifications();
  const projects = fakeProjects(opts.projects ?? {});
  const s = makeServices(t.core, { approvals, notifications, projects: projects as never, secrets: fakeSecrets() });
  s.providers = createProviderRegistry(s);
  s.providers.ensureDefaults();
  t.core.settings.update({ budgets: { dailyLimitUsd: opts.daily === undefined ? 10 : opts.daily, monthlyLimitUsd: opts.monthly === undefined ? 100 : opts.monthly } });
  const budget = createBudgetService(s);
  s.budget = budget;
  const events: unknown[] = [];
  t.core.bus.on('budget.updated', (p) => events.push(p));
  return {
    s,
    core: t.core,
    budget,
    approvals,
    notifications,
    events,
    setNow: (ts: number) => {
      fakeNow = ts;
    },
  };
}

const paidUsage = (cost: number, extra: Partial<UsageRecord> = {}): Omit<UsageRecord, 'id'> => ({
  ts: fakeNow,
  providerId: 'cloud',
  modelId: 'm',
  projectId: null,
  taskId: null,
  runId: null,
  inputTokens: 100,
  outputTokens: 50,
  durationMs: 1000,
  costUsd: cost,
  costEstimated: false,
  paid: true,
  ...extra,
});

const reserveInput = (maxOut: number, projectId: string | null = null) => ({
  providerId: 'cloud',
  modelId: 'm',
  paid: true,
  projectId,
  estimatedInputTokens: 0,
  maxOutputTokens: maxOut,
  pricing: PRICE,
});

describe('budget service', () => {
  it('free calls get a no-op reservation; paid calls need pricing and a non-zero limit', () => {
    const { budget } = setup({ daily: 0 });
    expect(budget.reserve({ ...reserveInput(100), paid: false, pricing: null })).toEqual({ id: 'res_free', maxCostUsd: 0 });
    budget.release('res_free');
    expect(() => budget.reserve({ ...reserveInput(100), pricing: null })).toThrow(expect.objectContaining({ code: 'PRICE_UNKNOWN' }));
    const e = (() => {
      try {
        budget.reserve(reserveInput(1));
      } catch (x) {
        return x as NovaError;
      }
      return null;
    })();
    expect(e?.code).toBe('BUDGET_EXCEEDED');
    expect(e?.message).toMatch(/kein Budget/);
  });

  it('concurrent reservations never exceed the limit together', () => {
    const { budget } = setup({ daily: 0.01 });
    // each call may cost up to 8 output tokens × $0.001 = $0.008 → only one fits into $0.01
    const results = [1, 2, 3, 4].map(() => {
      try {
        return budget.reserve(reserveInput(8));
      } catch (e) {
        return e as NovaError;
      }
    });
    const ok = results.filter((r) => !(r instanceof NovaError)) as { id: string; maxCostUsd: number }[];
    expect(ok).toHaveLength(1);
    expect(ok[0].maxCostUsd).toBeCloseTo(0.008);
    expect(results.filter((r) => r instanceof NovaError && r.code === 'BUDGET_EXCEEDED')).toHaveLength(3);
    expect(budget.status().reservedUsd).toBeCloseTo(0.008);
    budget.release(ok[0].id);
    expect(budget.status().reservedUsd).toBe(0);
    expect(() => budget.reserve(reserveInput(8))).not.toThrow();
  });

  it('record settles the reservation, books spending and emits budget.updated', () => {
    const { budget, events, core } = setup();
    const r = budget.reserve(reserveInput(100));
    const rec = budget.record(paidUsage(0.05), r.id);
    expect(rec.id).toMatch(/^use_/);
    const st = budget.status();
    expect(st.reservedUsd).toBe(0);
    expect(st.spentTodayUsd).toBeCloseTo(0.05);
    expect(st.remainingTodayUsd).toBeCloseTo(9.95);
    expect(st.tokensToday).toEqual({ input: 100, output: 50 });
    expect(st.cloudRuntimeMsToday).toBe(1000);
    expect(events.length).toBeGreaterThan(0);
    expect(core.db.all("SELECT * FROM meta WHERE key LIKE 'budget_reservation:%'")).toHaveLength(0);
    // free local usage counts as local runtime, not as cost
    budget.record({ ...paidUsage(0), providerId: 'ollama-local', paid: false, durationMs: 500 });
    expect(budget.status().localRuntimeMsToday).toBe(500);
    expect(budget.status().spentTodayUsd).toBeCloseTo(0.05);
  });

  it('never books 0 for a paid call without numbers', () => {
    const { budget } = setup();
    const r = budget.reserve(reserveInput(100));
    const rec = budget.record({ ...paidUsage(0), inputTokens: 0, outputTokens: 0 }, r.id);
    expect(rec.costUsd).toBeCloseTo(0.1);
    expect(rec.costEstimated).toBe(true);
    expect(budget.status().containsEstimates).toBe(true);
  });

  it('day and month boundaries use local time', () => {
    const late = new Date(2026, 9, 31, 23, 30).getTime();
    const { budget, setNow } = setup({ now: late });
    budget.record(paidUsage(1, { ts: late }));
    expect(budget.status()).toMatchObject({ spentTodayUsd: 1, spentMonthUsd: 1 });
    setNow(new Date(2026, 10, 1, 0, 30).getTime());
    expect(budget.status()).toMatchObject({ spentTodayUsd: 0, spentMonthUsd: 0, remainingTodayUsd: 10 });
    setNow(new Date(2026, 9, 31, 23, 59).getTime());
    expect(budget.status().spentTodayUsd).toBe(1);
  });

  it('a project limit pauses only that project', () => {
    const { budget, approvals, notifications } = setup({ projects: { A: 1, B: 5 } });
    budget.record(paidUsage(1.2, { projectId: 'A' }));
    expect(budget.isPaidPaused('A')).toBe(true);
    expect(budget.isPaidPaused('B')).toBe(false);
    expect(budget.isPaidPaused()).toBe(false);
    expect(() => budget.reserve(reserveInput(10, 'A'))).toThrow(/pausiert/);
    expect(() => budget.reserve(reserveInput(10, 'B'))).not.toThrow();
    const st = budget.status();
    expect(st.paidPaused).toBe(false);
    expect(st.perProject.find((p) => p.projectId === 'A')).toMatchObject({ paidPaused: true, limitUsd: 1, remainingUsd: 0 });
    const pending = approvals.rows.filter((a) => a.status === 'pending');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ kind: 'paid_model', projectId: 'A', fingerprint: approvals.fingerprint('paid_model', 'A', BUDGET_RESUME_SUBJECT) });
    expect(notifications.sent.find((n) => n.category === 'blocker')?.projectId).toBe('A');
  });

  it('a project limit refuses a call that does not fit without pausing', () => {
    const { budget } = setup({ projects: { A: 0.05 } });
    expect(() => budget.reserve(reserveInput(100, 'A'))).toThrow(/Projektbudget reicht/);
    expect(budget.isPaidPaused('A')).toBe(false);
  });

  it('warns once per day at warnAtRatio', () => {
    const { budget, notifications, setNow } = setup({ daily: 10, monthly: null });
    budget.record(paidUsage(8.5));
    budget.record(paidUsage(0.1));
    const warns = () => notifications.sent.filter((n) => n.title === 'Budget fast aufgebraucht');
    expect(warns()).toHaveLength(1);
    expect(warns()[0].body).toContain('85 %');
    setNow(new Date(2026, 9, 16, 9, 0).getTime());
    budget.record(paidUsage(8.1, { ts: new Date(2026, 9, 16, 9, 0).getTime() }));
    expect(warns()).toHaveLength(2);
  });

  it('budget stop pauses paid work, reports, notifies and asks for approval; approving resumes', () => {
    const { budget, approvals, notifications, core, events } = setup({ daily: 1, monthly: null });
    budget.reserve(reserveInput(100));
    budget.record(paidUsage(1.05));
    expect(budget.isPaidPaused()).toBe(true);
    expect(budget.status()).toMatchObject({ paidPaused: true, spentTodayUsd: 1.05 });
    expect(budget.status().pausedReason).toMatch(/Tagesbudget ist erreicht/);
    expect(notifications.sent.filter((n) => n.category === 'blocker')).toHaveLength(1);
    const errors = core.errors.list();
    expect(errors.find((e) => e.code === 'BUDGET_EXCEEDED')).toBeTruthy();
    const pending = approvals.rows.filter((a) => a.status === 'pending' && a.kind === 'paid_model');
    expect(pending).toHaveLength(1);
    expect(pending[0].fingerprint).toBe(approvals.fingerprint('paid_model', null, 'budget:resume'));
    expect(() => budget.reserve(reserveInput(1))).toThrow(/pausiert/);
    // a second recorded call does not create more approvals or notifications
    budget.record(paidUsage(0.01));
    expect(approvals.rows.filter((a) => a.kind === 'paid_model')).toHaveLength(1);
    expect(notifications.sent.filter((n) => n.category === 'blocker')).toHaveLength(1);

    const count = events.length;
    approvals.decide(pending[0].id, 'approve', 'once');
    expect(budget.isPaidPaused()).toBe(false);
    expect(approvals.consumeCalls).toContain(pending[0].id);
    expect(core.errors.list().find((e) => e.code === 'BUDGET_EXCEEDED')).toBeUndefined();
    expect(events.length).toBeGreaterThan(count);
    // still over the daily limit: refused, but no new pause/approval spam
    expect(() => budget.reserve(reserveInput(1))).toThrow(/Tagesbudget reicht/);
    expect(budget.isPaidPaused()).toBe(false);
  });

  it('a denied resume is acknowledged; the next stop asks again', () => {
    const { budget, approvals, setNow } = setup({ daily: 1, monthly: null });
    budget.record(paidUsage(1));
    const first = approvals.rows.find((a) => a.status === 'pending')!;
    approvals.decide(first.id, 'deny', 'once');
    expect(budget.isPaidPaused()).toBe(true);
    expect(approvals.rows.find((a) => a.id === first.id)!.acknowledged).toBe(true);
    budget.resumePaid();
    setNow(new Date(2026, 9, 16, 12, 0).getTime());
    budget.record(paidUsage(1, { ts: new Date(2026, 9, 16, 12, 0).getTime() }));
    expect(budget.isPaidPaused()).toBe(true);
    expect(approvals.rows.filter((a) => a.status === 'pending')).toHaveLength(1);
  });

  it('manual resumePaid answers the open resume approval', () => {
    const { budget, approvals } = setup({ daily: 1 });
    budget.record(paidUsage(2));
    const pending = approvals.rows.find((a) => a.status === 'pending')!;
    const st = budget.resumePaid();
    expect(st.paidPaused).toBe(false);
    expect(approvals.rows.find((a) => a.id === pending.id)!.status).toBe('approved');
    expect(approvals.consumeCalls).toContain(pending.id);
  });

  it('books reservations left by a crashed daemon as estimated usage', () => {
    const { core, budget } = setup();
    core.db.run('INSERT INTO meta(key, value) VALUES (?, ?)', [
      `${META_RESERVATION_PREFIX}res_old`,
      JSON.stringify({ id: 'res_old', providerId: 'cloud', modelId: 'm', projectId: null, maxCostUsd: 0.25, estimatedInputTokens: 10, maxOutputTokens: 200, createdAt: core.clock.now(), instanceId: 'inst_dead' }),
    ]);
    const st = budget.status();
    expect(st.spentTodayUsd).toBeCloseTo(0.25);
    expect(st.containsEstimates).toBe(true);
    expect(core.db.all("SELECT * FROM meta WHERE key LIKE 'budget_reservation:%'")).toHaveLength(0);
    expect(budget.usage()[0]).toMatchObject({ costEstimated: true, outputTokens: 200 });
  });

  it('usage filters and breakdown groups via SQL', () => {
    const { budget } = setup({ daily: null, monthly: null });
    const d1 = new Date(2026, 9, 14, 10).getTime();
    const d2 = new Date(2026, 9, 15, 10).getTime();
    budget.record(paidUsage(1, { ts: d1, projectId: 'A', providerId: 'p1', modelId: 'x' }));
    budget.record(paidUsage(2, { ts: d2, projectId: 'B', providerId: 'p1', modelId: 'y', costEstimated: true }));
    budget.record(paidUsage(0, { ts: d2, projectId: null, providerId: 'ollama-local', modelId: 'q', paid: false }));
    expect(budget.usage({ projectId: 'A' })).toHaveLength(1);
    expect(budget.usage({ from: d2 })).toHaveLength(2);
    expect(budget.usage({ limit: 1 })).toHaveLength(1);
    const byProvider = budget.breakdown({ groupBy: 'provider' });
    expect(byProvider[0]).toMatchObject({ key: 'p1', calls: 2, costUsd: 3, costEstimated: true, inputTokens: 200 });
    expect(byProvider[1]).toMatchObject({ key: 'ollama-local', calls: 1, costUsd: 0 });
    expect(budget.breakdown({ groupBy: 'model' }).map((r) => r.key)).toEqual(['p1/y', 'p1/x', 'ollama-local/q']);
    expect(budget.breakdown({ groupBy: 'project' }).map((r) => r.key)).toEqual(['B', 'A', '-']);
    expect(budget.breakdown({ groupBy: 'day' }).map((r) => [r.key, r.calls])).toEqual([
      ['2026-10-14', 1],
      ['2026-10-15', 2],
    ]);
    expect(budget.breakdown({ groupBy: 'day', from: d2 })).toHaveLength(1);
  });

  it('setLimits updates settings and validates', () => {
    const { budget, core } = setup();
    const st = budget.setLimits({ dailyLimitUsd: 3, monthlyLimitUsd: null });
    expect(st).toMatchObject({ dailyLimitUsd: 3, monthlyLimitUsd: null, remainingMonthUsd: null });
    expect(core.settings.section('budgets')).toMatchObject({ dailyLimitUsd: 3, monthlyLimitUsd: null });
    expect(() => budget.setLimits({ dailyLimitUsd: -1 })).toThrow(/≥ 0/);
    budget.pausePaid('Test');
    expect(budget.status()).toMatchObject({ paidPaused: true, pausedReason: 'Test' });
  });
});
