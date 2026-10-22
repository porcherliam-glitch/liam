// Editable ProjectConfig (commands, automatic tests/review/commit, budget, allowed commands, conventions, preview,
// build artifacts). Saves only changed fields as a deep patch (projects.update { config }).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Settings2, Undo2 } from 'lucide-react';
import type { PreviewKind, ProjectConfig, ProjectConfigPatch, ProjectSummary } from '@shared/schemas';
import { Button, Card, Input, Select, Switch, Textarea } from '../../../components/ui';
import { ChipsInput } from '../../../components/project';
import { useMutation } from '../../../hooks/useRpc';
import { validationIssues } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { PREVIEW_KIND } from '../../../lib/labels';

type CommandKey = keyof ProjectConfig['commands'];

/** Command fields in display order with German labels and examples. */
export const COMMAND_FIELDS: Array<{ key: CommandKey; label: string; placeholder: string }> = [
  { key: 'install', label: 'Abhängigkeiten installieren', placeholder: 'z. B. npm install' },
  { key: 'dev', label: 'Entwicklungsserver', placeholder: 'z. B. npm run dev' },
  { key: 'build', label: 'Build', placeholder: 'z. B. npm run build' },
  { key: 'test', label: 'Tests', placeholder: 'z. B. npm test' },
  { key: 'lint', label: 'Code-Stil (Lint)', placeholder: 'z. B. npm run lint' },
  { key: 'typecheck', label: 'Typprüfung', placeholder: 'z. B. npx tsc --noEmit' },
  { key: 'e2e', label: 'Oberflächentests', placeholder: 'z. B. npx playwright test' },
  { key: 'security', label: 'Sicherheitsprüfung', placeholder: 'z. B. npm audit --omit=dev' },
  { key: 'package', label: 'Paket / Installer bauen', placeholder: 'z. B. npm run dist' },
  { key: 'run', label: 'Programm starten', placeholder: 'z. B. npm start' },
];

const PREVIEW_KINDS: PreviewKind[] = ['browser-dev-server', 'browser-static', 'desktop-run', 'engine-external', 'none'];

interface FormState {
  commands: Record<CommandKey, string>;
  testAfterChange: boolean;
  reviewChanges: boolean;
  autoCommit: boolean;
  budget: string;
  allowedCommands: string[];
  conventions: string;
  previewKind: PreviewKind;
  previewUrl: string;
  previewEntry: string;
  artifactGlobs: string[];
  engineVersion: string;
}

function fromConfig(c: ProjectConfig): FormState {
  return {
    commands: Object.fromEntries(COMMAND_FIELDS.map((f) => [f.key, c.commands[f.key] ?? ''])) as Record<CommandKey, string>,
    testAfterChange: c.testAfterChange,
    reviewChanges: c.reviewChanges,
    autoCommit: c.autoCommit,
    budget: c.monthlyBudgetUsd == null ? '' : String(c.monthlyBudgetUsd),
    allowedCommands: [...c.allowedCommands],
    conventions: c.conventions,
    previewKind: c.preview.kind,
    previewUrl: c.preview.url ?? '',
    previewEntry: c.preview.entry ?? '',
    artifactGlobs: [...(c.artifactGlobs ?? [])],
    engineVersion: c.engineVersion ?? '',
  };
}

