// German user-facing texts of the Electron main process (tray, toasts, daemon connection states, dialogs, CLI).
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
    'Die Datenbank ist möglicherweise beschädigt. Über „Datensicherung einspielen“ lässt sich eine automatische Sicherung von NOVA wiederherstellen.',
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
  daemonHung:
    'Der Hintergrunddienst reagiert seit mehr als zwei Minuten nicht mehr. NOVA prüft weiter und verbindet sich automatisch, sobald er wieder antwortet. Über „Dienst neu starten“ lässt er sich beenden und neu starten; „Diagnose erstellen“ sammelt die Protokolle für den Support.',
  notConnected: 'Der Hintergrunddienst ist gerade nicht verbunden.',

  // Recovery while the daemon cannot start (DaemonBanner: "Datensicherung einspielen", "Diagnose erstellen")
  recoveryBusy: 'Es läuft bereits eine Wiederherstellung oder Diagnose. Bitte einen Moment warten.',
  restoreWhileConnected:
    'Der Hintergrunddienst läuft. Sicherungen lassen sich dann unter „Einstellungen › Speicher & Backups“ einspielen.',
  backupNotAllowed: 'Es lassen sich nur automatische Sicherungen von NOVA aus dem Ordner „backups“ einspielen.',
  backupMissing: 'Die Sicherungsdatei wurde nicht gefunden.',
  backupNotNova: 'Die Datei ist keine NOVA-Datenbank und wurde nicht eingespielt.',
  backupCorrupt: 'Diese Sicherung ist ebenfalls beschädigt und wurde nicht eingespielt. Bitte eine ältere Sicherung wählen.',
  backupNoVersion: 'Bei dieser Sicherung fehlt die Versionsangabe. Sie wurde nicht eingespielt.',
  backupNewer: (version: number) =>
    `Diese Sicherung stammt von einer neueren NOVA-Version (Datenbankversion ${version}). Bitte NOVA zuerst aktualisieren.`,
  backupUnreadable: (detail: string) => `Die Sicherung lässt sich nicht lesen${detail ? ` (${detail})` : ''}. Sie wurde nicht eingespielt.`,
  helperTimeout: 'keine Antwort innerhalb der Wartezeit',
  restoreQueueFailed: (detail: string) => `Die Wiederherstellung konnte nicht vorbereitet werden${detail ? `: ${detail}` : '.'}`,
  restoreDone:
    'Die Sicherung wurde eingespielt und der Hintergrunddienst läuft wieder. Die beschädigte Datenbank liegt zur Sicherheit im Ordner „backups“.',
  restoreStartFailed: (message: string) =>
    `Die Sicherung wurde eingespielt, aber der Hintergrunddienst startet noch nicht: ${message}`,
  diagnosticsCreated: 'Das Diagnose-Paket wurde erstellt und im Explorer markiert. API-Schlüssel und Passwörter sind darin entfernt.',
  diagnosticsFailed: (detail: string) => `Das Diagnose-Paket konnte nicht erstellt werden${detail ? `: ${detail}` : '.'}`,

  // IPC
  untrustedSender: 'Anfrage aus einem nicht vertrauenswürdigen Fenster abgelehnt.',
  unknownMethod: (method: string) => `Unbekannte Funktion „${method}“.`,
  invalidMethod: 'Die Anfrage enthält keinen gültigen Funktionsnamen.',
  invalidParamsPrefix: 'Die Angaben sind ungültig',
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

  // Quit with unsaved studio edits (native questions, see unsaved-guard.ts)
  unsavedTitle: (count: number) =>
    count === 1 ? 'Eine Datei im Studio ist noch nicht gespeichert.' : `${count} Dateien im Studio sind noch nicht gespeichert.`,
  unsavedMore: (n: number) => `… und ${n} weitere`,
  unsavedQuestion: 'Sollen die Änderungen vor dem Beenden gespeichert werden?',
  unsavedSave: 'Speichern',
  unsavedDiscard: 'Nicht speichern',
  unsavedCancel: 'Abbrechen',
  unsavedQuitAnyway: 'Trotzdem beenden',
  unsavedSaveFailed: 'Nicht alle Änderungen konnten gespeichert werden.',
  unsavedNoAnswer: 'Die Oberfläche antwortet nicht – die Änderungen konnten nicht gespeichert werden.',
  unsavedRecoveryCopy:
    'Beim Beenden bleibt eine Wiederherstellungskopie erhalten: NOVA bietet die Änderungen beim nächsten Öffnen des Studios wieder an.',

  // Toasts
  closeToTrayTitle: 'NOVA läuft im Hintergrund weiter',
  closeToTrayBody:
    'Das Fenster wurde in den Infobereich der Taskleiste verkleinert. Über das NOVA-Symbol lässt sich NOVA wieder öffnen oder vollständig beenden.',
  workActionFailed: 'Die Arbeit konnte nicht umgeschaltet werden',

  // Start-up problems (native error box before the window exists)
  startupErrorTitle: 'NOVA AI kann nicht starten',
  dataDirUnusable: (dir: string, reason: string) =>
    `Der Datenordner „${dir}“ kann nicht verwendet werden: ${reason}\n\nBitte einen lokalen Ordner verwenden (nicht auf einem Netzlaufwerk) und NOVA erneut starten.`,

  // CLI --stop-daemon (printed to stdout; the NSIS installer ignores it, a person running it by hand reads it)
  cliNotRunning: 'Der NOVA-Hintergrunddienst läuft nicht.',
  cliStopping: 'Der NOVA-Hintergrunddienst wird beendet …',
  cliStopped: 'Der NOVA-Hintergrunddienst wurde beendet.',
  cliStopTimeout: (seconds: number) =>
    `Der NOVA-Hintergrunddienst hat sich nicht innerhalb von ${seconds} Sekunden beendet.`,
  cliForeign: 'Der Kommunikationskanal wird von einem fremden Programm belegt. Der Hintergrunddienst wurde nicht beendet.',
  cliDataDirError: (reason: string) => `Der Datenordner kann nicht verwendet werden: ${reason}`,

  // Application menu (development builds only)
  menuView: 'Ansicht',
  menuReload: 'Neu laden',
  menuDevTools: 'Entwicklertools',
  menuEdit: 'Bearbeiten',
} as const;
