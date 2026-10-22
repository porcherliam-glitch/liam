// Barrel of the file part of the tools module (re-exported by src/daemon/tools/index.ts).
// Exports: PathGuard, FileLockService, FileService, FileWatcher factories, the file agent tools and files.* RPC.
import type { AgentTool, Services } from '../../contracts';
import { createListFilesTool, createReadFileTool, createSearchFilesTool } from './agent-tools-read';
import { createDeleteFileTool, createEditFileTool, createWriteFileTool } from './agent-tools-write';

export { createPathGuard, validatePathInput, type PathGuardOptions, type PathGuardFs } from './path-guard';
export { createFileLockService } from './locks';
export { createFileService, type FileServiceOptions } from './file-service';
export { createFileWatcher, type FileWatcherOptions, type WatchFn, type WatchHandle } from './watcher';
export { registerFilesRpc } from './rpc';
export { languageForPath } from './language';
export { createListFilesTool, createReadFileTool, createSearchFilesTool } from './agent-tools-read';
export { createWriteFileTool, createEditFileTool, createDeleteFileTool } from './agent-tools-write';

/** The six file agent tools: list_files, read_file, search_files, write_file, edit_file, delete_file. */
export function createFileTools(s: Services): AgentTool[] {
  return [createListFilesTool(s), createReadFileTool(s), createSearchFilesTool(s), createWriteFileTool(s), createEditFileTool(s), createDeleteFileTool(s)];
}
