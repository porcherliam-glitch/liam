// Download form for Ollama models (UI-SPEC §4): suggestions (never downloaded automatically), live progress from
// 'ollama.pull' events and cancel via ollama.cancelPull.
import { useMemo, useState, type Ref } from 'react';
import { Download, Sparkles, X } from 'lucide-react';
import type { ModelInfo, OllamaPull } from '@shared/schemas';
import { Badge, Button, Card, IconButton, Input, ProgressBar, StatusBadge } from '../../components/ui';
import { useMutation, useNovaEvent, useRpc } from '../../hooks';
import { formatBytes } from '../../lib/format';
import { OLLAMA_PULL_STATUS, metaOf } from '../../lib/labels';
import { Notice } from '../settings/shared/ui';
import { LibraryLink } from './OllamaCard';
import { isValidModelName, MODEL_SUGGESTIONS, OLLAMA_LIBRARY_URL, pullPhaseLabel, sameModelName } from './modelUtils';

export interface PullCardProps {
  ollamaRunning: boolean;
  installed: ModelInfo[];
  /** Controlled model name (the fit check can suggest one). */
  name: string;
  onNameChange: (name: string) => void;
  /** Ref of the name field (focused when a suggestion comes from elsewhere). */
  inputRef?: Ref<HTMLInputElement>;
}

/** Recent downloads first, running before finished. */
function sortPulls(pulls: OllamaPull[]): OllamaPull[] {
  return [...pulls].sort((a, b) => Number(b.status === 'running') - Number(a.status === 'running') || b.startedAt - a.startedAt);
}

export function PullCard({ ollamaRunning, installed, name, onNameChange, inputRef }: PullCardProps) {
  const pulls = useRpc('ollama.pulls', undefined, { enabled: ollamaRunning });
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useNovaEvent('ollama.pull', (p) => {
    pulls.setData((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list];
    });
  });

  const pull = useMutation('ollama.pull', {
    errorToast: 'Download konnte nicht gestartet werden',
    onSuccess: (p) => {
      onNameChange('');
      pulls.setData((prev) => {
        const list = prev ?? [];
        return list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list];
      });
    },
  });
  const cancel = useMutation('ollama.cancelPull', {
    successToast: 'Download abgebrochen',
    onSuccess: (p) => pulls.setData((prev) => prev?.map((x) => (x.id === p.id ? p : x))),
  });

  const trimmed = name.trim();
  const alreadyInstalled = trimmed ? installed.some((m) => sameModelName(m.id, trimmed)) : false;
  const running = (pulls.data ?? []).filter((p) => p.status === 'running');
  const alreadyRunning = trimmed ? running.some((p) => sameModelName(p.model, trimmed)) : false;
  const visible = useMemo(() => sortPulls(pulls.data ?? []).filter((p) => p.status === 'running' || !hidden.has(p.id)).slice(0, 8), [pulls.data, hidden]);

  const submit = () => {
    if (!trimmed) {
      setError('Bitte einen Modellnamen eingeben, zum Beispiel qwen2.5-coder:7b.');
      return;
    }
    if (!isValidModelName(trimmed)) {
      setError('Der Name enthält unerlaubte Zeichen. Erlaubt sind Buchstaben, Ziffern sowie . _ - / :');
      return;
    }
    setError(null);
    void pull.run({ model: trimmed });
  };

  return (
    <Card title="Modell herunterladen" description="Ollama lädt das Modell aus dem Internet. Große Modelle brauchen viel Speicherplatz und Zeit." icon={Download}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start gap-2">
          <Input
            ref={inputRef}
            label="Modellname"
            value={name}
            onChange={(e) => {
              onNameChange(e.target.value);
              setError(null);
            }}
            placeholder="z. B. qwen2.5-coder:7b"
            error={error}
            hint={alreadyInstalled ? 'Dieses Modell ist bereits installiert. Ein erneuter Download aktualisiert es.' : alreadyRunning ? 'Dieses Modell wird gerade heruntergeladen.' : undefined}
            spellCheck={false}
            autoComplete="off"
            disabled={!ollamaRunning}
            containerClassName="min-w-0 flex-1"
            className="font-mono text-xs"
          />
          <Button type="submit" variant="primary" icon={Download} loading={pull.loading} disabled={!ollamaRunning || alreadyRunning} className="mt-5">
            Herunterladen
          </Button>
        </div>
        {!ollamaRunning && <Notice tone="warning">Zum Herunterladen muss Ollama laufen.</Notice>}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
            <Sparkles aria-hidden className="h-3.5 w-3.5 text-violet-fg" />
            Vorschläge – ein Klick trägt den Namen ein
          </p>
          <ul className="grid gap-1.5">
            {MODEL_SUGGESTIONS.map((s) => {
              const isInstalled = installed.some((m) => sameModelName(m.id, s.name));
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    disabled={!ollamaRunning}
                    onClick={() => {
                      onNameChange(s.name);
                      setError(null);
                    }}
                    className="flex w-full items-start justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-border-strong hover:bg-surface-2 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs text-text">{s.name}</span>
                      <span className="block text-[11px] text-muted">{s.description}</span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-muted">
                      ca. {formatBytes(s.approxBytes)}
                      {isInstalled && (
                        <Badge tone="success" className="ml-1">
                          installiert
                        </Badge>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Weitere Modelle: <LibraryLink url={OLLAMA_LIBRARY_URL}>Ollama-Bibliothek öffnen</LibraryLink>
          </p>
        </div>
      </form>

      {visible.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border pt-3" aria-live="polite">
          <h3 className="text-xs font-semibold text-text">Downloads</h3>
          <ul className="space-y-2">
            {visible.map((p) => (
              <PullRow
                key={p.id}
                pull={p}
                cancelling={cancel.loading}
                onCancel={() => void cancel.run({ id: p.id })}
                onHide={() => setHidden((prev) => new Set(prev).add(p.id))}
              />
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function PullRow({ pull, cancelling, onCancel, onHide }: { pull: OllamaPull; cancelling: boolean; onCancel: () => void; onHide: () => void }) {
  const isRunning = pull.status === 'running';
  const bytes = pull.totalBytes ? `${formatBytes(pull.completedBytes ?? 0)} von ${formatBytes(pull.totalBytes)}` : null;
  return (
    <li className="rounded-lg border border-border bg-surface-2/50 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-xs font-medium" title={pull.model}>
          {pull.model}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <StatusBadge meta={metaOf(OLLAMA_PULL_STATUS, pull.status)} />
          {isRunning ? (
            <Button size="sm" variant="ghost" icon={X} loading={cancelling} onClick={onCancel} aria-label={`Download von ${pull.model} abbrechen`}>
              Abbrechen
            </Button>
          ) : (
            <IconButton icon={X} size="sm" label={`${pull.model} aus der Liste ausblenden`} onClick={onHide} />
          )}
        </div>
      </div>
      {isRunning && <ProgressBar className="mt-1.5" value={pull.percent} label={`Download von ${pull.model}`} showValue={pull.percent != null} />}
      <p className="mt-1 text-[11px] text-muted">
        {pullPhaseLabel(pull)}
        {isRunning && bytes ? ` · ${bytes}` : ''}
      </p>
      {pull.status === 'failed' && pull.error && <p className="mt-1 text-xs text-danger-fg">{pull.error}</p>}
    </li>
  );
}
