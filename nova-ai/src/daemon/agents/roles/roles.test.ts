import { describe, it, expect } from 'vitest';
import type { MemoryEntry, Project, Task } from '@shared/schemas';
import { builtinRoles, createCoderRole, createPlannerRole, createReviewerRole, createTesterRole } from './index';
import { finishToolSpec } from './common';
import { defaultConfig } from '../test-fixtures';

const now = 1_700_000_000_000;
const project: Project = {
  id: 'prj_1',
  name: 'Snake',
  description: 'Ein Browserspiel.',
  path: 'C:\\Projekte\\Snake',
  kind: 'web',
  technologies: ['javascript'],
  status: 'active',
  templateId: 'web-game',
  origin: 'new',
  config: defaultConfig(),
  workState: 'running',
  gitAvailable: true,
  createdAt: now,
  updatedAt: now,
};
const task: Task = {
  id: 'task_1',
  projectId: 'prj_1',
  parentId: null,
  title: 'Steuerung einbauen',
  description: 'Die Schlange soll mit den Pfeiltasten gesteuert werden.',
  kind: 'code',
  role: 'coder',
  status: 'running',
  priority: 1,
  dependsOn: [],
  attempts: 1,
  maxAttempts: 3,
  blocker: null,
  blockerCode: null,
  result: null,
  acceptance: 'Pfeiltasten ändern die Richtung.',
  verification: { status: 'not_run', checks: [] },
  files: [],
  plannedFiles: ['src/input.js'],
  startRequested: false,
  model: null,
  source: 'planner',
  createdAt: now,
  updatedAt: now,
  startedAt: now,
  finishedAt: null,
};
const memory: MemoryEntry[] = [
  { id: 'm1', projectId: 'prj_1', kind: 'convention', title: 'Module', content: 'Nur ES-Module verwenden.', tags: [], source: 'user', shareable: false, taskId: null, createdAt: now, updatedAt: now },
];

