/** @vitest-environment jsdom */
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { setupRendererTest } from '../lib/test-utils';
import { emitMockEvent, getMockDb, setMockConnection } from '../lib/mock-bridge';
import { initDaemonStore, isMethodSupported, useDaemonStore } from './daemon';
import { dispatchNovaEvent, subscribeNovaEvent } from './events';
import { toast, useToastStore } from './toasts';
import { useUiStore } from './ui';

setupRendererTest();

describe('daemon store', () => {
  it('loads connection, status, work state and counters', async () => {
    const off = initDaemonStore();
    await waitFor(() => expect(useDaemonStore.getState().status?.version).toBe('0.1.0'));
    const s = useDaemonStore.getState();
    expect(s.connection?.state).toBe('connected');
    expect(s.work?.state).toBe('running');
    expect(s.pendingApprovals).toBe(2);
    expect(s.unreadNotifications).toBe(4);
    expect(s.appVersion).toBe('0.1.0');
    off();
  });

  it('announces unread notifications after connecting', async () => {
    const off = initDaemonStore();
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === '4 neue Meldungen')).toBe(true));
    useToastStore.getState().toasts.find((t) => t.title === '4 neue Meldungen')?.action?.onClick();
    expect(useUiStore.getState().notificationsOpen).toBe(true);
    off();
  });

  it('follows work.status / daemon.status events and reconnects', async () => {
    const off = initDaemonStore();
    await waitFor(() => expect(useDaemonStore.getState().work).not.toBeNull());
    const work = { ...useDaemonStore.getState().work!, state: 'paused' as const };
    emitMockEvent({ type: 'work.status', payload: work });
    expect(useDaemonStore.getState().work?.state).toBe('paused');
    setMockConnection({ state: 'reconnecting', message: 'weg' });
    expect(useDaemonStore.getState().connection?.state).toBe('reconnecting');
    setMockConnection({ state: 'connected', message: 'da' });
    // Reconnect re-reads the real work state from the daemon.
    await waitFor(() => expect(useDaemonStore.getState().work?.state).toBe('running'));
    off();
  });

  it('isMethodSupported uses DaemonStatus.methods', async () => {
    getMockDb().daemon.methods = ['daemon.status', 'work.status'];
    const off = initDaemonStore();
    await waitFor(() => expect(useDaemonStore.getState().status).not.toBeNull());
    expect(isMethodSupported('work.status')).toBe(true);
    expect(isMethodSupported('notifications.list')).toBe(false);
    off();
  });
});

describe('event bus', () => {
  it('fans out one subscription to many listeners and isolates failures', () => {
    const a = vi.fn();
    const b = vi.fn(() => {
      throw new Error('boom');
    });
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const offA = subscribeNovaEvent('error.resolved', a);
    const offB = subscribeNovaEvent('error.resolved', b);
    dispatchNovaEvent({ type: 'error.resolved', payload: { id: 'x' }, ts: 1, seq: 1 });
    expect(a).toHaveBeenCalledWith({ id: 'x' }, expect.objectContaining({ type: 'error.resolved' }));
    expect(errSpy).toHaveBeenCalled();
    offA();
    offB();
  });
});

describe('toasts', () => {
  it('collapses duplicates and keeps at most five', () => {
    toast.info('Hallo');
    toast.info('Hallo');
    expect(useToastStore.getState().toasts).toHaveLength(1);
    for (let i = 0; i < 7; i++) toast.success(`T${i}`);
    expect(useToastStore.getState().toasts).toHaveLength(5);
  });

  it('auto-hides after the default duration', () => {
    vi.useFakeTimers();
    try {
      toast.success('Gespeichert');
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(5_001);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
