// ComfyUI status card of the 3D-Werkstatt (SPEC-3D §2): running / not installed / not started / too old, version,
// GPU + VRAM, models folder and plain-language next steps with buttons (install via the approval flow, re-check,
// choose the models folder).
import { useState } from 'react';
import { Link } from 'react-router';
import { BookOpen, Download, ExternalLink, FolderOpen, Gpu, RefreshCw } from 'lucide-react';
import type { RpcResult } from '@shared/rpc';
import type { ThreeDEngineStatus } from '@shared/schemas';
import { Badge, Button, Card, CodeBlock, ErrorState, KeyValue, LoadingState, StatusBadge } from '../../components/ui';
import { RelativeTime } from '../../components/common';
import { useMutation, useRpc } from '../../hooks';
import { formatBytes } from '../../lib/format';
import { paths } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { openWebsite } from '../settings/shared/files';
import { Notice } from '../settings/shared/ui';
import { COMFYUI_DOWNLOAD_URL, COMFYUI_INTEGRATION_ID, COMFYUI_UPDATE_GUIDE_URL, ENGINE_STATE, engineState, gpuAdvice, type EngineState } from './threedUtils';
import { useChooseModelsDir, type EngineStatusResult } from './useThreeD';

export interface EngineCardProps {
  engine: EngineStatusResult;
  /** Card id (anchor for "Oben steht, wie es geht"). */
  id?: string;
}

