// Temporary placeholder (foundation). Replaced by the page owner.
import { FolderKanban } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';
import { paths } from '../../lib/paths';

export default function ProjectDetailPage() {
  return (
    <Page title="Projekt" back={{ to: paths.projects, label: 'Projekte' }}>
      <EmptyState icon={FolderKanban} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Projekt“." />
    </Page>
  );
}
