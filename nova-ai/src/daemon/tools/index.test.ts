// The tools barrel must export exactly the factories app.ts wires (SPEC §2 barrel table).
import { describe, it, expect } from 'vitest';
import * as tools from './index';

describe('tools barrel', () => {
  it('exports exactly the ten factories/registrars of the tools module', () => {
    expect(Object.keys(tools).sort()).toEqual(
      [
        'createChangeJournal',
        'createCommandPolicy',
        'createFileLockService',
        'createFileService',
        'createFileWatcher',
        'createPathGuard',
        'createProcessManager',
        'createTerminalService',
        'createToolRegistry',
        'registerToolsRpc',
      ].sort(),
    );
    for (const value of Object.values(tools)) expect(typeof value).toBe('function');
  });
});
