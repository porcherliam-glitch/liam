// Installed Ollama models (UI-SPEC §4): size, parameters, quantization, family, context, capability badges,
// VRAM fit check (ollama.fit) with alternatives, use in the model selection, delete with confirmation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleHelp, CircleX, Gauge, HardDrive, RefreshCw, Trash2 } from 'lucide-react';
import type { ModelInfo, OllamaRunningModel } from '@shared/schemas';
import type { ModelSettings } from '@shared/settings';
import type { RpcResult } from '@shared/rpc';
import { Badge, Button, Card, type Column, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, StatusBadge, Table, Tooltip } from '../../components/ui';
import { useMutation, type UseRpcResult } from '../../hooks';
import { api, errorMessage } from '../../lib/api';
import { formatBytes, formatPercent, formatRelativeTime } from '../../lib/format';
import { AGENT_ROLE, MODEL_CAPABILITY, metaOf } from '../../lib/labels';
import { useNow } from '../../hooks/useNow';
import { Notice } from '../settings/shared/ui';
import { formatContext, OLLAMA_LOCAL_ID, refOf, selectionRoles } from './modelUtils';

type FitResult = RpcResult<'ollama.fit'>;
type FitEntry = { state: 'loading' } | { state: 'done'; result: FitResult } | { state: 'error'; message: string };

const ROLE_LABELS: Record<string, string> = Object.fromEntries(Object.entries(AGENT_ROLE).map(([k, v]) => [k, v.label]));

/** Runs ollama.fit once per model (cached) and on demand. */
export function useFitChecks(modelIds: readonly string[], enabled: boolean): { fits: Record<string, FitEntry>; check: (id: string) => void } {
  const [fits, setFits] = useState<Record<string, FitEntry>>({});
  const started = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback((id: string) => {
    started.current.add(id);
    setFits((prev) => ({ ...prev, [id]: { state: 'loading' } }));
    api('ollama.fit', { model: id })
      .then((result) => mounted.current && setFits((prev) => ({ ...prev, [id]: { state: 'done', result } })))
      .catch((e) => mounted.current && setFits((prev) => ({ ...prev, [id]: { state: 'error', message: errorMessage(e) } })));
  }, []);

  const key = modelIds.join('|');
  useEffect(() => {
    if (!enabled) return;
    for (const id of key ? key.split('|') : []) if (!started.current.has(id)) check(id);
  }, [key, enabled, check]);

  return { fits, check };
}

export interface LocalModelsCardProps {
  status: UseRpcResult<'ollama.status'>;
  models: UseRpcResult<'ollama.models'>;
  running: OllamaRunningModel[];
  selection: ModelSettings | undefined;
  /** Prefill the download form (alternatives of the fit check). */
  onSuggest: (name: string) => void;
}

