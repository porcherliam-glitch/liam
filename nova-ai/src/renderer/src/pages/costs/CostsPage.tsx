// Kosten (UI-SPEC §4 UI-4, §7, MASTERPROMPT §15): budget status, paused paid work with explicit resume, limits,
// per-project budgets, tokens, local vs cloud runtime and the usage of a period. Estimates are always marked.
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CalendarDays, CirclePause, Clock, Coins, FolderKanban, Play, Sigma } from 'lucide-react';
import type { BudgetStatus } from '@shared/schemas';
import { Page } from '../../components/layout/Page';
import { Badge, Button, Card, type Column, ConfirmDialog, EmptyState, ErrorState, LoadingState, Stat, Table } from '../../components/ui';
import { useMutation, useProjectNames, useRpc } from '../../hooks';
import { formatDuration, formatTokens, formatUsd } from '../../lib/format';
import { paths } from '../../lib/paths';
import { Notice } from '../settings/shared/ui';
import { limitText, USAGE_REFRESH } from './costUtils';
import { LimitsCard } from './LimitsCard';
import { UsageSection } from './UsageSection';

type ProjectBudget = BudgetStatus['perProject'][number];

export default function CostsPage() {
  // Project changes: a new project or a changed project limit shows up in "Budget pro Projekt".
  const budget = useRpc('budget.status', undefined, { ...USAGE_REFRESH, refetchOn: [...USAGE_REFRESH.refetchOn, 'project.updated', 'project.removed'] });
  const settings = useRpc('settings.get', undefined, { refetchOn: ['settings.updated'] });
  const providers = useRpc('providers.list', undefined, { refetchOn: ['provider.updated', 'provider.removed'] });
  const projectNames = useProjectNames();
  const providerNames = useMemo(() => new Map((providers.data ?? []).map((p) => [p.id, p.name])), [providers.data]);
  const [resumeTarget, setResumeTarget] = useState<{ projectId: string | null } | null>(null);

  const resume = useMutation('budget.resumePaid', {
    successToast: (_r, p) => (p?.projectId ? `Kostenpflichtige Arbeit für ${projectNames.get(p.projectId) ?? 'das Projekt'} fortgesetzt` : 'Kostenpflichtige Arbeit fortgesetzt'),
    onSuccess: (b) => {
      budget.setData(b);
      setResumeTarget(null);
    },
  });

  const b = budget.data;
  return (
    <Page
      title="Kosten"
      description="Was die Arbeit mit kostenpflichtigen Cloud-Modellen kostet – und wo die Grenzen liegen. Lokale Modelle sind kostenlos. Geschätzte Werte sind als „geschätzt“ markiert."
    >
      {budget.loading ? (
        <LoadingState label="Kosten werden geladen …" />
      ) : !b ? (
        <ErrorState error={budget.error} onRetry={() => void budget.refetch()} />
      ) : (
        <div className="space-y-4">
          {b.paidPaused && (
            <Notice
              tone="danger"
              icon={CirclePause}
              title="Kostenpflichtige Arbeit ist pausiert"
              alert
              actions={
                <Button variant="primary" icon={Play} onClick={() => setResumeTarget({ projectId: null })}>
                  Kostenpflichtige Arbeit fortsetzen
                </Button>
              }
            >
              {b.pausedReason ?? 'Eine Budget-Grenze wurde erreicht.'} NOVA arbeitet – wenn möglich – mit lokalen Modellen weiter.
            </Notice>
          )}
          {b.containsEstimates && <Notice tone="info">Ein Teil der Kosten ist geschätzt, weil der Anbieter keine genauen Preise meldet. Die echten Kosten stehen in der Abrechnung des Anbieters.</Notice>}

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Heute ausgegeben"
              icon={Coins}
              tone="warning"
              value={formatUsd(b.spentTodayUsd)}
              estimated={b.containsEstimates && b.spentTodayUsd > 0}
              sub={b.remainingTodayUsd != null && b.dailyLimitUsd ? `noch ${formatUsd(b.remainingTodayUsd)} von ${formatUsd(b.dailyLimitUsd)}` : `Tagesgrenze: ${limitText(b.dailyLimitUsd)}`}
            />
            <Stat
              label="Diesen Monat ausgegeben"
              icon={CalendarDays}
              tone="violet"
              value={formatUsd(b.spentMonthUsd)}
              estimated={b.containsEstimates && b.spentMonthUsd > 0}
              sub={b.remainingMonthUsd != null && b.monthlyLimitUsd ? `noch ${formatUsd(b.remainingMonthUsd)} von ${formatUsd(b.monthlyLimitUsd)}` : `Monatsgrenze: ${limitText(b.monthlyLimitUsd)}`}
            />
            <Stat label="Tokens heute" icon={Sigma} tone="blue" value={formatTokens(b.tokensToday.input + b.tokensToday.output)} sub={`${formatTokens(b.tokensToday.input)} gesendet · ${formatTokens(b.tokensToday.output)} erzeugt`} />
            <Stat label="Modell-Laufzeit heute" icon={Clock} tone="info" value={formatDuration(b.localRuntimeMsToday + b.cloudRuntimeMsToday)} sub={`lokal ${formatDuration(b.localRuntimeMsToday)} · Cloud ${formatDuration(b.cloudRuntimeMsToday)}`} />
          </div>
          {b.reservedUsd > 0 && <p className="text-xs text-muted">Für laufende kostenpflichtige Aufrufe sind gerade {formatUsd(b.reservedUsd)} reserviert.</p>}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {settings.data ? (
              <LimitsCard budget={b} settings={settings.data.budgets} onBudgetSaved={budget.setData} onSettingsSaved={settings.setData} />
            ) : (
              <Card title="Budget-Grenzen">{settings.loading ? <LoadingState compact /> : <ErrorState compact error={settings.error} onRetry={() => void settings.refetch()} />}</Card>
            )}
            <TokensCard budget={b} />
          </div>

          <ProjectBudgetsCard budget={b} projectNames={projectNames} onResume={(projectId) => setResumeTarget({ projectId })} />
          <UsageSection projectNames={projectNames} providerNames={providerNames} />
        </div>
      )}

      <ConfirmDialog
        open={resumeTarget !== null}
        title="Kostenpflichtige Arbeit fortsetzen?"
        confirmLabel="Fortsetzen"
        loading={resume.loading}
        onCancel={() => setResumeTarget(null)}
        onConfirm={() => resume.run(resumeTarget?.projectId ? { projectId: resumeTarget.projectId } : {})}
        icon={Coins}
        message={
          <>
            <p>
              {resumeTarget?.projectId ? `Agenten im Projekt „${projectNames.get(resumeTarget.projectId) ?? 'Unbekannt'}“` : 'Agenten'} dürfen danach wieder kostenpflichtige Modelle verwenden. Dabei entstehen Kosten beim Anbieter.
            </p>
            <p className="text-muted">Ist die Grenze weiterhin erreicht, pausiert NOVA beim nächsten Aufruf erneut. Wer mehr ausgeben möchte, erhöht zuerst die Grenze.</p>
          </>
        }
      />
    </Page>
  );
}

