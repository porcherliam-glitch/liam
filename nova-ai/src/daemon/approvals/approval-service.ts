// ApprovalService (contract: src/daemon/contracts.ts; SPEC §4.9, §6.0.4, §6.9): explicit user decisions before
// critical actions (tables `approvals`, `approval_rules`).
// Key decisions:
// - fingerprint = sha256(kind | projectId | normalizeSubject(kind, subject)) over the RAW subject (core/subject.ts is
//   the one normalization). Stored title/action/consequences/details are redacted; the fingerprint never is.
// - check() order: (1) an 'always' rule of the project or a global rule → approved (viaRule, approval null);
//   (2) an approved, unconsumed 'once' approval with the same fingerprint AND the same taskId (null-safe) → approved;
//   (3) the latest decided approval for fingerprint+taskId was denied and not acknowledged → denied;
//   (4) a pending approval for fingerprint+taskId is reused, otherwise a new one is created ('approval.updated' event +
//   notification category 'approval' with a generic German body – never the command, path or content).
// - peek() runs the same lookup (1)–(4 without creating) read-only and returns null when nothing exists yet.
// - consume() is a single conditional UPDATE (atomic): a 'once' approval can never run twice, also not after a crash.
// - decide(): deny ignores the scope; 'always' is rejected (VALIDATION) for APPROVAL_KINDS_ONCE_ONLY and creates a
//   rule scoped to the approval's project (global when the approval has no project). Other pending approvals that the
//   new rule covers are approved too, so every waiting task resumes. Deciding an already decided approval the same way
//   is idempotent; contradicting decisions are CONFLICT.
// - Listeners (onDecision) and waiters (waitFor) run after the DB commit; listener errors never break decide().
//   Expiry resolves waiters with the expired approval but does not call onDecision listeners.
// - list() without a status filter is capped at the newest 1000 rows (history is pruned by prune()).
import { createHash } from 'node:crypto';
import { APPROVAL_KINDS_ONCE_ONLY, ApprovalKind as ApprovalKindSchema, type Approval, type ApprovalKind, type ApprovalRule, type ApprovalScope, type ApprovalStatus } from '@shared/schemas';
import type { ApprovalCheck, ApprovalRequest, ApprovalService, Services } from '../contracts';
import { NovaError, errorMessage, notFound } from '../core/errors';
import { newId } from '../core/ids';
import { redact, redactString } from '../core/redact';
import { normalizeSubject } from '../core/subject';
import { fromJson, toJson } from '../db/database';

export interface ApprovalServiceOptions {
  /** Platform used for subject normalization (defaults to core.platform). */
  platform?: NodeJS.Platform;
}

interface ApprovalRow {
  id: string;
  project_id: string | null;
  task_id: string | null;
  run_id: string | null;
  kind: string;
  fingerprint: string;
  title: string;
  action: string;
  consequences: string;
  details: string;
  status: string;
  scope: string | null;
  created_at: number;
  decided_at: number | null;
  consumed_at: number | null;
  acknowledged_at: number | null;
}

interface RuleRow {
  id: string;
  project_id: string | null;
  kind: string;
  fingerprint: string;
  description: string;
  created_at: number;
}

/** German labels per kind (notification titles, rule descriptions). */
export const APPROVAL_KIND_LABELS: Record<ApprovalKind, string> = {
  command: 'Befehl ausführen',
  admin: 'Administratorrechte',
  delete: 'Löschen',
  outside_project: 'Änderung außerhalb des Projekts',
  system_change: 'Systemänderung',
  security_config: 'Sicherheitseinstellung',
  publish: 'Veröffentlichen oder Übertragen',
  sensitive_data: 'Projektdaten an Cloud-Anbieter',
  paid_model: 'Kostenpflichtige Modelle',
  install: 'Installation',
  network: 'Netzwerkzugriff',
};

const MAX_TITLE = 300;
const MAX_ACTION = 20_000;
const MAX_CONSEQUENCES = 5_000;
const HISTORY_LIMIT = 1000;

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function toApproval(r: ApprovalRow): Approval {
  return {
    id: r.id,
    projectId: r.project_id,
    taskId: r.task_id,
    runId: r.run_id,
    kind: r.kind as ApprovalKind,
    fingerprint: r.fingerprint,
    title: r.title,
    action: r.action,
    consequences: r.consequences,
    details: fromJson<Record<string, unknown>>(r.details, {}),
    status: r.status as ApprovalStatus,
    scope: (r.scope as ApprovalScope | null) ?? null,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
  };
}

