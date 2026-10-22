// RPC handlers of the resources sub-module: resources.snapshot / resources.history (src/shared/rpc.ts).
// resources.snapshot takes a fresh sample: the request shows that a client wants current numbers, which keeps the GPU
// probe at its fast interval for the next minute (ResourceMonitor). A failing sample → the latest one, or null (the UI
// then shows "noch keine Messwerte").
import type { RpcRegistrar } from '../contracts';

export const registerResourcesRpc: RpcRegistrar = (router, s) => {
  router.register('resources.snapshot', async () => {
    try {
      return await s.resources.sample();
    } catch (e) {
      s.core.log.child('resources').warn('Messung der Systemressourcen fehlgeschlagen', { error: e instanceof Error ? e.message : String(e) });
      return s.resources.latest();
    }
  });
  router.register('resources.history', ({ minutes }) => s.resources.history(minutes));
};
