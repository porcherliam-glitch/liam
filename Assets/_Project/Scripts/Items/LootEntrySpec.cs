using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Plain data of one loot table entry (GDD 04 5.1): kind, weight, referenced id, count range, gold factor range of G(L),
    /// level condition, flags and the group shares of random equipment.
    /// </summary>
    /// <remarks>
    /// Conditions are only the source level for now (<see cref="MinSourceLevel"/>/<see cref="MaxSourceLevel"/>); night,
    /// active quest, region and variant come with Conditions (architecture 7). Unfulfilled entries leave the roll.
    /// </remarks>
    public sealed class LootEntrySpec
    {
        /// <summary>Entry kind.</summary>
        public LootEntryKind Kind { get; set; }

        /// <summary>Weight relative to the sum of all available entries (≥ 0; guaranteed entries ignore it).</summary>
        public int Weight { get; set; } = 100;

        /// <summary>Item id (Item), table id (Table) or currency id (Currency).</summary>
        public string RefId { get; set; } = string.Empty;

        /// <summary>Smallest count (items, currency, gold without factor; nested table: number of sub-rolls).</summary>
        public int MinCount { get; set; } = 1;

        /// <summary>Largest count.</summary>
        public int MaxCount { get; set; } = 1;

        /// <summary>Gold only: lower factor on G(L) = 15 + 6 × L; 0 = use the counts as fixed gold.</summary>
        public float GoldFactorMin { get; set; }

        /// <summary>Gold only: upper factor on G(L).</summary>
        public float GoldFactorMax { get; set; }

        /// <summary>Condition: lowest source level (0 = none).</summary>
        public int MinSourceLevel { get; set; }

        /// <summary>Condition: highest source level (0 = none).</summary>
        public int MaxSourceLevel { get; set; }

        /// <summary>Flags (guaranteed, ignores luck, no pity).</summary>
        public LootEntryFlags Flags { get; set; }

        /// <summary>Equipment only: weight of weapons and shields (GDD 04 5.1 example 50).</summary>
        public int WeaponShare { get; set; } = 50;

        /// <summary>Equipment only: weight of armor pieces (40).</summary>
        public int ArmorShare { get; set; } = 40;

        /// <summary>Equipment only: weight of jewelry (10).</summary>
        public int JewelryShare { get; set; } = 10;

        /// <summary>True for guaranteed entries.</summary>
        public bool IsGuaranteed => (Flags & LootEntryFlags.Guaranteed) != 0;

        /// <summary>True if the level condition holds for <paramref name="sourceLevel"/>.</summary>
        /// <param name="sourceLevel">Level of the loot source.</param>
        public bool IsAvailable(int sourceLevel)
        {
            if (MinSourceLevel > 0 && sourceLevel < MinSourceLevel)
            {
                return false;
            }

            return MaxSourceLevel <= 0 || sourceLevel <= MaxSourceLevel;
        }

        /// <summary>Returns an error text if the entry is unusable, otherwise an empty string.</summary>
        public string Validate()
        {
            if (Weight < 0 || MinCount < 0 || MaxCount < MinCount)
            {
                return "Loot entry " + Kind + " '" + RefId + "': weight and counts must be 0 or more, max ≥ min.";
            }

            if ((Kind == LootEntryKind.Item || Kind == LootEntryKind.Table || Kind == LootEntryKind.Currency) && string.IsNullOrEmpty(RefId))
            {
                return "Loot entry " + Kind + " needs an id.";
            }

            if (Kind == LootEntryKind.Gold && (GoldFactorMin < 0f || GoldFactorMax < GoldFactorMin))
            {
                return "Gold entry: factor max must be ≥ min ≥ 0.";
            }

            if (Kind == LootEntryKind.Equipment && Math.Max(0, WeaponShare) + Math.Max(0, ArmorShare) + Math.Max(0, JewelryShare) <= 0)
            {
                return "Equipment entry: at least one group share must be above 0.";
            }

            return string.Empty;
        }
    }
}