function toRule(r: RuleRow): ApprovalRule {
  return { id: r.id, projectId: r.project_id, kind: r.kind as ApprovalKind, fingerprint: r.fingerprint, description: r.description, createdAt: r.created_at };
}

export interface ApprovalServiceImpl extends ApprovalService {
  /** Number of active waitFor() calls (tests/diagnostics). */
  waiterCount(): number;
}

export function createApprovalService(s: Services, opts: ApprovalServiceOptions = {}): ApprovalServiceImpl {
  const core = s.core;
  const db = core.db;
  const log = core.log.child('approvals');
  const platform = opts.platform ?? core.platform;
  const listeners = new Set<(approval: Approval) => void>();
  const waiters = new Map<string, Set<(approval: Approval) => void>>();

  const fingerprint = (kind: ApprovalKind, projectId: string | null, subject: string): string =>
    createHash('sha256').update(`${kind}|${projectId ?? ''}|${normalizeSubject(kind, subject, platform)}`, 'utf8').digest('hex');

  const getRow = (id: string): ApprovalRow | undefined => db.get<ApprovalRow>('SELECT * FROM approvals WHERE id = ?', [id]);

  const requireRow = (id: string): ApprovalRow => {
    const r = getRow(id);
    if (!r) throw notFound('Die Freigabe', id);
    return r;
  };

  const emitUpdated = (a: Approval): void => {
    core.bus.emit('approval.updated', a);
  };

  const resolveWaiters = (a: Approval): void => {
    const set = waiters.get(a.id);
    if (!set) return;
    waiters.delete(a.id);
    for (const w of set) {
      try {
        w(a);
      } catch {
        /* waiter errors are the caller's business */
      }
    }
  };

  const notifyListeners = (a: Approval): void => {
    for (const l of [...listeners]) {
      try {
        l(a);
      } catch (e) {
        log.warn('Fehler in einem Freigabe-Listener', { approvalId: a.id, error: errorMessage(e) });
      }
    }
  };

  const announceDecision = (a: Approval): void => {
    emitUpdated(a);
    resolveWaiters(a);
    notifyListeners(a);
  };

  const notifyPending = (a: Approval): void => {
    try {
      s.notifications.notify({
        level: 'warning',
        category: 'approval',
        title: `Freigabe erforderlich: ${APPROVAL_KIND_LABELS[a.kind]}`,
        body: 'Eine Aktion wartet auf eine Entscheidung. Details und Entscheidung unter „Freigaben“.',
        projectId: a.projectId,
        taskId: a.taskId,
      });
    } catch (e) {
      log.warn('Benachrichtigung zur Freigabe fehlgeschlagen', { approvalId: a.id, error: errorMessage(e) });
    }
  };

  const matchingRule = (kind: ApprovalKind, projectId: string | null, subject: string): RuleRow | undefined => {
    if (projectId !== null) {
      const own = db.get<RuleRow>('SELECT * FROM approval_rules WHERE kind = ? AND project_id = ? AND fingerprint = ?', [kind, projectId, fingerprint(kind, projectId, subject)]);
      if (own) return own;
    }
    return db.get<RuleRow>('SELECT * FROM approval_rules WHERE kind = ? AND project_id IS NULL AND fingerprint = ?', [kind, fingerprint(kind, null, subject)]);
  };

  /** Approves other pending approvals covered by a new rule (same kind + fingerprint, same project for project rules). */
  const applyRuleToPending = (rule: RuleRow, exceptId: string, now: number): Approval[] => {
    const rows =
      rule.project_id === null
        ? db.all<ApprovalRow>("SELECT * FROM approvals WHERE status = 'pending' AND kind = ? AND fingerprint = ? AND id != ?", [rule.kind, rule.fingerprint, exceptId])
        : db.all<ApprovalRow>("SELECT * FROM approvals WHERE status = 'pending' AND kind = ? AND fingerprint = ? AND project_id = ? AND id != ?", [
            rule.kind,
            rule.fingerprint,
            rule.project_id,
            exceptId,
          ]);
    const out: Approval[] = [];
    for (const r of rows) {
      const changed = db.run("UPDATE approvals SET status = 'approved', scope = 'always', decided_at = ? WHERE id = ? AND status = 'pending'", [now, r.id]).changes;
      if (changed > 0) out.push(toApproval(getRow(r.id)!));
    }
    return out;
  };

  const expireWhere = (column: 'task_id' | 'project_id', value: string): void => {
    const now = core.clock.now();
    const expired = db.transaction(() => {
      const rows = db.all<ApprovalRow>(`SELECT * FROM approvals WHERE status = 'pending' AND ${column} = ?`, [value]);
      const out: Approval[] = [];
      for (const r of rows) {
        if (db.run("UPDATE approvals SET status = 'expired', decided_at = ? WHERE id = ? AND status = 'pending'", [now, r.id]).changes > 0) {
          out.push(toApproval(getRow(r.id)!));
        }
      }
      return out;
    });
    for (const a of expired) {
      emitUpdated(a);
      resolveWaiters(a);
    }
    if (expired.length) log.info('Offene Freigaben abgelaufen', { [column]: value, count: expired.length });
  };

  /** Validates a request and computes its fingerprint (shared by check and peek). */
  const parseRequest = (req: ApprovalRequest): { kind: ApprovalKind; projectId: string | null; taskId: string | null; fp: string } => {
    const parsedKind = ApprovalKindSchema.safeParse(req?.kind);
    if (!parsedKind.success) throw new NovaError('VALIDATION', 'Unbekannte Art von Freigabe.', { severity: 'warning', details: { kind: req?.kind } });
    if (typeof req.subject !== 'string' || req.subject.trim() === '') {
      throw new NovaError('VALIDATION', 'Für eine Freigabe fehlt die Beschreibung der Aktion.', { severity: 'warning' });
    }
    const kind = parsedKind.data;
    const projectId = req.projectId ?? null;
    return { kind, projectId, taskId: req.taskId ?? null, fp: fingerprint(kind, projectId, req.subject) };
  };

  /**
   * Existing state for fingerprint + taskId (null-safe), without rules: an unconsumed approved 'once' approval →
   * approved; the latest decision denied and not acknowledged → denied; a pending approval → pending; else null.
   */
  const existingDecision = (fp: string, taskId: string | null): ApprovalCheck | null => {
    const once = db.get<ApprovalRow>(
      "SELECT * FROM approvals WHERE fingerprint = ? AND task_id IS ? AND status = 'approved' AND scope = 'once' AND consumed_at IS NULL ORDER BY decided_at DESC, created_at DESC LIMIT 1",
      [fp, taskId],
    );
    if (once) return { state: 'approved', approval: toApproval(once), viaRule: false };

    const latest = db.get<ApprovalRow>(
      "SELECT * FROM approvals WHERE fingerprint = ? AND task_id IS ? AND status IN ('approved', 'denied') ORDER BY decided_at DESC, created_at DESC LIMIT 1",
      [fp, taskId],
    );
    if (latest && latest.status === 'denied' && latest.acknowledged_at === null) return { state: 'denied', approval: toApproval(latest) };

    const pending = db.get<ApprovalRow>("SELECT * FROM approvals WHERE fingerprint = ? AND task_id IS ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1", [fp, taskId]);
    if (pending) return { state: 'pending', approval: toApproval(pending) };
    return null;
  };

  const service: ApprovalServiceImpl = {
    fingerprint,

    check(req: ApprovalRequest): ApprovalCheck {
      const { kind, projectId, taskId, fp } = parseRequest(req);
      if (matchingRule(kind, projectId, req.subject)) return { state: 'approved', approval: null, viaRule: true };

      let created: Approval | null = null;
      const result = db.transaction((): ApprovalCheck => {
        const existing = existingDecision(fp, taskId);
        if (existing) return existing;

        const id = newId('apr');
        const now = core.clock.now();
        const details = redact(req.details ?? {}) as Record<string, unknown>;
        db.run(
          `INSERT INTO approvals(id, project_id, task_id, run_id, kind, fingerprint, title, action, consequences, details, status, scope, created_at, decided_at, consumed_at, acknowledged_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, NULL, NULL, NULL)`,
          [
            id,
            projectId,
            taskId,
            req.runId ?? null,
            kind,
            fp,
            clip(redactString(req.title || APPROVAL_KIND_LABELS[kind]), MAX_TITLE),
            clip(redactString(req.action ?? ''), MAX_ACTION),
            clip(redactString(req.consequences ?? ''), MAX_CONSEQUENCES),
            toJson(details),
            now,
          ],
        );
        created = toApproval(getRow(id)!);
        return { state: 'pending', approval: created };
      });
      if (created) {
        const a: Approval = created;
        log.info('Neue Freigabe angefordert', { approvalId: a.id, kind: a.kind, projectId: a.projectId, taskId: a.taskId });
        emitUpdated(a);
        notifyPending(a);
      }
      return result;
    },

    peek(req: ApprovalRequest): ApprovalCheck | null {
      const { kind, projectId, taskId, fp } = parseRequest(req);
      if (matchingRule(kind, projectId, req.subject)) return { state: 'approved', approval: null, viaRule: true };
      return existingDecision(fp, taskId);
    },

    consume(approvalId) {
      const now = core.clock.now();
      const changed = db.run("UPDATE approvals SET consumed_at = ? WHERE id = ? AND status = 'approved' AND consumed_at IS NULL", [now, approvalId]).changes;
      if (changed > 0) return;
      const r = requireRow(approvalId);
      if (r.status !== 'approved') throw new NovaError('CONFLICT', 'Diese Freigabe wurde nicht erteilt und kann nicht verwendet werden.', { severity: 'warning', details: { status: r.status } });
      throw new NovaError('CONFLICT', 'Diese Freigabe wurde bereits verwendet. Für eine erneute Ausführung ist eine neue Freigabe nötig.', { severity: 'warning' });
    },

    acknowledgeDenial(approvalId) {
      const now = core.clock.now();
      const changed = db.run("UPDATE approvals SET acknowledged_at = ? WHERE id = ? AND status = 'denied' AND acknowledged_at IS NULL", [now, approvalId]).changes;
      if (changed > 0) return;
      const r = requireRow(approvalId);
      if (r.status !== 'denied') throw new NovaError('CONFLICT', 'Diese Freigabe wurde nicht abgelehnt.', { severity: 'warning', details: { status: r.status } });
      // already acknowledged → idempotent
    },

    get(id) {
      const r = getRow(id);
      return r ? toApproval(r) : null;
    },

    list(filter = {}) {
      const where: string[] = [];
      const params: (string | number)[] = [];
      if (filter.status) {
        where.push('status = ?');
        params.push(filter.status);
      }
      if (filter.projectId) {
        where.push('project_id = ?');
        params.push(filter.projectId);
      }
      if (filter.taskId) {
        where.push('task_id = ?');
        params.push(filter.taskId);
      }
      const limit = filter.status === 'pending' ? -1 : HISTORY_LIMIT;
      params.push(limit);
      const sql = `SELECT * FROM approvals ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC, id DESC LIMIT ?`;
      return db.all<ApprovalRow>(sql, params).map(toApproval);
    },

    decide(id, decision, scope) {
      const current = requireRow(id);
      const kind = current.kind as ApprovalKind;
      if (decision === 'approve' && scope === 'always' && APPROVAL_KINDS_ONCE_ONLY.includes(kind)) {
        throw new NovaError('VALIDATION', `„Immer erlauben“ ist für „${APPROVAL_KIND_LABELS[kind]}“ nicht möglich. Jede solche Aktion braucht eine eigene Entscheidung.`, {
          severity: 'warning',
        });
      }
      if (current.status !== 'pending') {
        const same = (decision === 'approve' && current.status === 'approved') || (decision === 'deny' && current.status === 'denied');
        if (same) return toApproval(current);
        const what = current.status === 'expired' ? 'ist abgelaufen' : current.status === 'approved' ? 'wurde bereits erlaubt' : 'wurde bereits abgelehnt';
        throw new NovaError('CONFLICT', `Diese Freigabe ${what} und kann nicht mehr geändert werden.`, { severity: 'warning', details: { status: current.status } });
      }
      const now = core.clock.now();
      const effectiveScope: ApprovalScope | null = decision === 'approve' ? scope : null;
      const { decided, alsoApproved } = db.transaction(() => {
        const changed = db.run('UPDATE approvals SET status = ?, scope = ?, decided_at = ? WHERE id = ? AND status = ?', [
          decision === 'approve' ? 'approved' : 'denied',
          effectiveScope,
          now,
          id,
          'pending',
        ]).changes;
        if (changed === 0) throw new NovaError('CONFLICT', 'Diese Freigabe wurde gerade anderweitig entschieden.', { severity: 'warning' });
        let others: Approval[] = [];
        if (decision === 'approve' && scope === 'always') {
          db.run('INSERT OR IGNORE INTO approval_rules(id, project_id, kind, fingerprint, description, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
            newId('rule'),
            current.project_id,
            kind,
            current.fingerprint,
            clip(`${APPROVAL_KIND_LABELS[kind]}: ${current.title}`, 500),
            now,
          ]);
          const rule = db.get<RuleRow>('SELECT * FROM approval_rules WHERE IFNULL(project_id, \'\') = ? AND kind = ? AND fingerprint = ?', [current.project_id ?? '', kind, current.fingerprint]);
          if (rule) others = applyRuleToPending(rule, id, now);
        }
        return { decided: toApproval(getRow(id)!), alsoApproved: others };
      });
      log.info('Freigabe entschieden', { approvalId: id, kind, status: decided.status, scope: decided.scope, alsoApproved: alsoApproved.length });
      announceDecision(decided);
      for (const a of alsoApproved) announceDecision(a);
      return decided;
    },

    waitFor(id, signal) {
      return new Promise<Approval>((resolve, reject) => {
        const r = getRow(id);
        if (!r) return reject(notFound('Die Freigabe', id));
        if (r.status !== 'pending') return resolve(toApproval(r));
        if (signal?.aborted) return reject(signal.reason ?? new NovaError('CANCELLED', 'Abgebrochen.', { severity: 'warning' }));
        let set = waiters.get(id);
        if (!set) {
          set = new Set();
          waiters.set(id, set);
        }
        const onAbort = () => {
          set!.delete(done);
          if (set!.size === 0) waiters.delete(id);
          reject(signal?.reason ?? new NovaError('CANCELLED', 'Abgebrochen.', { severity: 'warning' }));
        };
        const done = (a: Approval) => {
          signal?.removeEventListener('abort', onAbort);
          resolve(a);
        };
        set.add(done);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    },

    onDecision(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    rules() {
      return db.all<RuleRow>('SELECT * FROM approval_rules ORDER BY created_at DESC, id DESC').map(toRule);
    },

    deleteRule(id) {
      const changed = db.run('DELETE FROM approval_rules WHERE id = ?', [id]).changes;
      if (changed === 0) throw notFound('Die Regel', id);
      log.info('Freigaberegel gelöscht', { ruleId: id });
    },

    pendingCount(projectId) {
      const row = projectId
        ? db.get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending' AND project_id = ?", [projectId])
        : db.get<{ n: number }>("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'");
      return Number(row?.n ?? 0);
    },

    expireForTask(taskId) {
      expireWhere('task_id', taskId);
    },

    expireForProject(projectId) {
      expireWhere('project_id', projectId);
    },

    prune(olderThanMs) {
      return db.run(
        `DELETE FROM approvals
         WHERE status != 'pending'
           AND COALESCE(decided_at, created_at) < ?
           AND id NOT IN (
             SELECT a.id FROM approvals a
             JOIN approval_rules r ON r.kind = a.kind AND r.fingerprint = a.fingerprint AND IFNULL(r.project_id, '') = IFNULL(a.project_id, '')
             WHERE a.scope = 'always' AND a.status = 'approved'
           )`,
        [olderThanMs],
      ).changes;
    },

    waiterCount() {
      let n = 0;
      for (const set of waiters.values()) n += set.size;
      return n;
    },
  };
  return service;
}
