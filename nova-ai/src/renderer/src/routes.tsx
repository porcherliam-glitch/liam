// Route table (HashRouter, UI-SPEC §2). Page modules are lazy-loaded; each exports a default component.
import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import DashboardPage from './pages/DashboardPage';

const ApprovalsPage = lazy(() => import('./pages/ApprovalsPage'));
const LogsPage = lazy(() => import('./pages/LogsPage'));
const ProjectsPage = lazy(() => import('./pages/projects/ProjectsPage'));
const ProjectDetailPage = lazy(() => import('./pages/projects/ProjectDetailPage'));
const StudioPage = lazy(() => import('./pages/studio/StudioPage'));
const AgentsPage = lazy(() => import('./pages/agents/AgentsPage'));
const TasksPage = lazy(() => import('./pages/tasks/TasksPage'));
const ModelsPage = lazy(() => import('./pages/models/ModelsPage'));
const CostsPage = lazy(() => import('./pages/costs/CostsPage'));
const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage'));
const IntegrationsPage = lazy(() => import('./pages/integrations/IntegrationsPage'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));
const ThreeDPage = lazy(() => import('./pages/threed/ThreeDPage'));
const NotFoundPage = lazy(() => import('./components/layout/NotFoundPage'));

/** All app routes inside the AppShell. Use `paths` (lib/paths.ts) to link to them. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="projects/:projectId/studio" element={<StudioPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="threed" element={<ThreeDPage />} />
        <Route path="models" element={<ModelsPage />} />
        <Route path="costs" element={<CostsPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="logs" element={<LogsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
