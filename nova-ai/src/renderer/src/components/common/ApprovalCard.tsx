import { useState } from 'react';
import { Link } from 'react-router';
import { Ban, Check, CheckCheck, TriangleAlert } from 'lucide-react';
import { APPROVAL_KINDS_ONCE_ONLY, type Approval, type ApprovalKind } from '@shared/schemas';
import { cn } from '../../lib/cn';
import { APPROVAL_KIND, APPROVAL_SCOPE, metaOf, toneClasses } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { HONEST_LIMITS_TEXT } from '../../lib/texts';
import { useMutation } from '../../hooks/useRpc';
import { Button } from '../ui/Button';
import { CodeBlock } from '../ui/CodeBlock';
import { ConfirmDialog } from '../ui/Dialog';
import { Tooltip } from '../ui/Tooltip';
import { Badge } from '../ui/Badge';
import { ApprovalStatusBadge } from './StatusBadges';
import { RelativeTime } from './RelativeTime';

/** Kinds where "Immer erlauben" asks for an extra confirmation (once-only kinds never offer it). */
const RISKY_ALWAYS = new Set<ApprovalKind>(['sensitive_data', 'outside_project', 'install', 'network']);
const ONCE_ONLY = new Set<ApprovalKind>(APPROVAL_KINDS_ONCE_ONLY);

export interface ApprovalCardProps {
  approval: Approval;
  projectName?: string;
  /** Called with the updated approval after a decision. */
  onDecided?: (approval: Approval) => void;
  /** Show the honest-limits sentence below the buttons (default true for pending approvals). */
  showLimits?: boolean;
  className?: string;
}

/** Splits "German explanation:\nraw command" into an intro line and the code part. */
function splitAction(action: string): { intro: string | null; code: string } {
  const i = action.indexOf('\n');
  if (i === -1) return { intro: null, code: action };
  return { intro: action.slice(0, i).trim() || null, code: action.slice(i + 1).trim() };
}

/**
 * Approval request: what will be executed (code block), possible consequences and the buttons
 * "Einmal erlauben" / "Immer erlauben" / "Ablehnen" (approvals.decide). Decided approvals show their result.
 * @example <ApprovalCard approval={a} projectName={names.get(a.projectId ?? '')} />
 */
export function ApprovalCard({ approval, projectName, onDecided, showLimits = true, className }: ApprovalCardProps) {
  const kind = metaOf(APPROVAL_KIND, approval.kind);
  const KindIcon = kind.icon;
  const pending = approval.status === 'pending';
  const alwaysAllowed = !ONCE_ONLY.has(approval.kind);
  const [pendingAction, setPendingAction] = useState<'once' | 'always' | 'deny' | null>(null);
  const [confirmAlways, setConfirmAlways] = useState(false);
  const decide = useMutation('approvals.decide', {
    successToast: (a) => (a.status === 'approved' ? (a.scope === 'always' ? 'Dauerhaft erlaubt' : 'Einmal erlaubt') : 'Abgelehnt'),
    onSuccess: (a) => onDecided?.(a),
  });
  const { intro, code } = splitAction(approval.action);

  const run = async (action: 'once' | 'always' | 'deny') => {
    setPendingAction(action);
    await decide.run({ id: approval.id, decision: action === 'deny' ? 'deny' : 'approve', scope: action === 'always' ? 'always' : 'once' });
    setPendingAction(null);
    setConfirmAlways(false);
  };

  return (
    <article aria-label={`Freigabe: ${approval.title}`} className={cn('min-w-0 rounded-xl border bg-surface', pending ? 'border-warning/35' : 'border-border', className)}>
      <header className="flex items-start gap-3 px-4 pt-3.5">
        <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', toneClasses[kind.tone].soft)}>
          <KindIcon aria-hidden className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-text">{approval.title}</h3>
            <Badge tone={kind.tone} title={kind.description}>
              {kind.label}
            </Badge>
            {!pending && <ApprovalStatusBadge status={approval.status} />}
            {!pending && approval.scope && approval.status === 'approved' && <Badge tone={metaOf(APPROVAL_SCOPE, approval.scope).tone}>{metaOf(APPROVAL_SCOPE, approval.scope).label}</Badge>}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
            {approval.projectId ? (
              <Link to={paths.project(approval.projectId, approval.taskId ? { tab: 'tasks', task: approval.taskId } : {})}>{projectName ?? 'Projekt'}</Link>
            ) : (
              <span>Alle Projekte</span>
            )}
            <span aria-hidden>·</span>
            <RelativeTime ts={approval.createdAt} prefix="angefragt" />
            {approval.decidedAt && (
              <>
                <span aria-hidden>·</span>
                <RelativeTime ts={approval.decidedAt} prefix="entschieden" />
              </>
            )}
          </p>
        </div>
      </header>

      <div className="space-y-3 px-4 pt-3 pb-3.5">
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted">{intro ?? 'Was soll ausgeführt werden?'}</p>
          <CodeBlock code={code} wrap maxHeight={160} />
        </div>
        <div className="flex gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
          <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
          <div>
            <p className="text-xs font-semibold text-text">Mögliche Folgen</p>
            <p className="mt-0.5 text-[13px] text-muted">{approval.consequences}</p>
          </div>
        </div>

        {pending && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <Button variant="primary" icon={Check} loading={pendingAction === 'once'} disabled={decide.loading} onClick={() => void run('once')}>
              Einmal erlauben
            </Button>
            {alwaysAllowed ? (
              <Tooltip content="Gleiche Aktion künftig ohne Rückfrage erlauben (unter „Freigaben → Regeln“ widerrufbar).">
                <Button
                  icon={CheckCheck}
                  loading={pendingAction === 'always' && !confirmAlways}
                  disabled={decide.loading}
                  onClick={() => (RISKY_ALWAYS.has(approval.kind) ? setConfirmAlways(true) : void run('always'))}
                >
                  Immer erlauben
                </Button>
              </Tooltip>
            ) : null}
            <Button variant="danger" icon={Ban} loading={pendingAction === 'deny'} disabled={decide.loading} onClick={() => void run('deny')} className="sm:ml-auto">
              Ablehnen
            </Button>
          </div>
        )}
        {pending && !alwaysAllowed && <p className="text-xs text-muted">Diese Art von Aktion muss jedes Mal einzeln erlaubt werden – „Immer erlauben“ gibt es dafür nicht.</p>}
        {pending && showLimits && <p className="border-t border-border pt-2.5 text-[11px] leading-relaxed text-subtle">{HONEST_LIMITS_TEXT}</p>}
      </div>

      <ConfirmDialog
        open={confirmAlways}
        tone="danger"
        title="Wirklich immer erlauben?"
        message={
          <>
            <p>
              NOVA darf diese Aktion („{kind.label}“) dann künftig <strong>ohne Rückfrage</strong> ausführen.
            </p>
            <p className="mt-2 text-muted">Die Regel lässt sich jederzeit unter „Freigaben → Regeln“ wieder entfernen.</p>
          </>
        }
        confirmLabel="Immer erlauben"
        loading={pendingAction === 'always'}
        onConfirm={() => run('always')}
        onCancel={() => setConfirmAlways(false)}
      />
    </article>
  );
}
