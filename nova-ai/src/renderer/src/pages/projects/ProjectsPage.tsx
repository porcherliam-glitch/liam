// Temporary placeholder (foundation). Replaced by the page owner.
import { FolderKanban } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function ProjectsPage() {
  return (
    <Page title="Projekte">
      <EmptyState icon={FolderKanban} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Projekte“." />
    </Page>
  );
}
