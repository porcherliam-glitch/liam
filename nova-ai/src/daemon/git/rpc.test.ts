// registerGitRpc with a contract-validating router (params parsed and results checked with RpcContract) on real
// git/checkpoint/backup services: every method registered, git.init refreshes the project, long work runs as
// operations of the right kind (restore, project_snapshot, backup_restore, export, import) with the right
// cancellability, and cancelling a snapshot fails the call with CANCELLED.
import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ChangeRecord, Operation } from '@shared/schemas';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import type { RpcHandler, RpcRouter, Services } from '../contracts';
import { backupHarness, type BackupHarness } from '../backup/test-support';
import { createCheckpointService } from '../checkpoints/checkpoint-service';
import { createGitService } from './git-service';
import { registerGitRpc } from './rpc';
import { fakeApprovals } from './test-support';

let h: BackupHarness | null = null;
afterEach(() => {
  h?.cleanup();
  h = null;
});

function testRouter() {
  const handlers = new Map<string, RpcHandler<RpcMethod>>();
  const router: RpcRouter = {
    register(method, handler) {
      handlers.set(method, handler as unknown as RpcHandler<RpcMethod>);
    },
    async handle() {
      throw new Error('not used');
    },
    registered: () => [...handlers.keys()],
  };
  function call(method: RpcMethod, raw: unknown): Promise<unknown> {
    const params = RpcContract[method].params.parse(raw);
    return Promise.resolve(handlers.get(method)!(params as never, { requestId: 'req_1' })).then((result) => RpcContract[method].result.parse(result));
  }
  return { router, call };
}

function setup() {
  const journal = {
    maxId: () => 0,
    get: (): ChangeRecord | null => null,
    revert: async () => ({ restored: [], conflicts: [], skipped: [] }),
    changedFiles: async () => [],
    pruneSnapshots: () => 0,
  } as unknown as Services['journal'];
  const checks = { latest: () => null } as unknown as Services['checks'];
  h = backupHarness({ extra: { journal, checks, approvals: fakeApprovals() } });
  const globalCfg = join(h.scratch, 'global.gitconfig');
  writeFileSync(globalCfg, '');
  h.s.git = createGitService(h.s, { gitPath: 'git', extraEnv: { GIT_CONFIG_GLOBAL: globalCfg, GIT_CONFIG_NOSYSTEM: '1' } });
  h.s.checkpoints = createCheckpointService(h.s);
  h.s.backups = h.backups;
  const root = join(h.scratch, 'projekt');
  mkdirSync(root);
  h.write(root, 'index.html', '<h1>Hallo</h1>\n');
  h.addProject({ id: 'prj_1', name: 'Projekt', path: root });
  const ops: Operation[] = [];
  h.t.core.bus.on('operation.updated', (op) => ops.push(op));
  const { router, call } = testRouter();
  registerGitRpc(router, h.s);
  return { h, root, ops, router, call };
}

const finalOp = (ops: Operation[], kind: Operation['kind']) => [...ops].reverse().find((o) => o.kind === kind && o.status !== 'running');

