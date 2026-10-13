using System;
using System.Collections.Generic;
using Aetherfall.Core;

namespace Aetherfall.Data
{
    /// <summary>
    /// Default <see cref="IContentDatabase"/> (architecture 5.2): an id index over all registered definitions plus a cached
    /// list per requested type. Duplicate ids are logged as errors (the first one wins), invalid ids as warnings.
    /// </summary>
    /// <remarks>
    /// Filled by <see cref="ContentInstaller"/> from <see cref="ContentCatalog"/> assets. TODO (Addressables step): load all
    /// definitions with the label <c>content.def</c> in <c>InitializeAsync</c>, register id aliases of the
    /// <c>IdMigrationTable</c> and implement <c>IIdAliasResolver</c> (architecture 5.2). Main thread only.
    /// </remarks>
    public sealed class ContentDatabase : IContentDatabase
    {
        private readonly ContentIndex<GameDefinition> _index = new ContentIndex<GameDefinition>();
        private readonly Dictionary<Type, object> _listsByType = new Dictionary<Type, object>();

        /// <summary>Number of registered definitions.</summary>
        public int Count => _index.Count;

        /// <summary>Registers a definition.</summary>
        /// <param name="definition">Definition; null entries are ignored.</param>
        /// <returns>True if it was added; false for null, an empty id or a duplicate (logged).</returns>
        public bool Register(GameDefinition definition)
        {
            if (definition == null)
            {
                return false;
            }

            string id = definition.Id;
            if (string.IsNullOrEmpty(id))
            {
                Log.Error(LogCategory.Data, "Definition '" + definition.name + "' has no id and is ignored.");
                return false;
            }

            if (!ContentIdRules.IsValid(id))
            {
                Log.Warning(LogCategory.Data, "Definition '" + definition.name + "' has the id '" + id + "', which breaks the id format " +
                                              "(architecture 6.1: a-z, 0-9, _ and dots, e.g. item.weapon.schwert).");
            }

            if (_index.TryGet(id, out GameDefinition existing))
            {
                if (!ReferenceEquals(existing, definition))
                {
                    Log.Error(LogCategory.Data, "Duplicate content id '" + id + "': '" + definition.name + "' is ignored, '" + existing.name + "' wins.");
                }

                return false;
            }

            _index.TryAdd(id, definition);
            _listsByType.Clear();
            return true;
        }

        /// <summary>Registers several definitions.</summary>
        /// <param name="definitions">Definitions (null entries are skipped).</param>
        /// <returns>Number of added definitions.</returns>
        public int RegisterAll(IEnumerable<GameDefinition> definitions)
        {
            if (definitions == null)
            {
                return 0;
            }

            int added = 0;
            foreach (GameDefinition definition in definitions)
            {
                if (Register(definition))
                {
                    added++;
                }
            }

            return added;
        }

        /// <inheritdoc />
        public T Get<T>(string id) where T : GameDefinition
        {
            if (!_index.TryGet(id, out GameDefinition definition))
            {
                throw new KeyNotFoundException("No content definition with the id '" + id + "'.");
            }

            if (!(definition is T typed))
            {
                throw new InvalidCastException("Content '" + id + "' is a " + definition.GetType().Name + ", not a " + typeof(T).Name + ".");
            }

            return typed;
        }

        /// <inheritdoc />
        public bool TryGet<T>(string id, out T definition) where T : GameDefinition
        {
            definition = null;
            if (!_index.TryGet(id, out GameDefinition found))
            {
                Log.Warning(LogCategory.Data, "Unknown content id '" + id + "' (" + typeof(T).Name + ").");
                return false;
            }

            if (!(found is T typed))
            {
                Log.Warning(LogCategory.Data, "Content '" + id + "' is a " + found.GetType().Name + ", expected " + typeof(T).Name + ".");
                return false;
            }

            definition = typed;
            return true;
        }

        /// <inheritdoc />
        public IReadOnlyList<T> GetAll<T>() where T : GameDefinition
        {
            if (_listsByType.TryGetValue(typeof(T), out object cached))
            {
                return (List<T>)cached;
            }

            var list = new List<T>();
            IReadOnlyList<GameDefinition> entries = _index.Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                if (entries[i] is T typed)
                {
                    list.Add(typed);
                }
            }

            _listsByType[typeof(T)] = list;
            return list;
        }

        /// <inheritdoc />
        public bool Exists(string id)
        {
            return _index.Contains(id);
        }
    }
}
