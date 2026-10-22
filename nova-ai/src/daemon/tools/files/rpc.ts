// RPC handlers files.* (SPEC §2 module table: tools → files.*). Params arrive zod-parsed (defaults applied) from the
// router; every handler delegates to the FileService of the container passed to the registrar.
import type { RpcRegistrar } from '../../contracts';

export const registerFilesRpc: RpcRegistrar = (router, services) => {
  router.register('files.tree', (p) => services.files.tree(p.projectId, p.path, p.depth));
  router.register('files.read', (p) => services.files.read(p.projectId, p.path));
  router.register('files.write', (p) => services.files.write(p.projectId, p.path, p.content, p.expectedHash));
  router.register('files.search', (p) => services.files.search(p.projectId, p.query, { regex: p.regex, caseSensitive: p.caseSensitive, limit: p.limit }));
  router.register('files.changed', (p) => services.files.changed(p.projectId));
  router.register('files.history', (p) => services.files.history(p.projectId, { path: p.path, taskId: p.taskId, limit: p.limit }));
  router.register('files.diff', (p) => services.files.diff(p.projectId, p.path, { taskId: p.taskId, changeId: p.changeId }));
  router.register('files.delete', async (p) => {
    await services.files.delete(p.projectId, p.path);
    return { ok: true as const };
  });
  router.register('files.rename', async (p) => {
    await services.files.rename(p.projectId, p.from, p.to);
    return { ok: true as const };
  });
  router.register('files.mkdir', async (p) => {
    await services.files.mkdir(p.projectId, p.path);
    return { ok: true as const };
  });
  router.register('files.snapshot', (p) => services.files.snapshot(p.projectId, p.hash));
};
