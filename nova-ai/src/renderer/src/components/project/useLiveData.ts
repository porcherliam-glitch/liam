// Live lists for the projects/agents/tasks pages: loaded once via RPC, then patched in place from events
// (no full re-fetch per change). Reconnects and missed events still trigger a re-fetch inside useRpc.
import { useCallback, useMemo } from 'react';
import type { AgentRun, Task } from '@shared/schemas';
import { useRpc } from '../../hooks/useRpc';
import { useNovaEvent } from '../../hooks/useEvents';
import { sortRuns, upsertById } from './taskRules';

/** All tasks (of one project, or of every project). `patch(task)` applies a mutation result immediately. */
export function useLiveTasks(projectId?: string | null) {
  const query = useRpc('tasks.list', projectId === null ? null : projectId ? { projectId, limit: 2000 } : { limit: 2000 });
  const { setData } = query;

  const patch = useCallback(
    (task: Task) => {
      if (projectId && task.projectId !== projectId) return;
      setData((prev) => (prev ? upsertById(prev, task) : prev));
    },
    [projectId, setData],
  );
  const remove = useCallback((id: string) => setData((prev) => prev?.filter((t) => t.id !== id)), [setData]);

  useNovaEvent('task.updated', patch);
  useNovaEvent('task.removed', ({ id }) => remove(id));

  const byId = useMemo(() => new Map((query.data ?? []).map((t) => [t.id, t])), [query.data]);
  return { ...query, byId, patch, remove };
}

export interface LiveRunsFilter {
  projectId?: string;
  taskId?: string;
  limit?: number;
}

/** Agent runs (active first), patched from `run.updated`. */
export function useLiveRuns(filter: LiveRunsFilter = {}, enabled = true) {
  const { projectId, taskId, limit = 300 } = filter;
  const params = enabled ? { ...(projectId ? { projectId } : {}), ...(taskId ? { taskId } : {}), limit } : null;
  const query = useRpc('agents.runs', params);
  const { setData } = query;

  useNovaEvent(
    'run.updated',
    (run: AgentRun) => {
      if (projectId && run.projectId !== projectId) return;
      if (taskId && run.taskId !== taskId) return;
      setData((prev) => (prev ? upsertById(prev, run, 'start') : prev));
    },
    enabled,
  );

  const runs = useMemo(() => (query.data ? sortRuns(query.data) : undefined), [query.data]);
  return { ...query, runs };
}
