// RPC methods of the projects module: projects.*, templates.list, checks.*, preview.* (src/shared/rpc.ts).
// Params arrive zod-parsed from the router. projects.setWork is an alias for work.start/stop({projectId}) – the work
// cycle is the only writer of project.workState (it calls projects.setWorkState).
import type { RpcRegistrar } from '../contracts';
import { notFound } from '../core/errors';

export const registerProjectsRpc: RpcRegistrar = (router, s) => {
  router.register('projects.list', async (p) => s.projects.list({ includeArchived: p.includeArchived }));
  router.register('projects.get', async (p) => s.projects.summary(p.id));
  router.register('projects.create', async (p) => s.projects.create(p));
  router.register('projects.update', async (p) => s.projects.update(p));
  router.register('projects.detect', async (p) => s.projects.detect(p.id));
  router.register('projects.remove', async (p) => {
    await s.projects.remove(p.id);
    return { ok: true as const };
  });
  router.register('projects.setWork', async (p) => {
    s.projects.require(p.id);
    if (p.enabled) s.work.start(p.id);
    else s.work.stop(p.id);
    return s.projects.require(p.id);
  });
  router.register('templates.list', async () => s.templates.list());

  router.register('checks.list', async (p) => {
    s.projects.require(p.projectId);
    return s.checks.list(p.projectId, { kind: p.kind, taskId: p.taskId, limit: p.limit });
  });
  router.register('checks.get', async (p) => {
    const run = s.checks.get(p.id);
    if (!run) throw notFound('Die Prüfung', p.id);
    return run;
  });
  router.register('checks.run', async (p) => s.checks.start({ projectId: p.projectId, kind: p.kind, actor: 'user' }));
  router.register('checks.cancel', async (p) => s.checks.cancel(p.id));

  router.register('preview.status', async (p) => s.preview.status(p.projectId));
  router.register('preview.start', async (p) => s.preview.start(p.projectId));
  router.register('preview.stop', async (p) => {
    s.projects.require(p.projectId);
    return s.preview.stop(p.projectId);
  });
};
