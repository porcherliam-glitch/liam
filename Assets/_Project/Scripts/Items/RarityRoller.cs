using System;
using Aetherfall.Utilities;

namespace Aetherfall.Items
{
    /// <summary>
    /// Rolls the rarity of a random piece of equipment (GDD 04 5.4 step 7.3): base weights of 3.1 shifted by the luck formula
    /// (5.3), legendary weight × world tier factor × bad luck multiplier × (2 at LQ 6), rarities below their minimum item
    /// level weigh 0 (3.1), the minimum rarity of the loot quality raises a lower roll (5.2), a legendary may be upgraded to
    /// mythic from world tier 1 and item level 60 (4.8, 9.1), and the counters of <see cref="PityState"/> follow (5.5).
    /// </summary>
    public static class RarityRoller
    {
        /// <summary>Number of rolled rarities (common to legendary; mythic is an upgrade, set comes from set tables).</summary>
        public const int RolledRarityCount = 5;

        /// <summary>
        /// Weight of one rarity after all factors (0 if not allowed at this item level). Exposed for the distribution tests.
        /// </summary>
        /// <param name="rarity">Rarity (common to legendary).</param>
        /// <param name="itemLevel">Item level.</param>
        /// <param name="lootQuality">Loot quality 0–6.</param>
        /// <param name="effectiveBonus">B_eff of the luck formula.</param>
        /// <param name="worldTier">World tier.</param>
        /// <param name="pityMultiplier">M_Pity (1 = none).</param>
        public static float Weight(ItemRarity rarity, int itemLevel, int lootQuality, float effectiveBonus, int worldTier, float pityMultiplier)
        {
            if (itemLevel < RarityRules.MinItemLevel(rarity))
            {
                return 0f;
            }

            float weight = RarityRules.BaseDropWeight(rarity) * LuckFormula.WeightFactor(rarity, effectiveBonus);
            if (rarity == ItemRarity.Legendary)
            {
                weight *= LuckFormula.WorldTierLegendaryFactor(worldTier) * Math.Max(1f, pityMultiplier) * LootQualityRules.LegendaryFactor(lootQuality);
            }

            return weight;
        }

        /// <summary>
        /// Mythic share of a legendary drop per world tier (GDD 04 9.1): 0, 1, 2, 3, 5, 7, 9, 12, 15, 18, 22 %.
        /// </summary>
        /// <param name="worldTier">World tier 0–10.</param>
        public static float MythicShare(int worldTier)
        {
            switch (Math.Max(0, Math.Min(10, worldTier)))
            {
                case 1: return 0.01f;
                case 2: return 0.02f;
                case 3: return 0.03f;
                case 4: return 0.05f;
                case 5: return 0.07f;
                case 6: return 0.09f;
                case 7: return 0.12f;
                case 8: return 0.15f;
                case 9: return 0.18f;
                case 10: return 0.22f;
                default: return 0f;
            }
        }

        /// <summary>Rolls a rarity and updates the bad luck counters.</summary>
        /// <param name="itemLevel">Item level of the drop.</param>
        /// <param name="lootQuality">Loot quality 0–6 (minimum rarity, LQ 6 factor).</param>
        /// <param name="bonus">Rarity bonus B before the cap (<see cref="LuckFormula.Bonus"/>).</param>
        /// <param name="worldTier">World tier.</param>
        /// <param name="pity">Bad luck counters (null = none).</param>
        /// <param name="random">Random source.</param>
        /// <param name="countsForPity">False for fixed rewards that must not touch the counters.</param>
        public static ItemRarity Roll(int itemLevel, int lootQuality, float bonus, int worldTier, PityState pity, IRandom random,
            bool countsForPity = true)
        {
            if (random == null)
            {
                throw new ArgumentNullException(nameof(random));
            }

            bool usePity = pity != null && countsForPity;
            bool legendaryAllowed = itemLevel >= RarityRules.MinItemLevel(ItemRarity.Legendary);
            ItemRarity result;
            if (usePity && legendaryAllowed && pity.LegendaryGuaranteed)
            {
                result = ItemRarity.Legendary;
            }
            else
            {
                float effective = LuckFormula.Effective(bonus);
                float multiplier = usePity ? pity.LegendaryMultiplier : 1f;
                result = PickWeighted(itemLevel, lootQuality, effective, worldTier, multiplier, random);
            }

            ItemRarity minimum = LootQualityRules.MinimumRarity(lootQuality);
            if (RarityRules.Rank(result) < RarityRules.Rank(minimum))
            {
                result = minimum;
            }

            if (result == ItemRarity.Legendary && worldTier >= 1 && itemLevel >= RarityRules.MinItemLevel(ItemRarity.Mythic))
            {
                float share = MythicShare(worldTier) * (usePity ? pity.MythicMultiplier : 1f);
                bool mythic = (usePity && pity.MythicGuaranteed) || random.NextFloat() < share;
                if (usePity)
                {
                    pity.RecordLegendary(mythic);
                }

                if (mythic)
                {
                    result = ItemRarity.Mythic;
                }
            }

            if (usePity)
            {
                pity.RecordEquipmentDrop(result, itemLevel);
            }

            return result;
        }

        private static ItemRarity PickWeighted(int itemLevel, int lootQuality, float effective, int worldTier, float pityMultiplier, IRandom random)
        {
            float total = 0f;
            for (int r = 0; r < RolledRarityCount; r++)
            {
                total += Weight((ItemRarity)r, itemLevel, lootQuality, effective, worldTier, pityMultiplier);
            }

            if (!(total > 0f))
            {
                return ItemRarity.Common;
            }

            double roll = random.NextDouble() * total;
            for (int r = 0; r < RolledRarityCount; r++)
            {
                roll -= Weight((ItemRarity)r, itemLevel, lootQuality, effective, worldTier, pityMultiplier);
                if (roll < 0)
                {
                    return (ItemRarity)r;
                }
            }

            return ItemRarity.Common;
        }
    }
}
