// Barrel of the tools module (SPEC §2): exactly the factories app.ts wires plus registerToolsRpc.
// - files part (tools/files, changes): PathGuard, ChangeJournal, FileLockService, FileWatcher, FileService
// - commands part: CommandPolicy (tools/commands/policy.ts, integrator), ProcessManager, TerminalService, ToolRegistry
// - registerToolsRpc registers files.* (registerFilesRpc), processes.* and terminal.*
export { createPathGuard, createFileLockService, createFileWatcher, createFileService } from './files';
export { createChangeJournal } from '../changes';
export { createCommandPolicy } from './commands/policy';
export { createProcessManager } from '../processes/process-manager';
export { createTerminalService } from '../processes/terminal-service';
export { createToolRegistry } from './registry';
export { registerToolsRpc } from '../processes/rpc';
