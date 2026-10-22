// "Vorschau": live preview of the project (preview.status/start/stop + preview.updated events).
// Browser projects are embedded in a sandboxed iframe – only for loopback http URLs (the main process blocks every
// other frame URL as well). Desktop programs show start/stop and their output. Engines without an embeddable
// preview show the daemon's German explanation instead of pretending to support it.
import { useState } from 'react';
import { Link } from 'react-router';
import { ExternalLink, Gamepad2, Globe, Monitor, Play, RotateCw, ScrollText, ShieldCheck, Square, TriangleAlert } from 'lucide-react';
import type { IntegrationStatus, PreviewStatus, ProjectKind } from '@shared/schemas';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, StatusBadge } from '../../../components/ui';
import { useMutation, useNovaEvent, useRpc, useSupports } from '../../../hooks';
import { getBridge } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { INTEGRATION_NAME, metaOf, PREVIEW_KIND, PREVIEW_STATE } from '../../../lib/labels';
import { paths } from '../../../lib/paths';
import { toast } from '../../../stores/toasts';
import { isHttpUrl, isLoopbackHttpUrl } from '../studio-utils';
import { ProcessOutput } from './ProcessOutput';

export interface PreviewPanelProps {
  projectId: string;
  projectKind: ProjectKind;
  /** Installed tools (for "In Unity öffnen" etc.). */
  integrations: readonly IntegrationStatus[] | undefined;
}

/** Sandbox flags of the preview frame (UI-SPEC §4). No top navigation, no popups, no downloads. */
export const PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-same-origin allow-modals';

const SANDBOX_NOTE = 'Die Vorschau läuft abgeschottet: Sie hat keinen Zugriff auf die Dateien des Computers oder auf Funktionen von NOVA.';

const ENGINE_INTEGRATION: Partial<Record<ProjectKind, string>> = { unity: 'unity', godot: 'godot', unreal: 'unreal' };

function isBrowserKind(kind: PreviewStatus['kind']): boolean {
  return kind === 'browser-dev-server' || kind === 'browser-static';
}

