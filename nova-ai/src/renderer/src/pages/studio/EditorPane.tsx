// Center of the studio: tab strip, info bar (path, NOVA badge, cursor, save), notices (read-only, changed on disk,
// deleted) and the Monaco editor. Owns saving (Strg+S) incl. conflict handling: reload, compare or overwrite.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bot, ChevronRight, Code, FileWarning, FolderOpen, GitCompareArrows, Lock, RefreshCw, Save, TriangleAlert, Upload, X } from 'lucide-react';
import { Badge, Button, Dialog, EmptyState, ErrorState, IconButton, LoadingState } from '../../components/ui';
import { api, errorMessage, getBridge, isRpcError } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/format';
import { toast } from '../../stores/toasts';
import { CodeEditor } from './CodeEditor';
import { DiffView } from './DiffView';
import { EDITOR_PANEL_ID, EditorTabBar, editorTabId } from './EditorTabBar';
import { absolutePath, fileName, languageForPath, languageLabel, MAX_EDITABLE_BYTES, type EditorMarker } from './studio-utils';
import { isReadOnly, type ChangeActor, type EditorTab, type EditorTabsApi } from './useEditorTabs';
import { useMonacoReady } from './useMonacoReady';

export interface EditorPaneProps {
  projectId: string;
  projectRoot: string;
  editor: EditorTabsApi;
  /** Files changed by NOVA (badge + tab marker). */
  novaChanged: ReadonlySet<string>;
  /** Markers (check failures, review findings) of the active file. */
  markers: readonly EditorMarker[];
  /** "Änderungen ansehen": show the file in the changes panel. */
  onShowChanges: (path: string) => void;
  /** Cursor of the active file (for "In VS Code öffnen" at the same line). */
  onCursorChange?: (line: number, column: number) => void;
}

/** True for `ms` milliseconds after `ts` (re-renders when it expires). */
function useRecent(ts: number | null | undefined, ms: number): boolean {
  const [, force] = useState(0);
  const recent = ts != null && Date.now() - ts < ms;
  useEffect(() => {
    if (ts == null) return;
    const left = ms - (Date.now() - ts);
    if (left <= 0) return;
    const timer = setTimeout(() => force((n) => n + 1), left + 20);
    return () => clearTimeout(timer);
  }, [ts, ms]);
  return recent;
}

function actorText(actor: ChangeActor | null): string {
  if (actor === 'nova') return 'NOVA hat diese Datei geändert';
  if (actor === 'external') return 'Die Datei wurde von einem anderen Programm geändert';
  return 'Die Datei wurde inzwischen geändert';
}

