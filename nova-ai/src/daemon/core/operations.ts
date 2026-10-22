// Long-running operations with progress and cancel (MASTERPROMPT §19). Any service wraps its long work in run();
// the UI lists active operations ("Laufende Vorgänge") and can cancel them.
import type { Operation, OperationKind } from '@shared/schemas';
import type { EventBus } from './bus';
import { newId } from './ids';
import { NovaError, errorMessage, isAbortError } from './errors';

export interface OperationContext {
  signal: AbortSignal;
  /** progress 0..100 or null for indeterminate; message is German. */
  progress(progress: number | null, message?: string): void;
}

export class OperationService {
  private ops = new Map<string, { op: Operation; controller: AbortController }>();

  constructor(private bus: EventBus | null) {}

  /** Runs fn as an operation. The returned promise resolves/rejects like fn (CANCELLED when cancelled). */
  run<T>(
    input: { kind: OperationKind; title: string; projectId?: string | null; cancellable?: boolean },
    fn: (ctx: OperationContext) => Promise<T>,
  ): { operation: Operation; result: Promise<T> } {
    const controller = new AbortController();
    const op: Operation = {
      id: newId('req'),
      kind: input.kind,
      projectId: input.projectId ?? null,
      title: input.title,
      status: 'running',
      progress: null,
      message: null,
      cancellable: input.cancellable ?? true,
      error: null,
      startedAt: Date.now(),
      endedAt: null,
    };
    this.ops.set(op.id, { op, controller });
    this.emit(op);
    const ctx: OperationContext = {
      signal: controller.signal,
      progress: (progress, message) => {
        op.progress = progress === null ? null : Math.max(0, Math.min(100, Math.round(progress)));
        if (message !== undefined) op.message = message;
        this.emit(op);
      },
    };
    const result = (async () => {
      try {
        const value = await fn(ctx);
        if (controller.signal.aborted) throw new NovaError('CANCELLED', 'Der Vorgang wurde abgebrochen.', { severity: 'warning' });
        op.status = 'done';
        op.progress = 100;
        return value;
      } catch (e) {
        op.status = controller.signal.aborted || isAbortError(e) ? 'cancelled' : 'failed';
        op.error = op.status === 'cancelled' ? null : errorMessage(e);
        if (op.status === 'cancelled' && !(e instanceof NovaError && e.code === 'CANCELLED')) {
          throw new NovaError('CANCELLED', 'Der Vorgang wurde abgebrochen.', { severity: 'warning', cause: e });
        }
        throw e;
      } finally {
        op.endedAt = Date.now();
        this.emit(op);
        this.cleanup();
      }
    })();
    return { operation: { ...op }, result };
  }

  list(activeOnly = true): Operation[] {
    return [...this.ops.values()].map((v) => ({ ...v.op })).filter((o) => !activeOnly || o.status === 'running').sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id: string): Operation | null {
    const v = this.ops.get(id);
    return v ? { ...v.op } : null;
  }

  cancel(id: string): Operation | null {
    const v = this.ops.get(id);
    if (!v) return null;
    if (v.op.status === 'running' && v.op.cancellable) {
      v.op.message = 'Wird abgebrochen …';
      v.controller.abort(new NovaError('CANCELLED', 'Der Vorgang wurde abgebrochen.', { severity: 'warning' }));
      this.emit(v.op);
    }
    return { ...v.op };
  }

  /** Abort everything (daemon shutdown). */
  cancelAll(): void {
    for (const v of this.ops.values()) if (v.op.status === 'running') v.controller.abort(new NovaError('INTERRUPTED', 'Der Hintergrunddienst wird beendet.'));
  }

  private emit(op: Operation): void {
    this.bus?.emit('operation.updated', { ...op });
  }

  private cleanup(): void {
    const cutoff = Date.now() - 60 * 60 * 1000;
    for (const [id, v] of this.ops) if (v.op.endedAt && v.op.endedAt < cutoff) this.ops.delete(id);
  }
}
