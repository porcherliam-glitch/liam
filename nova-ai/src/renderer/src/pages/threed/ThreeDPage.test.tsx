/** @vitest-environment jsdom */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RPC_METHODS } from '@shared/rpc';
import { renderApp, renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockBridge, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { DEMO_REFERENCE_PNG_BASE64 } from '../../lib/mock-threed-assets';
import { useToastStore } from '../../stores/toasts';
import ThreeDPage from './ThreeDPage';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);
const submitButton = () => screen.getByRole('button', { name: '3D-Modell erzeugen' }) as HTMLButtonElement;
const jobList = () => screen.getByRole('list', { name: '3D-Aufträge' });
const jobRow = (name: string) => within(jobList()).getByText(name, { selector: 'span' }).closest('li') as HTMLElement;

async function renderPage() {
  renderWithRouter(<ThreeDPage />, { route: '/threed' });
  await screen.findByText('ComfyUI ist bereit');
  await screen.findByRole('list', { name: '3D-Aufträge' });
}

function pngFile(name = 'laterne.png'): File {
  return new File([Buffer.from(DEMO_REFERENCE_PNG_BASE64, 'base64')], name, { type: 'image/png' });
}

describe('ThreeDPage – states', () => {
  it('shows ComfyUI, the GPU, the jobs and the running job in the result view', async () => {
    await renderPage();
    const engine = screen.getByRole('heading', { name: 'ComfyUI – das 3D-Programm' }).closest('section') as HTMLElement;
    expect(within(engine).getByText('Läuft')).toBeTruthy();
    expect(within(engine).getByText('Version 0.42.0')).toBeTruthy();
    expect(within(engine).getByText('NVIDIA GeForce RTX 4080')).toBeTruthy();
    expect(within(engine).getByText('16 GB Grafikspeicher, 13,1 GB frei')).toBeTruthy();
    expect(within(engine).getByText('Gut geeignet')).toBeTruthy();
    expect(within(engine).getByText('C:\\Users\\Demo\\Documents\\ComfyUI\\models')).toBeTruthy();
    for (const name of ['laterne', 'schatztruhe', 'holzkiste', 'vase', 'drache', 'stuhl']) expect(jobRow(name)).toBeTruthy();
    expect(within(jobRow('drache')).getByText(/Zu wenig Grafikspeicher/)).toBeTruthy();
    // The running job is shown first.
    const result = screen.getByRole('heading', { name: 'Ergebnis: laterne' }).closest('section') as HTMLElement;
    expect(within(result).getByText('Form wird berechnet')).toBeTruthy();
    expect(within(result).getByRole('progressbar', { name: 'Fortschritt von „laterne“' }).getAttribute('aria-valuenow')).toBe('46');
    expect(await within(result).findByRole('img', { name: 'Ausgangsbild von „laterne“' })).toBeTruthy();
    expect(submitButton().disabled).toBe(false);
  });

  it('is reachable from the sidebar group "Arbeit"', async () => {
    renderApp('/');
    const nav = screen.getByRole('navigation', { name: 'Hauptnavigation' });
    await userEvent.click(within(nav).getByRole('link', { name: '3D-Werkstatt' }));
    expect(await screen.findByRole('heading', { level: 1, name: '3D-Werkstatt' })).toBeTruthy();
  });

  it('hides the workshop with a hint when the running daemon has no 3D methods', async () => {
    getMockDb().daemon.methods = RPC_METHODS.filter((m) => !m.startsWith('threed.'));
    renderWithRouter(<ThreeDPage />, { route: '/threed' });
    expect(await screen.findByText('Die 3D-Werkstatt ist im laufenden Hintergrunddienst noch nicht verfügbar')).toBeTruthy();
    const restart = vi.spyOn(mockBridge.daemon, 'restart');
    await userEvent.click(screen.getByRole('button', { name: 'Dienst neu starten' }));
    expect(restart).toHaveBeenCalledTimes(1);
  });

  it('explains how to install ComfyUI and requests the installation through an approval', async () => {
    Object.assign(getMockDb().threeD.status, { installed: false, running: false, version: null, supports3d: false, gpu: null, message: 'ComfyUI wurde auf diesem PC nicht gefunden.' });
    Object.assign(getMockDb().integrations.find((i) => i.id === 'comfyui')!, { available: false, version: null, path: null });
    renderWithRouter(<ThreeDPage />, { route: '/threed' });
    expect(await screen.findByText('ComfyUI ist nicht installiert')).toBeTruthy();
    expect(screen.getByText('Nicht installiert')).toBeTruthy();
    expect(await screen.findByText('winget install -e --id Comfy.ComfyUI-Desktop')).toBeTruthy();
    expect(screen.getByText('unbekannt (ComfyUI läuft nicht)')).toBeTruthy();
    expect(screen.getByText('ComfyUI ist nicht installiert. Oben steht, wie es eingerichtet wird.')).toBeTruthy();
    expect(submitButton().disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'ComfyUI installieren' }));
    await waitFor(() => expect(getMockCalls('integrations.install')[0]?.params).toEqual({ id: 'comfyui' }));
    expect(await screen.findByText('Freigabe angelegt', { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zu den Freigaben' }).getAttribute('href')).toBe('/approvals');
    expect(getMockDb().approvals.some((a) => a.title === 'ComfyUI installieren' && a.status === 'pending')).toBe(true);
  });

  it('tells how to start or update ComfyUI', async () => {
    Object.assign(getMockDb().threeD.status, { running: false, version: null, gpu: null, message: 'Unter http://127.0.0.1:8000 antwortet kein ComfyUI.' });
    const { unmount } = renderWithRouter(<ThreeDPage />, { route: '/threed' });
    expect(await screen.findByText('ComfyUI ist installiert, läuft aber nicht')).toBeTruthy();
    expect(screen.getByText(/run_nvidia_gpu\.bat/)).toBeTruthy();
    expect(screen.getByText('ComfyUI läuft nicht. Bitte ComfyUI starten.')).toBeTruthy();
    // "Erneut prüfen" probes again and the card follows the new state.
    Object.assign(getMockDb().threeD.status, { running: true, version: '0.42.0', supports3d: false });
    await userEvent.click(screen.getAllByRole('button', { name: 'Erneut prüfen' })[0]);
    expect(await screen.findByText('ComfyUI ist zu alt für 3D-Modelle')).toBeTruthy();
    expect(getMockCalls('threed.status').some((c) => (c.params as { refresh?: boolean } | undefined)?.refresh === true)).toBe(true);
    unmount();
  });

  it('asks for the models folder and saves it via threed.configure', async () => {
    getMockDb().threeD.status.modelsDir = null;
    const pick = vi.spyOn(mockBridge.app, 'selectDirectory').mockResolvedValue('D:\\ComfyUI\\models');
    renderWithRouter(<ThreeDPage />, { route: '/threed' });
    expect(await screen.findByText('Wo liegen die Modelle von ComfyUI?')).toBeTruthy();
    await userEvent.click(within(screen.getByText('Wo liegen die Modelle von ComfyUI?').closest('div')!.parentElement!).getByRole('button', { name: 'Modellordner wählen …' }));
    await waitFor(() => expect(getMockCalls('threed.configure')[0]?.params).toEqual({ modelsDir: 'D:\\ComfyUI\\models' }));
    expect(pick).toHaveBeenCalled();
    expect(await screen.findByText('ComfyUI ist bereit')).toBeTruthy();
    expect(screen.getByText('D:\\ComfyUI\\models')).toBeTruthy();
  });

  it('rejects a folder that is not a ComfyUI models folder', async () => {
    vi.spyOn(mockBridge.app, 'selectDirectory').mockResolvedValue('D:\\Bilder');
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Ändern …' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', title: 'Dieser Ordner passt nicht' }));
    expect(lastToast()?.message).toContain('typischen Unterordner');
  });

  it('blocks creating while the models are missing and links to the 3D models', async () => {
    getMockDb().threeD.presentFiles.clear();
    renderWithRouter(<ThreeDPage />, { route: '/threed' });
    expect(await screen.findByText('TRELLIS.2 ist noch nicht heruntergeladen.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Zu den 3D-Modellen/ }).getAttribute('href')).toBe('/models?section=3d');
    expect(submitButton().disabled).toBe(true);
    expect(screen.getAllByText('Nicht heruntergeladen')).toHaveLength(2);
  });
});

