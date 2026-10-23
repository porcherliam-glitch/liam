/** @vitest-environment jsdom */
// The viewer with three.js replaced by a test double (jsdom has no WebGL). The real WebGL check falling back in jsdom
// is covered by ThreeDPage.test.tsx.
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import type { CreateViewerOptions, ModelViewerController } from './scene';
import { ModelViewer } from './ModelViewer';

const viewer = vi.hoisted(() => ({
  webgl: true,
  lastOptions: null as CreateViewerOptions | null,
  lastData: null as ArrayBuffer | null,
  controller: null as ModelViewerController | null,
  failWith: null as Error | null,
}));

vi.mock('./webgl', () => ({ isWebGLAvailable: () => viewer.webgl }));
vi.mock('./scene', () => ({
  createModelViewer: async (host: HTMLElement, data: ArrayBuffer, options: CreateViewerOptions) => {
    viewer.lastOptions = options;
    viewer.lastData = data;
    if (viewer.failWith) throw viewer.failWith;
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    return viewer.controller;
  },
}));

setupRendererTest();

function fakeController(): ModelViewerController {
  return {
    stats: { meshes: 2, triangles: 60, vertices: 120, materials: 2, textures: 1, size: { x: 1.024, y: 0.74, z: 0.744 } },
    setWireframe: vi.fn(),
    setAutoRotate: vi.fn(),
    resetView: vi.fn(),
    rotate: vi.fn(),
    zoom: vi.fn(),
    dispose: vi.fn(),
  };
}

beforeEach(() => {
  viewer.webgl = true;
  viewer.failWith = null;
  viewer.lastOptions = null;
  viewer.lastData = null;
  viewer.controller = fakeController();
});

describe('ModelViewer', () => {
  it('loads the GLB bytes from threed.readFile and offers a text alternative', async () => {
    renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    expect(screen.getByText('Modell wird geladen …')).toBeTruthy();
    const app = await screen.findByRole('application', { name: '3D-Vorschau von „holzkiste“' });
    expect(getMockCalls('threed.readFile')[0]?.params).toEqual({ id: 'job3d_kiste', kind: 'model' });
    expect(new DataView(viewer.lastData!).getUint32(0, true)).toBe(0x46546c67);
    const description = screen.getByText(/60 Dreiecke, 2 Materialien, 1 Textur/);
    expect(description.textContent).toContain('1,02 × 0,74 × 0,74 m');
    expect(app.getAttribute('aria-describedby')).toContain(description.id);
    expect(app.getAttribute('tabindex')).toBe('0');
  });

  it('is fully keyboard operable and toggles wireframe / auto-rotate', async () => {
    renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    const app = await screen.findByRole('application');
    const c = viewer.controller!;
    app.focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowUp}+-0');
    expect(c.rotate).toHaveBeenNthCalledWith(1, Math.PI / 12, 0);
    expect((c.rotate as ReturnType<typeof vi.fn>).mock.calls[1][1]).toBeLessThan(0);
    expect(c.zoom).toHaveBeenNthCalledWith(1, 0.85);
    expect(c.zoom).toHaveBeenNthCalledWith(2, 1.18);
    expect(c.resetView).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('w');
    expect(c.setWireframe).toHaveBeenLastCalledWith(true);
    const wire = screen.getByRole('button', { name: 'Drahtgitter' });
    expect(wire.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(wire);
    expect(c.setWireframe).toHaveBeenLastCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Drehen' }));
    expect(c.setAutoRotate).toHaveBeenLastCalledWith(true);
    await userEvent.click(screen.getByRole('button', { name: 'Zurücksetzen' }));
    expect(c.resetView).toHaveBeenCalledTimes(2);
    // Other keys are left alone (no preventDefault → page scrolling etc. keep working).
    expect(fireEvent.keyDown(app, { key: 'PageDown' })).toBe(true);
  });

  it('releases GPU resources on unmount', async () => {
    const { unmount } = renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    await screen.findByRole('application');
    unmount();
    expect(viewer.controller!.dispose).toHaveBeenCalledTimes(1);
  });

  it('shows the daemon error and loads again on "Erneut versuchen"', async () => {
    mockHandlers.set('threed.readFile', () => {
      throw new MockRpcError('NOT_FOUND', 'Die 3D-Datei wurde nicht gefunden.');
    });
    renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    expect(await screen.findByText('Die Vorschau konnte nicht angezeigt werden')).toBeTruthy();
    expect(screen.getByText('Die 3D-Datei wurde nicht gefunden.')).toBeTruthy();
    mockHandlers.delete('threed.readFile');
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByRole('application', { name: '3D-Vorschau von „holzkiste“' })).toBeTruthy();
    expect(getMockCalls('threed.readFile')).toHaveLength(2);
  });

  it('explains files the preview cannot read, with technical details', async () => {
    viewer.failWith = Object.assign(new Error('Das Modell ist mit Draco komprimiert. Diese Vorschau kann es nicht anzeigen.'), { details: 'KHR_draco_mesh_compression' });
    renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    expect(await screen.findByText(/mit Draco komprimiert/)).toBeTruthy();
    expect(screen.getByText('KHR_draco_mesh_compression')).toBeTruthy();
    expect(screen.getByText('Technische Details')).toBeTruthy();
  });

  it('degrades gracefully when the GPU drops the context', async () => {
    renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    await screen.findByRole('application');
    act(() => viewer.lastOptions?.onContextLost?.());
    expect(await screen.findByText('Die Grafikkarte hat die Vorschau beendet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Vorschau neu laden' }));
    await waitFor(() => expect(getMockCalls('threed.readFile')).toHaveLength(2));
    expect(viewer.controller!.dispose).toHaveBeenCalled();
  });

  it('shows a German fallback without WebGL and does not load the file', async () => {
    viewer.webgl = false;
    renderWithRouter(<ModelViewer jobId="job3d_kiste" name="holzkiste" />);
    expect(screen.getByText('3D-Vorschau nicht verfügbar')).toBeTruthy();
    expect(screen.getByText(/Die Vorschau braucht WebGL/)).toBeTruthy();
    expect(getMockCalls('threed.readFile')).toHaveLength(0);
  });
});