function TokensCard({ budget: b }: { budget: BudgetStatus }) {
  const rows = [
    { label: 'Heute', tokens: b.tokensToday, local: b.localRuntimeMsToday, cloud: b.cloudRuntimeMsToday },
    { label: 'Diesen Monat', tokens: b.tokensMonth, local: b.localRuntimeMsMonth, cloud: b.cloudRuntimeMsMonth },
  ];
  return (
    <Card title="Tokens und Laufzeit" description="Wie viel Text die Modelle verarbeitet haben und wie lange sie gerechnet haben." icon={Sigma}>
      <div className="space-y-4">
        {rows.map((r) => {
          const total = r.local + r.cloud;
          const localShare = total > 0 ? (r.local / total) * 100 : 0;
          return (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-xs font-semibold text-text">{r.label}</h3>
                <span className="text-xs text-muted tabular-nums">
                  {formatTokens(r.tokens.input)} gesendet · {formatTokens(r.tokens.output)} erzeugt
                </span>
              </div>
              <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`Laufzeit ${r.label}: lokal ${formatDuration(r.local)}, Cloud ${formatDuration(r.cloud)}`}>
                <div className="h-full bg-success" style={{ width: `${localShare}%` }} />
                <div className="h-full bg-blue" style={{ width: `${total > 0 ? 100 - localShare : 0}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
                  Lokal {formatDuration(r.local)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-blue" />
                  Cloud {formatDuration(r.cloud)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProjectBudgetsCard({ budget, projectNames, onResume }: { budget: BudgetStatus; projectNames: Map<string, string>; onResume: (projectId: string) => void }) {
  const columns: Column<ProjectBudget>[] = [
    {
      key: 'project',
      header: 'Projekt',
      sortValue: (p) => projectNames.get(p.projectId) ?? p.projectId,
      cell: (p) => <Link to={paths.project(p.projectId)}>{projectNames.get(p.projectId) ?? 'Unbekanntes Projekt'}</Link>,
    },
    { key: 'limit', header: 'Grenze pro Monat', align: 'right', sortValue: (p) => p.limitUsd, cell: (p) => (p.limitUsd == null ? <span className="text-muted">keine eigene</span> : formatUsd(p.limitUsd)) },
    { key: 'spent', header: 'Ausgegeben', align: 'right', sortValue: (p) => p.spentMonthUsd, cell: (p) => <span className="tabular-nums">{formatUsd(p.spentMonthUsd, p.containsEstimates && p.spentMonthUsd > 0)}</span> },
    { key: 'remaining', header: 'Verbleibend', align: 'right', sortValue: (p) => p.remainingUsd, cell: (p) => (p.remainingUsd == null ? <span className="text-muted">–</span> : formatUsd(p.remainingUsd)) },
    {
      key: 'state',
      header: 'Status',
      cell: (p) =>
        p.paidPaused ? (
          <Badge tone="danger" icon={CirclePause}>
            Pausiert
          </Badge>
        ) : (
          <Badge tone="success">Im Rahmen</Badge>
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">Aktionen</span>,
      align: 'right',
      cell: (p) =>
        p.paidPaused ? (
          <Button size="sm" icon={Play} onClick={() => onResume(p.projectId)} aria-label={`Kostenpflichtige Arbeit für ${projectNames.get(p.projectId) ?? 'das Projekt'} fortsetzen`}>
            Fortsetzen
          </Button>
        ) : (
          <Link to={paths.project(p.projectId)} className="text-xs">
            Grenze ändern
          </Link>
        ),
    },
  ];
  return (
    <Card title="Budget pro Projekt" description="Eine Projektgrenze pausiert nur die kostenpflichtige Arbeit dieses Projekts. Festgelegt wird sie in der Projektübersicht unter „Befehle und Arbeitsweise“." icon={FolderKanban} padding="none">
      <div className="px-1 pb-1">
        <Table
          columns={columns}
          rows={budget.perProject}
          rowKey={(p) => p.projectId}
          caption="Budget pro Projekt"
          dense
          empty={<EmptyState compact icon={FolderKanban} title="Keine aktiven Projekte" description="Für jedes aktive Projekt stehen hier seine Grenze, der Verbrauch in diesem Monat und das verbleibende Budget." />}
        />
      </div>
    </Card>
  );
}
