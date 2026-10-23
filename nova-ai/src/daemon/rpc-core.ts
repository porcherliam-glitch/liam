// RPC handlers owned by the integrator: daemon lifecycle, logs, diagnostics and settings.
import { statSync } from 'node:fs';
import { atomicWriteFile } from './core/fs-atomic';
import { join } from 'node:path';
import { cpus, totalmem, freemem, release, type as osType, arch } from 'node:os';
import type { DaemonStatus } from '@shared/schemas';
import type { RpcRouter, Services } from './contracts';
import { redact } from './core/redact';
import { errorMessage, notFound } from './core/errors';

export interface CoreRpcHooks {
  status(): DaemonStatus;
  /** Graceful shutdown; resolves after the response was sent. */
  requestShutdown(reason: string): void;
}

function timestamp(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Collects a redacted diagnostics bundle. Each part is optional: a failing source is recorded, not fatal. */
export async function buildDiagnostics(s: Services, hooks: CoreRpcHooks): Promise<Record<string, unknown>> {
  const settings = s.core.settings.get();
  const parts: Record<string, unknown> = {
    format: 'nova-diagnostics',
    version: 1,
    createdAt: new Date(s.core.clock.now()).toISOString(),
    daemon: hooks.status(),
  };
  const safe = async (key: string, fn: () => unknown | Promise<unknown>) => {
    try {
      parts[key] = await fn();
    } catch (e) {
      parts[key] = { error: errorMessage(e) };
    }
  };
  if (settings.diagnostics.includeSystemInfo) {
    await safe('system', () => ({
      os: `${osType()} ${release()} ${arch()}`,
      cpu: cpus()[0]?.model ?? 'unbekannt',
      cores: cpus().length,
      totalMemBytes: totalmem(),
      freeMemBytes: freemem(),
      node: process.versions.node,
      electron: process.versions.electron ?? null,
      sqlite: process.versions.sqlite ?? null,
    }));
  }
  await safe('settings', () => settings);
  await safe('work', () => s.work.status());
  await safe('resources', () => s.resources.latest());
  await safe('integrations', () => s.integrations.list(false));
  await safe('providers', () => s.providers.list());
  await safe('errors', () => s.core.errors.list({ includeResolved: true, limit: 200 }));
  await safe('dbStats', () => {
    const tables = s.core.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'memory_fts%'");
    const counts: Record<string, number> = {};
    for (const t of tables) counts[t.name] = Number(s.core.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${t.name}"`)?.n ?? 0);
    return { counts, sizeBytes: statSync(s.core.paths.db).size };
  });
  await safe('recentLogs', () => s.core.logs.tail(2000));
  await safe('logFiles', () => s.core.logs.readFiles(1_000_000));
  return redact(parts);
}

export function registerCoreRpc(router: RpcRouter, s: Services, hooks: CoreRpcHooks): void {
  router.register('daemon.status', () => hooks.status());

  router.register('daemon.shutdown', (params) => {
    s.core.log.info('Herunterfahren angefordert', { reason: params.reason });
    hooks.requestShutdown(params.reason);
    return { ok: true as const };
  });

  router.register('daemon.logs', (params) => s.core.logs.tail(params.limit, params.level, params.scope));

  router.register('daemon.diagnostics', async () => {
    const { result } = s.core.operations.run({ kind: 'diagnostics', title: 'Diagnose-Paket erstellen', cancellable: false }, async () => {
      const bundle = await buildDiagnostics(s, hooks);
      const path = join(s.core.paths.diagnostics, `diagnose-${timestamp(s.core.clock.now())}.json`);
      atomicWriteFile(path, JSON.stringify(bundle, null, 2));
      return { path, sizeBytes: statSync(path).size };
    });
    return result;
  });

  router.register('notifications.list', (params) => s.notifications.list({ unreadOnly: params.unreadOnly, limit: params.limit }));
  router.register('notifications.markRead', (params) => {
    s.notifications.markRead(params.ids);
    return { ok: true as const };
  });

  router.register('operations.list', (params) => s.core.operations.list(params.activeOnly));
  router.register('operations.get', (params) => {
    const op = s.core.operations.get(params.id);
    if (!op) throw notFound('Vorgang', params.id);
    return op;
  });
  router.register('operations.cancel', (params) => {
    const op = s.core.operations.cancel(params.id);
    if (!op) throw notFound('Vorgang', params.id);
    return op;
  });

  router.register('settings.get', () => s.core.settings.get());
  router.register('settings.update', (patch) => s.core.settings.update(patch));
}
