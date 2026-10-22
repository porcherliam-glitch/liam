/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../lib/mock-bridge';
import { useToastStore } from '../stores/toasts';
import ApprovalsPage from './ApprovalsPage';

setupRendererTest();

describe('ApprovalsPage', () => {
  it('lists pending approvals first, then history and rules', async () => {
    renderWithRouter(<ApprovalsPage />);
    expect(await screen.findByRole('article', { name: 'Freigabe: Playwright-Browser installieren' })).toBeTruthy();
    expect(await screen.findByRole('article', { name: 'Freigabe: Ordner legacy/ löschen' })).toBeTruthy();
    const history = await screen.findByRole('table', { name: 'Verlauf der Freigaben' });
    expect(within(history).getByText('Änderungen hochladen (git push)')).toBeTruthy();
    const rules = await screen.findByRole('table', { name: 'Dauerhafte Freigaben' });
    expect(within(rules).getByText('Befehl „npm run db:migrate“ im Projekt Rezept-API')).toBeTruthy();
  });

  it('approving moves the card out of the pending list', async () => {
    renderWithRouter(<ApprovalsPage />);
    const card = await screen.findByRole('article', { name: 'Freigabe: Playwright-Browser installieren' });
    await userEvent.click(within(card).getByRole('button', { name: /Einmal erlauben/ }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'Freigabe: Playwright-Browser installieren' })).toBeNull(), { timeout: 3000 });
    expect(getMockCalls('approvals.decide')[0].params).toEqual({ id: 'apr_px_cmd', decision: 'approve', scope: 'once' });
    // The task continues.
    expect(getMockDb().tasks.find((t) => t.id === 'task_px4')?.status).toBe('running');
  });

  it('empty state when nothing is pending', async () => {
    for (const a of getMockDb().approvals) if (a.status === 'pending') a.status = 'expired';
    renderWithRouter(<ApprovalsPage />);
    expect(await screen.findByText('Keine offenen Freigaben')).toBeTruthy();
  });

  it('filters the history', async () => {
    renderWithRouter(<ApprovalsPage />);
    const history = await screen.findByRole('table', { name: 'Verlauf der Freigaben' });
    await userEvent.click(screen.getByRole('radio', { name: /Abgelehnt/ }));
    expect(within(history).getByText('Änderungen hochladen (git push)')).toBeTruthy();
    expect(within(history).queryByText('Datenbank-Migration ausführen')).toBeNull();
  });

  it('deletes a rule after confirmation', async () => {
    renderWithRouter(<ApprovalsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Regel entfernen: Zugriff auf cdn.jsdelivr.net (alle Projekte)' }));
    const dialog = screen.getByRole('dialog', { name: 'Regel entfernen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Regel entfernen' }));
    await waitFor(() => expect(getMockCalls('approvals.deleteRule')[0]?.params).toEqual({ id: 'rule_2' }));
    await waitFor(() => expect(screen.queryByText('Zugriff auf cdn.jsdelivr.net (alle Projekte)')).toBeNull(), { timeout: 3000 });
  });

  it('shows a toast when a decision fails', async () => {
    mockHandlers.set('approvals.decide', () => {
      throw new MockRpcError('CONFLICT', 'Diese Freigabe wurde bereits entschieden.');
    });
    renderWithRouter(<ApprovalsPage />);
    const card = await screen.findByRole('article', { name: 'Freigabe: Ordner legacy/ löschen' });
    await userEvent.click(within(card).getByRole('button', { name: /Ablehnen/ }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Diese Freigabe wurde bereits entschieden.'));
  });
});
