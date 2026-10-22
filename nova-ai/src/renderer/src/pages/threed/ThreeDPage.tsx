// 3D-Werkstatt (SPEC-3D §1): local text → 3D and image → 3D through ComfyUI. ComfyUI status, the create form, the
// result view with an interactive 3D preview, the job list and the 3D settings.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Box, RotateCw } from 'lucide-react';
import type { ThreeDJob } from '@shared/schemas';
import { Page } from '../../components/layout/Page';
import { Button } from '../../components/ui';
import { useNovaEvent, useProjectNames, useProjects, useRpc } from '../../hooks';
import { toast } from '../../stores/toasts';
import { paths } from '../../lib/paths';
import { Notice } from '../settings/shared/ui';
import { CreateCard } from './CreateCard';
import { EngineCard } from './EngineCard';
import { JobsCard } from './JobsCard';
import { ResultCard } from './ResultCard';
import { ThreeDSettingsCard } from './ThreeDSettingsCard';
import { defaultJobSelection, upsertJob } from './threedUtils';
import { restartDaemon, useEngineStatus, useThreeDJobs, useThreeDModels, useThreeDSupported } from './useThreeD';

const ENGINE_CARD_ID = 'threed-engine';
const RESULT_CARD_ID = 'threed-result';
const DESCRIPTION = 'Aus einer Beschreibung oder einem Bild entsteht ein 3D-Modell – lokal auf diesem PC mit ComfyUI, kostenlos und ohne Cloud.';

export default function ThreeDPage() {
  const supported = useThreeDSupported();
  if (!supported) {
    return (
      <Page title="3D-Werkstatt" description={DESCRIPTION}>
        <Notice
          tone="warning"
          title="Die 3D-Werkstatt ist im laufenden Hintergrunddienst noch nicht verfügbar"
          actions={
            <Button size="sm" icon={RotateCw} onClick={() => void restartDaemon()}>
              Dienst neu starten
            </Button>
          }
        >
          Der Hintergrunddienst läuft noch in einer älteren Version, die keine 3D-Modelle erzeugen kann. Nach einem Neustart des Dienstes steht die 3D-Werkstatt zur Verfügung. Laufende Aufgaben
          werden dabei an einem sicheren Punkt angehalten.
        </Notice>
      </Page>
    );
  }
  return <Workshop />;
}

function Workshop() {
  const engine = useEngineStatus();
  const models = useThreeDModels();
  const jobs = useThreeDJobs();
  const settings = useRpc('settings.get', undefined, { refetchOn: ['settings.updated'] });
  const projects = useProjects();
  const projectNames = useProjectNames();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = jobs.data ?? [];
  const effectiveId = selectedId && list.some((j) => j.id === selectedId) ? selectedId : defaultJobSelection(list);
  const selected = list.find((j) => j.id === effectiveId) ?? null;

  const { setData: setJobs } = jobs;
  const update = useCallback((job: ThreeDJob) => setJobs((prev) => upsertJob(prev, job)), [setJobs]);
  const remove = useCallback((id: string) => setJobs((prev) => prev?.filter((j) => j.id !== id)), [setJobs]);

  /** "Ansehen" in the job list: show the job and bring the result card into view (it is above the list). */
  const selectJob = useCallback((id: string) => {
    setSelectedId(id);
    requestAnimationFrame(() => document.getElementById(RESULT_CARD_ID)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }));
  }, []);

  // Announce finished/failed jobs once (the list itself is not a live region – progress would be read out constantly).
  const known = useRef(new Map<string, ThreeDJob['status']>());
  useEffect(() => {
    for (const j of list) if (!known.current.has(j.id)) known.current.set(j.id, j.status);
  }, [list]);
  useNovaEvent('threed.job', (job) => {
    const before = known.current.get(job.id);
    known.current.set(job.id, job.status);
    if (before === job.status) return;
    if (job.status === 'done') toast.show({ tone: 'success', title: `3D-Modell „${job.name}“ ist fertig`, action: { label: 'Ansehen', onClick: () => selectJob(job.id) } });
    else if (job.status === 'failed') toast.error(`„${job.name}“ ist fehlgeschlagen`, job.error ?? undefined);
  });

  const showEngine = () => {
    const card = document.getElementById(ENGINE_CARD_ID);
    card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    card?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  };

  return (
    <Page
      title="3D-Werkstatt"
      description={DESCRIPTION}
      actions={
        <Link
          to={paths.models3d}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 text-[13px] font-medium text-text no-underline transition-colors duration-150 hover:border-border-strong hover:bg-surface-3 hover:no-underline"
        >
          <Box aria-hidden className="h-4 w-4" />
          3D-Modelle verwalten
        </Link>
      }
    >
      <div className="space-y-4">
        <EngineCard id={ENGINE_CARD_ID} engine={engine} />
        <div className="grid items-start gap-4 xl:grid-cols-2">
          <CreateCard
            status={engine.data}
            models={models.data}
            settings={settings.data?.threeD}
            projects={projects.data ?? []}
            onCreated={(job) => {
              update(job);
              setSelectedId(job.id);
            }}
            onShowEngine={showEngine}
          />
          <ResultCard id={RESULT_CARD_ID} job={selected} projectName={selected?.projectId ? (projectNames.get(selected.projectId) ?? 'Unbekanntes Projekt') : null} onUpdated={update} />
        </div>
        <JobsCard jobs={jobs} projectNames={projectNames} selectedId={effectiveId} onSelect={selectJob} onUpdated={update} onRemoved={remove} />
        <ThreeDSettingsCard settings={settings} />
      </div>
    </Page>
  );
}
