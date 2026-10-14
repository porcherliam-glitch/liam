using System;

namespace Aetherfall.Progression
{
    /// <summary>
    /// Experience for a kill (GDD 03 12.7): <c>XP_Kill = (4 + 1.5 × L_enemy) × variant × night × level difference</c>, rounded
    /// to whole XP, at least 1. Example: grey wolf level 8 = 16 XP for a player of level 8.
    /// </summary>
    /// <remarks>
    /// <para>Variant factors: normal 1 · elite 3 · champion 8 · mini boss 15 · dungeon boss 30 · world boss 60. "Aether-corrupted"
    /// is a modifier of the other variants (GDD 01 11.2) and has factor 1. Unknown variant ids count as normal.</para>
    /// <para>Level difference (player level P, enemy level E): enemies 6 or more levels below the player give 20 % less per
    /// level from the sixth level on (P − E = 6: 80 %, 7: 60 %, 8: 40 %, 9: 20 %), at least 10 %; enemies above the player give
    /// 5 % more per level, at most +25 %. The GDD wording "≥ 6 Level unter dem Spieler −20 % je weiteres Level" is read as
    /// "from the sixth level below on" (Vorschlag).</para>
    /// <para>Night (×1.25) needs the game clock, which follows with the time-of-day step; callers pass false until then.</para>
    /// <para>Kills of the player, its companions and summons count (GDD 03 12.7): killer ids <c>player</c>,
    /// <c>companion.…</c> and <c>summon.…</c>.</para>
    /// </remarks>
    public sealed class KillXpRules
    {
        /// <summary>Base of the formula (GDD 03 12.7: 4).</summary>
        public const float DefaultBase = 4f;

        /// <summary>XP per enemy level (GDD 03 12.7: 1.5).</summary>
        public const float DefaultPerLevel = 1.5f;

        /// <summary>Night factor (GDD 03 12.7, GDD 01: ×1.25).</summary>
        public const float NightFactor = 1.25f;

        /// <summary>Killer id of the player.</summary>
        public const string PlayerKillerId = "player";

        /// <summary>Creates the rules.</summary>
        /// <param name="baseXp">Base of the formula.</param>
        /// <param name="perLevel">XP per enemy level.</param>
        public KillXpRules(float baseXp = DefaultBase, float perLevel = DefaultPerLevel)
        {
            Base = Math.Max(0f, baseXp);
            PerLevel = Math.Max(0f, perLevel);
        }

        /// <summary>Base of the formula.</summary>
        public float Base { get; }

        /// <summary>XP per enemy level.</summary>
        public float PerLevel { get; }

        /// <summary>Factor of an enemy variant (normal 1, elite 3, champion 8, mini boss 15, dungeon boss 30, world boss 60).</summary>
        /// <param name="variantId">Variant id of the event <c>EnemyKilled</c>.</param>
        public static float VariantFactor(string variantId)
        {
            switch (variantId ?? string.Empty)
            {
                case "elite": return 3f;
                case "champion": return 8f;
                case "miniboss":
                case "mini_boss": return 15f;
                case "dungeon_boss": return 30f;
                case "world_boss": return 60f;
                default: return 1f;
            }
        }

        /// <summary>Factor of the level difference between player and enemy.</summary>
        /// <param name="playerLevel">Player level.</param>
        /// <param name="enemyLevel">Enemy level.</param>
        public static float LevelDifferenceFactor(int playerLevel, int enemyLevel)
        {
            int below = playerLevel - enemyLevel;
            if (below >= 6)
            {
                return Math.Max(0.1f, 1f - 0.2f * (below - 5));
            }

            if (below < 0)
            {
                return 1f + Math.Min(0.25f, 0.05f * -below);
            }

            return 1f;
        }

        /// <summary>True if experience of a kill by this killer goes to the player.</summary>
        /// <param name="killerId">Killer id of the event <c>EnemyKilled</c>.</param>
        public static bool CountsForPlayer(string killerId)
        {
            if (string.IsNullOrEmpty(killerId))
            {
                return false;
            }

            return killerId == PlayerKillerId || killerId.StartsWith("companion.", StringComparison.Ordinal) ||
                   killerId.StartsWith("summon.", StringComparison.Ordinal);
        }

        /// <summary>Experience of one kill.</summary>
        /// <param name="enemyLevel">Enemy level (values below 1 count as 1).</param>
        /// <param name="variantId">Variant id.</param>
        /// <param name="playerLevel">Player level.</param>
        /// <param name="night">True at night (×1.25).</param>
        /// <returns>Whole XP, at least 1.</returns>
        public int Compute(int enemyLevel, string variantId, int playerLevel, bool night)
        {
            int level = Math.Max(1, enemyLevel);
            double xp = (Base + PerLevel * level) * VariantFactor(variantId) * LevelDifferenceFactor(playerLevel, level);
            if (night)
            {
                xp *= NightFactor;
            }

            return Math.Max(1, (int)Math.Round(xp, MidpointRounding.AwayFromZero));
        }
    }
}
