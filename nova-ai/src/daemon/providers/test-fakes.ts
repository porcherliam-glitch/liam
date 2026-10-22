// TEST-ONLY helpers for the providers module tests: small hand-written fakes of the services this module uses
// (SecretStore, ApprovalService, ConcurrencyGovernor, ResourceMonitor, ProjectService, NotificationService).
// Not exported from index.ts and never imported by production code.
// The approval fake follows the contract semantics (fingerprint + taskId reuse, once/always, denial acknowledgement).
import { createHash } from 'node:crypto';
import type { Approval, ApprovalRule, Notification, Project, ResourceSnapshot } from '@shared/schemas';
import type { ApprovalCheck, ApprovalRequest, ApprovalService, ConcurrencyGovernor, NotificationService, ProjectService, ResourceMonitor, SecretStore } from '../contracts';

export function fakeSecrets(initial: Record<string, string> = {}): SecretStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    scheme: 'memory',
    secure: true,
    values,
    async loadAll() {},
    async set(id, value) {
      values.set(id, value);
    },
    async get(id) {
      return values.get(id) ?? null;
    },
    async delete(id) {
      values.delete(id);
    },
    has(id) {
      return values.has(id);
    },
  };
}

interface ApprovalRow extends Approval {
  consumed: boolean;
  acknowledged: boolean;
}

export type FakeApprovals = ApprovalService & {
  rows: ApprovalRow[];
  consumeCalls: string[];
  checkCalls: ApprovalRequest[];
};

