// Budget limits (UI-SPEC §4, MASTERPROMPT §15): daily/monthly limit via budget.setLimits, plus the budget settings
// "continue locally" and the warning threshold via settings.update({ budgets }).
import { useMemo, useState } from 'react';
import { Gauge, RotateCcw, Save } from 'lucide-react';
import type { BudgetStatus } from '@shared/schemas';
import type { Settings } from '@shared/settings';
import { Button, Card, Meter, SegmentedControl, Switch } from '../../components/ui';
import { useMutation } from '../../hooks';
import { formatUsd } from '../../lib/format';
import { toast } from '../../stores/toasts';
import { issueFor, numberToInput, parseNumber, rpcIssues } from '../settings/shared/forms';
import { NumberInput, UnsavedBadge } from '../settings/shared/ui';
import { limitMode, limitPercent, type LimitMode } from './costUtils';

interface LimitDraft {
  mode: LimitMode;
  amount: string;
}

interface Draft {
  daily: LimitDraft;
  monthly: LimitDraft;
  fallbackToLocal: boolean;
  warnPercent: string;
}

function limitDraft(value: number | null): LimitDraft {
  return { mode: limitMode(value), amount: value != null && value > 0 ? numberToInput(value) : '' };
}

function toDraft(budget: BudgetStatus, settings: Settings['budgets']): Draft {
  return {
    daily: limitDraft(budget.dailyLimitUsd),
    monthly: limitDraft(budget.monthlyLimitUsd),
    fallbackToLocal: settings.fallbackToLocal,
    warnPercent: numberToInput(Math.round(settings.warnAtRatio * 100)),
  };
}

const MODE_OPTIONS: Array<{ value: LimitMode; label: string }> = [
  { value: 'none', label: 'Keine Kosten' },
  { value: 'amount', label: 'Grenze' },
  { value: 'unlimited', label: 'Unbegrenzt' },
];

export interface LimitsCardProps {
  budget: BudgetStatus;
  settings: Settings['budgets'];
  onBudgetSaved: (b: BudgetStatus) => void;
  onSettingsSaved: (s: Settings) => void;
}

