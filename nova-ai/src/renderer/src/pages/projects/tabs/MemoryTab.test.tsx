/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, getMockDb, mockBridge, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { useToastStore } from '../../../stores/toasts';
import { renderProject } from '../projectTestUtils';
import { exportFileName } from './MemoryTab';

setupRendererTest();

describe('Gedächtnis', () => {
  it('lists the project memory grouped by kind', async () => {
    renderProject('/projects/prj_pixel?tab=memory');
    const goals = await screen.findByRole('region', { name: 'Ziel' });
    expect(within(goals).getByText('Spielziel')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Entscheidung' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Fehler' })).getByText('Spieler fällt an Plattformkante durch')).toBeTruthy();
    // Entries of other projects are not shown.
    expect(screen.queryByText('Unity-Code-Regeln')).toBeNull();
  });

  it('searches the memory', async () => {
    renderProject('/projects/prj_pixel?tab=memory');
    await screen.findByRole('region', { name: 'Ziel' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Gedächtnis durchsuchen' }), 'Hitbox');
    const results = await screen.findByRole('list', { name: 'Suchergebnisse' });
    expect(within(results).getByText('Hitbox vergrößern hat nicht geholfen')).toBeTruthy();
    expect(getMockCalls('memory.search').at(-1)?.params).toEqual({ query: 'Hitbox', projectId: 'prj_pixel', includeGlobal: false, limit: 50 });
  });

  it('adds an entry', async () => {
    renderProject('/projects/prj_pixel?tab=memory');
    await screen.findByRole('region', { name: 'Ziel' });
    await userEvent.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag hinzufügen' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Art' }), 'decision');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Titel/ }), 'Kein Mehrspieler');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Inhalt' }), 'Das Spiel bleibt ein Einzelspieler-Spiel.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(getMockCalls('memory.add')[0]?.params).toEqual({ projectId: 'prj_pixel', kind: 'decision', title: 'Kein Mehrspieler', content: 'Das Spiel bleibt ein Einzelspieler-Spiel.', tags: [], shareable: false }),
    );
    expect(await within(screen.getByRole('region', { name: 'Entscheidung' })).findByText('Kein Mehrspieler')).toBeTruthy();
  });

  it('edits only the changed fields', async () => {
    renderProject('/projects/prj_pixel?tab=memory');
    await userEvent.click(await screen.findByRole('button', { name: '„Ordnerstruktur“ bearbeiten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag bearbeiten' });
    const title = within(dialog).getByRole('textbox', { name: /Titel/ });
    await userEvent.clear(title);
    await userEvent.type(title, 'Ordner und Dateien');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('memory.update')[0]?.params).toEqual({ id: 'mem_3', title: 'Ordner und Dateien' }));
  });

  it('deletes an entry after confirmation', async () => {
    renderProject('/projects/prj_pixel?tab=memory');
    await userEvent.click(await screen.findByRole('button', { name: '„Spielziel“ löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag löschen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(getMockCalls('memory.delete')[0]?.params).toEqual({ id: 'mem_1' }));
    await waitFor(() => expect(screen.queryByText('Spielziel')).toBeNull());
  });

  it('exports to the chosen file', async () => {
    const save = vi.spyOn(mockBridge.app, 'saveFile').mockResolvedValue('D:\\Sicherung\\pixel.json');
    renderProject('/projects/prj_pixel?tab=memory');
    await screen.findByRole('region', { name: 'Ziel' });
    await userEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ defaultPath: 'Gedächtnis Pixel-Abenteuer.json' }));
    await waitFor(() => expect(getMockCalls('memory.export')[0]?.params).toEqual({ projectId: 'prj_pixel', path: 'D:\\Sicherung\\pixel.json' }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === '6 Einträge exportiert')).toBe(true));
  });

  it('does nothing when the save dialog is cancelled', async () => {
    vi.spyOn(mockBridge.app, 'saveFile').mockResolvedValue(null);
    renderProject('/projects/prj_pixel?tab=memory');
    await screen.findByRole('region', { name: 'Ziel' });
    await userEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    await new Promise((r) => setTimeout(r, 50));
    expect(getMockCalls('memory.export')).toHaveLength(0);
  });

  it('clears the whole project memory after confirmation', async () => {
    renderProject('/projects/prj_pixel?tab=memory');
    await screen.findByRole('region', { name: 'Ziel' });
    await userEvent.click(screen.getByRole('button', { name: 'Alles löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Gesamtes Gedächtnis von „Pixel-Abenteuer“ löschen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Alles löschen' }));
    await waitFor(() => expect(getMockCalls('memory.clear')[0]?.params).toEqual({ projectId: 'prj_pixel' }));
    expect(await screen.findByText('Das Gedächtnis ist noch leer')).toBeTruthy();
    expect(getMockDb().memory.some((m) => m.projectId === 'prj_pixel')).toBe(false);
  });

  it('shows the inline error when saving fails', async () => {
    mockHandlers.set('memory.add', () => {
      throw new MockRpcError('VALIDATION', 'Der Eintrag scheint einen Schlüssel zu enthalten.');
    });
    renderProject('/projects/prj_pixel?tab=memory');
    await screen.findByRole('region', { name: 'Ziel' });
    await userEvent.click(screen.getByRole('button', { name: 'Eintrag hinzufügen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag hinzufügen' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Titel/ }), 'API-Zugang');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    expect(await within(dialog).findByText('Der Eintrag scheint einen Schlüssel zu enthalten.')).toBeTruthy();
  });

  it('builds a safe export file name', () => {
    expect(exportFileName('Spiel: Teil 2/3')).toBe('Gedächtnis Spiel  Teil 2 3.json');
  });
});
