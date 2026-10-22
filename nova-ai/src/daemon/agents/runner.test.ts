import { describe, it, expect, afterEach } from 'vitest';
import type { AgentRole, Project, Task } from '@shared/schemas';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { makeServices } from '../../../tests/helpers/services';
import type { AgentRunInput, ChatMessage, Services } from '../contracts';
import { NovaError } from '../core/errors';
import { createRunStore } from './run-store';
import { createAgentRunner, INTERRUPTED_TOOL_TEXT } from './runner';
import type { RunState } from './state';
import {
  deferred,
  fakeMemory,
  fakeModels,
  fakeTasks,
  insertProjectAndTask,
  novaError,
  standardTools,
  tc,
  text,
  type FakeModels,
  type FakeTasks,
  type FakeTools,
} from './test-fixtures';

let t: TestCore | null = null;
afterEach(() => {
  t?.cleanup();
  t = null;
});

interface Harness {
  s: Services;
  project: Project;
  task: Task;
  fm: FakeModels;
  ft: FakeTools;
  tasks: FakeTasks;
  slept: number[];
  input(extra?: Partial<AgentRunInput>): AgentRunInput;
}

function setup(opts: { fm?: FakeModels; ft?: FakeTools; taskOverrides?: Partial<Task>; delays?: number[]; platform?: NodeJS.Platform } = {}): Harness {
  t = createTestCore();
  const { project, task } = insertProjectAndTask(t.core, opts.taskOverrides);
  const fm = opts.fm ?? fakeModels();
  const ft = opts.ft ?? standardTools();
  const tasks = fakeTasks();
  const slept: number[] = [];
  const s = makeServices(t.core, {
    models: fm.models,
    tools: ft.tools,
    tasks: tasks.tasks,
    memory: fakeMemory([
      { id: 'mem_1', projectId: project.id, kind: 'decision', title: 'Annahme: Canvas', content: 'Das Spiel nutzt ein Canvas.', tags: [], source: 'agent', shareable: false, taskId: null, createdAt: 1, updatedAt: 1 },
    ]),
  });
  s.runs = createRunStore(s);
  s.agents = createAgentRunner(s, {
    retryDelaysMs: opts.delays ?? [0, 0, 0],
    sleep: async (ms) => {
      slept.push(ms);
    },
    platform: opts.platform ?? 'win32',
  });
  return {
    s,
    project,
    task,
    fm,
    ft,
    tasks,
    slept,
    input: (extra = {}) => ({ task, project, signal: new AbortController().signal, pauseRequested: () => false, ...extra }),
  };
}

const finishCoder = (summary = 'Der Punktestand wird angezeigt. Alle Tests laufen.') => tc('finish', { summary, status: 'done', blocker: null, notes: null });
const lastMessages = (fm: FakeModels): ChatMessage[] => fm.calls[fm.calls.length - 1].messages;
const toolMessages = (msgs: ChatMessage[]) => msgs.filter((m): m is Extract<ChatMessage, { role: 'tool' }> => m.role === 'tool');

