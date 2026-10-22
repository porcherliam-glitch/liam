// Temporary placeholder (foundation). Replaced by the page owner.
import { BookOpen } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function KnowledgePage() {
  return (
    <Page title="Wissen">
      <EmptyState icon={BookOpen} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Wissen“." />
    </Page>
  );
}
