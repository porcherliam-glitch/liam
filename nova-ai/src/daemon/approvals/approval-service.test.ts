import { afterEach, describe, expect, it } from 'vitest';
import type { Approval, Notification } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { ApprovalRequest, NotificationService } from '../contracts';
import { NovaError } from '../core/errors';
import { createApprovalService, type ApprovalServiceOptions } from './approval-service';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

function fakeNotifications() {
  const sent: Array<Omit<Notification, 'id' | 'ts' | 'readAt'>> = [];
  const svc: NotificationService = {
    notify(input) {
      sent.push(input);
      return { ...input, id: `ntf_${sent.length}`, ts: Date.now(), readAt: null };
    },
    list: () => [],
    markRead: () => undefined,
    unreadCount: () => 0,
    prune: () => 0,
  };
  return { svc, sent };
}

function setup(opts: ApprovalServiceOptions = {}) {
  t = createTestCore();
  const notifications = fakeNotifications();
  const s = makeServices(t.core, { notifications: notifications.svc });
  const approvals = createApprovalService(s, opts);
  const events: Approval[] = [];
  t.core.bus.on('approval.updated', (a) => events.push(a));
  return { core: t.core, approvals, events, sent: notifications.sent };
}

const req = (patch: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  projectId: 'prj_1',
  taskId: 'task_1',
  runId: 'run_1',
  kind: 'command',
  title: 'Befehl ausführen?',
  action: 'NOVA möchte ausführen: npm run deploy',
  consequences: 'Der Befehl läuft mit Ihren Rechten.',
  subject: 'npm run deploy',
  ...patch,
});