describe('built-in role modules', () => {
  it('use the authoritative tool table and distinct finish tools', () => {
    const roles = Object.fromEntries(builtinRoles().map((r) => [r.info.role, r]));
    expect(roles.planner.toolNames).toEqual(['list_files', 'read_file', 'search_files', 'memory_search', 'memory_note', 'ask_user']);
    expect(roles.coder.toolNames).toEqual(['list_files', 'read_file', 'search_files', 'write_file', 'edit_file', 'delete_file', 'run_command', 'run_checks', 'git_diff', 'memory_search', 'memory_note', 'ask_user', 'generate_3d_model']);
    expect(roles.tester.toolNames).toEqual(['list_files', 'read_file', 'search_files', 'write_file', 'edit_file', 'run_command', 'run_checks', 'git_diff', 'memory_search', 'memory_note', 'ask_user']);
    expect(roles.reviewer.toolNames).toEqual(['list_files', 'read_file', 'search_files', 'git_diff', 'run_checks', 'memory_search', 'memory_note']);
    expect(roles.planner.finishTool.name).toBe('submit_plan');
    expect(roles.coder.finishTool.name).toBe('finish');
    expect(roles.tester.finishTool.name).toBe('finish');
    expect(roles.reviewer.finishTool.name).toBe('submit_review');
    for (const r of Object.values(roles)) {
      const spec = finishToolSpec(r.finishTool);
      expect(spec.parameters.type).toBe('object');
      expect(spec.parameters.$schema).toBeUndefined();
    }
  });

  it('build prompts with project facts, task, memory, extra context and the rules', () => {
    for (const role of builtinRoles()) {
      const p = role.systemPrompt({ project, task, memory, platform: 'win32', extraContext: 'Vorheriger Versuch: Test X schlug fehl.' });
      expect(p).toContain('Operating system: Windows');
      if (role.toolNames.includes('run_command')) {
        expect(p).toContain('cmd.exe');
        expect(p).toContain('use the file tools');
      } else {
        expect(p).not.toContain('run_command executes');
      }
      expect(p).toContain('C:\\Projekte\\Snake');
      expect(p).toContain('npm test');
      expect(p).toContain('Use ES modules.');
      expect(p).toContain('Steuerung einbauen');
      expect(p).toContain('Pfeiltasten ändern die Richtung.');
      expect(p).toContain('src/input.js');
      expect(p).toContain('Nur ES-Module verwenden.');
      expect(p).toContain('Vorheriger Versuch');
      expect(p).toContain('attempt 2 of 3');
      expect(p).toContain('German');
      expect(p).toContain('Never invent results');
      expect(p).toContain(role.finishTool.name);
      expect(p).not.toContain('JSON protocol');
    }
    const linux = createCoderRole().systemPrompt({ project, task, memory: [], platform: 'linux' });
    expect(linux).toContain('/bin/sh');
    expect(linux).not.toContain('cmd.exe');
  });

  it('lists tools with JSON schemas in JSON-protocol mode', () => {
    const coder = createCoderRole();
    const p = coder.systemPrompt({
      project,
      task,
      memory: [],
      platform: 'win32',
      toolsInPrompt: [{ name: 'read_file', description: 'Read a file.', parameters: { type: 'object', properties: { path: { type: 'string' } } } }, finishToolSpec(coder.finishTool)],
    });
    expect(p).toContain('## Tools (JSON protocol)');
    expect(p).toContain('{"tool": "<tool name>", "arguments": { ... }}');
    expect(p).toContain('### read_file');
    expect(p).toContain('"path":{"type":"string"}');
    expect(p).toContain('### finish');
  });

  it('planner: role-specific instructions and plan validation', () => {
    const planner = createPlannerRole();
    const p = planner.systemPrompt({ project, task: { ...task, kind: 'plan', role: 'planner' }, memory: [], platform: 'win32' });
    expect(p).toContain('at most 15');
    expect(p).toContain('Annahme:');
    expect(p).toContain('ask_user only for decisive choices');
    expect(p).toContain('list_files');

    const ok = planner.parseOutput({
      summary: 'Plan',
      tasks: [
        { key: 't1', title: 'A', description: 'a', role: 'coder', dependsOn: null, priority: '2', files: 'src/a.js' },
        { title: 'B', description: 'b', kind: 'test', dependsOn: 't1', acceptance: 'Tests grün' },
      ],
    });
    expect(ok.role).toBe('planner');
    if (ok.role !== 'planner') return;
    expect(ok.plan.tasks[0]).toMatchObject({ key: 't1', kind: 'code', priority: 2, dependsOn: [], files: ['src/a.js'] });
    expect(ok.plan.tasks[1]).toMatchObject({ key: 't2', role: 'tester', dependsOn: ['t1'] });

    expect(() => planner.parseOutput({ summary: 'x', tasks: Array.from({ length: 16 }, (_, i) => ({ key: `k${i}`, title: 'T', description: '', role: 'coder', kind: 'code' })) })).toThrow(/15/);
    expect(() =>
      planner.parseOutput({
        summary: 'x',
        tasks: [
          { key: 'a', title: 'A', description: '', role: 'coder', kind: 'code', dependsOn: ['b'] },
          { key: 'b', title: 'B', description: '', role: 'coder', kind: 'code', dependsOn: ['a'] },
        ],
      }),
    ).toThrow(/cycle/);
    expect(() => planner.parseOutput({ summary: 'x', tasks: [{ key: 'a', title: 'A', description: '', role: 'coder', kind: 'code', dependsOn: ['zz'] }] })).toThrow(/no task with this key/);
    expect(() => planner.parseOutput({ summary: 'x', tasks: [{ key: 'a', title: 'A', description: '', role: 'coder', kind: 'code', dependsOn: ['a'] }] })).toThrow(/itself/);
    expect(() => planner.parseOutput('nope')).toThrow(/JSON object/);
    expect(planner.checkFinish!(ok, { toolsUsed: [] })).toMatch(/not inspected/);
    expect(planner.checkFinish!(ok, { toolsUsed: ['list_files'] })).toBeNull();
  });

  it('coder: validates blocked results', () => {
    const coder = createCoderRole();
    expect(coder.parseOutput({ summary: 'Fertig', status: null })).toEqual({ role: 'coder', result: { summary: 'Fertig', status: 'done', blocker: null, notes: null } });
    expect(() => coder.parseOutput({ summary: 'x', status: 'blocked' })).toThrow(/blocker/);
    expect(() => coder.parseOutput({ summary: ' ' })).toThrow(/summary/);
    const p = coder.systemPrompt({ project, task, memory: [], platform: 'win32' });
    expect(p).toContain('Inspect before you edit');
    expect(p).toContain('run_checks');
    expect(p).toContain('status "blocked"');
  });

  it('tester: honesty gate and normalisation', () => {
    const tester = createTesterRole();
    const out = tester.parseOutput({ summary: '3 von 3 grün', passed: 'true', failures: 'none?', fixed: null });
    expect(out).toEqual({ role: 'tester', result: { summary: '3 von 3 grün', passed: true, failures: ['none?'], fixed: false } });
    expect(tester.checkFinish!(out, { toolsUsed: ['read_file'] })).toMatch(/have not run any tests/);
    expect(tester.checkFinish!(out, { toolsUsed: ['run_checks'] })).toBeNull();
    const none = tester.parseOutput({ summary: 'Kein Testbefehl.', passed: null });
    expect(tester.checkFinish!(none, { toolsUsed: [] })).toBeNull();
    expect(tester.systemPrompt({ project, task, memory: [], platform: 'win32' })).toContain('Never report passed: true');
  });

  it('reviewer: findings normalisation and verdict consistency', () => {
    const reviewer = createReviewerRole();
    const out = reviewer.parseOutput({ verdict: 'Changes_Requested', summary: 'Probleme gefunden.', findings: [{ severity: 'HIGH', file: '', line: '12', message: 'Fehler' }, 'Kleinigkeit'] });
    expect(out).toEqual({
      role: 'reviewer',
      review: {
        verdict: 'changes_requested',
        summary: 'Probleme gefunden.',
        findings: [
          { severity: 'major', file: null, line: 12, message: 'Fehler' },
          { severity: 'minor', file: null, line: null, message: 'Kleinigkeit' },
        ],
      },
    });
    expect(() => reviewer.parseOutput({ verdict: 'approve', summary: 'ok', findings: [{ severity: 'critical', message: 'x' }] })).toThrow(/contradicts/);
    expect(reviewer.checkFinish!(out, { toolsUsed: [] })).toMatch(/not looked/);
    expect(reviewer.checkFinish!(out, { toolsUsed: ['git_diff'] })).toBeNull();
    const p = reviewer.systemPrompt({ project, task, memory: [], platform: 'win32' });
    for (const word of ['Correctness', 'Security', 'Incomplete work', 'Regressions']) expect(p).toContain(word);
  });
});
