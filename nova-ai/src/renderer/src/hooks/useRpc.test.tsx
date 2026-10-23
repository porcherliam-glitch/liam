/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setupRendererTest } from '../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError, setMockConnection } from '../lib/mock-bridge';
import { api, NovaRpcError } from '../lib/api';
import { useMutation, useRpc } from './useRpc';
import { useNovaEvent } from './useEvents';
import { useToastStore } from '../stores/toasts';
import { initDaemonStore, useDaemonStore } from '../stores/daemon';
import { dispatchNovaEvent, subscribeResync } from '../stores/events';

setupRendererTest();

describe('api()', () => {
  it('returns typed results and throws NovaRpcError on ok:false', async () => {
    const project = await api('projects.get', { id: 'prj_pixel' });
    expect(project.name).toBe('Pixel-Abenteuer');
    await expect(api('projects.get', { id: 'nope' })).rejects.toMatchObject({ name: 'NovaRpcError', code: 'NOT_FOUND' });
  });
});

describe('useRpc', () => {
  it('loads data and exposes loading state', async () => {
    const { result } = renderHook(() => useRpc('projects.list'));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.loading).toBe(false);
    expect(result.current.data?.map((p) => p.name)).toContain('Rezept-API');
  });

  it('does nothing for params = null', async () => {
    const { result } = renderHook(() => useRpc('tasks.get', null));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.loading).toBe(false);
    expect(getMockCalls('tasks.get')).toHaveLength(0);
  });

  it('re-fetches (debounced) when a matching event arrives', async () => {
    const { result } = renderHook(() => useRpc('tasks.get', { id: 'task_px6' }, { refetchOn: ['task.updated'], debounceMs: 10 }));
    await waitFor(() => expect(result.current.data?.priority).toBe(0));
    getMockDb().tasks.find((t) => t.id === 'task_px6')!.priority = 3;
    act(() => {
      emitMockEvent({ type: 'task.updated', payload: getMockDb().tasks.find((t) => t.id === 'task_px6')! });
      emitMockEvent({ type: 'task.updated', payload: getMockDb().tasks.find((t) => t.id === 'task_px6')! });
    });
    await waitFor(() => expect(result.current.data?.priority).toBe(3));
    // Two events, one debounced re-fetch.
    expect(getMockCalls('tasks.get')).toHaveLength(2);
  });

  it('applies eventFilter', async () => {
    const { result } = renderHook(() =>
      useRpc('tasks.list', { projectId: 'prj_rezept' }, { refetchOn: ['task.updated'], debounceMs: 5, eventFilter: (e) => e.type === 'task.updated' && e.payload.projectId === 'prj_rezept' }),
    );
    await waitFor(() => expect(result.current.data).toBeDefined());
    act(() => emitMockEvent({ type: 'task.updated', payload: getMockDb().tasks.find((t) => t.id === 'task_px3')! }));
    await new Promise((r) => setTimeout(r, 30));
    expect(getMockCalls('tasks.list')).toHaveLength(1);
  });

  it('keeps the error and allows refetch', async () => {
    mockHandlers.set('budget.status', () => {
      throw new MockRpcError('INTERNAL', 'Kaputt');
    });
    const { result } = renderHook(() => useRpc('budget.status'));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(NovaRpcError));
    expect(result.current.error?.message).toBe('Kaputt');
    mockHandlers.delete('budget.status');
    await act(() => result.current.refetch());
    expect(result.current.error).toBeNull();
    expect(result.current.data?.monthlyLimitUsd).toBe(20);
  });

  it('re-fetches after a sequence gap (resync)', async () => {
    let resyncs = 0;
    const off = subscribeResync(() => resyncs++);
    dispatchNovaEvent({ type: 'error.resolved', payload: { id: 'a' }, ts: 1, seq: 10 });
    dispatchNovaEvent({ type: 'error.resolved', payload: { id: 'b' }, ts: 2, seq: 13 });
    off();
    expect(resyncs).toBe(1);
  });
});

describe('useMutation', () => {
  it('runs the call and shows a success toast', async () => {
    const { result } = renderHook(() => useMutation('tasks.pause', { successToast: 'Pausiert' }));
    let out: unknown;
    await act(async () => {
      out = await result.current.run({ id: 'task_px3' });
    });
    expect((out as { status: string }).status).toBe('paused');
    expect(getMockCalls('tasks.pause')[0].params).toEqual({ id: 'task_px3' });
    expect(useToastStore.getState().toasts.map((t) => t.title)).toContain('Pausiert');
  });

  it('shows an error toast and resolves undefined on failure', async () => {
    const { result } = renderHook(() => useMutation('tasks.resume'));
    let out: unknown = 'x';
    await act(async () => {
      out = await result.current.run({ id: 'task_px3' }); // running, not paused -> CONFLICT
    });
    expect(out).toBeUndefined();
    expect(result.current.error?.code).toBe('CONFLICT');
    const toast = useToastStore.getState().toasts.at(-1);
    expect(toast?.tone).toBe('error');
    expect(toast?.message).toContain('pausierte');
  });

  it('refuses to run while the daemon is disconnected', async () => {
    const off = initDaemonStore();
    await waitFor(() => expect(useDaemonStore.getState().connection?.state).toBe('connected'));
    act(() => setMockConnection({ state: 'reconnecting', message: 'weg' }));
    const { result } = renderHook(() => useMutation('tasks.pause'));
    await act(async () => {
      await result.current.run({ id: 'task_px3' });
    });
    expect(result.current.error?.code).toBe('DAEMON_UNAVAILABLE');
    expect(getMockCalls('tasks.pause')).toHaveLength(0);
    off();
  });
});

describe('useNovaEvent', () => {
  it('delivers payloads of the subscribed types', () => {
    const seen: string[] = [];
    renderHook(() => useNovaEvent(['error.resolved', 'project.removed'], (p) => seen.push(p.id)));
    act(() => {
      emitMockEvent({ type: 'error.resolved', payload: { id: 'e1' } });
      emitMockEvent({ type: 'project.removed', payload: { id: 'p1' } });
      emitMockEvent({ type: 'task.removed', payload: { id: 't1', projectId: 'p' } });
    });
    expect(seen).toEqual(['e1', 'p1']);
  });
});
