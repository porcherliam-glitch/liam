// ProjectService – projects table, creation in all five modes, updates/relinking, removal and summaries.
// SPEC §4.8, §6.5 (work state per mode), §6.8 (root safety, removal order, refreshGit, pathMissing).
// Key decisions:
// - Root safety (root-safety.ts) runs for create (all modes), import and update({path}). Windows known folders come
//   from PowerShell ([Environment]::GetFolderPath) once per daemon (cached, injectable) plus env fallbacks.
// - New template/description/wizard projects: target = input.path or <projectsDir>/<safe name> (unique suffix
//   " (2)" … only for the derived default; an explicit path must not exist or be empty). Files are written by the
//   template (never overwriting); a failed scaffold leaves the folder as it was.
// - Git: `git init` only when the folder has no own .git (never commit into a parent repository), then an initial
//   commit of exactly the scaffolded files. 'open'/'import' never modify files (import only clones).
// - Memory entries (source 'system'): goal (description), requirements (wizard answers), decision (auto-chosen
//   template, tag 'annahme'). Work state: description/wizard/template → running, open/import → stopped.
// - Side effects on other services (git, memory, watcher, resources, planning) are best effort: failures become
//   German warnings in the result, never a half-created project without a row.
// - path_key = canonical path, lower-cased on Windows (UNIQUE in the DB).
import { existsSync, mkdirSync, readdirSync, realpathSync, rmdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { ProjectConfigSchema, WorkCycleState, type CreateProjectParams, type Project, type ProjectConfig, type ProjectKind, type ProjectSummary, type TaskStatus } from '@shared/schemas';
import type { ProjectService, Services } from '../contracts';
import { NovaError, conflict, errorMessage, notFound, validation } from '../core/errors';
import { newId } from '../core/ids';
import { bool, fromJson, int, toJson } from '../db/database';
import { latestCheck, latestCheckActivity } from '../checks/check-store';
import { defaultConfig, mergeConfig, parseStoredConfig } from './config';
import { checkProjectRoot, createKnownFolderProvider, fallbackKnownFolders, pathKey, type KnownFolderProvider, type RootCheckResult } from './root-safety';
import { chooseTemplate, templateDisplayName, type BuiltinTemplateId } from './template-choice';

export interface ProjectServiceOptions {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  homeDir?: string;
  /** Windows known folders (tests inject a fake; default: PowerShell, cached). */
  knownFolders?: KnownFolderProvider;
  /** realpath for root safety (null = does not exist). */
  realpath?: (p: string) => string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  path: string;
  path_key: string;
  kind: string;
  technologies: string;
  status: string;
  template_id: string | null;
  config: string;
  work_state: string;
  git_available: number;
  created_at: number;
  updated_at: number;
}

const TASK_STATUSES: TaskStatus[] = ['queued', 'running', 'paused', 'waiting_approval', 'blocked', 'done', 'failed', 'cancelled', 'interrupted'];
const IGNORABLE_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const WORK_OFF_WARNING =
  'Die autonome Arbeit ist für dieses Projekt noch aus. NOVA fragt vor bekannten riskanten Befehlen nach. Projektcode, Tests und Build-Skripte, die ein Agent geschrieben hat, laufen jedoch mit den Rechten des Windows-Kontos und können technisch nicht eingeschränkt werden. Die Arbeit kann in der Projektübersicht eingeschaltet werden.';
const GIT_MISSING_WARNING =
  'Git wurde nicht gefunden. Ohne Git gibt es keine Versionsgeschichte; die Wiederherstellungspunkte von NOVA funktionieren trotzdem. Git kann unter „Einstellungen → Werkzeuge“ installiert werden.';

function uniq(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const x = raw.trim();
    if (!x || seen.has(x.toLowerCase())) continue;
    seen.add(x.toLowerCase());
    out.push(x);
  }
  return out;
}