export function EngineCard({ engine, id }: EngineCardProps) {
  const s = engine.data;
  const state = s ? engineState(s) : null;
  const folder = useChooseModelsDir(engine.setData);

  return (
    <Card
      id={id}
      title="ComfyUI – das 3D-Programm"
      description="ComfyUI führt die 3D-Modelle auf diesem PC aus. Es ist kostenlos und ein eigenes Programm; NOVA steuert es nur über seine lokale Schnittstelle."
      icon={Gpu}
      actions={
        <Button size="sm" icon={RefreshCw} loading={engine.checking} onClick={() => void engine.recheck()} disabled={!s && engine.loading}>
          Erneut prüfen
        </Button>
      }
    >
      {engine.loading ? (
        <LoadingState compact label="ComfyUI wird gesucht …" />
      ) : !s || !state ? (
        <ErrorState compact error={engine.error} title="Der Status von ComfyUI konnte nicht geladen werden" onRetry={() => void engine.refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge size="md" meta={ENGINE_STATE[state]} />
            {s.version && <Badge tone="neutral">Version {s.version}</Badge>}
            {s.running && !s.modelsDir && (
              <Badge tone="warning" icon={FolderOpen}>
                Modellordner fehlt
              </Badge>
            )}
          </div>
          <KeyValue
            columns={3}
            items={[
              { label: 'Adresse', value: s.baseUrl, mono: true },
              { label: 'Grafikkarte', value: <GpuValue status={s} /> },
              {
                label: 'Modellordner',
                value: (
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={s.modelsDir ? 'font-mono text-xs break-all' : 'text-muted'}>{s.modelsDir ?? 'noch nicht bekannt'}</span>
                    <Button size="sm" variant="ghost" icon={FolderOpen} loading={folder.busy} onClick={() => void folder.choose(s.modelsDir)}>
                      {s.modelsDir ? 'Ändern …' : 'Modellordner wählen …'}
                    </Button>
                  </span>
                ),
              },
              { label: 'Zuletzt geprüft', value: <RelativeTime ts={s.checkedAt} /> },
            ]}
          />
          <EngineHelp status={s} state={state} onChooseFolder={() => void folder.choose(s.modelsDir)} choosingFolder={folder.busy} />
        </div>
      )}
    </Card>
  );
}

function GpuValue({ status: s }: { status: ThreeDEngineStatus }) {
  if (!s.running) return <span className="text-muted">unbekannt (ComfyUI läuft nicht)</span>;
  const advice = gpuAdvice(s.gpu);
  return (
    <span className="block space-y-1">
      <span className="block">{s.gpu?.name ?? 'keine erkannt'}</span>
      {s.gpu?.vramTotalBytes != null && (
        <span className="block text-xs text-muted">
          {formatBytes(s.gpu.vramTotalBytes)} Grafikspeicher{s.gpu.vramFreeBytes != null ? `, ${formatBytes(s.gpu.vramFreeBytes)} frei` : ''}
        </span>
      )}
      <Badge tone={advice.tone} title={advice.text}>
        {advice.label}
      </Badge>
    </span>
  );
}

interface EngineHelpProps {
  status: ThreeDEngineStatus;
  state: EngineState;
  onChooseFolder: () => void;
  choosingFolder: boolean;
}

/** Next steps for the current ComfyUI state (German, beginner friendly). */
function EngineHelp({ status: s, state, onChooseFolder, choosingFolder }: EngineHelpProps) {
  const daemonMessage = s.message && <p className="mt-1.5 text-xs">Meldung von NOVA: {s.message}</p>;
  if (state === 'missing') return <InstallHelp message={s.message} />;
  if (state === 'stopped') {
    return (
      <Notice tone="warning" title="ComfyUI ist installiert, läuft aber nicht">
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>ComfyUI über das Startmenü öffnen. Bei der portablen Version „run_nvidia_gpu.bat“ starten.</li>
          <li>Warten, bis ComfyUI fertig geladen ist (das Fenster zeigt die Arbeitsfläche).</li>
          <li>Hier auf „Erneut prüfen“ klicken. NOVA prüft außerdem alle 10 Sekunden selbst.</li>
        </ol>
        <p className="mt-1.5 text-xs">Läuft ComfyUI unter einer anderen Adresse, lässt sie sich unten unter „Einstellungen“ eintragen.</p>
        {daemonMessage}
      </Notice>
    );
  }
  if (state === 'outdated') {
    return (
      <Notice
        tone="warning"
        title="ComfyUI ist zu alt für 3D-Modelle"
        actions={
          <Button size="sm" icon={BookOpen} onClick={() => void openWebsite(COMFYUI_UPDATE_GUIDE_URL)}>
            Anleitung öffnen
          </Button>
        }
      >
        <p>
          Version {s.version ?? 'unbekannt'} enthält die Bausteine für TRELLIS.2 und Pixal3D noch nicht. Bitte ComfyUI aktualisieren: ComfyUI Desktop über sein Menü nach Updates suchen
          lassen, bei der portablen Version „update_comfyui.bat“ im Ordner „update“ ausführen. Danach ComfyUI neu starten und hier „Erneut prüfen“ klicken.
        </p>
        {daemonMessage}
      </Notice>
    );
  }
  if (!s.modelsDir) {
    return (
      <Notice
        tone="warning"
        title="Wo liegen die Modelle von ComfyUI?"
        actions={
          <Button size="sm" variant="primary" icon={FolderOpen} loading={choosingFolder} onClick={onChooseFolder}>
            Modellordner wählen …
          </Button>
        }
      >
        <p>
          NOVA hat den Ordner „models“ von ComfyUI nicht gefunden. Dorthin werden die 3D-Modelle heruntergeladen. Bei ComfyUI Desktop liegt er in dem Ordner, den du beim Einrichten gewählt
          hast (oft Dokumente\ComfyUI\models).
        </p>
        {daemonMessage}
      </Notice>
    );
  }
  return (
    <Notice tone="success" title="ComfyUI ist bereit">
      {s.message}
    </Notice>
  );
}

/** "ComfyUI installieren" (integrations.install → approval, never silent) plus the manual way. */
function InstallHelp({ message }: { message: string }) {
  const integrations = useRpc('integrations.list', { refresh: false });
  const comfy = integrations.data?.find((i) => i.id === COMFYUI_INTEGRATION_ID);
  const command = comfy?.installHint?.command ?? null;
  const [result, setResult] = useState<RpcResult<'integrations.install'> | null>(null);
  const install = useMutation('integrations.install', {
    errorToast: 'Die Installation konnte nicht angefragt werden',
    onSuccess: (r) => {
      setResult(r);
      if (r.approvalId) toast.info('Freigabe angelegt', 'ComfyUI wird erst installiert, wenn die Freigabe erteilt ist.');
    },
  });

  return (
    <div className="space-y-2">
      <Notice
        tone="warning"
        title="ComfyUI ist nicht installiert"
        actions={
          <>
            {command && (
              <Button size="sm" variant="primary" icon={Download} loading={install.loading} disabled={!!result?.approvalId} onClick={() => void install.run({ id: COMFYUI_INTEGRATION_ID })}>
                ComfyUI installieren
              </Button>
            )}
            <Button size="sm" icon={ExternalLink} onClick={() => void openWebsite(comfy?.installHint?.url ?? COMFYUI_DOWNLOAD_URL)}>
              Download-Seite öffnen
            </Button>
          </>
        }
      >
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>
            {command
              ? '„ComfyUI installieren“ klicken – NOVA fragt vorher unter „Freigaben“ um Erlaubnis. Oder ComfyUI Desktop selbst von comfy.org herunterladen.'
              : 'ComfyUI Desktop von comfy.org herunterladen und installieren.'}
          </li>
          <li>ComfyUI einmal starten und die Einrichtung abschließen. Dabei wird auch der Ordner für die Modelle festgelegt.</li>
          <li>Hier auf „Erneut prüfen“ klicken. NOVA prüft außerdem alle 10 Sekunden selbst.</li>
        </ol>
        {message && <p className="mt-1.5 text-xs">Meldung von NOVA: {message}</p>}
      </Notice>
      {command && <CodeBlock label="Installationsbefehl" code={command} />}
      {result && (
        <Notice
          tone={result.approvalId ? 'info' : 'warning'}
          title={result.approvalId ? 'Freigabe angelegt' : undefined}
          actions={
            result.approvalId ? (
              <Link to={paths.approvals} className="text-xs font-medium">
                Zu den Freigaben
              </Link>
            ) : undefined
          }
        >
          {result.message}
        </Notice>
      )}
    </div>
  );
}
