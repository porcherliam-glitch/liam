// Tests of TerminalService: real lines through ProcessManager on Linux, internal cd/cls handling, busy rejection,
// interrupt/close, and the Windows call shape (PowerShell shell, kind terminal) with a fake ProcessManager.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { CommandResult, RunCommandInput, Services } from '../contracts';
import { createTerminalService, parseBuiltin, splitSimpleLine, CLEAR_SCREEN } from './terminal-service';
import { createProcHarness, NODE, waitFor, type ProcHarness } from './test-support';

let h: ProcHarness | null = null;
afterEach(async () => {
  h?.s.terminals?.closeAll?.();
  await h?.cleanup();
  h = null;
});

function setup(opts: Parameters<typeof createProcHarness>[0] = {}): ProcHarness {
  h = createProcHarness(opts);
  h.s.terminals = createTerminalService(h.s, { platform: 'linux', bashPath: null });
  return h;
}

function exitsOf(h: ProcHarness, sessionId: string) {
  return h.eventsOf('terminal.exit').filter((e) => e.sessionId === sessionId);
}

function outputOf(h: ProcHarness, sessionId: string, stream?: string): string {
  return h
    .eventsOf('terminal.output')
    .filter((e) => e.sessionId === sessionId && (!stream || e.stream === stream))
    .map((e) => e.data)
    .join('');
}

describe('parseBuiltin / splitSimpleLine', () => {
  it('recognises cd forms and clear commands', () => {
    expect(parseBuiltin('cd')).toEqual({ kind: 'cd', target: null });
    expect(parseBuiltin('cd ..')).toEqual({ kind: 'cd', target: '..' });
    expect(parseBuiltin('cd..')).toEqual({ kind: 'cd', target: '..' });
    expect(parseBuiltin('cd /d "D:\\Mein Projekt"')).toEqual({ kind: 'cd', target: 'D:\\Mein Projekt' });
    expect(parseBuiltin('Set-Location -Path src')).toEqual({ kind: 'cd', target: 'src' });
    expect(parseBuiltin('CLS')).toEqual({ kind: 'clear' });
    expect(parseBuiltin('Clear-Host')).toEqual({ kind: 'clear' });
    expect(parseBuiltin('cd src && npm test')).toBeNull();
    expect(parseBuiltin('cdx')).toBeNull();
    expect(parseBuiltin('npm test')).toBeNull();
    expect(splitSimpleLine('a "b c" \'d\'')).toEqual(['a', 'b c', 'd']);
    expect(splitSimpleLine('a | b')).toBeNull();
    expect(splitSimpleLine('"offen')).toBeNull();
  });
});

