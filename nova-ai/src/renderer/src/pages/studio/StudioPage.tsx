// Studio (UI-SPEC §4) at /projects/:projectId/studio: file tree | editor tabs | panel with Suche, Änderungen,
// Prüfungen, Terminal and Vorschau (bottom or right, resizable). ?file=<path>&line=<n> opens a file at a line.
import './studio.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowDownToLine,
  ArrowRightToLine,
  Code,
  Eye,
  FileDiff,
  FlaskConical,
  FolderOpen,
  FolderX,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SaveAll,
  Search,
  SquareTerminal,
} from 'lucide-react';
import type { AnyNovaEvent } from '@shared/events';
import type { ProjectSummary } from '@shared/schemas';
import { Page } from '../../components/layout/Page';
import { Button, EmptyState, ErrorState, IconButton, LoadingState, tabId, tabPanelId } from '../../components/ui';
import { useMutation, useNovaEvent, useRpc, useStoredState, useSupports } from '../../hooks';
import { getBridge, isRpcError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { plural } from '../../lib/format';
import { paths } from '../../lib/paths';
import { toast } from '../../stores/toasts';
import { EditorPane } from './EditorPane';
import { FileTree } from './FileTree';
import { ChangesPanel, type ChangesFocusRequest } from './panels/ChangesPanel';
import { ChecksPanel } from './panels/ChecksPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import { SearchPanel } from './panels/SearchPanel';
import { TerminalPanel } from './panels/TerminalPanel';
import { PanelTabs, panelTabsMode, type PanelTabItem } from './PanelTabs';
import { Splitter } from './Splitter';
import { latestFailures, markersForFile, projectRelativePath } from './studio-utils';
import { useEditorTabs, type EditorTabsApi } from './useEditorTabs';
import { useElementSize } from './useElementSize';

export type StudioPanel = 'search' | 'changes' | 'checks' | 'terminal' | 'preview';
const PANELS: StudioPanel[] = ['search', 'changes', 'checks', 'terminal', 'preview'];
const PANEL_ID_BASE = 'studio-panel';

const TREE_DEFAULT = 260;
const TREE_MIN = 180;
const PANEL_HEIGHT_DEFAULT = 300;
const PANEL_HEIGHT_MIN = 140;
const PANEL_WIDTH_DEFAULT = 460;
const PANEL_WIDTH_MIN = 320;
const EDITOR_MIN_WIDTH = 360;
const EDITOR_MIN_HEIGHT = 160;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(min, max), Math.max(min, value));

function projectEvent(projectId: string) {
  return (e: AnyNovaEvent) => (e.type === 'project.updated' || e.type === 'project.removed') && e.payload.id === projectId;
}

