// Electron main process of NOVA AI: wires window, tray, notifications, autostart, the app:// protocol, the IPC bridge
// and the DaemonSupervisor together (UI-SPEC §5, SPEC §6.10). The logic lives in small testable modules; this file
// is the Electron glue and the lifecycle.
//
// Lifecycle:
//   `--stop-daemon` (NSIS installer/uninstaller): no window – tell a running UI to quit (single-instance message),
//     stop the daemon gracefully, wait ≤ 20 s for its endpoint to vanish, exit.
//   Normal start: single-instance lock (a second start focuses the window), sandbox for all renderers, privileged
//     app:// scheme, AppUserModelId 'ai.nova.studio', canonical data dir, then on ready: protocol handler + CSP,
//     permission/download denial, window (hidden and not loaded with `--hidden`), tray, IPC, supervisor.start().
//   Close button: hide to the tray when background.closeToTray (first time: explanation toast), else quit the UI.
//   Quit: "Oberfläche beenden" keeps the daemon running when background.keepRunningWhenUiClosed, otherwise
//     daemon.shutdown; "NOVA vollständig beenden" always shuts it down. Windows logoff/shutdown (query-session-end)
//     → daemon.shutdown({ reason: 'os-shutdown' }).
//
// Key decisions:
// - Development: NOVA_RENDERER_URL (loopback only, ignored when packaged) loads the Vite dev server; NOVA_DEV=1 adds
//   DevTools, a minimal German menu and the relaxed dev CSP. NOVA_USER_DATA_DIR (absolute) isolates Electron's
//   userData (e2e tests); NOVA_DATA_DIR / --data-dir select the daemon data dir.
// - Downloads are cancelled (the renderer never downloads; exports are written by the daemon).
// - Uncaught errors in main are logged instead of showing Electron's default crash dialog.
import { app, dialog, ipcMain, Menu, nativeImage, nativeTheme, Notification, powerMonitor, protocol, session, shell, Tray, type IpcMainInvokeEvent, type MenuItemConstructorOptions } from 'electron';
import { existsSync, promises as fsp } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { IPC, type DaemonConnectionStateName } from '@shared/bridge';
import type { AnyNovaEvent } from '@shared/events';
import type { WorkCycleState } from '@shared/schemas';
import { DaemonClient } from '../daemon/client';
import { probeEndpoint } from '../daemon/server/probe';
import { canonicalDataDir, dataPaths, defaultDataDir, defaultEndpoint } from '../daemon/core/paths';
import { parseCliArgs } from './cli';
import { TEXTS } from './texts';
import { createMainLogger, errorText, type MainLogger } from './log';
import { resolveAppPaths } from './app-paths';
import { APP_ENTRY_URL, APP_ORIGIN, APP_SCHEME, buildCsp, isPermissionAllowed, originKey, parseDevRendererUrl, validateExternalUrl } from './security';
import { createAppProtocolHandler } from './app-protocol';
import { DaemonSupervisor } from './daemon-supervisor';
import { UiStateStore } from './ui-state';
import { BackgroundSettingsCache } from './background-settings';
import { AutostartManager, AUTOSTART_NAME } from './autostart';
import { NotificationPresenter } from './notifications';
import { TrayController, type TrayAction, type TrayMenuItem } from './tray';
import { MainWindowController } from './main-window';
import { createIpcHandlers, registerIpcHandlers } from './ipc-handlers';
import { decideCloseAction, decideDaemonShutdown, mergeQuitMode, type QuitMode } from './quit-policy';
import { stopDaemonCli } from './stop-daemon';
import { RestartBudget } from './restart-budget';

const cli = parseCliArgs(process.argv);
const isDev = !app.isPackaged && process.env.NOVA_DEV === '1';
const appVersion = typeof __NOVA_VERSION__ !== 'undefined' ? __NOVA_VERSION__ : app.getVersion();

/** Isolated Electron profile for tests (absolute path only). */
const userDataOverride = process.env.NOVA_USER_DATA_DIR;
if (userDataOverride && isAbsolute(userDataOverride)) app.setPath('userData', userDataOverride);

