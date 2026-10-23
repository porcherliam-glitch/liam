// Small persistent state of the Electron main process: <userData>/ui-state.json.
// Contents: window bounds (UI-SPEC §5 "remember bounds"), whether the close-to-tray explanation was shown, and the
// last known background settings (so quitting behaves correctly even when the daemon is unreachable at that moment).
// Key decisions:
// - Parsing is defensive: a corrupt or foreign file never prevents the app from starting (defaults are used).
// - Bounds are sanitised against the current displays: a window saved on a monitor that is gone is moved back
//   (centred by Electron), sizes are clamped to the minimum 1100×700 and to the work area.
// - Writes are atomic (temp + rename via core/fs-atomic) and coalesced (at most one write per 500 ms; flush() on quit).
import { readFileSync } from 'node:fs';
import { atomicWriteFile } from '../daemon/core/fs-atomic';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SavedWindowState {
  x: number | null;
  y: number | null;
  width: number;
  height: number;
  maximized: boolean;
}

export interface BackgroundPrefs {
  keepRunningWhenUiClosed: boolean;
  closeToTray: boolean;
  autostart: boolean;
}

export interface UiState {
  window: SavedWindowState | null;
  closeToTrayHintShown: boolean;
  background: BackgroundPrefs | null;
}

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 } as const;
export const MIN_WINDOW_SIZE = { width: 1100, height: 700 } as const;
/** Part of the title bar that must be on a screen for the saved position to be used. */
const VISIBLE_MIN = { width: 120, height: 32 } as const;

export const DEFAULT_UI_STATE: UiState = { window: null, closeToTrayHintShown: false, background: null };

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function parseWindow(v: unknown): SavedWindowState | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (!isFiniteNumber(o.width) || !isFiniteNumber(o.height) || o.width <= 0 || o.height <= 0) return null;
  const hasPos = isFiniteNumber(o.x) && isFiniteNumber(o.y);
  return {
    x: hasPos ? Math.round(o.x as number) : null,
    y: hasPos ? Math.round(o.y as number) : null,
    width: Math.round(o.width),
    height: Math.round(o.height),
    maximized: o.maximized === true,
  };
}

function parseBackground(v: unknown): BackgroundPrefs | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (typeof o.keepRunningWhenUiClosed !== 'boolean' || typeof o.closeToTray !== 'boolean') return null;
  return { keepRunningWhenUiClosed: o.keepRunningWhenUiClosed, closeToTray: o.closeToTray, autostart: o.autostart === true };
}

/** Parses the file content; anything invalid falls back to defaults field by field. */
export function parseUiState(raw: string | null): UiState {
  if (!raw) return { ...DEFAULT_UI_STATE };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...DEFAULT_UI_STATE };
  }
  if (!data || typeof data !== 'object') return { ...DEFAULT_UI_STATE };
  const o = data as Record<string, unknown>;
  return {
    window: parseWindow(o.window),
    closeToTrayHintShown: o.closeToTrayHintShown === true,
    background: parseBackground(o.background),
  };
}

function intersection(a: Rect, b: Rect): { width: number; height: number } {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, w), height: Math.max(0, h) };
}

export interface InitialWindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

/**
 * Initial window bounds from the saved state and the work areas of the connected displays (primary first).
 * Without a usable saved position the result has no x/y (Electron centres the window).
 */
export function initialWindowBounds(saved: SavedWindowState | null, workAreas: readonly Rect[]): InitialWindowBounds {
  const primary = workAreas[0] ?? null;
  const fit = (w: number, h: number, area: Rect | null) => {
    const maxW = area ? Math.max(MIN_WINDOW_SIZE.width, area.width) : Number.POSITIVE_INFINITY;
    const maxH = area ? Math.max(MIN_WINDOW_SIZE.height, area.height) : Number.POSITIVE_INFINITY;
    return {
      width: Math.min(Math.max(Math.round(w), MIN_WINDOW_SIZE.width), maxW),
      height: Math.min(Math.max(Math.round(h), MIN_WINDOW_SIZE.height), maxH),
    };
  };
  if (!saved) {
    const size = fit(
      primary ? Math.min(DEFAULT_WINDOW_SIZE.width, primary.width) : DEFAULT_WINDOW_SIZE.width,
      primary ? Math.min(DEFAULT_WINDOW_SIZE.height, primary.height) : DEFAULT_WINDOW_SIZE.height,
      primary,
    );
    return { ...size, maximized: false };
  }
  if (saved.x !== null && saved.y !== null) {
    const titleBar: Rect = { x: saved.x, y: saved.y, width: saved.width, height: VISIBLE_MIN.height };
    const host = workAreas.find((a) => {
      const i = intersection(titleBar, a);
      return i.width >= VISIBLE_MIN.width && i.height >= Math.min(VISIBLE_MIN.height, 16);
    });
    if (host) {
      const size = fit(saved.width, saved.height, host);
      // Keep the window inside the host work area horizontally/vertically where possible.
      const x = Math.min(Math.max(saved.x, host.x - size.width + VISIBLE_MIN.width), host.x + host.width - VISIBLE_MIN.width);
      const y = Math.min(Math.max(saved.y, host.y), host.y + host.height - VISIBLE_MIN.height);
      return { x, y, ...size, maximized: saved.maximized };
    }
  }
  return { ...fit(saved.width, saved.height, primary), maximized: saved.maximized };
}

export interface UiStateStoreOptions {
  file: string;
  /** Minimum time between two writes (default 500 ms). */
  writeDelayMs?: number;
  read?: (file: string) => string | null;
  write?: (file: string, data: string) => void;
  onError?: (e: unknown) => void;
}

/** Loads ui-state.json once and writes changes back (coalesced, atomic). */
export class UiStateStore {
  private state: UiState;
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;
  private readonly writeDelayMs: number;
  private readonly writeFn: (file: string, data: string) => void;

  constructor(private readonly opts: UiStateStoreOptions) {
    const read =
      opts.read ??
      ((f: string) => {
        try {
          return readFileSync(f, 'utf8');
        } catch {
          return null;
        }
      });
    this.state = parseUiState(read(opts.file));
    this.writeDelayMs = opts.writeDelayMs ?? 500;
    this.writeFn = opts.write ?? ((f, d) => atomicWriteFile(f, d));
  }

  get(): UiState {
    return {
      window: this.state.window ? { ...this.state.window } : null,
      closeToTrayHintShown: this.state.closeToTrayHintShown,
      background: this.state.background ? { ...this.state.background } : null,
    };
  }

  update(patch: Partial<UiState>): void {
    this.state = { ...this.state, ...patch };
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.writeDelayMs);
    this.timer.unref?.();
  }

  /** Writes pending changes now (called on quit). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.dirty) return;
    this.dirty = false;
    try {
      this.writeFn(this.opts.file, `${JSON.stringify(this.state, null, 2)}\n`);
    } catch (e) {
      this.opts.onError?.(e);
    }
  }
}
