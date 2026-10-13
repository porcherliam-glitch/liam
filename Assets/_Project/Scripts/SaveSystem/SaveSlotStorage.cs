using System;
using System.Collections.Generic;
using System.IO;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// File level of the save system (architecture 9.4): atomic writing with temp file, verification and backup,
    /// reading of main file, backup and header, moving damaged files to <c>Beschaedigt/</c>, removing orphaned temp files.
    /// Works only through <see cref="IFileStore"/>; safe on a background thread.
    /// </summary>
    /// <remarks>
    /// Write order: (1) JSON into <c>&lt;slot&gt;.sav.tmp</c> with flush, (2) read back, size &gt; 0 and checksum equal,
    /// (3) <c>Replace(tmp, sav, bak)</c> or <c>Move(tmp, sav)</c>, (4) the header file the same way. An error in 1–3 deletes the
    /// temp file and leaves the previous save untouched (GDD 05 5.6).
    /// </remarks>
    public sealed class SaveSlotStorage
    {
        private readonly IFileStore _files;

        /// <summary>Creates the storage.</summary>
        /// <param name="files">File access.</param>
        /// <param name="paths">Path scheme.</param>
        public SaveSlotStorage(IFileStore files, SavePaths paths)
        {
            _files = files ?? throw new ArgumentNullException(nameof(files));
            Paths = paths ?? throw new ArgumentNullException(nameof(paths));
        }

        /// <summary>Path scheme.</summary>
        public SavePaths Paths { get; }

        /// <summary>Writes a slot atomically (see remarks).</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        /// <param name="saveBytes">Content of the <c>.sav</c> file.</param>
        /// <param name="headBytes">Content of the <c>.head.json</c> file.</param>
        public StorageWriteResult WriteSlot(string characterId, string slotName, byte[] saveBytes, byte[] headBytes)
        {
            if (saveBytes == null || saveBytes.Length == 0)
            {
                return new StorageWriteResult(false, SaveReasonKeys.SerializeFailed, "Nothing to write.");
            }

            string savePath = Paths.SaveFile(characterId, slotName);
            string error = WriteVerified(Paths.CharacterDirectory(characterId), savePath, saveBytes, Paths.BackupFile(characterId, slotName), out string reason);
            if (error.Length > 0)
            {
                return new StorageWriteResult(false, reason, error);
            }

            string headError = headBytes != null && headBytes.Length > 0
                ? WriteVerified(Paths.CharacterDirectory(characterId), Paths.HeadFile(characterId, slotName), headBytes, null, out _)
                : "no header data";
            return headError.Length > 0
                ? new StorageWriteResult(true, string.Empty, "Save written, but the header file could not be updated: " + headError)
                : new StorageWriteResult(true, string.Empty, string.Empty);
        }

        /// <summary>Reads the main file of a slot.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        /// <param name="bytes">Content or null.</param>
        /// <returns>True if it exists and could be read.</returns>
        public bool TryReadSave(string characterId, string slotName, out byte[] bytes)
        {
            return TryRead(Paths.SaveFile(characterId, slotName), out bytes);
        }

        /// <summary>Reads the backup of a slot.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        /// <param name="bytes">Content or null.</param>
        /// <returns>True if it exists and could be read.</returns>
        public bool TryReadBackup(string characterId, string slotName, out byte[] bytes)
        {
            return TryRead(Paths.BackupFile(characterId, slotName), out bytes);
        }

        /// <summary>Reads the header file of a slot.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        /// <param name="bytes">Content or null.</param>
        /// <returns>True if it exists and could be read.</returns>
        public bool TryReadHead(string characterId, string slotName, out byte[] bytes)
        {
            return TryRead(Paths.HeadFile(characterId, slotName), out bytes);
        }

        /// <summary>True if the slot has a backup.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        public bool HasBackup(string characterId, string slotName)
        {
            return _files.FileExists(Paths.BackupFile(characterId, slotName));
        }

        /// <summary>True if the header file of the slot exists.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        public bool HasHead(string characterId, string slotName)
        {
            return _files.FileExists(Paths.HeadFile(characterId, slotName));
        }

        /// <summary>True if the main file of the slot exists.</summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        public bool HasSave(string characterId, string slotName)
        {
            return _files.FileExists(Paths.SaveFile(characterId, slotName));
        }

        /// <summary>
        /// Moves the damaged main file into <c>Beschaedigt/&lt;slot&gt;_&lt;stamp&gt;.sav</c> for error reports; never deletes it
        /// (architecture 9.4). The header file stays: without main file and backup the slot counts as damaged
        /// (<see cref="SaveSlotInfo.IsDamaged"/>), is shown with the warning "Beschaedigt" and skipped by quick load (GDD 05 5.6).
        /// </summary>
        /// <param name="characterId">Character folder.</param>
        /// <param name="slotName">Slot name.</param>
        /// <param name="stamp">Unique suffix, e.g. the UTC time <c>20261013T183000Z</c>.</param>
        /// <returns>New path, or null if there was nothing to move or the move failed.</returns>
        public string Quarantine(string characterId, string slotName, string stamp)
        {
            string source = Paths.SaveFile(characterId, slotName);
            if (!_files.FileExists(source))
            {
                return null;
            }

            try
            {
                string folder = Paths.CorruptDirectory(characterId);
                _files.CreateDirectory(folder);
                string target = Path.Combine(folder, slotName + "_" + stamp + SaveFormat.SaveExtension);
                int counter = 1;
                while (_files.FileExists(target))
                {
                    target = Path.Combine(folder, slotName + "_" + stamp + "_" + counter++ + SaveFormat.SaveExtension);
                }

                _files.Move(source, target);
                return target;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                return null;
            }
        }

        /// <summary>Deletes orphaned <c>.tmp</c> files of all characters (left by a crash while saving, architecture 9.4).</summary>
        /// <returns>Number of deleted files.</returns>
        public int DeleteOrphanedTempFiles()
        {
            int deleted = 0;
            IReadOnlyList<string> characters = _files.GetDirectories(Paths.Root);
            for (int c = 0; c < characters.Count; c++)
            {
                IReadOnlyList<string> temps = _files.GetFiles(characters[c], SaveFormat.TempSuffix);
                for (int i = 0; i < temps.Count; i++)
                {
                    try
                    {
                        _files.Delete(temps[i]);
                        deleted++;
                    }
                    catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
                    {
                        // Locked by another process: try again at the next start.
                    }
                }
            }

            return deleted;
        }

        /// <summary>Slot names of a character: every <c>.head.json</c> and every <c>.sav</c>, sorted.</summary>
        /// <param name="characterId">Character folder.</param>
        public IReadOnlyList<string> ListSlotNames(string characterId)
        {
            var names = new List<string>();
            string folder = Paths.CharacterDirectory(characterId);
            AddNames(names, _files.GetFiles(folder, SaveFormat.HeadExtension), SaveFormat.HeadExtension);
            AddNames(names, _files.GetFiles(folder, SaveFormat.SaveExtension), SaveFormat.SaveExtension);
            names.Sort(StringComparer.Ordinal);
            return names;
        }

        private static void AddNames(List<string> names, IReadOnlyList<string> files, string extension)
        {
            for (int i = 0; i < files.Count; i++)
            {
                string fileName = Path.GetFileName(files[i]);
                if (!fileName.EndsWith(extension, StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                string name = fileName.Substring(0, fileName.Length - extension.Length);
                if (SaveSlotId.IsValidName(name) && !names.Contains(name))
                {
                    names.Add(name);
                }
            }
        }

        private bool TryRead(string path, out byte[] bytes)
        {
            bytes = null;
            if (!_files.FileExists(path))
            {
                return false;
            }

            try
            {
                bytes = _files.ReadAllBytes(path);
                return bytes != null;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                return false;
            }
        }

        private string WriteVerified(string folder, string path, byte[] data, string backupPath, out string reasonKey)
        {
            string tempPath = SavePaths.TempFile(path);
            reasonKey = SaveReasonKeys.WriteFailed;
            try
            {
                _files.CreateDirectory(folder);
                _files.WriteAllBytes(tempPath, data);
                byte[] check = _files.ReadAllBytes(tempPath);
                if (check == null || check.Length == 0 || check.Length != data.Length ||
                    !string.Equals(SaveChecksum.Sha256Hex(check), SaveChecksum.Sha256Hex(data), StringComparison.Ordinal))
                {
                    reasonKey = SaveReasonKeys.VerifyFailed;
                    TryDelete(tempPath);
                    return "Verification of '" + tempPath + "' failed (size or checksum differs).";
                }

                if (_files.FileExists(path))
                {
                    _files.Replace(tempPath, path, backupPath);
                }
                else
                {
                    _files.Move(tempPath, path);
                }

                return string.Empty;
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException ||
                                              exception is NotSupportedException || exception is ArgumentException)
            {
                TryDelete(tempPath);
                return exception.GetType().Name + ": " + exception.Message;
            }
        }

        private void TryDelete(string path)
        {
            try
            {
                _files.Delete(path);
            }
            catch (Exception exception) when (exception is IOException || exception is UnauthorizedAccessException)
            {
                // Removed at the next start (DeleteOrphanedTempFiles).
            }
        }
    }
}
