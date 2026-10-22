// Process entry of the NOVA daemon. Started by Electron main with ELECTRON_RUN_AS_NODE=1 (detached),
// or manually for development: `node out/daemon/index.cjs --data-dir <dir> --foreground`.
// Exit codes: 0 = clean stop, 1 = fatal error (see <dataDir>/crash.json), 3 = already running, 4 = endpoint held by a foreign program.
// Extra modes: --diagnostics-only (bundle from log files without opening the DB), --restore-db <file> (queue a DB restore).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defaultDataDir, dataPaths, canonicalDataDir } from './core/paths';
import { startDaemon, type DaemonApp } from './app';
import { errorMessage, isNovaError } from './core/errors';
import { writeCrashReport, readCrashReport } from './core/crash';
import { atomicWriteFile } from './core/fs-atomic';
import { redact } from './core/redact';
import { NOVA_VERSION } from './core/context';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// node:sqlite prints an ExperimentalWarning on some Node versions; it is expected and not actionable.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') process.stderr.write(`${w.name}: ${w.message}\n`);
});

const dataDirInput = arg('--data-dir') ?? defaultDataDir();
const foreground = process.argv.includes('--foreground');
process.title = 'NOVA AI Hintergrunddienst';

let app: DaemonApp | null = null;
let exitCode = 0;
let phase: 'startup' | 'instance_lock' | 'database_open' | 'migration' | 'runtime' = 'startup';

function crash(code: string, message: string, err: unknown): void {
  try {
    const paths = dataPaths(canonicalDataDir(dataDirInput));
    writeCrashReport(paths.crash, {
      ts: Date.now(),
      version: NOVA_VERSION,
      phase,
      code,
      message,
      details: err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : errorMessage(err),
      logFile: join(paths.logs, 'daemon.log'),
      suggestedActions: phase === 'database_open' || phase === 'migration' ? ['restore_backup', 'create_diagnostics', 'open_logs'] : ['retry', 'create_diagnostics', 'open_logs'],
    });
  } catch {
    /* data dir itself unusable */
  }
}

/** Diagnostics without opening the database (for states the daemon cannot start from). */
function diagnosticsOnly(): void {
  const root = canonicalDataDir(dataDirInput);
  const paths = dataPaths(root);
  const read = (f: string, max = 1_000_000) => {
    try {
      const t = readFileSync(f, 'utf8');
      return t.length > max ? t.slice(t.length - max) : t;
    } catch {
      return null;
    }
  };
  const bundle = redact({
    format: 'nova-diagnostics',
    version: 1,
    mode: 'diagnostics-only',
    createdAt: new Date().toISOString(),
    daemonVersion: NOVA_VERSION,
    platform: process.platform,
    node: process.versions.node,
    crash: readCrashReport(paths.crash),
    lock: read(paths.lock),
    startLog: read(paths.startLog, 256_000),
    log: read(join(paths.logs, 'daemon.log')),
    dbSizeBytes: existsSync(paths.db) ? statSync(paths.db).size : null,
  });
  mkdirSync(paths.diagnostics, { recursive: true });
  const out = join(paths.diagnostics, `diagnose-ohne-start-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  atomicWriteFile(out, JSON.stringify(bundle, null, 2));
  process.stdout.write(`${out}\n`);
}

function queueRestore(file: string): void {
  const root = canonicalDataDir(dataDirInput);
  const paths = dataPaths(root);
  if (!existsSync(file)) throw new Error(`Sicherung nicht gefunden: ${file}`);
  atomicWriteFile(paths.restorePending, JSON.stringify({ backupPath: file }));
  process.stdout.write('Wiederherstellung vorgemerkt – sie wird beim nächsten Start des Hintergrunddienstes ausgeführt.\n');
}

function respawnSelf(): void {
  const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
  child.unref();
}

async function main(): Promise<void> {
  if (process.argv.includes('--diagnostics-only')) {
    diagnosticsOnly();
    process.exit(0);
  }
  const restoreFile = arg('--restore-db');
  if (restoreFile) {
    queueRestore(restoreFile);
    process.exit(0);
  }
  try {
    phase = 'instance_lock';
    // First line in the supervisor's start log: proves the process runs before the lock/database can block.
    process.stderr.write(`[info] daemon: Prozess läuft ${JSON.stringify({ version: NOVA_VERSION, pid: process.pid, node: process.versions.node, dataDir: dataDirInput })}\n`);
    app = await startDaemon({
      dataDir: dataDirInput,
      endpoint: arg('--endpoint'),
      echoLogs: foreground ? true : 'startup',
      onExit: (code, restart) => {
        if (restart) respawnSelf();
        process.exit(exitCode || code);
      },
    });
    phase = 'runtime';
    if (foreground) process.stderr.write(`NOVA daemon ready on ${app.endpoint}\n`);
  } catch (e) {
    if (isNovaError(e) && e.code === 'CONFLICT') {
      process.stderr.write(`${e.message}\n`);
      process.exit(3);
    }
    if (isNovaError(e) && e.code === 'DAEMON_UNAVAILABLE') {
      crash('DAEMON_UNAVAILABLE', e.message, e);
      process.stderr.write(`${e.message}\n`);
      process.exit(4);
    }
    const msg = errorMessage(e);
    if (/database|sqlite|malformed|SQLITE/i.test(msg)) phase = 'database_open';
    crash(isNovaError(e) ? e.code : 'INTERNAL', 'Der NOVA-Hintergrunddienst konnte nicht starten.', e);
    process.stderr.write(`NOVA daemon failed to start: ${msg}\n${e instanceof Error ? e.stack : ''}\n`);
    process.exit(1);
  }
}

const stop = (reason: string) => {
  if (app) void app.stop(reason);
  else process.exit(0);
};
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
if (process.platform === 'win32') process.on('SIGBREAK', () => stop('SIGBREAK'));

process.on('uncaughtException', (err) => {
  exitCode = 1;
  try {
    crash('INTERNAL', 'Unerwarteter Fehler im Hintergrunddienst.', err);
    app?.services.core.log.error('Unerwarteter Fehler im Hintergrunddienst', { error: errorMessage(err), stack: err.stack });
    app?.services.core.errors.report({
      code: 'INTERNAL',
      severity: 'critical',
      title: 'Unerwarteter Fehler im Hintergrunddienst',
      whatHappened: 'Im Hintergrunddienst ist ein unerwarteter Fehler aufgetreten. NOVA fährt kontrolliert herunter und setzt sichere Aufgaben beim nächsten Start fort.',
      attempted: ['Kontrolliertes Herunterfahren gestartet'],
      projectSafe: true,
      autoFixable: true,
      userAction: 'NOVA neu starten. Falls der Fehler wiederkehrt: Diagnose-Paket unter „Protokolle“ erstellen.',
      details: `${errorMessage(err)}\n${err.stack ?? ''}`,
      dedupeKey: 'daemon-uncaught',
    });
  } catch {
    /* best effort */
  }
  if (app) void app.stop('uncaughtException').finally(() => process.exit(1));
  else process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  app?.services.core.log.error('Unbehandelte Promise-Ablehnung', { error: errorMessage(reason) });
});

void main();
