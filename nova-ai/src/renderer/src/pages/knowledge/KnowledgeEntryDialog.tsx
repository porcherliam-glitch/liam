// Add/edit dialog for knowledge entries (global knowledge base, or any project entry when edited from the
// cross-project view). Warns when the text looks like a credential (MASTERPROMPT §10: no secrets in memory).
import { useEffect, useState } from 'react';
import { BookOpen, Check } from 'lucide-react';
import type { MemoryEntry, MemoryKind } from '@shared/schemas';
import { Button, Dialog, Input, Select, Switch, Textarea } from '../../components/ui';
import { ChipsInput } from '../../components/project/ChipsInput';
import { useMutation } from '../../hooks';
import { MEMORY_KIND } from '../../lib/labels';
import { toast } from '../../stores/toasts';
import { rpcIssues } from '../settings/shared/forms';
import { Notice } from '../settings/shared/ui';

/** Kinds in a sensible order for the global knowledge base (insights first). */
export const KNOWLEDGE_KIND_ORDER: MemoryKind[] = ['insight', 'convention', 'note', 'decision', 'requirement', 'goal', 'bug', 'attempt', 'test_result', 'question', 'next_step', 'task_status'];

export const SHAREABLE_EXPLANATION =
  'Teilbare Einträge darf NOVA den Agenten in allen Projekten als Hintergrundwissen mitgeben. Nur allgemeine technische Erkenntnisse teilen – niemals Zugangsdaten, Kundendaten oder Projektgeheimnisse.';

const SECRET_PATTERN = /(api[_ -]?key|passwor[dt]|secret|token|zugangsdaten)\s*[:=]|\b(sk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9]{12,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/i;

/** True when the text looks like it contains a credential. */
export function looksLikeSecret(text: string): boolean {
  return SECRET_PATTERN.test(text);
}

export interface KnowledgeEntryDialogProps {
  open: boolean;
  /** null = new entry in the global knowledge base. */
  entry: MemoryEntry | null;
  /** Project name of an edited project entry (shown in the description). */
  projectName?: string | null;
  onClose: () => void;
  onSaved: (entry: MemoryEntry) => void;
}

export function KnowledgeEntryDialog({ open, entry, projectName, onClose, onSaved }: KnowledgeEntryDialogProps) {
  const [kind, setKind] = useState<MemoryKind>('insight');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [shareable, setShareable] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setKind(entry?.kind ?? 'insight');
    setTitle(entry?.title ?? '');
    setContent(entry?.content ?? '');
    setTags(entry?.tags ?? []);
    setShareable(entry?.shareable ?? true);
    setErrors({});
  }, [open, entry]);

  const onError = (e: unknown) => {
    const issues = rpcIssues(e);
    setErrors(issues);
    if (Object.keys(issues).length === 0) toast.fromError(e, 'Eintrag konnte nicht gespeichert werden');
  };
  const done = (r: MemoryEntry) => {
    onSaved(r);
    onClose();
  };
  const add = useMutation('memory.add', { errorToast: false, successToast: 'Eintrag angelegt', onSuccess: done, onError });
  const update = useMutation('memory.update', { errorToast: false, successToast: 'Eintrag gespeichert', onSuccess: done, onError });
  const saving = add.loading || update.loading;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Bitte einen Titel eingeben.';
    else if (title.trim().length > 300) e.title = 'Der Titel darf höchstens 300 Zeichen lang sein.';
    if (content.length > 20000) e.content = 'Der Inhalt darf höchstens 20.000 Zeichen lang sein.';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    if (entry) void update.run({ id: entry.id, kind, title: title.trim(), content, tags, shareable });
    else void add.run({ projectId: null, kind, title: title.trim(), content, tags, shareable });
  };

  const secretWarning = looksLikeSecret(`${title}\n${content}`);

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      dismissible={!saving}
      size="lg"
      icon={BookOpen}
      title={entry ? 'Eintrag bearbeiten' : 'Eintrag anlegen'}
      description={entry?.projectId ? `Gehört zum Projekt „${projectName ?? 'Unbekannt'}“.` : 'Wird in der projektübergreifenden Wissensdatenbank gespeichert.'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button variant="primary" icon={Check} loading={saving} onClick={submit}>
            {entry ? 'Speichern' : 'Anlegen'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
          <Select label="Art" value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)} options={KNOWLEDGE_KIND_ORDER.map((k) => ({ value: k, label: MEMORY_KIND[k].label }))} />
          <Input label="Titel" required value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} maxLength={300} placeholder="z. B. Vitest: Fake-Timer vor dem Import aktivieren" />
        </div>
        <Textarea label="Inhalt" rows={7} value={content} onChange={(e) => setContent(e.target.value)} error={errors.content} hint="Kurz und allgemein halten – Agenten bekommen nur die passendsten Einträge mitgeliefert." />
        {secretWarning && (
          <Notice tone="warning" title="Das sieht nach einem Zugangsschlüssel aus">
            Zugangsdaten gehören nicht ins Gedächtnis. API-Schlüssel werden unter „Modelle“ sicher gespeichert.
          </Notice>
        )}
        <ChipsInput label="Schlagwörter" value={tags} onChange={setTags} placeholder="Schlagwort eingeben und Enter drücken" hint="Helfen beim Finden, z. B. „tests“ oder „unity“." />
        <Switch checked={shareable} onChange={setShareable} label="Teilbar" description={SHAREABLE_EXPLANATION} />
      </form>
    </Dialog>
  );
}
