using System;
using System.Collections.Generic;
using Aetherfall.Core;
using Aetherfall.Utilities;

namespace Aetherfall.Items
{
    /// <summary>
    /// Rolls loot tables (§12.5, architecture 11.6 "LootRoller rein C# mit IRandom und Bad-Luck-Zaehlern", GDD 04 5.4):
    /// guaranteed entries, number of rolls (table + extra rolls + 5 % per world tier for one more), weighted choice among the
    /// entries whose level condition holds (including "nothing"), nested tables (depth at most 4), fixed items, gold as
    /// multiple of G(L), currencies and random equipment (group, base item, item level, rarity with luck formula, minimum
    /// rarity and bad luck protection, affixes).
    /// </summary>
    /// <remarks>
    /// Pure C#, deterministic for the same <see cref="IRandom"/> sequence (the caller seeds it from the save seed, the source
    /// id and a counter, GDD 04 5.4 step 3). Unknown ids are logged and skipped.
    /// </remarks>
    public sealed class LootRoller
    {
        /// <summary>Deepest allowed nesting of tables (GDD 04 5.1).</summary>
        public const int MaxDepth = 4;

        /// <summary>Chance per world tier for one additional roll (GDD 04 5.4 step 5: 5 %).</summary>
        public const float ExtraRollChancePerWorldTier = 0.05f;

        private readonly IItemCatalog _catalog;
        private readonly ItemGenerator _generator;
        private readonly List<LootEntrySpec> _candidates = new List<LootEntrySpec>();

        /// <summary>Creates the roller.</summary>
        /// <param name="catalog">Items and tables.</param>
        /// <param name="generator">Item generator (null = one with the catalog's affix pool).</param>
        public LootRoller(IItemCatalog catalog, ItemGenerator generator = null)
        {
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _generator = generator ?? new ItemGenerator(catalog.Affixes);
        }

        /// <summary>The item generator in use.</summary>
        public ItemGenerator Generator => _generator;

        /// <summary>Rolls a table.</summary>
        /// <param name="tableId">Loot table id.</param>
        /// <param name="context">Source data (level, loot quality, luck …).</param>
        /// <param name="pity">Bad luck counters (updated; null = none).</param>
        /// <param name="random">Random source.</param>
        /// <returns>The drops (empty for an unknown table).</returns>
        public LootResult Roll(string tableId, in LootContext context, PityState pity, IRandom random)
        {
            if (random == null)
            {
                throw new ArgumentNullException(nameof(random));
            }

            var result = new LootResult(tableId, context.SourceId);
            if (!_catalog.TryGetLootTable(tableId, out LootTableSpec table))
            {
                Log.Warning(LogCategory.Data, "Loot: unknown loot table '" + tableId + "' (source '" + context.SourceId + "').");
                return result;
            }

            RollTable(table, context, pity, random, result, 0);
            return result;
        }

        /// <summary>Generates one random piece of equipment as an equipment entry would (debug drops, quest rewards later).</summary>
        /// <param name="group">Equipment group (None = by the default shares 50/40/10).</param>
        /// <param name="context">Source data.</param>
        /// <param name="pity">Bad luck counters (null = none).</param>
        /// <param name="random">Random source.</param>
        /// <param name="forcedRarity">Rarity to use instead of a roll (null = roll).</param>
        /// <returns>The item, or null if the pool is empty.</returns>
        public ItemInstance GenerateEquipment(EquipmentGroup group, in LootContext context, PityState pity, IRandom random, ItemRarity? forcedRarity = null)
        {
            var entry = new LootEntrySpec { Kind = LootEntryKind.Equipment };
            if (group != EquipmentGroup.None)
            {
                entry.WeaponShare = group == EquipmentGroup.Weapon ? 1 : 0;
                entry.ArmorShare = group == EquipmentGroup.Armor ? 1 : 0;
                entry.JewelryShare = group == EquipmentGroup.Jewelry ? 1 : 0;
            }

            return CreateEquipment(entry, context, pity, random, forcedRarity);
        }

