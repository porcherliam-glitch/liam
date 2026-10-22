// Resources sub-module of env: ResourceMonitor (CPU, RAM, disks, GPU/VRAM, Ollama, daemon), ConcurrencyGovernor and
// the RPC methods resources.snapshot / resources.history.
export { createResourceMonitor, HISTORY_MS } from './resource-monitor';
export type { ResourceMonitorImpl, ResourceMonitorOptions } from './resource-monitor';
export { createConcurrencyGovernor, normalizeOllamaName } from './governor';
export type { ConcurrencyGovernorOptions } from './governor';
export { parseNvidiaSmiCsv, parseWindowsGpuJson, parseMeminfoAvailable, WINDOWS_GPU_SCRIPT } from './parsers';
export { registerResourcesRpc } from './rpc';
