// Name, description, path, kind and technologies of a project (editable) plus "Erkennen" (projects.detect).
import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Info, Pencil, ScanSearch } from 'lucide-react';
import type { ProjectConfig, ProjectKind, ProjectSummary } from '@shared/schemas';
import type { RpcResult } from '@shared/rpc';
import { Badge, Button, Card, Dialog, ErrorState, IconButton, Input, KeyValue, LoadingState, Select, Textarea } from '../../../components/ui';
import { ProjectKindBadge, RelativeTime } from '../../../components/common';
import { ChipsInput } from '../../../components/project';
import { useMutation, useRpc } from '../../../hooks/useRpc';
import { getBridge, validationIssues } from '../../../lib/api';
import { formatDate } from '../../../lib/format';
import { metaOf, PREVIEW_KIND, PROJECT_KIND } from '../../../lib/labels';
import { toast } from '../../../stores/toasts';
import { COMMAND_FIELDS } from './ProjectConfigForm';

const KIND_ORDER: ProjectKind[] = ['web', 'backend', 'desktop', 'unity', 'godot', 'unreal', 'generic'];

export function ProjectInfoCard({ project }: { project: ProjectSummary }) {
  const [editing, setEditing] = useState(false);
  const [detectOpen, setDetectOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [kind, setKind] = useState<ProjectKind>(project.kind);
  const [technologies, setTechnologies] = useState<string[]>(project.technologies);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useMutation('projects.update', { errorToast: false, successToast: 'Projekt gespeichert' });

  useEffect(() => {
    if (editing) return;
    setName(project.name);
    setDescription(project.description);
    setKind(project.kind);
    setTechnologies(project.technologies);
  }, [project, editing]);

  const save = async () => {
    if (!name.trim()) {
      setErrors({ name: 'Bitte einen Namen eingeben.' });
      return;
    }
    const patch: { id: string; name?: string; description?: string; kind?: ProjectKind; technologies?: string[] } = { id: project.id };
    if (name.trim() !== project.name) patch.name = name.trim();
    if (description !== project.description) patch.description = description;
    if (kind !== project.kind) patch.kind = kind;
    if (JSON.stringify(technologies) !== JSON.stringify(project.technologies)) patch.technologies = technologies;
    if (Object.keys(patch).length === 1) {
      setEditing(false);
      return;
    }
    try {
      await update.runAsync(patch);
      setErrors({});
      setEditing(false);
    } catch (err) {
      const issues = validationIssues(err);
      setErrors(Object.keys(issues).length ? issues : { form: err instanceof Error ? err.message : 'Speichern ist fehlgeschlagen.' });
    }
  };

  const openFolder = async () => {
    const ok = await getBridge()?.app.openPath(project.path).catch(() => false);
    if (!ok) toast.error('Ordner konnte nicht geöffnet werden', 'Der Projektordner existiert nicht oder ist nicht erreichbar.');
  };

  return (
    <Card
      title="Projekt"
      icon={Info}
      actions={
        !editing && (
          <>
            <Button size="sm" variant="ghost" icon={ScanSearch} onClick={() => setDetectOpen(true)} title="Technik und Befehle aus den Projektdateien neu erkennen">
              Erkennen
            </Button>
            <Button size="sm" icon={Pencil} onClick={() => setEditing(true)}>
              Bearbeiten
            </Button>
          </>
        )
      }
    >
      {editing ? (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={120} data-autofocus />
          <Textarea label="Beschreibung" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} error={errors.description} />
          <div className="grid gap-3 md:grid-cols-2">
            <Select label="Projektart" value={kind} onChange={(e) => setKind(e.target.value as ProjectKind)} options={KIND_ORDER.map((k) => ({ value: k, label: PROJECT_KIND[k].label }))} error={errors.kind} />
            <ChipsInput label="Technologien" value={technologies} onChange={setTechnologies} placeholder="z. B. TypeScript" />
          </div>
          {errors.form && (
            <p role="alert" className="text-[13px] text-danger-fg">
              {errors.form}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              onClick={() => {
                setEditing(false);
                setErrors({});
              }}
              disabled={update.loading}
            >
              Abbrechen
            </Button>
            <Button variant="primary" type="submit" loading={update.loading}>
              Speichern
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          {project.description ? <p className="text-[13px] whitespace-pre-wrap text-text">{project.description}</p> : <p className="text-[13px] text-muted">Noch keine Beschreibung.</p>}
          <KeyValue
            columns={2}
            items={[
              {
                label: 'Pfad',
                value: (
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate font-mono text-xs" title={project.path}>
                      {project.path}
                    </span>
                    <IconButton icon={FolderOpen} label="Ordner öffnen" size="sm" onClick={() => void openFolder()} disabled={project.pathMissing} />
                  </span>
                ),
              },
              { label: 'Projektart', value: <ProjectKindBadge kind={project.kind} /> },
              {
                label: 'Technologien',
                value: project.technologies.length ? (
                  <span className="flex flex-wrap gap-1">
                    {project.technologies.map((t) => (
                      <Badge key={t}>{t}</Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-muted">Noch nicht erkannt</span>
                ),
              },
              { label: 'Vorschau', value: metaOf(PREVIEW_KIND, project.config.preview.kind).label },
              { label: 'Git', value: project.gitAvailable ? 'Eingerichtet' : <span className="text-warning-fg">Nicht eingerichtet</span> },
              !!project.config.engineVersion && { label: 'Engine-Version', value: project.config.engineVersion, mono: true },
              { label: 'Angelegt', value: formatDate(project.createdAt) },
              { label: 'Zuletzt geändert', value: <RelativeTime ts={project.updatedAt} /> },
            ]}
          />
        </div>
      )}
      <DetectDialog open={detectOpen} onClose={() => setDetectOpen(false)} project={project} />
    </Card>
  );
}

type Detected = RpcResult<'projects.detect'>;

interface DetectDiff {
  kind: boolean;
  technologies: boolean;
  commands: Array<{ key: keyof ProjectConfig['commands']; label: string; from: string | null; to: string | null }>;
  preview: boolean;
  engine: boolean;
}

function diffDetected(project: ProjectSummary, d: Detected): DetectDiff {
  return {
    kind: d.kind !== project.kind,
    technologies: JSON.stringify([...d.technologies].sort()) !== JSON.stringify([...project.technologies].sort()),
    commands: COMMAND_FIELDS.filter((f) => (d.config.commands[f.key] ?? null) !== (project.config.commands[f.key] ?? null)).map((f) => ({
      key: f.key,
      label: f.label,
      from: project.config.commands[f.key] ?? null,
      to: d.config.commands[f.key] ?? null,
    })),
    preview: d.config.preview.kind !== project.config.preview.kind,
    engine: (d.config.engineVersion ?? null) !== (project.config.engineVersion ?? null),
  };
}

/** Shows what projects.detect found and applies it on request (nothing changes without confirmation). */
function DetectDialog({ open, onClose, project }: { open: boolean; onClose: () => void; project: ProjectSummary }) {
  const detect = useRpc('projects.detect', open ? { id: project.id } : null);
  const apply = useMutation('projects.update', { successToast: 'Erkannte Einstellungen übernommen' });
  const d = detect.data;
  const diff = useMemo(() => (d ? diffDetected(project, d) : null), [d, project]);
  const changed = !!diff && (diff.kind || diff.technologies || diff.commands.length > 0 || diff.preview || diff.engine);

  const onApply = async () => {
    if (!d || !diff) return;
    const res = await apply.run({
      id: project.id,
      ...(diff.kind ? { kind: d.kind } : {}),
      ...(diff.technologies ? { technologies: d.technologies } : {}),
      config: {
        ...(diff.commands.length ? { commands: Object.fromEntries(diff.commands.map((c) => [c.key, c.to])) } : {}),
        ...(diff.preview ? { preview: d.config.preview } : {}),
        ...(diff.engine ? { engineVersion: d.config.engineVersion } : {}),
      },
    });
    if (res) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      icon={ScanSearch}
      title="Technik und Befehle erkennen"
      description="NOVA liest die Projektdateien (z. B. package.json, ProjectSettings) und schlägt passende Einstellungen vor."
      footer={
        <>
          <Button onClick={onClose}>{changed ? 'Abbrechen' : 'Schließen'}</Button>
          {changed && (
            <Button variant="primary" loading={apply.loading} onClick={() => void onApply()}>
              Übernehmen
            </Button>
          )}
        </>
      }
    >
      {detect.loading ? (
        <LoadingState compact label="Projektdateien werden untersucht …" />
      ) : detect.error && !d ? (
        <ErrorState compact error={detect.error} onRetry={() => void detect.refetch()} title="Das Erkennen hat nicht geklappt" />
      ) : d && diff ? (
        !changed ? (
          <p className="text-[13px] text-muted">Alles ist schon aktuell – die erkannten Werte stimmen mit den gespeicherten überein.</p>
        ) : (
          <div className="space-y-3 text-[13px]">
            <p className="text-muted">Folgende Unterschiede wurden gefunden:</p>
            <ul className="space-y-2">
              {diff.kind && (
                <li>
                  <span className="text-muted">Projektart: </span>
                  {PROJECT_KIND[project.kind].label} → <strong>{PROJECT_KIND[d.kind].label}</strong>
                </li>
              )}
              {diff.technologies && (
                <li>
                  <span className="text-muted">Technologien: </span>
                  {d.technologies.join(', ') || 'keine'}
                </li>
              )}
              {diff.preview && (
                <li>
                  <span className="text-muted">Vorschau: </span>
                  {metaOf(PREVIEW_KIND, project.config.preview.kind).label} → <strong>{metaOf(PREVIEW_KIND, d.config.preview.kind).label}</strong>
                </li>
              )}
              {diff.engine && (
                <li>
                  <span className="text-muted">Engine-Version: </span>
                  <span className="font-mono text-xs">{d.config.engineVersion ?? 'keine'}</span>
                </li>
              )}
            </ul>
            {diff.commands.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <caption className="sr-only">Erkannte Befehle</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th scope="col" className="px-3 py-1.5 font-medium">
                        Befehl
                      </th>
                      <th scope="col" className="px-3 py-1.5 font-medium">
                        Bisher
                      </th>
                      <th scope="col" className="px-3 py-1.5 font-medium">
                        Erkannt
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.commands.map((c) => (
                      <tr key={c.key} className="border-b border-border/60 last:border-b-0">
                        <td className="px-3 py-1.5 text-text">{c.label}</td>
                        <td className="px-3 py-1.5 font-mono text-muted">{c.from ?? '–'}</td>
                        <td className="px-3 py-1.5 font-mono text-text">{c.to ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      ) : null}
    </Dialog>
  );
}
