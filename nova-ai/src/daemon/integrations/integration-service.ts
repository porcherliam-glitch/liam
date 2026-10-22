// IntegrationService (contract: src/daemon/contracts.ts; SPEC §4.9, §6.9): detection, manual paths, installs (winget,
// only after an 'install' approval) and "open in external program" for the built-in and registered modules.
// Key decisions:
// - Status per id is cached 10 minutes (memory + table `integrations.last_status`, which also seeds the cache after a
//   daemon restart); detection is single-flight per id and runs at most 4 modules in parallel.
// - Manual paths (table `integrations.manual_path`) are passed to the module as ctx.manualPath and win when they work.
//   resolvePath(): manual path first, then the detected path; with a version (Unity) only the exactly matching
//   installation – never a different editor.
// - requestInstall(): Windows + winget only. The approval subject is the exact §6.9 winget command; consequences say
//   that approving accepts the license terms and that a UAC prompt may need someone at the PC. After approval (lazy
//   s.approvals.onDecision subscription; plus a core.bus 'approval.updated' listener so decisions made before any
//   IntegrationService call – e.g. after a daemon restart – are handled too, de-duplicated per approval id and made
//   one-shot by consume()) the command runs via s.processes.run (kind 'install') inside an operation, then
//   refreshWindowsPath(true), re-detection, 'integrations.updated' and a notification. The command is always rebuilt
//   from the fixed package table and must match the approval's fingerprint – stored details are never executed.
// - open(): resolves the file through PathGuard (inside the project), lets the module choose program + argv and spawns it
//   detached as a user action. GUI programs are started with windowsHide:false (hiding them would hide their window);
//   .cmd shims go through cmd.exe only with strictly validated arguments (same rule as core/exec execTool).
// - Emits 'integrations.updated' (full cached list) after list(refresh), setPath, installs and whenever a detection
//   changes availability/version/path.
import { spawn } from 'node:child_process';
import { IntegrationStatusSchema, type Approval, type IntegrationStatus } from '@shared/schemas';
import type { CommandResult, IntegrationDetectContext, IntegrationModule, IntegrationService, Services } from '../contracts';
import { execTool, findExecutable as coreFindExecutable } from '../core/exec';
import { buildChildEnv, refreshWindowsPath } from '../core/child-env';
import { NovaError, errorMessage, isAbortError, notFound } from '../core/errors';
import { redactString } from '../core/redact';
import { createBuiltinModules } from './builtins';
import { nodeFs, pathFor, type DetectResult, type FsLike } from './helpers';
import { WINGET_PACKAGES, interpretWingetExit, wingetCommand, type WingetOutcome } from './winget';

export const INTEGRATION_CACHE_MS = 10 * 60_000;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const SAFE_SHIM_ARG = /^[A-Za-z0-9_.,:/\\=@+ -]*$/;
const HANDLED_MAX = 1000;

export type SpawnDetached = (file: string, args: string[], opts: { cwd: string }) => Promise<void>;

export interface IntegrationServiceOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  fs?: FsLike;
  run?: IntegrationDetectContext['run'];
  findExecutable?: (name: string) => Promise<string | null>;
  spawnDetached?: SpawnDetached;
  /** Re-reads the Windows PATH after installs (default core/child-env refreshWindowsPath). */
  refreshPath?: (force: boolean) => Promise<unknown>;
  cacheMs?: number;
  installTimeoutMs?: number;
  /** Replace the built-in modules (tests). */
  modules?: IntegrationModule[];
  detectConcurrency?: number;
}

export interface IntegrationServiceImpl extends IntegrationService {
  /** Resolves when no installation is running (tests, shutdown). */
  whenIdle(): Promise<void>;
  /** Registered module ids in display order. */
  ids(): string[];
}

interface IntegrationRow {
  id: string;
  manual_path: string | null;
  last_status: string | null;
}

/** Installs of one package that refresh several integrations. */
const RELATED: Record<string, string[]> = { node: ['npm'], npm: ['node'] };