export function fakeApprovals(): FakeApprovals {
  const rows: ApprovalRow[] = [];
  const ruleList: ApprovalRule[] = [];
  const listeners = new Set<(a: Approval) => void>();
  const consumeCalls: string[] = [];
  const checkCalls: ApprovalRequest[] = [];
  let seq = 0;
  const fingerprint = (kind: string, projectId: string | null, subject: string) => createHash('sha256').update(`${kind}|${projectId ?? ''}|${subject.trim()}`).digest('hex');
  const strip = (r: ApprovalRow): Approval => {
    const { consumed: _c, acknowledged: _a, ...rest } = r;
    return { ...rest };
  };
  const svc: FakeApprovals = {
    rows,
    consumeCalls,
    checkCalls,
    fingerprint,
    check(req): ApprovalCheck {
      checkCalls.push(req);
      const fp = fingerprint(req.kind, req.projectId, req.subject);
      const fpGlobal = fingerprint(req.kind, null, req.subject);
      if (ruleList.some((r) => r.fingerprint === fp || r.fingerprint === fpGlobal)) return { state: 'approved', approval: null, viaRule: true };
      const taskId = req.taskId ?? null;
      const same = rows.filter((r) => r.fingerprint === fp && r.taskId === taskId);
      const approved = same.find((r) => r.status === 'approved' && r.scope === 'once' && !r.consumed);
      if (approved) return { state: 'approved', approval: strip(approved), viaRule: false };
      const decided = same.filter((r) => r.status === 'approved' || r.status === 'denied').sort((a, b) => (b.decidedAt ?? 0) - (a.decidedAt ?? 0))[0];
      if (decided && decided.status === 'denied' && !decided.acknowledged) return { state: 'denied', approval: strip(decided) };
      const pending = same.find((r) => r.status === 'pending');
      if (pending) return { state: 'pending', approval: strip(pending) };
      const row: ApprovalRow = {
        id: `apr_${++seq}`,
        projectId: req.projectId,
        taskId,
        runId: req.runId ?? null,
        kind: req.kind,
        fingerprint: fp,
        title: req.title,
        action: req.action,
        consequences: req.consequences,
        details: req.details ?? {},
        status: 'pending',
        scope: null,
        createdAt: Date.now() + seq,
        decidedAt: null,
        consumed: false,
        acknowledged: false,
      };
      rows.push(row);
      return { state: 'pending', approval: strip(row) };
    },
    consume(id) {
      consumeCalls.push(id);
      const r = rows.find((x) => x.id === id);
      if (r) r.consumed = true;
    },
    acknowledgeDenial(id) {
      const r = rows.find((x) => x.id === id);
      if (r) r.acknowledged = true;
    },
    get(id) {
      const r = rows.find((x) => x.id === id);
      return r ? strip(r) : null;
    },
    list(filter = {}) {
      return rows
        .filter((r) => (!filter.status || r.status === filter.status) && (!filter.projectId || r.projectId === filter.projectId) && (!filter.taskId || r.taskId === filter.taskId))
        .map(strip);
    },
    decide(id, decision, scope) {
      const r = rows.find((x) => x.id === id);
      if (!r) throw new Error(`approval ${id} not found`);
      r.status = decision === 'approve' ? 'approved' : 'denied';
      r.scope = decision === 'approve' ? scope : null;
      r.decidedAt = Date.now() + ++seq;
      if (decision === 'approve' && scope === 'always') {
        ruleList.push({ id: `rule_${seq}`, projectId: r.projectId, kind: r.kind, fingerprint: r.fingerprint, description: r.title, createdAt: Date.now() });
      }
      const out = strip(r);
      for (const l of listeners) l(out);
      return out;
    },
    async waitFor(id) {
      return svc.get(id)!;
    },
    onDecision(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    rules() {
      return [...ruleList];
    },
    deleteRule(id) {
      const i = ruleList.findIndex((r) => r.id === id);
      if (i !== -1) ruleList.splice(i, 1);
    },
    pendingCount(projectId) {
      return rows.filter((r) => r.status === 'pending' && (!projectId || r.projectId === projectId)).length;
    },
    expireForTask(taskId) {
      for (const r of rows) if (r.taskId === taskId && r.status === 'pending') r.status = 'expired';
    },
    expireForProject(projectId) {
      for (const r of rows) if (r.projectId === projectId && r.status === 'pending') r.status = 'expired';
    },
    prune() {
      return 0;
    },
  };
  return svc;
}

export function fakeGovernor(overrides: Partial<ConcurrencyGovernor> = {}): ConcurrencyGovernor & { canWriteCalls: string[] } {
  const canWriteCalls: string[] = [];
  return {
    canWriteCalls,
    allowed: () => ({ allowed: 2, configured: 2, reason: null }),
    allowedFor: () => ({ ok: true, reason: null }),
    canStartProcess: () => ({ ok: true, reason: null }),
    canWrite: (p: string) => {
      canWriteCalls.push(p);
      return { ok: true, reason: null };
    },
    ...overrides,
  };
}

export function snapshotWithGpu(gpu: { totalBytes: number | null; usedBytes: number | null; estimated?: boolean } | null, loaded: ResourceSnapshot['ollamaLoaded'] = []): ResourceSnapshot {
  return {
    ts: Date.now(),
    cpu: { percent: 10, cores: 8, model: 'Test CPU' },
    memory: { totalBytes: 32 * 1024 ** 3, usedBytes: 8 * 1024 ** 3, freeBytes: 24 * 1024 ** 3 },
    disks: [],
    gpus: gpu
      ? [
          { name: 'Small GPU', vendor: 'intel', utilPercent: 0, vramTotalBytes: 1024 ** 3, vramUsedBytes: 0, source: 'test', estimated: false },
          { name: 'Test GPU', vendor: 'nvidia', utilPercent: 5, vramTotalBytes: gpu.totalBytes, vramUsedBytes: gpu.usedBytes, source: 'nvidia-smi', estimated: gpu.estimated ?? false },
        ]
      : [],
    gpuNote: gpu ? null : 'Keine GPU-Messwerte verfügbar (nvidia-smi nicht gefunden)',
    ollamaLoaded: loaded,
    daemon: { rssBytes: 100, cpuPercent: 1 },
    childProcesses: 0,
  };
}

export function fakeResources(snapshot: ResourceSnapshot | null): ResourceMonitor & { set(s: ResourceSnapshot | null): void } {
  let current = snapshot;
  return {
    set(s) {
      current = s;
    },
    start() {},
    stop() {},
    latest: () => current,
    history: () => (current ? [current] : []),
    sample: async () => current!,
    trackPath() {},
  };
}

export function fakeProjects(limits: Record<string, number | null> = {}): Pick<ProjectService, 'get'> & { limits: Record<string, number | null> } {
  return {
    limits,
    get(id: string) {
      if (!(id in limits)) return null;
      return { id, name: id, config: { monthlyBudgetUsd: limits[id] } } as unknown as Project;
    },
  };
}

export function fakeNotifications(): NotificationService & { sent: Omit<Notification, 'id' | 'ts' | 'readAt'>[] } {
  const sent: Omit<Notification, 'id' | 'ts' | 'readAt'>[] = [];
  return {
    sent,
    notify(input) {
      sent.push(input);
      return { ...input, id: `ntf_${sent.length}`, ts: Date.now(), readAt: null };
    },
    list: () => [],
    markRead() {},
    unreadCount: () => 0,
    prune: () => 0,
  };
}
