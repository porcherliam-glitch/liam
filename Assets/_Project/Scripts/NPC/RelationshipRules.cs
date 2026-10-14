using System;

namespace Aetherfall.NPC
{
    /// <summary>
    /// Rules of the NPC relationship (GDD 01, 7.5): value -100 .. +100, tiers Feind (≤ -50), Abneigung (-49 .. -10), Neutral
    /// (-9 .. +9), Freundlich (+10 .. +49), Vertraut (≥ +50). Pure logic.
    /// </summary>
    public static class RelationshipRules
    {
        /// <summary>Lowest value.</summary>
        public const int Min = -100;

        /// <summary>Highest value.</summary>
        public const int Max = 100;

        /// <summary>Limits a value to -100 .. +100.</summary>
        /// <param name="value">Value.</param>
        public static int Clamp(int value)
        {
            return Math.Max(Min, Math.Min(Max, value));
        }

        /// <summary>Tier of a value.</summary>
        /// <param name="value">Relationship value.</param>
        public static RelationshipTier TierOf(int value)
        {
            if (value <= -50)
            {
                return RelationshipTier.Enemy;
            }

            if (value <= -10)
            {
                return RelationshipTier.Dislike;
            }

            if (value < 10)
            {
                return RelationshipTier.Neutral;
            }

            return value < 50 ? RelationshipTier.Friendly : RelationshipTier.Trusted;
        }

        /// <summary>German name of a tier.</summary>
        /// <param name="tier">Tier.</param>
        public static string GermanName(RelationshipTier tier)
        {
            switch (tier)
            {
                case RelationshipTier.Enemy: return "Feind";
                case RelationshipTier.Dislike: return "Abneigung";
                case RelationshipTier.Friendly: return "Freundlich";
                case RelationshipTier.Trusted: return "Vertraut";
                default: return "Neutral";
            }
        }
    }
}
