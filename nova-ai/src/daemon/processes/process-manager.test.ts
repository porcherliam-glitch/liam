// Tests of ProcessManager: real child processes on Linux (/bin/sh, process groups) plus the Windows branch with an
// injected spawn and a fake CIM/taskkill runner. Lifecycle tests (orphans, prune, shutdown …) are in
// process-manager.lifecycle.test.ts.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecToolResult } from '../core/exec';
import { createProcessManager } from './process-manager';
import type { ProcessTreeRunner } from './process-tree';
import { createProcHarness, NODE, pidAlive, waitFor, type ProcHarness } from './test-support';

let h: ProcHarness | null = null;
const extraChildren: ChildProcess[] = [];
afterEach(async () => {
  for (const c of extraChildren) {
    try {
      if (c.pid) process.kill(-c.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  extraChildren.length = 0;
  delete process.env.NOVA_TEST_SECRET_API_KEY;
  await h?.cleanup();
  h = null;
});

const SLEEPER = 'setInterval(() => {}, 1000);';
const GRANDCHILD = (pidFile: string) => `
const { spawn } = require('node:child_process');
const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
console.log('gestartet');
setInterval(() => {}, 1000);
`;

function row(h: ProcHarness, id: string): Record<string, unknown> {
  return h.t.core.db.get<Record<string, unknown>>('SELECT * FROM processes WHERE id = ?', [id])!;
}

describe.skipIf(process.platform === 'win32')('ProcessManager (real processes)', () => {
  it('runs a command line, captures output and records the processes row', async () => {
    h = createProcHarness();
    const before = Date.now();
    const res = await h.s.processes.run({ command: `${NODE} -e "console.log('hallo'); console.error('warnung')"`, cwd: h.root, kind: 'command', projectId: h.project.id, taskId: 'task_a' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('hallo\n');
    expect(res.stderr).toBe('warnung\n');
    expect(res.output).toContain('hallo');
    expect(res.timedOut).toBe(false);
    expect(res.cancelled).toBe(false);
    const r = row(h, res.processId);
    expect(r).toMatchObject({ status: 'exited', exit_code: 0, kind: 'command', project_id: h.project.id, task_id: 'task_a', instance_id: h.t.core.instanceId, cwd: h.root });
    expect(typeof r.pid).toBe('number');
    expect(Number(r.started_at)).toBeGreaterThanOrEqual(before);
    const updates = h.eventsOf('process.updated').filter((p) => p.id === res.processId);
    expect(updates[0].status).toBe('running');
    expect(updates[updates.length - 1].status).toBe('exited');
    const outputs = h.eventsOf('process.output').filter((p) => p.processId === res.processId);
    expect(outputs.map((o) => o.data).join('')).toContain('hallo');
    expect(h.s.processes.get(res.processId)?.status).toBe('exited');
    expect(h.s.processes.output(res.processId, 10)).toContain('hallo');
  });

  it('reports non-zero exit codes', async () => {
    h = createProcHarness();
    const res = await h.s.processes.run({ command: `${NODE} -e "process.exit(3)"`, cwd: h.root, kind: 'test' });
    expect(res.exitCode).toBe(3);
    expect(h.s.processes.get(res.processId)?.exitCode).toBe(3);
  });

  it('gives children a secret-free, non-interactive environment plus input.env', async () => {
    h = createProcHarness();
    process.env.NOVA_TEST_SECRET_API_KEY = 'geheim-123456';
    h.write('env.js', "const e = process.env; console.log(JSON.stringify({ ci: e.CI, nc: e.NO_COLOR, fc: e.FORCE_COLOR, npx: e.npm_config_yes, extra: e.EXTRA_VALUE, secret: e.NOVA_TEST_SECRET_API_KEY ?? null }));");
    const res = await h.s.processes.run({ command: `${NODE} env.js`, cwd: h.root, kind: 'command', env: { EXTRA_VALUE: 'ja' } });
    expect(JSON.parse(res.stdout)).toEqual({ ci: '1', nc: '1', fc: '0', npx: 'false', extra: 'ja', secret: null });
  });

  it('passes stdin to the process', async () => {
    h = createProcHarness();
    const res = await h.s.processes.run({ command: `${NODE} -e "process.stdin.pipe(process.stdout)"`, cwd: h.root, kind: 'command', stdin: 'eingabe' });
    expect(res.stdout).toBe('eingabe');
  });

  it('kills the process tree on timeout', async () => {
    h = createProcHarness();
    const t0 = Date.now();
    const res = await h.s.processes.run({ command: `${NODE} -e "${SLEEPER}"`, cwd: h.root, kind: 'command', timeoutMs: 300 });
    expect(res.timedOut).toBe(true);
    expect(res.cancelled).toBe(false);
    expect(res.exitCode).toBeNull();
    expect(res.signal).toBe('SIGTERM');
    expect(Date.now() - t0).toBeLessThan(5000);
    expect(h.s.processes.get(res.processId)?.status).toBe('killed');
    const pid = h.s.processes.get(res.processId)!.pid!;
    expect(pidAlive(pid)).toBe(false);
  });

  it('kills the tree on abort and reports cancelled', async () => {
    h = createProcHarness();
    const pidFile = join(h.root, 'gc.pid');
    h.write('tree.js', GRANDCHILD(pidFile));
    const ac = new AbortController();
    const p = h.s.processes.run({ command: `${NODE} tree.js`, cwd: h.root, kind: 'command', signal: ac.signal });
    expect(await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').length > 0)).toBe(true);
    ac.abort();
    const res = await p;
    expect(res.cancelled).toBe(true);
    expect(h.s.processes.get(res.processId)?.status).toBe('killed');
    const gc = Number(readFileSync(pidFile, 'utf8'));
    expect(await waitFor(() => !pidAlive(gc), 3000)).toBe(true);
  });

  it('rejects an already aborted signal without starting anything', async () => {
    h = createProcHarness();
    const ac = new AbortController();
    ac.abort();
    await expect(h.s.processes.run({ command: 'echo nie', cwd: h.root, kind: 'command', signal: ac.signal })).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(h.s.processes.list({ includeExited: true })).toHaveLength(0);
  });

  it('kills leftover descendants that keep the output open after the root exited', async () => {
    h = createProcHarness();
    const pidFile = join(h.root, 'bg.pid');
    h.write(
      'bg.js',
      `const g = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(SLEEPER)}], { stdio: 'inherit' });
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
console.log('fertig');
process.exit(0);`,
    );
    const t0 = Date.now();
    const res = await h.s.processes.run({ command: `${NODE} bg.js`, cwd: h.root, kind: 'command', timeoutMs: 20_000 });
    expect(Date.now() - t0).toBeLessThan(8000);
    expect(res.exitCode).toBe(0);
    expect(res.timedOut).toBe(false);
    expect(res.stdout).toContain('fertig');
    expect(h.s.processes.get(res.processId)?.status).toBe('exited');
    const bg = Number(readFileSync(pidFile, 'utf8'));
    expect(await waitFor(() => !pidAlive(bg), 3000)).toBe(true);
  });

  it('keeps programs started by a terminal line running after the line ended', async () => {
    h = createProcHarness();
    const pidFile = join(h.root, 'gui.pid');
    h.write(
      'gui.js',
      `const g = require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(SLEEPER)}], { stdio: 'inherit' });
require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid));
process.exit(0);`,
    );
    const res = await h.s.processes.run({ command: `${NODE} gui.js`, cwd: h.root, kind: 'terminal', timeoutMs: 20_000 });
    expect(res.exitCode).toBe(0);
    const gui = Number(readFileSync(pidFile, 'utf8'));
    try {
      expect(pidAlive(gui)).toBe(true);
    } finally {
      process.kill(gui, 'SIGKILL');
    }
  });

  it('waits for the governor, honours abort while waiting and gives up at the timeout', async () => {
    h = createProcHarness();
    h.governor.decide = (n) => (n < 3 ? { ok: false, reason: 'Es laufen bereits 6 Prozesse.' } : { ok: true, reason: null });
    const res = await h.s.processes.run({ command: 'echo los', cwd: h.root, kind: 'build' });
    expect(res.exitCode).toBe(0);
    expect(h.governor.calls).toBeGreaterThanOrEqual(3);

    h.governor.decide = () => ({ ok: false, reason: 'Es laufen bereits 6 Prozesse.' });
    const ac = new AbortController();
    const waiting = h.s.processes.run({ command: 'echo nie', cwd: h.root, kind: 'command', signal: ac.signal });
    setTimeout(() => ac.abort(), 60);
    await expect(waiting).rejects.toMatchObject({ code: 'CANCELLED' });

    await expect(h.s.processes.run({ command: 'echo nie', cwd: h.root, kind: 'install', timeoutMs: 80 })).rejects.toMatchObject({ code: 'RESOURCE_LIMIT' });
    // dev servers and previews do not wait for the governor
    const calls = h.governor.calls;
    const handle = await h.s.processes.start({ command: 'echo vorschau', cwd: h.root, kind: 'preview' });
    await handle.exited;
    expect(h.governor.calls).toBe(calls);
    expect(h.s.processes.list({ includeExited: true }).filter((p) => p.command === 'echo nie')).toHaveLength(0);
  });

  it('caps output tails, redacts secrets and stores the redacted command', async () => {
    h = createProcHarness();
    h.write('loud.js', "console.log('ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnop12345'); for (let i = 0; i < 2000; i++) console.log('zeile ' + i);");
    const res = await h.s.processes.run({ command: `${NODE} loud.js --token=abcdefghijk123456`, cwd: h.root, kind: 'command', maxOutputBytes: 4096 });
    expect(Buffer.byteLength(res.stdout)).toBeLessThan(4096 + 100);
    expect(res.stdout).toContain('zeile 1999');
    expect(res.stdout.startsWith('[… ältere Ausgabe gekürzt]')).toBe(true);
    const events = h.eventsOf('process.output').filter((p) => p.processId === res.processId);
    const all = events.map((e) => e.data).join('');
    expect(all).not.toContain('sk-ant-abcdefghijklmnop12345');
    expect(all).toContain('zeile 1999');
    expect(events.length).toBeLessThan(30);
    expect(String(row(h, res.processId).command)).not.toContain('abcdefghijk123456');
  });

  it('starts long-running processes, detects the loopback URL and kills them', async () => {
    h = createProcHarness();
    h.write('server.js', "setTimeout(() => console.log('Bereit: http://127.0.0.1:5173/ (Strg+C zum Beenden)'), 50); setInterval(() => {}, 1000);");
    const handle = await h.s.processes.start({ command: `${NODE} server.js`, cwd: h.root, kind: 'dev_server', projectId: h.project.id });
    expect(handle.info().status).toBe('running');
    expect(await handle.waitForUrl(5000)).toBe('http://127.0.0.1:5173/');
    expect(handle.info().url).toBe('http://127.0.0.1:5173/');
    expect(row(h, handle.info().id).url).toBe('http://127.0.0.1:5173/');
    expect(h.s.processes.runningCount()).toBe(1);
    const info = await h.s.processes.kill(handle.info().id);
    expect(info.status).toBe('killed');
    await handle.exited;
    expect(h.s.processes.runningCount()).toBe(0);
    // kill on an ended process returns its info unchanged
    expect((await h.s.processes.kill(handle.info().id)).status).toBe('killed');
  });

  it('does not take a URL that is split across output chunks too early', async () => {
    h = createProcHarness();
    h.write('split.js', "process.stdout.write('Local:   \\u001b[36mhttp://localhost:51'); setTimeout(() => process.stdout.write('73/\\u001b[39m\\n'), 30); setInterval(() => {}, 1000);");
    const handle = await h.s.processes.start({ command: `${NODE} split.js`, cwd: h.root, kind: 'dev_server' });
    expect(await handle.waitForUrl(5000)).toBe('http://localhost:5173/');
    await h.s.processes.kill(handle.info().id);
  });

  it('resolves waitForUrl with null when the process exits first', async () => {
    h = createProcHarness();
    const handle = await h.s.processes.start({ command: 'echo ohne-adresse', cwd: h.root, kind: 'preview' });
    expect(await handle.waitForUrl(5000)).toBeNull();
    expect(await handle.exited).toBe(0);
  });

  it('rejects missing working directories, empty commands and invalid URL patterns', async () => {
    h = createProcHarness();
    await expect(h.s.processes.run({ command: 'echo x', cwd: join(h.root, 'fehlt'), kind: 'command' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(h.s.processes.run({ command: '   ', cwd: h.root, kind: 'command' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(h.s.processes.start({ command: 'echo x', cwd: h.root, kind: 'preview', urlPattern: '(' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('runs terminal lines through bash -lc (powershell shell choice on POSIX)', async () => {
    h = createProcHarness({ processes: { bashPath: existsSync('/bin/bash') ? '/bin/bash' : null } });
    const res = await h.s.processes.run({ command: 'echo "$0"', cwd: h.root, kind: 'terminal', shell: 'powershell' });
    expect(res.exitCode).toBe(0);
    expect(res.stdout.trim()).toMatch(existsSync('/bin/bash') ? /bash$/ : /sh$/);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Real processes on Windows: cmd.exe wrapper, exit codes, CIM walk + taskkill
// ---------------------------------------------------------------------------------------------------------------------

// Generous timeout: the first PATH refresh and the CIM query start PowerShell, which is slow on a cold machine.
describe.runIf(process.platform === 'win32')('ProcessManager (real processes, cmd.exe)', { timeout: 60_000 }, () => {
  it('captures output and reports exit codes of programs, cmd built-ins and unknown commands', async () => {
    h = createProcHarness();
    const ok = await h.s.processes.run({ command: `${NODE} -e "console.log('hallo'); console.error('warnung')"`, cwd: h.root, kind: 'command' });
    expect(ok.exitCode).toBe(0);
    expect(ok.stdout.replace(/\r\n/g, '\n')).toBe('hallo\n');
    expect(ok.stderr.replace(/\r\n/g, '\n')).toBe('warnung\n');
    expect(h.s.processes.get(ok.processId)).toMatchObject({ status: 'exited', exitCode: 0 });
    expect(h.s.processes.get(ok.processId)?.command).not.toContain('chcp'); // the wrapper is never shown
    const failed = await h.s.processes.run({ command: `${NODE} -e "process.exit(3)"`, cwd: h.root, kind: 'test' });
    expect(failed.exitCode).toBe(3);
    const builtin = await h.s.processes.run({ command: 'echo kaputt 1>&2 & exit 4', cwd: h.root, kind: 'command' });
    expect(builtin.exitCode).toBe(4);
    expect(builtin.stderr).toContain('kaputt');
    const unknown = await h.s.processes.run({ command: 'nova-gibt-es-nicht-4711 --version', cwd: h.root, kind: 'command' });
    expect(unknown.exitCode).toBe(9009);
  });

  it('passes stdin and quoted arguments through cmd.exe unchanged', async () => {
    h = createProcHarness();
    const piped = await h.s.processes.run({ command: `${NODE} -e "process.stdin.pipe(process.stdout)"`, cwd: h.root, kind: 'command', stdin: 'eingabe' });
    expect(piped.stdout).toBe('eingabe');
    h.write('args.js', 'console.log(JSON.stringify(process.argv.slice(2)));');
    const args = await h.s.processes.run({ command: `${NODE} args.js "mit Leerzeichen" & echo danach`, cwd: h.root, kind: 'command' });
    expect(args.exitCode).toBe(0);
    expect(args.stdout).toContain('["mit Leerzeichen"]');
    expect(args.stdout).toContain('danach');
  });

  it('kills the whole tree including grandchildren on abort (CIM walk + taskkill)', async () => {
    h = createProcHarness();
    const pidFile = join(h.root, 'gc.pid');
    h.write('tree.js', GRANDCHILD(pidFile));
    const ac = new AbortController();
    const p = h.s.processes.run({ command: `${NODE} tree.js`, cwd: h.root, kind: 'command', signal: ac.signal });
    expect(await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').length > 0, 10_000)).toBe(true);
    const gc = Number(readFileSync(pidFile, 'utf8'));
    expect(pidAlive(gc)).toBe(true);
    ac.abort();
    const res = await p;
    expect(res.cancelled).toBe(true);
    expect(h.s.processes.get(res.processId)?.status).toBe('killed');
    expect(await waitFor(() => !pidAlive(gc), 5000)).toBe(true);
    expect(pidAlive(h.s.processes.get(res.processId)!.pid!)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Windows branch with injected spawn + fake tree runner
// ---------------------------------------------------------------------------------------------------------------------

class FakeChild extends EventEmitter {
  pid: number | undefined;
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = null;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn(() => true);
  constructor(pid: number) {
    super();
    this.pid = pid;
  }
  finish(code: number): void {
    this.exitCode = code;
    this.stdout.end();
    this.stderr.end();
    this.emit('exit', code, null);
    setImmediate(() => this.emit('close', code, null));
  }
}

function windowsHarness(cimPid = 4242) {
  const spawned: { file: string; args: readonly string[]; options: SpawnOptions; child: FakeChild }[] = [];
  const taskkills: string[][] = [];
  const scripts: string[] = [];
  const runner: ProcessTreeRunner = {
    async powershell(script) {
      scripts.push(script);
      const now = new Date().toISOString();
      return { code: 0, stdout: JSON.stringify([{ ProcessId: cimPid, ParentProcessId: process.pid, Name: 'cmd.exe', CreationDate: now }]), stderr: '', timedOut: false } satisfies ExecToolResult;
    },
    async exec(_file, args) {
      taskkills.push(args);
      const child = spawned.find((x) => String(x.child.pid) === args[1])?.child;
      if (child && child.exitCode === null) setImmediate(() => child.finish(1));
      return { code: 0, stdout: '', stderr: '', timedOut: false };
    },
  };
  const refreshes = { count: 0 };
  h = createProcHarness({ processes: false });
  const s = h.s;
  s.processes = createProcessManager(s, {
    platform: 'win32',
    treeRunner: runner,
    governorPollMs: 20,
    // Never the host's real PATH refresh (PowerShell on a Windows host): the injected platform must be deterministic.
    refreshPath: async () => {
      refreshes.count++;
      return null;
    },
    spawn: (file, args, options) => {
      const child = new FakeChild(cimPid);
      spawned.push({ file, args, options, child });
      setImmediate(() => child.emit('spawn'));
      return child as unknown as ChildProcess;
    },
  });
  return { h, spawned, taskkills, scripts, refreshes };
}

describe('ProcessManager Windows branch (injected spawn)', () => {
  it('runs cmd.exe /d /s /c "chcp 65001>nul & <line>" verbatim and hidden', async () => {
    const w = windowsHarness();
    const p = w.h.s.processes.run({ command: 'npm test', cwd: w.h.root, kind: 'test' });
    expect(await waitFor(() => w.spawned.length === 1)).toBe(true);
    expect(w.refreshes.count).toBe(1); // the injected PATH refresh, never the host's
    const sp = w.spawned[0];
    expect(sp.file.toLowerCase()).toMatch(/cmd\.exe$/);
    expect(sp.args).toEqual(['/d', '/s', '/c', '"chcp 65001>nul & npm test"']);
    expect(sp.options).toMatchObject({ windowsHide: true, windowsVerbatimArguments: true, detached: false, cwd: w.h.root });
    expect((sp.options.env as Record<string, string>).CI).toBe('1');
    sp.child.stdout.write(Buffer.from('Tests grün ✓\n', 'utf8'));
    sp.child.finish(0);
    const res = await p;
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('Tests grün ✓\n');
    expect(w.h.s.processes.get(res.processId)?.command).toBe('npm test');
  });

  it('runs terminal lines through PowerShell -EncodedCommand', async () => {
    const w = windowsHarness();
    const p = w.h.s.processes.run({ command: 'Get-ChildItem | Select-Object -First 3', cwd: w.h.root, kind: 'terminal', shell: 'powershell' });
    expect(await waitFor(() => w.spawned.length === 1)).toBe(true);
    const sp = w.spawned[0];
    expect(sp.file.toLowerCase()).toMatch(/powershell\.exe$/);
    expect(sp.args.slice(0, 6)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand']);
    const script = Buffer.from(String(sp.args[6]), 'base64').toString('utf16le');
    expect(script).toContain('Get-ChildItem | Select-Object -First 3');
    expect(script).toContain('[Text.UTF8Encoding]::new($false)');
    expect(script).toContain('exit $LASTEXITCODE');
    expect(sp.options.windowsVerbatimArguments).toBe(false);
    sp.child.finish(0);
    await p;
  });

  it('kills the tree via one CIM query and taskkill /F on timeout', async () => {
    const w = windowsHarness(5151);
    const res = await w.h.s.processes.run({ command: 'npm run langsam', cwd: w.h.root, kind: 'command', timeoutMs: 100 });
    expect(res.timedOut).toBe(true);
    expect(w.scripts).toHaveLength(1);
    expect(w.scripts[0]).toContain('Win32_Process');
    expect(w.taskkills).toEqual([['/pid', '5151', '/F']]);
    expect(w.h.s.processes.get(res.processId)?.status).toBe('killed');
  });

  it('reports spawn failures as COMMAND_FAILED and marks the row failed', async () => {
    h = createProcHarness({ processes: false });
    const s = h.s;
    s.processes = createProcessManager(s, {
      platform: 'win32',
      refreshPath: null,
      spawn: () => {
        const child = new FakeChild(0);
        child.pid = undefined;
        setImmediate(() => child.emit('error', Object.assign(new Error('spawn cmd.exe ENOENT'), { code: 'ENOENT' })));
        return child as unknown as ChildProcess;
      },
    });
    await expect(s.processes.run({ command: 'npm test', cwd: h.root, kind: 'command' })).rejects.toMatchObject({ code: 'COMMAND_FAILED' });
    const rows = s.processes.list({ includeExited: true });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('failed');
  });
});
