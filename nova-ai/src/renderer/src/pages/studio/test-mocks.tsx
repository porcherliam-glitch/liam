// Test doubles for Monaco (@monaco-editor/react + ./monaco-setup) and xterm.js, used by the studio tests:
//   vi.mock('@monaco-editor/react', async () => (await import('./test-mocks')).monacoReactModule);
//   vi.mock('./monaco-setup', async () => (await import('./test-mocks')).monacoSetupModule);
//   vi.mock('@xterm/xterm', async () => (await import('./test-mocks')).xtermModule);
//   vi.mock('@xterm/addon-fit', async () => (await import('./test-mocks')).fitAddonModule);
// The Monaco double keeps one model per path like the real editor, so tab switches, reloads and saves behave alike.
import { useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { stripAnsi } from './studio-utils';

// ---------------------------------------------------------------------------
// Monaco models
// ---------------------------------------------------------------------------

interface FakeUri {
  scheme: string;
  path: string;
  toString(): string;
}

function parseUri(value: string): FakeUri {
  const match = /^([a-z]+):\/\/(.*)$/i.exec(value);
  return { scheme: match?.[1] ?? 'file', path: match?.[2] ?? value, toString: () => value };
}

export class FakeModel {
  readonly uri: FakeUri;
  private value: string;
  private disposed = false;
  readonly contentListeners = new Set<(value: string) => void>();

  constructor(uri: string, value: string) {
    this.uri = parseUri(uri);
    this.value = value;
  }

  getValue(): string {
    return this.value;
  }

  setValue(value: string): void {
    this.value = value;
    for (const fn of [...this.contentListeners]) fn(value);
    notify();
  }

  getLineCount(): number {
    return this.value.split('\n').length;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    this.disposed = true;
    models.delete(this.uri.toString());
    notify();
  }
}

const models = new Map<string, FakeModel>();
const storeListeners = new Set<() => void>();
let version = 0;

function notify(): void {
  version++;
  for (const fn of [...storeListeners]) fn();
}

function subscribe(fn: () => void): () => void {
  storeListeners.add(fn);
  return () => storeListeners.delete(fn);
}

function ensureModel(uri: string, initial: string): FakeModel {
  let model = models.get(uri);
  if (!model) {
    model = new FakeModel(uri, initial);
    models.set(uri, model);
  }
  return model;
}

/** What the fake editors did (for assertions). */
export const monacoLog = {
  /** setPosition calls: model uri + position. */
  positions: [] as Array<{ uri: string; lineNumber: number; column: number }>,
  /** Last markers per model uri. */
  markers: new Map<string, Array<{ startLineNumber: number; message: string; severity: number }>>(),
};

/** Clears models and logs between tests. */
export function resetMonacoMock(): void {
  models.clear();
  monacoLog.positions.length = 0;
  monacoLog.markers.clear();
  notify();
}

/** Content of the model of a project file (`modelUri(projectId, path)`). */
export function modelValue(uri: string): string | undefined {
  return models.get(uri)?.getValue();
}

export const fakeMonaco = {
  KeyMod: { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 },
  KeyCode: { KeyS: 49 },
  MarkerSeverity: { Hint: 1, Info: 2, Warning: 4, Error: 8 },
  Uri: { parse: (value: string) => parseUri(value) },
  editor: {
    getModel: (uri: FakeUri) => models.get(uri.toString()) ?? null,
    getModels: () => [...models.values()],
    setModelMarkers: (model: FakeModel, _owner: string, markers: Array<{ startLineNumber: number; message: string; severity: number }>) => {
      monacoLog.markers.set(model.uri.toString(), markers);
    },
    defineTheme: () => {},
  },
};

// ---------------------------------------------------------------------------
// @monaco-editor/react
// ---------------------------------------------------------------------------

interface MockEditorProps {
  path?: string;
  defaultValue?: string;
  language?: string;
  options?: { readOnly?: boolean; ariaLabel?: string };
  onMount?: (editor: unknown, monaco: unknown) => void;
  onChange?: (value: string | undefined) => void;
  loading?: ReactNode;
}

const CTRL_S = fakeMonaco.KeyMod.CtrlCmd | fakeMonaco.KeyCode.KeyS;

function MockEditor({ path = 'inmemory://model', defaultValue = '', language, options, onMount, onChange }: MockEditorProps) {
  useSyncExternalStore(subscribe, () => version);
  const model = ensureModel(path, defaultValue);
  const modelRef = useRef(model);
  modelRef.current = model;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const commands = useRef(new Map<number, () => void>());
  const cursorListeners = useRef(new Set<(e: { position: { lineNumber: number; column: number } }) => void>());
  const editorApi = useRef({
    addCommand: (keybinding: number, handler: () => void) => {
      commands.current.set(keybinding, handler);
      return 'cmd';
    },
    onDidChangeCursorPosition: (fn: (e: { position: { lineNumber: number; column: number } }) => void) => {
      cursorListeners.current.add(fn);
      return { dispose: () => cursorListeners.current.delete(fn) };
    },
    getPosition: () => ({ lineNumber: 1, column: 1 }),
    getModel: () => modelRef.current,
    revealLineInCenter: () => {},
    setPosition: (position: { lineNumber: number; column: number }) => {
      monacoLog.positions.push({ uri: modelRef.current.uri.toString(), ...position });
      for (const fn of [...cursorListeners.current]) fn({ position });
    },
    focus: () => {},
    createDecorationsCollection: () => ({ clear: () => {} }),
  });

  // Layout effects (not passive ones) so a test can type right after the editor appeared.
  useLayoutEffect(() => {
    onMount?.(editorApi.current, fakeMonaco);
    // Mount once, like the real component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Like the real editor: every content change of the shown model reaches onChange.
  useLayoutEffect(() => {
    const fn = (value: string) => onChangeRef.current?.(value);
    model.contentListeners.add(fn);
    return () => {
      model.contentListeners.delete(fn);
    };
  }, [model]);

  return (
    <textarea
      data-testid="monaco-editor"
      data-path={path}
      data-language={language}
      aria-label={options?.ariaLabel ?? 'Editor'}
      readOnly={options?.readOnly}
      value={model.getValue()}
      onChange={(e) => model.setValue(e.target.value)}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.shiftKey) {
          const handler = commands.current.get(CTRL_S);
          if (handler) {
            e.preventDefault();
            handler();
          }
        }
      }}
    />
  );
}

