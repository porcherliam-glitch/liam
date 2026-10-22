// Aufgaben (UI-SPEC §4): global task board across all projects – filters (project, status, role, text), sorting by
// priority, priority selector, all task controls, details and the create/edit dialog (shared TaskBoard).
import { Page } from '../../components/layout/Page';
import { TaskBoard } from '../../components/project';

export default function TasksPage() {
  return (
    <Page
      title="Aufgaben"
      description="Alle Aufgaben aller Projekte. Was Aufmerksamkeit braucht, steht oben – zum Beispiel blockierte Aufgaben oder Fragen der Agenten."
    >
      <TaskBoard storageKey="tasks.global" />
    </Page>
  );
}
