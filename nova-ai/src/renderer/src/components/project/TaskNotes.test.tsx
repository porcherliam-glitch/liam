/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { TaskNote } from '@shared/schemas';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import { openQuestion, TaskNotes } from './TaskNotes';

setupRendererTest();

const taskOf = (id: string) => getMockDb().tasks.find((t) => t.id === id)!;

describe('TaskNotes', () => {
  it('shows the conversation and sends a hint to the running agent', async () => {
    renderWithRouter(<TaskNotes task={taskOf('task_px3')} />);
    const messages = await screen.findByRole('list', { name: 'Nachrichten' });
    expect(within(messages).getByText(/Sprunghöhe etwas niedriger/)).toBeTruthy();
    expect(within(messages).getByText('Vom Agenten gelesen')).toBeTruthy();
    await userEvent.type(screen.getByRole('textbox', { name: 'Hinweis an den Agenten' }), 'Bitte auch Doppelsprung testen');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(getMockCalls('tasks.addNote')[0]?.params).toEqual({ taskId: 'task_px3', text: 'Bitte auch Doppelsprung testen' }));
    expect(await within(messages).findByText('Bitte auch Doppelsprung testen')).toBeTruthy();
    expect(within(messages).getByText('Wird beim nächsten Schritt übergeben')).toBeTruthy();
  });

  it('shows new agent questions live with answer buttons', async () => {
    renderWithRouter(<TaskNotes task={taskOf('task_px3')} />);
    await screen.findByRole('list', { name: 'Nachrichten' });
    const question: TaskNote = {
      id: 'note_live',
      taskId: 'task_px3',
      projectId: 'prj_pixel',
      author: 'agent',
      kind: 'question',
      text: 'Soll der Spieler doppelt springen können?',
      options: ['Ja', 'Nein'],
      assumption: 'Kein Doppelsprung.',
      createdAt: Date.now(),
      consumedRunId: null,
    };
    getMockDb().notes.push(question);
    act(() => emitMockEvent({ type: 'task.note', payload: question }));
    const region = await screen.findByRole('region', { name: 'Offene Frage des Agenten' });
    expect(within(region).getByText('Ohne Antwort geht der Agent so vor: Kein Doppelsprung.')).toBeTruthy();
    await userEvent.click(within(region).getByRole('button', { name: 'Nein' }));
    await waitFor(() => expect(getMockCalls('tasks.addNote')[0]?.params).toEqual({ taskId: 'task_px3', text: 'Nein' }));
  });

  it('shows an error toast when sending fails', async () => {
    mockHandlers.set('tasks.addNote', () => {
      throw new MockRpcError('NOT_FOUND', 'Die Aufgabe gibt es nicht mehr.');
    });
    renderWithRouter(<TaskNotes task={taskOf('task_px3')} />);
    await userEvent.type(await screen.findByRole('textbox', { name: 'Hinweis an den Agenten' }), 'Hallo');
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Die Aufgabe gibt es nicht mehr.'));
  });

  it('does not accept hints for finished tasks', async () => {
    renderWithRouter(<TaskNotes task={taskOf('task_px2')} />);
    expect(await screen.findByText('Die Aufgabe ist abgeschlossen – neue Hinweise sind nicht mehr möglich.')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('openQuestion', () => {
  const note = (id: string, kind: TaskNote['kind'], createdAt: number) => ({ id, kind, createdAt }) as TaskNote;
  it('returns the newest unanswered question', () => {
    expect(openQuestion([note('q', 'question', 1), note('a', 'answer', 2)])).toBeNull();
    expect(openQuestion([note('q1', 'question', 1), note('a', 'answer', 2), note('q2', 'question', 3)])?.id).toBe('q2');
  });
});
