// Tab strip of the open files: dirty marker (dot that turns into the close button on hover), NOVA marker,
// roving keyboard focus (←/→, Pos1/Ende), Entf closes the focused tab, middle click closes.
import { useEffect, useMemo, type KeyboardEvent } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { Spinner } from '../../components/ui';
import { cn } from '../../lib/cn';
import { FileIcon } from './FileIcon';
import { fileName, parentPath } from './studio-utils';
import type { EditorTab } from './useEditorTabs';

export const EDITOR_PANEL_ID = 'studio-editor-panel';
export const editorTabId = (path: string) => `studio-editor-tab-${encodeURIComponent(path)}`;

export interface EditorTabBarProps {
  tabs: readonly EditorTab[];
  activePath: string | null;
  /** Files changed by NOVA (violet dot). */
  novaChanged: ReadonlySet<string>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function EditorTabBar({ tabs, activePath, novaChanged, onSelect, onClose }: EditorTabBarProps) {

  // Folder hint for tabs that share a file name ("index.ts – src/ui").
  const duplicates = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tabs) counts.set(fileName(t.path), (counts.get(fileName(t.path)) ?? 0) + 1);
    return counts;
  }, [tabs]);

  useEffect(() => {
    if (!activePath) return;
    document.getElementById(editorTabId(activePath))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activePath]);

  const focusTab = (path: string) => {
    onSelect(path);
    requestAnimationFrame(() => document.getElementById(editorTabId(path))?.focus());
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, path: string) => {
    const index = tabs.findIndex((t) => t.path === path);
    if (index < 0) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else if (e.key === 'Delete') {
      e.preventDefault();
      onClose(path);
      return;
    }
    if (next === null) return;
    e.preventDefault();
    focusTab(tabs[next].path);
  };

  if (tabs.length === 0) return null;

  return (
    <div role="tablist" aria-label="Geöffnete Dateien" className="flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden border-b border-border bg-surface [scrollbar-width:none]">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const name = fileName(tab.path);
        const dir = (duplicates.get(name) ?? 0) > 1 ? parentPath(tab.path) : '';
        const nova = novaChanged.has(tab.path);
        const states = [tab.dirty ? 'ungespeichert' : null, nova ? 'von NOVA geändert' : null, tab.status === 'error' ? 'konnte nicht geladen werden' : null].filter(Boolean);
        return (
          <div
            key={tab.path}
            role="presentation"
            className={cn(
              'group relative flex min-w-0 max-w-60 shrink-0 items-center border-r border-border transition-colors duration-150',
              active ? 'bg-bg text-text' : 'text-muted hover:bg-surface-2 hover:text-text',
            )}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(tab.path);
              }
            }}
          >
            {active && <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-nova-gradient" />}
            <button
              type="button"
              role="tab"
              id={editorTabId(tab.path)}
              aria-selected={active}
              aria-controls={EDITOR_PANEL_ID}
              aria-label={`${tab.path}${states.length ? ` (${states.join(', ')})` : ''}`}
              tabIndex={active ? 0 : -1}
              title={tab.path}
              onClick={() => onSelect(tab.path)}
              onKeyDown={(e) => onKeyDown(e, tab.path)}
              className="flex h-full min-w-0 items-center gap-1.5 pr-1 pl-3 text-[13px] focus-visible:outline-offset-[-2px]"
            >
              {tab.status === 'loading' ? (
                <Spinner size="sm" label={null} className="text-muted" />
              ) : tab.status === 'error' ? (
                <CircleAlert aria-hidden className="h-4 w-4 shrink-0 text-danger-fg" />
              ) : (
                <FileIcon name={name} />
              )}
              <span className={cn('truncate', tab.deleted && 'line-through decoration-danger/70', nova && 'text-violet-fg')}>{name}</span>
              {dir && <span className="truncate text-[11px] text-subtle">{dir}</span>}
              {nova && <span aria-hidden title="Von NOVA geändert" className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet" />}
            </button>
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${name} schließen${tab.dirty ? ' (ungespeicherte Änderungen)' : ''}`}
              title={tab.dirty ? 'Ungespeicherte Änderungen – schließen' : 'Schließen'}
              onClick={() => onClose(tab.path)}
              className="mr-1.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted transition-colors duration-150 hover:bg-surface-3 hover:text-text"
            >
              {tab.dirty ? (
                <>
                  <span aria-hidden className="h-2 w-2 rounded-full bg-text/80 group-hover:hidden" />
                  <X aria-hidden className="hidden h-3.5 w-3.5 group-hover:block" />
                </>
              ) : (
                <X aria-hidden className={cn('h-3.5 w-3.5', !active && 'opacity-0 group-hover:opacity-100')} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
