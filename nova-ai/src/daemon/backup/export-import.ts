// Data export/import (SPEC §4.6, §6.6): JSON format v1
//   { format: "nova-export", version: 1, exportedAt, appVersion, sections: { projects?, tasks?, settings?, memory?, providers? } }
// Key decisions:
// - Export NEVER contains secrets: API keys are not part of provider rows (hasApiKey is dropped, secret-looking
//   option keys removed) and every section passes through redact(). Projects/tasks/providers are read through their
//   services; memory entries are read from their table (the memory service caps list() at 2000 per call).
// - Import validates the envelope and every item with the shared zod schemas (invalid items are skipped with a
//   German warning instead of rejecting the whole file) and writes everything in ONE database transaction in FK
//   order projects → tasks → memory → providers, then settings. Events (project/task/memory/provider updated) are
//   emitted only after the commit.
// - Import rules: existing ids and path_key collisions are skipped (German warning); project folders failing the
//   basic root safety rules or overlapping a registered project are skipped; imported projects start with work
//   state "stopped" (the UI shows the honest-limits warning before work is enabled), gitAvailable is re-detected
//   and project.config.allowedCommands is NOT taken over (a permission); tasks with status running /
//   waiting_approval / interrupted become queued, startRequested is cleared and dependencies on unknown tasks are
//   dropped; memory content is redacted again; providers get approved=false (Ollama rows keep the registry
//   invariant paid=false/approved=true – they never cost money) and need their API keys re-entered; the settings
//   sections permissions, network and budgets are never imported.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { z } from 'zod';
import {
  ExportSection,
  MemoryEntrySchema,
  ProjectSchema,
  ProviderConfigSchema,
  TaskSchema,
  type MemoryEntry,
  type Project,
  type Task,
} from '@shared/schemas';
import { SettingsSchema, SETTINGS_SECTIONS, type SettingsPatch, type SettingsSection } from '@shared/settings';
import type { Services } from '../contracts';
import type { Logger } from '../core/logger';
import { NovaError, errorMessage, validation } from '../core/errors';
import { atomicWriteFile } from '../core/fs-atomic';
import { isLocalEndpoint } from '../core/net';
import { redact, redactString } from '../core/redact';
import { bool, fromJson, int, toJson } from '../db/database';
import { exportFileName } from './names';

export const EXPORT_FORMAT = 'nova-export';
export const EXPORT_VERSION = 1;
/** Import files larger than this are refused (protects the daemon's memory). */
export const MAX_IMPORT_BYTES = 256 * 1024 * 1024;
const NEVER_IMPORTED: SettingsSection[] = ['permissions', 'network', 'budgets'];
const MAX_DETAILED_WARNINGS = 50;
const PROVIDER_ID = /^[a-z0-9][a-z0-9-]*$/;
const SECRET_OPTION_KEY = /(api[_-]?key|apikey|token|secret|passw(or)?d|authorization|cookie|credential)/i;

export const ProviderExportSchema = ProviderConfigSchema.omit({ hasApiKey: true });
export type ProviderExport = z.infer<typeof ProviderExportSchema>;

export const ExportEnvelopeSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.number().int().min(1),
  exportedAt: z.number(),
  appVersion: z.string().optional(),
  sections: z.object({
    projects: z.array(z.unknown()).optional(),
    tasks: z.array(z.unknown()).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    memory: z.array(z.unknown()).optional(),
    providers: z.array(z.unknown()).optional(),
  }),
});

export interface DataIoDeps {
  s: Services;
  log: Logger;
  platform: NodeJS.Platform;
  /** Registers a file written into the exports folder as a backup entry of kind 'export'. */
  registerExport(path: string, createdAt: number, sizeBytes: number): void;
}

export interface IoOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number | null, message: string) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new NovaError('CANCELLED', 'Der Vorgang wurde abgebrochen.', { severity: 'warning' });
}

function pathApi(platform: NodeJS.Platform) {
  return platform === 'win32' ? win32 : posix;
}

