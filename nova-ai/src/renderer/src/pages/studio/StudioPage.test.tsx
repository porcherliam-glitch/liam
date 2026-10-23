/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { mockHash } from '../../lib/mock-data';
import { useToastStore } from '../../stores/toasts';
import StudioPage from './StudioPage';
import { FakeTerminal, modelValue, monacoLog, resetMonacoMock } from './test-mocks';
import { modelUri } from './studio-utils';
import { resetDrafts } from './useEditorTabs';
import { resetTerminalSessions } from './terminal-session';

vi.mock('@monaco-editor/react', async () => (await import('./test-mocks')).monacoReactModule);
vi.mock('./monaco-setup', async () => (await import('./test-mocks')).monacoSetupModule);
vi.mock('@xterm/xterm', async () => (await import('./test-mocks')).xtermModule);
vi.mock('@xterm/addon-fit', async () => (await import('./test-mocks')).fitAddonModule);

setupRendererTest();

beforeEach(() => {
  resetMonacoMock();
  resetDrafts();
  resetTerminalSessions();
  FakeTerminal.instances = [];
});

const PIXEL = 'prj_pixel';
const studioRoute = (query = '') => ({ path: '/projects/:projectId/studio', route: `/projects/${PIXEL}/studio${query}` });
const pixelFile = (path: string) => getMockDb().files[PIXEL][path];

async function openEditor(query: string) {
  renderWithRouter(<StudioPage />, studioRoute(query));
  const editor = (await screen.findByTestId('monaco-editor')) as HTMLTextAreaElement;
  return editor;
}

