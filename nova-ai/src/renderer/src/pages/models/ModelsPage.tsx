// Temporary placeholder (foundation). Replaced by the page owner.
import { Cpu } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function ModelsPage() {
  return (
    <Page title="Modelle">
      <EmptyState icon={Cpu} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Modelle“." />
    </Page>
  );
}
