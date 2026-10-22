/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError, setMockHandler } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import AgentsPage from './AgentsPage';

setupRendererTest();

const renderPage = () => renderWithRouter(<AgentsPage />, { route: '/agents' });

describe('AgentsPage', () => {
  it('lists runs of all projects, active first, with project, task, model and live runtime', async () => {
    renderPage();
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const cards = within(runs).getAllByRole('article');
    const firstTwo = cards.slice(0, 2).map((c) => c.getAttribute('aria-label'));
    expect(firstTwo).toEqual(expect.arrayContaining(['Programmierer: Spielerbewegung mit Tastatur und Sprung', 'Tester: Tests für die Suche schreiben und ausführen']));
    const px3 = within(runs).getByRole('article', { name: 'Programmierer: Spielerbewegung mit Tastatur und Sprung' });
    expect(within(px3).getByRole('link', { name: 'Pixel-Abenteuer' })).toBeTruthy();
    expect(within(px3).getByText('qwen2.5-coder:14b')).toBeTruthy();
    expect(within(px3).getByText(/Letzte Aktion:/)).toBeTruthy();
    expect(within(px3).getByTitle(/Aktive Laufzeit/)).toBeTruthy();
  });

  it('shows blockers with the matching action', async () => {
    renderPage();
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const blocked = within(runs).getByRole('article', { name: 'Programmierer: Datenbank-Migration für den Einkaufszettel' });
    expect(within(blocked).getByText('Testdatenbank enthält eine alte Tabelle „shopping_items“.')).toBeTruthy();
    expect(within(blocked).getByRole('link', { name: /Frage beantworten/ }).getAttribute('href')).toBe('/projects/prj_rezept?tab=tasks&task=task_rz4');
  });

  it('pauses and resumes the task of an agent', async () => {
    renderPage();
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const card = () => within(screen.getByRole('list', { name: 'Läufe' })).getByRole('article', { name: 'Tester: Tests für die Suche schreiben und ausführen' });
    expect(runs).toBeTruthy();
    await userEvent.click(within(card()).getByRole('button', { name: 'Pausieren' }));
    await waitFor(() => expect(getMockCalls('tasks.pause')[0]?.params).toEqual({ id: 'task_rz3' }));
    await userEvent.click(await within(card()).findByRole('button', { name: 'Fortsetzen' }));
    await waitFor(() => expect(getMockCalls('tasks.resume')[0]?.params).toEqual({ id: 'task_rz3' }));
  });

  it('changes the priority of the task', async () => {
    renderPage();
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const card = within(runs).getByRole('article', { name: 'Programmierer: Spielerbewegung mit Tastatur und Sprung' });
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: 'Priorität' }), '3');
    await waitFor(() => expect(getMockCalls('tasks.setPriority')[0]?.params).toEqual({ id: 'task_px3', priority: 3 }));
  });

  it('filters by state and project', async () => {
    renderPage();
    await screen.findByRole('list', { name: 'Läufe' });
    await userEvent.click(screen.getByRole('radio', { name: /Beendet/ }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Läufe' })).queryByText('Spielerbewegung mit Tastatur und Sprung')).toBeNull());
    expect(within(screen.getByRole('list', { name: 'Läufe' })).getByText('Code-Prüfung: Grundgerüst')).toBeTruthy();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Projekt' }), 'prj_rezept');
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Läufe' })).queryByText('Code-Prüfung: Grundgerüst')).toBeNull());
  });

  it('shows the agent roles', async () => {
    renderPage();
    const roles = await screen.findByRole('list', { name: 'Rollen' });
    expect(within(roles).getByText('Planer')).toBeTruthy();
    expect(within(roles).getByText('agents.coder.v1')).toBeTruthy();
    expect(within(within(roles).getByRole('list', { name: 'Werkzeuge: Prüfer' })).getByText('git_diff')).toBeTruthy();
  });

  it('adds new steps to the live activity feed', async () => {
    renderPage();
    const feed = await screen.findByRole('list', { name: 'Live-Aktivität' });
    const step = getMockDb().steps.find((s) => s.runId === 'run_rz3')!;
    await waitFor(() => {
      act(() => emitMockEvent({ type: 'run.step', payload: { ...step, id: 77_777, ts: Date.now(), summary: 'Führt die Suche-Tests erneut aus' } }));
      expect(within(feed).getByText('Führt die Suche-Tests erneut aus')).toBeTruthy();
    });
  });

  it('shows the empty state without runs', async () => {
    setMockHandler('agents.runs', () => []);
    renderPage();
    expect(await screen.findByText('Noch keine Agenten-Läufe')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zu den Projekten' })).toBeTruthy();
  });

  it('shows the error toast when a control fails', async () => {
    mockHandlers.set('tasks.pause', () => {
      throw new MockRpcError('CONFLICT', 'Nur laufende oder wartende Aufgaben können pausiert werden.');
    });
    renderPage();
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    await userEvent.click(within(within(runs).getByRole('article', { name: 'Programmierer: Spielerbewegung mit Tastatur und Sprung' })).getByRole('button', { name: 'Pausieren' }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Nur laufende oder wartende Aufgaben können pausiert werden.'));
  });
});