describe('AgentRunner – native tool loop', () => {
  it('runs tools until the finish tool and records steps, files, tokens and events', async () => {
    const fm = fakeModels({
      script: [
        tc('list_files', { path: '.' }),
        tc('read_file', { path: 'src/game.js' }),
        tc('write_file', { path: 'src/score.js', content: 'export const score = 0;\n' }),
        tc('run_checks', { kind: 'test' }),
        finishCoder(),
      ],
    });
    const h = setup({ fm });
    const updates: string[] = [];
    const steps: string[] = [];
    t!.core.bus.on('run.updated', (r) => updates.push(r.status));
    t!.core.bus.on('run.step', (st) => steps.push(st.kind));

    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    if (out.status !== 'done') return;
    expect(out.output.role).toBe('coder');
    expect(out.summary).toContain('Punktestand');
    expect(out.files).toEqual(['src/score.js']);

    const run = h.s.runs.get(out.runId)!;
    expect(run.status).toBe('done');
    expect(run.stepCount).toBe(5);
    expect(run.inputTokens).toBe(500);
    expect(run.outputTokens).toBe(100);
    expect(run.files).toEqual(['src/score.js']);
    expect(run.lastAction).toBe('Abgeschlossen');
    expect(run.endedAt).not.toBeNull();
    expect(run.providerId).toBe('ollama-local');
    expect(run.modelId).toBe('qwen2.5-coder:7b');
    expect(h.ft.executed.map((e) => e.name)).toEqual(['list_files', 'read_file', 'write_file', 'run_checks']);
    expect(h.ft.executed[0].taskId).toBe(h.task.id);

    // Native mode: tool specs incl. finish tool, tool results as role 'tool'.
    const first = h.fm.calls[0];
    expect(first.json).toBeUndefined();
    expect(first.tools?.map((x) => x.name)).toEqual(expect.arrayContaining(['list_files', 'read_file', 'write_file', 'finish']));
    const finishSpec = first.tools!.find((x) => x.name === 'finish')!;
    expect(finishSpec.parameters.$schema).toBeUndefined();
    expect((finishSpec.parameters.required as string[]) ?? []).toContain('summary');
    expect(toolMessages(lastMessages(h.fm))).toHaveLength(4);

    // System prompt facts.
    const system = first.messages[0];
    expect(system.role).toBe('system');
    expect(system.content).toContain('cmd.exe');
    expect(system.content).toContain('npm test');
    expect(system.content).toContain('Der Punktestand ist sichtbar.');
    expect(system.content).toContain('src/score.js');
    expect(system.content).toContain('Annahme: Canvas');
    expect(system.content).toContain('German');
    expect(first.messages[1].role).toBe('user');

    const stepRows = h.s.runs.steps(out.runId);
    expect(stepRows.some((st) => st.kind === 'tool_call' && st.summary === 'Liest src/game.js')).toBe(true);
    expect(stepRows.some((st) => st.kind === 'model_call' && /Eingabe-/.test(st.summary))).toBe(true);
    expect(stepRows.some((st) => st.kind === 'tool_result' && st.summary.includes('erledigt'))).toBe(true);
    expect(stepRows.some((st) => st.kind === 'message' && st.summary.startsWith('Ergebnis:'))).toBe(true);
    expect(updates[0]).toBe('running');
    expect(updates[updates.length - 1]).toBe('done');
    expect(steps).toContain('tool_call');
    expect(h.fm.remaining()).toBe(0);
  });

  it('rejects tools outside the role and invalid arguments back to the model', async () => {
    const fm = fakeModels({
      script: [{ toolCalls: [{ name: 'submit_plan', arguments: {} }, { name: 'read_file', arguments: {} }] }, finishCoder()],
    });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    expect(h.ft.executed).toHaveLength(0);
    const tools = toolMessages(lastMessages(h.fm));
    expect(tools[0].content).toMatch(/not available for your role/);
    expect(tools[1].content).toMatch(/invalid arguments for read_file/);
    const errors = h.s.runs.steps(out.runId).filter((st) => st.kind === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('accepts a JSON tool call written as text in native mode and reminds on plain text answers', async () => {
    const fm = fakeModels({ script: [text('Ich schaue mir das an.'), text('{"name": "list_files", "arguments": {"path": "."}}'), finishCoder()] });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    expect(h.ft.executed.map((e) => e.name)).toEqual(['list_files']);
    const msgs = lastMessages(h.fm);
    expect(msgs.some((m) => m.role === 'user' && m.content.includes('You answered without calling a tool'))).toBe(true);
  });

  it('fails with AGENT_BAD_OUTPUT after three reminders without tool calls', async () => {
    const fm = fakeModels({ script: [text('a'), text('b'), text('c'), text('d')] });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out).toMatchObject({ status: 'failed', code: 'AGENT_BAD_OUTPUT' });
    expect(h.fm.calls).toHaveLength(4);
    expect(h.s.runs.get(out.runId)!.errorCode).toBe('AGENT_BAD_OUTPUT');
  });
});

describe('AgentRunner – JSON protocol', () => {
  it('describes the tools in the system prompt and parses fenced / sloppy JSON answers', async () => {
    const fm = fakeModels({
      supportsTools: false,
      script: [
        text('Ich beginne.\n```json\n{"tool": "list_files", "arguments": {"path": "."}}\n```'),
        text('{"tool": "finish", "arguments": {"summary": "Fertig.", "status": "done",}}'),
      ],
    });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    const first = h.fm.calls[0];
    expect(first.tools).toBeUndefined();
    expect(first.json).toBe(true);
    expect(first.messages[0].content).toContain('## Tools (JSON protocol)');
    expect(first.messages[0].content).toContain('### list_files');
    expect(first.messages[0].content).toContain('### finish');
    const second = h.fm.calls[1].messages;
    expect(second.some((m) => m.role === 'tool')).toBe(false);
    expect(second.some((m) => m.role === 'user' && m.content.startsWith('[tool result: list_files]'))).toBe(true);
  });

  it('sends corrections and fails after three unparseable answers', async () => {
    const fm = fakeModels({ supportsTools: false, script: [text('Hallo'), text('{kaputt'), text('immer noch nicht')] });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out).toMatchObject({ status: 'failed', code: 'AGENT_BAD_OUTPUT' });
    const corrections = lastMessages(h.fm).filter((m) => m.role === 'user' && m.content.includes('not a valid tool call'));
    expect(corrections).toHaveLength(2);
  });

  it('switches to the JSON protocol when the answering model has no tool support', async () => {
    const fm = fakeModels({ script: [{ ...tc('list_files', { path: '.' }), supportsTools: false }, text('{"tool":"finish","arguments":{"summary":"Fertig.","status":"done"}}')] });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    const second = h.fm.calls[1];
    expect(second.tools).toBeUndefined();
    expect(second.json).toBe(true);
    expect(second.messages.some((m) => m.role === 'tool')).toBe(false);
    expect(second.messages[0].content).toContain('## Tools (JSON protocol)');
  });
});

describe('AgentRunner – protocol edge cases', () => {
  it('answers a JSON-protocol call pending approval in JSON format after resuming with a tool-capable model', async () => {
    let calls = 0;
    const ft = standardTools({
      run_command: () => {
        calls++;
        return calls === 1 ? { status: 'approval_required', approvalId: 'apr_j', content: 'Freigabe nötig' } : { status: 'ok', content: 'exit 0' };
      },
    });
    const fm = fakeModels({ supportsTools: false, script: [text('{"tool": "run_command", "arguments": {"command": "npm install"}}')] });
    const h = setup({ fm, ft });
    const first = await h.s.agents.run(h.input());
    expect(first.status).toBe('waiting_approval');

    fm.setSupportsTools(true);
    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    const last = h.fm.calls[h.fm.calls.length - 1];
    expect(last.tools?.some((x) => x.name === 'finish')).toBe(true);
    expect(last.messages.some((m) => m.role === 'tool')).toBe(false);
    expect(last.messages.some((m) => m.role === 'user' && m.content.startsWith('[tool result: run_command]\nexit 0'))).toBe(true);
    expect(last.messages[0].content).not.toContain('## Tools (JSON protocol)');
  });

  it('explains truncated answers to the model', async () => {
    const fm = fakeModels({
      script: [{ toolCalls: [{ name: 'write_file', arguments: { path: 'a.js' } }], finishReason: 'length' }, text('', 'length'), finishCoder()],
    });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    const msgs = lastMessages(h.fm);
    expect(toolMessages(msgs)[0].content).toMatch(/invalid arguments for write_file[\s\S]*cut off/);
    expect(msgs.some((m) => m.role === 'user' && m.content.startsWith('Your answer was cut off'))).toBe(true);
  });
});

describe('AgentRunner – finish handling', () => {
  it('asks for corrections of invalid finish data and accepts a blocked coder result', async () => {
    const fm = fakeModels({
      script: [
        tc('finish', { status: 'blocked' }),
        tc('finish', { summary: 'Geht nicht.', status: 'blocked', blocker: '' }),
        tc('finish', { summary: 'Geht nicht.', status: 'blocked', blocker: 'Kein Testbefehl vorhanden.' }),
      ],
    });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    if (out.status === 'done' && out.output.role === 'coder') expect(out.output.result.status).toBe('blocked');
    const errs = toolMessages(lastMessages(h.fm)).filter((m) => m.content.startsWith('Error: the data for finish'));
    expect(errs).toHaveLength(2);
  });

  it('fails after the third invalid finish call', async () => {
    const fm = fakeModels({ script: [tc('finish', {}), tc('finish', { status: 'x' }), tc('finish', { summary: '' })] });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input());
    expect(out).toMatchObject({ status: 'failed', code: 'AGENT_BAD_OUTPUT' });
  });

  it('applies the tester honesty gate (no reported result without running checks)', async () => {
    const fm = fakeModels({
      script: [
        tc('finish', { summary: 'Alles grün.', passed: true, failures: [], fixed: false }),
        tc('run_checks', { kind: 'test' }),
        tc('finish', { summary: '3 von 3 Tests laufen erfolgreich.', passed: true, failures: [], fixed: false }),
      ],
    });
    const h = setup({ fm, taskOverrides: { role: 'tester', kind: 'test' } });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    const msgs = toolMessages(lastMessages(h.fm));
    expect(msgs[0].content).toMatch(/have not run any tests/);
  });
});

