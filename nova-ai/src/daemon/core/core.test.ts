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
    expect(redactString('DB_PASSWORD=hunter2hunter')).toBe('DB_PASSWORD=[GEHEIM]');
    expect(redactString('MY_API_KEY = "abcdef123456"')).toContain('[GEHEIM]');
    expect(redactString('https://user:s3cretpass@example.com/repo.git')).toBe('https://user:[GEHEIM]@example.com/repo.git');
    expect(redact({ openaiApiKey: 'x1234567' })).toEqual({ openaiApiKey: '[GEHEIM]' });
  });

  it('filters notifications by settings', () => {
    t = createTestCore();
    const got: unknown[] = [];
    t.core.bus.on('notification', (n) => got.push(n));
    const svc = createNotificationService(t.core.bus, t.core.settings, t.core.db);
    svc.notify({ level: 'success', category: 'task_done', title: 'a', body: 'b', projectId: null, taskId: null });
    t.core.settings.update({ notifications: { onTaskDone: false } });
    svc.notify({ level: 'success', category: 'task_done', title: 'a', body: 'b', projectId: null, taskId: null });
    expect(got).toHaveLength(1);
    expect(svc.list()).toHaveLength(1);
    expect(svc.unreadCount()).toBe(1);
    svc.markRead();
    expect(svc.unreadCount()).toBe(0);
  });

  it('deep-merges nested settings patches', () => {
    t = createTestCore();
    t.core.settings.update({ models: { roleOverrides: { coder: { providerId: 'ollama-local', modelId: 'a' } } } });
    t.core.settings.update({ models: { roleOverrides: { planner: { providerId: 'ollama-local', modelId: 'b' } } } });
    const m = t.core.settings.section('models');
    expect(m.roleOverrides.coder?.modelId).toBe('a');
    expect(m.roleOverrides.planner?.modelId).toBe('b');
    expect(m.temperature).toBe(0.2);
  });
});