describe('registerGitRpc', () => {
  it('registers every git/checkpoint/backup/data method', () => {
    const { router } = setup();
    expect(router.registered().sort()).toEqual(
      [
        'git.status',
        'git.diff',
        'git.log',
        'git.init',
        'checkpoints.list',
        'checkpoints.create',
        'checkpoints.preview',
        'checkpoints.restore',
        'backup.list',
        'backup.create',
        'backup.snapshotProject',
        'backup.restore',
        'backup.delete',
        'data.export',
        'data.import',
      ].sort(),
    );
  });

  it('git.init creates the repository, refreshes the project and returns a contract-valid status; status/diff/log follow', async () => {
    const { h, root, call } = setup();
    const status = (await call('git.init', { projectId: 'prj_1' })) as { isRepo: boolean; files: { path: string }[] };
    expect(status.isRepo).toBe(true);
    expect(status.files.map((f) => f.path)).toEqual(['index.html']);
    expect(h.refreshed).toEqual(['prj_1']);
    await h.s.git.commitPaths(root, ['index.html'], 'NOVA: Start');
    writeFileSync(join(root, 'index.html'), '<h1>Neu</h1>\n');
    expect(((await call('git.status', { projectId: 'prj_1' })) as { clean: boolean }).clean).toBe(false);
    const diff = (await call('git.diff', { projectId: 'prj_1' })) as { path: string; modified: string }[];
    expect(diff).toEqual([expect.objectContaining({ path: 'index.html', modified: '<h1>Neu</h1>\n' })]);
    const log = (await call('git.log', { projectId: 'prj_1', limit: 5 })) as { byNova: boolean }[];
    expect(log).toHaveLength(1);
    expect(log[0].byNova).toBe(true);
    expect(() => RpcContract['git.diff'].params.parse({ projectId: 'prj_1', ref: '--output=/tmp/x' })).toThrow();
    await expect(call('git.status', { projectId: 'prj_unknown' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('checkpoints.create/list/preview and restore as a non-cancellable "restore" operation', async () => {
    const { call, ops } = setup();
    const cp = (await call('checkpoints.create', { projectId: 'prj_1', label: 'Vor dem Umbau' })) as { id: string; kind: string };
    expect(cp.kind).toBe('manual');
    expect(((await call('checkpoints.list', { projectId: 'prj_1' })) as unknown[]).length).toBe(1);
    expect(await call('checkpoints.preview', { checkpointId: cp.id })).toEqual({ restored: [], conflicts: [], skipped: [], commit: null, checkpointId: null });
    const restored = (await call('checkpoints.restore', { checkpointId: cp.id })) as { checkpointId: string };
    expect(restored.checkpointId).toMatch(/^chk_/);
    const op = finalOp(ops, 'restore');
    expect(op).toMatchObject({ status: 'done', projectId: 'prj_1', cancellable: false });
    expect(() => RpcContract['checkpoints.restore'].params.parse({ checkpointId: 'a', taskId: 'b' })).toThrow();
  });

  it('backup.create/list/delete and a database restore through the backup_restore operation', async () => {
    const { h, call, ops } = setup();
    const b = (await call('backup.create', {})) as { id: string; reason: string };
    expect(b.reason).toBe('manuell');
    expect(((await call('backup.list', {})) as { id: string }[]).map((x) => x.id)).toContain(b.id);
    const r = (await call('backup.restore', { id: b.id })) as { restartRequired: boolean };
    expect(r.restartRequired).toBe(true);
    expect(finalOp(ops, 'backup_restore')).toMatchObject({ status: 'done', cancellable: false });
    const other = (await call('backup.create', { reason: 'zum Löschen' })) as { id: string };
    expect(await call('backup.delete', { id: other.id })).toEqual({ ok: true });
    h.backups.setRestartHandler(null);
  });

  it('backup.snapshotProject and its restore run as cancellable operations; cancel → CANCELLED', async () => {
    const { h, call, ops } = setup();
    const snap = (await call('backup.snapshotProject', { projectId: 'prj_1' })) as { id: string; kind: string };
    expect(snap.kind).toBe('project_snapshot');
    expect(finalOp(ops, 'project_snapshot')).toMatchObject({ status: 'done', projectId: 'prj_1', cancellable: true, progress: 100 });
    const target = join(h.scratch, 'wiederhergestellt');
    const restored = (await call('backup.restore', { id: snap.id, targetDir: target })) as { path: string };
    expect(restored.path).toBe(target);
    expect(finalOp(ops, 'backup_restore')).toMatchObject({ status: 'done', cancellable: true, projectId: 'prj_1' });
    const pending = call('backup.snapshotProject', { projectId: 'prj_1' });
    const running = h.t.core.operations.list(true).find((o) => o.kind === 'project_snapshot')!;
    h.t.core.operations.cancel(running.id);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
  });

  it('data.export / data.import run as export (cancellable) and import (not cancellable) operations', async () => {
    const { call, ops } = setup();
    const exp = (await call('data.export', { sections: ['projects', 'settings'] })) as { path: string; counts: Record<string, number> };
    expect(exp.counts).toEqual({ projects: 1, settings: 13 });
    expect(finalOp(ops, 'export')).toMatchObject({ status: 'done', cancellable: true });
    const imp = (await call('data.import', { path: exp.path })) as { counts: Record<string, number>; warnings: string[] };
    expect(imp.counts.projects).toBe(0);
    expect(imp.warnings.some((w) => w.includes('bereits vorhanden'))).toBe(true);
    expect(finalOp(ops, 'import')).toMatchObject({ status: 'done', cancellable: false });
    expect(() => RpcContract['data.export'].params.parse({ sections: [] })).toThrow();
  });
});
