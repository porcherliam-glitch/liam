// RPC methods of the agents module: agents.roles, agents.runs, agents.steps (params are zod-parsed by the router).
// agents.steps answers NOT_FOUND for unknown runs so the UI can tell "deleted" from "no steps yet".
import type { RpcRegistrar } from '../contracts';
import { notFound } from '../core/errors';

export const registerAgentsRpc: RpcRegistrar = (router, s) => {
  router.register('agents.roles', async () => s.agents.roles());

  router.register('agents.runs', async (params) =>
    s.runs.list({
      projectId: params.projectId,
      taskId: params.taskId,
      activeOnly: params.activeOnly,
      limit: params.limit,
    }),
  );

  router.register('agents.steps', async (params) => {
    if (!s.runs.get(params.runId)) throw notFound('Agentenlauf', params.runId);
    return s.runs.steps(params.runId, params.afterId, params.limit);
  });
};
