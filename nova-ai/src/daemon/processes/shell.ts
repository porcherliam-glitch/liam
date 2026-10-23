// How a command line becomes a child process (ProcessManager only – agent/user lines are command lines by design).
// Key decisions (SPEC §4.3, §6.3, contract ProcessManager.run):
// - Windows default shell: `cmd.exe /d /s /c "chcp 65001>nul & <line>"` with windowsVerbatimArguments, so the line
//   reaches cmd.exe byte for byte (no Node re-quoting) and console tools emit UTF-8. The wrapper is never shown: the
//   stored/displayed command is the original line.
// - Windows terminal shell ('powershell'): `powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass
//   -EncodedCommand <base64 UTF-16LE>` (trusted user input; no quoting problems). The script forces UTF-8 output, no
//   progress records, and maps the line's success/exit code to the process exit code.
// - POSIX: `/bin/sh -c <line>` in its own process group (detached) so the whole tree can be signalled with kill(-pgid).
//   The 'powershell' shell selects the interactive user shell there (`bash -lc`, fallback `sh -c`) – the terminal's
//   counterpart of PowerShell on Windows.
// - Never `shell: true`; the shell is always spawned explicitly with an argv array.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export type ShellChoice = 'default' | 'powershell';

export interface SpawnSpec {
  file: string;
  args: string[];
  windowsVerbatimArguments: boolean;
  /** POSIX: own process group (kill(-pgid)). Always false on Windows (detached would open a new console). */
  detached: boolean;
  /** Display name of the shell, e.g. "cmd", "powershell", "sh", "bash". */
  shellName: string;
}

const PS_PREFIX =
  "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);$OutputEncoding=[Console]::OutputEncoding;$global:LASTEXITCODE=0";
// Exit code: a failing native command keeps its code; a failing cmdlet/statement gives 1; otherwise the last native code.
const PS_SUFFIX = 'if (-not $?) { if ($LASTEXITCODE) { exit $LASTEXITCODE }; exit 1 }\nexit $LASTEXITCODE';

/** The PowerShell script that runs one terminal line (exported for tests). */
export function powershellScript(line: string): string {
  return `${PS_PREFIX}\n${line}\n${PS_SUFFIX}`;
}

export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

/** cmd.exe path: %ComSpec%, else %SystemRoot%\System32\cmd.exe, else "cmd.exe" (PATH lookup). */
export function windowsCmdPath(env: Record<string, string | undefined>): string {
  const comspec = env.ComSpec ?? env.COMSPEC;
  if (comspec && /cmd\.exe$/i.test(comspec)) return comspec;
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir ?? env.WINDIR;
  return root ? `${root.replace(/[\\/]+$/, '')}\\System32\\cmd.exe` : 'cmd.exe';
}

/** powershell.exe path: %SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe, else "powershell.exe". */
export function windowsPowerShellPath(env: Record<string, string | undefined>): string {
  const root = env.SystemRoot ?? env.SYSTEMROOT ?? env.windir ?? env.WINDIR;
  return root ? `${root.replace(/[\\/]+$/, '')}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'powershell.exe';
}

let cachedBash: string | null | undefined;

/** Path of bash on POSIX systems (cached), or null. */
export function findBash(): string | null {
  if (cachedBash !== undefined) return cachedBash;
  cachedBash = null;
  for (const dir of ['/bin', '/usr/bin', '/usr/local/bin', '/opt/homebrew/bin']) {
    const p = join(dir, 'bash');
    if (existsSync(p)) {
      cachedBash = p;
      break;
    }
  }
  return cachedBash;
}

export interface BuildSpawnSpecOptions {
  platform: NodeJS.Platform;
  /** Environment used to locate cmd.exe/powershell.exe on Windows. */
  env: Record<string, string | undefined>;
  /** Override for tests; undefined = detect. null = no bash available. */
  bashPath?: string | null;
}

export function buildSpawnSpec(line: string, shell: ShellChoice, opts: BuildSpawnSpecOptions): SpawnSpec {
  if (opts.platform === 'win32') {
    if (shell === 'powershell') {
      return {
        file: windowsPowerShellPath(opts.env),
        args: ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(powershellScript(line))],
        windowsVerbatimArguments: false,
        detached: false,
        shellName: 'powershell',
      };
    }
    return {
      file: windowsCmdPath(opts.env),
      // /s strips exactly the outer quotes, so the line itself may contain quotes; /d skips AutoRun registry commands.
      args: ['/d', '/s', '/c', `"chcp 65001>nul & ${line}"`],
      windowsVerbatimArguments: true,
      detached: false,
      shellName: 'cmd',
    };
  }
  if (shell === 'powershell') {
    const bash = opts.bashPath === undefined ? findBash() : opts.bashPath;
    if (bash) return { file: bash, args: ['-lc', line], windowsVerbatimArguments: false, detached: true, shellName: 'bash' };
  }
  return { file: '/bin/sh', args: ['-c', line], windowsVerbatimArguments: false, detached: true, shellName: 'sh' };
}
