using System;

namespace Aetherfall.Dialogue
{
    /// <summary>
    /// Price of a bribe (GDD 02, 12.3): <c>price = base price × greed of the NPC × (1 − min(0.3; (Charisma − 10) × 0.02))</c>,
    /// rounded, at least 1. Charisma above 10 lowers the price by up to 30 %, below 10 raises it. Pure logic.
    /// </summary>
    public static class BribePricing
    {
        /// <summary>Charisma without discount.</summary>
        public const int NeutralCharisma = 10;

        /// <summary>Discount per Charisma point above 10.</summary>
        public const float DiscountPerPoint = 0.02f;

        /// <summary>Largest discount.</summary>
        public const float MaxDiscount = 0.3f;

        /// <summary>Computes the price.</summary>
        /// <param name="basePrice">Base price in gold.</param>
        /// <param name="greed">Greed of the NPC (1 = normal).</param>
        /// <param name="charisma">Charisma of the player.</param>
        public static int Price(int basePrice, float greed, int charisma)
        {
            if (basePrice <= 0)
            {
                return 0;
            }

            float discount = Math.Min(MaxDiscount, (charisma - NeutralCharisma) * DiscountPerPoint);
            double price = basePrice * Math.Max(0.01, greed) * (1.0 - discount);
            return Math.Max(1, (int)Math.Round(price, MidpointRounding.AwayFromZero));
        }
    }
}
