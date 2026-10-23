// Tests of registerProcessesRpc / registerToolsRpc with a contract-validating router (params parsed and results checked
// with RpcContract), against the real ProcessManager and TerminalService.
import { describe, it, expect, afterEach } from 'vitest';
import { RpcContract, type RpcMethod } from '@shared/rpc';
import type { RpcHandler, RpcRouter } from '../contracts';
import { createTerminalService } from './terminal-service';
import { registerProcessesRpc, registerToolsRpc } from './rpc';
import { createProcHarness, waitFor, type ProcHarness } from './test-support';

let h: ProcHarness | null = null;
afterEach(async () => {
  try {
    h?.s.terminals.closeAll();
  } catch {
    /* no terminal service in this test */
  }
  await h?.cleanup();
  h = null;
});

function testRouter() {
  const handlers = new Map<string, RpcHandler<RpcMethod>>();
  const router: RpcRouter = {
    register(method, handler) {
      if (handlers.has(method)) throw new Error(`doppelt registriert: ${method}`);
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

const PROCESS_METHODS = ['processes.kill', 'processes.list', 'processes.output', 'terminal.close', 'terminal.create', 'terminal.interrupt', 'terminal.list', 'terminal.run'];

describe('registerToolsRpc', () => {
  it('registers files.*, processes.* and terminal.* exactly once', () => {
    h = createProcHarness();
    const { router } = testRouter();
    registerToolsRpc(router, h.s);
    const names = router.registered().sort();
    for (const m of PROCESS_METHODS) expect(names).toContain(m);
    expect(names.filter((n) => n.startsWith('files.'))).toHaveLength(11);
    expect(names).toHaveLength(19);
  });
});

describe.skipIf(process.platform === 'win32')('registerProcessesRpc', () => {
  it('returns contract-valid results for every method', async () => {
    h = createProcHarness();
    h.s.terminals = createTerminalService(h.s, { platform: 'linux', bashPath: null });
    const { router, call } = testRouter();
    registerProcessesRpc(router, h.s);
    expect(router.registered().sort()).toEqual(PROCESS_METHODS);

    const term = (await call('terminal.create', { projectId: h.project.id })) as { id: string };
    expect(await call('terminal.list', {})).toHaveLength(1);
    expect(await call('terminal.run', { sessionId: term.id, line: 'echo rpc-test' })).toEqual({ accepted: true });
    await waitFor(() => h!.eventsOf('terminal.exit').length === 1);
    const procs = (await call('processes.list', { includeExited: true })) as { id: string }[];
    expect(procs).toHaveLength(1);
    expect(await call('processes.list', {})).toEqual([]);
    expect(await call('processes.output', { id: procs[0].id })).toEqual({ output: 'rpc-test\n' });
    expect(await call('processes.kill', { id: procs[0].id })).toMatchObject({ id: procs[0].id, status: 'exited' });
    expect(await call('terminal.interrupt', { sessionId: term.id })).toEqual({ ok: true });
    expect(await call('terminal.close', { sessionId: term.id })).toEqual({ ok: true });
    expect(await call('terminal.close', { sessionId: term.id })).toEqual({ ok: true });
    expect(await call('terminal.list', { projectId: h.project.id })).toEqual([]);
  });
});
