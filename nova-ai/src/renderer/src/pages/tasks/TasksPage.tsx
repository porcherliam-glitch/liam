// Temporary placeholder (foundation). Replaced by the page owner.
import { ListTodo } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function TasksPage() {
  return (
    <Page title="Aufgaben">
      <EmptyState icon={ListTodo} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Aufgaben“." />
    </Page>
  );
}
