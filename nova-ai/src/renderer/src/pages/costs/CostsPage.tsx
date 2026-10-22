// Temporary placeholder (foundation). Replaced by the page owner.
import { Coins } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function CostsPage() {
  return (
    <Page title="Kosten">
      <EmptyState icon={Coins} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Kosten“." />
    </Page>
  );
}
