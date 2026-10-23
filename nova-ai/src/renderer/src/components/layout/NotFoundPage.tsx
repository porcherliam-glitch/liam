import { useNavigate } from 'react-router';
import { Compass, LayoutDashboard } from 'lucide-react';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Page } from './Page';
import { paths } from '../../lib/paths';

/** Fallback route for unknown paths. */
export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Page title="Seite nicht gefunden">
      <EmptyState
        icon={Compass}
        title="Diese Seite gibt es nicht"
        description="Vielleicht wurde ein Projekt entfernt oder der Link ist veraltet."
        actions={
          <Button variant="primary" icon={LayoutDashboard} onClick={() => navigate(paths.dashboard)}>
            Zur Übersicht
          </Button>
        }
      />
    </Page>
  );
}
