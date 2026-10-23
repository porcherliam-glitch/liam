// Interactive 3D preview of a finished job: loads the .glb via threed.readFile, renders it with three.js (lazy
// chunk ./scene), offers reset / wireframe / auto-rotate, full keyboard control and a text alternative. Without WebGL
// (or when the GPU drops the context) it degrades to a German explanation.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Box, CircleAlert, Grid3x3, RefreshCw, Rotate3d, RotateCcw, Unplug } from 'lucide-react';
import { Button, Spinner } from '../../../components/ui';
import { api, errorMessage } from '../../../lib/api';
import { cn } from '../../../lib/cn';
import { formatBytes, formatNumber, plural } from '../../../lib/format';
import { base64ToArrayBuffer } from '../threedUtils';
import type { ModelStats, ModelViewerController } from './scene';
import { isWebGLAvailable } from './webgl';

export interface ModelViewerProps {
  jobId: string;
  /** Model name for the accessible label ("holzkiste"). */
  name: string;
  className?: string;
}

type ViewerState =
  | { kind: 'unsupported' }
  | { kind: 'loading' }
  | { kind: 'preparing' }
  | { kind: 'ready'; stats: ModelStats; sizeBytes: number }
  | { kind: 'error'; message: string; details: string | null }
  | { kind: 'lost' };

const STEP = Math.PI / 12; // 15° per arrow key (Shift: 45°)

/** German text alternative of the model (also shown below the preview). */
export function describeModel(name: string, stats: ModelStats, sizeBytes: number): string {
  const dim = (v: number) => formatNumber(v, 2);
  return (
    `3D-Modell „${name}“: ${plural(stats.triangles, 'Dreieck', 'Dreiecke')}, ${plural(stats.materials, 'Material', 'Materialien')}, ${plural(stats.textures, 'Textur', 'Texturen')}. ` +
    `Maße laut Datei ${dim(stats.size.x)} × ${dim(stats.size.y)} × ${dim(stats.size.z)} m (Breite × Höhe × Tiefe), Dateigröße ${formatBytes(sizeBytes)}.`
  );
}

