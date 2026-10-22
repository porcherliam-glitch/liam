// CheckService – runs tests/builds/lint/typecheck/e2e/security/package/runtime checks of a project and records the
// REAL results (table check_runs). SPEC §4.8 + §6.8.
// Key decisions:
// - Operation-free: the CheckRun itself is the progress object (status running → final), every change emits
//   'check.updated'. `start()` returns immediately (RPC checks.run), `run()` awaits (agents, work cycle).
// - One check per project+kind at a time: start() answers CONFLICT while one runs or is queued; run() queues behind it.
// - Install-first rule: missing node_modules (package.json with dependencies), obj/ (.NET) or .venv (Python) → the
//   configured install command runs first. Installs triggered by agents/system go through CommandPolicy and
//   ApprovalService (network rules); user-triggered installs do not. Failure → status error "Abhängigkeiten konnten
//   nicht installiert werden".
// - Status comes from exit codes; parsers only add counts and failure locations. A test run without any test is
//   'skipped' (never reported as passed). Unknown command (exit 127 POSIX / 9009 cmd.exe) → error with a German hint.
// - dotnet test gets `--logger trx --results-directory <dataDir>/check-results/<id>` (English output via env);
//   Unity uses the editor matching ProjectSettings/ProjectVersion.txt and its NUnit XML results file.
// - Runtime check: starts run/dev up to 30 s; passes when a web URL on loopback answers 2xx or the process is still
//   alive after 10 s (web: 30 s) or ends by itself with exit code 0; the process tree is always killed afterwards.
// - Output tail ≤ 200 lines, ANSI-free and redacted. Stale 'running' rows of a previous daemon become 'error'.
// Honest limit: checks run project code with the user's Windows rights (no sandbox).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, lstatSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { isAbsolute, join } from 'node:path';
import type { CheckKind, CheckRun, CheckStatus, ProcessKind, Project } from '@shared/schemas';
import type { CheckService, Services } from '../contracts';
import { NovaError, conflict, errorMessage, isAbortError, notFound } from '../core/errors';
import { commandNotFound } from '../core/exec';
import { newId } from '../core/ids';
import { isLocalEndpoint } from '../core/net';
import { redactString } from '../core/redact';
import { removeDirWithRetry } from '../core/fs-atomic';
import { isUnityBatchCommand, isUnityProjectOpen, readUnityVersion, replaceUnityExecutable, unityResultsPath } from '../projects/unity';
import { getCheck, insertCheck, rowToCheck, updateCheck, type CheckRow } from './check-store';
import { findArtifacts } from './glob';
import { failureSignature, mergeParsed, parseCheckOutput, parseNunitXml, parseTrx, stripAnsi, type ParseContext, type ParsedCheck } from './parsers';

export interface CheckServiceOptions {
  platform?: NodeJS.Platform;
  /** Runtime check timings (tests shorten them). */
  runtime?: { aliveMs?: number; webMaxMs?: number; pollMs?: number };
}

type Actor = 'user' | 'agent' | 'system';

const PROCESS_KIND: Record<CheckKind, ProcessKind> = {
  test: 'test',
  e2e: 'test',
  build: 'build',
  lint: 'build',
  typecheck: 'build',
  security: 'build',
  package: 'build',
  runtime: 'dev_server',
};

const SETUP_HINT = ' Befehle lassen sich in den Projekteinstellungen eintragen oder mit „Projekt erkennen“ ermitteln.';
const NO_COMMAND: Record<CheckKind, string> = {
  test: 'Kein Testbefehl eingerichtet.' + SETUP_HINT,
  build: 'Kein Build-Befehl eingerichtet.' + SETUP_HINT,
  lint: 'Kein Lint-Befehl eingerichtet.' + SETUP_HINT,
  typecheck: 'Kein Befehl für die Typprüfung eingerichtet.' + SETUP_HINT,
  e2e: 'Kein Befehl für End-to-End-Tests eingerichtet.' + SETUP_HINT,
  security: 'Kein Befehl für die Sicherheitsprüfung eingerichtet.' + SETUP_HINT,
  package: 'Kein Befehl zum Erstellen eines Pakets eingerichtet.' + SETUP_HINT,
  runtime: 'Kein Startbefehl (run oder dev) eingerichtet.' + SETUP_HINT,
};

