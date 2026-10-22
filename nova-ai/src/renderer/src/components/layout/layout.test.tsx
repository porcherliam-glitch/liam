/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, setMockConnection } from '../../lib/mock-bridge';
import { useUiStore } from '../../stores/ui';

setupRendererTest();

describe('AppShell', () => {
  it('renders the navigation with the pending approvals badge and the daemon pill', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    for (const label of ['Übersicht', 'Projekte', 'Agenten', 'Aufgaben', 'Modelle', 'Kosten', 'Wissen', 'Werkzeuge', 'Einstellungen', 'Protokolle']) {
      expect(within(nav).getByRole('link', { name: new RegExp(label) })).toBeTruthy();
    }
    expect(await within(nav).findByRole('link', { name: 'Freigaben, 2 offen' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: /Hintergrunddienst: Läuft/ })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Übersicht' })).toBeTruthy();
  });

  it('navigates via the sidebar and lazy-loads pages', async () => {
    renderApp('/');
    await userEvent.click(screen.getByRole('link', { name: 'Projekte' }));
    expect(await screen.findByText('Dieser Bereich wird gerade gebaut.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Projekte' })).toBeTruthy();
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Hauptnavigation' })).getByRole('link', { name: /Freigaben/ }));
    expect(await screen.findByText('Offene Freigaben')).toBeTruthy();
  });

  it('shows the not-found page for unknown routes', async () => {
    renderApp('/gibt-es-nicht');
    expect(await screen.findByText('Diese Seite gibt es nicht')).toBeTruthy();
  });

  it('collapses the sidebar', async () => {
    renderApp('/');
    await userEvent.click(screen.getByRole('button', { name: 'Seitenleiste einklappen' }));
    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(screen.getByRole('button', { name: 'Seitenleiste ausklappen' })).toBeTruthy();
  });

  it('updates the approvals badge on approval events', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    await within(nav).findByRole('link', { name: 'Freigaben, 2 offen' });
    const a = getMockDb().approvals.find((x) => x.id === 'apr_px_cmd')!;
    a.status = 'approved';
    act(() => emitMockEvent({ type: 'approval.updated', payload: a }));
    expect(await within(nav).findByRole('link', { name: 'Freigaben, 1 offen' }, { timeout: 2000 })).toBeTruthy();
  });

  it('disables page actions and greys out content while disconnected', async () => {
    renderApp('/approvals');
    const approve = (await screen.findAllByRole('button', { name: /Einmal erlauben/ }))[0];
    expect(approve.closest('fieldset')?.disabled).toBe(false);
    act(() => setMockConnection({ state: 'reconnecting', message: 'Verbindung unterbrochen.' }));
    expect(await screen.findByText('Verbindung zum Hintergrunddienst unterbrochen')).toBeTruthy();
    expect(approve.closest('fieldset')?.disabled).toBe(true);
    expect(screen.getByRole('main').className).toContain('opacity-60');
    expect(screen.getByRole('link', { name: /Hintergrunddienst: Getrennt/ })).toBeTruthy();
  });

  it('shows the unclean-shutdown notice and lets it be dismissed', async () => {
    renderApp('/');
    expect(await screen.findByText(/NOVA wurde zuletzt nicht sauber beendet/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }));
    expect(screen.queryByText(/NOVA wurde zuletzt nicht sauber beendet/)).toBeNull();
  });
});

describe('top bar menus', () => {
  it('notifications menu lists notifications and marks all as read', async () => {
    renderApp('/');
    const bell = await screen.findByRole('button', { name: 'Meldungen: 4 ungelesen' });
    await userEvent.click(bell);
    const panel = await screen.findByRole('dialog', { name: 'Meldungen' });
    expect(await within(panel).findByText('Ordner legacy/ löschen (Rezept-API)')).toBeTruthy();
    await userEvent.click(within(panel).getByRole('button', { name: /Alle gelesen/ }));
    await waitFor(() => expect(getMockCalls('notifications.markRead')[0]?.params).toEqual({}));
    expect(await screen.findByRole('button', { name: 'Meldungen' })).toBeTruthy();
  });

  it('operations menu shows running operations and cancels them', async () => {
    renderApp('/');
    const trigger = await screen.findByRole('button', { name: /1 Vorgang läuft/ });
    await userEvent.click(trigger);
    const panel = await screen.findByRole('dialog', { name: 'Laufende Vorgänge' });
    expect(within(panel).getByText('Projektkopie von Pixel-Abenteuer')).toBeTruthy();
    expect(within(panel).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('35');
    await userEvent.click(within(panel).getByRole('button', { name: /Abbrechen/ }));
    await waitFor(() => expect(getMockCalls('operations.cancel')[0]?.params).toEqual({ id: 'op_demo_snapshot' }));
    expect(await within(panel).findByText('Vom Benutzer abgebrochen.')).toBeTruthy();
  });

  it('work controls in the top bar pause the global work cycle', async () => {
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: /Pausieren/ }));
    await waitFor(() => expect(getMockCalls('work.pause')).toHaveLength(1));
    expect(await screen.findByRole('button', { name: /Fortsetzen/ })).toBeTruthy();
  });
});
