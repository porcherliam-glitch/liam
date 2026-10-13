using System;
using System.Collections.Generic;
using System.IO;
using Aetherfall.SaveSystem;

namespace Aetherfall.Tests.EditMode.Save
{
    /// <summary>
    /// <see cref="IFileStore"/> in memory for save tests, with simulated failures (disk full, damaged write, failing
    /// replace). Paths are normalized to forward slashes.
    /// </summary>
    public sealed class InMemoryFileStore : IFileStore
    {
        private readonly Dictionary<string, byte[]> _files = new Dictionary<string, byte[]>(StringComparer.Ordinal);
        private readonly HashSet<string> _directories = new HashSet<string>(StringComparer.Ordinal);

        /// <summary>The next <see cref="WriteAllBytes"/> throws an <see cref="IOException"/> ("disk full").</summary>
        public bool FailNextWrite { get; set; }

        /// <summary>The next <see cref="WriteAllBytes"/> stores damaged bytes (verification must fail).</summary>
        public bool CorruptNextWrite { get; set; }

        /// <summary>The next <see cref="Replace"/> throws an <see cref="IOException"/>.</summary>
        public bool FailNextReplace { get; set; }

        /// <summary>Number of successful writes.</summary>
        public int WriteCount { get; private set; }

        /// <summary>Paths passed to <see cref="ReadAllBytes"/> (normalized), in call order; clear it to count from a point on.</summary>
        public List<string> ReadLog { get; } = new List<string>();

        /// <summary>All file paths (normalized).</summary>
        public IEnumerable<string> Paths => _files.Keys;

        /// <summary>Normalizes a path to forward slashes.</summary>
        /// <param name="path">Path.</param>
        public static string Normalize(string path)
        {
            return path.Replace('\\', '/').TrimEnd('/');
        }

        /// <summary>Puts a file directly into the store (test setup).</summary>
        /// <param name="path">Path.</param>
        /// <param name="data">Content.</param>
        public void Put(string path, byte[] data)
        {
            string key = Normalize(path);
            AddDirectory(Parent(key));
            _files[key] = (byte[])data.Clone();
        }

        /// <summary>Content of a file, or null.</summary>
        /// <param name="path">Path.</param>
        public byte[] Get(string path)
        {
            return _files.TryGetValue(Normalize(path), out byte[] data) ? (byte[])data.Clone() : null;
        }

        /// <inheritdoc />
        public bool FileExists(string path)
        {
            return _files.ContainsKey(Normalize(path));
        }

        /// <inheritdoc />
        public void CreateDirectory(string path)
        {
            AddDirectory(Normalize(path));
        }

        /// <inheritdoc />
        public byte[] ReadAllBytes(string path)
        {
            ReadLog.Add(Normalize(path));
            if (!_files.TryGetValue(Normalize(path), out byte[] data))
            {
                throw new FileNotFoundException("No file " + path);
            }

            return (byte[])data.Clone();
        }

        /// <inheritdoc />
        public void WriteAllBytes(string path, byte[] data)
        {
            if (FailNextWrite)
            {
                FailNextWrite = false;
                throw new IOException("Simulated: disk full");
            }

            byte[] stored = (byte[])data.Clone();
            if (CorruptNextWrite && stored.Length > 0)
            {
                CorruptNextWrite = false;
                stored[stored.Length / 2] ^= 0xFF;
            }

            Put(path, stored);
            WriteCount++;
        }

        /// <inheritdoc />
        public void Move(string source, string destination)
        {
            string from = Normalize(source);
            string to = Normalize(destination);
            if (!_files.TryGetValue(from, out byte[] data))
            {
                throw new FileNotFoundException("No file " + source);
            }

            if (_files.ContainsKey(to))
            {
                throw new IOException("Destination exists: " + destination);
            }

            _files.Remove(from);
            Put(to, data);
        }

        /// <inheritdoc />
        public void Replace(string source, string destination, string backup)
        {
            if (FailNextReplace)
            {
                FailNextReplace = false;
                throw new IOException("Simulated: replace failed");
            }

            string from = Normalize(source);
            string to = Normalize(destination);
            if (!_files.TryGetValue(from, out byte[] data) || !_files.TryGetValue(to, out byte[] old))
            {
                throw new FileNotFoundException("Replace needs both files.");
            }

            if (backup != null)
            {
                Put(backup, old);
            }

            _files[to] = data;
            _files.Remove(from);
        }

        /// <inheritdoc />
        public void Delete(string path)
        {
            _files.Remove(Normalize(path));
        }

        /// <inheritdoc />
        public IReadOnlyList<string> GetFiles(string directory, string suffix)
        {
            string folder = Normalize(directory);
            var result = new List<string>();
            foreach (string path in _files.Keys)
            {
                if (Parent(path) == folder && path.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
                {
                    result.Add(path);
                }
            }

            result.Sort(StringComparer.Ordinal);
            return result;
        }

        /// <inheritdoc />
        public IReadOnlyList<string> GetDirectories(string directory)
        {
            string folder = Normalize(directory);
            var result = new List<string>();
            foreach (string path in _directories)
            {
                if (Parent(path) == folder)
                {
                    result.Add(path);
                }
            }

            result.Sort(StringComparer.Ordinal);
            return result;
        }

        private void AddDirectory(string path)
        {
            while (!string.IsNullOrEmpty(path) && _directories.Add(path))
            {
                path = Parent(path);
            }
        }

        private static string Parent(string path)
        {
            int slash = path.LastIndexOf('/');
            return slash > 0 ? path.Substring(0, slash) : string.Empty;
        }
    }
}
