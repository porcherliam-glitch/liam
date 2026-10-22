// Tests of the agent tools run_checks, git_diff, memory_search, memory_note and ask_user with hand-written fakes of
// CheckService, FileService, GitService, TaskService, MemoryService, NotificationService and PathGuard.
import { describe, it, expect, afterEach } from 'vitest';
import type { CheckRun, FileDiff, MemoryEntry, MemorySearchResult, Notification, TaskNote } from '@shared/schemas';
import type { MemoryAddInput, Services } from '../../contracts';
import { NovaError, validation } from '../../core/errors';
import { createProcHarness, makeTask, type ProcHarness } from '../../processes/test-support';
import { createRunChecksTool } from './run-checks';
import { createGitDiffTool } from './git-diff';
import { createMemoryNoteTool, createMemorySearchTool } from './memory-tools';
import { createAskUserTool } from './ask-user';
import { createCommandTools } from './index';

let h: ProcHarness | null = null;
afterEach(async () => {
  await h?.cleanup();
  h = null;
});

function checkRun(patch: Partial<CheckRun>): CheckRun {
  return {
    id: 'crun_1',
    projectId: 'prj_test',
    taskId: 'task_a',
    kind: 'test',
    command: 'npm test',
    status: 'passed',
    passed: 5,
    failed: 0,
    skipped: 1,
    durationMs: 2100,
    outputTail: '\u001b[32m✓ 5 Tests\u001b[0m\n',
    failures: [],
    failureSignature: null,
    message: null,
    processId: 'proc_1',
    artifacts: [],
    startedAt: 0,
    finishedAt: 1,
    ...patch,
  };
}

describe('createCommandTools', () => {
  it('provides the six command and knowledge tools', () => {
    h = createProcHarness({ processes: false });
    expect(createCommandTools(h.s).map((t) => t.name)).toEqual(['run_command', 'run_checks', 'git_diff', 'memory_search', 'memory_note', 'ask_user']);
  });
});

describe('run_checks', () => {
  function setup(run: CheckRun | (() => never)) {
    const calls: unknown[] = [];
    h = createProcHarness({
      processes: false,
      provided: {
        checks: {
          run: async (input: unknown) => {
            calls.push(input);
            return typeof run === 'function' ? run() : run;
          },
        } as unknown as Services['checks'],
      },
    });
    return { calls, tool: createRunChecksTool(h.s) };
  }

  it('runs the check for the current task as agent and reports passing results', async () => {
    const { calls, tool } = setup(checkRun({}));
    const ac = new AbortController();
    const res = await tool.execute({ kind: 'test' }, h!.ctx(undefined, ac.signal));
    expect(calls[0]).toEqual({ projectId: 'prj_test', kind: 'test', taskId: 'task_a', signal: ac.signal, actor: 'agent' });
    expect(res.status).toBe('ok');
    expect(res.content).toContain('Prüfung „Tests“: bestanden');
    expect(res.content).toContain('Ergebnis: 5 bestanden, 0 fehlgeschlagen, 1 übersprungen · Dauer 2,1 s');
    expect(res.content).not.toContain('\u001b[');
    expect(res.status === 'ok' && res.data).toMatchObject({ checkRunId: 'crun_1', status: 'passed', passed: 5 });
    expect(tool.describe({ kind: 'typecheck' })).toBe('Führt Prüfung aus: Typprüfung');
  });

  it('reports failures with file and line as TESTS_FAILED', async () => {
    const { tool } = setup(
      checkRun({
        status: 'failed',
        passed: 3,
        failed: 2,
        message: '2 Tests sind fehlgeschlagen.',
        failures: [
          { file: 'src/a.test.ts', line: 12, column: 5, message: 'expected 1 to be 2' },
          { file: null, line: null, column: null, message: 'Timeout' },
        ],
      }),
    );
    const res = await tool.execute({ kind: 'test' }, h!.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'TESTS_FAILED' });
    expect(res.content).toContain('Meldung: 2 Tests sind fehlgeschlagen.');
    expect(res.content).toContain('- src/a.test.ts:12:5 – expected 1 to be 2');
    expect(res.content).toContain('- Timeout');
  });

  it('maps build failures, errors, cancellation, not_run and thrown errors', async () => {
    expect(await setup(checkRun({ kind: 'build', status: 'failed' })).tool.execute({ kind: 'build' }, h!.ctx())).toMatchObject({ code: 'BUILD_FAILED' });
    await h!.cleanup();
    expect(await setup(checkRun({ status: 'error', message: 'Befehl nicht gefunden' })).tool.execute({ kind: 'test' }, h!.ctx())).toMatchObject({ status: 'error', code: 'COMMAND_FAILED' });
    await h!.cleanup();
    expect(await setup(checkRun({ status: 'cancelled' })).tool.execute({ kind: 'test' }, h!.ctx())).toMatchObject({ status: 'error', code: 'CANCELLED' });
    await h!.cleanup();
    const notRun = await setup(checkRun({ kind: 'lint', status: 'not_run', command: '', passed: null, failed: null, skipped: null, durationMs: null, outputTail: '', message: 'Kein Lint-Befehl eingerichtet.' })).tool.execute({ kind: 'lint' }, h!.ctx());
    expect(notRun.status).toBe('ok');
    expect(notRun.content).toBe('Prüfung „Lint“: nicht ausgeführt\nMeldung: Kein Lint-Befehl eingerichtet.');
    await h!.cleanup();
    const thrown = await setup(() => {
      throw new NovaError('NOT_FOUND', 'Das Projekt wurde nicht gefunden.');
    }).tool.execute({ kind: 'test' }, h!.ctx());
    expect(thrown).toMatchObject({ status: 'error', code: 'NOT_FOUND' });
  });
});

