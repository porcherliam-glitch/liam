import { useMemo } from 'react';
import type { ProjectSummary } from '@shared/schemas';
import { useRpc } from './useRpc';

/**
 * All (non-archived) projects, kept fresh via project events.
 * @example const { data: projects } = useProjects();
 */
export function useProjects(options: { includeArchived?: boolean } = {}) {
  return useRpc('projects.list', { includeArchived: options.includeArchived ?? false }, { refetchOn: ['project.updated', 'project.removed', 'task.updated', 'task.removed'] });
}

/**
 * Map projectId -> project name (for lists that only carry ids).
 * @example const names = useProjectNames(); names.get(run.projectId) ?? 'Unbekanntes Projekt'
 */
export function useProjectNames(): Map<string, string> {
  const { data } = useRpc('projects.list', { includeArchived: true }, { refetchOn: ['project.updated', 'project.removed'] });
  return useMemo(() => new Map((data ?? []).map((p: ProjectSummary) => [p.id, p.name])), [data]);
}
