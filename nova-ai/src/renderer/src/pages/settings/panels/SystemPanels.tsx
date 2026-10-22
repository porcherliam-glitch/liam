// Immediate (not draft-based) controls of the settings page: Windows autostart, update check, diagnostics bundle.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Copy, Download, FolderSearch, PackageCheck, RefreshCw, Save, ScrollText, Stethoscope } from 'lucide-react';
import type { AutostartSupport } from '@shared/bridge';
import type { Settings } from '@shared/settings';
import type { RpcResult } from '@shared/rpc';
import { Badge, Button, Card, copyToClipboard, KeyValue, Spinner, Switch } from '../../../components/ui';
import { RelativeTime } from '../../../components/common';
import { useMutation } from '../../../hooks';
import { api, errorMessage, getBridge } from '../../../lib/api';
import { formatBytes } from '../../../lib/format';
import { paths } from '../../../lib/paths';
import { useDaemonStore } from '../../../stores/daemon';
import { toast } from '../../../stores/toasts';
import { openWebsite, revealInExplorer } from '../shared/files';
import { Notice } from '../shared/ui';

// --- autostart ----------------------------------------------------------------------

export interface AutostartControlProps {
  /** settings.background.autostart (kept in sync with the Windows setting). */
  savedValue: boolean;
  onSettingsSaved: (s: Settings) => void;
}