        private void RollTable(LootTableSpec table, in LootContext context, PityState pity, IRandom random, LootResult result, int depth)
        {
            LootContext ctx = table.LootQualityOverride >= 0 ? context.WithLootQuality(table.LootQualityOverride) : context;
            List<LootEntrySpec> entries = table.Entries;
            for (int i = 0; i < entries.Count; i++)
            {
                LootEntrySpec entry = entries[i];
                if (entry.IsGuaranteed && entry.IsAvailable(ctx.SourceLevel))
                {
                    Emit(entry, ctx, pity, random, result, depth);
                }
            }

            int rolls = table.MaxRolls > table.MinRolls ? random.Range(table.MinRolls, table.MaxRolls + 1) : table.MinRolls;
            if (depth == 0)
            {
                rolls += ctx.ExtraRolls;
                if (ctx.WorldTier > 0 && random.NextFloat() < ExtraRollChancePerWorldTier * ctx.WorldTier)
                {
                    rolls++;
                }
            }

            for (int r = 0; r < rolls; r++)
            {
                LootEntrySpec picked = PickEntry(entries, ctx.SourceLevel, random);
                if (picked != null)
                {
                    Emit(picked, ctx, pity, random, result, depth);
                }
            }
        }

        private LootEntrySpec PickEntry(List<LootEntrySpec> entries, int sourceLevel, IRandom random)
        {
            // Collected into a local list per call: nested tables call this recursively while an outer pick is done already.
            long total = 0;
            int first = _candidates.Count;
            for (int i = 0; i < entries.Count; i++)
            {
                LootEntrySpec entry = entries[i];
                if (!entry.IsGuaranteed && entry.Weight > 0 && entry.IsAvailable(sourceLevel))
                {
                    _candidates.Add(entry);
                    total += entry.Weight;
                }
            }

            LootEntrySpec picked = null;
            if (total > 0)
            {
                double roll = random.NextDouble() * total;
                for (int i = first; i < _candidates.Count; i++)
                {
                    roll -= _candidates[i].Weight;
                    if (roll < 0)
                    {
                        picked = _candidates[i];
                        break;
                    }
                }

                if (picked == null)
                {
                    picked = _candidates[_candidates.Count - 1];
                }
            }

            _candidates.RemoveRange(first, _candidates.Count - first);
            return picked;
        }

        private void Emit(LootEntrySpec entry, in LootContext ctx, PityState pity, IRandom random, LootResult result, int depth)
        {
            switch (entry.Kind)
            {
                case LootEntryKind.Item:
                    EmitItem(entry, ctx, random, result);
                    break;
                case LootEntryKind.Table:
                    EmitTable(entry, ctx, pity, random, result, depth);
                    break;
                case LootEntryKind.Equipment:
                    ItemInstance equipment = CreateEquipment(entry, ctx, pity, random, null);
                    if (equipment != null)
                    {
                        result.Add(LootDrop.ForItem(equipment));
                    }

                    break;
                case LootEntryKind.Gold:
                    EmitCurrency(CurrencyIds.Gold, GoldAmount(entry, ctx.SourceLevel, random), result);
                    break;
                case LootEntryKind.Currency:
                    EmitCurrency(entry.RefId, RollCount(entry, random), result);
                    break;
            }
        }

        private void EmitItem(LootEntrySpec entry, in LootContext ctx, IRandom random, LootResult result)
        {
            if (!_catalog.TryGetItem(entry.RefId, out ItemSpec spec))
            {
                Log.Warning(LogCategory.Data, "Loot: unknown item '" + entry.RefId + "' (source '" + ctx.SourceId + "').");
                return;
            }

            int count = RollCount(entry, random);
            if (count <= 0)
            {
                return;
            }

            int itemLevel = ItemFormulas.ItemLevel(ctx.SourceLevel, ctx.ItemLevelDelta);
            if (spec.IsStackable)
            {
                result.Add(LootDrop.ForItem(_generator.CreateFixed(spec, itemLevel, spec.BaseRarity, count, random)));
                return;
            }

            // Single items never form a stack: "2 x sword" are two drops with their own instance ids.
            for (int i = 0; i < count; i++)
            {
                result.Add(LootDrop.ForItem(_generator.CreateFixed(spec, itemLevel, spec.BaseRarity, 1, random)));
            }
        }

