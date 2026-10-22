// The NOVA main window (UI-SPEC §5): creation with the hardened webPreferences, navigation/window-open/subframe
// guards, bounds persistence, lazy loading, crash recovery and the IPC sender check.
// Key decisions:
// - The window is created at start-up but the renderer is only loaded on the first show(): with `--hidden`
//   (autostart) NOVA sits in the tray without a renderer process, yet the native window exists, so Windows'
//   query-session-end/session-end messages still reach main.
// - Dark background (#0b0d14) + show on 'ready-to-show' → no white flash. Native frame, no menu bar in production,
//   DevTools only in development builds (webPreferences.devTools).
// - Security: contextIsolation, sandbox, no Node, webSecurity, no <webview>, no insecure content; window.open →
//   always denied, http(s) URLs open in the default browser after validation; main-frame navigation never leaves
//   the app origin; subframes may only show loopback http URLs (studio preview).
// - A crashed renderer is reloaded automatically (at most 3 times per 5 minutes).
// - Navigation requests (notification click) are queued until the page has loaded; the preload buffers the last
//   one until the renderer subscribes.
import { BrowserWindow, screen, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '@shared/bridge';
import { RestartBudget } from './restart-budget';
import { errorText, type MainLogger } from './log';
import {
  isAllowedMainFrameNavigation,
  isAllowedSubframeUrl,
  isTrustedSender,
  isValidRendererPath,
  validateExternalUrl,
} from './security';
import { MIN_WINDOW_SIZE, initialWindowBounds, type UiStateStore } from './ui-state';
import { TEXTS } from './texts';

export const WINDOW_BACKGROUND = '#0b0d14';

export interface MainWindowOptions {
  /** URL of the renderer (app://nova/index.html or the dev server). */
  appUrl: string;
  /** Origin that counts as "the app" (app://nova or the dev server origin). */
  appOrigin: string;
  preload: string;
  icon: string | null;
  devTools: boolean;
  uiState: UiStateStore;
  log: MainLogger;
  /** Window close button pressed: return 'allow' to let it close, otherwise main handles it (hide/quit). */
  onCloseRequest(): 'allow' | 'handled';
  /** Windows logoff/shutdown (query-session-end or session-end). */
  onSessionEnd(phase: 'query' | 'end'): void;
  openExternal(url: string): void;
  /** The page's in-memory state is gone (renderer crashed, or the main frame loads anew). */
  onRendererReset?(): void;
}

export class MainWindowController {
  private win: BrowserWindow | null = null;
  private loadState: 'none' | 'loading' | 'loaded' = 'none';
  private showWhenReady = false;
  private shownOnce = false;
  private startMaximized = false;
  private pendingNavigation: string | null = null;
  private saveTimer: NodeJS.Timeout | null = null;
  private readonly crashBudget = new RestartBudget(3, 5 * 60_000);

  constructor(private readonly o: MainWindowOptions) {}

  /** Creates the (hidden, not yet loaded) window. Idempotent. */
  create(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const workAreas = (() => {
      try {
        const primary = screen.getPrimaryDisplay();
        const others = screen.getAllDisplays().filter((d) => d.id !== primary.id);
        return [primary, ...others].map((d) => d.workArea);
      } catch {
        return [];
      }
    })();
    const bounds = initialWindowBounds(this.o.uiState.get().window, workAreas);
    this.startMaximized = bounds.maximized;
    const win = new BrowserWindow({
      ...(bounds.x !== undefined && bounds.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
      width: bounds.width,
      height: bounds.height,
      minWidth: MIN_WINDOW_SIZE.width,
      minHeight: MIN_WINDOW_SIZE.height,
      show: false,
      backgroundColor: WINDOW_BACKGROUND,
      title: TEXTS.appName,
      icon: this.o.icon ?? undefined,
      autoHideMenuBar: !this.o.devTools,
      darkTheme: true,
      webPreferences: {
        preload: this.o.preload,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        devTools: this.o.devTools,
        spellcheck: false,
        navigateOnDragDrop: false,
        safeDialogs: true,
        backgroundThrottling: true,
      },
    });
    this.win = win;
    this.loadState = 'none';
    this.harden(win);

    win.on('ready-to-show', () => {
      if (this.showWhenReady) this.reveal();
    });
    win.on('close', (e) => {
      this.saveBoundsNow();
      if (this.o.onCloseRequest() !== 'allow') e.preventDefault();
    });
    win.on('closed', () => {
      if (this.win === win) {
        this.win = null;
        this.loadState = 'none';
      }
    });
    for (const ev of ['resize', 'move', 'maximize', 'unmaximize'] as const) {
      win.on(ev as 'resize', () => this.scheduleSaveBounds());
    }
    win.on('query-session-end', () => this.o.onSessionEnd('query'));
    win.on('session-end', () => this.o.onSessionEnd('end'));
    return win;
  }

  /** Shows (and loads, on first use) the window and brings it to the front. */
  show(): void {
    const win = this.create();
    if (this.loadState === 'none') {
      this.showWhenReady = true;
      this.load(win);
      return;
    }
    if (this.loadState === 'loading' && !this.shownOnce) {
      this.showWhenReady = true;
      return;
    }
    this.reveal();
  }

  hide(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.saveBoundsNow();
    this.win.hide();
  }

  /** True when the user currently sees the window (visible, not minimised, focused). */
  isUserLooking(): boolean {
    const w = this.win;
    return !!w && !w.isDestroyed() && w.isVisible() && !w.isMinimized() && w.isFocused();
  }

  isVisible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible();
  }

  webContentsId(): number | null {
    const w = this.win;
    return w && !w.isDestroyed() ? w.webContents.id : null;
  }

  /** The native window (for modal dialogs). */
  browserWindow(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null;
  }

  /**
   * Sends a message to the renderer once a page load has started. Messages during loading are delivered as soon as
   * the preload has subscribed (the renderer asks for the current state right after subscribing); before the first
   * load there is no page and messages are dropped.
   */
  send(channel: string, payload: unknown): void {
    this.trySend(channel, payload);
  }

  /** Like send(), but only to a fully loaded page; returns whether the message was handed over. */
  trySendLoaded(channel: string, payload: unknown): boolean {
    return this.loadState === 'loaded' && this.trySend(channel, payload);
  }

  private trySend(channel: string, payload: unknown): boolean {
    const w = this.win;
    if (!w || w.isDestroyed() || this.loadState === 'none' || w.webContents.isCrashed()) return false;
    try {
      w.webContents.send(channel, payload);
      return true;
    } catch (e) {
      this.o.log.debug('Nachricht an die Oberfläche fehlgeschlagen', { channel, error: errorText(e) });
      return false;
    }
  }

  /** Shows the window and asks the renderer to navigate to `path` (HashRouter path such as /approvals). */
  navigate(path: string): void {
    if (!isValidRendererPath(path)) return;
    this.show();
    if (this.loadState === 'loaded') this.send(IPC.navigate, path);
    else this.pendingNavigation = path;
  }

  /** IPC sender check (UI-SPEC §5). */
  isTrustedSender(event: IpcMainInvokeEvent): boolean {
    const w = this.win;
    if (!w || w.isDestroyed()) return false;
    let frameUrl: string | null = null;
    let isMainFrame = false;
    try {
      const frame = event.senderFrame;
      if (frame) {
        const main = w.webContents.mainFrame;
        frameUrl = frame.url;
        isMainFrame = frame.parent === null && frame.processId === main.processId && frame.routingId === main.routingId;
      }
    } catch {
      return false;
    }
    return isTrustedSender({ webContentsId: event.sender.id, frameUrl, isMainFrame }, { webContentsId: w.webContents.id, appOrigin: this.o.appOrigin });
  }

  /** Writes the current bounds to ui-state.json (debounce cancelled). */
  saveBoundsNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const w = this.win;
    if (!w || w.isDestroyed() || !this.shownOnce || w.isFullScreen()) return;
    try {
      const b = w.getNormalBounds();
      this.o.uiState.update({ window: { x: b.x, y: b.y, width: b.width, height: b.height, maximized: w.isMaximized() } });
    } catch (e) {
      this.o.log.debug('Fenstergröße konnte nicht gespeichert werden', { error: errorText(e) });
    }
  }

  /** Destroys the window (quit). */
  destroy(): void {
    this.saveBoundsNow();
    const w = this.win;
    this.win = null;
    if (w && !w.isDestroyed()) w.destroy();
  }

  // --- internals -------------------------------------------------------------------------------------------------

  private load(win: BrowserWindow): void {
    this.loadState = 'loading';
    win.loadURL(this.o.appUrl).catch((e: unknown) => {
      // ERR_ABORTED happens when a navigation replaces the load (e.g. reload) – not an error worth reporting.
      this.o.log.warn('Oberfläche konnte nicht geladen werden', { url: this.o.appUrl, error: errorText(e) });
    });
  }

  private reveal(): void {
    const w = this.win;
    if (!w || w.isDestroyed()) return;
    this.showWhenReady = false;
    if (!this.shownOnce) {
      this.shownOnce = true;
      // maximize() also shows the window; calling it on a hidden window earlier would flash it.
      if (this.startMaximized) w.maximize();
      else w.show();
    } else {
      if (w.isMinimized()) w.restore();
      w.show();
    }
    w.focus();
  }

  private scheduleSaveBounds(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveBoundsNow();
    }, 500);
    this.saveTimer.unref?.();
  }

  private harden(win: BrowserWindow): void {
    const wc = win.webContents;
    const log = this.o.log;
    const origin = this.o.appOrigin;

    wc.setWindowOpenHandler(({ url }) => {
      const external = validateExternalUrl(url);
      if (external) this.o.openExternal(external);
      else log.warn('Neues Fenster abgelehnt', { url: url.slice(0, 200) });
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e) => {
      if (!isAllowedMainFrameNavigation(e.url, origin)) {
        e.preventDefault();
        log.warn('Navigation außerhalb der App blockiert', { url: e.url.slice(0, 200) });
      }
    });
    wc.on('will-redirect', (e) => {
      if (e.isMainFrame ? !isAllowedMainFrameNavigation(e.url, origin) : !isAllowedSubframeUrl(e.url)) {
        e.preventDefault();
        log.warn('Weiterleitung blockiert', { url: e.url.slice(0, 200), mainFrame: e.isMainFrame });
      }
    });
    wc.on('will-frame-navigate', (e) => {
      const allowed = e.isMainFrame ? isAllowedMainFrameNavigation(e.url, origin) : isAllowedSubframeUrl(e.url);
      if (!allowed) {
        e.preventDefault();
        log.warn('Navigation eines Rahmens blockiert', { url: e.url.slice(0, 200), mainFrame: e.isMainFrame });
      }
    });
    wc.on('will-attach-webview', (e) => {
      e.preventDefault();
      log.warn('<webview> blockiert');
    });
    wc.on('did-start-loading', () => {
      if (this.loadState === 'loaded') this.loadState = 'loading';
    });
    wc.on('did-start-navigation', (details) => {
      // A new document in the main frame (reload): the page's in-memory state starts empty. HashRouter navigations
      // are same-document and preview iframes are subframes – neither counts.
      if (details.isMainFrame && !details.isSameDocument) this.o.onRendererReset?.();
    });
    wc.on('did-finish-load', () => {
      this.loadState = 'loaded';
      const nav = this.pendingNavigation;
      this.pendingNavigation = null;
      if (nav) this.send(IPC.navigate, nav);
      // A reload after a crash or a failed first paint: make sure a requested show still happens.
      if (this.showWhenReady) this.reveal();
    });
    wc.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
      if (isMainFrame && code !== -3) log.error('Oberfläche konnte nicht geladen werden', { code, description, url: url.slice(0, 200) });
    });
    wc.on('preload-error', (_e, path, error) => {
      log.error('Preload-Skript fehlgeschlagen', { path, error: errorText(error) });
    });
    wc.on('render-process-gone', (_e, details) => {
      log.error('Oberflächenprozess beendet', { reason: details.reason, exitCode: details.exitCode });
      this.o.onRendererReset?.();
      if (details.reason === 'clean-exit' || win.isDestroyed()) return;
      if (!this.crashBudget.tryConsume(Date.now())) {
        log.error('Oberfläche wird nach mehreren Abstürzen nicht erneut geladen');
        return;
      }
      setTimeout(() => {
        if (!win.isDestroyed()) {
          this.loadState = 'loading';
          wc.reload();
        }
      }, 1000).unref?.();
    });
    wc.on('unresponsive', () => log.warn('Oberfläche reagiert nicht'));
    wc.on('responsive', () => log.info('Oberfläche reagiert wieder'));
  }
}