const orNull = (v: string) => (v.trim() ? v.trim() : null);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Builds the minimal config patch; returns errors for invalid input. */
export function buildConfigPatch(c: ProjectConfig, f: FormState): { patch: ProjectConfigPatch; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const patch: ProjectConfigPatch = {};
  const commands: Partial<Record<CommandKey, string | null>> = {};
  for (const { key } of COMMAND_FIELDS) {
    const next = orNull(f.commands[key]);
    if (next !== (c.commands[key] ?? null)) commands[key] = next;
  }
  if (Object.keys(commands).length) patch.commands = commands;
  if (f.testAfterChange !== c.testAfterChange) patch.testAfterChange = f.testAfterChange;
  if (f.reviewChanges !== c.reviewChanges) patch.reviewChanges = f.reviewChanges;
  if (f.autoCommit !== c.autoCommit) patch.autoCommit = f.autoCommit;
  let budget: number | null = null;
  if (f.budget.trim()) {
    budget = Number(f.budget.replace(',', '.'));
    if (!Number.isFinite(budget) || budget < 0) errors.budget = 'Bitte einen Betrag ab 0 eingeben oder das Feld leer lassen.';
  }
  if (!errors.budget && budget !== (c.monthlyBudgetUsd ?? null)) patch.monthlyBudgetUsd = budget;
  if (!same(f.allowedCommands, c.allowedCommands)) patch.allowedCommands = f.allowedCommands;
  if (f.conventions !== c.conventions) patch.conventions = f.conventions;
  const preview: NonNullable<ProjectConfigPatch['preview']> = {};
  if (f.previewKind !== c.preview.kind) preview.kind = f.previewKind;
  if (orNull(f.previewUrl) !== (c.preview.url ?? null)) {
    const url = orNull(f.previewUrl);
    if (url && !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/i.test(url)) errors.previewUrl = 'Nur lokale Adressen sind möglich (z. B. http://127.0.0.1:5173/).';
    else preview.url = url;
  }
  if (orNull(f.previewEntry) !== (c.preview.entry ?? null)) preview.entry = orNull(f.previewEntry);
  if (Object.keys(preview).length) patch.preview = preview;
  if (!same(f.artifactGlobs, c.artifactGlobs ?? [])) patch.artifactGlobs = f.artifactGlobs;
  if (orNull(f.engineVersion) !== (c.engineVersion ?? null)) patch.engineVersion = orNull(f.engineVersion);
  return { patch, errors };
}

