using System;
using Aetherfall.Utilities;

namespace Aetherfall.Crafting
{
    /// <summary>
    /// Yield of a harvest (GDD 04 6.10): <c>min–max + ⌊profession level ÷ 25⌋</c> pieces (herbs: 1–3). Pure logic.
    /// </summary>
    public static class GatheringRules
    {
        /// <summary>Profession levels per extra piece.</summary>
        public const int LevelsPerBonus = 25;

        /// <summary>Rolls the yield of one harvest.</summary>
        /// <param name="min">Smallest yield (at least 1).</param>
        /// <param name="max">Largest yield (at least <paramref name="min"/>).</param>
        /// <param name="professionLevel">Level of the gathering profession (0 until professions exist).</param>
        /// <param name="random">Random source.</param>
        public static int RollYield(int min, int max, int professionLevel, IRandom random)
        {
            if (random == null)
            {
                throw new ArgumentNullException(nameof(random));
            }

            int low = Math.Max(1, min);
            int high = Math.Max(low, max);
            return random.Range(low, high + 1) + Math.Max(0, professionLevel) / LevelsPerBonus;
        }
    }
}
