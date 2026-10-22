/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectCommands } from '@shared/schemas';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers } from '../../../lib/mock-bridge';
import { useRpc } from '../../../hooks';
import { useToastStore } from '../../../stores/toasts';
import { ChecksPanel } from './ChecksPanel';

setupRendererTest();

function Harness({ projectId, commands, onOpen }: { projectId: string; commands: ProjectCommands; onOpen: (path: string, line: number, column: number) => void }) {
  const runs = useRpc('checks.list', { projectId, limit: 50 }, { refetchOn: ['check.updated'] });
  return <ChecksPanel projectId={projectId} commands={commands} runs={runs} onOpen={onOpen} />;
}

function renderChecks(projectId = 'prj_pixel', commandPatch: Partial<ProjectCommands> = {}) {
  const onOpen = vi.fn();
  const project = getMockDb().projects.find((p) => p.id === projectId);
  if (!project) throw new Error('unknown project');
  renderWithRouter(<Harness projectId={projectId} commands={{ ...project.config.commands, ...commandPatch }} onOpen={onOpen} />);
  return { onOpen };
}

describe('ChecksPanel', () => {
  it('lists the failures of the latest runs and jumps to file and line', async () => {
    const { onOpen } = renderChecks();
    const failures = await screen.findByRole('list', { name: 'Fehlerstellen der letzten Prüfungen' });
    const items = within(failures).getAllByRole('button');
    expect(items).toHaveLength(2);
    await userEvent.click(items[0]);
    expect(onOpen).toHaveBeenCalledWith('tests/player.test.ts', 48, 31);
  });

  it('starts a check with checks.run', async () => {
    renderChecks();
    await userEvent.click(await screen.findByRole('button', { name: 'Build ausführen' }));
    await waitFor(() => expect(getMockCalls('checks.run')[0]?.params).toEqual({ projectId: 'prj_pixel', kind: 'build' }));
    expect(await screen.findByRole('button', { name: /Build läuft/ })).toBeTruthy();
  });

  it('creates a fix task from a failed run', async () => {
    renderChecks();
    const buttons = await screen.findAllByRole('button', { name: 'Reparatur-Aufgabe anlegen' });
    await userEvent.click(buttons[0]);
    await waitFor(() => expect(getMockCalls('tasks.createFix')[0]?.params).toEqual({ projectId: 'prj_pixel', checkRunId: 'crun_px_t2' }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === 'Reparatur-Aufgabe angelegt' && t.action?.label === 'Aufgabe ansehen')).toBe(true));
  });

  it('explains missing commands instead of offering a check that cannot run', async () => {
    renderChecks('prj_pixel', { test: null });
    const button = await screen.findByRole('button', { name: 'Tests ausführen' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('title')).toBe('Für dieses Projekt ist kein Testbefehl eingerichtet – Prüfung nicht möglich.');
    expect(screen.getByText(/Für dieses Projekt ist kein Testbefehl eingerichtet – Prüfung nicht möglich\. Der Befehl lässt sich/)).toBeTruthy();
  });

  it('cancels a running check', async () => {
    renderChecks('prj_rezept');
    await userEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(getMockCalls('checks.cancel')[0]?.params).toEqual({ id: 'crun_rz_t2' }));
  });

  it('shows the output of a run on request', async () => {
    renderChecks();
    const toggles = await screen.findAllByRole('button', { name: 'Ausgabe' });
    await userEvent.click(toggles[0]);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText(/Tests 2 failed \| 22 passed \(24\)/)).toBeTruthy();
  });

  it('shows an empty state without runs', async () => {
    mockHandlers.set('checks.list', () => []);
    renderChecks();
    expect(await screen.findByText('Noch keine Prüfungen')).toBeTruthy();
  });
});