const CANCELLED_MSG = 'Die Prüfung wurde abgebrochen.';
const INSTALL_FAILED = 'Abhängigkeiten konnten nicht installiert werden';
const TAIL_LINES = 200;
const LOOPBACK_URL_PATTERN = 'https?://(?:localhost|127\\.0\\.0\\.1|\\[::1\\])(?::\\d+)?[^\\s"\'<>]*';
const DEP_SKIP = new Set(['node_modules', '.git', 'bin', 'obj', 'dist', 'out', 'Library', 'Temp', '.venv', 'venv', '__pycache__']);

function tail(text: string): string {
  const lines = stripAnsi(text).split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  return redactString(lines.slice(-TAIL_LINES).join('\n'));
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function firstToken(command: string): string {
  const t = command.trim();
  if (t.startsWith('"')) return t.slice(1, Math.max(1, t.indexOf('"', 1)));
  return t.split(/\s+/)[0] ?? t;
}

/** Directories (depth ≤ 3) that contain a .NET project file. */
function dotnetProjectDirs(root: string): string[] {
  const out: string[] = [];
  let visited = 0;
  const walk = (dir: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (++visited > 3000) return;
      if (e.isSymbolicLink()) continue;
      if (e.isFile() && /\.(csproj|fsproj|vbproj)$/i.test(e.name)) {
        if (!out.includes(dir)) out.push(dir);
      } else if (e.isDirectory() && depth < 3 && !DEP_SKIP.has(e.name) && !e.name.startsWith('.')) {
        walk(join(dir, e.name), depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

/** German reason when the dependency marker is missing, else null (SPEC §6.8 install-first rule). */
export function missingDependencyMarker(root: string, installCommand: string): string | null {
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as Record<string, unknown>;
      const deps = { ...((pkg.dependencies as object) ?? {}), ...((pkg.devDependencies as object) ?? {}) };
      if (Object.keys(deps).length > 0 && !existsSync(join(root, 'node_modules'))) return 'node_modules fehlt';
    } catch {
      /* unreadable package.json – the check itself will report it */
    }
  }
  if (/\bdotnet\b/i.test(installCommand)) {
    const dirs = dotnetProjectDirs(root);
    if (dirs.length > 0 && dirs.some((d) => !existsSync(join(d, 'obj')))) return 'obj-Ordner fehlt';
  }
  if (/\.venv/.test(installCommand) && (existsSync(join(root, 'requirements.txt')) || existsSync(join(root, 'pyproject.toml'))) && !existsSync(join(root, '.venv'))) {
    return '.venv fehlt';
  }
  return null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** GET request to a loopback URL; resolves with the status code or null (no answer). */
export function probeUrl(url: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    if (!isLocalEndpoint(url)) return resolve(null);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return resolve(null);
    }
    const fn = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = fn(parsed, { method: 'GET', timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
      res.resume();
      resolve(res.statusCode ?? null);
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end();
  });
}

function cleanUrl(url: string | null): string | null {
  if (!url) return null;
  return url.replace(/[).,;'"\]]+$/, '');
}

interface ActiveRun {
  run: CheckRun;
  controller: AbortController;
  done: Promise<CheckRun>;
  key: string;
}

export function createCheckService(s: Services, opts: CheckServiceOptions = {}): CheckService {
  const log = s.core.log.child('checks');
  const db = s.core.db;
  const platform = opts.platform ?? s.core.platform;
  const timings = { aliveMs: 10_000, webMaxMs: 30_000, pollMs: 250, ...opts.runtime };
  const active = new Map<string, ActiveRun>();
  const chains = new Map<string, Promise<void>>();
  const pending = new Map<string, number>();
  let staleChecked = false;

  function recoverStale(): void {
    if (staleChecked) return;
    staleChecked = true;
    try {
      const rows = db.all<CheckRow>("SELECT * FROM check_runs WHERE status = 'running'");
      for (const r of rows) {
        if (active.has(r.id)) continue;
        const run = rowToCheck(r);
        run.status = 'error';
        run.message = 'Unterbrochen: NOVA wurde beendet, während die Prüfung lief.';
        run.finishedAt = s.core.clock.now();
        updateCheck(db, run);
      }
    } catch (e) {
      log.warn('Unterbrochene Prüfungen konnten nicht bereinigt werden', { error: errorMessage(e) });
    }
  }

  function emit(run: CheckRun): void {
    s.core.bus.emit('check.updated', { ...run, failures: run.failures.map((f) => ({ ...f })), artifacts: run.artifacts.map((a) => ({ ...a })) });
  }

  function persistNew(run: CheckRun): void {
    insertCheck(db, run);
    emit(run);
  }

  function persistUpdate(run: CheckRun): void {
    if (updateCheck(db, run)) emit(run);
  }

  function commandFor(project: Project, kind: CheckKind): string | null {
    const c = project.config.commands;
    const cmd = kind === 'runtime' ? c.run ?? c.dev : c[kind];
    return cmd && cmd.trim() ? cmd.trim() : null;
  }

  function newRun(project: Project, kind: CheckKind, taskId: string | null, command: string, status: CheckStatus, message: string | null): CheckRun {
    const now = s.core.clock.now();
    const final = status !== 'running';
    return {
      id: newId('chk'),
      projectId: project.id,
      taskId,
      kind,
      command,
      status,
      passed: null,
      failed: null,
      skipped: null,
      durationMs: final ? 0 : null,
      outputTail: '',
      failures: [],
      failureSignature: null,
      message,
      processId: null,
      artifacts: [],
      startedAt: now,
      finishedAt: final ? now : null,
    };
  }

  function commandTimeoutMs(kind: CheckKind, unity: boolean): number {
    const base = s.core.settings.section('resources').commandTimeoutSec * 1000;
    return unity || kind === 'package' ? Math.max(base, 60 * 60_000) : base;
  }

  function discoverProcess(run: CheckRun, command: string): void {
    try {
      if (run.processId) return;
      const redacted = redactString(command);
      const match = s.processes
        .list({ projectId: run.projectId })
        .filter((p) => p.status === 'running' && (p.command === command || p.command === redacted) && p.startedAt >= run.startedAt - 1000)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      if (match) {
        run.processId = match.id;
        persistUpdate(run);
      }
    } catch {
      /* the id is set when the process ends */
    }
  }

  // ---------------------------------------------------------------------------------------------- install

  async function installIfNeeded(project: Project, run: CheckRun, actor: Actor, signal: AbortSignal, outputs: string[]): Promise<Partial<CheckRun> | null> {
    const cmd = project.config.commands.install?.trim();
    if (!cmd) return null;
    const reason = missingDependencyMarker(project.path, cmd);
    if (!reason) return null;
    if (actor !== 'user') {
      const decision = s.policy.evaluate({ projectId: project.id, projectRoot: project.path, command: cmd, config: project.config, taskId: run.taskId });
      if (decision.action === 'block') return { status: 'error', message: `${INSTALL_FAILED}: ${decision.reason}` };
      if (decision.action === 'approve') {
        const check = s.approvals.check({
          projectId: project.id,
          taskId: run.taskId,
          kind: decision.kind,
          title: 'Abhängigkeiten installieren',
          action: `Vor der Prüfung „${run.kind}“ müssen die Abhängigkeiten des Projekts installiert werden: ${cmd}`,
          consequences: decision.consequences,
          subject: decision.subject,
          details: { checkRunId: run.id, reason },
        });
        if (check.state === 'pending') {
          return { status: 'error', message: `${INSTALL_FAILED}: Die Installation wartet auf eine Freigabe (siehe „Freigaben“). Danach die Prüfung erneut starten.` };
        }
        if (check.state === 'denied') {
          s.approvals.acknowledgeDenial(check.approval.id);
          return { status: 'error', message: `${INSTALL_FAILED}: Die Installation wurde abgelehnt.` };
        }
        if (check.approval && !check.viaRule) s.approvals.consume(check.approval.id);
      }
    }
    outputs.push(`── Abhängigkeiten werden installiert (${reason}): ${cmd}`);
    const res = await s.processes.run({
      command: cmd,
      cwd: project.path,
      projectId: project.id,
      taskId: run.taskId,
      kind: 'install',
      timeoutMs: Math.max(commandTimeoutMs(run.kind, false), 15 * 60_000),
      signal,
    });
    outputs.push(res.output);
    if (res.cancelled || signal.aborted) return { status: 'cancelled', message: CANCELLED_MSG };
    if (res.timedOut || res.exitCode !== 0) {
      const why = res.timedOut ? 'Zeitlimit überschritten' : `Exit-Code ${res.exitCode ?? 'unbekannt'}`;
      s.core.errors.report({
        code: 'COMMAND_FAILED',
        severity: 'blocker',
        title: 'Abhängigkeiten konnten nicht installiert werden',
        whatHappened: `Vor einer Prüfung sollten die Abhängigkeiten des Projekts installiert werden („${cmd}“). Das ist fehlgeschlagen (${why}).`,
        projectId: project.id,
        taskId: run.taskId,
        attempted: [`${cmd} ausgeführt`],
        projectSafe: true,
        autoFixable: false,
        userAction: 'Internetverbindung und Paketquellen prüfen und die Ausgabe der Prüfung ansehen. Danach die Prüfung erneut starten.',
        details: tail(res.output).slice(-4000),
        related: { checkRunId: run.id, runId: null, approvalId: null, file: null, line: null },
        dedupeKey: `install-failed:${project.id}`,
      });
      return { status: 'error', message: `${INSTALL_FAILED} (${why}). Details stehen in der Ausgabe.` };
    }
    s.core.errors.resolveWhere({ dedupeKey: `install-failed:${project.id}` });
    outputs.push('── Prüfung ──');
    return null;
  }

  // ---------------------------------------------------------------------------------------------- runtime

  async function runtimeCheck(project: Project, run: CheckRun, command: string, signal: AbortSignal, outputs: string[]): Promise<Partial<CheckRun>> {
    const web = project.config.preview.kind === 'browser-dev-server' || project.config.preview.kind === 'browser-static' || project.kind === 'web' || project.kind === 'backend';
    const port = await freePort();
    const handle = await s.processes.start({
      command,
      cwd: project.path,
      projectId: project.id,
      taskId: run.taskId,
      kind: 'dev_server',
      env: { PORT: String(port) },
      signal,
      urlPattern: LOOPBACK_URL_PATTERN,
    });
    const procId = handle.info().id;
    run.processId = procId;
    persistUpdate(run);
    let exited = false;
    let exitCode: number | null = null;
    void handle.exited.then(
      (code) => {
        exited = true;
        exitCode = code;
      },
      () => {
        exited = true;
      },
    );
    let url: string | null = null;
    if (web) {
      void handle.waitForUrl(timings.webMaxMs).then(
        (u) => {
          url = cleanUrl(u);
        },
        () => undefined,
      );
    }
    const startedAt = Date.now();
    const maxMs = web ? timings.webMaxMs : timings.aliveMs;
    let lastHttp: number | null = null;
    let result: Partial<CheckRun>;
    try {
      for (;;) {
        if (signal.aborted) {
          result = { status: 'cancelled', message: CANCELLED_MSG };
          break;
        }
        if (url && isLocalEndpoint(url)) {
          const status = await probeUrl(url, 3000);
          if (status !== null) lastHttp = status;
          if (status !== null && status >= 200 && status < 300) {
            result = { status: 'passed', message: `Die Anwendung startet und antwortet unter ${url} (HTTP ${status}).` };
            break;
          }
        }
        if (exited) {
          result =
            exitCode === 0
              ? { status: 'passed', message: 'Das Programm lief ohne Fehler und hat sich selbst beendet (Exit-Code 0).' }
              : { status: 'failed', message: `Das Programm wurde kurz nach dem Start mit Exit-Code ${exitCode ?? 'unbekannt'} beendet.` };
          break;
        }
        const elapsed = Date.now() - startedAt;
        if (elapsed >= maxMs) {
          const secs = Math.round(maxMs / 1000);
          const http = url ? (lastHttp !== null ? ` Die Adresse ${url} antwortet mit HTTP ${lastHttp}.` : ` Die Adresse ${url} antwortet nicht.`) : web ? ' Es wurde keine Adresse erkannt.' : '';
          result = { status: 'passed', message: `Das Programm läuft seit ${secs} Sekunden ohne Absturz.${http}` };
          break;
        }
        await new Promise((r) => setTimeout(r, timings.pollMs));
      }
    } finally {
      try {
        await s.processes.kill(procId);
      } catch (e) {
        log.warn('Prozess der Laufzeitprüfung konnte nicht beendet werden', { error: errorMessage(e) });
      }
    }
    try {
      outputs.push(s.processes.output(procId, TAIL_LINES));
    } catch {
      /* no output available */
    }
    return result;
  }

  // ---------------------------------------------------------------------------------------------- execute

  function readTrxResults(dir: string, ctx: ParseContext): ParsedCheck | null {
    try {
      const files: string[] = [];
      const walk = (d: string, depth: number) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isFile() && e.name.toLowerCase().endsWith('.trx')) files.push(join(d, e.name));
          else if (e.isDirectory() && depth < 2) walk(join(d, e.name), depth + 1);
        }
      };
      walk(dir, 0);
      const parts = files.map((f) => parseTrx(readFileSync(f, 'utf8'), ctx)).filter((p): p is ParsedCheck => p !== null);
      return mergeParsed(parts);
    } catch {
      return null;
    }
  }

  async function execute(run: CheckRun, project: Project, actor: Actor, signal: AbortSignal): Promise<CheckRun> {
    const root = project.path;
    const outputs: string[] = [];
    let lastExit: number | null = null;
    const finish = (patch: Partial<CheckRun>): CheckRun => {
      const finishedAt = s.core.clock.now();
      Object.assign(run, patch, { finishedAt, durationMs: Math.max(0, finishedAt - run.startedAt) });
      if (patch.outputTail === undefined) run.outputTail = tail(outputs.join('\n'));
      if ((run.status === 'failed' || run.status === 'error') && !run.failureSignature) {
        run.failureSignature = failureSignature(run.failures, { exitCode: lastExit, output: run.outputTail });
      }
      if (run.status !== 'failed' && run.status !== 'error') run.failureSignature = null;
      persistUpdate(run);
      return run;
    };
    try {
      if (!isDirectory(root)) {
        return finish({ status: 'error', message: 'Der Projektordner wurde nicht gefunden. Wurde er verschoben? In den Projekteinstellungen kann der neue Ort eingetragen werden.' });
      }
      if (signal.aborted) return finish({ status: 'cancelled', message: CANCELLED_MSG });
      let command = run.command;
      const unity = isUnityBatchCommand(command);
      if (unity) {
        const version = readUnityVersion(root) ?? project.config.engineVersion;
        let exe: string | null = null;
        try {
          exe = await s.integrations.resolvePath('unity', { version });
        } catch (e) {
          log.warn('Unity-Editor konnte nicht ermittelt werden', { error: errorMessage(e) });
        }
        if (!exe) {
          return finish({
            status: 'not_run',
            message: version
              ? `Unity ${version} ist nicht installiert. Bitte genau diese Version über Unity Hub installieren (andere Versionen würden das Projekt umstellen).`
              : 'Es wurde kein Unity-Editor gefunden. Bitte Unity über Unity Hub installieren.',
          });
        }
        if (isUnityProjectOpen(root, platform)) return finish({ status: 'error', message: 'Projekt ist in Unity geöffnet – bitte Unity schließen.' });
        command = replaceUnityExecutable(command, exe);
      }

      if (run.kind !== 'security') {
        const install = await installIfNeeded(project, run, actor, signal, outputs);
        if (install) return finish(install);
      }
      if (signal.aborted) return finish({ status: 'cancelled', message: CANCELLED_MSG });

      if (run.kind === 'runtime') return finish(await runtimeCheck(project, run, command, signal, outputs));

      let effective = command;
      let trxDir: string | null = null;
      if (/^\s*dotnet(?:\.exe)?\s+test\b/i.test(command) && !/--logger\b/i.test(command) && !/[&|;<>^]/.test(command)) {
        trxDir = join(s.core.paths.root, 'check-results', run.id);
        mkdirSync(trxDir, { recursive: true });
        effective = `${command} --logger trx --results-directory "${trxDir}"`;
      }
      const timeoutMs = commandTimeoutMs(run.kind, unity);
      let discovered = false;
      const result = await s.processes.run({
        command: effective,
        cwd: root,
        projectId: project.id,
        taskId: run.taskId,
        kind: PROCESS_KIND[run.kind],
        timeoutMs,
        signal,
        env: { DOTNET_CLI_UI_LANGUAGE: 'en', VSLANG: '1033', DOTNET_NOLOGO: '1' },
        onOutput: () => {
          if (!discovered) {
            discovered = true;
            discoverProcess(run, effective);
          }
        },
      });
      run.processId = result.processId;
      lastExit = result.exitCode;
      outputs.push(result.output);
      const ctx: ParseContext = { root, platform };
      let parsed = parseCheckOutput(run.kind, result.output, ctx);
      if (trxDir) {
        const trx = readTrxResults(trxDir, ctx);
        if (trx) parsed = { ...trx, failures: trx.failures.length > 0 ? trx.failures : parsed.failures };
        try {
          removeDirWithRetry(trxDir);
        } catch {
          /* leftover temp results are pruned with the data dir */
        }
      }
      let unityResults: ParsedCheck | null = null;
      if (unity && run.kind === 'test') {
        const rel = unityResultsPath(command);
        if (rel) {
          const abs = isAbsolute(rel) ? rel : join(root, ...rel.split(/[\\/]/));
          try {
            const st = lstatSync(abs);
            if (st.isFile() && st.mtimeMs >= run.startedAt - 2000) unityResults = parseNunitXml(readFileSync(abs, 'utf8'), ctx);
          } catch {
            unityResults = null;
          }
        }
        if (unityResults) parsed = { ...unityResults, failures: unityResults.failures.length > 0 ? unityResults.failures : parsed.failures };
      }

      const code = result.exitCode;
      const missing = commandNotFound(code, result.output, platform);
      let status: CheckStatus;
      let message: string | null = null;
      if (result.cancelled || signal.aborted) {
        status = 'cancelled';
        message = CANCELLED_MSG;
      } else if (result.timedOut) {
        status = 'failed';
        message = `Die Prüfung hat das Zeitlimit von ${Math.round(timeoutMs / 60_000)} Minuten überschritten und wurde beendet.`;
      } else if (missing) {
        // a missing program means the check could not run at all – never "tests failed"
        status = 'error';
        message = `Der Befehl „${missing.program ?? firstToken(command)}“ wurde nicht gefunden. Ist das benötigte Werkzeug installiert? (Einstellungen → Werkzeuge)`;
      } else if (unity && run.kind === 'test' && !unityResults) {
        status = parsed.failures.length > 0 ? 'failed' : 'error';
        message =
          parsed.failures.length > 0
            ? 'Das Unity-Projekt enthält Kompilierfehler – die Tests konnten nicht laufen.'
            : `Unity hat keine Testergebnisse geschrieben (Exit-Code ${code ?? 'unbekannt'}). Details stehen in der Ausgabe.`;
      } else if (unity && code === 3 && parsed.failures.length === 0) {
        status = 'error';
        message = 'Unity konnte die Tests nicht ausführen (Exit-Code 3). Details stehen in der Ausgabe.';
      } else if (code === 0) {
        status = (parsed.failed ?? 0) > 0 ? 'failed' : 'passed';
      } else {
        status = 'failed';
      }
      if (status === 'failed' && !message) {
        message = parsed.failed && parsed.failed > 0 ? `${parsed.failed} ${parsed.failed === 1 ? 'Test ist' : 'Tests sind'} fehlgeschlagen.` : `Fehlgeschlagen (Exit-Code ${code ?? 'unbekannt'}).`;
      }
      if (status === 'passed' && (run.kind === 'test' || run.kind === 'e2e') && parsed.passed !== null && (parsed.passed ?? 0) + (parsed.failed ?? 0) + (parsed.skipped ?? 0) === 0) {
        status = 'skipped';
        message = 'Es wurden keine Tests gefunden – der Testbefehl lief ohne einen einzigen Test.';
      }

      const artifacts =
        (run.kind === 'build' || run.kind === 'package') && status === 'passed'
          ? findArtifacts(root, project.config.artifactGlobs, { caseInsensitive: platform === 'win32', sinceMs: run.startedAt - 2000 })
          : [];
      return finish({
        command: run.command,
        status,
        message,
        passed: parsed.passed,
        failed: parsed.failed,
        skipped: parsed.skipped,
        failures: status === 'passed' ? [] : parsed.failures,
        artifacts,
      });
    } catch (e) {
      if (signal.aborted || isAbortError(e)) return finish({ status: 'cancelled', message: CANCELLED_MSG });
      log.warn('Prüfung konnte nicht ausgeführt werden', { checkRunId: run.id, error: errorMessage(e) });
      const msg = e instanceof NovaError ? e.message : errorMessage(e);
      return finish({ status: 'error', message: `Die Prüfung konnte nicht ausgeführt werden: ${redactString(msg)}` });
    }
  }

  // ---------------------------------------------------------------------------------------------- launch

  function keyOf(projectId: string, kind: CheckKind): string {
    return `${projectId}:${kind}`;
  }

  function isBusy(key: string): boolean {
    return [...active.values()].some((a) => a.key === key) || (pending.get(key) ?? 0) > 0;
  }

  function launch(project: Project, kind: CheckKind, taskId: string | null, actor: Actor, external?: AbortSignal): { run: CheckRun; done: Promise<CheckRun> } {
    const command = commandFor(project, kind);
    if (!command) {
      const run = newRun(project, kind, taskId, '', 'not_run', NO_COMMAND[kind]);
      persistNew(run);
      return { run: { ...run }, done: Promise.resolve(run) };
    }
    const run = newRun(project, kind, taskId, command, 'running', null);
    persistNew(run);
    const key = keyOf(project.id, kind);
    const controller = new AbortController();
    const onExternal = () => controller.abort(external?.reason ?? new NovaError('CANCELLED', CANCELLED_MSG, { severity: 'warning' }));
    if (external) {
      if (external.aborted) onExternal();
      else external.addEventListener('abort', onExternal, { once: true });
    }
    const snapshot = { ...run };
    const done = execute(run, project, actor, controller.signal).finally(() => {
      active.delete(run.id);
      external?.removeEventListener('abort', onExternal);
    });
    active.set(run.id, { run, controller, done, key });
    return { run: snapshot, done };
  }

  const service: CheckService = {
    async run(input) {
      recoverStale();
      s.projects.require(input.projectId);
      const key = keyOf(input.projectId, input.kind);
      const prev = chains.get(key) ?? Promise.resolve();
      let release: () => void = () => undefined;
      const mine = new Promise<void>((r) => (release = r));
      const chainTail = prev.then(() => mine);
      chains.set(key, chainTail);
      pending.set(key, (pending.get(key) ?? 0) + 1);
      try {
        await prev;
      } finally {
        const left = (pending.get(key) ?? 1) - 1;
        if (left <= 0) pending.delete(key);
        else pending.set(key, left);
      }
      try {
        const project = s.projects.require(input.projectId);
        if (input.signal?.aborted) {
          const run = newRun(project, input.kind, input.taskId ?? null, commandFor(project, input.kind) ?? '', 'cancelled', CANCELLED_MSG);
          persistNew(run);
          return run;
        }
        const { done } = launch(project, input.kind, input.taskId ?? null, input.actor ?? 'system', input.signal);
        return await done;
      } finally {
        release();
        if (chains.get(key) === chainTail) chains.delete(key);
      }
    },

    start(input) {
      recoverStale();
      const project = s.projects.require(input.projectId);
      const key = keyOf(project.id, input.kind);
      if (isBusy(key)) throw conflict('Diese Prüfung läuft bereits.');
      const { run, done } = launch(project, input.kind, input.taskId ?? null, input.actor ?? 'user');
      const prev = chains.get(key) ?? Promise.resolve();
      const chainTail = prev.then(() => done.then(() => undefined, () => undefined));
      chains.set(key, chainTail);
      void chainTail.then(() => {
        if (chains.get(key) === chainTail) chains.delete(key);
      });
      return run;
    },

    async cancel(id) {
      const a = active.get(id);
      if (a) {
        a.controller.abort(new NovaError('CANCELLED', CANCELLED_MSG, { severity: 'warning' }));
        return await a.done;
      }
      const run = getCheck(db, id);
      if (!run) throw notFound('Die Prüfung', id);
      if (run.status === 'running') {
        run.status = 'cancelled';
        run.message = CANCELLED_MSG;
        run.finishedAt = s.core.clock.now();
        run.durationMs = run.finishedAt - run.startedAt;
        persistUpdate(run);
      }
      return run;
    },

    get(id) {
      recoverStale();
      const a = active.get(id);
      if (a) return { ...a.run };
      return getCheck(db, id);
    },

    list(projectId, o = {}) {
      recoverStale();
      const where = ['project_id = ?'];
      const params: (string | number)[] = [projectId];
      if (o.kind) {
        where.push('kind = ?');
        params.push(o.kind);
      }
      if (o.taskId) {
        where.push('task_id = ?');
        params.push(o.taskId);
      }
      if (o.since !== undefined) {
        where.push('started_at >= ?');
        params.push(o.since);
      }
      params.push(Math.max(1, Math.min(o.limit ?? 50, 1000)));
      return db.all<CheckRow>(`SELECT * FROM check_runs WHERE ${where.join(' AND ')} ORDER BY started_at DESC, rowid DESC LIMIT ?`, params).map(rowToCheck);
    },

    latest(projectId, kind) {
      recoverStale();
      const r = db.get<CheckRow>('SELECT * FROM check_runs WHERE project_id = ? AND kind = ? ORDER BY started_at DESC, rowid DESC LIMIT 1', [projectId, kind]);
      return r ? rowToCheck(r) : null;
    },

    recent(kind, limit, status) {
      recoverStale();
      const kinds = Array.isArray(kind) ? kind : [kind];
      if (kinds.length === 0) return [];
      const params: (string | number)[] = [...kinds];
      let sql = `SELECT * FROM check_runs WHERE kind IN (${kinds.map(() => '?').join(', ')})`;
      if (status) {
        sql += ' AND status = ?';
        params.push(status);
      }
      sql += ' ORDER BY COALESCE(finished_at, started_at) DESC, rowid DESC LIMIT ?';
      params.push(Math.max(1, Math.min(limit, 1000)));
      return db.all<CheckRow>(sql, params).map(rowToCheck);
    },

    currentFailures(limit) {
      recoverStale();
      const rows = db.all<CheckRow>(
        `SELECT c.* FROM check_runs c JOIN projects p ON p.id = c.project_id AND p.status = 'active'
         WHERE c.kind IN ('test', 'e2e') AND c.status IN ('failed', 'error')
           AND c.started_at = (SELECT MAX(c2.started_at) FROM check_runs c2
                               WHERE c2.project_id = c.project_id AND c2.kind = c.kind AND c2.status IN ('passed', 'failed', 'error'))
         ORDER BY COALESCE(c.finished_at, c.started_at) DESC LIMIT ?`,
        [Math.max(1, Math.min(limit, 1000))],
      );
      return rows.map(rowToCheck);
    },

    prune(olderThanMs) {
      return db.run(
        `DELETE FROM check_runs WHERE status != 'running' AND COALESCE(finished_at, started_at) < ?
           AND id NOT IN (SELECT c.id FROM check_runs c WHERE c.started_at = (
             SELECT MAX(c2.started_at) FROM check_runs c2 WHERE c2.project_id = c.project_id AND c2.kind = c.kind))`,
        [olderThanMs],
      ).changes;
    },
  };
  return service;
}
