using System;
using System.Collections.Generic;
using System.IO;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// <see cref="IFileStore"/> on the real file system (System.IO, works on macOS and Windows with Mono and IL2CPP).
    /// </summary>
    /// <remarks>
    /// <see cref="Replace"/> first copies the old destination to the backup and then calls
    /// <see cref="File.Replace(string, string, string, bool)"/> <b>without</b> a backup name. Reason: with a backup name Mono
    /// (the editor on macOS) does two renames (destination to backup, then source to destination); a crash between them
    /// leaves no main file, and the newest, already verified <c>.tmp</c> is deleted at the next start. Without a backup name
    /// it is a single, atomic rename on macOS (Windows uses ReplaceFile). There is always a complete main file
    /// (architecture 9.4: "Verhalten von File.Replace auf macOS und Windows in Phase 1 testen"). If the platform does not
    /// support File.Replace, the fallback deletes the destination and renames the source; a crash between the two leaves the
    /// backup, which the loader then uses.
    /// </remarks>
    public sealed class SystemFileStore : IFileStore
    {
        /// <inheritdoc />
        public bool FileExists(string path)
        {
            return File.Exists(path);
        }

        /// <inheritdoc />
        public void CreateDirectory(string path)
        {
            Directory.CreateDirectory(path);
        }

        /// <inheritdoc />
        public byte[] ReadAllBytes(string path)
        {
            return File.ReadAllBytes(path);
        }

        /// <inheritdoc />
        public void WriteAllBytes(string path, byte[] data)
        {
            using (var stream = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                stream.Write(data, 0, data.Length);
                stream.Flush(true);
            }
        }

        /// <inheritdoc />
        public void Move(string source, string destination)
        {
            File.Move(source, destination);
        }

        /// <inheritdoc />
        public void Replace(string source, string destination, string backup)
        {
            if (backup != null)
            {
                // Copy instead of rename (see remarks): the destination stays in place until the atomic swap below.
                File.Copy(destination, backup, true);
            }

            try
            {
                File.Replace(source, destination, null, true);
            }
            catch (PlatformNotSupportedException)
            {
                ReplaceByRenaming(source, destination);
            }
            catch (NotSupportedException)
            {
                ReplaceByRenaming(source, destination);
            }
        }

        /// <inheritdoc />
        public void Delete(string path)
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }

        /// <inheritdoc />
        public IReadOnlyList<string> GetFiles(string directory, string suffix)
        {
            var result = new List<string>();
            if (!Directory.Exists(directory))
            {
                return result;
            }

            foreach (string file in Directory.GetFiles(directory))
            {
                if (file.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(file);
                }
            }

            result.Sort(StringComparer.Ordinal);
            return result;
        }

        /// <inheritdoc />
        public IReadOnlyList<string> GetDirectories(string directory)
        {
            var result = new List<string>();
            if (!Directory.Exists(directory))
            {
                return result;
            }

            result.AddRange(Directory.GetDirectories(directory));
            result.Sort(StringComparer.Ordinal);
            return result;
        }

        private static void ReplaceByRenaming(string source, string destination)
        {
            File.Delete(destination);
            File.Move(source, destination);
        }
    }
}
