// winget install commands and exit-code interpretation (SPEC §4.9, §6.9).
// Key decisions:
// - Exactly one command shape: `winget install --id <Id> -e --source winget --accept-package-agreements
//   --accept-source-agreements --disable-interactivity` plus `--scope user` only for packages whose manifests offer a
//   per-user installer (Python, VS Code). Adding --scope user to a machine-only package makes winget fail with "no
//   applicable installer", so the list is deliberately conservative.
// - Package ids are fixed in code and validated (never taken from user input or stored approval details).
// - NOVA never elevates; machine-wide installers may show their own UAC prompt (requiresAdmin=true in the hint).
// - Exit codes are judged numerically (HRESULTs as unsigned 32-bit), never by parsing winget's localized output.

export interface WingetPackage {
  id: string;
  /** Pass --scope user (manifest has a per-user installer). */
  userScope: boolean;
  /** Installer is machine-wide → Windows may show a UAC prompt. */
  requiresAdmin: boolean;
}

/** winget packages per built-in integration (npm comes with Node.js). */
export const WINGET_PACKAGES: Record<string, WingetPackage> = {
  git: { id: 'Git.Git', userScope: false, requiresAdmin: true },
  node: { id: 'OpenJS.NodeJS.LTS', userScope: false, requiresAdmin: true },
  npm: { id: 'OpenJS.NodeJS.LTS', userScope: false, requiresAdmin: true },
  python: { id: 'Python.Python.3.12', userScope: true, requiresAdmin: false },
  dotnet: { id: 'Microsoft.DotNet.SDK.8', userScope: false, requiresAdmin: true },
  powershell: { id: 'Microsoft.PowerShell', userScope: false, requiresAdmin: true },
  windows_terminal: { id: 'Microsoft.WindowsTerminal', userScope: false, requiresAdmin: false },
  ollama: { id: 'Ollama.Ollama', userScope: false, requiresAdmin: false },
  unity: { id: 'Unity.UnityHub', userScope: false, requiresAdmin: true },
  godot: { id: 'GodotEngine.GodotEngine', userScope: false, requiresAdmin: false },
  vscode: { id: 'Microsoft.VisualStudioCode', userScope: true, requiresAdmin: false },
};

const PACKAGE_ID = /^[A-Za-z0-9][A-Za-z0-9.+-]{1,127}$/;

export function wingetCommand(pkg: WingetPackage): string {
  if (!PACKAGE_ID.test(pkg.id)) throw new Error(`invalid winget id: ${pkg.id}`);
  const parts = [
    'winget',
    'install',
    '--id',
    pkg.id,
    '-e',
    '--source',
    'winget',
    '--accept-package-agreements',
    '--accept-source-agreements',
    '--disable-interactivity',
  ];
  if (pkg.userScope) parts.push('--scope', 'user');
  return parts.join(' ');
}

export function wingetCommandFor(integrationId: string): string | null {
  const pkg = WINGET_PACKAGES[integrationId];
  return pkg ? wingetCommand(pkg) : null;
}

export const WINGET_EXIT = {
  PACKAGE_ALREADY_INSTALLED: 0x8a150061,
  UPDATE_NOT_APPLICABLE: 0x8a15002b,
  REBOOT_REQUIRED_TO_FINISH: 0x8a150109,
  NO_APPLICATIONS_FOUND: 0x8a150014,
  NO_APPLICABLE_INSTALLER: 0x8a150010,
  HRESULT_ERROR_CANCELLED: 0x800704c7,
} as const;

export interface WingetOutcome {
  ok: boolean;
  /** German summary for notifications/errors (no command lines, no paths). */
  message: string;
  rebootRequired: boolean;
}

export function interpretWingetExit(code: number | null, flags: { timedOut?: boolean; cancelled?: boolean } = {}): WingetOutcome {
  if (flags.cancelled) return { ok: false, message: 'Die Installation wurde abgebrochen.', rebootRequired: false };
  if (flags.timedOut) return { ok: false, message: 'Die Installation hat zu lange gedauert und wurde beendet.', rebootRequired: false };
  if (code === null) return { ok: false, message: 'Die Installation wurde unerwartet beendet.', rebootRequired: false };
  const u = code >>> 0;
  switch (u) {
    case 0:
      return { ok: true, message: 'Die Installation war erfolgreich.', rebootRequired: false };
    case WINGET_EXIT.PACKAGE_ALREADY_INSTALLED:
    case WINGET_EXIT.UPDATE_NOT_APPLICABLE:
      return { ok: true, message: 'Das Paket war bereits installiert.', rebootRequired: false };
    case WINGET_EXIT.REBOOT_REQUIRED_TO_FINISH:
      return { ok: true, message: 'Die Installation ist abgeschlossen, Windows muss aber neu gestartet werden.', rebootRequired: true };
    case WINGET_EXIT.NO_APPLICATIONS_FOUND:
      return { ok: false, message: 'Das Paket wurde in der winget-Quelle nicht gefunden.', rebootRequired: false };
    case WINGET_EXIT.NO_APPLICABLE_INSTALLER:
      return { ok: false, message: 'Für dieses System gibt es kein passendes Installationsprogramm.', rebootRequired: false };
    case 1602:
    case 1223:
    case WINGET_EXIT.HRESULT_ERROR_CANCELLED:
      return { ok: false, message: 'Die Installation wurde abgebrochen (z. B. weil die Windows-Sicherheitsabfrage abgelehnt oder nicht beantwortet wurde).', rebootRequired: false };
    default:
      return { ok: false, message: `winget meldet einen Fehler (Code 0x${u.toString(16).toUpperCase()}).`, rebootRequired: false };
  }
}
