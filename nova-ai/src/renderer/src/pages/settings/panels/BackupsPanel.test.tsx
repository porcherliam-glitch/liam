/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { useDaemonStore } from '../../../stores/daemon';
import { useToastStore } from '../../../stores/toasts';
import { todayStamp } from '../shared/files';
import { BackupsPanel } from './BackupsPanel';
import { countsText, DataTransferPanel } from './DataTransferPanel';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);
const table = () => screen.getByRole('table', { name: 'Sicherungen' });

async function renderBackups() {
  renderWithRouter(<BackupsPanel />);
  await within(await screen.findByRole('table', { name: 'Sicherungen' })).findByText('Anlass: täglich');
}

describe('BackupsPanel', () => {
  it('lists backups newest first with kind, content and size', async () => {
    await renderBackups();
    const rows = within(table()).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Anlass: täglich')).toBeTruthy();
    expect(within(table()).getAllByText('Alle NOVA-Daten')).toHaveLength(2);
    expect(await within(table()).findByText('Pixel-Abenteuer')).toBeTruthy();
    expect(within(table()).getByText('Projektkopie')).toBeTruthy();
  });

  it('creates a backup now and a project snapshot', async () => {
    await renderBackups();
    await userEvent.click(screen.getByRole('button', { name: 'Jetzt sichern' }));
    await waitFor(() => expect(getMockCalls('backup.create')[0]?.params).toEqual({ reason: 'manuell' }));
    await waitFor(() => expect(within(table()).getAllByRole('row')).toHaveLength(5));
    await userEvent.selectOptions(await screen.findByLabelText('Projektkopie anlegen'), 'prj_rezept');
    await userEvent.click(screen.getByRole('button', { name: 'Projekt sichern' }));
    await waitFor(() => expect(getMockCalls('backup.snapshotProject')[0]?.params).toEqual({ projectId: 'prj_rezept' }));
    await waitFor(() => expect(lastToast()?.title).toBe('Projektkopie erstellt'));
  });

  it('restores a database backup after confirmation (NOVA restarts)', async () => {
    for (const r of getMockDb().runs) if (r.status === 'running') r.status = 'done';
    await renderBackups();
    const row = within(table()).getByText('Anlass: täglich').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Wiederherstellen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Datenbank-Sicherung einspielen?' });
    expect(within(dialog).getByText(/startet dafür den Hintergrunddienst neu/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Einspielen und neu starten' }));
    await waitFor(() => expect(getMockCalls('backup.restore')[0]?.params).toEqual({ id: 'bak_1' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ title: 'NOVA startet neu' }));
  });

  it('does not promise to stop running agents: restore is blocked until the work is paused and idle (R3-14)', async () => {
    expect(getMockDb().runs.some((r) => r.status === 'running')).toBe(true);
    await renderBackups();
    await waitFor(() => expect(useDaemonStore.getState().work?.activeRuns).toBeGreaterThan(0));
    const row = within(table()).getByText('Anlass: täglich').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Wiederherstellen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Datenbank-Sicherung einspielen?' });
    expect(within(dialog).queryByText(/an einem sicheren Punkt angehalten/)).toBeNull();
    expect(within(dialog).getByText(/Bitte zuerst die Arbeit pausieren/)).toBeTruthy();
    expect((within(dialog).getByRole('button', { name: 'Einspielen und neu starten' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(within(dialog).getByRole('button', { name: /Arbeit pausieren/ }));
    await waitFor(() => expect(getMockCalls('work.pause')).toHaveLength(1));
    // Once the last run has finished, the restore can be started.
    act(() => useDaemonStore.getState().setWork({ ...useDaemonStore.getState().work!, state: 'paused', activeRuns: 0 }));
    expect((within(dialog).getByRole('button', { name: 'Einspielen und neu starten' }) as HTMLButtonElement).disabled).toBe(false);
    expect(getMockCalls('backup.restore')).toHaveLength(0);
  });

  it('restores a project snapshot into a chosen folder', async () => {
    await renderBackups();
    const row = within(table()).getByText('Anlass: manuell').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: 'Wiederherstellen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Projektkopie wiederherstellen?' });
    expect(within(dialog).getByText(/Das Original wird nie überschrieben/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: /Anderen Ordner wählen/ }));
    expect(await within(dialog).findByText('C:\\Users\\Demo\\Documents\\NOVA Projekte\\Neues Projekt')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wiederherstellen' }));
    await waitFor(() => expect(getMockCalls('backup.restore')[0]?.params).toEqual({ id: 'bak_3', targetDir: 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Neues Projekt' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ title: 'Projektkopie wiederhergestellt' }));
  });

  it('deletes a backup after confirmation and reports errors', async () => {
    mockHandlers.set('backup.delete', () => {
      throw new MockRpcError('FILE_LOCKED', 'Die Datei wird gerade verwendet.');
    });
    await renderBackups();
    const row = within(table()).getByText('Anlass: vor Migration').closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: /löschen$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Sicherung löschen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', message: 'Die Datei wird gerade verwendet.' }));
    mockHandlers.delete('backup.delete');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(getMockCalls('backup.delete').at(-1)?.params).toEqual({ id: 'bak_2' }));
    await waitFor(() => expect(within(table()).queryByText('Anlass: vor Migration')).toBeNull());
  });

  it('shows an empty state', async () => {
    getMockDb().backups = [];
    renderWithRouter(<BackupsPanel />);
    expect(await screen.findByText('Noch keine Sicherung')).toBeTruthy();
  });
});

describe('DataTransferPanel', () => {
  it('exports the selected sections to the chosen file', async () => {
    renderWithRouter(<DataTransferPanel />);
    expect(screen.getByText('API-Schlüssel werden nie exportiert.')).toBeTruthy();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Aufgaben' }));
    await userEvent.click(screen.getByRole('button', { name: /Exportieren/ }));
    await waitFor(() =>
      expect(getMockCalls('data.export')[0]?.params).toEqual({ sections: ['projects', 'settings', 'memory', 'providers'], path: `NOVA Export ${todayStamp()}.json` }),
    );
    await waitFor(() => expect(lastToast()?.title).toBe('Daten exportiert'));
  });

  it('disables the export without sections', async () => {
    renderWithRouter(<DataTransferPanel />);
    for (const name of ['Projekte', 'Aufgaben', 'Einstellungen', 'Gedächtnis und Wissen', 'Anbieter (ohne Schlüssel)']) await userEvent.click(screen.getByRole('checkbox', { name }));
    expect((screen.getByRole('button', { name: /Exportieren/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('imports a file after confirmation and shows counts and warnings', async () => {
    renderWithRouter(<DataTransferPanel />);
    await userEvent.click(screen.getByRole('button', { name: /Datei auswählen/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Daten importieren?' });
    expect(within(dialog).getByText('C:\\Users\\Demo\\Downloads\\wissen-export.json')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Importieren' }));
    await waitFor(() => expect(getMockCalls('data.import')[0]?.params).toEqual({ path: 'C:\\Users\\Demo\\Downloads\\wissen-export.json' }));
    expect(await screen.findByText('Import abgeschlossen')).toBeTruthy();
    expect(screen.getByText(/Anbieter wurden ohne API-Schlüssel übernommen/)).toBeTruthy();
    expect(screen.getByText(/Gedächtnis und Wissen: 4/)).toBeTruthy();
  });

  it('formats counts', () => {
    expect(countsText({ projects: 2, memory: 4, skipped: 1 })).toBe('Projekte: 2 · Gedächtnis und Wissen: 4');
  });
});
