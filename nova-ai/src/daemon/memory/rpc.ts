// RPC handlers of the memory module: memory.list, memory.search, memory.add, memory.update, memory.delete,
// memory.clear, memory.export, memory.import (src/shared/rpc.ts). Params arrive zod-parsed by the router.
//
// Key decisions:
// - memory.add is always a user action (source 'user'; never limited by agentsMayWrite, taskId null).
// - memory.update forwards only the fields that were actually sent (undefined = unchanged).
// - memory.export / memory.import run inside core.operations.run (kinds memory_export / memory_import) so the UI shows
//   progress in "Laufende Vorgänge" and can cancel them; the RPC result type stays unchanged and a cancelled call
//   fails with CANCELLED. Signal/progress are passed to the service when it supports them (MemoryServiceImpl).
import type { MemoryEntry } from '@shared/schemas';
import type { RpcRegistrar, Services } from '../contracts';
import type { MemoryServiceImpl } from './memory-service';

type MemoryPatch = Partial<Pick<MemoryEntry, 'title' | 'content' | 'tags' | 'kind' | 'shareable'>>;

function io(s: Services): MemoryServiceImpl {
  // The extra (optional) options argument is ignored by implementations that do not support it.
  return s.memory as MemoryServiceImpl;
}

function projectLabel(s: Services, projectId: string): string | null {
  try {
    return s.projects.get(projectId)?.name ?? null;
  } catch {
    return null;
  }
}

function exportTitle(s: Services, projectId: string | null | undefined): string {
  if (projectId === undefined) return 'Gesamtes Gedächtnis exportieren';
  if (projectId === null) return 'Wissensdatenbank exportieren';
  const name = projectLabel(s, projectId);
  return name ? `Projektgedächtnis „${name}“ exportieren` : 'Projektgedächtnis exportieren';
}

export const registerMemoryRpc: RpcRegistrar = (router, s) => {
  router.register('memory.list', ({ projectId, kind, limit }) => s.memory.list({ projectId, kind, limit }));

  router.register('memory.search', ({ query, projectId, includeGlobal, limit }) => s.memory.search(query, { projectId, includeGlobal, limit }));

  router.register('memory.add', ({ projectId, kind, title, content, tags, shareable }) =>
    s.memory.add({ projectId, kind, title, content, tags, shareable, taskId: null }, 'user'),
  );

  router.register('memory.update', ({ id, title, content, tags, kind, shareable }) => {
    const patch: MemoryPatch = {};
    if (title !== undefined) patch.title = title;
    if (content !== undefined) patch.content = content;
    if (tags !== undefined) patch.tags = tags;
    if (kind !== undefined) patch.kind = kind;
    if (shareable !== undefined) patch.shareable = shareable;
    return s.memory.update(id, patch);
  });

  router.register('memory.delete', ({ id }) => {
    s.memory.delete(id);
    return { ok: true as const };
  });

  router.register('memory.clear', ({ projectId }) => ({ deleted: s.memory.clear(projectId) }));

  router.register('memory.export', async ({ projectId, path }) => {
    const { result } = s.core.operations.run(
      { kind: 'memory_export', title: exportTitle(s, projectId), projectId: projectId ?? null },
      (ctx) => io(s).exportTo(projectId, path, { signal: ctx.signal, onProgress: ctx.progress }),
    );
    return result;
  });

  router.register('memory.import', async ({ path }) => {
    const { result } = s.core.operations.run({ kind: 'memory_import', title: 'Gedächtnis importieren', projectId: null }, (ctx) =>
      io(s).importFrom(path, { signal: ctx.signal, onProgress: ctx.progress }),
    );
    return result;
  });
};
