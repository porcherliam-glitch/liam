// RPC handlers of the tools module for processes.* and terminal.* plus registerToolsRpc (files.* + processes.* +
// terminal.*), re-exported by the tools barrel. Params arrive zod-parsed (defaults applied) from the router; every
// handler delegates to the services of the container passed to the registrar.
import type { RpcRegistrar } from '../contracts';
import { registerFilesRpc } from '../tools/files';

export const registerProcessesRpc: RpcRegistrar = (router, services) => {
  router.register('processes.list', (p) => services.processes.list({ projectId: p.projectId, includeExited: p.includeExited }));
  router.register('processes.kill', (p) => services.processes.kill(p.id));
  router.register('processes.output', (p) => ({ output: services.processes.output(p.id, p.tailLines) }));
  router.register('terminal.create', (p) => services.terminals.create(p.projectId));
  router.register('terminal.list', (p) => services.terminals.list(p.projectId));
  router.register('terminal.run', (p) => services.terminals.run(p.sessionId, p.line));
  router.register('terminal.interrupt', (p) => {
    services.terminals.interrupt(p.sessionId);
    return { ok: true as const };
  });
  router.register('terminal.close', (p) => {
    services.terminals.close(p.sessionId);
    return { ok: true as const };
  });
};

/** All RPC methods of the tools module (SPEC §2): files.*, processes.*, terminal.*. */
export const registerToolsRpc: RpcRegistrar = (router, services) => {
  registerFilesRpc(router, services);
  registerProcessesRpc(router, services);
};
