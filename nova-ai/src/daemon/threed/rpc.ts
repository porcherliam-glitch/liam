// RPC handlers of the 3D workshop: threed.* (src/shared/rpc.ts). Params arrive zod-parsed by the router.
// threed.downloadModel returns the Operation (kind 'threed_download'; progress via 'operation.updated', cancel via
// operations.cancel); jobs report via 'threed.job' events. threed.job answers NOT_FOUND for unknown ids.
import type { RpcRegistrar } from '../contracts';
import { notFound } from '../core/errors';

export const registerThreeDRpc: RpcRegistrar = (router, s) => {
  router.register('threed.status', ({ refresh }) => s.threed.status(refresh));
  router.register('threed.configure', (params) => s.threed.configure(params));
  router.register('threed.models', () => s.threed.models());
  router.register('threed.downloadModel', ({ id }) => s.threed.downloadModel(id));
  router.register('threed.deleteModel', async ({ id }) => {
    await s.threed.deleteModel(id);
    return { ok: true as const };
  });
  router.register('threed.generate', (params) => s.threed.generate(params, { taskId: null, runId: null }));
  router.register('threed.jobs', ({ projectId, limit }) => s.threed.jobs({ projectId, limit }));
  router.register('threed.job', ({ id }) => {
    const job = s.threed.get(id);
    if (!job) throw notFound('Der 3D-Auftrag', id);
    return job;
  });
  router.register('threed.cancel', ({ id }) => s.threed.cancel(id));
  router.register('threed.deleteJob', ({ id, deleteFiles }) => {
    s.threed.deleteJob(id, deleteFiles);
    return { ok: true as const };
  });
  router.register('threed.readFile', ({ id, kind }) => s.threed.readFile(id, kind));
};
