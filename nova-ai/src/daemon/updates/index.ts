// Updates sub-module of env: UpdateService (never downloads or installs) and its RPC method updates.check.
export { createUpdateService, META_LAST_CHECK, META_NOTIFIED_VERSION, NO_FEED_MESSAGE } from './update-service';
export type { UpdateServiceImpl, UpdateServiceOptions } from './update-service';
export { compareSemver, parseSemver } from './semver';
export type { SemVer } from './semver';
export { registerUpdatesRpc } from './rpc';