describe.skipIf(process.platform === 'win32')('TerminalService (real lines)', () => {
  it('creates sessions per project and rejects unknown projects', () => {
    const h = setup();
    const t = h.s.terminals.create(h.project.id);
    expect(t).toMatchObject({ projectId: h.project.id, cwd: h.root, shell: 'sh', busy: false });
    expect(h.s.terminals.list(h.project.id)).toHaveLength(1);
    expect(h.s.terminals.list('anderes')).toHaveLength(0);
    expect(() => h.s.terminals.create('prj_unbekannt')).toThrow();
  });

  it('runs a line, streams output and reports the exit', async () => {
    const h = setup();
    const t = h.s.terminals.create(h.project.id);
    expect(h.s.terminals.run(t.id, `${NODE} -e "console.log('hallo welt'); process.exit(2)"`)).toEqual({ accepted: true });
    expect(h.s.terminals.list()[0].busy).toBe(true);
    expect(await waitFor(() => exitsOf(h, t.id).length === 1)).toBe(true);
    expect(outputOf(h, t.id, 'stdout')).toContain('hallo welt');
    expect(exitsOf(h, t.id)[0]).toMatchObject({ exitCode: 2, cwd: h.root, projectId: h.project.id });
    expect(h.s.terminals.list()[0].busy).toBe(false);
    const procs = h.s.processes.list({ includeExited: true });
    expect(procs[0]).toMatchObject({ kind: 'terminal', projectId: h.project.id, taskId: null });
  });

  it('rejects a second line while one is running and interrupts on request', async () => {
    const h = setup();
    const t = h.s.terminals.create(h.project.id);
    h.s.terminals.run(t.id, `${NODE} -e "setInterval(() => {}, 1000)"`);
    expect(h.s.terminals.run(t.id, 'echo zweite')).toEqual({ accepted: false });
    expect(outputOf(h, t.id, 'system')).toContain('Es läuft noch ein Befehl');
    await waitFor(() => h.s.processes.runningCount() === 1);
    h.s.terminals.interrupt(t.id);
    expect(await waitFor(() => exitsOf(h, t.id).length === 1, 6000)).toBe(true);
    expect(outputOf(h, t.id, 'system')).toContain('^C');
    expect(h.s.terminals.run(t.id, 'echo danach')).toEqual({ accepted: true });
    expect(await waitFor(() => exitsOf(h, t.id).length === 2)).toBe(true);
    expect(outputOf(h, t.id, 'stdout')).toContain('danach');
    expect(() => h.s.terminals.interrupt('term_unbekannt')).toThrow();
  });

  it('handles cd internally and never leaves the project folder', async () => {
    const h = setup();
    mkdirSync(join(h.root, 'src', 'lib'), { recursive: true });
    mkdirSync(join(h.root, 'Mein Ordner'));
    const t = h.s.terminals.create(h.project.id);
    const cwd = () => h.s.terminals.list()[0].cwd;
    h.s.terminals.run(t.id, 'cd src/lib');
    expect(cwd()).toBe(join(h.root, 'src', 'lib'));
    expect(exitsOf(h, t.id).at(-1)).toMatchObject({ exitCode: 0, cwd: join(h.root, 'src', 'lib') });
    h.s.terminals.run(t.id, 'cd ..');
    expect(cwd()).toBe(join(h.root, 'src'));
    h.s.terminals.run(t.id, 'cd -');
    expect(cwd()).toBe(join(h.root, 'src', 'lib'));
    h.s.terminals.run(t.id, 'cd');
    expect(cwd()).toBe(h.root);
    h.s.terminals.run(t.id, 'cd "Mein Ordner"');
    expect(cwd()).toBe(join(h.root, 'Mein Ordner'));
    h.s.terminals.run(t.id, 'cd ~');
    expect(cwd()).toBe(h.root);
    h.s.terminals.run(t.id, 'cd ..');
    expect(cwd()).toBe(h.root);
    expect(outputOf(h, t.id, 'system')).toContain('Das Terminal bleibt im Projektordner');
    expect(exitsOf(h, t.id).at(-1)?.exitCode).toBe(1);
    h.s.terminals.run(t.id, 'cd gibt-es-nicht');
    expect(outputOf(h, t.id, 'system')).toContain('Ordner nicht gefunden: gibt-es-nicht');
    expect(cwd()).toBe(h.root);
    // the next line runs in the tracked folder
    h.s.terminals.run(t.id, 'cd src');
    h.s.terminals.run(t.id, 'pwd');
    expect(await waitFor(() => outputOf(h, t.id, 'stdout').includes(realpathSync.native(join(h.root, 'src'))))).toBe(true);
  });

  it('clears the screen, ignores empty lines and refuses multi-line input', () => {
    const h = setup();
    const t = h.s.terminals.create(h.project.id);
    h.s.terminals.run(t.id, 'cls');
    expect(outputOf(h, t.id, 'system')).toBe(CLEAR_SCREEN);
    h.s.terminals.run(t.id, '   ');
    h.s.terminals.run(t.id, 'echo a\necho b');
    expect(outputOf(h, t.id, 'system')).toContain('Bitte nur eine Zeile');
    expect(exitsOf(h, t.id).map((e) => e.exitCode)).toEqual([0, 0, 1]);
  });

  it('close / closeProject / closeAll abort running lines and are idempotent', async () => {
    const h = setup();
    const a = h.s.terminals.create(h.project.id);
    const b = h.s.terminals.create(h.project.id);
    h.s.terminals.run(a.id, `${NODE} -e "setInterval(() => {}, 1000)"`);
    await waitFor(() => h.s.processes.runningCount() === 1);
    h.s.terminals.close(a.id);
    h.s.terminals.close(a.id);
    expect(h.s.terminals.list().map((x) => x.id)).toEqual([b.id]);
    expect(await waitFor(() => h.s.processes.runningCount() === 0, 6000)).toBe(true);
    expect(exitsOf(h, a.id)).toHaveLength(0); // no events after close
    h.s.terminals.closeProject(h.project.id);
    expect(h.s.terminals.list()).toHaveLength(0);
    h.s.terminals.create(h.project.id);
    h.s.terminals.closeAll();
    expect(h.s.terminals.list()).toHaveLength(0);
    expect(() => h.s.terminals.run(a.id, 'echo x')).toThrow();
  });

  it('limits the number of terminals per project', () => {
    const local = createProcHarness();
    h = local;
    local.s.terminals = createTerminalService(local.s, { platform: 'linux', bashPath: null, maxSessionsPerProject: 2 });
    local.s.terminals.create(local.project.id);
    local.s.terminals.create(local.project.id);
    expect(() => local.s.terminals.create(local.project.id)).toThrow(/bereits 2 Terminals/);
  });
});

