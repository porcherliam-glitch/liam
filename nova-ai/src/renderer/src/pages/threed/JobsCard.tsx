// Job list of the 3D-Werkstatt: status, phase, progress, cancel, delete (optionally with files), "Im Explorer zeigen",
// "Im Studio öffnen" (project files) and "Ansehen" (shows the job in the result view).
import { useState } from 'react';
import { CodeXml, Eye, FolderSearch, ListChecks, Square, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import type { ThreeDJob } from '@shared/schemas';
import { Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, IconButton, LoadingState, ProgressBar, StatusBadge } from '../../components/ui';
import { LiveDuration, RelativeTime } from '../../components/common';
import { useMutation, type UseRpcResult } from '../../hooks';
import { cn } from '../../lib/cn';
import { metaOf, phaseMeta, THREED_GENERATOR, THREED_JOB_STATUS, THREED_MODE, THREED_QUALITY } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { revealInExplorer } from '../settings/shared/files';
import { isActiveJob } from './threedUtils';

export interface JobsCardProps {
  jobs: UseRpcResult<'threed.jobs'>;
  projectNames: Map<string, string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdated: (job: ThreeDJob) => void;
  onRemoved: (id: string) => void;
}

export function JobsCard({ jobs, projectNames, selectedId, onSelect, onUpdated, onRemoved }: JobsCardProps) {
  const [toDelete, setToDelete] = useState<ThreeDJob | null>(null);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const cancel = useMutation('threed.cancel', { successToast: (j) => `„${j.name}“ wurde abgebrochen`, onSuccess: onUpdated });
  const del = useMutation('threed.deleteJob', {
    successToast: (_r, p) => (p?.deleteFiles ? 'Auftrag und Dateien gelöscht' : 'Auftrag aus der Liste entfernt'),
    onSuccess: (_r, p) => {
      if (p) onRemoved(p.id);
      setToDelete(null);
    },
  });
  const list = jobs.data ?? [];
  const active = list.filter(isActiveJob).length;

  let body;
  if (jobs.loading) body = <LoadingState compact label="Aufträge werden geladen …" />;
  else if (jobs.error && !jobs.data) body = <ErrorState compact error={jobs.error} onRetry={() => void jobs.refetch()} />;
  else if (list.length === 0)
    body = <EmptyState compact icon={ListChecks} title="Noch keine Aufträge" description="Erzeugte 3D-Modelle erscheinen hier – auch die, die Agenten für ein Projekt anlegen." />;
  else
    body = (
      <ul className="divide-y divide-border" aria-label="3D-Aufträge">
        {list.map((job) => (
          <JobRow
            key={job.id}
            job={job}
            projectName={job.projectId ? (projectNames.get(job.projectId) ?? 'Unbekanntes Projekt') : null}
            selected={job.id === selectedId}
            onSelect={() => onSelect(job.id)}
            onCancel={() => void cancel.run({ id: job.id })}
            cancelling={cancel.loading}
            onDelete={() => {
              setDeleteFiles(false);
              setToDelete(job);
            }}
          />
        ))}
      </ul>
    );

  const hasFiles = !!toDelete && !!(toDelete.outputPath || toDelete.imagePath);
  return (
    <Card
      title="Aufträge"
      description={active > 0 ? `${active === 1 ? 'Ein Auftrag läuft oder wartet' : `${active} Aufträge laufen oder warten`}. ComfyUI bearbeitet immer einen nach dem anderen.` : 'Alle 3D-Aufträge, neueste zuerst.'}
      icon={ListChecks}
      padding="none"
    >
      <div className="pb-1" aria-live="polite">
        {body}
      </div>
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Auftrag löschen?"
        confirmLabel={deleteFiles ? 'Auftrag und Dateien löschen' : 'Aus der Liste entfernen'}
        loading={del.loading}
        onCancel={() => setToDelete(null)}
        onConfirm={() => (toDelete ? del.run({ id: toDelete.id, deleteFiles }) : undefined)}
        message={<p>„{toDelete?.name}“ wird aus der Liste der Aufträge entfernt.</p>}
      >
        {hasFiles && toDelete && (
          <Checkbox
            checked={deleteFiles}
            onChange={setDeleteFiles}
            label="Erzeugte Dateien ebenfalls löschen"
            description={
              deleteFiles
                ? toDelete.outputRel
                  ? `${toDelete.outputRel} wird aus dem Projekt gelöscht${toDelete.mode === 'text' ? ' (mit dem Referenzbild)' : ''}.`
                  : 'Die Dateien des Auftrags in der 3D-Bibliothek werden gelöscht.'
                : 'Ohne Häkchen bleiben die Dateien erhalten.'
            }
          />
        )}
      </ConfirmDialog>
    </Card>
  );
}

interface JobRowProps {
  job: ThreeDJob;
  projectName: string | null;
  selected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  cancelling: boolean;
  onDelete: () => void;
}

function JobRow({ job, projectName, selected, onSelect, onCancel, cancelling, onDelete }: JobRowProps) {
  const navigate = useNavigate();
  const mode = THREED_MODE[job.mode];
  const running = job.status === 'running';
  const activeJob = isActiveJob(job);
  const phase = phaseMeta(job.phase);
  const PhaseIcon = phase.icon;
  return (
    <li className={cn('flex flex-wrap items-start gap-3 px-4 py-3 transition-colors duration-150', selected && 'bg-violet/8')} aria-current={selected || undefined}>
      <span className={cn('mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md', selected ? 'bg-violet/20 text-violet-fg' : 'bg-surface-2 text-muted')} title={mode.label}>
        <mode.icon aria-hidden className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-text" title={job.name}>
            {job.name}
          </span>
          <StatusBadge meta={metaOf(THREED_JOB_STATUS, job.status)} />
          {job.taskId && (
            <Badge tone="violet" title="Von einem Agenten erzeugt">
              Agent
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted">
          {mode.label} · {metaOf(THREED_GENERATOR, job.model).label} · {metaOf(THREED_QUALITY, job.quality).label} · {projectName ?? 'NOVA-Bibliothek'} · <RelativeTime ts={job.createdAt} />
        </p>
        {job.prompt && (
          <p className="truncate text-xs text-muted" title={job.prompt}>
            „{job.prompt}“
          </p>
        )}
        {activeJob && (
          <div className="max-w-md space-y-1 pt-0.5">
            <p className="flex items-center gap-1.5 text-xs text-text">
              <PhaseIcon aria-hidden className={cn('h-3.5 w-3.5', phase.spin && 'animate-spin')} />
              {phase.label}
              {running && job.startedAt && (
                <span className="text-muted">
                  · seit <LiveDuration from={job.startedAt} />
                </span>
              )}
            </p>
            {running && <ProgressBar value={job.progress} label={`Fortschritt von „${job.name}“`} showValue={job.progress != null} />}
          </div>
        )}
        {job.status === 'failed' && job.error && <p className="text-xs text-danger-fg">{job.error}</p>}
        {job.status === 'done' && (job.outputRel ?? job.outputPath) && (
          <p className="truncate font-mono text-[11px] text-subtle" title={job.outputPath ?? undefined}>
            {job.outputRel ?? job.outputPath}
            {job.startedAt && job.endedAt ? (
              <span className="font-sans">
                {' '}
                · Dauer <LiveDuration from={job.startedAt} to={job.endedAt} format="text" />
              </span>
            ) : null}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1">
        {job.status === 'done' && (
          <Button size="sm" variant={selected ? 'subtle' : 'secondary'} icon={Eye} onClick={onSelect} aria-label={`„${job.name}“ ansehen`} aria-pressed={selected}>
            Ansehen
          </Button>
        )}
        {job.status !== 'done' && !selected && (
          <Button size="sm" variant="ghost" icon={Eye} onClick={onSelect} aria-label={`Details zu „${job.name}“ anzeigen`}>
            Details
          </Button>
        )}
        {job.status === 'done' && job.outputPath && (
          <IconButton icon={FolderSearch} size="sm" label={`„${job.name}“ im Explorer zeigen`} onClick={() => void revealInExplorer(job.outputPath as string)} />
        )}
        {job.status === 'done' && job.projectId && job.outputRel && (
          <IconButton
            icon={CodeXml}
            size="sm"
            label={`„${job.name}“ im Studio öffnen`}
            onClick={() => navigate(paths.studio(job.projectId as string, { file: job.outputRel }))}
          />
        )}
        {activeJob ? (
          <Button size="sm" variant="ghost" icon={Square} loading={cancelling} onClick={onCancel} aria-label={`„${job.name}“ abbrechen`}>
            Abbrechen
          </Button>
        ) : (
          <IconButton icon={Trash2} size="sm" label={`„${job.name}“ löschen`} onClick={onDelete} />
        )}
      </div>
    </li>
  );
}
