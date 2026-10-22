/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { RPC_METHODS } from '@shared/rpc';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import ModelsPage from './ModelsPage';
import { ThreeDModelsCard } from './ThreeDModelsCard';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);
const row = (name: string) => within(screen.getByRole('list', { name: '3D-Modelle' })).getByRole('heading', { name }).closest('li') as HTMLElement;

async function renderCard() {
  renderWithRouter(<ThreeDModelsCard />, { route: '/models' });
  await screen.findByRole('list', { name: '3D-Modelle' });
}

describe('ThreeDModelsCard', () => {
  it('lists the 3D models with purpose, size, missing bytes, VRAM and license', async () => {
    await renderCard();
    const trellis = row('TRELLIS.2');
    expect(within(trellis).getByText('Installiert')).toBeTruthy();
    expect(within(trellis).getByText('8,3 GB')).toBeTruthy();
    expect(within(trellis).getByText('empfohlen ab 10 GB')).toBeTruthy();
    expect(within(trellis).getByText('MIT')).toBeTruthy();
    expect(within(trellis).getByText('Dateien (5)')).toBeTruthy();
    const pixal = row('Pixal3D');
    expect(within(pixal).getByText('Teilweise vorhanden')).toBeTruthy();
    expect(within(pixal).getByText('5,8 GB')).toBeTruthy();
    expect(within(pixal).getByRole('button', { name: 'Pixal3D herunterladen (5,8 GB)' })).toBeTruthy();
    const zimage = row('Z-Image Turbo');
    expect(within(zimage).getByText('Text zu Bild')).toBeTruthy();
    expect(within(zimage).getByText('Apache-2.0')).toBeTruthy();
    expect(within(zimage).getByText('11,3 GB')).toBeTruthy();
    // ComfyUI summary, VRAM guide and the way to the workshop.
    expect(screen.getByText('Läuft')).toBeTruthy();
    expect(screen.getByText(/Empfohlen ist eine NVIDIA-Grafikkarte mit 16 GB/)).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /Zur 3D-Werkstatt/ })[0].getAttribute('href')).toBe('/threed');
  });

  it('downloads a model with live progress and cancel', async () => {
    await renderCard();
    await userEvent.click(within(row('Pixal3D')).getByRole('button', { name: 'Pixal3D herunterladen (5,8 GB)' }));
    await waitFor(() => expect(getMockCalls('threed.downloadModel')[0]?.params).toEqual({ id: 'pixal3d' }));
    const op = getMockDb().operations.find((o) => o.kind === 'threed_download')!;
    act(() => emitMockEvent({ type: 'operation.updated', payload: { ...op, progress: 37, message: '2,1 GB von 5,8 GB · pixal3d_int8_convrot.safetensors' } }));
    const pixal = row('Pixal3D');
    expect((await within(pixal).findByRole('progressbar', { name: '3D-Modell „Pixal3D“ herunterladen' })).getAttribute('aria-valuenow')).toBe('37');
    expect(within(pixal).getByText('2,1 GB von 5,8 GB · pixal3d_int8_convrot.safetensors')).toBeTruthy();
    expect(within(pixal).queryByRole('button', { name: /herunterladen \(/ })).toBeNull();
    await userEvent.click(within(pixal).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(getMockCalls('operations.cancel')[0]?.params).toEqual({ id: op.id }));
    expect(await within(row('Pixal3D')).findByText(/Download abgebrochen/)).toBeTruthy();
    expect(within(row('Pixal3D')).getByRole('button', { name: 'Pixal3D herunterladen (5,8 GB)' })).toBeTruthy();
  });

  it('reloads the catalog when a download finishes', async () => {
    await renderCard();
    await userEvent.click(within(row('Pixal3D')).getByRole('button', { name: /Pixal3D herunterladen/ }));
    await waitFor(() => expect(getMockCalls('threed.downloadModel')).toHaveLength(1));
    const op = getMockDb().operations.find((o) => o.kind === 'threed_download')!;
    for (const f of getMockDb().threeD.catalog[1].files) getMockDb().threeD.presentFiles.add(`${f.folder}/${f.name}`);
    act(() => emitMockEvent({ type: 'operation.updated', payload: { ...op, status: 'done', progress: 100, endedAt: Date.now() } }));
    expect(await within(row('Pixal3D')).findByText('Installiert')).toBeTruthy();
  });

  it('explains when the download needs the network approval for Hugging Face', async () => {
    mockHandlers.set('threed.downloadModel', () => {
      throw new MockRpcError('APPROVAL_REQUIRED', 'Der Download braucht die Freigabe für huggingface.co. Sie wartet unter „Freigaben“.');
    });
    await renderCard();
    await userEvent.click(within(row('Pixal3D')).getByRole('button', { name: /Pixal3D herunterladen/ }));
    const pixal = row('Pixal3D');
    expect(await within(pixal).findByText('Freigabe nötig')).toBeTruthy();
    expect(within(pixal).getByRole('link', { name: 'Zu den Freigaben' }).getAttribute('href')).toBe('/approvals');
  });

  it('deletes a model after a confirmation that names the freed space', async () => {
    await renderCard();
    await userEvent.click(within(row('TRELLIS.2')).getByRole('button', { name: 'TRELLIS.2 löschen' }));
    const dialog = await screen.findByRole('dialog', { name: '3D-Modell löschen?' });
    expect(within(dialog).getByText(/5 Dateien, 8,3 GB werden frei/)).toBeTruthy();
    // The running demo job uses TRELLIS.2 – the daemon refuses and the dialog stays open.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(lastToast()?.message).toContain('von einem laufenden Auftrag benutzt'));
    getMockDb().threeD.jobs.find((j) => j.id === 'job3d_laterne')!.status = 'done';
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(getMockCalls('threed.deleteModel')[1]?.params).toEqual({ id: 'trellis2' }));
    await waitFor(() => expect(lastToast()?.title).toBe('TRELLIS.2 wurde gelöscht'));
    expect(await within(row('TRELLIS.2')).findByText('Nicht installiert')).toBeTruthy();
  });

  it('keeps files another installed model needs', async () => {
    for (const f of getMockDb().threeD.catalog[1].files) getMockDb().threeD.presentFiles.add(`${f.folder}/${f.name}`);
    await renderCard();
    await userEvent.click(within(row('Pixal3D')).getByRole('button', { name: 'Pixal3D löschen' }));
    const dialog = await screen.findByRole('dialog', { name: '3D-Modell löschen?' });
    expect(within(dialog).getByText(/2 Dateien, 5,8 GB werden frei/)).toBeTruthy();
    expect(within(dialog).getByText('Dateien, die auch TRELLIS.2 braucht, bleiben erhalten.')).toBeTruthy();
  });

  it('asks for the models folder before downloads are possible', async () => {
    getMockDb().threeD.status.modelsDir = null;
    await renderCard();
    expect(await screen.findByText('Modellordner unbekannt')).toBeTruthy();
    await waitFor(() => expect((within(row('Pixal3D')).getByRole('button', { name: /Pixal3D herunterladen/ }) as HTMLButtonElement).disabled).toBe(true));
  });

  it('shows a hint instead of the models when the daemon has no 3D workshop', async () => {
    getMockDb().daemon.methods = RPC_METHODS.filter((m) => !m.startsWith('threed.'));
    renderWithRouter(<ThreeDModelsCard />, { route: '/models' });
    expect(await screen.findByText(/läuft noch in einer älteren Version ohne 3D-Werkstatt/)).toBeTruthy();
    expect(screen.queryByRole('list', { name: '3D-Modelle' })).toBeNull();
  });

  it('is part of the models page', async () => {
    renderWithRouter(<ModelsPage />, { route: '/models?section=3d' });
    expect(await screen.findByRole('heading', { name: '3D-Modelle' })).toBeTruthy();
    expect(await screen.findByRole('list', { name: '3D-Modelle' })).toBeTruthy();
  });
});
