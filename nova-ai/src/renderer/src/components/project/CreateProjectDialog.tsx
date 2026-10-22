// "Neues Projekt": five ways to start a project (UI-SPEC §4, MASTERPROMPT §9):
// Beschreiben (free text, kind detected), Assistent (step-by-step questions), Vorlage (templates.list with missing
// tools), Öffnen (existing folder via app.selectDirectory) and Importieren (git URL + target folder).
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowRight, Check, FolderOpen, FolderPlus, GitBranch, Info, LayoutTemplate, PenLine, TriangleAlert, Wand2, type LucideIcon } from 'lucide-react';
import type { CreateProjectInput, CreateProjectMode, Operation, ProjectKind, ProjectTemplateInfo } from '@shared/schemas';
import type { RpcResult } from '@shared/rpc';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { useNovaEvent } from '../../hooks/useEvents';
import { getBridge, isRpcError, validationIssues } from '../../lib/api';
import { cn } from '../../lib/cn';
import { basename } from '../../lib/format';
import { INTEGRATION_NAME, metaOf, PREVIEW_KIND, PROJECT_KIND } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { TRUST_PROJECT_TEXT } from '../../lib/texts';
import { toast } from '../../stores/toasts';
import { Badge, StatusBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { EmptyState, ErrorState, LoadingState } from '../ui/EmptyState';
import { Field, Input, Select, Textarea } from '../ui/Field';
import { ProgressBar } from '../ui/ProgressBar';
import { Checkbox } from '../ui/Switch';
import { TabPanel, Tabs } from '../ui/Tabs';
import { ChipsInput } from './ChipsInput';
import { useAutoFocusTarget } from './useAutoFocusTarget';

export interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after the project was created (before navigating to it). */
  onCreated?: (result: RpcResult<'projects.create'>) => void;
}

type CreateResult = RpcResult<'projects.create'>;

const MODES: Array<{ id: CreateProjectMode; label: string; icon: LucideIcon }> = [
  { id: 'description', label: 'Beschreiben', icon: PenLine },
  { id: 'wizard', label: 'Assistent', icon: Wand2 },
  { id: 'template', label: 'Vorlage', icon: LayoutTemplate },
  { id: 'open', label: 'Öffnen', icon: FolderOpen },
  { id: 'import', label: 'Importieren', icon: GitBranch },
];

const KIND_ORDER: ProjectKind[] = ['web', 'backend', 'desktop', 'unity', 'godot', 'unreal', 'generic'];

/** Same rule as CreateProjectInputSchema.repoUrl. */
const REPO_URL = /^(https:\/\/|ssh:\/\/|git@[A-Za-z0-9.-]+:)/;

export const WIZARD_ART: Array<{ label: string; kind: ProjectKind }> = [
  { label: 'Webseite oder Web-App', kind: 'web' },
  { label: 'Browser-Spiel', kind: 'web' },
  { label: 'Spiel mit Unity', kind: 'unity' },
  { label: 'Spiel mit Godot', kind: 'godot' },
  { label: 'Spiel mit der Unreal Engine', kind: 'unreal' },
  { label: 'Windows-Programm', kind: 'desktop' },
  { label: 'Server, API oder Datenbank', kind: 'backend' },
  { label: 'Etwas anderes', kind: 'generic' },
];

const WIZARD_PLATFORMS = ['Browser (PC und Handy)', 'Windows', 'Server oder Cloud', 'Android oder iOS', 'Mehrere Plattformen', 'Noch offen – NOVA soll entscheiden'];

const WIZARD_STEPS = ['Art', 'Zielplattform', 'Wichtigste Funktionen', 'Stil und Technik', 'Name und Speicherort'] as const;

/** Repository name from a git URL ("https://github.com/a/my-app.git" → "my-app"). */
export function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/[/\\]+$/, '').replace(/\.git$/i, '');
  const last = cleaned.split(/[/:]/).pop() ?? '';
  return last.replace(/[^\p{L}\p{N} ._-]/gu, '').trim();
}