describe('ThreeDPage – creating', () => {
  it('validates and starts a "Text zu 3D" job into the library', async () => {
    await renderPage();
    await userEvent.click(submitButton());
    expect(await screen.findByText('Bitte beschreiben, welches Objekt entstehen soll.')).toBeTruthy();
    expect(getMockCalls('threed.generate')).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Eine alte Holzkiste mit Eisenbeschlägen' }));
    expect((screen.getByLabelText('Beschreibung') as HTMLTextAreaElement).value).toBe('Eine alte Holzkiste mit Eisenbeschlägen');
    expect((screen.getByLabelText('Name') as HTMLInputElement).placeholder).toBe('alte-holzkiste-eisenbeschlaegen');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Qualität' })).getByRole('radio', { name: 'Entwurf' }));
    expect(screen.getByText(/200\.000 Flächen/)).toBeTruthy();
    expect(screen.getByText(/plus etwa 1 Min\. für das Bild/)).toBeTruthy();
    await userEvent.click(submitButton());
    await waitFor(() =>
      expect(getMockCalls('threed.generate')[0]?.params).toEqual({
        mode: 'text',
        model: 'trellis2',
        quality: 'draft',
        name: 'alte-holzkiste-eisenbeschlaegen',
        projectId: null,
        prompt: 'Eine alte Holzkiste mit Eisenbeschlägen',
      }),
    );
    await waitFor(() => expect(lastToast()?.title).toBe('3D-Auftrag gestartet'));
    // The new job is listed and shown in the result view.
    expect(await screen.findByRole('heading', { name: 'Ergebnis: alte-holzkiste-eisenbeschlaegen' })).toBeTruthy();
    expect(jobRow('alte-holzkiste-eisenbeschlaegen')).toBeTruthy();
  });

  it('saves into a project with its own name and shows the target path', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('Beschreibung'), 'Ein Heiltrank');
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Speichern in' })).getByRole('radio', { name: 'Projekt' }));
    await userEvent.type(screen.getByLabelText('Name'), 'trank');
    await userEvent.click(submitButton());
    expect(await screen.findByText('Bitte ein Projekt wählen.')).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Projekt'), 'Aetherfall');
    expect(screen.getByText(/Datei: assets\/3d\/trank\.glb/)).toBeTruthy();
    await userEvent.click(within(screen.getByRole('group', { name: '3D-Modell (Generator)' })).getByRole('radio', { name: /TRELLIS\.2/ }));
    await userEvent.click(submitButton());
    await waitFor(() => expect(getMockCalls('threed.generate')[0]?.params).toMatchObject({ mode: 'text', name: 'trank', projectId: 'prj_aether', prompt: 'Ein Heiltrank' }));
  });

  it('rejects invalid names before calling the daemon', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('Beschreibung'), 'Ein Stuhl');
    await userEvent.type(screen.getByLabelText('Name'), 'a/b');
    await userEvent.click(submitButton());
    expect(await screen.findByText(/in Dateinamen nicht erlaubt/)).toBeTruthy();
    expect(getMockCalls('threed.generate')).toHaveLength(0);
  });

  it('starts "Bild zu 3D" with a chosen image (checked, previewed, sent as base64)', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Bild zu 3D' }));
    await userEvent.click(submitButton());
    expect(await screen.findByText('Bitte zuerst ein Bild auswählen, hineinziehen oder einfügen.')).toBeTruthy();
    const input = screen.getByLabelText('Bilddatei auswählen') as HTMLInputElement;
    await userEvent.upload(input, new File(['kein Bild'], 'notiz.png', { type: 'image/png' }), { applyAccept: false });
    expect(await screen.findByText(/Dieses Format wird nicht unterstützt/)).toBeTruthy();
    await userEvent.upload(input, pngFile());
    expect(await screen.findByRole('img', { name: 'Vorschau: laterne.png' })).toBeTruthy();
    expect(screen.getByText(/PNG · 958 B/)).toBeTruthy();
    expect((screen.getByLabelText('Name') as HTMLInputElement).placeholder).toBe('laterne');
    await userEvent.click(submitButton());
    await waitFor(() => expect(getMockCalls('threed.generate')[0]?.params).toEqual({ mode: 'image', model: 'trellis2', quality: 'standard', name: 'laterne', projectId: null, imageBase64: DEMO_REFERENCE_PNG_BASE64 }));
  });

  it('accepts dropped and pasted images and refuses images over 20 MB', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Bild zu 3D' }));
    const zone = screen.getByTestId('threed-dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [new File([new Uint8Array(21 * 1024 * 1024)], 'riesig.png', { type: 'image/png' })] } });
    expect(await screen.findByText(/Erlaubt sind höchstens 20 MB/)).toBeTruthy();
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile('gezogen.png')] } });
    expect(await screen.findByRole('img', { name: 'Vorschau: gezogen.png' })).toBeTruthy();
    fireEvent.paste(document, { clipboardData: { files: [pngFile('eingefuegt.png')] } });
    expect(await screen.findByRole('img', { name: 'Vorschau: eingefuegt.png' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }));
    expect(screen.getByText('Bild hierher ziehen oder mit Strg+V einfügen')).toBeTruthy();
  });

  it('shows a daemon refusal inside the form', async () => {
    mockHandlers.set('threed.generate', () => {
      throw new MockRpcError('MODEL_UNAVAILABLE', 'TRELLIS.2 ist noch nicht vollständig heruntergeladen.');
    });
    await renderPage();
    await userEvent.type(screen.getByLabelText('Beschreibung'), 'Eine Vase');
    await userEvent.click(submitButton());
    expect(await screen.findByText('Der Auftrag konnte nicht gestartet werden')).toBeTruthy();
    expect(screen.getByText('TRELLIS.2 ist noch nicht vollständig heruntergeladen.')).toBeTruthy();
  });
});

