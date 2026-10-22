// Integrations sub-module of env: IntegrationService with the built-in IntegrationModules (git, node, npm, python,
// dotnet, powershell, windows_terminal, ollama, comfyui, unity, unreal, godot, vscode, playwright, winget) and its RPC methods.
export { createIntegrationService, INTEGRATION_CACHE_MS, userProgramEnv } from './integration-service';
export type { IntegrationServiceImpl, IntegrationServiceOptions, SpawnDetached } from './integration-service';
export { createBuiltinModules } from './builtins';
export { nodeFs, compareVersions, compareUnityVersions } from './helpers';
export type { FsLike, ModuleDeps } from './helpers';
export { WINGET_PACKAGES, wingetCommand, wingetCommandFor, interpretWingetExit } from './winget';
export type { WingetPackage, WingetOutcome } from './winget';
export { registerIntegrationsRpc } from './rpc';
