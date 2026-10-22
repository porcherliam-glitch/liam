// "Einstellungen" card of the 3D page (same fields as Einstellungen › 3D-Werkstatt, SPEC-3D §1) and the compact
// ComfyUI summary shown in Einstellungen and on the models page.
import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, RefreshCw, Settings2 } from 'lucide-react';
import type { UseRpcResult } from '../../hooks';
import { Badge, Button, Card, ErrorState, LoadingState, StatusBadge } from '../../components/ui';
import { paths } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { sectionById, type DraftValue, type FieldDef } from '../settings/fields';
import { SettingsForm } from '../settings/SettingsForm';
import { rpcIssues } from '../settings/shared/forms';
import { useSettingsDraft } from '../settings/useSettingsDraft';
import { saveThreeDPatch } from './threedSettings';
import { ENGINE_STATE, engineState } from './threedUtils';
import type { EngineStatusResult } from './useThreeD';

const SECTION = sectionById('threed');
const CARD_SECTION = { ...SECTION, label: 'Einstellungen', icon: Settings2, description: 'Gelten für alle neuen Aufträge. Dieselben Einstellungen stehen auch unter „Einstellungen“ › „3D-Werkstatt“.' };

export function ThreeDSettingsCard({ settings }: { settings: UseRpcResult<'settings.get'> }) {
  const draft = useSettingsDraft(settings.data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const clear = () => {
    setErrors({});
    setGeneralError(null);
  };

  const save = async () => {
    const { patch, errors: local, changed } = draft.buildPatch(SECTION.fields);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    if (changed === 0) {
      draft.discard(SECTION.fields);
      return;
    }
    setSaving(true);
    try {
      settings.setData(await saveThreeDPatch(patch));
      draft.discard(SECTION.fields);
      clear();
      toast.success('Einstellungen der 3D-Werkstatt gespeichert');
    } catch (err) {
      const issues = rpcIssues(err);
      const fieldErrors: Record<string, string> = {};
      const unmatched: string[] = [];
      for (const [key, message] of Object.entries(issues)) {
        const field = SECTION.fields.find((f) => key === f.path || key.startsWith(`${f.path}.`));
        if (field) fieldErrors[field.path] ??= message;
        else unmatched.push(message);
      }
      setErrors(fieldErrors);
      setGeneralError(unmatched.join(' ') || null);
      if (Object.keys(issues).length === 0) toast.fromError(err, 'Einstellungen konnten nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  if (settings.loading) {
    return (
      <Card title="Einstellungen" icon={Settings2}>
        <LoadingState compact label="Einstellungen werden geladen …" />
      </Card>
    );
  }
  if (!settings.data) {
    return (
      <Card title="Einstellungen" icon={Settings2}>
        <ErrorState compact error={settings.error} onRetry={() => void settings.refetch()} />
      </Card>
    );
  }
  return (
    <SettingsForm
      section={CARD_SECTION}
      draft={draft}
      errors={errors}
      generalError={generalError}
      saving={saving}
      onChange={(field: FieldDef, value: DraftValue) => {
        draft.set(field, value);
        if (errors[field.path]) setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field.path)));
      }}
      onSave={() => void save()}
      onDiscard={() => {
        draft.discard(SECTION.fields);
        clear();
      }}
      onDefaults={() => {
        draft.applyDefaults(SECTION.fields);
        clear();
      }}
    />
  );
}

/** One-line ComfyUI status with "Erneut prüfen" and an optional link to the 3D-Werkstatt. */
export function EngineSummary({ engine, showLink = true }: { engine: EngineStatusResult; showLink?: boolean }) {
  const s = engine.data;
  if (engine.loading) return <LoadingState compact label="ComfyUI wird gesucht …" className="py-2" />;
  if (!s) return <ErrorState compact error={engine.error} title="Der Status von ComfyUI konnte nicht geladen werden" onRetry={() => void engine.refetch()} className="py-2" />;
  const state = engineState(s);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border bg-surface-2/40 px-3 py-2">
      <span className="text-xs font-medium text-text">ComfyUI</span>
      <StatusBadge size="md" meta={ENGINE_STATE[state]} />
      {s.version && <Badge tone="neutral">Version {s.version}</Badge>}
      <span className="font-mono text-[11px] text-muted">{s.baseUrl}</span>
      <span className="min-w-0 flex-1 text-[11px] text-muted">{state === 'ready' ? (s.modelsDir ? `Modelle: ${s.modelsDir}` : 'Modellordner noch nicht bekannt') : s.message}</span>
      <span className="flex items-center gap-1">
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={engine.checking} onClick={() => void engine.recheck()}>
          Erneut prüfen
        </Button>
        {showLink && (
          <Link to={paths.threed} className="inline-flex items-center gap-1 text-xs font-medium">
            Zur 3D-Werkstatt
            <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </span>
    </div>
  );
}
