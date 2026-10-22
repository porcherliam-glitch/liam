// Cloud and local model providers (UI-SPEC §4 / §7): list with health, add/edit, test, enable, remove,
// and prices per paid model ("geschätzt").
import { useMemo, useState } from 'react';
import { ChevronDown, Cloud, Coins, Cpu, KeyRound, Pencil, PlugZap, Plus, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react';
import type { ModelInfo, ProviderConfig, ProviderHealth } from '@shared/schemas';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, Input, LoadingState, StatusBadge, Switch } from '../../components/ui';
import { RelativeTime } from '../../components/common';
import { useMutation, type UseRpcResult } from '../../hooks';
import { cn } from '../../lib/cn';
import { formatUsd, plural } from '../../lib/format';
import { PROVIDER_HEALTH, PROVIDER_TYPE, metaOf } from '../../lib/labels';
import { FREE_CLOUD_PROVIDER_TEXT } from '../../lib/texts';
import { toast } from '../../stores/toasts';
import { Notice } from '../settings/shared/ui';
import { CapabilityBadges } from './LocalModelsCard';
import { PricingDialog } from './PricingDialog';
import { ProviderDialog } from './ProviderDialog';
import { formatContext, isCloudProvider, modelUsability, OLLAMA_LOCAL_ID } from './modelUtils';

const MODELS_PREVIEW = 8;

export interface ProvidersCardProps {
  providers: UseRpcResult<'providers.list'>;
  health: UseRpcResult<'providers.health'>;
  models: UseRpcResult<'models.list'>;
  secureStore: boolean | null;
  onRefreshModels: () => Promise<void>;
  refreshingModels: boolean;
}

function sortProviders(list: ProviderConfig[]): ProviderConfig[] {
  return [...list].sort((a, b) => Number(b.id === OLLAMA_LOCAL_ID) - Number(a.id === OLLAMA_LOCAL_ID) || a.name.localeCompare(b.name, 'de'));
}

