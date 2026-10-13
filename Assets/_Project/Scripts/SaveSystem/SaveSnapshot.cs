using System;
using System.Collections.Generic;

namespace Aetherfall.SaveSystem
{
    /// <summary>
    /// A save in memory: header plus the DTO of every section in load order. Taken on the main thread
    /// (<see cref="ISaveable.Save"/>), serialized on a background thread (<see cref="SaveDocumentCodec"/>).
    /// </summary>
    public sealed class SaveSnapshot
    {
        private readonly List<SaveSection> _sections = new List<SaveSection>();

        /// <summary>Creates an empty snapshot.</summary>
        /// <param name="header">Header (not null).</param>
        public SaveSnapshot(SaveHeader header)
        {
            Header = header ?? throw new ArgumentNullException(nameof(header));
        }

        /// <summary>The header.</summary>
        public SaveHeader Header { get; }

        /// <summary>Sections in the order they were added (load order when written by the save manager).</summary>
        public IReadOnlyList<SaveSection> Sections => _sections;

        /// <summary>Adds a section.</summary>
        /// <param name="key">Save key (unique).</param>
        /// <param name="data">DTO or null.</param>
        /// <exception cref="ArgumentException">The key is empty or already present.</exception>
        public void Add(string key, object data)
        {
            if (string.IsNullOrEmpty(key))
            {
                throw new ArgumentException("A section key is required.", nameof(key));
            }

            if (TryGet(key, out _))
            {
                throw new ArgumentException("Section '" + key + "' exists twice.", nameof(key));
            }

            _sections.Add(new SaveSection(key, data));
        }

        /// <summary>Finds a section.</summary>
        /// <param name="key">Save key.</param>
        /// <param name="data">DTO or null.</param>
        /// <returns>True if the section exists (its data may still be null).</returns>
        public bool TryGet(string key, out object data)
        {
            for (int i = 0; i < _sections.Count; i++)
            {
                if (string.Equals(_sections[i].Key, key, StringComparison.Ordinal))
                {
                    data = _sections[i].Data;
                    return true;
                }
            }

            data = null;
            return false;
        }
    }
}
