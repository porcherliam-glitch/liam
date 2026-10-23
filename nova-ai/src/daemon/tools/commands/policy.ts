// CommandPolicy: decides whether an AGENT may run a command line (SPEC §6.3, fail-closed).
//
// Guarantees (binding):
//   (a) lines with control characters (CR, LF, NUL …) are blocked;
//   (b) a line is only auto-allowed when it contains NO shell metacharacters (& | < > ^ % ! ( ) ; $ `), has balanced
//       quotes and matches an allowlist prefix exactly (`line === p || line.startsWith(p + ' ')`).
// Everything else is best effort classification on a normalized copy (carets/quotes removed, lower-case, split at
// command separators): block list, admin, system changes, installs, security configuration, publishing, deletes,
// writes outside the project, network access, nested interpreters and the "taint" rule (running a file NOVA wrote in
// this task). Honest limit: cmd.exe/PowerShell expansion makes complete detection impossible – the block list can
// never be complete, which is why auto-allow is restricted to metacharacter-free lines.
import { posix, win32 } from 'node:path';
import type { ApprovalKind, ProjectConfig } from '@shared/schemas';
import type { CommandDecision, CommandPolicy, Services } from '../../contracts';

type CommandPolicyInput = Parameters<CommandPolicy['evaluate']>[0];
import { hostOf, isHostAllowed } from '../../core/net';

export interface CommandPolicyOptions {
  platform?: NodeJS.Platform;
}