function MockDiffEditor({ original, modified, language }: { original?: string; modified?: string; language?: string }) {
  return (
    <div data-testid="diff-editor" data-language={language}>
      <pre data-side="original">{original}</pre>
      <pre data-side="modified">{modified}</pre>
    </div>
  );
}

export const monacoReactModule = {
  default: MockEditor,
  Editor: MockEditor,
  DiffEditor: MockDiffEditor,
  loader: { config: () => {}, init: async () => fakeMonaco },
};

export const monacoSetupModule = {
  NOVA_MONACO_THEME: 'nova-dark',
  NOVA_THEME_DATA: {},
  loadMonaco: async () => fakeMonaco,
  getMonaco: () => fakeMonaco,
};

// ---------------------------------------------------------------------------
// xterm.js
// ---------------------------------------------------------------------------

export class FakeTerminal {
  static instances: FakeTerminal[] = [];
  cols = 80;
  rows = 24;
  output = '';
  selection = '';
  disposed = false;
  element: HTMLElement | null = null;
  readonly options: unknown;
  private readonly dataListeners = new Set<(data: string) => void>();
  keyHandler: ((e: KeyboardEvent) => boolean) | null = null;

  constructor(options?: unknown) {
    this.options = options;
    FakeTerminal.instances.push(this);
  }

  /** Last created terminal that is still alive. */
  static current(): FakeTerminal | undefined {
    return [...FakeTerminal.instances].reverse().find((t) => !t.disposed);
  }

  loadAddon(addon: { activate?: (t: FakeTerminal) => void }): void {
    addon.activate?.(this);
  }

  open(element: HTMLElement): void {
    this.element = element;
  }

  write(data: string): void {
    this.output += data;
  }

  onData(fn: (data: string) => void): { dispose: () => void } {
    this.dataListeners.add(fn);
    return { dispose: () => this.dataListeners.delete(fn) };
  }

  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void {
    this.keyHandler = handler;
  }

  hasSelection(): boolean {
    return this.selection.length > 0;
  }

  getSelection(): string {
    return this.selection;
  }

  clearSelection(): void {
    this.selection = '';
  }

  clear(): void {
    this.output = '';
  }

  reset(): void {
    this.output = '';
  }

  focus(): void {}

  dispose(): void {
    this.disposed = true;
    this.dataListeners.clear();
  }

  /** Test helper: simulates typed or pasted input (xterm's onData). */
  type(data: string): void {
    for (const fn of [...this.dataListeners]) fn(data);
  }

  /** Output without escape sequences. */
  get text(): string {
    return stripAnsi(this.output);
  }
}

export class FakeFitAddon {
  activate(): void {}
  proposeDimensions(): { cols: number; rows: number } {
    return { cols: 80, rows: 24 };
  }
  fit(): void {}
  dispose(): void {}
}

export const xtermModule = { Terminal: FakeTerminal };
export const fitAddonModule = { FitAddon: FakeFitAddon };