describe('git_diff', () => {
  interface DiffSetup {
    taskFiles: string[];
    gitRepo: boolean;
    fileDiffs: Record<string, FileDiff | Error>;
    gitDiffs: FileDiff[];
  }
  function setup(cfg: Partial<DiffSetup> = {}) {
    const c: DiffSetup = { taskFiles: [], gitRepo: false, fileDiffs: {}, gitDiffs: [], ...cfg };
    const fileCalls: { path: string; opts: unknown }[] = [];
    const gitCalls: unknown[] = [];
    h = createProcHarness({
      processes: false,
      provided: {
        tasks: { get: (id: string) => makeTask(id, 'prj_test', { files: c.taskFiles }) } as unknown as Services['tasks'],
        files: {
          diff: async (_pid: string, path: string, opts?: unknown) => {
            fileCalls.push({ path, opts });
            const d = c.fileDiffs[path];
            if (d instanceof Error) throw d;
            return d ?? { path, original: '', modified: '', unified: '', binary: false };
          },
        } as unknown as Services['files'],
        git: {
          isRepo: async () => c.gitRepo,
          diff: async (_root: string, opts: unknown) => {
            gitCalls.push(opts);
            return c.gitDiffs;
          },
        } as unknown as Services['git'],
        pathGuard: {
          resolve: (_root: string, p: string) => {
            if (p.includes('..')) throw new NovaError('PATH_OUTSIDE_PROJECT', 'Der Pfad liegt außerhalb des Projekts.');
            const rel = p === '.' ? '' : p.replace(/^\.\//, '');
            return { abs: `/x/${rel}`, rel, key: rel };
          },
          isSensitive: (rel: string) => rel === '.env',
        } as unknown as Services['pathGuard'],
      },
    });
    return { fileCalls, gitCalls, tool: createGitDiffTool(h.s) };
  }
  const diff = (path: string, unified: string, binary = false): FileDiff => ({ path, original: 'a', modified: 'b', unified, binary });

  it('diffs the files of the current task (fresh task row) with the task id', async () => {
    const { fileCalls, gitCalls, tool } = setup({
      taskFiles: ['src/a.ts', '.env', 'logo.png', 'src/unverändert.ts'],
      fileDiffs: {
        'src/a.ts': diff('src/a.ts', '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-alt\n+neu\n'),
        '.env': diff('.env', '--- a/.env\n+++ b/.env\n-KEY=1\n+KEY=2\n'),
        'logo.png': diff('logo.png', 'Binärdateien unterscheiden sich.\n', true),
      },
    });
    const res = await tool.execute({}, h!.ctx(makeTask('task_a', 'prj_test', { files: [] })));
    expect(res.status).toBe('ok');
    expect(fileCalls.map((c) => c.path)).toEqual(['src/a.ts', '.env', 'logo.png', 'src/unverändert.ts']);
    expect(fileCalls.every((c) => (c.opts as { taskId: string }).taskId === 'task_a')).toBe(true);
    expect(gitCalls).toHaveLength(0);
    expect(res.content).toContain('Änderungen dieser Aufgabe (4 Dateien):');
    expect(res.content).toContain('+neu');
    expect(res.content).toContain('=== .env (sensible Datei – Inhalt wird nicht angezeigt)');
    expect(res.content).not.toContain('KEY=2');
    expect(res.content).toContain('=== logo.png: Binärdateien unterscheiden sich.');
    expect(res.content).toContain('1 Datei ist inzwischen wieder unverändert.');
  });

  it('limits to one task file with path and reports per-file problems', async () => {
    const { fileCalls, tool } = setup({ taskFiles: ['src/a.ts', 'src/b.ts'], fileDiffs: { 'src/b.ts': new NovaError('NOT_FOUND', 'Die Sicherung ist nicht mehr vorhanden.') } });
    const res = await tool.execute({ path: './src/b.ts' }, h!.ctx());
    expect(fileCalls.map((c) => c.path)).toEqual(['src/b.ts']);
    expect(res.content).toContain('Änderungen dieser Aufgabe an src/b.ts:');
    expect(res.content).toContain('Vergleich nicht möglich (Die Sicherung ist nicht mehr vorhanden.)');
    expect(tool.describe({ path: 'src/b.ts' })).toBe('Zeigt Änderungen an src/b.ts');
  });

  it('falls back to git diff without task files', async () => {
    const { gitCalls, tool } = setup({ gitRepo: true, gitDiffs: [diff('README.md', '--- a/README.md\n+++ b/README.md\n+Zeile\n'), diff('leer.txt', '')] });
    const res = await tool.execute({}, h!.ctx());
    expect(gitCalls).toEqual([{}]);
    expect(res.content).toContain('Offene Git-Änderungen im Projekt (1 Datei):');
    expect(res.content).toContain('+Zeile');
    await tool.execute({ path: 'README.md' }, h!.ctx());
    expect(gitCalls[1]).toEqual({ path: 'README.md' });
  });

  it('explains when there is nothing to compare and uses the journal for a path without git', async () => {
    const { fileCalls, tool } = setup();
    const res = await tool.execute({}, h!.ctx());
    expect(res.content).toBe('Keine Änderungen: Diese Aufgabe hat noch keine Dateien geändert, und der Projektordner ist kein Git-Repository.');
    const one = await tool.execute({ path: 'src/x.ts' }, h!.ctx());
    expect(fileCalls[0]).toEqual({ path: 'src/x.ts', opts: undefined });
    expect(one.content).toBe('Keine von NOVA protokollierten Änderungen an src/x.ts.');
    expect(await tool.execute({ path: '../draußen' }, h!.ctx())).toMatchObject({ status: 'error', code: 'PATH_OUTSIDE_PROJECT' });
  });

  it('caps very large diffs', async () => {
    const big = `--- a/big.txt\n+++ b/big.txt\n${'+zeile\n'.repeat(10_000)}`;
    const { tool } = setup({ taskFiles: ['big.txt'], fileDiffs: { 'big.txt': diff('big.txt', big) } });
    const res = await tool.execute({}, h!.ctx());
    expect(res.content.length).toBeLessThan(41_000);
    expect(res.content).toContain('git_diff mit "path"');
  });
});

describe('memory tools', () => {
  function entry(patch: Partial<MemorySearchResult>): MemorySearchResult {
    return { id: 'mem_1', projectId: 'prj_test', kind: 'decision', title: 'Annahme: Canvas statt WebGL', content: 'Wir nutzen Canvas 2D.', tags: ['annahme'], source: 'agent', shareable: false, taskId: null, createdAt: 0, updatedAt: Date.parse('2026-10-20T12:00:00'), score: 1, snippet: '', ...patch };
  }

  it('memory_search queries the project plus shared knowledge and lists compact results', async () => {
    const calls: unknown[] = [];
    h = createProcHarness({
      processes: false,
      provided: {
        memory: {
          search: (q: string, opts: unknown) => {
            calls.push({ q, opts });
            return q === 'nichts' ? [] : [entry({}), entry({ id: 'mem_2', projectId: null, kind: 'insight', title: 'Vitest mit ESM', tags: [], snippet: 'vitest braucht …' })];
          },
        } as unknown as Services['memory'],
      },
    });
    const tool = createMemorySearchTool(h.s);
    const res = await tool.execute({ query: 'canvas', limit: 8 }, h.ctx());
    expect(calls[0]).toEqual({ q: 'canvas', opts: { projectId: 'prj_test', includeGlobal: true, limit: 8 } });
    expect(res.content).toContain('2 Treffer:');
    expect(res.content).toContain('1. [Entscheidung] Annahme: Canvas statt WebGL (dieses Projekt, 2026-10-20) #annahme');
    expect(res.content).toContain('2. [Erkenntnis] Vitest mit ESM (global');
    expect(res.content).toContain('vitest braucht');
    expect((await tool.execute({ query: 'nichts', limit: 8 }, h.ctx())).content).toContain('Keine Gedächtniseinträge');
  });

  it('memory_note stores agent entries (tags, shareable only for insights) and returns errors as tool errors', async () => {
    const added: { input: MemoryAddInput; source: string }[] = [];
    let fail: Error | null = null;
    h = createProcHarness({
      processes: false,
      provided: {
        memory: {
          add: (input: MemoryAddInput, source: MemoryEntry['source']) => {
            if (fail) throw fail;
            added.push({ input, source });
            return { ...entry({}), id: 'mem_9', kind: input.kind, title: input.title, shareable: input.kind === 'insight' };
          },
        } as unknown as Services['memory'],
      },
    });
    const tool = createMemoryNoteTool(h.s);
    const res = await tool.execute({ kind: 'decision', title: 'Annahme: Deutsch als Sprache', content: 'Die Oberfläche ist deutsch.' }, h.ctx());
    expect(res.status).toBe('ok');
    expect(added[0]).toEqual({
      source: 'agent',
      input: { projectId: 'prj_test', kind: 'decision', title: 'Annahme: Deutsch als Sprache', content: 'Die Oberfläche ist deutsch.', tags: ['annahme'], shareable: false, taskId: 'task_a' },
    });
    await tool.execute({ kind: 'insight', title: 'ESM', content: 'type module', tags: ['Node', 'node'] }, h.ctx());
    expect(added[1].input).toMatchObject({ shareable: true, tags: ['node'] });
    fail = validation('Agenten dürfen derzeit keine Gedächtniseinträge speichern.');
    expect(await tool.execute({ kind: 'note', title: 't', content: 'c' }, h.ctx())).toMatchObject({ status: 'error', code: 'VALIDATION' });
    // system kinds are not available to agents
    expect(tool.schema.safeParse({ kind: 'test_result', title: 't', content: 'c' }).success).toBe(false);
  });
});

describe('ask_user', () => {
  it('creates a question note plus a generic blocker notification and returns needs_input', async () => {
    const notes: unknown[] = [];
    const notifications: Omit<Notification, 'id' | 'ts' | 'readAt'>[] = [];
    h = createProcHarness({
      processes: false,
      provided: {
        tasks: {
          addNote: (input: Parameters<Services['tasks']['addNote']>[0]): TaskNote => {
            notes.push(input);
            return { id: 'note_1', taskId: input.taskId, projectId: 'prj_test', author: input.author, kind: input.kind, text: input.text, options: input.options ?? [], assumption: input.assumption ?? null, createdAt: 0, consumedRunId: null };
          },
        } as unknown as Services['tasks'],
        notifications: {
          notify: (n: Omit<Notification, 'id' | 'ts' | 'readAt'>) => {
            notifications.push(n);
            return null;
          },
        } as unknown as Services['notifications'],
      },
    });
    const tool = createAskUserTool(h.s);
    const res = await tool.execute({ question: 'Soll das Spiel mit Unity oder im Browser laufen?', options: ['Browser', 'Unity'], assumption: 'Browser, weil es ohne Installation läuft.' }, h.ctx());
    expect(res).toMatchObject({ status: 'needs_input', noteId: 'note_1' });
    expect(res.content).toContain('Browser, weil es ohne Installation läuft.');
    expect(notes[0]).toEqual({ taskId: 'task_a', author: 'agent', kind: 'question', text: 'Soll das Spiel mit Unity oder im Browser laufen?', options: ['Browser', 'Unity'], assumption: 'Browser, weil es ohne Installation läuft.' });
    expect(notifications[0]).toMatchObject({ category: 'blocker', level: 'warning', projectId: 'prj_test', taskId: 'task_a' });
    expect(notifications[0].body).not.toContain('Unity');
    expect(tool.schema.safeParse({ question: 'x' }).success).toBe(false); // assumption is required
  });

  it('still pauses when the notification fails and reports note errors as tool errors', async () => {
    let throwNote = false;
    h = createProcHarness({
      processes: false,
      provided: {
        tasks: {
          addNote: (input: { taskId: string }) => {
            if (throwNote) throw new NovaError('NOT_FOUND', 'Die Aufgabe wurde nicht gefunden.');
            return { id: 'note_2', taskId: input.taskId } as TaskNote;
          },
        } as unknown as Services['tasks'],
        notifications: {
          notify: () => {
            throw new Error('Benachrichtigungen kaputt');
          },
        } as unknown as Services['notifications'],
      },
    });
    const tool = createAskUserTool(h.s);
    expect(await tool.execute({ question: 'Frage?', assumption: 'Annahme' }, h.ctx())).toMatchObject({ status: 'needs_input', noteId: 'note_2' });
    throwNote = true;
    expect(await tool.execute({ question: 'Frage?', assumption: 'Annahme' }, h.ctx())).toMatchObject({ status: 'error', code: 'NOT_FOUND' });
  });
});