function isDirectory(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isEmptyDir(p: string): boolean {
  try {
    return readdirSync(p).every((name) => IGNORABLE_FILES.has(name.toLowerCase()));
  } catch {
    return false;
  }
}

/** Folder name derived from a project name (Windows-safe). */
export function safeFolderName(name: string): string {
  let n = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  if (n.length > 60) n = n.slice(0, 60).replace(/[. ]+$/g, '');
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(n)) n = `${n} Projekt`;
  return n || 'Projekt';
}

function composeGoal(description: string, answers: Record<string, string>): string {
  const parts: string[] = [];
  if (description.trim()) parts.push(description.trim());
  const lines = Object.entries(answers)
    .filter(([, v]) => v.trim() !== '')
    .map(([k, v]) => `- ${k}: ${v.trim()}`);
  if (lines.length) parts.push(`Angaben aus dem Assistenten:\n${lines.join('\n')}`);
  return parts.join('\n\n');
}

function isUniqueViolation(e: unknown): boolean {
  return /UNIQUE constraint failed/i.test(errorMessage(e));
}

export function createProjectService(s: Services, opts: ProjectServiceOptions = {}): ProjectService {
  const log = s.core.log.child('projects');
  const db = s.core.db;
  const platform = opts.platform ?? s.core.platform;
  const env = opts.env ?? process.env;
  const homeDir = opts.homeDir ?? homedir();
  const realpath =
    opts.realpath ??
    ((p: string) => {
      try {
        return realpathSync.native(p);
      } catch {
        return null;
      }
    });
  const knownProvider = opts.knownFolders ?? createKnownFolderProvider(platform, (e) => log.warn('Windows-Benutzerordner konnten nicht ermittelt werden', { error: errorMessage(e) }));
  let lastKnown: string[] = [];

  async function knownFolders(): Promise<string[]> {
    try {
      lastKnown = await knownProvider();
    } catch (e) {
      log.warn('Benutzerordner konnten nicht ermittelt werden', { error: errorMessage(e) });
    }
    return [...lastKnown, ...fallbackKnownFolders(platform, homeDir, env)];
  }

  /** Synchronous view for update(): last PowerShell result (refreshed in the background) + env fallbacks. */
  function peekKnownFolders(): string[] {
    void knownFolders();
    return [...lastKnown, ...fallbackKnownFolders(platform, homeDir, env)];
  }

  function autoCommitDefault(): boolean {
    return s.core.settings.section('agents').autoCommit;
  }

  function toProject(r: ProjectRow): Project {
    const kind = (r.kind as ProjectKind) ?? 'generic';
    const workState = WorkCycleState.safeParse(r.work_state);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      path: r.path,
      kind,
      technologies: fromJson<string[]>(r.technologies, []),
      status: r.status === 'archived' ? 'archived' : 'active',
      templateId: r.template_id,
      config: parseStoredConfig(fromJson<unknown>(r.config, null), kind, autoCommitDefault()),
      workState: workState.success ? workState.data : 'stopped',
      gitAvailable: bool(r.git_available),
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    };
  }

  function getRow(id: string): ProjectRow | undefined {
    return db.get<ProjectRow>('SELECT * FROM projects WHERE id = ?', [id]);
  }

  function get(id: string): Project | null {
    const r = getRow(id);
    return r ? toProject(r) : null;
  }

  function requireProject(id: string): Project {
    const p = get(id);
    if (!p) throw notFound('Das Projekt', id);
    return p;
  }

  function emitUpdated(p: Project): void {
    s.core.bus.emit('project.updated', { ...p, technologies: [...p.technologies] });
  }

  function otherProjects(excludeId: string | null): { id: string; name: string; path: string }[] {
    return db
      .all<{ id: string; name: string; path: string }>('SELECT id, name, path FROM projects')
      .filter((r) => r.id !== excludeId);
  }

  function checkRoot(input: string, excludeId: string | null, known: string[]): RootCheckResult {
    return checkProjectRoot(input, {
      platform,
      realpath,
      env,
      homeDir,
      knownFolders: known,
      dataDir: s.core.paths.root,
      otherProjects: otherProjects(excludeId),
    });
  }

  function projectsDir(): string {
    const configured = s.core.settings.section('general').projectsDir.trim();
    if (configured) return configured;
    const profile = platform === 'win32' ? env.USERPROFILE ?? homeDir : homeDir;
    return join(profile, 'NOVA Projekte');
  }

  function pickDefaultTarget(name: string): string {
    const base = projectsDir();
    const folder = safeFolderName(name);
    const registered = new Set(otherProjects(null).map((p) => pathKey(p.path, platform)));
    for (let i = 1; i <= 100; i++) {
      const candidate = join(base, i === 1 ? folder : `${folder} (${i})`);
      if (registered.has(pathKey(candidate, platform))) continue;
      if (!existsSync(candidate) || (isDirectory(candidate) && isEmptyDir(candidate))) return candidate;
    }
    throw validation(`Im Projektordner „${base}“ konnte kein freier Ordnername für „${name}“ gefunden werden.`);
  }

  function insertProject(p: Project, key: string): void {
    try {
      db.run(
        `INSERT INTO projects(id, name, description, path, path_key, kind, technologies, status, template_id, config, work_state, git_available, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.name, p.description, p.path, key, p.kind, toJson(p.technologies), p.status, p.templateId, toJson(p.config), p.workState, int(p.gitAvailable), p.createdAt, p.updatedAt],
      );
    } catch (e) {
      if (isUniqueViolation(e)) throw validation('Dieser Ordner kann nicht als Projektordner verwendet werden: Er ist bereits als Projekt eingetragen.');
      throw e;
    }
  }

  function validateConfig(config: ProjectConfig): ProjectConfig {
    const parsed = ProjectConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw validation('Ungültige Projekteinstellungen: ' + parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), parsed.error.issues);
    }
    return parsed.data;
  }

  async function missingToolsWarning(requiredTools: string[]): Promise<string | null> {
    if (requiredTools.length === 0) return null;
    try {
      const statuses = await s.integrations.list(false);
      const missing = requiredTools.filter((t) => statuses.find((x) => x.id === t)?.available !== true);
      if (missing.length === 0) return null;
      const names = missing.map((id) => statuses.find((x) => x.id === id)?.name ?? id);
      return `Für diese Vorlage ${missing.length === 1 ? 'fehlt' : 'fehlen'} noch: ${names.join(', ')}. ${missing.length === 1 ? 'Es kann' : 'Sie können'} unter „Einstellungen → Werkzeuge“ installiert werden.`;
    } catch (e) {
      log.warn('Werkzeugstatus konnte nicht geprüft werden', { error: errorMessage(e) });
      return null;
    }
  }

  function addMemory(projectId: string, entries: { kind: 'goal' | 'requirement' | 'decision'; title: string; content: string; tags: string[] }[], warnings: string[]): void {
    if (entries.length === 0) return;
    if (!s.core.settings.section('memory').enabled) return;
    let failed = 0;
    for (const e of entries) {
      try {
        s.memory.add({ projectId, kind: e.kind, title: e.title.slice(0, 300), content: e.content.slice(0, 20000), tags: e.tags }, 'system');
      } catch (err) {
        failed++;
        log.warn('Projektgedächtnis: Eintrag konnte nicht gespeichert werden', { error: errorMessage(err) });
      }
    }
    if (failed > 0) warnings.push('Ein Teil der Angaben konnte nicht im Projektgedächtnis gespeichert werden.');
  }

  function memoryEntriesFor(input: CreateProjectParams): { kind: 'goal' | 'requirement'; title: string; content: string; tags: string[] }[] {
    const out: { kind: 'goal' | 'requirement'; title: string; content: string; tags: string[] }[] = [];
    if (input.description.trim()) out.push({ kind: 'goal', title: 'Projektziel', content: input.description.trim(), tags: ['projekt'] });
    for (const [k, v] of Object.entries(input.answers)) {
      if (v.trim()) out.push({ kind: 'requirement', title: k.trim() || 'Anforderung', content: v.trim(), tags: ['assistent'] });
    }
    return out;
  }

  function attach(project: Project): void {
    try {
      s.watcher.watch(project.id, project.path);
    } catch (e) {
      log.warn('Ordnerüberwachung konnte nicht gestartet werden', { projectId: project.id, error: errorMessage(e) });
    }
    try {
      s.resources.trackPath(project.path);
    } catch (e) {
      log.warn('Laufwerksanzeige konnte nicht ergänzt werden', { projectId: project.id, error: errorMessage(e) });
    }
  }

  function plan(project: Project, input: CreateProjectParams, warnings: string[]): string | null {
    const goal = composeGoal(input.description, input.answers);
    if (!input.planNow || !goal) return null;
    try {
      return s.work.planGoal(project.id, goal).id;
    } catch (e) {
      warnings.push(`Die Planung konnte nicht gestartet werden: ${errorMessage(e)}. Sie kann später über „Neues Ziel planen“ gestartet werden.`);
      return null;
    }
  }

  async function safeRefreshGit(id: string): Promise<Project> {
    try {
      return await service.refreshGit(id);
    } catch (e) {
      log.warn('Git-Status konnte nicht ermittelt werden', { projectId: id, error: errorMessage(e) });
      return requireProject(id);
    }
  }

  function newProject(input: { name: string; description: string; path: string; kind: ProjectKind; technologies: string[]; templateId: string | null; config: ProjectConfig; workState: Project['workState'] }): Project {
    const now = s.core.clock.now();
    return {
      id: newId('prj'),
      name: input.name,
      description: input.description,
      path: input.path,
      kind: input.kind,
      technologies: input.technologies,
      status: 'active',
      templateId: input.templateId,
      config: validateConfig(input.config),
      workState: input.workState,
      gitAvailable: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ------------------------------------------------------------------------------------------- create modes

  async function createFromTemplate(input: CreateProjectParams, name: string, warnings: string[]) {
    const known = await knownFolders();
    const target = input.path ?? pickDefaultTarget(name);
    const check = checkRoot(target, null, known);
    warnings.push(...check.warnings);
    const root = check.canonical;
    const existed = existsSync(root);
    if (existed) {
      if (!isDirectory(root)) throw validation(`Der Zielpfad ist eine Datei, kein Ordner: ${root}`);
      if (!isEmptyDir(root)) throw validation(`Der Zielordner ist nicht leer: ${root}. Für vorhandene Projekte bitte „Projekt öffnen“ wählen.`);
    }

    const choice = input.templateId
      ? null
      : chooseTemplate({ kind: input.kind, technologies: input.technologies, name, description: input.description, answers: input.answers });
    const templateId = input.templateId ?? choice!.templateId;
    const template = s.templates.get(templateId);
    if (!template) throw validation(`Die Vorlage „${templateId}“ gibt es nicht.`);

    const createdParents: string[] = [];
    if (!existed) {
      let cur = root;
      while (!existsSync(cur)) {
        createdParents.unshift(cur);
        const parent = dirname(cur);
        if (parent === cur) break;
        cur = parent;
      }
      mkdirSync(root, { recursive: true });
    }
    const cleanupFolders = () => {
      for (const d of [...createdParents].reverse()) {
        try {
          rmdirSync(d);
        } catch {
          /* not empty → leave it */
        }
      }
    };
    let scaffold: Awaited<ReturnType<typeof template.scaffold>>;
    try {
      scaffold = await template.scaffold(root, { name, description: input.description });
    } catch (e) {
      cleanupFolders();
      throw new NovaError('INTERNAL', `Die Vorlage „${template.info.name}“ konnte nicht angelegt werden: ${errorMessage(e)}`, { cause: e, details: { templateId } });
    }
    const realRoot = realpath(root) ?? root;
    const kind: ProjectKind = template.info.id === 'empty' && input.kind ? input.kind : template.info.kind;
    // A kind override (empty template for Godot/Unreal/generic) keeps the preview/artifact defaults of that kind.
    const scaffoldConfig = kind === template.info.kind ? scaffold.config : { ...scaffold.config, preview: undefined, artifactGlobs: undefined };
    const config = mergeConfig(defaultConfig(kind, autoCommitDefault()), scaffoldConfig);
    const project = newProject({
      name,
      description: input.description,
      path: realRoot,
      kind,
      technologies: uniq([...template.info.technologies, ...input.technologies]),
      templateId: template.info.id,
      config,
      workState: 'running',
    });
    insertProject(project, pathKey(realRoot, platform));
    emitUpdated(project);
    warnings.push(...scaffold.notes);
    const tools = await missingToolsWarning(template.info.requiredTools);
    if (tools) warnings.push(tools);

    if (input.initGit) {
      let gitOk = false;
      try {
        gitOk = await s.git.available();
      } catch (e) {
        log.warn('Git-Verfügbarkeit unbekannt', { error: errorMessage(e) });
      }
      if (!gitOk) warnings.push(GIT_MISSING_WARNING);
      else {
        try {
          if (!existsSync(join(realRoot, '.git'))) await s.git.init(realRoot);
          await s.git.commitPaths(realRoot, scaffold.files, `NOVA: Projekt „${name}“ angelegt`);
        } catch (e) {
          warnings.push(`Das Git-Repository konnte nicht vollständig angelegt werden: ${errorMessage(e)}`);
        }
      }
    }

    const memory: { kind: 'goal' | 'requirement' | 'decision'; title: string; content: string; tags: string[] }[] = memoryEntriesFor(input);
    if (choice) {
      memory.push({
        kind: 'decision',
        title: `Vorlage: ${templateDisplayName(choice.templateId as BuiltinTemplateId)}`,
        content: `${choice.reason} Die Vorlage ist nur ein Startpunkt und kann erweitert oder ersetzt werden.`,
        tags: ['annahme', 'vorlage'],
      });
    }
    addMemory(project.id, memory, warnings);
    attach(project);
    const refreshed = await safeRefreshGit(project.id);
    const planTaskId = plan(refreshed, input, warnings);
    return { project: requireProject(project.id), planTaskId, warnings };
  }

  async function registerExisting(input: CreateProjectParams, name: string, root: string, warnings: string[]) {
    const detected = await s.detector.detect(root);
    const kind = input.kind ?? detected.kind;
    const config = input.kind && input.kind !== detected.kind ? mergeConfig(defaultConfig(kind, autoCommitDefault()), { commands: detected.config.commands, engineVersion: detected.config.engineVersion }) : detected.config;
    const project = newProject({
      name,
      description: input.description,
      path: root,
      kind,
      technologies: uniq([...detected.technologies, ...input.technologies]),
      templateId: null,
      config,
      workState: 'stopped',
    });
    insertProject(project, pathKey(root, platform));
    emitUpdated(project);
    warnings.push(WORK_OFF_WARNING);
    addMemory(project.id, memoryEntriesFor(input), warnings);
    attach(project);
    const refreshed = await safeRefreshGit(project.id);
    if (!refreshed.gitAvailable) {
      let gitOk = false;
      try {
        gitOk = await s.git.available();
      } catch {
        gitOk = false;
      }
      warnings.push(gitOk ? 'Der Ordner ist kein Git-Repository. Wiederherstellungspunkte von NOVA funktionieren trotzdem; Git kann später eingerichtet werden.' : GIT_MISSING_WARNING);
    }
    const planTaskId = plan(refreshed, input, warnings);
    return { project: requireProject(project.id), planTaskId, warnings };
  }

  async function createFromExisting(input: CreateProjectParams, name: string, warnings: string[]) {
    const known = await knownFolders();
    const check = checkRoot(input.path!, null, known);
    warnings.push(...check.warnings);
    if (!isDirectory(check.canonical)) throw validation(`Der Ordner existiert nicht: ${check.canonical}`);
    const root = realpath(check.canonical) ?? check.canonical;
    return registerExisting(input, name, root, warnings);
  }

  async function createFromImport(input: CreateProjectParams, name: string, warnings: string[]) {
    const url = input.repoUrl;
    if (!url) throw validation('Für den Import wird eine Git-Adresse benötigt.');
    const known = await knownFolders();
    const target = input.path ?? pickDefaultTarget(name);
    const check = checkRoot(target, null, known);
    warnings.push(...check.warnings);
    const root = check.canonical;
    if (existsSync(root) && (!isDirectory(root) || !isEmptyDir(root))) {
      throw validation(`Der Zielordner für den Import ist nicht leer: ${root}`);
    }
    let gitOk = false;
    try {
      gitOk = await s.git.available();
    } catch {
      gitOk = false;
    }
    if (!gitOk) {
      throw new NovaError('TOOL_MISSING', 'Git ist nicht installiert. Für den Import eines Repositorys wird Git benötigt (Einstellungen → Werkzeuge).', {
        severity: 'warning',
        userAction: 'Git unter „Einstellungen → Werkzeuge“ installieren und den Import erneut starten.',
      });
    }
    mkdirSync(dirname(root), { recursive: true });
    const op = s.core.operations.run({ kind: 'clone', title: `Repository wird importiert: ${name}`, projectId: null }, async (ctx) => {
      ctx.progress(null, 'Repository wird geklont …');
      await s.git.clone(url, root, ctx.signal, (percent, message) => ctx.progress(percent, message));
    });
    await op.result;
    if (!isDirectory(root)) throw new NovaError('GIT_ERROR', 'Das Repository wurde nicht geklont (Zielordner fehlt).');
    const realRoot = realpath(root) ?? root;
    return registerExisting(input, name, realRoot, warnings);
  }

  // ------------------------------------------------------------------------------------------- summary

  function taskCounts(projectId: string): Record<TaskStatus, number> {
    const zero = Object.fromEntries(TASK_STATUSES.map((st) => [st, 0])) as Record<TaskStatus, number>;
    try {
      const counts = s.tasks.counts(projectId);
      for (const st of TASK_STATUSES) zero[st] = Number(counts[st] ?? 0);
      return zero;
    } catch (e) {
      log.debug('TaskService nicht verfügbar – zähle direkt', { error: errorMessage(e) });
      for (const r of db.all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM tasks WHERE project_id = ? GROUP BY status', [projectId])) {
        if ((TASK_STATUSES as string[]).includes(r.status)) zero[r.status as TaskStatus] = Number(r.n);
      }
      return zero;
    }
  }

  function lastActivity(p: Project): number | null {
    const candidates: (number | null)[] = [p.updatedAt, latestCheckActivity(db, p.id)];
    for (const sql of [
      'SELECT MAX(updated_at) AS ts FROM tasks WHERE project_id = ?',
      'SELECT MAX(updated_at) AS ts FROM agent_runs WHERE project_id = ?',
      'SELECT MAX(ts) AS ts FROM changes WHERE project_id = ?',
    ]) {
      try {
        const r = db.get<{ ts: number | null }>(sql, [p.id]);
        candidates.push(r?.ts === null || r?.ts === undefined ? null : Number(r.ts));
      } catch {
        /* table not readable – ignore this source */
      }
    }
    const values = candidates.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    return values.length ? Math.max(...values) : null;
  }

  function summarize(p: Project): ProjectSummary {
    const counts = taskCounts(p.id);
    const all = TASK_STATUSES.reduce((a, st) => a + counts[st], 0);
    const relevant = all - counts.cancelled;
    let pendingApprovals = 0;
    try {
      pendingApprovals = s.approvals.pendingCount(p.id);
    } catch (e) {
      log.debug('Freigaben nicht verfügbar', { error: errorMessage(e) });
    }
    return {
      ...p,
      progress: relevant > 0 ? Math.round((counts.done / relevant) * 100) : 0,
      openTasks: counts.queued + counts.running + counts.paused + counts.waiting_approval + counts.blocked + counts.interrupted,
      runningTasks: counts.running,
      failedTasks: counts.failed,
      blockedTasks: counts.blocked,
      pausedTasks: counts.paused,
      waitingApprovalTasks: counts.waiting_approval,
      taskCounts: { ...counts },
      pendingApprovals,
      openErrors: s.core.errors.countOpen(p.id),
      lastBuild: latestCheck(db, p.id, 'build'),
      lastSuccessfulBuild: latestCheck(db, p.id, 'build', 'passed'),
      lastTest: latestCheck(db, p.id, 'test'),
      lastActivityAt: lastActivity(p),
      pathMissing: !isDirectory(p.path),
    };
  }

  // ------------------------------------------------------------------------------------------- service

  const service: ProjectService = {
    list(o = {}) {
      const rows = o.includeArchived
        ? db.all<ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC')
        : db.all<ProjectRow>("SELECT * FROM projects WHERE status = 'active' ORDER BY updated_at DESC");
      return rows.map((r) => summarize(toProject(r)));
    },

    get,

    require: requireProject,

    summary(id) {
      return summarize(requireProject(id));
    },

    async create(input) {
      const name = input.name.trim();
      if (!name) throw validation('Bitte einen Projektnamen angeben.');
      const warnings: string[] = [];
      switch (input.mode) {
        case 'open':
          if (!input.path) throw validation('Bitte einen vorhandenen Projektordner auswählen.');
          return createFromExisting(input, name, warnings);
        case 'import':
          return createFromImport(input, name, warnings);
        default:
          return createFromTemplate(input, name, warnings);
      }
    },

    update(input) {
      const current = requireProject(input.id);
      const next: Project = { ...current, technologies: [...current.technologies] };
      if (input.name !== undefined) {
        const n = input.name.trim();
        if (!n) throw validation('Der Projektname darf nicht leer sein.');
        next.name = n;
      }
      if (input.description !== undefined) next.description = input.description;
      if (input.kind !== undefined) next.kind = input.kind;
      if (input.technologies !== undefined) next.technologies = uniq(input.technologies);
      if (input.status !== undefined) next.status = input.status;
      if (input.config !== undefined) next.config = validateConfig(mergeConfig(current.config, input.config));
      let pathChanged = false;
      let key = pathKey(current.path, platform);
      if (input.path !== undefined && input.path.trim() !== '') {
        const check = checkRoot(input.path, current.id, peekKnownFolders());
        if (!isDirectory(check.canonical)) throw validation(`Der Ordner existiert nicht: ${check.canonical}`);
        const real = realpath(check.canonical) ?? check.canonical;
        if (pathKey(real, platform) !== key) {
          pathChanged = true;
          next.path = real;
          key = pathKey(real, platform);
          for (const w of check.warnings) log.warn(w, { projectId: current.id });
        }
      }
      next.updatedAt = s.core.clock.now();
      try {
        db.run(
          `UPDATE projects SET name = ?, description = ?, path = ?, path_key = ?, kind = ?, technologies = ?, status = ?, config = ?, updated_at = ? WHERE id = ?`,
          [next.name, next.description, next.path, key, next.kind, toJson(next.technologies), next.status, toJson(next.config), next.updatedAt, next.id],
        );
      } catch (e) {
        if (isUniqueViolation(e)) throw validation('Dieser Ordner kann nicht als Projektordner verwendet werden: Er ist bereits als Projekt eingetragen.');
        throw e;
      }
      const archivedNow = current.status === 'active' && next.status === 'archived';
      const reactivated = current.status === 'archived' && next.status === 'active';
      if (pathChanged || archivedNow) {
        try {
          s.watcher.unwatch(current.id);
        } catch (e) {
          log.warn('Ordnerüberwachung konnte nicht beendet werden', { error: errorMessage(e) });
        }
        void s.preview.stop(current.id).catch((e) => log.warn('Vorschau konnte nicht gestoppt werden', { error: errorMessage(e) }));
      }
      if ((pathChanged && next.status === 'active') || reactivated) attach(next);
      if (pathChanged) void safeRefreshGit(next.id);
      const saved = requireProject(next.id);
      emitUpdated(saved);
      return saved;
    },

    setWorkState(id, state) {
      const parsed = WorkCycleState.safeParse(state);
      if (!parsed.success) throw validation(`Unbekannter Arbeitszustand: ${String(state)}`);
      requireProject(id);
      db.run('UPDATE projects SET work_state = ?, updated_at = ? WHERE id = ?', [parsed.data, s.core.clock.now(), id]);
      const p = requireProject(id);
      emitUpdated(p);
      return p;
    },

    async remove(id) {
      const project = requireProject(id);
      const counts = taskCounts(id);
      if (counts.running > 0) {
        throw conflict(`Das Projekt „${project.name}“ kann nicht entfernt werden, solange Aufgaben laufen (${counts.running}). Bitte die Arbeit zuerst stoppen.`);
      }
      const step = async (label: string, fn: () => unknown) => {
        try {
          await fn();
        } catch (e) {
          log.warn(`Projekt entfernen: ${label} fehlgeschlagen`, { projectId: id, error: errorMessage(e) });
        }
      };
      await step('Vorschau stoppen', () => s.preview.stop(id));
      await step('Terminals schließen', () => s.terminals.closeProject(id));
      await step('Prozesse beenden', () => s.processes.killProject(id));
      await step('Freigaben ablaufen lassen', () => s.approvals.expireForProject(id));
      await step('Dateisperren freigeben', () => s.locks.releaseProject(id));
      await step('Ordnerüberwachung beenden', () => s.watcher.unwatch(id));
      db.transaction(() => {
        db.run('DELETE FROM projects WHERE id = ?', [id]);
        db.run('DELETE FROM changes WHERE project_id = ?', [id]);
        db.run('DELETE FROM approval_rules WHERE project_id = ?', [id]);
        db.run('DELETE FROM file_locks WHERE project_id = ?', [id]);
      });
      await step('Projektgedächtnis bereinigen', () => s.memory.removeProject(id));
      s.core.errors.resolveWhere({ projectId: id });
      s.core.bus.emit('project.removed', { id });
      log.info('Projekt aus NOVA entfernt (Dateien bleiben erhalten)', { projectId: id, name: project.name });
    },

    async detect(id) {
      const project = requireProject(id);
      return s.detector.detect(project.path);
    },

    async refreshGit(id) {
      const p = requireProject(id);
      let available = false;
      if (isDirectory(p.path)) {
        try {
          available = (await s.git.available()) && (await s.git.isRepo(p.path));
        } catch (e) {
          log.debug('Git-Prüfung fehlgeschlagen', { error: errorMessage(e) });
          available = false;
        }
      }
      if (available !== p.gitAvailable) {
        db.run('UPDATE projects SET git_available = ?, updated_at = ? WHERE id = ?', [int(available), s.core.clock.now(), id]);
        const updated = requireProject(id);
        emitUpdated(updated);
        return updated;
      }
      return p;
    },

    defaultConfig(kind) {
      return defaultConfig(kind, autoCommitDefault());
    },
  };
  return service;
}