export function ProvidersCard({ providers, health, models, secureStore, onRefreshModels, refreshingModels }: ProvidersCardProps) {
  const [dialog, setDialog] = useState<{ provider: ProviderConfig | null } | null>(null);
  const [toRemove, setToRemove] = useState<ProviderConfig | null>(null);
  const [pricing, setPricing] = useState<ModelInfo | null>(null);
  const [tested, setTested] = useState<Record<string, ProviderHealth>>({});

  const remove = useMutation('providers.remove', {
    successToast: (_r, p) => `${providers.data?.find((x) => x.id === p?.id)?.name ?? 'Anbieter'} entfernt`,
    onSuccess: (_r, p) => {
      providers.setData((prev) => prev?.filter((x) => x.id !== p?.id));
      models.setData((prev) => prev?.filter((m) => m.providerId !== p?.id));
      setToRemove(null);
    },
  });

  const healthById = useMemo(() => {
    const map = new Map<string, ProviderHealth>();
    for (const h of health.data ?? []) map.set(h.providerId, h);
    for (const h of Object.values(tested)) {
      const prev = map.get(h.providerId);
      if (!prev || prev.checkedAt <= h.checkedAt) map.set(h.providerId, h);
    }
    return map;
  }, [health.data, tested]);

  const applySaved = (p: ProviderConfig) => {
    providers.setData((prev) => (prev?.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...(prev ?? []), p]));
    void health.refetch();
    void models.refetch();
  };

  const list = sortProviders(providers.data ?? []);

  return (
    <Card
      title="Anbieter"
      description="Woher die Modelle kommen: Ollama auf diesem PC, lokale Server wie LM Studio oder Cloud-Dienste. Cloud-Anbieter bekommen Projektinhalte nur nach einer Freigabe pro Projekt."
      icon={Cloud}
      actions={
        <>
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={refreshingModels} onClick={() => void onRefreshModels()}>
            Modelle neu abrufen
          </Button>
          <Button size="sm" variant="primary" icon={Plus} onClick={() => setDialog({ provider: null })}>
            Anbieter hinzufügen
          </Button>
        </>
      }
    >
      {providers.loading ? (
        <LoadingState compact />
      ) : providers.error && !providers.data ? (
        <ErrorState compact error={providers.error} onRetry={() => void providers.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          compact
          icon={Cloud}
          title="Noch kein Anbieter eingerichtet"
          description="Ollama wird automatisch eingetragen, sobald der Hintergrunddienst läuft. Cloud-Anbieter sind optional."
          actions={
            <Button size="sm" icon={Plus} onClick={() => setDialog({ provider: null })}>
              Anbieter hinzufügen
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {list.map((p) => (
            <ProviderRow
              key={p.id}
              provider={p}
              health={healthById.get(p.id)}
              models={(models.data ?? []).filter((m) => m.providerId === p.id)}
              onEdit={() => setDialog({ provider: p })}
              onRemove={() => setToRemove(p)}
              onTested={(h) => setTested((prev) => ({ ...prev, [h.providerId]: h }))}
              onUpdated={applySaved}
              onPricing={setPricing}
            />
          ))}
        </ul>
      )}

      <ProviderDialog open={dialog !== null} provider={dialog?.provider ?? null} secureStore={secureStore} onClose={() => setDialog(null)} onSaved={applySaved} />
      <PricingDialog model={pricing} onClose={() => setPricing(null)} onSaved={(m) => models.setData((prev) => prev?.map((x) => (x.providerId === m.providerId && x.id === m.id ? m : x)))} />
      <ConfirmDialog
        open={toRemove !== null}
        tone="danger"
        title="Anbieter entfernen?"
        confirmLabel="Entfernen"
        loading={remove.loading}
        onCancel={() => setToRemove(null)}
        onConfirm={() => (toRemove ? remove.run({ id: toRemove.id }) : undefined)}
        message={
          <p>
            <strong>{toRemove?.name}</strong> und der gespeicherte Schlüssel werden aus NOVA entfernt. Modelle dieses Anbieters werden danach nicht mehr verwendet – auch nicht als Ersatzmodell. Bisherige Kostenangaben bleiben erhalten.
          </p>
        }
      />
    </Card>
  );
}

interface ProviderRowProps {
  provider: ProviderConfig;
  health: ProviderHealth | undefined;
  models: ModelInfo[];
  onEdit: () => void;
  onRemove: () => void;
  onTested: (h: ProviderHealth) => void;
  onUpdated: (p: ProviderConfig) => void;
  onPricing: (m: ModelInfo) => void;
}

function ProviderRow({ provider: p, health, models, onEdit, onRemove, onTested, onUpdated, onPricing }: ProviderRowProps) {
  const [open, setOpen] = useState(false);
  const cloud = isCloudProvider(p);
  const isOllama = p.type === 'ollama';
  const test = useMutation('providers.test', {
    onSuccess: (h) => {
      onTested(h);
      if (h.status === 'ok') toast.success(`${p.name}: Verbindung klappt`, h.message);
      else toast.warning(`${p.name}: ${metaOf(PROVIDER_HEALTH, h.status).label}`, h.message);
    },
  });
  const toggle = useMutation('providers.upsert', {
    successToast: (r) => (r.enabled ? `${r.name} eingeschaltet` : `${r.name} ausgeschaltet`),
    onSuccess: onUpdated,
  });
  const meta = health ? metaOf(PROVIDER_HEALTH, health.status) : null;
  const unpriced = p.paid ? models.filter((m) => !m.pricing).length : 0;

  return (
    <li className="rounded-lg border border-border bg-surface-2/40">
      <div className="flex flex-wrap items-start gap-3 px-3.5 py-3">
        <span className={cn('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', cloud ? 'bg-blue/12 text-blue-fg' : 'bg-success/12 text-success-fg')}>
          {cloud ? <Cloud aria-hidden className="h-4 w-4" /> : <Cpu aria-hidden className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[13px] font-semibold">{p.name}</h3>
            <StatusBadge meta={metaOf(PROVIDER_TYPE, p.type)} />
            {meta && health && (
              <StatusBadge meta={meta} title={`${health.message}${health.latencyMs != null ? ` · ${health.latencyMs} ms` : ''}`}>
                {meta.label}
                {health.status === 'ok' && health.latencyMs != null ? ` · ${health.latencyMs} ms` : ''}
              </StatusBadge>
            )}
            {p.paid ? (
              <Badge tone={p.approved ? 'warning' : 'neutral'} icon={Coins} title={p.approved ? 'Kostenpflichtige Nutzung ist freigegeben' : 'Kostenpflichtige Nutzung ist nicht freigegeben'}>
                {p.approved ? 'Kostenpflichtig · freigegeben' : 'Kostenpflichtig · nicht freigegeben'}
              </Badge>
            ) : (
              <Badge tone="success">Kostenlos</Badge>
            )}
            {!isOllama && (
              <Badge tone={p.hasApiKey ? 'success' : 'neutral'} icon={KeyRound}>
                {p.hasApiKey ? 'Schlüssel gespeichert' : 'Kein Schlüssel'}
              </Badge>
            )}
          </div>
          <p className="truncate font-mono text-xs text-muted" title={p.baseUrl}>
            {p.baseUrl}
          </p>
          {health && (
            <p className="text-xs text-muted">
              {health.message} <RelativeTime ts={health.checkedAt} prefix="· geprüft" className="text-subtle" />
            </p>
          )}
          {cloud && !p.paid && !isOllama && (
            <Notice tone="warning" title={FREE_CLOUD_PROVIDER_TEXT} className="mt-1">
              Der Anbieter läuft nicht auf diesem PC, ist aber als kostenlos eingetragen. Bitte unter „Bearbeiten“ prüfen.
            </Notice>
          )}
          {p.paid && !p.approved && <p className="text-xs text-muted">Modelle dieses Anbieters werden nicht verwendet, bis die kostenpflichtige Nutzung freigegeben ist (unter „Bearbeiten“).</p>}
          {p.paid && p.approved && cloud && !p.hasApiKey && (
            <p className="flex items-center gap-1 text-xs text-warning-fg">
              <TriangleAlert aria-hidden className="h-3.5 w-3.5" />
              Ohne API-Schlüssel kann NOVA diesen Anbieter nicht verwenden.
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <Switch
            size="sm"
            checked={p.enabled}
            disabled={toggle.loading}
            ariaLabel={`${p.name} eingeschaltet`}
            onChange={(enabled) => void toggle.run({ id: p.id, type: p.type, name: p.name, baseUrl: p.baseUrl, enabled })}
          />
          <Button size="sm" icon={PlugZap} loading={test.loading} onClick={() => void test.run({ providerId: p.id })}>
            Testen
          </Button>
          <IconButton icon={Pencil} size="sm" label={`${p.name} bearbeiten`} onClick={onEdit} />
          {p.id !== OLLAMA_LOCAL_ID && <IconButton icon={Trash2} size="sm" label={`${p.name} entfernen`} onClick={onRemove} />}
        </div>
      </div>
      {!isOllama && (
        <div className="border-t border-border">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-xs text-muted hover:text-text"
          >
            <span>
              {models.length === 0 ? 'Keine Modelle abgerufen' : plural(models.length, 'Modell', 'Modelle')}
              {unpriced > 0 && <span className="text-warning-fg"> · {unpriced} ohne Preis</span>}
            </span>
            <span className="inline-flex items-center gap-1">
              {open ? 'Modelle ausblenden' : 'Modelle und Preise anzeigen'}
              <ChevronDown aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', open && 'rotate-180')} />
            </span>
          </button>
          {open && <ProviderModels provider={p} models={models} onPricing={onPricing} />}
        </div>
      )}
    </li>
  );
}

function ProviderModels({ provider, models, onPricing }: { provider: ProviderConfig; models: ModelInfo[]; onPricing: (m: ModelInfo) => void }) {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const q = query.trim().toLowerCase();
  const filtered = q ? models.filter((m) => m.id.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q)) : models;
  const shown = showAll || q ? filtered : filtered.slice(0, MODELS_PREVIEW);

  if (models.length === 0) {
    return (
      <p className="px-3.5 pb-3 text-xs text-muted">
        {provider.enabled ? 'Der Anbieter hat noch keine Modelle gemeldet. „Testen“ oder „Modelle neu abrufen“ versuchen.' : 'Der Anbieter ist ausgeschaltet.'}
      </p>
    );
  }
  return (
    <div className="space-y-2 px-3.5 pb-3">
      {models.length > MODELS_PREVIEW && (
        <Input size="sm" icon={Search} aria-label={`Modelle von ${provider.name} durchsuchen`} placeholder="Modell suchen …" value={query} onChange={(e) => setQuery(e.target.value)} containerClassName="max-w-xs" />
      )}
      <ul className="divide-y divide-border/60 rounded-lg border border-border bg-surface">
        {shown.map((m) => {
          const use = modelUsability(m, provider);
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-text" title={m.id}>
                  {m.id}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                  {m.contextLength != null && <span>Kontext {formatContext(m.contextLength)}</span>}
                  <CapabilityBadges model={m} />
                </div>
              </div>
              <div className="text-right text-xs">
                {m.pricing ? (
                  <span className="tabular-nums" title="US-Dollar pro einer Million Tokens">
                    {formatUsd(m.pricing.inputPerMTokUsd)} / {formatUsd(m.pricing.outputPerMTokUsd)} je 1 Mio.
                    {m.pricing.estimated && (
                      <Badge tone="warning" variant="outline" className="ml-1">
                        geschätzt
                      </Badge>
                    )}
                  </span>
                ) : m.paid ? (
                  <span className="text-warning-fg">Kein Preis eingetragen</span>
                ) : (
                  <span className="text-muted">kostenlos</span>
                )}
                <div className={cn('text-[11px]', use.usable ? 'text-success-fg' : 'text-muted')}>{use.usable ? 'Kann verwendet werden' : `Gesperrt: ${use.reason}`}</div>
              </div>
              {m.paid && (
                <Button size="sm" icon={Coins} onClick={() => onPricing(m)} aria-label={`Preis für ${m.id} ${m.pricing ? 'ändern' : 'festlegen'}`}>
                  {m.pricing ? 'Preis ändern' : 'Preis festlegen'}
                </Button>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="px-3 py-3 text-center text-xs text-muted">Kein Modell passt zur Suche.</li>}
      </ul>
      {!q && !showAll && filtered.length > MODELS_PREVIEW && (
        <Button size="sm" variant="ghost" onClick={() => setShowAll(true)}>
          Alle {filtered.length} Modelle anzeigen
        </Button>
      )}
    </div>
  );
}
