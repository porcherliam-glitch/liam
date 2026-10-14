using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;

namespace Aetherfall.NPC
{
    /// <summary>
    /// All named NPCs by id as <see cref="NpcSpec"/>s. Built once at boot from the <see cref="NpcDefinition"/>s of the content
    /// database; tests build it from specs. Duplicate ids: the first wins (logged).
    /// </summary>
    public sealed class NpcCatalog
    {
        private readonly Dictionary<string, NpcSpec> _specs = new Dictionary<string, NpcSpec>(StringComparer.Ordinal);
        private readonly List<NpcSpec> _all = new List<NpcSpec>();

        /// <summary>Number of NPCs.</summary>
        public int Count => _all.Count;

        /// <summary>All NPCs in registration order.</summary>
        public IReadOnlyList<NpcSpec> All => _all;

        /// <summary>Builds the catalog from all NPC definitions of the content database.</summary>
        /// <param name="database">Content database (null = empty).</param>
        public static NpcCatalog FromDatabase(IContentDatabase database)
        {
            var catalog = new NpcCatalog();
            if (database == null)
            {
                return catalog;
            }

            IReadOnlyList<NpcDefinition> definitions = database.GetAll<NpcDefinition>();
            for (int i = 0; i < definitions.Count; i++)
            {
                if (definitions[i] != null)
                {
                    catalog.Add(definitions[i].CreateSpec());
                }
            }

            return catalog;
        }

        /// <summary>Builds the catalog from specs.</summary>
        /// <param name="specs">Specs.</param>
        public static NpcCatalog FromSpecs(params NpcSpec[] specs)
        {
            var catalog = new NpcCatalog();
            if (specs != null)
            {
                for (int i = 0; i < specs.Length; i++)
                {
                    catalog.Add(specs[i]);
                }
            }

            return catalog;
        }

        /// <summary>Adds an NPC; empty or duplicate ids are rejected with a log entry.</summary>
        /// <param name="spec">Spec.</param>
        public bool Add(NpcSpec spec)
        {
            if (spec == null || spec.Id.Length == 0)
            {
                Log.Warning(LogCategory.NPC, "NpcCatalog: NPC without id ignored.");
                return false;
            }

            if (_specs.ContainsKey(spec.Id))
            {
                Log.Error(LogCategory.NPC, "NpcCatalog: duplicate NPC id '" + spec.Id + "', the first definition wins.");
                return false;
            }

            _specs.Add(spec.Id, spec);
            _all.Add(spec);
            return true;
        }

        /// <summary>Returns an NPC.</summary>
        /// <param name="npcId">NPC id.</param>
        /// <param name="spec">The spec.</param>
        public bool TryGet(string npcId, out NpcSpec spec)
        {
            if (npcId != null && _specs.TryGetValue(npcId, out spec))
            {
                return true;
            }

            spec = null;
            return false;
        }
    }
}