/** Same key as ProjectService (normalized, no trailing separator, lower-case on Windows). */
export function projectPathKey(p: string, platform: NodeJS.Platform): string {
  const api = pathApi(platform);
  let n = api.normalize(p);
  const root = api.parse(n).root;
  while (n.length > root.length && /[\\/]$/.test(n)) n = n.slice(0, -1);
  return platform === 'win32' ? n.toLowerCase() : n;
}

function keyInside(child: string, parent: string, platform: NodeJS.Platform): boolean {
  if (child === parent) return true;
  const sep = platform === 'win32' ? '\\' : '/';
  return child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
}

/** German reason why a folder must not be registered as a project, or null. Basic subset of SPEC §6.8. */
export function unsafeProjectRoot(path: string, platform: NodeJS.Platform, dataDir: string, env: Record<string, string | undefined> = process.env): string | null {
  const api = pathApi(platform);
  if (!api.isAbsolute(path)) return 'Der Pfad ist nicht absolut.';
  const key = projectPathKey(path, platform);
  const root = projectPathKey(api.parse(api.normalize(path)).root || path, platform);
  if (key === root) return 'Laufwerks- oder Freigabe-Stammordner sind nicht erlaubt.';
  const data = projectPathKey(dataDir, platform);
  if (keyInside(key, data, platform) || keyInside(data, key, platform)) return 'Der Ordner überschneidet sich mit dem NOVA-Datenordner.';
  const forbiddenInside: string[] = [];
  const forbiddenEqual: string[] = [];
  if (platform === 'win32') {
    for (const v of ['WINDIR', 'SystemRoot', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramData', 'APPDATA', 'LOCALAPPDATA']) if (env[v]) forbiddenInside.push(env[v]!);
    if (env.USERPROFILE) forbiddenEqual.push(env.USERPROFILE);
  } else {
    forbiddenInside.push('/etc', '/usr', '/bin', '/sbin', '/boot', '/proc', '/sys', '/dev', '/lib', '/lib64');
    forbiddenEqual.push(env.HOME || homedir());
  }
  for (const f of forbiddenInside) if (keyInside(key, projectPathKey(f, platform), platform)) return 'Systemordner sind nicht erlaubt.';
  for (const f of forbiddenEqual) if (key === projectPathKey(f, platform)) return 'Der Benutzerordner selbst ist nicht erlaubt.';
  return null;
}

// ------------------------------------------------------------------------------------------------ export

interface MemoryRow {
  id: string;
  project_id: string | null;
  kind: string;
  title: string;
  content: string;
  tags: string;
  source: string;
  shareable: number;
  task_id: string | null;
  created_at: number;
  updated_at: number;
}

function sanitizeOptions(options: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(options ?? {})) {
    if (SECRET_OPTION_KEY.test(k) && k !== 'authHeader') continue;
    out[k] = redactString(String(v));
  }
  return out;
}

function resolveExportTarget(path: string | undefined, defaultDir: string, platform: NodeJS.Platform, ts: number): string {
  const api = pathApi(platform);
  if (path === undefined || path.trim() === '') return api.join(defaultDir, exportFileName(ts));
  if (!api.isAbsolute(path)) throw validation('Bitte einen vollständigen Pfad für die Exportdatei angeben.');
  const st = statSync(path, { throwIfNoEntry: false });
  if (st?.isDirectory()) return api.join(path, exportFileName(ts));
  const parent = api.dirname(path);
  const pst = statSync(parent, { throwIfNoEntry: false });
  if (!pst || !pst.isDirectory()) throw validation(`Der Zielordner existiert nicht: ${parent}`);
  return path;
}

export async function exportData(deps: DataIoDeps, sections: string[], path: string | undefined, opts: IoOptions = {}): Promise<{ path: string; counts: Record<string, number> }> {
  const { s } = deps;
  const wanted = [...new Set(sections)].map((x) => {
    const p = ExportSection.safeParse(x);
    if (!p.success) throw validation(`Unbekannter Exportbereich: ${x}`);
    return p.data;
  });
  if (wanted.length === 0) throw validation('Bitte mindestens einen Bereich für den Export auswählen.');
  const now = s.core.clock.now();
  const target = resolveExportTarget(path, s.core.paths.exports, deps.platform, now);
  const out: Record<string, unknown> = {};
  const counts: Record<string, number> = {};
  const step = (i: number, text: string) => opts.onProgress?.(Math.round((i / (wanted.length + 1)) * 100), text);
  let i = 0;
  let projectList: Project[] | null = null;
  const projects = (): Project[] => {
    if (!projectList) {
      projectList = [];
      for (const summary of s.projects.list({ includeArchived: true })) {
        const parsed = ProjectSchema.safeParse(summary);
        if (parsed.success) projectList.push(parsed.data);
        else deps.log.warn('Projekt konnte nicht exportiert werden (ungültige Daten)', { id: summary.id });
      }
    }
    return projectList;
  };
  for (const section of wanted) {
    throwIfAborted(opts.signal);
    if (section === 'projects') {
      step(i, 'Projekte werden exportiert …');
      out.projects = projects().map((p) => redact(p));
      counts.projects = (out.projects as unknown[]).length;
    } else if (section === 'tasks') {
      step(i, 'Aufgaben werden exportiert …');
      const tasks: Task[] = [];
      for (const p of projects()) tasks.push(...s.tasks.list({ projectId: p.id, limit: 100_000 }));
      out.tasks = tasks.map((t) => redact(t));
      counts.tasks = tasks.length;
    } else if (section === 'settings') {
      step(i, 'Einstellungen werden exportiert …');
      out.settings = redact(s.core.settings.get());
      counts.settings = SETTINGS_SECTIONS.length;
    } else if (section === 'memory') {
      step(i, 'Gedächtnis wird exportiert …');
      const rows = s.core.db.all<MemoryRow>(
        'SELECT id, project_id, kind, title, content, tags, source, shareable, task_id, created_at, updated_at FROM memory_entries ORDER BY created_at ASC, rowid ASC',
      );
      const entries: MemoryEntry[] = [];
      for (const r of rows) {
        const parsed = MemoryEntrySchema.safeParse({
          id: r.id,
          projectId: r.project_id,
          kind: r.kind,
          title: redactString(r.title),
          content: redactString(r.content),
          tags: fromJson<string[]>(r.tags, []),
          source: r.source,
          shareable: bool(r.shareable),
          taskId: r.task_id,
          createdAt: Number(r.created_at),
          updatedAt: Number(r.updated_at),
        });
        if (parsed.success) entries.push(parsed.data);
      }
      out.memory = entries;
      counts.memory = entries.length;
    } else if (section === 'providers') {
      step(i, 'Modellanbieter werden exportiert (ohne API-Schlüssel) …');
      out.providers = s.providers.list().map((p): ProviderExport => ({
        id: p.id,
        type: p.type,
        name: redactString(p.name),
        baseUrl: redactString(p.baseUrl),
        enabled: p.enabled,
        paid: p.paid,
        approved: p.approved,
        options: sanitizeOptions(p.options),
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      }));
      counts.providers = (out.providers as unknown[]).length;
    }
    i++;
  }
  throwIfAborted(opts.signal);
  step(i, 'Exportdatei wird geschrieben …');
  const envelope = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now, appVersion: s.core.version, sections: out };
  const text = JSON.stringify(envelope, null, 2);
  atomicWriteFile(target, text);
  const api = pathApi(deps.platform);
  const exportsKey = projectPathKey(s.core.paths.exports, deps.platform);
  if (keyInside(projectPathKey(api.dirname(target), deps.platform), exportsKey, deps.platform)) deps.registerExport(target, now, Buffer.byteLength(text));
  deps.log.info('Daten exportiert', { path: target, counts });
  return { path: target, counts };
}

