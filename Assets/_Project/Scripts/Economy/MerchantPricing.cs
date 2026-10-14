using System;
using Aetherfall.Items;

namespace Aetherfall.Economy
{
    /// <summary>
    /// Price formula of GDD 04 8.4 (pure logic): buying costs value × charisma × region factor, never below 60 % of the value;
    /// selling gives value × category quota × charisma × region × demand, never above 50 % of the value, so buying and selling
    /// again is never a profit. Reputation and the special factors (night sale, "Feilschen") are 1 until factions and that skill
    /// node exist. Buy prices round up, sell prices round down.
    /// </summary>
    public static class MerchantPricing
    {
        /// <summary>Lowest buy price as a share of the value.</summary>
        public const float MinBuyShare = 0.60f;

        /// <summary>Highest sell price as a share of the value.</summary>
        public const float MaxSellShare = 0.50f;

        /// <summary>Demand drop per piece of the same item sold since the last restock.</summary>
        public const float DemandStep = 0.05f;

        /// <summary>Lowest demand factor.</summary>
        public const float MinDemand = 0.50f;

        /// <summary>Region factor of goods the region has plenty of (cheaper to buy, less when selling).</summary>
        public const float Surplus = 0.85f;

        /// <summary>Buy factor of goods the region lacks.</summary>
        public const float ScarceBuy = 1.15f;

        /// <summary>Sell factor of goods the region lacks.</summary>
        public const float ScarceSell = 1.25f;

        /// <summary>Share of the value a merchant pays for an item category (GDD 04 8.4, "Quote").</summary>
        /// <param name="category">Item category.</param>
        public static float SellQuota(ItemCategory category)
        {
            switch (category)
            {
                case ItemCategory.Material:
                case ItemCategory.Book:
                    return 0.25f;
                case ItemCategory.Consumable:
                    return 0.15f;
                case ItemCategory.Misc:
                    return 0.40f;
                default:
                    return 0.20f;
            }
        }

        /// <summary>Charisma factor when buying: 1 − 1 % per effective point, at most 25 % cheaper and 9 % dearer.</summary>
        /// <param name="effectiveCharisma">Effective charisma points (attribute − 10, GDD 03 10.2).</param>
        public static float CharismaBuyFactor(float effectiveCharisma)
        {
            return Clamp(1f - 0.01f * effectiveCharisma, 0.75f, 1.09f);
        }

        /// <summary>Charisma factor when selling: 1 + 1 % per effective point, at most +25 %.</summary>
        /// <param name="effectiveCharisma">Effective charisma points.</param>
        public static float CharismaSellFactor(float effectiveCharisma)
        {
            return Clamp(1f + 0.01f * effectiveCharisma, 0.75f, 1.25f);
        }

        /// <summary>Demand factor: −5 % per piece of the same item sold since the last restock, at least 50 %.</summary>
        /// <param name="soldSinceRestock">Pieces sold since the restock.</param>
        public static float Demand(int soldSinceRestock)
        {
            return Math.Max(MinDemand, 1f - DemandStep * Math.Max(0, soldSinceRestock));
        }

        /// <summary>Price the player pays for one piece.</summary>
        /// <param name="value">Trade value of the item.</param>
        /// <param name="effectiveCharisma">Effective charisma points of the player.</param>
        /// <param name="regionFactor">1, <see cref="Surplus"/> or <see cref="ScarceBuy"/>.</param>
        public static int BuyPrice(float value, float effectiveCharisma, float regionFactor)
        {
            if (!(value > 0f))
            {
                return 0;
            }

            float price = Math.Max(value * CharismaBuyFactor(effectiveCharisma) * regionFactor, MinBuyShare * value);
            return Math.Max(1, (int)Math.Ceiling(price - 1e-4f));
        }

        /// <summary>Price the merchant pays for one piece.</summary>
        /// <param name="value">Trade value of the item.</param>
        /// <param name="category">Item category (quota).</param>
        /// <param name="effectiveCharisma">Effective charisma points of the player.</param>
        /// <param name="regionFactor">1, <see cref="Surplus"/> or <see cref="ScarceSell"/>.</param>
        /// <param name="soldSinceRestock">Pieces of this item sold to the merchant since the restock.</param>
        public static int SellPrice(float value, ItemCategory category, float effectiveCharisma, float regionFactor, int soldSinceRestock)
        {
            if (!(value > 0f))
            {
                return 0;
            }

            float price = value * SellQuota(category) * CharismaSellFactor(effectiveCharisma) * regionFactor * Demand(soldSinceRestock);
            price = Math.Min(price, MaxSellShare * value);
            return Math.Max(1, (int)Math.Floor(price + 1e-4f));
        }

        /// <summary>Gold a merchant holds at most: base × (1 + 0.1 × region level) (GDD 04 8.2).</summary>
        /// <param name="goldBase">Gold base of the merchant type.</param>
        /// <param name="regionLevel">Middle of the region's level band.</param>
        public static int GoldStock(int goldBase, int regionLevel)
        {
            return (int)Math.Round(Math.Max(0, goldBase) * (1.0 + 0.1 * Math.Max(0, regionLevel)), MidpointRounding.AwayFromZero);
        }

        private static float Clamp(float value, float min, float max)
        {
            return value < min ? min : value > max ? max : value;
        }
    }
}
