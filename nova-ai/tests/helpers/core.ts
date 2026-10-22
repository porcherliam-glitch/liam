// Test helper: a real CoreContext on a temporary data directory (file-backed SQLite with migrations).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore } from '../../src/daemon/core/context';
import type { CoreContext } from '../../src/daemon/contracts';

export interface TestCore {
  core: CoreContext;
  dir: string;
  cleanup(): void;
}

export function createTestCore(): TestCore {
  const dir = mkdtempSync(join(tmpdir(), 'nova-test-'));
  const { core } = createCore({ dataDir: dir, logToFiles: false });
  return {
    core,
    dir,
    cleanup() {
      try {
        core.db.close();
      } catch {
        /* already closed */
      }
      // Windows: a just-exited child process (or the virus scanner) can hold the folder for a moment → EBUSY/EPERM
      rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    },
  };
}

/** Creates an empty temporary directory (e.g. a project root). */
export function tempDir(prefix = 'nova-proj-'): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
