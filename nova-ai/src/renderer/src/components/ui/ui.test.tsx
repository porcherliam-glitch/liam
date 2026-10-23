/** @vitest-environment jsdom */
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Play } from 'lucide-react';
import { Button, IconButton } from './Button';
import { ConfirmDialog, Dialog } from './Dialog';
import { Tabs } from './Tabs';
import { Table, type Column } from './Table';
import { Meter, ProgressBar } from './ProgressBar';
import { EmptyState, ErrorState } from './EmptyState';
import { Input, Select } from './Field';
import { Switch } from './Switch';
import { SegmentedControl } from './SegmentedControl';
import { Toaster } from './Toaster';
import { toast, useToastStore } from '../../stores/toasts';
import { NovaRpcError } from '../../lib/api';

afterEach(() => {
  cleanup();
  useToastStore.getState().clear();
});

describe('Button / IconButton', () => {
  it('disables and marks busy while loading', () => {
    const onClick = vi.fn();
    render(
      <Button icon={Play} loading onClick={onClick}>
        Starten
      </Button>,
    );
    const btn = screen.getByRole('button', { name: /Starten/ });
    expect(btn.hasAttribute('disabled')).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
  });

  it('icon buttons have an accessible name and tooltip', () => {
    render(<IconButton icon={Play} label="Abspielen" badge={3} />);
    const btn = screen.getByRole('button', { name: 'Abspielen' });
    expect(btn.getAttribute('title')).toBe('Abspielen');
    expect(btn.textContent).toContain('3');
  });
});

describe('Dialog', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    return (
      <Dialog open onClose={onClose} title="Aufgabe anlegen" description="Kurze Erklärung" footer={<Button>Anlegen</Button>}>
        <input aria-label="Titel" />
      </Dialog>
    );
  }

  it('is a modal dialog with title/description and closes on Esc', async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Aufgabe anlegen' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus with Tab', async () => {
    render(<Harness onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    const buttons = within(dialog).getAllByRole('button');
    const last = buttons[buttons.length - 1];
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Schließen' }));
  });

  it('ConfirmDialog calls onConfirm / onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open tone="danger" title="Regel löschen?" message="Wirklich?" confirmLabel="Löschen" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  function Harness() {
    const [tab, setTab] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Tabs
        label="Bereiche"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'a', label: 'Übersicht' },
          { id: 'b', label: 'Aufgaben', count: 3 },
          { id: 'c', label: 'Fehler', disabled: true },
        ]}
      />
    );
  }

  it('selects with click and arrow keys (skipping disabled tabs)', async () => {
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'Übersicht' });
    expect(first.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Aufgaben/ }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Übersicht' }).getAttribute('aria-selected')).toBe('true');
  });
});

describe('Table', () => {
  interface Row {
    id: string;
    name: string;
    size: number;
  }
  const rows: Row[] = [
    { id: '1', name: 'Beta', size: 2 },
    { id: '2', name: 'Alpha', size: 10 },
  ];
  const columns: Column<Row>[] = [
    { key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name },
    { key: 'size', header: 'Größe', cell: (r) => String(r.size), sortValue: (r) => r.size, align: 'right' },
  ];

  it('sorts by clicking a header and shows aria-sort', async () => {
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.id} />);
    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    const cells = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(cells).toEqual(['Alpha', 'Beta']);
    expect(screen.getByRole('columnheader', { name: /Name/ }).getAttribute('aria-sort')).toBe('ascending');
  });

  it('shows the empty state', () => {
    render(<Table columns={columns} rows={[]} rowKey={(r) => r.id} empty={<EmptyState compact title="Keine Regeln" />} />);
    expect(screen.getByText('Keine Regeln')).toBeTruthy();
  });
});

describe('Meter / ProgressBar', () => {
  it('renders values, estimates and the unavailable text', () => {
    render(
      <>
        <Meter label="VRAM" value={91} valueText="14,6 GB von 16 GB" estimated />
        <Meter label="GPU" value={null} unavailableText="Keine GPU-Messwerte verfügbar" />
        <ProgressBar value={null} label="Download" />
      </>,
    );
    const vram = screen.getByRole('meter', { name: 'VRAM' });
    expect(vram.getAttribute('aria-valuenow')).toBe('91');
    expect(vram.getAttribute('aria-valuetext')).toContain('geschätzt');
    expect(screen.getByText('Keine GPU-Messwerte verfügbar')).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'Download' }).getAttribute('aria-valuetext')).toBe('läuft');
  });
});

describe('Form controls', () => {
  it('Input links label and error', () => {
    render(<Input label="Projektname" error="Bitte einen Namen eingeben." defaultValue="" />);
    const input = screen.getByLabelText('Projektname');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Bitte einen Namen eingeben.');
  });

  it('Select, Switch and SegmentedControl report changes', async () => {
    const onSelect = vi.fn();
    const onSwitch = vi.fn();
    const onSeg = vi.fn();
    render(
      <>
        <Select label="Rolle" value="coder" onChange={(e) => onSelect(e.target.value)} options={[{ value: 'coder', label: 'Programmierer' }, { value: 'tester', label: 'Tester' }]} />
        <Switch checked={false} onChange={onSwitch} label="Live" />
        <SegmentedControl label="Stufe" value="all" onChange={onSeg} options={[{ value: 'all', label: 'Alle' }, { value: 'error', label: 'Fehler' }]} />
      </>,
    );
    await userEvent.selectOptions(screen.getByLabelText('Rolle'), 'tester');
    expect(onSelect).toHaveBeenCalledWith('tester');
    await userEvent.click(screen.getByRole('switch', { name: 'Live' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
    await userEvent.click(screen.getByRole('radio', { name: 'Fehler' }));
    expect(onSeg).toHaveBeenCalledWith('error');
  });
});

describe('ErrorState / Toaster', () => {
  it('shows the German error message with retry', async () => {
    const onRetry = vi.fn();
    render(<ErrorState error={new NovaRpcError('INTERNAL', 'Datenbank gesperrt')} onRetry={onRetry} />);
    expect(screen.getByText('Datenbank gesperrt')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Erneut versuchen/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('renders toasts and closes them', async () => {
    render(<Toaster />);
    toast.error('Speichern fehlgeschlagen', 'Die Datei ist gesperrt.');
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Die Datei ist gesperrt.')).toBeTruthy();
    expect(useToastStore.getState().toasts[0].duration).toBe(10_000);
    await userEvent.click(screen.getByRole('button', { name: 'Meldung schließen' }));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });
});
