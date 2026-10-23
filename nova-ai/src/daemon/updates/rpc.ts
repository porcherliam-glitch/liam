// RPC handler of the updates sub-module: updates.check (src/shared/rpc.ts). Expected failures come back as UpdateInfo
// with a German message, so the settings page can always show a result.
import type { RpcRegistrar } from '../contracts';

export const registerUpdatesRpc: RpcRegistrar = (router, s) => {
  router.register('updates.check', () => s.updates.check());
};
