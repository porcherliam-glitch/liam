// Tests of process-tree identification and killing: the Windows CIM walk (pure planner + fake runner) and the POSIX
// process-group path with real child processes on Linux.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecToolResult } from '../core/exec';
import { nullLogger } from '../core/logger';
import { tempDir } from '../../../tests/helpers/core';
import { CIM_PROCESS_SCRIPT, createProcessTree, parseCimProcesses, parseIsoMs, parseProcStat, planWindowsKill, type ProcessTreeRunner, type WinProc } from './process-tree';
import { pidAlive, waitFor } from './test-support';

const T0 = Date.parse('2026-10-22T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

function proc(pid: number, ppid: number, created: number | null, name = 'node.exe'): WinProc {
  return { pid, ppid, name, created };
}

describe('Windows CIM parsing', () => {
  it('parses arrays, single objects, 7-digit fractions and null dates', () => {
    expect(parseIsoMs('2026-10-22T10:00:00.1234567Z')).toBe(T0 + 123);
    expect(parseIsoMs('2026-10-22T12:00:00.5+02:00')).toBe(T0 + 500);
    expect(parseIsoMs(null)).toBeNull();
    const many = parseCimProcesses(
      '﻿' +
        JSON.stringify([
          { ProcessId: 0, ParentProcessId: 0, Name: 'System Idle Process', CreationDate: null },
          { ProcessId: 4242, ParentProcessId: 100, Name: 'cmd.exe', CreationDate: '2026-10-22T10:00:00.0000000Z' },
        ]),
    );
    expect(many).toEqual([{ pid: 4242, ppid: 100, name: 'cmd.exe', created: T0 }]);
    const one = parseCimProcesses(JSON.stringify({ ProcessId: 7, ParentProcessId: 1, Name: 'x.exe', CreationDate: iso(T0) }));
    expect(one).toHaveLength(1);
    expect(parseCimProcesses('')).toEqual([]);
    expect(() => parseCimProcesses('kaputt')).toThrow();
  });

  it('uses one CIM query with UTC ISO creation dates and JSON output', () => {
    expect(CIM_PROCESS_SCRIPT).toContain('Get-CimInstance -ClassName Win32_Process');
    expect(CIM_PROCESS_SCRIPT).toContain("ToUniversalTime().ToString('o')");
    expect(CIM_PROCESS_SCRIPT).toContain('ConvertTo-Json');
    expect(CIM_PROCESS_SCRIPT.toLowerCase()).not.toContain('wmic');
  });
});

describe('planWindowsKill', () => {
  const procs: WinProc[] = [
    proc(100, 1, T0 - 100_000, 'NOVA AI.exe'),
    proc(200, 100, T0 + 50, 'cmd.exe'), // our root
    proc(300, 200, T0 + 80), // child
    proc(400, 300, T0 + 120), // grandchild
    proc(500, 200, T0 - 60_000, 'old.exe'), // older than root: pid 200 was reused by our root → not ours
    proc(600, 999, T0 + 200),
  ];

  it('walks descendants leaves-first and ignores older processes with a reused parent pid', () => {
    const plan = planWindowsKill(procs, { pid: 200, startedAt: T0 }, 'identity', 100);
    expect(plan.found).toBe(true);
    expect(plan.rootName).toBe('cmd.exe');
    expect(plan.pids).toEqual([400, 300, 200]);
  });

  it('rejects a root whose creation time is outside the identity window', () => {
    const plan = planWindowsKill(procs, { pid: 200, startedAt: T0 + 60_000 }, 'identity', 100);
    expect(plan.found).toBe(false);
    expect(plan.pids).toEqual([]);
  });

  it('accepts our not-yet-reaped root by pid alone', () => {
    const plan = planWindowsKill(procs, { pid: 200, startedAt: T0 + 60_000 }, 'own-alive', 100);
    expect(plan.pids).toEqual([400, 300, 200]);
  });

  it('finds surviving children of a root that already exited', () => {
    const exited = procs.filter((p) => p.pid !== 200);
    const plan = planWindowsKill(exited, { pid: 200, startedAt: T0 }, 'identity', 100);
    expect(plan.found).toBe(true);
    expect(plan.pids).toEqual([400, 300]);
  });

  it('does not adopt children of an impostor that reused the pid later', () => {
    const list = [proc(200, 1, T0 + 30_000, 'other.exe'), proc(700, 200, T0 + 31_000), proc(300, 200, T0 + 80)];
    const plan = planWindowsKill(list, { pid: 200, startedAt: T0 }, 'identity', 1);
    expect(plan.pids).toEqual([300]);
  });

  it('never includes the daemon itself', () => {
    const list = [proc(200, 1, T0), proc(4321, 200, T0 + 10)];
    const plan = planWindowsKill(list, { pid: 200, startedAt: T0 }, 'identity', 4321);
    expect(plan.pids).toEqual([200]);
  });
});

describe('Windows tree killer (fake runner)', () => {
  function fakeRunner(cim: WinProc[] | null, killCodes: Record<number, number> = {}) {
    const calls: { file: string; args: string[] }[] = [];
    const scripts: string[] = [];
    const runner: ProcessTreeRunner = {
      async powershell(script) {
        scripts.push(script);
        if (!cim) return { code: 1, stdout: '', stderr: 'CIM kaputt', timedOut: false } satisfies ExecToolResult;
        const json = cim.map((p) => ({ ProcessId: p.pid, ParentProcessId: p.ppid, Name: p.name, CreationDate: p.created === null ? null : iso(p.created) }));
        return { code: 0, stdout: JSON.stringify(json), stderr: '', timedOut: false };
      },
      async exec(file, args) {
        calls.push({ file, args });
        const pid = Number(args[1]);
        return { code: killCodes[pid] ?? 0, stdout: '', stderr: '', timedOut: false };
      },
    };
    return { runner, calls, scripts };
  }

  it('kills an own tree leaves-first with taskkill /F after ONE CIM query', async () => {
    const f = fakeRunner([proc(200, 1, T0 + 10, 'cmd.exe'), proc(300, 200, T0 + 20), proc(400, 300, T0 + 30)], { 400: 128 });
    const tree = createProcessTree({ platform: 'win32', log: nullLogger, runner: f.runner, selfPid: 1 });
    await tree.killOwn([{ pid: 200, startedAt: T0, alive: true }]);
    expect(f.scripts).toHaveLength(1);
    expect(f.calls.map((c) => [c.file, ...c.args])).toEqual([
      ['taskkill.exe', '/pid', '400', '/F'],
      ['taskkill.exe', '/pid', '300', '/F'],
      ['taskkill.exe', '/pid', '200', '/F'],
    ]);
  });

  it('falls back to taskkill /T for running own roots when the CIM query fails, but never for recorded trees', async () => {
    const f = fakeRunner(null);
    const tree = createProcessTree({ platform: 'win32', log: nullLogger, runner: f.runner, selfPid: 1 });
    await tree.killOwn([{ pid: 200, startedAt: T0, alive: true }, { pid: 201, startedAt: T0, alive: false }]);
    expect(f.calls.map((c) => c.args)).toEqual([['/pid', '200', '/T', '/F']]);
    expect(await tree.killRecorded([{ pid: 300, startedAt: T0 }])).toEqual([false]);
    expect(f.calls).toHaveLength(1);
  });

  it('kills recorded trees only when the identity matches', async () => {
    const f = fakeRunner([proc(200, 1, T0 + 100, 'cmd.exe'), proc(210, 200, T0 + 200), proc(300, 1, T0 - 3_600_000, 'fremd.exe')]);
    const tree = createProcessTree({ platform: 'win32', log: nullLogger, runner: f.runner, selfPid: 1 });
    const res = await tree.killRecorded([
      { pid: 200, startedAt: T0 },
      { pid: 300, startedAt: T0 },
    ]);
    expect(res).toEqual([true, false]);
    expect(f.scripts).toHaveLength(1);
    expect(f.calls.map((c) => c.args[1])).toEqual(['210', '200']);
  });
});

describe.skipIf(process.platform !== 'linux')('POSIX tree killer (real processes)', () => {
  const children: ChildProcess[] = [];
  let tmp: { dir: string; cleanup(): void } | null = null;
  afterEach(() => {
    for (const c of children) {
      try {
        if (c.pid) process.kill(-c.pid, 'SIGKILL');
      } catch {
        /* gone */
      }
    }
    children.length = 0;
    tmp?.cleanup();
    tmp = null;
  });

  function spawnGroup(script: string): { child: ChildProcess; startedAt: number; pidFile: string } {
    tmp = tmp ?? tempDir('nova-tree-');
    const pidFile = join(tmp.dir, `pids-${children.length}.txt`);
    const file = join(tmp.dir, `s${children.length}.js`);
    writeFileSync(file, script.replace('__PIDFILE__', JSON.stringify(pidFile)));
    const startedAt = Date.now();
    const child = spawn(process.execPath, [file], { detached: true, stdio: 'ignore' });
    children.push(child);
    return { child, startedAt, pidFile };
  }

  const GRANDCHILD_SCRIPT = `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
fs.writeFileSync(__PIDFILE__, String(g.pid));
setInterval(() => {}, 1000);
`;

  it('parses /proc stat lines with spaces and parentheses in the name', () => {
    const st = parseProcStat('123 (my (weird) name) S 1 123 123 0 -1 4194304 83 0 0 0 0 0 0 0 20 0 1 0 80682 2928640 364');
    expect(st).toEqual({ state: 'S', ppid: 1, pgid: 123, startTicks: 80682 });
    expect(parseProcStat('garbage')).toBeNull();
  });

  it('kills a whole own process group including grandchildren', async () => {
    const { child, startedAt, pidFile } = spawnGroup(GRANDCHILD_SCRIPT);
    expect(await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').length > 0)).toBe(true);
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    expect(pidAlive(grandchild)).toBe(true);
    const tree = createProcessTree({ platform: 'linux', log: nullLogger, graceMs: 500 });
    await tree.killOwn([{ pid: child.pid!, startedAt, alive: true }]);
    expect(await waitFor(() => !pidAlive(grandchild), 3000)).toBe(true);
  });

  it('recognises a recorded group by creation time and leaves mismatches alone', async () => {
    const { child, startedAt, pidFile } = spawnGroup(GRANDCHILD_SCRIPT);
    expect(await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').length > 0)).toBe(true);
    const grandchild = Number(readFileSync(pidFile, 'utf8'));
    const tree = createProcessTree({ platform: 'linux', log: nullLogger, graceMs: 500 });
    // Wrong started_at (one hour later) → identity mismatch → nothing is killed.
    expect(await tree.killRecorded([{ pid: child.pid!, startedAt: startedAt + 3_600_000 }])).toEqual([false]);
    expect(pidAlive(grandchild)).toBe(true);
    expect(await tree.killRecorded([{ pid: child.pid!, startedAt }])).toEqual([true]);
    expect(await waitFor(() => !pidAlive(grandchild), 3000)).toBe(true);
  });

  it('escalates to SIGKILL when SIGTERM is ignored', async () => {
    const { child, startedAt, pidFile } = spawnGroup(`
process.on('SIGTERM', () => {});
require('node:fs').writeFileSync(__PIDFILE__, 'ready');
setInterval(() => {}, 1000);
`);
    expect(await waitFor(() => existsSync(pidFile))).toBe(true);
    const tree = createProcessTree({ platform: 'linux', log: nullLogger, graceMs: 300 });
    const t = Date.now();
    await tree.killOwn([{ pid: child.pid!, startedAt, alive: true }]);
    expect(await waitFor(() => child.exitCode !== null || child.signalCode !== null, 3000)).toBe(true);
    expect(child.signalCode).toBe('SIGKILL');
    expect(Date.now() - t).toBeGreaterThanOrEqual(250);
  });

  it('never signals the own process', async () => {
    const tree = createProcessTree({ platform: 'linux', log: nullLogger, graceMs: 100 });
    await tree.killOwn([{ pid: process.pid, startedAt: Date.now(), alive: true }]);
    expect(await tree.killRecorded([{ pid: process.pid, startedAt: Date.now() }])).toEqual([false]);
  });
});
