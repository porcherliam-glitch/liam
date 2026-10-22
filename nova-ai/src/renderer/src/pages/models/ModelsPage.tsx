// Modelle (UI-SPEC §4 UI-4, §7): Ollama status and local models, downloads, the global model choice and providers.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { ShieldAlert } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { useDaemonStore } from '../../stores/daemon';
import { useRpc } from '../../hooks';
import { api } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { Notice } from '../settings/shared/ui';
import { LocalModelsCard, RunningModelsCard } from './LocalModelsCard';
import { ModelSelectionCard } from './ModelSelectionCard';
import { OllamaCard } from './OllamaCard';
import { ProvidersCard } from './ProvidersCard';
import { PullCard } from './PullCard';
import { ThreeDModelsCard } from './ThreeDModelsCard';
import { OLLAMA_LOCAL_ID } from './modelUtils';

/** Poll interval while Ollama is not reachable (turns green soon after the user starts it). */
const OFFLINE_POLL_MS = 10_000;
const THREED_CARD_ID = 'threed-models';

export default function ModelsPage() {
  const secureStore = useDaemonStore((s) => s.status?.secretStore.secure ?? null);
  const [params] = useSearchParams();
  // "?section=3d" (link from the 3D-Werkstatt) scrolls to the 3D models card once it has loaded.
  const focusThreeD = params.get('section') === '3d';

  const providers = useRpc('providers.list', undefined, { refetchOn: ['provider.updated', 'provider.removed'] });
  const health = useRpc('providers.health', undefined, { refetchOn: ['provider.updated', 'provider.removed'] });
  const models = useRpc('models.list', { refresh: false }, { refetchOn: ['provider.updated', 'provider.removed', 'ollama.models.changed'] });
  const selection = useRpc('models.getSelection', undefined, { refetchOn: ['settings.updated'] });

  const [ollamaOffline, setOllamaOffline] = useState(false);
  const status = useRpc('ollama.status', {}, {
    refetchOn: ['provider.updated', 'ollama.models.changed'],
    eventFilter: (e) => e.type !== 'provider.updated' || e.payload.id === OLLAMA_LOCAL_ID,
    intervalMs: ollamaOffline ? OFFLINE_POLL_MS : undefined,
  });
  const ollamaRunning = status.data?.running ?? false;
  useEffect(() => setOllamaOffline(status.data ? !status.data.running : false), [status.data]);

  const localModels = useRpc('ollama.models', ollamaRunning ? undefined : null, { refetchOn: ['ollama.models.changed'] });
  const running = useRpc('ollama.running', ollamaRunning ? undefined : null, { refetchOn: ['ollama.models.changed'], intervalMs: 15_000 });

  const [pullName, setPullName] = useState('');
  const pullInputRef = useRef<HTMLInputElement>(null);
  const suggest = useCallback((name: string) => {
    setPullName(name);
    pullInputRef.current?.focus();
    pullInputRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, []);

  const [refreshingModels, setRefreshingModels] = useState(false);
  const refreshModels = async () => {
    setRefreshingModels(true);
    try {
      models.setData(await api('models.list', { refresh: true }));
      toast.success('Modelllisten aktualisiert');
    } catch (e) {
      toast.fromError(e, 'Modelle konnten nicht abgerufen werden');
    } finally {
      setRefreshingModels(false);
    }
  };

  const ollamaProvider = providers.data?.find((p) => p.id === OLLAMA_LOCAL_ID);

  return (
    <Page
      title="Modelle"
      description="Lokale Modelle über Ollama verwalten, Cloud-Anbieter einrichten und festlegen, welche Modelle die Agenten verwenden dürfen. Ganz unten: die 3D-Modelle der 3D-Werkstatt."
    >
      <div className="space-y-4">
        {secureStore === false && (
          <Notice tone="warning" icon={ShieldAlert} title="API-Schlüssel werden nicht sicher gespeichert" alert>
            Auf diesem PC steht kein sicherer Schlüsselspeicher zur Verfügung. Schlüssel liegen nur einfach verschlüsselt im NOVA-Datenordner. Wer diesen Ordner lesen kann, kann sie entschlüsseln.
          </Notice>
        )}
        <OllamaCard status={status} provider={ollamaProvider} modelCount={localModels.data?.length ?? null} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <LocalModelsCard status={status} models={localModels} running={running.data ?? []} selection={selection.data} onSuggest={suggest} />
          <div className="space-y-4">
            <PullCard ollamaRunning={ollamaRunning} installed={localModels.data ?? []} name={pullName} onNameChange={setPullName} inputRef={pullInputRef} />
            <RunningModelsCard running={running} ollamaRunning={ollamaRunning} />
          </div>
        </div>
        <ModelSelectionCard selection={selection} models={models.data ?? []} providers={providers.data ?? []} />
        <ProvidersCard providers={providers} health={health} models={models} secureStore={secureStore} onRefreshModels={refreshModels} refreshingModels={refreshingModels} />
        <ThreeDModelsCard id={THREED_CARD_ID} scrollIntoView={focusThreeD} />
      </div>
    </Page>
  );
}
