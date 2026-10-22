// PreviewService – live previews per project (SPEC §4.8, §6.8).
// Key decisions:
// - browser-dev-server: runs the project's dev command via ProcessManager (kind preview) and waits up to 60 s for a
//   loopback URL in its output (or polls the configured fixed URL). Only http(s) URLs on 127.0.0.1/localhost/[::1]
//   are ever accepted; anything else fails with a German explanation and the process is stopped.
// - browser-static: the built-in static server (static-server.ts) with Host check, random /p/<32hex>/ prefix and
//   PathGuard-based resolution (protected and sensitive files are never served).
// - desktop-run: runs run/dev on request (own window); state 'running' while the process lives.
// - engine-external / none: 'unsupported' with a German explanation (open the project via integrations.open).
// - reloadToken: the factory subscribes to core.bus 'files.changed' and bumps the token of running browser previews
//   (debounced 300 ms) – nobody has to call the service for that.
// - A generation counter per project makes stop() during 'starting' safe (late results are discarded and their
//   process is killed). Every visible change emits 'preview.updated'.
// Honest limit: previews run project code with the user's rights; the iframe sandbox lives in the renderer.
import { statSync } from 'node:fs';
import type { PreviewStatus, Project } from '@shared/schemas';
import type { PreviewService, ProcessHandle, Services } from '../contracts';
import { errorMessage } from '../core/errors';
import { isLocalEndpoint } from '../core/net';
import { probeUrl } from '../checks/check-service';
import { startStaticServer, type StaticServer } from './static-server';

export interface PreviewServiceOptions {
  /** Max wait for the dev server URL (default 60 s). */
  startTimeoutMs?: number;
  /** files.changed debounce (default 300 ms). */
  reloadDebounceMs?: number;
  platform?: NodeJS.Platform;
}

const LOOPBACK_URL_PATTERN = 'https?://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?[^\\s"\'<>]*';
const MSG_STOPPED = 'Die Vorschau ist gestoppt.';
const MSG_STARTING = 'Die Vorschau wird gestartet …';
const MSG_RUNNING = 'Die Vorschau läuft.';

interface Entry {
  status: PreviewStatus;
  generation: number;
  handle: ProcessHandle | null;
  server: StaticServer | null;
  controller: AbortController | null;
  timer: NodeJS.Timeout | null;
}

export function isLoopbackHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && isLocalEndpoint(url) && !u.username && !u.password;
  } catch {
    return false;
  }
}

function cleanUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/[).,;'"\]]+$/, '');
}

