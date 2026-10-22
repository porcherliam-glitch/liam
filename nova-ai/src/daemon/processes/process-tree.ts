// Process-tree identification and termination for ProcessManager (kill, timeout, abort, shutdown, recoverOrphans).
// Key decisions (SPEC §4.3 / §6.3):
// - Process identity is (pid, OS creation time). A recorded process matches when its creation time lies within
//   [started_at − 2 s, started_at + 5 s] (started_at is written immediately before spawn).
// - Windows: ONE `Get-CimInstance Win32_Process | Select ProcessId,ParentProcessId,Name,CreationDate(UTC ISO) |
//   ConvertTo-Json` query per kill batch (runs through runPowerShell: UTF-8, -EncodedCommand). Never wmic, never
//   localized tasklist text. Descendants follow ParentProcessId with creation time ≥ the parent's creation time (a
//   reused parent pid cannot adopt older processes). Killing is leaves-first with `taskkill /pid N /F`, judged by exit
//   code (0 = killed, 128 = already gone). Roots that already exited are handled: their surviving children are found
//   by ParentProcessId + creation time ≥ started_at − 2 s (and older than an impostor that reused the pid).
//   If the CIM query fails, own still-running roots fall back to `taskkill /pid N /T /F`; recorded (orphan) trees are
//   then left alone because their identity cannot be verified.
// - POSIX: children run in their own process group (detached spawn), so a tree is signalled with kill(-pgid):
//   SIGTERM, then SIGKILL after the grace period (default 3 s). Identity comes from /proc/<pid>/stat field 22
//   (start time in clock ticks) + btime from /proc/stat; macOS/BSD fall back to `ps -o lstart=` (LC_ALL=C). A group
//   whose leader has exited is only signalled when members started after started_at − 2 s still exist (pids that
//   serve as a pgid are not reused while the group exists).
// - The daemon's own pid is never killed.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { win32 as winPath } from 'node:path';
import type { Logger } from '../core/logger';
import { execTool, runPowerShell, type ExecToolResult } from '../core/exec';
import { buildChildEnv } from '../core/child-env';
import { errorMessage } from '../core/errors';

export const IDENTITY_BEFORE_MS = 2000;
export const IDENTITY_AFTER_MS = 5000;

export interface TreeTarget {
  pid: number;
  /** started_at of the processes row (ms, recorded immediately before spawn). */
  startedAt: number;
}

export interface OwnTreeTarget extends TreeTarget {
  /** The root has not been reaped yet (its pid cannot have been reused). */
  alive: boolean;
}

/** Injectable command runner (tests fake the Windows commands). */
export interface ProcessTreeRunner {
  powershell(script: string, timeoutMs: number): Promise<ExecToolResult>;
  exec(file: string, args: string[], timeoutMs: number): Promise<ExecToolResult>;
}

export interface ProcessTree {
  /** Kills the trees of processes started by THIS daemon instance (root alive or already exited). */
  killOwn(targets: OwnTreeTarget[]): Promise<void>;
  /** Kills trees recorded by another instance after the identity check. Result per target: a matching tree existed. */
  killRecorded(targets: TreeTarget[]): Promise<boolean[]>;
}

export interface ProcessTreeOptions {
  platform: NodeJS.Platform;
  log: Logger;
  runner?: ProcessTreeRunner;
  /** POSIX: SIGTERM → SIGKILL delay (default 3000 ms). */
  graceMs?: number;
  /** POSIX: /proc mount (tests). */
  procRoot?: string;
  /** Never killed (default process.pid). */
  selfPid?: number;
}

export const defaultTreeRunner: ProcessTreeRunner = {
  powershell: (script, timeoutMs) => runPowerShell(script, { timeoutMs }),
  exec: (file, args, timeoutMs) => execTool(file, args, { timeoutMs }),
};

export function createProcessTree(opts: ProcessTreeOptions): ProcessTree {
  return opts.platform === 'win32' ? createWindowsTree(opts) : createPosixTree(opts);
}

// =====================================================================================================================
// Windows
// =====================================================================================================================

export interface WinProc {
  pid: number;
  ppid: number;
  name: string;
  /** Creation time (ms, UTC) or null for system pseudo-processes. */
  created: number | null;
}

export const CIM_PROCESS_SCRIPT =
  "$list = @(Get-CimInstance -ClassName Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{Name='CreationDate';Expression={ if ($_.CreationDate) { $_.CreationDate.ToUniversalTime().ToString('o') } else { $null } }});" +
  'ConvertTo-Json -InputObject $list -Compress -Depth 2';

