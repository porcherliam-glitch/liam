// Dialogs for user file operations in the studio tree: new file, new folder, rename, delete.
import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { FilePlus, FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { Button, ConfirmDialog, Dialog, Input } from '../../components/ui';
import { api, errorMessage, isRpcError } from '../../lib/api';
import { toast } from '../../stores/toasts';
import { fileName, joinPath, normalizeEntryName, parentPath, validateEntryName } from './studio-utils';

export type EntryAction =
  | { kind: 'newFile'; dir: string }
  | { kind: 'newFolder'; dir: string }
  | { kind: 'rename'; path: string; type: 'file' | 'dir' }
  | { kind: 'delete'; path: string; type: 'file' | 'dir' };

export interface EntryDialogsProps {
  projectId: string;
  action: EntryAction | null;
  onClose: () => void;
  /** A file was created (open it). */
  onCreatedFile: (path: string) => void;
  onCreatedFolder: (path: string) => void;
  onRenamed: (from: string, to: string) => void;
  onDeleted: (path: string) => void;
}

/** Renders the dialog for the current tree action (or nothing). */
export function EntryDialogs({ projectId, action, onClose, onCreatedFile, onCreatedFolder, onRenamed, onDeleted }: EntryDialogsProps) {
  if (!action) return null;
  if (action.kind === 'delete') return <DeleteDialog projectId={projectId} path={action.path} type={action.type} onClose={onClose} onDeleted={onDeleted} />;
  return <NameDialog projectId={projectId} action={action} onClose={onClose} onCreatedFile={onCreatedFile} onCreatedFolder={onCreatedFolder} onRenamed={onRenamed} />;
}

function NameDialog({
  projectId,
  action,
  onClose,
  onCreatedFile,
  onCreatedFolder,
  onRenamed,
}: {
  projectId: string;
  action: Exclude<EntryAction, { kind: 'delete' }>;
  onClose: () => void;
  onCreatedFile: (path: string) => void;
  onCreatedFolder: (path: string) => void;
  onRenamed: (from: string, to: string) => void;
}) {
  const initial = action.kind === 'rename' ? fileName(action.path) : '';
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dir = action.kind === 'rename' ? parentPath(action.path) : action.dir;

  // Focus right after mounting (not a frame later, so no typed character gets selected away).
  // When renaming a file, the name without the extension is selected.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (action.kind === 'rename' && action.type === 'file') {
      const dot = initial.lastIndexOf('.');
      el.setSelectionRange(0, dot > 0 ? dot : initial.length);
    } else {
      el.select();
    }
  }, [action, initial]);

  const title = action.kind === 'newFile' ? 'Neue Datei' : action.kind === 'newFolder' ? 'Neuer Ordner' : action.type === 'dir' ? 'Ordner umbenennen' : 'Datei umbenennen';
  const icon = action.kind === 'newFile' ? FilePlus : action.kind === 'newFolder' ? FolderPlus : Pencil;
  const submitLabel = action.kind === 'rename' ? 'Umbenennen' : 'Anlegen';
  const location = dir ? `im Ordner „${dir}“` : 'im Projektordner';

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const invalid = validateEntryName(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    const target = joinPath(dir, normalizeEntryName(name));
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'rename') {
        if (target === action.path) {
          onClose();
          return;
        }
        await api('files.rename', { projectId, from: action.path, to: target });
        toast.success('Umbenannt', `${action.path} → ${target}`);
        onRenamed(action.path, target);
      } else if (action.kind === 'newFolder') {
        await api('files.mkdir', { projectId, path: target });
        toast.success('Ordner angelegt', target);
        onCreatedFolder(target);
      } else {
        // files.write would overwrite an existing file – make sure there is none first.
        let exists = false;
        try {
          await api('files.read', { projectId, path: target });
          exists = true;
        } catch (readError) {
          if (!isRpcError(readError, 'NOT_FOUND')) throw readError;
        }
        if (exists) {
          setError('Eine Datei mit diesem Namen gibt es hier schon.');
          setBusy(false);
          return;
        }
        await api('files.write', { projectId, path: target, content: '', expectedHash: null });
        toast.success('Datei angelegt', target);
        onCreatedFile(target);
      }
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => !busy && onClose()}
      title={title}
      description={action.kind === 'rename' ? `Neuer Name für „${action.path}“.` : `Wird ${location} angelegt. Unterordner sind mit „/“ möglich, z. B. „ui/menu.ts“.`}
      icon={icon}
      size="sm"
      dismissible={!busy}
      initialFocus={inputRef}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => void submit(e)} noValidate>
        <Input
          ref={inputRef}
          label="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          error={error}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </form>
    </Dialog>
  );
}

function DeleteDialog({ projectId, path, type, onClose, onDeleted }: { projectId: string; path: string; type: 'file' | 'dir'; onClose: () => void; onDeleted: (path: string) => void }) {
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    setBusy(true);
    try {
      await api('files.delete', { projectId, path });
      toast.success(type === 'dir' ? 'Ordner gelöscht' : 'Datei gelöscht', path);
      onDeleted(path);
      onClose();
    } catch (e) {
      toast.error('Löschen fehlgeschlagen', errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <ConfirmDialog
      open
      tone="danger"
      icon={Trash2}
      title={type === 'dir' ? `Ordner „${fileName(path)}“ löschen?` : `Datei „${fileName(path)}“ löschen?`}
      message={
        type === 'dir'
          ? 'Der Ordner und alle Dateien darin werden aus dem Projektordner gelöscht.'
          : 'Die Datei wird aus dem Projektordner gelöscht.'
      }
      confirmLabel="Löschen"
      loading={busy}
      onConfirm={confirm}
      onCancel={onClose}
    >
      <p className="text-xs text-muted">NOVA protokolliert die Löschung im Änderungsverlauf des Projekts.</p>
      <p className="rounded-md bg-surface-2 px-2 py-1 font-mono text-xs break-all">{path}</p>
    </ConfirmDialog>
  );
}
