/** @vitest-environment jsdom */
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, RouterWrapper, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockHandlers, MockRpcError, setMockConnection } from '../../lib/mock-bridge';
import { useDaemonStore } from '../../stores/daemon';
import { useToastStore } from '../../stores/toasts';
import { ErrorCard } from './ErrorCard';
import { ApprovalCard } from './ApprovalCard';
import { WorkControls } from './WorkControls';
import { DaemonBanner } from './DaemonBanner';
import { ModelBadge, PriorityBadge, TaskStatusBadge, VerificationBadge } from './StatusBadges';
import { PrioritySelect } from './PrioritySelect';
import { RelativeTime } from './RelativeTime';

setupRendererTest();

const db = () => getMockDb();

describe('ErrorCard', () => {
  it('answers the six questions and resolves via errors.resolve', async () => {
    const error = db().errors.find((e) => e.id === 'err_px_repeat')!;
    renderWithRouter(<ErrorCard error={error} projectName="Pixel-Abenteuer" />);
    for (const heading of ['Was ist passiert?', 'Betroffene Aufgabe', 'Bereits versucht', 'Ist das Projekt sicher?', 'Kann NOVA es selbst beheben?', 'Was ist zu tun?']) {
      expect(screen.getByText(heading)).toBeTruthy();
    }
    expect(screen.getByText('Blocker')).toBeTruthy();
    // Task title is loaded via tasks.get.
    expect(await screen.findByText('Kollision an Plattformkanten korrigieren')).toBeTruthy();
    expect(screen.getByText(/Ja – die Projektdateien/)).toBeTruthy();
    // Technical details are collapsed.
    expect(screen.queryByText(/AssertionError/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Technische Details/ }));
    expect(screen.getByText(/AssertionError/)).toBeTruthy();
    // Jump links from `related`.
    expect(screen.getByRole('link', { name: /tests\/player\.test\.ts:48 im Studio öffnen/ }).getAttribute('href')).toBe('/projects/prj_pixel/studio?file=tests%2Fplayer.test.ts&line=48');

    await userEvent.click(screen.getByRole('button', { name: 'Als erledigt markieren' }));
    await waitFor(() => expect(getMockCalls('errors.resolve')).toHaveLength(1));
    expect(getMockCalls('errors.resolve')[0].params).toEqual({ id: 'err_px_repeat' });
  });

  it('compact mode expands on demand and can create a fix task', async () => {
    const error = db().errors.find((e) => e.id === 'err_rz_migration')!;
    renderWithRouter(<ErrorCard error={error} compact />);
    expect(screen.queryByText('Bereits versucht')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Mehr anzeigen/ }));
    expect(screen.getByText('Bereits versucht')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Reparatur-Aufgabe anlegen/ }));
    await waitFor(() => expect(getMockCalls('tasks.createFix')).toHaveLength(1));
    expect(getMockCalls('tasks.createFix')[0].params).toEqual({ projectId: 'prj_rezept', errorId: 'err_rz_migration' });
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => t.title === 'Reparatur-Aufgabe angelegt')).toBe(true));
  });

  it('shows an error toast when resolving fails', async () => {
    mockHandlers.set('errors.resolve', () => {
      throw new MockRpcError('NOT_FOUND', 'Der Fehler wurde nicht gefunden.');
    });
    renderWithRouter(<ErrorCard error={db().errors.find((e) => e.id === 'err_vram')!} />);
    await userEvent.click(screen.getByRole('button', { name: 'Als erledigt markieren' }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.message).toBe('Der Fehler wurde nicht gefunden.'));
  });
});

