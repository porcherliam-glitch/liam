// Approvals sub-module of env: ApprovalService (tables approvals, approval_rules) and its RPC methods.
export { createApprovalService, APPROVAL_KIND_LABELS } from './approval-service';
export type { ApprovalServiceImpl, ApprovalServiceOptions } from './approval-service';
export { registerApprovalsRpc } from './rpc';