export function PreviewPanel({ projectId, projectKind, integrations }: PreviewPanelProps) {
  const status = useRpc('preview.status', { projectId });
  const [reloadCount, setReloadCount] = useState(0);
  const [showOutput, setShowOutput] = useState(false);
  const canOpenIntegration = useSupports('integrations.open');

  // Apply pushed states directly (reloadToken changes must reach the frame without a round trip).
  useNovaEvent('preview.updated', (p) => {
    if (p.projectId === projectId) status.setData(p);
  });

  const start = useMutation('preview.start', { errorToast: 'Die Vorschau konnte nicht gestartet werden', onSuccess: (s) => status.setData(s) });
  const stop = useMutation('preview.stop', { errorToast: 'Die Vorschau konnte nicht gestoppt werden', onSuccess: (s) => status.setData(s) });
  const openEngine = useMutation('integrations.open', { errorToast: 'Das Programm konnte nicht geöffnet werden' });

  if (status.error && !status.data) {
    return <ErrorState compact error={status.error} title="Der Stand der Vorschau konnte nicht geladen werden" onRetry={() => void status.refetch()} />;
  }
  if (!status.data) return <LoadingState compact label="Vorschau wird geprüft …" />;

  const pv = status.data;
  const kindMeta = metaOf(PREVIEW_KIND, pv.kind);
  const stateMeta = metaOf(PREVIEW_STATE, pv.state);
  const engineId = ENGINE_INTEGRATION[projectKind];
  const engine = engineId ? integrations?.find((i) => i.id === engineId && i.available && i.canOpen) : undefined;

  const openInBrowser = async () => {
    if (!pv.url || !isHttpUrl(pv.url)) return;
    const ok = await getBridge()
      ?.app.openExternal(pv.url)
      .catch(() => false);
    if (!ok) toast.error('Der Browser konnte nicht geöffnet werden', 'Die Adresse wurde aus Sicherheitsgründen abgelehnt.');
  };

  // --- No embedded preview possible (engines, no preview configured) ---------------------------------------------
  if (pv.state === 'unsupported' || pv.kind === 'none' || pv.kind === 'engine-external') {
    const engineName = engine ? (INTEGRATION_NAME[engine.id] ?? engine.name) : null;
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto">
        <EmptyState
          icon={pv.kind === 'engine-external' ? Gamepad2 : kindMeta.icon}
          title={pv.kind === 'none' ? 'Für dieses Projekt ist keine Vorschau eingerichtet' : 'Keine eingebettete Live-Vorschau'}
          description={
            <span className="block space-y-1.5">
              <span className="block">{pv.message}</span>
              {pv.kind === 'none' && (
                <span className="block">
                  Die Art der Vorschau lässt sich in der <Link to={paths.project(projectId)}>Projektübersicht</Link> einstellen.
                </span>
              )}
            </span>
          }
          actions={
            engine && engineName && canOpenIntegration ? (
              <Button icon={ExternalLink} loading={openEngine.loading} onClick={() => void openEngine.run({ id: engine.id, projectId })}>
                In {engineName} öffnen
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  const running = pv.state === 'running';
  const busy = pv.state === 'starting' || start.loading || stop.loading;
  const desktop = pv.kind === 'desktop-run';
  const embeddable = isBrowserKind(pv.kind) && running && isLoopbackHttpUrl(pv.url);

  const toolbar = (
    <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-2 py-1.5">
      <StatusBadge meta={stateMeta} />
      <span className="flex items-center gap-1 text-xs text-muted">
        {desktop ? <Monitor aria-hidden className="h-3.5 w-3.5" /> : <Globe aria-hidden className="h-3.5 w-3.5" />}
        {kindMeta.label}
      </span>
      {pv.url && isBrowserKind(pv.kind) && (
        <span className="min-w-0 max-w-[50%] truncate rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-text/90" title={pv.url}>
          {pv.url}
        </span>
      )}
      {isBrowserKind(pv.kind) && (
        <span className="inline-flex text-success-fg" title={SANDBOX_NOTE}>
          <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
          <span className="sr-only">{SANDBOX_NOTE}</span>
        </span>
      )}
      <div className="ml-auto flex items-center gap-1">
        {embeddable && <IconButton icon={RotateCw} label="Vorschau neu laden" size="sm" onClick={() => setReloadCount((n) => n + 1)} />}
        {pv.url && isHttpUrl(pv.url) && running && <IconButton icon={ExternalLink} label="Im Browser öffnen" size="sm" onClick={() => void openInBrowser()} />}
        {pv.processId && !desktop && (
          <IconButton
            icon={ScrollText}
            label={showOutput ? 'Ausgabe ausblenden' : 'Ausgabe des Servers anzeigen'}
            size="sm"
            aria-pressed={showOutput}
            className={cn(showOutput && 'bg-surface-2 text-text')}
            onClick={() => setShowOutput((v) => !v)}
          />
        )}
        {running || pv.state === 'starting' ? (
          <Button size="sm" icon={Square} loading={stop.loading} disabled={start.loading} onClick={() => void stop.run({ projectId })}>
            {desktop ? 'Programm beenden' : 'Vorschau stoppen'}
          </Button>
        ) : (
          <Button size="sm" variant="primary" icon={Play} loading={start.loading} disabled={busy} onClick={() => void start.run({ projectId })}>
            {desktop ? 'Programm starten' : pv.state === 'failed' ? 'Erneut starten' : 'Vorschau starten'}
          </Button>
        )}
      </div>
    </div>
  );

  // --- Desktop programs: start/stop + output -------------------------------------------------------------------
  if (desktop) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {toolbar}
        {pv.message && <StateMessage state={pv.state} message={pv.message} />}
        {pv.processId ? (
          <ProcessOutput key={pv.processId} processId={pv.processId} label="Ausgabe des Programms" className="min-h-0 flex-1" />
        ) : (
          <EmptyState
            compact
            icon={Monitor}
            title="Das Programm läuft gerade nicht"
            description="Mit „Programm starten“ führt NOVA den Startbefehl des Projekts aus. Das Fenster des Programms öffnet sich außerhalb von NOVA, die Ausgabe erscheint hier."
          />
        )}
      </div>
    );
  }

  // --- Browser previews ------------------------------------------------------------------------------------------
  let body;
  if (embeddable && pv.url) {
    body = (
      <iframe
        key={`${pv.url}|${pv.reloadToken}|${reloadCount}`}
        src={pv.url}
        title="Live-Vorschau des Projekts"
        sandbox={PREVIEW_SANDBOX}
        referrerPolicy="no-referrer"
        className="h-full w-full border-0 bg-white"
      />
    );
  } else if (running && pv.url && !isLoopbackHttpUrl(pv.url)) {
    body = (
      <EmptyState
        compact
        icon={TriangleAlert}
        title="Diese Adresse wird nicht eingebettet"
        description="Im Studio werden aus Sicherheitsgründen nur Adressen auf diesem Computer angezeigt (127.0.0.1 oder localhost)."
        actions={
          isHttpUrl(pv.url) ? (
            <Button size="sm" icon={ExternalLink} onClick={() => void openInBrowser()}>
              Im Browser öffnen
            </Button>
          ) : undefined
        }
      />
    );
  } else if (running) {
    body = <LoadingState compact label="Warte auf die Adresse des Entwicklungsservers …" />;
  } else if (pv.state === 'starting') {
    body = <LoadingState compact label="Die Vorschau wird gestartet …" />;
  } else if (pv.state === 'failed') {
    body = (
      <EmptyState
        compact
        icon={TriangleAlert}
        title="Die Vorschau konnte nicht gestartet werden"
        description={pv.message || 'Die Ausgabe des Servers zeigt meist den Grund.'}
        actions={
          pv.processId && !showOutput ? (
            <Button size="sm" icon={ScrollText} onClick={() => setShowOutput(true)}>
              Ausgabe anzeigen
            </Button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <EmptyState
        compact
        icon={Globe}
        title="Die Vorschau ist gestoppt"
        description={pv.kind === 'browser-dev-server' ? 'Beim Start führt NOVA den Entwicklungsserver des Projekts aus und zeigt die Seite hier an. Änderungen erscheinen automatisch.' : 'Beim Start zeigt NOVA die Startseite des Projekts hier an.'}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {toolbar}
      <div className="min-h-0 flex-1">{body}</div>
      {showOutput && pv.processId && (
        <div className="h-40 shrink-0 border-t border-border">
          <ProcessOutput key={pv.processId} processId={pv.processId} label="Ausgabe des Servers" className="h-full" />
        </div>
      )}
    </div>
  );
}

function StateMessage({ state, message }: { state: PreviewStatus['state']; message: string }) {
  return (
    <p className={cn('shrink-0 border-b border-border px-3 py-1.5 text-xs', state === 'failed' ? 'bg-danger/8 text-danger-fg' : 'text-muted')} role={state === 'failed' ? 'alert' : undefined}>
      {message}
    </p>
  );
}