interface DescState {
  name: string;
  description: string;
  kind: ProjectKind | '';
  technologies: string[];
  path: string;
}
interface WizardState {
  step: number;
  art: string;
  platform: string;
  platformOther: string;
  features: string;
  style: string;
  technologies: string[];
  name: string;
  path: string;
}
interface TemplateState {
  templateId: string;
  name: string;
  description: string;
  path: string;
}
interface OpenState {
  path: string;
  name: string;
  nameTouched: boolean;
  description: string;
}
interface ImportState {
  repoUrl: string;
  path: string;
  name: string;
  nameTouched: boolean;
}

const EMPTY = {
  description: (): DescState => ({ name: '', description: '', kind: '', technologies: [], path: '' }),
  wizard: (): WizardState => ({ step: 0, art: '', platform: '', platformOther: '', features: '', style: '', technologies: [], name: '', path: '' }),
  template: (): TemplateState => ({ templateId: '', name: '', description: '', path: '' }),
  open: (): OpenState => ({ path: '', name: '', nameTouched: false, description: '' }),
  import: (): ImportState => ({ repoUrl: '', path: '', name: '', nameTouched: false }),
};

export function CreateProjectDialog({ open, onClose, onCreated }: CreateProjectDialogProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<CreateProjectMode>('description');
  const [desc, setDesc] = useState(EMPTY.description);
  const [wizard, setWizard] = useState(EMPTY.wizard);
  const [tpl, setTpl] = useState(EMPTY.template);
  const [openState, setOpenState] = useState(EMPTY.open);
  const [imp, setImp] = useState(EMPTY.import);
  const [planNow, setPlanNow] = useState(true);
  const [initGit, setInitGit] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const submittedAt = useRef(0);
  const focus = useAutoFocusTarget<HTMLFormElement>();

  useEffect(() => {
    if (!open) return;
    setMode('description');
    setDesc(EMPTY.description());
    setWizard(EMPTY.wizard());
    setTpl(EMPTY.template());
    setOpenState(EMPTY.open());
    setImp(EMPTY.import());
    setPlanNow(true);
    setInitGit(true);
    setErrors({});
    setFormError(null);
    setOperation(null);
  }, [open]);

  const settings = useRpc('settings.get', open ? undefined : null);
  const projectsDir = settings.data?.general.projectsDir || '';
  const templates = useRpc('templates.list', open && mode === 'template' ? undefined : null);

  const create = useMutation('projects.create', { errorToast: false });
  const cancelOp = useMutation('operations.cancel', { successToast: 'Vorgang wird abgebrochen' });

  // Progress of the long-running create/clone operation while waiting for the answer.
  useNovaEvent(
    'operation.updated',
    (op) => {
      if ((op.kind === 'clone' || op.kind === 'project_create') && op.startedAt >= submittedAt.current - 2000) setOperation(op.status === 'running' ? op : null);
    },
    create.loading,
  );

  const switchMode = (m: CreateProjectMode) => {
    setMode(m);
    setErrors({});
    setFormError(null);
  };

  const pickFolder = async (title: string, defaultPath?: string): Promise<string | null> => {
    const bridge = getBridge();
    if (!bridge?.app?.selectDirectory) {
      toast.error('Ordnerauswahl nicht möglich', 'Die Ordnerauswahl steht gerade nicht zur Verfügung. Bitte den Pfad von Hand eintragen.');
      return null;
    }
    try {
      return await bridge.app.selectDirectory({ title, defaultPath: defaultPath || projectsDir || undefined });
    } catch {
      toast.error('Ordnerauswahl nicht möglich', 'Der Dialog konnte nicht geöffnet werden.');
      return null;
    }
  };

  const wizardKind = WIZARD_ART.find((a) => a.label === wizard.art)?.kind ?? 'generic';
  const wizardPlatform = wizard.platform === '__other' ? wizard.platformOther.trim() : wizard.platform;
  const wizardStepValid = [
    !!wizard.art,
    !!wizardPlatform,
    wizard.features.trim().length > 0,
    true,
    wizard.name.trim().length > 0,
  ];
  const lastWizardStep = WIZARD_STEPS.length - 1;

  /** Validates the current mode and builds the RPC input (or returns field errors). */
  const build = (): { input?: CreateProjectInput; errors: Record<string, string> } => {
    const e: Record<string, string> = {};
    const nameRequired = (name: string) => {
      if (!name.trim()) e.name = 'Bitte einen Projektnamen eingeben.';
      else if (name.trim().length > 120) e.name = 'Der Name darf höchstens 120 Zeichen lang sein.';
    };
    switch (mode) {
      case 'description': {
        nameRequired(desc.name);
        if (!desc.description.trim()) e.description = 'Bitte kurz beschreiben, was entstehen soll.';
        if (Object.keys(e).length) return { errors: e };
        return {
          errors: e,
          input: { mode, name: desc.name.trim(), description: desc.description.trim(), kind: desc.kind || null, technologies: desc.technologies, path: desc.path.trim() || null, planNow, initGit },
        };
      }
      case 'wizard': {
        nameRequired(wizard.name);
        if (Object.keys(e).length) return { errors: e };
        const answers: Record<string, string> = {
          Art: wizard.art,
          Zielplattform: wizardPlatform,
          'Wichtigste Funktionen': wizard.features.trim(),
        };
        if (wizard.style.trim()) answers['Stil und Technik'] = wizard.style.trim();
        if (wizard.path.trim()) answers.Speicherort = wizard.path.trim();
        const description = [`${wizard.art} für ${wizardPlatform}.`, `Wichtigste Funktionen:\n${wizard.features.trim()}`, wizard.style.trim() ? `Stil und Technik:\n${wizard.style.trim()}` : '']
          .filter(Boolean)
          .join('\n\n');
        return {
          errors: e,
          input: { mode, name: wizard.name.trim(), description, kind: wizardKind, technologies: wizard.technologies, answers, path: wizard.path.trim() || null, planNow, initGit },
        };
      }
      case 'template': {
        if (!tpl.templateId) e.templateId = 'Bitte eine Vorlage auswählen.';
        nameRequired(tpl.name);
        if (Object.keys(e).length) return { errors: e };
        return { errors: e, input: { mode, name: tpl.name.trim(), description: tpl.description.trim(), templateId: tpl.templateId, path: tpl.path.trim() || null, planNow: planNow && !!tpl.description.trim(), initGit } };
      }
      case 'open': {
        if (!openState.path.trim()) e.path = 'Bitte einen vorhandenen Projektordner auswählen.';
        nameRequired(openState.name);
        if (Object.keys(e).length) return { errors: e };
        return { errors: e, input: { mode, name: openState.name.trim(), description: openState.description.trim(), path: openState.path.trim(), planNow: planNow && !!openState.description.trim() } };
      }
      case 'import': {
        if (!imp.repoUrl.trim()) e.repoUrl = 'Für den Import wird eine Git-Adresse benötigt.';
        else if (!REPO_URL.test(imp.repoUrl.trim())) e.repoUrl = 'Nur https://-, ssh://- oder git@-Adressen sind erlaubt.';
        nameRequired(imp.name);
        if (Object.keys(e).length) return { errors: e };
        return { errors: e, input: { mode, name: imp.name.trim(), repoUrl: imp.repoUrl.trim(), path: imp.path.trim() || null, planNow: false } };
      }
    }
  };

  const submit = async (ev?: FormEvent) => {
    ev?.preventDefault();
    if (mode === 'wizard' && wizard.step < lastWizardStep) {
      if (wizardStepValid[wizard.step]) setWizard((w) => ({ ...w, step: w.step + 1 }));
      return;
    }
    const { input, errors: e } = build();
    setErrors(e);
    setFormError(null);
    if (!input) return;
    submittedAt.current = Date.now();
    try {
      const result: CreateResult = await create.runAsync(input);
      setOperation(null);
      toast.show({
        tone: 'success',
        title: `Projekt „${result.project.name}“ angelegt`,
        message: result.planTaskId ? 'NOVA plant jetzt die ersten Aufgaben.' : undefined,
      });
      if (result.warnings.length) toast.show({ tone: 'warning', title: 'Bitte beachten', message: result.warnings.join(' '), duration: 12_000 });
      onCreated?.(result);
      onClose();
      navigate(paths.project(result.project.id));
    } catch (err) {
      setOperation(null);
      if (isRpcError(err, 'CANCELLED')) {
        setFormError('Der Vorgang wurde abgebrochen. Es wurde kein Projekt angelegt.');
        return;
      }
      const issues = validationIssues(err);
      if (Object.keys(issues).length) setErrors(issues);
      setFormError(err instanceof Error ? err.message : 'Das Projekt konnte nicht angelegt werden.');
    }
  };

  const busy = create.loading;
  const isWizardIntermediate = mode === 'wizard' && wizard.step < lastWizardStep;
  const hasDescription = mode === 'description' || mode === 'wizard' || (mode === 'template' && !!tpl.description.trim()) || (mode === 'open' && !!openState.description.trim());
  const defaultTarget = (name: string) => (projectsDir ? `${projectsDir}${projectsDir.includes('/') && !projectsDir.includes('\\') ? '/' : '\\'}${name.trim() || '<Projektname>'}` : null);

  const footer = (
    <>
      <Button onClick={onClose} disabled={busy}>
        Abbrechen
      </Button>
      {mode === 'wizard' && wizard.step > 0 && (
        <Button icon={ArrowLeft} disabled={busy} onClick={() => setWizard((w) => ({ ...w, step: w.step - 1 }))}>
          Zurück
        </Button>
      )}
      {isWizardIntermediate ? (
        <Button variant="primary" iconRight={ArrowRight} disabled={!wizardStepValid[wizard.step]} type="submit" form="create-project-form">
          Weiter
        </Button>
      ) : (
        <Button variant="primary" icon={FolderPlus} loading={busy} type="submit" form="create-project-form">
          {mode === 'import' ? 'Importieren' : mode === 'open' ? 'Projekt übernehmen' : 'Projekt anlegen'}
        </Button>
      )}
    </>
  );

  return (
    <Dialog
      initialFocus={focus.target}
      open={open}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      size="xl"
      icon={FolderPlus}
      title="Neues Projekt"
      description="Wie soll das Projekt entstehen? NOVA wählt sinnvolle Standards und fragt nur bei wichtigen Unklarheiten nach."
      footer={footer}
    >
      <form id="create-project-form" ref={focus.container} onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
        <Tabs label="Art der Projekterstellung" idBase="create-project" items={MODES} value={mode} onChange={switchMode} />

        <TabPanel idBase="create-project" id={mode} className="space-y-4">
          {mode === 'description' && (
            <>
              <ModeIntro icon={PenLine}>Einfach beschreiben, was entstehen soll. NOVA erkennt die Projektart, wählt passende Technik und plant die ersten Aufgaben.</ModeIntro>
              <Input label="Projektname" required maxLength={120} value={desc.name} onChange={(e) => setDesc((s) => ({ ...s, name: e.target.value }))} error={errors.name} placeholder="z. B. Rezept-Sammlung" data-autofocus />
              <Textarea
                label="Beschreibung"
                required
                rows={6}
                value={desc.description}
                onChange={(e) => setDesc((s) => ({ ...s, description: e.target.value }))}
                error={errors.description}
                placeholder="z. B. Eine Web-App, in der ich Rezepte speichern, nach Zutaten suchen und einen Einkaufszettel erstellen kann. Schlichtes, helles Design."
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Select
                  label="Projektart"
                  value={desc.kind}
                  onChange={(e) => setDesc((s) => ({ ...s, kind: e.target.value as ProjectKind | '' }))}
                  options={KIND_ORDER.map((k) => ({ value: k, label: PROJECT_KIND[k].label }))}
                  placeholder="Automatisch erkennen"
                  hint="Nur ändern, wenn die Art schon feststeht."
                />
                <ChipsInput
                  label="Wunsch-Technologien (optional)"
                  value={desc.technologies}
                  onChange={(v) => setDesc((s) => ({ ...s, technologies: v }))}
                  placeholder="z. B. React, SQLite"
                  hint="Leer lassen – dann wählt NOVA selbst."
                />
              </div>
              <FolderField label="Speicherort (optional)" value={desc.path} onChange={(v) => setDesc((s) => ({ ...s, path: v }))} onPick={pickFolder} error={errors.path} defaultHint={defaultTarget(desc.name)} />
            </>
          )}

          {mode === 'wizard' && (
            <WizardSteps
              state={wizard}
              setState={setWizard}
              errors={errors}
              onPick={pickFolder}
              defaultHint={defaultTarget(wizard.name)}
              summary={{ kind: wizardKind, platform: wizardPlatform }}
            />
          )}

          {mode === 'template' && (
            <>
              <ModeIntro icon={LayoutTemplate}>Mit einer erprobten Vorlage starten. Fehlende Werkzeuge werden angezeigt und können unter „Werkzeuge“ installiert werden.</ModeIntro>
              {templates.loading ? (
                <LoadingState compact label="Vorlagen werden geladen …" />
              ) : templates.error && !templates.data ? (
                <ErrorState compact error={templates.error} onRetry={() => void templates.refetch()} />
              ) : (templates.data ?? []).length === 0 ? (
                <EmptyState compact icon={LayoutTemplate} title="Keine Vorlagen verfügbar" description="Es sind gerade keine Vorlagen installiert. Ein Projekt kann trotzdem über „Beschreiben“ angelegt werden." />
              ) : (
                <TemplatePicker
                  templates={templates.data ?? []}
                  value={tpl.templateId}
                  onChange={(id) => setTpl((s) => ({ ...s, templateId: id }))}
                  error={errors.templateId}
                />
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Projektname" required maxLength={120} value={tpl.name} onChange={(e) => setTpl((s) => ({ ...s, name: e.target.value }))} error={errors.name} placeholder="z. B. Mein Jump-’n’-Run" />
                <FolderField label="Speicherort (optional)" value={tpl.path} onChange={(v) => setTpl((s) => ({ ...s, path: v }))} onPick={pickFolder} error={errors.path} defaultHint={defaultTarget(tpl.name)} />
              </div>
              <Textarea
                label="Was soll entstehen? (optional)"
                rows={3}
                value={tpl.description}
                onChange={(e) => setTpl((s) => ({ ...s, description: e.target.value }))}
                placeholder="Mit einer kurzen Beschreibung plant NOVA gleich die ersten Aufgaben."
              />
            </>
          )}

          {mode === 'open' && (
            <>
              <ModeIntro icon={FolderOpen}>Ein vorhandenes Projekt auf diesem PC übernehmen. Der Ordner wird beim Übernehmen nicht verändert; NOVA erkennt Technik und Befehle selbst.</ModeIntro>
              <FolderField
                label="Projektordner"
                required
                value={openState.path}
                onChange={(v) => setOpenState((s) => ({ ...s, path: v, name: s.nameTouched ? s.name : basename(v.replace(/[\\/]+$/, '')) }))}
                onPick={pickFolder}
                error={errors.path}
                pickTitle="Vorhandenen Projektordner auswählen"
              />
              <Input
                label="Projektname"
                required
                maxLength={120}
                value={openState.name}
                onChange={(e) => setOpenState((s) => ({ ...s, name: e.target.value, nameTouched: true }))}
                error={errors.name}
                hint="Wird aus dem Ordnernamen übernommen und kann geändert werden."
              />
              <Textarea
                label="Ziel oder Beschreibung (optional)"
                rows={3}
                value={openState.description}
                onChange={(e) => setOpenState((s) => ({ ...s, description: e.target.value }))}
                placeholder="z. B. Bestehende Fehler beheben und Tests ergänzen."
              />
              <TrustNote />
            </>
          )}

          {mode === 'import' && (
            <>
              <ModeIntro icon={GitBranch}>Ein bestehendes Git-Repository herunterladen (klonen) und als Projekt übernehmen.</ModeIntro>
              <Input
                label="Git-Adresse"
                required
                value={imp.repoUrl}
                onChange={(e) => {
                  const url = e.target.value;
                  setImp((s) => ({ ...s, repoUrl: url, name: s.nameTouched ? s.name : repoNameFromUrl(url) }));
                }}
                error={errors.repoUrl}
                placeholder="https://github.com/name/projekt.git"
                hint="Erlaubt sind https://-, ssh://- und git@-Adressen."
                spellCheck={false}
                autoComplete="off"
                className="font-mono text-xs"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Projektname"
                  required
                  maxLength={120}
                  value={imp.name}
                  onChange={(e) => setImp((s) => ({ ...s, name: e.target.value, nameTouched: true }))}
                  error={errors.name}
                />
                <FolderField label="Zielordner (optional)" value={imp.path} onChange={(v) => setImp((s) => ({ ...s, path: v }))} onPick={pickFolder} error={errors.path} defaultHint={defaultTarget(imp.name)} pickTitle="Zielordner für den Import auswählen" />
              </div>
              <TrustNote />
            </>
          )}
        </TabPanel>

        {!isWizardIntermediate && (
          <fieldset className="space-y-2.5 rounded-lg border border-border bg-surface-2/50 px-3.5 py-3">
            <legend className="px-1 text-xs font-medium text-muted">Optionen</legend>
            {mode !== 'import' && (
              <Checkbox
                checked={planNow && hasDescription}
                disabled={!hasDescription}
                onChange={setPlanNow}
                label="Gleich einen Plan erstellen lassen"
                description={hasDescription ? 'Der Planer zerlegt die Beschreibung in erste Aufgaben.' : 'Dafür wird eine Beschreibung benötigt.'}
              />
            )}
            {(mode === 'description' || mode === 'wizard' || mode === 'template') && (
              <Checkbox checked={initGit} onChange={setInitGit} label="Git einrichten" description="Damit lassen sich alle Änderungen nachvollziehen und zurücksetzen (empfohlen)." />
            )}
            {(mode === 'open' || mode === 'import') && (
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Die autonome Arbeit bleibt für dieses Projekt zunächst ausgeschaltet und kann in der Projektübersicht eingeschaltet werden.
              </p>
            )}
          </fieldset>
        )}

        {busy && (
          <div role="status" className="space-y-2 rounded-lg border border-border bg-surface-2 px-3.5 py-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-medium text-text">{operation?.title ?? (mode === 'import' ? 'Repository wird heruntergeladen …' : 'Projekt wird angelegt …')}</span>
              {operation?.cancellable && (
                <Button size="sm" variant="ghost" loading={cancelOp.loading} onClick={() => void cancelOp.run({ id: operation.id })}>
                  Abbrechen
                </Button>
              )}
            </div>
            <ProgressBar value={operation?.progress ?? null} label="Fortschritt" showValue={operation?.progress != null} />
            {operation?.message && <p className="text-xs text-muted">{operation.message}</p>}
          </div>
        )}

        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger-fg">
            <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {formError}
          </p>
        )}
      </form>
    </Dialog>
  );
}

