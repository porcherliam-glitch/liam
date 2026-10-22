// Orchestrator – persistent state of the work cycle (table `meta`).
// Key decisions:
// - `work_state`: global state running | paused | stopped (default running, SPEC §6.5).
// - `work_paused_by`: which tasks a work.pause paused, per scope ('global' or a project id), so work.resume resumes
//   exactly those tasks – also after a daemon restart.
// - `work_continuations`: how a task continues when it is (re)started. A queued task is resumed iff it has a
//   continuation; otherwise it starts a fresh run. Phases: 'agent' (resume the agent run), 'verify' (the coder/tester
//   run is done, run the verification again) and 'review' (checks are stored in task.verification, run/resume the
//   reviewer pass). Written when a run pauses/waits/blocks (resumable)/is interrupted and when verification starts;
//   cleared on fresh restarts and when a task finishes. Survives restarts, so a decided approval or an interrupted
//   verification is never lost.
// All values are small JSON documents; every change is a synchronous read-modify-write (single-threaded daemon).
import type { AgentRole, WorkCycleState } from '@shared/schemas';
import type { Db } from '../db/database';
import { readMeta, writeMeta } from './task-store';

export type ContinuationPhase = 'agent' | 'verify' | 'review';

export interface Continuation {
  phase: ContinuationPhase;
  /** Run to resume (agent/review) or the finished run whose result is verified (verify). null = start a fresh run of `role`. */
  runId: string | null;
  role: AgentRole;
  /** Approval the run waits for (waiting_approval); used to re-queue the task when it is decided or expired. */
  approvalId?: string | null;
}

const KEY_STATE = 'work_state';
const KEY_PAUSED = 'work_paused_by';
const KEY_CONT = 'work_continuations';

const STATES: WorkCycleState[] = ['running', 'paused', 'stopped'];

export class WorkStateStore {
  constructor(private db: Db) {}

  globalState(): WorkCycleState {
    const v = readMeta<string>(this.db, KEY_STATE, 'running');
    return (STATES as string[]).includes(v) ? (v as WorkCycleState) : 'running';
  }

  setGlobalState(state: WorkCycleState): void {
    writeMeta(this.db, KEY_STATE, state);
  }

  private continuations(): Record<string, Continuation> {
    const v = readMeta<Record<string, Continuation>>(this.db, KEY_CONT, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  continuation(taskId: string): Continuation | null {
    const c = this.continuations()[taskId];
    if (!c || typeof c !== 'object') return null;
    if (c.phase !== 'agent' && c.phase !== 'verify' && c.phase !== 'review') return null;
    return {
      phase: c.phase,
      runId: typeof c.runId === 'string' && c.runId ? c.runId : null,
      role: c.role,
      approvalId: typeof c.approvalId === 'string' && c.approvalId ? c.approvalId : null,
    };
  }

  setContinuation(taskId: string, c: Continuation): void {
    const all = this.continuations();
    all[taskId] = { phase: c.phase, runId: c.runId, role: c.role, approvalId: c.approvalId ?? null };
    writeMeta(this.db, KEY_CONT, all);
  }

  clearContinuation(taskId: string): void {
    const all = this.continuations();
    if (!(taskId in all)) return;
    delete all[taskId];
    writeMeta(this.db, KEY_CONT, all);
  }

  private pausedMap(): Record<string, string[]> {
    const v = readMeta<Record<string, string[]>>(this.db, KEY_PAUSED, {});
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  }

  rememberPaused(scope: string, taskId: string): void {
    const all = this.pausedMap();
    const list = Array.isArray(all[scope]) ? all[scope] : [];
    if (!list.includes(taskId)) list.push(taskId);
    all[scope] = list;
    writeMeta(this.db, KEY_PAUSED, all);
  }

  pausedBy(scope: string): string[] {
    const list = this.pausedMap()[scope];
    return Array.isArray(list) ? [...list] : [];
  }

  /** Returns the remembered tasks of a scope and forgets them. */
  takePaused(scope: string): string[] {
    const all = this.pausedMap();
    const list = Array.isArray(all[scope]) ? all[scope] : [];
    if (scope in all) {
      delete all[scope];
      writeMeta(this.db, KEY_PAUSED, all);
    }
    return list;
  }

  /** Removes a task from every pause memory (user resumed/stopped/retried it). */
  forgetPaused(taskId: string): void {
    const all = this.pausedMap();
    let changed = false;
    for (const scope of Object.keys(all)) {
      const list = Array.isArray(all[scope]) ? all[scope] : [];
      if (list.includes(taskId)) {
        all[scope] = list.filter((id) => id !== taskId);
        if (!all[scope].length) delete all[scope];
        changed = true;
      }
    }
    if (changed) writeMeta(this.db, KEY_PAUSED, all);
  }

  forgetTask(taskId: string): void {
    this.clearContinuation(taskId);
    this.forgetPaused(taskId);
  }

  /** Task ids referenced anywhere (cleanup after project removal). */
  referencedTaskIds(): string[] {
    const ids = new Set<string>(Object.keys(this.continuations()));
    for (const list of Object.values(this.pausedMap())) if (Array.isArray(list)) list.forEach((id) => ids.add(id));
    return [...ids];
  }
}
