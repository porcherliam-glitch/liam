// Orchestrator – RPC methods owned by this module (SPEC §2): tasks.*, work.*, errors.list/resolve, dashboard.summary.
// Key decisions:
// - Handlers are thin: params are already zod-parsed by the router; all rules live in TaskService/WorkCycle.
// - Status-changing task actions (start/pause/resume/stop/retry/addNote/createFix/plan) go through the WorkCycle, the
//   only writer of task status; CRUD goes through the TaskService.
// - errors.resolve answers NOT_FOUND for unknown ids (the ErrorService itself ignores them silently).
import type { RpcRegistrar } from '../contracts';
import { notFound } from '../core/errors';
import { buildDashboardSummary } from './dashboard';

export const registerTasksRpc: RpcRegistrar = (router, s) => {
  router.register('tasks.list', (p) => s.tasks.list({ projectId: p.projectId, status: p.status, limit: p.limit }));
  router.register('tasks.get', (p) => s.tasks.require(p.id));
  router.register('tasks.create', (p) => s.tasks.create(p, 'user'));
  router.register('tasks.update', (p) => s.tasks.update(p));
  router.register('tasks.setPriority', (p) => s.tasks.setPriority(p.id, p.priority));
  router.register('tasks.start', (p) => s.work.startTask(p.id));
  router.register('tasks.pause', (p) => s.work.pauseTask(p.id));
  router.register('tasks.resume', (p) => s.work.resumeTask(p.id));
  router.register('tasks.stop', (p) => s.work.stopTask(p.id));
  router.register('tasks.retry', (p) => s.work.retryTask(p.id));
  router.register('tasks.delete', (p) => {
    s.tasks.delete(p.id);
    return { ok: true as const };
  });
  router.register('tasks.notes', (p) => s.tasks.notes(p.taskId));
  router.register('tasks.addNote', (p) => s.work.addNote(p.taskId, p.text));
  router.register('tasks.createFix', (p) => s.work.createFix({ projectId: p.projectId, checkRunId: p.checkRunId, errorId: p.errorId, note: p.note }));
  router.register('tasks.plan', (p) => s.work.planGoal(p.projectId, p.goal));

  router.register('work.status', () => s.work.status());
  router.register('work.start', (p) => s.work.start(p.projectId));
  router.register('work.pause', (p) => s.work.pause(p.projectId));
  router.register('work.resume', (p) => s.work.resume(p.projectId));
  router.register('work.stop', (p) => s.work.stop(p.projectId));

  router.register('errors.list', (p) => s.core.errors.list({ projectId: p.projectId, includeResolved: p.includeResolved, limit: p.limit }));
  router.register('errors.resolve', (p) => {
    if (!s.core.errors.get(p.id)) throw notFound('Fehler', p.id);
    s.core.errors.resolve(p.id);
    return { ok: true as const };
  });

  router.register('dashboard.summary', () => buildDashboardSummary(s));
};