describe('AgentRunner – approvals, questions, pause and notes', () => {
  it('waits for an approval and re-executes the pending tool call on resume', async () => {
    let calls = 0;
    const ft = standardTools({
      run_command: () => {
        calls++;
        return calls === 1 ? { status: 'approval_required', approvalId: 'apr_1', content: 'Freigabe nötig' } : { status: 'ok', content: 'exit 0' };
      },
    });
    const fm = fakeModels({ script: [tc('run_command', { command: 'npm install' })] });
    const h = setup({ fm, ft });
    const first = await h.s.agents.run(h.input());
    expect(first).toMatchObject({ status: 'waiting_approval', approvalId: 'apr_1' });
    const run = h.s.runs.get(first.runId)!;
    expect(run.status).toBe('waiting_approval');
    expect(run.pendingApprovalId).toBe('apr_1');
    expect(h.s.runs.list({ pendingApprovalId: 'apr_1' })).toHaveLength(1);
    const state = h.s.runs.loadState<RunState>(first.runId)!;
    expect(state.pending).toMatchObject({ kind: 'tool', approvalId: 'apr_1' });
    expect(state.queue).toHaveLength(1);
    expect(state.inFlight).toBeNull();
    expect(h.s.runs.steps(first.runId).some((st) => st.kind === 'approval')).toBe(true);

    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    expect(second.runId).toBe(first.runId);
    expect(calls).toBe(2);
    const msgs = lastMessages(h.fm);
    const assistant = msgs.find((m) => m.role === 'assistant' && m.toolCalls?.length) as Extract<ChatMessage, { role: 'assistant' }>;
    const result = toolMessages(msgs)[0];
    expect(result.toolCallId).toBe(assistant.toolCalls![0].id);
    expect(result.content).toBe('exit 0');
    expect(h.s.runs.get(first.runId)!.pendingApprovalId).toBeNull();
  });

  it('blocks with NEEDS_INPUT and delivers the answer as a user note on resume', async () => {
    const fm = fakeModels({ script: [tc('ask_user', { question: 'Welche Farbe soll die Schlange haben?', assumption: 'Grün' })] });
    const h = setup({ fm });
    const first = await h.s.agents.run(h.input());
    expect(first).toMatchObject({ status: 'blocked', code: 'NEEDS_INPUT' });
    const run = h.s.runs.get(first.runId)!;
    expect(run.errorCode).toBe('NEEDS_INPUT');
    expect(run.blocker).toContain('Welche Farbe');

    const note = h.tasks.addUserNote(h.task.id, 'Rot', 'answer');
    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    const msgs = lastMessages(h.fm);
    const idx = msgs.findIndex((m) => m.role === 'user' && m.content === 'Note from the user (answer to your question): Rot');
    expect(idx).toBeGreaterThan(0);
    expect(msgs[idx - 1].role).toBe('tool');
    expect(h.tasks.consumed).toEqual([{ ids: [note.id], runId: first.runId }]);
    expect(h.s.runs.get(first.runId)!.errorCode).toBeNull();
  });

  it('pauses between steps and tells the model about task edits on resume', async () => {
    let pause = false;
    const ft = standardTools({
      list_files: () => {
        pause = true;
        return { status: 'ok', content: 'src/' };
      },
    });
    const fm = fakeModels({ script: [tc('list_files', { path: '.' })] });
    const h = setup({ fm, ft });
    const first = await h.s.agents.run(h.input({ pauseRequested: () => pause }));
    expect(first.status).toBe('paused');
    expect(h.s.runs.get(first.runId)!.status).toBe('paused');

    const edited: Task = { ...h.task, title: 'Punktestand und Highscore anzeigen', acceptance: 'Highscore bleibt nach Neustart erhalten.' };
    h.fm.push(finishCoder());
    const second = await h.s.agents.run({ ...h.input({ resumeRunId: first.runId }), task: edited });
    expect(second.status).toBe('done');
    const msgs = lastMessages(h.fm);
    const editMsg = msgs.find((m) => m.role === 'user' && m.content.startsWith('The user edited this task while it was paused.'));
    expect(editMsg?.content).toContain('Punktestand und Highscore anzeigen');
    expect(editMsg?.content).toContain('Changed: title, acceptance criteria');
    expect(msgs[0].content).toContain('Highscore bleibt nach Neustart erhalten.');
    expect(h.s.runs.loadState<RunState>(first.runId)!.taskSnapshot.title).toBe('Punktestand und Highscore anzeigen');
  });

  it('injects user notes at the next step boundary and marks them consumed', async () => {
    let h!: Harness;
    const ft = standardTools({
      list_files: () => {
        h.tasks.addUserNote(h.task.id, 'Bitte keine externen Bibliotheken verwenden.');
        return { status: 'ok', content: 'src/' };
      },
    });
    const fm = fakeModels({ script: [tc('list_files', { path: '.' }), finishCoder()] });
    h = setup({ fm, ft });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    expect(h.fm.calls[1].messages.some((m) => m.role === 'user' && m.content === 'Note from the user: Bitte keine externen Bibliotheken verwenden.')).toBe(true);
    expect(h.tasks.consumed).toHaveLength(1);
    expect(h.tasks.consumed[0].runId).toBe(out.runId);
    expect(h.s.runs.steps(out.runId).some((st) => st.summary.startsWith('Hinweis des Benutzers'))).toBe(true);
  });

  it('starts a fresh run when the role changed and cancels the old run', async () => {
    let pause = false;
    const ft = standardTools({
      list_files: () => {
        pause = true;
        return { status: 'ok', content: 'src/' };
      },
    });
    const fm = fakeModels({ script: [tc('list_files', { path: '.' })] });
    const h = setup({ fm, ft });
    const first = await h.s.agents.run(h.input({ pauseRequested: () => pause }));
    expect(first.status).toBe('paused');
    h.fm.push(tc('git_diff', {}), tc('submit_review', { verdict: 'approve', summary: 'Sieht gut aus.', findings: [] }));
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId, role: 'reviewer' as AgentRole }));
    expect(second.status).toBe('done');
    expect(second.runId).not.toBe(first.runId);
    expect(h.s.runs.get(first.runId)!.status).toBe('cancelled');
    expect(h.s.runs.get(second.runId)!.role).toBe('reviewer');
    expect(h.s.runs.latestForTask(h.task.id, 'coder')!.id).toBe(first.runId);
    expect(h.s.runs.latestForTask(h.task.id)!.id).toBe(second.runId);
  });
});

