// Tests for the RPC router: validation (German issues), NOT_FOUND, error mapping, result checks, registration rules.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createRpcRouter, ROUTER_MESSAGES } from './router';
import { captureLogger } from './test-helpers';
import { NovaError } from '../core/errors';
import { germanIssueMessage, summarizeIssues, toGermanIssues } from './validation-de';

describe('createRpcRouter', () => {
  it('passes parsed params with defaults to the handler and returns its result', async () => {
    const { log } = captureLogger();
    const router = createRpcRouter(log);
    let seen: unknown;
    router.register('daemon.logs', (p, ctx) => {
      seen = { p, ctx };
      return [];
    });
    const res = await router.handle({ id: 'a1', method: 'daemon.logs' });
    expect(res).toEqual({ id: 'a1', ok: true, result: [] });
    expect(seen).toEqual({ p: { limit: 500 }, ctx: { requestId: 'a1' } });
    // null params behave like missing params
    const res2 = await router.handle({ id: 'a2', method: 'daemon.logs', params: null });
    expect(res2.ok).toBe(true);
  });

  it('rejects invalid params with VALIDATION and a German issue list', async () => {
    const router = createRpcRouter(captureLogger().log);
    router.register('tasks.get', () => {
      throw new Error('must not be called');
    });
    const res = await router.handle({ id: 'v1', method: 'tasks.get', params: { id: 5 } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('VALIDATION');
    expect(res.error.message).toBe('Die Eingabe ist ungültig: id: Text erwartet, Zahl erhalten.');
    expect(res.error.details).toEqual({ issues: [{ path: 'id', message: 'Text erwartet, Zahl erhalten.' }] });

    const missing = await router.handle({ id: 'v2', method: 'tasks.get', params: {} });
    expect(!missing.ok && missing.error.message).toBe('Die Eingabe ist ungültig: id: Angabe fehlt.');
  });

  it('keeps German schema messages and translates size/enum issues', async () => {
    const router = createRpcRouter(captureLogger().log);
    router.register('git.diff', () => []);
    router.register('approvals.decide', () => {
      throw new Error('unreachable');
    });
    router.register('daemon.logs', () => []);
    const gitRes = await router.handle({ id: 'g', method: 'git.diff', params: { projectId: 'p', ref: '-bad' } });
    expect(!gitRes.ok && gitRes.error.message).toContain('ref: Ungültige Git-Referenz.');
    const decide = await router.handle({ id: 'd', method: 'approvals.decide', params: { id: 'x', decision: 'maybe' } });
    expect(!decide.ok && decide.error.message).toContain('decision: Ungültiger Wert. Erlaubt: „approve“, „deny“.');
    const logs = await router.handle({ id: 'l', method: 'daemon.logs', params: { limit: 0 } });
    expect(!logs.ok && logs.error.message).toContain('limit: Muss mindestens 1 sein.');
  });

  it('answers NOT_FOUND for unknown and for unregistered methods', async () => {
    const router = createRpcRouter(captureLogger().log);
    const unknown = await router.handle({ id: 'n1', method: 'does.not.exist' });
    expect(unknown).toEqual({ id: 'n1', ok: false, error: { code: 'NOT_FOUND', message: ROUTER_MESSAGES.notFound, details: { method: 'does.not.exist' } } });
    const unregistered = await router.handle({ id: 'n2', method: 'tasks.list' });
    expect(!unregistered.ok && unregistered.error).toMatchObject({ code: 'NOT_FOUND', message: 'Diese Funktion ist in dieser Version nicht verfügbar.' });
    const prototypeKey = await router.handle({ id: 'n3', method: 'toString' });
    expect(!prototypeKey.ok && prototypeKey.error.code).toBe('NOT_FOUND');
  });

  it('maps NovaError to code/message/details with redacted details', async () => {
    const router = createRpcRouter(captureLogger().log);
    router.register('tasks.get', () => {
      throw new NovaError('CONFLICT', 'Die Aufgabe läuft gerade.', { details: { apiKey: 'sk-ant-abcdefghijklmnopqrstuvwxyz', taskId: 't1' } });
    });
    const res = await router.handle({ id: 'e1', method: 'tasks.get', params: { id: 't1' } });
    expect(res).toEqual({ id: 'e1', ok: false, error: { code: 'CONFLICT', message: 'Die Aufgabe läuft gerade.', details: { apiKey: '[GEHEIM]', taskId: 't1' } } });
  });

  it('maps unknown errors to INTERNAL with the redacted message and logs them', async () => {
    const { log, entries } = captureLogger();
    const router = createRpcRouter(log);
    router.register('tasks.get', () => {
      throw new TypeError('boom with token=supersecretvalue123');
    });
    const res = await router.handle({ id: 'i1', method: 'tasks.get', params: { id: 't' } });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('INTERNAL');
    expect(res.error.message).toBe('Interner Fehler im Hintergrunddienst.');
    expect(res.error.details).toBe('boom with token=[GEHEIM]');
    expect(entries.some((e) => e.level === 'error' && e.msg.includes('Unerwarteter Fehler'))).toBe(true);
  });

  it('maps ZodErrors from handlers to VALIDATION and abort errors to CANCELLED', async () => {
    const router = createRpcRouter(captureLogger().log);
    router.register('tasks.get', () => {
      z.object({ name: z.string().min(3) }).parse({ name: 'x' });
      return null as never;
    });
    router.register('tasks.list', () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const zodRes = await router.handle({ id: 'z', method: 'tasks.get', params: { id: 't' } });
    expect(!zodRes.ok && zodRes.error).toMatchObject({ code: 'VALIDATION', message: 'Die Daten sind ungültig: name: Mindestens 3 Zeichen erforderlich.' });
    const abortRes = await router.handle({ id: 'c', method: 'tasks.list' });
    expect(!abortRes.ok && abortRes.error).toEqual({ code: 'CANCELLED', message: 'Der Vorgang wurde abgebrochen.' });
  });

  it('logs result contract mismatches without failing the call (only when validation is on)', async () => {
    const on = captureLogger();
    const router = createRpcRouter(on.log, { validateResults: true });
    router.register('daemon.logs', () => [{ wrong: true }] as never);
    const res = await router.handle({ id: 'm', method: 'daemon.logs' });
    expect(res).toEqual({ id: 'm', ok: true, result: [{ wrong: true }] });
    expect(on.entries.some((e) => e.level === 'warn' && e.msg === 'RPC-Ergebnis entspricht nicht dem Vertrag')).toBe(true);

    const off = captureLogger();
    const router2 = createRpcRouter(off.log, { validateResults: false });
    router2.register('daemon.logs', () => [{ wrong: true }] as never);
    await router2.handle({ id: 'm2', method: 'daemon.logs' });
    expect(off.entries.some((e) => e.msg === 'RPC-Ergebnis entspricht nicht dem Vertrag')).toBe(false);
  });

  it('refuses duplicate and unknown registrations and lists registered methods', () => {
    const router = createRpcRouter(captureLogger().log);
    router.register('tasks.list', () => []);
    router.register('daemon.logs', () => []);
    expect(() => router.register('tasks.list', () => [])).toThrow(/bereits registriert/);
    expect(() => router.register('nope.method' as 'tasks.list', () => [])).toThrow(/Unbekannte RPC-Methode/);
    expect(router.registered()).toEqual(['daemon.logs', 'tasks.list']);
  });

  it('supports async handlers and string ids of other types', async () => {
    const router = createRpcRouter(captureLogger().log);
    router.register('daemon.logs', async () => {
      await new Promise((r) => setTimeout(r, 5));
      return [];
    });
    const res = await router.handle({ id: 42 as unknown as string, method: 'daemon.logs' });
    expect(res).toEqual({ id: '42', ok: true, result: [] });
  });
});

describe('German validation texts', () => {
  it('formats common issue kinds in plain German', () => {
    expect(germanIssueMessage({ code: 'invalid_type', expected: 'boolean', input: 'x' })).toBe('Ja/Nein-Wert erwartet, Text erhalten.');
    expect(germanIssueMessage({ code: 'too_small', origin: 'string', minimum: 1, inclusive: true })).toBe('Darf nicht leer sein.');
    expect(germanIssueMessage({ code: 'too_big', origin: 'array', maximum: 15, inclusive: true })).toBe('Höchstens 15 Einträge erlaubt.');
    expect(germanIssueMessage({ code: 'too_big', origin: 'number', maximum: 10, inclusive: false })).toBe('Muss kleiner als 10 sein.');
    expect(germanIssueMessage({ code: 'invalid_format', format: 'url' })).toBe('Ungültige Internetadresse (URL).');
    expect(germanIssueMessage({ code: 'unrecognized_keys', keys: ['a', 'b'] })).toBe('Unbekannte Felder: a, b.');
    expect(germanIssueMessage({ code: 'custom', message: 'Bitte genau einen Wiederherstellungspunkt angeben.' })).toBe('Bitte genau einen Wiederherstellungspunkt angeben.');
    expect(germanIssueMessage({ code: 'custom', message: 'Invalid input' })).toBe('Ungültige Eingabe.');
  });

  it('summarises at most five issues and keeps nested paths readable', () => {
    const issues = toGermanIssues(
      Array.from({ length: 7 }, (_, i) => ({ code: 'invalid_type', expected: 'string', path: ['config', 'commands', i], message: 'Invalid input: expected string' })),
    );
    expect(issues[2].path).toBe('config.commands[2]');
    expect(issues[2].message).toBe('Text erwartet.');
    expect(summarizeIssues(issues)).toMatch(/\(und 2 weitere Fehler\)$/);
  });
});
