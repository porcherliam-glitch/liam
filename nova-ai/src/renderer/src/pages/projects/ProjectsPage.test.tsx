/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError, setMockHandler } from '../../lib/mock-bridge';
import { TRUST_PROJECT_TEXT } from '../../lib/texts';
import { useToastStore } from '../../stores/toasts';
import ProjectsPage, { sortProjects } from './ProjectsPage';

setupRendererTest();

const renderPage = (route = '/projects') => renderWithRouter(<ProjectsPage />, { route, path: '/projects' });

describe('ProjectsPage', () => {
  it('shows every project with progress, task counts, errors and the work switch', async () => {
    renderPage();
    const pixel = await screen.findByRole('article', { name: 'Pixel-Abenteuer' });
    expect(within(pixel).getByText('Web-Anwendung')).toBeTruthy();
    expect(within(pixel).getByRole('progressbar', { name: 'Fortschritt von Pixel-Abenteuer' })).toBeTruthy();
    expect(within(pixel).getByRole('link', { name: /^Offen: \d+$/ })).toBeTruthy();
    expect(within(pixel).getByRole('link', { name: 'Gescheitert: 1' })).toBeTruthy();
    expect(within(pixel).getByRole('switch', { name: 'Autonome Arbeit für „Pixel-Abenteuer“' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('article', { name: 'Rezept-API' })).toBeTruthy();
    const aether = screen.getByRole('article', { name: 'Aetherfall' });
    expect(within(aether).getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('shows the first-start empty state and opens the create dialog from it', async () => {
    setMockHandler('projects.list', () => []);
    renderPage();
    expect(await screen.findByText('Noch kein Projekt')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Projekt erstellen' }));
    expect(await screen.findByRole('dialog', { name: 'Neues Projekt' })).toBeTruthy();
  });

  it('opens the create dialog for ?new=1', async () => {
    renderPage('/projects?new=1');
    expect(await screen.findByRole('dialog', { name: 'Neues Projekt' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Beschreiben/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('filters projects by search text', async () => {
    renderPage();
    await screen.findByRole('article', { name: 'Pixel-Abenteuer' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Projekte durchsuchen' }), 'unity');
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Pixel-Abenteuer' })).toBeNull());
    expect(screen.getByRole('article', { name: 'Aetherfall' })).toBeTruthy();
  });

  it('switches autonomous work off after confirmation', async () => {
    renderPage();
    const pixel = await screen.findByRole('article', { name: 'Pixel-Abenteuer' });
    await userEvent.click(within(pixel).getByRole('switch'));
    const dialog = await screen.findByRole('dialog', { name: 'Autonome Arbeit ausschalten?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ausschalten' }));
    await waitFor(() => expect(getMockCalls('projects.setWork')[0]?.params).toEqual({ id: 'prj_pixel', enabled: false }));
    await waitFor(() => expect(within(screen.getByRole('article', { name: 'Pixel-Abenteuer' })).getByRole('switch').getAttribute('aria-checked')).toBe('false'));
  });

  it('asks for trust before enabling work on an opened project the first time', async () => {
    const aether = getMockDb().projects.find((p) => p.id === 'prj_aether')!;
    aether.origin = 'open';
    renderPage();
    const card = await screen.findByRole('article', { name: 'Aetherfall' });
    await userEvent.click(within(card).getByRole('switch'));
    const dialog = await screen.findByRole('dialog', { name: 'Autonome Arbeit einschalten?' });
    expect(within(dialog).getByText(TRUST_PROJECT_TEXT)).toBeTruthy();
    expect(getMockCalls('projects.setWork')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Projekt vertrauen und einschalten' }));
    await waitFor(() => expect(getMockCalls('projects.setWork')[0]?.params).toEqual({ id: 'prj_aether', enabled: true }));
  });

  it('enables work on a new project without the trust question', async () => {
    const aether = getMockDb().projects.find((p) => p.id === 'prj_aether')!;
    aether.origin = 'new';
    renderPage();
    const card = await screen.findByRole('article', { name: 'Aetherfall' });
    await userEvent.click(within(card).getByRole('switch'));
    await waitFor(() => expect(getMockCalls('projects.setWork')[0]?.params).toEqual({ id: 'prj_aether', enabled: true }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows an error toast when switching fails', async () => {
    const aether = getMockDb().projects.find((p) => p.id === 'prj_aether')!;
    aether.origin = 'new';
    mockHandlers.set('projects.setWork', () => {
      throw new MockRpcError('PATH_OUTSIDE_PROJECT', 'Der Projektordner fehlt.');
    });
    renderPage();
    const card = await screen.findByRole('article', { name: 'Aetherfall' });
    await userEvent.click(within(card).getByRole('switch'));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Der Projektordner fehlt.'));
  });

  it('shows a load error with retry', async () => {
    let fail = true;
    mockHandlers.set('projects.list', () => {
      if (fail) throw new MockRpcError('INTERNAL', 'Datenbank nicht erreichbar.');
      return [];
    });
    renderPage();
    expect(await screen.findByText('Datenbank nicht erreichbar.')).toBeTruthy();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByText('Noch kein Projekt')).toBeTruthy();
  });
});

describe('sortProjects', () => {
  it('puts projects that need attention first', () => {
    const base = getMockDb().projects;
    expect(base.length).toBeGreaterThan(0);
    const a = { name: 'A', failedTasks: 0, blockedTasks: 0, openErrors: 0, pendingApprovals: 0, pathMissing: false, lastActivityAt: 2, updatedAt: 2, progress: 10 };
    const b = { ...a, name: 'B', failedTasks: 2, lastActivityAt: 1 };
    const sorted = sortProjects([a, b] as never, 'attention');
    expect(sorted.map((p) => p.name)).toEqual(['B', 'A']);
    expect(sortProjects([b, a] as never, 'name').map((p) => p.name)).toEqual(['A', 'B']);
  });
});
