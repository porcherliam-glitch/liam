// RPC handlers of the approvals sub-module: approvals.list / decide / rules / deleteRule (src/shared/rpc.ts).
// Params arrive zod-parsed by the router (decide: scope defaults to 'once'; deny ignores the scope; 'always' is
// rejected with VALIDATION for APPROVAL_KINDS_ONCE_ONLY inside ApprovalService.decide).
import type { RpcRegistrar } from '../contracts';

export const registerApprovalsRpc: RpcRegistrar = (router, s) => {
  router.register('approvals.list', (params) => s.approvals.list({ status: params.status, projectId: params.projectId }));
  router.register('approvals.decide', ({ id, decision, scope }) => s.approvals.decide(id, decision, scope));
  router.register('approvals.rules', () => s.approvals.rules());
  router.register('approvals.deleteRule', ({ id }) => {
    s.approvals.deleteRule(id);
    return { ok: true as const };
  });
};
