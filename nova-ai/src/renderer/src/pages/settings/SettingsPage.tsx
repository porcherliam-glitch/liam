// Einstellungen (UI-SPEC §4 UI-4, §7, MASTERPROMPT §4F): left sub-navigation (?section=…), one form per section that
// saves via settings.update with inline validation errors, unsaved-changes indicators, backups, export/import,
// autostart, update check and diagnostics. Model and budget settings live on the Modelle and Kosten pages.
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowRight, Coins, Cpu, ShieldAlert, Wrench, BookOpen } from 'lucide-react';
import type { Settings } from '@shared/settings';
import { Page } from '../../components/layout/Page';
import { ErrorState, KeyValue, LoadingState } from '../../components/ui';
import { useMutation, useRpc } from '../../hooks';
import { cn } from '../../lib/cn';
import { HONEST_LIMITS_TEXT } from '../../lib/texts';
import { paths } from '../../lib/paths';
import { useDaemonStore } from '../../stores/daemon';
import { toast } from '../../stores/toasts';
import { NETWORK_LIMITS_TEXT, SECTIONS, sectionById, type DraftValue, type FieldDef, type SectionDef } from './fields';
import { SettingsForm } from './SettingsForm';
import { BackupsPanel } from './panels/BackupsPanel';
import { DataTransferPanel } from './panels/DataTransferPanel';
import { AutostartControl, DiagnosticsPanel, RelatedLink, UpdatesPanel } from './panels/SystemPanels';
import { rpcIssues } from './shared/forms';
import { Notice } from './shared/ui';
import { useSettingsDraft } from './useSettingsDraft';

const RELATED = [
  { to: paths.models, label: 'Modelle und Anbieter', icon: Cpu },
  { to: paths.costs, label: 'Kosten und Budget', icon: Coins },
  { to: paths.integrations, label: 'Werkzeuge', icon: Wrench },
  { to: paths.knowledge, label: 'Wissensdatenbank', icon: BookOpen },
];

