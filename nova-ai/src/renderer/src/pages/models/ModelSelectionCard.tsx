// Global model choice (UI-SPEC §4, MASTERPROMPT §7): default model, ordered fallback chain, per-role overrides and
// generation parameters. Saved as a patch via models.setSelection. Paid models are only selectable when the provider
// is approved and a price is set (ModelSelect disables them).
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ListOrdered, Plus, RotateCcw, Save, SlidersHorizontal, Trash2, TriangleAlert } from 'lucide-react';
import type { AgentRole, ModelInfo, ModelRef, ProviderConfig } from '@shared/schemas';
import type { ModelSettings, ModelSettingsPatch } from '@shared/settings';
import { Button, Card, ErrorState, IconButton, LoadingState } from '../../components/ui';
import { ModelBadge } from '../../components/common';
import { useMutation, type UseRpcResult } from '../../hooks';
import { AGENT_ROLE } from '../../lib/labels';
import { toast } from '../../stores/toasts';
import { issueFor, numberToInput, parseNumber, rpcIssues, sameValue, type NumberRule } from '../settings/shared/forms';
import { Notice, NumberInput, UnsavedBadge } from '../settings/shared/ui';
import { ModelSelect } from './ModelSelect';
import { modelUsability, refKey, sameRef } from './modelUtils';

const ROLES: AgentRole[] = ['planner', 'coder', 'tester', 'reviewer'];

interface Draft {
  defaultModel: ModelRef | null;
  fallbacks: ModelRef[];
  roleOverrides: Record<AgentRole, ModelRef | null>;
  ollamaNumCtx: string;
  temperature: string;
  maxOutputTokens: string;
}

type NumberKey = 'ollamaNumCtx' | 'temperature' | 'maxOutputTokens';
const NUMBER_RULES: Record<NumberKey, NumberRule> = {
  ollamaNumCtx: { min: 2048, max: 262144, int: true },
  temperature: { min: 0, max: 2 },
  maxOutputTokens: { min: 256, max: 65536, int: true },
};

function toDraft(s: ModelSettings): Draft {
  return {
    defaultModel: s.defaultModel,
    fallbacks: [...s.fallbacks],
    roleOverrides: { ...s.roleOverrides },
    ollamaNumCtx: numberToInput(s.ollamaNumCtx),
    temperature: numberToInput(s.temperature),
    maxOutputTokens: numberToInput(s.maxOutputTokens),
  };
}

export interface ModelSelectionCardProps {
  selection: UseRpcResult<'models.getSelection'>;
  models: ModelInfo[];
  providers: ProviderConfig[];
}

