// Route paths (HashRouter). Use these helpers instead of building URLs by hand.

export type ProjectTab = 'overview' | 'tasks' | 'agents' | 'changes' | 'checks' | 'memory' | 'errors';

function query(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const paths = {
  dashboard: '/',
  projects: '/projects',
  /** Projects page with the "Neues Projekt" dialog opened. */
  newProject: '/projects?new=1',
  /** Project detail; `task` highlights one task in the "tasks" tab. */
  project: (projectId: string, opts: { tab?: ProjectTab; task?: string } = {}) => `/projects/${encodeURIComponent(projectId)}${query({ tab: opts.tab, task: opts.task })}`,
  /** Studio; `file` + `line` jump to a position (e.g. a test failure). */
  studio: (projectId: string, opts: { file?: string | null; line?: number | null } = {}) =>
    `/projects/${encodeURIComponent(projectId)}/studio${query({ file: opts.file ?? undefined, line: opts.line ?? undefined })}`,
  agents: '/agents',
  tasks: '/tasks',
  approvals: '/approvals',
  /** 3D-Werkstatt (local text/image → 3D through ComfyUI). */
  threed: '/threed',
  models: '/models',
  /** Models page scrolled to the "3D-Modelle" card. */
  models3d: '/models?section=3d',
  costs: '/costs',
  knowledge: '/knowledge',
  integrations: '/integrations',
  settings: '/settings',
  logs: '/logs',
} as const;
