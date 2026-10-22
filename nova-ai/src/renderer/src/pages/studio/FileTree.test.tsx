/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import { useDaemonStore } from '../../stores/daemon';
import { FileTree, type FileTreeProps } from './FileTree';

setupRendererTest();

const PIXEL = 'prj_pixel';

function renderTree(props: Partial<FileTreeProps> = {}) {
  const handlers = { onOpen: vi.fn(), onRenamed: vi.fn(), onDeleted: vi.fn(), onOpenInVsCode: vi.fn() };
  renderWithRouter(
    <FileTree projectId={PIXEL} projectRoot="C:\\Projekte\\Pixel" activePath={null} dirtyPaths={new Set()} {...handlers} {...props} />,
  );
  return handlers;
}

async function findTree() {
  return screen.findByRole('tree', { name: 'Projektdateien' });
}

describe('FileTree', () => {
  it('loads folders lazily and marks NOVA changes and git status', async () => {
    renderTree();
    const tree = await findTree();
    expect(getMockCalls('files.tree')[0].params).toEqual({ projectId: PIXEL, path: '', depth: 2 });
    await userEvent.click(within(tree).getByRole('treeitem', { name: /^src/ }));
    const game = await within(tree).findByRole('treeitem', { name: /^game – enthält von NOVA geänderte Dateien/ });
    await userEvent.click(game);
    await waitFor(() => expect(getMockCalls('files.tree').some((c) => c.params.path === 'src/game' && c.params.depth === 1)).toBe(true));
    const player = await within(tree).findByRole('treeitem', { name: /^player\.ts – von NOVA geändert, Geändert \(Git\)/ });
    expect(player.getAttribute('aria-level')).toBe('3');
  });

  it('opens files with the mouse and the keyboard', async () => {
    const { onOpen } = renderTree();
    const tree = await findTree();
    await userEvent.click(within(tree).getByRole('treeitem', { name: /^index\.html/ }));
    expect(onOpen).toHaveBeenCalledWith('index.html');

    const first = within(tree).getAllByRole('treeitem')[0];
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' }); // expand "public"
    await within(tree).findByRole('treeitem', { name: /^assets/ });
    fireEvent.keyDown(first, { key: 'End' });
    await waitFor(() => expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^vite\.config\.ts/));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith('vite.config.ts');
  });

  it('creates a new file in a folder from the context menu and opens it', async () => {
    const { onOpen } = renderTree();
    const tree = await findTree();
    fireEvent.contextMenu(within(tree).getByRole('treeitem', { name: /^src/ }));
    const menu = await screen.findByRole('menu', { name: 'Aktionen für src' });
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Neue Datei …' }));
    const dialog = await screen.findByRole('dialog', { name: 'Neue Datei' });
    expect(within(dialog).getByText(/im Ordner „src“/)).toBeTruthy();
    await userEvent.type(within(dialog).getByLabelText('Name'), 'ui/menu.ts');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith('src/ui/menu.ts'));
    expect(getMockCalls('files.write')[0].params).toEqual({ projectId: PIXEL, path: 'src/ui/menu.ts', content: '', expectedHash: null });
    expect(getMockDb().files[PIXEL]['src/ui/menu.ts']).toBe('');
  });

  it('refuses invalid or existing names without overwriting', async () => {
    renderTree();
    await findTree();
    await userEvent.click(screen.getByRole('button', { name: 'Neue Datei' }));
    const dialog = await screen.findByRole('dialog', { name: 'Neue Datei' });
    const input = within(dialog).getByLabelText('Name');
    await userEvent.type(input, 'a?.ts');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    expect(await within(dialog).findByText(/Diese Zeichen sind in Namen nicht erlaubt/)).toBeTruthy();
    await userEvent.clear(input);
    await userEvent.type(input, 'index.html');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    expect(await within(dialog).findByText('Eine Datei mit diesem Namen gibt es hier schon.')).toBeTruthy();
    expect(getMockCalls('files.write')).toHaveLength(0);
  });

  it('creates folders, renames with F2 and deletes with Entf', async () => {
    const { onRenamed, onDeleted } = renderTree();
    const tree = await findTree();
    await userEvent.click(screen.getByRole('button', { name: 'Neuer Ordner' }));
    const mk = await screen.findByRole('dialog', { name: 'Neuer Ordner' });
    await userEvent.type(within(mk).getByLabelText('Name'), 'docs');
    await userEvent.click(within(mk).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(getMockCalls('files.mkdir')[0]?.params).toEqual({ projectId: PIXEL, path: 'docs' }));

    const readme = within(tree).getByRole('treeitem', { name: /^README\.md/ });
    readme.focus();
    fireEvent.keyDown(readme, { key: 'F2' });
    const rename = await screen.findByRole('dialog', { name: 'Datei umbenennen' });
    const input = within(rename).getByLabelText('Name') as HTMLInputElement;
    expect(input.value).toBe('README.md');
    await userEvent.clear(input);
    await userEvent.type(input, 'LIESMICH.md');
    await userEvent.click(within(rename).getByRole('button', { name: 'Umbenennen' }));
    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('README.md', 'LIESMICH.md'));
    expect(getMockCalls('files.rename')[0].params).toEqual({ projectId: PIXEL, from: 'README.md', to: 'LIESMICH.md' });

    const renamed = await within(tree).findByRole('treeitem', { name: /^LIESMICH\.md/ });
    renamed.focus();
    fireEvent.keyDown(renamed, { key: 'Delete' });
    const confirm = await screen.findByRole('dialog', { name: 'Datei „LIESMICH.md“ löschen?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith('LIESMICH.md'));
    expect(getMockCalls('files.delete')[0].params).toEqual({ projectId: PIXEL, path: 'LIESMICH.md' });
  });

  it('shows an error toast when deleting fails', async () => {
    mockHandlers.set('files.delete', () => {
      throw new MockRpcError('FILE_IN_USE', 'Die Datei wird gerade von einem anderen Programm verwendet.');
    });
    const { onDeleted } = renderTree();
    const tree = await findTree();
    const html = within(tree).getByRole('treeitem', { name: /^index\.html/ });
    html.focus();
    fireEvent.keyDown(html, { key: 'Delete' });
    const confirm = await screen.findByRole('dialog', { name: /löschen\?/ });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Löschen' }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === 'Löschen fehlgeschlagen' && t.message === 'Die Datei wird gerade von einem anderen Programm verwendet.')).toBe(true),
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it('refreshes when files change on disk', async () => {
    renderTree();
    const tree = await findTree();
    getMockDb().files[PIXEL]['CHANGELOG.md'] = '# Änderungen\n';
    act(() => emitMockEvent({ type: 'files.changed', payload: { projectId: PIXEL, paths: ['CHANGELOG.md'], actor: 'external' } }));
    expect(await within(tree).findByRole('treeitem', { name: /^CHANGELOG\.md/ })).toBeTruthy();
  });

  it('offers VS Code in the context menu of files', async () => {
    const { onOpenInVsCode } = renderTree();
    const tree = await findTree();
    fireEvent.contextMenu(within(tree).getByRole('treeitem', { name: /^index\.html/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'In VS Code öffnen' }));
    expect(onOpenInVsCode).toHaveBeenCalledWith('index.html');
  });

  it('hides file operations the connected daemon does not offer', async () => {
    renderTree();
    const tree = await findTree();
    act(() => useDaemonStore.getState().setStatus({ ...getMockDb().daemon, methods: ['files.tree', 'files.read', 'files.write'] }));
    expect(screen.queryByRole('button', { name: 'Neuer Ordner' })).toBeNull();
    fireEvent.contextMenu(within(tree).getByRole('treeitem', { name: /^src/ }));
    const menu = await screen.findByRole('menu', { name: 'Aktionen für src' });
    expect(within(menu).getByRole('menuitem', { name: 'Neue Datei …' })).toBeTruthy();
    expect(within(menu).queryByRole('menuitem', { name: 'Umbenennen …' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Löschen …' })).toBeNull();
    expect(within(menu).queryByRole('menuitem', { name: 'Neuer Ordner …' })).toBeNull();
  });

  it('shows an empty state for an empty project folder', async () => {
    mockHandlers.set('files.tree', () => ({ name: 'Leer', path: '', type: 'dir', size: null, children: [], changedByNova: false, gitStatus: null }));
    renderTree();
    expect(await screen.findByText('Der Projektordner ist leer')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Neue Datei anlegen' })).toHaveLength(1);
  });

  it('shows load errors with a retry', async () => {
    mockHandlers.set('files.tree', () => {
      throw new MockRpcError('PATH_OUTSIDE_PROJECT', 'Der Ordner liegt außerhalb des Projekts.');
    });
    renderTree();
    expect(await screen.findByText('Die Dateien konnten nicht geladen werden')).toBeTruthy();
    mockHandlers.delete('files.tree');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await findTree()).toBeTruthy();
  });
});