/** "Mit Windows starten": applied immediately via the bridge (app.setAutostart) and mirrored into the settings. */
export function AutostartControl({ savedValue, onSettingsSaved }: AutostartControlProps) {
  const [actual, setActual] = useState<boolean | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [support, setSupport] = useState<AutostartSupport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bridge = getBridge();
    if (!bridge?.app?.getAutostart) {
      setUnavailable(true);
      return;
    }
    bridge.app
      .getAutostart()
      .then((v) => !cancelled && setActual(v))
      .catch(() => !cancelled && setUnavailable(true));
    // Older preloads have no getAutostartSupport: then the switch behaves as before.
    bridge.app
      .getAutostartSupport?.()
      .then((s) => !cancelled && setSupport(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const notSupported = support !== null && !support.supported;

  const toggle = async (enabled: boolean) => {
    const bridge = getBridge();
    if (!bridge) return;
    setBusy(true);
    try {
      const result = await bridge.app.setAutostart(enabled);
      setActual(result);
      if (result !== savedValue) onSettingsSaved(await api('settings.update', { background: { autostart: result } }));
      if (result !== enabled) toast.warning('Windows hat die Änderung nicht übernommen', 'Bitte in den Windows-Einstellungen unter „Apps › Autostart“ prüfen.');
      else toast.success(result ? 'NOVA startet jetzt mit Windows' : 'NOVA startet nicht mehr mit Windows');
    } catch (e) {
      toast.error('Autostart konnte nicht geändert werden', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const checked = notSupported ? false : (actual ?? savedValue);
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <Switch
          checked={checked}
          onChange={(v) => void toggle(v)}
          disabled={busy || unavailable || notSupported}
          label="Mit Windows starten"
          description="NOVA startet nach der Anmeldung unsichtbar im Infobereich und arbeitet an freigegebenen Projekten weiter."
        />
        {busy ? <Spinner size="sm" /> : notSupported ? <Badge tone="neutral">nicht verfügbar</Badge> : <Badge tone="neutral">sofort wirksam</Badge>}
      </div>
      {notSupported && support?.reason === 'not-installed' && (
        <p className="mt-2 text-xs text-muted">
          Nur in der installierten Version verfügbar. NOVA wurde ohne Installation gestartet (zum Beispiel über „NOVA-STARTEN.cmd“) – dafür kann Windows keinen Autostart-Eintrag anlegen. Für den Autostart NOVA mit dem Setup installieren.
        </p>
      )}
      {notSupported && support?.reason === 'platform' && <p className="mt-2 text-xs text-muted">Auf diesem Betriebssystem kann NOVA den Autostart nicht einrichten.</p>}
      {unavailable && <p className="mt-2 text-xs text-warning-fg">Der Autostart lässt sich hier gerade nicht abfragen. Bitte NOVA neu starten.</p>}
      {!notSupported && actual !== null && actual !== savedValue && !busy && <p className="mt-2 text-xs text-muted">Hinweis: Laut Windows ist der Autostart {actual ? 'eingeschaltet' : 'ausgeschaltet'}.</p>}
    </div>
  );
}

// --- updates ------------------------------------------------------------------------

export function UpdatesPanel() {
  const appVersion = useDaemonStore((s) => s.appVersion);
  const [info, setInfo] = useState<RpcResult<'updates.check'> | null>(null);
  const check = useMutation('updates.check', { errorToast: 'Update-Prüfung fehlgeschlagen', onSuccess: setInfo });
  const backup = useMutation('backup.create', { errorToast: 'Sicherung fehlgeschlagen', successToast: 'Daten gesichert – das Update kann jetzt installiert werden' });

  return (
    <Card title="Nach Updates suchen" icon={RefreshCw}>
      <div className="space-y-3">
        <Notice tone="info" title="Updates werden nie automatisch installiert">
          NOVA weist nur auf neue Versionen hin. Die Installation startet erst, wenn sie von Hand heruntergeladen und ausgeführt wird – vorher am besten die Daten sichern.
        </Notice>
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={RefreshCw} loading={check.loading} onClick={() => void check.run()}>
            Jetzt prüfen
          </Button>
          <span className="text-xs text-muted">Installierte Version: {info?.currentVersion ?? appVersion ?? '–'}</span>
        </div>
        {info && (
          <div className="space-y-2" aria-live="polite">
            <Notice tone={info.updateAvailable ? 'success' : 'info'} title={info.updateAvailable ? `Version ${info.latestVersion} ist verfügbar` : 'Keine neue Version'}>
              {info.message}
            </Notice>
            {info.updateAvailable && (
              <>
                {info.notes && <p className="rounded-lg border border-border bg-surface-2/50 p-3 text-xs whitespace-pre-wrap text-muted">{info.notes}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button icon={Save} loading={backup.loading} onClick={() => void backup.run({ reason: 'vor Update' })}>
                    Daten jetzt sichern
                  </Button>
                  {info.downloadUrl && (
                    <Button variant="primary" icon={Download} onClick={() => void openWebsite(info.downloadUrl as string)}>
                      Download-Seite öffnen
                    </Button>
                  )}
                </div>
              </>
            )}
            {info.checkedAt && <RelativeTime ts={info.checkedAt} prefix="Geprüft" className="text-[11px] text-subtle" />}
          </div>
        )}
      </div>
    </Card>
  );
}

// --- diagnostics --------------------------------------------------------------------

export function DiagnosticsPanel() {
  const [result, setResult] = useState<{ path: string; sizeBytes: number } | null>(null);
  const diag = useMutation('daemon.diagnostics', { errorToast: 'Diagnose-Paket konnte nicht erstellt werden', successToast: 'Diagnose-Paket erstellt', onSuccess: setResult });

  return (
    <Card title="Diagnose-Paket" icon={Stethoscope} actions={<Link to={paths.logs} className="inline-flex items-center gap-1 text-xs"><ScrollText aria-hidden className="h-3.5 w-3.5" />Protokolle ansehen</Link>}>
      <div className="space-y-3">
        <p className="text-[13px] text-muted">Fasst Protokolle und Systeminfos in einer Datei zusammen – hilfreich, wenn jemand bei einem Problem helfen soll. Schlüssel und Passwörter werden entfernt. Das Paket wird nirgendwohin gesendet.</p>
        <Button icon={Stethoscope} loading={diag.loading} onClick={() => void diag.run()}>
          Diagnose-Paket erstellen
        </Button>
        {result && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/35 bg-success/8 px-3 py-2.5">
            <PackageCheck aria-hidden className="h-5 w-5 shrink-0 text-success-fg" />
            <div className="min-w-0 flex-1">
              <KeyValue items={[{ label: `Erstellt (${formatBytes(result.sizeBytes)})`, value: result.path, mono: true }]} />
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" icon={FolderSearch} onClick={() => void revealInExplorer(result.path)}>
                Im Explorer zeigen
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={Copy}
                onClick={() => void copyToClipboard(result.path).then((ok) => (ok ? toast.success('Pfad kopiert') : toast.error('Kopieren nicht möglich')))}
              >
                Pfad kopieren
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** Small link card to another page that holds related settings. */
export function RelatedLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-xs font-medium">
      {children}
      <ArrowRight aria-hidden className="h-3 w-3" />
    </Link>
  );
}
