using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// Loot quality (LQ 0–6, GDD 04 5.2): rarity bonus 15 × LQ, minimum rarity (LQ 3–4 rare, LQ 5–6 epic), legendary
    /// weight ×2 at LQ 6, night +1 for enemy loot, LQ of enemy variants (normal 1, elite 2, champion 3).
    /// </summary>
    public static class LootQualityRules
    {
        /// <summary>Highest loot quality.</summary>
        public const int Max = 6;

        /// <summary>Clamps to 0–6.</summary>
        /// <param name="lootQuality">Loot quality.</param>
        public static int Clamp(int lootQuality)
        {
            return Math.Max(0, Math.Min(Max, lootQuality));
        }

        /// <summary>Rarity bonus of the luck formula: 15 × LQ (+0 … +90).</summary>
        /// <param name="lootQuality">Loot quality.</param>
        public static float RarityBonus(int lootQuality)
        {
            return 15f * Clamp(lootQuality);
        }

        /// <summary>Minimum rarity: LQ 3–4 rare, LQ 5–6 epic, below common. A lower roll is raised to it (GDD 04 5.2).</summary>
        /// <param name="lootQuality">Loot quality.</param>
        public static ItemRarity MinimumRarity(int lootQuality)
        {
            int lq = Clamp(lootQuality);
            if (lq >= 5)
            {
                return ItemRarity.Epic;
            }

            return lq >= 3 ? ItemRarity.Rare : ItemRarity.Common;
        }

        /// <summary>Factor on the legendary weight: 2 at LQ 6, otherwise 1.</summary>
        /// <param name="lootQuality">Loot quality.</param>
        public static float LegendaryFactor(int lootQuality)
        {
            return Clamp(lootQuality) >= Max ? 2f : 1f;
        }

        /// <summary>Enemy loot at night: +1 LQ, at most 6 (GDD 01 6.1, GDD 04 K9).</summary>
        /// <param name="lootQuality">Loot quality by day.</param>
        public static int AtNight(int lootQuality)
        {
            return Clamp(lootQuality + 1);
        }

        /// <summary>LQ of an enemy by variant id: <c>elite</c> 2, <c>champion</c> 3, everything else (normal, Aether-corrupted) 1.</summary>
        /// <param name="variantId">Variant id of the enemy.</param>
        public static int ForEnemyVariant(string variantId)
        {
            switch (variantId)
            {
                case "elite": return 2;
                case "champion": return 3;
                default: return 1;
            }
        }

        /// <summary>Extra rolls of an enemy by variant id: elite +1 (GDD 01 11.2).</summary>
        /// <param name="variantId">Variant id.</param>
        public static int ExtraRollsForEnemyVariant(string variantId)
        {
            return variantId == "elite" ? 1 : 0;
        }
    }
}
