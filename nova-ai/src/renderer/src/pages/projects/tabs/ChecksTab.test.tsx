/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setupRendererTest } from '../../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockBridge, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { useToastStore } from '../../../stores/toasts';
import { renderProject } from '../projectTestUtils';
import { commandFor, missingCommandText } from './checkCommands';

setupRendererTest();

describe('Prüfungen', () => {
  it('offers the configured checks and starts tests', async () => {
    renderProject('/projects/prj_pixel?tab=checks');
    const tiles = await screen.findByRole('list', { name: 'Verfügbare Prüfungen' });
    expect(within(tiles).getByRole('button', { name: 'Build ausführen' })).toBeTruthy();
    expect(within(tiles).getByRole('button', { name: 'Typprüfung ausführen' })).toBeTruthy();
    await userEvent.click(within(tiles).getByRole('button', { name: 'Tests ausführen' }));
    await waitFor(() => expect(getMockCalls('checks.run')[0]?.params).toEqual({ projectId: 'prj_pixel', kind: 'test' }));
    const runs = screen.getByRole('list', { name: 'Prüfungsläufe' });
    await waitFor(() => expect(within(runs).getAllByRole('listitem', { name: 'Tests: Läuft' }).length).toBe(1));
  });

  it('follows a running check live via check.updated', async () => {
    renderProject('/projects/prj_rezept?tab=checks');
    const runs = await screen.findByRole('list', { name: 'Prüfungsläufe' });
    expect(within(runs).getByRole('listitem', { name: 'Tests: Läuft' })).toBeTruthy();
    const running = getMockDb().checks.find((c) => c.id === 'crun_rz_t2')!;
    await waitFor(() => {
      act(() => emitMockEvent({ type: 'check.updated', payload: { ...running, status: 'passed', passed: 12, failed: 0, finishedAt: Date.now(), durationMs: 4000 } }));
      expect(within(runs).queryByRole('listitem', { name: 'Tests: Läuft' })).toBeNull();
    });
    expect(within(runs).getByText('12 bestanden · 0 fehlgeschlagen')).toBeTruthy();
  });

  it('says honestly which checks cannot run', async () => {
    renderProject('/projects/prj_aether?tab=checks');
    const tiles = await screen.findByRole('list', { name: 'Verfügbare Prüfungen' });
    expect(within(tiles).getByText(missingCommandText('lint'))).toBeTruthy();
    expect(within(tiles).queryByRole('button', { name: 'Lint ausführen' })).toBeNull();
    expect(missingCommandText('test')).toBe('Für dieses Projekt ist kein Testbefehl eingerichtet – Prüfung nicht möglich');
  });

  it('links failures to the exact line in the studio and creates a fix task', async () => {
    renderProject('/projects/prj_pixel?tab=checks');
    const runs = await screen.findByRole('list', { name: 'Prüfungsläufe' });
    const failed = within(runs).getByRole('listitem', { name: 'Tests: Fehlgeschlagen' });
    expect(within(failed).getByRole('link', { name: 'tests/player.test.ts:48:31' }).getAttribute('href')).toBe('/projects/prj_pixel/studio?file=tests%2Fplayer.test.ts&line=48');
    await userEvent.click(within(failed).getByRole('button', { name: 'Reparatur-Aufgabe anlegen' }));
    await waitFor(() => expect(getMockCalls('tasks.createFix')[0]?.params).toEqual({ projectId: 'prj_pixel', checkRunId: 'crun_px_t2' }));
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === 'Reparatur-Aufgabe angelegt')).toBe(true));
  });

  it('cancels a running check', async () => {
    renderProject('/projects/prj_rezept?tab=checks');
    const runs = await screen.findByRole('list', { name: 'Prüfungsläufe' });
    await userEvent.click(within(within(runs).getByRole('listitem', { name: 'Tests: Läuft' })).getByRole('button', { name: 'Abbrechen' }));
    await waitFor(() => expect(getMockCalls('checks.cancel')[0]?.params).toEqual({ id: 'crun_rz_t2' }));
  });

  it('shows build artifacts and reveals them in Explorer', async () => {
    const show = vi.spyOn(mockBridge.app, 'showInFolder');
    renderProject('/projects/prj_pixel?tab=checks');
    const runs = await screen.findByRole('list', { name: 'Prüfungsläufe' });
    const build = within(runs).getByRole('listitem', { name: 'Build: Bestanden' });
    await userEvent.click(within(build).getByRole('button', { name: /Ausgabe anzeigen · 2 Ergebnisdateien/ }));
    await userEvent.click(within(build).getByRole('button', { name: 'dist/index.html im Explorer zeigen' }));
    await waitFor(() => expect(show).toHaveBeenCalledWith('C:\\Users\\Demo\\Documents\\NOVA Projekte\\Pixel-Abenteuer\\dist\\index.html'));
  });

  it('shows an error toast when a check cannot start', async () => {
    mockHandlers.set('checks.run', () => {
      throw new MockRpcError('CONFLICT', 'Diese Prüfung läuft bereits.');
    });
    renderProject('/projects/prj_pixel?tab=checks');
    const tiles = await screen.findByRole('list', { name: 'Verfügbare Prüfungen' });
    await userEvent.click(within(tiles).getByRole('button', { name: 'Build ausführen' }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Diese Prüfung läuft bereits.'));
  });

  it('shows the empty state when nothing ran yet', async () => {
    mockHandlers.set('checks.list', () => []);
    renderProject('/projects/prj_pixel?tab=checks');
    expect(await screen.findByText('Noch keine Prüfungen gelaufen')).toBeTruthy();
  });
});

describe('commandFor', () => {
  it('uses the run (or dev) command for the start check', () => {
    const base = { install: null, dev: 'npm run dev', build: null, test: null, lint: null, typecheck: null, e2e: null, security: null, package: null, run: null };
    expect(commandFor({ config: { commands: base } }, 'runtime')).toBe('npm run dev');
    expect(commandFor({ config: { commands: { ...base, run: 'npm start' } } }, 'runtime')).toBe('npm start');
    expect(commandFor({ config: { commands: base } }, 'test')).toBeNull();
  });
});