describe('ApprovalCard', () => {
  it('shows action, consequences and decides once', async () => {
    const approval = db().approvals.find((a) => a.id === 'apr_px_cmd')!;
    renderWithRouter(<ApprovalCard approval={approval} projectName="Pixel-Abenteuer" />);
    expect(screen.getByText('npx playwright install chromium')).toBeTruthy();
    expect(screen.getByText('Mögliche Folgen')).toBeTruthy();
    expect(screen.getByText(/NOVA fragt vor bekannten riskanten Befehlen nach/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Einmal erlauben/ }));
    await waitFor(() => expect(getMockCalls('approvals.decide')).toHaveLength(1));
    expect(getMockCalls('approvals.decide')[0].params).toEqual({ id: 'apr_px_cmd', decision: 'approve', scope: 'once' });
  });

  it('offers "Immer erlauben" and "Ablehnen"', async () => {
    renderWithRouter(<ApprovalCard approval={db().approvals.find((a) => a.id === 'apr_px_cmd')!} />);
    await userEvent.click(screen.getByRole('button', { name: /Immer erlauben/ }));
    await waitFor(() => expect(getMockCalls('approvals.decide')[0]?.params).toEqual({ id: 'apr_px_cmd', decision: 'approve', scope: 'always' }));
  });

  it('hides "Immer erlauben" for once-only kinds (delete)', async () => {
    renderWithRouter(<ApprovalCard approval={db().approvals.find((a) => a.id === 'apr_rz_del')!} />);
    expect(screen.queryByRole('button', { name: /Immer erlauben/ })).toBeNull();
    expect(screen.getByText(/muss jedes Mal einzeln erlaubt werden/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Ablehnen/ }));
    await waitFor(() => expect(getMockCalls('approvals.decide')[0]?.params).toEqual({ id: 'apr_rz_del', decision: 'deny', scope: 'once' }));
  });

  it('decided approvals show the result instead of buttons', () => {
    renderWithRouter(<ApprovalCard approval={db().approvals.find((a) => a.id === 'apr_h3')!} />);
    expect(screen.getByText('Abgelehnt')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Einmal erlauben/ })).toBeNull();
  });
});

describe('WorkControls', () => {
  it('shows the state and pauses the work cycle', async () => {
    renderWithRouter(<WorkControls />);
    expect(await screen.findByText('Arbeitet')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Pausieren/ }));
    await waitFor(() => expect(useDaemonStore.getState().work?.state).toBe('paused'));
    expect(getMockCalls('work.pause')[0].params).toEqual({});
    expect(await screen.findByRole('button', { name: /Fortsetzen/ })).toBeTruthy();
  });

  it('asks before stopping', async () => {
    renderWithRouter(<WorkControls />);
    await userEvent.click(await screen.findByRole('button', { name: 'Arbeit stoppen' }));
    expect(screen.getByRole('dialog', { name: 'Autonome Arbeit stoppen?' })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Stoppen' }));
    await waitFor(() => expect(useDaemonStore.getState().work?.state).toBe('stopped'));
    expect(await screen.findByRole('button', { name: /Starten/ })).toBeTruthy();
  });

  it('per project: starts a stopped project with the trust confirmation', async () => {
    renderWithRouter(<WorkControls projectId="prj_aether" confirmStart="Nur vertrauenswürdige Projekte freigeben." />);
    await userEvent.click(await screen.findByRole('button', { name: /Starten/ }));
    expect(screen.getByText('Nur vertrauenswürdige Projekte freigeben.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Arbeit starten' }));
    await waitFor(() => expect(getMockCalls('work.start')[0]?.params).toEqual({ projectId: 'prj_aether' }));
    await waitFor(() => expect(db().projects.find((p) => p.id === 'prj_aether')?.workState).toBe('running'));
  });
});

