import { describe, it, expect, afterEach } from 'vitest';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { RpcRouter } from '../contracts';
import { createRunStore } from './run-store';
import { createAgentRunner } from './runner';
import { registerAgentsRpc } from './rpc';
import { insertProjectAndTask } from './test-fixtures';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

function fakeRouter(): { router: RpcRouter; call(method: RpcMethod, params: unknown): Promise<unknown> } {
  const handlers = new Map<string, (p: unknown, ctx: { requestId: string }) => unknown>();
  const router = {
    register(method: string, handler: (p: unknown, ctx: { requestId: string }) => unknown) {
      handlers.set(method, handler);
    },
    handle: async () => {
      throw new Error('not used');
    },
    registered: () => [...handlers.keys()],
  } as unknown as RpcRouter;
  return {
    router,
    async call(method, params) {
      const parsed = RpcContract[method].params.parse(params);
      const result = await handlers.get(method)!(parsed, { requestId: 'r1' });
      return RpcContract[method].result.parse(result);
    },
  };
}

describe('registerAgentsRpc', () => {
  it('registers agents.roles, agents.runs and agents.steps with valid results', async () => {
    t = createTestCore();
    const { project, task } = insertProjectAndTask(t.core);
    const s = makeServices(t.core);
    s.runs = createRunStore(s);
    s.agents = createAgentRunner(s);
    const { router, call } = fakeRouter();
    registerAgentsRpc(router, s);
    expect(router.registered().sort()).toEqual(['agents.roles', 'agents.runs', 'agents.steps']);

    const roles = (await call('agents.roles', {})) as Array<{ role: string }>;
    expect(roles).toHaveLength(4);

    const run = s.runs.create({ taskId: task.id, projectId: project.id, role: 'coder' });
    s.runs.addStep(run.id, 'status', 'Lauf gestartet');
    const runs = (await call('agents.runs', { projectId: project.id })) as Array<{ id: string }>;
    expect(runs.map((r) => r.id)).toEqual([run.id]);
    expect(await call('agents.runs', { activeOnly: true, taskId: 'other' })).toEqual([]);
    const steps = (await call('agents.steps', { runId: run.id })) as Array<{ summary: string }>;
    expect(steps.map((x) => x.summary)).toEqual(['Lauf gestartet']);
    await expect(call('agents.steps', { runId: 'run_missing' })).rejects.toThrow(/nicht gefunden/);
  });
});
