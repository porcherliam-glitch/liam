// Test support for the tools-files and changes tests (not imported by production code, never bundled).
// Builds a real CoreContext + real PathGuard/ChangeJournal/FileLockService/FileService on temp directories and small
// hand-written fakes for the services owned by other modules (projects, tasks, governor, git, approvals).
import { realpathSync } from 'node:fs';
import type { Approval, ApprovalKind, GitStatus, Project, Task } from '@shared/schemas';
import type { ApprovalCheck, ApprovalRequest, Services, ToolContext } from '../../contracts';
import { createTestCore, tempDir, type TestCore } from '../../../../tests/helpers/core';
import { makeServices } from '../../../../tests/helpers/services';
import { nullLogger } from '../../core/logger';
import { createChangeJournal, type ChangeJournalOptions } from '../../changes/journal';
import { createPathGuard } from './path-guard';
import { createFileLockService } from './locks';
import { createFileService } from './file-service';

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

export interface FakeApprovals {
  /** Decision returned by check() per kind: pending (default), approved, denied. */
  decision: Partial<Record<ApprovalKind, 'pending' | 'approved' | 'denied'>>;
  requests: ApprovalRequest[];
  consumed: string[];
  acknowledged: string[];
}

export interface FakeGit {
  repo: boolean;
  clean: Set<string>;
  head: Map<string, Buffer>;
  status: GitStatus['files'];
  isCleanCalls: string[][];
}

export interface Harness {
  t: TestCore;
  root: string;
  s: Services;
  project: Project;
  tasks: Map<string, Task>;
  addedFiles: Map<string, string[]>;
  governor: { ok: boolean; reason: string | null; calls: string[] };
  approvals: FakeApprovals;
  git: FakeGit;
  ctx(taskId?: string, signal?: AbortSignal): ToolContext & { steps: { kind: string; summary: string }[] };
  cleanup(): void;
}

export function createHarness(opts: { journal?: ChangeJournalOptions; projectPatch?: Partial<Project> } = {}): Harness {
  const t = createTestCore();
  const proj = tempDir();
  const root = realpathSync.native(proj.dir);
  const project = makeProject('prj_test', root, opts.projectPatch);
  const tasks = new Map<string, Task>([['task_a', makeTask('task_a', project.id, { title: 'Login bauen' })]]);
  const addedFiles = new Map<string, string[]>();
  const governor = { ok: true, reason: null as string | null, calls: [] as string[] };
  const approvals: FakeApprovals = { decision: {}, requests: [], consumed: [], acknowledged: [] };
  const git: FakeGit = { repo: false, clean: new Set(), head: new Map(), status: [], isCleanCalls: [] };
  let approvalSeq = 0;

  const approvalOf = (req: ApprovalRequest, status: Approval['status']): Approval => ({
    id: `apr_${++approvalSeq}`,
    projectId: req.projectId,
    taskId: req.taskId ?? null,
    runId: req.runId ?? null,
    kind: req.kind,
    fingerprint: `${req.kind}|${req.subject}`,
    title: req.title,
    action: req.action,
    consequences: req.consequences,
    details: req.details ?? {},
    status,
    scope: status === 'pending' ? null : 'once',
    createdAt: 0,
    decidedAt: null,
  });

  const s = makeServices(t.core, {
    projects: {
      get: (id: string) => (id === project.id ? project : null),
      require: (id: string) => {
        if (id !== project.id) throw new Error(`Projekt ${id} unbekannt`);
        return project;
      },
      refreshGit: async () => project,
    } as unknown as Services['projects'],
    tasks: {
      get: (id: string) => tasks.get(id) ?? null,
      addFiles: (id: string, files: string[]) => {
        addedFiles.set(id, [...(addedFiles.get(id) ?? []), ...files]);
        return tasks.get(id)!;
      },
    } as unknown as Services['tasks'],
    governor: {
      canWrite: (p: string) => {
        governor.calls.push(p);
        return { ok: governor.ok, reason: governor.reason };
      },
    } as unknown as Services['governor'],
    git: {
      isRepo: async () => git.repo,
      isClean: async (_root: string, paths: string[]) => {
        git.isCleanCalls.push(paths);
        return new Set(paths.filter((p) => git.clean.has(p)));
      },
      showFile: async (_root: string, _ref: string, path: string) => git.head.get(path) ?? null,
      status: async () => ({ isRepo: git.repo, branch: 'main', head: 'abc', ahead: 0, behind: 0, files: git.status, clean: git.status.length === 0 }),
    } as unknown as Services['git'],
    approvals: {
      check: (req: ApprovalRequest): ApprovalCheck => {
        approvals.requests.push(req);
        const d = approvals.decision[req.kind] ?? 'pending';
        if (d === 'approved') return { state: 'approved', approval: approvalOf(req, 'approved'), viaRule: false };
        if (d === 'denied') return { state: 'denied', approval: approvalOf(req, 'denied') };
        return { state: 'pending', approval: approvalOf(req, 'pending') };
      },
      consume: (id: string) => void approvals.consumed.push(id),
      acknowledgeDenial: (id: string) => void approvals.acknowledged.push(id),
    } as unknown as Services['approvals'],
  });
  s.pathGuard = createPathGuard(s);
  s.journal = createChangeJournal(s, opts.journal);
  s.locks = createFileLockService(s);
  s.files = createFileService(s, { searchTimeoutMs: 10_000 });

  return {
    t,
    root,
    s,
    project,
    tasks,
    addedFiles,
    governor,
    approvals,
    git,
    ctx(taskId = 'task_a', signal = new AbortController().signal) {
      const steps: { kind: string; summary: string }[] = [];
      return {
        project,
        task: tasks.get(taskId) ?? makeTask(taskId, project.id),
        runId: 'run_1',
        role: 'coder',
        signal,
        log: nullLogger,
        step: (kind, summary) => void steps.push({ kind, summary }),
        steps,
      };
    },
    cleanup() {
      proj.cleanup();
      t.cleanup();
    },
  };
}
