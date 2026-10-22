// Autostart with Windows ("NOVA mit Windows starten"): app.setLoginItemSettings({ openAtLogin, args: ['--hidden'] }).
// Key decisions:
// - Supported on Windows (HKCU\…\CurrentVersion\Run, value name = AUTOSTART_NAME = the AppUserModelId, which the
//   NSIS uninstaller removes again) and macOS. Linux has no login item API in Electron → reported as unsupported.
// - Only packaged builds register themselves: a development build would register electron.exe without the app path.
// - get() on Windows also honours the "disabled in Task Manager" state (executableWillLaunchAtLogin=false).
// - reconcile(desired) runs once with the daemon's settings.background.autostart after start: it re-registers when
//   the Run value is missing or points to an old install path, and removes it when the setting is off. It never
//   touches the Task-Manager "deactivated" flag of an existing entry (that is the user's explicit choice).
// - Errors are logged and reported as "not enabled"; autostart must never break the app.
import type { MainLogger } from './log';
import { errorText } from './log';

export const AUTOSTART_ARGS = ['--hidden'];
export const AUTOSTART_NAME = 'ai.nova.studio';

export interface LoginItemApi {
  getLoginItemSettings(opts?: { path?: string; args?: string[] }): { openAtLogin: boolean; executableWillLaunchAtLogin?: boolean };
  setLoginItemSettings(settings: { openAtLogin: boolean; path?: string; args?: string[]; name?: string; enabled?: boolean }): void;
}

export interface AutostartOptions {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  execPath: string;
  api: LoginItemApi;
  log?: MainLogger;
}

export class AutostartManager {
  constructor(private readonly o: AutostartOptions) {}

  supported(): boolean {
    return this.o.isPackaged && (this.o.platform === 'win32' || this.o.platform === 'darwin');
  }

  private query(): { openAtLogin: boolean; willLaunch: boolean } | null {
    if (!this.supported()) return null;
    try {
      const s =
        this.o.platform === 'win32'
          ? this.o.api.getLoginItemSettings({ path: this.o.execPath, args: AUTOSTART_ARGS })
          : this.o.api.getLoginItemSettings();
      return { openAtLogin: s.openAtLogin === true, willLaunch: s.executableWillLaunchAtLogin !== false };
    } catch (e) {
      this.o.log?.warn('Autostart-Status nicht lesbar', { error: errorText(e) });
      return null;
    }
  }

  /** True when NOVA will start at login. */
  get(): boolean {
    const q = this.query();
    if (!q) return false;
    return this.o.platform === 'win32' ? q.openAtLogin && q.willLaunch : q.openAtLogin;
  }

  /** Enables/disables autostart and returns the resulting state. */
  set(enabled: boolean): boolean {
    if (!this.supported()) return false;
    try {
      if (this.o.platform === 'win32') {
        // `enabled: true` also clears a "deactivated in Task Manager" mark: switching autostart on in NOVA is an
        // explicit user decision. On removal Electron deletes the Run and StartupApproved values.
        this.o.api.setLoginItemSettings(
          enabled
            ? { openAtLogin: true, path: this.o.execPath, args: AUTOSTART_ARGS, name: AUTOSTART_NAME, enabled: true }
            : { openAtLogin: false, path: this.o.execPath, args: AUTOSTART_ARGS, name: AUTOSTART_NAME },
        );
      } else {
        this.o.api.setLoginItemSettings({ openAtLogin: enabled, args: AUTOSTART_ARGS });
      }
      this.o.log?.info('Autostart geändert', { enabled });
    } catch (e) {
      this.o.log?.warn('Autostart konnte nicht geändert werden', { enabled, error: errorText(e) });
    }
    return this.get();
  }

  /** Brings the registration in line with the saved setting (see header). Returns true when something changed. */
  reconcile(desired: boolean): boolean {
    const q = this.query();
    if (!q) return false;
    if (desired === q.openAtLogin) return false;
    this.set(desired);
    return true;
  }
}
