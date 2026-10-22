// Lazy-loading project file tree: NOVA-changed files get a violet dot, git status letters, context menu with
// file operations, full keyboard support (tree pattern) and live refresh on files.changed.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import {
  ChevronRight,
  ChevronsDownUp,
  Code,
  Copy,
  Ellipsis,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderTree,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { FileNode } from '@shared/schemas';
import { copyToClipboard, EmptyState, ErrorState, IconButton, LoadingState, Spinner } from '../../components/ui';
import { useNovaEvent, useRpc } from '../../hooks';
import { api, errorMessage, getBridge } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { toneClasses } from '../../lib/labels';
import { toast } from '../../stores/toasts';
import { ContextMenu, type ContextMenuEntry } from './ContextMenu';
import { EntryDialogs, type EntryAction } from './EntryDialogs';
import { FileIcon } from './FileIcon';
import { absolutePath, ancestorPaths, childrenOf, findNode, gitStatusInfo, parentPath, visibleRows, type VisibleTreeRow } from './studio-utils';

export interface FileTreeProps {
  projectId: string;
  /** Absolute project folder (Explorer, copy path). */
  projectRoot: string;
  activePath: string | null;
  /** Paths with unsaved changes. */
  dirtyPaths: ReadonlySet<string>;
  onOpen: (path: string) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
  /** "In VS Code öffnen" (only when the integration can open files). */
  onOpenInVsCode?: (path: string) => void;
}

const EXPANDED_KEY = (projectId: string) => `nova.studio.expanded.${projectId}`;

function readExpanded(projectId: string): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(EXPANDED_KEY(projectId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string').slice(0, 300) : []);
  } catch {
    return new Set();
  }
}

function writeExpanded(projectId: string, expanded: ReadonlySet<string>): void {
  try {
    globalThis.localStorage?.setItem(EXPANDED_KEY(projectId), JSON.stringify([...expanded]));
  } catch {
    /* storage unavailable */
  }
}

const rowId = (projectId: string, path: string) => `tree-${projectId}-${encodeURIComponent(path || '.')}`;

