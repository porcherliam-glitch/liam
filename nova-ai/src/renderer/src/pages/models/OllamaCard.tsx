// Ollama status card (UI-SPEC §4 / §7): installed, running, version, address, German fix instructions,
// "Erneut prüfen" and the address editor (provider row "ollama-local", tested with ollama.status({ baseUrl })).
import { useState } from 'react';
import { CircleCheck, CircleX, Cpu, Download, ExternalLink, Pencil, PlugZap, RefreshCw } from 'lucide-react';
import type { OllamaStatus, ProviderConfig } from '@shared/schemas';
import { Badge, Button, Card, ErrorState, Input, KeyValue, LoadingState } from '../../components/ui';
import { RelativeTime } from '../../components/common';
import { useMutation, type UseRpcResult } from '../../hooks';
import { api, errorMessage } from '../../lib/api';
import { isHttpUrl, isLocalUrl, rpcIssues } from '../settings/shared/forms';
import { openWebsite } from '../settings/shared/files';
import { Notice } from '../settings/shared/ui';
import { DEFAULT_OLLAMA_URL, OLLAMA_DOWNLOAD_URL, OLLAMA_LOCAL_ID } from './modelUtils';

export interface OllamaCardProps {
  status: UseRpcResult<'ollama.status'>;
  /** Provider row "ollama-local" (its baseUrl is the Ollama endpoint). */
  provider: ProviderConfig | undefined;
  /** Number of installed models (null while unknown). */
  modelCount: number | null;
}

export function OllamaCard({ status, provider, modelCount }: OllamaCardProps) {
  const [editing, setEditing] = useState(false);
  const s = status.data;

  const actions = (
    <>
      {!editing && (
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditing(true)} disabled={!s && !provider}>
          Adresse ändern
        </Button>
      )}
      <Button size="sm" icon={RefreshCw} loading={status.refreshing} onClick={() => void status.refetch()}>
        Erneut prüfen
      </Button>
    </>
  );

  return (
    <Card title="Lokale Modelle mit Ollama" description="Ollama führt KI-Modelle direkt auf diesem PC aus – kostenlos und ohne dass Projektdaten den Rechner verlassen." icon={Cpu} actions={actions}>
      {status.loading ? (
        <LoadingState compact label="Ollama wird geprüft …" />
      ) : !s ? (
        <ErrorState compact error={status.error} title="Der Ollama-Status konnte nicht geladen werden" onRetry={() => void status.refetch()} />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill ok={s.installed || s.running} okText="Installiert" badText="Nicht installiert" />
            <StatusPill ok={s.running} okText="Läuft" badText="Läuft nicht" />
            {s.version && <Badge tone="neutral">Version {s.version}</Badge>}
          </div>
          <KeyValue
            columns={3}
            items={[
              { label: 'Adresse', value: s.baseUrl, mono: true },
              { label: 'Programm', value: s.binaryPath ?? 'nicht gefunden', mono: !!s.binaryPath },
              { label: 'Installierte Modelle', value: s.running ? (modelCount ?? '–') : 'unbekannt (Ollama läuft nicht)' },
              { label: 'Zuletzt geprüft', value: <RelativeTime ts={s.checkedAt} /> },
            ]}
          />
          {editing && <AddressEditor current={provider?.baseUrl ?? s.baseUrl} provider={provider} onDone={() => setEditing(false)} onSaved={() => void status.refetch()} />}
          <OllamaHelp status={s} />
        </div>
      )}
    </Card>
  );
}

function StatusPill({ ok, okText, badText }: { ok: boolean; okText: string; badText: string }) {
  return (
    <Badge size="md" tone={ok ? 'success' : 'danger'} icon={ok ? CircleCheck : CircleX}>
      {ok ? okText : badText}
    </Badge>
  );
}

