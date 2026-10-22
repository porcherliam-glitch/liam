// Test support for the processes/terminal/command-tool tests (not imported by production code, never bundled).
// Builds a real CoreContext on a temp data dir, a temp project folder and small hand-written fakes for the services
// of other modules (governor, projects, tasks, approvals, policy, journal, checks, memory, notifications, files, git).
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AnyNovaEvent } from '@shared/events';
import type { Project, Task } from '@shared/schemas';
import type { Services, ToolContext } from '../contracts';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { nullLogger } from '../core/logger';
import { createProcessManager, type ProcessManagerOptions } from './process-manager';

/** Absolute node binary, quoted for /bin/sh and cmd.exe command lines. */
export const NODE = JSON.stringify(process.execPath);

export function makeProject(id: string, path: string, patch: Partial<Project> = {}): Project {
  return {
    id,
    name: 'Testprojekt',
    description: '',
    path,
    kind: 'web',
    technologies: [],
    status: 'active',
    templateId: null,
    origin: 'new',
    config: {
      commands: { install: null, dev: null, build: null, test: null, lint: null, typecheck: null, e2e: null, security: null, package: null, run: null },
      preview: { kind: 'none', entry: null, url: null },
      allowedCommands: [],
      testAfterChange: true,
      reviewChanges: false,
      autoCommit: false,
      monthlyBudgetUsd: null,
      conventions: '',
      artifactGlobs: [],
      engineVersion: null,
    },
    workState: 'running',
    gitAvailable: false,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

export function makeTask(id: string, projectId: string, patch: Partial<Task> = {}): Task {
  return {
    id,
    projectId,
    parentId: null,
    title: `Aufgabe ${id}`,
    description: '',
    kind: 'code',
    role: 'coder',
    status: 'running',
    priority: 1,
    dependsOn: [],
    attempts: 0,
    maxAttempts: 3,
    blocker: null,
    blockerCode: null,
    result: null,
    acceptance: null,
    verification: { status: 'not_run', checks: [] },
    files: [],
    plannedFiles: [],
    startRequested: false,
    model: null,
    source: 'user',
    createdAt: 0,
    updatedAt: 0,
    startedAt: null,
    finishedAt: null,
    ...patch,
  };
}

export interface GovernorFake {
  ok: boolean;
  reason: string | null;
  calls: number;
  /** When set, called on every canStartProcess() and its result is used. */
  decide?: (call: number) => { ok: boolean; reason: string | null };
}

export interface ProcHarness {
  t: TestCore;
  root: string;
  project: Project;
  s: Services;
  events: AnyNovaEvent[];
  governor: GovernorFake;
  eventsOf<T extends AnyNovaEvent['type']>(type: T): Extract<AnyNovaEvent, { type: T }>['payload'][];
  /** Writes a file into the project folder (creating folders). Returns its absolute path. */
  write(rel: string, content: string): string;
  ctx(task?: Task, signal?: AbortSignal): ToolContext & { steps: { kind: string; summary: string }[] };
  cleanup(): Promise<void>;
}

export interface ProcHarnessOptions {
  /** Create the real ProcessManager as s.processes (default true). */
  processes?: boolean | ProcessManagerOptions;
  provided?: Partial<Omit<Services, 'core'>>;
  projectPatch?: Partial<Project>;
}

export function createProcHarness(opts: ProcHarnessOptions = {}): ProcHarness {
  const t = createTestCore();
  const proj = tempDir();
  const root = realpathSync.native(proj.dir);
  const project = makeProject('prj_test', root, opts.projectPatch);
  const events: AnyNovaEvent[] = [];
  const off = t.core.bus.onAny((e) => events.push(e));
  const governor: GovernorFake = { ok: true, reason: null, calls: 0 };
  const s = makeServices(t.core, {
    governor: {
      canStartProcess: () => {
        governor.calls++;
        if (governor.decide) return governor.decide(governor.calls);
        return { ok: governor.ok, reason: governor.reason };
      },
    } as unknown as Services['governor'],
    projects: {
      get: (id: string) => (id === project.id ? project : null),
      require: (id: string) => {
        if (id !== project.id) {
          const err = new Error(`Das Projekt wurde nicht gefunden (${id}).`) as Error & { code: string };
          err.code = 'NOT_FOUND';
          throw err;
        }
        return project;
      },
    } as unknown as Services['projects'],
    ...opts.provided,
  });
  if (opts.processes !== false) {
    const pmOpts: ProcessManagerOptions = typeof opts.processes === 'object' ? opts.processes : {};
    s.processes = createProcessManager(s, { killGraceMs: 400, governorPollMs: 20, closeGraceMs: 300, outputThrottleMs: 50, ...pmOpts });
  }
  return {
    t,
    root,
    project,
    s,
    events,
    governor,
    eventsOf(type) {
      return events.filter((e) => e.type === type).map((e) => e.payload) as never;
    },
    write(rel, content) {
      const abs = join(root, ...rel.split('/'));
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
      return abs;
    },
    ctx(task = makeTask('task_a', project.id), signal = new AbortController().signal) {
      const steps: { kind: string; summary: string }[] = [];
      return { project, task, runId: 'run_1', role: 'coder', signal, log: nullLogger, step: (kind, summary) => void steps.push({ kind, summary }), steps };
    },
    async cleanup() {
      off();
      try {
        await s.processes.shutdown();
      } catch {
        /* fake or already stopped */
      }
      proj.cleanup();
      t.cleanup();
    },
  };
}

/** True while a pid exists (and is not a zombie on Linux). */
export function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const state = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
    return state !== 'Z';
  } catch {
    return true;
  }
}

/** Polls until fn() is true or the timeout elapses. */
export async function waitFor(fn: () => boolean, timeoutMs = 5000, stepMs = 20): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return fn();
}
