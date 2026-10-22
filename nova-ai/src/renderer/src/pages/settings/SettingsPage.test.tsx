/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError, setMockAutostartSupport } from '../../lib/mock-bridge';
import { useDaemonStore } from '../../stores/daemon';
import { useToastStore } from '../../stores/toasts';
import SettingsPage from './SettingsPage';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);
const nav = () => screen.getByRole('navigation', { name: 'Einstellungsbereiche' });

async function renderSection(section?: string) {
  renderWithRouter(<SettingsPage />, { route: section ? `/settings?section=${section}` : '/settings' });
  await screen.findByRole('button', { name: 'Speichern' });
}

describe('SettingsPage – navigation and forms', () => {
  it('shows all sections and the general settings', async () => {
    await renderSection();
    for (const label of ['Allgemein', 'Agenten', 'Parallelität & Ressourcen', 'Berechtigungen', 'Netzwerk', 'Benachrichtigungen', 'Speicher & Backups', 'Hintergrund & Autostart', 'Updates', 'Diagnose', 'Gedächtnis']) {
      expect(within(nav()).getByRole('link', { name: label })).toBeTruthy();
    }
    expect(within(nav()).getByRole('link', { name: 'Allgemein' }).getAttribute('aria-current')).toBe('page');
    expect((screen.getByLabelText('Ordner für neue Projekte') as HTMLInputElement).value).toBe('C:\\Users\\Demo\\Documents\\NOVA Projekte');
    expect(screen.getByText('Alles gespeichert')).toBeTruthy();
    expect(within(nav()).getByRole('link', { name: /Modelle und Anbieter/ }).getAttribute('href')).toBe('/models');
  });

  it('saves a changed section as a patch and marks unsaved changes', async () => {
    await renderSection('agents');
    const steps = screen.getByLabelText('Schritte pro Durchlauf (höchstens)');
    await userEvent.clear(steps);
    await userEvent.type(steps, '60');
    await userEvent.click(screen.getByRole('switch', { name: 'Geplante Aufgaben automatisch anlegen' }));
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();
    expect(within(nav()).getByText('(nicht gespeichert)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('settings.update')[0]?.params).toEqual({ agents: { maxStepsPerRun: 60, autoCreatePlannedTasks: false } }));
    await waitFor(() => expect(lastToast()?.title).toBe('Agenten: gespeichert'));
    expect(screen.queryByText('Nicht gespeichert')).toBeNull();
    expect(getMockDb().settings.agents.maxStepsPerRun).toBe(60);
  });

  it('validates numbers locally before saving', async () => {
    await renderSection('resources');
    const parallel = screen.getByLabelText('Agenten gleichzeitig (höchstens)');
    await userEvent.clear(parallel);
    await userEvent.type(parallel, '12');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Darf höchstens 8 sein.')).toBeTruthy();
    expect(getMockCalls('settings.update')).toHaveLength(0);
    // Typing clears the error.
    await userEvent.type(parallel, '{Backspace}');
    expect(screen.queryByText('Darf höchstens 8 sein.')).toBeNull();
  });

  it('shows validation errors of settings.update inline at the field', async () => {
    mockHandlers.set('settings.update', () => {
      throw new MockRpcError('VALIDATION', 'Ungültige Einstellungen', { issues: [{ path: ['resources', 'maxCpuPercent'], message: 'Dieser Wert passt nicht zur Anzahl der Kerne.' }] });
    });
    await renderSection('resources');
    const cpu = screen.getByLabelText('Prozessorlast (höchstens)');
    await userEvent.clear(cpu);
    await userEvent.type(cpu, '95');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Dieser Wert passt nicht zur Anzahl der Kerne.')).toBeTruthy();
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();
  });

  it('keeps unsaved changes when switching sections and discards them on request', async () => {
    await renderSection('agents');
    const steps = screen.getByLabelText('Schritte pro Durchlauf (höchstens)');
    await userEvent.clear(steps);
    await userEvent.type(steps, '77');
    await userEvent.click(within(nav()).getByRole('link', { name: 'Gedächtnis' }));
    expect(await screen.findByRole('switch', { name: 'Gedächtnis verwenden' })).toBeTruthy();
    await userEvent.click(within(nav()).getByRole('link', { name: /Agenten/ }));
    expect(((await screen.findByLabelText('Schritte pro Durchlauf (höchstens)')) as HTMLInputElement).value).toBe('77');
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect((screen.getByLabelText('Schritte pro Durchlauf (höchstens)') as HTMLInputElement).value).toBe('40');
    expect(screen.getByText('Alles gespeichert')).toBeTruthy();
  });

  it('fills in the default values', async () => {
    await renderSection('resources');
    expect((screen.getByLabelText('Agenten gleichzeitig (höchstens)') as HTMLInputElement).value).toBe('3');
    await userEvent.click(screen.getByRole('button', { name: 'Standardwerte' }));
    expect((screen.getByLabelText('Agenten gleichzeitig (höchstens)') as HTMLInputElement).value).toBe('2');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('settings.update')[0]?.params).toEqual({ agents: { maxParallelAgents: 2 } }));
  });

  it('greys out dependent switches', async () => {
    await renderSection('notifications');
    const onDone = screen.getByRole('switch', { name: 'Aufgabe erledigt' }) as HTMLButtonElement;
    expect(onDone.disabled).toBe(false);
    await userEvent.click(screen.getByRole('switch', { name: 'Benachrichtigungen anzeigen' }));
    expect(onDone.disabled).toBe(true);
  });

  it('picks the projects folder with the folder dialog', async () => {
    await renderSection('general');
    await userEvent.click(screen.getByRole('button', { name: /Ordner wählen/ }));
    await waitFor(() => expect((screen.getByLabelText('Ordner für neue Projekte') as HTMLInputElement).value).toBe('C:\\Users\\Demo\\Documents\\NOVA Projekte\\Neues Projekt'));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('settings.update')[0]?.params).toEqual({ general: { projectsDir: 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Neues Projekt' } }));
  });

  it('edits the command allowlist with the honest-limits text and warnings', async () => {
    await renderSection('permissions');
    expect(screen.getByText(/Projektcode, Tests und Build-Skripte, die ein Agent geschrieben hat/)).toBeTruthy();
    const list = screen.getByRole('list', { name: /Erlaubte Befehle/ });
    expect(within(list).getByText('npm test')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Befehl hinzufügen'), 'npm run e2e && echo ok{Enter}');
    expect(await within(list).findByText(/Enthält Sonderzeichen/)).toBeTruthy();
    await userEvent.click(within(list).getByRole('button', { name: 'Befehl „npm test“ entfernen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => {
      const list = (getMockCalls('settings.update')[0]?.params as { permissions: { commandAllowlist: string[] } }).permissions.commandAllowlist;
      expect(list).not.toContain('npm test');
      expect(list.at(-1)).toBe('npm run e2e && echo ok');
    });
  });

  it('rejects invalid hosts in the network section', async () => {
    await renderSection('network');
    expect(screen.getByText(/Programme und Tests, die selbst Verbindungen aufbauen, kann NOVA technisch nicht blockieren/)).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Adresse hinzufügen'), 'https://example.com/pfad{Enter}');
    expect(await screen.findByText(/Bitte nur einen Rechnernamen eingeben/)).toBeTruthy();
    const input = screen.getByLabelText('Adresse hinzufügen');
    await userEvent.clear(input);
    await userEvent.type(input, '*.example.com{Enter}');
    expect(within(screen.getByRole('list', { name: 'Erlaubte Adressen' })).getByText('*.example.com')).toBeTruthy();
  });

  it('shows an error toast when saving fails for another reason', async () => {
    mockHandlers.set('settings.update', () => {
      throw new MockRpcError('INTERNAL', 'Datenbank gesperrt');
    });
    await renderSection('memory');
    await userEvent.click(screen.getByRole('switch', { name: 'Agenten dürfen Einträge anlegen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', title: 'Einstellungen konnten nicht gespeichert werden', message: 'Datenbank gesperrt' }));
  });

  it('warns when the secret store is not secure', async () => {
    await renderSection();
    await waitFor(() => expect(useDaemonStore.getState().status).not.toBeNull());
    act(() => useDaemonStore.setState((s) => ({ status: s.status ? { ...s.status, secretStore: { scheme: 'aes-local', secure: false } } : s.status })));
    expect(await screen.findByText('API-Schlüssel werden nicht sicher gespeichert')).toBeTruthy();
  });
});

describe('SettingsPage – immediate controls', () => {
  it('switches the Windows autostart via the bridge and mirrors it into the settings', async () => {
    await renderSection('background');
    const toggle = await screen.findByRole('switch', { name: 'Mit Windows starten' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await userEvent.click(toggle);
    await waitFor(() => expect(getMockDb().autostart).toBe(true));
    await waitFor(() => expect(getMockCalls('settings.update')[0]?.params).toEqual({ background: { autostart: true } }));
    await waitFor(() => expect(lastToast()?.title).toBe('NOVA startet jetzt mit Windows'));
    expect(screen.getByRole('switch', { name: 'Mit Windows starten' }).getAttribute('aria-checked')).toBe('true');
  });

  it('a start without installation explains that autostart needs the installed version (R6-7)', async () => {
    setMockAutostartSupport({ supported: false, reason: 'not-installed' });
    await renderSection('background');
    expect(await screen.findByText(/Nur in der installierten Version verfügbar/)).toBeTruthy();
    const toggle = screen.getByRole('switch', { name: 'Mit Windows starten' }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(screen.queryByText(/Windows-Einstellungen/)).toBeNull();
    await userEvent.click(toggle);
    expect(getMockDb().autostart).toBe(false);
    expect(getMockCalls('settings.update')).toHaveLength(0);
  });

  it('checks for updates and never installs automatically', async () => {
    getMockDb().settings.updates.feedUrl = 'https://updates.example.com/nova.json';
    await renderSection('updates');
    expect(screen.getByText('Updates werden nie automatisch installiert')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Jetzt prüfen/ }));
    expect(await screen.findByText('NOVA ist auf dem neuesten Stand.')).toBeTruthy();
    expect(getMockCalls('updates.check')).toHaveLength(1);
  });

  it('offers a backup before installing an available update', async () => {
    mockHandlers.set('updates.check', () => ({
      currentVersion: '0.1.0',
      latestVersion: '0.2.0',
      updateAvailable: true,
      downloadUrl: 'https://example.com/nova-0.2.0.exe',
      notes: 'Neue Vorschau',
      checkedAt: Date.now(),
      message: 'Version 0.2.0 ist verfügbar.',
    }));
    await renderSection('updates');
    await userEvent.click(screen.getByRole('button', { name: /Jetzt prüfen/ }));
    expect(await screen.findByText('Version 0.2.0 ist verfügbar', { selector: 'p' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Daten jetzt sichern/ }));
    await waitFor(() => expect(getMockCalls('backup.create')[0]?.params).toEqual({ reason: 'vor Update' }));
  });

  it('validates the update source address', async () => {
    await renderSection('updates');
    await userEvent.type(screen.getByLabelText('Update-Quelle'), 'ftp://irgendwo');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText(/Bitte eine Adresse beginnend mit https:\/\//)).toBeTruthy();
    expect(getMockCalls('settings.update')).toHaveLength(0);
  });

  it('creates a diagnostics bundle', async () => {
    await renderSection('diagnostics');
    expect((screen.getByLabelText('Ausführlichkeit der Protokolle') as HTMLSelectElement).value).toBe('info');
    await userEvent.click(screen.getByRole('button', { name: /Diagnose-Paket erstellen/ }));
    expect(await screen.findByText(/nova-diagnose-.*\.json/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Im Explorer zeigen/ })).toBeTruthy();
  });
});
