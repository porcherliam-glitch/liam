// Generic form for one settings section: renders the declared fields, inline errors and the save bar
// (Standardwerte / Verwerfen / Speichern) with the unsaved-changes indicator.
import type { ReactNode } from 'react';
import { CircleCheck, FolderOpen, RotateCcw, Save, Undo2 } from 'lucide-react';
import { Button, Card, Input, Select, Switch } from '../../components/ui';
import { cn } from '../../lib/cn';
import { chooseDirectory, dialogUnavailable } from './shared/files';
import { ListEditor } from './shared/ListEditor';
import { Notice, NumberInput, UnsavedBadge } from './shared/ui';
import type { DraftValue, FieldDef, FolderField, SectionDef } from './fields';
import type { SettingsDraft } from './useSettingsDraft';

export interface SettingsFormProps {
  section: SectionDef;
  draft: SettingsDraft;
  errors: Record<string, string>;
  generalError: string | null;
  saving: boolean;
  onChange: (field: FieldDef, value: DraftValue) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDefaults: () => void;
  /** Content above the fields (notices, immediate controls). */
  before?: ReactNode;
  /** Content below the fields, inside the card. */
  after?: ReactNode;
}

type Block = { type: 'grid'; fields: FieldDef[] } | { type: 'single'; field: FieldDef };

/** Consecutive number/select fields share a two-column grid; everything else is full width. */
function toBlocks(fields: readonly FieldDef[]): Block[] {
  const blocks: Block[] = [];
  for (const f of fields) {
    const gridable = f.kind === 'number' || f.kind === 'select';
    const last = blocks[blocks.length - 1];
    if (gridable && last?.type === 'grid') last.fields.push(f);
    else if (gridable) blocks.push({ type: 'grid', fields: [f] });
    else blocks.push({ type: 'single', field: f });
  }
  return blocks;
}

export function SettingsForm({ section, draft, errors, generalError, saving, onChange, onSave, onDiscard, onDefaults, before, after }: SettingsFormProps) {
  const dirty = draft.anyDirty(section.fields);
  const isDisabled = (f: FieldDef) => {
    if (!f.dependsOn) return false;
    const parent = section.fields.find((x) => x.path === f.dependsOn);
    return parent ? draft.value(parent) === false : false;
  };

  return (
    <Card
      title={section.label}
      description={section.description}
      icon={section.icon}
      actions={dirty && <UnsavedBadge />}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted">
            {dirty ? (
              'Es gibt ungespeicherte Änderungen in diesem Bereich.'
            ) : (
              <span className="inline-flex items-center gap-1">
                <CircleCheck aria-hidden className="h-3.5 w-3.5 text-success-fg" />
                Alles gespeichert
              </span>
            )}
          </span>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={RotateCcw} disabled={saving} onClick={onDefaults} title="Trägt die Standardwerte ein. Gespeichert wird erst mit „Speichern“.">
              Standardwerte
            </Button>
            <Button size="sm" variant="ghost" icon={Undo2} disabled={!dirty || saving} onClick={onDiscard}>
              Verwerfen
            </Button>
            <Button size="sm" variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={onSave}>
              Speichern
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-5"
        aria-label={section.label}
        onSubmit={(e) => {
          e.preventDefault();
          if (dirty) onSave();
        }}
      >
        {before}
        {generalError && (
          <Notice tone="danger" alert title="Nicht gespeichert">
            {generalError}
          </Notice>
        )}
        {toBlocks(section.fields).map((block, i) =>
          block.type === 'grid' ? (
            <div key={i} className="grid gap-4 sm:grid-cols-2">
              {block.fields.map((f) => (
                <FieldControl key={f.path} field={f} value={draft.value(f)} error={errors[f.path]} disabled={isDisabled(f)} onChange={(v) => onChange(f, v)} />
              ))}
            </div>
          ) : (
            <FieldControl key={block.field.path} field={block.field} value={draft.value(block.field)} error={errors[block.field.path]} disabled={isDisabled(block.field)} onChange={(v) => onChange(block.field, v)} />
          ),
        )}
        {after}
      </form>
    </Card>
  );
}

interface FieldControlProps {
  field: FieldDef;
  value: DraftValue;
  error?: string;
  disabled: boolean;
  onChange: (value: DraftValue) => void;
}

function FieldControl({ field, value, error, disabled, onChange }: FieldControlProps) {
  switch (field.kind) {
    case 'switch':
      return (
        <div className={cn(field.dependsOn && 'pl-6')}>
          <Switch checked={value === true} onChange={onChange} label={field.label} description={field.help} disabled={disabled} />
          {error && (
            <p className="mt-1 text-xs text-danger-fg" role="alert">
              {error}
            </p>
          )}
        </div>
      );
    case 'number':
      return <NumberInput label={field.label} unit={field.unit} decimal={field.decimal} value={String(value)} onChange={onChange} error={error} hint={field.help} disabled={disabled} />;
    case 'select':
      return <Select label={field.label} value={String(value)} onChange={(e) => onChange(e.target.value)} options={field.options} error={error} hint={field.help} disabled={disabled} />;
    case 'text':
      return (
        <Input
          label={field.label}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          error={error}
          hint={field.help}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          className={field.mono ? 'font-mono text-xs' : undefined}
        />
      );
    case 'folder':
      return <FolderControl field={field} value={String(value)} error={error} disabled={disabled} onChange={onChange} />;
    case 'list':
      return (
        <ListEditor
          label={field.label}
          hint={field.help}
          itemLabel={field.itemLabel}
          value={value as string[]}
          onChange={onChange}
          placeholder={field.placeholder}
          mono={field.mono}
          validateItem={field.validateItem}
          warnItem={field.warnItem}
          error={error}
          disabled={disabled}
        />
      );
  }
}

function FolderControl({ field, value, error, disabled, onChange }: { field: FolderField; value: string; error?: string; disabled: boolean; onChange: (v: string) => void }) {
  const pick = async () => {
    const dir = await chooseDirectory({ title: field.label, defaultPath: value || undefined });
    if (dir === undefined) return dialogUnavailable();
    if (dir) onChange(dir);
  };
  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <Input
          label={field.label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          error={error}
          disabled={disabled}
          spellCheck={false}
          className="font-mono text-xs"
          containerClassName="min-w-0 flex-1"
        />
        <Button icon={FolderOpen} onClick={() => void pick()} disabled={disabled} className={error ? 'mb-5' : undefined}>
          Ordner wählen …
        </Button>
        {value && (
          <Button variant="ghost" onClick={() => onChange('')} disabled={disabled} className={error ? 'mb-5' : undefined}>
            Standard verwenden
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">{field.help}</p>
    </div>
  );
}