describe('ThreeDPage – jobs', () => {
  it('follows job progress from events until the model is done (viewer falls back without WebGL)', async () => {
    await renderPage();
    const job = getMockDb().threeD.jobs.find((j) => j.id === 'job3d_laterne')!;
    act(() => emitMockEvent({ type: 'threed.job', payload: { ...job, progress: 80, phase: 'Textur wird gebacken' } }));
    const row = jobRow('laterne');
    expect(await within(row).findByText('Textur wird gebacken')).toBeTruthy();
    expect(within(row).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('80');
    act(() =>
      emitMockEvent({
        type: 'threed.job',
        payload: { ...job, status: 'done', phase: null, progress: 100, outputPath: 'C:\\Users\\Demo\\Documents\\NOVA Projekte\\Pixel-Abenteuer\\assets\\3d\\laterne.glb', outputRel: 'assets/3d/laterne.glb', endedAt: Date.now() },
      }),
    );
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'success', title: '3D-Modell „laterne“ ist fertig' }));
    const result = (await screen.findByRole('heading', { name: 'Ergebnis: laterne' })).closest('section') as HTMLElement;
    expect(await within(result).findByText('3D-Vorschau nicht verfügbar')).toBeTruthy();
    expect(within(result).getByRole('button', { name: 'Im Explorer zeigen' })).toBeTruthy();
    expect(within(result).getByRole('link', { name: 'Im Studio öffnen' }).getAttribute('href')).toBe('/projects/prj_pixel/studio?file=assets%2F3d%2Flaterne.glb');
  });

  it('cancels a running job', async () => {
    await renderPage();
    await userEvent.click(within(jobRow('laterne')).getByRole('button', { name: '„laterne“ abbrechen' }));
    await waitFor(() => expect(getMockCalls('threed.cancel')[0]?.params).toEqual({ id: 'job3d_laterne' }));
    expect(await within(jobRow('laterne')).findByText('Abgebrochen')).toBeTruthy();
  });

  it('shows a finished job, reveals it in Explorer and deletes it with its files', async () => {
    const reveal = vi.spyOn(mockBridge.app, 'showInFolder');
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: '„holzkiste“ ansehen' }));
    const result = (await screen.findByRole('heading', { name: 'Ergebnis: holzkiste' })).closest('section') as HTMLElement;
    expect(within(result).getByText('„Eine alte Holzkiste mit Eisenbeschlägen, leicht verwittert“')).toBeTruthy();
    expect(await within(result).findByRole('img', { name: 'Erzeugtes Referenzbild von „holzkiste“' })).toBeTruthy();
    await userEvent.click(within(jobRow('holzkiste')).getByRole('button', { name: '„holzkiste“ im Explorer zeigen' }));
    expect(reveal).toHaveBeenCalledWith('C:\\Users\\Demo\\Desktop\\Aetherfall\\assets\\3d\\holzkiste.glb');

    await userEvent.click(within(jobRow('holzkiste')).getByRole('button', { name: '„holzkiste“ löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Auftrag löschen?' });
    expect(within(dialog).getByText('Ohne Häkchen bleiben die Dateien erhalten.')).toBeTruthy();
    await userEvent.click(within(dialog).getByLabelText('Erzeugte Dateien ebenfalls löschen'));
    expect(within(dialog).getByText('assets/3d/holzkiste.glb wird aus dem Projekt gelöscht (mit dem Referenzbild).')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Auftrag und Dateien löschen' }));
    await waitFor(() => expect(getMockCalls('threed.deleteJob')[0]?.params).toEqual({ id: 'job3d_kiste', deleteFiles: true }));
    await waitFor(() => expect(within(jobList()).queryByText('holzkiste', { selector: 'span' })).toBeNull());
    expect(lastToast()?.title).toBe('Auftrag und Dateien gelöscht');
  });
});

