// "3D-Modelle" (SPEC-3D §1/§3): the separate slot for the local 3D models of the 3D-Werkstatt – install state, size,
// license, download with progress/cancel (operation 'threed_download'), delete with confirmation, the ComfyUI state
// and a link to the 3D-Werkstatt.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Box, CircleCheck, CircleDashed, Download, FolderOpen, RotateCw, Trash2, X } from 'lucide-react';
import type { Operation, ThreeDModel, ThreeDModelId } from '@shared/schemas';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, StatusBadge } from '../../components/ui';
import { useMutation, useNovaEvent } from '../../hooks';
import { useDaemonStore } from '../../stores/daemon';
import { api, isRpcError } from '../../lib/api';
import { formatBytes, plural } from '../../lib/format';
import { THREED_MODEL_PURPOSE } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { OperationProgress } from '../settings/shared/OperationProgress';
import { Notice } from '../settings/shared/ui';
import { EngineSummary } from '../threed/ThreeDSettingsCard';
import { filesFreedByDelete, VRAM_GUIDE_TEXT } from '../threed/threedUtils';
import { restartDaemon, useChooseModelsDir, useEngineStatus, useThreeDModels, useThreeDSupported } from '../threed/useThreeD';

/**
 * Which model a running download belongs to (operation id → model id). Module level so the association survives
 * page changes; operations started elsewhere (or before a reload) are shown as unassigned downloads.
 */
const downloadOwners = new Map<string, ThreeDModelId>();

