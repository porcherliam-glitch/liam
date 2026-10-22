/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, setMockHandler } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import TasksPage from './TasksPage';

setupRendererTest();

const renderPage = () => renderWithRouter(<TasksPage />, { route: '/tasks' });

/** The list item of a task (waits until it is rendered). */
async function row(taskId: string): Promise<HTMLElement> {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
    expect(el).toBeTruthy();
    return el!;
  });
}

describe('TasksPage', () => {
  it('shows the tasks of all projects grouped by what needs attention', async () => {
    renderPage();
    const attention = await screen.findByRole('list', { name: 'Braucht Aufmerksamkeit: Aufgaben' });
    expect(within(attention).getByText('Kollision an Plattformkanten korrigieren')).toBeTruthy();
    expect(within(attention).getByText('Datenbank-Migration für den Einkaufszettel')).toBeTruthy();
    const active = screen.getByRole('list', { name: 'In Arbeit: Aufgaben' });
    expect(within(active).getByText('Spielerbewegung mit Tastatur und Sprung')).toBeTruthy();
    expect(within(active).getAllByText(/Pixel-Abenteuer|Rezept-API/).length).toBeGreaterThan(0);
  });

  it('filters by project and role', async () => {
    renderPage();
    await screen.findByText('Spielerbewegung mit Tastatur und Sprung');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Projekt' }), 'prj_rezept');
    await waitFor(() => expect(screen.queryByText('Spielerbewegung mit Tastatur und Sprung')).toBeNull());
    expect(screen.getByText('Tests für die Suche schreiben und ausführen')).toBeTruthy();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rolle' }), 'tester');
    await waitFor(() => expect(screen.queryByText('Einkaufszettel als PDF exportieren')).toBeNull());
    expect(screen.getByText('Tests für die Suche schreiben und ausführen')).toBeTruthy();
  });

  it('changes the priority', async () => {
    renderPage();
    const r = await row('task_px5');
    await userEvent.selectOptions(within(r).getByRole('combobox', { name: 'Priorität' }), '3');
    await waitFor(() => expect(getMockCalls('tasks.setPriority')[0]?.params).toEqual({ id: 'task_px5', priority: 3 }));
  });

  it('enables the controls that fit the status', async () => {
    renderPage();
    const running = await row('task_px3');
    expect(within(running).getByRole('button', { name: 'Pausieren' }).hasAttribute('disabled')).toBe(false);
    expect(within(running).getByRole('button', { name: 'Bearbeiten' }).hasAttribute('disabled')).toBe(true);
    expect(within(running).getByRole('button', { name: 'Löschen' }).hasAttribute('disabled')).toBe(true);
    const paused = await row('task_rz6');
    expect(within(paused).getByRole('button', { name: 'Fortsetzen' }).hasAttribute('disabled')).toBe(false);
    expect(within(paused).getByRole('button', { name: 'Bearbeiten' }).hasAttribute('disabled')).toBe(false);
    expect(within(paused).getByRole('button', { name: 'Pausieren' }).hasAttribute('disabled')).toBe(true);
    const failed = await row('task_px7');
    expect(within(failed).getByRole('button', { name: 'Wiederholen' }).hasAttribute('disabled')).toBe(false);
  });

  it('starts a queued task right away', async () => {
    renderPage();
    const r = await row('task_px5');
    await userEvent.click(within(r).getByRole('button', { name: 'Jetzt starten' }));
    await waitFor(() => expect(getMockCalls('tasks.start')[0]?.params).toEqual({ id: 'task_px5' }));
    await waitFor(() => expect(within(r).getByText('von Hand gestartet')).toBeTruthy());
  });

  it('resumes a paused task', async () => {
    renderPage();
    const r = await row('task_rz6');
    await userEvent.click(within(r).getByRole('button', { name: 'Fortsetzen' }));
    await waitFor(() => expect(getMockCalls('tasks.resume')[0]?.params).toEqual({ id: 'task_rz6' }));
  });

  it('edits a paused task', async () => {
    renderPage();
    const r = await row('task_rz6');
    await userEvent.click(within(r).getByRole('button', { name: 'Bearbeiten' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aufgabe bearbeiten' });
    expect(within(dialog).getByText(/Der Agent bekommt die Änderungen, sobald sie fortgesetzt wird/)).toBeTruthy();
    const title = within(dialog).getByRole('textbox', { name: /Titel/ });
    await userEvent.clear(title);
    await userEvent.type(title, 'Einkaufszettel als PDF');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('tasks.update')[0]?.params).toEqual({ id: 'task_rz6', title: 'Einkaufszettel als PDF' }));
  });

  it('deletes a task after confirmation', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: /^Abgeschlossen/ }));
    const r = await row('task_px9');
    await userEvent.click(within(r).getByRole('button', { name: 'Löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aufgabe löschen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(getMockCalls('tasks.delete')[0]?.params).toEqual({ id: 'task_px9' }));
    await waitFor(() => expect(document.querySelector('[data-task-id="task_px9"]')).toBeNull());
  });

  it('explains why a task with open dependents cannot be deleted', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: /^Abgeschlossen/ }));
    const r = await row('task_px2');
    await userEvent.click(within(r).getByRole('button', { name: 'Löschen' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Aufgabe löschen?' })).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toMatch(/Andere Aufgaben hängen davon ab/));
  });

  it('creates a task with dependencies and acceptance criteria', async () => {
    renderPage();
    await screen.findByText('Spielerbewegung mit Tastatur und Sprung');
    await userEvent.click(screen.getAllByRole('button', { name: 'Aufgabe anlegen' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Aufgabe anlegen' });
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: /Projekt/ }), 'prj_pixel');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Titel/ }), 'Level 3: Burg');
    const deps = await within(dialog).findByRole('list', { name: 'Mögliche Abhängigkeiten' });
    await userEvent.click(within(deps).getByRole('checkbox', { name: /Level 2: Höhle/ }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Abnahmekriterien/ }), 'Die Burg ist spielbar.');
    await userEvent.selectOptions(within(dialog).getByRole('combobox', { name: 'Priorität' }), '2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aufgabe anlegen' }));
    await waitFor(() =>
      expect(getMockCalls('tasks.create')[0]?.params).toEqual({
        projectId: 'prj_pixel',
        title: 'Level 3: Burg',
        description: '',
        kind: 'code',
        priority: 2,
        dependsOn: ['task_px5'],
        acceptance: 'Die Burg ist spielbar.',
      }),
    );
    const created = getMockDb().tasks.find((t) => t.title === 'Level 3: Burg')!;
    const r = await row(created.id);
    expect(within(r).getByText(/wartet auf 1 von 1/)).toBeTruthy();
  });

  it('answers an agent question of a blocked task', async () => {
    renderPage();
    const r = await row('task_rz4');
    await userEvent.click(within(r).getByRole('button', { name: 'Frage beantworten' }));
    const question = await within(r).findByRole('region', { name: 'Offene Frage des Agenten' });
    await userEvent.click(within(question).getByRole('button', { name: 'Ja, Testdatenbank zurücksetzen' }));
    await waitFor(() => expect(getMockCalls('tasks.addNote')[0]?.params).toEqual({ taskId: 'task_rz4', text: 'Ja, Testdatenbank zurücksetzen' }));
    await waitFor(() => expect(getMockDb().tasks.find((t) => t.id === 'task_rz4')?.status).toBe('queued'));
  });

  it('shows verification checks with reviewer findings in the details', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('radio', { name: /^Abgeschlossen/ }));
    const r = await row('task_px8');
    await userEvent.click(within(r).getByRole('button', { name: /Code-Prüfung: Grundgerüst/ }));
    const findings = await within(r).findByRole('list', { name: 'Hinweise aus „Review“' });
    expect(within(findings).getByRole('link', { name: 'src/main.ts:9' }).getAttribute('href')).toBe('/projects/prj_pixel/studio?file=src%2Fmain.ts&line=9');
  });

  it('shows the empty state when there are no tasks', async () => {
    setMockHandler('tasks.list', () => []);
    renderPage();
    expect(await screen.findByText('Noch keine Aufgaben')).toBeTruthy();
  });
});
