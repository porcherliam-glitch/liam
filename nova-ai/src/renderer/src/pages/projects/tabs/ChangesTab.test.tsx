/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { RESTORE_EXPLANATION } from '../../../components/project';
import { findCard, renderProject } from '../projectTestUtils';

setupRendererTest();

describe('Änderungen', () => {
  it('lists files changed by NOVA with tasks and the "nach NOVA geändert" marker', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    const table = await screen.findByRole('table', { name: 'Geänderte Dateien' });
    const physics = within(table).getByRole('link', { name: 'src/game/physics.ts' }).closest('tr')!;
    expect(within(physics).getByText('nach NOVA geändert')).toBeTruthy();
    expect(within(physics).getByRole('link', { name: 'Kollision an Plattformkanten korrigieren' }).getAttribute('href')).toBe('/projects/prj_pixel?tab=tasks&task=task_px7');
    expect(within(table).getByRole('link', { name: 'src/game/player.ts' }).getAttribute('href')).toBe('/projects/prj_pixel/studio?file=src%2Fgame%2Fplayer.ts');
    expect(screen.getByText(/nach NOVA noch einmal geändert/)).toBeTruthy();
  });

  it('shows the differences of a file', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    await userEvent.click(await screen.findByRole('button', { name: 'Unterschiede von src/game/player.ts anzeigen' }));
    await waitFor(() => expect(getMockCalls('files.diff')[0]?.params).toEqual({ projectId: 'prj_pixel', path: 'src/game/player.ts' }));
    const dialog = await screen.findByRole('dialog', { name: 'src/game/player.ts' });
    expect(await within(dialog).findByLabelText('Unterschiede')).toBeTruthy();
  });

  it('restores a restore point after the confirmation that explains what is undone', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    await userEvent.click(await screen.findByRole('button', { name: 'Wiederherstellen: Vor dem Umbau der Physik' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wiederherstellen?' });
    expect(within(dialog).getByText(RESTORE_EXPLANATION)).toBeTruthy();
    const restored = await within(dialog).findByRole('list', { name: 'Wird wiederhergestellt' });
    expect(within(restored).getByText('src/game/player.ts')).toBeTruthy();
    const conflicts = within(dialog).getByRole('list', { name: 'Konflikte – bleiben unverändert' });
    expect(within(conflicts).getByText('src/game/physics.ts')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Jetzt wiederherstellen' }));
    await waitFor(() => expect(getMockCalls('checkpoints.restore')[0]?.params).toEqual({ checkpointId: 'chk_px3', commit: true }));
    expect(await screen.findByText('2 Dateien wurden wiederhergestellt.')).toBeTruthy();
  });

  it('previews a restore point without changing anything', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschau: Vor dem Umbau der Physik' }));
    const dialog = await screen.findByRole('dialog', { name: 'Vorschau der Wiederherstellung' });
    await waitFor(() => expect(getMockCalls('checkpoints.preview')[0]?.params).toEqual({ checkpointId: 'chk_px3' }));
    expect(await within(dialog).findByRole('list', { name: 'Wird wiederhergestellt' })).toBeTruthy();
    expect(getMockCalls('checkpoints.restore')).toHaveLength(0);
  });

  it('creates a restore point', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    await userEvent.click(await screen.findByRole('button', { name: 'Punkt anlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Wiederherstellungspunkt anlegen' });
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Bezeichnung/ }), 'Vor Level 3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Anlegen' }));
    await waitFor(() => expect(getMockCalls('checkpoints.create')[0]?.params).toEqual({ projectId: 'prj_pixel', label: 'Vor Level 3' }));
    const list = await screen.findByRole('list', { name: 'Wiederherstellungspunkte' });
    expect(await within(list).findByText('Vor Level 3')).toBeTruthy();
  });

  it('undoes the changes of one task', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    await userEvent.click(await screen.findByRole('button', { name: 'Änderungen von „Grundgerüst mit Vite und Phaser anlegen“ rückgängig machen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Änderungen der Aufgabe rückgängig machen' });
    await within(dialog).findByRole('list', { name: 'Wird wiederhergestellt' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Jetzt wiederherstellen' }));
    await waitFor(() => expect(getMockCalls('checkpoints.restore')[0]?.params).toEqual({ taskId: 'task_px2', commit: true }));
  });

  it('does not offer to undo a running task', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    const button = await screen.findByRole('button', { name: 'Änderungen von „Spielerbewegung mit Tastatur und Sprung“ rückgängig machen' });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('shows git status and commits with NOVA commits marked', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    const git = await findCard('Git');
    expect(await within(git).findByText('main')).toBeTruthy();
    const commits = await within(git).findByRole('list', { name: 'Letzte Commits' });
    expect(within(commits).getByText('NOVA: Grundgerüst mit Vite und Phaser angelegt')).toBeTruthy();
    expect(within(commits).getAllByText('von NOVA')).toHaveLength(1);
  });

  it('sets up git for a project without a repository', async () => {
    renderProject('/projects/prj_rezept?tab=changes');
    const git = await findCard('Git');
    await userEvent.click(await within(git).findByRole('button', { name: 'Git einrichten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Git einrichten?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Git einrichten' }));
    await waitFor(() => expect(getMockCalls('git.init')[0]?.params).toEqual({ projectId: 'prj_rezept' }));
    expect(await within(git).findByText('NOVA: Git eingerichtet (erster Stand)')).toBeTruthy();
  });

  it('compares an older change from the history', async () => {
    renderProject('/projects/prj_pixel?tab=changes');
    const history = await screen.findByRole('table', { name: 'Verlauf der Dateiänderungen' });
    const buttons = await within(history).findAllByRole('button', { name: 'Änderung an src/game/physics.ts vergleichen' });
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(getMockCalls('files.diff')[0]?.params).toMatchObject({ projectId: 'prj_pixel', path: 'src/game/physics.ts', changeId: expect.any(Number) }));
  });

  it('shows a load error for restore points with retry', async () => {
    mockHandlers.set('checkpoints.list', () => {
      throw new MockRpcError('INTERNAL', 'Journal nicht lesbar.');
    });
    renderProject('/projects/prj_pixel?tab=changes');
    const card = await findCard('Wiederherstellungspunkte');
    expect(await within(card).findByText('Journal nicht lesbar.')).toBeTruthy();
    mockHandlers.delete('checkpoints.list');
    await userEvent.click(within(card).getByRole('button', { name: 'Erneut versuchen' }));
    expect(await within(card).findByText('Vor dem Umbau der Physik')).toBeTruthy();
  });
});
