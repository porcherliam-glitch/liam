/** @vitest-environment jsdom */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { getMockCalls, getMockDb, mockBridge, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useToastStore } from '../../stores/toasts';
import { CreateProjectDialog, repoNameFromUrl } from './CreateProjectDialog';

setupRendererTest();

function Location() {
  const l = useLocation();
  return <output aria-label="Adresse">{l.pathname}</output>;
}

function renderDialog(onClose = vi.fn()) {
  renderWithRouter(
    <>
      <CreateProjectDialog open onClose={onClose} />
      <Location />
    </>,
    { route: '/projects' },
  );
  return { onClose };
}

const dialog = () => screen.getByRole('dialog', { name: 'Neues Projekt' });

describe('CreateProjectDialog', () => {
  it('creates a project from a description and navigates to it', async () => {
    const { onClose } = renderDialog();
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Projektname/ }), 'Wetter-App');
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Beschreibung/ }), 'Zeigt das Wetter für meinen Ort.');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Projekt anlegen' }));
    await waitFor(() =>
      expect(getMockCalls('projects.create')[0]?.params).toEqual({
        mode: 'description',
        name: 'Wetter-App',
        description: 'Zeigt das Wetter für meinen Ort.',
        kind: null,
        technologies: [],
        path: null,
        planNow: true,
        initGit: true,
      }),
    );
    const created = getMockDb().projects.find((p) => p.name === 'Wetter-App')!;
    await waitFor(() => expect(screen.getByRole('status', { name: 'Adresse' }).textContent).toBe(`/projects/${created.id}`));
    expect(onClose).toHaveBeenCalled();
    expect(useToastStore.getState().toasts.some((t) => t.title === 'Projekt „Wetter-App“ angelegt')).toBe(true);
  });

  it('validates required fields without calling the daemon', async () => {
    renderDialog();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Projekt anlegen' }));
    expect(await within(dialog()).findByText('Bitte einen Projektnamen eingeben.')).toBeTruthy();
    expect(within(dialog()).getByText('Bitte kurz beschreiben, was entstehen soll.')).toBeTruthy();
    expect(getMockCalls('projects.create')).toHaveLength(0);
  });

  it('shows daemon errors inline and keeps the dialog open', async () => {
    renderDialog();
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Projektname/ }), 'Pixel-Abenteuer');
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Beschreibung/ }), 'Noch ein Spiel');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Projekt anlegen' }));
    expect(await within(dialog()).findByText('Ein Projekt mit dem Namen „Pixel-Abenteuer“ gibt es schon.')).toBeTruthy();
  });

  it('lists templates with missing tools and creates from the chosen template', async () => {
    renderDialog();
    await userEvent.click(within(dialog()).getByRole('tab', { name: /Vorlage/ }));
    const templates = await within(dialog()).findByRole('radiogroup', { name: 'Vorlagen' });
    expect(within(templates).getByText('Browserspiel')).toBeTruthy();
    expect(within(templates).getByText('Fehlt noch: .NET SDK')).toBeTruthy();
    expect(within(templates).getByRole('link', { name: 'Unter „Werkzeuge“ installieren' }).getAttribute('href')).toBe('/integrations');
    await userEvent.click(within(templates).getByRole('radio', { name: /Webanwendung/ }));
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Projektname/ }), 'Meine Seite');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Projekt anlegen' }));
    await waitFor(() => expect(getMockCalls('projects.create')[0]?.params).toMatchObject({ mode: 'template', templateId: 'web-app', name: 'Meine Seite', path: null, planNow: false }));
  });

  it('opens an existing folder picked with the folder dialog', async () => {
    const pick = vi.spyOn(mockBridge.app, 'selectDirectory').mockResolvedValue('D:\\Code\\Altes Spiel');
    renderDialog();
    await userEvent.click(within(dialog()).getByRole('tab', { name: /Öffnen/ }));
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Wählen' }));
    expect(pick).toHaveBeenCalled();
    const name = within(dialog()).getByRole('textbox', { name: /Projektname/ }) as HTMLInputElement;
    await waitFor(() => expect(name.value).toBe('Altes Spiel'));
    expect(within(dialog()).getByText(/Nur vertrauenswürdige Projekte/)).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Projekt übernehmen' }));
    await waitFor(() => expect(getMockCalls('projects.create')[0]?.params).toEqual({ mode: 'open', name: 'Altes Spiel', description: '', path: 'D:\\Code\\Altes Spiel', planNow: false }));
  });

  it('imports a git repository and rejects unsupported addresses', async () => {
    renderDialog();
    await userEvent.click(within(dialog()).getByRole('tab', { name: /Importieren/ }));
    const url = within(dialog()).getByRole('textbox', { name: /Git-Adresse/ });
    await userEvent.type(url, 'http://example.com/a.git');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Importieren' }));
    expect(await within(dialog()).findByText('Nur https://-, ssh://- oder git@-Adressen sind erlaubt.')).toBeTruthy();
    expect(getMockCalls('projects.create')).toHaveLength(0);
    await userEvent.clear(url);
    await userEvent.type(url, 'https://github.com/demo/space-game.git');
    expect((within(dialog()).getByRole('textbox', { name: /Projektname/ }) as HTMLInputElement).value).toBe('space-game');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Importieren' }));
    await waitFor(() => expect(getMockCalls('projects.create')[0]?.params).toEqual({ mode: 'import', name: 'space-game', repoUrl: 'https://github.com/demo/space-game.git', path: null, planNow: false }));
  });

  it('walks through the assistant step by step', async () => {
    renderDialog();
    await userEvent.click(within(dialog()).getByRole('tab', { name: /Assistent/ }));
    expect(within(dialog()).getByText('Schritt 1 von 5')).toBeTruthy();
    const next = () => within(dialog()).getByRole('button', { name: 'Weiter' });
    expect(next().hasAttribute('disabled')).toBe(true);
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Browser-Spiel' }));
    await userEvent.click(next());
    await userEvent.click(within(dialog()).getByRole('radio', { name: 'Browser (PC und Handy)' }));
    await userEvent.click(next());
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Was soll das Projekt können/ }), 'Springen und Münzen sammeln');
    await userEvent.click(next());
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Wünsche zu Aussehen/ }), 'Pixelgrafik');
    await userEvent.click(next());
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Projektname/ }), 'Münzjäger');
    expect(within(dialog()).getByText('Zusammenfassung')).toBeTruthy();
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Projekt anlegen' }));
    await waitFor(() =>
      expect(getMockCalls('projects.create')[0]?.params).toMatchObject({
        mode: 'wizard',
        name: 'Münzjäger',
        kind: 'web',
        answers: { Art: 'Browser-Spiel', Zielplattform: 'Browser (PC und Handy)', 'Wichtigste Funktionen': 'Springen und Münzen sammeln', 'Stil und Technik': 'Pixelgrafik' },
        planNow: true,
      }),
    );
  });

  it('reports a cancelled import without creating a project', async () => {
    mockHandlers.set('projects.create', () => {
      throw new MockRpcError('CANCELLED', 'Abgebrochen.');
    });
    renderDialog();
    await userEvent.click(within(dialog()).getByRole('tab', { name: /Importieren/ }));
    await userEvent.type(within(dialog()).getByRole('textbox', { name: /Git-Adresse/ }), 'git@github.com:demo/tool.git');
    await userEvent.click(within(dialog()).getByRole('button', { name: 'Importieren' }));
    expect(await within(dialog()).findByText('Der Vorgang wurde abgebrochen. Es wurde kein Projekt angelegt.')).toBeTruthy();
  });
});

describe('repoNameFromUrl', () => {
  it('extracts the repository name', () => {
    expect(repoNameFromUrl('https://github.com/a/my-app.git')).toBe('my-app');
    expect(repoNameFromUrl('git@github.com:org/tool')).toBe('tool');
    expect(repoNameFromUrl('ssh://host/x/y/')).toBe('y');
  });
});