/** Plain-language fix instructions for the current Ollama state. */
export function OllamaHelp({ status }: { status: OllamaStatus }) {
  if (status.running) {
    return (
      <Notice tone="success" title="Ollama ist bereit">
        {status.message}
      </Notice>
    );
  }
  if (!status.installed) {
    return (
      <Notice
        tone="warning"
        title="Ollama ist nicht installiert"
        actions={
          <Button size="sm" variant="primary" icon={Download} onClick={() => void openWebsite(OLLAMA_DOWNLOAD_URL)}>
            Download-Seite öffnen
          </Button>
        }
      >
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Ollama für Windows von ollama.com herunterladen.</li>
          <li>Die heruntergeladene Datei öffnen und der Installation folgen.</li>
          <li>Hier auf „Erneut prüfen“ klicken. NOVA prüft außerdem alle 10 Sekunden selbst.</li>
        </ol>
        {status.message && <p className="mt-1.5 text-xs">Meldung des Dienstes: {status.message}</p>}
      </Notice>
    );
  }
  return (
    <Notice tone="warning" title="Ollama ist installiert, läuft aber nicht">
      <ol className="mt-1 list-decimal space-y-0.5 pl-5">
        <li>Im Startmenü „Ollama“ öffnen. Danach erscheint das Lama-Symbol unten rechts im Infobereich der Taskleiste.</li>
        <li>Läuft Ollama bereits, die Adresse prüfen (Standard: {DEFAULT_OLLAMA_URL}).</li>
        <li>Hier auf „Erneut prüfen“ klicken. NOVA prüft außerdem alle 10 Sekunden selbst.</li>
      </ol>
      {status.message && <p className="mt-1.5 text-xs">Meldung des Dienstes: {status.message}</p>}
    </Notice>
  );
}

interface AddressEditorProps {
  current: string;
  provider: ProviderConfig | undefined;
  onDone: () => void;
  onSaved: () => void;
}

/** Edit the Ollama endpoint: test a candidate URL without saving, then save it on the "ollama-local" row. */
function AddressEditor({ current, provider, onDone, onSaved }: AddressEditorProps) {
  const [url, setUrl] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<OllamaStatus | null>(null);
  const save = useMutation('providers.upsert', {
    errorToast: false,
    successToast: 'Ollama-Adresse gespeichert',
    onSuccess: () => {
      onSaved();
      onDone();
    },
    onError: (e) => setError(rpcIssues(e).baseUrl ?? e.message),
  });

  const trimmed = url.trim().replace(/\/+$/, '');
  const validate = (): boolean => {
    if (!isHttpUrl(trimmed)) {
      setError('Bitte eine Adresse wie http://127.0.0.1:11434 eingeben.');
      return false;
    }
    setError(null);
    return true;
  };

  const test = async () => {
    if (!validate()) return;
    setTesting(true);
    setResult(null);
    try {
      setResult(await api('ollama.status', { baseUrl: trimmed }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTesting(false);
    }
  };

  const onSave = () => {
    if (!validate()) return;
    void save.run({ id: OLLAMA_LOCAL_ID, type: 'ollama', name: provider?.name ?? 'Ollama (lokal)', baseUrl: trimmed });
  };

  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-surface-2/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <Input
        label="Adresse von Ollama"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setResult(null);
          setError(null);
        }}
        error={error}
        hint={`Standard: ${DEFAULT_OLLAMA_URL}. Nur ändern, wenn Ollama an einem anderen Port oder auf einem anderen Rechner läuft.`}
        spellCheck={false}
        autoComplete="off"
        className="font-mono text-xs"
      />
      {isHttpUrl(trimmed) && !isLocalUrl(trimmed) && (
        <Notice tone="info">Diese Adresse liegt nicht auf diesem PC. Projektinhalte werden dann über das Netzwerk an diesen Rechner geschickt.</Notice>
      )}
      {result && (
        <Notice tone={result.running ? 'success' : 'danger'} title={result.running ? 'Ollama antwortet unter dieser Adresse' : 'Unter dieser Adresse antwortet kein Ollama'}>
          {result.message}
        </Notice>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onDone} disabled={save.loading}>
          Abbrechen
        </Button>
        <Button size="sm" icon={PlugZap} loading={testing} onClick={() => void test()}>
          Verbindung prüfen
        </Button>
        <Button size="sm" variant="primary" type="submit" loading={save.loading} disabled={trimmed === current.replace(/\/+$/, '')}>
          Speichern
        </Button>
      </div>
    </form>
  );
}

/** Link-styled button to the Ollama model library (used by the download form). */
export function LibraryLink({ url, children }: { url: string; children: string }) {
  return (
    <button type="button" onClick={() => void openWebsite(url)} className="inline-flex items-center gap-1 text-blue-fg hover:underline">
      {children}
      <ExternalLink aria-hidden className="h-3 w-3" />
    </button>
  );
}