// ------------------------------------------------------------------------------------------------ import

class Warnings {
  private detailed: string[] = [];
  private suppressed = new Map<string, number>();
  add(section: string, text: string): void {
    if (this.detailed.length < MAX_DETAILED_WARNINGS) this.detailed.push(text);
    else this.suppressed.set(section, (this.suppressed.get(section) ?? 0) + 1);
  }
  list(): string[] {
    const out = [...this.detailed];
    for (const [section, n] of this.suppressed) out.push(`… und ${n} weitere Hinweise im Bereich „${section}“.`);
    return out;
  }
}

function zodIssues(e: z.ZodError): string {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || 'Eintrag'}: ${i.message}`)
    .join('; ');
}

function label(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export async function importData(deps: DataIoDeps, path: string, opts: IoOptions = {}): Promise<{ counts: Record<string, number>; warnings: string[] }> {
  const { s } = deps;
  const db = s.core.db;
  const platform = deps.platform;
  const api = pathApi(platform);
  if (typeof path !== 'string' || !api.isAbsolute(path)) throw validation('Bitte den vollständigen Pfad der Importdatei angeben.');
  const st = statSync(path, { throwIfNoEntry: false });
  if (!st || !st.isFile()) throw new NovaError('NOT_FOUND', `Die Importdatei wurde nicht gefunden: ${path}`, { severity: 'warning' });
  if (st.size > MAX_IMPORT_BYTES) throw validation('Die Importdatei ist zu groß (mehr als 256 MB).');
  opts.onProgress?.(5, 'Importdatei wird gelesen …');
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
  } catch {
    throw validation('Die Datei ist keine gültige NOVA-Exportdatei (kein gültiges JSON).');
  }
  const env = ExportEnvelopeSchema.safeParse(raw);
  if (!env.success) throw validation(`Die Datei ist keine gültige NOVA-Exportdatei: ${zodIssues(env.error)}`);
  if (env.data.version > EXPORT_VERSION) {
    throw validation(`Die Exportdatei stammt von einer neueren NOVA-Version (Format ${env.data.version}). Bitte NOVA aktualisieren.`);
  }
  throwIfAborted(opts.signal);
  const sec = env.data.sections;
  const warnings = new Warnings();
  const counts: Record<string, number> = { projects: 0, tasks: 0, memory: 0, providers: 0, settings: 0, skipped: 0 };
  const skip = (section: string, text: string) => {
    counts.skipped++;
    warnings.add(section, text);
  };

  // ---- validation (outside the transaction)
  opts.onProgress?.(15, 'Daten werden geprüft …');
  const projects: Project[] = [];
  for (const item of sec.projects ?? []) {
    const p = ProjectSchema.safeParse(item);
    if (p.success) projects.push(p.data);
    else skip('Projekte', `Ein Projekt wurde übersprungen (ungültige Daten: ${zodIssues(p.error)}).`);
  }
  const tasks: Task[] = [];
  for (const item of sec.tasks ?? []) {
    const t = TaskSchema.safeParse(item);
    if (t.success) tasks.push(t.data);
    else skip('Aufgaben', `Eine Aufgabe wurde übersprungen (ungültige Daten: ${zodIssues(t.error)}).`);
  }
  const memory: MemoryEntry[] = [];
  for (const item of sec.memory ?? []) {
    const m = MemoryEntrySchema.safeParse(item);
    if (m.success) memory.push(m.data);
    else skip('Gedächtnis', `Ein Gedächtniseintrag wurde übersprungen (ungültige Daten: ${zodIssues(m.error)}).`);
  }
  const providers: ProviderExport[] = [];
  for (const item of sec.providers ?? []) {
    const p = ProviderExportSchema.safeParse(item);
    if (p.success) providers.push(p.data);
    else skip('Modellanbieter', `Ein Modellanbieter wurde übersprungen (ungültige Daten: ${zodIssues(p.error)}).`);
  }
  const settingsPatch: Record<string, Record<string, unknown>> = {};
  for (const [section, value] of Object.entries(sec.settings ?? {})) {
    if (!(SETTINGS_SECTIONS as string[]).includes(section)) {
      warnings.add('Einstellungen', `Unbekannter Einstellungsbereich „${section}“ wurde ignoriert.`);
      continue;
    }
    if (NEVER_IMPORTED.includes(section as SettingsSection)) {
      warnings.add('Einstellungen', `Die Einstellungen „${section}“ werden aus Sicherheitsgründen nie importiert und bleiben unverändert.`);
      continue;
    }
    const schema = SettingsSchema.shape[section as SettingsSection];
    const parsed = schema.safeParse(value);
    if (!parsed.success || !value || typeof value !== 'object' || Array.isArray(value)) {
      warnings.add('Einstellungen', `Die Einstellungen „${section}“ sind ungültig und wurden nicht übernommen${parsed.success ? '' : ` (${zodIssues(parsed.error)})`}.`);
      continue;
    }
    settingsPatch[section] = value as Record<string, unknown>;
  }
  throwIfAborted(opts.signal);

  // ---- single transaction (FK order: projects → tasks → memory → providers, then settings)
  opts.onProgress?.(40, 'Daten werden übernommen …');
  const imported = { projects: [] as Project[], tasks: [] as string[], memory: [] as MemoryEntry[], providers: [] as string[] };
  const now = s.core.clock.now();
  db.transaction(() => {
    const existingProjects = db.all<{ id: string; name: string; path_key: string }>('SELECT id, name, path_key FROM projects');
    const projectIds = new Set(existingProjects.map((p) => p.id));
    const keys = existingProjects.map((p) => ({ key: p.path_key, name: p.name }));
    for (const p of projects) {
      if (projectIds.has(p.id)) {
        skip('Projekte', `Projekt „${label(p.name)}“ wurde übersprungen: Es ist bereits vorhanden.`);
        continue;
      }
      const key = projectPathKey(p.path, platform);
      const same = keys.find((k) => k.key === key);
      if (same) {
        skip('Projekte', `Projekt „${label(p.name)}“ wurde übersprungen: Der Ordner ist bereits als Projekt „${label(same.name)}“ eingetragen.`);
        continue;
      }
      const unsafe = unsafeProjectRoot(p.path, platform, s.core.paths.root);
      if (unsafe) {
        skip('Projekte', `Projekt „${label(p.name)}“ wurde übersprungen: ${unsafe}`);
        continue;
      }
      const overlap = keys.find((k) => keyInside(key, k.key, platform) || keyInside(k.key, key, platform));
      if (overlap) {
        skip('Projekte', `Projekt „${label(p.name)}“ wurde übersprungen: Der Ordner überschneidet sich mit dem Projekt „${label(overlap.name)}“.`);
        continue;
      }
      const config = { ...p.config };
      if (config.allowedCommands.length > 0) {
        warnings.add('Projekte', `Die erlaubten Befehle des Projekts „${label(p.name)}“ wurden aus Sicherheitsgründen nicht übernommen.`);
        config.allowedCommands = [];
      }
      const project: Project = { ...p, config, workState: 'stopped', gitAvailable: false, updatedAt: now };
      db.run(
        `INSERT INTO projects(id, name, description, path, path_key, kind, technologies, status, template_id, origin, config, work_state, git_available, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [project.id, project.name, project.description, project.path, key, project.kind, toJson(project.technologies), project.status, project.templateId, project.origin, toJson(project.config), project.workState, int(false), project.createdAt, project.updatedAt],
      );
      projectIds.add(project.id);
      keys.push({ key, name: project.name });
      imported.projects.push(project);
    }

    const existingTasks = new Map(db.all<{ id: string; project_id: string }>('SELECT id, project_id FROM tasks').map((t) => [t.id, t.project_id]));
    const incoming = new Map<string, string>();
    for (const t of tasks) if (!existingTasks.has(t.id) && projectIds.has(t.projectId)) incoming.set(t.id, t.projectId);
    for (const t of tasks) {
      if (existingTasks.has(t.id)) {
        skip('Aufgaben', `Aufgabe „${label(t.title)}“ wurde übersprungen: Sie ist bereits vorhanden.`);
        continue;
      }
      if (!projectIds.has(t.projectId)) {
        skip('Aufgaben', `Aufgabe „${label(t.title)}“ wurde übersprungen: Das zugehörige Projekt ist nicht vorhanden.`);
        continue;
      }
      const dependsOn = t.dependsOn.filter((d) => (existingTasks.get(d) ?? incoming.get(d)) === t.projectId && d !== t.id);
      if (dependsOn.length < t.dependsOn.length) warnings.add('Aufgaben', `Bei Aufgabe „${label(t.title)}“ wurden Abhängigkeiten zu fehlenden Aufgaben entfernt.`);
      const normalize = t.status === 'running' || t.status === 'waiting_approval' || t.status === 'interrupted';
      const task: Task = {
        ...t,
        dependsOn,
        status: normalize ? 'queued' : t.status,
        blocker: normalize ? null : t.blocker,
        blockerCode: normalize ? null : t.blockerCode,
        startedAt: normalize ? null : t.startedAt,
        finishedAt: normalize ? null : t.finishedAt,
        startRequested: false,
        updatedAt: now,
      };
      db.run(
        `INSERT INTO tasks(id, project_id, parent_id, title, description, kind, role, status, priority, depends_on, attempts,
           max_attempts, blocker, blocker_code, result, acceptance, verification, files, planned_files, start_requested, model,
           source, failure_signatures, created_at, updated_at, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '[]', ?, ?, ?, ?)`,
        [
          task.id,
          task.projectId,
          task.parentId,
          task.title,
          task.description,
          task.kind,
          task.role,
          task.status,
          task.priority,
          toJson(task.dependsOn),
          task.attempts,
          task.maxAttempts,
          task.blocker,
          task.blockerCode,
          task.result,
          task.acceptance,
          toJson(task.verification),
          toJson(task.files),
          toJson(task.plannedFiles),
          task.model,
          task.source,
          task.createdAt,
          task.updatedAt,
          task.startedAt,
          task.finishedAt,
        ],
      );
      existingTasks.set(task.id, task.projectId);
      imported.tasks.push(task.id);
    }

    const existingMemory = new Set(db.all<{ id: string }>('SELECT id FROM memory_entries').map((m) => m.id));
    for (const m of memory) {
      if (existingMemory.has(m.id)) {
        skip('Gedächtnis', `Gedächtniseintrag „${label(m.title)}“ wurde übersprungen: Er ist bereits vorhanden.`);
        continue;
      }
      if (m.projectId !== null && !projectIds.has(m.projectId)) {
        skip('Gedächtnis', `Gedächtniseintrag „${label(m.title)}“ wurde übersprungen: Das zugehörige Projekt ist nicht vorhanden.`);
        continue;
      }
      const entry: MemoryEntry = { ...m, title: redactString(m.title), content: redactString(m.content), tags: m.tags.map((t) => redactString(t)) };
      db.run(
        `INSERT INTO memory_entries(id, project_id, kind, title, content, tags, source, shareable, task_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.id, entry.projectId, entry.kind, entry.title, entry.content, JSON.stringify(entry.tags), entry.source, int(entry.shareable), entry.taskId, entry.createdAt, entry.updatedAt],
      );
      existingMemory.add(entry.id);
      imported.memory.push(entry);
    }

    const existingProviders = new Set(db.all<{ id: string }>('SELECT id FROM providers').map((p) => p.id));
    for (const p of providers) {
      if (existingProviders.has(p.id)) {
        skip('Modellanbieter', `Modellanbieter „${label(p.name)}“ wurde übersprungen: Er ist bereits vorhanden.`);
        continue;
      }
      if (!PROVIDER_ID.test(p.id)) {
        skip('Modellanbieter', `Modellanbieter „${label(p.name)}“ wurde übersprungen: ungültige Kennung.`);
        continue;
      }
      let url: URL | null = null;
      try {
        url = new URL(p.baseUrl);
      } catch {
        url = null;
      }
      if (!url || (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalEndpoint(p.baseUrl))) || url.username || url.password) {
        skip('Modellanbieter', `Modellanbieter „${label(p.name)}“ wurde übersprungen: Die Adresse muss https:// verwenden (oder lokal sein) und darf keine Zugangsdaten enthalten.`);
        continue;
      }
      const options = sanitizeOptions(p.options);
      if (Object.keys(options).length < Object.keys(p.options).length) warnings.add('Modellanbieter', `Vertrauliche Optionen von „${label(p.name)}“ wurden nicht übernommen.`);
      const ollama = p.type === 'ollama';
      db.run(
        `INSERT INTO providers(id, type, name, base_url, enabled, paid, approved, options, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [p.id, p.type, p.name, p.baseUrl, int(p.enabled), int(ollama ? false : p.paid), int(ollama), toJson(options), p.createdAt, now],
      );
      existingProviders.add(p.id);
      imported.providers.push(p.id);
      if (!ollama) warnings.add('Modellanbieter', `Modellanbieter „${label(p.name)}“: Bitte den API-Schlüssel neu eingeben und die kostenpflichtige Nutzung erneut freigeben.`);
    }

    // Last statement of the transaction: SettingsService validates and persists (nested savepoint).
    if (Object.keys(settingsPatch).length > 0) {
      s.core.settings.update(settingsPatch as SettingsPatch);
      counts.settings = Object.keys(settingsPatch).length;
    }
  });
  counts.projects = imported.projects.length;
  counts.tasks = imported.tasks.length;
  counts.memory = imported.memory.length;
  counts.providers = imported.providers.length;
  if (imported.projects.length > 0) warnings.add('Projekte', 'Importierte Projekte sind gestoppt. Die autonome Arbeit kann im Projekt eingeschaltet werden.');

  // ---- events after the commit (best effort)
  opts.onProgress?.(85, 'Ansichten werden aktualisiert …');
  for (const p of imported.projects) {
    let current: Project | null = p;
    try {
      current = s.projects.get(p.id) ?? p;
    } catch (e) {
      deps.log.debug('Projekt nach Import nicht lesbar', { error: errorMessage(e) });
    }
    s.core.bus.emit('project.updated', current ?? p);
    if (existsSync(p.path)) {
      try {
        await s.projects.refreshGit(p.id);
      } catch (e) {
        deps.log.debug('Git-Status nach Import nicht ermittelbar', { error: errorMessage(e) });
      }
      try {
        s.watcher.watch(p.id, p.path);
      } catch (e) {
        deps.log.debug('Dateiüberwachung nach Import nicht gestartet', { error: errorMessage(e) });
      }
      try {
        s.resources.trackPath(p.path);
      } catch {
        /* optional */
      }
    } else {
      warnings.add('Projekte', `Der Ordner von Projekt „${label(p.name)}“ existiert auf diesem PC nicht. Er kann im Projekt neu verknüpft werden.`);
    }
  }
  for (const id of imported.tasks) {
    try {
      const t = s.tasks.get(id);
      if (t) s.core.bus.emit('task.updated', t);
    } catch (e) {
      deps.log.debug('Aufgabe nach Import nicht lesbar', { error: errorMessage(e) });
    }
  }
  for (const m of imported.memory) s.core.bus.emit('memory.updated', m);
  for (const id of imported.providers) {
    try {
      const cfg = s.providers.getConfig(id);
      if (cfg) s.core.bus.emit('provider.updated', cfg);
    } catch (e) {
      deps.log.debug('Anbieter nach Import nicht lesbar', { error: errorMessage(e) });
    }
  }
  deps.log.info('Daten importiert', { path, counts });
  return { counts, warnings: warnings.list() };
}