        private void EmitTable(LootEntrySpec entry, in LootContext ctx, PityState pity, IRandom random, LootResult result, int depth)
        {
            if (depth + 1 > MaxDepth)
            {
                Log.Warning(LogCategory.Data, "Loot: table '" + entry.RefId + "' nests deeper than " + MaxDepth + " levels and is skipped.");
                return;
            }

            if (!_catalog.TryGetLootTable(entry.RefId, out LootTableSpec nested))
            {
                Log.Warning(LogCategory.Data, "Loot: unknown nested table '" + entry.RefId + "' (source '" + ctx.SourceId + "').");
                return;
            }

            int times = RollCount(entry, random);
            for (int i = 0; i < times; i++)
            {
                RollTable(nested, ctx, pity, random, result, depth + 1);
            }
        }

        private ItemInstance CreateEquipment(LootEntrySpec entry, in LootContext ctx, PityState pity, IRandom random, ItemRarity? forcedRarity)
        {
            ItemSpec spec = PickBaseItem(entry, random);
            if (spec == null)
            {
                Log.Warning(LogCategory.Data, "Loot: the random equipment pool is empty (no item with 'Zufalls-Pool').");
                return null;
            }

            int itemLevel = ItemFormulas.ItemLevel(ctx.SourceLevel, ctx.ItemLevelDelta);
            ItemRarity rarity;
            if (forcedRarity.HasValue)
            {
                rarity = forcedRarity.Value;
            }
            else
            {
                float luck = (entry.Flags & LootEntryFlags.IgnoresLuck) != 0 ? 0f : ctx.Luck;
                float bonus = LuckFormula.Bonus(luck, ctx.LootQuality, ctx.DifficultyBonus, ctx.WorldTier, ctx.EventBonus);
                bool countsForPity = (entry.Flags & LootEntryFlags.NoPity) == 0;
                rarity = RarityRoller.Roll(itemLevel, ctx.LootQuality, bonus, ctx.WorldTier, pity, random, countsForPity);
            }

            return _generator.Generate(spec, itemLevel, rarity, random, ctx.WorldTier);
        }

        private ItemSpec PickBaseItem(LootEntrySpec entry, IRandom random)
        {
            IReadOnlyList<ItemSpec> weapons = _catalog.RandomDropPool(EquipmentGroup.Weapon);
            IReadOnlyList<ItemSpec> armor = _catalog.RandomDropPool(EquipmentGroup.Armor);
            IReadOnlyList<ItemSpec> jewelry = _catalog.RandomDropPool(EquipmentGroup.Jewelry);
            int weaponShare = weapons.Count > 0 ? Math.Max(0, entry.WeaponShare) : 0;
            int armorShare = armor.Count > 0 ? Math.Max(0, entry.ArmorShare) : 0;
            int jewelryShare = jewelry.Count > 0 ? Math.Max(0, entry.JewelryShare) : 0;
            int total = weaponShare + armorShare + jewelryShare;
            if (total <= 0)
            {
                return null;
            }

            int roll = random.Range(0, total);
            IReadOnlyList<ItemSpec> pool = roll < weaponShare ? weapons : roll < weaponShare + armorShare ? armor : jewelry;
            long weightSum = 0;
            for (int i = 0; i < pool.Count; i++)
            {
                weightSum += Math.Max(0, pool[i].DropWeight);
            }

            if (weightSum <= 0)
            {
                return pool[random.Range(0, pool.Count)];
            }

            double pick = random.NextDouble() * weightSum;
            for (int i = 0; i < pool.Count; i++)
            {
                pick -= Math.Max(0, pool[i].DropWeight);
                if (pick < 0)
                {
                    return pool[i];
                }
            }

            return pool[pool.Count - 1];
        }

        private static int RollCount(LootEntrySpec entry, IRandom random)
        {
            return entry.MaxCount > entry.MinCount ? random.Range(entry.MinCount, entry.MaxCount + 1) : entry.MinCount;
        }

        private static int GoldAmount(LootEntrySpec entry, int sourceLevel, IRandom random)
        {
            if (entry.GoldFactorMax > 0f)
            {
                float factor = entry.GoldFactorMax > entry.GoldFactorMin ? random.Range(entry.GoldFactorMin, entry.GoldFactorMax) : entry.GoldFactorMin;
                return Math.Max(1, (int)Math.Round(factor * ItemFormulas.GoldReference(sourceLevel), MidpointRounding.AwayFromZero));
            }

            return RollCount(entry, random);
        }

        private static void EmitCurrency(string currencyId, int amount, LootResult result)
        {
            if (amount > 0 && !string.IsNullOrEmpty(currencyId))
            {
                result.Add(LootDrop.ForCurrency(currencyId, amount));
            }
        }
    }
}