function createDefaultSpawn(platform: NodeJS.Platform): SpawnDetached {
  return (file, args, opts) =>
    new Promise<void>((resolve, reject) => {
      let cmd = file;
      let argv = args;
      let verbatim = false;
      let hide = false;
      if (platform === 'win32' && /\.(cmd|bat)$/i.test(file)) {
        for (const a of [file, ...args]) {
          if (!SAFE_SHIM_ARG.test(a)) {
            reject(
              new NovaError('VALIDATION', 'Der Pfad enthält Zeichen, die über eine .cmd-Datei nicht sicher übergeben werden können. Bitte unter „Werkzeuge“ die Programmdatei (.exe) eintragen.', {
                severity: 'warning',
              }),
            );
            return;
          }
        }
        cmd = process.env.ComSpec ?? 'cmd.exe';
        argv = ['/d', '/s', '/c', `"${[file, ...args].map((a) => `"${a}"`).join(' ')}"`];
        verbatim = true;
        hide = true; // only the cmd.exe console is hidden; the started program opens its own window
      }
      let child;
      try {
        child = spawn(cmd, argv, {
          cwd: opts.cwd,
          env: buildChildEnv({}, platform), // also drops ELECTRON_RUN_AS_NODE (Electron apps like VS Code would start as Node)
          detached: true,
          stdio: 'ignore',
          windowsHide: hide,
          windowsVerbatimArguments: verbatim,
        });
      } catch (e) {
        reject(new NovaError('COMMAND_FAILED', `Das Programm konnte nicht gestartet werden: ${errorMessage(e)}`, { severity: 'warning' }));
        return;
      }
      child.once('error', (e: NodeJS.ErrnoException) => {
        reject(
          e.code === 'ENOENT'
            ? new NovaError('TOOL_MISSING', 'Das Programm wurde nicht gefunden. Bitte unter „Werkzeuge“ den Pfad prüfen.', { severity: 'warning' })
            : new NovaError('COMMAND_FAILED', `Das Programm konnte nicht gestartet werden: ${errorMessage(e)}`, { severity: 'warning' }),
        );
      });
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
}

async function pool<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k]);
    }
  });
  await Promise.all(workers);
  return out;
}

