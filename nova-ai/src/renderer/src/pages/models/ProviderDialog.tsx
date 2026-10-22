// Add/edit dialog for model providers (UI-SPEC §4 / §7): presets OpenAI / Anthropic / OpenRouter / LM Studio,
// explicit paid-usage approval with warning, write-only API key (never displayed), advanced options without secrets.
import { useEffect, useState } from 'react';
import { Check, Cloud, Cpu, KeyRound, ShieldAlert, Trash2 } from 'lucide-react';
import type { ProviderConfig, ProviderType } from '@shared/schemas';
import { Badge, Button, Checkbox, Dialog, Input, Select, Switch } from '../../components/ui';
import { useMutation } from '../../hooks';
import { cn } from '../../lib/cn';
import { PROVIDER_TYPE } from '../../lib/labels';
import { FREE_CLOUD_PROVIDER_TEXT, SECRET_STORE_TEXT } from '../../lib/texts';
import { toast } from '../../stores/toasts';
import { isHttpUrl, isLocalUrl, parseNumber, rpcIssues } from '../settings/shared/forms';
import { Notice } from '../settings/shared/ui';

export interface ProviderPreset {
  id: string;
  label: string;
  type: ProviderType;
  name: string;
  baseUrl: string;
  paid: boolean;
  description: string;
}

/** Ready-made settings for the common providers (only defaults – everything stays editable). */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'openai', label: 'OpenAI', type: 'openai_compatible', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', paid: true, description: 'GPT-Modelle. Kostenpflichtig, API-Schlüssel nötig.' },
  { id: 'anthropic', label: 'Anthropic', type: 'anthropic', name: 'Anthropic', baseUrl: 'https://api.anthropic.com', paid: true, description: 'Claude-Modelle. Kostenpflichtig, API-Schlüssel nötig.' },
  { id: 'openrouter', label: 'OpenRouter', type: 'openai_compatible', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', paid: true, description: 'Viele Modelle verschiedener Hersteller über einen Zugang. Kostenpflichtig.' },
  { id: 'lmstudio', label: 'LM Studio (lokal)', type: 'openai_compatible', name: 'LM Studio', baseUrl: 'http://127.0.0.1:1234/v1', paid: false, description: 'Lokale Modelle mit LM Studio auf diesem PC. Kostenlos, ohne Schlüssel.' },
  { id: 'custom', label: 'Eigener Anbieter', type: 'openai_compatible', name: '', baseUrl: '', paid: true, description: 'Jeder Dienst mit OpenAI-kompatibler Schnittstelle.' },
];

const PAID_APPROVAL_WARNING =
  'Mit dieser Freigabe darf NOVA Modelle dieses Anbieters verwenden, die Geld kosten. Abgerechnet wird über das Konto beim Anbieter. NOVA hält sich an die Budget-Grenzen unter „Kosten“ und verwendet ein Modell erst, wenn ein Preis eingetragen ist.';

const INSECURE_STORE_TEXT =
  'Auf diesem PC ist kein sicherer Schlüsselspeicher verfügbar. Schlüssel werden nur einfach verschlüsselt im NOVA-Datenordner abgelegt – wer diesen Ordner lesen kann, kann sie entschlüsseln.';

interface FormState {
  type: ProviderType;
  name: string;
  baseUrl: string;
  enabled: boolean;
  paid: boolean;
  approved: boolean;
  apiKey: string;
  authHeader: string;
  organization: string;
  maxConcurrent: string;
  maxRequestsPerMinute: string;
}

function fromProvider(p: ProviderConfig): FormState {
  return {
    type: p.type,
    name: p.name,
    baseUrl: p.baseUrl,
    enabled: p.enabled,
    paid: p.paid,
    approved: p.approved,
    apiKey: '',
    authHeader: p.options.authHeader ?? '',
    organization: p.options.organization ?? '',
    maxConcurrent: p.options.maxConcurrent ?? '',
    maxRequestsPerMinute: p.options.maxRequestsPerMinute ?? '',
  };
}

