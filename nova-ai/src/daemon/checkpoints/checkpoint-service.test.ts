// CheckpointService with a real GitService on a temp repository and hand-written fakes for the journal, tasks, checks
// and projects: markers, list/latestVerified, preview/restore (CONFLICT while running, pre_restore first, commits
// without modifiedSinceNova/secret files, restoredAt, RESTORE_CONFLICT report), afterTask commit rules (autoCommit,
// verification, commitOnlyWhenVerified, secrets, sensitive files, command-detected files, hook failures) and prune.
import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangeRecord, ChangedFile, CheckKind, CheckRun, Checkpoint, Project, Task } from '@shared/schemas';
import type { Services } from '../contracts';
import { notFound } from '../core/errors';
import { gitFixture, type GitFixture } from '../git/test-support';
import { createCheckpointService } from './checkpoint-service';

interface Ctx {
  f: GitFixture;
  root: string;
  project: Project;
  cps: ReturnType<typeof createCheckpointService>;
  journal: FakeJournal;
  tasks: Task[];
  checks: Partial<Record<CheckKind, CheckRun>>;
  events: Checkpoint[];
}

interface FakeJournal {
  max: number;
  changeTs: Map<number, number>;
  revertCalls: { afterId?: number; taskId?: string; dryRun?: boolean; maxAtCall: number }[];
  result: { restored: string[]; conflicts: { path: string; reason: string }[]; skipped: { path: string; reason: string }[] };
  onRevert: (() => void) | null;
  changed: ChangedFile[];
}

let ctx: Ctx | null = null;
afterEach(() => {
  ctx?.f.cleanup();
  ctx = null;
});

function makeTask(projectId: string, patch: Partial<Task> = {}): Task {
  return {
    id: 'task_1',
    projectId,
    parentId: null,
    title: 'Login bauen',
    description: '',
    kind: 'code',
    role: 'coder',
    status: 'running',
    priority: 1,
    dependsOn: [],
    attempts: 1,
    maxAttempts: 3,
    blocker: null,
    blockerCode: null,
    result: null,
    acceptance: null,
    verification: { status: 'passed', checks: [] },
    files: [],
    plannedFiles: [],
    startRequested: false,
    model: null,
    source: 'user',
    createdAt: 1,
    updatedAt: 1,
    startedAt: 1,
    finishedAt: null,
    ...patch,
  };
}

function checkRun(projectId: string, kind: CheckKind, status: CheckRun['status'], startedAt: number): CheckRun {
  return {
    id: `crun_${kind}`,
    projectId,
    taskId: null,
    kind,
    command: 'npm test',
    status,
    passed: null,
    failed: null,
    skipped: null,
    durationMs: 10,
    outputTail: '',
    failures: [],
    failureSignature: null,
    message: null,
    processId: null,
    artifacts: [],
    startedAt,
    finishedAt: startedAt + 10,
  };
}

