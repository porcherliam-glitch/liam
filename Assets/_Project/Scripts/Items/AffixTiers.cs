using System;
using Aetherfall.Utilities;

namespace Aetherfall.Items
{
    /// <summary>
    /// Affix tiers and value rolls of GDD 04 4.3: tier by item level (I: 1–9, II: 10–24, III: 25–39, IV: 40–59, V: 60–74,
    /// VI: 75–80 and world tier ≥ 5 or mythic), tier choice (highest allowed 50 %, one below 35 %, two below 15 %; mythic
    /// always the highest), uniform value within the tier range, lower bound +3 % of the span per world tier, mythic only
    /// the upper half.
    /// </summary>
    public static class AffixTiers
    {
        /// <summary>World tier from which tier VI is possible (GDD 04 4.3).</summary>
        public const int TierSixWorldTier = 5;

        /// <summary>Raise of the lower bound per world tier as share of the span (3 %).</summary>
        public const float WorldTierFloorStep = 0.03f;

        /// <summary>Highest tier an item of this level may roll.</summary>
        /// <param name="itemLevel">Item level.</param>
        /// <param name="worldTier">World tier 0–10.</param>
        /// <param name="mythic">True for mythic items.</param>
        public static int MaxTier(int itemLevel, int worldTier, bool mythic)
        {
            if (itemLevel >= 75)
            {
                return worldTier >= TierSixWorldTier || mythic ? 6 : 5;
            }

            if (itemLevel >= 60)
            {
                return 5;
            }

            if (itemLevel >= 40)
            {
                return 4;
            }

            if (itemLevel >= 25)
            {
                return 3;
            }

            return itemLevel >= 10 ? 2 : 1;
        }

        /// <summary>
        /// Chooses the tier: the highest allowed 50 %, one below 35 %, two below 15 % (shares of tiers below I go to the
        /// remaining ones in proportion); mythic always the highest.
        /// </summary>
        /// <param name="maxTier">Highest allowed tier.</param>
        /// <param name="random">Random source.</param>
        /// <param name="mythic">True for mythic items.</param>
        public static int ChooseTier(int maxTier, IRandom random, bool mythic)
        {
            maxTier = Math.Max(1, Math.Min(AffixSpec.MaxTier, maxTier));
            if (mythic || maxTier == 1)
            {
                return maxTier;
            }

            float w0 = 50f;
            float w1 = 35f;
            float w2 = maxTier >= 3 ? 15f : 0f;
            float roll = random.NextFloat() * (w0 + w1 + w2);
            if (roll < w0)
            {
                return maxTier;
            }

            return roll < w0 + w1 ? maxTier - 1 : maxTier - 2;
        }

        /// <summary>
        /// Rolls a value of an affix in a tier: uniformly distributed over the rounded steps of the range (whole numbers or
        /// tenths), lower bound raised by 3 % of the span per world tier, mythic only in the upper half.
        /// </summary>
        /// <param name="affix">Affix.</param>
        /// <param name="tier">Tier 1–6.</param>
        /// <param name="random">Random source.</param>
        /// <param name="worldTier">World tier 0–10.</param>
        /// <param name="mythic">True for mythic items.</param>
        public static float RollValue(AffixSpec affix, int tier, IRandom random, int worldTier, bool mythic)
        {
            affix.RangeForTier(tier, out float min, out float max);
            float span = max - min;
            float low = min + span * Math.Min(1f, WorldTierFloorStep * Math.Max(0, worldTier));
            if (mythic)
            {
                low = Math.Max(low, min + span * 0.5f);
            }

            double steps = Math.Pow(10, Math.Max(0, Math.Min(3, affix.Decimals)));
            int lowStep = (int)Math.Ceiling(low * steps - 1e-4);
            int highStep = (int)Math.Floor(max * steps + 1e-4);
            if (highStep <= lowStep)
            {
                return affix.Round(max);
            }

            return affix.Round((float)(random.Range(lowStep, highStep + 1) / steps));
        }
    }
}
