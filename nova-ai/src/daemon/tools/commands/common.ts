// Shared helpers of the command agent tools (run_command, run_checks, git_diff, memory_*, ask_user).
// Key decisions:
// - Tools never throw for expected problems: NovaErrors become { status:'error', code, content } with the German
//   message so the model can react (the registry would catch too, but this keeps the code).
// - Approval gate = ApprovalService semantics: pending → approval_required (the run pauses and re-executes the same
//   call after the decision), denied → acknowledgeDenial + APPROVAL_DENIED, approved 'once' → consume() BEFORE the
//   action runs (never reused after a crash); approvals via an 'always' rule are not consumed.
// - Output helpers keep results compact (tails with German notes, single-line summaries, German number formats).
import type { ApprovalKind } from '@shared/schemas';
import type { Services, ToolContext, ToolResult } from '../../contracts';
import { NovaError, errorMessage } from '../../core/errors';

export function toolError(e: unknown): ToolResult {
  if (e instanceof NovaError) return { status: 'error', code: String(e.code), content: e.message };
  return { status: 'error', code: 'INTERNAL', content: `Unerwarteter Fehler: ${errorMessage(e)}` };
}

export function abortedResult(ctx: ToolContext): ToolResult | null {
  return ctx.signal.aborted ? { status: 'error', code: 'CANCELLED', content: 'Abgebrochen – die Aktion wurde nicht ausgeführt.' } : null;
}

export interface GateRequest {
  kind: ApprovalKind;
  subject: string;
  title: string;
  action: string;
  consequences: string;
  details?: Record<string, unknown>;
}

export type GateOutcome = { proceed: true; approvalId: string | null } | { proceed: false; result: ToolResult };

/** Runs the approval check; consumes a 'once' approval before returning proceed=true. */
export function approvalGate(s: Services, ctx: ToolContext, req: GateRequest): GateOutcome {
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
      proceed: false,
      result: {
        status: 'approval_required',
        approvalId: check.approval.id,
        content: `Freigabe erforderlich: ${req.title}. Die Aufgabe wartet auf die Entscheidung des Benutzers und setzt danach genau hier fort.`,
      },
    };
  }
  if (check.state === 'denied') {
    try {
      s.approvals.acknowledgeDenial(check.approval.id);
    } catch (e) {
      ctx.log.warn('Ablehnung konnte nicht quittiert werden', { approvalId: check.approval.id, error: errorMessage(e) });
    }
    return {
      proceed: false,
      result: {
        status: 'error',
        code: 'APPROVAL_DENIED',
        content: `Vom Benutzer abgelehnt: ${req.title}. Bitte einen anderen Weg wählen, der ohne diese Aktion auskommt, oder den Blocker im Abschlussbericht nennen.`,
      },
    };
  }
  if (check.approval && !check.viaRule) {
    s.approvals.consume(check.approval.id);
    return { proceed: true, approvalId: check.approval.id };
  }
  return { proceed: true, approvalId: check.approval?.id ?? null };
}

/** First line, whitespace collapsed, at most `max` characters. */
export function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, Math.max(1, max - 1))}…`;
}

/** Keeps the last `max` characters with a German note in front. */
export function tailChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  const nl = cut.indexOf('\n');
  const aligned = nl >= 0 && nl < 200 ? cut.slice(nl + 1) : cut;
  return `[… gekürzt: nur die letzten ${max.toLocaleString('de-DE')} Zeichen]\n${aligned}`;
}

/** Keeps the first `max` characters with a German note at the end. */
export function headChars(text: string, max: number, note: string): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [gekürzt: ${note}]`;
}

/** German duration, e.g. "850 ms", "1,2 s", "3 min 5 s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return 'unbekannt';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return sec > 0 ? `${min} min ${sec} s` : `${min} min`;
}

/** Local date "2026-10-22" for memory listings. */
export function isoDay(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