describe('StudioPage', () => {
  it('shows the file tree with NOVA markers and opens ?file= at the given line', async () => {
    const editor = await openEditor('?file=src%2Fmain.ts&line=9');
    expect(editor.getAttribute('data-path')).toBe(modelUri(PIXEL, 'src/main.ts'));
    expect(editor.getAttribute('data-language')).toBe('typescript');
    expect(editor.value).toContain('new Phaser.Game');
    await waitFor(() => expect(monacoLog.positions.at(-1)).toMatchObject({ uri: modelUri(PIXEL, 'src/main.ts'), lineNumber: 9 }));

    const tree = screen.getByRole('tree', { name: 'Projektdateien' });
    // The folder of the opened file is expanded and the file is selected.
    const row = await within(tree).findByRole('treeitem', { name: /^main\.ts/ });
    expect(row.getAttribute('aria-selected')).toBe('true');
    expect(within(tree).getByRole('treeitem', { name: /^src – enthält von NOVA geänderte Dateien/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('tab', { name: /src\/main\.ts \(von NOVA geändert\)/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens absolute paths inside the project folder from ?file= and refuses paths outside', async () => {
    const absolute = 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Pixel-Abenteuer\\src\\game\\player.ts';
    const editor = await openEditor(`?file=${encodeURIComponent(absolute)}&line=3`);
    await waitFor(() => expect(editor.getAttribute('data-path')).toBe(modelUri(PIXEL, 'src/game/player.ts')));
    await waitFor(() => expect(monacoLog.positions.at(-1)).toMatchObject({ uri: modelUri(PIXEL, 'src/game/player.ts'), lineNumber: 3 }));
  });

  it('warns about ?file= paths outside the project folder', async () => {
    renderWithRouter(<StudioPage />, studioRoute(`?file=${encodeURIComponent('D:\\Anderswo\\geheim.txt')}`));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === 'Die Datei liegt nicht im Projektordner')).toBe(true));
    expect(getMockCalls('files.read').some((c) => String(c.params.path).includes('geheim'))).toBe(false);
  });

  it('saves with Strg+S using the hash of the loaded file', async () => {
    const original = pixelFile('src/main.ts');
    const editor = await openEditor('?file=src%2Fmain.ts');
    fireEvent.change(editor, { target: { value: `${original}// Kommentar\n` } });
    expect(await screen.findByRole('tab', { name: /src\/main\.ts \(ungespeichert/ })).toBeTruthy();
    expect(screen.getByText('1 ungespeicherte Datei')).toBeTruthy();

    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    await waitFor(() => expect(getMockCalls('files.write')).toHaveLength(1));
    expect(getMockCalls('files.write')[0].params).toEqual({
      projectId: PIXEL,
      path: 'src/main.ts',
      content: `${original}// Kommentar\n`,
      expectedHash: mockHash(`src/main.ts\n${original}`),
    });
    await waitFor(() => expect(screen.queryByText('1 ungespeicherte Datei')).toBeNull());
    expect(pixelFile('src/main.ts')).toContain('// Kommentar');
    expect(screen.getByText('Gespeichert')).toBeTruthy();
  });

  it('also saves with Strg+S when the editor does not have the focus', async () => {
    const editor = await openEditor('?file=src%2Fmain.ts');
    fireEvent.change(editor, { target: { value: 'neu' } });
    await screen.findByText('1 ungespeicherte Datei');
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(getMockCalls('files.write')[0]?.params).toMatchObject({ path: 'src/main.ts', content: 'neu' }));
  });

  it('offers reload, compare and overwrite when saving hits a conflict', async () => {
    const editor = await openEditor('?file=src%2Fmain.ts');
    // NOVA changes the file in the meantime (event not delivered yet).
    getMockDb().files[PIXEL]['src/main.ts'] = 'von NOVA geändert\n';
    fireEvent.change(editor, { target: { value: 'meine Änderung\n' } });
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });

    const dialog = await screen.findByRole('dialog', { name: 'Die Datei wurde inzwischen geändert' });
    expect(pixelFile('src/main.ts')).toBe('von NOVA geändert\n');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Unterschiede ansehen' }));
    const compare = await screen.findByRole('dialog', { name: /Unterschiede: main\.ts/ });
    const diff = await within(compare).findByTestId('diff-editor');
    expect(diff.querySelector('[data-side="original"]')?.textContent).toBe('von NOVA geändert\n');
    expect(diff.querySelector('[data-side="modified"]')?.textContent).toBe('meine Änderung\n');

    await userEvent.click(within(compare).getByRole('button', { name: 'Meine Version speichern' }));
    await waitFor(() => expect(pixelFile('src/main.ts')).toBe('meine Änderung\n'));
    const writes = getMockCalls('files.write');
    expect(writes.at(-1)?.params).toMatchObject({ expectedHash: mockHash('src/main.ts\nvon NOVA geändert\n') });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('reloads the disk version from the conflict dialog', async () => {
    const editor = await openEditor('?file=src%2Fmain.ts');
    getMockDb().files[PIXEL]['src/main.ts'] = 'neuer Stand\n';
    fireEvent.change(editor, { target: { value: 'verworfen\n' } });
    fireEvent.keyDown(editor, { key: 's', ctrlKey: true });
    const dialog = await screen.findByRole('dialog', { name: 'Die Datei wurde inzwischen geändert' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Neu laden' }));
    await waitFor(() => expect(modelValue(modelUri(PIXEL, 'src/main.ts'))).toBe('neuer Stand\n'));
    expect(screen.queryByText('1 ungespeicherte Datei')).toBeNull();
  });

  it('reloads clean tabs after NOVA changed the file and warns when there are unsaved edits', async () => {
    await openEditor('?file=src%2Fmain.ts');
    getMockDb().files[PIXEL]['src/main.ts'] = 'Version 2\n';
    act(() => emitMockEvent({ type: 'files.changed', payload: { projectId: PIXEL, paths: ['src/main.ts'], actor: 'nova' } }));
    await waitFor(() => expect(modelValue(modelUri(PIXEL, 'src/main.ts'))).toBe('Version 2\n'));
    expect(await screen.findByText('Von NOVA aktualisiert')).toBeTruthy();

    fireEvent.change(screen.getByTestId('monaco-editor'), { target: { value: 'eigene Arbeit\n' } });
    getMockDb().files[PIXEL]['src/main.ts'] = 'Version 3\n';
    act(() => emitMockEvent({ type: 'files.changed', payload: { projectId: PIXEL, paths: ['src/main.ts'], actor: 'nova' } }));
    const alert = await screen.findByText('NOVA hat diese Datei geändert');
    expect(alert.closest('[role="alert"]')).toBeTruthy();
    // The unsaved text stays untouched.
    expect(modelValue(modelUri(PIXEL, 'src/main.ts'))).toBe('eigene Arbeit\n');
  });

  it('shows the new content of a tab that changed on disk before it was ever shown', async () => {
    localStorage.setItem(`nova.studio.tabs.${PIXEL}`, JSON.stringify({ paths: ['src/main.ts', 'src/game/player.ts'], active: 'src/main.ts' }));
    renderWithRouter(<StudioPage />, studioRoute());
    await screen.findByTestId('monaco-editor');
    const playerTab = await screen.findByRole('tab', { name: /^src\/game\/player\.ts/ });
    await waitFor(() => expect(getMockCalls('files.read').some((c) => c.params.path === 'src/game/player.ts')).toBe(true));
    const reads = getMockCalls('files.read').length;
    getMockDb().files[PIXEL]['src/game/player.ts'] = 'Neue Fassung von NOVA\n';
    act(() => emitMockEvent({ type: 'files.changed', payload: { projectId: PIXEL, paths: ['src/game/player.ts'], actor: 'nova' } }));
    await waitFor(() => expect(getMockCalls('files.read').length).toBeGreaterThan(reads));
    await userEvent.click(playerTab);
    await waitFor(() => expect((screen.getByTestId('monaco-editor') as HTMLTextAreaElement).value).toBe('Neue Fassung von NOVA\n'));
    expect(screen.queryByText('1 ungespeicherte Datei')).toBeNull();
  });

  it('asks before closing a tab with unsaved changes', async () => {
    const editor = await openEditor('?file=src%2Fmain.ts');
    fireEvent.change(editor, { target: { value: 'ungespeichert' } });
    await userEvent.click(await screen.findByRole('button', { name: 'main.ts schließen (ungespeicherte Änderungen)' }));
    const dialog = await screen.findByRole('dialog', { name: 'Änderungen an „main.ts“ speichern?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Nicht speichern' }));
    expect(await screen.findByText('Keine Datei geöffnet')).toBeTruthy();
    expect(getMockCalls('files.write')).toHaveLength(0);
  });

  it('shows binary files as a notice instead of the editor', async () => {
    renderWithRouter(<StudioPage />, studioRoute('?file=public%2Fassets%2Ftiles.png'));
    expect(await screen.findByText('Diese Datei kann im Editor nicht angezeigt werden')).toBeTruthy();
    expect(screen.queryByTestId('monaco-editor')).toBeNull();
    // Body action next to the info bar icon.
    expect(screen.getAllByRole('button', { name: 'Im Explorer zeigen' })).toHaveLength(2);
  });

  it('opens truncated files read-only with a notice', async () => {
    mockHandlers.set('files.read', ({ path }: { path: string }) => ({
      path,
      content: 'Anfang …',
      encoding: 'utf8',
      size: 5 * 1024 * 1024,
      hash: 'h1',
      mtime: Date.now(),
      language: 'plaintext',
      truncated: true,
    }));
    const editor = await openEditor('?file=logs%2Fgross.log');
    expect(editor.readOnly).toBe(true);
    expect(screen.getByText('Schreibgeschützt')).toBeTruthy();
    expect(screen.getByText(/Die Datei ist sehr groß \(5 MB\)/)).toBeTruthy();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(getMockCalls('files.write')).toHaveLength(0);
  });

  it('shows an error for files that cannot be read', async () => {
    renderWithRouter(<StudioPage />, studioRoute('?file=gibt-es-nicht.ts'));
    expect(await screen.findByText('Die Datei konnte nicht geöffnet werden')).toBeTruthy();
    expect(screen.getByText(/Die Datei wurde nicht gefunden/)).toBeTruthy();
  });

  it('jumps from a failed check to the file and shows the failures as editor markers', async () => {
    getMockDb().files[PIXEL]['tests/player.test.ts'] = Array.from({ length: 80 }, (_, i) => `// Zeile ${i + 1}`).join('\n');
    renderWithRouter(<StudioPage />, studioRoute());
    await userEvent.click(await screen.findByRole('tab', { name: /Prüfungen/ }));
    const failure = await screen.findByRole('button', { name: /Spieler bleibt an der rechten Plattformkante stehen.*tests\/player\.test\.ts:48:31 öffnen/ });
    await userEvent.click(failure);
    const editor = (await screen.findByTestId('monaco-editor')) as HTMLTextAreaElement;
    expect(editor.getAttribute('data-path')).toBe(modelUri(PIXEL, 'tests/player.test.ts'));
    await waitFor(() => expect(monacoLog.positions.at(-1)).toMatchObject({ lineNumber: 48, column: 31 }));
    await waitFor(() => expect(monacoLog.markers.get(modelUri(PIXEL, 'tests/player.test.ts'))?.map((m) => m.startLineNumber)).toEqual([48, 63]));
  });

  it('opens the search with Strg+Umschalt+F and opens a hit at its line', async () => {
    renderWithRouter(<StudioPage />, studioRoute());
    await screen.findByRole('tree', { name: 'Projektdateien' });
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    const input = await screen.findByRole('searchbox', { name: 'Suchbegriff' });
    await waitFor(() => expect(document.activeElement).toBe(input));
    await userEvent.type(input, 'fixedStep');
    const hit = await screen.findByRole('button', { name: /^src\/main\.ts, Zeile 11:/ });
    expect(getMockCalls('files.search').at(-1)?.params).toEqual({ projectId: PIXEL, query: 'fixedStep', regex: false, caseSensitive: false, limit: 500 });
    await userEvent.click(hit);
    await waitFor(() => expect(monacoLog.positions.at(-1)).toMatchObject({ uri: modelUri(PIXEL, 'src/main.ts'), lineNumber: 11 }));
  });

  it('shows the NOVA changes of the open file in the changes panel', async () => {
    await openEditor('?file=src%2Fgame%2Fplayer.ts');
    await userEvent.click(screen.getByRole('button', { name: 'Von NOVA geändert' }));
    await waitFor(() => expect(getMockCalls('files.diff').at(-1)?.params).toEqual({ projectId: PIXEL, path: 'src/game/player.ts' }));
    const panel = screen.getByRole('tabpanel', { name: /Änderungen/ });
    expect(await within(panel).findByTestId('diff-editor')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: /player\.ts/, current: true })).toBeTruthy();
  });

  it('toggles the tree and the tool panel with the toolbar and the keyboard', async () => {
    renderWithRouter(<StudioPage />, studioRoute());
    await screen.findByRole('tree', { name: 'Projektdateien' });
    await userEvent.click(screen.getByRole('button', { name: 'Dateibaum ausblenden (Strg+B)' }));
    expect(screen.queryByRole('tree')).toBeNull();
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(await screen.findByRole('tree', { name: 'Projektdateien' })).toBeTruthy();

    const panel = screen.getByRole('region', { name: 'Werkzeugbereich' });
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(panel.className).toContain('hidden');
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(panel.className).not.toContain('hidden');

    // Strg+Ö (German keyboards) opens the terminal.
    fireEvent.keyDown(window, { key: 'ö', code: 'Semicolon', ctrlKey: true });
    expect(screen.getByRole('tab', { name: /Terminal/ }).getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('region', { name: 'Terminal' })).toBeTruthy();
  });

  it('tells when the project does not exist', async () => {
    renderWithRouter(<StudioPage />, { path: '/projects/:projectId/studio', route: '/projects/prj_unbekannt/studio' });
    expect(await screen.findByText('Dieses Projekt gibt es nicht (mehr)')).toBeTruthy();
  });

  it('switches to the not-found state when the project is removed while the studio is open', async () => {
    renderWithRouter(<StudioPage />, studioRoute());
    await screen.findByRole('tree', { name: 'Projektdateien' });
    getMockDb().projects = getMockDb().projects.filter((p) => p.id !== PIXEL);
    act(() => emitMockEvent({ type: 'project.removed', payload: { id: PIXEL } }));
    expect(await screen.findByText('Dieses Projekt gibt es nicht (mehr)')).toBeTruthy();
  });

  it('keeps unsaved edits when leaving and mentions it', async () => {
    const view = renderWithRouter(<StudioPage />, studioRoute('?file=src%2Fmain.ts'));
    const editor = (await screen.findByTestId('monaco-editor')) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'Entwurf' } });
    await screen.findByText('1 ungespeicherte Datei');
    view.unmount();
    expect(useToastStore.getState().toasts.some((t) => t.title === 'Ungespeicherte Änderungen bleiben erhalten')).toBe(true);

    resetMonacoMock();
    renderWithRouter(<StudioPage />, studioRoute());
    const restored = (await screen.findByTestId('monaco-editor')) as HTMLTextAreaElement;
    expect(restored.value).toBe('Entwurf');
    expect(await screen.findByText('1 ungespeicherte Datei')).toBeTruthy();
  });

  it('shows the load error of the project with a retry', async () => {
    mockHandlers.set('projects.get', () => {
      throw new MockRpcError('INTERNAL', 'Datenbank gesperrt.');
    });
    renderWithRouter(<StudioPage />, studioRoute());
    expect(await screen.findByText('Datenbank gesperrt.')).toBeTruthy();
    mockHandlers.delete('projects.get');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('tree', { name: 'Projektdateien' })).toBeTruthy();
  });
});
