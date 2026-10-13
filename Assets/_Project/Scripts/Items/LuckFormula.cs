using System;

namespace Aetherfall.Items
{
    /// <summary>
    /// The luck formula of GDD 04 5.3:
    /// <c>B = Glueck + 15 × LQ + B_Schwierigkeit + 10 × Weltstufe + B_Ereignis</c>,
    /// <c>B_eff = B</c> up to 100, above <c>100 + (B − 100) ÷ 2</c>, at most 175,
    /// <c>w'(r) = w(r) × (1 + k(r) × B_eff ÷ 100)</c>, legendary additionally × M_Weltstufe × M_Pity × (2 at LQ 6).
    /// </summary>
    public static class LuckFormula
    {
        /// <summary>Highest effective bonus (GDD 04 5.3).</summary>
        public const float MaxEffectiveBonus = 175f;

        /// <summary>Rarity bonus B before the cap.</summary>
        /// <param name="luck">Luck of the player.</param>
        /// <param name="lootQuality">Loot quality 0–6.</param>
        /// <param name="difficultyBonus">B_Schwierigkeit (hard +5, nightmare +10).</param>
        /// <param name="worldTier">World tier 0–10.</param>
        /// <param name="eventBonus">B_Ereignis.</param>
        public static float Bonus(float luck, int lootQuality, float difficultyBonus, int worldTier, float eventBonus)
        {
            return luck + LootQualityRules.RarityBonus(lootQuality) + difficultyBonus + 10f * Math.Max(0, worldTier) + eventBonus;
        }

        /// <summary>Effective bonus: B up to 100, then half, at most 175 (never below 0).</summary>
        /// <param name="bonus">B.</param>
        public static float Effective(float bonus)
        {
            if (!(bonus > 0f))
            {
                return 0f;
            }

            return bonus <= 100f ? bonus : Math.Min(MaxEffectiveBonus, 100f + (bonus - 100f) * 0.5f);
        }

        /// <summary>Factor on the base weight of a rarity: 1 + k(r) × B_eff ÷ 100.</summary>
        /// <param name="rarity">Rarity.</param>
        /// <param name="effectiveBonus">B_eff.</param>
        public static float WeightFactor(ItemRarity rarity, float effectiveBonus)
        {
            return 1f + RarityRules.LuckFactor(rarity) * effectiveBonus / 100f;
        }

        /// <summary>M_Weltstufe = 1 + 0.3 × world tier (GDD 04 5.3, 9.1).</summary>
        /// <param name="worldTier">World tier.</param>
        public static float WorldTierLegendaryFactor(int worldTier)
        {
            return 1f + 0.3f * Math.Max(0, worldTier);
        }
    }
}
