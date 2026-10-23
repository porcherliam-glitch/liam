// Test fixtures for the agents module (used only by *.test.ts files in this folder): DB rows for a project and a
// task (agent_runs has a foreign key on tasks), a scripted fake ModelClient, a fake ToolRegistry built from small
// hand-written tools, and fake TaskService/MemoryService parts.
import { z } from 'zod';
import type { MemoryEntry, Project, ProjectConfig, Task, TaskNote } from '@shared/schemas';
import type {
  AgentTool,
  ChatToolCall,
  ChatToolSpec,
  CoreContext,
  MemoryService,
  ModelChatInput,
  ModelChatResult,
  ModelClient,
  ResolvedModel,
  TaskService,
  ToolContext,
  ToolRegistry,
  ToolResult,
} from '../contracts';
import { NovaError } from '../core/errors';
import { newId } from '../core/ids';

export function defaultConfig(): ProjectConfig {
  return {
    commands: { install: null, dev: null, build: 'npm run build', test: 'npm test', lint: null, typecheck: null, e2e: null, security: null, package: null, run: null },
    preview: { kind: 'none', entry: null, url: null },
    allowedCommands: [],
    testAfterChange: true,
    reviewChanges: false,
    autoCommit: false,
    monthlyBudgetUsd: null,
    conventions: 'Use ES modules.',
    artifactGlobs: [],
    engineVersion: null,
  };
}

export function insertProjectAndTask(core: CoreContext, overrides: Partial<Task> = {}, projectPath = '/tmp/nova-project'): { project: Project; task: Task } {
  const now = core.clock.now();
  const project: Project = {
    id: newId('prj'),
    name: 'Snake',
    description: 'Ein kleines Browserspiel.',
    path: projectPath,
    kind: 'web',
    technologies: ['javascript'],
    status: 'active',
    templateId: null,
    origin: 'new',
    config: defaultConfig(),
    workState: 'running',
    gitAvailable: true,
    createdAt: now,
    updatedAt: now,
  };
  core.db.run(
    `INSERT INTO projects(id, name, description, path, path_key, kind, technologies, status, template_id, config, work_state, git_available, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [project.id, project.name, project.description, project.path, `${project.path}#${project.id}`, project.kind, JSON.stringify(project.technologies), 'active', null, JSON.stringify(project.config), 'running', 1, now, now],
  );
  const task: Task = {
    id: newId('task'),
    projectId: project.id,
    parentId: null,
    title: 'Punktestand anzeigen',
    description: 'Den Punktestand oben links anzeigen.',
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
    acceptance: 'Der Punktestand ist sichtbar.',
    verification: { status: 'not_run', checks: [] },
    files: [],
    plannedFiles: ['src/score.js'],
    startRequested: false,
    model: null,
    source: 'user',
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: null,
    ...overrides,
  };
  core.db.run(
    `INSERT INTO tasks(id, project_id, title, description, kind, role, status, priority, depends_on, attempts, max_attempts, acceptance, planned_files, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 0, 3, ?, '[]', ?, ?)`,
    [task.id, project.id, task.title, task.description, task.kind, task.role, task.status, task.priority, task.acceptance, now, now],
  );
  return { project, task };
}

// ---------------------------------------------------------------------------------------------------------------
// Fake ModelClient
// ---------------------------------------------------------------------------------------------------------------

export interface FakeResponse {
  content?: string;
  toolCalls?: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string | null;
  /** Override capability of the answering model for this response. */
  supportsTools?: boolean;
}

export type ScriptItem = FakeResponse | Error | ((input: ModelChatInput) => FakeResponse | Error | Promise<FakeResponse | Error>);

export function resolvedModel(opts: { supportsTools?: boolean; contextLength?: number | null; modelId?: string; type?: 'ollama' | 'openai_compatible' } = {}): ResolvedModel {
  const now = Date.now();
  const type = opts.type ?? 'ollama';
  return {
    ref: { providerId: type === 'ollama' ? 'ollama-local' : 'cloud', modelId: opts.modelId ?? 'qwen2.5-coder:7b' },
    info: null,
    provider: {
      id: type === 'ollama' ? 'ollama-local' : 'cloud',
      type,
      name: 'Test',
      baseUrl: 'http://127.0.0.1:11434',
      enabled: true,
      paid: false,
      approved: true,
      hasApiKey: false,
      options: {},
      createdAt: now,
      updatedAt: now,
    },
    paid: false,
    local: true,
    supportsTools: opts.supportsTools ?? true,
    contextLength: opts.contextLength === undefined ? 32768 : opts.contextLength,
  };
}