describe('DaemonBanner', () => {
  it('appears when the connection is lost and restarts the service', async () => {
    renderWithRouter(<DaemonBanner />);
    await waitFor(() => expect(useDaemonStore.getState().connection?.state).toBe('connected'));
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => setMockConnection({ state: 'error', message: 'Der Dienst konnte nicht gestartet werden.' }));
    expect(await screen.findByText('Der Hintergrunddienst ist nicht erreichbar')).toBeTruthy();
    expect(screen.getByText(/Der Dienst konnte nicht gestartet werden\./)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Dienst neu starten/ }));
    await waitFor(() => expect(screen.queryByText('Der Hintergrunddienst ist nicht erreichbar')).toBeNull());
  });

  it('damaged database: restores a checked backup and creates diagnostics without the service (R3-6)', async () => {
    renderWithRouter(<DaemonBanner />);
    await waitFor(() => expect(useDaemonStore.getState().connection?.state).toBe('connected'));
    act(() =>
      setMockConnection({
        state: 'error',
        message: 'Der NOVA-Hintergrunddienst konnte nicht starten. Die Datenbank ist möglicherweise beschädigt.',
        recovery: ['restore_backup', 'create_diagnostics'],
      }),
    );
    await userEvent.click(await screen.findByRole('button', { name: /Diagnose erstellen/ }));
    await waitFor(() => expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Diagnose-Paket erstellt'));
    await userEvent.click(screen.getByRole('button', { name: /Datensicherung einspielen/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Datensicherung einspielen' });
    const radios = await within(dialog).findAllByRole('radio');
    expect(radios.length).toBeGreaterThan(0);
    expect((radios[0] as HTMLInputElement).checked).toBe(true); // newest first, preselected
    await userEvent.click(within(dialog).getByRole('button', { name: /Prüfen, einspielen und neu starten/ }));
    await waitFor(() => expect(useDaemonStore.getState().connection?.state).toBe('connected'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(useToastStore.getState().toasts.at(-1)?.title).toBe('Datensicherung eingespielt');
  });

  it('offers no backup restore for other start errors', async () => {
    renderWithRouter(<DaemonBanner />);
    await waitFor(() => expect(useDaemonStore.getState().connection?.state).toBe('connected'));
    act(() => setMockConnection({ state: 'error', message: 'Startet nicht.', recovery: ['create_diagnostics'] }));
    expect(await screen.findByRole('button', { name: /Diagnose erstellen/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Datensicherung einspielen/ })).toBeNull();
  });
});

describe('RelativeTime', () => {
  it('a just-measured timestamp reads "gerade eben", never "gleich" (R5-4)', () => {
    // Fresh resource snapshot / "Zuletzt geprüft": recorded now or a few hundred ms ahead (clock of the daemon).
    render(
      <>
        <RelativeTime ts={Date.now()} prefix="A" />
        <RelativeTime ts={Date.now() + 800} prefix="B" />
        <RelativeTime ts={Date.now() - 5 * 60_000} prefix="C" />
      </>,
    );
    expect(screen.getByText('A gerade eben')).toBeTruthy();
    expect(screen.getByText('B gerade eben')).toBeTruthy();
    expect(screen.getByText('C vor 5 Min.')).toBeTruthy();
    expect(screen.queryByText(/gleich/)).toBeNull();
  });
});

describe('badges and selectors', () => {
  it('render German labels with icons', async () => {
    render(
      <RouterWrapper>
        <TaskStatusBadge status="waiting_approval" />
        <VerificationBadge status="passed" />
        <PriorityBadge priority={3} />
        <ModelBadge model="ollama-local/qwen2.5-coder:14b" />
        <ModelBadge model={null} />
      </RouterWrapper>,
    );
    expect(screen.getByText('Wartet auf Freigabe')).toBeTruthy();
    expect(screen.getByText('Geprüft ✓')).toBeTruthy();
    expect(screen.getByText('Kritisch')).toBeTruthy();
    expect(screen.getByText('qwen2.5-coder:14b').closest('[title]')?.getAttribute('title')).toContain('Lokales Modell');
    expect(screen.getByText('Kein Modell')).toBeTruthy();
  });

  it('PrioritySelect reports numeric priorities', async () => {
    let value = -1;
    render(<PrioritySelect value={1} onChange={(p) => (value = p)} />);
    await userEvent.selectOptions(screen.getByLabelText('Priorität'), 'Hoch');
    expect(value).toBe(2);
  });
});