export function FileTree({ projectId, projectRoot, activePath, dirtyPaths, onOpen, onRenamed, onDeleted, onOpenInVsCode }: FileTreeProps) {
  const tree = useRpc('files.tree', { projectId, path: '', depth: 2 }, {
    refetchOn: ['files.changed'],
    eventFilter: (e) => e.type === 'files.changed' && e.payload.projectId === projectId,
    keepPreviousData: true,
  });
  const root = tree.data ?? null;
  const [loaded, setLoaded] = useState<Map<string, FileNode[]>>(() => new Map());
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded(projectId));
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null; anchor: HTMLElement | null } | null>(null);
  const [action, setAction] = useState<EntryAction | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const rootRef = useRef(root);
  rootRef.current = root;

  // Reset per project.
  useEffect(() => {
    setLoaded(new Map());
    setExpanded(readExpanded(projectId));
    setFocused(null);
  }, [projectId]);

  useEffect(() => writeExpanded(projectId, expanded), [projectId, expanded]);

  const loadDir = useCallback(
    async (path: string): Promise<FileNode[] | null> => {
      setLoadingDirs((s) => new Set(s).add(path));
      try {
        const node = await api('files.tree', { projectId, path, depth: 1 });
        const children = node.children ?? [];
        // Update the ref right away: the reveal logic loads several levels in a row before re-rendering.
        loadedRef.current = new Map(loadedRef.current).set(path, children);
        setLoaded((m) => new Map(m).set(path, children));
        return children;
      } catch (e) {
        toast.error('Ordner konnte nicht geladen werden', errorMessage(e));
        return null;
      } finally {
        setLoadingDirs((s) => {
          const next = new Set(s);
          next.delete(path);
          return next;
        });
      }
    },
    [projectId],
  );

  const childrenKnown = useCallback((path: string) => childrenOf(rootRef.current, loadedRef.current, path) !== null, []);

  const toggle = useCallback(
    (node: FileNode, open?: boolean) => {
      if (node.type !== 'dir') return;
      const isOpen = expandedRef.current.has(node.path);
      const next = open ?? !isOpen;
      if (next === isOpen) return;
      setExpanded((s) => {
        const copy = new Set(s);
        if (next) copy.add(node.path);
        else copy.delete(node.path);
        return copy;
      });
      if (next && !childrenKnown(node.path)) void loadDir(node.path);
    },
    [childrenKnown, loadDir],
  );

  // Lazily loaded folders are re-read after file changes (open ones now, closed ones on the next expand).
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshLoaded = useCallback(() => {
    const open = [...loadedRef.current.keys()].filter((p) => expandedRef.current.has(p));
    setLoaded((m) => {
      const next = new Map<string, FileNode[]>();
      for (const [k, v] of m) if (expandedRef.current.has(k)) next.set(k, v);
      return next;
    });
    for (const p of open) void loadDir(p);
  }, [loadDir]);

  useNovaEvent('files.changed', (payload) => {
    if (payload.projectId !== projectId) return;
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(refreshLoaded, 300);
  });
  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const refresh = useCallback(() => {
    void tree.refetch();
    refreshLoaded();
  }, [tree, refreshLoaded]);

  // Reveal the active file: expand its folders (loading them if necessary) and scroll it into view.
  useEffect(() => {
    if (!activePath || !root) return;
    let cancelled = false;
    void (async () => {
      const ancestors = ancestorPaths(activePath);
      const missing = ancestors.filter((a) => !expandedRef.current.has(a));
      if (missing.length) setExpanded((s) => new Set([...s, ...missing]));
      for (const dir of ancestors) {
        if (cancelled) return;
        if (!childrenKnown(dir) && childrenKnown(parentPath(dir))) await loadDir(dir);
      }
      if (cancelled) return;
      requestAnimationFrame(() => {
        document.getElementById(rowId(projectId, activePath))?.scrollIntoView?.({ block: 'nearest' });
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [activePath, root, projectId, childrenKnown, loadDir]);

  const rows = useMemo(() => visibleRows(root, loaded, expanded), [root, loaded, expanded]);
  const focusPath = focused && rows.some((r) => r.node.path === focused) ? focused : (activePath && rows.some((r) => r.node.path === activePath) ? activePath : rows[0]?.node.path ?? null);

  const focusRow = (path: string) => {
    setFocused(path);
    requestAnimationFrame(() => document.getElementById(rowId(projectId, path))?.focus());
  };

  const openMenu = (node: FileNode | null, x: number, y: number, anchor: HTMLElement | null) => setMenu({ x, y, node, anchor });

  const activate = (row: VisibleTreeRow) => {
    if (row.node.type === 'dir') toggle(row.node);
    else onOpen(row.node.path);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return;
    const index = Math.max(0, rows.findIndex((r) => r.node.path === focusPath));
    const row = rows[index];
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusRow(rows[Math.min(rows.length - 1, index + 1)].node.path);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusRow(rows[Math.max(0, index - 1)].node.path);
        break;
      case 'Home':
        e.preventDefault();
        focusRow(rows[0].node.path);
        break;
      case 'End':
        e.preventDefault();
        focusRow(rows[rows.length - 1].node.path);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.node.type === 'dir') {
          if (!row.expanded) toggle(row.node, true);
          else if (rows[index + 1]?.parent === row.node.path) focusRow(rows[index + 1].node.path);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.node.type === 'dir' && row.expanded) toggle(row.node, false);
        else if (row.parent !== null) focusRow(row.parent);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        activate(row);
        break;
      case 'F2':
        e.preventDefault();
        setAction({ kind: 'rename', path: row.node.path, type: row.node.type });
        break;
      case 'Delete':
        e.preventDefault();
        setAction({ kind: 'delete', path: row.node.path, type: row.node.type });
        break;
      case 'ContextMenu':
      case 'F10': {
        if (e.key === 'F10' && !e.shiftKey) break;
        e.preventDefault();
        const el = document.getElementById(rowId(projectId, row.node.path));
        const rect = el?.getBoundingClientRect();
        openMenu(row.node, (rect?.left ?? 0) + 24, (rect?.bottom ?? 0) + 2, el);
        break;
      }
      default:
        break;
    }
  };

  const showInExplorer = async (path: string) => {
    const ok = await getBridge()?.app.showInFolder(absolutePath(projectRoot, path));
    if (!ok) toast.error('Konnte den Explorer nicht öffnen', 'Der Pfad wurde nicht gefunden.');
  };

  const copyPath = async (path: string) => {
    const ok = await copyToClipboard(path);
    if (ok) toast.success('Pfad kopiert', path);
    else toast.error('Kopieren nicht möglich');
  };

  const menuEntries = (node: FileNode | null): ContextMenuEntry[] => {
    if (!node) {
      return [
        { type: 'item', id: 'new-file', label: 'Neue Datei …', icon: FilePlus, onSelect: () => setAction({ kind: 'newFile', dir: '' }) },
        { type: 'item', id: 'new-folder', label: 'Neuer Ordner …', icon: FolderPlus, onSelect: () => setAction({ kind: 'newFolder', dir: '' }) },
        { type: 'separator', id: 's1' },
        { type: 'item', id: 'refresh', label: 'Aktualisieren', icon: RefreshCw, onSelect: refresh },
        { type: 'item', id: 'explorer', label: 'Im Explorer zeigen', icon: FolderOpen, onSelect: () => void showInExplorer('') },
      ];
    }
    const entries: ContextMenuEntry[] = [];
    if (node.type === 'dir') {
      entries.push(
        { type: 'item', id: 'new-file', label: 'Neue Datei …', icon: FilePlus, onSelect: () => setAction({ kind: 'newFile', dir: node.path }) },
        { type: 'item', id: 'new-folder', label: 'Neuer Ordner …', icon: FolderPlus, onSelect: () => setAction({ kind: 'newFolder', dir: node.path }) },
      );
    } else {
      entries.push({ type: 'item', id: 'open', label: 'Öffnen', icon: Code, onSelect: () => onOpen(node.path) });
    }
    entries.push(
      { type: 'separator', id: 's1' },
      { type: 'item', id: 'rename', label: 'Umbenennen …', icon: Pencil, shortcut: 'F2', onSelect: () => setAction({ kind: 'rename', path: node.path, type: node.type }) },
      { type: 'item', id: 'delete', label: 'Löschen …', icon: Trash2, shortcut: 'Entf', danger: true, onSelect: () => setAction({ kind: 'delete', path: node.path, type: node.type }) },
      { type: 'separator', id: 's2' },
      { type: 'item', id: 'copy', label: 'Pfad kopieren', icon: Copy, onSelect: () => void copyPath(node.path) },
      { type: 'item', id: 'explorer', label: 'Im Explorer zeigen', icon: FolderOpen, onSelect: () => void showInExplorer(node.path) },
    );
    if (node.type === 'file' && onOpenInVsCode) entries.push({ type: 'item', id: 'vscode', label: 'In VS Code öffnen', icon: Code, onSelect: () => onOpenInVsCode(node.path) });
    return entries;
  };

  const collapseAll = () => setExpanded(new Set());

  let body;
  if (!root && tree.error) body = <ErrorState compact error={tree.error} title="Die Dateien konnten nicht geladen werden" onRetry={() => void tree.refetch()} />;
  else if (!root) body = <LoadingState compact label="Dateien werden geladen …" />;
  else if (rows.length === 0)
    body = (
      <EmptyState
        compact
        icon={FolderTree}
        title="Der Projektordner ist leer"
        description="Neue Dateien lassen sich hier anlegen – oder NOVA legt sie bei der Arbeit an."
        actions={
          <IconButton icon={FilePlus} label="Neue Datei anlegen" variant="secondary" size="sm" onClick={() => setAction({ kind: 'newFile', dir: '' })} />
        }
      />
    );
  else
    body = (
      <div
        ref={treeRef}
        role="tree"
        aria-label="Projektdateien"
        onKeyDown={onKeyDown}
        className="py-1"
      >
        {rows.map((row, i) => (
          <TreeRow
            key={row.node.path}
            projectId={projectId}
            row={row}
            posinset={i}
            active={row.node.path === activePath}
            focusable={row.node.path === focusPath}
            dirty={dirtyPaths.has(row.node.path)}
            loading={loadingDirs.has(row.node.path)}
            onClick={() => {
              setFocused(row.node.path);
              activate(row);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setFocused(row.node.path);
              openMenu(row.node, e.clientX, e.clientY, e.currentTarget);
            }}
            onMenuButton={(el) => {
              setFocused(row.node.path);
              const rect = el.getBoundingClientRect();
              openMenu(row.node, rect.left, rect.bottom + 2, el);
            }}
          />
        ))}
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border pr-1 pl-3">
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-wide text-muted uppercase">Dateien</h2>
        {tree.refreshing && root && <Spinner size="xs" label="Wird aktualisiert" className="mr-1 text-muted" />}
        <IconButton icon={FilePlus} label="Neue Datei" size="sm" onClick={() => setAction({ kind: 'newFile', dir: menuDirFor(focusPath, root, loaded) })} />
        <IconButton icon={FolderPlus} label="Neuer Ordner" size="sm" onClick={() => setAction({ kind: 'newFolder', dir: menuDirFor(focusPath, root, loaded) })} />
        <IconButton icon={RefreshCw} label="Dateien aktualisieren" size="sm" onClick={refresh} />
        <IconButton icon={ChevronsDownUp} label="Alle Ordner einklappen" size="sm" onClick={collapseAll} disabled={expanded.size === 0} />
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        onContextMenu={(e) => {
          if (e.defaultPrevented) return;
          e.preventDefault();
          openMenu(null, e.clientX, e.clientY, null);
        }}
      >
        {body}
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.node ? `Aktionen für ${menu.node.name}` : 'Aktionen für den Projektordner'}
          entries={menuEntries(menu.node)}
          onClose={() => setMenu(null)}
          returnFocus={menu.anchor}
        />
      )}
      <EntryDialogs
        projectId={projectId}
        action={action}
        onClose={() => setAction(null)}
        onCreatedFile={(path) => {
          refresh();
          onOpen(path);
        }}
        onCreatedFolder={(path) => {
          setExpanded((s) => new Set([...s, ...ancestorPaths(path), path]));
          refresh();
        }}
        onRenamed={(from, to) => {
          setExpanded((s) => new Set([...s].map((p) => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p))));
          refresh();
          onRenamed(from, to);
        }}
        onDeleted={(path) => {
          refresh();
          onDeleted(path);
        }}
      />
    </div>
  );
}

