// Data hooks of the 3D-Werkstatt, shared by the 3D page, the "3D-Modelle" card (Modelle) and the settings section.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreeDEngineStatus } from '@shared/schemas';
import { useNovaEvent, useRpc, useSupports, type UseRpcResult } from '../../hooks';
import { api, getBridge } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { chooseDirectory, dialogUnavailable } from '../settings/shared/files';
import { ENGINE_POLL_MS, upsertJob } from './threedUtils';

/** The connected daemon offers the 3D workshop (older daemons keep running after an app update). */
export function useThreeDSupported(): boolean {
  const status = useSupports('threed.status');
  const generate = useSupports('threed.generate');
  return status && generate;
}

export interface EngineStatusResult extends UseRpcResult<'threed.status'> {
  /** True while a manual "Erneut prüfen" runs. */
  checking: boolean;
  /** Asks the daemon to probe ComfyUI again (refresh: true). */
  recheck: () => Promise<void>;
}

/**
 * ComfyUI status: loaded once, updated by 'threed.status' events and re-checked every 10 s while ComfyUI is not
 * running (so the card turns green soon after the user started it).
 */
export function useEngineStatus(enabled = true): EngineStatusResult {
  const status = useRpc('threed.status', enabled ? {} : null);
  const { setData } = status;
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useNovaEvent('threed.status', (s) => setData(s), enabled);

  const probe = useCallback(async () => {
    const next = await api('threed.status', { refresh: true });
    if (mounted.current) setData(next);
  }, [setData]);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      await probe();
    } catch (e) {
      toast.fromError(e, 'ComfyUI konnte nicht geprüft werden');
    } finally {
      if (mounted.current) setChecking(false);
    }
  }, [probe]);

  const offline = status.data ? !status.data.running : false;
  useEffect(() => {
    if (!enabled || !offline) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      probe().catch(() => {
        /* the next poll tries again; the card keeps the last known state */
      });
    }, ENGINE_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, offline, probe]);

  return { ...status, checking, recheck };
}

/** The 3D model catalog with install state (refetched after downloads/deletes). */
export function useThreeDModels(enabled = true) {
  return useRpc('threed.models', enabled ? undefined : null, { refetchOn: ['threed.models.changed'] });
}

/** 3D jobs, newest first, live-updated from 'threed.job' events. */
export function useThreeDJobs(enabled = true) {
  const jobs = useRpc('threed.jobs', enabled ? { limit: 100 } : null);
  const { setData } = jobs;
  useNovaEvent('threed.job', (job) => setData((prev) => upsertJob(prev, job)), enabled);
  return jobs;
}

/**
 * "Modellordner wählen": folder dialog → threed.configure({ modelsDir }) (the daemon checks the folder).
 * Returns the new status or undefined (cancelled / failed – a toast explains failures).
 */
export function useChooseModelsDir(onStatus: (s: ThreeDEngineStatus) => void) {
  const [busy, setBusy] = useState(false);
  const choose = useCallback(
    async (current: string | null) => {
      const dir = await chooseDirectory({ title: 'Ordner „models“ von ComfyUI wählen', defaultPath: current ?? undefined });
      if (dir === undefined) return dialogUnavailable();
      if (!dir) return;
      setBusy(true);
      try {
        const next = await api('threed.configure', { modelsDir: dir });
        onStatus(next);
        toast.success('Modellordner gespeichert', next.modelsDir ?? dir);
      } catch (e) {
        toast.fromError(e, 'Dieser Ordner passt nicht');
      } finally {
        setBusy(false);
      }
    },
    [onStatus],
  );
  return { choose, busy };
}

/** Restarts the background service (an older daemon without the 3D workshop is still running). */
export async function restartDaemon(): Promise<void> {
  try {
    await getBridge()?.daemon.restart();
  } catch (e) {
    toast.fromError(e, 'Der Hintergrunddienst konnte nicht neu gestartet werden');
  }
}
