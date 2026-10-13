using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// The item formulas of GDD 04 as pure functions: item level (4.1), base value with level scaling, rarity factor and
    /// spread (4.2, GDD 03 8.2), trade value (8.6), implicit values of jewelry and armor classes (4.2), the gold reference
    /// G(L) (8.7, GDD 02 8.4) and the level requirement (2.4).
    /// </summary>
    public static class ItemFormulas
    {
        /// <summary>Highest item level (GDD 04 4.1).</summary>
        public const int MaxItemLevel = 80;

        /// <summary>Lowest spread of base values (GDD 04 4.2: 0.95–1.05).</summary>
        public const float MinSpread = 0.95f;

        /// <summary>Highest spread of base values.</summary>
        public const float MaxSpread = 1.05f;

        /// <summary>Base value growth per item level (12 %).</summary>
        public const float LevelGrowth = 0.12f;

        /// <summary>Trade value growth per item level (15 %, GDD 04 8.6).</summary>
        public const float ValueGrowth = 0.15f;

        /// <summary>Equipping needs player level ≥ item level − this (GDD 04 2.4).</summary>
        public const int LevelRequirementMargin = 3;

        /// <summary>Item level = clamp(L_source + Δ_source; 1; 80) (GDD 04 4.1).</summary>
        /// <param name="sourceLevel">Enemy, area or quest level.</param>
        /// <param name="delta">Δ of the source (boss +1, chest tier bonus …).</param>
        public static int ItemLevel(int sourceLevel, int delta)
        {
            return Math.Max(1, Math.Min(MaxItemLevel, sourceLevel + delta));
        }

        /// <summary>Level scaling 1 + 0.12 × (iLvl − 1) (iLvl 10: 2.08, iLvl 80: 10.48).</summary>
        /// <param name="itemLevel">Item level (clamped to 1–80).</param>
        public static float LevelScaling(int itemLevel)
        {
            int level = Math.Max(1, Math.Min(MaxItemLevel, itemLevel));
            return 1f + LevelGrowth * (level - 1);
        }

        /// <summary>
        /// Base value = Basis_Typ × (1 + 0.12 × (iLvl − 1)) × rarity factor × spread (GDD 04 4.2). Example: one-handed sword
        /// (20), iLvl 10, rare, spread 1.00 → 49.92 (displayed 50).
        /// </summary>
        /// <param name="baseType">Basis_Typ at item level 1.</param>
        /// <param name="itemLevel">Item level.</param>
        /// <param name="rarity">Rarity.</param>
        /// <param name="spread">Spread 0.95–1.05 (1 = none).</param>
        public static float BaseValue(float baseType, int itemLevel, ItemRarity rarity, float spread)
        {
            return baseType * LevelScaling(itemLevel) * RarityRules.BaseValueFactor(rarity) * spread;
        }

        /// <summary>Trade value of equipment = V_Kat × (1 + 0.15 × (iLvl − 1)) × trade factor of the rarity (GDD 04 8.6).</summary>
        /// <param name="valueCategory">V_Kat.</param>
        /// <param name="itemLevel">Item level.</param>
        /// <param name="rarity">Rarity.</param>
        public static float TradeValue(float valueCategory, int itemLevel, ItemRarity rarity)
        {
            int level = Math.Max(1, Math.Min(MaxItemLevel, itemLevel));
            return valueCategory * (1f + ValueGrowth * (level - 1)) * RarityRules.TradeValueFactor(rarity);
        }

        /// <summary>Implicit value linear from item level 1 to 80 (GDD 04 4.2, e.g. iron ring +2 → +30 armor).</summary>
        /// <param name="valueAtLevel1">Value at item level 1.</param>
        /// <param name="valueAtLevel80">Value at item level 80.</param>
        /// <param name="itemLevel">Item level.</param>
        public static float ImplicitValue(float valueAtLevel1, float valueAtLevel80, int itemLevel)
        {
            int level = Math.Max(1, Math.Min(MaxItemLevel, itemLevel));
            return valueAtLevel1 + (valueAtLevel80 - valueAtLevel1) * (level - 1) / (MaxItemLevel - 1f);
        }

        /// <summary>Gold reference G(L) = 15 + 6 × L (GDD 04 K15, GDD 02 8.4); loot gold is a multiple of it.</summary>
        /// <param name="level">Source level.</param>
        public static float GoldReference(int level)
        {
            return 15f + 6f * Math.Max(1, level);
        }

        /// <summary>Lowest player level that may equip an item: max(1, iLvl − 3) (GDD 04 2.4).</summary>
        /// <param name="itemLevel">Item level.</param>
        public static int RequiredPlayerLevel(int itemLevel)
        {
            return Math.Max(1, itemLevel - LevelRequirementMargin);
        }
    }
}
