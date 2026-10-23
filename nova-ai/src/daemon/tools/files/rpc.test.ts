// Tests of registerFilesRpc with a contract-validating router (params parsed and results checked with RpcContract).
import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import type { RpcHandler, RpcRouter } from '../../contracts';
import { createHarness, type Harness } from './test-support';
import { registerFilesRpc } from './rpc';

let h: Harness;
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

describe('registerFilesRpc', () => {
  it('registers every files.* method and returns contract-valid results', async () => {
    h = createHarness();
    const { router, call } = testRouter();
    registerFilesRpc(router, h.s);
    expect(router.registered().sort()).toEqual(
      ['files.changed', 'files.delete', 'files.diff', 'files.history', 'files.mkdir', 'files.read', 'files.rename', 'files.search', 'files.snapshot', 'files.tree', 'files.write'].sort(),
    );
    const pid = h.project.id;
    writeFileSync(join(h.root, 'a.txt'), 'hello\n');
    expect(await call('files.tree', { projectId: pid })).toMatchObject({ path: '', type: 'dir' });
    const read = (await call('files.read', { projectId: pid, path: 'a.txt' })) as { hash: string };
    await call('files.write', { projectId: pid, path: 'a.txt', content: 'hallo\n', expectedHash: read.hash });
    expect(await call('files.search', { projectId: pid, query: 'hallo' })).toEqual([{ path: 'a.txt', line: 1, column: 1, preview: 'hallo' }]);
    expect(await call('files.changed', { projectId: pid })).toEqual([]);
    const history = (await call('files.history', { projectId: pid })) as { beforeHash: string }[];
    expect(history).toHaveLength(1);
    expect(await call('files.snapshot', { projectId: pid, hash: history[0].beforeHash })).toEqual({ content: 'hello\n', binary: false });
    expect(await call('files.diff', { projectId: pid, path: 'a.txt' })).toMatchObject({ path: 'a.txt', binary: false });
    expect(await call('files.mkdir', { projectId: pid, path: 'dir' })).toEqual({ ok: true });
    expect(await call('files.rename', { projectId: pid, from: 'a.txt', to: 'dir/b.txt' })).toEqual({ ok: true });
    expect(await call('files.delete', { projectId: pid, path: 'dir/b.txt' })).toEqual({ ok: true });
  });
});
