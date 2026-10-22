// The ONE place that builds environments for child processes (agent commands, terminal, git, checks, integrations,
// secret store). Removes secrets and Electron internals, forces non-interactive/UTF-8 behaviour and uses a fresh
// Windows PATH (so tools installed while NOVA runs are found).
import { execFile } from 'node:child_process';

const DROP_EXACT = /^(ELECTRON_RUN_AS_NODE|ELECTRON_NO_ATTACH_CONSOLE|ELECTRON_ENABLE_LOGGING|NODE_OPTIONS|NOVA_.*)$/i;
const DROP_SECRET = /(^|_)(API_?KEY|ACCESS_?KEY|SECRET(_ACCESS)?(_KEY)?|TOKEN|PASSWORD|PASSWD|CREDENTIALS?|PAT)($|_)/i;
const DROP_PREFIX = /^(ANTHROPIC_|OPENAI_|AZURE_OPENAI_)/i;
const KEEP = /^(SSH_AUTH_SOCK|GIT_ASKPASS)$/i;

let cachedWindowsPath: { value: string; at: number } | null = null;

/** True if an environment variable name must not reach child processes. */
export function isDroppedEnvVar(name: string): boolean {
  if (KEEP.test(name)) return false;
  return DROP_EXACT.test(name) || DROP_SECRET.test(name) || DROP_PREFIX.test(name);
}

/**
 * Re-reads the Machine+User PATH from the registry (via PowerShell) and merges entries that exist only in the
 * current process PATH. Cached for 60 s; call with force=true after installing tools.
 */
export function refreshWindowsPath(force = false): Promise<string | null> {
  if (process.platform !== 'win32') return Promise.resolve(null);
  if (!force && cachedWindowsPath && Date.now() - cachedWindowsPath.at < 60_000) return Promise.resolve(cachedWindowsPath.value);
  const script =
    "$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);" +
    "[Environment]::GetEnvironmentVariable('Path','Machine')+';'+[Environment]::GetEnvironmentVariable('Path','User')";
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 10_000, encoding: 'utf8' },
      (err, stdout) => {
        if (err) return resolve(cachedWindowsPath?.value ?? null);
        const seen = new Set<string>();
        const parts: string[] = [];
        for (const p of `${stdout.trim()};${process.env.Path ?? process.env.PATH ?? ''}`.split(';')) {
          const t = p.trim();
          if (!t) continue;
          const key = t.toLowerCase().replace(/[\\/]+$/, '');
          if (seen.has(key)) continue;
          seen.add(key);
          parts.push(t);
        }
        cachedWindowsPath = { value: parts.join(';'), at: Date.now() };
        resolve(cachedWindowsPath.value);
      },
    );
  });
}

export function invalidateWindowsPath(): void {
  cachedWindowsPath = null;
}

/** Environment for a child process: secret-free, non-interactive, UTF-8, English tool output, fresh PATH. */
export function buildChildEnv(extra: Record<string, string> = {}, platform: NodeJS.Platform = process.platform): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v === undefined || isDroppedEnvVar(k)) continue;
    env[k] = v;
  }
  Object.assign(env, {
    CI: '1',
    FORCE_COLOR: '0',
    NO_COLOR: '1',
    npm_config_yes: 'false', // npx never auto-installs unknown packages
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
    DOTNET_CLI_UI_LANGUAGE: 'en',
    VSLANG: '1033',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    GIT_TERMINAL_PROMPT: '0',
  });
  if (platform === 'win32' && cachedWindowsPath) {
    // Windows env keys are case-insensitive; normalise to a single Path entry.
    for (const k of Object.keys(env)) if (k.toLowerCase() === 'path') delete env[k];
    env.Path = cachedWindowsPath.value;
  }
  for (const [k, v] of Object.entries(extra)) env[k] = v;
  return env;
}
