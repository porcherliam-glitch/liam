// Temporary placeholder (foundation). Replaced by the page owner.
import { Wrench } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function IntegrationsPage() {
  return (
    <Page title="Werkzeuge">
      <EmptyState icon={Wrench} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Werkzeuge“." />
    </Page>
  );
}
