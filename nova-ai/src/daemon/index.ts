// Process entry of the NOVA daemon. Started by Electron main with ELECTRON_RUN_AS_NODE=1 (detached),
// or manually for development: `node out/daemon/index.cjs --data-dir <dir> --foreground`.
import { defaultDataDir } from './core/paths';
import { startDaemon, type DaemonApp } from './app';
import { errorMessage, isNovaError } from './core/errors';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// node:sqlite prints an ExperimentalWarning on some Node versions; it is expected and not actionable.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.name !== 'ExperimentalWarning') process.stderr.write(`${w.name}: ${w.message}\n`);
});

const dataDir = arg('--data-dir') ?? defaultDataDir();
const foreground = process.argv.includes('--foreground');
process.title = 'NOVA AI Hintergrunddienst';

let app: DaemonApp | null = null;

async function main(): Promise<void> {
  try {
    app = await startDaemon({
      dataDir,
      endpoint: arg('--endpoint'),
      echoLogs: foreground,
      onExit: (code) => process.exit(code),
    });
    if (foreground) process.stderr.write(`NOVA daemon ready on ${app.endpoint}\n`);
  } catch (e) {
    if (isNovaError(e) && e.code === 'CONFLICT') {
      // Another daemon already runs for this user/data dir – that is fine (double start).
      process.stderr.write(`${e.message}\n`);
      process.exit(3);
    }
    process.stderr.write(`NOVA daemon failed to start: ${errorMessage(e)}\n${e instanceof Error ? e.stack : ''}\n`);
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
  try {
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