export function LocalModelsCard({ status, models, running, selection, onSuggest }: LocalModelsCardProps) {
  const ollamaRunning = status.data?.running ?? false;
  const list = models.data ?? [];
  const { fits, check } = useFitChecks(
    list.map((m) => m.id),
    ollamaRunning && list.length > 0,
  );
  const [toDelete, setToDelete] = useState<ModelInfo | null>(null);
  const del = useMutation('ollama.delete', {
    successToast: (_r, p) => `${p?.model ?? 'Das Modell'} wurde gelöscht`,
    onSuccess: (_r, p) => {
      models.setData((prev) => prev?.filter((m) => m.id !== p?.model));
      setToDelete(null);
    },
  });
  const loaded = new Set(running.map((r) => r.model));

  const columns: Column<ModelInfo>[] = [
    {
      key: 'name',
      header: 'Modell',
      sortValue: (m) => m.id,
      cell: (m) => {
        const roles = selectionRoles(refOf(m), selection, ROLE_LABELS);
        return (
          <div className="min-w-0">
            <div className="truncate font-mono text-xs font-medium text-text" title={m.id}>
              {m.id}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {m.displayName && m.displayName !== m.id && <span className="text-[11px] text-muted">{m.displayName}</span>}
              {loaded.has(m.id) && (
                <Badge tone="success" title="Gerade im Speicher geladen">
                  Geladen
                </Badge>
              )}
              {roles.map((r) => (
                <Badge key={r} tone="violet" title="Wird in der Modellauswahl verwendet">
                  {r}
                </Badge>
              ))}
            </div>
          </div>
        );
      },
    },
    { key: 'size', header: 'Größe', align: 'right', sortValue: (m) => m.sizeBytes, cell: (m) => <span className="tabular-nums">{formatBytes(m.sizeBytes)}</span> },
    {
      key: 'details',
      header: <span title="Parameter · Quantisierung · Familie">Details</span>,
      sortValue: (m) => parseFloat(m.parameterSize ?? '') * (/m$/i.test(m.parameterSize ?? '') ? 0.001 : 1) || null,
      cell: (m) => (
        <div className="whitespace-nowrap">
          <div>{m.parameterSize ? `${m.parameterSize} Parameter` : '–'}</div>
          <div className="text-[11px] text-muted">
            <span className="font-mono" title="Quantisierung (Kompression der Gewichte)">
              {m.quantization ?? '–'}
            </span>
            {' · '}
            <span title="Modellfamilie">{m.family ?? '–'}</span>
          </div>
        </div>
      ),
    },
    { key: 'ctx', header: 'Kontext', align: 'right', sortValue: (m) => m.contextLength, cell: (m) => <span className="whitespace-nowrap tabular-nums">{formatContext(m.contextLength)}</span> },
    { key: 'caps', header: 'Fähigkeiten', cell: (m) => <CapabilityBadges model={m} /> },
    { key: 'fit', header: 'Grafikspeicher', cell: (m) => <FitCell entry={fits[m.id]} onCheck={() => check(m.id)} onSuggest={onSuggest} installed={list} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Aktionen</span>,
      align: 'right',
      cell: (m) => <IconButton icon={Trash2} label={`${m.id} löschen`} size="sm" variant="ghost" onClick={() => setToDelete(m)} />,
    },
  ];

  let body;
  if (status.loading || (ollamaRunning && models.loading)) body = <LoadingState compact label="Modelle werden geladen …" />;
  else if (!ollamaRunning)
    body = <EmptyState compact icon={HardDrive} title="Ollama läuft nicht" description="Sobald Ollama läuft, erscheinen hier die installierten Modelle." />;
  else if (models.error && !models.data) body = <ErrorState compact error={models.error} onRetry={() => void models.refetch()} />;
  else
    body = (
      <Table
        columns={columns}
        rows={list}
        rowKey={(m) => m.id}
        caption="Installierte lokale Modelle"
        initialSort={{ key: 'name', dir: 'asc' }}
        empty={<EmptyState compact icon={HardDrive} title="Noch kein Modell installiert" description="Rechts ein Modell herunterladen – zum Beispiel qwen2.5-coder:7b." />}
      />
    );

  return (
    <Card
      title="Installierte Modelle"
      description="Modelle, die Ollama auf diesem PC gespeichert hat. „Werkzeuge“ ist für selbstständig arbeitende Agenten nötig."
      icon={HardDrive}
      padding="none"
      actions={
        ollamaRunning && (
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={models.refreshing && !models.loading} onClick={() => void models.refetch()}>
            Neu laden
          </Button>
        )
      }
    >
      <div className="px-1 pb-1">{body}</div>
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Modell löschen?"
        confirmLabel="Löschen"
        loading={del.loading}
        onCancel={() => setToDelete(null)}
        onConfirm={() => (toDelete ? del.run({ model: toDelete.id }) : undefined)}
        message={
          <>
            <p>
              <span className="font-mono">{toDelete?.id}</span> wird von diesem PC entfernt ({formatBytes(toDelete?.sizeBytes)} werden frei). Es lässt sich später erneut herunterladen.
            </p>
            {toDelete && selectionRoles(refOf(toDelete), selection, ROLE_LABELS).length > 0 && toDelete.providerId === OLLAMA_LOCAL_ID && (
              <Notice tone="warning" className="mt-2">
                Das Modell ist in der Modellauswahl eingetragen ({selectionRoles(refOf(toDelete), selection, ROLE_LABELS).join(', ')}). Ohne Modell verwendet NOVA das nächste Ersatzmodell oder pausiert betroffene Aufgaben.
              </Notice>
            )}
          </>
        }
      />
    </Card>
  );
}

/** Capability badges ("Werkzeuge" highlighted; models without tools get a warning marker). */
export function CapabilityBadges({ model }: { model: Pick<ModelInfo, 'capabilities'> }) {
  if (model.capabilities.length === 0) return <span className="text-muted">unbekannt</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {model.capabilities.map((c) => (
        <StatusBadge key={c} meta={metaOf(MODEL_CAPABILITY, c)} />
      ))}
      {!model.capabilities.includes('tools') && model.capabilities.includes('completion') && (
        <Badge tone="warning" variant="outline" title="Ohne Werkzeuge kann das Modell nicht selbstständig Dateien bearbeiten oder Befehle ausführen.">
          ohne Werkzeuge
        </Badge>
      )}
    </div>
  );
}

