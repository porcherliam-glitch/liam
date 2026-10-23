// Data hooks on top of `api()`:
//   useRpc(method, params, options)  -> load data, re-fetch on events (debounced 250 ms)
//   useMutation(method, options)     -> run an action, toast on error
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RpcMethod, RpcParams, RpcResult } from '@shared/rpc';
import type { AnyNovaEvent, NovaEventType } from '@shared/events';
import { api, NovaRpcError, type RpcArgs } from '../lib/api';
import { subscribeNovaEvent, subscribeResync } from '../stores/events';
import { isDaemonReachable, useDaemonStore } from '../stores/daemon';
import { toast } from '../stores/toasts';

export interface UseRpcOptions {
  /** Event types that trigger a (debounced) re-fetch. */
  refetchOn?: readonly NovaEventType[];
  /** Only re-fetch for events that pass this filter (e.g. same projectId). */
  eventFilter?: (event: AnyNovaEvent) => boolean;
  /** false = do not load (default true). Passing `params = null` has the same effect. */
  enabled?: boolean;
  /** Poll interval in ms (paused while the window is hidden). */
  intervalMs?: number;
  /** Keep showing the previous data while params change (default false = reset to undefined). */
  keepPreviousData?: boolean;
  /** Debounce for event-triggered re-fetches (default 250 ms). */
  debounceMs?: number;
}

export interface UseRpcResult<M extends RpcMethod> {
  /** Result of the last successful call for the current params (undefined until loaded). */
  data: RpcResult<M> | undefined;
  /** Error of the last call (data of an earlier success is kept). */
  error: NovaRpcError | null;
  /** True while the first result for the current params is loading. */
  loading: boolean;
  /** True while any request (including background re-fetches) is in flight. */
  refreshing: boolean;
  /** Re-fetch now. Never throws. */
  refetch: () => Promise<void>;
  /** Locally replace/patch the data (optimistic updates, applying event payloads). */
  setData: (next: RpcResult<M> | undefined | ((prev: RpcResult<M> | undefined) => RpcResult<M> | undefined)) => void;
}

interface RpcState<M extends RpcMethod> {
  key: string;
  data: RpcResult<M> | undefined;
  error: NovaRpcError | null;
  fetching: number;
}

function toRpcError(e: unknown): NovaRpcError {
  if (e instanceof NovaRpcError) return e;
  return new NovaRpcError('INTERNAL', e instanceof Error ? e.message : 'Unbekannter Fehler.');
}

/**
 * Loads data from the daemon and keeps it fresh.
 * - `params` are compared by JSON, so inline objects are fine.
 * - `params = null` disables the query (e.g. while an id is unknown).
 * @example
 * const { data: tasks, loading, error, refetch } = useRpc('tasks.list', { projectId }, {
 *   refetchOn: ['task.updated', 'task.removed'],
 *   eventFilter: (e) => 'projectId' in e.payload && e.payload.projectId === projectId,
 * });
 */
export function useRpc<M extends RpcMethod>(method: M, params?: RpcParams<M> | null, options: UseRpcOptions = {}): UseRpcResult<M> {
  const enabled = options.enabled !== false && params !== null;
  const key = `${method}|${JSON.stringify(params ?? null)}`;
  const [state, setState] = useState<RpcState<M>>({ key, data: undefined, error: null, fetching: 0 });

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const keyRef = useRef(key);
  keyRef.current = key;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const optsRef = useRef(options);
  optsRef.current = options;
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const refetch = useCallback(async () => {
    if (!enabledRef.current) return;
    const reqId = ++reqIdRef.current;
    const reqKey = keyRef.current;
    setState((s) => ({ ...s, fetching: s.fetching + 1 }));
    try {
      const result = await (api as (m: M, p?: RpcParams<M>) => Promise<RpcResult<M>>)(method, (paramsRef.current ?? undefined) as RpcParams<M>);
      if (!mountedRef.current) return;
      setState((s) => {
        const fetching = Math.max(0, s.fetching - 1);
        // Ignore stale answers (params changed or a newer request finished first).
        if (reqId !== reqIdRef.current || reqKey !== keyRef.current) return { ...s, fetching };
        return { key: reqKey, data: result, error: null, fetching };
      });
    } catch (e) {
      if (!mountedRef.current) return;
      setState((s) => {
        const fetching = Math.max(0, s.fetching - 1);
        if (reqId !== reqIdRef.current || reqKey !== keyRef.current) return { ...s, fetching };
        return { key: reqKey, data: s.key === reqKey ? s.data : undefined, error: toRpcError(e), fetching };
      });
    }
  }, [method]);

  const scheduleRefetch = useCallback(() => {
    if (!enabledRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void refetch();
    }, optsRef.current.debounceMs ?? 250);
  }, [refetch]);

  // Initial load and reload on param change.
  useEffect(() => {
    if (!enabled) return;
    void refetch();
  }, [key, enabled, refetch]);

  // Event-driven re-fetch.
  const refetchOnKey = (options.refetchOn ?? []).join('|');
  useEffect(() => {
    if (!enabled || !refetchOnKey) return;
    const offs = (refetchOnKey.split('|') as NovaEventType[]).map((type) =>
      subscribeNovaEvent(type, ((_payload: unknown, event: AnyNovaEvent) => {
        const filter = optsRef.current.eventFilter;
        if (filter && !filter(event)) return;
        scheduleRefetch();
      }) as never),
    );
    return () => {
      for (const off of offs) off();
    };
  }, [refetchOnKey, enabled, scheduleRefetch]);

  // Re-fetch after missed events and after the daemon reconnects.
  useEffect(() => {
    if (!enabled) return;
    const offResync = subscribeResync(scheduleRefetch);
    const offStore = useDaemonStore.subscribe((s, prev) => {
      if (s.connection?.state === 'connected' && prev.connection && prev.connection.state !== 'connected') scheduleRefetch();
    });
    return () => {
      offResync();
      offStore();
    };
  }, [enabled, scheduleRefetch]);

  // Polling.
  const intervalMs = options.intervalMs;
  useEffect(() => {
    if (!enabled || !intervalMs || intervalMs <= 0) return;
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refetch();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refetch]);

  const setData = useCallback<UseRpcResult<M>['setData']>((next) => {
    setState((s) => {
      const prev = s.key === keyRef.current ? s.data : undefined;
      const value = typeof next === 'function' ? (next as (p: RpcResult<M> | undefined) => RpcResult<M> | undefined)(prev) : next;
      return { ...s, key: keyRef.current, data: value };
    });
  }, []);

  const current = state.key === key;
  const data = current || options.keepPreviousData ? state.data : undefined;
  const error = current ? state.error : null;
  return {
    data,
    error,
    loading: enabled && data === undefined && error === null,
    refreshing: state.fetching > 0,
    refetch,
    setData,
  };
}