export function createIntegrationService(s: Services, opts: IntegrationServiceOptions = {}): IntegrationServiceImpl {
  const core = s.core;
  const log = core.log.child('integrations');
  const platform = opts.platform ?? core.platform;
  const env = opts.env ?? (process.env as Record<string, string | undefined>);
  const fs = opts.fs ?? nodeFs;
  const cacheMs = opts.cacheMs ?? INTEGRATION_CACHE_MS;
  const installTimeoutMs = opts.installTimeoutMs ?? 30 * 60_000;
  const concurrency = opts.detectConcurrency ?? 4;
  const spawnDetached = opts.spawnDetached ?? createDefaultSpawn(platform);
  const refreshPath = opts.refreshPath ?? ((force: boolean) => refreshWindowsPath(force));
  const findExecutable = opts.findExecutable ?? ((name: string) => coreFindExecutable(name, platform));
  const run: IntegrationDetectContext['run'] =
    opts.run ??
    (async (file, args, timeoutMs) => {
      try {
        const r = await execTool(file, args, { timeoutMs, platform, env: buildChildEnv({ LC_ALL: 'C', LANG: 'C' }, platform) });
        return { code: r.timedOut ? null : r.code, stdout: r.stdout, stderr: r.stderr };
      } catch (e) {
        return { code: null, stdout: '', stderr: errorMessage(e) };
      }
    });

  const modules = new Map<string, IntegrationModule>();
  for (const m of opts.modules ?? createBuiltinModules({ fs, platform })) modules.set(m.id, m);

  const cache = new Map<string, IntegrationStatus>();
  const manualPaths = new Map<string, string>();
  const inflight = new Map<string, Promise<{ status: IntegrationStatus; changed: boolean }>>();
  const installing = new Map<string, Promise<void>>();
  const handled = new Set<string>();
  let loaded = false;
  let decisionUnsub: (() => void) | null = null;

  const ensureLoaded = (): void => {
    if (loaded) return;
    loaded = true;
    const rows = core.db.all<IntegrationRow>('SELECT id, manual_path, last_status FROM integrations');
    const now = core.clock.now();
    for (const r of rows) {
      if (r.manual_path) manualPaths.set(r.id, r.manual_path);
      if (!r.last_status || !modules.has(r.id)) continue;
      try {
        const parsed = IntegrationStatusSchema.safeParse(JSON.parse(r.last_status));
        if (parsed.success && now - parsed.data.checkedAt < cacheMs && parsed.data.manualPath === (r.manual_path ?? null)) cache.set(r.id, parsed.data);
      } catch {
        /* ignore corrupt rows */
      }
    }
  };

  const requireModule = (id: string): IntegrationModule => {
    const m = modules.get(id);
    if (!m) throw notFound('Das Werkzeug', id);
    return m;
  };

  const cachedList = (): IntegrationStatus[] => [...modules.keys()].map((id) => cache.get(id)).filter((x): x is IntegrationStatus => !!x);

  const emitUpdated = (): void => {
    core.bus.emit('integrations.updated', cachedList());
  };

  const persistStatus = (status: IntegrationStatus): void => {
    try {
      core.db.run(
        'INSERT INTO integrations(id, manual_path, last_status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET last_status = excluded.last_status, updated_at = excluded.updated_at',
        [status.id, manualPaths.get(status.id) ?? null, JSON.stringify(status), core.clock.now()],
      );
    } catch (e) {
      log.warn('Werkzeugstatus konnte nicht gespeichert werden', { id: status.id, error: errorMessage(e) });
    }
  };

  const buildStatus = (mod: IntegrationModule, result: DetectResult, manualPath: string | null): IntegrationStatus => {
    let hint: IntegrationStatus['installHint'] = null;
    try {
      hint = mod.installHint(platform);
    } catch {
      hint = null;
    }
    const candidate: IntegrationStatus = {
      id: mod.id,
      name: mod.name,
      category: mod.category,
      available: !!result.available,
      version: result.available ? (result.version ?? null) : null,
      path: result.available ? (result.path ?? null) : null,
      manualPath,
      installations: Array.isArray(result.installations) ? result.installations : [],
      canOpen: typeof mod.open === 'function' && !!result.available,
      message: redactString(result.message || (result.available ? `${mod.name} ist verfügbar.` : `${mod.name} wurde nicht gefunden.`)),
      installHint: hint,
      checkedAt: core.clock.now(),
    };
    const parsed = IntegrationStatusSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    log.warn('Ungültiges Prüfergebnis eines Werkzeugmoduls', { id: mod.id });
    return { ...candidate, available: false, version: null, path: null, installations: [], canOpen: false, message: `Die Prüfung von „${mod.name}“ hat ein ungültiges Ergebnis geliefert.` };
  };

  const detectOne = (id: string, force: boolean): Promise<{ status: IntegrationStatus; changed: boolean }> => {
    ensureLoaded();
    const mod = requireModule(id);
    const cached = cache.get(id);
    if (!force && cached && core.clock.now() - cached.checkedAt < cacheMs) return Promise.resolve({ status: cached, changed: false });
    const running = inflight.get(id);
    if (running) return running;
    const p = (async () => {
      const manualPath = manualPaths.get(id) ?? null;
      const ctx: IntegrationDetectContext = { platform, manualPath, run, findExecutable, env };
      let result: DetectResult;
      try {
        result = await mod.detect(ctx);
      } catch (e) {
        log.warn('Werkzeugprüfung fehlgeschlagen', { id, error: errorMessage(e) });
        result = { available: false, version: null, path: null, message: `Die Prüfung von „${mod.name}“ ist fehlgeschlagen: ${errorMessage(e)}`, installations: [] };
      }
      const status = buildStatus(mod, result, manualPath);
      const prev = cache.get(id);
      cache.set(id, status);
      persistStatus(status);
      const changed = !prev || prev.available !== status.available || prev.version !== status.version || prev.path !== status.path;
      return { status, changed };
    })().finally(() => inflight.delete(id));
    inflight.set(id, p);
    return p;
  };

  // ------------------------------------------------------------------------------------------------- installs

  const rememberHandled = (approvalId: string): boolean => {
    if (handled.has(approvalId)) return false;
    handled.add(approvalId);
    if (handled.size > HANDLED_MAX) handled.delete(handled.values().next().value as string);
    return true;
  };

  const approvalRequest = (mod: IntegrationModule, command: string) => ({
    projectId: null,
    taskId: null,
    runId: null,
    kind: 'install' as const,
    title: `„${mod.name}“ installieren?`,
    action: `NOVA möchte „${mod.name}“ mit winget (Windows-Paketmanager) installieren. Ausgeführt wird genau dieser Befehl:\n${command}`,
    consequences:
      'Mit der Freigabe werden die Lizenzbedingungen des Pakets und der winget-Quelle akzeptiert. Die Installation verändert das System (Programmdateien, Startmenü, PATH). ' +
      'Windows kann eine Sicherheitsabfrage der Benutzerkontensteuerung (UAC) anzeigen – dann muss jemand am PC zustimmen, sonst bricht die Installation ab. NOVA fordert selbst keine Administratorrechte an.',
    subject: command,
    details: { integrationId: mod.id, wingetId: WINGET_PACKAGES[mod.id]?.id ?? null, command },
  });

  const notifySafe = (input: Parameters<Services['notifications']['notify']>[0]): void => {
    try {
      s.notifications.notify(input);
    } catch (e) {
      log.warn('Benachrichtigung fehlgeschlagen', { error: errorMessage(e) });
    }
  };

  const executeInstall = async (mod: IntegrationModule, command: string): Promise<void> => {
    const id = mod.id;
    log.info('Installation gestartet', { id });
    let result: CommandResult | null = null;
    let outcome: WingetOutcome;
    try {
      const op = core.operations.run({ kind: 'install', title: `„${mod.name}“ wird installiert`, projectId: null, cancellable: true }, async (ctx) => {
        ctx.progress(null, 'winget lädt das Paket herunter und installiert es …');
        return s.processes.run({ command, cwd: core.paths.root, kind: 'install', projectId: null, taskId: null, timeoutMs: installTimeoutMs, signal: ctx.signal });
      });
      result = await op.result;
      outcome = interpretWingetExit(result.exitCode, { timedOut: result.timedOut, cancelled: result.cancelled });
    } catch (e) {
      outcome = isAbortError(e)
        ? { ok: false, message: 'Die Installation wurde abgebrochen.', rebootRequired: false }
        : { ok: false, message: `Die Installation konnte nicht gestartet werden: ${errorMessage(e)}`, rebootRequired: false };
    }
    try {
      await refreshPath(true);
    } catch (e) {
      log.debug('PATH konnte nicht neu gelesen werden', { error: errorMessage(e) });
    }
    let status: IntegrationStatus | null = null;
    for (const target of [id, ...(RELATED[id] ?? [])]) {
      if (!modules.has(target)) continue;
      try {
        const r = await detectOne(target, true);
        if (target === id) status = r.status;
      } catch (e) {
        log.warn('Werkzeugprüfung nach Installation fehlgeschlagen', { id: target, error: errorMessage(e) });
      }
    }
    emitUpdated();
    const dedupeKey = `integration-install:${id}`;
    if (outcome.ok) {
      log.info('Installation abgeschlossen', { id, available: status?.available ?? false });
      core.errors.resolveWhere({ dedupeKey });
      if (status?.available && !outcome.rebootRequired) {
        notifySafe({ level: 'success', category: 'info', title: `„${mod.name}“ wurde installiert`, body: 'Das Werkzeug steht jetzt zur Verfügung.', projectId: null, taskId: null });
      } else if (outcome.rebootRequired) {
        notifySafe({ level: 'warning', category: 'info', title: `„${mod.name}“: Neustart nötig`, body: 'Windows muss neu gestartet werden, damit die Installation abgeschlossen ist.', projectId: null, taskId: null });
      } else {
        notifySafe({
          level: 'warning',
          category: 'info',
          title: `„${mod.name}“ wurde installiert, aber noch nicht gefunden`,
          body: 'Eventuell ist ein Neustart von NOVA oder Windows nötig. Den Status zeigt die Seite „Werkzeuge“.',
          projectId: null,
          taskId: null,
        });
      }
      return;
    }
    log.warn('Installation fehlgeschlagen', { id, message: outcome.message, exitCode: result?.exitCode ?? null });
    let url: string | null = null;
    try {
      url = mod.installHint(platform)?.url ?? null;
    } catch {
      url = null;
    }
    core.errors.report({
      code: 'TOOL_MISSING',
      severity: 'warning',
      title: `Installation von „${mod.name}“ fehlgeschlagen`,
      whatHappened: outcome.message,
      attempted: ['Installation mit winget'],
      projectSafe: true,
      autoFixable: false,
      userAction: `„${mod.name}“ manuell installieren${url ? ` (${url})` : ''} oder die Installation unter „Werkzeuge“ erneut anfordern.`,
      details: result ? result.output.slice(-4000) : null,
      dedupeKey,
    });
    notifySafe({ level: 'error', category: 'error', title: `Installation von „${mod.name}“ fehlgeschlagen`, body: 'Details stehen unter „Werkzeuge“ und „Fehler“.', projectId: null, taskId: null });
  };

  const startInstall = (mod: IntegrationModule, command: string): void => {
    if (installing.has(mod.id)) return;
    const p = executeInstall(mod, command)
      .catch((e) => log.error('Installation abgebrochen', { id: mod.id, error: errorMessage(e) }))
      .finally(() => installing.delete(mod.id));
    installing.set(mod.id, p);
  };

  const onApproval = (a: Approval): void => {
    if (a.kind !== 'install' || (a.status !== 'approved' && a.status !== 'denied')) return;
    const id = typeof a.details?.integrationId === 'string' ? a.details.integrationId : null;
    if (!id) return;
    const mod = modules.get(id);
    const pkg = WINGET_PACKAGES[id];
    if (!mod || !pkg) return;
    const command = wingetCommand(pkg);
    let fp: string;
    try {
      fp = s.approvals.fingerprint('install', null, command);
    } catch {
      return;
    }
    if (fp !== a.fingerprint) return; // only exactly the command we asked for
    if (!rememberHandled(a.id)) return;
    if (a.status === 'denied') {
      log.info('Installation abgelehnt', { id });
      try {
        s.approvals.acknowledgeDenial(a.id);
      } catch (e) {
        log.debug('Ablehnung konnte nicht quittiert werden', { error: errorMessage(e) });
      }
      return;
    }
    try {
      s.approvals.consume(a.id); // atomic one-shot: never installs twice for one approval
    } catch (e) {
      log.info('Freigabe bereits verwendet – keine erneute Installation', { id, error: errorMessage(e) });
      return;
    }
    startInstall(mod, command);
  };

  // Subscribing to the core bus inside the factory is allowed (the bus is core).
  core.bus.on('approval.updated', onApproval);

  const ensureSubscribed = (): void => {
    if (decisionUnsub) return;
    try {
      decisionUnsub = s.approvals.onDecision(onApproval);
    } catch (e) {
      log.debug('Freigabedienst noch nicht verfügbar', { error: errorMessage(e) });
    }
  };

  // --------------------------------------------------------------------------------------------------- service

  const service: IntegrationServiceImpl = {
    register(module) {
      if (!module || typeof module.id !== 'string' || !ID_RE.test(module.id)) {
        throw new NovaError('VALIDATION', 'Ungültige Kennung für ein Werkzeugmodul.', { severity: 'warning' });
      }
      if (typeof module.detect !== 'function' || typeof module.installHint !== 'function') {
        throw new NovaError('VALIDATION', 'Ein Werkzeugmodul braucht detect() und installHint().', { severity: 'warning' });
      }
      modules.set(module.id, module);
      cache.delete(module.id);
    },

    async list(refresh = false) {
      ensureSubscribed();
      ensureLoaded();
      const results = await pool([...modules.keys()], concurrency, (id) => detectOne(id, refresh));
      if (refresh || results.some((r) => r.changed)) emitUpdated();
      return results.map((r) => r.status);
    },

    async get(id, refresh = false) {
      ensureSubscribed();
      const r = await detectOne(id, refresh);
      if (r.changed) emitUpdated();
      return r.status;
    },

    async resolvePath(id, o = {}) {
      if (!modules.has(id)) return null;
      ensureLoaded();
      const version = o.version ?? null;
      const manual = manualPaths.get(id);
      if (!version && manual && fs.exists(manual)) return manual;
      let status: IntegrationStatus;
      try {
        status = (await detectOne(id, false)).status;
      } catch (e) {
        log.warn('Werkzeugpfad konnte nicht ermittelt werden', { id, error: errorMessage(e) });
        return null;
      }
      if (version) {
        const wanted = version.trim().toLowerCase();
        return status.installations.find((i) => i.version.toLowerCase() === wanted)?.path ?? null;
      }
      return status.available ? status.path : null;
    },

    async setPath(id, path) {
      ensureSubscribed();
      ensureLoaded();
      requireModule(id);
      let value: string | null = null;
      if (path !== null) {
        value = path.trim().replace(/^"(.*)"$/, '$1');
        const p = pathFor(platform);
        if (!value || !p.isAbsolute(value)) throw new NovaError('VALIDATION', 'Bitte den vollständigen Pfad zur Programmdatei angeben.', { severity: 'warning' });
        if (/[\u0000-\u001f]/.test(value)) throw new NovaError('VALIDATION', 'Der Pfad enthält ungültige Zeichen.', { severity: 'warning' });
        if (!fs.exists(value)) throw new NovaError('VALIDATION', `Die Datei wurde nicht gefunden: ${value}`, { severity: 'warning' });
        if (fs.isDir(value)) throw new NovaError('VALIDATION', 'Bitte die Programmdatei auswählen, nicht einen Ordner.', { severity: 'warning' });
        value = p.normalize(value);
      }
      core.db.run(
        'INSERT INTO integrations(id, manual_path, last_status, updated_at) VALUES (?, ?, NULL, ?) ON CONFLICT(id) DO UPDATE SET manual_path = excluded.manual_path, updated_at = excluded.updated_at',
        [id, value, core.clock.now()],
      );
      if (value) manualPaths.set(id, value);
      else manualPaths.delete(id);
      cache.delete(id);
      log.info(value ? 'Manueller Werkzeugpfad gesetzt' : 'Manueller Werkzeugpfad entfernt', { id });
      const { status } = await detectOne(id, true);
      emitUpdated();
      return status;
    },

    async requestInstall(id) {
      ensureSubscribed();
      const mod = requireModule(id);
      let url: string | null = null;
      try {
        url = mod.installHint(platform)?.url ?? null;
      } catch {
        url = null;
      }
      if (platform !== 'win32') {
        return { approvalId: null, message: `Automatische Installationen gibt es nur unter Windows (winget). Bitte „${mod.name}“ manuell installieren${url ? `: ${url}` : '.'}` };
      }
      const pkg = WINGET_PACKAGES[id];
      if (!pkg) {
        if (id === 'playwright') {
          return { approvalId: null, message: 'Playwright wird im jeweiligen Projekt installiert (npm install -D @playwright/test). NOVA installiert es nicht systemweit.' };
        }
        return { approvalId: null, message: `„${mod.name}“ kann nicht automatisch installiert werden.${url ? ` Download: ${url}` : ''}` };
      }
      if (installing.has(id)) return { approvalId: null, message: `„${mod.name}“ wird bereits installiert.` };
      const current = (await detectOne(id, true)).status;
      if (current.available) {
        return { approvalId: null, message: `„${mod.name}“ ist bereits installiert${current.version ? ` (Version ${current.version})` : ''}.` };
      }
      if (modules.has('winget')) {
        const winget = (await detectOne('winget', false)).status;
        if (!winget.available) {
          return {
            approvalId: null,
            message: `winget (App-Installer) wurde nicht gefunden. Bitte „App-Installer“ aus dem Microsoft Store installieren oder „${mod.name}“ manuell installieren${url ? `: ${url}` : '.'}`,
          };
        }
      }
      const command = wingetCommand(pkg);
      const request = approvalRequest(mod, command);
      let check = s.approvals.check(request);
      if (check.state === 'denied') {
        // The user explicitly asks again: settle the old denial and create a fresh request.
        s.approvals.acknowledgeDenial(check.approval.id);
        check = s.approvals.check(request);
      }
      if (check.state === 'pending') {
        log.info('Installationsfreigabe angefordert', { id, approvalId: check.approval.id });
        return { approvalId: check.approval.id, message: `Für die Installation von „${mod.name}“ wurde eine Freigabe angelegt. Bitte unter „Freigaben“ entscheiden.` };
      }
      if (check.state === 'approved') {
        if (check.approval && !check.viaRule) {
          if (!rememberHandled(check.approval.id)) return { approvalId: check.approval.id, message: `„${mod.name}“ wird bereits installiert.` };
          s.approvals.consume(check.approval.id);
        }
        startInstall(mod, command);
        return { approvalId: check.approval?.id ?? null, message: `Die Installation von „${mod.name}“ wurde gestartet (bereits freigegeben).` };
      }
      return { approvalId: check.approval.id, message: `Die Installation von „${mod.name}“ wurde abgelehnt.` };
    },

    async open(input) {
      const mod = requireModule(input.id);
      const project = s.projects.get(input.projectId);
      if (!project) throw notFound('Das Projekt', input.projectId);
      if (!fs.exists(project.path)) throw new NovaError('VALIDATION', 'Der Projektordner wurde nicht gefunden. Wurde er verschoben oder gelöscht?', { severity: 'warning' });
      if (typeof mod.open !== 'function') throw new NovaError('VALIDATION', `„${mod.name}“ kann keine Projekte oder Dateien öffnen.`, { severity: 'warning' });
      let file: string | undefined;
      if (input.path !== undefined && input.path !== '') file = s.pathGuard.resolve(project.path, input.path).abs;
      if (input.line !== undefined && (!Number.isInteger(input.line) || input.line < 1)) {
        throw new NovaError('VALIDATION', 'Die Zeilennummer muss 1 oder größer sein.', { severity: 'warning' });
      }
      const status = (await detectOne(input.id, false)).status;
      if (!status.available || !status.path) {
        throw new NovaError('TOOL_MISSING', `„${mod.name}“ ist nicht installiert oder wurde nicht gefunden.`, {
          severity: 'warning',
          userAction: 'Unter „Werkzeuge“ installieren oder den Pfad zur Programmdatei eintragen.',
        });
      }
      const target = mod.open({
        executable: status.path,
        projectRoot: project.path,
        file,
        line: input.line,
        engineVersion: project.config.engineVersion,
        installations: status.installations,
      });
      log.info('Externes Programm wird geöffnet', { id: mod.id, projectId: project.id });
      await spawnDetached(target.file, target.args, { cwd: project.path });
    },

    async whenIdle() {
      while (installing.size > 0) await Promise.all([...installing.values()]);
    },

    ids() {
      return [...modules.keys()];
    },
  };
  return service;
}