function setup(opts: { repo?: boolean; autoCommit?: boolean } = {}): Ctx {
  const journal: FakeJournal = { max: 0, changeTs: new Map(), revertCalls: [], result: { restored: [], conflicts: [], skipped: [] }, onRevert: null, changed: [] };
  const tasks: Task[] = [];
  const checks: Partial<Record<CheckKind, CheckRun>> = {};
  let project!: Project;
  const projects = {
    get: (id: string) => (id === project.id ? project : null),
    require: (id: string) => {
      if (id !== project.id) throw notFound('Projekt', id);
      return project;
    },
    list: () => [],
  } as unknown as Services['projects'];
  const journalSvc = {
    maxId: () => journal.max,
    get: (id: number) => (journal.changeTs.has(id) ? ({ id, ts: journal.changeTs.get(id)! } as ChangeRecord) : null),
    revert: async (input: { afterId?: number; taskId?: string; dryRun?: boolean }) => {
      journal.revertCalls.push({ afterId: input.afterId, taskId: input.taskId, dryRun: input.dryRun, maxAtCall: journal.max });
      if (!input.dryRun) journal.onRevert?.();
      return journal.result;
    },
    changedFiles: async () => journal.changed,
  } as unknown as Services['journal'];
  const tasksSvc = {
    list: (filter: { projectId?: string; status?: string[] }) => tasks.filter((t) => (!filter.projectId || t.projectId === filter.projectId) && (!filter.status || filter.status.includes(t.status))),
    get: (id: string) => tasks.find((t) => t.id === id) ?? null,
  } as unknown as Services['tasks'];
  const checksSvc = { latest: (_p: string, kind: CheckKind) => checks[kind] ?? null } as unknown as Services['checks'];
  const pathGuard = { isSensitive: (rel: string) => /(^|\/)\.env$/.test(rel) } as unknown as Services['pathGuard'];
  const f = gitFixture({ projects, extra: { journal: journalSvc, tasks: tasksSvc, checks: checksSvc, pathGuard } });
  f.s.git = f.git;
  const root = opts.repo === false ? join(f.dir, 'plain') : f.repo('proj', { files: { 'src/app.js': 'v1\n', 'README.md': '# x\n' } });
  if (opts.repo === false) f.write(root, 'src/app.js', 'v1\n');
  project = {
    id: 'prj_1',
    name: 'Projekt',
    description: '',
    path: root,
    kind: 'web',
    technologies: [],
    status: 'active',
    templateId: null,
    origin: 'new',
    config: { autoCommit: opts.autoCommit ?? true } as Project['config'],
    workState: 'running',
    gitAvailable: opts.repo !== false,
    createdAt: 1,
    updatedAt: 1,
  };
  // checkpoints.project_id references projects(id).
  f.t.core.db.run(
    "INSERT INTO projects(id, name, path, path_key, kind, config, created_at, updated_at) VALUES ('prj_1', 'Projekt', ?, ?, 'web', '{}', 1, 1)",
    [root, root],
  );
  const events: Checkpoint[] = [];
  f.t.core.bus.on('checkpoint.updated', (cp) => events.push(cp));
  const cps = createCheckpointService(f.s);
  ctx = { f, root, project, cps, journal, tasks, checks, events };
  return ctx;
}

