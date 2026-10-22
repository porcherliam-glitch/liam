/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Eye, FileDiff, Search } from 'lucide-react';
import { PanelTabs, panelTabsMode, type PanelTabItem } from './PanelTabs';

type Id = 'search' | 'changes' | 'preview';
const items: Array<PanelTabItem<Id>> = [
  { id: 'search', label: 'Suche', icon: Search },
  { id: 'changes', label: 'Änderungen', icon: FileDiff, count: 3, countTone: 'danger' },
  { id: 'preview', label: 'Vorschau', icon: Eye, count: 0 },
];

describe('PanelTabs', () => {
  it('picks the richest mode that fits', () => {
    expect(panelTabsMode(0)).toBe('full');
    expect(panelTabsMode(900)).toBe('full');
    expect(panelTabsMode(600)).toBe('labels');
    expect(panelTabsMode(400)).toBe('icons');
  });

  it('keeps accessible names, counts and the keyboard navigation in every mode', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<PanelTabs label="Werkzeuge" idBase="t" items={items} value="search" onChange={onChange} mode="full" />);
    expect(screen.getByRole('tab', { name: 'Änderungen 3' })).toBeTruthy();
    // A zero count is not shown.
    expect(screen.getByRole('tab', { name: 'Vorschau' })).toBeTruthy();

    rerender(<PanelTabs label="Werkzeuge" idBase="t" items={items} value="search" onChange={onChange} mode="icons" />);
    const changes = screen.getByRole('tab', { name: 'Änderungen (3)' });
    expect(changes.getAttribute('title')).toBe('Änderungen (3)');
    expect(changes.getAttribute('aria-controls')).toBe('t-panel-changes');
    expect(screen.queryByText('Suche')).toBeNull();

    const search = screen.getByRole('tab', { name: 'Suche' });
    expect(search.getAttribute('aria-selected')).toBe('true');
    search.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('changes');
    await userEvent.keyboard('{End}');
    expect(onChange).toHaveBeenLastCalledWith('preview');
    await userEvent.click(screen.getByRole('tab', { name: 'Vorschau' }));
    expect(onChange).toHaveBeenLastCalledWith('preview');
  });
});
