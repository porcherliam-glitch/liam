import { useEffect, useMemo, useRef } from 'react';
import { DiffEditor, type DiffOnMount } from '@monaco-editor/react';
import type * as MonacoApi from 'monaco-editor';
import { FileWarning } from 'lucide-react';
import { Button, EmptyState, LoadingState } from '../../components/ui';
import { cn } from '../../lib/cn';
import { NOVA_MONACO_THEME } from './monaco-setup';
import { EDITOR_FONT } from './CodeEditor';
import { useMonacoReady } from './useMonacoReady';

export interface DiffViewProps {
  original: string;
  modified: string;
  language?: string;
  originalLabel: string;
  modifiedLabel: string;
  /** Side by side (default) or inline. */
  sideBySide?: boolean;
  /** Accessible name of the comparison. */
  label: string;
  className?: string;
}

/** Read-only Monaco diff (left: before, right: after) with labels above both sides. */
export function DiffView({ original, modified, language, originalLabel, modifiedLabel, sideBySide = true, label, className }: DiffViewProps) {
  const { monaco, error, retry } = useMonacoReady();
  // @monaco-editor/react disposes the models BEFORE the diff widget on unmount, which Monaco rejects
  // ("TextModel got disposed before DiffEditorWidget model got reset"). The models are therefore kept by the
  // library and disposed here right after the widget is gone.
  const models = useRef<MonacoApi.editor.IDiffEditorModel | null>(null);
  const onMount = useRef<DiffOnMount>((editor) => {
    models.current = editor.getModel();
  }).current;
  useEffect(
    () => () => {
      const current = models.current;
      models.current = null;
      if (!current) return;
      setTimeout(() => {
        for (const model of [current.original, current.modified]) if (!model.isDisposed()) model.dispose();
      }, 0);
    },
    [],
  );
  const options = useMemo<MonacoApi.editor.IDiffEditorConstructionOptions>(
    () => ({
      readOnly: true,
      originalEditable: false,
      renderSideBySide: sideBySide,
      useInlineViewWhenSpaceIsLimited: true,
      automaticLayout: true,
      renderValidationDecorations: 'off',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontFamily: EDITOR_FONT,
      fontSize: 13,
      lineHeight: 20,
      ignoreTrimWhitespace: false,
      renderOverviewRuler: true,
      hideUnchangedRegions: { enabled: true, contextLineCount: 3, minimumLineCount: 6, revealLineCount: 20 },
      originalAriaLabel: `${label} – ${originalLabel}`,
      modifiedAriaLabel: `${label} – ${modifiedLabel}`,
    }),
    [sideBySide, label, originalLabel, modifiedLabel],
  );

  if (error) {
    return (
      <EmptyState
        compact
        icon={FileWarning}
        title="Der Vergleich konnte nicht geladen werden"
        description={error}
        actions={
          <Button size="sm" onClick={retry}>
            Erneut versuchen
          </Button>
        }
      />
    );
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} role="group" aria-label={label}>
      <div className={cn('grid shrink-0 border-b border-border bg-surface text-[11px] font-medium text-muted', sideBySide ? 'grid-cols-2' : 'grid-cols-1')}>
        {sideBySide ? (
          <>
            <span className="truncate px-3 py-1">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-danger/60" aria-hidden />
              {originalLabel}
            </span>
            <span className="truncate border-l border-border px-3 py-1">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-success/60" aria-hidden />
              {modifiedLabel}
            </span>
          </>
        ) : (
          <span className="truncate px-3 py-1">
            <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-danger/60" aria-hidden />
            {originalLabel}
            <span className="mx-2 text-subtle">→</span>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-success/60" aria-hidden />
            {modifiedLabel}
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {monaco ? (
          <DiffEditor
            original={original}
            modified={modified}
            language={language || 'plaintext'}
            theme={NOVA_MONACO_THEME}
            options={options}
            keepCurrentOriginalModel
            keepCurrentModifiedModel
            onMount={onMount}
            loading={<LoadingState label="Vergleich wird geladen …" compact />}
          />
        ) : (
          <LoadingState label="Vergleich wird geladen …" compact />
        )}
      </div>
    </div>
  );
}
