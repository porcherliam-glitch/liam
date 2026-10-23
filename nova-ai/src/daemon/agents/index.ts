// Barrel of the agents module (SPEC §2): RunStore, AgentRunner with the 4 built-in role modules, RPC registrar.
// Wiring (app.ts): s.runs = createRunStore(s); s.agents = createAgentRunner(s); registerAgentsRpc(router, s).
// Neither factory calls other services during construction; neither has timers (no start/stop needed).
export { createRunStore, boundStepData, STEP_DATA_MAX_BYTES, STATE_INLINE_MAX_BYTES, MAX_STEPS_PER_RUN, type RunStoreOptions } from './run-store';
export { createAgentRunner, isInterruptReason, INTERRUPTED_TOOL_TEXT, DEFAULT_RETRY_DELAYS_MS, type AgentRunnerOptions } from './runner';
export { registerAgentsRpc } from './rpc';
export {
  builtinRoles,
  createPlannerRole,
  createCoderRole,
  createTesterRole,
  createReviewerRole,
  PLANNER_TOOLS,
  CODER_TOOLS,
  TESTER_TOOLS,
  REVIEWER_TOOLS,
  type NovaRoleModule,
} from './roles';
export { finishToolSpec, jsonSchemaOf } from './roles/common';
export { parseJsonToolCall, findFirstJsonObject } from './json-protocol';
export { estimateTokens, compactMessages, contextWindow } from './context-window';
export { RunStateSchema, parseRunState, type RunState, type InFlight, type Pending, type TaskSnapshot } from './state';
