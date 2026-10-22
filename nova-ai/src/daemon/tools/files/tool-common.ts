// Shared helpers of the file agent tools: error → ToolResult mapping, approvals, file locks, task file tracking.
// Key decisions:
// - Tools never throw for expected problems: NovaErrors become { status:'error', code, content } with the German
//   message, so the model can react (the registry would catch anyway, but the code is then preserved).
// - Approvals follow ApprovalService semantics: pending → approval_required (the run pauses and re-executes the
//   same call after the decision), denied → acknowledgeDenial + APPROVAL_DENIED error, approved 'once' → consume()
//   BEFORE the action runs (never reused after a crash).
// - FILE_LOCKED names the holding task by title so the user/model understands the conflict.
import type { ApprovalKind } from '@shared/schemas';
import type { Services, ToolContext, ToolResult } from '../../contracts';
import { NovaError, errorMessage } from '../../core/errors';

export function toolError(e: unknown): ToolResult {
  if (e instanceof NovaError) return { status: 'error', code: e.code, content: e.message };
  return { status: 'error', code: 'INTERNAL', content: `Unerwarteter Fehler: ${errorMessage(e)}` };
}

export interface ToolApprovalRequest {
  kind: ApprovalKind;
  subject: string;
  title: string;
  action: string;
  consequences: string;
  details?: Record<string, unknown>;
}

/** Returns a ToolResult to hand back immediately (pending/denied) or null when the action may run now. */
export function requireApproval(s: Services, ctx: ToolContext, req: ToolApprovalRequest): ToolResult | null {
  const check = s.approvals.check({
    projectId: ctx.project.id,
    taskId: ctx.task.id,
    runId: ctx.runId,
    kind: req.kind,
    title: req.title,
    action: req.action,
    consequences: req.consequences,
    subject: req.subject,
    details: req.details,
  });
  if (check.state === 'pending') {
    return {
      status: 'approval_required',
      approvalId: check.approval.id,
      content: `Freigabe erforderlich: ${req.title}. Die Aufgabe wartet auf die Entscheidung des Benutzers und setzt danach genau hier fort.`,
    };
  }
  if (check.state === 'denied') {
    try {
      s.approvals.acknowledgeDenial(check.approval.id);
    } catch (e) {
      ctx.log.warn('Ablehnung konnte nicht quittiert werden', { error: errorMessage(e) });
    }
    return {
      status: 'error',
      code: 'APPROVAL_DENIED',
      content: `Vom Benutzer abgelehnt: ${req.title}. Bitte einen anderen Weg wählen, der ohne diese Aktion auskommt, oder den Blocker im Abschlussbericht nennen.`,
    };
  }
  if (check.approval && !check.viaRule) s.approvals.consume(check.approval.id);
  return null;
}

export function acquireLock(s: Services, ctx: ToolContext, key: string, rel: string): ToolResult | null {
  const res = s.locks.acquire(ctx.project.id, key, ctx.task.id);
  if (res.ok) return null;
  let title = res.heldBy;
  try {
    title = s.tasks.get(res.heldBy)?.title ?? res.heldBy;
  } catch {
    /* keep the id */
  }
  return {
    status: 'error',
    code: 'FILE_LOCKED',
    content: `Datei wird gerade von Aufgabe „${title}“ bearbeitet: ${rel}. Bitte zuerst an anderen Dateien arbeiten oder die Aufgabe ohne diese Datei abschließen.`,
  };
}

export function addTaskFiles(s: Services, ctx: ToolContext, rels: string[]): void {
  if (rels.length === 0) return;
  try {
    s.tasks.addFiles(ctx.task.id, rels);
  } catch (e) {
    ctx.log.warn('Geänderte Dateien konnten der Aufgabe nicht zugeordnet werden', { error: errorMessage(e) });
  }
}

export function abortedResult(ctx: ToolContext): ToolResult | null {
  return ctx.signal.aborted ? { status: 'error', code: 'CANCELLED', content: 'Abgebrochen – die Aktion wurde nicht ausgeführt.' } : null;
}

/** Truncates text to maxChars with a German note. */
export function truncateOutput(text: string, maxChars: number, note: string): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [gekürzt: ${note}]`;
}