function fromPreset(p: ProviderPreset): FormState {
  return { type: p.type, name: p.name, baseUrl: p.baseUrl, enabled: true, paid: p.paid, approved: false, apiKey: '', authHeader: '', organization: '', maxConcurrent: '', maxRequestsPerMinute: '' };
}

export interface ProviderDialogProps {
  open: boolean;
  /** null = add a new provider. */
  provider: ProviderConfig | null;
  /** DaemonStatus.secretStore.secure (null = unknown). */
  secureStore: boolean | null;
  onClose: () => void;
  onSaved: (provider: ProviderConfig) => void;
}

export function ProviderDialog({ open, provider, secureStore, onClose, onSaved }: ProviderDialogProps) {
  const editing = provider !== null;
  const [presetId, setPresetId] = useState('openai');
  const [form, setForm] = useState<FormState>(() => (provider ? fromProvider(provider) : fromPreset(PROVIDER_PRESETS[0])));
  const [paidTouched, setPaidTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmClearKey, setConfirmClearKey] = useState(false);
  const [hasKey, setHasKey] = useState(provider?.hasApiKey ?? false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(provider ? fromProvider(provider) : fromPreset(PROVIDER_PRESETS[0]));
    setPresetId('openai');
    setPaidTouched(false);
    setErrors({});
    setGeneral(null);
    setConfirmClearKey(false);
    setHasKey(provider?.hasApiKey ?? false);
    setShowAdvanced(!!provider && Object.keys(provider.options).length > 0);
  }, [open, provider]);

  const upsert = useMutation('providers.upsert');
  const setKey = useMutation('providers.setApiKey');
  const clearKey = useMutation('providers.clearApiKey', {
    successToast: 'Schlüssel entfernt',
    onSuccess: () => {
      setHasKey(false);
      setConfirmClearKey(false);
    },
  });

  const isOllama = form.type === 'ollama';
  const url = form.baseUrl.trim();
  const local = isHttpUrl(url) && isLocalUrl(url);
  const set = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    const keys = Object.keys(patch);
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !keys.includes(k))));
  };

  const choosePreset = (p: ProviderPreset) => {
    setPresetId(p.id);
    setPaidTouched(false);
    setForm((f) => ({ ...fromPreset(p), apiKey: f.apiKey }));
    setErrors({});
  };

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Bitte einen Namen eingeben.';
    if (!isHttpUrl(url)) e.baseUrl = 'Bitte eine Adresse wie https://api.example.com/v1 eingeben.';
    for (const [key, max] of [
      ['maxConcurrent', 64],
      ['maxRequestsPerMinute', 100_000],
    ] as const) {
      const r = parseNumber(form[key], { min: 1, max, int: true, nullable: true });
      if (r.error) e[key] = r.error;
    }
    if (form.authHeader.trim() && !/^[A-Za-z0-9-]{1,64}$/.test(form.authHeader.trim())) e.authHeader = 'Nur Buchstaben, Ziffern und Bindestriche (z. B. api-key).';
    return e;
  };

  const submit = async () => {
    const e = validate();
    setErrors(e);
    setGeneral(null);
    if (Object.keys(e).length > 0) return;
    const options: Record<string, string> = {};
    if (!isOllama) {
      if (form.authHeader.trim()) options.authHeader = form.authHeader.trim();
      if (form.organization.trim()) options.organization = form.organization.trim();
      if (form.maxConcurrent.trim()) options.maxConcurrent = String(parseNumber(form.maxConcurrent, { int: true }).value);
      if (form.maxRequestsPerMinute.trim()) options.maxRequestsPerMinute = String(parseNumber(form.maxRequestsPerMinute, { int: true }).value);
    }
    setSaving(true);
    let saved: ProviderConfig;
    try {
      saved = await upsert.runAsync({
        ...(provider ? { id: provider.id } : {}),
        type: form.type,
        name: form.name.trim(),
        baseUrl: url,
        enabled: form.enabled,
        ...(isOllama ? {} : { paid: form.paid, approved: form.paid ? form.approved : false, options }),
      });
    } catch (err) {
      const issues = rpcIssues(err);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(issues)) {
        const key = k.startsWith('options.') ? k.slice('options.'.length) : k;
        mapped[key || 'general'] = v;
      }
      setErrors(mapped);
      setGeneral(mapped.general ?? (Object.keys(mapped).length === 0 ? (err instanceof Error ? err.message : 'Speichern fehlgeschlagen.') : null));
      setSaving(false);
      return;
    }
    let keySaved = false;
    if (!isOllama && form.apiKey.trim()) {
      try {
        await setKey.runAsync({ providerId: saved.id, apiKey: form.apiKey.trim() });
        keySaved = true;
        saved = { ...saved, hasApiKey: true };
      } catch (err) {
        toast.fromError(err, 'Der Anbieter wurde gespeichert, der Schlüssel aber nicht');
      }
    }
    setSaving(false);
    toast.success(editing ? 'Anbieter gespeichert' : 'Anbieter hinzugefügt', keySaved ? 'Der API-Schlüssel ist sicher hinterlegt.' : undefined);
    onSaved(saved);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      dismissible={!saving}
      size="lg"
      icon={isOllama || local ? Cpu : Cloud}
      title={editing ? `${provider.name} bearbeiten` : 'Anbieter hinzufügen'}
      description={editing ? PROVIDER_TYPE[provider.type].label : 'Cloud-KI oder ein lokaler Server mit OpenAI-kompatibler Schnittstelle.'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button variant="primary" icon={Check} loading={saving} onClick={() => void submit()}>
            {editing ? 'Speichern' : 'Hinzufügen'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {!editing && (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-text">Vorlage</legend>
            <div role="radiogroup" aria-label="Vorlage" className="grid gap-1.5 sm:grid-cols-2">
              {PROVIDER_PRESETS.map((p) => {
                const active = p.id === presetId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => choosePreset(p)}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-colors duration-150',
                      active ? 'border-violet bg-violet/10' : 'border-border bg-surface-2/50 hover:border-border-strong hover:bg-surface-2',
                    )}
                  >
                    <span className="block text-[13px] font-medium text-text">{p.label}</span>
                    <span className="block text-[11px] text-muted">{p.description}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {general && (
          <Notice tone="danger" alert>
            {general}
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Art der Schnittstelle"
            value={form.type}
            disabled={editing}
            onChange={(e) => set({ type: e.target.value as ProviderType })}
            options={(['openai_compatible', 'anthropic', 'ollama'] as ProviderType[]).map((t) => ({ value: t, label: PROVIDER_TYPE[t].label }))}
            hint={editing ? 'Die Art lässt sich nachträglich nicht ändern.' : undefined}
          />
          <Input label="Name" required value={form.name} onChange={(e) => set({ name: e.target.value })} error={errors.name} placeholder="z. B. OpenAI" />
        </div>
        <Input
          label="Adresse (Basis-URL)"
          required
          value={form.baseUrl}
          onChange={(e) => {
            const baseUrl = e.target.value;
            const v = baseUrl.trim();
            set({ baseUrl, ...(!editing && !paidTouched && isHttpUrl(v) ? { paid: !isLocalUrl(v) } : {}) });
          }}
          error={errors.baseUrl}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs"
          hint={local ? 'Läuft auf diesem PC – Projektdaten verlassen den Rechner nicht.' : 'Projektinhalte werden an diese Adresse geschickt – pro Projekt erst nach einer Freigabe.'}
        />

        {!isOllama && (
          <div className="space-y-2.5 rounded-lg border border-border bg-surface-2/40 p-3">
            <Checkbox
              checked={form.paid}
              onChange={(paid) => {
                setPaidTouched(true);
                set({ paid, approved: paid ? form.approved : false });
              }}
              label="Kostenpflichtig"
              description="Aufrufe dieses Anbieters kosten Geld."
            />
            {!form.paid && isHttpUrl(url) && !local && (
              <Notice tone="warning" title={FREE_CLOUD_PROVIDER_TEXT}>
                Der Anbieter läuft nicht auf diesem PC. Wenn er doch Geld kostet, bitte „Kostenpflichtig“ ankreuzen – sonst zählt NOVA die Kosten nicht und kann kein Budget einhalten.
              </Notice>
            )}
            {form.paid && (
              <div className={cn('rounded-lg border p-2.5', form.approved ? 'border-warning/50 bg-warning/10' : 'border-border')}>
                <Checkbox
                  checked={form.approved}
                  onChange={(approved) => set({ approved })}
                  label={<span className="font-medium">Kostenpflichtige Nutzung freigeben</span>}
                  description={PAID_APPROVAL_WARNING}
                />
              </div>
            )}
          </div>
        )}

        {!isOllama && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-text">API-Schlüssel</span>
              {hasKey ? (
                <Badge tone="success" icon={KeyRound}>
                  Schlüssel gespeichert
                </Badge>
              ) : (
                <Badge tone={local ? 'neutral' : 'warning'} icon={KeyRound}>
                  Kein Schlüssel gespeichert
                </Badge>
              )}
            </div>
            <Input
              aria-label="API-Schlüssel"
              type="password"
              autoComplete="new-password"
              spellCheck={false}
              value={form.apiKey}
              onChange={(e) => set({ apiKey: e.target.value })}
              placeholder={hasKey ? 'Neuen Schlüssel eingeben, um den gespeicherten zu ersetzen' : local ? 'Für lokale Server meist nicht nötig' : 'Schlüssel hier einfügen'}
              hint="Der Schlüssel wird nur gespeichert und nie wieder angezeigt."
            />
            {hasKey && editing && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {confirmClearKey ? (
                  <>
                    <span className="text-muted">Schlüssel wirklich entfernen? Der Anbieter funktioniert dann nicht mehr.</span>
                    <Button size="sm" variant="danger" loading={clearKey.loading} onClick={() => void clearKey.run({ providerId: provider.id })}>
                      Ja, entfernen
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmClearKey(false)}>
                      Abbrechen
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirmClearKey(true)}>
                    Gespeicherten Schlüssel entfernen
                  </Button>
                )}
              </div>
            )}
            {secureStore === false ? (
              <Notice tone="warning" icon={ShieldAlert}>
                {INSECURE_STORE_TEXT}
              </Notice>
            ) : (
              <p className="text-[11px] text-muted">{SECRET_STORE_TEXT}</p>
            )}
          </div>
        )}

        <Switch checked={form.enabled} onChange={(enabled) => set({ enabled })} label="Eingeschaltet" description="Ausgeschaltete Anbieter und ihre Modelle verwendet NOVA nie." />

        {!isOllama && (
          <div>
            <button type="button" className="text-xs font-medium text-blue-fg hover:underline" aria-expanded={showAdvanced} onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? 'Erweiterte Optionen ausblenden' : 'Erweiterte Optionen anzeigen'}
            </button>
            {showAdvanced && (
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Header-Name für den Schlüssel"
                  value={form.authHeader}
                  onChange={(e) => set({ authHeader: e.target.value })}
                  error={errors.authHeader}
                  placeholder={form.type === 'anthropic' ? 'x-api-key' : 'Authorization'}
                  hint="Nur ändern, wenn der Anbieter es verlangt (z. B. „api-key“ bei Azure)."
                  spellCheck={false}
                />
                <Input
                  label="Organisation"
                  value={form.organization}
                  onChange={(e) => set({ organization: e.target.value })}
                  error={errors.organization}
                  hint="Optional, z. B. die OpenAI-Organisations-ID."
                  spellCheck={false}
                />
                <Input
                  label="Gleichzeitige Anfragen (höchstens)"
                  inputMode="numeric"
                  value={form.maxConcurrent}
                  onChange={(e) => set({ maxConcurrent: e.target.value })}
                  error={errors.maxConcurrent}
                  hint="Leer = Standard des Dienstes."
                />
                <Input
                  label="Anfragen pro Minute (höchstens)"
                  inputMode="numeric"
                  value={form.maxRequestsPerMinute}
                  onChange={(e) => set({ maxRequestsPerMinute: e.target.value })}
                  error={errors.maxRequestsPerMinute}
                  hint="Leer = keine eigene Grenze."
                />
              </div>
            )}
          </div>
        )}
      </form>
    </Dialog>
  );
}
