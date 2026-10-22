// Export (sections → data.export with the save dialog) and import (file dialog → data.import) of NOVA data.
import { useState } from 'react';
import { ArrowLeftRight, Download, Upload } from 'lucide-react';
import type { ExportSection } from '@shared/schemas';
import type { RpcResult } from '@shared/rpc';
import { Button, Card, Checkbox, ConfirmDialog } from '../../../components/ui';
import { useMutation } from '../../../hooks';
import { EXPORT_SECTION } from '../../../lib/labels';
import { toast } from '../../../stores/toasts';
import { chooseFile, chooseSaveFile, dialogUnavailable, JSON_FILTER, revealInExplorer, todayStamp } from '../shared/files';
import { OperationProgress, useTrackedOperation } from '../shared/OperationProgress';
import { Notice } from '../shared/ui';

const SECTIONS = Object.keys(EXPORT_SECTION) as ExportSection[];

/** "3 Projekte, 41 Aufgaben …" from the counts of an export/import. */
export function countsText(counts: Record<string, number>): string {
  const parts: string[] = [];
  for (const [key, n] of Object.entries(counts)) {
    if (key === 'skipped') continue;
    const label = (EXPORT_SECTION as Record<string, { label: string }>)[key]?.label ?? key;
    parts.push(`${label}: ${n}`);
  }
  return parts.join(' · ');
}

export function DataTransferPanel() {
  const [selected, setSelected] = useState<Set<ExportSection>>(new Set(SECTIONS));
  const [importPath, setImportPath] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<RpcResult<'data.import'> | null>(null);

  const exportData = useMutation('data.export', {
    errorToast: 'Export fehlgeschlagen',
    onSuccess: (r) =>
      toast.show({ tone: 'success', title: 'Daten exportiert', message: `${countsText(r.counts)} – ${r.path}`, action: { label: 'Im Explorer zeigen', onClick: () => void revealInExplorer(r.path) } }),
  });
  const importData = useMutation('data.import', {
    errorToast: 'Import fehlgeschlagen',
    successToast: 'Daten importiert',
    onSuccess: (r) => {
      setImportResult(r);
      setImportPath(null);
    },
  });
  const exportOp = useTrackedOperation(['export'], exportData.loading);
  const importOp = useTrackedOperation(['import'], importData.loading);

  const toggle = (s: ExportSection, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(s);
      else next.delete(s);
      return next;
    });

  const onExport = async () => {
    const path = await chooseSaveFile({ title: 'Daten exportieren', defaultPath: `NOVA Export ${todayStamp()}.json`, filters: JSON_FILTER });
    if (path === null) return;
    await exportData.run({ sections: SECTIONS.filter((s) => selected.has(s)), ...(path ? { path } : {}) });
  };
  const onChooseImport = async () => {
    const path = await chooseFile({ title: 'Export-Datei auswählen', filters: JSON_FILTER });
    if (path === undefined) return dialogUnavailable();
    if (path) {
      setImportResult(null);
      setImportPath(path);
    }
  };

  return (
    <Card title="Export und Import" description="Daten als Datei sichern oder auf einen anderen PC übertragen." icon={ArrowLeftRight}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-text">Exportieren</h3>
          <fieldset className="space-y-1.5">
            <legend className="sr-only">Was exportiert wird</legend>
            {SECTIONS.map((s) => (
              <Checkbox key={s} checked={selected.has(s)} onChange={(on) => toggle(s, on)} label={EXPORT_SECTION[s].label} />
            ))}
          </fieldset>
          <p className="text-[11px] text-muted">API-Schlüssel werden nie exportiert.</p>
          <Button icon={Download} loading={exportData.loading} disabled={selected.size === 0} onClick={() => void onExport()}>
            Exportieren …
          </Button>
          <OperationProgress operation={exportOp} active={exportData.loading} pendingLabel="Daten werden exportiert …" />
        </div>
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold text-text">Importieren</h3>
          <p className="text-xs text-muted">
            Übernimmt Daten aus einer NOVA-Export-Datei. Vorhandene Einträge werden nicht überschrieben. Berechtigungen, Netzwerk- und Budget-Einstellungen werden nie importiert; API-Schlüssel und Kostenfreigaben müssen neu eingegeben werden.
          </p>
          <Button icon={Upload} loading={importData.loading} onClick={() => void onChooseImport()}>
            Datei auswählen …
          </Button>
          <OperationProgress operation={importOp} active={importData.loading} pendingLabel="Daten werden importiert …" />
          {importResult && (
            <Notice tone={importResult.warnings.length ? 'warning' : 'success'} title="Import abgeschlossen">
              <p>{countsText(importResult.counts) || 'Keine neuen Daten.'}</p>
              {importResult.warnings.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {importResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
            </Notice>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={importPath !== null}
        title="Daten importieren?"
        confirmLabel="Importieren"
        loading={importData.loading}
        onCancel={() => setImportPath(null)}
        onConfirm={() => (importPath ? importData.run({ path: importPath }) : undefined)}
        icon={Upload}
        message={
          <>
            <p className="font-mono text-xs break-all">{importPath}</p>
            <p>Neue Projekte, Aufgaben, Gedächtniseinträge und Anbieter werden hinzugefügt. Importierte Projekte starten gestoppt – die autonome Arbeit muss pro Projekt neu freigegeben werden.</p>
          </>
        }
      />
    </Card>
  );
}
