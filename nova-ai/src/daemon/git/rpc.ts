// RPC handlers of the git module (src/shared/rpc.ts): git.status/diff/log/init, checkpoints.list/create/preview/
// restore, backup.list/create/snapshotProject/restore/delete, data.export/import. Params arrive zod-parsed.
// Key decisions:
// - Project-based calls resolve the project root through ProjectService (NOT_FOUND for unknown projects).
// - git.init calls projects.refreshGit afterwards so project.gitAvailable and the UI update.
// - Long work runs inside core.operations.run (SPEC §6.0.6) with unchanged result types: checkpoints.restore (kind
//   restore), backup.snapshotProject (project_snapshot), backup.restore (backup_restore), data.export (export),
//   data.import (import). Operations that cannot be interrupted safely are registered as not cancellable:
//   checkpoint restores, database restores (validation + backup + restart request) and data imports (one database
//   transaction). Snapshot copies and exports honour the operation's cancel signal.
import type { RpcRegistrar, Services } from '../contracts';
import type { CheckpointServiceImpl } from '../checkpoints/checkpoint-service';
import type { BackupServiceImpl } from '../backup/backup-service';

function backups(s: Services): BackupServiceImpl {
  // Extra optional arguments (signal/progress) are ignored by implementations that do not support them.
  return s.backups as BackupServiceImpl;
}

function restoreProjectId(s: Services, input: { checkpointId?: string; taskId?: string }): string | null {
  const impl = s.checkpoints as Partial<CheckpointServiceImpl>;
  try {
    return impl.projectIdFor ? impl.projectIdFor(input) : null;
  } catch {
    return null; // restore() itself reports the precise error
  }
}

export const registerGitRpc: RpcRegistrar = (router, s) => {
  const root = (projectId: string) => s.projects.require(projectId).path;

  router.register('git.status', async ({ projectId }) => s.git.status(root(projectId)));

  router.register('git.diff', async ({ projectId, path, ref, staged }) => s.git.diff(root(projectId), { path, ref, staged }));

  router.register('git.log', async ({ projectId, limit }) => s.git.log(root(projectId), limit));

  router.register('git.init', async ({ projectId }) => {
    const dir = root(projectId);
    await s.git.init(dir);
    await s.projects.refreshGit(projectId);
    return s.git.status(dir);
  });

  router.register('checkpoints.list', ({ projectId }) => {
    s.projects.require(projectId);
    return s.checkpoints.list(projectId);
  });

  router.register('checkpoints.create', ({ projectId, label }) => s.checkpoints.create({ projectId, kind: 'manual', label }));

  router.register('checkpoints.preview', ({ checkpointId, taskId }) => s.checkpoints.preview({ checkpointId, taskId }));

  router.register('checkpoints.restore', async ({ checkpointId, taskId, commit }) => {
    const projectId = restoreProjectId(s, { checkpointId, taskId });
    const op = s.core.operations.run(
      { kind: 'restore', title: taskId ? 'Änderungen einer Aufgabe werden rückgängig gemacht' : 'Wiederherstellungspunkt wird wiederhergestellt', projectId, cancellable: false },
      async (ctx) => {
        ctx.progress(null, 'Dateien werden wiederhergestellt …');
        return s.checkpoints.restore({ checkpointId, taskId, commit });
      },
    );
    return op.result;
  });

  router.register('backup.list', () => s.backups.list());

  router.register('backup.create', ({ reason }) => s.backups.createDatabaseBackup(reason));

  router.register('backup.snapshotProject', async ({ projectId }) => {
    const project = s.projects.require(projectId);
    const op = s.core.operations.run({ kind: 'project_snapshot', title: `Projektkopie wird erstellt: ${project.name}`, projectId, cancellable: true }, (ctx) =>
      backups(s).snapshotProject(projectId, ctx.signal, (p, m) => ctx.progress(p, m)),
    );
    return op.result;
  });

  router.register('backup.restore', async ({ id, targetDir }) => {
    const info = s.backups.list().find((b) => b.id === id) ?? null;
    const title =
      info?.kind === 'project_snapshot' ? 'Projektkopie wird wiederhergestellt' : info?.kind === 'export' ? 'Export wird eingespielt' : 'Datenbank-Wiederherstellung wird vorbereitet';
    const op = s.core.operations.run(
      { kind: 'backup_restore', title, projectId: info?.projectId ?? null, cancellable: info?.kind === 'project_snapshot' },
      (ctx) => backups(s).restore(id, { targetDir, signal: ctx.signal, onProgress: (p, m) => ctx.progress(p, m) }),
    );
    return op.result;
  });

  router.register('backup.delete', ({ id }) => {
    s.backups.delete(id);
    return { ok: true as const };
  });

  router.register('data.export', async ({ sections, path }) => {
    const op = s.core.operations.run({ kind: 'export', title: 'Daten werden exportiert', projectId: null, cancellable: true }, (ctx) =>
      backups(s).exportData(sections, path, { signal: ctx.signal, onProgress: (p, m) => ctx.progress(p, m) }),
    );
    return op.result;
  });

  router.register('data.import', async ({ path }) => {
    const op = s.core.operations.run({ kind: 'import', title: 'Daten werden importiert', projectId: null, cancellable: false }, (ctx) =>
      backups(s).importData(path, { signal: ctx.signal, onProgress: (p, m) => ctx.progress(p, m) }),
    );
    return op.result;
  });
};
