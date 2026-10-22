// Barrel of the daemon client (module: server). Pure Node – safe to import from Electron main, scripts and tests.
export {
  DaemonClient,
  DEFAULT_RPC_TIMEOUT_MS,
  LONG_RPC_TIMEOUT_MS,
  MAX_RPC_REQUEST_BYTES,
  isLongRpcMethod,
  rpcTimeoutFor,
  type DaemonClientOptions,
  type DaemonHealth,
  type RpcCallOptions,
  type SubscribeOptions,
  type SubscriptionState,
} from './daemon-client';
export { DaemonRpcError, CLIENT_MESSAGES, isDaemonRpcError, type DaemonErrorReason, type DaemonRpcErrorOptions } from './errors';