function FitCell({ entry, onCheck, onSuggest, installed }: { entry: FitEntry | undefined; onCheck: () => void; onSuggest: (name: string) => void; installed: ModelInfo[] }) {
  if (!entry || entry.state === 'loading') {
    return entry ? (
      <span className="text-xs text-muted">Wird geprüft …</span>
    ) : (
      <Button size="sm" variant="ghost" icon={Gauge} onClick={onCheck}>
        Prüfen
      </Button>
    );
  }
  if (entry.state === 'error') {
    return (
      <div className="flex items-center gap-1">
        <Badge tone="neutral" icon={CircleHelp} title={entry.message}>
          Unbekannt
        </Badge>
        <IconButton icon={RefreshCw} label="Erneut prüfen" size="sm" onClick={onCheck} />
      </div>
    );
  }
  const r = entry.result;
  const tone = r.fits === true ? 'success' : r.fits === false ? 'danger' : 'neutral';
  const label = r.fits === true ? 'Passt' : r.fits === false ? 'Passt nicht' : 'Unbekannt';
  const icon = r.fits === true ? CircleCheck : r.fits === false ? CircleX : CircleHelp;
  const usage = r.requiredBytes != null && r.availableBytes != null ? `${formatBytes(r.requiredBytes)} von ${formatBytes(r.availableBytes)}${r.estimated ? ' (geschätzt)' : ''}` : null;
  const alternatives = r.alternatives.filter((a) => !installed.some((m) => m.id === a));
  return (
    <div className="min-w-0 space-y-1">
      <Tooltip content={<>{r.message}{usage && <span className="mt-1 block text-muted">Bedarf: {usage}</span>}</>}>
        <span tabIndex={0} className="inline-flex rounded focus-visible:outline-2 focus-visible:outline-violet">
          <Badge tone={tone} icon={icon}>
            {label}
            {r.fits !== null && r.requiredBytes != null && r.availableBytes ? ` · ${formatPercent((r.requiredBytes / r.availableBytes) * 100)}` : ''}
          </Badge>
        </span>
      </Tooltip>
      {r.fits === false && r.alternatives.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
          <span>Besser:</span>
          {r.alternatives.map((a) =>
            alternatives.includes(a) ? (
              <button key={a} type="button" onClick={() => onSuggest(a)} className="rounded font-mono text-blue-fg hover:underline" title={`${a} zum Herunterladen vorschlagen`}>
                {a}
              </button>
            ) : (
              <span key={a} className="font-mono" title="Bereits installiert">
                {a}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export interface RunningModelsCardProps {
  running: UseRpcResult<'ollama.running'>;
  ollamaRunning: boolean;
}

/** Models Ollama currently keeps in memory, with their VRAM share. */
export function RunningModelsCard({ running, ollamaRunning }: RunningModelsCardProps) {
  const now = useNow(15_000);
  const list = running.data ?? [];
  return (
    <Card title="Gerade geladen" description="Modelle, die Ollama im Speicher hält. Nach einigen Minuten ohne Nutzung werden sie entladen." icon={Gauge}>
      {!ollamaRunning ? (
        <p className="text-xs text-muted">Ollama läuft nicht.</p>
      ) : running.loading ? (
        <LoadingState compact />
      ) : running.error && !running.data ? (
        <ErrorState compact error={running.error} onRetry={() => void running.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact icon={Gauge} title="Kein Modell geladen" description="Ein Modell wird geladen, sobald ein Agent es verwendet." />
      ) : (
        <ul className="space-y-2.5">
          {list.map((r) => {
            const gpuShare = r.sizeBytes > 0 ? (r.vramBytes / r.sizeBytes) * 100 : null;
            const expires = r.expiresAt ? Date.parse(r.expiresAt) : NaN;
            const remaining = expires - now;
            // Ollama reports a far-future expiry for models pinned with keep_alive = -1.
            const expiry = !Number.isFinite(remaining) || remaining <= 0 ? '' : remaining > 86_400_000 ? ' · bleibt geladen' : ` · wird ${formatRelativeTime(expires, now)} entladen`;
            return (
              <li key={r.model} className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-medium" title={r.model}>
                    {r.model}
                  </span>
                  {gpuShare != null && (
                    <Badge tone={gpuShare >= 99 ? 'success' : 'warning'} title={gpuShare >= 99 ? 'Läuft vollständig im Grafikspeicher' : 'Ein Teil läuft auf dem Prozessor und ist langsamer'}>
                      {gpuShare >= 99 ? '100 % Grafikkarte' : `${formatPercent(gpuShare)} Grafikkarte`}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Grafikspeicher {formatBytes(r.vramBytes)} von {formatBytes(r.sizeBytes)}
                  {r.contextLength ? ` · Kontext ${formatContext(r.contextLength)}` : ''}
                  {expiry}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
