using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;

namespace Aetherfall.WorldState
{
    /// <summary>
    /// All defined world state entries by id (architecture 8.2). Built once at boot from the <see cref="FlagDefinition"/>s of
    /// the content database; tests build it from <see cref="FlagSpec"/>s. Duplicate ids: the first wins (logged).
    /// </summary>
    public sealed class FlagRegistry
    {
        private readonly Dictionary<string, FlagSpec> _specs = new Dictionary<string, FlagSpec>(StringComparer.Ordinal);
        private readonly List<FlagSpec> _all = new List<FlagSpec>();

        /// <summary>Number of defined flags.</summary>
        public int Count => _all.Count;

        /// <summary>All specs in registration order.</summary>
        public IReadOnlyList<FlagSpec> All => _all;

        /// <summary>Builds the registry from all flag definitions of the content database.</summary>
        /// <param name="database">Content database (null = empty registry).</param>
        public static FlagRegistry FromDatabase(IContentDatabase database)
        {
            var registry = new FlagRegistry();
            if (database == null)
            {
                return registry;
            }

            IReadOnlyList<FlagDefinition> definitions = database.GetAll<FlagDefinition>();
            for (int i = 0; i < definitions.Count; i++)
            {
                if (definitions[i] != null)
                {
                    registry.Add(definitions[i].CreateSpec());
                }
            }

            return registry;
        }

        /// <summary>Builds the registry from specs (tests, code).</summary>
        /// <param name="specs">Specs.</param>
        public static FlagRegistry FromSpecs(params FlagSpec[] specs)
        {
            var registry = new FlagRegistry();
            if (specs != null)
            {
                for (int i = 0; i < specs.Length; i++)
                {
                    registry.Add(specs[i]);
                }
            }

            return registry;
        }

        /// <summary>Adds a spec. Empty or duplicate ids are rejected with a log entry.</summary>
        /// <param name="spec">Spec.</param>
        /// <returns>True if added.</returns>
        public bool Add(FlagSpec spec)
        {
            if (spec == null || spec.Id.Length == 0)
            {
                Log.Warning(LogCategory.World, "FlagRegistry: flag definition without id ignored.");
                return false;
            }

            if (_specs.ContainsKey(spec.Id))
            {
                Log.Error(LogCategory.World, "FlagRegistry: duplicate flag id '" + spec.Id + "', the first definition wins.");
                return false;
            }

            _specs.Add(spec.Id, spec);
            _all.Add(spec);
            return true;
        }

        /// <summary>Finds a spec.</summary>
        /// <param name="flagId">Flag id.</param>
        /// <param name="spec">Spec or null.</param>
        public bool TryGet(string flagId, out FlagSpec spec)
        {
            if (flagId == null)
            {
                spec = null;
                return false;
            }

            return _specs.TryGetValue(flagId, out spec);
        }

        /// <summary>True if the id is defined.</summary>
        /// <param name="flagId">Flag id.</param>
        public bool IsDefined(string flagId)
        {
            return flagId != null && _specs.ContainsKey(flagId);
        }
    }
}
