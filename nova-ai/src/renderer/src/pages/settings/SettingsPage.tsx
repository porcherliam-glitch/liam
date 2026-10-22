// Temporary placeholder (foundation). Replaced by the page owner.
import { Settings } from 'lucide-react';
import { Page } from '../../components/layout/Page';
import { EmptyState } from '../../components/ui/EmptyState';

export default function SettingsPage() {
  return (
    <Page title="Einstellungen">
      <EmptyState icon={Settings} title="Dieser Bereich wird gerade gebaut." description="Hier entsteht die Ansicht „Einstellungen“." />
    </Page>
  );
}
