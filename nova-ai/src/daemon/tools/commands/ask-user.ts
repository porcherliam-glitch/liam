// Agent tool ask_user (planner, coder, tester): asks the user a decisive question (SPEC §6.3, §6.4).
// Key decisions:
// - Creates a TaskNote {author:'agent', kind:'question', text, options, assumption} via TaskService and a notification
//   (category 'blocker') with a GENERIC German body – notification bodies never contain task content (SPEC §6.0.4).
// - Returns {status:'needs_input', noteId}: the runner pauses the run (task blocked NEEDS_INPUT) until the user
//   answers via tasks.addNote; the answer reaches the agent as a user note on resume.
// - `assumption` is required: the agent must say what it would do without an answer, so the user can simply agree.
import { z } from 'zod';
import type { AgentTool, Services } from '../../contracts';
import { errorMessage } from '../../core/errors';
import { abortedResult, oneLine, toolError } from './common';

const AskUserSchema = z.object({
  question: z.string().min(1).max(4000).describe('The question in German, short and concrete. Only for decisions the user must make.'),
  options: z.array(z.string().min(1).max(300)).max(10).optional().describe('Optional answer options in German (the recommended one first).'),
  assumption: z.string().min(1).max(2000).describe('In German: what you would assume/do if the user does not answer.'),
});
export type AskUserParams = z.output<typeof AskUserSchema>;

export function createAskUserTool(s: Services): AgentTool<AskUserParams> {
  return {
    name: 'ask_user',
    description:
      'Ask the user a decisive question that only the user can answer (e.g. which platform or engine). The task pauses until the user answers. For minor details choose a sensible default instead and record it with memory_note.',
    schema: AskUserSchema,
    readOnly: false,
    describe: (p) => `Fragt den Benutzer: ${oneLine(p.question, 120)}`,
    async execute(p, ctx) {
      const aborted = abortedResult(ctx);
      if (aborted) return aborted;
      try {
        const note = s.tasks.addNote({
          taskId: ctx.task.id,
          author: 'agent',
          kind: 'question',
          text: p.question.trim(),
          options: (p.options ?? []).map((o) => o.trim()).filter(Boolean),
          assumption: p.assumption.trim(),
        });
        try {
          s.notifications.notify({
            level: 'warning',
            category: 'blocker',
            title: 'Rückfrage zu einer Aufgabe',
            body: 'Ein Agent braucht eine Entscheidung, um weiterzuarbeiten. Bitte die Frage in der Aufgabe beantworten.',
            projectId: ctx.project.id,
            taskId: ctx.task.id,
          });
        } catch (e) {
          ctx.log.warn('Benachrichtigung zur Rückfrage fehlgeschlagen', { error: errorMessage(e) });
        }
        return {
          status: 'needs_input',
          noteId: note.id,
          content: `Die Frage wurde an den Benutzer gesendet. Ohne Antwort würde gelten: ${oneLine(p.assumption, 500)}`,
        };
      } catch (e) {
        return toolError(e);
      }
    },
  };
}
