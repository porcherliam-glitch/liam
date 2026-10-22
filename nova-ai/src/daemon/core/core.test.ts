import { describe, it, expect, afterEach } from 'vitest';
import { createTestCore, type TestCore } from '../../../tests/helpers/core';
import { LATEST_SCHEMA_VERSION, getSchemaVersion } from '../db/migrations';
import { redactString, registerSecret, _clearRegisteredSecrets, redact } from './redact';
import { createNotificationService } from './notifications';

let t: TestCore;
afterEach(() => {
  t?.cleanup();
  _clearRegisteredSecrets();
});

describe('core', () => {
  it('migrates the database to the latest schema', () => {
    t = createTestCore();
    expect(getSchemaVersion(t.core.db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = t.core.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['projects', 'tasks', 'agent_runs', 'approvals', 'memory_entries', 'memory_fts', 'changes', 'check_runs']));
  });

  it('returns default settings and validates updates', () => {
    t = createTestCore();
    expect(t.core.settings.get().agents.maxParallelAgents).toBe(2);
    const s = t.core.settings.update({ agents: { maxParallelAgents: 4 } });
    expect(s.agents.maxParallelAgents).toBe(4);
    expect(() => t.core.settings.update({ agents: { maxParallelAgents: 99 } })).toThrow(/Ungültige Einstellungen/);
    expect(() => t.core.settings.update({ nope: {} } as never)).toThrow(/Unbekannter/);
  });

  it('persists and dedupes errors', () => {
    t = createTestCore();
    const a = t.core.errors.report({ code: 'X', severity: 'blocker', title: 'T', whatHappened: 'W', dedupeKey: 'k' });
    const b = t.core.errors.report({ code: 'X', severity: 'blocker', title: 'T2', whatHappened: 'W2', dedupeKey: 'k' });
    expect(b.id).toBe(a.id);
    expect(t.core.errors.countOpen()).toBe(1);
    t.core.errors.resolve(a.id);
    expect(t.core.errors.countOpen()).toBe(0);
  });

  it('redacts secrets', () => {
    registerSecret('my-super-secret-value');
    expect(redactString('key=my-super-secret-value end')).not.toContain('my-super-secret-value');
    expect(redactString('Authorization: Bearer abcdefghijklmnop')).toContain('[GEHEIM]');
    expect(redactString('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe('[GEHEIM]');
    expect(redact({ apiKey: 'whatever123', nested: { text: 'ghp_abcdefghijklmnopqrstuvwxyz0123' } })).toEqual({ apiKey: '[GEHEIM]', nested: { text: '[GEHEIM]' } });
  });

  it('filters notifications by settings', () => {
    t = createTestCore();
    const got: unknown[] = [];
    t.core.bus.on('notification', (n) => got.push(n));
    const svc = createNotificationService(t.core.bus, t.core.settings);
    svc.notify({ level: 'success', category: 'task_done', title: 'a', body: 'b', projectId: null, taskId: null });
    t.core.settings.update({ notifications: { onTaskDone: false } });
    svc.notify({ level: 'success', category: 'task_done', title: 'a', body: 'b', projectId: null, taskId: null });
    expect(got).toHaveLength(1);
  });
});