export function ModelSelectionCard({ selection, models, providers }: ModelSelectionCardProps) {
  const saved = selection.data;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toAdd, setToAdd] = useState<ModelRef | null>(null);

  const base = useMemo(() => (saved ? toDraft(saved) : null), [saved]);
  const value = draft ?? base;
  const dirty = !!draft && !!base && JSON.stringify(draft) !== JSON.stringify(base);

  const save = useMutation('models.setSelection', {
    errorToast: false,
    successToast: 'Modellauswahl gespeichert',
    onSuccess: (result) => {
      selection.setData(result);
      setDraft(null);
      setErrors({});
    },
    onError: (e) => {
      const issues = rpcIssues(e);
      setErrors(issues);
      if (Object.keys(issues).length === 0) toast.fromError(e, 'Modellauswahl konnte nicht gespeichert werden');
    },
  });

  if (selection.loading) {
    return (
      <Card title="Welches Modell NOVA verwendet" icon={SlidersHorizontal}>
        <LoadingState compact />
      </Card>
    );
  }
  if (!value || !saved) {
    return (
      <Card title="Welches Modell NOVA verwendet" icon={SlidersHorizontal}>
        <ErrorState compact error={selection.error} onRetry={() => void selection.refetch()} />
      </Card>
    );
  }

  const update = (patch: Partial<Draft>) => {
    setDraft({ ...value, ...patch });
    const touched = Object.keys(patch);
    if (touched.some((k) => errors[k] || Object.keys(errors).some((e) => e.startsWith(`${k}.`)))) {
      setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !touched.some((t) => k === t || k.startsWith(`${t}.`)))));
    }
  };

  const providerById = new Map(providers.map((p) => [p.id, p]));
  /** Warning for a selected model that NOVA could not use right now. */
  const refWarning = (ref: ModelRef | null): string | null => {
    if (!ref) return null;
    const m = models.find((x) => x.providerId === ref.providerId && x.id === ref.modelId);
    if (!m) return 'Dieses Modell ist gerade nicht verfügbar (Anbieter ausgeschaltet, entfernt oder Modell gelöscht).';
    const use = modelUsability(m, providerById.get(m.providerId));
    if (!use.usable) return `Wird nicht verwendet: ${use.reason}.`;
    if (!m.capabilities.includes('tools')) return 'Dieses Modell kann keine Werkzeuge aufrufen und eignet sich kaum für selbstständige Agenten.';
    return null;
  };

  const onSave = () => {
    const nextErrors: Record<string, string> = {};
    const patch: ModelSettingsPatch = {};
    for (const key of Object.keys(NUMBER_RULES) as NumberKey[]) {
      const parsed = parseNumber(value[key], NUMBER_RULES[key]);
      if (parsed.error !== undefined) nextErrors[key] = parsed.error;
      else if (parsed.value !== saved[key]) patch[key] = parsed.value as number;
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (!sameRef(value.defaultModel, saved.defaultModel)) patch.defaultModel = value.defaultModel;
    if (!sameValue(value.fallbacks.map(refKey), saved.fallbacks.map(refKey))) patch.fallbacks = value.fallbacks;
    const roles: Partial<Record<AgentRole, ModelRef | null>> = {};
    for (const r of ROLES) if (!sameRef(value.roleOverrides[r], saved.roleOverrides[r])) roles[r] = value.roleOverrides[r];
    if (Object.keys(roles).length > 0) patch.roleOverrides = roles;
    if (Object.keys(patch).length === 0) {
      setDraft(null);
      return;
    }
    void save.run(patch);
  };

  const moveFallback = (index: number, delta: number) => {
    const next = [...value.fallbacks];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    update({ fallbacks: next });
  };

  const exclude = [...(value.defaultModel ? [value.defaultModel] : []), ...value.fallbacks];
  const defaultWarning = refWarning(value.defaultModel);

  return (
    <Card
      title="Welches Modell NOVA verwendet"
      description="NOVA verwendet nur diese Modelle – in dieser Reihenfolge: das Modell der Rolle, dann das Standardmodell, dann die Ersatzmodelle von oben nach unten."
      icon={SlidersHorizontal}
      actions={dirty && <UnsavedBadge />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted">Kostenpflichtige Modelle sind gesperrt, bis der Anbieter freigegeben und ein Preis eingetragen ist (unten bei den Cloud-Anbietern).</p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              icon={RotateCcw}
              disabled={!dirty || save.loading}
              onClick={() => {
                setDraft(null);
                setErrors({});
              }}
            >
              Verwerfen
            </Button>
            <Button size="sm" variant="primary" icon={Save} loading={save.loading} disabled={!dirty} onClick={onSave}>
              Speichern
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {!value.defaultModel && (
          <Notice tone="warning" title="Noch kein Standardmodell gewählt">
            Agenten können erst arbeiten, wenn ein Modell gewählt ist. Am einfachsten ein lokales Modell mit „Werkzeuge“ wählen.
          </Notice>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <ModelSelect
              label="Standardmodell"
              value={value.defaultModel}
              onChange={(ref) => update({ defaultModel: ref, fallbacks: value.fallbacks.filter((f) => !sameRef(f, ref)) })}
              models={models}
              providers={providers}
              emptyLabel="Kein Modell gewählt"
              error={issueFor(errors, 'defaultModel')}
              hint="Wird für alle Aufgaben verwendet, wenn eine Rolle kein eigenes Modell hat."
            />
            {defaultWarning && <InlineWarning text={defaultWarning} />}
          </div>

          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-text">
              <ListOrdered aria-hidden className="h-3.5 w-3.5 text-violet-fg" />
              Ersatzmodelle (der Reihe nach)
            </p>
            <p className="mt-0.5 text-xs text-muted">Nur wenn das Standardmodell nicht verfügbar ist, nicht in den Grafikspeicher passt oder das Budget erreicht ist.</p>
            {value.fallbacks.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-xs text-muted">Keine Ersatzmodelle. Fällt das Standardmodell aus, pausiert NOVA die betroffenen Aufgaben.</p>
            ) : (
              <ol className="mt-2 space-y-1.5" aria-label="Ersatzmodelle">
                {value.fallbacks.map((f, i) => {
                  const warning = refWarning(f);
                  return (
                    <li key={refKey(f)} className="rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 shrink-0 text-xs font-semibold text-muted tabular-nums">{i + 1}.</span>
                        <ModelBadge
                          model={f}
                          local={models.find((m) => m.providerId === f.providerId && m.id === f.modelId)?.local}
                          paid={models.find((m) => m.providerId === f.providerId && m.id === f.modelId)?.paid}
                          className="min-w-0"
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">{providerById.get(f.providerId)?.name ?? f.providerId}</span>
                        <IconButton icon={ArrowUp} size="sm" label={`${f.modelId} nach oben`} disabled={i === 0} onClick={() => moveFallback(i, -1)} />
                        <IconButton icon={ArrowDown} size="sm" label={`${f.modelId} nach unten`} disabled={i === value.fallbacks.length - 1} onClick={() => moveFallback(i, 1)} />
                        <IconButton icon={Trash2} size="sm" label={`${f.modelId} entfernen`} onClick={() => update({ fallbacks: value.fallbacks.filter((_, j) => j !== i) })} />
                      </div>
                      {warning && <InlineWarning text={warning} className="mt-1 pl-7" />}
                    </li>
                  );
                })}
              </ol>
            )}
            {issueFor(errors, 'fallbacks') && (
              <p className="mt-1 text-xs text-danger-fg" role="alert">
                {issueFor(errors, 'fallbacks')}
              </p>
            )}
            <div className="mt-2 flex items-end gap-2">
              <ModelSelect
                ariaLabel="Ersatzmodell auswählen"
                value={toAdd}
                onChange={setToAdd}
                models={models}
                providers={providers}
                emptyLabel="Ersatzmodell auswählen …"
                exclude={exclude}
                size="sm"
                className="min-w-0 flex-1"
              />
              <Button
                size="sm"
                icon={Plus}
                disabled={!toAdd || exclude.some((r) => sameRef(r, toAdd))}
                onClick={() => {
                  if (!toAdd) return;
                  update({ fallbacks: [...value.fallbacks, toAdd] });
                  setToAdd(null);
                }}
              >
                Hinzufügen
              </Button>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-text">Eigenes Modell je Rolle</h3>
          <p className="mt-0.5 text-xs text-muted">Optional. Zum Beispiel ein schnelles Modell für Tests und ein stärkeres für die Planung.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ROLES.map((role) => {
              const ref = value.roleOverrides[role];
              const warning = refWarning(ref);
              return (
                <div key={role} className="space-y-1">
                  <ModelSelect
                    label={AGENT_ROLE[role].label}
                    hint={AGENT_ROLE[role].description}
                    value={ref}
                    onChange={(r) => update({ roleOverrides: { ...value.roleOverrides, [role]: r } })}
                    models={models}
                    providers={providers}
                    emptyLabel="Standardmodell verwenden"
                    error={issueFor(errors, `roleOverrides.${role}`)}
                  />
                  {warning && <InlineWarning text={warning} />}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-text">Feineinstellungen</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <NumberInput
              label="Kontextgröße lokaler Modelle"
              unit="Tokens"
              value={value.ollamaNumCtx}
              onChange={(t) => update({ ollamaNumCtx: t })}
              error={errors.ollamaNumCtx}
              hint="Wie viel Text ein lokales Modell auf einmal sieht. Mehr braucht mehr Grafikspeicher. Standard: 16.384."
            />
            <NumberInput
              label="Temperatur"
              decimal
              value={value.temperature}
              onChange={(t) => update({ temperature: t })}
              error={errors.temperature}
              hint="0 bis 2. Niedrig = genauer und wiederholbarer. Für Code empfohlen: 0,2."
            />
            <NumberInput
              label="Maximale Antwortlänge"
              unit="Tokens"
              value={value.maxOutputTokens}
              onChange={(t) => update({ maxOutputTokens: t })}
              error={errors.maxOutputTokens}
              hint="Obergrenze für eine einzelne Modellantwort (256 bis 65.536)."
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

function InlineWarning({ text, className }: { text: string; className?: string }) {
  return (
    <p className={`flex items-start gap-1 text-[11px] text-warning-fg ${className ?? ''}`}>
      <TriangleAlert aria-hidden className="mt-px h-3 w-3 shrink-0" />
      {text}
    </p>
  );
}
