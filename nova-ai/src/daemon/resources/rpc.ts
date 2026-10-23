// RPC handlers of the resources sub-module: resources.snapshot / resources.history (src/shared/rpc.ts).
// resources.snapshot returns the latest sample; before the first sample exists it takes one (a failing sample → null,
// the UI then shows "noch keine Messwerte").
import type { RpcRegistrar } from '../contracts';

export const registerResourcesRpc: RpcRegistrar = (router, s) => {
  router.register('resources.snapshot', async () => {
    const latest = s.resources.latest();
    if (latest) return latest;
    try {
      return await s.resources.sample();
    } catch (e) {
      s.core.log.child('resources').warn('Messung der Systemressourcen fehlgeschlagen', { error: e instanceof Error ? e.message : String(e) });
      return null;
    }
  });
  router.register('resources.history', ({ minutes }) => s.resources.history(minutes));
};