describe('ThreeDPage – settings card', () => {
  it('saves normal fields via settings.update and the ComfyUI folder via threed.configure', async () => {
    await renderPage();
    const form = screen.getByRole('form', { name: 'Einstellungen' });
    await userEvent.selectOptions(within(form).getByLabelText('Qualität (Voreinstellung)'), 'high');
    await userEvent.type(within(form).getByLabelText('Modellordner von ComfyUI'), 'E:\\KI\\ComfyUI\\models');
    await userEvent.click(within(form.closest('section')!).getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('threed.configure')[0]?.params).toEqual({ modelsDir: 'E:\\KI\\ComfyUI\\models' }));
    await waitFor(() => expect(getMockCalls('settings.update')[0]?.params).toEqual({ threeD: { defaultQuality: 'high' } }));
    await waitFor(() => expect(lastToast()?.title).toBe('Einstellungen der 3D-Werkstatt gespeichert'));
    expect(getMockDb().settings.threeD).toMatchObject({ defaultQuality: 'high', modelsDir: 'E:\\KI\\ComfyUI\\models' });
    // The new default is preselected in the form.
    expect(within(screen.getByRole('radiogroup', { name: 'Qualität' })).getByRole('radio', { name: 'Hoch' }).getAttribute('aria-checked')).toBe('true');
  });

  it('shows validation problems next to the fields', async () => {
    await renderPage();
    const form = screen.getByRole('form', { name: 'Einstellungen' });
    await userEvent.type(within(form).getByLabelText('Adresse von ComfyUI'), 'http://192.168.1.20:8188');
    await userEvent.clear(within(form).getByLabelText('Ordner im Projekt'));
    await userEvent.type(within(form).getByLabelText('Ordner im Projekt'), '..\\assets');
    await userEvent.click(within(form.closest('section')!).getByRole('button', { name: 'Speichern' }));
    expect(await within(form).findByText('Nur Adressen auf diesem PC sind erlaubt (127.0.0.1 oder localhost).')).toBeTruthy();
    expect(within(form).getByText(/Bitte \/ statt \\ verwenden/)).toBeTruthy();
    expect(getMockCalls('settings.update')).toHaveLength(0);
    expect(getMockCalls('threed.configure')).toHaveLength(0);
    // The daemon's check of the folder is shown at the folder field.
    await userEvent.clear(within(form).getByLabelText('Adresse von ComfyUI'));
    await userEvent.clear(within(form).getByLabelText('Ordner im Projekt'));
    await userEvent.type(within(form).getByLabelText('Ordner im Projekt'), 'assets/3d');
    await userEvent.type(within(form).getByLabelText('Modellordner von ComfyUI'), 'D:\\Bilder');
    await userEvent.click(within(form.closest('section')!).getByRole('button', { name: 'Speichern' }));
    expect(await within(form).findByText(/fehlen die typischen Unterordner/)).toBeTruthy();
    expect(getMockCalls('settings.update')).toHaveLength(0);
  });
});
