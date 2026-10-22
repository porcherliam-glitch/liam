// Command line parsing of the Electron main process.
// Flags: --hidden (autostart: start minimised to the tray), --stop-daemon (NSIS installer/uninstaller: stop the
// running daemon gracefully and exit without a window), --data-dir <dir> | --data-dir=<dir> (development/tests).
// Key decision: unknown arguments (Chromium switches such as --no-sandbox, the app path in development, the
// installer's own flags) are ignored instead of rejected, because Electron and Windows add their own.

export interface CliOptions {
  hidden: boolean;
  stopDaemon: boolean;
  dataDir: string | null;
}

function valueOf(argv: readonly string[], name: string): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === name) {
      const next = argv[i + 1];
      return next !== undefined && !next.startsWith('--') && next.length > 0 ? next : null;
    }
    if (a.startsWith(`${name}=`)) {
      const v = a.slice(name.length + 1);
      return v.length > 0 ? v : null;
    }
  }
  return null;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  return {
    hidden: argv.includes('--hidden'),
    stopDaemon: argv.includes('--stop-daemon'),
    dataDir: valueOf(argv, '--data-dir'),
  };
}