export function LimitsCard({ budget, settings, onBudgetSaved, onSettingsSaved }: LimitsCardProps) {
  const effective = settings;
  const base = useMemo(() => toDraft(budget, settings), [budget, settings]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const value = draft ?? base;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(base);

  const setLimits = useMutation('budget.setLimits');
  const updateSettings = useMutation('settings.update');

  const update = (patch: Partial<Draft>) => {
    setDraft({ ...value, ...patch });
    setErrors({});
  };

  const parseLimit = (d: LimitDraft, key: string, out: Record<string, string>): number | null | undefined => {
    if (d.mode === 'unlimited') return null;
    if (d.mode === 'none') return 0;
    const r = parseNumber(d.amount, { min: 0.01, max: 1_000_000 });
    if (r.error !== undefined) {
      out[key] = r.error;
      return undefined;
    }
    return r.value;
  };

  const save = async () => {
    const e: Record<string, string> = {};
    const daily = parseLimit(value.daily, 'dailyLimitUsd', e);
    const monthly = parseLimit(value.monthly, 'monthlyLimitUsd', e);
    const warn = parseNumber(value.warnPercent, { min: 10, max: 100, int: true });
    if (warn.error !== undefined) e.warnAtRatio = warn.error;
    setErrors(e);
    if (Object.keys(e).length > 0 || daily === undefined || monthly === undefined || warn.value == null) return;

    setSaving(true);
    try {
      const limits: { dailyLimitUsd?: number | null; monthlyLimitUsd?: number | null } = {};
      if (daily !== budget.dailyLimitUsd) limits.dailyLimitUsd = daily;
      if (monthly !== budget.monthlyLimitUsd) limits.monthlyLimitUsd = monthly;
      if (Object.keys(limits).length > 0) onBudgetSaved(await setLimits.runAsync(limits));
      const budgets: { fallbackToLocal?: boolean; warnAtRatio?: number } = {};
      if (value.fallbackToLocal !== effective.fallbackToLocal) budgets.fallbackToLocal = value.fallbackToLocal;
      const ratio = warn.value / 100;
      if (Math.abs(ratio - effective.warnAtRatio) > 1e-9) budgets.warnAtRatio = ratio;
      if (Object.keys(budgets).length > 0) onSettingsSaved(await updateSettings.runAsync({ budgets }));
      setDraft(null);
      toast.success('Budget gespeichert');
    } catch (err) {
      const issues = rpcIssues(err);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(issues)) mapped[k.replace(/^budgets\./, '')] = v;
      setErrors(mapped);
      if (Object.keys(mapped).length === 0) toast.fromError(err, 'Budget konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  const warnAt = Math.round(effective.warnAtRatio * 100);
  const dayPct = limitPercent(budget.spentTodayUsd, budget.dailyLimitUsd);
  const monthPct = limitPercent(budget.spentMonthUsd, budget.monthlyLimitUsd);

  return (
    <Card
      title="Budget-Grenzen"
      description="Kosten werden vor jedem kostenpflichtigen Aufruf geprüft. Ist eine Grenze erreicht, pausiert NOVA kostenpflichtige Arbeit – sie läuft erst nach einer Freigabe weiter."
      icon={Gauge}
      actions={dirty && <UnsavedBadge />}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={RotateCcw}
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(null);
              setErrors({});
            }}
          >
            Verwerfen
          </Button>
          <Button size="sm" variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={() => void save()}>
            Speichern
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <LimitField label="Tageslimit" draft={value.daily} error={issueFor(errors, 'dailyLimitUsd')} onChange={(daily) => update({ daily })} />
          <LimitField label="Monatslimit" draft={value.monthly} error={issueFor(errors, 'monthlyLimitUsd')} onChange={(monthly) => update({ monthly })} />
        </div>
        <div className="space-y-4">
          <Meter
            label="Heute verbraucht"
            value={dayPct}
            valueText={`${formatUsd(budget.spentTodayUsd, budget.containsEstimates)} von ${formatUsd(budget.dailyLimitUsd)}`}
            unavailableText={budget.dailyLimitUsd === 0 ? 'Kostenpflichtige Nutzung ist ausgeschaltet' : 'Keine Tagesgrenze'}
            estimated={budget.containsEstimates}
            thresholds={[warnAt, 100]}
          />
          <Meter
            label="Diesen Monat verbraucht"
            value={monthPct}
            valueText={`${formatUsd(budget.spentMonthUsd, budget.containsEstimates)} von ${formatUsd(budget.monthlyLimitUsd)}`}
            unavailableText={budget.monthlyLimitUsd === 0 ? 'Kostenpflichtige Nutzung ist ausgeschaltet' : 'Keine Monatsgrenze'}
            estimated={budget.containsEstimates}
            thresholds={[warnAt, 100]}
          />
          <Switch
            checked={value.fallbackToLocal}
            onChange={(fallbackToLocal) => update({ fallbackToLocal })}
            label="Bei erreichter Grenze lokal weiterarbeiten"
            description="NOVA verwendet dann freigegebene lokale Modelle aus der Modellauswahl, statt die Arbeit anzuhalten."
          />
          <NumberInput
            label="Warnen ab"
            unit="%"
            value={value.warnPercent}
            onChange={(warnPercent) => update({ warnPercent })}
            error={issueFor(errors, 'warnAtRatio')}
            hint="Ab diesem Anteil einer Grenze erscheint eine Warnung (10 bis 100 %)."
            containerClassName="max-w-56"
          />
        </div>
      </div>
    </Card>
  );
}

function LimitField({ label, draft, error, onChange }: { label: string; draft: LimitDraft; error?: string; onChange: (d: LimitDraft) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-text">{label}</span>
        <SegmentedControl<LimitMode> size="sm" label={label} options={MODE_OPTIONS} value={draft.mode} onChange={(mode) => onChange({ ...draft, mode })} />
      </div>
      {draft.mode === 'amount' ? (
        <NumberInput aria-label={`${label} in US-Dollar`} decimal unit="$" value={draft.amount} onChange={(amount) => onChange({ ...draft, amount })} error={error} placeholder="z. B. 5" />
      ) : (
        <p className="text-xs text-muted">
          {draft.mode === 'none' ? 'NOVA verwendet keine kostenpflichtigen Modelle.' : 'Keine Grenze – nur empfehlenswert, wenn beim Anbieter selbst ein Limit eingerichtet ist.'}
        </p>
      )}
      {error && draft.mode !== 'amount' && (
        <p className="text-xs text-danger-fg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