function ModeIntro({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-[13px] text-muted">
      <Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-violet-fg" />
      <span>{children}</span>
    </p>
  );
}

function TrustNote() {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-fg">
      <TriangleAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {TRUST_PROJECT_TEXT}
    </p>
  );
}

interface FolderFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPick: (title: string, defaultPath?: string) => Promise<string | null>;
  error?: string;
  required?: boolean;
  /** Default target shown when empty. */
  defaultHint?: string | null;
  pickTitle?: string;
}

function FolderField({ label, value, onChange, onPick, error, required, defaultHint, pickTitle = 'Speicherort auswählen' }: FolderFieldProps) {
  const [picking, setPicking] = useState(false);
  const hint = value ? undefined : defaultHint ? `Leer lassen für: ${defaultHint}` : required ? undefined : 'Leer lassen für den Standard-Projektordner aus den Einstellungen.';
  return (
    <Input
      label={label}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error}
      hint={hint}
      placeholder={required ? 'Ordner auswählen …' : 'Standard-Projektordner'}
      spellCheck={false}
      className="pr-24! font-mono text-xs"
      suffix={
        <Button
          size="sm"
          variant="ghost"
          icon={FolderOpen}
          loading={picking}
          onClick={async () => {
            setPicking(true);
            try {
              const picked = await onPick(pickTitle, value || undefined);
              if (picked) onChange(picked);
            } finally {
              setPicking(false);
            }
          }}
        >
          Wählen
        </Button>
      }
    />
  );
}

