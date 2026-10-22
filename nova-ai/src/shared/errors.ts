// User-facing error model shared by daemon, main process and renderer.
// Every important error answers: what happened, which task is affected, what was tried,
// is the project still safe, what NOVA can fix itself, and what the user must do.
import { z } from 'zod';

export const ErrorSeverity = z.enum([
  'warning', // something is off but work continues
  'retryable', // failed, NOVA will retry automatically (bounded)
  'blocker', // work on the affected task stops until something changes
  'critical', // data or safety at risk, work stops
]);
export type ErrorSeverity = z.infer<typeof ErrorSeverity>;

export const NovaErrorInfoSchema = z.object({
  id: z.string(),
  code: z.string(), // stable machine code, e.g. MODEL_UNAVAILABLE, BUDGET_EXCEEDED
  severity: ErrorSeverity,
  title: z.string(), // short German headline
  whatHappened: z.string(), // German, plain language
  projectId: z.string().nullable(),
  taskId: z.string().nullable(),
  attempted: z.array(z.string()), // what NOVA already tried
  projectSafe: z.boolean(), // true = project files are in a consistent state
  autoFixable: z.boolean(), // NOVA can repair/retry on its own
  userAction: z.string().nullable(), // what the user needs to do, null if nothing
  details: z.string().nullable(), // technical details (already redacted)
  /** Links for "jump to" actions in the UI. */
  related: z
    .object({
      checkRunId: z.string().nullable(),
      runId: z.string().nullable(),
      approvalId: z.string().nullable(),
      file: z.string().nullable(),
      line: z.number().int().nullable(),
    })
    .nullable(),
  createdAt: z.number(),
  resolvedAt: z.number().nullable(),
});
export type NovaErrorInfo = z.infer<typeof NovaErrorInfoSchema>;

/** Error codes used across modules. Keep in sync with the German texts in daemon/core/errors.ts. */
export const ErrorCodes = {
  INTERNAL: 'INTERNAL',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CONFLICT: 'CONFLICT',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  NO_MODEL: 'NO_MODEL',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  PROVIDER_AUTH: 'PROVIDER_AUTH',
  PROVIDER_RATE_LIMIT: 'PROVIDER_RATE_LIMIT',
  OLLAMA_UNREACHABLE: 'OLLAMA_UNREACHABLE',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  PAID_NOT_APPROVED: 'PAID_NOT_APPROVED',
  PRICE_UNKNOWN: 'PRICE_UNKNOWN',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  APPROVAL_DENIED: 'APPROVAL_DENIED',
  PATH_OUTSIDE_PROJECT: 'PATH_OUTSIDE_PROJECT',
  FILE_LOCKED: 'FILE_LOCKED',
  COMMAND_BLOCKED: 'COMMAND_BLOCKED',
  COMMAND_FAILED: 'COMMAND_FAILED',
  COMMAND_TIMEOUT: 'COMMAND_TIMEOUT',
  TESTS_FAILED: 'TESTS_FAILED',
  BUILD_FAILED: 'BUILD_FAILED',
  REPEATED_FAILURE: 'REPEATED_FAILURE',
  AGENT_STEP_LIMIT: 'AGENT_STEP_LIMIT',
  AGENT_BAD_OUTPUT: 'AGENT_BAD_OUTPUT',
  GIT_ERROR: 'GIT_ERROR',
  RESTORE_CONFLICT: 'RESTORE_CONFLICT',
  RESOURCE_LIMIT: 'RESOURCE_LIMIT',
  VRAM_INSUFFICIENT: 'VRAM_INSUFFICIENT',
  TOOL_MISSING: 'TOOL_MISSING',
  SECRET_STORE: 'SECRET_STORE',
  DAEMON_UNAVAILABLE: 'DAEMON_UNAVAILABLE',
  INTERRUPTED: 'INTERRUPTED',
  CANCELLED: 'CANCELLED',
  NEEDS_INPUT: 'NEEDS_INPUT',
  NETWORK_BLOCKED: 'NETWORK_BLOCKED',
  SECRET_IN_CODE: 'SECRET_IN_CODE',
  FILE_IN_USE: 'FILE_IN_USE',
  DEPENDENCY_FAILED: 'DEPENDENCY_FAILED',
  AGENT_BLOCKED: 'AGENT_BLOCKED',
  DISK_FULL: 'DISK_FULL',
} as const;

/** Blocker codes the work cycle re-checks and resumes automatically when the condition is gone. */
export const RESUMABLE_BLOCKER_CODES: string[] = [
  'NO_MODEL',
  'MODEL_UNAVAILABLE',
  'OLLAMA_UNREACHABLE',
  'VRAM_INSUFFICIENT',
  'BUDGET_EXCEEDED',
  'PAID_NOT_APPROVED',
  'PRICE_UNKNOWN',
  'RESOURCE_LIMIT',
  'DISK_FULL',
  'TOOL_MISSING',
  'NEEDS_INPUT',
  'DEPENDENCY_FAILED',
  'APPROVAL_REQUIRED',
];
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

/** Wire format of a failed RPC call. */
export const RpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(), // German, user-presentable
  details: z.unknown().optional(),
  error: NovaErrorInfoSchema.optional(),
});
export type RpcError = z.infer<typeof RpcErrorSchema>;
