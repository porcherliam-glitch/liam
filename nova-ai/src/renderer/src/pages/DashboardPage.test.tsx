/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../lib/mock-bridge';
import { GB } from '../lib/mock-data';
import DashboardPage from './DashboardPage';

setupRendererTest();

describe('DashboardPage', () => {
  it('shows key figures, live agent activity, errors, projects, models and costs', async () => {
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('Agenten-Aktivität')).toBeTruthy();
    const activity = screen.getByRole('list', { name: 'Aktive Agenten' });
    expect(await within(activity).findByText('Spielerbewegung mit Tastatur und Sprung')).toBeTruthy();
    expect(within(activity).getByText('Tests für die Suche schreiben und ausführen')).toBeTruthy();
    // Steps of the running agents.
    expect(await within(activity).findByText('Schreibt src/game/player.ts')).toBeTruthy();
    expect(screen.getByText(/2 Aufgaben auf eine Freigabe/)).toBeTruthy();

    expect(screen.getByRole('heading', { name: /Aktuelle Fehler/ })).toBeTruthy();
    expect(screen.getByText('Gleicher Testfehler nach 3 Versuchen')).toBeTruthy();
    expect(screen.getByText(/Laufend \(2\)/)).toBeTruthy();
    expect(screen.getByText(/Pausiert und wartend \(1\)/)).toBeTruthy();
    expect(screen.getByText('Ollama (lokal)')).toBeTruthy();
    expect(screen.getByText(/Version 0\.12\.6 · 3 Modelle installiert/)).toBeTruthy();
    expect(screen.getByText('Kosten und Verbrauch')).toBeTruthy();
    expect(screen.getByText('Fehlgeschlagene Tests')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'tests/player.test.ts:48' }).getAttribute('href')).toBe('/projects/prj_pixel/studio?file=tests%2Fplayer.test.ts&line=48');
  });

  it('updates resource meters live from resources.snapshot events', async () => {
    renderWithRouter(<DashboardPage />);
    const cpu = await screen.findByRole('meter', { name: 'Prozessor (CPU)' });
    expect(cpu.getAttribute('aria-valuenow')).toBe('34');
    const snap = { ...getMockDb().resources, ts: Date.now() + 1000, cpu: { ...getMockDb().resources.cpu, percent: 77 } };
    // Emit inside waitFor: the subscription is set up in an effect that may run after the first paint.
    await waitFor(() => {
      act(() => emitMockEvent({ type: 'resources.snapshot', payload: snap }));
      expect(screen.getByRole('meter', { name: 'Prozessor (CPU)' }).getAttribute('aria-valuenow')).toBe('77');
    });
  });

  it('shows "nicht verfügbar" with the GPU note when there is no GPU data', async () => {
    const db = getMockDb();
    db.resources = { ...db.resources, gpus: [], gpuNote: 'Keine GPU-Messwerte verfügbar (nvidia-smi nicht gefunden)' };
    renderWithRouter(<DashboardPage />);
    const gpu = await screen.findByRole('meter', { name: 'Grafikkarte (GPU)' });
    expect(gpu.getAttribute('aria-valuenow')).toBeNull();
    expect((await screen.findAllByText('Keine GPU-Messwerte verfügbar (nvidia-smi nicht gefunden)')).length).toBe(2);
  });

  it('marks estimated GPU values', async () => {
    const db = getMockDb();
    db.resources = { ...db.resources, gpus: [{ name: 'Intel UHD', vendor: 'intel', utilPercent: 12, vramTotalBytes: 2 * GB, vramUsedBytes: GB, source: 'wmi', estimated: true }] };
    renderWithRouter(<DashboardPage />);
    const vram = await screen.findByRole('meter', { name: 'Grafikspeicher (VRAM)' });
    expect(vram.getAttribute('aria-valuetext')).toBe('50 % (geschätzt)');
  });

  it('first start: empty state with "Projekt erstellen" and "Modell einrichten"', async () => {
    const db = getMockDb();
    db.projects = [];
    db.tasks = [];
    db.runs = [];
    db.errors = [];
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('Noch kein Projekt')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Projekt erstellen/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Modell einrichten/ })).toBeTruthy();
  });

  it('re-fetches when a task changes', async () => {
    renderWithRouter(<DashboardPage />);
    await screen.findByText('Agenten-Aktivität');
    const before = getMockCalls('dashboard.summary').length;
    act(() => emitMockEvent({ type: 'task.updated', payload: getMockDb().tasks[0] }));
    await waitFor(() => expect(getMockCalls('dashboard.summary').length).toBe(before + 1));
  });

  it('shows the error state when the summary cannot be loaded', async () => {
    mockHandlers.set('dashboard.summary', () => {
      throw new MockRpcError('INTERNAL', 'Datenbank nicht lesbar');
    });
    renderWithRouter(<DashboardPage />);
    expect(await screen.findByText('Datenbank nicht lesbar')).toBeTruthy();
    mockHandlers.delete('dashboard.summary');
    await userEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(await screen.findByText('Agenten-Aktivität')).toBeTruthy();
  });

  it('checks a cloud provider again', async () => {
    renderWithRouter(<DashboardPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'OpenRouter erneut prüfen' }));
    await waitFor(() => expect(getMockCalls('providers.test')[0]?.params).toEqual({ providerId: 'openrouter' }));
  });
});
