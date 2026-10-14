using System;
using Aetherfall.Stats;

namespace Aetherfall.Progression
{
    /// <summary>
    /// The fixed numbers of GDD 03 10.1 and 12.1 for levels and points, and the overlevel attenuation of quest experience
    /// (GDD 02 8.4). Pure constants and functions.
    /// </summary>
    public static class ProgressionRules
    {
        /// <summary>Attribute points per level-up (§11.3, GDD 03 12.1).</summary>
        public const int AttributePointsPerLevel = 1;

        /// <summary>Skill points per level-up (§11.3, GDD 03 12.1).</summary>
        public const int SkillPointsPerLevel = 1;

        /// <summary>Hard cap of an attribute (GDD 03 10.1: base value plus distributed points never above 60).</summary>
        public const int AttributeHardCap = 60;

        /// <summary>Levels above the recommended level without attenuation (GDD 02 8.4: "Spielerlevel − L − 3").</summary>
        public const int OverlevelGrace = 3;

        /// <summary>Attenuation per further level in percent (GDD 02 8.4: 0.1 = 10 %).</summary>
        public const int OverlevelStepPercent = 10;

        /// <summary>Lowest attenuation factor in percent (GDD 02 8.4: 0.25 = 25 %).</summary>
        public const int OverlevelMinPercent = 25;

        /// <summary>Stat source of the distributed attribute points (<c>progression:attributes</c>, architecture 11.5).</summary>
        public static readonly string AttributeSourceId = StatSourceIds.Progression("attributes");

        /// <summary>Source id of experience given by the debug tools.</summary>
        public const string DebugSourceId = "debug";

        /// <summary>
        /// Overlevel attenuation D of quest experience (GDD 02 8.4, GDD 03 12.6/12.7):
        /// <c>D = max(0.25; 1 − 0.1 × max(0; player level − recommended level − 3))</c>. Example: player level 9, recommended
        /// level 2: 1 − 0.1 × 4 = 0.6. A recommended level of 0 or less means "no recommended level" (factor 1).
        /// </summary>
        /// <param name="playerLevel">Level of the player.</param>
        /// <param name="recommendedLevel">Recommended level of the content (quest), 0 = none.</param>
        /// <returns>Factor 0.25 … 1.</returns>
        public static float OverlevelFactor(int playerLevel, int recommendedLevel)
        {
            return (float)OverlevelFactorExact(playerLevel, recommendedLevel);
        }

        /// <summary>
        /// Experience of a quest reward given as level share with the overlevel attenuation (GDD 02 8.4):
        /// <c>round(share × XP_next(recommended level)) × D</c>, rounded to whole XP. Example: 0.5 Lv at level 2 = 200 XP; a
        /// player of level 9 gets 200 × 0.6 = 120 XP. A recommended level of 0 or less uses the player level without attenuation.
        /// </summary>
        /// <param name="curve">Experience curve.</param>
        /// <param name="share">Level share, e.g. 0.5.</param>
        /// <param name="recommendedLevel">Recommended level (reference level of the share), 0 = the player level.</param>
        /// <param name="playerLevel">Level of the player.</param>
        /// <returns>Whole XP, 0 or more.</returns>
        public static int QuestLevelShareXp(XpCurve curve, float share, int recommendedLevel, int playerLevel)
        {
            if (curve == null)
            {
                throw new ArgumentNullException(nameof(curve));
            }

            if (recommendedLevel <= 0)
            {
                return curve.LevelShareToXp(share, Math.Max(1, playerLevel));
            }

            int full = curve.LevelShareToXp(share, recommendedLevel);
            double attenuated = full * OverlevelFactorExact(playerLevel, recommendedLevel);
            return Math.Max(0, (int)Math.Round(attenuated, MidpointRounding.AwayFromZero));
        }

        // Whole percent first, so 200 × 60 % is exactly 120 and never 119.99999 (0.1 has no exact float).
        private static double OverlevelFactorExact(int playerLevel, int recommendedLevel)
        {
            if (recommendedLevel <= 0)
            {
                return 1.0;
            }

            int over = Math.Min(100, Math.Max(0, playerLevel - recommendedLevel - OverlevelGrace));
            int percent = Math.Max(OverlevelMinPercent, 100 - OverlevelStepPercent * over);
            return percent / 100.0;
        }
    }
}