describe('AgentRunner – interruption and cancellation', () => {
  it('does not re-run an interrupted non-readOnly tool and tells the model to inspect the state', async () => {
    const gate = deferred<void>();
    const ctrl = new AbortController();
    let writes = 0;
    const ft = standardTools({
      write_file: async () => {
        writes++;
        ctrl.abort(new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.'));
        await gate.promise;
        return { status: 'ok', content: 'Wrote file', filesChanged: ['src/a.js'] };
      },
    });
    const fm = fakeModels({ script: [tc('write_file', { path: 'src/a.js', content: 'x' })] });
    const h = setup({ fm, ft });
    const pending = h.s.agents.run(h.input({ signal: ctrl.signal }));
    gate.resolve();
    const first = await pending;
    expect(first.status).toBe('interrupted');
    const run = h.s.runs.get(first.runId)!;
    expect(run.status).toBe('interrupted');
    expect(run.endedAt).toBeNull();
    const state = h.s.runs.loadState<RunState>(first.runId)!;
    expect(state.inFlight).toMatchObject({ name: 'write_file', readOnly: false });

    // Simulate a crash afterwards: the row is "running" again, recovery marks it interrupted.
    h.s.runs.update(first.runId, { status: 'running' });
    expect(h.s.runs.markInterrupted().map((r) => r.id)).toEqual([first.runId]);

    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    expect(writes).toBe(1);
    const msgs = lastMessages(h.fm);
    const tool = toolMessages(msgs)[0];
    expect(tool.content).toBe(INTERRUPTED_TOOL_TEXT);
    expect(h.s.runs.steps(first.runId).some((st) => st.kind === 'error' && st.summary.includes('nicht wiederholt'))).toBe(true);
  });

  it('re-runs an interrupted readOnly tool on resume', async () => {
    const gate = deferred<void>();
    const ctrl = new AbortController();
    let reads = 0;
    const ft = standardTools({
      read_file: async () => {
        reads++;
        if (reads === 1) {
          ctrl.abort(new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.'));
          await gate.promise;
        }
        return { status: 'ok', content: 'file content' };
      },
    });
    const fm = fakeModels({ script: [tc('read_file', { path: 'src/game.js' })] });
    const h = setup({ fm, ft });
    const pending = h.s.agents.run(h.input({ signal: ctrl.signal }));
    gate.resolve();
    const first = await pending;
    expect(first.status).toBe('interrupted');
    expect(h.s.runs.loadState<RunState>(first.runId)!.inFlight).toMatchObject({ name: 'read_file', readOnly: true });

    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    expect(reads).toBe(2);
    expect(toolMessages(lastMessages(h.fm))[0].content).toBe('file content');
  });

  it('distinguishes cancel from interruption during a model call', async () => {
    const ctrlCancel = new AbortController();
    const fm = fakeModels({
      script: [
        () => {
          ctrlCancel.abort(new Error('Benutzer hat gestoppt'));
          return novaError('CANCELLED', 'abgebrochen');
        },
      ],
    });
    const h = setup({ fm });
    const cancelled = await h.s.agents.run(h.input({ signal: ctrlCancel.signal }));
    expect(cancelled.status).toBe('cancelled');
    const run = h.s.runs.get(cancelled.runId)!;
    expect(run.status).toBe('cancelled');
    expect(run.endedAt).not.toBeNull();

    const ctrlInt = new AbortController();
    h.fm.push(() => {
      ctrlInt.abort(new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.'));
      return novaError('CANCELLED', 'abgebrochen');
    });
    const interrupted = await h.s.agents.run(h.input({ signal: ctrlInt.signal }));
    expect(interrupted.status).toBe('interrupted');
    expect(h.s.runs.get(interrupted.runId)!.endedAt).toBeNull();
  });
});

describe('AgentRunner – limits, errors and context', () => {
  it('blocks with AGENT_STEP_LIMIT and grants a new budget on resume', async () => {
    const fm = fakeModels({ script: Array.from({ length: 5 }, () => tc('list_files', { path: '.' })) });
    const h = setup({ fm });
    t!.core.settings.update({ agents: { maxStepsPerRun: 5 } });
    const first = await h.s.agents.run(h.input());
    expect(first).toMatchObject({ status: 'blocked', code: 'AGENT_STEP_LIMIT' });
    expect(h.fm.calls).toHaveLength(5);
    expect(h.s.runs.get(first.runId)!.errorCode).toBe('AGENT_STEP_LIMIT');

    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    expect(h.s.runs.get(first.runId)!.stepCount).toBe(6);
  });

  it('retries retryable provider errors with backoff and honours retryAfterMs', async () => {
    const fm = fakeModels({
      script: [novaError('PROVIDER_ERROR', 'Serverfehler 503'), novaError('PROVIDER_RATE_LIMIT', 'Zu viele Anfragen', { retryAfterMs: 2500 }), finishCoder()],
    });
    const h = setup({ fm, delays: [1000, 4000, 10000] });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    expect(h.slept.reduce((a, b) => a + b, 0)).toBe(1000 + 2500);
    const retrySteps = h.s.runs.steps(out.runId).filter((st) => st.kind === 'error' && st.summary.includes('Neuer Versuch'));
    expect(retrySteps).toHaveLength(2);
    expect(retrySteps[1].data).toMatchObject({ waitMs: 2500 });
  });

  it('fails after exhausting retries and blocks for an unreachable Ollama', async () => {
    const fm = fakeModels({ script: Array.from({ length: 4 }, () => novaError('PROVIDER_ERROR', 'Serverfehler')) });
    const h = setup({ fm, delays: [1, 1, 1] });
    const failed = await h.s.agents.run(h.input());
    expect(failed).toMatchObject({ status: 'failed', code: 'PROVIDER_ERROR' });
    expect(h.fm.calls).toHaveLength(4);

    h.fm.push(...Array.from({ length: 4 }, () => novaError('OLLAMA_UNREACHABLE', 'Ollama ist nicht erreichbar.')));
    const blocked = await h.s.agents.run(h.input());
    expect(blocked).toMatchObject({ status: 'blocked', code: 'OLLAMA_UNREACHABLE' });
  });

  it('blocks on NO_MODEL with the state saved and resumes later', async () => {
    const fm = fakeModels();
    fm.setResolveError(novaError('NO_MODEL', 'Kein Modell verfügbar – bitte in „Modelle“ eines auswählen.'));
    const h = setup({ fm });
    const first = await h.s.agents.run(h.input());
    expect(first).toMatchObject({ status: 'blocked', code: 'NO_MODEL' });
    expect(h.s.runs.get(first.runId)!.blocker).toContain('Kein Modell');
    expect(h.s.runs.loadState<RunState>(first.runId)).not.toBeNull();
    expect(h.fm.calls).toHaveLength(0);

    fm.setResolveError(null);
    h.fm.push(finishCoder());
    const second = await h.s.agents.run(h.input({ resumeRunId: first.runId }));
    expect(second.status).toBe('done');
    expect(second.runId).toBe(first.runId);
  });

  it('maps budget and approval errors of the model call', async () => {
    const fm = fakeModels({ script: [novaError('BUDGET_EXCEEDED', 'Das Tageslimit ist erreicht.')] });
    const h = setup({ fm });
    const blocked = await h.s.agents.run(h.input());
    expect(blocked).toMatchObject({ status: 'blocked', code: 'BUDGET_EXCEEDED' });

    h.fm.push(novaError('APPROVAL_REQUIRED', 'Projektdaten an einen Cloud-Anbieter senden?', { approvalId: 'apr_cloud' }));
    const waiting = await h.s.agents.run(h.input({ resumeRunId: blocked.runId }));
    expect(waiting).toMatchObject({ status: 'waiting_approval', approvalId: 'apr_cloud' });
    expect(h.s.runs.loadState<RunState>(waiting.runId)!.pending).toEqual({ kind: 'model', approvalId: 'apr_cloud' });

    h.fm.push(finishCoder());
    const done = await h.s.agents.run(h.input({ resumeRunId: waiting.runId }));
    expect(done.status).toBe('done');
    expect(h.fm.calls).toHaveLength(3);
  });

  it('compacts old tool results when the context window fills up', async () => {
    const big = 'x'.repeat(2500);
    const ft = standardTools({ read_file: () => ({ status: 'ok', content: big }) });
    const script = [...Array.from({ length: 7 }, (_, i) => tc('read_file', { path: `src/f${i}.js` })), finishCoder()];
    const fm = fakeModels({ script, contextLength: 8000, type: 'openai_compatible' });
    const h = setup({ fm, ft });
    const out = await h.s.agents.run(h.input());
    expect(out.status).toBe('done');
    const last = lastMessages(h.fm);
    const tools = toolMessages(last);
    expect(tools.some((m) => m.content.startsWith('[gekürzt: '))).toBe(true);
    expect(tools[tools.length - 1].content).toBe(big); // recent results stay verbatim
    expect(h.s.runs.steps(out.runId).some((st) => st.kind === 'status' && st.summary.includes('gekürzt'))).toBe(true);
    expect(h.s.runs.loadState<RunState>(out.runId)!.compactions).toBeGreaterThan(0);
  });
});

describe('AgentRunner – roles and validation', () => {
  it('lists the four built-in roles and supports exchanging a role module', () => {
    const h = setup();
    const roles = h.s.agents.roles();
    expect(roles.map((r) => r.role).sort()).toEqual(['coder', 'planner', 'reviewer', 'tester']);
    expect(roles.find((r) => r.role === 'planner')!.tools).toContain('submit_plan');
    const coder = roles.find((r) => r.role === 'coder')!;
    expect(coder.name).toBe('Programmieragent');
    expect(() =>
      h.s.agents.registerRole({
        info: { role: 'coder', name: 'X', description: 'X', tools: [], moduleId: 'x' },
        finishTool: { name: 'read_file', description: 'x', schema: { safeParse: () => ({ success: true }) } as never },
        toolNames: ['read_file'],
        systemPrompt: () => '',
        parseOutput: () => ({ role: 'coder', result: { summary: 'x', status: 'done', blocker: null, notes: null } }),
      }),
    ).toThrow(/Abschlusswerkzeug/);
  });

  it('starts a fresh run when the resume run is unknown', async () => {
    const fm = fakeModels({ script: [finishCoder()] });
    const h = setup({ fm });
    const out = await h.s.agents.run(h.input({ resumeRunId: 'run_doesnotexist' }));
    expect(out.status).toBe('done');
    expect(h.s.runs.steps(out.runId)[0].summary).toContain('neuer Lauf');
  });
});
