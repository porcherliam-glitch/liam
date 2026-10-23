/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PreviewStatus } from '@shared/schemas';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockBridge, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { useToastStore } from '../../../stores/toasts';
import { PREVIEW_SANDBOX, PreviewPanel } from './PreviewPanel';

setupRendererTest();

function renderPreview(projectId: string, projectKind: 'web' | 'unity' | 'desktop' | 'backend' = 'web') {
  return renderWithRouter(<PreviewPanel projectId={projectId} projectKind={projectKind} integrations={getMockDb().integrations} />);
}

const status = (patch: Partial<PreviewStatus>): PreviewStatus => ({
  projectId: 'prj_pixel',
  kind: 'browser-dev-server',
  state: 'running',
  url: 'http://127.0.0.1:5174/',
  processId: 'proc_px_dev',
  message: 'Die Vorschau läuft.',
  reloadToken: 3,
  ...patch,
});

describe('PreviewPanel', () => {
  it('embeds a running loopback preview in a sandboxed frame and reloads on a new reloadToken', async () => {
    renderPreview('prj_pixel');
    const frame = (await screen.findByTitle('Live-Vorschau des Projekts')) as HTMLIFrameElement;
    expect(frame.getAttribute('src')).toBe('http://127.0.0.1:5174/');
    expect(frame.getAttribute('sandbox')).toBe(PREVIEW_SANDBOX);
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');

    act(() => emitMockEvent({ type: 'preview.updated', payload: status({ reloadToken: 4 }) }));
    await waitFor(() => expect(screen.getByTitle('Live-Vorschau des Projekts')).not.toBe(frame));

    const again = screen.getByTitle('Live-Vorschau des Projekts');
    await userEvent.click(screen.getByRole('button', { name: 'Vorschau neu laden' }));
    expect(screen.getByTitle('Live-Vorschau des Projekts')).not.toBe(again);
  });

  it('opens the preview in the browser via the bridge', async () => {
    const spy = vi.spyOn(mockBridge.app, 'openExternal').mockResolvedValue(true);
    renderPreview('prj_pixel');
    await userEvent.click(await screen.findByRole('button', { name: 'Im Browser öffnen' }));
    expect(spy).toHaveBeenCalledWith('http://127.0.0.1:5174/');
  });

  it('stops and starts the preview', async () => {
    renderPreview('prj_pixel');
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschau stoppen' }));
    await waitFor(() => expect(getMockCalls('preview.stop')[0]?.params).toEqual({ projectId: 'prj_pixel' }));
    expect(await screen.findByText('Die Vorschau ist gestoppt')).toBeTruthy();
    expect(screen.queryByTitle('Live-Vorschau des Projekts')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Vorschau starten' }));
    await waitFor(() => expect(getMockCalls('preview.start')[0]?.params).toEqual({ projectId: 'prj_pixel' }));
    expect(await screen.findByTitle('Live-Vorschau des Projekts')).toBeTruthy();
  });

  it('shows an error toast when starting fails', async () => {
    mockHandlers.set('preview.start', () => {
      throw new MockRpcError('COMMAND_FAILED', 'Der Entwicklungsserver ist sofort beendet worden.');
    });
    renderPreview('prj_rezept', 'backend');
    await userEvent.click(await screen.findByRole('button', { name: 'Vorschau starten' }));
    await waitFor(() =>
      expect(useToastStore.getState().toasts.some((t) => t.title === 'Die Vorschau konnte nicht gestartet werden' && t.message === 'Der Entwicklungsserver ist sofort beendet worden.')).toBe(true),
    );
  });

  it('never embeds non-loopback addresses', async () => {
    mockHandlers.set('preview.status', () => status({ url: 'http://192.168.0.20:5174/' }));
    renderPreview('prj_pixel');
    expect(await screen.findByText('Diese Adresse wird nicht eingebettet')).toBeTruthy();
    expect(screen.queryByTitle('Live-Vorschau des Projekts')).toBeNull();
  });

  it('explains engines without embedded preview and offers to open the engine', async () => {
    renderPreview('prj_aether', 'unity');
    expect(await screen.findByText('Keine eingebettete Live-Vorschau')).toBeTruthy();
    expect(screen.getByText(/Unity-Projekte haben keine eingebettete Live-Vorschau/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'In Unity öffnen' }));
    await waitFor(() => expect(getMockCalls('integrations.open')[0]?.params).toEqual({ id: 'unity', projectId: 'prj_aether' }));
  });

  it('shows start/stop and the output for desktop programs', async () => {
    mockHandlers.set('preview.status', () => status({ projectId: 'prj_pixel', kind: 'desktop-run', state: 'running', url: null, processId: 'proc_px_dev', message: 'Das Programm läuft.' }));
    renderPreview('prj_pixel', 'desktop');
    expect(await screen.findByRole('button', { name: 'Programm beenden' })).toBeTruthy();
    expect(await screen.findByText(/VITE v5\.4\.10/)).toBeTruthy();
    act(() => emitMockEvent({ type: 'process.output', payload: { processId: 'proc_px_dev', projectId: 'prj_pixel', stream: 'stdout', data: 'Fenster geöffnet\n' } }));
    expect(await screen.findByText(/Fenster geöffnet/)).toBeTruthy();
  });

  it('shows the load error with a retry', async () => {
    mockHandlers.set('preview.status', () => {
      throw new MockRpcError('INTERNAL', 'Vorschau-Modul nicht bereit.');
    });
    renderPreview('prj_pixel');
    expect(await screen.findByText('Vorschau-Modul nicht bereit.')).toBeTruthy();
    mockHandlers.delete('preview.status');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByTitle('Live-Vorschau des Projekts')).toBeTruthy();
  });
});
