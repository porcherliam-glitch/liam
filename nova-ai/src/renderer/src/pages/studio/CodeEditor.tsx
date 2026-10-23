import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as MonacoApi from 'monaco-editor';
import { LoadingState } from '../../components/ui';
import { NOVA_MONACO_THEME, type Monaco } from './monaco-setup';
import { modelUri, type EditorMarker } from './studio-utils';
import type { RevealRequest } from './useEditorTabs';

export const EDITOR_FONT = '"Cascadia Code", "Cascadia Mono", Consolas, "Liberation Mono", monospace';

export interface CodeEditorProps {
  projectId: string;
  path: string;
  language: string;
  /** Content of a newly created model (an existing model of the path keeps its content). */
  initialContent: string;
  readOnly: boolean;
  reveal: RevealRequest | null;
  markers: readonly EditorMarker[];
  onChange: (path: string, value: string) => void;
  /** Strg+S inside the editor. */
  onSave?: () => void;
  /** Cursor moved (1-based line/column). */
  onCursorChange?: (line: number, column: number) => void;
}

const MARKER_SEVERITY: Record<EditorMarker['severity'], keyof typeof MonacoApi.MarkerSeverity> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
  hint: 'Hint',
};

/**
 * Monaco editor for one file at a time (one model per path, so undo history and scroll position survive tab
 * switches). Jumps to `reveal` positions and shows NOVA's markers (check failures, review findings).
 */
export function CodeEditor({ projectId, path, language, initialContent, readOnly, reveal, markers, onChange, onSave, onCursorChange }: CodeEditorProps) {
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [ready, setReady] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onCursorRef = useRef(onCursorChange);
  onCursorRef.current = onCursorChange;
  const appliedReveal = useRef(0);
  const decorations = useRef<MonacoApi.editor.IEditorDecorationsCollection | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const uri = modelUri(projectId, path);

  const options = useMemo<MonacoApi.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      readOnly,
      readOnlyMessage: { value: 'Diese Datei kann im Editor nicht bearbeitet werden.' },
      ariaLabel: `Editor: ${path}${readOnly ? ' (schreibgeschützt)' : ''}`,
      fontFamily: EDITOR_FONT,
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: true,
      tabSize: 2,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      minimap: { enabled: true, renderCharacters: false, maxColumn: 80, scale: 1 },
      renderWhitespace: 'selection',
      padding: { top: 10, bottom: 10 },
      fixedOverflowWidgets: true,
      bracketPairColorization: { enabled: true },
      guides: { indentation: true, bracketPairs: false },
      stickyScroll: { enabled: false },
      cursorBlinking: 'smooth',
      renderLineHighlight: 'all',
      'semanticHighlighting.enabled': false,
      unicodeHighlight: { ambiguousCharacters: false },
    }),
    [readOnly, path],
  );

  const handleMount = useCallback<OnMount>((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco as Monaco;
    // Strg+S saves (Monaco would otherwise swallow the key while it has the focus).
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());
    editor.onDidChangeCursorPosition((e) => onCursorRef.current?.(e.position.lineNumber, e.position.column));
    const position = editor.getPosition();
    if (position) onCursorRef.current?.(position.lineNumber, position.column);
    setReady(true);
  }, []);

  const handleChange = useCallback((value: string | undefined) => {
    onChangeRef.current(pathRef.current, value ?? '');
  }, []);

  // Jump to a requested position (once per request).
  useEffect(() => {
    const editor = editorRef.current;
    if (!ready || !editor || !reveal || reveal.path !== path || appliedReveal.current === reveal.token) return;
    const model = editor.getModel();
    if (!model) return;
    appliedReveal.current = reveal.token;
    const lineCount = typeof model.getLineCount === 'function' ? model.getLineCount() : reveal.line;
    const line = Math.min(Math.max(1, reveal.line), Math.max(1, lineCount));
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: reveal.column });
    editor.focus();
    if (typeof editor.createDecorationsCollection === 'function') {
      decorations.current?.clear();
      decorations.current = editor.createDecorationsCollection([
        { range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 }, options: { isWholeLine: true, className: 'nova-reveal-line', linesDecorationsClassName: 'nova-reveal-glyph' } },
      ]);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => decorations.current?.clear(), 2000);
    }
  }, [ready, reveal, path]);

  // NOVA markers for the shown file.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!ready || !editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      'nova',
      markers.map((m) => ({
        startLineNumber: m.line,
        startColumn: m.column,
        endLineNumber: m.line,
        endColumn: Number.MAX_SAFE_INTEGER,
        message: m.message,
        severity: monaco.MarkerSeverity[MARKER_SEVERITY[m.severity]],
        source: m.source,
      })),
    );
  }, [ready, markers, path]);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  return (
    <div className="nova-editor h-full min-h-0 w-full">
      <Editor
        path={uri}
        defaultValue={initialContent}
        language={language || 'plaintext'}
        theme={NOVA_MONACO_THEME}
        options={options}
        keepCurrentModel
        saveViewState
        onMount={handleMount}
        onChange={handleChange}
        loading={<LoadingState label="Editor wird geladen …" compact />}
      />
    </div>
  );
}