/** Running and recently finished 3D downloads, live from 'operation.updated'. */
function useThreeDDownloads(onFinished: () => void) {
  const [ops, setOps] = useState<Record<string, Operation>>({});
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

  useEffect(() => {
    let cancelled = false;
    api('operations.list', { activeOnly: true })
      .then((list) => {
        if (cancelled) return;
        const running = list.filter((o) => o.kind === 'threed_download');
        setOps((prev) => ({ ...Object.fromEntries(running.map((o) => [o.id, o])), ...prev }));
      })
      .catch(() => {
        /* the list stays empty; new downloads still appear through events */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useNovaEvent('operation.updated', (op) => {
    if (op.kind !== 'threed_download') return;
    setOps((prev) => ({ ...prev, [op.id]: op }));
    if (op.status === 'done') finishedRef.current();
  });

  const start = useCallback((modelId: ThreeDModelId, op: Operation) => {
    downloadOwners.set(op.id, modelId);
    setOps((prev) => ({ ...prev, [op.id]: op }));
  }, []);
  const dismiss = useCallback((opId: string) => {
    downloadOwners.delete(opId);
    setOps((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => id !== opId)));
  }, []);

  const all = Object.values(ops).sort((a, b) => b.startedAt - a.startedAt);
  const forModel = (id: ThreeDModelId) => all.find((o) => downloadOwners.get(o.id) === id) ?? null;
  const unassigned = all.filter((o) => o.status === 'running' && !downloadOwners.has(o.id));
  return { start, dismiss, forModel, unassigned };
}

export interface ThreeDModelsCardProps {
  id?: string;
  /** Scroll the card into view once its data is loaded (link "3D-Modelle verwalten"). */
  scrollIntoView?: boolean;
}

export function ThreeDModelsCard({ id, scrollIntoView = false }: ThreeDModelsCardProps) {
  const supported = useThreeDSupported();
  const header = {
    id,
    title: '3D-Modelle',
    description: 'Lokale KI-Modelle für die 3D-Werkstatt (Text zu 3D und Bild zu 3D). Sie laufen in ComfyUI auf diesem PC – getrennt von den Sprachmodellen der Agenten.',
    icon: Box,
  };
  if (!supported) {
    return (
      <Card {...header}>
        <Notice
          tone="info"
          actions={
            <Button size="sm" icon={RotateCw} onClick={() => void restartDaemon()}>
              Dienst neu starten
            </Button>
          }
        >
          Der Hintergrunddienst läuft noch in einer älteren Version ohne 3D-Werkstatt. Nach einem Neustart des Dienstes erscheinen hier die 3D-Modelle.
        </Notice>
      </Card>
    );
  }
  return (
    <Card
      {...header}
      actions={
        <Link to={paths.threed} className="inline-flex items-center gap-1 text-xs font-medium">
          Zur 3D-Werkstatt
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      }
    >
      <ThreeDModelsBody cardId={id} scrollIntoView={scrollIntoView} />
    </Card>
  );
}

function ThreeDModelsBody({ cardId, scrollIntoView }: { cardId?: string; scrollIntoView: boolean }) {
  const engine = useEngineStatus();
  const models = useThreeDModels();
  const loaded = models.data !== undefined;
  const scrolled = useRef(false);

  // Cards above load at the same time and change the layout – scroll after this card has its data, then once more.
  useEffect(() => {
    if (!scrollIntoView || !loaded || !cardId || scrolled.current) return;
    const scroll = () => {
      scrolled.current = true;
      document.getElementById(cardId)?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    };
    const first = requestAnimationFrame(scroll);
    const second = setTimeout(scroll, 600);
    return () => {
      cancelAnimationFrame(first);
      clearTimeout(second);
    };
  }, [scrollIntoView, loaded, cardId]);
  const downloads = useThreeDDownloads(() => void models.refetch());
  const folder = useChooseModelsDir(engine.setData);
  const [toDelete, setToDelete] = useState<ThreeDModel | null>(null);
  const [rowErrors, setRowErrors] = useState<Partial<Record<ThreeDModelId, { message: string; approval: boolean }>>>({});
  const [startingId, setStartingId] = useState<ThreeDModelId | null>(null);

  const download = useMutation('threed.downloadModel', {
    errorToast: false,
    onSuccess: (op, p) => {
      if (!p) return;
      setRowErrors((prev) => ({ ...prev, [p.id]: undefined }));
      downloads.start(p.id, op);
    },
    onError: (e, p) => {
      if (!p) return;
      const approval = isRpcError(e, 'APPROVAL_REQUIRED') || isRpcError(e, 'NETWORK_BLOCKED');
      setRowErrors((prev) => ({ ...prev, [p.id]: { message: e.message, approval } }));
    },
  });
  const del = useMutation('threed.deleteModel', {
    successToast: (_r, p) => `${models.data?.find((m) => m.id === p?.id)?.name ?? 'Das 3D-Modell'} wurde gelöscht`,
    onSuccess: () => {
      setToDelete(null);
      void models.refetch();
    },
  });

  const list = models.data ?? [];
  const modelsDir = engine.data?.modelsDir ?? null;
  const folderMissing = engine.data != null && !modelsDir;
  const freed = toDelete ? filesFreedByDelete(toDelete, list) : [];
  const freedBytes = freed.reduce((s, f) => s + f.sizeBytes, 0);
  const keptFor = toDelete ? list.filter((m) => m.id !== toDelete.id && m.installed && m.files.some((f) => toDelete.files.some((t) => t.name === f.name && t.folder === f.folder))) : [];

  return (
    <div className="space-y-3">
      <EngineSummary engine={engine} showLink={false} />
      {folderMissing && (
        <Notice
          tone="warning"
          title="Modellordner unbekannt"
          actions={
            <Button size="sm" variant="primary" icon={FolderOpen} loading={folder.busy} onClick={() => void folder.choose(null)}>
              Modellordner wählen …
            </Button>
          }
        >
          NOVA weiß noch nicht, wo ComfyUI seine Modelle speichert. Bitte den Ordner „models“ von ComfyUI wählen – erst dann sind Downloads möglich.
        </Notice>
      )}
      <Notice tone="info">
        {VRAM_GUIDE_TEXT} Die Dateien kommen von Hugging Face (huggingface.co); beim ersten Download fragt NOVA unter „Freigaben“, ob diese Adresse erlaubt ist. Ein abgebrochener Download wird beim
        nächsten Mal fortgesetzt.
      </Notice>

      {downloads.unassigned.map((op) => (
        <OperationProgress key={op.id} operation={op} />
      ))}

      {models.loading ? (
        <LoadingState compact label="3D-Modelle werden geladen …" />
      ) : models.error && !models.data ? (
        <ErrorState compact error={models.error} onRetry={() => void models.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState compact icon={Box} title="Keine 3D-Modelle bekannt" description="Der Hintergrunddienst hat keine 3D-Modelle gemeldet." />
      ) : (
        <ul className="space-y-2.5" aria-label="3D-Modelle">
          {list.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              operation={downloads.forModel(m.id)}
              error={rowErrors[m.id] ?? null}
              downloadDisabledReason={folderMissing ? 'Zuerst den Modellordner wählen.' : null}
              starting={download.loading && startingId === m.id}
              onDownload={() => {
                setStartingId(m.id);
                void download.run({ id: m.id });
              }}
              onDelete={() => setToDelete(m)}
              onDismiss={(opId) => downloads.dismiss(opId)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="3D-Modell löschen?"
        confirmLabel="Löschen"
        loading={del.loading}
        onCancel={() => setToDelete(null)}
        onConfirm={() => (toDelete ? del.run({ id: toDelete.id }) : undefined)}
        message={
          <>
            <p>
              {toDelete?.name} wird aus dem Modellordner von ComfyUI entfernt:{' '}
              {freed.length > 0 ? `${plural(freed.length, 'Datei', 'Dateien')}, ${formatBytes(freedBytes)} werden frei.` : 'keine Datei wird frei.'} Es lässt sich später erneut herunterladen.
            </p>
            {keptFor.length > 0 && (
              <p className="mt-2 text-muted">Dateien, die auch {keptFor.map((m) => m.name).join(' und ')} braucht, bleiben erhalten.</p>
            )}
          </>
        }
      />
    </div>
  );
}

interface ModelRowProps {
  model: ThreeDModel;
  operation: Operation | null;
  error: { message: string; approval: boolean } | null;
  downloadDisabledReason: string | null;
  starting: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onDismiss: (opId: string) => void;
}

function ModelRow({ model: m, operation, error, downloadDisabledReason, starting, onDownload, onDelete, onDismiss }: ModelRowProps) {
  const downloading = operation?.status === 'running';
  const pendingApprovals = useDaemonStore((s) => s.pendingApprovals);
  const anyPresent = m.files.some((f) => f.present);
  const partial = !m.installed && anyPresent;
  const finished = operation && operation.status !== 'running' ? operation : null;
  return (
    <li className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-[13px] font-semibold text-text">{m.name}</h3>
            <StatusBadge meta={THREED_MODEL_PURPOSE[m.purpose] ?? { label: m.purpose, tone: 'neutral', icon: Box }} />
            {m.installed ? (
              <Badge tone="success" icon={CircleCheck}>
                Installiert
              </Badge>
            ) : partial ? (
              <Badge tone="warning" icon={CircleDashed}>
                Teilweise vorhanden
              </Badge>
            ) : (
              <Badge tone="neutral" icon={Download}>
                Nicht installiert
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted">{m.description}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted">Größe</dt>
              <dd className="text-text tabular-nums">{formatBytes(m.totalBytes)}</dd>
            </div>
            <div>
              <dt className="text-muted">Fehlt noch</dt>
              <dd className="text-text tabular-nums">{m.missingBytes > 0 ? formatBytes(m.missingBytes) : '–'}</dd>
            </div>
            <div>
              <dt className="text-muted">Grafikspeicher</dt>
              <dd className="text-text">empfohlen ab {formatBytes(m.vramRecommendedBytes)}</dd>
            </div>
            <div>
              <dt className="text-muted">Lizenz</dt>
              <dd className="text-text" title={m.source}>
                {m.license}
              </dd>
            </div>
          </dl>
          <p className="mt-1 text-[11px] text-subtle">Quelle: {m.source}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!m.installed && !downloading && (
            <Button
              size="sm"
              variant="primary"
              icon={Download}
              loading={starting}
              disabled={!!downloadDisabledReason}
              title={downloadDisabledReason ?? undefined}
              onClick={onDownload}
              aria-label={`${m.name} herunterladen (${formatBytes(m.missingBytes)})`}
            >
              {partial ? 'Rest herunterladen' : 'Herunterladen'} ({formatBytes(m.missingBytes)})
            </Button>
          )}
          {anyPresent && !downloading && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={onDelete} aria-label={`${m.name} löschen`}>
              Löschen
            </Button>
          )}
        </div>
      </div>
      {downloading && operation && <OperationProgress className="mt-2" operation={operation} />}
      {downloading && pendingApprovals > 0 && (
        <p className="mt-1 text-xs text-muted">
          Wartet der Download auf die Freigabe für Hugging Face, steht sie unter{' '}
          <Link to={paths.approvals} className="font-medium">
            Freigaben ({pendingApprovals} offen)
          </Link>
          .
        </p>
      )}
      {finished && finished.status !== 'done' && (
        <div className="mt-2 flex items-start justify-between gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs">
          <p className={finished.status === 'failed' ? 'text-danger-fg' : 'text-muted'}>
            {finished.status === 'failed' ? `Download fehlgeschlagen: ${finished.error ?? finished.message ?? 'unbekannter Fehler'}` : 'Download abgebrochen. Beim nächsten Mal geht es an derselben Stelle weiter.'}
          </p>
          <IconButton icon={X} size="sm" label="Hinweis ausblenden" onClick={() => onDismiss(finished.id)} />
        </div>
      )}
      {error && (
        <Notice
          tone={error.approval ? 'info' : 'danger'}
          className="mt-2"
          title={error.approval ? 'Freigabe nötig' : 'Download nicht gestartet'}
          actions={
            error.approval ? (
              <Link to={paths.approvals} className="text-xs font-medium">
                Zu den Freigaben
              </Link>
            ) : undefined
          }
        >
          {error.message}
        </Notice>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted hover:text-text">Dateien ({m.files.length})</summary>
        <ul className="mt-1.5 space-y-1">
          {m.files.map((f) => (
            <li key={`${f.folder}/${f.name}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              {f.present ? <CircleCheck aria-label="vorhanden" className="h-3.5 w-3.5 text-success-fg" /> : <CircleDashed aria-label="fehlt" className="h-3.5 w-3.5 text-muted" />}
              <span className="min-w-0 font-mono text-[11px] break-all text-text">
                {f.folder}/{f.name}
              </span>
              <span className="text-[11px] text-muted tabular-nums">{formatBytes(f.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}