/** Folder in which "Neue Datei" creates the entry: the focused folder, or the folder of the focused file. */
function menuDirFor(focusPath: string | null, root: FileNode | null, loaded: ReadonlyMap<string, FileNode[]>): string {
  if (!focusPath) return '';
  const node = findNode(root, focusPath, loaded);
  if (!node) return '';
  return node.type === 'dir' ? node.path : parentPath(node.path);
}

interface TreeRowProps {
  projectId: string;
  row: VisibleTreeRow;
  posinset: number;
  active: boolean;
  focusable: boolean;
  dirty: boolean;
  loading: boolean;
  onClick: () => void;
  onContextMenu: (e: MouseEvent<HTMLDivElement>) => void;
  onMenuButton: (el: HTMLElement) => void;
}

function TreeRow({ projectId, row, active, focusable, dirty, loading, onClick, onContextMenu, onMenuButton }: TreeRowProps) {
  const { node, level, expanded } = row;
  const git = gitStatusInfo(node.gitStatus);
  const isDir = node.type === 'dir';
  const descriptions = [
    node.changedByNova ? (isDir ? 'enthält von NOVA geänderte Dateien' : 'von NOVA geändert') : null,
    git ? git.label : null,
    dirty ? 'ungespeichert' : null,
  ].filter(Boolean);
  return (
    <div
      id={rowId(projectId, node.path)}
      role="treeitem"
      aria-level={level}
      aria-expanded={isDir ? expanded : undefined}
      aria-selected={active}
      aria-busy={loading || undefined}
      aria-label={`${node.name}${descriptions.length ? ` – ${descriptions.join(', ')}` : ''}`}
      tabIndex={focusable ? 0 : -1}
      title={`${node.path}${node.size != null && !isDir ? ` · ${formatBytes(node.size)}` : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={cn(
        'group flex h-[26px] cursor-pointer items-center gap-1 pr-1 text-[13px] select-none focus-visible:outline-offset-[-2px]',
        active ? 'bg-violet/14 text-text' : 'text-text/90 hover:bg-surface-2',
      )}
      style={{ paddingLeft: 6 + (level - 1) * 14 }}
    >
      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-subtle" aria-hidden>
        {isDir ? loading ? <Spinner size="xs" label={null} /> : <ChevronRight className={cn('h-3.5 w-3.5 transition-transform duration-150', expanded && 'rotate-90')} /> : null}
      </span>
      <FileIcon name={node.name} type={node.type} open={expanded} />
      <span className={cn('min-w-0 flex-1 truncate', node.changedByNova && !isDir && 'text-violet-fg')}>{node.name}</span>
      {dirty && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-text/80" title="Ungespeicherte Änderungen" />}
      {node.changedByNova && (
        <span
          aria-hidden
          title={isDir ? 'Enthält von NOVA geänderte Dateien' : 'Von NOVA geändert'}
          className={cn('shrink-0 rounded-full bg-violet', isDir ? 'h-1.5 w-1.5 opacity-70' : 'h-2 w-2 shadow-[0_0_6px] shadow-violet/70')}
        />
      )}
      {git && (
        <span aria-hidden title={git.label} className={cn('w-3 shrink-0 text-center font-mono text-[11px] font-semibold', toneClasses[git.tone].text)}>
          {git.letter}
        </span>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label={`Aktionen für ${node.name}`}
        title="Aktionen"
        onClick={(e) => {
          e.stopPropagation();
          onMenuButton(e.currentTarget);
        }}
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-muted group-hover:inline-flex hover:bg-surface-3 hover:text-text"
      >
        <Ellipsis aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
