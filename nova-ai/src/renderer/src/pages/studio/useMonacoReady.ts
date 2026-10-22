import { useEffect, useState } from 'react';
import { getMonaco, loadMonaco, type Monaco } from './monaco-setup';

export interface MonacoState {
  monaco: Monaco | null;
  error: string | null;
  retry: () => void;
}

/** Loads the local Monaco bundle once and reports when the editor can be rendered. */
export function useMonacoReady(): MonacoState {
  const [monaco, setMonaco] = useState<Monaco | null>(() => getMonaco());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (monaco) return;
    let cancelled = false;
    loadMonaco()
      .then((m) => {
        if (!cancelled) setMonaco(m);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Der Editor konnte nicht geladen werden.');
      });
    return () => {
      cancelled = true;
    };
  }, [monaco, attempt]);

  return {
    monaco,
    error,
    retry: () => {
      setError(null);
      setAttempt((n) => n + 1);
    },
  };
}
