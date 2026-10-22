/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { useRpc } from '../../../hooks';
import { ChangesPanel, type ChangesFocusRequest } from './ChangesPanel';

vi.mock('@monaco-editor/react', async () => (await import('../test-mocks')).monacoReactModule);
vi.mock('../monaco-setup', async () => (await import('../test-mocks')).monacoSetupModule);

setupRendererTest();

function Harness({ projectId, onOpenFile, focusRequest }: { projectId: string; onOpenFile: (path: string) => void; focusRequest?: ChangesFocusRequest | null }) {
  const changed = useRpc('files.changed', { projectId });
  const tasks = useRpc('tasks.list', { projectId });
  return <ChangesPanel projectId={projectId} changed={changed} tasks={tasks.data ?? []} onOpenFile={onOpenFile} focusRequest={focusRequest} />;
}

function renderChanges(projectId = 'prj_pixel', focusRequest: ChangesFocusRequest | null = null) {
  const onOpenFile = vi.fn();
  renderWithRouter(<Harness projectId={projectId} onOpenFile={onOpenFile} focusRequest={focusRequest} />);
  return { onOpenFile };
}

const list = () => screen.findByRole('list', { name: 'Von NOVA geänderte Dateien' });

describe('ChangesPanel', () => {
  it('lists the files NOVA changed and shows the diff of the selected file', async () => {
    const { onOpenFile } = renderChanges();
    const files = await list();
    expect(within(files).getAllByRole('button').length).toBe(8);
    const physics = within(files).getByRole('button', { name: /physics\.ts.*Danach von Hand geändert/ });
    await userEvent.click(physics);
    expect(physics.getAttribute('aria-current')).toBe('true');
    await waitFor(() => expect(getMockCalls('files.diff').at(-1)?.params).toEqual({ projectId: 'prj_pixel', path: 'src/game/physics.ts' }));
    const diff = await screen.findByTestId('diff-editor');
    expect(diff.querySelector('[data-side="modified"]')?.textContent).toContain('export function');
    expect(screen.getByText('Von NOVA geändert', { selector: 'span' })).toBeTruthy();
    expect(screen.getAllByText('Danach von Hand geändert').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Im Editor öffnen' }));
    expect(onOpenFile).toHaveBeenCalledWith('src/game/physics.ts');
  });

  it('filters by task and compares against the state before that task', async () => {
    renderChanges();
    await list();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Nach Aufgabe filtern' }), 'task_px3');
    const files = await list();
    await waitFor(() => expect(within(files).getAllByRole('button').map((b) => b.getAttribute('title'))).toEqual(['src/game/player.ts', 'src/scenes/GameScene.ts']));
    await waitFor(() => expect(getMockCalls('files.diff').at(-1)?.params).toEqual({ projectId: 'prj_pixel', path: 'src/game/player.ts', taskId: 'task_px3' }));
    expect(screen.getByText('Vor der Aufgabe')).toBeTruthy();
  });

  it('compares older versions from the change history', async () => {
    renderChanges('prj_pixel', { path: 'src/game/player.ts', token: 1 });
    const select = (await screen.findByRole('combobox', { name: 'Vergleichsstand' })) as HTMLSelectElement;
    const option = [...select.options].find((o) => o.value !== '__all__');
    expect(option).toBeTruthy();
    await userEvent.selectOptions(select, option!.value);
    await waitFor(() => expect(getMockCalls('files.diff').at(-1)?.params).toEqual({ projectId: 'prj_pixel', path: 'src/game/player.ts', changeId: Number(option!.value) }));
  });

  it('shows open git changes with git.diff', async () => {
    renderChanges();
    await list();
    await userEvent.click(screen.getByRole('radio', { name: 'Git' }));
    const gitList = await screen.findByRole('list', { name: 'Offene Git-Änderungen' });
    expect(getMockCalls('git.status').at(-1)?.params).toEqual({ projectId: 'prj_pixel' });
    const first = within(gitList).getAllByRole('button')[0];
    await waitFor(() => expect(getMockCalls('git.diff').at(-1)?.params).toEqual({ projectId: 'prj_pixel', path: first.getAttribute('title') }));
    expect(await screen.findByText('Letzter Commit')).toBeTruthy();
  });

  it('offers to set up git when the project has no repository', async () => {
    renderChanges('prj_rezept');
    await list();
    await userEvent.click(screen.getByRole('radio', { name: 'Git' }));
    expect(await screen.findByText('Kein Git-Repository')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Git einrichten' }));
    await waitFor(() => expect(getMockCalls('git.init')[0]?.params).toEqual({ projectId: 'prj_rezept' }));
  });

  it('shows an empty state when NOVA changed nothing', async () => {
    mockHandlers.set('files.changed', () => []);
    renderChanges();
    expect(await screen.findByText('NOVA hat noch keine Dateien geändert')).toBeTruthy();
    expect(screen.getByText('Datei auswählen')).toBeTruthy();
  });

  it('shows diff errors with a retry', async () => {
    mockHandlers.set('files.diff', () => {
      throw new MockRpcError('NOT_FOUND', 'Die Datei wurde nicht gefunden.');
    });
    renderChanges();
    expect(await screen.findByText('Der Vergleich konnte nicht geladen werden')).toBeTruthy();
    expect(screen.getByText('Die Datei wurde nicht gefunden.')).toBeTruthy();
  });
});
