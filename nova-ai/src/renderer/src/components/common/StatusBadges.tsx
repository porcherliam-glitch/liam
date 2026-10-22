// Domain badges built on labels.ts. Each shows color + icon + German text.
import { Cloud, Cpu, Sparkles } from 'lucide-react';
import type { AgentRole, AgentRunStatus, ApprovalStatus, CheckStatus, ProjectKind, ProjectStatus, TaskStatus, Verification } from '@shared/schemas';
import type { ErrorSeverity } from '@shared/errors';
import { Badge, StatusBadge, type BadgeProps } from '../ui/Badge';
import {
  AGENT_ROLE,
  AGENT_RUN_STATUS,
  APPROVAL_STATUS,
  CHECK_STATUS,
  ERROR_SEVERITY,
  metaOf,
  PRIORITY,
  PROJECT_KIND,
  PROJECT_STATUS,
  TASK_STATUS,
  VERIFICATION_STATUS,
} from '../../lib/labels';
import { splitModelRef } from '../../lib/format';

type Common = Pick<BadgeProps, 'size' | 'variant' | 'className'>;

export function TaskStatusBadge({ status, ...rest }: { status: TaskStatus } & Common) {
  return <StatusBadge meta={metaOf(TASK_STATUS, status)} {...rest} />;
}

export function RunStatusBadge({ status, ...rest }: { status: AgentRunStatus } & Common) {
  return <StatusBadge meta={metaOf(AGENT_RUN_STATUS, status)} {...rest} />;
}

export function RoleBadge({ role, ...rest }: { role: AgentRole } & Common) {
  return <StatusBadge meta={metaOf(AGENT_ROLE, role)} {...rest} />;
}

export function CheckStatusBadge({ status, ...rest }: { status: CheckStatus } & Common) {
  return <StatusBadge meta={metaOf(CHECK_STATUS, status)} {...rest} />;
}

export function SeverityBadge({ severity, variant, ...rest }: { severity: ErrorSeverity } & Common) {
  return <StatusBadge meta={metaOf(ERROR_SEVERITY, severity)} variant={severity === 'critical' ? 'solid' : variant} {...rest} />;
}

export function ApprovalStatusBadge({ status, ...rest }: { status: ApprovalStatus } & Common) {
  return <StatusBadge meta={metaOf(APPROVAL_STATUS, status)} {...rest} />;
}

export function ProjectKindBadge({ kind, ...rest }: { kind: ProjectKind } & Common) {
  return <StatusBadge meta={metaOf(PROJECT_KIND, kind)} {...rest} />;
}

export function ProjectStatusBadge({ status, ...rest }: { status: ProjectStatus } & Common) {
  return <StatusBadge meta={metaOf(PROJECT_STATUS, status)} {...rest} />;
}

/** Task priority 0..3 (Niedrig/Normal/Hoch/Kritisch). */
export function PriorityBadge({ priority, ...rest }: { priority: number } & Common) {
  const p = Math.max(0, Math.min(3, Math.round(priority))) as 0 | 1 | 2 | 3;
  return <StatusBadge meta={PRIORITY[p]} title={`Priorität: ${PRIORITY[p].label}`} {...rest} />;
}

/**
 * "Geprüft ✓" / "Prüfung fehlgeschlagen" / "Nicht geprüft" / "Keine Prüfung möglich".
 * Accepts the whole Verification (tooltip lists the single checks) or just the status.
 */
export function VerificationBadge({ verification, status, ...rest }: { verification?: Verification; status?: Verification['status'] } & Common) {
  const s = verification?.status ?? status ?? 'not_run';
  const meta = metaOf(VERIFICATION_STATUS, s);
  const detail = verification?.checks.length ? verification.checks.map((c) => `${c.name}: ${metaOf(CHECK_STATUS, c.status).label}${c.details ? ` (${c.details})` : ''}`).join(' · ') : meta.description;
  return <StatusBadge meta={meta} title={detail} {...rest} />;
}

export interface ModelBadgeProps extends Common {
  /** "providerId/modelId" or a ModelRef; null = no model. */
  model: string | { providerId: string; modelId: string } | null | undefined;
  /** Force local/cloud display (default: providerId "ollama" = local). */
  local?: boolean;
  /** Mark as paid model. */
  paid?: boolean;
}

/** Model name with a local (chip) or cloud icon. */
export function ModelBadge({ model, local, paid, ...rest }: ModelBadgeProps) {
  const ref = typeof model === 'string' ? splitModelRef(model) : model ?? null;
  if (!ref) {
    return (
      <Badge tone="neutral" {...rest}>
        Kein Modell
      </Badge>
    );
  }
  const isLocal = local ?? ref.providerId === 'ollama';
  const full = ref.providerId ? `${ref.providerId}/${ref.modelId}` : ref.modelId;
  return (
    <Badge tone={isLocal ? 'success' : paid ? 'warning' : 'blue'} icon={isLocal ? Cpu : paid ? Sparkles : Cloud} title={`${isLocal ? 'Lokales Modell' : paid ? 'Kostenpflichtiges Cloud-Modell' : 'Cloud-Modell'}: ${full}`} {...rest}>
      <span className="font-mono">{ref.modelId}</span>
    </Badge>
  );
}

/** Small "geschätzt" marker for estimated values. */
export function EstimatedBadge({ className }: { className?: string }) {
  return (
    <Badge tone="warning" variant="outline" className={className} title="Dieser Wert ist eine Schätzung.">
      geschätzt
    </Badge>
  );
}
