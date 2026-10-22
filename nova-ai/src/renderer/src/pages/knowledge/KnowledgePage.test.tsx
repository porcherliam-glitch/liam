/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import { todayStamp } from '../settings/shared/files';
import KnowledgePage from './KnowledgePage';
import { looksLikeSecret } from './KnowledgeEntryDialog';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);
const PHASER = 'Phaser: feste Zeitschritte für stabile Kollisionen';

async function renderPage() {
  renderWithRouter(<KnowledgePage />, { route: '/knowledge' });
  await screen.findByRole('heading', { name: PHASER });
}

describe('KnowledgePage', () => {
  it('lists the global knowledge base only', async () => {
    await renderPage();
    expect(getMockCalls('memory.list')[0]?.params).toEqual({ projectId: null, limit: 2000 });
    expect(screen.getByRole('heading', { name: 'Modelle mit Werkzeugen bevorzugen' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Phaser 3 statt eigener Engine' })).toBeNull();
    expect(screen.getByText('3 Einträge')).toBeTruthy();
    expect(screen.getAllByText(/Teilbare Einträge darf NOVA/).length).toBeGreaterThan(0);
  });

  it('searches across all projects', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('radio', { name: 'Alle Projekte' }));
    await userEvent.type(screen.getByLabelText('Suchen'), 'Phaser');
    await waitFor(() => expect(getMockCalls('memory.search').at(-1)?.params).toEqual({ query: 'Phaser', includeGlobal: true, limit: 100 }));
    const projectEntry = (await screen.findByRole('heading', { name: 'Phaser 3 statt eigener Engine' })).closest('li')!;
    expect(within(projectEntry).getByText('Pixel-Abenteuer')).toBeTruthy();
    expect(screen.getByText(/Treffer für „Phaser“/)).toBeTruthy();
  });

  it('shows "Nichts gefunden" for a search without results', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('Suchen'), 'gibtsnicht');
    expect(await screen.findByText('Nichts gefunden')).toBeTruthy();
    expect(getMockCalls('memory.search').at(-1)?.params).toEqual({ query: 'gibtsnicht', projectId: null, includeGlobal: true, limit: 100 });
  });

  it('adds an entry to the global knowledge base and warns about secrets', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Eintrag anlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag anlegen' });
    await userEvent.type(within(dialog).getByLabelText(/Titel/), 'Git: kleine Commits');
    await userEvent.type(within(dialog).getByLabelText('Inhalt'), 'api_key: 123');
    expect(within(dialog).getByText('Das sieht nach einem Zugangsschlüssel aus')).toBeTruthy();
    const content = within(dialog).getByLabelText('Inhalt');
    await userEvent.clear(content);
    await userEvent.type(content, 'Ein Commit pro Aufgabe.');
    await userEvent.type(within(dialog).getByRole('textbox', { name: 'Schlagwörter' }), 'git{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() =>
      expect(getMockCalls('memory.add')[0]?.params).toEqual({ projectId: null, kind: 'insight', title: 'Git: kleine Commits', content: 'Ein Commit pro Aufgabe.', tags: ['git'], shareable: true }),
    );
    expect(await screen.findByRole('heading', { name: 'Git: kleine Commits' })).toBeTruthy();
  });

  it('requires a title', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Eintrag anlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag anlegen' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    expect(within(dialog).getByText('Bitte einen Titel eingeben.')).toBeTruthy();
    expect(getMockCalls('memory.add')).toHaveLength(0);
  });

  it('edits an entry', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: `„${PHASER}“ bearbeiten` }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag bearbeiten' });
    const title = within(dialog).getByLabelText(/Titel/);
    await userEvent.clear(title);
    await userEvent.type(title, 'Phaser: fixedStep verwenden');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('memory.update')[0]?.params).toMatchObject({ id: 'mem_g1', title: 'Phaser: fixedStep verwenden', kind: 'insight' }));
    expect(await screen.findByRole('heading', { name: 'Phaser: fixedStep verwenden' })).toBeTruthy();
  });

  it('toggles "teilbar"', async () => {
    await renderPage();
    const toggle = screen.getByRole('switch', { name: `„${PHASER}“ teilbar` });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await userEvent.click(toggle);
    await waitFor(() => expect(getMockCalls('memory.update')[0]?.params).toEqual({ id: 'mem_g1', shareable: false }));
    await waitFor(() => expect(screen.getByRole('switch', { name: `„${PHASER}“ teilbar` }).getAttribute('aria-checked')).toBe('false'));
  });

  it('deletes an entry after confirmation and reports errors', async () => {
    mockHandlers.set('memory.delete', () => {
      throw new MockRpcError('NOT_FOUND', 'Der Eintrag wurde nicht gefunden.');
    });
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: `„${PHASER}“ löschen` }));
    const dialog = await screen.findByRole('dialog', { name: 'Eintrag löschen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', message: 'Der Eintrag wurde nicht gefunden.' }));
    mockHandlers.delete('memory.delete');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(getMockCalls('memory.delete').at(-1)?.params).toEqual({ id: 'mem_g1' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: PHASER })).toBeNull());
  });

  it('exports via the save dialog and imports via the file dialog', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Exportieren' }));
    await waitFor(() => expect(getMockCalls('memory.export')[0]?.params).toEqual({ projectId: null, path: `NOVA Wissen ${todayStamp()}.json` }));
    await waitFor(() => expect(lastToast()?.title).toBe('3 Einträge exportiert'));
    await userEvent.click(screen.getByRole('button', { name: 'Importieren' }));
    await waitFor(() => expect(getMockCalls('memory.import')[0]?.params).toEqual({ path: 'C:\\Users\\Demo\\Downloads\\wissen-export.json' }));
    await waitFor(() => expect(lastToast()?.title).toBe('2 Einträge importiert, 1 übersprungen (schon vorhanden oder ungültig)'));
    expect(await screen.findByRole('heading', { name: 'Importiert: Git-Commits klein halten' })).toBeTruthy();
  });

  it('clears the global knowledge base after confirmation', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Wissensdatenbank leeren' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wissensdatenbank leeren?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Alles löschen' }));
    await waitFor(() => expect(getMockCalls('memory.clear')[0]?.params).toEqual({ projectId: null }));
    expect(await screen.findByText('Die Wissensdatenbank ist noch leer')).toBeTruthy();
    // Project memory is untouched.
    expect(getMockDb().memory.some((m) => m.projectId === 'prj_pixel')).toBe(true);
  });

  it('points to the settings when the knowledge base is not used', async () => {
    getMockDb().settings.memory.useGlobalKnowledge = false;
    await renderPage();
    expect(await screen.findByText('Die Wissensdatenbank wird gerade nicht verwendet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zu den Einstellungen' }).getAttribute('href')).toBe('/settings?section=memory');
  });
});

describe('looksLikeSecret', () => {
  it('detects key-like text', () => {
    expect(looksLikeSecret('password = hunter2')).toBe(true);
    expect(looksLikeSecret('sk-abcdefghijklmnop1234')).toBe(true);
    expect(looksLikeSecret('Ein Commit pro Aufgabe macht das Zurücksetzen einfacher.')).toBe(false);
  });
});