describe('ApprovalService', () => {
  it('fingerprints normalize whitespace and include kind and project', () => {
    const { approvals } = setup({ platform: 'linux' });
    const a = approvals.fingerprint('command', 'prj_1', 'npm   run  deploy');
    expect(a).toBe(approvals.fingerprint('command', 'prj_1', ' npm run deploy '));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(approvals.fingerprint('command', 'prj_2', 'npm run deploy'));
    expect(a).not.toBe(approvals.fingerprint('publish', 'prj_1', 'npm run deploy'));
    expect(approvals.fingerprint('command', null, 'NPM run deploy')).not.toBe(approvals.fingerprint('command', null, 'npm run deploy'));
    const win = setup({ platform: 'win32' }).approvals;
    expect(win.fingerprint('command', null, 'NPM run Deploy')).toBe(win.fingerprint('command', null, 'npm run Deploy'));
    expect(win.fingerprint('command', null, 'npm run Deploy')).not.toBe(win.fingerprint('command', null, 'npm run deploy'));
  });

  it('creates a pending approval with event + generic notification and reuses it only for the same task', () => {
    const { approvals, events, sent } = setup();
    const first = approvals.check(req());
    expect(first.state).toBe('pending');
    expect(events).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ category: 'approval', title: 'Freigabe erforderlich: Befehl ausführen', projectId: 'prj_1', taskId: 'task_1' });
    expect(sent[0].body).not.toContain('npm');
    const again = approvals.check(req({ subject: 'npm  run deploy' }));
    expect(again.state === 'pending' && again.approval.id).toBe(first.state === 'pending' && first.approval.id);
    expect(events).toHaveLength(1);
    const otherTask = approvals.check(req({ taskId: 'task_2' }));
    expect(otherTask.state).toBe('pending');
    expect(otherTask.state === 'pending' && otherTask.approval.id).not.toBe(first.state === 'pending' && first.approval.id);
    const noTask = approvals.check(req({ taskId: null }));
    const noTaskAgain = approvals.check(req({ taskId: undefined }));
    expect(noTask.state === 'pending' && noTaskAgain.state === 'pending' && noTask.approval.id === noTaskAgain.approval.id).toBe(true);
    expect(approvals.pendingCount()).toBe(3);
    expect(approvals.pendingCount('prj_1')).toBe(3);
    expect(approvals.pendingCount('prj_x')).toBe(0);
  });

  it('redacts stored texts but fingerprints the raw subject', () => {
    const { approvals } = setup();
    const key = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz';
    const r = approvals.check(req({ action: `curl -H "x-api-key: ${key}" https://x`, subject: `curl -H "x-api-key: ${key}" https://x`, details: { header: `Bearer ${key}`, apiKey: key } }));
    expect(r.state).toBe('pending');
    if (r.state !== 'pending') return;
    expect(r.approval.action).not.toContain(key);
    expect(JSON.stringify(r.approval.details)).not.toContain(key);
    expect(r.approval.fingerprint).toBe(approvals.fingerprint('command', 'prj_1', `curl -H "x-api-key: ${key}" https://x`));
    const other = approvals.check(req({ action: 'x', subject: 'curl -H "x-api-key: sk-ant-api03-zzzzzzzzzzzzzzzzzzzzzzzzzz" https://x' }));
    expect(other.state === 'pending' && other.approval.id).not.toBe(r.approval.id);
  });

  it('once: approved until consumed, consume is atomic, then a new approval is needed', () => {
    const { approvals } = setup();
    const p = approvals.check(req());
    if (p.state !== 'pending') throw new Error('expected pending');
    const decided = approvals.decide(p.approval.id, 'approve', 'once');
    expect(decided).toMatchObject({ status: 'approved', scope: 'once' });
    expect(decided.decidedAt).not.toBeNull();
    const ok = approvals.check(req());
    expect(ok).toMatchObject({ state: 'approved', viaRule: false });
    expect(ok.state === 'approved' && ok.approval?.id).toBe(p.approval.id);
    expect(approvals.check(req({ taskId: 'task_2' })).state).toBe('pending'); // other task: not covered
    approvals.consume(p.approval.id);
    expect(() => approvals.consume(p.approval.id)).toThrow(/bereits verwendet/);
    const next = approvals.check(req());
    expect(next.state).toBe('pending');
    expect(next.state === 'pending' && next.approval.id).not.toBe(p.approval.id);
  });

  it('deny: denied until acknowledged, then asks again; deny ignores scope', () => {
    const { approvals } = setup();
    const p = approvals.check(req());
    if (p.state !== 'pending') throw new Error('expected pending');
    const d = approvals.decide(p.approval.id, 'deny', 'always');
    expect(d).toMatchObject({ status: 'denied', scope: null });
    expect(approvals.rules()).toHaveLength(0);
    expect(approvals.check(req())).toMatchObject({ state: 'denied' });
    approvals.acknowledgeDenial(p.approval.id);
    approvals.acknowledgeDenial(p.approval.id); // idempotent
    expect(approvals.check(req()).state).toBe('pending');
    expect(() => approvals.consume(p.approval.id)).toThrow(NovaError);
  });

  it('always: creates a project rule, covers other tasks and approves other pending approvals of the rule', () => {
    const { approvals, events } = setup();
    const a = approvals.check(req({ taskId: 'task_1' }));
    const b = approvals.check(req({ taskId: 'task_2' }));
    if (a.state !== 'pending' || b.state !== 'pending') throw new Error('expected pending');
    const decided: Approval[] = [];
    approvals.onDecision((x) => decided.push(x));
    approvals.decide(a.approval.id, 'approve', 'always');
    expect(approvals.rules()).toHaveLength(1);
    expect(approvals.rules()[0]).toMatchObject({ projectId: 'prj_1', kind: 'command', fingerprint: a.approval.fingerprint });
    expect(approvals.get(b.approval.id)).toMatchObject({ status: 'approved', scope: 'always' });
    expect(decided.map((x) => x.id).sort()).toEqual([a.approval.id, b.approval.id].sort());
    expect(events.filter((e) => e.status === 'approved')).toHaveLength(2);
    expect(approvals.check(req({ taskId: 'task_9' }))).toEqual({ state: 'approved', approval: null, viaRule: true });
    expect(approvals.check(req({ projectId: 'prj_2' })).state).toBe('pending');
    // Deleting the rule asks again.
    approvals.deleteRule(approvals.rules()[0].id);
    expect(approvals.check(req({ taskId: 'task_9' })).state).toBe('pending');
    expect(() => approvals.deleteRule('rule_missing')).toThrow(/nicht gefunden/);
  });

  it('a global rule (approval without project) covers every project', () => {
    const { approvals } = setup();
    const p = approvals.check(req({ projectId: null, taskId: null, kind: 'install', subject: 'winget install --id Git.Git -e' }));
    if (p.state !== 'pending') throw new Error('expected pending');
    approvals.decide(p.approval.id, 'approve', 'always');
    expect(approvals.rules()[0].projectId).toBeNull();
    expect(approvals.check(req({ projectId: 'prj_7', kind: 'install', subject: 'winget install --id Git.Git -e' }))).toMatchObject({ state: 'approved', viaRule: true });
  });

  it("rejects 'always' for once-only kinds", () => {
    const { approvals } = setup();
    for (const kind of ['admin', 'system_change', 'security_config', 'publish', 'paid_model', 'delete'] as const) {
      const p = approvals.check(req({ kind, subject: `subject-${kind}` }));
      if (p.state !== 'pending') throw new Error('expected pending');
      expect(() => approvals.decide(p.approval.id, 'approve', 'always')).toThrow(/Immer erlauben/);
      expect(approvals.get(p.approval.id)?.status).toBe('pending');
      expect(approvals.decide(p.approval.id, 'approve', 'once').status).toBe('approved');
    }
    expect(approvals.rules()).toHaveLength(0);
  });

  it('decide is idempotent for the same decision and CONFLICT otherwise; unknown ids are NOT_FOUND', () => {
    const { approvals } = setup();
    const p = approvals.check(req());
    if (p.state !== 'pending') throw new Error('expected pending');
    approvals.decide(p.approval.id, 'approve', 'once');
    expect(approvals.decide(p.approval.id, 'approve', 'once').status).toBe('approved');
    expect(() => approvals.decide(p.approval.id, 'deny', 'once')).toThrow(/bereits erlaubt/);
    expect(() => approvals.decide('apr_missing', 'approve', 'once')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('waitFor resolves on decision, immediately when decided, and rejects on abort', async () => {
    const { approvals } = setup();
    const p = approvals.check(req());
    if (p.state !== 'pending') throw new Error('expected pending');
    const waiting = approvals.waitFor(p.approval.id);
    expect(approvals.waiterCount()).toBe(1);
    approvals.decide(p.approval.id, 'approve', 'once');
    await expect(waiting).resolves.toMatchObject({ id: p.approval.id, status: 'approved' });
    expect(approvals.waiterCount()).toBe(0);
    await expect(approvals.waitFor(p.approval.id)).resolves.toMatchObject({ status: 'approved' });

    const q = approvals.check(req({ subject: 'other' }));
    if (q.state !== 'pending') throw new Error('expected pending');
    const ac = new AbortController();
    const aborted = approvals.waitFor(q.approval.id, ac.signal);
    ac.abort(new NovaError('CANCELLED', 'weg'));
    await expect(aborted).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(approvals.waiterCount()).toBe(0);
    await expect(approvals.waitFor('apr_missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('onDecision unsubscribe works and listener errors do not break decide', () => {
    const { approvals } = setup();
    const seen: string[] = [];
    approvals.onDecision(() => {
      throw new Error('listener bug');
    });
    const off = approvals.onDecision((a) => seen.push(a.id));
    const p = approvals.check(req());
    if (p.state !== 'pending') throw new Error('expected pending');
    approvals.decide(p.approval.id, 'deny', 'once');
    off();
    const q = approvals.check(req({ subject: 'x' }));
    if (q.state !== 'pending') throw new Error('expected pending');
    approvals.decide(q.approval.id, 'approve', 'once');
    expect(seen).toEqual([p.approval.id]);
  });

  it('expireForTask / expireForProject expire pending approvals and wake waiters (no onDecision)', async () => {
    const { approvals, events } = setup();
    const a = approvals.check(req({ taskId: 'task_1' }));
    const b = approvals.check(req({ taskId: 'task_2', subject: 'b' }));
    const c = approvals.check(req({ projectId: 'prj_2', taskId: 'task_3', subject: 'c' }));
    if (a.state !== 'pending' || b.state !== 'pending' || c.state !== 'pending') throw new Error('expected pending');
    const decided: string[] = [];
    approvals.onDecision((x) => decided.push(x.id));
    const w = approvals.waitFor(a.approval.id);
    approvals.expireForTask('task_1');
    await expect(w).resolves.toMatchObject({ status: 'expired' });
    expect(approvals.get(b.approval.id)?.status).toBe('pending');
    approvals.expireForProject('prj_1');
    expect(approvals.get(b.approval.id)?.status).toBe('expired');
    expect(approvals.get(c.approval.id)?.status).toBe('pending');
    expect(decided).toEqual([]);
    expect(events.filter((e) => e.status === 'expired')).toHaveLength(2);
    expect(() => approvals.decide(a.approval.id, 'approve', 'once')).toThrow(/abgelaufen/);
  });

  it('list filters and sorts pending first', () => {
    const { approvals } = setup();
    const a = approvals.check(req({ subject: 'a' }));
    const b = approvals.check(req({ subject: 'b', projectId: 'prj_2', taskId: 'task_2' }));
    if (a.state !== 'pending' || b.state !== 'pending') throw new Error('expected pending');
    approvals.decide(a.approval.id, 'approve', 'once');
    expect(approvals.list().map((x) => x.id)).toEqual([b.approval.id, a.approval.id]);
    expect(approvals.list({ status: 'approved' }).map((x) => x.id)).toEqual([a.approval.id]);
    expect(approvals.list({ projectId: 'prj_2' }).map((x) => x.id)).toEqual([b.approval.id]);
    expect(approvals.list({ taskId: 'task_1' }).map((x) => x.id)).toEqual([a.approval.id]);
  });

  it('prune deletes old decided approvals but keeps pending ones and the origin of rules', () => {
    const { approvals, core } = setup();
    const old = approvals.check(req({ subject: 'old' }));
    const ruleOrigin = approvals.check(req({ subject: 'rule' }));
    const pending = approvals.check(req({ subject: 'pending' }));
    if (old.state !== 'pending' || ruleOrigin.state !== 'pending' || pending.state !== 'pending') throw new Error('expected pending');
    approvals.decide(old.approval.id, 'deny', 'once');
    approvals.decide(ruleOrigin.approval.id, 'approve', 'always');
    core.db.run('UPDATE approvals SET created_at = 1, decided_at = CASE WHEN decided_at IS NULL THEN NULL ELSE 2 END');
    expect(approvals.prune(1000)).toBe(1);
    expect(approvals.get(old.approval.id)).toBeNull();
    expect(approvals.get(ruleOrigin.approval.id)).not.toBeNull();
    expect(approvals.get(pending.approval.id)).not.toBeNull();
  });

  it('validates kind and subject', () => {
    const { approvals } = setup();
    expect(() => approvals.check(req({ subject: '   ' }))).toThrow(/Beschreibung der Aktion/);
    expect(() => approvals.check(req({ kind: 'bogus' as never }))).toThrow();
  });
  it('peek never creates or changes anything and mirrors check()', () => {
    const { approvals, events, sent, core } = setup();
    expect(approvals.peek(req())).toBeNull();
    expect(approvals.list()).toHaveLength(0);
    expect(events).toHaveLength(0);
    expect(sent).toHaveLength(0);

    const p = approvals.check(req());
    if (p.state !== 'pending') throw new Error('expected pending');
    expect(approvals.peek(req())).toMatchObject({ state: 'pending', approval: { id: p.approval.id } });
    expect(approvals.peek(req({ taskId: 'task_2' }))).toBeNull(); // reuse requires the same task
    expect(approvals.list()).toHaveLength(1);

    approvals.decide(p.approval.id, 'approve', 'once');
    expect(approvals.peek(req())).toMatchObject({ state: 'approved', viaRule: false, approval: { id: p.approval.id } });
    approvals.peek(req());
    approvals.consume(p.approval.id); // peek did not consume it
    expect(approvals.peek(req())).toBeNull();

    const d = approvals.check(req({ subject: 'npm run nuke' }));
    if (d.state !== 'pending') throw new Error('expected pending');
    approvals.decide(d.approval.id, 'deny', 'once');
    expect(approvals.peek(req({ subject: 'npm run nuke' }))).toMatchObject({ state: 'denied' });
    expect(core.db.get<{ acknowledged_at: number | null }>('SELECT acknowledged_at FROM approvals WHERE id = ?', [d.approval.id])?.acknowledged_at).toBeNull();

    const r = approvals.check(req({ kind: 'network', subject: 'Example.COM', taskId: 'task_9' }));
    if (r.state !== 'pending') throw new Error('expected pending');
    approvals.decide(r.approval.id, 'approve', 'always');
    expect(approvals.peek(req({ kind: 'network', subject: 'example.com', taskId: null }))).toEqual({ state: 'approved', approval: null, viaRule: true });
    expect(() => approvals.peek(req({ subject: '' }))).toThrow(/Beschreibung der Aktion/);
    expect(() => approvals.peek(req({ kind: 'bogus' as never }))).toThrow(/Unbekannte Art/);
  });
});
