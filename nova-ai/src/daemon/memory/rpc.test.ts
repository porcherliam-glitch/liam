// Tests of registerMemoryRpc with a contract-validating router (params parsed and results checked with RpcContract):
// all memory.* methods, user source for memory.add, partial updates, and export/import as operations
// (kinds memory_export / memory_import) including cancellation.
import { afterEach, describe, expect, it } from 'vitest';
import type { Operation } from '@shared/schemas';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import type { RpcHandler, RpcRouter } from '../contracts';
import { NovaError } from '../core/errors';
import { registerMemoryRpc } from './rpc';
import { memoryHarness, type MemoryHarness } from './test-support';

let h: MemoryHarness;
afterEach(() => h?.cleanup());

/** Minimal router: parses params with the contract, validates results with the contract result schema. */
function testRouter() {
  const handlers = new Map<string, RpcHandler<RpcMethod>>();
  const router: RpcRouter = {
    register(method, handler) {
      handlers.set(method, handler as unknown as RpcHandler<RpcMethod>);
    },
    async handle() {
      throw new Error('not used');
    },
    registered: () => [...handlers.keys()],
  };
  async function call(method: RpcMethod, raw: unknown): Promise<unknown> {
    const params = RpcContract[method].params.parse(raw);
    const result = await handlers.get(method)!(params as never, { requestId: 'req_1' });
    return RpcContract[method].result.parse(result);
  }
  return { router, call };
}

function operations(): Operation[] {
  const ops: Operation[] = [];
  h.t.core.bus.on('operation.updated', (op) => ops.push(op));
  return ops;
}

describe('registerMemoryRpc', () => {
  it('registers every memory.* method', () => {
    h = memoryHarness();
    const { router } = testRouter();
    registerMemoryRpc(router, h.s);
    expect(router.registered().sort()).toEqual(
      ['memory.add', 'memory.clear', 'memory.delete', 'memory.export', 'memory.import', 'memory.list', 'memory.search', 'memory.update'].sort(),
    );
  });

  it('adds as user, lists, searches, updates partially, deletes and clears with contract-valid results', async () => {
    h = memoryHarness();
    const { router, call } = testRouter();
    registerMemoryRpc(router, h.s);
    // agentsMayWrite does not affect user entries.
    h.t.core.settings.update({ memory: { agentsMayWrite: false } });
    const added = (await call('memory.add', { projectId: 'prj_a', kind: 'insight', title: 'Spielschleife', content: 'requestAnimationFrame nutzen' })) as {
      id: string;
      source: string;
      taskId: string | null;
      shareable: boolean;
      tags: string[];
    };
    expect(added).toMatchObject({ source: 'user', taskId: null, shareable: false, tags: [] });
    await call('memory.add', { projectId: null, kind: 'insight', title: 'Global', content: 'Kleine Commits', shareable: true });

    expect(await call('memory.list', undefined)).toHaveLength(2);
    expect(await call('memory.list', { projectId: null })).toHaveLength(1);
    const found = (await call('memory.search', { query: 'Spielschleife', projectId: 'prj_a' })) as { id: string; snippet: string }[];
    expect(found.map((r) => r.id)).toEqual([added.id]);

    const updated = (await call('memory.update', { id: added.id, shareable: true })) as { title: string; content: string; shareable: boolean };
    expect(updated).toMatchObject({ title: 'Spielschleife', content: 'requestAnimationFrame nutzen', shareable: true });

    expect(await call('memory.delete', { id: added.id })).toEqual({ ok: true });
    expect(await call('memory.clear', { projectId: null })).toEqual({ deleted: 1 });
    expect(await call('memory.list', {})).toEqual([]);
  });

  it('maps service errors to NovaErrors (e.g. secrets are rejected)', async () => {
    h = memoryHarness();
    const { router, call } = testRouter();
    registerMemoryRpc(router, h.s);
    await expect(call('memory.add', { projectId: 'prj_a', kind: 'note', title: 'Key', content: 'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwxyz123456' })).rejects.toMatchObject({
      code: 'VALIDATION',
    });
    await expect(call('memory.delete', { id: 'mem_unknown' })).rejects.toBeInstanceOf(NovaError);
  });

  it('runs export and import as operations of kind memory_export / memory_import', async () => {
    h = memoryHarness();
    const { router, call } = testRouter();
    registerMemoryRpc(router, h.s);
    const ops = operations();
    h.memory.add({ projectId: 'prj_a', kind: 'goal', title: 'Ziel', content: 'Spiel bauen' }, 'system');
    const exported = (await call('memory.export', { projectId: 'prj_a' })) as { path: string; count: number };
    expect(exported.count).toBe(1);
    const exportOps = ops.filter((o) => o.kind === 'memory_export');
    expect(exportOps[0]).toMatchObject({ status: 'running', projectId: 'prj_a', title: 'Projektgedächtnis „Sternenjäger“ exportieren' });
    expect(exportOps.at(-1)).toMatchObject({ status: 'done', progress: 100 });

    h.memory.clear('prj_a');
    expect(await call('memory.import', { path: exported.path })).toEqual({ imported: 1, skipped: 0 });
    const importOps = ops.filter((o) => o.kind === 'memory_import');
    expect(importOps[0]).toMatchObject({ status: 'running', title: 'Gedächtnis importieren' });
    expect(importOps.at(-1)).toMatchObject({ status: 'done' });

    expect(((await call('memory.export', {})) as { path: string }).path).toMatch(/memory-gesamt-/);
    expect(ops.filter((o) => o.kind === 'memory_export').some((o) => o.title === 'Gesamtes Gedächtnis exportieren')).toBe(true);
  });

  it('fails with CANCELLED when the operation is cancelled', async () => {
    h = memoryHarness(undefined, { chunkSize: 1 });
    const { router, call } = testRouter();
    registerMemoryRpc(router, h.s);
    for (let i = 0; i < 5; i++) h.memory.add({ projectId: null, kind: 'insight', title: `Wissen ${i}`, content: '' }, 'user');
    const pending = call('memory.export', { projectId: null });
    const [op] = h.t.core.operations.list();
    expect(op.kind).toBe('memory_export');
    h.t.core.operations.cancel(op.id);
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(h.t.core.operations.get(op.id)?.status).toBe('cancelled');
  });
});
