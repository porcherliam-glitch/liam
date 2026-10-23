// Test helpers for the project pages (only imported by *.test.tsx files).
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { initDaemonStore } from '../../stores/daemon';
import ProjectDetailPage from './ProjectDetailPage';

function Location() {
  const l = useLocation();
  return <output aria-label="Adresse">{`${l.pathname}${l.search}`}</output>;
}

/** Renders the project detail page at `route` (plus a /projects route and the current location). */
export function renderProject(route: string) {
  initDaemonStore();
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects" element={<p>Projektliste</p>} />
      </Routes>
      <Location />
    </MemoryRouter>,
  );
}

/** Current location (pathname + search) of the router rendered by renderProject. */
export const currentLocation = () => screen.getByRole('status', { name: 'Adresse' }).textContent;

/** The Card (section) with the given heading. */
export async function findCard(name: string | RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name });
  return heading.closest('section') as HTMLElement;
}
