// Temporary placeholder (foundation). Replaced by the page owner.
import { Code } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';
import { paths } from '../../lib/paths';

export default function StudioPage() {
  return (
    <Page title="Studio" back={{ to: paths.projects, label: 'Projekte' }}>
      <EmptyState icon={Code} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Studio“." />
    </Page>
  );
}