export default function SettingsPage() {
  const [params] = useSearchParams();
  const section = sectionById(params.get('section'));
  const settings = useRpc('settings.get', undefined, { refetchOn: ['settings.updated'] });
  const secureStore = useDaemonStore((s) => s.status?.secretStore.secure ?? null);
  const draft = useSettingsDraft(settings.data);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const update = useMutation('settings.update');

  const clearErrors = (paths: string[], sectionId?: string) => {
    setErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !paths.includes(k))));
    if (sectionId) setGeneralErrors((prev) => ({ ...prev, [sectionId]: '' }));
  };

  const onChange = (field: FieldDef, value: DraftValue) => {
    draft.set(field, value);
    if (errors[field.path]) clearErrors([field.path]);
  };

  const save = async (s: SectionDef) => {
    const { patch, errors: local, changed } = draft.buildPatch(s.fields);
    if (Object.keys(local).length > 0) {
      setErrors((prev) => ({ ...prev, ...local }));
      return;
    }
    if (changed === 0) {
      draft.discard(s.fields);
      return;
    }
    setSaving(s.id);
    try {
      const result = await update.runAsync(patch);
      settings.setData(result);
      draft.discard(s.fields);
      clearErrors(
        s.fields.map((f) => f.path),
        s.id,
      );
      toast.success(`${s.label}: gespeichert`);
    } catch (err) {
      const issues = rpcIssues(err);
      const fieldErrors: Record<string, string> = {};
      const unmatched: string[] = [];
      for (const [key, message] of Object.entries(issues)) {
        const field = s.fields.find((f) => key === f.path || key.startsWith(`${f.path}.`));
        if (field) fieldErrors[field.path] ??= message;
        else unmatched.push(message);
      }
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
      setGeneralErrors((prev) => ({ ...prev, [s.id]: unmatched.join(' ') }));
      if (Object.keys(issues).length === 0) toast.fromError(err, 'Einstellungen konnten nicht gespeichert werden');
    } finally {
      setSaving(null);
    }
  };

  const applySaved = (s: Settings) => settings.setData(s);

  return (
    <Page title="Einstellungen" description="Wie NOVA arbeitet, was es ohne Rückfrage darf und wie Daten gesichert werden. Jeder Bereich wird einzeln gespeichert.">
      {secureStore === false && (
        <Notice tone="warning" icon={ShieldAlert} title="API-Schlüssel werden nicht sicher gespeichert" alert className="mb-4">
          Auf diesem PC steht kein sicherer Schlüsselspeicher zur Verfügung. Schlüssel liegen nur einfach verschlüsselt im NOVA-Datenordner.
        </Notice>
      )}
      <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Einstellungsbereiche" className="md:sticky md:top-0 md:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
            {SECTIONS.map((s) => {
              const active = s.id === section.id;
              const dirty = settings.data ? draft.anyDirty(s.fields) : false;
              const Icon = s.icon;
              return (
                <li key={s.id} className="shrink-0">
                  <Link
                    to={`?section=${s.id}`}
                    replace
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] whitespace-nowrap no-underline transition-colors duration-150 hover:no-underline',
                      active ? 'bg-violet/14 font-medium text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    <Icon aria-hidden className={cn('h-4 w-4 shrink-0', active ? 'text-violet-fg' : '')} />
                    <span className="flex-1">{s.label}</span>
                    {dirty && (
                      <span className="inline-flex items-center" title="Nicht gespeichert">
                        <span aria-hidden className="h-2 w-2 rounded-full bg-warning" />
                        <span className="sr-only">(nicht gespeichert)</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 hidden border-t border-border pt-3 md:block">
            <p className="px-2.5 pb-1 text-[11px] font-medium tracking-wide text-subtle uppercase">Weitere Einstellungen</p>
            <ul className="space-y-0.5">
              {RELATED.map((r) => (
                <li key={r.to}>
                  <Link to={r.to} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-muted no-underline hover:bg-surface-2 hover:text-text hover:no-underline">
                    <r.icon aria-hidden className="h-4 w-4 shrink-0" />
                    <span className="flex-1">{r.label}</span>
                    <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <div className="min-w-0 space-y-4">
          {settings.loading ? (
            <LoadingState label="Einstellungen werden geladen …" />
          ) : !settings.data ? (
            <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
          ) : (
            <>
              <SettingsForm
                key={section.id}
                section={section}
                draft={draft}
                errors={errors}
                generalError={generalErrors[section.id] || null}
                saving={saving === section.id}
                onChange={onChange}
                onSave={() => void save(section)}
                onDiscard={() => {
                  draft.discard(section.fields);
                  clearErrors(
                    section.fields.map((f) => f.path),
                    section.id,
                  );
                }}
                onDefaults={() => {
                  draft.applyDefaults(section.fields);
                  clearErrors(
                    section.fields.map((f) => f.path),
                    section.id,
                  );
                }}
                before={<SectionIntro section={section} settings={settings.data} onSettingsSaved={applySaved} />}
                after={<SectionOutro section={section} />}
              />
              {section.id === 'backup' && (
                <>
                  <BackupsPanel />
                  <DataTransferPanel />
                </>
              )}
              {section.id === 'updates' && <UpdatesPanel />}
              {section.id === 'diagnostics' && <DiagnosticsPanel />}
            </>
          )}
        </div>
      </div>
    </Page>
  );
}

/** Section-specific content above the fields. */
function SectionIntro({ section, settings, onSettingsSaved }: { section: SectionDef; settings: Settings; onSettingsSaved: (s: Settings) => void }) {
  switch (section.id) {
    case 'general':
      return (
        <KeyValue
          columns={2}
          items={[
            { label: 'Sprache', value: 'Deutsch', hint: 'NOVA ist derzeit nur auf Deutsch verfügbar.' },
            { label: 'Darstellung', value: 'Dunkel', hint: 'Das dunkle Design ist fest eingestellt.' },
          ]}
        />
      );
    case 'permissions':
      return (
        <Notice tone="warning" title="Was Freigaben leisten – und was nicht">
          {HONEST_LIMITS_TEXT}
        </Notice>
      );
    case 'network':
      return (
        <Notice tone="warning" title="Grenzen der Netzwerkkontrolle">
          {NETWORK_LIMITS_TEXT}
        </Notice>
      );
    case 'background':
      return <AutostartControl savedValue={settings.background.autostart} onSettingsSaved={onSettingsSaved} />;
    default:
      return null;
  }
}

/** Section-specific links below the fields. */
function SectionOutro({ section }: { section: SectionDef }) {
  switch (section.id) {
    case 'permissions':
      return (
        <p className="text-xs text-muted">
          Dauerhaft erteilte Freigaben („Immer erlauben“) stehen unter <RelatedLink to={paths.approvals}>Freigaben</RelatedLink>
        </p>
      );
    case 'memory':
      return (
        <p className="text-xs text-muted">
          Die Einträge selbst stehen unter <RelatedLink to={paths.knowledge}>Wissen</RelatedLink> und im Gedächtnis des jeweiligen Projekts.
        </p>
      );
    case 'resources':
      return (
        <p className="text-xs text-muted">
          Die aktuelle Auslastung zeigt die <RelatedLink to={paths.dashboard}>Übersicht</RelatedLink>
        </p>
      );
    default:
      return null;
  }
}