export interface FakeModels {
  models: ModelClient;
  /** Deep copies of every chat input. */
  calls: ModelChatInput[];
  resolveCalls: Array<{ role: string; preferred: unknown }>;
  /** Items still in the script. */
  remaining(): number;
  push(...items: ScriptItem[]): void;
  setResolveError(e: Error | null): void;
  /** Changes the tool capability of the (default) model for later calls. */
  setSupportsTools(v: boolean): void;
}

export function fakeModels(opts: { supportsTools?: boolean; contextLength?: number | null; script?: ScriptItem[]; type?: 'ollama' | 'openai_compatible' } = {}): FakeModels {
  const script: ScriptItem[] = [...(opts.script ?? [])];
  const calls: ModelChatInput[] = [];
  const resolveCalls: Array<{ role: string; preferred: unknown }> = [];
  let resolveError: Error | null = null;
  let seq = 0;
  let supportsTools = opts.supportsTools;
  const base = () => resolvedModel({ supportsTools, contextLength: opts.contextLength, type: opts.type });
  const models: ModelClient = {
    async resolve(role, o) {
      resolveCalls.push({ role, preferred: o?.preferred ?? null });
      if (resolveError) throw resolveError;
      return base();
    },
    async chat(input): Promise<ModelChatResult> {
      calls.push({ ...input, signal: undefined, messages: JSON.parse(JSON.stringify(input.messages)), tools: input.tools ? JSON.parse(JSON.stringify(input.tools)) : undefined });
      const item = script.shift();
      if (item === undefined) throw new Error('fake model: script exhausted');
      const value = typeof item === 'function' ? await item(input) : item;
      if (value instanceof Error) throw value;
      const toolCalls: ChatToolCall[] = (value.toolCalls ?? []).map((c) => ({ id: c.id ?? `fc_${++seq}`, name: c.name, arguments: c.arguments }));
      const resolved = base();
      if (value.supportsTools !== undefined) resolved.supportsTools = value.supportsTools;
      return {
        content: value.content ?? '',
        toolCalls,
        usage: { inputTokens: value.inputTokens ?? 100, outputTokens: value.outputTokens ?? 20, usageReported: true },
        durationMs: 5,
        model: resolved.ref.modelId,
        finishReason: value.finishReason ?? (toolCalls.length ? 'tool_calls' : 'stop'),
        resolved,
      };
    },
  };
  return {
    models,
    calls,
    resolveCalls,
    remaining: () => script.length,
    push: (...items) => script.push(...items),
    setResolveError: (e) => {
      resolveError = e;
    },
    setSupportsTools: (v) => {
      supportsTools = v;
    },
  };
}

export const tc = (name: string, args: Record<string, unknown> = {}): FakeResponse => ({ toolCalls: [{ name, arguments: args }] });
export const text = (content: string, finishReason: string | null = 'stop'): FakeResponse => ({ content, finishReason });

// ---------------------------------------------------------------------------------------------------------------
// Fake tools
// ---------------------------------------------------------------------------------------------------------------

export interface FakeToolDef {
  name: string;
  readOnly: boolean;
  schema?: z.ZodType;
  describe?: (p: Record<string, unknown>) => string;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => ToolResult | Promise<ToolResult>;
}

export interface FakeTools {
  tools: ToolRegistry;
  executed: Array<{ name: string; args: Record<string, unknown>; taskId: string; runId: string }>;
}