const CONTROL_CHARS = /[\u0000-\u0008\u000A-\u001F\u007F]/;
const METACHARS = /[&|<>^%!();$`]/;
/** Bidi overrides/isolates, zero-width characters, word joiner, BOM, soft hyphen. */
const INVISIBLE_CHARS = /[\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/;

/** Approval kinds ordered by severity: the most severe classification wins. */
const KIND_ORDER: ApprovalKind[] = ['admin', 'security_config', 'system_change', 'install', 'publish', 'delete', 'outside_project', 'network', 'command'];

const CONSEQUENCES: Record<string, string> = {
  admin: 'Der Befehl würde mit Administratorrechten laufen und kann das ganze System verändern.',
  security_config: 'Der Befehl ändert sicherheitsrelevante Einstellungen (zum Beispiel Git-Konfiguration, Zugriffsrechte oder Virenschutz).',
  system_change: 'Der Befehl verändert das System außerhalb des Projekts (zum Beispiel global installierte Pakete oder Umgebungsvariablen).',
  install: 'Es wird Software auf dem PC installiert, aktualisiert oder entfernt.',
  publish: 'Daten oder Code werden ins Internet hochgeladen oder veröffentlicht. Das lässt sich oft nicht rückgängig machen.',
  delete: 'Dateien werden gelöscht oder nicht gespeicherte Änderungen verworfen. Das lässt sich möglicherweise nicht rückgängig machen.',
  outside_project: 'Der Befehl schreibt in einen Ordner außerhalb des Projekts.',
  network: 'Der Befehl lädt Daten aus dem Internet oder verbindet sich mit einem Ziel, das nicht freigegeben ist.',
  command: 'NOVA kennt diesen Befehl nicht oder er enthält Sonderzeichen (Verkettung oder Umleitung). Er läuft mit den Rechten Ihres Windows-Kontos.',
  taint: 'Führt eine Datei aus, die NOVA in dieser Aufgabe geschrieben hat. Der Inhalt läuft mit den Rechten Ihres Windows-Kontos.',
};

const NESTED_INTERPRETERS = new Set([
  'cmd', 'powershell', 'pwsh', 'wsl', 'bash', 'sh', 'zsh', 'start', 'call', 'conhost', 'mshta', 'rundll32', 'regsvr32',
  'cscript', 'wscript', 'certutil', 'bitsadmin', 'iex', 'invoke-expression', 'start-process', 'saps', 'eval', 'exec', 'xargs', 'env',
]);
const SCRIPT_RUNNERS = new Set(['node', 'nodejs', 'python', 'python3', 'py', 'deno', 'bun', 'tsx', 'ts-node', 'bash', 'sh', 'zsh', 'powershell', 'pwsh', 'ruby', 'perl', 'php']);
const WRITE_VERBS = new Set([
  'copy', 'xcopy', 'robocopy', 'move', 'mv', 'cp', 'copy-item', 'cpi', 'move-item', 'mi', 'new-item', 'ni', 'set-content', 'sc',
  'add-content', 'ac', 'out-file', 'mkdir', 'md', 'tee', 'tee-object', 'rename-item', 'ren', 'rename', 'install', 'ln', 'mklink',
]);
const BLOCK_FIRST = new Set(['format', 'diskpart', 'shutdown', 'bcdedit', 'vssadmin', 'netsh', 'set-executionpolicy', 'stop-computer', 'restart-computer', 'clear-disk', 'format-volume', 'initialize-disk', 'remove-partition', 'mkfs', 'dd', 'fdisk', 'reboot', 'poweroff', 'halt', 'init']);
const NETWORK_FIRST = new Set(['curl', 'wget', 'iwr', 'irm', 'invoke-webrequest', 'invoke-restmethod', 'start-bitstransfer', 'bitsadmin', 'scp', 'ssh', 'sftp', 'ftp', 'winget', 'telnet', 'nc', 'ncat', 'rsync']);

interface Segment {
  /** Normalized (lower-case, no carets/quotes) tokens. */
  tokens: string[];
  /** First token as basename without executable extension. */
  first: string;
  text: string;
}

function basenameNoExt(token: string): string {
  const base = token.split(/[\\/]/).pop() ?? token;
  return base.replace(/\.(exe|com|bat|cmd|ps1)$/i, '');
}

function balancedQuotes(line: string): boolean {
  let dq = 0;
  let sq = 0;
  for (const ch of line) {
    if (ch === '"') dq++;
    else if (ch === "'") sq++;
  }
  return dq % 2 === 0 && sq % 2 === 0;
}

function collapse(line: string): string {
  return line.trim().replace(/\s+/g, ' ');
}

/** Normalized classification copy split at command separators. */
export function segmentsOf(line: string): Segment[] {
  const norm = line.replace(/\^/g, '').replace(/"/g, ' ').toLowerCase();
  return norm
    .split(/&&|\|\||[&|;()\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text) => {
      const tokens = text.split(/\s+/).filter(Boolean);
      // skip leading "@" (cmd echo-off) and env assignments like FOO=1 (POSIX)
      while (tokens.length > 1 && (/^@/.test(tokens[0]) || /^[a-z_][a-z0-9_]*=/.test(tokens[0]))) {
        if (/^@/.test(tokens[0]) && tokens[0].length > 1) tokens[0] = tokens[0].slice(1);
        else tokens.shift();
      }
      return { tokens, first: basenameNoExt(tokens[0] ?? ''), text };
    });
}

function hasFlag(tokens: string[], ...flags: string[]): boolean {
  return tokens.some((t) => flags.includes(t));
}

function isEncodedPowerShellFlag(token: string): boolean {
  const m = /^[-/](.+)$/.exec(token);
  if (!m) return false;
  const name = m[1];
  if (name === 'ec') return true;
  if ('encodedcommand'.startsWith(name) && name.startsWith('e') && name.length >= 1) {
    // "-e", "-en", "-enc", ... – but not "-ex" (ExecutionPolicy) or "-ea"
    return true;
  }
  return name.length >= 8 && 'encodedarguments'.startsWith(name);
}

export function createCommandPolicy(s: Services, opts: CommandPolicyOptions = {}): CommandPolicy {
  const platformOf = () => opts.platform ?? s.core.platform;

  function looksAbsolute(token: string, platform: NodeJS.Platform): boolean {
    if (platform === 'win32') return /^[a-z]:[\\/]/i.test(token) || /^[\\/]{2}/.test(token) || /^%(windir|systemroot|programfiles|programdata|appdata|localappdata|userprofile)%/i.test(token);
    return posix.isAbsolute(token) || token.startsWith('~');
  }

  /**
   * True when a path argument (absolute, drive-relative "\x" or relative with "..") points outside the project root.
   * Resolved lexically against the root with the platform's path rules ("C:\p\..\x" and "..\x" both escape).
   */
  function escapesProject(token: string, root: string, platform: NodeJS.Platform): boolean {
    const v = token.replace(/^["']|["']$/g, '');
    if (!v) return false;
    if (platform === 'win32') {
      if (/^[\\/]{2}/.test(v) || /^%[^%]+%/.test(v)) return true; // UNC/device paths, %VAR%\…
    } else if (v === '~' || v.startsWith('~/')) {
      return true;
    }
    const p = platform === 'win32' ? win32 : posix;
    const base = p.resolve(root);
    const rel = p.relative(base, p.resolve(base, v));
    return rel === '..' || rel.startsWith(`..${p.sep}`) || p.isAbsolute(rel);
  }

  function insideProject(token: string, root: string, platform: NodeJS.Platform): boolean {
    return !escapesProject(token, root, platform);
  }

  /** cmd.exe switches like /s, /q, /y:… are options, not paths. */
  function isWindowsSwitch(token: string, platform: NodeJS.Platform): boolean {
    return platform === 'win32' && /^\/[a-z?]{1,4}(:.*)?$/i.test(token);
  }

  function allowlist(config: ProjectConfig): string[] {
    const global = s.core.settings.section('permissions').commandAllowlist;
    return [...global, ...config.allowedCommands].map((p) => collapse(p)).filter(Boolean);
  }

  function matchesAllowlist(line: string, prefixes: string[], platform: NodeJS.Platform): boolean {
    const fold = (v: string) => {
      if (platform !== 'win32') return v;
      const i = v.indexOf(' ');
      return i === -1 ? v.toLowerCase() : v.slice(0, i).toLowerCase() + v.slice(i);
    };
    const l = fold(line);
    return prefixes.some((raw) => {
      const p = fold(raw);
      return l === p || l.startsWith(p + ' ');
    });
  }

  function hostContext() {
    const allowedHosts = s.core.settings.section('network').allowedHosts;
    let extraUrls: string[] = [];
    try {
      extraUrls = s.providers.list().filter((p) => p.enabled).map((p) => p.baseUrl);
    } catch {
      extraUrls = [];
    }
    return { allowedHosts, extraUrls };
  }

  function extractHosts(line: string): string[] {
    const hosts = new Set<string>();
    for (const m of line.matchAll(/\b(?:https?|ftp|wss?):\/\/[^\s'"<>|&]+/gi)) {
      const h = hostOf(m[0]);
      if (h) hosts.add(h);
    }
    for (const m of line.matchAll(/\bgit@([A-Za-z0-9.-]+):/g)) hosts.add(m[1].toLowerCase());
    return [...hosts];
  }

  function taintedKeys(projectId: string, taskId: string | null): Set<string> {
    if (!taskId) return new Set();
    try {
      const changes = s.journal.list({ projectId, taskId, limit: 5000 });
      const keys = new Set<string>();
      // compared case-insensitively on every platform (errs on the side of asking)
      for (const c of changes) if (c.actor === 'nova' && !c.reverted && c.op !== 'delete') keys.add(c.path.replace(/\\/g, '/').toLowerCase());
      return keys;
    } catch {
      return new Set();
    }
  }

  function tokenKey(projectRoot: string, token: string): string | null {
    const clean = token.replace(/^["']|["']$/g, '');
    if (!clean || clean.startsWith('-') || clean.startsWith('/') && platformOf() === 'win32' && clean.length <= 3) return null;
    try {
      return s.pathGuard.resolve(projectRoot, clean).key;
    } catch {
      return null;
    }
  }

  function blockReason(line: string, segs: Segment[], projectRoot: string, platform: NodeJS.Platform): string | null {
    const lower = line.toLowerCase();
    if (/:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:/.test(line) || /%0\s*\|\s*%0/.test(line)) return 'Prozess-Endlosschleife (Forkbomb) erkannt.';
    if (/\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|]*\|\s*(sh|bash|zsh|iex|invoke-expression|powershell|pwsh|python|node)\b/i.test(line)) {
      return 'Aus dem Internet geladene Inhalte würden direkt ausgeführt.';
    }
    for (const seg of segs) {
      const { first, tokens } = seg;
      if ((first === 'powershell' || first === 'pwsh') && tokens.slice(1).some(isEncodedPowerShellFlag)) return 'Verschlüsselte PowerShell-Befehle sind nicht erlaubt.';
      if (BLOCK_FIRST.has(first)) return `Der Befehl „${first}“ ist für Agenten gesperrt (Systemeingriff).`;
      if (first === 'reg' && hasFlag(tokens, 'add', 'delete', 'import', 'restore', 'load', 'unload')) return 'Änderungen an der Windows-Registrierung sind für Agenten gesperrt.';
      if (first === 'sc' && platform === 'win32' && hasFlag(tokens, 'config', 'delete', 'create', 'stop', 'failure')) return 'Änderungen an Windows-Diensten sind für Agenten gesperrt.';
      if (first === 'schtasks' && tokens.some((t) => /^[/-](create|change|delete)$/.test(t))) return 'Geplante Aufgaben dürfen von Agenten nicht verändert werden.';
      if (first === 'cipher' && tokens.some((t) => /^[/-]w/.test(t))) return 'Sicheres Überschreiben von Datenträgern ist gesperrt.';
      if ((first === 'del' || first === 'erase' || first === 'rd' || first === 'rmdir') && tokens.some((t) => /^[/-]s$/.test(t))) {
        if (tokens.some((t) => /^[a-z]:[\\/]?\*?$/.test(t) || t === '\\' || t === '/')) return 'Rekursives Löschen eines ganzen Laufwerks ist gesperrt.';
      }
      if (first === 'rm' && tokens.some((t) => /^-[a-z]*r/.test(t) || t === '--recursive')) {
        if (tokens.some((t) => t === '/' || t === '/*' || t === '~' || t === '~/' || t === '$home' || /^[a-z]:[\\/]?\*?$/.test(t))) return 'Rekursives Löschen des Systems oder Benutzerordners ist gesperrt.';
      }
      const recursive = tokens.some((t) => t === '-recurse' || t === '-r' || t === '--recursive' || /^-[a-z]*r[a-z]*$/.test(t) || /^[/-]s$/.test(t));
      if (['remove-item', 'ri', 'rm', 'del', 'erase', 'rmdir', 'rd', 'rimraf'].includes(first) && recursive) {
        const targets = tokens.slice(1).filter((t) => !t.startsWith('-') && !isWindowsSwitch(t, platform));
        if (targets.some((t) => escapesProject(t, projectRoot, platform))) return 'Rekursives Löschen außerhalb des Projektordners ist gesperrt.';
      }
    }
    if (/(c:[\\/]windows|%windir%|%systemroot%|\$env:windir|\$env:systemroot)/i.test(lower)) {
      if (/>/.test(line) || segs.some((g) => WRITE_VERBS.has(g.first) || ['del', 'erase', 'rd', 'rmdir', 'remove-item', 'rm'].includes(g.first))) {
        return 'Schreibzugriffe auf den Windows-Systemordner sind gesperrt.';
      }
    }
    return null;
  }

  function classify(line: string, segs: Segment[], input: { projectRoot: string; projectId: string; taskId: string | null }, platform: NodeJS.Platform): Map<ApprovalKind, string> {
    const found = new Map<ApprovalKind, string>();
    const add = (kind: ApprovalKind, reason: string) => {
      if (!found.has(kind)) found.set(kind, reason);
    };
    const network = s.core.settings.section('network');

    for (const seg of segs) {
      const { first, tokens } = seg;
      const sub = tokens[1] ?? '';
      // admin
      if (first === 'runas' || first === 'sudo' || first === 'gsudo' || first === 'doas' || /-verb\s+runas/.test(seg.text)) add('admin', 'Der Befehl fordert Administratorrechte an.');
      // nested interpreters / inline code
      if (NESTED_INTERPRETERS.has(first)) add('command', `„${first}“ startet eine weitere Kommandozeile oder führt Code indirekt aus.`);
      if ((first === 'node' || first === 'nodejs' || first === 'deno' || first === 'bun') && tokens.some((t) => ['-e', '--eval', '-p', '--print'].includes(t))) add('command', 'Der Befehl führt Programmcode direkt aus der Befehlszeile aus.');
      if ((first === 'python' || first === 'python3' || first === 'py' || first === 'ruby' || first === 'perl') && tokens.includes('-c')) add('command', 'Der Befehl führt Programmcode direkt aus der Befehlszeile aus.');
      if (/^[%!]/.test(tokens[0] ?? '')) add('command', 'Der Befehlsname wird aus einer Variable gebildet.');
      // system changes / installs
      if (['npm', 'pnpm', 'yarn', 'bun'].includes(first) && (hasFlag(tokens, '-g', '--global', '--location=global') || (first === 'yarn' && sub === 'global'))) add('system_change', 'Pakete würden global für den ganzen PC installiert.');
      if (first === 'setx' || /\[environment\]::setenvironmentvariable/.test(seg.text) || (first === 'set-itemproperty' && /hk(lm|cu):/.test(seg.text))) add('system_change', 'Systemweite Umgebungsvariablen oder Einstellungen würden geändert.');
      if (['winget', 'choco', 'scoop', 'msiexec'].includes(first) || (first === 'apt' || first === 'apt-get' || first === 'brew' || first === 'dnf' || first === 'yum' || first === 'pacman')) add('install', `Software würde mit „${first}“ installiert oder entfernt.`);
      if ((first === 'pip' || first === 'pip3') && sub === 'install' && !hasFlag(tokens, '--user', '-t', '--target')) add('system_change', 'Python-Pakete würden möglicherweise systemweit installiert.');
      if ((first === 'python' || first === 'py' || first === 'python3') && tokens[1] === '-m' && (tokens[2] === 'pip') && tokens[3] === 'install' && !hasFlag(tokens, '--user', '-t', '--target')) add('system_change', 'Python-Pakete würden möglicherweise systemweit installiert.');
      // security configuration
      if (first === 'git' && sub === 'config' && hasFlag(tokens, '--global', '--system')) add('security_config', 'Die globale Git-Konfiguration würde geändert.');
      if (['npm', 'pnpm', 'yarn'].includes(first) && sub === 'config' && hasFlag(tokens, 'set', 'delete')) add('security_config', 'Die Paketmanager-Konfiguration würde geändert.');
      if (['set-mppreference', 'add-mppreference', 'remove-mppreference', 'icacls', 'takeown', 'cacls', 'chmod', 'chown', 'attrib', 'set-acl'].includes(first)) {
        if (!(first === 'chmod' && insideOnly(tokens, input.projectRoot, platform)) && !(first === 'attrib' && !tokens.some((t) => /^[+-][rshai]$/.test(t)))) {
          add('security_config', 'Zugriffsrechte oder Virenschutz-Einstellungen würden geändert.');
        }
      }
      if (/drivers[\\/]etc[\\/]hosts|\/etc\/hosts/.test(seg.text)) add('security_config', 'Die hosts-Datei des Systems würde verändert.');
      // publish
      if (first === 'git' && sub === 'push') add('publish', 'Änderungen würden zu einem entfernten Git-Server hochgeladen.');
      if (['npm', 'pnpm', 'yarn'].includes(first) && sub === 'publish') add('publish', 'Ein Paket würde veröffentlicht.');
      if (first === 'docker' && sub === 'push') add('publish', 'Ein Container-Image würde hochgeladen.');
      if ((first === 'dotnet' && sub === 'nuget' && tokens[2] === 'push') || (first === 'nuget' && sub === 'push') || (first === 'twine' && sub === 'upload') || (first === 'gh' && ['release', 'gist', 'repo'].includes(sub))) add('publish', 'Daten würden veröffentlicht oder hochgeladen.');
      if (first === 'scp' || (first === 'rsync' && tokens.some((t) => /^[^/\\]+:/.test(t)))) add('publish', 'Dateien würden auf einen anderen Rechner kopiert.');
      if ((first === 'curl') && tokens.some((t) => ['-t', '--upload-file', '-f', '--form', '--data-binary', '-d', '--data'].includes(t))) add('publish', 'Daten würden an einen Server gesendet.');
      // delete / discard
      if (first === 'rm' || first === 'rimraf' || first === 'del' || first === 'erase' || first === 'remove-item' || first === 'ri' || first === 'rd' || first === 'rmdir' || first === 'clear-content' || first === 'shred' || first === 'unlink') add('delete', 'Dateien oder Ordner würden gelöscht.');
      if (first === 'git') {
        if (sub === 'clean' || sub === 'reset' || sub === 'restore' || sub === 'rm') add('delete', `„git ${sub}“ kann Dateien oder nicht gespeicherte Änderungen verwerfen.`);
        if (sub === 'stash' && !['list', 'show'].includes(tokens[2] ?? 'push')) add('delete', '„git stash“ entfernt Änderungen aus dem Arbeitsverzeichnis.');
        if (sub === 'checkout' && tokens.some((t) => t === '-f' || t === '--force' || t === '--' || t === '.')) add('delete', '„git checkout“ würde nicht gespeicherte Änderungen verwerfen.');
        if (sub === 'switch' && tokens.some((t) => t === '-f' || t === '--force' || t === '--discard-changes')) add('delete', '„git switch“ würde nicht gespeicherte Änderungen verwerfen.');
      }
      // outside project (write targets)
      if (WRITE_VERBS.has(first)) {
        const targets = tokens.slice(1).filter((t) => !t.startsWith('-') && !isWindowsSwitch(t, platform));
        if (targets.some((t) => escapesProject(t, input.projectRoot, platform))) add('outside_project', 'Der Befehl schreibt in einen Ordner außerhalb des Projekts.');
      }
      // network
      const npmNet = ['npm', 'pnpm', 'yarn', 'bun'].includes(first) && (['install', 'i', 'ci', 'add', 'update', 'upgrade', 'up', 'dlx', 'create', 'exec', 'x'].includes(sub) || (first === 'yarn' && tokens.length === 1));
      const gitNet = first === 'git' && ['clone', 'fetch', 'pull', 'ls-remote', 'submodule', 'remote'].includes(sub);
      const otherNet =
        NETWORK_FIRST.has(first) ||
        (first === 'certutil' && tokens.includes('-urlcache')) ||
        ((first === 'pip' || first === 'pip3') && ['install', 'download'].includes(sub)) ||
        (first === 'dotnet' && (sub === 'restore' || (sub === 'add' && tokens.includes('package')))) ||
        (first === 'npx' && hasFlag(tokens, '-y', '--yes'));
      if ((npmNet || gitNet || otherNet) && !network.allowAgentNetwork) add('network', 'Der Befehl greift auf das Internet zu und Netzwerkzugriff für Agenten ist ausgeschaltet.');
    }
    // redirection to absolute paths outside the project
    for (const m of line.matchAll(/(?:^|[^>])>{1,2}\s*("?)([^\s"&|]+)\1/g)) {
      const target = m[2];
      if (!/^(nul|\/dev\/null)$/i.test(target) && escapesProject(target, input.projectRoot, platform)) {
        add('outside_project', 'Die Ausgabe würde in eine Datei außerhalb des Projekts geschrieben.');
      }
    }
    return found;
  }

  function insideOnly(tokens: string[], root: string, platform: NodeJS.Platform): boolean {
    const targets = tokens.slice(1).filter((t) => !t.startsWith('-') && !/^[0-7]{3,4}$/.test(t) && !/^[ugoa]*[+-=][rwxX]+$/.test(t));
    return targets.every((t) => insideProject(t, root, platform));
  }

  /** Extensions a runner or the Windows shell adds implicitly ("node build" → build.js, "tools\\run" → run.cmd). */
  const IMPLICIT_EXT = /\.(js|mjs|cjs|ts|mts|cts|py|pyw|sh|bash|ps1|psm1|cmd|bat|exe|com|vbs|rb|pl|php)$/i;

  function runsTaintedFile(input: CommandPolicyInput, segs: Segment[]): boolean {
    const keys = taintedKeys(input.projectId, input.taskId);
    if (keys.size === 0) return false;
    // stems: tainted files without extension, plus package folders whose index/__main__ was written
    const stems = new Set<string>();
    for (const k of keys) {
      if (!IMPLICIT_EXT.test(k)) continue;
      stems.add(k.replace(IMPLICIT_EXT, ''));
      const dir = /^(.*)\/(?:index\.[cm]?[jt]s|__main__\.py)$/.exec(k);
      if (dir) stems.add(dir[1]);
    }
    const hit = (token: string): boolean => {
      const key = tokenKey(input.projectRoot, token)?.toLowerCase();
      return !!key && (keys.has(key) || stems.has(key));
    };
    for (const seg of segs) {
      const t = seg.tokens;
      const firstIsRunner = SCRIPT_RUNNERS.has(seg.first);
      for (let i = 0; i < t.length; i++) {
        const tok = t[i];
        if (i === 0) {
          // direct execution of a file in the project ("build.cmd", "./run.sh", "tools\\run"; cmd.exe also searches
          // the current folder first, so "npm" would run a project-local npm.cmd)
          if (hit(tok)) return true;
          continue;
        }
        if (!firstIsRunner) continue;
        // "python -m pkg.mod" → pkg/mod.py or pkg/mod/__main__.py
        if (t[i - 1] === '-m' && /^python|^py$/.test(seg.first) && hit(tok.replace(/\./g, '/'))) return true;
        if (hit(tok)) return true;
      }
    }
    return false;
  }

  /** Splits a metacharacter-free line into arguments, honouring quotes (paths with spaces stay one argument). */
  function argTokens(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quote: string | null = null;
    let quoted = false;
    for (const ch of line) {
      if (quote) {
        if (ch === quote) quote = null;
        else cur += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        quoted = true;
        continue;
      }
      if (ch === ' ') {
        if (cur || quoted) out.push(cur);
        cur = '';
        quoted = false;
        continue;
      }
      cur += ch;
    }
    if (cur || quoted) out.push(cur);
    return out;
  }

  /**
   * Arguments of an otherwise auto-allowed line that point outside the project or at protected files (.env …), and
   * options of allow-listed tools that read or write arbitrary files ("git diff --no-index", "--output=…").
   */
  function argumentIssue(line: string, root: string, platform: NodeJS.Platform): { kind: ApprovalKind; reason: string; consequences: string } | null {
    const toks = argTokens(line);
    if (basenameNoExt((toks[0] ?? '').toLowerCase()) === 'git' && toks.some((t) => /^--(no-index|output|ext-diff)(=|$)/i.test(t))) {
      return {
        kind: 'command',
        reason: '„git“ mit --no-index, --output oder --ext-diff kann Dateien außerhalb der Versionsverwaltung lesen oder schreiben.',
        consequences: CONSEQUENCES.command,
      };
    }
    for (const tok of toks.slice(1)) {
      if (isWindowsSwitch(tok, platform)) continue;
      let value = tok;
      if (tok.startsWith('-')) {
        const eq = tok.indexOf('=');
        if (eq === -1) continue;
        value = tok.slice(eq + 1);
      }
      if (!value || /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) continue; // URLs are handled by the host rules
      if (escapesProject(value, root, platform)) {
        return {
          kind: 'outside_project',
          reason: `Der Befehl verweist auf „${value}“ außerhalb des Projektordners.`,
          consequences: 'Der Befehl kann Dateien außerhalb des Projekts lesen oder dorthin schreiben.',
        };
      }
      if (isSensitiveArg(root, value)) {
        return {
          kind: 'command',
          reason: `Der Befehl greift auf die geschützte Datei „${value}“ zu (zum Beispiel Zugangsdaten).`,
          consequences: 'Der Inhalt der Datei kann in der Ausgabe erscheinen und an das KI-Modell gehen.',
        };
      }
    }
    return null;
  }

  function isSensitiveArg(root: string, value: string): boolean {
    try {
      return s.pathGuard.isSensitive(s.pathGuard.resolve(root, value).rel);
    } catch {
      return false; // not a valid project path (reserved name, invalid characters …)
    }
  }

  return {
    evaluate(input): CommandDecision {
      const platform = platformOf();
      const raw = input.command ?? '';
      if (!raw.trim()) return { action: 'block', reason: 'Leerer Befehl.' };
      if (CONTROL_CHARS.test(raw)) return { action: 'block', reason: 'Steuerzeichen im Befehl (zum Beispiel Zeilenumbrüche) sind nicht erlaubt.' };
      // Text-direction overrides and zero-width characters can make an approval card show something else than what
      // runs (e.g. "bericht<U+202E>fdp.bat" looks like "berichttab.pdf"). No real command needs them.
      if (INVISIBLE_CHARS.test(raw)) return { action: 'block', reason: 'Der Befehl enthält unsichtbare Unicode-Zeichen (Schreibrichtungs- oder Nullbreitenzeichen), die den angezeigten Text verfälschen können.' };
      const line = collapse(raw.replace(/\t/g, ' '));
      const subject = line;
      const segs = segmentsOf(line);

      const blocked = blockReason(line, segs, input.projectRoot, platform);
      if (blocked) return { action: 'block', reason: blocked };

      const found = classify(line, segs, input, platform);

      // URL hosts that are not allowed (checked below, after the other rules).
      const ctx = hostContext();
      const badHost = extractHosts(line).find((h) => !isHostAllowed(`https://${h}/`, ctx));

      // taint rule: running a file NOVA wrote in this task (also without extension: "node build" → build.js)
      const taint = runsTaintedFile(input, segs);

      // classes that outrank network and the generic 'command' class
      for (const kind of KIND_ORDER) {
        if (kind === 'network' || kind === 'command') continue;
        const reason = found.get(kind);
        if (reason) return { action: 'approve', kind, reason, consequences: CONSEQUENCES[kind], subject };
      }
      if (found.has('network')) return { action: 'approve', kind: 'network', reason: found.get('network')!, consequences: CONSEQUENCES.network, subject };

      const metaFree = !METACHARS.test(line) && balancedQuotes(line);
      const allowlisted = metaFree && matchesAllowlist(line, allowlist(input.config), platform);
      const approveUnknown = s.core.settings.section('permissions').approveUnknownCommands;

      // Anything that keeps the line from being auto-allowed, in priority order.
      let other: { kind: ApprovalKind; reason: string; consequences: string } | null = null;
      if (taint) other = { kind: 'command', reason: 'Der Befehl führt eine Datei aus, die NOVA in dieser Aufgabe geschrieben hat.', consequences: CONSEQUENCES.taint };
      else if (found.has('command')) other = { kind: 'command', reason: found.get('command')!, consequences: CONSEQUENCES.command };
      else if (!metaFree) other = { kind: 'command', reason: 'Der Befehl enthält Verkettungen, Umleitungen oder Variablen und wird deshalb nie automatisch erlaubt.', consequences: CONSEQUENCES.command };
      else other = argumentIssue(line, input.projectRoot, platform);
      if (!other && !allowlisted && approveUnknown) other = { kind: 'command', reason: 'Dieser Befehl steht nicht auf der Liste erlaubter Befehle.', consequences: CONSEQUENCES.command };

      if (badHost) {
        // Host-scoped approval (an "always" rule then covers connections to this host) ONLY when the line itself would
        // run without asking. Otherwise the approval names the whole line, so a rule for a host can never wave through
        // a different, unknown, chained or self-written command later.
        if (!other) return { action: 'approve', kind: 'network', reason: `Verbindung zu „${badHost}“ ist nicht freigegeben.`, consequences: CONSEQUENCES.network, subject: badHost };
        return { action: 'approve', kind: 'network', reason: `Verbindung zu „${badHost}“ ist nicht freigegeben. Außerdem: ${other.reason}`, consequences: `${CONSEQUENCES.network} ${other.consequences}`, subject };
      }
      if (other) return { action: 'approve', ...other, subject };
      if (allowlisted) return { action: 'allow', reason: 'Befehl steht auf der Liste erlaubter Befehle.' };
      return { action: 'allow', reason: 'Unbekannte einfache Befehle sind laut Einstellungen erlaubt.' };
    },
  };
}
