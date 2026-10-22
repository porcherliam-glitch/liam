// "Neues 3D-Modell" (SPEC-3D §1): tabs "Text zu 3D" / "Bild zu 3D", generator, quality with explanation and time
// hint, target (project or NOVA library) and file name. Disabled with a reason while ComfyUI or models are missing.
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CircleCheck, Download, Info, Sparkles } from 'lucide-react';
import type { ProjectSummary, ThreeDEngineStatus, ThreeDGenerator, ThreeDJob, ThreeDModel, ThreeDQuality } from '@shared/schemas';
import type { RpcParams } from '@shared/rpc';
import type { Settings } from '@shared/settings';
import { Badge, Button, Card, Input, SegmentedControl, Select, TabPanel, Tabs, Textarea } from '../../components/ui';
import { useMutation, useStoredState } from '../../hooks';
import { cn } from '../../lib/cn';
import { THREED_GENERATOR, THREED_MODE, THREED_QUALITY } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { rpcIssues } from '../settings/shared/forms';
import { Notice } from '../settings/shared/ui';
import { ImagePicker } from './ImagePicker';
import { createBlocker, MAX_PROMPT_LENGTH, MAX_NAME_LENGTH, outputPreview, suggestName, timeHint, validateName, type PickedImage } from './threedUtils';

type Mode = ThreeDJob['mode'];
type Target = 'project' | 'library';

const GENERATORS: ThreeDGenerator[] = ['trellis2', 'pixal3d'];
const QUALITIES: ThreeDQuality[] = ['draft', 'standard', 'high'];

/** Example descriptions – a click puts them into the text field. */
export const PROMPT_EXAMPLES = [
  'Eine alte Holzkiste mit Eisenbeschlägen',
  'Ein Heiltrank in einer runden Glasflasche mit Korken',
  'Ein gemütlicher Sessel aus grünem Samt',
  'Eine Laterne aus Messing im Steampunk-Stil',
  'Ein freundlicher kleiner Roboter mit runden Augen',
];

export interface CreateCardProps {
  status: ThreeDEngineStatus | undefined;
  models: ThreeDModel[] | undefined;
  settings: Settings['threeD'] | undefined;
  projects: ProjectSummary[];
  onCreated: (job: ThreeDJob) => void;
  /** Scrolls to the ComfyUI card (blocker "target: engine"). */
  onShowEngine: () => void;
}

interface FieldErrors {
  prompt?: string;
  image?: string;
  name?: string;
  project?: string;
}

