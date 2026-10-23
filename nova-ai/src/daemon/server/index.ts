// Barrel of the server module (RPC router, RPC/SSE server, token, lock file, daemon probe).
// Wiring (SPEC §6.1, app.ts): acquireInstanceLock → … → const token = generateToken() → startRpcServer({ …, token,
// tokenPath: paths.token }) → writeToken(paths, token) → writeLock(paths, info). Shutdown: server.close() →
// removeLock(paths, instanceId).
export { createRpcRouter, ROUTER_MESSAGES, type RpcRouterOptions } from './router';
export {
  startRpcServer,
  DEFAULT_SERVER_LIMITS,
  SERVER_MESSAGES,
  type RpcServerHandle,
  type RpcServerLimits,
  type RpcServerStats,
  type StartRpcServerOptions,
} from './http-server';
export { generateToken, writeToken, readToken, ensureToken } from './token';
export { writeLock, readLock, removeLock, LockInfoSchema, type LockInfo } from './lock';
export { probeDaemon, type ProbeResult, type ProbeStatus } from './probe';
export { germanErrorMap, germanIssueMessage, toGermanIssues, summarizeIssues, type GermanIssue } from './validation-de';