function resolveDataDir(): { dir: string; error: null } | { dir: string; error: string } {
  const input = cli.dataDir ?? defaultDataDir();
  try {
    return { dir: canonicalDataDir(input), error: null };
  } catch (e) {
    return { dir: input, error: errorText(e) };
  }
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([p, new Promise<undefined>((r) => (timer = setTimeout(() => r(undefined), ms)))]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// --- `--stop-daemon` ---------------------------------------------------------------------------------------------

async function runStopDaemon(): Promise<void> {
  app.disableHardwareAcceleration();
  // A running UI of this user gets a 'second-instance' message and quits itself (it shuts the daemon down too).
  if (app.requestSingleInstanceLock({ stopDaemon: true })) app.releaseSingleInstanceLock();
  const out = (line: string) => {
    try {
      process.stdout.write(`${line}\n`);
    } catch {
      /* no console attached */
    }
  };
  const resolved = resolveDataDir();
  if (resolved.error !== null) {
    out(TEXTS.cliDataDirError(resolved.error));
    app.exit(2);
    return;
  }
  const paths = dataPaths(resolved.dir);
  const log = createMainLogger({ file: join(paths.logs, 'ui-main.log') });
  const code = await stopDaemonCli(
    { endpoint: defaultEndpoint(resolved.dir), tokenPath: paths.token },
    {
      probe: (endpoint, tokenPath, timeoutMs) => probeEndpoint(endpoint, tokenPath, timeoutMs),
      createClient: (o) => new DaemonClient(o),
      sleep: delay,
      now: () => Date.now(),
      out,
      log,
    },
  ).catch((e: unknown) => {
    log.error('--stop-daemon fehlgeschlagen', { error: errorText(e) });
    return 1;
  });
  app.exit(code);
}

// --- normal UI start ---------------------------------------------------------------------------------------------

function devMenuTemplate(): MenuItemConstructorOptions[] {
  return [
    {
      label: TEXTS.menuEdit,
      submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }],
    },
    {
      label: TEXTS.menuView,
      submenu: [
        { role: 'reload', label: TEXTS.menuReload },
        { role: 'toggleDevTools', label: TEXTS.menuDevTools },
      ],
    },
  ];
}

