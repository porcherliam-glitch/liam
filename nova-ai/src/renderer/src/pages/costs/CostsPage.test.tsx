/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import type { AgentStep } from '@shared/schemas';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { api } from '../../lib/api';
import { useToastStore } from '../../stores/toasts';
import CostsPage from './CostsPage';
import { dayLabel, limitMode, limitPercent, limitText, periodStart } from './costUtils';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);

async function renderPage() {
  renderWithRouter(<CostsPage />, { route: '/costs' });
  await screen.findByText('Heute ausgegeben');
}

describe('CostsPage', () => {
  it('shows budget status, tokens, runtime, per-project budgets and usage', async () => {
    await renderPage();
    expect(screen.getByText('Diesen Monat ausgegeben')).toBeTruthy();
    expect(screen.getByText(/noch 2,00 \$ von 2,00 \$/)).toBeTruthy();
    expect(screen.getByText('Tokens und Laufzeit')).toBeTruthy();
    const perProject = screen.getByRole('table', { name: 'Budget pro Projekt' });
    expect(await within(perProject).findByRole('link', { name: 'Pixel-Abenteuer' })).toBeTruthy();
    const usage = await screen.findByRole('table', { name: 'Einzelne Modellaufrufe' });
    expect((await within(usage).findAllByText('qwen/qwen3-coder')).length).toBe(3);
    expect(within(usage).getAllByText('geschätzt').length).toBeGreaterThan(0);
    expect(within(usage).getAllByText('kostenlos').length).toBeGreaterThan(0);
    const breakdown = screen.getByRole('table', { name: 'Aufteilung der Kosten' });
    expect(await within(breakdown).findByText('OpenRouter')).toBeTruthy();
    expect(within(breakdown).getByText('Ollama (lokal)')).toBeTruthy();
    expect(getMockCalls('budget.breakdown')[0]?.params).toMatchObject({ groupBy: 'provider' });
  });

  it('resumes paused paid work only after confirmation', async () => {
    getMockDb().paidPaused = true;
    getMockDb().pausedReason = 'Das Tageslimit von 2,00 $ ist erreicht.';
    await renderPage();
    expect(screen.getByText('Kostenpflichtige Arbeit ist pausiert')).toBeTruthy();
    expect(screen.getByText(/Das Tageslimit von 2,00 \$ ist erreicht\./)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Kostenpflichtige Arbeit fortsetzen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kostenpflichtige Arbeit fortsetzen?' });
    expect(getMockCalls('budget.resumePaid')).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fortsetzen' }));
    await waitFor(() => expect(getMockCalls('budget.resumePaid')[0]?.params).toEqual({}));
    await waitFor(() => expect(screen.queryByText('Kostenpflichtige Arbeit ist pausiert')).toBeNull());
  });

  it('resumes paid work of a single paused project', async () => {
    const base = await api('budget.status');
    mockHandlers.set('budget.status', () => ({
      ...base,
      perProject: base.perProject.map((p) => (p.projectId === 'prj_pixel' ? { ...p, limitUsd: 1, remainingUsd: 0, paidPaused: true } : p)),
    }));
    await renderPage();
    const table = screen.getByRole('table', { name: 'Budget pro Projekt' });
    expect(within(table).getByText('Pausiert')).toBeTruthy();
    await userEvent.click(await within(table).findByRole('button', { name: 'Kostenpflichtige Arbeit für Pixel-Abenteuer fortsetzen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Kostenpflichtige Arbeit fortsetzen?' });
    expect(within(dialog).getByText(/Projekt „Pixel-Abenteuer“/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fortsetzen' }));
    await waitFor(() => expect(getMockCalls('budget.resumePaid')[0]?.params).toEqual({ projectId: 'prj_pixel' }));
  });

  it('saves limits via budget.setLimits and the budget settings via settings.update', async () => {
    await renderPage();
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Tageslimit' })).getByRole('radio', { name: 'Unbegrenzt' }));
    const monthly = screen.getByLabelText('Monatslimit in US-Dollar');
    await userEvent.clear(monthly);
    await userEvent.type(monthly, '50');
    await userEvent.click(screen.getByRole('switch', { name: 'Bei erreichter Grenze lokal weiterarbeiten' }));
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('budget.setLimits')[0]?.params).toEqual({ dailyLimitUsd: null, monthlyLimitUsd: 50 }));
    await waitFor(() => expect(getMockCalls('settings.update')[0]?.params).toEqual({ budgets: { fallbackToLocal: false } }));
    await waitFor(() => expect(lastToast()?.title).toBe('Budget gespeichert'));
    expect(screen.queryByText('Nicht gespeichert')).toBeNull();
  });

  it('validates the limit amount before saving', async () => {
    await renderPage();
    const daily = screen.getByLabelText('Tageslimit in US-Dollar');
    await userEvent.clear(daily);
    await userEvent.type(daily, 'viel');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Bitte eine Zahl eingeben (z. B. 2,5).')).toBeTruthy();
    expect(getMockCalls('budget.setLimits')).toHaveLength(0);
  });

  it('shows an error toast when saving the limits fails', async () => {
    mockHandlers.set('budget.setLimits', () => {
      throw new MockRpcError('INTERNAL', 'Datenbank gesperrt');
    });
    await renderPage();
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Monatslimit' })).getByRole('radio', { name: 'Keine Kosten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', title: 'Budget konnte nicht gespeichert werden', message: 'Datenbank gesperrt' }));
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();
  });

  it('groups the breakdown by model and filters the usage by project', async () => {
    await renderPage();
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Aufteilen nach' })).getByRole('radio', { name: 'Modell' }));
    await waitFor(() => expect(getMockCalls('budget.breakdown').at(-1)?.params).toMatchObject({ groupBy: 'model' }));
    const breakdown = screen.getByRole('table', { name: 'Aufteilung der Kosten' });
    expect(await within(breakdown).findByText('qwen/qwen3-coder (OpenRouter)')).toBeTruthy();
    await userEvent.selectOptions(await screen.findByLabelText('Projekt filtern'), 'prj_rezept');
    await waitFor(() => expect(getMockCalls('budget.usage').at(-1)?.params).toMatchObject({ projectId: 'prj_rezept' }));
  });

  it('R5-6: refreshes tokens, runtime and calls after every finished model call, also local ones', async () => {
    await renderPage();
    await screen.findByRole('table', { name: 'Einzelne Modellaufrufe' });
    const counts = () => ['budget.status', 'budget.usage', 'budget.breakdown'].map((m) => getMockCalls(m as 'budget.status').length);
    const base = await api('budget.status');
    mockHandlers.set('budget.status', () => ({ ...base, tokensToday: { input: 2_100_000, output: 540_000 } }));
    const before = counts();
    const step: AgentStep = { id: 991, runId: 'run_x', taskId: 'tsk_x', projectId: 'prj_pixel', ts: Date.now(), kind: 'tool_call', summary: 'Datei gelesen', data: null };
    act(() => emitMockEvent({ type: 'run.step', payload: step }));
    await new Promise((r) => setTimeout(r, 1200));
    expect(counts()).toEqual(before);
    // A local Ollama call: no budget.updated from the daemon, only the model_call step.
    act(() => emitMockEvent({ type: 'run.step', payload: { ...step, id: 992, kind: 'model_call', summary: 'Modell qwen2.5-coder:7b: 1 Werkzeugaufruf' } }));
    await waitFor(() => expect(counts().every((n, i) => n === before[i] + 1)).toBe(true), { timeout: 3000 });
    expect(await screen.findByText('2,6 Mio.')).toBeTruthy();
  });

  it('R5-1: the per-project empty state does not claim there are no projects when there are', async () => {
    const base = await api('budget.status');
    mockHandlers.set('budget.status', () => ({ ...base, perProject: [] }));
    await renderPage();
    const table = screen.getByRole('table', { name: 'Budget pro Projekt' });
    expect(within(table).getByText('Keine aktiven Projekte')).toBeTruthy();
    expect(screen.queryByText('Noch keine Projekte')).toBeNull();
  });

  it('shows empty states without usage', async () => {
    getMockDb().usage = [];
    await renderPage();
    expect((await screen.findAllByText('Keine Aufrufe in diesem Zeitraum')).length).toBe(2);
  });
});

describe('costUtils', () => {
  it('maps limits to modes and texts', () => {
    expect(limitMode(null)).toBe('unlimited');
    expect(limitMode(0)).toBe('none');
    expect(limitMode(5)).toBe('amount');
    expect(limitText(0)).toBe('keine kostenpflichtige Nutzung');
    expect(limitText(null)).toBe('ohne Grenze');
    expect(limitPercent(1, 4)).toBe(25);
    expect(limitPercent(1, 0)).toBeNull();
    expect(dayLabel('2026-10-22')).toBe('22.10.2026');
  });

  it('computes period starts', () => {
    const now = new Date(2026, 9, 22, 15, 30).getTime();
    expect(periodStart('today', now)).toBe(new Date(2026, 9, 22).getTime());
    expect(periodStart('month', now)).toBe(new Date(2026, 9, 1).getTime());
    expect(periodStart('7d', now)).toBe(now - 7 * 86_400_000);
  });
});