export function CreateCard({ status, models, settings, projects, onCreated, onShowEngine }: CreateCardProps) {
  const [mode, setMode] = useStoredState<Mode>('threed.mode', 'text');
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState<PickedImage | null>(null);
  const [generatorChoice, setGenerator] = useState<ThreeDGenerator | null>(null);
  const [qualityChoice, setQuality] = useState<ThreeDQuality | null>(null);
  const [targetChoice, setTarget] = useStoredState<Target>('threed.target', 'library');
  const [projectChoice, setProjectId] = useStoredState<string>('threed.project', '');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const ids = useId();

  const generator = generatorChoice ?? settings?.defaultModel ?? 'trellis2';
  const quality = qualityChoice ?? settings?.defaultQuality ?? 'standard';
  const projectId = projects.some((p) => p.id === projectChoice) ? projectChoice : '';
  const target: Target = projects.length === 0 ? 'library' : targetChoice;
  const suggestion = mode === 'text' ? suggestName(prompt) : image ? suggestName(image.name) : '';
  const effectiveName = name.trim() || suggestion;
  const blocker = createBlocker(status, models, mode, generator);
  const modelById = useMemo(() => new Map((models ?? []).map((m) => [m.id, m])), [models]);

  const generate = useMutation('threed.generate', {
    errorToast: false,
    onSuccess: (job) => {
      toast.success('3D-Auftrag gestartet', `„${job.name}“ – den Fortschritt zeigt die Liste der Aufträge.`);
      setName('');
      onCreated(job);
    },
    onError: (e) => {
      const issues = rpcIssues(e);
      const fieldErrors: FieldErrors = {};
      if (issues.prompt) fieldErrors.prompt = issues.prompt;
      if (issues.imageBase64 || issues.imagePath) fieldErrors.image = issues.imageBase64 ?? issues.imagePath;
      if (issues.name) fieldErrors.name = issues.name;
      setErrors(fieldErrors);
      setServerError(Object.keys(fieldErrors).length > 0 ? null : e.message);
    },
  });

  const clearError = (key: keyof FieldErrors) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    setServerError(null);
  };

  const submit = () => {
    const next: FieldErrors = {};
    if (mode === 'text' && !prompt.trim()) next.prompt = 'Bitte beschreiben, welches Objekt entstehen soll.';
    if (mode === 'image' && !image) next.image = 'Bitte zuerst ein Bild auswählen, hineinziehen oder einfügen.';
    const nameError = effectiveName ? validateName(effectiveName) : 'Bitte einen Namen eingeben.';
    if (nameError) next.name = nameError;
    if (target === 'project' && !projectId) next.project = 'Bitte ein Projekt wählen.';
    setErrors(next);
    setServerError(null);
    if (Object.keys(next).length > 0 || blocker) return;
    const params: RpcParams<'threed.generate'> = {
      mode,
      model: generator,
      quality,
      name: effectiveName,
      projectId: target === 'project' ? projectId : null,
      ...(mode === 'text' ? { prompt: prompt.trim() } : { imageBase64: image?.base64 }),
    };
    void generate.run(params);
  };

  const modeTabs = (['text', 'image'] as const).map((m) => ({ id: m, label: THREED_MODE[m].label, icon: THREED_MODE[m].icon }));

  return (
    <Card title="Neues 3D-Modell" description="Aus einer Beschreibung oder einem Bild entsteht ein 3D-Modell mit Farben und Oberflächen (.glb)." icon={Sparkles}>
      <form
        className="space-y-4"
        aria-label="Neues 3D-Modell"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div>
          <Tabs label="Art der Erzeugung" idBase="threed-mode" items={modeTabs} value={mode} onChange={(m) => setMode(m)} className="overflow-y-hidden" />
          <TabPanel idBase="threed-mode" id={mode} className="pt-3">
            {mode === 'text' ? (
              <div className="space-y-2">
                <Textarea
                  label="Beschreibung"
                  value={prompt}
                  rows={3}
                  maxLength={MAX_PROMPT_LENGTH}
                  onChange={(e) => {
                    setPrompt(e.target.value);
                    clearError('prompt');
                  }}
                  placeholder="z. B. Eine alte Holzkiste mit Eisenbeschlägen"
                  error={errors.prompt}
                  hint={`Ein einzelnes Objekt beschreiben: was es ist, Material, Farbe, Stil. Deutsch oder Englisch. ${prompt.length} / ${MAX_PROMPT_LENGTH} Zeichen`}
                />
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">Beispiele – ein Klick übernimmt den Text:</p>
                  <ul className="flex flex-wrap gap-1.5">
                    {PROMPT_EXAMPLES.map((ex) => (
                      <li key={ex}>
                        <button
                          type="button"
                          onClick={() => {
                            setPrompt(ex);
                            clearError('prompt');
                          }}
                          className="rounded-md border border-border bg-surface-2/60 px-2 py-0.5 text-[11px] text-text transition-colors duration-150 hover:border-border-strong hover:bg-surface-2"
                        >
                          {ex}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-muted">
                  <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info-fg" />
                  NOVA erzeugt mit Z-Image Turbo zuerst ein Bild des Objekts auf weißem Hintergrund und macht daraus das 3D-Modell. Das Bild wird mitgespeichert.
                </p>
              </div>
            ) : (
              <ImagePicker
                value={image}
                onChange={(img) => {
                  setImage(img);
                  clearError('image');
                }}
                error={errors.image ?? null}
                onError={(msg) => setErrors((prev) => ({ ...prev, image: msg ?? undefined }))}
              />
            )}
          </TabPanel>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 text-xs font-medium text-text">3D-Modell (Generator)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {GENERATORS.map((g) => {
              const model = modelById.get(g);
              const meta = THREED_GENERATOR[g];
              const selected = g === generator;
              return (
                <label
                  key={g}
                  className={cn(
                    'flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-violet',
                    selected ? 'border-violet/60 bg-violet/10' : 'border-border bg-surface-2/40 hover:border-border-strong',
                  )}
                >
                  <input type="radio" name={`${ids}-generator`} value={g} checked={selected} onChange={() => setGenerator(g)} className="mt-1 accent-violet" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium text-text">{meta.label}</span>
                      {model &&
                        (model.installed ? (
                          <Badge tone="success" icon={CircleCheck}>
                            Installiert
                          </Badge>
                        ) : (
                          <Badge tone="warning" icon={Download}>
                            Nicht heruntergeladen
                          </Badge>
                        ))}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">{meta.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <p id={`${ids}-quality`} className="text-xs font-medium text-text">
            Qualität
          </p>
          <SegmentedControl label="Qualität" options={QUALITIES.map((q) => ({ value: q, label: THREED_QUALITY[q].label }))} value={quality} onChange={setQuality} />
          <p className="text-xs text-muted">
            <span className="text-text">{THREED_QUALITY[quality].description}</span> {timeHint(quality, mode)}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text">Speichern in</p>
            <SegmentedControl
              label="Speichern in"
              options={[
                { value: 'project', label: 'Projekt' },
                { value: 'library', label: 'NOVA-Bibliothek' },
              ]}
              value={target}
              onChange={(t) => {
                if (projects.length === 0 && t === 'project') return;
                setTarget(t);
                clearError('project');
              }}
            />
            {target === 'project' ? (
              <Select
                label="Projekt"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  clearError('project');
                }}
                placeholder="Projekt wählen …"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
                error={errors.project}
              />
            ) : (
              <p className="text-xs text-muted">
                {projects.length === 0 ? 'Noch kein Projekt vorhanden – ' : ''}Das Modell kommt in die 3D-Bibliothek im NOVA-Datenordner.
              </p>
            )}
          </div>
          <Input
            label="Name"
            value={name}
            maxLength={MAX_NAME_LENGTH}
            onChange={(e) => {
              setName(e.target.value);
              clearError('name');
            }}
            placeholder={suggestion || 'z. B. holzkiste'}
            error={errors.name}
            hint={
              effectiveName
                ? target === 'project'
                  ? `Datei: ${outputPreview(settings?.outputFolder ?? 'assets/3d', effectiveName)} – erscheint unter „Änderungen“ und lässt sich rückgängig machen.`
                  : `Datei: ${effectiveName}.glb`
                : 'Wird zum Dateinamen, z. B. holzkiste.glb.'
            }
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {settings?.unloadLanguageModels && (
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-info-fg" />
            Damit der Grafikspeicher reicht, entlädt NOVA vor jedem Auftrag geladene Sprachmodelle. Agenten können in dieser Zeit langsamer arbeiten.
          </p>
        )}

        {blocker && (
          <Notice
            tone="warning"
            title="Gerade nicht möglich"
            actions={
              blocker.target === 'models' ? (
                <Link to={paths.models3d} className="inline-flex items-center gap-1 text-xs font-medium">
                  Zu den 3D-Modellen
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <Button size="sm" variant="ghost" onClick={onShowEngine}>
                  Zum ComfyUI-Status
                </Button>
              )
            }
          >
            {blocker.reason}
          </Notice>
        )}
        {serverError && (
          <Notice tone="danger" title="Der Auftrag konnte nicht gestartet werden" alert>
            {serverError}
          </Notice>
        )}

        <div className="flex justify-end">
          <Button type="submit" variant="primary" size="lg" icon={Sparkles} loading={generate.loading} disabled={!!blocker} title={blocker?.reason}>
            3D-Modell erzeugen
          </Button>
        </div>
      </form>
    </Card>
  );
}
