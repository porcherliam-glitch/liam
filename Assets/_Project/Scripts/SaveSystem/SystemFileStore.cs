using System;
using System.Collections.Generic;
using System.IO;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// <see cref="IFileStore"/> on the real file system (System.IO, works on macOS and Windows with Mono and IL2CPP).
    /// </summary>
    /// <remarks>
    /// <see cref="Replace"/> uses <see cref="File.Replace(string, string, string, bool)"/>. If the platform does not support
    /// it, it falls back to two renames (destination → backup, source → destination); a crash between them leaves the
    /// backup and the <c>.tmp</c> file, from which the loader recovers (architecture 9.4: "Verhalten von File.Replace auf
    /// macOS und Windows in Phase 1 testen").
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
            try
            {
                if (backup != null && File.Exists(backup))
                {
                    File.Delete(backup);
                }

                File.Replace(source, destination, backup, true);
            }
            catch (PlatformNotSupportedException)
            {
                ReplaceByRenaming(source, destination, backup);
            }
            catch (NotSupportedException)
            {
                ReplaceByRenaming(source, destination, backup);
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

        private static void ReplaceByRenaming(string source, string destination, string backup)
        {
            if (backup != null)
            {
                if (File.Exists(backup))
                {
                    File.Delete(backup);
                }

                File.Move(destination, backup);
            }
            else
            {
                File.Delete(destination);
            }

            File.Move(source, destination);
        }
    }
}
