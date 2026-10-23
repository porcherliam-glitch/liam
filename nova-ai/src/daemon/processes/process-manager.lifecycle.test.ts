// Tests of the ProcessManager lifecycle with real child processes on Linux: killTask/killProject, output of live and
// finished processes, recoverOrphans (identity by pid + creation time), prune and shutdown.
import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NovaError } from '../core/errors';
import { OUTPUT_UNAVAILABLE } from './process-manager';
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

describe.skipIf(process.platform === 'win32')('ProcessManager lifecycle (real processes)', () => {
  it('killTask and killProject only kill matching processes', async () => {
    h = createProcHarness();
    const a = await h.s.processes.start({ command: `${NODE} -e "${SLEEPER}"`, cwd: h.root, kind: 'dev_server', projectId: 'p1', taskId: 't1' });
    const b = await h.s.processes.start({ command: `${NODE} -e "${SLEEPER}"`, cwd: h.root, kind: 'dev_server', projectId: 'p1', taskId: 't2' });
    const c = await h.s.processes.start({ command: `${NODE} -e "${SLEEPER}"`, cwd: h.root, kind: 'dev_server', projectId: 'p2', taskId: null });
    await h.s.processes.killTask('t1');
    expect(a.info().status).toBe('killed');
    expect(b.info().status).toBe('running');
    expect(h.s.processes.list({ projectId: 'p1' }).map((p) => p.id)).toEqual([b.info().id]);
    await h.s.processes.killProject('p1');
    expect(b.info().status).toBe('killed');
    expect(c.info().status).toBe('running');
    expect(h.s.processes.list().map((p) => p.id)).toEqual([c.info().id]);
    expect(h.s.processes.list({ includeExited: true })).toHaveLength(3);
  });

  it('output(): live and finished processes, unknown ids and rows of earlier sessions', async () => {
    h = createProcHarness();
    const res = await h.s.processes.run({ command: `${NODE} -e "for (let i = 1; i <= 5; i++) console.log('z' + i)"`, cwd: h.root, kind: 'command' });
    expect(h.s.processes.output(res.processId, 2)).toBe('z4\nz5\n');
    expect(() => h!.s.processes.output('proc_unbekannt', 10)).toThrow(NovaError);
    h.t.core.db.run(
      "INSERT INTO processes(id, project_id, task_id, kind, command, cwd, pid, status, exit_code, url, instance_id, started_at, ended_at) VALUES ('proc_alt', NULL, NULL, 'command', 'echo', '/', 1, 'exited', 0, NULL, 'inst_alt', 1, 2)",
    );
    expect(h.s.processes.output('proc_alt', 10)).toBe(OUTPUT_UNAVAILABLE);
    expect(await h.s.processes.kill('proc_alt')).toMatchObject({ status: 'exited' });
    await expect(h.s.processes.kill('proc_unbekannt')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('recoverOrphans kills matching trees of other instances and marks every such row orphaned', async () => {
    h = createProcHarness();
    const pidFile = join(h.root, 'orphan.pid');
    h.write('orphan.js', GRANDCHILD(pidFile));
    const startedAt = Date.now();
    const orphan = spawn(process.execPath, [join(h.root, 'orphan.js')], { detached: true, stdio: 'ignore' });
    extraChildren.push(orphan);
    const other = spawn(process.execPath, ['-e', SLEEPER], { detached: true, stdio: 'ignore' });
    extraChildren.push(other);
    expect(await waitFor(() => existsSync(pidFile) && readFileSync(pidFile, 'utf8').length > 0)).toBe(true);
    const gc = Number(readFileSync(pidFile, 'utf8'));
    const insert = (id: string, pid: number | null, status: string, instance: string, started: number) =>
      h!.t.core.db.run(
        'INSERT INTO processes(id, project_id, task_id, kind, command, cwd, pid, status, exit_code, url, instance_id, started_at, ended_at) VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)',
        [id, 'command', 'node orphan.js', h!.root, pid, status, instance, started],
      );
    insert('proc_orphan', orphan.pid!, 'running', 'inst_alt', startedAt);
    insert('proc_reused', other.pid!, 'running', 'inst_alt', startedAt - 3_600_000); // pid alive but a different process
    insert('proc_nopid', null, 'running', 'inst_alt', startedAt);
    insert('proc_done', null, 'exited', 'inst_alt', startedAt);
    expect(await h.s.processes.recoverOrphans()).toBe(3);
    expect(await waitFor(() => !pidAlive(gc), 3000)).toBe(true);
    expect(await waitFor(() => !pidAlive(orphan.pid!), 3000)).toBe(true);
    expect(pidAlive(other.pid!)).toBe(true);
    expect(h.s.processes.get('proc_orphan')?.status).toBe('orphaned');
    expect(h.s.processes.get('proc_reused')?.status).toBe('orphaned');
    expect(h.s.processes.get('proc_nopid')?.status).toBe('orphaned');
    expect(h.s.processes.get('proc_done')?.status).toBe('exited');
    expect(await h.s.processes.recoverOrphans()).toBe(0);
  });

  it('prune deletes finished rows older than the cutoff only', async () => {
    h = createProcHarness();
    const now = Date.now();
    const insert = (id: string, status: string, ended: number | null) =>
      h!.t.core.db.run(
        "INSERT INTO processes(id, project_id, task_id, kind, command, cwd, pid, status, exit_code, url, instance_id, started_at, ended_at) VALUES (?, NULL, NULL, 'command', 'echo', '/', NULL, ?, 0, NULL, 'inst_alt', 1, ?)",
        [id, status, ended],
      );
    insert('proc_old', 'exited', now - 10_000);
    insert('proc_old_killed', 'killed', now - 10_000);
    insert('proc_new', 'exited', now);
    insert('proc_running', 'running', null);
    expect(h.s.processes.prune(now - 1000)).toBe(2);
    expect(h.s.processes.get('proc_old')).toBeNull();
    expect(h.s.processes.get('proc_new')).not.toBeNull();
    expect(h.s.processes.get('proc_running')).not.toBeNull();
    expect(h.s.processes.prune(now - 1000)).toBe(0);
  });

  it('shutdown kills everything, marks rows and refuses new processes', async () => {
    h = createProcHarness();
    const handle = await h.s.processes.start({ command: `${NODE} -e "${SLEEPER}"`, cwd: h.root, kind: 'dev_server' });
    const running = h.s.processes.run({ command: `${NODE} -e "${SLEEPER}"`, cwd: h.root, kind: 'command', timeoutMs: 60_000 });
    expect(await waitFor(() => h!.s.processes.runningCount() === 2)).toBe(true);
    await h.s.processes.shutdown();
    const res = await running;
    expect(res.timedOut).toBe(false);
    expect(h.s.processes.get(res.processId)?.status).toBe('killed');
    expect(handle.info().status).toBe('killed');
    expect(h.s.processes.runningCount()).toBe(0);
    expect(h.t.core.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM processes WHERE status = 'running'")?.n).toBe(0);
    await expect(h.s.processes.run({ command: 'echo x', cwd: h.root, kind: 'command' })).rejects.toMatchObject({ code: 'INTERRUPTED' });
  });

});
