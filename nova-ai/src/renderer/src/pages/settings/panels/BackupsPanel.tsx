// Backups (UI-SPEC §4 / §7): list, "Jetzt sichern", project snapshot, restore (database: daemon restarts;
// project snapshot: copied into a new folder) and delete. Long calls show their operation progress.
import { useState } from 'react';
import { Archive, Database, FolderOpen, FolderSearch, History, Pause, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { BackupInfo } from '@shared/schemas';
import { Button, Card, type Column, ConfirmDialog, Dialog, EmptyState, ErrorState, IconButton, LoadingState, Select, StatusBadge, Table } from '../../../components/ui';
import { RelativeTime } from '../../../components/common';
import { useMutation, useProjectNames, useProjects, useRpc, useSupports } from '../../../hooks';
import { basename, formatBytes } from '../../../lib/format';
import { BACKUP_KIND, metaOf } from '../../../lib/labels';
import { useDaemonStore } from '../../../stores/daemon';
import { toast } from '../../../stores/toasts';
import { chooseDirectory, dialogUnavailable, openFolder, revealInExplorer } from '../shared/files';
import { OperationProgress, useTrackedOperation } from '../shared/OperationProgress';
import { Notice } from '../shared/ui';

export function BackupsPanel() {
  const backups = useRpc('backup.list');
  const projects = useProjects();
  const projectNames = useProjectNames();
  const [projectId, setProjectId] = useState('');
  const [toDelete, setToDelete] = useState<BackupInfo | null>(null);
  const [toRestore, setToRestore] = useState<BackupInfo | null>(null);
  const canRestore = useSupports('backup.restore');
  const canDelete = useSupports('backup.delete');

  const create = useMutation('backup.create', {
    errorToast: 'Sicherung fehlgeschlagen',
    successToast: (b) => `Sicherung erstellt (${formatBytes(b.sizeBytes)})`,
    onSuccess: () => void backups.refetch(),
  });
  const snapshot = useMutation('backup.snapshotProject', {
    errorToast: 'Projektkopie fehlgeschlagen',
    onSuccess: (b) => {
      void backups.refetch();
      toast.show({ tone: 'success', title: 'Projektkopie erstellt', message: b.path, action: { label: 'Im Explorer zeigen', onClick: () => void revealInExplorer(b.path) } });
    },
  });
  const del = useMutation('backup.delete', {
    successToast: 'Sicherung gelöscht',
    onSuccess: (_r, p) => {
      backups.setData((prev) => prev?.filter((b) => b.id !== p?.id));
      setToDelete(null);
    },
  });
  const createOp = useTrackedOperation(['backup'], create.loading);
  const snapshotOp = useTrackedOperation(['project_snapshot'], snapshot.loading);

  const columns: Column<BackupInfo>[] = [
    { key: 'kind', header: 'Art', sortValue: (b) => b.kind, cell: (b) => <StatusBadge meta={metaOf(BACKUP_KIND, b.kind)} /> },
    {
      key: 'what',
      header: 'Inhalt',
      sortValue: (b) => b.reason,
      cell: (b) => (
        <div className="min-w-0">
          <div className="truncate">{b.projectId ? (projectNames.get(b.projectId) ?? 'Entferntes Projekt') : b.kind === 'database' ? 'Alle NOVA-Daten' : basename(b.path)}</div>
          <div className="text-[11px] text-muted">Anlass: {b.reason}</div>
        </div>
      ),
    },
    { key: 'size', header: 'Größe', align: 'right', sortValue: (b) => b.sizeBytes, cell: (b) => <span className="tabular-nums">{formatBytes(b.sizeBytes)}</span> },
    { key: 'created', header: 'Erstellt', sortValue: (b) => b.createdAt, cell: (b) => <RelativeTime ts={b.createdAt} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Aktionen</span>,
      align: 'right',
      cell: (b) => (
        <div className="flex justify-end gap-1">
          <IconButton icon={FolderSearch} size="sm" label="Im Explorer zeigen" onClick={() => void revealInExplorer(b.path)} />
          {canRestore && b.kind !== 'export' && (
            <Button size="sm" icon={RotateCcw} onClick={() => setToRestore(b)}>
              Wiederherstellen
            </Button>
          )}
          {canDelete && <IconButton icon={Trash2} size="sm" label={`Sicherung vom ${new Date(b.createdAt).toLocaleDateString('de-DE')} löschen`} onClick={() => setToDelete(b)} />}
        </div>
      ),
    },
  ];

  return (
    <Card
      title="Sicherungen"
      description="Datenbank-Sicherungen enthalten Projekte, Aufgaben, Einstellungen und Gedächtnis (ohne API-Schlüssel). Projektkopien sichern die Dateien eines Projekts."
      icon={History}
      padding="none"
    >
      <div className="space-y-3 px-4 pb-3">
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary" icon={Save} loading={create.loading} onClick={() => void create.run({ reason: 'manuell' })}>
            Jetzt sichern
          </Button>
          <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
          <Select
            label="Projektkopie anlegen"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Projekt wählen …"
            options={(projects.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
            containerClassName="w-56"
          />
          <Button icon={Archive} loading={snapshot.loading} disabled={!projectId} onClick={() => void snapshot.run({ projectId })}>
            Projekt sichern
          </Button>
        </div>
        <p className="text-[11px] text-muted">Projektkopien enthalten keine node_modules-, Build- und .git-Ordner – sie lassen sich jederzeit neu erzeugen.</p>
        <OperationProgress operation={createOp} active={create.loading} pendingLabel="Sicherung wird erstellt …" />
        <OperationProgress operation={snapshotOp} active={snapshot.loading} pendingLabel="Projektkopie wird erstellt …" />
      </div>
      <div className="border-t border-border px-1 pb-1">
        {backups.loading ? (
          <LoadingState compact />
        ) : backups.error && !backups.data ? (
          <ErrorState compact error={backups.error} onRetry={() => void backups.refetch()} />
        ) : (
          <Table
            columns={columns}
            rows={backups.data ?? []}
            rowKey={(b) => b.id}
            caption="Sicherungen"
            dense
            initialSort={{ key: 'created', dir: 'desc' }}
            empty={<EmptyState compact icon={Database} title="Noch keine Sicherung" description="„Jetzt sichern“ erstellt die erste Sicherung." />}
          />
        )}
      </div>

      <RestoreDialog backup={toRestore} projectName={toRestore?.projectId ? projectNames.get(toRestore.projectId) : undefined} onClose={() => setToRestore(null)} />
      <ConfirmDialog
        open={toDelete !== null}
        tone="danger"
        title="Sicherung löschen?"
        confirmLabel="Löschen"
        loading={del.loading}
        onCancel={() => setToDelete(null)}
        onConfirm={() => (toDelete ? del.run({ id: toDelete.id }) : undefined)}
        message={<p>Die Sicherung wird endgültig von der Festplatte gelöscht ({formatBytes(toDelete?.sizeBytes)}).</p>}
      />
    </Card>
  );
}

function RestoreDialog({ backup, projectName, onClose }: { backup: BackupInfo | null; projectName?: string; onClose: () => void }) {
  const [targetDir, setTargetDir] = useState<string | null>(null);
  const restore = useMutation('backup.restore', {
    errorToast: 'Wiederherstellung fehlgeschlagen',
    onSuccess: (r) => {
      setTargetDir(null);
      onClose();
      const restoredPath = r.path;
      if (restoredPath) {
        toast.show({ tone: 'success', title: 'Projektkopie wiederhergestellt', message: `${r.message} ${restoredPath}`, action: { label: 'Ordner öffnen', onClick: () => void openFolder(restoredPath) } });
      } else {
        toast.show({ tone: r.restartRequired ? 'info' : 'success', title: r.restartRequired ? 'NOVA startet neu' : 'Wiederhergestellt', message: r.message });
      }
    },
  });
  const op = useTrackedOperation(['backup_restore'], restore.loading);
  const isDb = backup?.kind === 'database';
  // The daemon refuses a database restore while agents work (CONFLICT): say so up front and offer to pause.
  const work = useDaemonStore((s) => s.work);
  const activeRuns = work?.activeRuns ?? 0;
  const blockedByWork = isDb && activeRuns > 0;
  const pause = useMutation('work.pause', {
    errorToast: 'Die Arbeit konnte nicht pausiert werden',
    onSuccess: (w) => useDaemonStore.getState().setWork(w),
  });

  const close = () => {
    if (restore.loading) return;
    setTargetDir(null);
    onClose();
  };

  const pickFolder = async () => {
    const dir = await chooseDirectory({ title: 'Zielordner für die Wiederherstellung wählen' });
    if (dir === undefined) return dialogUnavailable();
    if (dir) setTargetDir(dir);
  };

  return (
    <Dialog
      open={backup !== null}
      onClose={close}
      dismissible={!restore.loading}
      icon={RotateCcw}
      tone="warning"
      title={isDb ? 'Datenbank-Sicherung einspielen?' : 'Projektkopie wiederherstellen?'}
      description={backup ? `Sicherung vom ${new Date(backup.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}` : undefined}
      footer={
        <>
          <Button onClick={close} disabled={restore.loading}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={restore.loading} disabled={blockedByWork} onClick={() => backup && void restore.run({ id: backup.id, ...(targetDir ? { targetDir } : {}) })}>
            {isDb ? 'Einspielen und neu starten' : 'Wiederherstellen'}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        {isDb ? (
          <>
            <p>Alle NOVA-Daten (Projekte, Aufgaben, Einstellungen, Gedächtnis) werden auf den Stand dieser Sicherung zurückgesetzt. Der aktuelle Stand wird vorher automatisch gesichert.</p>
            <Notice tone="warning">NOVA startet dafür den Hintergrunddienst neu. Projektdateien bleiben unverändert.</Notice>
            {blockedByWork && (
              <Notice
                tone="danger"
                title={activeRuns === 1 ? 'Gerade arbeitet ein Agent' : `Gerade arbeiten ${activeRuns} Agenten`}
                actions={
                  work?.state === 'running' ? (
                    <Button size="sm" icon={Pause} loading={pause.loading} onClick={() => void pause.run({})}>
                      Arbeit pausieren
                    </Button>
                  ) : undefined
                }
              >
                Während Agenten arbeiten, lässt sich die Datenbank nicht wiederherstellen. Bitte zuerst die Arbeit pausieren und warten, bis die laufenden Schritte beendet sind – danach lässt sich die Sicherung hier einspielen.
              </Notice>
            )}
          </>
        ) : (
          <>
            <p>
              Die Dateien {projectName ? `von „${projectName}“` : 'des Projekts'} werden in einen <strong>neuen Ordner</strong> kopiert. Das Original wird nie überschrieben.
            </p>
            <div className="rounded-lg border border-border bg-surface-2/50 p-3">
              <p className="text-xs font-medium text-text">Zielordner</p>
              <p className="mt-0.5 font-mono text-xs break-all text-muted">{targetDir ?? 'Standard: neben den anderen Projekten, mit „(Wiederherstellung <Datum>)“ im Namen'}</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" icon={FolderOpen} onClick={() => void pickFolder()}>
                  Anderen Ordner wählen …
                </Button>
                {targetDir && (
                  <Button size="sm" variant="ghost" onClick={() => setTargetDir(null)}>
                    Standard verwenden
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
        <OperationProgress operation={op} active={restore.loading} pendingLabel="Wird wiederhergestellt …" />
      </div>
    </Dialog>
  );
}
