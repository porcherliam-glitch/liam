/** @vitest-environment jsdom */
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithRouter, setupRendererTest } from '../../lib/test-utils';
import { emitMockEvent, getMockCalls, getMockDb, mockHandlers, MockRpcError } from '../../lib/mock-bridge';
import { useDaemonStore } from '../../stores/daemon';
import { useToastStore } from '../../stores/toasts';
import ModelsPage from './ModelsPage';

setupRendererTest();

const lastToast = () => useToastStore.getState().toasts.at(-1);

async function renderPage() {
  renderWithRouter(<ModelsPage />, { route: '/models' });
  await screen.findByRole('table', { name: 'Installierte lokale Modelle' });
}

describe('ModelsPage – Ollama and local models', () => {
  it('shows the Ollama status and the installed models with capabilities and fit check', async () => {
    await renderPage();
    expect(screen.getByText('Läuft')).toBeTruthy();
    expect(screen.getByText('Version 0.12.6')).toBeTruthy();
    expect(screen.getByText('Ollama ist bereit')).toBeTruthy();
    const table = screen.getByRole('table', { name: 'Installierte lokale Modelle' });
    expect(within(table).getByText('qwen2.5-coder:14b')).toBeTruthy();
    expect(within(table).getByText('nomic-embed-text:latest')).toBeTruthy();
    expect(within(table).getAllByText('Werkzeuge').length).toBeGreaterThan(0);
    expect(within(table).getByText('32.768 Tokens')).toBeTruthy();
    // Default model and loaded marker from the selection / running list.
    expect(within(table).getByText('Standard')).toBeTruthy();
    expect((await within(table).findAllByText('Geladen')).length).toBe(2);
    // Fit check runs once per model.
    await waitFor(() => expect(getMockCalls('ollama.fit').map((c) => c.params.model).sort()).toEqual(['llama3.1:8b', 'nomic-embed-text:latest', 'qwen2.5-coder:14b']));
    expect((await within(table).findAllByText(/^Passt/)).length).toBe(3);
  });

  it('shows German fix instructions when Ollama is not installed', async () => {
    Object.assign(getMockDb().ollama, { installed: false, running: false, version: null, binaryPath: null, message: 'Ollama wurde nicht gefunden.' });
    renderWithRouter(<ModelsPage />, { route: '/models' });
    expect(await screen.findByText('Ollama ist nicht installiert')).toBeTruthy();
    expect(screen.getByText('Ollama läuft nicht')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download-Seite öffnen/ })).toBeTruthy();
    expect(screen.getByText('Zum Herunterladen muss Ollama laufen.')).toBeTruthy();
    expect(getMockCalls('ollama.models')).toHaveLength(0);
  });

  it('tests and saves a new Ollama address on the provider row "ollama-local"', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Adresse ändern' }));
    const input = screen.getByLabelText('Adresse von Ollama');
    await userEvent.clear(input);
    await userEvent.type(input, 'http://127.0.0.1:11500');
    await userEvent.click(screen.getByRole('button', { name: /Verbindung prüfen/ }));
    expect(await screen.findByText('Unter dieser Adresse antwortet kein Ollama')).toBeTruthy();
    expect(getMockCalls('ollama.status').at(-1)?.params).toEqual({ baseUrl: 'http://127.0.0.1:11500' });
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(getMockCalls('providers.upsert')[0]?.params).toEqual({ id: 'ollama-local', type: 'ollama', name: 'Ollama (lokal)', baseUrl: 'http://127.0.0.1:11500' }),
    );
  });

  it('deletes a model after confirmation', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'llama3.1:8b löschen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Modell löschen?' });
    expect(within(dialog).getByText(/in der Modellauswahl eingetragen/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(getMockCalls('ollama.delete')[0]?.params).toEqual({ model: 'llama3.1:8b' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(lastToast()?.title).toBe('llama3.1:8b wurde gelöscht');
  });

  it('downloads a suggested model with live progress and cancel', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: /qwen2\.5-coder:7b/ }));
    expect((screen.getByLabelText('Modellname') as HTMLInputElement).value).toBe('qwen2.5-coder:7b');
    expect(getMockCalls('ollama.pull')).toHaveLength(0); // suggestions never download by themselves
    await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    await waitFor(() => expect(getMockCalls('ollama.pull')[0]?.params).toEqual({ model: 'qwen2.5-coder:7b' }));
    const pull = getMockDb().pulls[0];
    act(() => emitMockEvent({ type: 'ollama.pull', payload: { ...pull, percent: 42, completedBytes: 2 * 1024 ** 3, phase: 'downloading' } }));
    expect(await screen.findByRole('progressbar', { name: 'Download von qwen2.5-coder:7b' })).toBeTruthy();
    expect(screen.getByText(/Wird heruntergeladen · 2 GB von 4,7 GB/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Download von qwen2.5-coder:7b abbrechen' }));
    await waitFor(() => expect(getMockCalls('ollama.cancelPull')[0]?.params).toEqual({ id: pull.id }));
    expect(await screen.findByText('Abgebrochen', { selector: 'span' })).toBeTruthy();
  });

  it('rejects invalid model names before calling the daemon', async () => {
    await renderPage();
    await userEvent.type(screen.getByLabelText('Modellname'), 'bad name!');
    await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    expect(await screen.findByText(/unerlaubte Zeichen/)).toBeTruthy();
    expect(getMockCalls('ollama.pull')).toHaveLength(0);
  });

  it('shows an error toast when the download cannot start', async () => {
    mockHandlers.set('ollama.pull', () => {
      throw new MockRpcError('OLLAMA_UNREACHABLE', 'Ollama ist nicht erreichbar.');
    });
    await renderPage();
    await userEvent.type(screen.getByLabelText('Modellname'), 'mistral-nemo');
    await userEvent.click(screen.getByRole('button', { name: 'Herunterladen' }));
    await waitFor(() => expect(lastToast()).toMatchObject({ tone: 'error', title: 'Download konnte nicht gestartet werden', message: 'Ollama ist nicht erreichbar.' }));
  });
});

