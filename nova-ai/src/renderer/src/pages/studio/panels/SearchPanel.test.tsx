/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithRouter, setupRendererTest } from '../../../lib/test-utils';
import { getMockCalls, mockHandlers, MockRpcError } from '../../../lib/mock-bridge';
import { SearchPanel } from './SearchPanel';

setupRendererTest();

function renderSearch() {
  const onOpen = vi.fn();
  renderWithRouter(<SearchPanel projectId="prj_pixel" onOpen={onOpen} />);
  return { onOpen, input: screen.getByRole('searchbox', { name: 'Suchbegriff' }) };
}

describe('SearchPanel', () => {
  it('starts with a hint and groups results by file', async () => {
    const { onOpen, input } = renderSearch();
    expect(screen.getByText('Im Projekt suchen')).toBeTruthy();
    await userEvent.type(input, 'Phaser');
    const results = await screen.findByRole('list', { name: 'Suchergebnisse' });
    expect(screen.getByText(/Treffer in \d+ Dateien/)).toBeTruthy();
    const group = within(results).getByRole('list', { name: 'Treffer in src/main.ts' });
    const hits = within(group).getAllByRole('button');
    await userEvent.click(hits[0]);
    expect(onOpen).toHaveBeenCalledWith('src/main.ts', 1, expect.any(Number));
    // Highlighted as text (never HTML).
    expect(group.querySelector('mark')?.textContent?.toLowerCase()).toBe('phaser');
  });

  it('passes the case and regex options and validates expressions locally', async () => {
    const { input } = renderSearch();
    await userEvent.click(screen.getByRole('button', { name: 'Groß-/Kleinschreibung beachten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Regulärer Ausdruck' }));
    expect(screen.getByRole('button', { name: 'Regulärer Ausdruck' }).getAttribute('aria-pressed')).toBe('true');
    await userEvent.type(input, 'scene(');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Der reguläre Ausdruck ist ungültig.')).toBeTruthy();
    expect(getMockCalls('files.search')).toHaveLength(0);
    await userEvent.clear(input);
    await userEvent.type(input, 'Scene\\b');
    await waitFor(() => expect(getMockCalls('files.search').at(-1)?.params).toEqual({ projectId: 'prj_pixel', query: 'Scene\\b', regex: true, caseSensitive: true, limit: 500 }));
  });

  it('collapses result groups', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'Phaser');
    const toggle = await screen.findByRole('button', { name: /^main\.ts src/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await userEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('list', { name: 'Treffer in src/main.ts' })).toBeNull();
  });

  it('says when nothing was found', async () => {
    const { input } = renderSearch();
    await userEvent.type(input, 'gibtesnicht123');
    expect(await screen.findByText('Keine Treffer für „gibtesnicht123“')).toBeTruthy();
  });

  it('shows search errors with a retry', async () => {
    mockHandlers.set('files.search', () => {
      throw new MockRpcError('VALIDATION', 'Der Suchausdruck ist ungültig.');
    });
    const { input } = renderSearch();
    await userEvent.type(input, 'abc');
    expect(await screen.findByText('Die Suche hat nicht geklappt')).toBeTruthy();
    expect(screen.getByText('Der Suchausdruck ist ungültig.')).toBeTruthy();
  });
});
