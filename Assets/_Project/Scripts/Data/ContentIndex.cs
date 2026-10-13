using System;
using System.Collections.Generic;

namespace Aetherfall.Data
{
    /// <summary>
    /// Lookup table from id to entry with the rules of architecture 5.2: O(1) access, a duplicate id is rejected (the first
    /// entry wins), entries keep their registration order. Pure C#; used by <see cref="ContentDatabase"/> for definitions
    /// and by the item catalog for plain specs.
    /// </summary>
    /// <typeparam name="T">Entry type.</typeparam>
    public sealed class ContentIndex<T> where T : class
    {
        private readonly Dictionary<string, T> _byId = new Dictionary<string, T>(StringComparer.Ordinal);
        private readonly List<T> _ordered = new List<T>();

        /// <summary>Number of entries.</summary>
        public int Count => _ordered.Count;

        /// <summary>All entries in registration order.</summary>
        public IReadOnlyList<T> Entries => _ordered;

        /// <summary>Adds an entry.</summary>
        /// <param name="id">Id (must not be empty).</param>
        /// <param name="entry">Entry (not null).</param>
        /// <returns>False if the id is empty, the entry null or the id already used (the first entry stays).</returns>
        public bool TryAdd(string id, T entry)
        {
            if (string.IsNullOrEmpty(id) || entry == null || _byId.ContainsKey(id))
            {
                return false;
            }

            _byId.Add(id, entry);
            _ordered.Add(entry);
            return true;
        }

        /// <summary>Finds an entry.</summary>
        /// <param name="id">Id.</param>
        /// <param name="entry">Entry or null.</param>
        /// <returns>True if found.</returns>
        public bool TryGet(string id, out T entry)
        {
            if (string.IsNullOrEmpty(id))
            {
                entry = null;
                return false;
            }

            return _byId.TryGetValue(id, out entry);
        }

        /// <summary>True if the id is used.</summary>
        /// <param name="id">Id.</param>
        public bool Contains(string id)
        {
            return !string.IsNullOrEmpty(id) && _byId.ContainsKey(id);
        }

        /// <summary>Removes all entries.</summary>
        public void Clear()
        {
            _byId.Clear();
            _ordered.Clear();
        }
    }
}