function startUi(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  // OS sandbox for every renderer. An explicit `--no-sandbox` (Linux CI running as root, see e2e) must win, otherwise
  // Chromium refuses to start; the windows keep `sandbox: true` (no Node in preload/renderer) either way.
  if (!app.commandLine.hasSwitch('no-sandbox')) app.enableSandbox();
  protocol.registerSchemesAsPrivileged([
    { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
  ]);
  if (process.platform === 'win32') app.setAppUserModelId(AUTOSTART_NAME);

  const resolved = resolveDataDir();
  let log: MainLogger = createMainLogger({ file: null, echo: !app.isPackaged });
  process.on('uncaughtException', (e) => log.error('Unerwarteter Fehler im Hauptprozess', { error: errorText(e), stack: e instanceof Error ? e.stack : undefined }));
  process.on('unhandledRejection', (e) => log.error('Unbehandelte Promise-Ablehnung im Hauptprozess', { error: errorText(e) }));

  app.on('window-all-closed', () => {
    /* stay resident: quitting is always explicit (tray, bridge, close button without close-to-tray) */
  });

  void app.whenReady().then(() => {
    if (resolved.error !== null) {
      dialog.showErrorBox(TEXTS.startupErrorTitle, TEXTS.dataDirUnusable(resolved.dir, resolved.error));
      app.exit(1);
      return;
    }
    const dataDir = resolved.dir;
    const paths = dataPaths(dataDir);
    log = createMainLogger({ file: join(paths.logs, 'ui-main.log'), echo: !app.isPackaged });
    log.info('Oberfläche startet', { version: appVersion, packaged: app.isPackaged, hidden: cli.hidden, dataDir, dev: isDev });
    runUi(dataDir, log);
  });
}

function runUi(dataDir: string, log: MainLogger): void {
  nativeTheme.themeSource = 'dark';
  const paths = dataPaths(dataDir);
  const appPaths = resolveAppPaths({ appPath: app.getAppPath(), resourcesPath: process.resourcesPath, isPackaged: app.isPackaged, platform: process.platform });

  // Renderer origin + CSP ------------------------------------------------------------------------------------------
  const rawDevUrl = process.env.NOVA_RENDERER_URL;
  const devRendererUrl = app.isPackaged ? null : parseDevRendererUrl(rawDevUrl);
  if (rawDevUrl && !devRendererUrl) log.warn('NOVA_RENDERER_URL ignoriert (nur Loopback-Adressen in Entwicklungsbuilds)');
  if (devRendererUrl && !isDev) log.warn('NOVA_RENDERER_URL ohne NOVA_DEV=1: die strenge CSP kann den Vite-Entwicklungsserver blockieren');
  const appOrigin = devRendererUrl ? (originKey(devRendererUrl) ?? APP_ORIGIN) : APP_ORIGIN;
  const appUrl = devRendererUrl ?? APP_ENTRY_URL;
  const csp = buildCsp({ dev: isDev, devServerOrigin: devRendererUrl });

  protocol.handle(APP_SCHEME, createAppProtocolHandler({ root: appPaths.rendererRoot, csp }));
  const ses = session.defaultSession;
  if (devRendererUrl) {
    ses.webRequest.onHeadersReceived({ urls: [`${appOrigin}/*`] }, (details, callback) => {
      const headers = { ...(details.responseHeaders ?? {}) };
      for (const k of Object.keys(headers)) if (k.toLowerCase() === 'content-security-policy') delete headers[k];
      headers['Content-Security-Policy'] = [csp];
      callback({ responseHeaders: headers });
    });
  }
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    const allowed = isPermissionAllowed(permission, details.requestingUrl, appOrigin);
    if (!allowed) log.debug('Berechtigung verweigert', { permission });
    callback(allowed);
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin, details) => isPermissionAllowed(permission, details.requestingUrl ?? requestingOrigin, appOrigin));
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (e) => {
    e.preventDefault();
    log.warn('Download blockiert');
  });
  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-attach-webview', (ev) => ev.preventDefault());
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  });
  if (isDev) Menu.setApplicationMenu(Menu.buildFromTemplate(devMenuTemplate()));
  else Menu.setApplicationMenu(null);

  // Collaborators ----------------------------------------------------------------------------------------------------
  const uiState = new UiStateStore({
    file: join(app.getPath('userData'), 'ui-state.json'),
    onError: (e) => log.warn('ui-state.json konnte nicht gespeichert werden', { error: errorText(e) }),
  });
  const supervisor = new DaemonSupervisor({
    dataDir,
    endpoint: defaultEndpoint(dataDir),
    tokenPath: paths.token,
    crashPath: paths.crash,
    startLogPath: paths.startLog,
    daemonEntry: appPaths.daemonEntry,
    execPath: process.execPath,
    appVersion,
    log,
  });
  const autostart = new AutostartManager({ platform: process.platform, isPackaged: app.isPackaged, execPath: process.execPath, api: app, log });
  const background = new BackgroundSettingsCache({
    initial: uiState.get().background,
    persist: (b) => uiState.update({ background: b }),
    onChange: (next, prev, firstLoad) => {
      if (firstLoad) autostart.reconcile(next.autostart);
      else if (prev && prev.autostart !== next.autostart && autostart.get() !== next.autostart) autostart.set(next.autostart);
    },
  });
  const externalLimiter = new RestartBudget(10, 10_000);
  const openExternalSafe = (raw: string) => {
    const url = validateExternalUrl(raw);
    if (!url || !externalLimiter.tryConsume(Date.now())) {
      log.warn('Externer Link abgelehnt', { url: raw.slice(0, 200) });
      return;
    }
    shell.openExternal(url).catch((e: unknown) => log.warn('Externer Link konnte nicht geöffnet werden', { error: errorText(e) }));
  };

  let quitPhase: 'running' | 'finalizing' | 'done' = 'running';
  let quitMode: QuitMode | null = null;
  let sessionShutdownSent = false;
  let sessionEndTimer: NodeJS.Timeout | null = null;
  const requestQuit = (mode: QuitMode) => {
    quitMode = mergeQuitMode(quitMode, mode);
    app.quit();
  };

  const windowIconPath = existsSync(appPaths.windowIcon) ? appPaths.windowIcon : null;
  const presenter: NotificationPresenter = new NotificationPresenter({
    isSupported: () => Notification.isSupported(),
    create: (o) => new Notification({ title: o.title, body: o.body, icon: o.icon, silent: o.silent }),
    shouldShow: () => !windowCtl.isUserLooking(),
    openTarget: (path) => windowCtl.navigate(path),
    markRead: (id) => void supervisor.rpc('notifications.markRead', { ids: [id] }, { waitForConnectionMs: 0 }).catch(() => undefined),
    icon: windowIconPath ?? undefined,
    log,
  });

  const maybeShowCloseToTrayHint = () => {
    if (uiState.get().closeToTrayHintShown) return;
    uiState.update({ closeToTrayHintShown: true });
    presenter.showInfo(TEXTS.closeToTrayTitle, TEXTS.closeToTrayBody, () => windowCtl.show());
  };

  const windowCtl: MainWindowController = new MainWindowController({
    appUrl,
    appOrigin,
    preload: appPaths.preload,
    icon: windowIconPath,
    devTools: isDev,
    uiState,
    log,
    onCloseRequest: () => {
      if (quitPhase === 'done') return 'allow';
      if (quitPhase === 'finalizing') return 'handled';
      const decision = decideCloseAction({ quitting: false, closeToTray: background.get().closeToTray, trayAvailable: tray.available() });
      if (decision === 'hide') {
        windowCtl.hide();
        maybeShowCloseToTrayHint();
      } else {
        requestQuit('ui');
      }
      return 'handled';
    },
    onSessionEnd: (phase) => {
      if (phase === 'query') {
        // Windows asks whether the session may end: stop the daemon now (after WM_ENDSESSION there is no time left).
        if (!sessionShutdownSent) {
          sessionShutdownSent = true;
          log.info('Windows wird abgemeldet oder heruntergefahren – Hintergrunddienst wird beendet');
          void supervisor.stop('os-shutdown');
          // If another program cancels the shutdown, the session continues: start the daemon again.
          sessionEndTimer = setTimeout(() => {
            sessionEndTimer = null;
            if (quitPhase !== 'running') return;
            sessionShutdownSent = false;
            log.info('Abmelden wurde abgebrochen – Hintergrunddienst wird wieder gestartet');
            void supervisor.restart();
          }, 60_000);
          sessionEndTimer.unref?.();
        }
        return;
      }
      if (sessionEndTimer) clearTimeout(sessionEndTimer);
      requestQuit('os-shutdown');
    },
    openExternal: openExternalSafe,
  });

  const workAction = async (method: 'work.pause' | 'work.resume' | 'work.start') => {
    try {
      const status = await supervisor.rpc(method, {}, { waitForConnectionMs: 3_000 });
      tray.update({ work: status.state });
    } catch (e) {
      presenter.showInfo(TEXTS.workActionFailed, errorText(e));
    }
  };
  const onTrayAction = (action: TrayAction) => {
    switch (action) {
      case 'open':
        windowCtl.show();
        return;
      case 'work-pause':
        void workAction('work.pause');
        return;
      case 'work-resume':
        void workAction('work.resume');
        return;
      case 'work-start':
        void workAction('work.start');
        return;
      case 'quit-ui':
        requestQuit('ui');
        return;
      case 'quit-all':
        requestQuit('all');
        return;
    }
  };
  const tray: TrayController = new TrayController({
    createTray: () => {
      let image = nativeImage.createFromPath(appPaths.trayIcon);
      if (image.isEmpty() && windowIconPath) image = nativeImage.createFromPath(windowIconPath);
      if (image.isEmpty()) {
        log.warn('Tray-Symbol nicht gefunden', { path: appPaths.trayIcon });
        return null;
      }
      if (process.platform !== 'win32') image = image.resize({ width: 22, height: 22 });
      return new Tray(image);
    },
    buildMenu: (items: TrayMenuItem[], onAction) =>
      Menu.buildFromTemplate(
        items.map((i): MenuItemConstructorOptions =>
          i.type === 'separator' ? { type: 'separator' } : { label: i.label, enabled: i.enabled, click: i.action ? () => onAction(i.action as TrayAction) : undefined },
        ),
      ),
    onAction: onTrayAction,
    onError: (e) => log.warn('Tray-Fehler', { error: errorText(e) }),
  });

  // IPC ---------------------------------------------------------------------------------------------------------------
  registerIpcHandlers(
    ipcMain,
    createIpcHandlers({
      supervisor: {
        rpc: (method, params) => supervisor.rpc(method, params as never),
        state: () => supervisor.state(),
        restart: () => supervisor.restart(),
        stop: (reason) => supervisor.stop(reason),
      },
      appVersion,
      platform: process.platform,
      openExternal: (url) => shell.openExternal(url),
      openPath: (p) => shell.openPath(p),
      showItemInFolder: (p) => shell.showItemInFolder(p),
      stat: async (p) => fsp.stat(p).catch(() => null),
      showOpenDialog: (req) => {
        const parent = windowCtl.browserWindow();
        return parent ? dialog.showOpenDialog(parent, req) : dialog.showOpenDialog(req);
      },
      showSaveDialog: (req) => {
        const parent = windowCtl.browserWindow();
        return parent ? dialog.showSaveDialog(parent, req) : dialog.showSaveDialog(req);
      },
      getAutostart: () => autostart.get(),
      setAutostart: async (enabled) => {
        const result = autostart.set(enabled);
        // Keep settings.background.autostart in sync (best effort; the OS registration is the source of truth).
        if (autostart.supported()) {
          void supervisor.rpc('settings.update', { background: { autostart: result } }, { waitForConnectionMs: 0 }).catch(() => undefined);
        }
        return result;
      },
      requestQuit: () => requestQuit('ui'),
      log,
      externalLimiter,
    }),
    (event) => windowCtl.isTrustedSender(event as IpcMainInvokeEvent),
    log,
  );

  // Daemon state and events ------------------------------------------------------------------------------------------
  let lastConnection: DaemonConnectionStateName = supervisor.state().state;
  const onConnected = () => {
    void supervisor
      .rpc('settings.get', undefined, { waitForConnectionMs: 0 })
      .then((s) => background.apply(s))
      .catch((e: unknown) => log.warn('Einstellungen konnten nicht gelesen werden', { error: errorText(e) }));
    void supervisor
      .rpc('work.status', undefined, { waitForConnectionMs: 0 })
      .then((w) => tray.update({ work: w.state }))
      .catch(() => undefined);
  };
  supervisor.onState((s) => {
    windowCtl.send(IPC.daemonState, s);
    tray.update({ connection: s.state, ...(s.state === 'connected' ? {} : { work: null }) });
    if (s.state === 'connected' && lastConnection !== 'connected') onConnected();
    lastConnection = s.state;
  });
  supervisor.onEvent((e: AnyNovaEvent) => {
    windowCtl.send(IPC.event, e);
    switch (e.type) {
      case 'notification':
        presenter.showDaemonNotification(e.payload);
        break;
      case 'settings.updated':
        background.apply(e.payload);
        break;
      case 'work.status':
        tray.update({ work: e.payload.state as WorkCycleState });
        break;
      case 'daemon.status':
        tray.update({ work: e.payload.work });
        break;
      default:
        break;
    }
  });

  // App events -------------------------------------------------------------------------------------------------------
  app.on('second-instance', (_e, argv, _cwd, additionalData) => {
    const data = additionalData as { stopDaemon?: unknown } | null | undefined;
    if (data?.stopDaemon === true || argv.includes('--stop-daemon')) {
      log.info('Installationsprogramm fordert das Beenden an');
      requestQuit('installer');
      return;
    }
    if (argv.includes('--hidden')) return; // autostart while NOVA already runs
    windowCtl.show();
  });
  app.on('activate', () => windowCtl.show());
  if (process.platform !== 'win32') {
    powerMonitor.on('shutdown', () => requestQuit('os-shutdown'));
  }

  const finalizeQuit = async (mode: QuitMode) => {
    windowCtl.saveBoundsNow();
    uiState.flush();
    let keepRunning = background.get().keepRunningWhenUiClosed;
    if (mode === 'ui' && supervisor.state().state === 'connected') {
      // A change made a moment ago may still be in flight as an event: ask the daemon directly.
      keepRunning = (await background.refresh(() => supervisor.rpc('settings.get', undefined, { waitForConnectionMs: 0, timeoutMs: 1_500 }), 1_500)).keepRunningWhenUiClosed;
    }
    const decision = decideDaemonShutdown(mode, keepRunning);
    log.info('Oberfläche wird beendet', { mode, daemonShutdown: decision.shutdown });
    if (decision.shutdown && !(mode === 'os-shutdown' && sessionShutdownSent)) await supervisor.requestShutdown(decision.reason, 5_000);
  };
  app.on('before-quit', (e) => {
    if (quitPhase === 'done') return;
    e.preventDefault();
    if (quitPhase === 'finalizing') return;
    quitPhase = 'finalizing';
    const mode = quitMode ?? 'ui';
    void withTimeout(finalizeQuit(mode), 10_000)
      .catch((err: unknown) => log.error('Beenden fehlgeschlagen', { error: errorText(err) }))
      .finally(() => {
        quitPhase = 'done';
        supervisor.dispose();
        presenter.dispose();
        tray.destroy();
        uiState.flush();
        app.quit();
      });
  });

  // Start ---------------------------------------------------------------------------------------------------------------
  const trayOk = tray.init();
  windowCtl.create();
  if (!cli.hidden || !trayOk) windowCtl.show();
  void supervisor.start().then((s) => log.info('Hintergrunddienst-Verbindung', { state: s.state }));
}

if (cli.stopDaemon) void runStopDaemon();
else startUi();
