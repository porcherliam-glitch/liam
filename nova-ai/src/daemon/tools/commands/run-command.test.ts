// Tests of the run_command agent tool: policy decisions, approval flow (pending/denied/approved once/rule), the binding
// order consume → scanState → run → recordCommandChanges, re-evaluation on resume, result mapping and output tails.
import { describe, it, expect, afterEach } from 'vitest';
import type { Approval, ApprovalKind, ChangeRecord } from '@shared/schemas';
import type { ApprovalCheck, ApprovalRequest, CommandDecision, CommandResult, FileStateMap, RunCommandInput, Services } from '../../contracts';
import { NovaError } from '../../core/errors';
import { createProcHarness, type ProcHarness } from '../../processes/test-support';
import { createRunCommandTool, MAX_COMMAND_OUTPUT_CHARS, notFoundHint } from './run-command';

let h: ProcHarness | null = null;
afterEach(async () => {
  await h?.cleanup();
  h = null;
});

interface Setup {
  h: ProcHarness;
  order: string[];
  decisions: CommandDecision[];
  approvalState: { value: 'pending' | 'approved' | 'denied' | 'rule' };
  requests: ApprovalRequest[];
  runInputs: RunCommandInput[];
  scanMaps: FileStateMap[];
  recordInputs: { before: FileStateMap; taskId: string | null; runId: string | null }[];
  changes: ChangeRecord[];
  counters: { evaluate: number };
}

function change(path: string, op: ChangeRecord['op'], revertible = true): ChangeRecord {
  return { id: 1, projectId: 'prj_test', taskId: 'task_a', runId: 'run_1', path, op, beforeHash: null, afterHash: null, actor: 'nova', source: 'command', revertible, ts: 0, reverted: false };
}

function approval(req: ApprovalRequest, status: Approval['status']): Approval {
  return {
    id: 'apr_1',
    projectId: req.projectId,
    taskId: req.taskId ?? null,
    runId: req.runId ?? null,
    kind: req.kind,
    fingerprint: 'fp',
    title: req.title,
    action: req.action,
    consequences: req.consequences,
    details: {},
    status,
    scope: status === 'pending' ? null : 'once',
    createdAt: 0,
    decidedAt: null,
  };
}

function setup(opts: { fakeRun?: (input: RunCommandInput) => Promise<CommandResult>; scanFails?: boolean; decision?: CommandDecision } = {}): Setup {
  const st: Omit<Setup, 'h'> = {
    order: [],
    decisions: [opts.decision ?? { action: 'allow', reason: 'Auf der Erlaubnisliste' }],
    approvalState: { value: 'pending' },
    requests: [],
    runInputs: [],
    scanMaps: [],
    recordInputs: [],
    changes: [],
    counters: { evaluate: 0 },
  };
  h = createProcHarness({
    provided: {
      policy: {
        evaluate: () => {
          st.counters.evaluate++;
          st.order.push('evaluate');
          return st.decisions[Math.min(st.counters.evaluate - 1, st.decisions.length - 1)];
        },
      } as unknown as Services['policy'],
      approvals: {
        check: (req: ApprovalRequest): ApprovalCheck => {
          st.requests.push(req);
          st.order.push('check');
          const v = st.approvalState.value;
          if (v === 'approved') return { state: 'approved', approval: approval(req, 'approved'), viaRule: false };
          if (v === 'rule') return { state: 'approved', approval: null, viaRule: true };
          if (v === 'denied') return { state: 'denied', approval: approval(req, 'denied') };
          return { state: 'pending', approval: approval(req, 'pending') };
        },
        consume: (id: string) => void st.order.push(`consume:${id}`),
        acknowledgeDenial: (id: string) => void st.order.push(`ack:${id}`),
      } as unknown as Services['approvals'],
      journal: {
        scanState: async () => {
          st.order.push('scan');
          if (opts.scanFails) throw new Error('Projektordner nicht lesbar');
          const m: FileStateMap = new Map([['a.txt', { size: 1, mtimeMs: 1 }]]);
          st.scanMaps.push(m);
          return m;
        },
        recordCommandChanges: async (input: { before: FileStateMap; taskId: string | null; runId: string | null }) => {
          st.order.push('record');
          st.recordInputs.push(input);
          return st.changes;
        },
      } as unknown as Services['journal'],
    },
  });
  const real = h.s.processes;
  h.s.processes = {
    ...real,
    run: async (input: RunCommandInput) => {
      st.order.push('run');
      st.runInputs.push(input);
      return opts.fakeRun ? opts.fakeRun(input) : real.run(input);
    },
    shutdown: () => real.shutdown(),
  } as Services['processes'];
  return { h, ...st } as Setup;
}

