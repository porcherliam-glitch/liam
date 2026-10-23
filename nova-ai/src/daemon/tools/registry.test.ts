// Tests of the ToolRegistry: registration rules, JSON-schema specs, validation errors as tool errors, redaction and
// capping of results, error mapping, and the default tool set (6 file tools + 6 command tools).
import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import type { AgentTool, Services } from '../contracts';
import { NovaError } from '../core/errors';
import { createToolRegistry, MAX_TOOL_RESULT_CHARS } from './registry';
import { createProcHarness, type ProcHarness } from '../processes/test-support';

let h: ProcHarness | null = null;
afterEach(async () => {
  await h?.cleanup();
  h = null;
});

function echoTool(overrides: Partial<AgentTool> = {}): AgentTool<{ text: string; times: number }> {
  return {
    name: 'echo_text',
    description: 'Echo text.',
    schema: z.object({ text: z.string().min(1).describe('Text'), times: z.number().int().min(1).max(3).default(1) }),
    readOnly: true,
    describe: (p) => `Wiederholt ${p.text}`,
    execute: async (p) => ({ status: 'ok', content: p.text.repeat(p.times), data: { password: 'hunter2hunter2', text: p.text } }),
    ...overrides,
  } as AgentTool<{ text: string; times: number }>;
}

describe('createToolRegistry', () => {
  it('registers the six file tools and the six command tools by default', () => {
    h = createProcHarness({ processes: false });
    const reg = createToolRegistry(h.s);
    expect(reg.names().sort()).toEqual(
      ['ask_user', 'delete_file', 'edit_file', 'git_diff', 'list_files', 'memory_note', 'memory_search', 'read_file', 'run_checks', 'run_command', 'search_files', 'write_file'].sort(),
    );
    expect(reg.get('run_command')?.readOnly).toBe(false);
    expect(reg.get('run_checks')?.readOnly).toBe(true);
    expect(reg.get('unbekannt')).toBeNull();
    // every default tool has a JSON schema of type object without $schema
    for (const spec of reg.specs(reg.names())) {
      expect(spec.parameters.type).toBe('object');
      expect(spec.parameters.$schema).toBeUndefined();
      expect(spec.description.length).toBeGreaterThan(10);
    }
  });

  it('rejects duplicate, invalid and incomplete tools', () => {
    h = createProcHarness({ processes: false });
    const reg = createToolRegistry(h.s, { tools: [] });
    reg.register(echoTool());
    expect(() => reg.register(echoTool())).toThrow(/bereits registriert/);
    expect(() => reg.register(echoTool({ name: 'Bad-Name' }))).toThrow(/Ungültiger Werkzeugname/);
    expect(() => reg.register(echoTool({ name: 'no_exec', execute: undefined as unknown as AgentTool['execute'] }))).toThrow(/unvollständig/);
  });

  it('builds input JSON schemas (defaults optional) and skips unknown names', () => {
    h = createProcHarness({ processes: false });
    const reg = createToolRegistry(h.s, { tools: [echoTool()] });
    const specs = reg.specs(['echo_text', 'fehlt']);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ name: 'echo_text', description: 'Echo text.' });
    expect(specs[0].parameters).toMatchObject({ type: 'object', required: ['text'], properties: { text: { type: 'string', description: 'Text' }, times: { default: 1 } } });
    expect(reg.specs(['echo_text'])[0]).toEqual(specs[0]);
  });

  it('executes with zod validation, redacts results and maps errors', async () => {
    h = createProcHarness({ processes: false });
    const ctx = h.ctx();
    const reg = createToolRegistry(h.s, {
      tools: [
        echoTool(),
        echoTool({ name: 'leaks', execute: async () => ({ status: 'ok', content: 'Schlüssel: sk-ant-abcdefghijklmnopqrstuv' }) }),
        echoTool({ name: 'nova_fail', execute: async () => { throw new NovaError('FILE_LOCKED', 'Datei ist gesperrt.'); } }),
        echoTool({ name: 'crash', execute: async () => { throw new Error('kaputt'); } }),
        echoTool({ name: 'bad_result', execute: async () => 'nur text' as unknown as never }),
        echoTool({ name: 'huge', execute: async () => ({ status: 'ok', content: 'x'.repeat(MAX_TOOL_RESULT_CHARS + 500) }) }),
        echoTool({ name: 'waits', execute: async () => ({ status: 'approval_required', approvalId: 'apr_1', content: 'Freigabe nötig: token=abcdef123456' }) }),
      ],
    });
    const ok = await reg.execute('echo_text', { text: 'ab', times: 2 }, ctx);
    expect(ok).toMatchObject({ status: 'ok', content: 'abab' });
    expect(ok.status === 'ok' && (ok.data as { password: string }).password).toBe('[GEHEIM]');

    const invalid = await reg.execute('echo_text', { text: '', times: 9 }, ctx);
    expect(invalid).toMatchObject({ status: 'error', code: 'VALIDATION' });
    expect(invalid.content).toContain('text');
    expect(invalid.content).toContain('times');
    expect(await reg.execute('echo_text', null, ctx)).toMatchObject({ status: 'error', code: 'VALIDATION' });

    expect(await reg.execute('nicht_da', {}, ctx)).toMatchObject({ status: 'error', code: 'NOT_FOUND' });
    const leak = await reg.execute('leaks', { text: 'a' }, ctx);
    expect(leak.content).not.toContain('sk-ant-abcdefghijklmnopqrstuv');
    expect(await reg.execute('nova_fail', { text: 'a' }, ctx)).toEqual({ status: 'error', code: 'FILE_LOCKED', content: 'Datei ist gesperrt.' });
    const crash = await reg.execute('crash', { text: 'a' }, ctx);
    expect(crash).toMatchObject({ status: 'error', code: 'INTERNAL' });
    expect(crash.content).toContain('kaputt');
    expect(await reg.execute('bad_result', { text: 'a' }, ctx)).toMatchObject({ status: 'error', code: 'INTERNAL' });
    const huge = await reg.execute('huge', { text: 'a' }, ctx);
    expect(huge.content.length).toBeLessThan(MAX_TOOL_RESULT_CHARS + 200);
    expect(huge.content).toContain('[gekürzt');
    const waits = await reg.execute('waits', { text: 'a' }, ctx);
    expect(waits).toMatchObject({ status: 'approval_required', approvalId: 'apr_1' });
    expect(waits.content).not.toContain('abcdef123456');

    const ac = new AbortController();
    ac.abort();
    expect(await reg.execute('echo_text', { text: 'a' }, h.ctx(undefined, ac.signal))).toMatchObject({ status: 'error', code: 'CANCELLED' });
  });

  it('runs run_command end to end through the registry', async () => {
    h = createProcHarness({
      provided: {
        policy: { evaluate: () => ({ action: 'allow', reason: 'Auf der Erlaubnisliste' }) } as unknown as Services['policy'],
        journal: { scanState: async () => new Map(), recordCommandChanges: async () => [] } as unknown as Services['journal'],
      },
    });
    const reg = createToolRegistry(h.s);
    const res = await reg.execute('run_command', { command: 'echo registriert' }, h.ctx());
    expect(res.status).toBe('ok');
    expect(res.content).toContain('Exit-Code: 0');
    expect(res.content).toContain('registriert');
  });
});