function TemplatePicker({ templates, value, onChange, error }: { templates: readonly ProjectTemplateInfo[]; value: string; onChange: (id: string) => void; error?: string }) {
  return (
    <Field label="Vorlage" required error={error}>
      <div role="radiogroup" aria-label="Vorlagen" className="grid gap-2.5 md:grid-cols-2">
        {templates.map((t) => {
          const selected = t.id === value;
          const kind = metaOf(PROJECT_KIND, t.kind);
          const missing = t.missingTools.map((id) => INTEGRATION_NAME[id] ?? id);
          return (
            <label
              key={t.id}
              className={cn(
                'relative flex cursor-pointer flex-col gap-2 rounded-xl border p-3 transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-violet',
                selected ? 'border-violet/70 bg-violet/10' : 'border-border bg-surface-2 hover:border-border-strong',
              )}
            >
              <input type="radio" name="project-template" value={t.id} checked={selected} onChange={() => onChange(t.id)} className="sr-only" />
              <span className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3', selected ? 'text-violet-fg' : 'text-muted')}>
                    <kind.icon aria-hidden className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-semibold text-text">{t.name}</span>
                </span>
                {selected && (
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-nova-gradient text-white">
                    <Check aria-hidden className="h-3 w-3" />
                  </span>
                )}
              </span>
              <span className="text-xs text-muted">{t.description}</span>
              <span className="flex flex-wrap gap-1">
                <StatusBadge meta={kind} />
                <StatusBadge meta={metaOf(PREVIEW_KIND, t.previewKind)} />
                {t.technologies.map((tech) => (
                  <Badge key={tech}>{tech}</Badge>
                ))}
              </span>
              {missing.length > 0 && (
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning-fg">
                  <TriangleAlert aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  <span>Fehlt noch: {missing.join(', ')}</span>
                  <Link to={paths.integrations} className="font-medium">
                    Unter „Werkzeuge“ installieren
                  </Link>
                </span>
              )}
            </label>
          );
        })}
      </div>
    </Field>
  );
}

