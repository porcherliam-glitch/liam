// Direct access to the Monaco models of open files (content replacement after a reload, cleanup on close).
// The editor component creates one model per file path (see CodeEditor); this module keeps them in sync.
import { getMonaco } from './monaco-setup';
import { modelUri } from './studio-utils';

/** Replaces the content of a file's model (if it exists) – used after reloading a file from disk. */
export function setModelContent(projectId: string, path: string, content: string): void {
  const monaco = getMonaco();
  if (!monaco) return;
  const model = monaco.editor.getModel(monaco.Uri.parse(modelUri(projectId, path)));
  if (model && !model.isDisposed() && model.getValue() !== content) model.setValue(content);
}

/** Disposes the model of a closed file. */
export function disposeModel(projectId: string, path: string): void {
  const monaco = getMonaco();
  if (!monaco) return;
  const model = monaco.editor.getModel(monaco.Uri.parse(modelUri(projectId, path)));
  if (model && !model.isDisposed()) model.dispose();
}

/** Disposes all models of a project (studio closed). */
export function disposeProjectModels(projectId: string): void {
  const monaco = getMonaco();
  if (!monaco) return;
  const prefix = `/${projectId}/`;
  for (const model of monaco.editor.getModels()) {
    if (!model.isDisposed() && model.uri.scheme === 'file' && model.uri.path.startsWith(prefix)) model.dispose();
  }
}
