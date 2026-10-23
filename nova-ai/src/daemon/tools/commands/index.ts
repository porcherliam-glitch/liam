// Barrel of the command agent tools (part of the tools module): run_command, run_checks, git_diff, memory_search,
// memory_note, ask_user. createToolRegistry registers createCommandTools(s) next to the file tools.
// CommandPolicy itself lives in ./policy.ts (written by the integrator) and is re-exported by src/daemon/tools/index.ts.
import type { AgentTool, Services } from '../../contracts';
import { createRunCommandTool } from './run-command';
import { createRunChecksTool } from './run-checks';
import { createGitDiffTool } from './git-diff';
import { createMemoryNoteTool, createMemorySearchTool } from './memory-tools';
import { createAskUserTool } from './ask-user';

export { createRunCommandTool, APPROVAL_TITLES, MAX_COMMAND_OUTPUT_CHARS } from './run-command';
export { createRunChecksTool, formatCheckRun, CHECK_LABELS, CHECK_STATUS_LABELS } from './run-checks';
export { createGitDiffTool } from './git-diff';
export { createMemorySearchTool, createMemoryNoteTool, AGENT_MEMORY_KINDS } from './memory-tools';
export { createAskUserTool } from './ask-user';

/** The six command/knowledge tools: run_command, run_checks, git_diff, memory_search, memory_note, ask_user. */
export function createCommandTools(s: Services): AgentTool[] {
  return [createRunCommandTool(s), createRunChecksTool(s), createGitDiffTool(s), createMemorySearchTool(s), createMemoryNoteTool(s), createAskUserTool(s)];
}