interface WizardStepsProps {
  state: WizardState;
  setState: (fn: (s: WizardState) => WizardState) => void;
  errors: Record<string, string>;
  onPick: (title: string, defaultPath?: string) => Promise<string | null>;
  defaultHint: string | null;
  summary: { kind: ProjectKind; platform: string };
}

function WizardSteps({ state, setState, errors, onPick, defaultHint, summary }: WizardStepsProps) {
  const set = <K extends keyof WizardState>(key: K, value: WizardState[K]) => setState((s) => ({ ...s, [key]: value }));
  const questionId = useMemo(() => `wizard-q-${state.step}`, [state.step]);
  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Schritte des Assistenten">
        {WIZARD_STEPS.map((label, i) => {
          const done = i < state.step;
          const current = i === state.step;
          return (
            <li key={label} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
              <span
                className={cn(
                  'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums',
                  current ? 'bg-nova-gradient text-white' : done ? 'bg-violet/20 text-violet-fg' : 'bg-surface-3 text-muted',
                )}
              >
                {done ? <Check aria-hidden className="h-3 w-3" /> : i + 1}
              </span>
              <span className={cn('text-xs', current ? 'font-medium text-text' : 'text-muted')}>{label}</span>
              {i < WIZARD_STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-border" />}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted">
        Schritt {state.step + 1} von {WIZARD_STEPS.length}
      </p>

      {state.step === 0 && (
        <ChoiceGroup id={questionId} question="Was für ein Projekt soll entstehen?" options={WIZARD_ART.map((a) => a.label)} value={state.art} onChange={(v) => set('art', v)} />
      )}
      {state.step === 1 && (
        <div className="space-y-3">
          <ChoiceGroup id={questionId} question="Wo soll es laufen?" options={[...WIZARD_PLATFORMS, '__other']} labels={{ __other: 'Etwas anderes …' }} value={state.platform} onChange={(v) => set('platform', v)} />
          {state.platform === '__other' && (
            <Input label="Zielplattform" value={state.platformOther} onChange={(e) => set('platformOther', e.target.value)} placeholder="z. B. Raspberry Pi" data-autofocus />
          )}
        </div>
      )}
      {state.step === 2 && (
        <Textarea
          label="Was soll das Projekt können?"
          required
          rows={6}
          value={state.features}
          onChange={(e) => set('features', e.target.value)}
          hint="Die wichtigsten Funktionen, gern als Liste. Details klärt NOVA später selbst."
          placeholder={'z. B.\n- Rezepte speichern und bearbeiten\n- Nach Zutaten suchen\n- Einkaufszettel erstellen'}
          data-autofocus
        />
      )}
      {state.step === 3 && (
        <div className="space-y-3">
          <Textarea
            label="Wünsche zu Aussehen, Stil oder Technik (optional)"
            rows={4}
            value={state.style}
            onChange={(e) => set('style', e.target.value)}
            placeholder="z. B. Pixelgrafik, dunkles Design, möglichst ohne Server."
            data-autofocus
          />
          <ChipsInput label="Gewünschte Technologien (optional)" value={state.technologies} onChange={(v) => set('technologies', v)} placeholder="z. B. TypeScript" hint="Leer lassen – dann wählt NOVA passende Technik." />
        </div>
      )}
      {state.step === 4 && (
        <div className="space-y-3">
          <Input label="Projektname" required maxLength={120} value={state.name} onChange={(e) => set('name', e.target.value)} error={errors.name} data-autofocus />
          <FolderField label="Speicherort (optional)" value={state.path} onChange={(v) => set('path', v)} onPick={onPick} error={errors.path} defaultHint={defaultHint} />
          <div className="rounded-lg border border-border bg-surface-2 px-3.5 py-3 text-xs">
            <p className="mb-1.5 font-medium text-text">Zusammenfassung</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted">
              <dt>Art</dt>
              <dd className="text-text">
                {state.art} <span className="text-muted">({PROJECT_KIND[summary.kind].label})</span>
              </dd>
              <dt>Zielplattform</dt>
              <dd className="text-text">{summary.platform}</dd>
              <dt>Funktionen</dt>
              <dd className="line-clamp-3 whitespace-pre-wrap text-text">{state.features}</dd>
              {state.style.trim() && (
                <>
                  <dt>Wünsche</dt>
                  <dd className="line-clamp-2 text-text">{state.style}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}

function ChoiceGroup({ id, question, options, labels = {}, value, onChange }: { id: string; question: string; options: string[]; labels?: Record<string, string>; value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend id={id} className="mb-2 text-[13px] font-medium text-text">
        {question}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o, i) => {
          const selected = value === o;
          return (
            <label
              key={o}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[13px] transition-colors duration-150 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-violet',
                selected ? 'border-violet/70 bg-violet/10 text-text' : 'border-border bg-surface-2 text-text hover:border-border-strong',
              )}
            >
              <input type="radio" name={id} value={o} checked={selected} onChange={() => onChange(o)} className="h-4 w-4 shrink-0 accent-violet" data-autofocus={i === 0 && !value ? true : undefined} />
              {labels[o] ?? o}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