describe('ModelsPage – model selection', () => {
  it('blocks paid models that are not approved and saves default, fallbacks and role overrides as a patch', async () => {
    await renderPage();
    const defaultSelect = (await screen.findByLabelText('Standardmodell')) as HTMLSelectElement;
    expect(defaultSelect.value).toBe('ollama-local/qwen2.5-coder:14b');
    const paid = within(defaultSelect).getByRole('option', { name: /qwen\/qwen3-coder/ }) as HTMLOptionElement;
    expect(paid.disabled).toBe(true);
    expect(paid.textContent).toContain('nicht freigegeben');
    // Embedding-only models are not offered.
    expect(within(defaultSelect).queryByRole('option', { name: /nomic-embed-text/ })).toBeNull();

    await userEvent.selectOptions(defaultSelect, 'ollama-local/llama3.1:8b');
    // llama3.1:8b was the only fallback – it moves out of the chain.
    expect(screen.getByText(/Keine Ersatzmodelle/)).toBeTruthy();
    await userEvent.selectOptions(screen.getByLabelText('Ersatzmodell auswählen'), 'ollama-local/qwen2.5-coder:14b');
    await userEvent.click(screen.getByRole('button', { name: 'Hinzufügen' }));
    await userEvent.selectOptions(screen.getByLabelText('Prüfer'), 'ollama-local/qwen2.5-coder:14b');
    const temp = screen.getByLabelText('Temperatur');
    await userEvent.clear(temp);
    await userEvent.type(temp, '0,5');
    expect(screen.getByText('Nicht gespeichert')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(getMockCalls('models.setSelection')[0]?.params).toEqual({
        temperature: 0.5,
        defaultModel: { providerId: 'ollama-local', modelId: 'llama3.1:8b' },
        fallbacks: [{ providerId: 'ollama-local', modelId: 'qwen2.5-coder:14b' }],
        roleOverrides: { reviewer: { providerId: 'ollama-local', modelId: 'qwen2.5-coder:14b' } },
      }),
    );
    await waitFor(() => expect(screen.queryByText('Nicht gespeichert')).toBeNull());
  });

  it('reorders and removes fallbacks', async () => {
    getMockDb().settings.models.fallbacks = [
      { providerId: 'ollama-local', modelId: 'llama3.1:8b' },
      { providerId: 'ollama-local', modelId: 'qwen2.5-coder:14b' },
    ];
    getMockDb().settings.models.defaultModel = null;
    await renderPage();
    expect(await screen.findByText('Noch kein Standardmodell gewählt')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Ersatzmodelle' });
    await userEvent.click(within(list).getByRole('button', { name: 'qwen2.5-coder:14b nach oben' }));
    await userEvent.click(within(list).getByRole('button', { name: 'llama3.1:8b entfernen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(getMockCalls('models.setSelection')[0]?.params).toEqual({ fallbacks: [{ providerId: 'ollama-local', modelId: 'qwen2.5-coder:14b' }] }));
  });

  it('validates numbers locally and shows daemon validation errors inline', async () => {
    await renderPage();
    const ctx = await screen.findByLabelText('Kontextgröße lokaler Modelle');
    await userEvent.clear(ctx);
    await userEvent.type(ctx, '1000');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Muss mindestens 2.048 sein.')).toBeTruthy();
    expect(getMockCalls('models.setSelection')).toHaveLength(0);

    mockHandlers.set('models.setSelection', () => {
      throw new MockRpcError('VALIDATION', 'Ungültig', { issues: [{ path: 'maxOutputTokens', message: 'Zu groß für dieses Modell.' }] });
    });
    await userEvent.clear(ctx);
    await userEvent.type(ctx, '8192');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Zu groß für dieses Modell.')).toBeTruthy();
  });
});

describe('ModelsPage – providers', () => {
  it('lists providers with health, cost and key state', async () => {
    await renderPage();
    const row = (await screen.findByRole('heading', { name: 'OpenRouter' })).closest('li')!;
    expect(within(row).getByText('Kostenpflichtig · nicht freigegeben')).toBeTruthy();
    expect(within(row).getByText('Schlüssel gespeichert')).toBeTruthy();
    expect(within(row).getByText(/Erreichbar/, { selector: 'span' })).toBeTruthy();
    // Never shows key material.
    expect(document.body.textContent).not.toMatch(/sk-/);
  });

  it('adds a provider from a preset with explicit paid approval and a write-only key', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Anbieter hinzufügen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anbieter hinzufügen' });
    await userEvent.click(within(dialog).getByRole('radio', { name: /Anthropic/ }));
    expect((within(dialog).getByLabelText(/Adresse \(Basis-URL\)/) as HTMLInputElement).value).toBe('https://api.anthropic.com');
    await userEvent.click(within(dialog).getByLabelText('Kostenpflichtige Nutzung freigeben'));
    const key = within(dialog).getByLabelText('API-Schlüssel') as HTMLInputElement;
    expect(key.type).toBe('password');
    await userEvent.type(key, 'geheim-123');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }));
    await waitFor(() =>
      expect(getMockCalls('providers.upsert')[0]?.params).toEqual({
        type: 'anthropic',
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        enabled: true,
        paid: true,
        approved: true,
        options: {},
      }),
    );
    await waitFor(() => expect(getMockCalls('providers.setApiKey')[0]?.params).toEqual({ providerId: 'anthropic', apiKey: 'geheim-123' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const row = (await screen.findByRole('heading', { name: 'Anthropic' })).closest('li')!;
    expect(within(row).getByText('Schlüssel gespeichert')).toBeTruthy();
    expect(document.body.textContent).not.toContain('geheim-123');
  });

  it('warns about a cloud provider marked as free', async () => {
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Anbieter hinzufügen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anbieter hinzufügen' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Kostenpflichtig' }));
    expect(within(dialog).getByText('Ist dieser Anbieter wirklich kostenlos?')).toBeTruthy();
    expect(within(dialog).queryByLabelText('Kostenpflichtige Nutzung freigeben')).toBeNull();
  });

  it('shows inline validation errors from providers.upsert', async () => {
    mockHandlers.set('providers.upsert', () => {
      throw new MockRpcError('VALIDATION', 'Ungültig', { issues: [{ path: 'baseUrl', message: 'Diese Adresse ist nicht erlaubt.' }] });
    });
    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Anbieter hinzufügen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anbieter hinzufügen' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Hinzufügen' }));
    expect(await within(dialog).findByText('Diese Adresse ist nicht erlaubt.')).toBeTruthy();
    expect(getMockCalls('providers.setApiKey')).toHaveLength(0);
  });

  it('tests a provider connection and reports the result', async () => {
    await renderPage();
    const row = (await screen.findByRole('heading', { name: 'OpenRouter' })).closest('li')!;
    await userEvent.click(within(row).getByRole('button', { name: /Testen/ }));
    await waitFor(() => expect(getMockCalls('providers.test')[0]?.params).toEqual({ providerId: 'openrouter' }));
    await waitFor(() => expect(lastToast()?.title).toBe('OpenRouter: Verbindung klappt'));
  });

  it('removes a provider after confirmation', async () => {
    await renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'OpenRouter entfernen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Anbieter entfernen?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Entfernen' }));
    await waitFor(() => expect(getMockCalls('providers.remove')[0]?.params).toEqual({ id: 'openrouter' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'OpenRouter' })).toBeNull());
    expect(screen.queryByRole('button', { name: 'Ollama (lokal) entfernen' })).toBeNull();
  });

  it('sets the price of a paid model ("geschätzt")', async () => {
    await renderPage();
    const row = (await screen.findByRole('heading', { name: 'OpenRouter' })).closest('li')!;
    expect(within(row).getByText(/1 ohne Preis/)).toBeTruthy();
    await userEvent.click(within(row).getByRole('button', { name: /Modelle und Preise anzeigen/ }));
    await userEvent.click(within(row).getByRole('button', { name: 'Preis für deepseek/deepseek-chat-v3.1 festlegen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Preis festlegen' });
    await userEvent.type(within(dialog).getByLabelText(/Eingabe/), '0,27');
    await userEvent.type(within(dialog).getByLabelText(/Ausgabe/), '1,1');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(getMockCalls('models.setPricing')[0]?.params).toEqual({
        providerId: 'openrouter',
        modelId: 'deepseek/deepseek-chat-v3.1',
        pricing: { inputPerMTokUsd: 0.27, outputPerMTokUsd: 1.1, estimated: true },
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(within(row).queryByText(/ohne Preis/)).toBeNull();
  });

  it('warns when the secret store is not secure', async () => {
    renderWithRouter(<ModelsPage />, { route: '/models' });
    await waitFor(() => expect(useDaemonStore.getState().status).not.toBeNull());
    act(() => useDaemonStore.setState((s) => ({ status: s.status ? { ...s.status, secretStore: { scheme: 'aes-local', secure: false } } : s.status })));
    expect(await screen.findByText('API-Schlüssel werden nicht sicher gespeichert')).toBeTruthy();
  });
});
