// "Ergebnis": the selected job – interactive 3D preview when done, live progress while it runs, the reason when it
// failed – plus the source/reference image and "Im Explorer zeigen" / "Im Studio öffnen".
import { Box, CodeXml, FolderSearch, ImageIcon, Square } from 'lucide-react';
import { Link } from 'react-router';
import type { ThreeDJob } from '@shared/schemas';
import { Button, Card, EmptyState, ProgressBar, Spinner, StatusBadge } from '../../components/ui';
import { LiveDuration } from '../../components/common';
import { useMutation, useRpc } from '../../hooks';
import { cn } from '../../lib/cn';
import { metaOf, phaseMeta, THREED_GENERATOR, THREED_JOB_STATUS, THREED_MODE, THREED_QUALITY } from '../../lib/labels';
import { paths } from '../../lib/paths';
import { revealInExplorer } from '../settings/shared/files';
import { Notice } from '../settings/shared/ui';
import { ModelViewer } from './viewer/ModelViewer';

export interface ResultCardProps {
  job: ThreeDJob | null;
  projectName: string | null;
  onUpdated: (job: ThreeDJob) => void;
}

export function ResultCard({ job, projectName, onUpdated }: ResultCardProps) {
  const cancel = useMutation('threed.cancel', { successToast: (j) => `„${j.name}“ wurde abgebrochen`, onSuccess: onUpdated });
  const done = job?.status === 'done';

  return (
    <Card
      title={job ? `Ergebnis: ${job.name}` : 'Ergebnis'}
      description={
        job
          ? `${THREED_MODE[job.mode].label} · ${metaOf(THREED_GENERATOR, job.model).label} · ${metaOf(THREED_QUALITY, job.quality).label} · ${projectName ?? 'NOVA-Bibliothek'}`
          : 'Hier lässt sich das fertige 3D-Modell von allen Seiten ansehen.'
      }
      icon={Box}
      actions={
        done && job ? (
          <>
            {job.outputPath && (
              <Button size="sm" icon={FolderSearch} onClick={() => void revealInExplorer(job.outputPath as string)}>
                Im Explorer zeigen
              </Button>
            )}
            {job.projectId && job.outputRel && (
              <Link
                to={paths.studio(job.projectId, { file: job.outputRel })}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 text-xs font-medium text-text no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-3 hover:no-underline"
              >
                <CodeXml aria-hidden className="h-3.5 w-3.5" />
                Im Studio öffnen
              </Link>
            )}
          </>
        ) : undefined
      }
    >
      {!job ? (
        <EmptyState icon={Box} title="Noch kein 3D-Modell" description="Starte links einen Auftrag. Sobald er fertig ist, erscheint das Modell hier – zum Drehen, Zoomen und Prüfen." />
      ) : done ? (
        <div className="space-y-3">
          <ModelViewer key={job.id} jobId={job.id} name={job.name} />
          <SourceDetails job={job} />
        </div>
      ) : job.status === 'queued' || job.status === 'running' ? (
        <div className="space-y-3">
          <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-surface-2/40 px-6 py-10 text-center">
            <StatusBadge size="md" meta={metaOf(THREED_JOB_STATUS, job.status)} />
            <PhaseLine job={job} />
            {job.status === 'running' && <ProgressBar className="w-full max-w-sm" value={job.progress} label={`Fortschritt von „${job.name}“`} showValue={job.progress != null} />}
            <p className="max-w-sm text-xs text-muted">
              {job.status === 'queued'
                ? 'Der Auftrag startet, sobald die Grafikkarte frei ist. ComfyUI bearbeitet immer einen Auftrag nach dem anderen.'
                : 'Das kann einige Minuten dauern. Die Seite darf geschlossen werden – NOVA arbeitet im Hintergrund weiter.'}
            </p>
            <Button size="sm" variant="ghost" icon={Square} loading={cancel.loading} onClick={() => void cancel.run({ id: job.id })}>
              Abbrechen
            </Button>
          </div>
          <SourceDetails job={job} />
        </div>
      ) : job.status === 'failed' ? (
        <div className="space-y-3">
          <Notice tone="danger" title="Das 3D-Modell konnte nicht erzeugt werden" alert>
            {job.error ?? 'Der Grund ist nicht bekannt.'}
          </Notice>
          <SourceDetails job={job} />
        </div>
      ) : (
        <div className="space-y-3">
          <Notice tone="info" title="Abgebrochen">
            Dieser Auftrag wurde gestoppt. Es wurde kein 3D-Modell gespeichert.
          </Notice>
          <SourceDetails job={job} />
        </div>
      )}
    </Card>
  );
}

function PhaseLine({ job }: { job: ThreeDJob }) {
  const phase = phaseMeta(job.phase ?? (job.status === 'queued' ? 'Wartet' : null));
  const Icon = phase.icon;
  return (
    <p className="flex items-center gap-1.5 text-[13px] font-medium text-text">
      <Icon aria-hidden className={cn('h-4 w-4 text-violet-fg', phase.spin && 'animate-spin')} />
      {phase.label}
      {job.status === 'running' && job.startedAt && (
        <span className="font-normal text-muted">
          · seit <LiveDuration from={job.startedAt} />
        </span>
      )}
    </p>
  );
}

/** Description or source image of the job and where the result is stored. */
function SourceDetails({ job }: { job: ThreeDJob }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {job.imagePath && <SourceImage job={job} />}
      <dl className="min-w-0 flex-1 space-y-1.5 text-xs">
        {job.prompt && (
          <div>
            <dt className="text-muted">Beschreibung</dt>
            <dd className="text-text">„{job.prompt}“</dd>
          </div>
        )}
        {job.status === 'done' && (job.outputRel ?? job.outputPath) && (
          <div>
            <dt className="text-muted">Gespeichert unter</dt>
            <dd className="font-mono break-all text-text">{job.outputRel ?? job.outputPath}</dd>
          </div>
        )}
        <div>
          <dt className="text-muted">Startwert (Seed)</dt>
          <dd className="text-text tabular-nums">{job.seed}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Source image (Bild zu 3D) or generated reference image (Text zu 3D), loaded on demand. */
function SourceImage({ job }: { job: ThreeDJob }) {
  const label = job.mode === 'text' ? 'Erzeugtes Referenzbild' : 'Ausgangsbild';
  const file = useRpc('threed.readFile', { id: job.id, kind: 'image' });
  return (
    <figure className="w-full shrink-0 sm:w-36">
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
        {file.data ? (
          <img src={`data:${file.data.mimeType};base64,${file.data.dataBase64}`} alt={`${label} von „${job.name}“`} className="max-h-full max-w-full object-contain" />
        ) : file.error ? (
          <span className="flex flex-col items-center gap-1 px-2 text-center text-[11px] text-neutral-500">
            <ImageIcon aria-hidden className="h-4 w-4" />
            Bild nicht verfügbar
          </span>
        ) : (
          <Spinner size="sm" label="Bild wird geladen" />
        )}
      </div>
      <figcaption className="mt-1 text-[11px] text-muted">{label}</figcaption>
    </figure>
  );
}
