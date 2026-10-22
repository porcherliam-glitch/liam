// Per-project switch for the autonomous work (projects.setWork) with the trust warning before work is enabled
// for the first time on an opened/imported project (UI-SPEC §7) and a confirmation before switching it off.
import { useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { Project } from '@shared/schemas';
import { useMutation } from '../../hooks/useRpc';
import { cn } from '../../lib/cn';
import { WORK_STATE } from '../../lib/labels';
import { TRUST_PROJECT_TEXT } from '../../lib/texts';
import { useDaemonStore } from '../../stores/daemon';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { StatusBadge } from '../ui/Badge';
import { Switch } from '../ui/Switch';

const TRUST_KEY = 'nova.trustedProjects';

function readTrusted(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(TRUST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Remembers that the user confirmed the trust warning for a project. */
export function markProjectTrusted(projectId: string): void {
  try {
    const list = readTrusted();
    if (!list.includes(projectId)) globalThis.localStorage?.setItem(TRUST_KEY, JSON.stringify([...list, projectId]));
  } catch {
    /* storage unavailable – the warning is shown again next time, which is safe */
  }
}

/**
 * Projects created with "Öffnen"/"Importieren" start with work stopped and without a template. Before work is enabled
 * the first time for such a project, the trust warning is shown (once per project).
 */
export function needsTrustConfirmation(project: Pick<Project, 'id' | 'templateId' | 'workState'>): boolean {
  return project.workState === 'stopped' && project.templateId === null && !readTrusted().includes(project.id);
}

export interface ProjectWorkToggleProps {
  project: Pick<Project, 'id' | 'name' | 'workState' | 'templateId'>;
  /** Show the state text next to the switch (default true). */
  showState?: boolean;
  /** Also offer "Pausieren" while the project works (project header). */
  showPause?: boolean;
  onChanged?: (project: Project) => void;
  className?: string;
}

export function ProjectWorkToggle({ project, showState = true, showPause = false, onChanged, className }: ProjectWorkToggleProps) {
  const [confirm, setConfirm] = useState<null | 'trust' | 'off'>(null);
  const globalState = useDaemonStore((s) => s.work?.state ?? null);
  const setWork = useMutation('projects.setWork', {
    successToast: (_p, params) => (params?.enabled ? `Autonome Arbeit für „${project.name}“ eingeschaltet` : `Autonome Arbeit für „${project.name}“ ausgeschaltet`),
    onSuccess: (p) => onChanged?.(p),
  });
  const resume = useMutation('work.resume', { successToast: 'Arbeit wird fortgesetzt' });
  const pause = useMutation('work.pause', { successToast: 'Arbeit wird pausiert' });
  const on = project.workState !== 'stopped';
  const meta = WORK_STATE[project.workState];

  const enable = async () => {
    const res = await setWork.run({ id: project.id, enabled: true });
    if (res) markProjectTrusted(project.id);
  };
  const onToggle = (next: boolean) => {
    if (next) {
      if (needsTrustConfirmation(project)) setConfirm('trust');
      else void enable();
    } else {
      setConfirm('off');
    }
  };

  const globalHint =
    on && globalState && globalState !== 'running'
      ? globalState === 'paused'
        ? 'Die gesamte Arbeit ist gerade pausiert (oben rechts).'
        : 'Die gesamte Arbeit ist gerade gestoppt (oben rechts).'
      : null;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      <span className="inline-flex items-center gap-2">
        <Switch checked={on} onChange={onToggle} disabled={setWork.loading} ariaLabel={`Autonome Arbeit für „${project.name}“`} size="sm" />
        <span aria-hidden className="text-xs font-medium text-text">
          Autonome Arbeit
        </span>
      </span>
      {showState && <StatusBadge meta={meta} />}
      {showPause && project.workState === 'running' && (
        <Button size="sm" variant="ghost" icon={Pause} loading={pause.loading} onClick={() => void pause.run({ projectId: project.id })}>
          Pausieren
        </Button>
      )}
      {project.workState === 'paused' && (
        <Button size="sm" variant="subtle" icon={Play} loading={resume.loading} onClick={() => void resume.run({ projectId: project.id })}>
          Fortsetzen
        </Button>
      )}
      {globalHint && <span className="basis-full text-[11px] text-warning-fg">{globalHint}</span>}

      <ConfirmDialog
        open={confirm === 'trust'}
        title="Autonome Arbeit einschalten?"
        message={
          <>
            <p>{TRUST_PROJECT_TEXT}</p>
            <p className="mt-2 text-muted">„{project.name}“ wurde aus einem vorhandenen Ordner oder Repository übernommen.</p>
          </>
        }
        confirmLabel="Projekt vertrauen und einschalten"
        loading={setWork.loading}
        onConfirm={async () => {
          await enable();
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'off'}
        tone="danger"
        title="Autonome Arbeit ausschalten?"
        message={
          <>
            <p>Für „{project.name}“ werden keine Aufgaben mehr automatisch gestartet. Laufende Aufgaben werden an einem sicheren Punkt beendet und wieder eingereiht.</p>
            <p className="mt-2 text-muted">Einzelne Aufgaben lassen sich weiterhin von Hand starten. Dateien bleiben so, wie sie sind.</p>
          </>
        }
        confirmLabel="Ausschalten"
        loading={setWork.loading}
        onConfirm={async () => {
          await setWork.run({ id: project.id, enabled: false });
          setConfirm(null);
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
