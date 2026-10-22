/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockBridge, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import { currentLocation, findCard, renderProject } from './projectTestUtils';

setupRendererTest();

const location = currentLocation;
const card = findCard;

describe('ProjectDetailPage', () => {
  it('shows the header and switches tabs via ?tab=', async () => {
    renderProject('/projects/prj_pixel');
    expect(await screen.findByRole('heading', { level: 1, name: 'Pixel-Abenteuer' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Projektkopf' })).getByText('C:\\Users\\Demo\\Documents\\NOVA Projekte\\Pixel-Abenteuer')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Fortschritt des Projekts' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Übersicht/ }).getAttribute('aria-selected')).toBe('true');
    await userEvent.click(screen.getByRole('tab', { name: /Fehler/ }));
    expect(location()).toBe('/projects/prj_pixel?tab=errors');
    expect(screen.getByRole('tab', { name: /Fehler/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('opens the tasks tab for ?task= and highlights the task', async () => {
    renderProject('/projects/prj_pixel?task=task_px7');
    expect(await screen.findByRole('tab', { name: /Aufgaben/, selected: true })).toBeTruthy();
    const row = await waitFor(() => {
      const el = document.querySelector('[data-task-id="task_px7"]');
      expect(el).toBeTruthy();
      return el as HTMLElement;
    });
    expect(within(row).getByRole('button', { name: /Kollision an Plattformkanten korrigieren/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows a friendly message for a project that does not exist', async () => {
    renderProject('/projects/prj_gibtsnicht');
    expect(await screen.findByText('Dieses Projekt gibt es nicht (mehr)')).toBeTruthy();
  });

  it('relinks a moved project folder', async () => {
    const original = getMockDb().projects.find((p) => p.id === 'prj_rezept')!;
    mockHandlers.set('projects.get', () => ({ ...summaryOf(original), pathMissing: true }));
    vi.spyOn(mockBridge.app, 'selectDirectory').mockResolvedValue('D:\\Neu\\Rezept-API');
    renderProject('/projects/prj_rezept');
    await userEvent.click(await screen.findByRole('button', { name: 'Ordner neu verknüpfen' }));
    await waitFor(() => expect(getMockCalls('projects.update')[0]?.params).toEqual({ id: 'prj_rezept', path: 'D:\\Neu\\Rezept-API' }));
  });
});

describe('Übersicht', () => {
  it('runs tests from the quick actions', async () => {
    renderProject('/projects/prj_pixel');
    await userEvent.click(await screen.findByRole('button', { name: 'Tests ausführen' }));
    await waitFor(() => expect(getMockCalls('checks.run')[0]?.params).toEqual({ projectId: 'prj_pixel', kind: 'test' }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === 'Tests gestartet')).toBe(true));
  });

  it('says honestly when no test command is configured', async () => {
    getMockDb().projects.find((p) => p.id === 'prj_rezept')!.config.commands.test = null;
    renderProject('/projects/prj_rezept');
    const run = await screen.findByRole('button', { name: 'Tests ausführen' });
    expect(run.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByText(/Für dieses Projekt ist kein Testbefehl eingerichtet – Prüfung nicht möglich/).length).toBeGreaterThan(0);
  });

  it('plans a goal and jumps to the new plan task', async () => {
    renderProject('/projects/prj_pixel');
    await userEvent.click(await screen.findByRole('button', { name: 'Ziel planen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ziel planen' });
    await userEvent.type(within(dialog).getByRole('textbox'), 'Ein Bosskampf am Ende von Level 3');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Planen lassen' }));
    await waitFor(() => expect(getMockCalls('tasks.plan')[0]?.params).toEqual({ projectId: 'prj_pixel', goal: 'Ein Bosskampf am Ende von Level 3' }));
    const plan = getMockDb().tasks.find((t) => t.title.startsWith('Ziel planen: Ein Bosskampf'))!;
    await waitFor(() => expect(location()).toBe(`/projects/prj_pixel?tab=tasks&task=${plan.id}`));
  });

  it('edits name and description', async () => {
    renderProject('/projects/prj_pixel');
    const section = await card('Projekt');
    await userEvent.click(within(section).getByRole('button', { name: 'Bearbeiten' }));
    const description = within(section).getByRole('textbox', { name: 'Beschreibung' });
    await userEvent.clear(description);
    await userEvent.type(description, 'Jump-and-Run mit vier Leveln.');
    await userEvent.click(within(section).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('projects.update')[0]?.params).toEqual({ id: 'prj_pixel', description: 'Jump-and-Run mit vier Leveln.' }));
  });

  it('saves only the changed configuration fields', async () => {
    renderProject('/projects/prj_pixel');
    const section = await card('Befehle und Arbeitsweise');
    const test = within(section).getByRole('textbox', { name: 'Tests' });
    await userEvent.clear(test);
    await userEvent.type(test, 'npm run test:ci');
    await userEvent.click(within(section).getByRole('switch', { name: 'Erfolgreiche Änderungen automatisch committen' }));
    expect(within(section).getByText('Ungespeicherte Änderungen')).toBeTruthy();
    await userEvent.click(within(section).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('projects.update')[0]?.params).toEqual({ id: 'prj_pixel', config: { commands: { test: 'npm run test:ci' }, autoCommit: false } }));
  });

  it('rejects an invalid budget', async () => {
    renderProject('/projects/prj_pixel');
    const section = await card('Befehle und Arbeitsweise');
    const budget = within(section).getByRole('textbox', { name: /Monatliches Cloud-Budget/ });
    await userEvent.clear(budget);
    await userEvent.type(budget, 'viel');
    await userEvent.click(within(section).getByRole('button', { name: 'Speichern' }));
    expect(await within(section).findByText('Bitte einen Betrag ab 0 eingeben oder das Feld leer lassen.')).toBeTruthy();
    expect(getMockCalls('projects.update')).toHaveLength(0);
  });

  it('detects technologies and applies them on request', async () => {
    const pixel = getMockDb().projects.find((p) => p.id === 'prj_pixel')!;
    mockHandlers.set('projects.detect', () => ({ kind: 'web', technologies: [...pixel.technologies, 'Playwright'], config: pixel.config }));
    renderProject('/projects/prj_pixel');
    await userEvent.click(await screen.findByRole('button', { name: 'Erkennen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Technik und Befehle erkennen' });
    expect(await within(dialog).findByText(/Playwright/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Übernehmen' }));
    await waitFor(() => expect(getMockCalls('projects.update')).toHaveLength(1));
    expect(getMockCalls('projects.update')[0].params).toEqual({ id: 'prj_pixel', technologies: ['TypeScript', 'Vite', 'Phaser 3', 'Vitest', 'Playwright'], config: {} });
  });

  it('removes a project from NOVA after confirmation (files stay)', async () => {
    renderProject('/projects/prj_aether');
    await userEvent.click(await screen.findByRole('button', { name: 'Aus NOVA entfernen' }));
    const dialog = await screen.findByRole('dialog', { name: '„Aetherfall“ aus NOVA entfernen?' });
    expect(within(dialog).getByText('Der Projektordner und alle Dateien darin bleiben unverändert auf dem PC.')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(getMockCalls('projects.remove')[0]?.params).toEqual({ id: 'prj_aether' }));
    await waitFor(() => expect(location()).toBe('/projects'));
  });

  it('shows the error toast when saving fails', async () => {
    mockHandlers.set('projects.update', () => {
      throw new MockRpcError('VALIDATION', 'Der Name ist zu lang.');
    });
    renderProject('/projects/prj_pixel');
    const section = await card('Projekt');
    await userEvent.click(within(section).getByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(within(section).getByRole('textbox', { name: /Name/ }), ' 2');
    await userEvent.click(within(section).getByRole('button', { name: 'Speichern' }));
    expect(await within(section).findByText('Der Name ist zu lang.')).toBeTruthy();
  });
});

// Minimal ProjectSummary for an override (counts are irrelevant for these tests).
function summaryOf(p: ReturnType<typeof getMockDb>['projects'][number]) {
  return {
    ...p,
    progress: 0,
    openTasks: 0,
    runningTasks: 0,
    failedTasks: 0,
    blockedTasks: 0,
    pausedTasks: 0,
    waitingApprovalTasks: 0,
    taskCounts: {},
    pendingApprovals: 0,
    openErrors: 0,
    lastBuild: null,
    lastSuccessfulBuild: null,
    lastTest: null,
    lastActivityAt: null,
    pathMissing: false,
  };
}