export function ModelViewer({ jobId, name, className }: ModelViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ModelViewerController | null>(null);
  const [webgl] = useState(() => isWebGLAvailable());
  const [state, setState] = useState<ViewerState>(() => (webgl ? { kind: 'loading' } : { kind: 'unsupported' }));
  const [attempt, setAttempt] = useState(0);
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const ids = useId();

  useEffect(() => {
    if (!webgl) return;
    let cancelled = false;
    let controller: ModelViewerController | null = null;
    setState({ kind: 'loading' });
    setWireframe(false);
    setAutoRotate(false);
    (async () => {
      try {
        const file = await api('threed.readFile', { id: jobId, kind: 'model' });
        if (cancelled) return;
        setState({ kind: 'preparing' });
        const data = base64ToArrayBuffer(file.dataBase64);
        const { createModelViewer } = await import('./scene');
        if (cancelled || !hostRef.current) return;
        const created = await createModelViewer(hostRef.current, data, {
          onContextLost: () => {
            if (!cancelled) setState({ kind: 'lost' });
          },
        });
        if (cancelled) {
          created.dispose();
          return;
        }
        controller = created;
        controllerRef.current = created;
        setState({ kind: 'ready', stats: created.stats, sizeBytes: file.sizeBytes });
      } catch (e) {
        if (cancelled) return;
        const details = e && typeof e === 'object' && 'details' in e && typeof (e as { details: unknown }).details === 'string' ? (e as { details: string }).details : null;
        setState({ kind: 'error', message: errorMessage(e), details });
      }
    })();
    return () => {
      cancelled = true;
      controller?.dispose();
      controllerRef.current = null;
    };
  }, [jobId, attempt, webgl]);

  const toggleWireframe = useCallback(() => {
    setWireframe((on) => {
      controllerRef.current?.setWireframe(!on);
      return !on;
    });
  }, []);
  const toggleAutoRotate = useCallback(() => {
    setAutoRotate((on) => {
      controllerRef.current?.setAutoRotate(!on);
      return !on;
    });
  }, []);
  const reset = useCallback(() => controllerRef.current?.resetView(), []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const c = controllerRef.current;
    if (!c || state.kind !== 'ready' || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = e.shiftKey ? STEP * 3 : STEP;
    switch (e.key) {
      case 'ArrowLeft':
        c.rotate(step, 0);
        break;
      case 'ArrowRight':
        c.rotate(-step, 0);
        break;
      case 'ArrowUp':
        c.rotate(0, -step * 0.6);
        break;
      case 'ArrowDown':
        c.rotate(0, step * 0.6);
        break;
      case '+':
      case '=':
        c.zoom(0.85);
        break;
      case '-':
      case '_':
        c.zoom(1.18);
        break;
      case '0':
      case 'Home':
        c.resetView();
        break;
      case 'w':
      case 'W':
        toggleWireframe();
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  if (state.kind === 'unsupported') {
    return (
      <div role="status" className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-surface-2/50 px-6 py-10 text-center', className)}>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-warning/12 text-warning-fg">
          <Box aria-hidden className="h-5 w-5" />
        </span>
        <p className="text-[13px] font-semibold text-text">3D-Vorschau nicht verfügbar</p>
        <p className="max-w-md text-xs text-muted">
          Die Vorschau braucht WebGL. Das ist in diesem Fenster gerade nicht verfügbar – zum Beispiel ohne passenden Grafiktreiber oder in einer Remote-Sitzung. Das 3D-Modell ist trotzdem
          gespeichert: „Im Explorer zeigen“ öffnet den Ordner.
        </p>
      </div>
    );
  }

  const ready = state.kind === 'ready';
  const statsId = `${ids}-stats`;
  const helpId = `${ids}-help`;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative overflow-hidden rounded-lg border border-border bg-[radial-gradient(ellipse_at_center,#1e2333_0%,#0f121b_75%)]">
        <div
          ref={hostRef}
          role="application"
          aria-roledescription="3D-Ansicht"
          aria-label={`3D-Vorschau von „${name}“`}
          aria-describedby={ready ? `${statsId} ${helpId}` : helpId}
          aria-busy={!ready || undefined}
          tabIndex={ready ? 0 : -1}
          onKeyDown={onKeyDown}
          className="h-[340px] w-full cursor-grab outline-none focus-visible:ring-2 focus-visible:ring-violet focus-visible:ring-inset active:cursor-grabbing xl:h-[380px]"
        />
        {(state.kind === 'loading' || state.kind === 'preparing') && (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-[13px] text-muted">
            <Spinner size="md" label={null} />
            {state.kind === 'loading' ? 'Modell wird geladen …' : 'Vorschau wird vorbereitet …'}
          </div>
        )}
        {state.kind === 'error' && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-danger/12 text-danger-fg">
              <CircleAlert aria-hidden className="h-5 w-5" />
            </span>
            <p className="text-[13px] font-semibold text-text">Die Vorschau konnte nicht angezeigt werden</p>
            <p className="max-w-md text-xs text-muted">{state.message}</p>
            {state.details && (
              <details className="max-w-md text-left text-[11px] text-subtle">
                <summary className="cursor-pointer">Technische Details</summary>
                <p className="mt-1 font-mono break-all">{state.details}</p>
              </details>
            )}
            <Button size="sm" icon={RefreshCw} onClick={() => setAttempt((a) => a + 1)}>
              Erneut versuchen
            </Button>
          </div>
        )}
        {state.kind === 'lost' && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-bg/80 px-6 text-center">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-warning/12 text-warning-fg">
              <Unplug aria-hidden className="h-5 w-5" />
            </span>
            <p className="text-[13px] font-semibold text-text">Die Grafikkarte hat die Vorschau beendet</p>
            <p className="max-w-md text-xs text-muted">Vermutlich ist der Grafikspeicher gerade voll – zum Beispiel, weil ComfyUI noch arbeitet.</p>
            <Button size="sm" icon={RefreshCw} onClick={() => setAttempt((a) => a + 1)}>
              Vorschau neu laden
            </Button>
          </div>
        )}
        {ready && (
          <div className="absolute top-2 right-2 flex flex-wrap justify-end gap-1">
            <Button size="sm" variant="secondary" icon={RotateCcw} onClick={reset} title="Ansicht zurücksetzen (Taste 0)">
              Zurücksetzen
            </Button>
            <Button size="sm" variant={wireframe ? 'subtle' : 'secondary'} icon={Grid3x3} aria-pressed={wireframe} onClick={toggleWireframe} title="Drahtgitter ein/aus (Taste W)">
              Drahtgitter
            </Button>
            <Button size="sm" variant={autoRotate ? 'subtle' : 'secondary'} icon={Rotate3d} aria-pressed={autoRotate} onClick={toggleAutoRotate} title="Automatisch drehen">
              Drehen
            </Button>
          </div>
        )}
      </div>
      {ready && (
        <p id={statsId} className="text-xs text-muted">
          {describeModel(name, state.stats, state.sizeBytes)}
        </p>
      )}
      <p id={helpId} className="text-[11px] text-subtle">
        Maus: ziehen dreht, rechte Maustaste verschiebt, Mausrad zoomt. Tastatur (nach Klick oder Tab in die Ansicht): Pfeiltasten drehen, + und − zoomen, 0 setzt zurück, W schaltet das
        Drahtgitter um.
      </p>
    </div>
  );
}
