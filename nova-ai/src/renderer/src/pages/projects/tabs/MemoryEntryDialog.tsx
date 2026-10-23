// Add or edit one memory entry of a project (memory.add / memory.update with only the changed fields).
import { useEffect, useState, type FormEvent } from 'react';
import { Brain, Pencil, ShieldAlert } from 'lucide-react';
import type { MemoryEntry, MemoryKind } from '@shared/schemas';
import { Button, Checkbox, Dialog, Input, Select, Textarea } from '../../../components/ui';
import { ChipsInput } from '../../../components/project';
import { useMutation } from '../../../hooks/useRpc';
import { validationIssues } from '../../../lib/api';
import { MEMORY_KIND } from '../../../lib/labels';
import { useAutoFocusTarget } from '../../../components/project/useAutoFocusTarget';

/** Kinds in display order. */
export const MEMORY_KIND_ORDER = Object.keys(MEMORY_KIND) as MemoryKind[];

export interface MemoryEntryDialogProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** Entry to edit; null = new entry. */
  entry: MemoryEntry | null;
  onSaved?: (entry: MemoryEntry) => void;
}

interface FormState {
  kind: MemoryKind;
  title: string;
  content: string;
  tags: string[];
  shareable: boolean;
}

const initial = (entry: MemoryEntry | null): FormState => ({
  kind: entry?.kind ?? 'note',
  title: entry?.title ?? '',
  content: entry?.content ?? '',
  tags: entry?.tags ?? [],
  shareable: entry?.shareable ?? false,
});

export function MemoryEntryDialog({ open, onClose, projectId, entry, onSaved }: MemoryEntryDialogProps) {
  const [form, setForm] = useState<FormState>(() => initial(entry));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useMutation('memory.add', { errorToast: false, successToast: 'Eintrag gespeichert' });
  const update = useMutation('memory.update', { errorToast: false, successToast: 'Eintrag gespeichert' });
  const saving = add.loading || update.loading;
  const focus = useAutoFocusTarget<HTMLFormElement>();

  useEffect(() => {
    if (!open) return;
    setForm(initial(entry));
    setErrors({});
  }, [open, entry]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.title.trim()) next.title = 'Bitte einen kurzen Titel eingeben.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      let saved: MemoryEntry;
      if (entry) {
        const patch: { id: string; kind?: MemoryKind; title?: string; content?: string; tags?: string[]; shareable?: boolean } = { id: entry.id };
        if (form.kind !== entry.kind) patch.kind = form.kind;
        if (form.title.trim() !== entry.title) patch.title = form.title.trim();
        if (form.content !== entry.content) patch.content = form.content;
        if (JSON.stringify(form.tags) !== JSON.stringify(entry.tags)) patch.tags = form.tags;
        if (form.shareable !== entry.shareable) patch.shareable = form.shareable;
        if (Object.keys(patch).length === 1) {
          onClose();
          return;
        }
        saved = await update.runAsync(patch);
      } else {
        saved = await add.runAsync({ projectId, kind: form.kind, title: form.title.trim(), content: form.content, tags: form.tags, shareable: form.shareable });
      }
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const issues = validationIssues(err);
      setErrors(Object.keys(issues).length ? issues : { form: err instanceof Error ? err.message : 'Speichern ist fehlgeschlagen.' });
    }
  };

  return (
    <Dialog
      initialFocus={focus.target}
      open={open}
      onClose={() => !saving && onClose()}
      dismissible={!saving}
      size="lg"
      icon={entry ? Pencil : Brain}
      title={entry ? 'Eintrag bearbeiten' : 'Eintrag hinzufügen'}
      description="Das Projektgedächtnis lesen die Agenten bei jeder Aufgabe mit – z. B. Ziele, Entscheidungen und Konventionen."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button variant="primary" type="submit" form="memory-entry-form" loading={saving}>
            Speichern
          </Button>
        </>
      }
    >
      <form id="memory-entry-form" ref={focus.container} onSubmit={(e) => void submit(e)} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <Select
            label="Art"
            value={form.kind}
            onChange={(e) => set('kind', e.target.value as MemoryKind)}
            options={MEMORY_KIND_ORDER.map((k) => ({ value: k, label: MEMORY_KIND[k].label }))}
            error={errors.kind}
          />
          <Input label="Titel" required maxLength={300} value={form.title} onChange={(e) => set('title', e.target.value)} error={errors.title} placeholder="z. B. Spiel läuft mit 60 Bildern pro Sekunde" data-autofocus />
        </div>
        <Textarea label="Inhalt" rows={6} maxLength={20000} value={form.content} onChange={(e) => set('content', e.target.value)} error={errors.content} placeholder="Was sollen die Agenten wissen?" />
        <ChipsInput label="Schlagwörter (optional)" value={form.tags} onChange={(v) => set('tags', v)} placeholder="z. B. physik" />
        <Checkbox
          checked={form.shareable}
          onChange={(v) => set('shareable', v)}
          label="Auch in anderen Projekten nutzen"
          description="Nur für allgemeine Erkenntnisse ohne projektbezogene Details. Solche Einträge können in die Wissensdatenbank anderer Projekte einfließen."
        />
        <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-fg">
          <ShieldAlert aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Keine Passwörter, Schlüssel oder andere Zugangsdaten eintragen – das Gedächtnis ist dafür nicht gedacht.
        </p>
        {errors.form && (
          <p role="alert" className="text-[13px] text-danger-fg">
            {errors.form}
          </p>
        )}
      </form>
    </Dialog>
  );
}
