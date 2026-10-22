/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockCalls, installMockBridge, mockHandlers, MockRpcError, resetMockData, uninstallMockBridge } from '../../lib/mock-bridge';
import { acquireTerminalSession, releaseTerminalSession, RELEASE_DELAY_MS, resetTerminalSessions, restartTerminalSession } from './terminal-session';

describe('terminal sessions', () => {
  beforeEach(() => {
    installMockBridge();
    resetMockData();
    resetTerminalSessions();
  });
  afterEach(() => {
    vi.useRealTimers();
    resetTerminalSessions();
    uninstallMockBridge();
  });

  it('creates one session per project and reuses it', async () => {
    const a = await acquireTerminalSession('prj_pixel');
    const b = await acquireTerminalSession('prj_pixel');
    expect(a.id).toBe(b.id);
    expect(getMockCalls('terminal.create')).toHaveLength(1);
    expect(getMockCalls('terminal.create')[0].params).toEqual({ projectId: 'prj_pixel' });
  });

  it('keeps the session across a quick release/acquire (StrictMode) and closes it after the last release', async () => {
    vi.useFakeTimers();
    const first = await acquireTerminalSession('prj_pixel');
    releaseTerminalSession('prj_pixel');
    const second = await acquireTerminalSession('prj_pixel');
    expect(second.id).toBe(first.id);
    releaseTerminalSession('prj_pixel');
    await vi.advanceTimersByTimeAsync(RELEASE_DELAY_MS + 10);
    expect(getMockCalls('terminal.close').map((c) => c.params)).toEqual([{ sessionId: first.id }]);
    const third = await acquireTerminalSession('prj_pixel');
    expect(third.id).not.toBe(first.id);
  });

  it('restarts with a fresh session and closes the old one', async () => {
    const first = await acquireTerminalSession('prj_pixel');
    const fresh = await restartTerminalSession('prj_pixel');
    expect(fresh.id).not.toBe(first.id);
    await vi.waitFor(() => expect(getMockCalls('terminal.close').map((c) => c.params)).toEqual([{ sessionId: first.id }]));
    expect((await acquireTerminalSession('prj_pixel')).id).toBe(fresh.id);
  });

  it('does not reuse a failed creation', async () => {
    mockHandlers.set('terminal.create', () => {
      throw new MockRpcError('TOOL_MISSING', 'Keine Shell gefunden.');
    });
    await expect(acquireTerminalSession('prj_pixel')).rejects.toThrow('Keine Shell gefunden.');
    mockHandlers.delete('terminal.create');
    await expect(acquireTerminalSession('prj_pixel')).resolves.toMatchObject({ projectId: 'prj_pixel' });
  });
});