export default function StudioPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = useRpc('projects.get', projectId ? { id: projectId } : null, {
    refetchOn: ['project.updated', 'project.removed'],
    eventFilter: projectEvent(projectId),
    keepPreviousData: true,
  });
  const editor = useEditorTabs(projectId);
  const projectReady = project.data?.id === projectId;

  // Changes by NOVA or other programs reach the open tabs (reload when clean, notice when there are unsaved edits).
  // The tree and the change lists refresh themselves through their own queries.
  const { handleFilesChanged } = editor;
  useNovaEvent('files.changed', (payload) => {
    if (payload.projectId === projectId) handleFilesChanged(payload.paths, payload.actor);
  });

  // Jump to ?file=&line= (links from failures, errors, findings). The parameters are removed afterwards so the
  // same link works again and a later visit does not jump a second time.
  const fileParam = searchParams.get('file');
  const lineParam = searchParams.get('line');
  const projectRoot = projectReady ? project.data?.path : undefined;
  const { open } = editor;
  useEffect(() => {
    if (!fileParam || projectRoot === undefined) return;
    const line = Number.parseInt(lineParam ?? '', 10);
    // Paths from error messages may be absolute, use Windows separators or start with "./".
    const path = projectRelativePath(fileParam, projectRoot);
    if (path) open(path, { line: Number.isFinite(line) && line > 0 ? line : null });
    else toast.warning('Die Datei liegt nicht im Projektordner', fileParam);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('file');
        next.delete('line');
        return next;
      },
      { replace: true },
    );
  }, [fileParam, lineParam, projectRoot, location.key, open, setSearchParams]);

  // Unsaved edits survive leaving the studio (in memory) – say so when leaving with unsaved files.
  const unsavedRef = useRef(0);
  unsavedRef.current = editor.unsavedCount;
  useEffect(
    () => () => {
      const count = unsavedRef.current;
      if (count > 0) {
        toast.info('Ungespeicherte Änderungen bleiben erhalten', `${plural(count, 'Datei hat', 'Dateien haben')} ungespeicherte Änderungen. Sie sind beim nächsten Öffnen des Studios wieder da, solange NOVA geöffnet bleibt.`);
      }
    },
    [projectId],
  );

  // A project removed while the studio is open turns into the not-found state (cached data is not shown).
  const missing = isRpcError(project.error, 'NOT_FOUND');
  if (!project.data || !projectReady || missing) {
    return (
      <Page title={missing ? 'Projekt nicht gefunden' : 'Studio'} back={{ to: paths.projects, label: 'Projekte' }}>
        {project.error && !project.loading ? (
          missing ? (
            <EmptyState
              icon={FolderX}
              title="Dieses Projekt gibt es nicht (mehr)"
              description="Es wurde vielleicht aus NOVA entfernt. Die Projektdateien selbst sind davon nicht betroffen."
              actions={<Button onClick={() => navigate(paths.projects)}>Zur Projektliste</Button>}
            />
          ) : (
            <ErrorState error={project.error} title="Das Projekt konnte nicht geladen werden" onRetry={() => void project.refetch()} />
          )
        ) : (
          <LoadingState label="Studio wird geladen …" />
        )}
      </Page>
    );
  }

  const p = project.data;
  return (
    <Page title="Studio" back={{ to: paths.project(p.id), label: p.name }} fullBleed>
      {p.pathMissing ? (
        <EmptyState
          icon={FolderX}
          title="Der Projektordner wurde nicht gefunden"
          description="Vielleicht wurde er verschoben oder umbenannt. In der Projektübersicht lässt er sich neu verknüpfen – danach funktioniert auch das Studio wieder."
          actions={
            <Button variant="primary" onClick={() => navigate(paths.project(p.id))}>
              Zur Projektübersicht
            </Button>
          }
        />
      ) : (
        <StudioWorkspace project={p} editor={editor} />
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------------------------------------------

interface StudioWorkspaceProps {
  project: ProjectSummary;
  editor: EditorTabsApi;
}

function StudioWorkspace({ project, editor }: StudioWorkspaceProps) {
  const projectId = project.id;
  const bodyRef = useRef<HTMLDivElement>(null);
  const size = useElementSize(bodyRef);

  // --- layout (remembered per user) ----------------------------------------------------------------------------
  const [treeVisible, setTreeVisible] = useStoredState('studio.treeVisible', true);
  // Sizes: null = automatic (proportional to the window) until the user drags a splitter.
  const [treeWidth, setTreeWidth] = useStoredState<number | null>('studio.treeWidth', null);
  const [panelVisible, setPanelVisible] = useStoredState('studio.panelVisible', true);
  const [panelPosition, setPanelPosition] = useStoredState<'bottom' | 'right'>('studio.panelPosition', 'bottom');
  const [panelHeight, setPanelHeight] = useStoredState<number | null>('studio.panelHeight', null);
  const [panelWidth, setPanelWidth] = useStoredState<number | null>('studio.panelWidth', null);
  const [storedPanel, setStoredPanel] = useStoredState<StudioPanel>('studio.panel', 'changes');
  const panel: StudioPanel = PANELS.includes(storedPanel) ? storedPanel : 'changes';
  const [mountedPanels, setMountedPanels] = useState<Set<StudioPanel>>(() => new Set([panel]));
  const [searchFocus, setSearchFocus] = useState(0);
  const [changesFocus, setChangesFocus] = useState<ChangesFocusRequest | null>(null);
  const cursorRef = useRef<{ line: number; column: number } | null>(null);

  const known = size.width > 0 && size.height > 0;
  const treeMax = known ? Math.max(TREE_MIN, Math.min(560, Math.floor(size.width * 0.4))) : 560;
  const treeAuto = known ? clamp(Math.round(size.width * 0.22), 200, TREE_DEFAULT + 20) : TREE_DEFAULT;
  const tree = clamp(treeWidth ?? treeAuto, TREE_MIN, treeMax);
  const mainWidth = known ? size.width - (treeVisible ? tree : 0) : 0;
  // A right panel needs room next to the editor; narrow windows fall back to the bottom.
  const right = panelPosition === 'right' && (!known || mainWidth >= PANEL_WIDTH_MIN + EDITOR_MIN_WIDTH);
  const panelWidthMax = known ? Math.max(PANEL_WIDTH_MIN, mainWidth - EDITOR_MIN_WIDTH) : 1200;
  const panelHeightMax = known ? Math.max(PANEL_HEIGHT_MIN, size.height - EDITOR_MIN_HEIGHT) : 900;
  const panelWidthAuto = known ? clamp(Math.round(mainWidth * 0.42), PANEL_WIDTH_MIN, 560) : PANEL_WIDTH_DEFAULT;
  const panelHeightAuto = known ? clamp(Math.round(size.height * 0.36), PANEL_HEIGHT_MIN, 340) : PANEL_HEIGHT_DEFAULT;
  const panelSize = right ? clamp(panelWidth ?? panelWidthAuto, PANEL_WIDTH_MIN, panelWidthMax) : clamp(panelHeight ?? panelHeightAuto, PANEL_HEIGHT_MIN, panelHeightMax);
  // Narrow panels show the tabs with labels only or with icons only, so all five tools stay visible.
  const tabsMode = panelTabsMode(known ? (right ? panelSize : mainWidth) : 0);

  const showPanel = useCallback(
    (id: StudioPanel) => {
      setStoredPanel(id);
      setPanelVisible(true);
      setMountedPanels((s) => (s.has(id) ? s : new Set(s).add(id)));
    },
    [setStoredPanel, setPanelVisible],
  );

  // --- data shared by tree, editor and panels -----------------------------------------------------------------
  const sameProject = (e: AnyNovaEvent) => (e.payload as { projectId?: unknown }).projectId === projectId;
  const changed = useRpc('files.changed', { projectId }, { refetchOn: ['files.changed'], eventFilter: sameProject, keepPreviousData: true });
  const checks = useRpc('checks.list', { projectId, limit: 50 }, { refetchOn: ['check.updated'], eventFilter: sameProject, keepPreviousData: true });
  const tasks = useRpc('tasks.list', { projectId, limit: 500 }, { refetchOn: ['task.updated', 'task.removed'], eventFilter: sameProject, keepPreviousData: true });
  const integrations = useRpc('integrations.list', undefined, { refetchOn: ['integrations.updated'] });
  const canOpenIntegrations = useSupports('integrations.open');
  const openVsCode = useMutation('integrations.open', { errorToast: 'Visual Studio Code konnte nicht geöffnet werden' });
  const openTerminal = useMutation('integrations.open', { errorToast: 'Das Windows Terminal konnte nicht geöffnet werden' });

  const novaChanged = useMemo(() => new Set((changed.data ?? []).filter((f) => f.byNova).map((f) => f.path)), [changed.data]);
  const dirtyPaths = useMemo(() => new Set(editor.tabs.filter((t) => t.dirty).map((t) => t.path)), [editor.tabs]);
  const failureCount = useMemo(() => latestFailures(checks.data ?? []).length, [checks.data]);
  const activePath = editor.activePath;
  const markers = useMemo(() => (activePath ? markersForFile(activePath, checks.data ?? [], tasks.data ?? []) : []), [activePath, checks.data, tasks.data]);

  const integration = (id: string) => (canOpenIntegrations ? integrations.data?.find((i) => i.id === id && i.available && i.canOpen) : undefined);
  const vscode = integration('vscode');
  const windowsTerminal = integration('windows_terminal');

  const openInVsCode = (path?: string | null, line?: number | null) =>
    void openVsCode.run({ id: 'vscode', projectId, ...(path ? { path } : {}), ...(path && line ? { line } : {}) });

  const { open } = editor;

  // --- keyboard shortcuts ---------------------------------------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (e.shiftKey && key === 'f') {
        e.preventDefault();
        showPanel('search');
        setSearchFocus((n) => n + 1);
      } else if (!e.shiftKey && key === 'j') {
        e.preventDefault();
        setPanelVisible(!panelVisible);
      } else if (!e.shiftKey && key === 'b') {
        e.preventDefault();
        setTreeVisible(!treeVisible);
      } else if (!e.shiftKey && (e.key === '`' || e.code === 'Backquote' || key === 'ö')) {
        // Strg+Ö on German keyboards (the key VS Code uses there), Strg+` elsewhere.
        e.preventDefault();
        showPanel('terminal');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showPanel, panelVisible, treeVisible, setPanelVisible, setTreeVisible]);

  const openAt = useCallback((path: string, line?: number, column?: number) => open(path, { line: line ?? null, column: column ?? null }), [open]);

  const showChanges = useCallback(
    (path: string) => {
      setChangesFocus({ path, token: Date.now() });
      showPanel('changes');
    },
    [showPanel],
  );

  const saveAll = async () => {
    let conflicts = 0;
    for (const t of editor.tabs.filter((x) => x.dirty)) {
      const result = await editor.save(t.path);
      if (result === 'conflict') conflicts++;
    }
    if (conflicts > 0) {
      toast.warning(
        conflicts === 1 ? 'Eine Datei wurde nicht gespeichert' : `${conflicts} Dateien wurden nicht gespeichert`,
        'Sie wurden inzwischen geändert (z. B. von NOVA). Der Hinweis im Editor zeigt, wie es weitergeht.',
      );
    }
  };

  const openFolder = async () => {
    const ok = await getBridge()
      ?.app.openPath(project.path)
      .catch(() => false);
    if (!ok) toast.error('Ordner konnte nicht geöffnet werden', 'Der Projektordner existiert nicht oder ist nicht erreichbar.');
  };

  const tabItems: Array<PanelTabItem<StudioPanel>> = [
    { id: 'search', label: 'Suche', icon: Search },
    { id: 'changes', label: 'Änderungen', icon: FileDiff, count: novaChanged.size },
    { id: 'checks', label: 'Prüfungen', icon: FlaskConical, count: failureCount, countTone: 'danger' },
    { id: 'terminal', label: 'Terminal', icon: SquareTerminal },
    { id: 'preview', label: 'Vorschau', icon: Eye },
  ];

  const PanelToggleIcon = right ? (panelVisible ? PanelRightClose : PanelRightOpen) : panelVisible ? PanelBottomClose : PanelBottomOpen;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Studio toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-border bg-surface px-2">
        <IconButton
          icon={treeVisible ? PanelLeftClose : PanelLeftOpen}
          label={treeVisible ? 'Dateibaum ausblenden (Strg+B)' : 'Dateibaum einblenden (Strg+B)'}
          size="sm"
          aria-pressed={treeVisible}
          onClick={() => setTreeVisible(!treeVisible)}
        />
        <span className="min-w-0 truncate font-mono text-xs text-muted" title={project.path}>
          {project.path}
        </span>
        <IconButton icon={FolderOpen} label="Projektordner im Explorer öffnen" size="sm" onClick={() => void openFolder()} />
        {editor.unsavedCount > 0 && (
          <span className="ml-1 flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-warning-fg" role="status">
              {plural(editor.unsavedCount, 'ungespeicherte Datei', 'ungespeicherte Dateien')}
            </span>
            {editor.unsavedCount > 1 && (
              <Button size="sm" variant="ghost" icon={SaveAll} onClick={() => void saveAll()} title="Alle speichern (Strg+Umschalt+S)">
                Alle speichern
              </Button>
            )}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {vscode && (
            <Button
              size="sm"
              variant="ghost"
              icon={Code}
              loading={openVsCode.loading}
              title={activePath ? `${activePath} in Visual Studio Code öffnen` : 'Projekt in Visual Studio Code öffnen'}
              onClick={() => openInVsCode(activePath, cursorRef.current?.line)}
            >
              In VS Code öffnen
            </Button>
          )}
          {windowsTerminal && (
            <Button
              size="sm"
              variant="ghost"
              icon={SquareTerminal}
              loading={openTerminal.loading}
              title="Projektordner im Windows Terminal öffnen"
              onClick={() => void openTerminal.run({ id: 'windows_terminal', projectId })}
            >
              Windows Terminal
            </Button>
          )}
          <IconButton
            icon={PanelToggleIcon}
            label={panelVisible ? 'Werkzeugbereich ausblenden (Strg+J)' : 'Werkzeugbereich einblenden (Strg+J)'}
            size="sm"
            aria-pressed={panelVisible}
            onClick={() => setPanelVisible(!panelVisible)}
          />
        </div>
      </div>

      <div ref={bodyRef} className="flex min-h-0 flex-1">
        {treeVisible && (
          <>
            <div style={{ width: tree }} className="min-h-0 shrink-0">
              <FileTree
                projectId={projectId}
                projectRoot={project.path}
                activePath={activePath}
                dirtyPaths={dirtyPaths}
                onOpen={(path) => open(path)}
                onRenamed={editor.handleRenamed}
                onDeleted={editor.handleDeleted}
                onOpenInVsCode={vscode ? (path) => openInVsCode(path) : undefined}
              />
            </div>
            <Splitter orientation="vertical" side="start" value={tree} min={TREE_MIN} max={treeMax} defaultValue={treeAuto} onChange={setTreeWidth} label="Breite des Dateibaums" />
          </>
        )}

        <div className={cn('flex min-h-0 min-w-0 flex-1', right ? 'flex-row' : 'flex-col')}>
          <div className="min-h-0 min-w-0 flex-1">
            <EditorPane
              projectId={projectId}
              projectRoot={project.path}
              editor={editor}
              novaChanged={novaChanged}
              markers={markers}
              onShowChanges={showChanges}
              onCursorChange={(line, column) => {
                cursorRef.current = { line, column };
              }}
            />
          </div>
          {panelVisible && (
            <Splitter
              orientation={right ? 'vertical' : 'horizontal'}
              side="end"
              value={panelSize}
              min={right ? PANEL_WIDTH_MIN : PANEL_HEIGHT_MIN}
              max={right ? panelWidthMax : panelHeightMax}
              defaultValue={right ? panelWidthAuto : panelHeightAuto}
              onChange={right ? setPanelWidth : setPanelHeight}
              label={right ? 'Breite des Werkzeugbereichs' : 'Höhe des Werkzeugbereichs'}
            />
          )}
          <section
            aria-label="Werkzeugbereich"
            style={right ? { width: panelSize } : { height: panelSize }}
            className={cn('flex min-h-0 min-w-0 shrink-0 flex-col bg-surface', !panelVisible && 'hidden')}
          >
            <div className="flex shrink-0 items-end border-b border-border">
              <PanelTabs label="Werkzeuge" idBase={PANEL_ID_BASE} items={tabItems} value={panel} onChange={showPanel} mode={tabsMode} className="min-w-0 flex-1 px-1" />
              <div className="flex shrink-0 items-center gap-0.5 self-center pr-1">
                <IconButton
                  icon={right ? ArrowDownToLine : ArrowRightToLine}
                  label={right ? 'Werkzeugbereich unten anzeigen' : 'Werkzeugbereich rechts anzeigen'}
                  size="sm"
                  onClick={() => setPanelPosition(right ? 'bottom' : 'right')}
                  disabled={!right && known && mainWidth < PANEL_WIDTH_MIN + EDITOR_MIN_WIDTH}
                />
                <IconButton icon={PanelToggleIcon} label="Werkzeugbereich ausblenden (Strg+J)" size="sm" onClick={() => setPanelVisible(false)} />
              </div>
            </div>
            <div className="relative min-h-0 flex-1">
              {PANELS.filter((id) => mountedPanels.has(id) || id === panel).map((id) => (
                <div
                  key={id}
                  role="tabpanel"
                  id={tabPanelId(PANEL_ID_BASE, id)}
                  aria-labelledby={tabId(PANEL_ID_BASE, id)}
                  hidden={id !== panel}
                  className="absolute inset-0 flex min-h-0 flex-col bg-bg"
                >
                  {id === 'search' && <SearchPanel projectId={projectId} onOpen={openAt} focusToken={searchFocus} />}
                  {id === 'changes' && (
                    <ChangesPanel projectId={projectId} changed={changed} tasks={tasks.data ?? []} onOpenFile={(path) => open(path)} focusRequest={changesFocus} stacked={right} />
                  )}
                  {id === 'checks' && <ChecksPanel projectId={projectId} projectRoot={project.path} commands={project.config.commands} runs={checks} onOpen={openAt} />}
                  {id === 'terminal' && <TerminalPanel projectId={projectId} projectRoot={project.path} active={panelVisible && panel === 'terminal'} />}
                  {id === 'preview' && <PreviewPanel projectId={projectId} projectKind={project.kind} integrations={integrations.data} />}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
