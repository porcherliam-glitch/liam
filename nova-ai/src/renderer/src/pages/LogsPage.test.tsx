/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../lib/mock-bridge';
import { useToastStore } from '../stores/toasts';
import LogsPage from './LogsPage';

setupRendererTest();

describe('LogsPage', () => {
  it('loads daemon logs with the level filter', async () => {
    renderWithRouter(<LogsPage />);
    const log = await screen.findByRole('log', { name: 'Protokolleinträge' });
    expect(await within(log).findByText('Grafikspeicher zu 91 % belegt – Parallelität auf 2 gesenkt')).toBeTruthy();
    expect(getMockCalls('daemon.logs')[0].params).toEqual({ limit: 1500, level: 'info', scope: undefined });
    // Debug entries are hidden at level "Info".
    expect(within(log).queryByText(/dashboard\.summary/)).toBeNull();
  });

  it('switches to errors only and filters by scope', async () => {
    renderWithRouter(<LogsPage />);
    await screen.findByRole('log');
    await userEvent.click(screen.getByRole('radio', { name: 'Fehler' }));
    await waitFor(() => expect(getMockCalls('daemon.logs').at(-1)?.params).toMatchObject({ level: 'error' }));
    const log = screen.getByRole('log');
    await waitFor(() => expect(within(log).queryByText(/Grafikspeicher/)).toBeNull());
    expect(within(log).getByText('Befehl fehlgeschlagen: npm run db:migrate (Exit-Code 1)')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Bereich'), 'scheduler');
    await waitFor(() => expect(getMockCalls('daemon.logs').at(-1)?.params).toMatchObject({ scope: 'scheduler' }));
  });

  it('appends live log events', async () => {
    renderWithRouter(<LogsPage />);
    const log = await screen.findByRole('log');
    await within(log).findByText(/Grafikspeicher/);
    const ts = Date.now();
    await waitFor(() => {
      act(() => emitMockEvent({ type: 'log', payload: { level: 'error', scope: 'checks', msg: 'Build abgebrochen: Datenträger voll', ts } }));
      expect(within(log).getAllByText('Build abgebrochen: Datenträger voll').length).toBeGreaterThan(0);
    });
  });

  it('searches the loaded entries and shows an empty state', async () => {
    renderWithRouter(<LogsPage />);
    await screen.findByRole('log');
    await userEvent.type(screen.getByLabelText('Suchen'), 'gibt es nicht');
    expect(await screen.findByText('Keine Einträge für diese Filter')).toBeTruthy();
  });

  it('creates a diagnostics bundle and shows its path', async () => {
    renderWithRouter(<LogsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Diagnose-Paket erstellen/ }));
    expect(await screen.findByText(/Diagnose-Paket erstellt \(/)).toBeTruthy();
    expect(screen.getByText(/nova-diagnose-.*\.json/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Im Explorer zeigen/ })).toBeTruthy();
    expect(getMockCalls('daemon.diagnostics')).toHaveLength(1);
  });

  it('shows an error toast when the diagnostics bundle fails', async () => {
    mockHandlers.set('daemon.diagnostics', () => {
      throw new MockRpcError('INTERNAL', 'Kein Speicherplatz');
    });
    renderWithRouter(<LogsPage />);
    await userEvent.click(screen.getByRole('button', { name: /Diagnose-Paket erstellen/ }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ tone: 'error', title: 'Diagnose-Paket konnte nicht erstellt werden', message: 'Kein Speicherplatz' }));
  });

  it('empty state without entries', async () => {
    getMockDb().logs = [];
    renderWithRouter(<LogsPage />);
    expect(await screen.findByText('Noch keine Protokolleinträge')).toBeTruthy();
  });
});