/** Parses an ISO timestamp with up to 7 fractional digits (PowerShell 'o' format). */
export function parseIsoMs(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(value.trim());
  if (!m) {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  const frac = (m[2] ?? '').padEnd(3, '0').slice(0, 3);
  const t = Date.parse(`${m[1]}.${frac}${m[3] ?? 'Z'}`);
  return Number.isFinite(t) ? t : null;
}

/** Parses the ConvertTo-Json output of CIM_PROCESS_SCRIPT (array or single object). Throws on malformed JSON. */
export function parseCimProcesses(stdout: string): WinProc[] {
  const text = stdout.replace(/^﻿/, '').trim();
  if (!text) return [];
  const raw: unknown = JSON.parse(text);
  const items = Array.isArray(raw) ? raw : [raw];
  const out: WinProc[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const pid = Number(r.ProcessId);
    const ppid = Number(r.ParentProcessId);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    out.push({ pid, ppid: Number.isInteger(ppid) ? ppid : 0, name: typeof r.Name === 'string' ? r.Name : '', created: parseIsoMs(r.CreationDate) });
  }
  return out;
}

export interface WindowsKillPlan {
  /** A process (root or surviving children) belonging to the target was found. */
  found: boolean;
  /** Pids to kill, leaves first (root last when alive). */
  pids: number[];
  rootName: string | null;
}

/**
 * Pure planning step: which processes belong to the target tree?
 * mode 'own-alive': the root is our not-yet-reaped child → matched by pid alone.
 * otherwise: root must match pid + creation window; if it is gone, surviving children (ppid = pid, created within/after
 * the window and before an impostor that reused the pid) are the tree roots.
 */
export function planWindowsKill(procs: WinProc[], target: TreeTarget, mode: 'own-alive' | 'identity', selfPid: number): WindowsKillPlan {
  const children = new Map<number, WinProc[]>();
  for (const p of procs) {
    if (p.pid === p.ppid) continue; // System Idle Process (0/0) and similar
    let list = children.get(p.ppid);
    if (!list) children.set(p.ppid, (list = []));
    list.push(p);
  }
  const lo = target.startedAt - IDENTITY_BEFORE_MS;
  const hi = target.startedAt + IDENTITY_AFTER_MS;
  const withPid = procs.find((p) => p.pid === target.pid) ?? null;
  let root: WinProc | null = null;
  if (withPid) {
    if (mode === 'own-alive') root = withPid;
    else if (withPid.created !== null && withPid.created >= lo && withPid.created <= hi) root = withPid;
  }
  const order: number[] = [];
  const visited = new Set<number>();
  const visit = (p: WinProc): void => {
    if (visited.has(p.pid)) return;
    visited.add(p.pid);
    for (const c of children.get(p.pid) ?? []) {
      if (c.created === null || p.created === null || c.created < p.created) continue;
      visit(c);
    }
    if (p.pid !== selfPid && p.pid > 4) order.push(p.pid);
  };
  if (root) {
    visit(root);
  } else {
    const impostor = withPid;
    const orphans = (children.get(target.pid) ?? []).filter(
      (c) => c.created !== null && c.created >= lo && (impostor === null || impostor.created === null || c.created < impostor.created),
    );
    for (const c of orphans) visit(c);
  }
  return { found: order.length > 0, pids: order, rootName: root?.name ?? null };
}

function createWindowsTree(opts: ProcessTreeOptions): ProcessTree {
  const runner = opts.runner ?? defaultTreeRunner;
  const log = opts.log;
  const selfPid = opts.selfPid ?? process.pid;
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT ?? process.env.windir;
  // Absolute path when known: a broken PATH must not prevent killing processes.
  const taskkillExe = systemRoot ? winPath.join(systemRoot, 'System32', 'taskkill.exe') : 'taskkill.exe';

  async function snapshot(): Promise<WinProc[] | null> {
    try {
      const r = await runner.powershell(CIM_PROCESS_SCRIPT, 30_000);
      if (r.code !== 0) {
        log.warn('Prozessliste (CIM) nicht verfügbar', { code: r.code, stderr: r.stderr.slice(0, 500) });
        return null;
      }
      return parseCimProcesses(r.stdout);
    } catch (e) {
      log.warn('Prozessliste (CIM) nicht verfügbar', { error: errorMessage(e) });
      return null;
    }
  }

  async function taskkill(args: string[]): Promise<boolean> {
    try {
      const r = await runner.exec(taskkillExe, args, 15_000);
      // 0 = terminated, 128 = no such process (already gone): both mean the process no longer runs.
      if (r.code === 0 || r.code === 128) return true;
      log.warn('Prozess konnte nicht beendet werden', { args, code: r.code, stderr: r.stderr.slice(0, 300) });
      return false;
    } catch (e) {
      log.warn('taskkill fehlgeschlagen', { args, error: errorMessage(e) });
      return false;
    }
  }

  async function killPids(pids: number[]): Promise<void> {
    for (const pid of pids) {
      if (pid === selfPid) continue;
      await taskkill(['/pid', String(pid), '/F']);
    }
  }

  return {
    async killOwn(targets) {
      if (targets.length === 0) return;
      const procs = await snapshot();
      if (!procs) {
        // Fallback without identity data: only roots that are still our running children can be killed safely.
        for (const t of targets) if (t.alive && t.pid !== selfPid) await taskkill(['/pid', String(t.pid), '/T', '/F']);
        return;
      }
      for (const t of targets) {
        const plan = planWindowsKill(procs, t, t.alive ? 'own-alive' : 'identity', selfPid);
        await killPids(plan.pids);
      }
    },

    async killRecorded(targets) {
      if (targets.length === 0) return [];
      const procs = await snapshot();
      if (!procs) return targets.map(() => false);
      const result: boolean[] = [];
      for (const t of targets) {
        const plan = planWindowsKill(procs, t, 'identity', selfPid);
        if (plan.found) {
          log.info('Verwaisten Prozessbaum gefunden', { pid: t.pid, root: plan.rootName, processes: plan.pids.length });
          await killPids(plan.pids);
        }
        result.push(plan.found);
      }
      return result;
    },
  };
}

// =====================================================================================================================
// POSIX
// =====================================================================================================================

export interface PosixProc {
  pid: number;
  pgid: number;
  /** Creation time in ms (null if unknown). */
  start: number | null;
  zombie: boolean;
}

/** Parses /proc/<pid>/stat: fields after the last ')' (comm may contain spaces and parentheses). */
export function parseProcStat(stat: string): { state: string; ppid: number; pgid: number; startTicks: number } | null {
  const close = stat.lastIndexOf(')');
  if (close < 0) return null;
  const rest = stat.slice(close + 2).trim().split(/\s+/);
  // rest[0] = field 3 (state), rest[1] = ppid (4), rest[2] = pgrp (5), rest[19] = starttime (22)
  if (rest.length < 20) return null;
  const startTicks = Number(rest[19]);
  const pgid = Number(rest[2]);
  if (!Number.isFinite(startTicks) || !Number.isFinite(pgid)) return null;
  return { state: rest[0], ppid: Number(rest[1]), pgid, startTicks };
}

function createPosixTree(opts: ProcessTreeOptions): ProcessTree {
  const log = opts.log;
  const graceMs = opts.graceMs ?? 3000;
  const procRoot = opts.procRoot ?? '/proc';
  const selfPid = opts.selfPid ?? process.pid;
  const hasProc = existsSync(join(procRoot, 'self', 'stat')) || existsSync(join(procRoot, String(selfPid), 'stat'));
  let clkTck: number | null = null;
  const selfPgid = ((): number | null => {
    try {
      return parseProcStat(readFileSync(join(procRoot, String(selfPid), 'stat'), 'utf8'))?.pgid ?? null;
    } catch {
      return null;
    }
  })();

  async function ticksPerSecond(): Promise<number> {
    if (clkTck !== null) return clkTck;
    clkTck = 100;
    try {
      const r = await execTool('getconf', ['CLK_TCK'], { timeoutMs: 3000, platform: opts.platform, env: buildChildEnv({ LC_ALL: 'C' }, opts.platform) });
      const n = Number(r.stdout.trim());
      if (r.code === 0 && Number.isInteger(n) && n > 0) clkTck = n;
    } catch {
      /* default 100 Hz (USER_HZ on Linux) */
    }
    return clkTck;
  }

  function bootTimeMs(): number | null {
    try {
      const m = /^btime\s+(\d+)/m.exec(readFileSync(join(procRoot, 'stat'), 'utf8'));
      return m ? Number(m[1]) * 1000 : null;
    } catch {
      return null;
    }
  }

  async function procFsList(): Promise<PosixProc[]> {
    const hz = await ticksPerSecond();
    const btime = bootTimeMs();
    const out: PosixProc[] = [];
    let names: string[];
    try {
      names = readdirSync(procRoot);
    } catch {
      return out;
    }
    for (const name of names) {
      if (!/^\d+$/.test(name)) continue;
      try {
        const st = parseProcStat(readFileSync(join(procRoot, name, 'stat'), 'utf8'));
        if (!st) continue;
        out.push({ pid: Number(name), pgid: st.pgid, start: btime === null ? null : btime + Math.round((st.startTicks * 1000) / hz), zombie: st.state === 'Z' });
      } catch {
        /* process exited while scanning */
      }
    }
    return out;
  }

  async function psList(): Promise<PosixProc[]> {
    try {
      const r = await execTool('ps', ['-A', '-o', 'pid=,pgid=,stat=,lstart='], { timeoutMs: 10_000, platform: opts.platform, env: buildChildEnv({ LC_ALL: 'C', LANG: 'C' }, opts.platform) });
      if (r.code !== 0) return [];
      const out: PosixProc[] = [];
      for (const line of r.stdout.split('\n')) {
        const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line);
        if (!m) continue;
        const t = Date.parse(m[4]);
        out.push({ pid: Number(m[1]), pgid: Number(m[2]), start: Number.isFinite(t) ? t : null, zombie: m[3].startsWith('Z') });
      }
      return out;
    } catch (e) {
      log.debug('Prozessliste (ps) nicht verfügbar', { error: errorMessage(e) });
      return [];
    }
  }

  const list = (): Promise<PosixProc[]> => (hasProc ? procFsList() : psList());

  function signalGroup(pgid: number, signal: NodeJS.Signals | 0): boolean {
    try {
      process.kill(-pgid, signal);
      return true;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') log.debug('Signal an Prozessgruppe fehlgeschlagen', { pgid, signal, code });
      return code === 'EPERM';
    }
  }

  async function groupHasLiveMembers(pgid: number): Promise<boolean> {
    if (!hasProc) return signalGroup(pgid, 0);
    const procs = await procFsList();
    return procs.some((p) => p.pgid === pgid && !p.zombie);
  }

  async function killGroup(pgid: number): Promise<void> {
    if (pgid <= 1 || pgid === selfPid || pgid === selfPgid) return; // never signal the daemon's own group
    if (!signalGroup(pgid, 'SIGTERM')) return;
    const deadline = Date.now() + graceMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.min(100, Math.max(10, deadline - Date.now()))));
      if (!(await groupHasLiveMembers(pgid))) return;
    }
    signalGroup(pgid, 'SIGKILL');
  }

  function inWindow(start: number | null, t: TreeTarget): boolean {
    return start !== null && start >= t.startedAt - IDENTITY_BEFORE_MS && start <= t.startedAt + IDENTITY_AFTER_MS;
  }

  /** Decides whether the recorded group still exists and belongs to the target. */
  function matches(procs: PosixProc[], t: TreeTarget): boolean {
    const leader = procs.find((p) => p.pid === t.pid && !p.zombie);
    if (leader) return inWindow(leader.start, t) && leader.pgid === t.pid;
    // Leader gone: surviving members of its group that started after the target was spawned.
    return procs.some((p) => p.pgid === t.pid && !p.zombie && p.start !== null && p.start >= t.startedAt - IDENTITY_BEFORE_MS);
  }

  return {
    async killOwn(targets) {
      const live = targets.filter((t) => t.pid > 1 && t.pid !== selfPid);
      if (live.length === 0) return;
      const needCheck = live.some((t) => !t.alive);
      const procs = needCheck ? await list() : [];
      await Promise.all(
        live.map(async (t) => {
          // A not-yet-reaped child is certainly ours; after it exited, verify that the group still holds our processes.
          if (t.alive || (hasProc || procs.length > 0 ? matches(procs, t) : true)) await killGroup(t.pid);
        }),
      );
    },

    async killRecorded(targets) {
      if (targets.length === 0) return [];
      const procs = await list();
      return Promise.all(
        targets.map(async (t) => {
          if (t.pid <= 1 || t.pid === selfPid) return false;
          if (!matches(procs, t)) return false;
          log.info('Verwaiste Prozessgruppe gefunden', { pid: t.pid });
          await killGroup(t.pid);
          return true;
        }),
      );
    },
  };
}