const result = (patch: Partial<CommandResult>): CommandResult => ({ processId: 'proc_1', exitCode: 0, signal: null, stdout: '', stderr: '', output: '', timedOut: false, cancelled: false, durationMs: 1200, ...patch });

describe('run_command', () => {
  it('runs an allowed command in the project root and records command changes', async () => {
    const st = setup();
    st.changes.push(change('src/neu.ts', 'create'), change('src/alt.ts', 'modify', false));
    const tool = createRunCommandTool(st.h.s);
    const res = await tool.execute({ command: 'echo hallo' }, st.h.ctx());
    expect(res.status).toBe('ok');
    expect(res.content).toContain('$ echo hallo');
    expect(res.content).toContain('Exit-Code: 0');
    expect(res.content).toContain('hallo');
    expect(res.content).toContain('Geänderte Dateien (2): src/neu.ts (neu), src/alt.ts (geändert)');
    expect(res.content).toContain('1 Änderung durch den Befehl lässt sich nicht automatisch rückgängig machen');
    expect(res.status === 'ok' && res.filesChanged).toEqual(['src/neu.ts', 'src/alt.ts']);
    expect(st.order).toEqual(['evaluate', 'scan', 'run', 'record']);
    expect(st.runInputs[0]).toMatchObject({ command: 'echo hallo', cwd: st.h.root, kind: 'command', projectId: 'prj_test', taskId: 'task_a', timeoutMs: 600_000 });
    expect(st.runInputs[0].signal).toBeDefined();
    expect(st.recordInputs[0].before).toBe(st.scanMaps[0]);
    expect(st.recordInputs[0]).toMatchObject({ taskId: 'task_a', runId: 'run_1' });
    expect(tool.describe({ command: 'npm   test' })).toBe('Führt aus: npm test');
  });

  it('uses the timeout of the call', async () => {
    const st = setup({ fakeRun: async () => result({ output: 'ok\n' }) });
    await createRunCommandTool(st.h.s).execute({ command: 'npm test', timeoutSec: 30 }, st.h.ctx());
    expect(st.runInputs[0].timeoutMs).toBe(30_000);
  });

  it('never runs blocked commands', async () => {
    const st = setup({ decision: { action: 'block', reason: 'Formatieren von Laufwerken ist gesperrt.' } });
    const res = await createRunCommandTool(st.h.s).execute({ command: 'format c:' }, st.h.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'COMMAND_BLOCKED' });
    expect(res.content).toContain('Formatieren von Laufwerken ist gesperrt.');
    expect(st.order).toEqual(['evaluate']);
  });

  it('pauses for approval and resumes with a re-evaluated policy, consuming the approval before running', async () => {
    const decision: CommandDecision = { action: 'approve', kind: 'command', reason: 'Unbekannter Befehl', consequences: 'Läuft mit Ihren Rechten.', subject: 'npm run deploy' };
    const st = setup({ decision, fakeRun: async () => result({ output: 'fertig\n' }) });
    const tool = createRunCommandTool(st.h.s);
    const first = await tool.execute({ command: 'npm run deploy' }, st.h.ctx());
    expect(first).toMatchObject({ status: 'approval_required', approvalId: 'apr_1' });
    expect(st.requests[0]).toMatchObject({ kind: 'command', subject: 'npm run deploy', projectId: 'prj_test', taskId: 'task_a', runId: 'run_1', consequences: 'Läuft mit Ihren Rechten.' });
    expect(st.requests[0].title).toBe('Befehl ausführen: npm run deploy');
    expect(st.requests[0].action).toContain('npm run deploy');
    expect(st.requests[0].action).toContain('Unbekannter Befehl');
    expect(st.order).toEqual(['evaluate', 'check']);

    st.approvalState.value = 'approved';
    st.order.length = 0;
    const second = await tool.execute({ command: 'npm run deploy' }, st.h.ctx());
    expect(second.status).toBe('ok');
    expect(st.order).toEqual(['evaluate', 'check', 'consume:apr_1', 'scan', 'run', 'record']);
    expect(st.counters.evaluate).toBe(2);
  });

  it('does not consume approvals granted by an "always" rule', async () => {
    const st = setup({ decision: { action: 'approve', kind: 'network', reason: 'Netzwerk', consequences: 'Lädt Daten.', subject: 'example.com' }, fakeRun: async () => result({}) });
    st.approvalState.value = 'rule';
    await createRunCommandTool(st.h.s).execute({ command: 'curl https://example.com' }, st.h.ctx());
    expect(st.order).toEqual(['evaluate', 'check', 'scan', 'run', 'record']);
    expect(st.requests[0].title).toContain('Netzwerkzugriff');
  });

  it('acknowledges denials and returns a German error without running', async () => {
    const st = setup({ decision: { action: 'approve', kind: 'delete', reason: 'Löscht Dateien', consequences: 'Nicht umkehrbar.', subject: 'rm -r build' } });
    st.approvalState.value = 'denied';
    const res = await createRunCommandTool(st.h.s).execute({ command: 'rm -r build' }, st.h.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'APPROVAL_DENIED' });
    expect(res.content).toContain('Vom Benutzer abgelehnt');
    expect(st.order).toEqual(['evaluate', 'check', 'ack:apr_1']);
  });

  it('maps non-zero exits, timeouts, aborts and start failures – and always records changes', async () => {
    const st = setup({ fakeRun: async () => result({ exitCode: 3, output: 'Test fehlgeschlagen\n' }) });
    const tool = createRunCommandTool(st.h.s);
    const failed = await tool.execute({ command: 'npm test' }, st.h.ctx());
    expect(failed).toMatchObject({ status: 'error', code: 'COMMAND_FAILED' });
    expect(failed.content).toContain('Exit-Code: 3');
    expect(failed.content).toContain('Test fehlgeschlagen');

    const st2 = setup({ fakeRun: async () => result({ exitCode: null, signal: 'SIGTERM', timedOut: true, output: 'langsam' }) });
    const timedOut = await createRunCommandTool(st2.h.s).execute({ command: 'npm test', timeoutSec: 5 }, st2.h.ctx());
    expect(timedOut).toMatchObject({ status: 'error', code: 'COMMAND_TIMEOUT' });
    expect(timedOut.content).toContain('Zeitlimit von 5 s überschritten');
    expect(st2.order).toContain('record');

    const st3 = setup({ fakeRun: async () => result({ exitCode: null, cancelled: true }) });
    expect(await createRunCommandTool(st3.h.s).execute({ command: 'npm test' }, st3.h.ctx())).toMatchObject({ status: 'error', code: 'CANCELLED' });

    const st4 = setup({
      fakeRun: async () => {
        throw new NovaError('RESOURCE_LIMIT', 'Der Befehl wurde nicht gestartet: Grenze erreicht.');
      },
    });
    const limited = await createRunCommandTool(st4.h.s).execute({ command: 'npm test' }, st4.h.ctx());
    expect(limited).toMatchObject({ status: 'error', code: 'RESOURCE_LIMIT' });
    expect(limited.content).toContain('Grenze erreicht');
    expect(st4.order).toEqual(['evaluate', 'scan', 'run', 'record']);
  });

  it('runs a real failing command and reports its exit code', async () => {
    // A real child process through the platform shell: cmd.exe on Windows (`;` is no separator there), /bin/sh elsewhere.
    const command = process.platform === 'win32' ? 'echo kaputt 1>&2 & exit 4' : 'echo kaputt >&2; exit 4';
    const st = setup();
    const res = await createRunCommandTool(st.h.s).execute({ command }, st.h.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'COMMAND_FAILED' });
    expect(res.content).toContain('Exit-Code: 4');
    expect(res.content).toContain('kaputt');
  });

  it('reports the exit code of a real failing program started by the shell', async () => {
    const node = process.platform === 'win32' ? `"${process.execPath}"` : JSON.stringify(process.execPath);
    const st = setup();
    const res = await createRunCommandTool(st.h.s).execute({ command: `${node} -e "process.stderr.write('kaputt'); process.exit(3)"` }, st.h.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'COMMAND_FAILED' });
    expect(res.content).toContain('Exit-Code: 3');
    expect(res.content).toContain('kaputt');
    const ok = await createRunCommandTool(st.h.s).execute({ command: `${node} -e "console.log('alles gut')"` }, st.h.ctx());
    expect(ok.status).toBe('ok');
    expect(ok.content).toContain('Exit-Code: 0');
  });

  it('hints at a real missing program on this platform (exit code 127 /bin/sh, cmd.exe message)', async () => {
    const st = setup();
    const res = await createRunCommandTool(st.h.s).execute({ command: 'nova-gibt-es-nicht-4711 --version' }, st.h.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'COMMAND_FAILED' });
    // cmd.exe: 9009 alone, 1 inside the "chcp 65001>nul & …" wrapper – the hint comes from its error message then
    expect(res.content).toMatch(process.platform === 'win32' ? /Exit-Code: (1|9009) / : /Exit-Code: 127 /);
    expect(res.content).toContain('Das Programm wurde nicht gefunden');
  });

  it('returns at most 8000 characters of output without ANSI codes', async () => {
    const long = `\u001b[32m${'a'.repeat(15_000)}\u001b[0m\nENDE`;
    const st = setup({ fakeRun: async () => result({ output: long }) });
    const res = await createRunCommandTool(st.h.s).execute({ command: 'npm run build' }, st.h.ctx());
    expect(res.content).not.toContain('\u001b[');
    expect(res.content).toContain('ENDE');
    expect(res.content).toContain('gekürzt');
    const outputPart = res.content.slice(res.content.indexOf('Ausgabe:'));
    expect(outputPart.length).toBeLessThan(MAX_COMMAND_OUTPUT_CHARS + 120);
  });

  it('runs even when the pre-command scan fails and says that changes are not recorded', async () => {
    const st = setup({ scanFails: true, fakeRun: async () => result({ output: 'ok' }) });
    const res = await createRunCommandTool(st.h.s).execute({ command: 'npm test' }, st.h.ctx());
    expect(res.status).toBe('ok');
    expect(res.content).toContain('Dateiänderungen durch diesen Befehl sind nicht protokolliert');
    expect(st.order).toEqual(['evaluate', 'scan', 'run']);
  });

  it('hints at missing programs (exit code 127 on POSIX)', async () => {
    const st = setup({ fakeRun: async () => result({ exitCode: 127, output: 'sh: 1: foo: not found' }) });
    (st.h.t.core as { platform: NodeJS.Platform }).platform = 'linux';
    const res = await createRunCommandTool(st.h.s).execute({ command: 'foo' }, st.h.ctx());
    expect(res.content).toContain('Das Programm wurde nicht gefunden');
  });

  it('hints at missing programs on Windows (cmd.exe exit code 9009 or its message inside scripts)', async () => {
    const st = setup({
      fakeRun: async () => result({ exitCode: 9009, output: "'foo' is not recognized as an internal or external command,\r\noperable program or batch file.\r\n" }),
    });
    (st.h.t.core as { platform: NodeJS.Platform }).platform = 'win32';
    const res = await createRunCommandTool(st.h.s).execute({ command: 'foo' }, st.h.ctx());
    expect(res).toMatchObject({ status: 'error', code: 'COMMAND_FAILED' });
    expect(res.content).toContain('Exit-Code: 9009');
    expect(res.content).toContain('Das Programm wurde nicht gefunden');
  });

  it('decides the missing-program hint per platform', () => {
    const de = 'Der Befehl "foo" ist entweder falsch geschrieben oder\r\nkonnte nicht gefunden werden.';
    const deOld = "'foo' wird nicht als interner oder externer Befehl, betriebsfähiges Programm oder Batch-Datei erkannt.";
    expect(notFoundHint(9009, '', 'win32')).toContain('Das Programm wurde nicht gefunden');
    expect(notFoundHint(1, `> npm run lint\n${de}`, 'win32')).toContain('Das Programm wurde nicht gefunden');
    expect(notFoundHint(1, deOld, 'win32')).toContain('Das Programm wurde nicht gefunden');
    expect(notFoundHint(0, de, 'win32')).toBeNull();
    expect(notFoundHint(127, 'bash: foo: command not found', 'win32')).toBeNull();
    expect(notFoundHint(1, 'Test fehlgeschlagen', 'win32')).toBeNull();
    expect(notFoundHint(127, 'sh: 1: foo: not found', 'linux')).toContain('Das Programm wurde nicht gefunden');
    expect(notFoundHint(127, '', 'darwin')).toContain('Das Programm wurde nicht gefunden');
    expect(notFoundHint(9009, '', 'linux')).toBeNull();
    expect(notFoundHint(1, 'Test fehlgeschlagen', 'linux')).toBeNull();
  });

  it('does nothing when the run is already aborted', async () => {
    const st = setup();
    const ac = new AbortController();
    ac.abort();
    expect(await createRunCommandTool(st.h.s).execute({ command: 'echo x' }, st.h.ctx(undefined, ac.signal))).toMatchObject({ status: 'error', code: 'CANCELLED' });
    expect(st.order).toEqual([]);
  });

  it('labels every approval kind in German', async () => {
    const kinds: ApprovalKind[] = ['admin', 'install', 'publish', 'security_config', 'system_change', 'outside_project'];
    for (const kind of kinds) {
      const st = setup({ decision: { action: 'approve', kind, reason: 'r', consequences: 'c', subject: 's' } });
      await createRunCommandTool(st.h.s).execute({ command: 'x' }, st.h.ctx());
      expect(st.requests[0].title).toMatch(/^Befehl /);
      await st.h.cleanup();
      h = null;
    }
  });
});
