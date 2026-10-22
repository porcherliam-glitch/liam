// Conversation between the user and the agents of one task (UI-SPEC §7): hints to running/paused agents,
// agent questions (ask_user) with answer options and free-text answers. tasks.notes / tasks.addNote.
import { useMemo, useState, type FormEvent } from 'react';
import { Bot, CircleHelp, Cog, MessageSquare, Send, UserRound } from 'lucide-react';
import type { Task, TaskNote } from '@shared/schemas';
import { useMutation, useRpc } from '../../hooks/useRpc';
import { cn } from '../../lib/cn';
import { metaOf, TASK_NOTE_KIND } from '../../lib/labels';
import { Button } from '../ui/Button';
import { StatusBadge } from '../ui/Badge';
import { Spinner } from '../ui/Spinner';
import { RelativeTime } from '../common/RelativeTime';
import { taskCapabilities } from './taskRules';

export interface TaskNotesProps {
  task: Pick<Task, 'id' | 'status' | 'startRequested' | 'blockerCode'>;
  className?: string;
}

/** The newest agent question that has no later answer, or null. */
export function openQuestion(notes: readonly TaskNote[]): TaskNote | null {
  const sorted = [...notes].sort((a, b) => a.createdAt - b.createdAt);
  let open: TaskNote | null = null;
  for (const n of sorted) {
    if (n.kind === 'question') open = n;
    else if (n.kind === 'answer' && open && n.createdAt >= open.createdAt) open = null;
  }
  return open;
}

const AUTHOR = {
  user: { label: 'Ich', icon: UserRound },
  agent: { label: 'Agent', icon: Bot },
  system: { label: 'NOVA', icon: Cog },
} as const;

export function TaskNotes({ task, className }: TaskNotesProps) {
  const notes = useRpc('tasks.notes', { taskId: task.id }, { refetchOn: ['task.note'], eventFilter: (e) => e.type === 'task.note' && e.payload.taskId === task.id });
  const [text, setText] = useState('');
  const add = useMutation('tasks.addNote', {
    successToast: (n) => (n.kind === 'answer' ? 'Antwort gesendet' : 'Hinweis gesendet'),
    onSuccess: (note) => notes.setData((prev) => (prev ? (prev.some((n) => n.id === note.id) ? prev : [...prev, note]) : [note])),
  });
  const list = useMemo(() => [...(notes.data ?? [])].sort((a, b) => a.createdAt - b.createdAt), [notes.data]);
  const question = useMemo(() => openQuestion(list), [list]);
  const canWrite = taskCapabilities(task).note;

  const send = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const res = await add.run({ taskId: task.id, text: trimmed });
    if (res) setText('');
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };

  return (
    <section aria-label="Unterhaltung mit dem Agenten" className={cn('space-y-3', className)}>
      <h4 className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        <MessageSquare aria-hidden className="h-3.5 w-3.5" />
        Unterhaltung mit dem Agenten
      </h4>

      {question && canWrite && (
        <div role="region" aria-label="Offene Frage des Agenten" className="rounded-lg border border-warning/40 bg-warning/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-fg">
            <CircleHelp aria-hidden className="h-3.5 w-3.5" />
            Der Agent hat eine Frage
          </p>
          <p className="mt-1.5 text-[13px] whitespace-pre-wrap text-text">{question.text}</p>
          {question.assumption && <p className="mt-1.5 text-xs text-muted">Ohne Antwort: {question.assumption}</p>}
          {question.options.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {question.options.map((o) => (
                <Button key={o} size="sm" variant="subtle" disabled={add.loading} onClick={() => void send(o)}>
                  {o}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {notes.loading ? (
        <div className="flex items-center gap-2 text-xs text-muted">
          <Spinner size="sm" label={null} /> Unterhaltung wird geladen …
        </div>
      ) : notes.error && !notes.data ? (
        <p className="text-xs text-danger-fg">Die Unterhaltung konnte nicht geladen werden: {notes.error.message}</p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted">Noch keine Nachrichten. Hinweise an den Agenten erscheinen hier, ebenso seine Fragen.</p>
      ) : (
        <ol className="space-y-2" aria-label="Nachrichten">
          {list.map((n) => {
            const author = AUTHOR[n.author] ?? AUTHOR.system;
            const Icon = author.icon;
            return (
              <li key={n.id} className={cn('flex gap-2.5', n.author === 'user' && 'flex-row-reverse text-right')}>
                <span
                  className={cn(
                    'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                    n.author === 'user' ? 'bg-blue/15 text-blue-fg' : n.author === 'agent' ? 'bg-violet/15 text-violet-fg' : 'bg-surface-3 text-muted',
                  )}
                  title={author.label}
                >
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                </span>
                <div className={cn('max-w-[85%] min-w-0 rounded-lg border border-border bg-surface-2 px-3 py-2', n.author === 'user' && 'text-left')}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-[11px] font-medium text-text">{author.label}</span>
                    <StatusBadge meta={metaOf(TASK_NOTE_KIND, n.kind)} />
                    <RelativeTime ts={n.createdAt} className="text-[11px] text-subtle" />
                  </div>
                  <p className="mt-1 text-[13px] whitespace-pre-wrap text-text">{n.text}</p>
                  {n.kind === 'question' && n.options.length > 0 && <p className="mt-1 text-xs text-muted">Antwortmöglichkeiten: {n.options.join(' · ')}</p>}
                  {n.author === 'user' && (
                    <p className="mt-1 text-[11px] text-subtle">{n.consumedRunId ? 'Vom Agenten gelesen' : 'Wird beim nächsten Schritt übergeben'}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {canWrite ? (
        <form onSubmit={onSubmit} className="flex items-end gap-2">
          <label className="sr-only" htmlFor={`note-${task.id}`}>
            {question ? 'Antwort an den Agenten' : 'Hinweis an den Agenten'}
          </label>
          <textarea
            id={`note-${task.id}`}
            rows={2}
            value={text}
            maxLength={20000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void send(text);
              }
            }}
            placeholder={question ? 'Eigene Antwort schreiben …' : 'Hinweis an den Agenten (z. B. „Bitte Tests zuerst schreiben“) …'}
            className="min-h-14 flex-1 resize-y rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[13px] text-text placeholder:text-subtle hover:border-border-strong focus-visible:border-violet focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-violet/60"
          />
          <Button type="submit" variant="primary" icon={Send} loading={add.loading} disabled={!text.trim()}>
            {question ? 'Antworten' : 'Senden'}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted">Die Aufgabe ist abgeschlossen – neue Hinweise sind nicht mehr möglich.</p>
      )}
    </section>
  );
}
