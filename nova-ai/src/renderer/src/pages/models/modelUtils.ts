// Helpers for the models page: model references, usability rules for paid models, Ollama texts.
import type { ModelInfo, ModelRef, OllamaPull, ProviderConfig } from '@shared/schemas';
import { isLocalUrl } from '../settings/shared/forms';

/** Provider row of the local Ollama (its baseUrl is the Ollama endpoint). */
export const OLLAMA_LOCAL_ID = 'ollama-local';
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';
export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download/windows';
export const OLLAMA_LIBRARY_URL = 'https://ollama.com/library';

/** "providerId/modelId" */
export function refKey(ref: ModelRef | null | undefined): string {
  return ref ? `${ref.providerId}/${ref.modelId}` : '';
}

/** Inverse of refKey (provider ids never contain '/'). */
export function parseRefKey(key: string): ModelRef | null {
  const i = key.indexOf('/');
  if (i <= 0 || i === key.length - 1) return null;
  return { providerId: key.slice(0, i), modelId: key.slice(i + 1) };
}

export function sameRef(a: ModelRef | null | undefined, b: ModelRef | null | undefined): boolean {
  return refKey(a) === refKey(b);
}

/** Models that can write text/code (embedding-only models are not offered for agents). */
export function isChatModel(m: ModelInfo): boolean {
  return !(m.capabilities.includes('embedding') && !m.capabilities.includes('completion'));
}

export interface Usability {
  usable: boolean;
  /** German reason when not usable (shown next to the option). */
  reason: string | null;
}

/**
 * Whether NOVA may use a model (MASTERPROMPT §7/§15): paid models need an approved provider AND a price;
 * disabled providers are never used.
 */
export function modelUsability(model: ModelInfo, provider: ProviderConfig | undefined): Usability {
  if (!provider) return { usable: false, reason: 'Anbieter nicht mehr eingerichtet' };
  if (!provider.enabled) return { usable: false, reason: 'Anbieter ausgeschaltet' };
  if (model.paid || provider.paid) {
    if (!provider.approved) return { usable: false, reason: 'kostenpflichtig – nicht freigegeben' };
    if (!model.pricing) return { usable: false, reason: 'kostenpflichtig – Preis fehlt' };
  }
  return { usable: true, reason: null };
}

/** Provider is reached over the network (needs the per-project cloud data approval). */
export function isCloudProvider(p: Pick<ProviderConfig, 'baseUrl'>): boolean {
  return !isLocalUrl(p.baseUrl);
}

/** German text for the raw Ollama download phase. */
export function pullPhaseLabel(pull: Pick<OllamaPull, 'phase' | 'status'>): string {
  if (pull.status === 'done') return 'Fertig – das Modell ist installiert';
  if (pull.status === 'cancelled') return 'Abgebrochen';
  if (pull.status === 'failed') return 'Fehlgeschlagen';
  const p = pull.phase.toLowerCase();
  if (p.includes('manifest') && p.includes('pulling')) return 'Modellbeschreibung wird geladen';
  if (p.startsWith('pulling') || p.startsWith('downloading')) return 'Wird heruntergeladen';
  if (p.includes('verifying')) return 'Download wird überprüft';
  if (p.includes('writing manifest')) return 'Wird gespeichert';
  if (p.includes('removing')) return 'Wird aufgeräumt';
  if (p === 'success') return 'Fertig – das Modell ist installiert';
  return pull.phase || 'Wird vorbereitet';
}

/** Valid Ollama model name ("qwen2.5-coder:7b", "library/llama3.1:8b", "hf.co/user/repo:Q4_K_M"). */
export function isValidModelName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._\-/:]{0,199}$/.test(name.trim());
}

export interface ModelSuggestion {
  name: string;
  description: string;
  /** Approximate download size (shown as "ca. 4,7 GB"). */
  approxBytes: number;
}

const GB = 1024 ** 3;

/** Suggestions for the download form (shown as suggestions only – nothing is downloaded automatically). */
export const MODEL_SUGGESTIONS: ModelSuggestion[] = [
  { name: 'qwen2.5-coder:7b', description: 'Programmiermodell, läuft schon mit 8 GB Grafikspeicher', approxBytes: 4.7 * GB },
  { name: 'qwen2.5-coder:14b', description: 'Stärkeres Programmiermodell, ab etwa 12 GB Grafikspeicher', approxBytes: 9.0 * GB },
  { name: 'llama3.1:8b', description: 'Allrounder mit großem Kontextfenster', approxBytes: 4.9 * GB },
  { name: 'deepseek-coder-v2:16b', description: 'Programmiermodell, ab etwa 12 GB Grafikspeicher', approxBytes: 8.9 * GB },
  { name: 'mistral-nemo', description: 'Allrounder mit Werkzeug-Unterstützung', approxBytes: 7.1 * GB },
];

/** Same model name ignoring the implicit ":latest" tag. */
export function sameModelName(a: string, b: string): boolean {
  const norm = (s: string) => (s.includes(':') ? s : `${s}:latest`).toLowerCase();
  return norm(a.trim()) === norm(b.trim());
}
