using System.Collections.Generic;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// File access of the save system (architecture 9.4) behind an interface, so tests run with an in-memory store and
    /// can simulate failures. <see cref="SystemFileStore"/> is the real implementation. Paths are absolute.
    /// </summary>
    /// <remarks>Implementations must be usable from a background thread (one operation at a time).</remarks>
    public interface IFileStore
    {
        /// <summary>True if the file exists.</summary>
        /// <param name="path">File path.</param>
        bool FileExists(string path);

        /// <summary>Creates a directory and its parents (no error if it exists).</summary>
        /// <param name="path">Directory path.</param>
        void CreateDirectory(string path);

        /// <summary>Reads a whole file.</summary>
        /// <param name="path">File path.</param>
        /// <exception cref="System.IO.IOException">The file cannot be read.</exception>
        byte[] ReadAllBytes(string path);

        /// <summary>Creates or overwrites a file and flushes it to the disk before returning.</summary>
        /// <param name="path">File path.</param>
        /// <param name="data">Content.</param>
        /// <exception cref="System.IO.IOException">The file cannot be written.</exception>
        void WriteAllBytes(string path, byte[] data);

        /// <summary>Renames a file; the destination must not exist.</summary>
        /// <param name="source">Existing file.</param>
        /// <param name="destination">New path.</param>
        void Move(string source, string destination);

        /// <summary>
        /// Replaces <paramref name="destination"/> with <paramref name="source"/> as atomically as the platform allows;
        /// the old destination becomes <paramref name="backup"/> (overwritten if present), or is dropped if backup is null.
        /// </summary>
        /// <param name="source">New file (removed afterwards).</param>
        /// <param name="destination">Existing file to replace.</param>
        /// <param name="backup">Backup path or null.</param>
        void Replace(string source, string destination, string backup);

        /// <summary>Deletes a file (no error if it does not exist).</summary>
        /// <param name="path">File path.</param>
        void Delete(string path);

        /// <summary>Full paths of the files in a directory whose names end with <paramref name="suffix"/> (empty if the directory is missing).</summary>
        /// <param name="directory">Directory path.</param>
        /// <param name="suffix">Name suffix, e.g. <c>.head.json</c>.</param>
        IReadOnlyList<string> GetFiles(string directory, string suffix);

        /// <summary>Full paths of the sub directories (empty if the directory is missing).</summary>
        /// <param name="directory">Directory path.</param>
        IReadOnlyList<string> GetDirectories(string directory);
    }
}
