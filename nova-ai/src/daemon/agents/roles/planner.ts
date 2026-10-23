// Planner role module: inspects the project and breaks a goal into at most 15 small, verifiable tasks.
// Key decisions:
// - Tools per SPEC §6.3 table; finish tool `submit_plan` → PlanOutputSchema.
// - Minor unknowns become memory entries of kind "decision" whose title starts with "Annahme:" (the memory_note tool
//   and PlanOutput.memory carry no tags, so the marker lives in the title – see contract change request in the
//   module report); ask_user only for decisive choices (SPEC §6.4).
// - parseOutput normalises common slips (missing kind/role/key, null defaults, single strings) and then checks plan
//   integrity: unique keys, known dependencies, no self-dependency, no cycles, ≤ 15 tasks.
// - checkFinish requires at least one inspection tool call (list_files/read_file/search_files) before planning.
import { PlanOutputSchema, type AgentOutput } from '../../contracts';
import {
  buildRolePrompt,
  dropNullKeys,
  formatIssues,
  isRecord,
  lowerCase,
  requireRecord,
  toNumber,
  toStringArray,
  usedAny,
  type NovaRoleModule,
} from './common';

export const PLANNER_TOOLS = ['list_files', 'read_file', 'search_files', 'memory_search', 'memory_note', 'ask_user'];
const FINISH = 'submit_plan';

const KIND_FOR_ROLE: Record<string, string> = { coder: 'code', tester: 'test', reviewer: 'review' };
const ROLE_FOR_KIND: Record<string, string> = { code: 'coder', fix: 'coder', build: 'coder', custom: 'coder', test: 'tester', review: 'reviewer' };

function normalizePlan(data: unknown): Record<string, unknown> {
  const plan = requireRecord(data, FINISH);
  dropNullKeys(plan, ['memory']);
  if (isRecord(plan.plan) && !Array.isArray(plan.tasks)) Object.assign(plan, plan.plan); // {plan:{...}} wrapper
  if (Array.isArray(plan.tasks)) {
    plan.tasks = plan.tasks.map((raw, i) => {
      if (!isRecord(raw)) return raw;
      const t = { ...raw };
      dropNullKeys(t, ['dependsOn', 'priority', 'files', 'key']);
      if (t.depends_on !== undefined && t.dependsOn === undefined) t.dependsOn = t.depends_on;
      delete t.depends_on;
      lowerCase(t, 'role');
      lowerCase(t, 'kind');
      if (typeof t.key === 'number') t.key = String(t.key);
      if (t.key === undefined || t.key === '') t.key = `t${i + 1}`;
      if (t.kind === undefined && typeof t.role === 'string' && KIND_FOR_ROLE[t.role]) t.kind = KIND_FOR_ROLE[t.role];
      if (t.role === undefined && typeof t.kind === 'string' && ROLE_FOR_KIND[t.kind]) t.role = ROLE_FOR_KIND[t.kind];
      toStringArray(t, 'dependsOn', true);
      toStringArray(t, 'files', true);
      if (Array.isArray(t.dependsOn)) t.dependsOn = t.dependsOn.map((d) => (typeof d === 'number' ? String(d) : d));
      toNumber(t, 'priority');
      return t;
    });
  }
  if (Array.isArray(plan.memory)) {
    plan.memory = plan.memory.map((m) => {
      if (!isRecord(m)) return m;
      const e = { ...m };
      lowerCase(e, 'kind');
      return e;
    });
  }
  return plan;
}

function planProblems(tasks: { key: string; dependsOn: string[] }[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const t of tasks) {
    if (keys.has(t.key)) problems.push(`The task key "${t.key}" is used twice; every key must be unique.`);
    keys.add(t.key);
  }
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (d === t.key) problems.push(`Task "${t.key}" depends on itself.`);
      else if (!keys.has(d)) problems.push(`Task "${t.key}" depends on "${d}", but there is no task with this key.`);
    }
  }
  // Cycle detection (depth-first search).
  const graph = new Map(tasks.map((t) => [t.key, t.dependsOn.filter((d) => d !== t.key && keys.has(d))]));
  const state = new Map<string, 1 | 2>();
  const visit = (key: string, path: string[]): string[] | null => {
    const st = state.get(key);
    if (st === 2) return null;
    if (st === 1) return [...path.slice(path.indexOf(key)), key];
    state.set(key, 1);
    for (const d of graph.get(key) ?? []) {
      const cycle = visit(d, [...path, key]);
      if (cycle) return cycle;
    }
    state.set(key, 2);
    return null;
  };
  for (const key of graph.keys()) {
    const cycle = visit(key, []);
    if (cycle) {
      problems.push(`The dependencies form a cycle: ${cycle.join(' -> ')}. Remove one dependency.`);
      break;
    }
  }
  return problems;
}