export function EditorPane({ projectId, projectRoot, editor, novaChanged, markers, onShowChanges, onCursorChange }: EditorPaneProps) {
  const { monaco, error: monacoError, retry: retryMonaco } = useMonacoReady();
  const [closeRequest, setCloseRequest] = useState<string | null>(null);
  const [conflictPath, setConflictPath] = useState<string | null>(null);
  const [comparePath, setComparePath] = useState<string | null>(null);
  const [overwriting, setOverwriting] = useState(false);
  const [cursor, setCursor] = useState<{ line: number; column: number } | null>(null);
  const active = editor.active;
  const editorRef = useRef(editor);
  editorRef.current = editor;

  useEffect(() => setCursor(null), [editor.activePath]);

  const save = useCallback(async (path?: string | null) => {
    const target = path ?? editorRef.current.activePath;
    if (!target) return 'unchanged' as const;
    const result = await editorRef.current.save(target);
    if (result === 'conflict') setConflictPath(target);
    return result;
  }, []);

  /** Saves the editor content over whatever is on disk now (explicit user decision). */
  const overwrite = useCallback(async (path: string) => {
    setOverwriting(true);
    try {
      let diskHash: string | null = null;
      try {
        diskHash = (await api('files.read', { projectId, path })).hash;
      } catch (e) {
        if (!isRpcError(e, 'NOT_FOUND')) throw e;
      }
      const ok = await editorRef.current.overwrite(path, diskHash);
      if (ok) {
        toast.success('Gespeichert', `Die eigene Version von ${fileName(path)} wurde gespeichert.`);
        return true;
      }
      setConflictPath(path);
      return false;
    } catch (e) {
      toast.error('Speichern fehlgeschlagen', errorMessage(e));
      return false;
    } finally {
      setOverwriting(false);
    }
  }, [projectId]);

  const reload = useCallback(async (path: string) => {
    await editorRef.current.reload(path);
  }, []);

  // Strg+S anywhere in the studio (the editor itself handles it while it has the focus).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (e.shiftKey) {
        for (const t of editorRef.current.tabs) if (t.dirty) void save(t.path);
      } else {
        void save();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [save]);

  const requestClose = (path: string) => {
    if (!editor.close(path)) setCloseRequest(path);
  };

  const showInExplorer = async (path: string) => {
    const ok = await getBridge()
      ?.app.showInFolder(absolutePath(projectRoot, path))
      .catch(() => false);
    if (!ok) toast.error('Konnte den Explorer nicht öffnen', 'Der Pfad wurde nicht gefunden.');
  };

  const closeTab = closeRequest ? editor.tabs.find((t) => t.path === closeRequest) : undefined;

  return (
    <div className="@container flex h-full min-h-0 min-w-0 flex-col bg-bg">
      <EditorTabBar tabs={editor.tabs} activePath={editor.activePath} novaChanged={novaChanged} onSelect={editor.setActive} onClose={requestClose} />
      {active ? (
        <div id={EDITOR_PANEL_ID} role="tabpanel" aria-labelledby={editorTabId(active.path)} className="flex min-h-0 flex-1 flex-col">
          <InfoBar
            tab={active}
            nova={novaChanged.has(active.path)}
            cursor={cursor}
            onSave={() => void save(active.path)}
            onShowChanges={() => onShowChanges(active.path)}
            onShowInExplorer={() => void showInExplorer(active.path)}
          />
          <TabNotices
            tab={active}
            busy={overwriting}
            onReload={() => void reload(active.path)}
            onCompare={() => setComparePath(active.path)}
            onOverwrite={() => void overwrite(active.path)}
            onSave={() => void save(active.path)}
            onClose={() => editor.forceClose(active.path)}
          />
          <div className="relative min-h-0 flex-1">
            {active.status === 'loading' ? (
              <LoadingState label="Datei wird geladen …" />
            ) : active.status === 'error' ? (
              <ErrorState
                error={active.error ?? 'Unbekannter Fehler'}
                title="Die Datei konnte nicht geöffnet werden"
                onRetry={() => void reload(active.path)}
              />
            ) : active.encoding === 'binary' ? (
              <EmptyState
                icon={FileWarning}
                title="Diese Datei kann im Editor nicht angezeigt werden"
                description={`„${fileName(active.path)}“ ist keine Textdatei (z. B. ein Bild oder eine kompilierte Datei, ${formatBytes(active.size)}).`}
                actions={
                  <Button icon={FolderOpen} onClick={() => void showInExplorer(active.path)}>
                    Im Explorer zeigen
                  </Button>
                }
              />
            ) : monacoError ? (
              <ErrorState error={monacoError} title="Der Editor konnte nicht geladen werden" onRetry={retryMonaco} />
            ) : !monaco ? (
              <LoadingState label="Editor wird geladen …" />
            ) : (
              <CodeEditor
                projectId={projectId}
                path={active.path}
                language={active.language}
                initialContent={active.initialContent}
                readOnly={isReadOnly(active)}
                reveal={editor.reveal}
                markers={markers}
                onChange={editor.handleChange}
                onSave={() => void save(active.path)}
                onCursorChange={(line, column) => {
                  setCursor({ line, column });
                  onCursorChange?.(line, column);
                }}
              />
            )}
          </div>
        </div>
      ) : (
        <Welcome hasTabs={editor.tabs.length > 0} />
      )}

      {closeTab && (
        <Dialog
          open
          onClose={() => setCloseRequest(null)}
          title={`Änderungen an „${fileName(closeTab.path)}“ speichern?`}
          description="Ohne Speichern gehen die Änderungen in dieser Datei verloren."
          icon={Save}
          tone="warning"
          size="sm"
          footer={
            <>
              <Button onClick={() => setCloseRequest(null)}>Abbrechen</Button>
              <Button
                variant="danger"
                onClick={() => {
                  editor.forceClose(closeTab.path);
                  setCloseRequest(null);
                }}
              >
                Nicht speichern
              </Button>
              <Button
                variant="primary"
                icon={Save}
                loading={closeTab.saving}
                disabled={isReadOnly(closeTab)}
                onClick={async () => {
                  const result = await save(closeTab.path);
                  if (result === 'saved' || result === 'unchanged') {
                    editor.forceClose(closeTab.path);
                    setCloseRequest(null);
                  } else if (result === 'conflict') {
                    setCloseRequest(null);
                  }
                }}
              >
                Speichern
              </Button>
            </>
          }
        />
      )}

      {conflictPath && (
        <ConflictDialog
          path={conflictPath}
          busy={overwriting}
          onCancel={() => setConflictPath(null)}
          onCompare={() => {
            setComparePath(conflictPath);
            setConflictPath(null);
          }}
          onReload={async () => {
            await reload(conflictPath);
            setConflictPath(null);
          }}
          onOverwrite={async () => {
            const path = conflictPath;
            setConflictPath(null);
            await overwrite(path);
          }}
        />
      )}

      {comparePath && (
        <CompareDialog
          projectId={projectId}
          path={comparePath}
          mine={editor.getContent(comparePath)}
          language={editor.tabs.find((t) => t.path === comparePath)?.language ?? languageForPath(comparePath)}
          busy={overwriting}
          onClose={() => setComparePath(null)}
          onReload={async () => {
            await reload(comparePath);
            setComparePath(null);
          }}
          onOverwrite={async () => {
            const ok = await overwrite(comparePath);
            if (ok) setComparePath(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

interface InfoBarProps {
  tab: EditorTab;
  nova: boolean;
  cursor: { line: number; column: number } | null;
  onSave: () => void;
  onShowChanges: () => void;
  onShowInExplorer: () => void;
}

function InfoBar({ tab, nova, cursor, onSave, onShowChanges, onShowInExplorer }: InfoBarProps) {
  const savedRecently = useRecent(tab.savedAt, 2500);
  const reloadedRecently = useRecent(tab.reloaded?.at, 6000);
  const readOnly = tab.status === 'ready' && isReadOnly(tab);
  const segments = tab.path.split('/');
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-bg pr-2 pl-3 text-xs">
      <nav aria-label="Dateipfad" className="flex min-w-0 flex-1 items-center gap-0.5 text-muted">
        {segments.map((segment, i) => (
          <span key={`${i}-${segment}`} className={cn('flex min-w-0 items-center gap-0.5', i < segments.length - 1 ? 'shrink' : 'shrink-0')}>
            {i > 0 && <ChevronRight aria-hidden className="h-3 w-3 shrink-0 text-subtle" />}
            <span className={cn('truncate', i === segments.length - 1 && 'font-medium text-text')}>{segment}</span>
          </span>
        ))}
      </nav>
      {nova && (
        <button
          type="button"
          onClick={onShowChanges}
          title="Die Änderungen von NOVA an dieser Datei ansehen"
          className="inline-flex shrink-0 items-center gap-1 rounded-md bg-violet/14 px-1.5 py-px text-[11px] leading-4 font-medium text-violet-fg transition-colors duration-150 hover:bg-violet/24"
        >
          <Bot aria-hidden className="h-3 w-3" />
          Von NOVA geändert
          <GitCompareArrows aria-hidden className="h-3 w-3" />
        </button>
      )}
      {readOnly && (
        <Badge tone="warning" icon={Lock}>
          Schreibgeschützt
        </Badge>
      )}
      <span className="shrink-0 text-subtle" aria-live="polite">
        {tab.saving ? 'Speichert …' : savedRecently ? <span className="text-success-fg">Gespeichert</span> : reloadedRecently ? <span className="text-violet-fg">{tab.reloaded?.actor === 'nova' ? 'Von NOVA aktualisiert' : 'Neu geladen'}</span> : null}
      </span>
      {cursor && tab.status === 'ready' && tab.encoding !== 'binary' && (
        <span className="hidden shrink-0 text-subtle tabular-nums @3xl:inline">
          Zeile {cursor.line}, Spalte {cursor.column}
        </span>
      )}
      {tab.status === 'ready' && <span className="hidden shrink-0 text-subtle @2xl:inline">{languageLabel(tab.language)}</span>}
      <IconButton icon={FolderOpen} label="Im Explorer zeigen" size="sm" onClick={onShowInExplorer} />
      <Button
        size="sm"
        variant={tab.dirty && !readOnly ? 'primary' : 'ghost'}
        icon={Save}
        loading={tab.saving}
        disabled={readOnly || tab.status !== 'ready' || (!tab.dirty && !tab.deleted)}
        onClick={onSave}
        title="Speichern (Strg+S)"
        className="h-6"
      >
        Speichern
      </Button>
    </div>
  );
}

interface TabNoticesProps {
  tab: EditorTab;
  busy: boolean;
  onReload: () => void;
  onCompare: () => void;
  onOverwrite: () => void;
  onSave: () => void;
  onClose: () => void;
}

function TabNotices({ tab, busy, onReload, onCompare, onOverwrite, onSave, onClose }: TabNoticesProps) {
  if (tab.status !== 'ready') return null;
  const notices = [];
  if (tab.external && tab.dirty) {
    notices.push(
      <Notice key="external" tone="warning" icon={TriangleAlert}>
        <span className="min-w-0 flex-1">
          <strong className="font-semibold">{tab.external.deleted ? 'Die Datei wurde gelöscht' : actorText(tab.external.actor)}</strong>
          {', während hier ungespeicherte Änderungen bestehen. '}
          {tab.external.deleted ? 'Beim Speichern wird sie mit dem Inhalt aus dem Editor neu angelegt.' : 'Wie soll es weitergehen?'}
        </span>
        <span className="flex shrink-0 flex-wrap gap-1">
          {!tab.external.deleted && (
            <Button size="sm" variant="ghost" icon={GitCompareArrows} onClick={onCompare}>
              Unterschiede ansehen
            </Button>
          )}
          {!tab.external.deleted && (
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={onReload}>
              Neu laden
            </Button>
          )}
          <Button size="sm" icon={Upload} loading={busy} onClick={tab.external.deleted ? onSave : onOverwrite}>
            {tab.external.deleted ? 'Neu anlegen' : 'Meine Version speichern'}
          </Button>
          {tab.external.deleted && (
            <Button size="sm" variant="ghost" icon={X} onClick={onClose}>
              Verwerfen und schließen
            </Button>
          )}
        </span>
      </Notice>,
    );
  } else if (tab.deleted) {
    notices.push(
      <Notice key="deleted" tone="danger" icon={FileWarning}>
        <span className="min-w-0 flex-1">Diese Datei gibt es auf der Festplatte nicht mehr.</span>
        <Button size="sm" variant="ghost" icon={X} onClick={onClose}>
          Tab schließen
        </Button>
      </Notice>,
    );
  }
  if (tab.encoding !== 'binary' && tab.truncated) {
    notices.push(
      <Notice key="truncated" tone="info" icon={Lock}>
        <span>Die Datei ist sehr groß ({formatBytes(tab.size)}). Es wird nur der Anfang angezeigt, Bearbeiten ist hier nicht möglich.</span>
      </Notice>,
    );
  } else if (tab.encoding !== 'binary' && tab.size > MAX_EDITABLE_BYTES) {
    notices.push(
      <Notice key="large" tone="info" icon={Lock}>
        <span>Große Datei ({formatBytes(tab.size)}) – zur Sicherheit nur zum Lesen geöffnet.</span>
      </Notice>,
    );
  }
  return notices.length ? <div className="shrink-0">{notices}</div> : null;
}

function Notice({ tone, icon: Icon, children }: { tone: 'warning' | 'danger' | 'info'; icon: typeof Lock; children: ReactNode }) {
  return (
    <div
      role={tone === 'info' ? 'note' : 'alert'}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-1.5 text-xs',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning-fg',
        tone === 'danger' && 'border-danger/30 bg-danger/10 text-danger-fg',
        tone === 'info' && 'border-info/25 bg-info/8 text-info-fg',
      )}
    >
      <Icon aria-hidden className="h-4 w-4 shrink-0" />
      {children}
    </div>
  );
}

function Welcome({ hasTabs }: { hasTabs: boolean }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto px-6">
      <EmptyState
        icon={Code}
        title={hasTabs ? 'Keine Datei ausgewählt' : 'Keine Datei geöffnet'}
        description="Eine Datei im Dateibaum auswählen – oder in Suche, Änderungen oder Prüfungen auf einen Eintrag klicken."
      />
      <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1.5 text-xs text-muted">
        {[
          ['Strg+S', 'Datei speichern'],
          ['Strg+Umschalt+S', 'Alle Dateien speichern'],
          ['Strg+Umschalt+F', 'Im Projekt suchen'],
          ['Strg+B', 'Dateibaum ein-/ausblenden'],
          ['Strg+J', 'Werkzeugbereich ein-/ausblenden'],
          ['Strg+Ö', 'Terminal öffnen'],
        ].map(([keys, label]) => (
          <div key={keys} className="contents">
            <dt className="text-right">
              <kbd className="rounded border border-border bg-surface-2 px-1.5 py-px font-sans text-[11px] text-text">{keys}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------

interface ConflictDialogProps {
  path: string;
  busy: boolean;
  onCancel: () => void;
  onCompare: () => void;
  onReload: () => void | Promise<void>;
  onOverwrite: () => void | Promise<void>;
}

/** Shown when saving hits CONFLICT (the file changed on disk since it was opened). */
function ConflictDialog({ path, busy, onCancel, onCompare, onReload, onOverwrite }: ConflictDialogProps) {
  return (
    <Dialog
      open
      onClose={onCancel}
      title="Die Datei wurde inzwischen geändert"
      description={`Seit dem Öffnen wurde „${path}“ verändert – zum Beispiel von NOVA. Damit nichts verloren geht, wurde noch nicht gespeichert.`}
      icon={TriangleAlert}
      tone="warning"
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Abbrechen
          </Button>
          <Button icon={GitCompareArrows} onClick={onCompare} disabled={busy}>
            Unterschiede ansehen
          </Button>
          <Button icon={RefreshCw} onClick={() => void onReload()} disabled={busy}>
            Neu laden
          </Button>
          <Button variant="primary" icon={Upload} loading={busy} onClick={() => void onOverwrite()}>
            Meine Version speichern
          </Button>
        </>
      }
    >
      <ul className="space-y-2 text-[13px] text-muted">
        <li>
          <strong className="font-semibold text-text">Unterschiede ansehen:</strong> zeigt den neuen Stand neben den eigenen Änderungen.
        </li>
        <li>
          <strong className="font-semibold text-text">Neu laden:</strong> übernimmt den neuen Stand, die eigenen Änderungen in dieser Datei werden verworfen.
        </li>
        <li>
          <strong className="font-semibold text-text">Meine Version speichern:</strong> überschreibt den neuen Stand mit dem Inhalt aus dem Editor.
        </li>
      </ul>
    </Dialog>
  );
}

interface CompareDialogProps {
  projectId: string;
  path: string;
  mine: string;
  language: string;
  busy: boolean;
  onClose: () => void;
  onReload: () => void | Promise<void>;
  onOverwrite: () => void | Promise<void>;
}

/** Disk version (left) against the unsaved editor content (right). */
function CompareDialog({ projectId, path, mine, language, busy, onClose, onReload, onOverwrite }: CompareDialogProps) {
  const [disk, setDisk] = useState<{ content: string; deleted: boolean } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDisk(null);
    setError(null);
    api('files.read', { projectId, path })
      .then((file) => !cancelled && setDisk({ content: file.content, deleted: false }))
      .catch((e: unknown) => {
        if (cancelled) return;
        if (isRpcError(e, 'NOT_FOUND')) setDisk({ content: '', deleted: true });
        else setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, path, attempt]);

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Unterschiede: ${fileName(path)}`}
      description="Links der Stand auf der Festplatte, rechts die ungespeicherten Änderungen im Editor."
      icon={GitCompareArrows}
      size="xl"
      dismissible={!busy}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Schließen
          </Button>
          {disk && !disk.deleted && (
            <Button icon={RefreshCw} onClick={() => void onReload()} disabled={busy}>
              Neu laden (eigene Änderungen verwerfen)
            </Button>
          )}
          <Button variant="primary" icon={Upload} loading={busy} disabled={!disk} onClick={() => void onOverwrite()}>
            Meine Version speichern
          </Button>
        </>
      }
    >
      <div className="h-[min(60vh,560px)] overflow-hidden rounded-lg border border-border">
        {error ? (
          <ErrorState compact error={error} title="Der Stand auf der Festplatte konnte nicht gelesen werden" onRetry={() => setAttempt((n) => n + 1)} />
        ) : !disk ? (
          <LoadingState compact label="Vergleich wird vorbereitet …" />
        ) : (
          <DiffView
            original={disk.content}
            modified={mine}
            language={language}
            originalLabel={disk.deleted ? 'Auf der Festplatte: gelöscht' : 'Auf der Festplatte (neuer Stand)'}
            modifiedLabel="Im Editor (ungespeichert)"
            label={`Vergleich von ${path}`}
          />
        )}
      </div>
    </Dialog>
  );
}
