// Monaco setup: uses the LOCAL monaco-editor package (no CDN – the app works offline and the CSP forbids remote
// scripts) with Vite worker bundles, the NOVA dark theme and beginner-friendly language defaults.
// Monaco itself is imported lazily so the studio (tree, panels) renders before the editor bundle is ready.
import { loader } from '@monaco-editor/react';
import type * as MonacoApi from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

export type Monaco = typeof MonacoApi;

/** Name of the editor theme (defined in loadMonaco). */
export const NOVA_MONACO_THEME = 'nova-dark';

/** Editor colors derived from the UI-SPEC tokens (Monaco needs #RRGGBB / #RRGGBBAA). */
export const NOVA_THEME_DATA: MonacoApi.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e6e8f0' },
    { token: 'comment', foreground: '6b7389', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c4b5fd' },
    { token: 'keyword.control', foreground: 'c4b5fd' },
    { token: 'storage', foreground: 'c4b5fd' },
    { token: 'string', foreground: '86efac' },
    { token: 'string.escape', foreground: '7dd3fc' },
    { token: 'regexp', foreground: 'fca5a5' },
    { token: 'number', foreground: 'fbbf24' },
    { token: 'constant', foreground: 'fbbf24' },
    { token: 'type', foreground: '93c5fd' },
    { token: 'type.identifier', foreground: '93c5fd' },
    { token: 'identifier', foreground: 'e6e8f0' },
    { token: 'delimiter', foreground: '8b93a7' },
    { token: 'operator', foreground: 'a5b4fc' },
    { token: 'tag', foreground: '93c5fd' },
    { token: 'metatag', foreground: 'c4b5fd' },
    { token: 'attribute.name', foreground: 'c4b5fd' },
    { token: 'attribute.value', foreground: '86efac' },
    { token: 'key', foreground: '93c5fd' },
    { token: 'string.key.json', foreground: '93c5fd' },
    { token: 'string.value.json', foreground: '86efac' },
    { token: 'variable', foreground: 'e6e8f0' },
    { token: 'variable.predefined', foreground: '7dd3fc' },
    { token: 'annotation', foreground: 'fbbf24' },
  ],
  colors: {
    'editor.background': '#0b0d14',
    'editor.foreground': '#e6e8f0',
    'editorLineNumber.foreground': '#4b5368',
    'editorLineNumber.activeForeground': '#c4b5fd',
    'editorCursor.foreground': '#c4b5fd',
    'editor.lineHighlightBackground': '#171b2699',
    'editor.lineHighlightBorder': '#00000000',
    'editor.selectionBackground': '#8b5cf655',
    'editor.inactiveSelectionBackground': '#8b5cf62e',
    'editor.selectionHighlightBackground': '#8b5cf626',
    'editor.wordHighlightBackground': '#3b82f62e',
    'editor.findMatchBackground': '#f59e0b55',
    'editor.findMatchHighlightBackground': '#f59e0b2e',
    'editorIndentGuide.background1': '#1e2331',
    'editorIndentGuide.activeBackground1': '#353d52',
    'editorWhitespace.foreground': '#252b3a',
    'editorBracketMatch.background': '#8b5cf62e',
    'editorBracketMatch.border': '#8b5cf6aa',
    'editorGutter.background': '#0b0d14',
    'editorWidget.background': '#11141d',
    'editorWidget.border': '#353d52',
    'editorSuggestWidget.background': '#11141d',
    'editorSuggestWidget.border': '#353d52',
    'editorSuggestWidget.selectedBackground': '#1e2331',
    'editorHoverWidget.background': '#11141d',
    'editorHoverWidget.border': '#353d52',
    'editorError.foreground': '#ef4444',
    'editorWarning.foreground': '#f59e0b',
    'editorInfo.foreground': '#38bdf8',
    'editorOverviewRuler.border': '#00000000',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#252b3a99',
    'scrollbarSlider.hoverBackground': '#353d52cc',
    'scrollbarSlider.activeBackground': '#8b5cf666',
    'minimap.background': '#0b0d14',
    'diffEditor.insertedTextBackground': '#22c55e26',
    'diffEditor.removedTextBackground': '#ef444426',
    'diffEditor.insertedLineBackground': '#22c55e14',
    'diffEditor.removedLineBackground': '#ef444414',
    'diffEditor.diagonalFill': '#252b3a66',
    'diffEditorGutter.insertedLineBackground': '#22c55e1f',
    'diffEditorGutter.removedLineBackground': '#ef44441f',
    focusBorder: '#8b5cf6',
    'input.background': '#171b26',
    'input.border': '#252b3a',
    'inputOption.activeBorder': '#8b5cf6',
    'list.hoverBackground': '#171b26',
    'list.activeSelectionBackground': '#1e2331',
    'list.highlightForeground': '#c4b5fd',
  },
};

type WorkerCtor = new () => Worker;

const WORKERS: Record<string, WorkerCtor> = {
  json: JsonWorker,
  css: CssWorker,
  scss: CssWorker,
  less: CssWorker,
  html: HtmlWorker,
  handlebars: HtmlWorker,
  razor: HtmlWorker,
  typescript: TsWorker,
  javascript: TsWorker,
};

let loading: Promise<Monaco> | null = null;
let instance: Monaco | null = null;

/** The configured Monaco instance once loaded (null before). */
export function getMonaco(): Monaco | null {
  return instance;
}

/**
 * Loads Monaco once: registers the workers, points @monaco-editor/react at the local package, defines the theme
 * and sets language defaults. Safe to call many times.
 */
export function loadMonaco(): Promise<Monaco> {
  if (loading) return loading;
  loading = (async () => {
    (self as unknown as { MonacoEnvironment: MonacoApi.Environment }).MonacoEnvironment = {
      getWorker(_workerId: string, label: string) {
        const Ctor = WORKERS[label] ?? EditorWorker;
        return new Ctor();
      },
    };
    const monaco = (await import('monaco-editor')) as Monaco;
    loader.config({ monaco });
    monaco.editor.defineTheme(NOVA_MONACO_THEME, NOVA_THEME_DATA);
    configureLanguages(monaco);
    instance = monaco;
    return monaco;
  })();
  loading.catch(() => {
    // Allow a retry after a failed load.
    loading = null;
  });
  return loading;
}

function configureLanguages(monaco: Monaco): void {
  const ts = monaco.languages.typescript;
  // The editor does not know the project's packages (node_modules), so semantic errors such as
  // "Cannot find module 'react'" would be misleading. Syntax errors are still shown.
  const diagnostics = { noSemanticValidation: true, noSyntaxValidation: false, noSuggestionDiagnostics: true };
  ts.typescriptDefaults.setDiagnosticsOptions(diagnostics);
  ts.javascriptDefaults.setDiagnosticsOptions(diagnostics);
  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    experimentalDecorators: true,
  };
  ts.typescriptDefaults.setCompilerOptions(compilerOptions);
  ts.javascriptDefaults.setCompilerOptions(compilerOptions);
  ts.typescriptDefaults.setEagerModelSync(false);
  // tsconfig.json / package.json often contain comments or trailing commas – do not flag them.
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: true, trailingCommas: 'ignore', enableSchemaRequest: false, schemas: [] });
}