describe('TerminalService on Windows (fake ProcessManager)', () => {
  it('runs lines through the PowerShell shell with kind terminal and shows governor waits', async () => {
    const calls: RunCommandInput[] = [];
    let finish: ((r: CommandResult) => void) | null = null;
    h = createProcHarness({
      processes: false,
      provided: {
        processes: {
          run: (input: RunCommandInput) => {
            calls.push(input);
            input.onOutput?.('stdout', 'Verzeichnis: C:\\Projekt\r\n');
            return new Promise<CommandResult>((r) => (finish = r));
          },
          shutdown: async () => undefined,
        } as unknown as Services['processes'],
      },
    });
    h.governor.ok = false;
    h.governor.reason = 'Es laufen bereits 6 Prozesse.';
    const term = createTerminalService(h.s, { platform: 'win32' });
    h.s.terminals = term;
    const t = term.create(h.project.id);
    expect(t.shell).toBe('powershell');
    term.run(t.id, 'Get-ChildItem');
    expect(calls[0]).toMatchObject({ command: 'Get-ChildItem', cwd: h.root, kind: 'terminal', shell: 'powershell', projectId: h.project.id, taskId: null });
    expect(outputOf(h, t.id, 'system')).toContain('Wartet auf einen freien Prozessplatz');
    expect(outputOf(h, t.id, 'stdout')).toContain('Verzeichnis');
    finish!({ processId: 'proc_x', exitCode: 0, signal: null, stdout: '', stderr: '', output: '', timedOut: false, cancelled: false, durationMs: 5 });
    expect(await waitFor(() => exitsOf(h!, t.id).length === 1)).toBe(true);
    expect(exitsOf(h, t.id)[0].exitCode).toBe(0);
  });

  it('shows ProcessManager errors as system output and ends the line', async () => {
    h = createProcHarness({
      processes: false,
      provided: {
        processes: {
          run: async () => {
            const { NovaError } = await import('../core/errors');
            throw new NovaError('RESOURCE_LIMIT', 'Der Befehl wurde nicht gestartet: Grenze erreicht.');
          },
          shutdown: async () => undefined,
        } as unknown as Services['processes'],
      },
    });
    const term = createTerminalService(h.s, { platform: 'win32' });
    h.s.terminals = term;
    const t = term.create(h.project.id);
    term.run(t.id, 'npm run dev');
    expect(await waitFor(() => exitsOf(h!, t.id).length === 1)).toBe(true);
    expect(outputOf(h, t.id, 'system')).toContain('Der Befehl wurde nicht gestartet');
    expect(exitsOf(h, t.id)[0].exitCode).toBeNull();
    expect(term.list()[0].busy).toBe(false);
  });
});