export function fakeTools(defs: FakeToolDef[]): FakeTools {
  const executed: FakeTools['executed'] = [];
  const map = new Map<string, AgentTool>();
  for (const d of defs) {
    const schema = d.schema ?? z.object({}).passthrough();
    map.set(d.name, {
      name: d.name,
      description: `Fake tool ${d.name}.`,
      schema,
      readOnly: d.readOnly,
      describe: (p: Record<string, unknown>) => (d.describe ? d.describe(p) : `Führt ${d.name} aus`),
      execute: async (p: Record<string, unknown>, ctx: ToolContext) => d.execute(p, ctx),
    });
  }
  const tools: ToolRegistry = {
    register(tool) {
      map.set(tool.name, tool);
    },
    get: (name) => map.get(name) ?? null,
    names: () => [...map.keys()],
    specs(names): ChatToolSpec[] {
      return names
        .map((n) => map.get(n))
        .filter((t): t is AgentTool => !!t)
        .map((t) => {
          const parameters = z.toJSONSchema(t.schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
          delete parameters.$schema;
          return { name: t.name, description: t.description, parameters };
        });
    },
    async execute(name, args, ctx) {
      const t = map.get(name);
      if (!t) return { status: 'error', content: `Unbekanntes Werkzeug ${name}` };
      const parsed = t.schema.safeParse(args);
      if (!parsed.success) return { status: 'error', content: 'Ungültige Argumente' };
      executed.push({ name, args: parsed.data as Record<string, unknown>, taskId: ctx.task.id, runId: ctx.runId });
      return t.execute(parsed.data, ctx);
    },
  };
  return { tools, executed };
}

/** Standard tools: list_files/read_file (readOnly), write_file/run_checks/run_command (side effects). */
export function standardTools(overrides: Partial<Record<string, FakeToolDef['execute']>> = {}): FakeTools {
  return fakeTools([
    { name: 'list_files', readOnly: true, schema: z.object({ path: z.string().default('.'), depth: z.number().optional() }), describe: (p) => `Listet Dateien in ${String(p.path)}`, execute: overrides.list_files ?? (() => ({ status: 'ok', content: 'src/\nsrc/game.js\npackage.json' })) },
    { name: 'read_file', readOnly: true, schema: z.object({ path: z.string() }), describe: (p) => `Liest ${String(p.path)}`, execute: overrides.read_file ?? ((a) => ({ status: 'ok', content: `1| content of ${String(a.path)}` })) },
    {
      name: 'write_file',
      readOnly: false,
      schema: z.object({ path: z.string(), content: z.string() }),
      describe: (p) => `Schreibt ${String(p.path)}`,
      execute: overrides.write_file ?? ((a) => ({ status: 'ok', content: `Wrote ${String(a.path)}`, filesChanged: [String(a.path)] })),
    },
    { name: 'run_command', readOnly: false, schema: z.object({ command: z.string() }), describe: (p) => `Führt aus: ${String(p.command)}`, execute: overrides.run_command ?? (() => ({ status: 'ok', content: 'exit 0' })) },
    { name: 'run_checks', readOnly: false, schema: z.object({ kind: z.string() }), describe: (p) => `Startet Prüfung ${String(p.kind)}`, execute: overrides.run_checks ?? (() => ({ status: 'ok', content: 'passed: 3, failed: 0' })) },
    { name: 'git_diff', readOnly: true, schema: z.object({ path: z.string().optional() }), describe: () => 'Zeigt Änderungen', execute: overrides.git_diff ?? (() => ({ status: 'ok', content: 'diff --git a/x b/x' })) },
    {
      name: 'ask_user',
      readOnly: false,
      schema: z.object({ question: z.string(), options: z.array(z.string()).optional(), assumption: z.string().optional() }),
      describe: (p) => `Fragt nach: ${String(p.question)}`,
      execute: overrides.ask_user ?? (() => ({ status: 'needs_input', noteId: 'note_1', content: 'Frage gestellt.' })),
    },
  ]);
}

// ---------------------------------------------------------------------------------------------------------------
// Fake tasks / memory
// ---------------------------------------------------------------------------------------------------------------

export interface FakeTasks {
  tasks: TaskService;
  notes: TaskNote[];
  addUserNote(taskId: string, text: string, kind?: TaskNote['kind']): TaskNote;
  consumed: Array<{ ids: string[]; runId: string }>;
}

export function fakeTasks(): FakeTasks {
  const notes: TaskNote[] = [];
  const consumed: FakeTasks['consumed'] = [];
  const notProvided = (m: string) => () => {
    throw new Error(`tasks.${m} not provided in this test`);
  };
  const tasks = {
    pendingNotes: (taskId: string) => notes.filter((n) => n.taskId === taskId && n.consumedRunId === null && n.author === 'user'),
    markNotesConsumed: (ids: string[], runId: string) => {
      consumed.push({ ids, runId });
      for (const n of notes) if (ids.includes(n.id)) n.consumedRunId = runId;
    },
    list: notProvided('list'),
    get: notProvided('get'),
    require: notProvided('require'),
    create: notProvided('create'),
    update: notProvided('update'),
    setPriority: notProvided('setPriority'),
    delete: notProvided('delete'),
    patch: notProvided('patch'),
    addFiles: notProvided('addFiles'),
    ready: notProvided('ready'),
    counts: notProvided('counts'),
    notes: notProvided('notes'),
    addNote: notProvided('addNote'),
  } as unknown as TaskService;
  return {
    tasks,
    notes,
    consumed,
    addUserNote(taskId, text, kind = 'note') {
      const n: TaskNote = { id: newId('chk'), taskId, projectId: 'p', author: 'user', kind, text, options: [], assumption: null, createdAt: Date.now(), consumedRunId: null };
      notes.push(n);
      return n;
    },
  };
}

export function fakeMemory(entries: MemoryEntry[] = []): MemoryService {
  return {
    contextFor: () => entries,
  } as unknown as MemoryService;
}

export function novaError(code: string, message: string, details?: unknown): NovaError {
  return new NovaError(code, message, { details });
}

/** Controllable promise for tools that must block until the test releases them. */
export function deferred<T>(): { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
