/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setupRendererTest } from '../../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { useToastStore } from '../../../stores/toasts';
import { renderProject } from '../projectTestUtils';

setupRendererTest();

describe('Fehler', () => {
  it('lists the open errors of the project as error cards', async () => {
    renderProject('/projects/prj_pixel?tab=errors');
    const card = await screen.findByRole('article', { name: 'Blocker: Gleicher Testfehler nach 3 Versuchen' });
    expect(within(card).getByText('Was ist passiert?')).toBeTruthy();
    expect(within(card).getByText('Ist das Projekt sicher?')).toBeTruthy();
    expect(screen.queryByText('Datenbank-Migration schlägt fehl')).toBeNull();
  });

  it('marks an error as resolved', async () => {
    renderProject('/projects/prj_pixel?tab=errors');
    const card = await screen.findByRole('article', { name: 'Blocker: Gleicher Testfehler nach 3 Versuchen' });
    await userEvent.click(within(card).getByRole('button', { name: 'Als erledigt markieren' }));
    await waitFor(() => expect(getMockCalls('errors.resolve')[0]?.params).toEqual({ id: 'err_px_repeat' }));
    expect(await screen.findByText('Keine offenen Fehler')).toBeTruthy();
  });

  it('shows resolved errors on request', async () => {
    getMockDb().errors.find((e) => e.id === 'err_px_repeat')!.resolvedAt = Date.now() - 60_000;
    renderProject('/projects/prj_pixel?tab=errors');
    expect(await screen.findByText('Keine offenen Fehler')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: 'Alle, auch erledigte' }));
    expect(await screen.findByRole('article', { name: 'Blocker: Gleicher Testfehler nach 3 Versuchen' })).toBeTruthy();
    await waitFor(() => expect(getMockCalls('errors.list').at(-1)?.params).toEqual({ projectId: 'prj_pixel', includeResolved: true, limit: 300 }));
  });
});

describe('Agenten (Projekt)', () => {
  it('shows the runs of the project with the live step feed of the running agent', async () => {
    renderProject('/projects/prj_pixel?tab=agents');
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const running = within(runs).getByRole('article', { name: 'Programmierer: Spielerbewegung mit Tastatur und Sprung' });
    expect(within(running).getByText('Schreibt src/game/player.ts', { exact: false })).toBeTruthy();
    const steps = await within(running).findByRole('list', { name: 'Schritte des Agenten' });
    const step = getMockDb().steps.filter((s) => s.runId === 'run_px3').at(-1)!;
    await waitFor(() => {
      act(() => emitMockEvent({ type: 'run.step', payload: { ...step, id: 99_999, ts: Date.now(), kind: 'message', summary: 'Neuer Live-Schritt' } }));
      expect(within(steps).getByText('Neuer Live-Schritt')).toBeTruthy();
    });
    // Runs of other projects are not listed.
    expect(within(runs).queryByText('Tests für die Suche schreiben und ausführen')).toBeNull();
  });

  it('pauses the task of a running agent', async () => {
    renderProject('/projects/prj_pixel?tab=agents');
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const running = within(runs).getByRole('article', { name: 'Programmierer: Spielerbewegung mit Tastatur und Sprung' });
    await userEvent.click(within(running).getByRole('button', { name: 'Pausieren' }));
    await waitFor(() => expect(getMockCalls('tasks.pause')[0]?.params).toEqual({ id: 'task_px3' }));
    await waitFor(() => expect(within(running).getAllByText('Pausiert').length).toBeGreaterThan(0));
  });

  it('filters runs by state', async () => {
    renderProject('/projects/prj_pixel?tab=agents');
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    expect(within(runs).getByText('Code-Prüfung: Grundgerüst')).toBeTruthy();
    await userEvent.click(screen.getByRole('radio', { name: /Arbeitet/ }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Läufe' })).queryByText('Code-Prüfung: Grundgerüst')).toBeNull());
  });

  it('shows the empty state for a project without runs', async () => {
    mockHandlers.set('agents.runs', () => []);
    renderProject('/projects/prj_aether?tab=agents');
    expect(await screen.findByText('Noch kein Agent hat an diesem Projekt gearbeitet')).toBeTruthy();
  });

  it('shows the error toast when a control fails', async () => {
    mockHandlers.set('tasks.stop', () => {
      throw new MockRpcError('CONFLICT', 'Die Aufgabe ist bereits beendet.');
    });
    renderProject('/projects/prj_pixel?tab=agents');
    const runs = await screen.findByRole('list', { name: 'Läufe' });
    const running = within(runs).getByRole('article', { name: 'Programmierer: Spielerbewegung mit Tastatur und Sprung' });
    await userEvent.click(within(running).getByRole('button', { name: 'Stoppen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aufgabe stoppen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stoppen' }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Die Aufgabe ist bereits beendet.'));
  });
});