export function ProjectConfigForm({ project }: { project: ProjectSummary }) {
  const [form, setForm] = useState<FormState>(() => fromConfig(project.config));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [advanced, setAdvanced] = useState(false);
  const update = useMutation('projects.update', { errorToast: false, successToast: 'Einstellungen gespeichert' });

  const baseline = useMemo(() => fromConfig(project.config), [project.config]);
  const dirty = !same(form, baseline);

  // Follow outside changes (detection, other windows) unless the user is editing.
  const lastConfig = useRef(project.config);
  useEffect(() => {
    const prev = lastConfig.current;
    if (same(prev, project.config)) return;
    lastConfig.current = project.config;
    setForm((f) => (same(f, fromConfig(prev)) ? fromConfig(project.config) : f));
  }, [project.config]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setCommand = (key: CommandKey, value: string) => setForm((f) => ({ ...f, commands: { ...f.commands, [key]: value } }));

  const save = async () => {
    const { patch, errors: e } = buildConfigPatch(project.config, form);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (!Object.keys(patch).length) return;
    try {
      const saved = await update.runAsync({ id: project.id, config: patch });
      lastConfig.current = saved.config;
      setForm(fromConfig(saved.config));
    } catch (err) {
      const issues = validationIssues(err);
      const mapped: Record<string, string> = {};
      for (const [k, v] of Object.entries(issues)) mapped[k.replace(/^config\./, '').replace(/^commands\./, 'commands.')] = v;
      setErrors(Object.keys(mapped).length ? mapped : { form: err instanceof Error ? err.message : 'Speichern ist fehlgeschlagen.' });
    }
  };

  return (
    <Card title="Befehle und Arbeitsweise" icon={Settings2} description="So baut, testet und prüft NOVA dieses Projekt. Leere Felder bedeuten: nicht eingerichtet.">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <legend className="sr-only">Befehle</legend>
          {COMMAND_FIELDS.map((f) => (
            <Input
              key={f.key}
              label={f.label}
              value={form.commands[f.key]}
              onChange={(e) => setCommand(f.key, e.target.value)}
              placeholder={f.placeholder}
              error={errors[`commands.${f.key}`]}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
            />
          ))}
        </fieldset>

        <fieldset className="space-y-3 border-t border-border pt-4">
          <legend className="sr-only">Arbeitsweise</legend>
          <Switch
            checked={form.testAfterChange}
            onChange={(v) => set('testAfterChange', v)}
            label="Nach jeder Code-Änderung testen"
            description={form.commands.test.trim() ? 'Nach jeder Programmier-Aufgabe laufen die Tests automatisch.' : 'Dafür wird ein Testbefehl benötigt.'}
          />
          <Switch checked={form.reviewChanges} onChange={(v) => set('reviewChanges', v)} label="Änderungen prüfen lassen" description="Der Prüfer-Agent sieht sich jede Code-Änderung an und meldet Probleme." />
          <Switch
            checked={form.autoCommit}
            onChange={(v) => set('autoCommit', v)}
            disabled={!project.gitAvailable && !form.autoCommit}
            label="Erfolgreiche Änderungen automatisch committen"
            description={project.gitAvailable ? 'Nur Dateien, die NOVA geändert hat, kommen in den Commit.' : 'Dafür muss Git für das Projekt eingerichtet sein (Reiter „Änderungen“).'}
          />
        </fieldset>

        <div className="grid gap-x-4 gap-y-3 border-t border-border pt-4 md:grid-cols-2">
          <Input
            label="Monatliches Cloud-Budget für dieses Projekt"
            type="text"
            inputMode="decimal"
            value={form.budget}
            onChange={(e) => set('budget', e.target.value)}
            error={errors.budget ?? errors.monthlyBudgetUsd}
            placeholder="Kein eigenes Limit"
            hint="In US-Dollar. Leer lassen: es gilt nur das allgemeine Budget. Lokale Modelle kosten nichts."
            suffix={<span className="pr-2">$ / Monat</span>}
            className="pr-24!"
          />
          <ChipsInput
            label="Erlaubte Befehle"
            mono
            splitOnComma={false}
            value={form.allowedCommands}
            onChange={(v) => set('allowedCommands', v)}
            placeholder="z. B. npx playwright test"
            hint="Befehle (Anfang der Zeile), die Agenten hier ohne Rückfrage ausführen dürfen."
          />
          <Textarea
            label="Konventionen und Hinweise für die Agenten"
            rows={4}
            value={form.conventions}
            onChange={(e) => set('conventions', e.target.value)}
            containerClassName="md:col-span-2"
            placeholder="z. B. TypeScript strikt, Texte im Spiel auf Deutsch, Tests in tests/."
          />
        </div>

        <div className="border-t border-border pt-3">
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)} className="inline-flex items-center gap-1 rounded text-xs font-medium text-muted hover:text-text">
            <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform duration-150', advanced && 'rotate-90')} />
            Erweitert: Vorschau, Build-Ergebnisse, Engine
          </button>
          {advanced && (
            <div className="mt-3 grid gap-x-4 gap-y-3 md:grid-cols-2">
              <Select
                label="Art der Vorschau"
                value={form.previewKind}
                onChange={(e) => set('previewKind', e.target.value as PreviewKind)}
                options={PREVIEW_KINDS.map((k) => ({ value: k, label: PREVIEW_KIND[k].label }))}
              />
              {form.previewKind === 'browser-dev-server' && (
                <Input
                  label="Feste Adresse (optional)"
                  value={form.previewUrl}
                  onChange={(e) => set('previewUrl', e.target.value)}
                  error={errors.previewUrl ?? errors['preview.url']}
                  placeholder="wird aus der Ausgabe erkannt"
                  hint="Nur lokale Adressen, z. B. http://127.0.0.1:5173/"
                  className="font-mono text-xs"
                />
              )}
              {form.previewKind === 'browser-static' && (
                <Input label="Startdatei" value={form.previewEntry} onChange={(e) => set('previewEntry', e.target.value)} placeholder="index.html" className="font-mono text-xs" />
              )}
              <ChipsInput
                label="Build-Ergebnisse"
                mono
                value={form.artifactGlobs}
                onChange={(v) => set('artifactGlobs', v)}
                placeholder="z. B. dist/**"
                hint="Dateimuster, die nach Build und Paketbau als Ergebnis angezeigt werden."
              />
              <Input
                label="Benötigte Engine-Version"
                value={form.engineVersion}
                onChange={(e) => set('engineVersion', e.target.value)}
                placeholder="nur für Unity, Godot oder Unreal"
                className="font-mono text-xs"
              />
            </div>
          )}
        </div>

        {errors.form && (
          <p role="alert" className="text-[13px] text-danger-fg">
            {errors.form}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {dirty && (
            <span role="status" className="mr-auto inline-flex items-center gap-1.5 text-xs text-warning-fg">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-warning" />
              Ungespeicherte Änderungen
            </span>
          )}
          <Button
            icon={Undo2}
            disabled={!dirty || update.loading}
            onClick={() => {
              setForm(fromConfig(project.config));
              setErrors({});
            }}
          >
            Verwerfen
          </Button>
          <Button variant="primary" type="submit" disabled={!dirty} loading={update.loading}>
            Speichern
          </Button>
        </div>
      </form>
    </Card>
  );
}
