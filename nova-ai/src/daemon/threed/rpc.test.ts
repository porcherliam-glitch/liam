// Tests for registerThreeDRpc: every threed.* method of the contract is registered and returns contract-valid results.
import { afterEach, describe, expect, it } from 'vitest';
import { RPC_METHODS, RpcContract, type RpcMethod } from '@shared/rpc';
import { tinyPng } from '../../../tests/fakes/fake-comfyui';
import type { RpcHandler, RpcRouter } from '../contracts';
import { registerThreeDRpc } from './rpc';
import { createThreeDHarness, type ThreeDHarness } from './test-support';

let h: ThreeDHarness | null = null;
afterEach(async () => {
  if (h) {
    await h.svc.shutdown();
    h.cleanup();
  }
  h = null;
});

function stubRouter() {
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
  const call = async (method: RpcMethod, params: unknown = {}) => {
    const parsed = (RpcContract[method].params as { parse(v: unknown): unknown }).parse(params);
    const result = await handlers.get(method)!(parsed as never, { requestId: 'r1' });
    (RpcContract[method].result as { parse(v: unknown): unknown }).parse(result);
    return result as unknown;
  };
  return { router, call };
}

describe('registerThreeDRpc', () => {
  it('registers exactly the threed.* methods of the contract', () => {
    h = createThreeDHarness();
    const { router } = stubRouter();
    registerThreeDRpc(router, h.s);
    expect(router.registered().sort()).toEqual(RPC_METHODS.filter((m) => m.startsWith('threed.')).sort());
  });

  it('handlers return contract-valid results', async () => {
    h = createThreeDHarness({ installed: ['trellis2', 'pixal3d', 'z_image_turbo'] });
    const { router, call } = stubRouter();
    registerThreeDRpc(router, h.s);
    expect(await call('threed.status', { refresh: true })).toMatchObject({ running: true, supports3d: true });
    expect(await call('threed.status')).toMatchObject({ running: true });
    expect(await call('threed.configure', { engineUrl: '127.0.0.1:8188' })).toMatchObject({ baseUrl: 'http://127.0.0.1:8188' });
    expect(((await call('threed.models')) as unknown[]).length).toBe(3);
    const job = (await call('threed.generate', { mode: 'image', imageBase64: tinyPng().toString('base64'), name: 'Würfel' })) as { id: string; name: string; taskId: string | null };
    expect(job).toMatchObject({ name: 'Wuerfel', taskId: null });
    await h.svc.wait(job.id);
    expect(await call('threed.job', { id: job.id })).toMatchObject({ status: 'done' });
    await expect(call('threed.job', { id: 'tdj_fehlt' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(((await call('threed.jobs')) as unknown[]).length).toBe(1);
    expect(await call('threed.readFile', { id: job.id, kind: 'model' })).toMatchObject({ mimeType: 'model/gltf-binary' });
    expect(await call('threed.cancel', { id: job.id })).toMatchObject({ status: 'done' });
    expect(await call('threed.deleteJob', { id: job.id, deleteFiles: true })).toEqual({ ok: true });
    expect(await call('threed.deleteModel', { id: 'pixal3d' })).toEqual({ ok: true });
    await expect(call('threed.downloadModel', { id: 'trellis2' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
