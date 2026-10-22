// Barrel of the env module (secrets, approvals, resources, integrations, updates). Used by src/daemon/app.ts.
// Wiring (SPEC §2, §5): every factory takes (s: Services[, testOptions]) and calls no other service while constructing.
//   s.secrets      = createSecretStore(s, { scheme? })  → await s.secrets.loadAll() at startup (one DPAPI batch)
//   s.approvals    = createApprovalService(s)
//   s.resources    = createResourceMonitor(s)          → start() after the container is filled, stop() on shutdown
//   s.governor     = createConcurrencyGovernor(s)
//   s.integrations = createIntegrationService(s)       (registers the built-in IntegrationModules)
//   s.updates      = createUpdateService(s)            → start() / stop() (daily check only when enabled)
// registerEnvRpc registers approvals.*, resources.*, integrations.* (incl. integrations.open) and updates.check.
import type { RpcRegistrar } from '../contracts';
import { registerApprovalsRpc } from '../approvals';
import { registerResourcesRpc } from '../resources';
import { registerIntegrationsRpc } from '../integrations';
import { registerUpdatesRpc } from '../updates';

export { createSecretStore } from '../secrets';
export type { SecretStoreImpl, SecretStoreOptions, SecretScheme } from '../secrets';
export { createApprovalService, APPROVAL_KIND_LABELS, registerApprovalsRpc } from '../approvals';
export type { ApprovalServiceImpl, ApprovalServiceOptions } from '../approvals';
export { createResourceMonitor, createConcurrencyGovernor, registerResourcesRpc } from '../resources';
export type { ResourceMonitorImpl, ResourceMonitorOptions, ConcurrencyGovernorOptions } from '../resources';
export { createIntegrationService, createBuiltinModules, WINGET_PACKAGES, wingetCommandFor, registerIntegrationsRpc } from '../integrations';
export type { IntegrationServiceImpl, IntegrationServiceOptions, SpawnDetached } from '../integrations';
export { createUpdateService, compareSemver, parseSemver, registerUpdatesRpc } from '../updates';
export type { UpdateServiceImpl, UpdateServiceOptions } from '../updates';

/** All RPC methods of the env module (SPEC §2: approvals.*, resources.*, integrations.*, updates.check). */
export const registerEnvRpc: RpcRegistrar = (router, s) => {
  registerApprovalsRpc(router, s);
  registerResourcesRpc(router, s);
  registerIntegrationsRpc(router, s);
  registerUpdatesRpc(router, s);
};
