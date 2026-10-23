// Barrel of the process part of the tools module (re-exported by src/daemon/tools/index.ts):
// ProcessManager, TerminalService, process-tree helpers and the processes.*/terminal.* RPC registrars.
export { createProcessManager, COUNTED_PROCESS_KINDS, DEFAULT_URL_PATTERN, OUTPUT_UNAVAILABLE, type ProcessManagerOptions, type SpawnFn } from './process-manager';
export { createTerminalService, type TerminalServiceOptions } from './terminal-service';
export { createProcessTree, defaultTreeRunner, type ProcessTree, type ProcessTreeRunner, type ProcessTreeOptions } from './process-tree';
export { registerProcessesRpc, registerToolsRpc } from './rpc';
export { stripAnsi } from './output-tail';
