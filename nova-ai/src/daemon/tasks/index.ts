// Orchestrator module barrel (SPEC §2): TaskService, WorkCycle and the RPC registrar.
// Wiring (app.ts): s.tasks = createTaskService(s); s.work = createWorkCycle(s); registerTasksRpc(router, s);
// startup: await s.work.recover() before s.work.startLoop(); shutdown: await s.work.shutdown(10_000).
export { createTaskService, parseInput } from './task-service';
export { createWorkCycle, type WorkCycleOptions } from './work-cycle';
export { registerTasksRpc } from './rpc';
export { buildDashboardSummary } from './dashboard';