function unsupportedMessage(project: Project): string {
  if (project.config.preview.kind === 'none') {
    return 'Für dieses Projekt ist keine Vorschau eingerichtet. In den Projekteinstellungen kann ein Startbefehl (dev) oder eine HTML-Startdatei eingetragen werden.';
  }
  switch (project.kind) {
    case 'unity':
      return 'Unity-Projekte haben keine eingebettete Live-Vorschau. Bitte das Projekt in Unity öffnen („Öffnen mit → Unity“).';
    case 'godot':
      return 'Godot-Projekte haben keine eingebettete Live-Vorschau. Bitte das Projekt im Godot-Editor öffnen („Öffnen mit → Godot“).';
    case 'unreal':
      return 'Unreal-Projekte haben keine eingebettete Live-Vorschau. Bitte das Projekt im Unreal Editor öffnen („Öffnen mit → Unreal“).';
    default:
      return 'Dieses Projekt wird in seinem eigenen Editor geöffnet („Öffnen mit …“); eine eingebettete Live-Vorschau gibt es dafür nicht.';
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function createPreviewService(s: Services, opts: PreviewServiceOptions = {}): PreviewService {
  const log = s.core.log.child('preview');
  const platform = opts.platform ?? s.core.platform;
  const startTimeoutMs = opts.startTimeoutMs ?? 60_000;
  const debounceMs = opts.reloadDebounceMs ?? 300;
  const entries = new Map<string, Entry>();

  function baseStatus(project: Project): PreviewStatus {
    const kind = project.config.preview.kind;
    const unsupported = kind === 'engine-external' || kind === 'none';
    return {
      projectId: project.id,
      kind,
      state: unsupported ? 'unsupported' : 'stopped',
      url: null,
      processId: null,
      message: unsupported ? unsupportedMessage(project) : MSG_STOPPED,
      reloadToken: 0,
    };
  }

  function entryFor(project: Project): Entry {
    let e = entries.get(project.id);
    if (!e) {
      e = { status: baseStatus(project), generation: 0, handle: null, server: null, controller: null, timer: null };
      entries.set(project.id, e);
    }
    return e;
  }

  function emit(e: Entry): PreviewStatus {
    const copy = { ...e.status };
    s.core.bus.emit('preview.updated', copy);
    return { ...copy };
  }

  function set(e: Entry, patch: Partial<PreviewStatus>): PreviewStatus {
    e.status = { ...e.status, ...patch };
    return emit(e);
  }

  async function release(e: Entry): Promise<void> {
    e.generation++;
    if (e.timer) {
      clearTimeout(e.timer);
      e.timer = null;
    }
    const controller = e.controller;
    const handle = e.handle;
    const server = e.server;
    e.controller = null;
    e.handle = null;
    e.server = null;
    if (handle) {
      const info = handle.info();
      if (info.status === 'running') {
        try {
          await s.processes.kill(info.id);
        } catch (err) {
          log.warn('Vorschau-Prozess konnte nicht beendet werden', { error: errorMessage(err) });
        }
      }
    }
    // Aborting also cancels a start() that has not returned its handle yet.
    controller?.abort();
    if (server) {
      try {
        await server.close();
      } catch (err) {
        log.warn('Vorschau-Server konnte nicht geschlossen werden', { error: errorMessage(err) });
      }
    }
  }

  function watchExit(e: Entry, handle: ProcessHandle, generation: number, desktop: boolean): void {
    void handle.exited.then(
      (code) => {
        if (e.generation !== generation || e.handle !== handle) return;
        e.handle = null;
        const ok = code === 0;
        set(e, {
          state: ok ? 'stopped' : 'failed',
          url: null,
          processId: null,
          message: desktop
            ? ok
              ? 'Das Programm wurde beendet.'
              : `Das Programm wurde mit Exit-Code ${code ?? 'unbekannt'} beendet.`
            : ok
              ? 'Der Vorschau-Prozess wurde beendet.'
              : `Der Vorschau-Prozess wurde unerwartet beendet (Exit-Code ${code ?? 'unbekannt'}). Die Ausgabe steht unter „Prozesse“.`,
        });
      },
      () => undefined,
    );
  }

  async function waitForFixedUrl(url: string, handle: ProcessHandle, timeoutMs: number, generation: number, e: Entry): Promise<string | null> {
    let exited = false;
    void handle.exited.then(
      () => (exited = true),
      () => (exited = true),
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !exited && e.generation === generation) {
      const status = await probeUrl(url, 2000);
      if (status !== null) return url;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  async function startDevServer(project: Project, e: Entry, generation: number): Promise<PreviewStatus> {
    const command = project.config.commands.dev ?? project.config.commands.run;
    if (!command) {
      return set(e, { state: 'failed', message: 'Kein Startbefehl (dev) eingerichtet. Er kann in den Projekteinstellungen eingetragen oder mit „Projekt erkennen“ ermittelt werden.' });
    }
    const fixed = project.config.preview.url;
    if (fixed && !isLoopbackHttpUrl(fixed)) {
      return set(e, { state: 'failed', message: 'Die eingetragene Vorschau-Adresse ist keine lokale Adresse. Erlaubt sind nur 127.0.0.1, localhost und [::1].' });
    }
    set(e, { state: 'starting', url: null, processId: null, message: MSG_STARTING });
    const controller = new AbortController();
    e.controller = controller;
    let handle: ProcessHandle;
    try {
      handle = await s.processes.start({ command, cwd: project.path, projectId: project.id, kind: 'preview', signal: controller.signal, urlPattern: LOOPBACK_URL_PATTERN });
    } catch (err) {
      if (e.generation !== generation) return { ...e.status };
      return set(e, { state: 'failed', message: `Der Startbefehl konnte nicht ausgeführt werden: ${errorMessage(err)}` });
    }
    if (e.generation !== generation) {
      try {
        await s.processes.kill(handle.info().id);
      } catch {
        /* already gone */
      }
      return { ...e.status };
    }
    e.handle = handle;
    set(e, { processId: handle.info().id });
    watchExit(e, handle, generation, false);
    const url = fixed ? await waitForFixedUrl(fixed, handle, startTimeoutMs, generation, e) : cleanUrl(await handle.waitForUrl(startTimeoutMs));
    if (e.generation !== generation) return { ...e.status };
    if (!url || !isLoopbackHttpUrl(url)) {
      const info = handle.info();
      const exited = info.status !== 'running';
      await release(e);
      const msg = !url
        ? exited
          ? `Der Startbefehl wurde beendet (Exit-Code ${info.exitCode ?? 'unbekannt'}), bevor eine Adresse erschien. Die Ausgabe steht unter „Prozesse“.`
          : `Innerhalb von ${Math.round(startTimeoutMs / 1000)} Sekunden wurde keine Vorschau-Adresse erkannt. Der Startbefehl muss eine Adresse wie http://127.0.0.1:5173/ ausgeben.`
        : 'Der Startbefehl meldet keine lokale Adresse. Erlaubt sind nur 127.0.0.1, localhost und [::1].';
      e.status = { ...e.status, state: 'failed', url: null, processId: null, message: msg };
      return emit(e);
    }
    return set(e, { state: 'running', url, message: MSG_RUNNING, reloadToken: e.status.reloadToken + 1 });
  }

  function resolveForStatic(project: Project, rel: string): string | null {
    try {
      const r = s.pathGuard.resolve(project.path, rel);
      if (s.pathGuard.isProtected(project.path, r.key) || s.pathGuard.isSensitive(r.rel)) return null;
      return r.abs;
    } catch {
      return null;
    }
  }

  async function startStatic(project: Project, e: Entry, generation: number): Promise<PreviewStatus> {
    const entryFile = (project.config.preview.entry ?? 'index.html').replace(/\\/g, '/').replace(/^\.?\//, '');
    if (entryFile.split('/').some((seg) => seg === '..' || seg.startsWith('.')) || /^[A-Za-z]:|^\//.test(entryFile)) {
      return set(e, { state: 'failed', message: 'Die Startdatei der Vorschau muss eine Datei im Projektordner sein (z. B. „index.html“).' });
    }
    set(e, { state: 'starting', url: null, processId: null, message: MSG_STARTING });
    let server: StaticServer;
    try {
      server = await startStaticServer({ root: project.path, resolve: (rel) => resolveForStatic(project, rel), platform, log });
    } catch (err) {
      if (e.generation !== generation) return { ...e.status };
      return set(e, { state: 'failed', message: `Der Vorschau-Server konnte nicht gestartet werden: ${errorMessage(err)}` });
    }
    if (e.generation !== generation) {
      await server.close();
      return { ...e.status };
    }
    e.server = server;
    const entryAbs = resolveForStatic(project, entryFile);
    let exists = false;
    if (entryAbs) {
      try {
        exists = statSync(entryAbs).isFile();
      } catch {
        exists = false;
      }
    }
    return set(e, {
      state: 'running',
      url: server.url(entryFile),
      processId: null,
      message: exists ? MSG_RUNNING : `Die Vorschau läuft, aber die Startdatei „${entryFile}“ wurde (noch) nicht gefunden.`,
      reloadToken: e.status.reloadToken + 1,
    });
  }

  async function startDesktop(project: Project, e: Entry, generation: number): Promise<PreviewStatus> {
    const command = project.config.commands.run ?? project.config.commands.dev;
    if (!command) {
      return set(e, { state: 'failed', message: 'Kein Startbefehl (run) eingerichtet. Er kann in den Projekteinstellungen eingetragen oder mit „Projekt erkennen“ ermittelt werden.' });
    }
    set(e, { state: 'starting', url: null, processId: null, message: 'Das Programm wird gestartet …' });
    const controller = new AbortController();
    e.controller = controller;
    let handle: ProcessHandle;
    try {
      handle = await s.processes.start({ command, cwd: project.path, projectId: project.id, kind: 'preview', signal: controller.signal });
    } catch (err) {
      if (e.generation !== generation) return { ...e.status };
      return set(e, { state: 'failed', message: `Das Programm konnte nicht gestartet werden: ${errorMessage(err)}` });
    }
    if (e.generation !== generation) {
      try {
        await s.processes.kill(handle.info().id);
      } catch {
        /* already gone */
      }
      return { ...e.status };
    }
    e.handle = handle;
    watchExit(e, handle, generation, true);
    return set(e, {
      state: 'running',
      processId: handle.info().id,
      url: null,
      message: 'Das Programm läuft in einem eigenen Fenster. Änderungen werden nach einem Neustart der Vorschau sichtbar.',
    });
  }

  function scheduleReload(projectId: string): void {
    const e = entries.get(projectId);
    if (!e || e.status.state !== 'running' || (e.status.kind !== 'browser-dev-server' && e.status.kind !== 'browser-static')) return;
    if (e.timer) clearTimeout(e.timer);
    e.timer = setTimeout(() => {
      e.timer = null;
      if (e.status.state !== 'running') return;
      set(e, { reloadToken: e.status.reloadToken + 1 });
    }, debounceMs);
    e.timer.unref?.();
  }

  // Subscribing to the bus inside the factory is allowed (core).
  s.core.bus.on('files.changed', (payload) => {
    try {
      scheduleReload(payload.projectId);
    } catch (err) {
      log.warn('Vorschau-Neuladen fehlgeschlagen', { error: errorMessage(err) });
    }
  });

  async function stopInternal(projectId: string): Promise<PreviewStatus | null> {
    const e = entries.get(projectId);
    if (!e) return null;
    await release(e);
    if (e.status.state === 'unsupported') return { ...e.status };
    if (e.status.state === 'stopped' && !e.status.url && !e.status.processId) return { ...e.status };
    e.status = { ...e.status, state: 'stopped', url: null, processId: null, message: MSG_STOPPED };
    return emit(e);
  }

  return {
    status(projectId) {
      const project = s.projects.require(projectId);
      const e = entries.get(projectId);
      if (!e) return baseStatus(project);
      const idle = e.status.state === 'stopped' || e.status.state === 'unsupported' || e.status.state === 'failed';
      if (idle && e.status.kind !== project.config.preview.kind) {
        // Configuration changed since the last start: report the new kind.
        e.status = { ...baseStatus(project), reloadToken: e.status.reloadToken };
      }
      return { ...e.status };
    },

    async start(projectId) {
      const project = s.projects.require(projectId);
      const e = entryFor(project);
      const kind = project.config.preview.kind;
      if ((e.status.state === 'running' || e.status.state === 'starting') && e.status.kind === kind) return { ...e.status };
      await release(e);
      const generation = e.generation;
      e.status = { ...baseStatus(project), reloadToken: e.status.reloadToken };
      if (kind === 'engine-external' || kind === 'none') return emit(e);
      if (!isDir(project.path)) {
        return set(e, { state: 'failed', message: 'Der Projektordner wurde nicht gefunden. In den Projekteinstellungen kann der neue Ort eingetragen werden.' });
      }
      try {
        if (kind === 'browser-static') return await startStatic(project, e, generation);
        if (kind === 'browser-dev-server') return await startDevServer(project, e, generation);
        return await startDesktop(project, e, generation);
      } catch (err) {
        log.warn('Vorschau konnte nicht gestartet werden', { projectId, error: errorMessage(err) });
        if (e.generation !== generation) return { ...e.status };
        await release(e);
        e.status = { ...e.status, state: 'failed', url: null, processId: null, message: `Die Vorschau konnte nicht gestartet werden: ${errorMessage(err)}` };
        return emit(e);
      }
    },

    async stop(projectId) {
      const stopped = await stopInternal(projectId);
      if (stopped) return stopped;
      const project = s.projects.get(projectId);
      if (!project) {
        return { projectId, kind: 'none', state: 'stopped', url: null, processId: null, message: MSG_STOPPED, reloadToken: 0 };
      }
      return baseStatus(project);
    },

    async stopAll() {
      await Promise.all([...entries.keys()].map((id) => stopInternal(id).catch((err) => log.warn('Vorschau konnte nicht gestoppt werden', { projectId: id, error: errorMessage(err) }))));
    },
  };
}
