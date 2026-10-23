// RPC handlers of the integrations sub-module: integrations.list / setPath / install / open (src/shared/rpc.ts).
// integrations.install only creates an 'install' approval (or reports why it cannot); the installation itself runs
// after the user approved it (IntegrationService). integrations.open is a user action (detached program start).
import type { RpcRegistrar } from '../contracts';

export const registerIntegrationsRpc: RpcRegistrar = (router, s) => {
  router.register('integrations.list', ({ refresh }) => s.integrations.list(refresh));
  router.register('integrations.setPath', ({ id, path }) => s.integrations.setPath(id, path));
  router.register('integrations.install', ({ id }) => s.integrations.requestInstall(id));
  router.register('integrations.open', async ({ id, projectId, path, line }) => {
    await s.integrations.open({ id, projectId, path, line });
    return { ok: true as const };
  });
};
