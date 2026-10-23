// Tray icon of NOVA (UI-SPEC §5): "NOVA öffnen", "Arbeit pausieren"/"Arbeit fortsetzen" (work.pause/resume),
// "Oberfläche beenden", "NOVA vollständig beenden (inkl. Hintergrunddienst)", plus a disabled status line.
// Key decisions:
// - The menu model is a pure function of the daemon connection state and the work-cycle state (testable); the
//   Electron Tray/Menu objects are created through injected factories.
// - The work item follows WorkStatus.state: running → pause, paused → resume, stopped → start. It is disabled while
//   the daemon is not connected.
// - Left click (Windows) opens the window; the menu is rebuilt only when its content changes.
import type { DaemonConnectionStateName } from '@shared/bridge';
import type { WorkCycleState } from '@shared/schemas';
import { TEXTS } from './texts';

export type TrayAction = 'open' | 'work-pause' | 'work-resume' | 'work-start' | 'quit-ui' | 'quit-all';

export interface TrayMenuItem {
  id: string;
  type: 'normal' | 'separator';
  label: string;
  enabled: boolean;
  action: TrayAction | null;
}

export interface TrayModelInput {
  connection: DaemonConnectionStateName;
  work: WorkCycleState | null;
}

export function trayTooltip(input: TrayModelInput): string {
  const state = TEXTS.trayStateLabels[input.connection];
  if (input.connection === 'connected' && input.work) return TEXTS.trayTooltip(`${state} · ${TEXTS.trayWorkLabels[input.work]}`);
  return TEXTS.trayTooltip(state);
}

export function buildTrayItems(input: TrayModelInput): TrayMenuItem[] {
  const connected = input.connection === 'connected';
  const work = input.work ?? 'running';
  const workItem: TrayMenuItem =
    work === 'running'
      ? { id: 'work', type: 'normal', label: TEXTS.trayPauseWork, enabled: connected && input.work !== null, action: 'work-pause' }
      : work === 'paused'
        ? { id: 'work', type: 'normal', label: TEXTS.trayResumeWork, enabled: connected, action: 'work-resume' }
        : { id: 'work', type: 'normal', label: TEXTS.trayStartWork, enabled: connected, action: 'work-start' };
  return [
    { id: 'status', type: 'normal', label: TEXTS.trayStatus(TEXTS.trayStateLabels[input.connection]), enabled: false, action: null },
    { id: 'sep-1', type: 'separator', label: '', enabled: true, action: null },
    { id: 'open', type: 'normal', label: TEXTS.trayOpen, enabled: true, action: 'open' },
    workItem,
    { id: 'sep-2', type: 'separator', label: '', enabled: true, action: null },
    { id: 'quit-ui', type: 'normal', label: TEXTS.trayQuitUi, enabled: true, action: 'quit-ui' },
    { id: 'quit-all', type: 'normal', label: TEXTS.trayQuitAll, enabled: true, action: 'quit-all' },
  ];
}

export interface TrayLike {
  setToolTip(text: string): void;
  setContextMenu(menu: unknown): void;
  on(event: 'click' | 'double-click', listener: () => void): unknown;
  destroy(): void;
}

export interface TrayControllerDeps {
  /** Creates the Electron Tray; null/throw = no tray available (then the window is never hidden to the tray). */
  createTray(): TrayLike | null;
  /** Builds a native menu from the model; clicks call onAction. */
  buildMenu(items: TrayMenuItem[], onAction: (action: TrayAction) => void): unknown;
  onAction(action: TrayAction): void;
  onError?(e: unknown): void;
}

export class TrayController {
  private tray: TrayLike | null = null;
  private lastKey = '';
  private lastTooltip = '';
  private input: TrayModelInput = { connection: 'connecting', work: null };

  constructor(private readonly deps: TrayControllerDeps) {}

  /** Creates the tray icon. Returns false when no tray is available on this system. */
  init(): boolean {
    if (this.tray) return true;
    try {
      this.tray = this.deps.createTray();
    } catch (e) {
      this.deps.onError?.(e);
      this.tray = null;
    }
    if (!this.tray) return false;
    this.tray.on('click', () => this.deps.onAction('open'));
    this.tray.on('double-click', () => this.deps.onAction('open'));
    this.render(true);
    return true;
  }

  available(): boolean {
    return this.tray !== null;
  }

  update(patch: Partial<TrayModelInput>): void {
    this.input = { ...this.input, ...patch };
    this.render(false);
  }

  destroy(): void {
    try {
      this.tray?.destroy();
    } catch {
      /* already destroyed */
    }
    this.tray = null;
  }

  private render(force: boolean): void {
    if (!this.tray) return;
    const items = buildTrayItems(this.input);
    const key = JSON.stringify(items);
    try {
      if (force || key !== this.lastKey) {
        this.tray.setContextMenu(this.deps.buildMenu(items, (a) => this.deps.onAction(a)));
        this.lastKey = key;
      }
      const tooltip = trayTooltip(this.input);
      if (force || tooltip !== this.lastTooltip) {
        this.tray.setToolTip(tooltip);
        this.lastTooltip = tooltip;
      }
    } catch (e) {
      this.deps.onError?.(e);
    }
  }
}
