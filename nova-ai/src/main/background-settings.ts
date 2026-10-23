// Cache of settings.background in the Electron main process (close-to-tray, keep daemon running, autostart).
// Key decisions:
// - Source of truth is the daemon (settings.get on every (re)connect, 'settings.updated' events). The last known
//   values are persisted in ui-state.json so a quit while the daemon is unreachable still follows the user's choice.
// - Before quitting, refresh() re-reads the settings with a short timeout: a change made a moment ago (event still in
//   flight) must not be missed (e.g. "keepRunningWhenUiClosed=false" set right before closing).
// - Defaults when nothing is known: the schema defaults (keep running, close to tray, no autostart).
import { BackgroundSettingsSchema } from '@shared/settings';
import type { BackgroundPrefs } from './ui-state';

export const DEFAULT_BACKGROUND: BackgroundPrefs = (() => {
  const d = BackgroundSettingsSchema.parse({});
  return { keepRunningWhenUiClosed: d.keepRunningWhenUiClosed, closeToTray: d.closeToTray, autostart: d.autostart };
})();

/** Extracts the background section from a Settings object (settings.get result / settings.updated payload). */
export function backgroundFromSettings(settings: unknown): BackgroundPrefs | null {
  if (!settings || typeof settings !== 'object') return null;
  const parsed = BackgroundSettingsSchema.safeParse((settings as { background?: unknown }).background);
  if (!parsed.success) return null;
  return { keepRunningWhenUiClosed: parsed.data.keepRunningWhenUiClosed, closeToTray: parsed.data.closeToTray, autostart: parsed.data.autostart };
}

export interface BackgroundSettingsCacheOptions {
  /** Last persisted values (ui-state.json) or null. */
  initial: BackgroundPrefs | null;
  persist(prefs: BackgroundPrefs): void;
  /** Called when values change. `fromDaemonFirstLoad` is true for the first value received from the daemon in this run. */
  onChange?(next: BackgroundPrefs, prev: BackgroundPrefs | null, fromDaemonFirstLoad: boolean): void;
}

export class BackgroundSettingsCache {
  private value: BackgroundPrefs | null;
  private receivedFromDaemon = false;

  constructor(private readonly opts: BackgroundSettingsCacheOptions) {
    this.value = opts.initial ? { ...opts.initial } : null;
  }

  /** Current values (defaults when unknown). */
  get(): BackgroundPrefs {
    return this.value ? { ...this.value } : { ...DEFAULT_BACKGROUND };
  }

  /** True once the daemon delivered the settings in this run. */
  fresh(): boolean {
    return this.receivedFromDaemon;
  }

  /** Applies a Settings object from the daemon. Returns true when it contained a valid background section. */
  apply(settings: unknown): boolean {
    const next = backgroundFromSettings(settings);
    if (!next) return false;
    const prev = this.value;
    const firstLoad = !this.receivedFromDaemon;
    this.receivedFromDaemon = true;
    const changed =
      !prev ||
      prev.keepRunningWhenUiClosed !== next.keepRunningWhenUiClosed ||
      prev.closeToTray !== next.closeToTray ||
      prev.autostart !== next.autostart;
    this.value = next;
    if (changed) this.opts.persist({ ...next });
    if (changed || firstLoad) this.opts.onChange?.({ ...next }, prev ? { ...prev } : null, firstLoad);
    return true;
  }

  /** Re-reads the settings through `load` (bounded by timeoutMs). Keeps the cached values on failure. */
  async refresh(load: () => Promise<unknown>, timeoutMs: number): Promise<BackgroundPrefs> {
    let timer: NodeJS.Timeout | null = null;
    try {
      const settings = await Promise.race([
        load(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
          timer.unref?.();
        }),
      ]);
      this.apply(settings);
    } catch {
      /* unreachable daemon: keep the last known values */
    } finally {
      if (timer) clearTimeout(timer);
    }
    return this.get();
  }
}
