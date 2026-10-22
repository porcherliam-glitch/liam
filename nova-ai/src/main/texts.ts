// German user-facing texts of the Electron main process (tray, toasts, daemon connection states, dialogs).
// Key decision: one place for all main-process wording so the tone stays consistent (plain German, no jargon,
// no "du"), and tests can assert on the exact texts.

export const TEXTS = {
  appName: 'NOVA AI',

  // Daemon connection states (DaemonConnectionState.message)
  connecting: 'Verbindung zum Hintergrunddienst wird hergestellt …',
  starting: 'Der Hintergrunddienst wird gestartet …',
  restarting: 'Der Hintergrunddienst wird neu gestartet …',
  connected: 'Der Hintergrunddienst läuft.',
  reconnecting: 'Die Verbindung zum Hintergrunddienst wurde unterbrochen. NOVA versucht es erneut …',
  autoRestarting: 'Der Hintergrunddienst wurde unerwartet beendet. NOVA startet ihn neu …',
  stopping: 'Der Hintergrunddienst wird beendet …',
  stopped: 'Der Hintergrunddienst ist beendet. Hintergrundarbeit ruht, bis er wieder gestartet wird.',
  stoppedExternally:
    'Der Hintergrunddienst wurde außerhalb dieser Oberfläche beendet. Über „Dienst neu starten“ lässt er sich wieder starten.',
  foreign: 'Der Kommunikationskanal wird von einem fremden Programm belegt. Bitte den PC neu starten.',
  alreadyRunningNoAnswer:
    'Ein anderer NOVA-Hintergrunddienst für diesen Datenordner läuft bereits, antwortet aber nicht. Bitte kurz warten und „Dienst neu starten“ wählen oder den PC neu starten.',
  daemonEntryMissing: (path: string) =>
    `Die Programmdatei des Hintergrunddienstes fehlt (${path}). Bitte NOVA neu installieren.`,
  spawnFailed: (reason: string) => `Der Hintergrunddienst konnte nicht gestartet werden: ${reason}`,
  startTimeout: (seconds: number) =>
    `Der Hintergrunddienst hat nicht innerhalb von ${seconds} Sekunden geantwortet und wurde beendet.`,
  earlyExit: (code: number | null, signal: string | null) =>
    `Der Hintergrunddienst wurde beim Start unerwartet beendet (${code !== null ? `Code ${code}` : `Signal ${signal ?? 'unbekannt'}`}).`,
  crashReport: (message: string, code: string) => `${message} (Fehlercode: ${code})`,
  crashHintRestore:
    'Die Datenbank ist möglicherweise beschädigt. Eine Datensicherung liegt im Datenordner unter „backups“.',
  lastOutput: (tail: string) => `Letzte Ausgabe: ${tail}`,
  startLogHint: (path: string) => `Details: ${path}`,
  tooManyRestarts:
    'Der Hintergrunddienst wurde in den letzten 5 Minuten mehrfach unerwartet beendet. Automatische Neustarts sind angehalten. Bitte „Dienst neu starten“ wählen oder unter „Protokolle“ ein Diagnose-Paket erstellen.',
  versionMismatch: (running: string, expected: string) =>
    `Ein Hintergrunddienst der Version ${running} läuft noch. Er wird beendet und in Version ${expected} neu gestartet …`,
  versionMismatchKept: (running: string, expected: string) =>
    `Der Hintergrunddienst läuft in Version ${running}, die Oberfläche hat Version ${expected}. Bitte NOVA vollständig beenden und neu starten.`,
  oldVersionWontStop: 'Der Hintergrunddienst einer älteren Version lässt sich nicht beenden. Bitte den PC neu starten.',
  stopFailed: 'Der Hintergrunddienst reagiert nicht auf die Aufforderung zum Beenden. Bitte den PC neu starten.',
  notConnected: 'Der Hintergrunddienst ist gerade nicht verbunden.',

  // IPC
  untrustedSender: 'Anfrage aus einem nicht vertrauenswürdigen Fenster abgelehnt.',
  unknownMethod: (method: string) => `Unbekannte Funktion „${method}“.`,
  invalidParams: (method: string, details: string) => `Ungültige Angaben für „${method}“: ${details}`,
  internalBridgeError: 'Interner Fehler in der Verbindung zwischen Oberfläche und Hintergrunddienst.',

  // Tray
  trayTooltip: (state: string) => `NOVA AI – ${state}`,
  trayOpen: 'NOVA öffnen',
  trayPauseWork: 'Arbeit pausieren',
  trayResumeWork: 'Arbeit fortsetzen',
  trayStartWork: 'Arbeit starten',
  trayQuitUi: 'Oberfläche beenden',
  trayQuitAll: 'NOVA vollständig beenden (inkl. Hintergrunddienst)',
  trayStatus: (label: string) => `Hintergrunddienst: ${label}`,
  trayStateLabels: {
    connecting: 'Verbindet …',
    starting: 'Startet …',
    connected: 'Läuft',
    reconnecting: 'Getrennt – neuer Versuch …',
    stopped: 'Beendet',
    error: 'Fehler',
  },
  trayWorkLabels: {
    running: 'Arbeit läuft',
    paused: 'Arbeit pausiert',
    stopped: 'Arbeit gestoppt',
  },

  // Toasts
  closeToTrayTitle: 'NOVA läuft im Hintergrund weiter',
  closeToTrayBody:
    'Das Fenster wurde in den Infobereich der Taskleiste verkleinert. Über das NOVA-Symbol lässt sich NOVA wieder öffnen oder vollständig beenden.',
  workActionFailed: 'Die Arbeit konnte nicht umgeschaltet werden',

  // Application menu (development builds only)
  menuView: 'Ansicht',
  menuReload: 'Neu laden',
  menuDevTools: 'Entwicklertools',
  menuEdit: 'Bearbeiten',
} as const;
