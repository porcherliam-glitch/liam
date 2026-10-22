/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import IntegrationsPage from './IntegrationsPage';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);
const card = (name: string) => screen.getByRole('heading', { name, level: 3 }).closest('article')!;

async function renderPage() {
  renderWithRouter(<IntegrationsPage />, { route: '/integrations' });
  await screen.findByRole('heading', { name: 'Git', level: 3 });
}

describe('IntegrationsPage', () => {
  it('groups the tools by category with availability, version, path and message', async () => {
    await renderPage();
    expect(screen.getByRole('heading', { name: /Versionsverwaltung/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Spiel-Engines/ })).toBeTruthy();
    expect(screen.getByText(/von 14/)).toBeTruthy();
    const git = card('Git');
    expect(within(git).getByText('Verfügbar')).toBeTruthy();
    expect(within(git).getByText('Version 2.47.1')).toBeTruthy();
    expect(within(git).getByText('C:\\Program Files\\Git\\cmd\\git.exe')).toBeTruthy();
    const unity = card('Unity');
    expect(within(unity).getByText('Gefundene Installationen')).toBeTruthy();
    expect(within(unity).getByText('6000.0.84f1')).toBeTruthy();
    expect(within(unity).getByText('wird verwendet')).toBeTruthy();
    const dotnet = card('.NET SDK');
    expect(within(dotnet).getByText('Nicht verfügbar')).toBeTruthy();
    expect(within(dotnet).getByText('winget install --id Microsoft.DotNet.SDK.8 -e')).toBeTruthy();
  });

  it('sets a manual path through the file dialog and resets it', async () => {
    await renderPage();
    await userEvent.click(within(card('Godot')).getByRole('button', { name: 'Pfad für Godot wählen' }));
    await waitFor(() => expect(getMockCalls('integrations.setPath')[0]?.params).toEqual({ id: 'godot', path: 'C:\\Program Files\\Godot\\Godot_v4.3-stable_win64.exe' }));
    expect(await within(card('Godot')).findByText('Pfad von Hand gewählt')).toBeTruthy();
    expect(within(card('Godot')).getByText('Verfügbar')).toBeTruthy();
    await userEvent.click(within(card('Godot')).getByRole('button', { name: /Automatisch suchen/ }));
    await waitFor(() => expect(getMockCalls('integrations.setPath')[1]?.params).toEqual({ id: 'godot', path: null }));
    await waitFor(() => expect(within(card('Godot')).queryByText('Pfad von Hand gewählt')).toBeNull());
  });

  it('requests an installation and links to the approval', async () => {
    await renderPage();
    await userEvent.click(within(card('.NET SDK')).getByRole('button', { name: /Installieren/ }));
    await waitFor(() => expect(getMockCalls('integrations.install')[0]?.params).toEqual({ id: 'dotnet' }));
    const dotnet = card('.NET SDK');
    expect(await within(dotnet).findByText('Freigabe angelegt')).toBeTruthy();
    expect(within(dotnet).getByRole('link', { name: 'Zu den Freigaben' }).getAttribute('href')).toBe('/approvals');
    expect(getMockDb().approvals.some((a) => a.title === '.NET SDK installieren' && a.status === 'pending')).toBe(true);
    expect((within(dotnet).getByRole('button', { name: /Installieren/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('applies live updates and scans again on request', async () => {
    await renderPage();
    const list = getMockDb().integrations.map((i) => (i.id === 'dotnet' ? { ...i, available: true, version: '8.0.404', message: '.NET SDK wurde installiert.' } : i));
    act(() => emitMockEvent({ type: 'integrations.updated', payload: list }));
    expect(await within(card('.NET SDK')).findByText('.NET SDK wurde installiert.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Erneut suchen/ }));
    await waitFor(() => expect(getMockCalls('integrations.list').at(-1)?.params).toEqual({ refresh: true }));
    await waitFor(() => expect(lastToast()?.title).toBe('Werkzeuge neu geprüft'));
  });

  it('opens a project in a tool that supports it (engines only offer matching projects)', async () => {
    await renderPage();
    const unity = card('Unity');
    const select = (await within(unity).findByLabelText('Projekt in Unity öffnen')) as HTMLSelectElement;
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(2));
    expect(within(select).getByRole('option', { name: 'Aetherfall' })).toBeTruthy();
    expect(within(select).queryByRole('option', { name: 'Pixel-Abenteuer' })).toBeNull();
    await userEvent.selectOptions(select, 'prj_aether');
    await userEvent.click(within(unity).getByRole('button', { name: /Öffnen/ }));
    await waitFor(() => expect(getMockCalls('integrations.open')[0]?.params).toEqual({ id: 'unity', projectId: 'prj_aether' }));
    await waitFor(() => expect(lastToast()?.title).toBe('Aetherfall wird in Unity geöffnet'));
    expect(within(card('Visual Studio Code')).getByRole('option', { name: 'Pixel-Abenteuer' })).toBeTruthy();
  });

  it('shows an error toast when the path is rejected', async () => {
    mockHandlers.set('integrations.setPath', () => {
      throw new MockRpcError('VALIDATION', 'Die Datei ist kein Godot-Programm.');
    });
    await renderPage();
    await userEvent.click(within(card('Godot')).getByRole('button', { name: 'Pfad für Godot wählen' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', title: 'Der Pfad konnte nicht übernommen werden', message: 'Die Datei ist kein Godot-Programm.' }));
  });

  it('shows an empty state and load errors', async () => {
    getMockDb().integrations = [];
    renderWithRouter(<IntegrationsPage />, { route: '/integrations' });
    expect(await screen.findByText('Noch keine Werkzeuge erkannt')).toBeTruthy();
  });

  it('shows a load error with retry', async () => {
    mockHandlers.set('integrations.list', () => {
      throw new MockRpcError('INTERNAL', 'Prüfung abgestürzt');
    });
    renderWithRouter(<IntegrationsPage />, { route: '/integrations' });
    expect(await screen.findByText('Prüfung abgestürzt')).toBeTruthy();
    mockHandlers.delete('integrations.list');
    await userEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(await screen.findByRole('heading', { name: 'Git', level: 3 })).toBeTruthy();
  });
});