export function createPlannerRole(): NovaRoleModule {
  const finishTool = {
    name: FINISH,
    description:
      'Submit the finished plan. Call this exactly once after you inspected the project. summary: German summary of the plan. tasks: at most 15 small tasks (key, title, description, role, kind, dependsOn, priority, acceptance, files). memory: goals, requirements and decisions worth remembering (German).',
    schema: PlanOutputSchema,
  };
  return {
    info: {
      role: 'planner',
      name: 'Planungsagent',
      description: 'Untersucht das Projekt, zerlegt Ziele in kleine prüfbare Aufgaben mit Abhängigkeiten und hält Entscheidungen im Gedächtnis fest.',
      tools: [...PLANNER_TOOLS, FINISH],
      moduleId: 'nova.planner@1',
    },
    finishTool,
    toolNames: PLANNER_TOOLS,
    systemPrompt(ctx) {
      return buildRolePrompt(ctx, {
        intro:
          'You are the planning agent of NOVA AI, an autonomous software studio on the user\'s PC. You turn the goal in "Your task" into a short list of small, verifiable tasks for other agents (coder, tester, reviewer). You do not write code and you do not change files.',
        steps: [
          'Inspect the project first: call list_files with {"path": ".", "depth": 2}. Then read the README, the package or project files (for example package.json, *.csproj, ProjectSettings) and the main source files with read_file.',
          'Use memory_search to find earlier goals and decisions of this project.',
          'Understand the goal and what already exists. Plan only what is still missing.',
          'For minor unknowns choose sensible defaults yourself. Record each assumption with memory_note {"kind": "decision", "title": "Annahme: <short German title>", "content": "<German explanation>"} or in the "memory" list of submit_plan.',
          'Use ask_user only for decisive choices that change the whole plan (for example which engine or which platform), and say which option you recommend.',
          'Split the goal into at most 15 small tasks. Each task must be doable by one agent in one session and must be checkable.',
          'For every task give: key (short id such as "t1"), title (German), description (German, concrete: what to build and in which files), role ("coder", "tester" or "reviewer"), kind ("code", "test", "fix", "review", "build" or "custom"), dependsOn (keys of tasks that must be finished first), priority (0 low – 3 critical), acceptance (German, testable criteria), files (expected project-relative files).',
          'Order the work: foundations first, then features, then tests and integration. Two tasks that change the same files need a dependency between them.',
          `Call ${FINISH} with a German summary, the tasks and the memory entries (goals, requirements, decisions).`,
        ],
        examples: [
          ['list_files', { path: '.', depth: 2 }],
          ['read_file', { path: 'package.json' }],
          ['memory_note', { kind: 'decision', title: 'Annahme: Steuerung mit Pfeiltasten', content: 'Das Spiel wird mit den Pfeiltasten gesteuert, weil keine Vorgabe gemacht wurde.' }],
          [
            FINISH,
            {
              summary: 'Das Spiel wird in drei Schritten gebaut: Spielfeld, Steuerung, Tests.',
              tasks: [
                {
                  key: 't1',
                  title: 'Spielfeld zeichnen',
                  description: 'In src/game.js ein 20×20-Raster auf das Canvas zeichnen.',
                  role: 'coder',
                  kind: 'code',
                  dependsOn: [],
                  priority: 2,
                  acceptance: 'Beim Öffnen von index.html ist das Raster sichtbar.',
                  files: ['src/game.js'],
                },
                {
                  key: 't2',
                  title: 'Tests für das Spielfeld',
                  description: 'Unit-Tests für die Rasterberechnung in tests/game.test.mjs schreiben.',
                  role: 'tester',
                  kind: 'test',
                  dependsOn: ['t1'],
                  priority: 1,
                  acceptance: 'npm test läuft erfolgreich.',
                  files: ['tests/game.test.mjs'],
                },
              ],
              memory: [{ kind: 'goal', title: 'Spielziel', content: 'Ein einfaches Schlangenspiel im Browser.' }],
            },
          ],
        ],
        rules: [
          'Do not create, change or delete files. You only plan.',
          'At most 15 tasks. Prefer fewer, well-defined tasks over many vague ones.',
          'Every task needs testable acceptance criteria. Where the project can run tests, plan a test task.',
        ],
        finishName: FINISH,
        canRunCommands: false,
        blockedHint: `If the goal cannot be planned (for example the project folder is unusable), call ${FINISH} with an empty task list and explain the reason in German in the summary.`,
      });
    },
    parseOutput(data): AgentOutput {
      const normalized = normalizePlan(data);
      const parsed = PlanOutputSchema.safeParse(normalized);
      if (!parsed.success) {
        throw new Error(`${formatIssues(parsed.error)}. Remember: at most 15 tasks; every task needs key, title, description, role, kind.`);
      }
      const plan = parsed.data;
      if (!plan.summary.trim()) throw new Error('summary must not be empty: write a short German summary of the plan.');
      const problems = planProblems(plan.tasks);
      if (problems.length > 0) throw new Error(problems.join(' '));
      return { role: 'planner', plan };
    },
    checkFinish(_output, ctx) {
      if (!usedAny(ctx.toolsUsed, ['list_files', 'read_file', 'search_files'])) {
        return 'You have not inspected the project yet. First call list_files {"path": ".", "depth": 2} and read the important files, then call submit_plan again.';
      }
      return null;
    },
  };
}
