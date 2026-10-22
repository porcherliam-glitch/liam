// Temporary placeholder (foundation). Replaced by the page owner.
import { Bot } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function AgentsPage() {
  return (
    <Page title="Agenten">
      <EmptyState icon={Bot} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Agenten“." />
    </Page>
  );
}
