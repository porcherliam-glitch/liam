using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Data;

namespace Aetherfall.Items
{
    /// <summary>
    /// Default <see cref="IItemCatalog"/>: plain specs of all items, affixes and loot tables, built from the content database
    /// (<see cref="FromDatabase"/>) or filled directly in tests. Invalid entries are skipped with a reason.
    /// </summary>
    public sealed class ItemCatalog : IItemCatalog
    {
        private readonly ContentIndex<ItemSpec> _items = new ContentIndex<ItemSpec>();
        private readonly ContentIndex<LootTableSpec> _tables = new ContentIndex<LootTableSpec>();
        private readonly AffixPool _affixes = new AffixPool();
        private readonly List<ItemSpec> _weapons = new List<ItemSpec>();
        private readonly List<ItemSpec> _armor = new List<ItemSpec>();
        private readonly List<ItemSpec> _jewelry = new List<ItemSpec>();

        /// <inheritdoc />
        public IReadOnlyList<ItemSpec> Items => _items.Entries;

        /// <inheritdoc />
        public AffixPool Affixes => _affixes;

        /// <summary>All loot tables in registration order.</summary>
        public IReadOnlyList<LootTableSpec> LootTables => _tables.Entries;

        /// <summary>Builds the catalog from all item, affix and loot table definitions of the database; problems are logged.</summary>
        /// <param name="database">Content database.</param>
        public static ItemCatalog FromDatabase(IContentDatabase database)
        {
            var catalog = new ItemCatalog();
            if (database == null)
            {
                return catalog;
            }

            IReadOnlyList<ItemDefinition> items = database.GetAll<ItemDefinition>();
            for (int i = 0; i < items.Count; i++)
            {
                LogProblem(catalog.AddItem(items[i].CreateSpec()));
            }

            IReadOnlyList<AffixDefinition> affixes = database.GetAll<AffixDefinition>();
            for (int i = 0; i < affixes.Count; i++)
            {
                LogProblem(catalog.AddAffix(affixes[i].CreateSpec()));
            }

            IReadOnlyList<LootTableDefinition> tables = database.GetAll<LootTableDefinition>();
            for (int i = 0; i < tables.Count; i++)
            {
                LogProblem(catalog.AddLootTable(tables[i].CreateSpec()));
            }

            var problems = new List<string>();
            catalog.ValidateReferences(problems);
            for (int i = 0; i < problems.Count; i++)
            {
                Log.Warning(LogCategory.Data, problems[i]);
            }

            return catalog;
        }

        /// <summary>Adds an item.</summary>
        /// <param name="spec">Item data.</param>
        /// <returns>Empty string, or the reason why it was skipped.</returns>
        public string AddItem(ItemSpec spec)
        {
            if (spec == null)
            {
                return "Item is null.";
            }

            string problem = spec.Validate();
            if (problem.Length > 0)
            {
                return problem;
            }

            if (!_items.TryAdd(spec.Id, spec))
            {
                return "Duplicate item id '" + spec.Id + "'.";
            }

            if (spec.RandomDrop && spec.IsEquipment && spec.DropWeight > 0)
            {
                List<ItemSpec> pool = PoolOf(spec.Group);
                if (pool != null)
                {
                    pool.Add(spec);
                }
            }

            return string.Empty;
        }

        /// <summary>Adds an affix.</summary>
        /// <param name="spec">Affix data.</param>
        /// <returns>Empty string, or the reason why it was skipped.</returns>
        public string AddAffix(AffixSpec spec)
        {
            if (spec == null)
            {
                return "Affix is null.";
            }

            string problem = spec.Validate();
            if (problem.Length > 0)
            {
                return problem;
            }

            return _affixes.Add(spec) ? string.Empty : "Duplicate affix id '" + spec.Id + "'.";
        }

        /// <summary>Adds a loot table.</summary>
        /// <param name="spec">Table data.</param>
        /// <returns>Empty string, or the reason why it was skipped.</returns>
        public string AddLootTable(LootTableSpec spec)
        {
            if (spec == null)
            {
                return "Loot table is null.";
            }

            string problem = spec.Validate();
            if (problem.Length > 0)
            {
                return problem;
            }

            return _tables.TryAdd(spec.Id, spec) ? string.Empty : "Duplicate loot table id '" + spec.Id + "'.";
        }

        /// <inheritdoc />
        public bool TryGetItem(string itemId, out ItemSpec spec)
        {
            return _items.TryGet(itemId, out spec);
        }

        /// <inheritdoc />
        public bool TryGetLootTable(string tableId, out LootTableSpec table)
        {
            return _tables.TryGet(tableId, out table);
        }

        /// <inheritdoc />
        public IReadOnlyList<ItemSpec> RandomDropPool(EquipmentGroup group)
        {
            List<ItemSpec> pool = PoolOf(group);
            return pool ?? (IReadOnlyList<ItemSpec>)System.Array.Empty<ItemSpec>();
        }

        /// <summary>
        /// Checks the references between tables and items (GDD 04 5.1 validator: unknown ids, cycles, nesting deeper than
        /// 4) and appends one text per problem.
        /// </summary>
        /// <param name="problems">Receives the problems.</param>
        public void ValidateReferences(List<string> problems)
        {
            IReadOnlyList<LootTableSpec> tables = _tables.Entries;
            for (int t = 0; t < tables.Count; t++)
            {
                LootTableSpec table = tables[t];
                for (int e = 0; e < table.Entries.Count; e++)
                {
                    LootEntrySpec entry = table.Entries[e];
                    if (entry.Kind == LootEntryKind.Item && !_items.Contains(entry.RefId))
                    {
                        problems.Add("Loot table '" + table.Id + "' names the unknown item '" + entry.RefId + "'.");
                    }
                    else if (entry.Kind == LootEntryKind.Table && !_tables.Contains(entry.RefId))
                    {
                        problems.Add("Loot table '" + table.Id + "' names the unknown table '" + entry.RefId + "'.");
                    }
                    else if (entry.Kind == LootEntryKind.Equipment && _weapons.Count + _armor.Count + _jewelry.Count == 0)
                    {
                        problems.Add("Loot table '" + table.Id + "' has an equipment entry, but no item is in the random pool.");
                    }
                }

                if (Depth(table, 0) > LootRoller.MaxDepth)
                {
                    problems.Add("Loot table '" + table.Id + "' nests deeper than " + LootRoller.MaxDepth + " levels or contains a cycle.");
                }
            }
        }

        private int Depth(LootTableSpec table, int level)
        {
            if (level > LootRoller.MaxDepth)
            {
                return level;
            }

            int deepest = level;
            for (int e = 0; e < table.Entries.Count; e++)
            {
                LootEntrySpec entry = table.Entries[e];
                if (entry.Kind == LootEntryKind.Table && _tables.TryGet(entry.RefId, out LootTableSpec nested))
                {
                    int depth = Depth(nested, level + 1);
                    if (depth > deepest)
                    {
                        deepest = depth;
                    }

                    if (deepest > LootRoller.MaxDepth)
                    {
                        return deepest;
                    }
                }
            }

            return deepest;
        }

        private List<ItemSpec> PoolOf(EquipmentGroup group)
        {
            switch (group)
            {
                case EquipmentGroup.Weapon: return _weapons;
                case EquipmentGroup.Armor: return _armor;
                case EquipmentGroup.Jewelry: return _jewelry;
                default: return null;
            }
        }

        private static void LogProblem(string problem)
        {
            if (!string.IsNullOrEmpty(problem))
            {
                Log.Warning(LogCategory.Data, "Item catalog: " + problem + " The entry is skipped.");
            }
        }
    }
}