describe('create / list / latestVerified', () => {
  it('stores HEAD, the journal cursor and a marker from the latest checks newer than the last change', async () => {
    const c = setup();
    c.journal.max = 7;
    c.journal.changeTs.set(7, 1000);
    const none = await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'Vor dem Umbau' });
    expect(none).toMatchObject({ kind: 'manual', label: 'Vor dem Umbau', changeCursor: 7, verification: 'not_run', gitCommit: null, restoredAt: null });
    expect(none.gitHead).toBe(c.f.sh(c.root, 'rev-parse', 'HEAD').trim());
    c.checks.test = checkRun('prj_1', 'test', 'passed', 900); // older than the last change → ignored
    expect((await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'b' })).verification).toBe('not_run');
    c.checks.test = checkRun('prj_1', 'test', 'passed', 1100);
    const passed = await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'c' });
    expect(passed.verification).toBe('passed');
    c.checks.build = checkRun('prj_1', 'build', 'failed', 1200);
    expect((await c.cps.create({ projectId: 'prj_1', kind: 'pre_task', label: 'd', taskId: 'task_9' })).verification).toBe('failed');
    expect((await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'e', verification: 'unavailable' })).verification).toBe('unavailable');
    expect(c.events).toHaveLength(5);
    expect(c.cps.list('prj_1').map((x) => x.label)).toEqual(['e', 'd', 'c', 'b', 'Vor dem Umbau']);
    expect(c.cps.latestVerified('prj_1')?.id).toBe(passed.id);
    expect(c.cps.latestVerified('other')).toBeNull();
  });

  it('works without git (gitHead null) and fails for unknown projects', async () => {
    const c = setup({ repo: false });
    expect((await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'x' })).gitHead).toBeNull();
    await expect(c.cps.create({ projectId: 'nope', kind: 'manual', label: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('preview / restore', () => {
  it('previews with dryRun against the checkpoint cursor or the task', async () => {
    const c = setup();
    c.journal.max = 3;
    const cp = await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'P' });
    c.journal.result = { restored: ['src/app.js'], conflicts: [{ path: 'b.txt', reason: 'geändert' }], skipped: [] };
    expect(await c.cps.preview({ checkpointId: cp.id })).toEqual({ restored: ['src/app.js'], conflicts: [{ path: 'b.txt', reason: 'geändert' }], skipped: [], commit: null, checkpointId: null });
    expect(c.journal.revertCalls[0]).toMatchObject({ afterId: 3, dryRun: true });
    c.tasks.push(makeTask('prj_1', { id: 'task_7', status: 'done' }));
    await c.cps.preview({ taskId: 'task_7' });
    expect(c.journal.revertCalls[1]).toMatchObject({ taskId: 'task_7', dryRun: true, afterId: undefined });
    await expect(c.cps.preview({})).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(c.cps.preview({ checkpointId: cp.id, taskId: 'task_7' })).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(c.cps.preview({ checkpointId: 'chk_missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(c.cps.preview({ taskId: 'task_missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(c.cps.projectIdFor({ taskId: 'task_7' })).toBe('prj_1');
  });

  it('refuses to restore while a task of the project runs', async () => {
    const c = setup();
    const cp = await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'P' });
    c.tasks.push(makeTask('prj_1', { status: 'running' }));
    await expect(c.cps.restore({ checkpointId: cp.id, commit: true })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(c.journal.revertCalls).toHaveLength(0);
  });

  it('creates pre_restore first, reverts, commits restored files without user-modified ones and marks the checkpoint', async () => {
    const c = setup();
    c.journal.max = 5;
    const cp = await c.cps.create({ projectId: 'prj_1', kind: 'manual', label: 'Stand A' });
    c.journal.max = 9; // NOVA changed things afterwards
    c.f.write(c.root, 'src/app.js', 'v2 by nova\n');
    c.f.sh(c.root, 'commit', '-qam', 'NOVA: change');
    c.journal.onRevert = () => {
      c.f.write(c.root, 'src/app.js', 'v1\n');
      c.f.write(c.root, 'README.md', '# user edited after restore\n');
      c.journal.max = 11; // the revert itself is journaled
    };
    c.journal.result = { restored: ['src/app.js', 'README.md'], conflicts: [{ path: 'notes.txt', reason: 'vom Benutzer geändert' }], skipped: [] };
    c.journal.changed = [{ path: 'README.md', op: 'modify', byNova: true, taskIds: [], gitStatus: null, modifiedSinceNova: true }];
    c.events.length = 0;
    const result = await c.cps.restore({ checkpointId: cp.id, commit: true });
    expect(c.journal.revertCalls[0]).toMatchObject({ afterId: 5, dryRun: undefined, maxAtCall: 9 });
    const pre = c.cps.list('prj_1').find((x) => x.kind === 'pre_restore')!;
    expect(pre.changeCursor).toBe(9);
    expect(pre.label).toBe('Vor Wiederherstellung: Stand A');
    expect(result.checkpointId).toBe(pre.id);
    expect(result.restored).toEqual(['src/app.js', 'README.md']);
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(c.f.sh(c.root, 'log', '-1', '--format=%s').trim()).toBe('NOVA: Wiederherstellung Stand A');
    expect(c.f.sh(c.root, 'show', '--name-only', '--format=', 'HEAD').trim()).toBe('src/app.js');
    expect(c.cps.list('prj_1').find((x) => x.id === cp.id)?.restoredAt).not.toBeNull();
    expect(c.events.map((e) => e.kind)).toEqual(['pre_restore', 'manual']);
    const conflictsReported = c.f.t.core.errors.list({ projectId: 'prj_1' }).filter((e) => e.code === 'RESTORE_CONFLICT');
    expect(conflictsReported).toHaveLength(1);
    expect(conflictsReported[0].whatHappened).toContain('notes.txt');
  });

  it('restores the changes of one task without committing when commit=false', async () => {
    const c = setup();
    c.tasks.push(makeTask('prj_1', { id: 'task_5', status: 'failed', title: 'Fehlerhafte Änderung' }));
    c.journal.onRevert = () => c.f.write(c.root, 'src/app.js', 'reverted\n');
    c.journal.result = { restored: ['src/app.js'], conflicts: [], skipped: [] };
    const headBefore = c.f.sh(c.root, 'rev-parse', 'HEAD').trim();
    const r = await c.cps.restore({ taskId: 'task_5', commit: false });
    expect(r.commit).toBeNull();
    expect(c.journal.revertCalls[0]).toMatchObject({ taskId: 'task_5' });
    expect(c.f.sh(c.root, 'rev-parse', 'HEAD').trim()).toBe(headBefore);
    expect(c.cps.list('prj_1')[0].label).toBe('Vor Wiederherstellung: Aufgabe „Fehlerhafte Änderung“');
  });
});

describe('afterTask', () => {
  it('commits verified task files except user-modified, sensitive and secret files; reports SECRET_IN_CODE', async () => {
    const c = setup();
    c.f.write(c.root, 'src/app.js', 'const password = form.password.value;\n');
    c.f.write(c.root, 'src/login.js', 'export const token = getToken();\n');
    c.f.write(c.root, 'src/config.js', "export const apiKey = 'sk-proj-abcdefghijklmnopqrstuvwxyz123456';\n");
    c.f.write(c.root, '.env', 'DB_PASSWORD=hunter2hunter\n');
    c.f.write(c.root, 'README.md', '# changed by user later\n');
    c.journal.changed = [{ path: 'README.md', op: 'modify', byNova: true, taskIds: ['task_1'], gitStatus: null, modifiedSinceNova: true }];
    const task = makeTask('prj_1', { files: ['src/app.js', 'src/login.js', 'src/config.js', '.env', 'README.md'], verification: { status: 'passed', checks: [] } });
    const cp = await c.cps.afterTask(task);
    expect(cp).toMatchObject({ kind: 'post_task', taskId: 'task_1', verification: 'passed', label: 'Nach Aufgabe: Login bauen' });
    expect(cp?.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(cp?.gitHead).toBe(cp?.gitCommit);
    expect(c.f.sh(c.root, 'show', '--name-only', '--format=%s', 'HEAD').trim().split('\n')).toEqual(['NOVA: Login bauen', '', 'src/app.js', 'src/login.js']);
    const secrets = c.f.t.core.errors.list({ projectId: 'prj_1' }).filter((e) => e.code === 'SECRET_IN_CODE');
    expect(secrets).toHaveLength(1);
    expect(secrets[0]).toMatchObject({ severity: 'warning', taskId: 'task_1' });
    expect(secrets[0].whatHappened).toContain('src/config.js');
    expect(secrets[0].whatHappened).toContain('.env');
  });

  it('never auto-commits files whose latest NOVA change was only detected after a command (origin uncertain) and reports them', async () => {
    const c = setup();
    c.f.write(c.root, 'src/login.js', 'export const x = 1;\n');
    c.f.write(c.root, 'notes.md', 'saved in VS Code while npm test ran\n');
    c.f.write(c.root, 'src/app.js', 'written by the tool, then changed during a command\n');
    c.f.write(c.root, 'src/b.js', 'changed during a command, then rewritten by the tool\n');
    const row = (path: string, source: string) =>
      c.f.t.core.db.run(
        "INSERT INTO changes(project_id, task_id, path, op, before_hash, after_hash, actor, source, revertible, state, path_key, ts, reverted) VALUES ('prj_1', 'task_1', ?, 'modify', 'a', 'b', 'nova', ?, 1, 'committed', ?, 1, 0)",
        [path, source, path],
      );
    row('src/login.js', 'tool');
    row('notes.md', 'command');
    row('src/app.js', 'tool');
    row('src/app.js', 'command');
    row('src/b.js', 'command');
    row('src/b.js', 'tool');
    const task = makeTask('prj_1', { files: ['src/login.js', 'notes.md', 'src/app.js', 'src/b.js'] });
    const cp = await c.cps.afterTask(task);
    expect(cp?.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(c.f.sh(c.root, 'show', '--name-only', '--format=%s', 'HEAD').trim().split('\n')).toEqual(['NOVA: Login bauen', '', 'src/b.js', 'src/login.js']);
    const warn = c.f.t.core.errors.list({ projectId: 'prj_1' }).filter((e) => e.title === 'Von Befehlen geänderte Dateien nicht committet');
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ severity: 'warning', taskId: 'task_1', projectSafe: true });
    expect(warn[0].whatHappened).toContain('notes.md');
    expect(warn[0].whatHappened).toContain('src/app.js');
    expect(warn[0].whatHappened).not.toContain('src/b.js');
    expect(c.f.sh(c.root, 'status', '--porcelain')).toContain('notes.md');
  });

  it('does not commit failed tasks, nor unverified ones while commitOnlyWhenVerified is on', async () => {
    const c = setup();
    c.f.write(c.root, 'src/app.js', 'v2\n');
    const head = c.f.sh(c.root, 'rev-parse', 'HEAD').trim();
    const failed = await c.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'], verification: { status: 'failed', checks: [] } }));
    expect(failed).toMatchObject({ verification: 'failed', gitCommit: null });
    const unavailable = await c.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'], verification: { status: 'unavailable', checks: [] } }));
    expect(unavailable).toMatchObject({ verification: 'unavailable', gitCommit: null });
    expect(c.f.sh(c.root, 'rev-parse', 'HEAD').trim()).toBe(head);
    c.f.t.core.settings.update({ agents: { commitOnlyWhenVerified: false } });
    const relaxed = await c.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'], verification: { status: 'unavailable', checks: [] } }));
    expect(relaxed?.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    const stillFailed = await c.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'], verification: { status: 'failed', checks: [] } }));
    expect(stillFailed?.gitCommit).toBeNull();
  });

  it('respects project.config.autoCommit=false and missing repositories', async () => {
    const c = setup({ autoCommit: false });
    c.f.write(c.root, 'src/app.js', 'v2\n');
    expect((await c.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'] })))?.gitCommit).toBeNull();
    c.f.cleanup();
    ctx = null;
    const plain = setup({ repo: false });
    expect(await plain.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'] }))).toMatchObject({ gitCommit: null, gitHead: null, kind: 'post_task' });
    expect(await plain.cps.afterTask(makeTask('prj_unknown'))).toBeNull();
  });

  it('turns a rejecting git hook into a GIT_ERROR warning without failing', async () => {
    const c = setup();
    const hook = join(c.root, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\nexit 1\n');
    chmodSync(hook, 0o755);
    c.f.write(c.root, 'src/app.js', 'v2\n');
    const cp = await c.cps.afterTask(makeTask('prj_1', { files: ['src/app.js'] }));
    expect(cp).toMatchObject({ kind: 'post_task', gitCommit: null });
    const errs = c.f.t.core.errors.list({ projectId: 'prj_1' }).filter((e) => e.code === 'GIT_ERROR');
    expect(errs).toHaveLength(1);
    expect(errs[0].severity).toBe('warning');
  });
});

describe('prune', () => {
  it('keeps the newest 50 per project and the latest verified checkpoint', async () => {
    const c = setup();
    const db = c.f.t.core.db;
    for (let i = 0; i < 60; i++) {
      db.run("INSERT INTO checkpoints(id, project_id, task_id, kind, label, change_cursor, verification, created_at) VALUES (?, 'prj_1', NULL, 'manual', ?, 0, ?, ?)", [
        `chk_${i}`,
        `cp ${i}`,
        i === 2 ? 'passed' : 'not_run',
        1000 + i,
      ]);
    }
    expect(c.cps.prune(5000)).toBe(9); // 60 − 50 newest − 1 latest verified
    const ids = c.cps.list('prj_1').map((x) => x.id);
    expect(ids).toHaveLength(51);
    expect(ids).toContain('chk_2');
    expect(c.cps.prune(0)).toBe(0);
  });
});