export interface UseMutationOptions<M extends RpcMethod> {
  /** Success toast title (string or built from the result). Omit for no success toast. */
  successToast?: string | ((result: RpcResult<M>, params: RpcParams<M> | undefined) => string);
  /** Title of the error toast (default "Das hat nicht geklappt"); false = no toast (handle `error` inline). */
  errorToast?: string | false;
  onSuccess?: (result: RpcResult<M>, params: RpcParams<M> | undefined) => void;
  onError?: (error: NovaRpcError, params: RpcParams<M> | undefined) => void;
}

export interface UseMutationResult<M extends RpcMethod> {
  /** Runs the call. Resolves with the result, or `undefined` on error (never throws; toast shown). */
  run: (...args: RpcArgs<M>) => Promise<RpcResult<M> | undefined>;
  /** Like `run` but rejects with NovaRpcError (no error toast unless errorToast is set explicitly). */
  runAsync: (...args: RpcArgs<M>) => Promise<RpcResult<M>>;
  /** True while at least one call is in flight. */
  loading: boolean;
  error: NovaRpcError | null;
  reset: () => void;
}

const OFFLINE_ERROR = () =>
  new NovaRpcError('DAEMON_UNAVAILABLE', 'Der Hintergrunddienst ist gerade nicht verbunden. Die Aktion wurde nicht ausgeführt.');

/**
 * Runs an RPC action with loading/error state. Shows an error toast by default.
 * @example
 * const pause = useMutation('tasks.pause', { successToast: 'Aufgabe wird pausiert' });
 * <Button loading={pause.loading} onClick={() => pause.run({ id: task.id })}>Pausieren</Button>
 */
export function useMutation<M extends RpcMethod>(method: M, options: UseMutationOptions<M> = {}): UseMutationResult<M> {
  const [inFlight, setInFlight] = useState(0);
  const [error, setError] = useState<NovaRpcError | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (params: RpcParams<M> | undefined, toastOnError: boolean): Promise<RpcResult<M>> => {
      const opts = optsRef.current;
      if (!isDaemonReachable()) {
        const err = OFFLINE_ERROR();
        if (mountedRef.current) setError(err);
        if (toastOnError) toast.error(typeof opts.errorToast === 'string' ? opts.errorToast : 'Keine Verbindung', err.message);
        opts.onError?.(err, params);
        throw err;
      }
      if (mountedRef.current) {
        setInFlight((n) => n + 1);
        setError(null);
      }
      try {
        const result = await (api as (m: M, p?: RpcParams<M>) => Promise<RpcResult<M>>)(method, params);
        if (opts.successToast) {
          toast.success(typeof opts.successToast === 'function' ? opts.successToast(result, params) : opts.successToast);
        }
        opts.onSuccess?.(result, params);
        return result;
      } catch (e) {
        const err = toRpcError(e);
        if (mountedRef.current) setError(err);
        if (toastOnError) toast.error(typeof opts.errorToast === 'string' ? opts.errorToast : 'Das hat nicht geklappt', err.message);
        opts.onError?.(err, params);
        throw err;
      } finally {
        if (mountedRef.current) setInFlight((n) => Math.max(0, n - 1));
      }
    },
    [method],
  );

  const run = useCallback(
    async (...args: RpcArgs<M>) => {
      try {
        return await execute(args[0] as RpcParams<M> | undefined, optsRef.current.errorToast !== false);
      } catch {
        return undefined;
      }
    },
    [execute],
  );

  const runAsync = useCallback(
    (...args: RpcArgs<M>) => execute(args[0] as RpcParams<M> | undefined, typeof optsRef.current.errorToast === 'string'),
    [execute],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, runAsync, loading: inFlight > 0, error, reset };
}
