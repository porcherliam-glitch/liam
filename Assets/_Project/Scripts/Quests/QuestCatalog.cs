using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;

namespace Aetherfall.Quests
{
    /// <summary>
    /// All quests by id as <see cref="QuestSpec"/>s. Built once at boot from the <see cref="QuestDefinition"/>s of the content
    /// database; tests build it from specs. Duplicate ids: the first wins (logged; the validator reports V01).
    /// </summary>
    public sealed class QuestCatalog
    {
        private readonly Dictionary<string, QuestSpec> _specs = new Dictionary<string, QuestSpec>(StringComparer.Ordinal);
        private readonly List<QuestSpec> _all = new List<QuestSpec>();

        /// <summary>Number of quests.</summary>
        public int Count => _all.Count;

        /// <summary>All quests in registration order.</summary>
        public IReadOnlyList<QuestSpec> All => _all;

        /// <summary>Builds the catalog from all quest definitions of the content database.</summary>
        /// <param name="database">Content database (null = empty).</param>
        public static QuestCatalog FromDatabase(IContentDatabase database)
        {
            var catalog = new QuestCatalog();
            if (database == null)
            {
                return catalog;
            }

            IReadOnlyList<QuestDefinition> definitions = database.GetAll<QuestDefinition>();
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
        public static QuestCatalog FromSpecs(params QuestSpec[] specs)
        {
            var catalog = new QuestCatalog();
            if (specs != null)
            {
                for (int i = 0; i < specs.Length; i++)
                {
                    catalog.Add(specs[i]);
                }
            }

            return catalog;
        }

        /// <summary>Adds a quest; empty or duplicate ids are rejected with a log entry.</summary>
        /// <param name="spec">Spec.</param>
        public bool Add(QuestSpec spec)
        {
            if (spec == null || spec.Id.Length == 0)
            {
                Log.Warning(LogCategory.Quests, "QuestCatalog: quest without id ignored.");
                return false;
            }

            if (_specs.ContainsKey(spec.Id))
            {
                Log.Error(LogCategory.Quests, "QuestCatalog: duplicate quest id '" + spec.Id + "', the first definition wins.");
                return false;
            }

            _specs.Add(spec.Id, spec);
            _all.Add(spec);
            return true;
        }

        /// <summary>Finds a quest.</summary>
        /// <param name="questId">Quest id.</param>
        /// <param name="spec">Spec or null.</param>
        public bool TryGet(string questId, out QuestSpec spec)
        {
            if (questId == null)
            {
                spec = null;
                return false;
            }

            return _specs.TryGetValue(questId, out spec);
        }

        /// <summary>True if the quest exists.</summary>
        /// <param name="questId">Quest id.</param>
        public bool Contains(string questId)
        {
            return questId != null && _specs.ContainsKey(questId);
        }
    }
}
