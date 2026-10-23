// Test helpers for the backup module (imported by *.test.ts only): a real core on a temp data dir plus small fakes
// for the services BackupService uses. The project/task/provider fakes read the real tables, so data inserted by an
// import is visible through them exactly like through the real services.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Project, ProviderConfig, Task } from '@shared/schemas';
import type { Services } from '../contracts';
import { notFound } from '../core/errors';
import { bool, fromJson, toJson } from '../db/database';
import { createTestCore, tempDir, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import { canonicalize, pathKey } from '../projects/root-safety';
import { createBackupService, type BackupServiceOptions } from './backup-service';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  path: string;
  kind: string;
  technologies: string;
  status: string;
  template_id: string | null;
  origin: string;
  config: string;
  work_state: string;
  git_available: number;
  created_at: number;
  updated_at: number;
}

export function defaultConfig(): Project['config'] {
  return {
    commands: { install: null, dev: null, build: null, test: 'npm test', lint: null, typecheck: null, e2e: null, security: null, package: null, run: null },
    preview: { kind: 'none', entry: null, url: null },
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: false,
    autoCommit: true,
    monthlyBudgetUsd: null,
    conventions: '',
    artifactGlobs: [],
    engineVersion: null,
  };
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    path: r.path,
    kind: r.kind as Project['kind'],
    technologies: fromJson<string[]>(r.technologies, []),
    status: r.status as Project['status'],
    templateId: r.template_id,
    origin: r.origin as Project['origin'],
    config: fromJson<Project['config']>(r.config, defaultConfig()),
    workState: r.work_state as Project['workState'],
    gitAvailable: bool(r.git_available),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export interface BackupHarness {
  t: TestCore;
  s: Services;
  backups: ReturnType<typeof createBackupService>;
  /** Scratch dir for project folders / export targets (cleaned up). */
  scratch: string;
  activeRuns: { n: number };
  pruned: number[];
  watched: string[];
  refreshed: string[];
  addProject(p: Partial<Project> & { id: string; path: string }): Project;
  addTask(t: Partial<Task> & { id: string; projectId: string }): Task;
  addProvider(p: Partial<ProviderConfig> & { id: string }): void;
  addMemory(m: { id: string; projectId: string | null; title?: string; content?: string }): void;
  write(root: string, rel: string, content: string): void;
  cleanup(): void;
}

export function backupHarness(opts: BackupServiceOptions & { extra?: Partial<Omit<Services, 'core'>> } = {}): BackupHarness {
  const t = createTestCore();
  const scratchDir = tempDir('nova-bak-');
  const db = t.core.db;
  const activeRuns = { n: 0 };
  const pruned: number[] = [];
  const watched: string[] = [];
  const refreshed: string[] = [];
  const getProject = (id: string): Project | null => {
    const r = db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
    return r ? rowToProject(r) : null;
  };
  const projects = {
    get: getProject,
    require: (id: string) => {
      const p = getProject(id);
      if (!p) throw notFound('Projekt', id);
      return p;
    },
    list: () => db.all<ProjectRow>('SELECT * FROM projects ORDER BY created_at').map((r) => ({ ...rowToProject(r), progress: 0, openTasks: 0, pathMissing: false })),
    refreshGit: async (id: string) => {
      refreshed.push(id);
      return getProject(id)!;
    },
  } as unknown as Services['projects'];
  const rowToTaskLite = (r: Record<string, unknown>): Task => ({
    id: String(r.id),
    projectId: String(r.project_id),
    parentId: (r.parent_id as string | null) ?? null,
    title: String(r.title),
    description: String(r.description),
    kind: r.kind as Task['kind'],
    role: r.role as Task['role'],
    status: r.status as Task['status'],
    priority: Number(r.priority),
    dependsOn: fromJson<string[]>(r.depends_on, []),
    attempts: Number(r.attempts),
    maxAttempts: Number(r.max_attempts),
    blocker: (r.blocker as string | null) ?? null,
    blockerCode: (r.blocker_code as string | null) ?? null,
    result: (r.result as string | null) ?? null,
    acceptance: (r.acceptance as string | null) ?? null,
    verification: fromJson<Task['verification']>(r.verification, { status: 'not_run', checks: [] }),
    files: fromJson<string[]>(r.files, []),
    plannedFiles: fromJson<string[]>(r.planned_files, []),
    startRequested: bool(r.start_requested),
    model: (r.model as string | null) ?? null,
    source: r.source as Task['source'],
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    startedAt: r.started_at === null ? null : Number(r.started_at),
    finishedAt: r.finished_at === null ? null : Number(r.finished_at),
  });
  const tasks = {
    list: (f: { projectId?: string } = {}) =>
      (f.projectId ? db.all('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at', [f.projectId]) : db.all('SELECT * FROM tasks ORDER BY created_at')).map(rowToTaskLite),
    get: (id: string) => {
      const r = db.get('SELECT * FROM tasks WHERE id = ?', [id]);
      return r ? rowToTaskLite(r) : null;
    },
  } as unknown as Services['tasks'];
  const providerFromRow = (r: Record<string, unknown>): ProviderConfig => ({
    id: String(r.id),
    type: r.type as ProviderConfig['type'],
    name: String(r.name),
    baseUrl: String(r.base_url),
    enabled: bool(r.enabled),
    paid: bool(r.paid),
    approved: bool(r.approved),
    hasApiKey: true, // pretend a key is stored: it must never show up in an export
    options: fromJson<Record<string, string>>(r.options, {}),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  });
  const providers = {
    list: () => db.all('SELECT * FROM providers ORDER BY id').map(providerFromRow),
    getConfig: (id: string) => {
      const r = db.get('SELECT * FROM providers WHERE id = ?', [id]);
      return r ? providerFromRow(r) : null;
    },
  } as unknown as Services['providers'];
  const journal = {
    pruneSnapshots: (cutoff: number) => {
      pruned.push(cutoff);
      return 2;
    },
  } as unknown as Services['journal'];
  const work = { activeRunCount: () => activeRuns.n } as unknown as Services['work'];
  const governor = { canWrite: () => ({ ok: true, reason: null }) } as unknown as Services['governor'];
  const notifications = { notify: () => null } as unknown as Services['notifications'];
  const watcher = { watch: (id: string) => void watched.push(id) } as unknown as Services['watcher'];
  const resources = { trackPath: () => undefined } as unknown as Services['resources'];
  const s = makeServices(t.core, { projects, tasks, providers, journal, work, governor, notifications, watcher, resources, ...(opts.extra ?? {}) });
  const backups = createBackupService(s, { homeDir: scratchDir.dir, ...opts });
  const now = Date.now();
  // path_key exactly like ProjectService: canonical path (realpath), lower-case on Windows.
  const realpath = (p: string): string | null => {
    try {
      return realpathSync.native(p);
    } catch {
      return null;
    }
  };
  const pathKeyOf = (p: string) => pathKey(canonicalize(p, t.core.platform, realpath), t.core.platform);
  return {
    t,
    s,
    backups,
    scratch: scratchDir.dir,
    activeRuns,
    pruned,
    watched,
    refreshed,
    addProject(p) {
      const project: Project = {
        name: 'Projekt',
        description: '',
        kind: 'web',
        technologies: [],
        status: 'active',
        templateId: null,
        origin: 'new',
        config: defaultConfig(),
        workState: 'running',
        gitAvailable: false,
        createdAt: now,
        updatedAt: now,
        ...p,
      };
      db.run(
        `INSERT INTO projects(id, name, description, path, path_key, kind, technologies, status, template_id, origin, config, work_state, git_available, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [project.id, project.name, project.description, project.path, pathKeyOf(project.path), project.kind, toJson(project.technologies), project.status, project.templateId, project.origin, toJson(project.config), project.workState, project.createdAt, project.updatedAt],
      );
      return project;
    },
    addTask(task) {
      const full: Task = {
        parentId: null,
        title: 'Aufgabe',
        description: '',
        kind: 'code',
        role: 'coder',
        status: 'queued',
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
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
        ...task,
      };
      db.run(
        `INSERT INTO tasks(id, project_id, parent_id, title, description, kind, role, status, priority, depends_on, attempts, max_attempts, blocker, blocker_code, result, acceptance, verification, files, planned_files, start_requested, model, source, created_at, updated_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [full.id, full.projectId, full.parentId, full.title, full.description, full.kind, full.role, full.status, full.priority, toJson(full.dependsOn), full.attempts, full.maxAttempts, full.blocker, full.blockerCode, full.result, full.acceptance, toJson(full.verification), toJson(full.files), toJson(full.plannedFiles), full.startRequested ? 1 : 0, full.model, full.source, full.createdAt, full.updatedAt, full.startedAt, full.finishedAt],
      );
      return full;
    },
    addProvider(p) {
      db.run('INSERT INTO providers(id, type, name, base_url, enabled, paid, approved, options, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        p.id,
        p.type ?? 'openai_compatible',
        p.name ?? p.id,
        p.baseUrl ?? 'https://api.example.com/v1',
        p.enabled === false ? 0 : 1,
        p.paid === false ? 0 : 1,
        p.approved === false ? 0 : 1,
        toJson(p.options ?? {}),
        now,
        now,
      ]);
    },
    addMemory(m) {
      db.run('INSERT INTO memory_entries(id, project_id, kind, title, content, tags, source, shareable, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        m.id,
        m.projectId,
        'note',
        m.title ?? 'Notiz',
        m.content ?? 'Inhalt',
        '[]',
        'user',
        0,
        null,
        now,
        now,
      ]);
    },
    write(root, rel, content) {
      const abs = join(root, ...rel.split('/'));
      mkdirSync(join(abs, '..'), { recursive: true });
      writeFileSync(abs, content);
    },
    cleanup() {
      t.cleanup();
      scratchDir.cleanup();
    },
  };
}
